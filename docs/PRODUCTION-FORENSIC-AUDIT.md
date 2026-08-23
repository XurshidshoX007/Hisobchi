# HISOBCHI — FULL PRODUCTION FORENSIC AUDIT

**Audit sanasi:** 2026-08-23 (Asia/Tashkent)  
**Audit branch:** `arena/01a02b68-hisobchi`  
**Boshlang‘ich commit:** `06bfdc6f333fd920f950dca01402e449a335f069`  
**Auditdan keyin branch:** `origin/main` bilan birlashtirildi va production-safety fixlari qo‘shildi  
**Runtime evidence holati:** Railway CLI/log/metrics va production DB ulanishi mavjud emas — tegishli xulosalar `UNKNOWN / NEEDS VERIFICATION`.

> Bu hujjat repository kodi, to‘liq Git tarixi, migrationlar, Docker/Railway
> konfiguratsiyasi, dependency lockfile, GitHub deployment metadata va testlar
> asosidagi auditdir. Production log fragmentida aniq UTC timestamplar
> berilmagani uchun Postgres ↔ application log correlation bajarilmadi.

---

## 0. EXECUTIVE ANSWERS

### Production’da hozir nima buzilgan?

1. **CONFIRMED (deployed code):** production’da ishlayotgan muvaffaqiyatli GitHub deployment `a84d75d...` (2026-08-23 00:16 UTC / 05:16 Tashkent) ushbu audit branchidagi safety fixlarni hali o‘z ichiga olmaydi.
2. **CONFIRMED (deployed baseline code):** DB update-id claimidan oldin xato bersa, Telegram webhook `200` qaytarib update’ni yo‘qotishi mumkin edi (`C-001`).
3. **CONFIRMED (deployed baseline code):** ambiguous response’dan keyin idempotency claim o‘chirilib, klient yangi key yaratgani sabab moliyaviy mutation ikki marta bajarilishi mumkin edi (`C-002`).
4. **CONFIRMED (deployed baseline code):** payment-schedule idempotency INSERT xatosi “duplicate” deb talqin qilinib, yaratilmagan reja “saqlandi” deb yopilishi mumkin edi (`C-004`).
5. **CONFIRMED (branch’da contained, production pending):** deployed code valyuta almashtirish va turli valyutadagi hisoblarni FX’siz qo‘shishi mumkin; branch buni bloklaydi va totalsni currency bo‘yicha ajratadi (`C-003`).
6. **CONFIRMED (runtime log fragmenti):** Postgres kamida bir marta clean shutdown qilinmagan va WAL recovery bajargan. Takrorlangan bo‘lsa DB availability xavf ostida (`H-014`).

### Eng ehtimoliy root-cause chain

```text
Railway/Postgres process yoki container clean bo‘lmagan tarzda to‘xtadi
                         ↓
Postgres WAL crash recovery / vaqtincha connection refusal-reset
                         ↓
pg Pool idle-client error yoki query failure
                         ↓
webhook_error(code=internal)
                         ↓
telegram_updates claim release ham DB sabab ishlamasligi mumkin
                         ↓
retry “already processed” deb 200 oladi → update yo‘qoladi
                         ↓
security_events INSERT ham ayni DB’ga boradi
                         ↓
security_event_write_failed → faqat process-log fallback
                         ↓
generic loglar sabab asl DB code/phase ko‘rinmaydi
```

### Eng xavfli ochiq muammo

`C-003`: accounting engine’da to‘liq FX model yo‘q; branch immediate containment
qiladi, lekin legacy data verification zarur. Bundan tashqari `H-001`, `H-002`,
`H-005` va `H-014` production safety uchun P0/P1 hisoblanadi.

---

## 1. AUDIT SCOPE VA METOD

Tekshirildi:

- `src/app`, API route’lar, frontend, bot, webhook, image pipeline;
- `src/lib`, finance/mutation/reconciliation/security/auth/audit/Redis;
- `src/db/schema.ts`, 10 SQL migration va migration journal/snapshot;
- Dockerfile, Railway config, startup/migration/configure scripts;
- `package.json`, lockfile, production/dev dependency tree;
- 408 test, jumladan 3 ta DB integration suite;
- Git tarixi bo‘yicha secret-pattern scan;
- GitHub deployment metadata va Actions mavjudligi;
- lint, typecheck, build, unit tests, circular dependency va duplication scan.

Bajarilgan tekshiruv natijalari:

| Tekshiruv | Natija |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 408 total; 405 PASS; 3 conditional DB suite SKIPPED |
| production-like `next build` | PASS (`DATABASE_URL` sintaktik build URL bilan) |
| `npm audit --omit=dev` | 0 vulnerability |
| to‘liq `npm audit` | 4 moderate, faqat dev-tool chain |
| circular dependency (`madge`) | topilmadi |
| duplication (`jscpd`) | 18 clone, 0.96% duplicated lines |
| Git tarixi secret scan | real credential pattern topilmadi; faqat dev/build dummy DB URL |
| Drizzle next-generation test | baseline’da duplicate DDL yaratdi; snapshot fixidan keyin “No schema changes” |
| Disposable PostgreSQL integration | PASS — migrations + 22/22 DB tests |
| Live Railway health/log/metrics | UNKNOWN — Railway session ulanmagan |

---

## 2. ARCHITECTURE

```text
Telegram user                         Mini App user
     │                                      │
     │ update + secret header               │ Telegram initData header
     ▼                                      ▼
/api/telegram/webhook                 /api/state, /api/mutate
     │                                      │
     ├─ secret/rate-limit                    ├─ origin/rate-limit
     ├─ update_id claim                      ├─ initData HMAC + auth_date
     ├─ callback ownership                   └─ authenticated user scope
     ▼
Bot routing / image pipeline          State builder / mutation engine
     │                                      │
     ├─ NLP / deterministic parsing          ├─ validation helpers
     ├─ draft confirmation                   ├─ ownership checks
     ├─ payment schedule                     └─ business transactions
     ▼                                      ▼
             Drizzle ORM + node-postgres Pool
                         │
                         ▼
              Railway PostgreSQL (source of truth)
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
 Railway Redis                  audit_logs/security_events
 rate limits + notification      (same PostgreSQL dependency)
 deduplication

External services:
- Telegram Bot API: sendMessage/getFile/getMe/getWebhookInfo
- OpenAI-compatible vision endpoint: optional image OCR/classification
- Railway Cron: /api/telegram/notifications
```

### Layer ownership

| Concern | Joylashuv | Audit bahosi |
|---|---|---|
| Authentication | `src/lib/user.ts`, API routes | Telegram HMAC to‘g‘ri; URL fallback fix qilindi |
| Authorization | `runMutation` query predicates, webhook callback predicates | Ko‘p yo‘llarda owner-scope bor; DB composite tenant constraints yo‘q |
| Validation | `src/lib/mutations.ts`, image validators, route length checks | Keng, lekin schema/type cross-checklar to‘liq emas |
| Business logic | `finance.ts`, `mutations.ts`, `reconciliation.ts` | Kuchli testlangan, lekin juda monolitik |
| Transactions | Har operation ichida lokal `db.transaction` | Debt/pay/goal yaxshi; global idempotency/audit/outbox bilan atomik emas |
| Retry | Vision provider’da bounded retry | DB deadlock/serialization va Telegram send uchun retry/outbox yo‘q |
| Logging | `securityLog`, `writeAudit`, `writeSecurityEvent` | Structured, lekin phase/latency/DB code yetarli emas |
| Audit logging | PostgreSQL `audit_logs` | Business operation’dan tashqarida; failure businessni yiqitmaydi |
| Security fallback | Process stderr | Branch’da raw DB message olib tashlandi; durable independent sink yo‘q |

### Architecture smells

- route/service/repository chegarasi yo‘q; service modullar to‘g‘ridan-to‘g‘ri DB’ga bog‘langan;
- `mutations.ts` va `finance.ts` mos ravishda ~1.7k/~2k qator;
- webhook transport, business transaction va outbound Telegram delivery bitta request ichida;
- idempotency va audit business transaction boundary’dan tashqarida;
- state endpoint bir requestda pool limitiga teng miqdorda parallel query ochadi;
- durable queue/outbox va recovery worker yo‘q.

---

## 3. CURRENT RAILWAY POSTGRES INCIDENT

Berilgan pattern:

```text
database system was interrupted
database system was not properly shut down
automatic recovery in progress
redo starts
invalid record length
redo done
checkpoint starting
database system is ready to accept connections
```

### Classification

#### CONFIRMED

- PostgreSQL oldingi ishga tushish clean shutdown markerisiz tugagan va WAL crash recovery bajargan.
- `redo done` va `ready to accept connections` recovery muvaffaqiyatli yakunlanganini ko‘rsatadi.
- Faqat `invalid record length ... wanted/expected 24, got 0` satri o‘zi disk corruption isboti emas; bu recovery oxiridagi WAL terminator bilan ham uchraydi.
- Repository’da `pg_ctl`, `pg_terminate_backend`, DB shutdown, `DROP`, `TRUNCATE`, `pg_resetwal` yoki Postgres serviceni restart qiluvchi kod yo‘q.
- App pool default’i 10 connection/replica, migration pool’i 1 connection.
- GitHub metadata 2026-08-22 davomida ko‘p app deployment bo‘lganini tasdiqlaydi, lekin app va Postgres alohida Railway service; app deployment DB restartini isbotlamaydi.

#### PROBABLE

- Pattern takrorlangan bo‘lsa, Postgres process/container/host qayta-qayta abrupt termination ko‘rgan. Trigger Railway infrastructure restart, DB OOM-kill yoki force termination bo‘lishi mumkin; qaysi biri ekanini mavjud evidence ajratmaydi.

#### POSSIBLE

- DB memory/resource limitga urilishi;
- Railway host/service restart yoki maintenance;
- volume/storage I/O failure;
- Postgres backend crash sabab postmaster restart;
- application workload resource pressure’ga bilvosita hissa qo‘shishi (`/api/state`, notification dispatcher), ammo connection count 10 bilan cheklangan.

#### UNKNOWN / NEEDS VERIFICATION

- `OOMKilled`, signal 9/11, exit code va Railway restart reason;
- DB memory/CPU/disk graphlari;
- Postgres service deployment/restart timeline;
- exact UTC timestamps va app `webhook_error` timestamp correlation;
- volume health, max connections, active connections;
- backup/PITR va oxirgi restore drill.

Railway HTTP healthcheck yangi deployment faollashishida ishlaydi, continuous monitor emas [1](https://docs.railway.com/reference/healthchecks). Shu sabab oldingi “health endpoint fail → Railway running container restart” xulosasi runtime event’siz tasdiqlanmaydi. node-postgres esa idle pool client erroriga listener bo‘lmasa process uncaught error bilan yiqilishi mumkinligini aniq ogohlantiradi [1](https://node-postgres.com/apis/pool); bu branch’da listener qo‘shildi.

### Correlation uchun xavfsiz read-only evidence pack

1. Har incident uchun bir xil UTC oynada Postgres va app loglarini eksport qilish (`T-5m … T+10m`).
2. Railway event’dan service, deployment ID, exit code/reason, replica va restart count olish.
3. Memory/CPU/disk graph screenshot/export olish.
4. DB tiklangach read-only querylar:

```sql
select now(), pg_postmaster_start_time(), version();
show max_connections;
select state, count(*) from pg_stat_activity group by state;
select datname, pg_database_size(datname) from pg_database order by 2 desc;
select * from pg_stat_database where datname = current_database();
select * from pg_stat_bgwriter;
```

5. Quyidagi loglarni ayni request ID va vaqt bo‘yicha bog‘lash:

```text
database_pool_idle_error
webhook_error
webhook_claim_release_failed
security_event_write_failed
audit_write_failed
mutation_error
```

---

## 4. FAILURE PATH MATRIX

| Failure | Baseline behaviour | Branch fix / remaining risk |
|---|---|---|
| DB unavailable before webhook claim | 200; Telegram retry qilmaydi | **FIXED:** non-syntax error 500 |
| DB fails after claim | claim delete qilinadi; delete ham fail bo‘lsa stuck | Explicit secondary log qo‘shildi; status/lease state machine hali yo‘q |
| DB idle connection reset | Pool error listener yo‘q; process crash mumkin | **FIXED:** safe listener |
| Transaction failure | `db.transaction` rollback | DB deadlock/40001 retry yo‘q |
| Commit acknowledgement lost | idempotency claim o‘chishi mumkin edi | **PARTIAL FIX:** claim saqlanadi; processing reconciliation kerak |
| Duplicate webhook | PK conflict → 200 idempotent | Successful path safe; stale processing recovery yo‘q |
| Malformed JSON | 200 poison acknowledgement | Saqlandi |
| Invalid `update_id` | 2xx poison acknowledgement | Branch Telegram’ning retryni cheksiz takrorlashini to‘xtatadi |
| Telegram API timeout | `{ok:false}` qaytadi, route ko‘pincha e’tiborsiz qoldiradi va 200 beradi | OPEN: outbox/worker kerak |
| Vision timeout | 3 attempt × 45s gacha + backoff | OPEN: webhook’dan queue’ga ajratish kerak |
| Redis unavailable | request path reconnect va memory fallback | **PARTIAL FIX:** short retry/circuit breaker/bounded map |
| App restart | DB claims saqlanadi, memory limits reset | `processing` recovery job yo‘q |
| SIGTERM/deploy | explicit drain/pool/Redis shutdown yo‘q | UNKNOWN/OPEN |
| SIGKILL/OOM | in-flight request uziladi | Unbounded state/image workload sabab risk bor |
| Security DB write failure | businessni yiqitmaydi; stderr fallback | **HARDENED:** raw error olib tashlandi; durable sink yo‘q |

---

# 5. FINDINGS

> `Status` qo‘shimcha maydoni audit vaqtida fixning holatini ko‘rsatadi.
> “Fixed in branch” production’da deploy bo‘lganini anglatmaydi.

## CRITICAL

### C-001

ID: C-001  
Severity: CRITICAL  
Status: FIXED IN BRANCH; PRODUCTION DEPLOY REQUIRED  
Component: Telegram webhook / DB failure path  
File: `src/app/api/telegram/webhook/route.ts` (baseline catch; branch lines ~883–920), `src/lib/webhook-failure.ts`  
Line: baseline `POST` catch 856–876  
Problem: DB update-id claimidan oldin yiqilsa `claimedUpdateId === null` sabab route 200 qaytarardi.  
Evidence: Baseline catch HTTP statusni xato turiga emas, claim mavjudligiga bog‘lagan. DB `INSERT telegram_updates` xatosi ham claimdan oldin sodir bo‘ladi.  
Root Cause: “claim yo‘q = malformed JSON” degan noto‘g‘ri invariant.  
Impact: Telegram update retry qilinmaydi; user command, draft yoki moliyaviy action butunlay yo‘qoladi.  
Reproduction: `db.insert(telegramUpdates)`ni `ECONNREFUSED` bilan throw qildiring; baseline route 200 beradi.  
Recommended Fix: Faqat `SyntaxError`ga 200, boshqa barcha failure’ga 500.  
Code Change: `classifyWebhookFailure` qo‘shildi; non-syntax har doim 500; claim release failure alohida loglanadi.  
Test Required: Pre-claim DB failure → 500; malformed JSON → 200; Telegram retry integration.  
Regression Risk: Malformed bo‘lmagan poison internal error Telegram tomonidan qayta yuboriladi; handler idempotent bo‘lishi shart.  
Deployment Risk: LOW code risk; HIGH agar production fixsiz qolsa.  
Priority: P0 — immediate.

### C-002

ID: C-002  
Severity: CRITICAL  
Status: PARTIALLY FIXED IN BRANCH  
Component: Mini App financial idempotency  
File: `src/app/api/mutate/route.ts`, `src/components/providers.tsx`, `src/db/schema.ts`  
Line: route 84–226; provider mutation callback ~165–220; schema 533–550  
Problem: Baseline’da exception’dan keyin idempotency claim o‘chirilardi; klient har submit/retry uchun yangi UUID yaratardi. Commit bo‘lib response/state build yiqilsa, takroriy submit pulni yana yozardi.  
Evidence: Business mutation, idempotency completion, audit va state rebuild alohida DB operation; baseline catch unconditional DELETE qilgan.  
Root Cause: Idempotency transaction boundary business commit bilan bir emas; client retry identity barqaror emas.  
Impact: Duplicate income/expense/debt/payment/goal contribution va accounting corruption.  
Reproduction: Transaction INSERT commit bo‘lgach `buildAppState`ni throw qildiring; baseline 500; bir xil formni qayta submit qiling — yangi key va ikkinchi row.  
Recommended Fix: Idempotency keyni stable saqlash; ambiguous failure’da claimni o‘chirmaslik; completed retry’ga original success qaytarish; uzoq muddatda mutation+idempotency recordni bir DB transaction/outbox contractiga kiritish va request hash saqlash.  
Code Change: Branch claimni catch’da saqlaydi, completed retry’ni 200 qiladi, processing uchun 409/Retry-After beradi; client ambiguous response’da keyni reuse qiladi va WebView reload uchun sessionStorage’da faqat SHA-256 body signature + random keyni saqlaydi (financial body saqlanmaydi). Server `request_hash` bilan keyni exact payloadga bind qiladi va boshqa body reuse’ni 422 rad etadi. Account/category/budget ham qamrab olindi.
Test Required: Commit-then-response-loss, same-key replay, changed-payload same-key, concurrent same-key, stale processing reconciliation.  
Regression Risk: Ambiguous `processing` request 24 soat bloklanishi mumkin; availability accounting safety foydasiga tanlangan.  
Deployment Risk: MEDIUM; rolloutdan oldin idempotency table holatini tekshirish.  
Priority: P0.

### C-003

ID: C-003  
Severity: CRITICAL  
Status: PARTIALLY CONTAINED IN BRANCH; LEGACY DATA NEEDS VERIFICATION
Component: Currency/accounting model  
File: `src/db/schema.ts`, `src/lib/user.ts`, `src/lib/mutations.ts`, `src/lib/state.ts`  
Line: schema 24–25, 35, 138, 356–357; user 147–149; mutations transaction/account branches; state 123–139  
Problem: UZS/USD/EUR qo‘llab-quvvatlangandek ko‘rsatiladi, lekin FX rate, per-currency total yoki currency equality yo‘q; barcha account balance’lari xom son sifatida qo‘shiladi. User currency o‘zgarsa eski qiymatlar conversion’siz yangi label oladi.  
Evidence: `currentBalance = reduce(sum currentBalance)` currency bo‘yicha group qilmaydi; transaction currency `user.currency`, account currency bilan tekshirilmaydi.  
Root Cause: Currency display preference va ledger unit bitta field sifatida aralashtirilgan.  
Impact: Noto‘g‘ri balans, report, forecast, budget va debt totals — accounting integrity buziladi.  
Reproduction: 1,000,000 UZS transaction yarating; Settings’da USD tanlang; qiymat 1,000,000 bo‘lib qolib USD sifatida ko‘rinadi. Yoki 100 USD + 100 UZS account = 200 “user currency”.  
Recommended Fix: Branch’dagi immediate containmentni deploy qilish; keyin production inventory asosida base currency, original amount/currency, immutable FX rate va per-currency reports dizayni.
Code Change: Branch currency change va yangi mixed-currency account/postingni bloklaydi; headline/forecast/report faqat user currency’ni hisoblaydi, foreign accounts alohida qoladi va legacy mismatch critical alert beradi. Avtomatik data conversion qilinmadi — production inventory va reviewed FX migration hali talab etiladi.
Test Required: Currency-change guard; mixed-currency legacy account; transfer FX; historical rate; report/budget isolation.
Regression Risk: Existing mixed-currency rows bor bo‘lsa yangi constraint migration fail qiladi.  
Deployment Risk: HIGH; avval read-only inventory.  
Priority: P0.

### C-004

ID: C-004  
Severity: CRITICAL  
Status: FIXED IN BRANCH; PRODUCTION DEPLOY REQUIRED  
Component: Telegram payment-schedule confirmation  
File: `src/app/api/telegram/webhook/route.ts`  
Line: baseline 426–445; branch ~433–510  
Problem: Idempotency INSERT’dagi har qanday exception `isDuplicate=true` bo‘lib, draft “confirmed” qilinar va “duplicate saved” javobi berilardi — reja yaratilmagan bo‘lishi mumkin.  
Evidence: Baseline `catch { isDuplicate = true; }`.  
Root Cause: Conflict va dependency failure bitta holat deb talqin qilingan.  
Impact: Kredit/payment schedule yo‘qoladi; user majburiy to‘lovni saqlangan deb o‘ylaydi.  
Reproduction: Faqat idempotency INSERT’ni vaqtincha throw qildiring, keyingi DB update ishlasin; baseline reja yaratmasdan draftni yopadi.  
Recommended Fix: Faqat `ON CONFLICT` no-row duplicate; exception retriable internal failure; existing claim statusini tekshirish.  
Code Change: Branch exception’da draftni pendingga qaytarib throw qiladi; faqat `completed` duplicate success; ambiguous `processing` saqlandi deb aytilmaydi; resultId yoziladi.  
Test Required: Conflict, DB timeout, commit-ack loss va validation failure kombinatsiyalari.  
Regression Risk: Ambiguous schedule operator reconciliation talab qilishi mumkin, lekin silent data loss bo‘lmaydi.  
Deployment Risk: LOW.  
Priority: P0.

## HIGH

### H-001

ID: H-001  
Severity: HIGH  
Status: OPEN / PARTIAL OBSERVABILITY FIX  
Component: Telegram update idempotency lifecycle  
File: `src/db/schema.ts`, `src/app/api/telegram/webhook/route.ts`  
Line: schema `telegramUpdates` 91–98; route claim ~90–97, catch ~890–900  
Problem: `telegram_updates` faqat existence claim; `processing/completed/failed`, lease, attempt yoki completion timestamp yo‘q. Claimdan keyin DB uzilib, DELETE ham ishlamasa update abadiy “processed” ko‘rinadi.  
Evidence: Duplicate insert no-row bo‘lsa darhol 200; release failure branch’da loglanadi, lekin row recover qilinmaydi.  
Root Cause: Durable inbox state machine yo‘q.  
Impact: Telegram retry keladi, lekin action bajarilmasdan yutiladi.  
Reproduction: Claimni commit qiling; keyingi query va catch DELETE paytida DB’ni o‘chiring; tiklangach ayni update_id yuboring — idempotent 200.  
Recommended Fix: Inbox table `status`, `attempts`, `locked_at`, `completed_at`, `last_error_code`; stale lease atomic reclaim; business/draft linkage.  
Code Change: Branch `webhook_claim_release_failed` signalini qo‘shdi; schema redesign qolgan.  
Test Required: Crash-after-claim, restart, stale lease, concurrent duplicate.  
Regression Risk: Stale reclaim side-effectlarni takrorlashi mumkin; outbox/draft idempotency bilan birga joriy qilish kerak.  
Deployment Risk: MEDIUM migration.  
Priority: P0/P1.

### H-002

ID: H-002  
Severity: HIGH  
Status: OPEN  
Component: Webhook response timing / Telegram delivery  
File: `src/app/api/telegram/webhook/route.ts`, `src/lib/telegram.ts`, `src/lib/image/provider.ts`  
Line: webhook `callTelegram` and image path; telegram 27–66; provider ~495–658  
Problem: Handler DB/business/vision va outbound Telegram calls tugaguncha 200 bermaydi; `telegramApi` failure envelope qaytaradi, ko‘p callerlar natijani tekshirmaydi va webhook 200 bilan update’ni consume qiladi.  
Evidence: Vision 45s timeout × 3 attempt va backoff; `sendMessage` result ko‘pincha ignored.  
Root Cause: Durable queue/outbox yo‘q; transport va processing bir requestda.  
Impact: Timeout, silent bot response loss, committed money uchun acknowledgement yo‘q, image update orphan/stuck.  
Reproduction: Telegram `sendMessage`ni 502/timeout qiling; handler ko‘p path’da 200 qaytaradi. Vision’ni har attempt timeout qildiring.  
Recommended Fix: Webhook validate+durable inbox+fast 200; worker processes; Telegram outbox with retry/backoff/delivery status.  
Code Change: Hali qilinmadi.  
Test Required: 500 concurrent webhook, Telegram timeout-after-accept, worker restart, poison update.  
Regression Risk: Queue ordering va callback latency.  
Deployment Risk: HIGH architecture rollout; feature flag.  
Priority: P1.

### H-003

ID: H-003  
Severity: HIGH  
Status: FIXED IN BRANCH  
Component: PostgreSQL connection pool  
File: `src/db/index.ts` 34–52  
Line: Pool initialization/error listener  
Problem: Baseline pool’da idle-client `error` listener yo‘q edi. DB restart/network partition idle clients orqali uncaught EventEmitter error bilan app processni yiqitishi mumkin.  
Evidence: node-postgres rasmiy hujjati aynan bu holatda listener tavsiya qiladi [1](https://node-postgres.com/apis/pool).  
Root Cause: Faqat query promise errorlari hisobga olingan.  
Impact: DB incident app restartiga aylanadi; webhook availability yanada yomonlashadi.  
Reproduction: Pool’da idle connection qoldirib Postgres’ni restart qiling; baseline process uncaught error ko‘rishi mumkin.  
Recommended Fix: Pool error listener, safe metadata, restart metrics.  
Code Change: WeakSet bilan har poolga bir marta listener va sanitized log qo‘shildi.  
Test Required: Real Postgres restart integration test.  
Regression Risk: LOW.  
Deployment Risk: LOW.  
Priority: P0.

### H-004

ID: H-004  
Severity: HIGH  
Status: FIXED IN BRANCH; LEGACY DATA NEEDS VERIFICATION  
Component: New-user bootstrap  
File: `src/lib/user.ts` 33–65; `src/lib/bootstrap-user.ts` 16–84  
Line: `resolveUser`, `bootstrapNewUser`  
Problem: Baseline select-then-insert race va transaction’siz account/category inserts yangi userni partial yoki duplicate holatda qoldirishi mumkin edi.  
Evidence: User INSERT commit bo‘lgach ko‘plab alohida INSERT; existing user path bootstrap’ni qayta chaqirmagan.  
Root Cause: Onboarding transaction/idempotent healing yo‘q.  
Impact: Birinchi bot save “Hisob topilmadi”, kategoriyalar yetishmaydi, webhook 500.  
Reproduction: User INSERT’dan keyin bootstrap o‘rtasida DB’ni restart qiling; baseline retry existing userni qaytaradi, repair qilmaydi.  
Recommended Fix: Upsert user, row lock, atomic bootstrap, heal incomplete users.  
Code Change: Branch `ON CONFLICT DO NOTHING`, once-per-process integrity check va row-locked transaction qo‘shdi.  
Test Required: Concurrent first updates, crash at each insert, legacy partial repair.  
Regression Risk: Birinchi requestda qo‘shimcha queries/lock.  
Deployment Risk: LOW; read-only legacy audit kerak.  
Priority: P0.

### H-005

ID: H-005  
Severity: HIGH  
Status: OPEN  
Component: Money precision  
File: `src/db/schema.ts` 24–25; `src/lib/money.ts` 21–40; `src/lib/finance.ts` aggregations  
Line: `numeric(... mode:"number")`, `roundMoney`, reducers  
Problem: PostgreSQL `numeric(18,2)` JS `number`ga aylantiriladi va sums float’da bajariladi. Individual amount×100 safe bo‘lishi aggregate exactligini kafolatlamaydi.  
Evidence: 6 × `9_999_999_999_999.99` JS aggregation exact cents’dan 0.01 farq beradi; 9e12 opening balance’ga 100 × 0.01 qo‘shilganda 0.02 yo‘qoladi.  
Root Cause: Decimal monetary algebra binary floating point’da.  
Impact: Yuqori qiymat/ko‘p aggregation’da cent drift; financial report mismatch.  
Reproduction: Yuqoridagi qiymatlarni `computeLedgerBalances`ga bering va BigInt cents bilan taqqoslang.  
Recommended Fix: DB numericni string/Decimal sifatida o‘qish yoki bigint minor units; barcha aggregation DB numeric/BigInt’da.  
Code Change: Hali qilinmadi.  
Test Required: Property-based cent exactness, max aggregate, positive/negative, transfer conservation.  
Regression Risk: HIGH migration/API serialization.  
Deployment Risk: HIGH; dual-read/shadow compare bilan bosqichli.  
Priority: P1.

### H-006

ID: H-006  
Severity: HIGH  
Status: FIXED IN BRANCH FOR IDENTIFIED PATHS  
Component: Debt concurrency  
File: `src/lib/mutations.ts` debt update/cancel (~1205–1435)  
Line: debt optimistic predicates  
Problem: Baseline debt edit concurrent payment’ning yangi remaining amountini stale qiymat bilan overwrite qilishi; cancel esa current `amount=remaining` o‘rniga stale preflight value bilan solishtirishi mumkin edi.  
Evidence: Update WHERE’da version/old remaining yo‘q edi; cancel `debts.amount = existing.remainingAmount` ishlatgan.  
Root Cause: Preflight read va write orasida optimistic/row lock yo‘q.  
Impact: Payment row/ledger mavjud, debt remaining noto‘g‘ri yoki debt yashirilgan holat.  
Reproduction: Bir transactionda pay, ikkinchisida edit/cancelni barrier bilan parallel bajaring.  
Recommended Fix: `SELECT FOR UPDATE` yoki old financial state CAS; DB invariant current columns bilan.  
Code Change: Branch amount+remaining CAS va current-row `amount = remaining_amount` invariantini qo‘shdi.  
Test Required: Real DB’da pay-vs-edit, pay-vs-cancel, two deletes.  
Regression Risk: Conflict userga “reload/retry” qaytarishi kerak.  
Deployment Risk: LOW.  
Priority: P0/P1.

### H-007

ID: H-007  
Severity: HIGH  
Status: FIXED IN BRANCH; PRODUCTION DEPLOY REQUIRED
Component: Generic transaction → plan reconciliation  
File: `src/lib/mutations.ts` 148–213  
Line: `transaction.create` recurringId/expectedIncomeId path  
Problem: Authenticated caller generic transaction create’da plan ID yubora oladi; active/status tekshiruvi va CAS yo‘q. Ikki distinct idempotency key bir occurrence uchun ikki transaction yaratadi va parentni bir xil stale state’ga set qiladi. Irregular credit schedule ham generic monthly advance’dan buzilishi mumkin.  
Evidence: Parent UPDATE WHERE faqat id+user; dedicated `pay/receive` path’larida esa CAS bor.  
Root Cause: Bir business action uchun ikki write API.  
Impact: Duplicate plan payment/income, wrong installment cursor/counter.  
Reproduction: Ayni recurringId bilan ikki concurrent transaction.create yuboring.  
Recommended Fix: Generic create’dan plan IDsni rad etish; faqat dedicated `pay/receive`; DB partial unique `(plan, planned_date) where !deleted`.  
Code Change: Branch generic `transaction.create`da `recurringId`/`expectedIncomeId`ni rad etadi; plan fulfilment faqat CAS-protected `recurring.pay` va `expectedIncome.receive` orqali o‘tadi.
Test Required: Concurrent generic link rejection, cancelled/completed plan, irregular credit dedicated path.
Regression Risk: Undocumented external client bo‘lsa compatibility break.  
Deployment Risk: MEDIUM; usage log bilan tekshirish.  
Priority: P0/P1.

### H-008

ID: H-008  
Severity: HIGH  
Status: PARTIALLY FIXED IN BRANCH  
Component: Image intake lifecycle  
File: `src/lib/image/pipeline.ts` 140–237  
Line: claim, analysis, draft persistence  
Problem: Baseline intake claim, drafts insert va intake update alohida edi; crash invisible drafts/orphan `processing` qoldirardi. Failure cleanup DELETE ham DB outage’da fail bo‘lib image’ni permanent duplicate qilishi mumkin.  
Evidence: Unique fingerprint row qayta yuborishni bloklaydi; status lease/update timestamp yo‘q.  
Root Cause: External long task atrofida durable state machine va atomic post-analysis write yo‘q.  
Impact: Image qayta ishlanmaydi yoki drafts bor-u userga ko‘rinmaydi.  
Reproduction: Draft INSERT commitidan keyin intake UPDATE paytida DB restart; yoki failed analysis DELETE paytida outage.  
Recommended Fix: Drafts+intake atomic; processing lease/attempt; queue worker; failed/retryable status.  
Code Change: Branch unexpected analysis cleanup va drafts+intake transactionini qo‘shdi; stale processing recovery ochiq.  
Test Required: Fault injection har boundary’da, restart recovery.  
Regression Risk: DB transaction biroz kattaroq, lekin faqat draft batch.  
Deployment Risk: LOW for applied code; MEDIUM for future schema.  
Priority: P1.

### H-009

ID: H-009  
Severity: HIGH  
Status: OPEN  
Component: `/api/state` performance / DB pool  
File: `src/lib/state.ts` 47–92, 160+; `src/db/index.ts` 13–31  
Line: `buildAppState`  
Problem: Har state request butun transaction historyni LIMIT’siz olib, 10 query’ni `Promise.all`da boshlaydi; pool default max ham 10. Bir request poolni egallab, webhook/mutation/healthni navbatga qo‘yishi mumkin.  
Evidence: Transactions query date bound/limit yo‘q; to‘liq `txViews` klientga qaytadi.  
Root Cause: Read model/pagination/DB aggregation yo‘q.  
Impact: Data o‘sganda latency, memory, pool starvation, OOM va “uxlab qoldi” simptomi.  
Reproduction: Userga 100k transaction yuklab 10/50 concurrent `/api/state`; p95, RSS, pool waitni o‘lchang.  
Recommended Fix: SQL balance/month aggregates, recent transaction pagination, pool-aware query scheduling, server cache invalidation.  
Code Change: Hali qilinmadi.  
Test Required: 10/50/100 user load; large-ledger correctness shadow test.  
Regression Risk: Aggregate querylar report semanticsini buzishi mumkin; ledger shadow compare.  
Deployment Risk: MEDIUM/HIGH.  
Priority: P1.

### H-010

ID: H-010  
Severity: HIGH  
Status: OPEN  
Component: Notification dispatcher  
File: `src/app/api/telegram/notifications/route.ts` 36–90  
Line: recipients loop  
Problem: Faqat birinchi 1000 user, pagination/cursor yo‘q; har user uchun og‘ir state va Telegram call ketma-ket. Redis `pending` claimdan keyin crash 48 soat notificationni yo‘qotadi; timeout-after-delivery’da key delete duplicate yuborishi mumkin.  
Evidence: `limit(1000)` va `for ... await`; `pending` key 48h.  
Root Cause: HTTP cron durable job queue emas.  
Impact: Cron timeout, >1000 user och qoladi, missed yoki duplicate alert.  
Reproduction: 1001 user va 8s Telegram latency; oxirgi user hech qachon olinmaydi.  
Recommended Fix: Paginated queue, bounded concurrency, durable outbox with attempts/next_at/sent_at.  
Code Change: Hali qilinmadi.  
Test Required: 10/50/100 recipients, crash after claim, timeout-after-accept.  
Regression Risk: Telegram rate limits.  
Deployment Risk: MEDIUM.  
Priority: P1.

### H-011

ID: H-011  
Severity: HIGH  
Status: FIXED IN BRANCH  
Component: Migration generation metadata  
File: `drizzle/meta/0008_snapshot.json`, `tests/regressions.test.ts`  
Line: migration integrity test  
Problem: 0001–0008 manual migrationsdan keyin latest Drizzle snapshot yo‘q edi. Keyingi `drizzle-kit generate` existing tables/columns uchun duplicate non-idempotent DDL yaratgan.  
Evidence: Audit reproducer `0009`da `CREATE TABLE credit_installments`, `CREATE TABLE image_intakes`, qayta `ADD COLUMN`lar yaratdi.  
Root Cause: SQL journal va Drizzle snapshot chain drift.  
Impact: Keyingi normal schema change production predeployni to‘liq to‘xtatadi.  
Reproduction: Baseline temp copy’da `drizzle-kit generate`; duplicate DDL chiqadi.  
Recommended Fix: Current schema snapshotni latest migrationga bog‘lash va regression check.  
Code Change: `0008_snapshot.json` qo‘shildi; qayta generate “No schema changes”.  
Test Required: Har PR’da migration drift check.  
Regression Risk: LOW; metadata-only.  
Deployment Risk: NONE to DB.  
Priority: P0 before any next migration.

### H-012

ID: H-012  
Severity: HIGH  
Status: UNKNOWN / NEEDS VERIFICATION  
Component: Backup / disaster recovery  
File: `RAILWAY_DEPLOYMENT.md` 214+; Railway platform settings  
Line: N/A  
Problem: Repo restore drillni tavsiya qiladi, lekin backup enabled, retention, PITR, offsite dump va restore evidence yo‘q.  
Evidence: Railway access yo‘q; repository’da restore artifact/run log yo‘q.  
Root Cause: Platform control code bilan isbotlanmaydi.  
Impact: DB/volume incidentida permanent data loss; RPO/RTO noma’lum.  
Reproduction: Nondestructive staging restore drill mavjud emas.  
Recommended Fix: Scheduled volume backup + PITR + encrypted offsite logical dump; staging restore va checksum/business totals. Railway ham “never restored backup is unverified” deydi [1](https://docs.railway.com/guides/postgres-backups-restores).  
Code Change: Runbook mavjud; operator evidence talab qilinadi.  
Test Required: Quarterly restore; user/transaction counts, sums, FK, migrations, app health.  
Regression Risk: Restore test faqat isolated stagingda.  
Deployment Risk: LOW if source untouched.  
Priority: P0 safety.

### H-013

ID: H-013  
Severity: HIGH  
Status: OPEN  
Component: Observability / incident RCA  
File: API catch blocks, `src/lib/security.ts`, `src/lib/audit.ts`  
Line: webhook catch, mutation catch, notification catch  
Problem: `webhook_error code:internal` phase, safe PG code, duration, attempt, update_id hash yoki stack fingerprint bermaydi. Metrics/tracing/alerts yo‘q.  
Evidence: Hamma internal DB/network/logic failure bir code; `/api/health` snapshot xolos.  
Root Cause: Structured event schema juda tor va metrics backend yo‘q.  
Impact: Postgres restart ↔ webhook failure ↔ security logging chainini isbotlab bo‘lmaydi; MTTR yuqori.  
Reproduction: Turli DB timeout/FK/logic exceptionlar bir xil log beradi.  
Recommended Fix: `phase`, safe `errorCode`, durationMs, operation, update-id HMAC, pool stats; OpenTelemetry/Sentry; alerts.  
Code Change: Branch pool/claim secondary signal va sanitized error class qo‘shdi; to‘liq telemetry qolgan.  
Test Required: Log schema contract; secret redaction; alert simulation.  
Regression Risk: Cardinality/cost va PII.  
Deployment Risk: LOW with sampling.  
Priority: P0/P1.

### H-014

ID: H-014  
Severity: HIGH  
Status: ACTIVE INCIDENT / ROOT TRIGGER UNKNOWN  
Component: Railway PostgreSQL availability  
File: Runtime platform, not repository  
Line: User-provided Postgres log pattern  
Problem: Repeated unclean shutdown/recovery availability va in-flight transaction xavfini ko‘rsatadi.  
Evidence: `not properly shut down`, recovery, redo, ready pattern.  
Root Cause: UNKNOWN; OOM, Railway/host restart, process crash, forced termination yoki storage issue orasidan evidence yetarli emas.  
Impact: Temporary outage, webhook errors, rolled-back in-flight writes; app buglar sabab update loss/stuck claims.  
Reproduction: Production’da ataylab takrorlanmasin; staging Postgres SIGKILL fault-injection bilan app response tekshirilsin.  
Recommended Fix: Railway event/metric correlation, resource headroom, backup/PITR, app recovery fixes, alerting.  
Code Change: App-side C-001/H-003/H-004 hardening tayyorlandi.  
Test Required: Staging restart recovery, no duplicate/loss invariant.  
Regression Risk: Fault test production’da taqiqlanadi.  
Deployment Risk: N/A.  
Priority: P0 incident.

## MEDIUM

### M-001

ID: M-001  
Severity: MEDIUM  
Status: PARTIALLY FIXED IN BRANCH  
Component: Redis/cache failure path  
File: `src/lib/redis.ts`, `src/lib/security.ts`  
Line: redis 13–57; security 66–127  
Problem: Baseline reconnect request pathda uzoq kutishi, not-ready client yonida yangi clients yaratishi va memory fallback 10k active keydan keyin O(n²)/unbounded bo‘lishi mumkin edi.  
Evidence: 5s × multiple reconnect; cleanup faqat expired entryni o‘chirgan.  
Root Cause: Circuit breaker/hard cap yo‘q.  
Impact: Redis incident webhook latency/CPU/RSS incidentiga aylanadi.  
Reproduction: Redis’ni o‘chirib ko‘p spoofed identities yuboring.  
Recommended Fix: Fast fail, circuit breaker, bounded fallback, trusted proxy identity.  
Code Change: 1.5s bounded reconnect, offline queue off, 5s circuit, no duplicate reconnect socket, overflow bucket qo‘shildi.  
Test Required: Real Redis outage/recovery, 20k identities memory test.  
Regression Risk: Qisqa Redis glitch’da per-instance limiterga tezroq degrade bo‘ladi.  
Deployment Risk: LOW.  
Priority: P1.

### M-002

ID: M-002  
Severity: MEDIUM  
Status: PARTIALLY FIXED IN BRANCH; RETENTION REMAINS OPEN
Component: `security_events` / abuse logging  
File: `src/lib/audit.ts`, `src/db/schema.ts` 517–531, webhook secret reject  
Line: `writeSecurityEvent`, schema index  
Problem: Public unauthenticated rejectlar har requestda PostgreSQL INSERT qilishi mumkin; retention/sampling/quota yo‘q. `security_events` severity CHECK va created_at-leading retention index yo‘q.  
Evidence: Webhook secret reject rate-limitdan oldin `void writeSecurityEvent`; index `(event, created_at)` global time cleanupga optimal emas.  
Root Cause: Security telemetry ayni primary DB va per-event persistence’ga bog‘langan.  
Impact: Attack DB write amplification/disk growth; DB outage’da event yo‘q.  
Reproduction: Invalid secret bilan yuqori rate; row/disk growthni o‘lchang.  
Recommended Fix: Pre-auth limiter, sampling/aggregation, retention partition/job, independent log sink; severity CHECK.  
Code Change: Branch fallback raw errorni sanitizatsiya qildi, webhook/mutation pre-auth limiterini persistence’dan oldinga oldi va har event uchun globally bounded DB sample qo‘shdi; retention/partition qolgan.
Test Required: Flood/load, spoofed identity, sample cap va retention query EXPLAIN.
Regression Risk: Sampling forensic detailni kamaytiradi.  
Deployment Risk: MEDIUM migration/job.  
Priority: P1.

### M-003

ID: M-003  
Severity: MEDIUM  
Status: CI TEMPLATE PREPARED; ACTIVATION BLOCKED BY GITHUB WORKFLOW PERMISSION
Component: CI / test enforcement
File: `.github/` absent; `package.json`; DB tests  
Line: N/A  
Problem: Baseline’da GitHub Actions workflow/run yo‘q edi; DB integration suite’lar env bo‘lmasa green suite ichida SKIP bo‘ladi. Route-level auth/webhook/failure/concurrency E2E yo‘q.
Evidence: Audit boshida GitHub Actions list bo‘sh edi. Workflow-path push GitHub tomonidan permission sabab rad etildi; template docs ichida saqlandi. Lokal full suite 405 pass + 3 conditional skip; suite’lar alohida disposable PostgreSQL 18’da 22/22 pass qildi.
Root Cause: Tests local-only, Postgres service CI’da yo‘q.  
Impact: Migration, auth, idempotency va concurrency regressions merge bo‘lishi mumkin.  
Reproduction: `npm test` DBsiz exit 0.  
Recommended Fix: CI Postgres/Redis service; migrations; DB suites skip bo‘lsa fail; lint/typecheck/test/build/audit.  
Code Change: Reliability regression tests va disposable PostgreSQL/Redis bilan lint, typecheck, full tests, build hamda production audit bajaradigan `docs/ci-production-safety.yml` template tayyorlandi. GitHub App’da `workflows` permission yo‘qligi sabab `.github/workflows/`ga push server tomonidan rad etildi; maintainer template’ni o‘sha joyga ko‘chirishi kerak.
Test Required: Workflow aktivlashtirilib birinchi CI run green bo‘lsin; keyin branch protection’da required check qilinsin.
Regression Risk: Flaky network/provider testlarni mocklash.  
Deployment Risk: NONE.  
Priority: P1.

### M-004

ID: M-004  
Severity: MEDIUM  
Status: PARTIALLY FIXED IN BRANCH / NEXT SHUTDOWN NEEDS VERIFICATION
Component: Startup/shutdown/deployment resilience  
File: `railway.json`, `scripts/start-production.sh`, `src/db/index.ts`, `src/lib/redis.ts`  
Line: railway 17–27  
Problem: 1 replica; explicit `overlapSeconds`/`drainingSeconds`, SIGTERM handler, pool.end/Redis quit yoki in-flight tracking yo‘q. Restart max 10’dan keyingi holat unknown.  
Evidence: Config faqat replica/restart/health; start script `exec next start`.  
Root Cause: Graceful lifecycle app darajasida loyihalanmagan.  
Impact: Deploy/restart paytida long webhook kesiladi va ambiguous processing qoladi.  
Reproduction: Staging image request o‘rtasida SIGTERM; DB rows va Telegram retryni tekshiring.  
Recommended Fix: Railway drain window, queue worker, Next shutdown behaviourni verify, readinessni 503 qilish, pool/Redis close hooks.  
Code Change: Branch Railway’da 20s old/new overlap va 30s SIGTERM→SIGKILL drain window qo‘shdi; explicit pool/Redis close va in-flight worker recovery hali qolgan.
Test Required: SIGTERM 30s, SIGKILL, rolling deploy.  
Regression Risk: Overlap qisqa vaqt ikki app replica ishlatadi; idempotency/cron singleton semanticsini tekshirish kerak.
Deployment Risk: MEDIUM.  
Priority: P1/P2.

### M-005

ID: M-005  
Severity: MEDIUM  
Status: FIXED IN BRANCH  
Component: Telegram Mini App auth credential transport  
File: `src/app/api/state/route.ts`, `src/app/api/mutate/route.ts`  
Line: state 24+, mutate 65–68  
Problem: Baseline `init_data` query parameter fallbackini qabul qilgan; signed bearer data proxy access log/browser history’da qolishi mumkin.  
Evidence: `url.searchParams.get("init_data")`.  
Root Cause: Header va URL credential teng ko‘rilgan.  
Impact: 24h oynada replay/impersonation.  
Reproduction: `/api/state?init_data=...`; URL log/history’da credential.  
Recommended Fix: Faqat header/body secure channel.  
Code Change: Query fallback olib tashlandi.  
Test Required: Query-only → 401; header valid → 200.  
Regression Risk: Legacy undocumented clientlar.  
Deployment Risk: LOW.  
Priority: P1.

### M-006

ID: M-006  
Severity: MEDIUM  
Status: FIXED IN BRANCH
Component: Request size / input validation  
File: mutate route 38–57; webhook route content-length check  
Line: route body parsing  
Problem: Limit faqat client-controlled/missing `Content-Length`ga qaraydi; `request.json()` to‘liq body’ni xotiraga oladi.  
Evidence: Chunked/missing headerda length 0.  
Root Cause: Streaming byte limiter yoki edge/server cap yo‘q.  
Impact: Memory/CPU DoS; OOM.  
Reproduction: Header’siz katta chunked JSON yuboring.  
Recommended Fix: Reverse-proxy max body + streaming reader byte cap + content-type check.  
Code Change: Branch actual stream bytesni 64 KiB/128 KiB limitgacha o‘qiydigan `readJsonBody` boundary qo‘shdi; missing/forged Content-Length limitni chetlab o‘tolmaydi, malformed JSON 400 va oversized Telegram poison update 2xx bilan consume qilinadi.
Test Required: Missing/fake length, chunked, malformed oversized va Telegram legitimate max payload.
Regression Risk: Telegram legitimate payload limit bilan moslashtirish.  
Deployment Risk: LOW.  
Priority: P1.

### M-007

ID: M-007  
Severity: MEDIUM  
Status: PARTIALLY FIXED IN APPLICATION; DB CONSTRAINTS REMAIN OPEN
Component: Relational/data integrity constraints  
File: `src/db/schema.ts`, `src/lib/mutations.ts`  
Line: categories 151–170; transactions 347–388; plans/debts/goals FKs  
Problem: Parent category FK yo‘q; FKs referenced rowning ayni userga tegishli ekanini DB’da enforce qilmaydi; transfer shape va tenant invariants CHECK yo‘q. Baseline’da category direction/depth validation ham to‘liq emas edi.
Evidence: FKlar faqat target id; branch service layer’da category owner+active+income/expense type va root-parent depthni tekshiradi, lekin DB direct write hali buni chetlab o‘tishi mumkin.
Root Cause: Tenant integrity asosan application-only.
Impact: Bug/ad-hoc SQL cross-user link yoki noto‘g‘ri report classification.  
Reproduction: Baseline’da income transactionga own expense category ID yuborish qabul qilinardi; branch rad etadi. Direct SQL esa DB constraint yo‘qligi sabab hali mumkin.
Recommended Fix: Branch validatorlarini deploy qilish; keyin composite unique/FK `(id,user_id)`, parent FK va DB invariantlar.
Code Change: Transaction, recurring expense, expected income, budget, credit va category parent pathlari owner+active+direction/depth bo‘yicha fail-closed qilindi.
Test Required: IDOR/BOLA, cross-type negative tests va direct-DB constraint tests.
Regression Risk: Existing bad rows migrationni bloklashi mumkin.  
Deployment Risk: HIGH until preflight cleanup.  
Priority: P1/P2.

### M-008

ID: M-008  
Severity: MEDIUM  
Status: PARTIALLY FIXED IN APPLICATION; DB CONSTRAINT/RETENTION OPEN
Component: Unique keys / retention  
File: schema budgets 391–408, credit installments 246–266, idempotency/telegram tables  
Line: relevant indexes  
Problem: PostgreSQL UNIQUE `(user, category_id, month)` NULL categorylarni duplicate deb bilmaydi; upsert select-then-insert race. Credit installment `(plan, occurrence)` index unique emas. Technical tables uchun cleanup job yo‘q.  
Evidence: Nullable `categoryId`, ordinary unique index; no DELETE retention code.  
Root Cause: NULL semantics va lifecycle omitted.  
Impact: Duplicate total budget, duplicate schedule rows, unbounded disk/index growth.  
Reproduction: Ikki concurrent NULL-category budget upsert; ikkala INSERT o‘tishi mumkin.  
Recommended Fix: `NULLS NOT DISTINCT`/expression unique; unique plan occurrence/date; safe retention jobs.  
Code Change: Exact-key expired idempotency reclaim qo‘shildi; budget logical key (shu jumladan NULL/all) advisory transaction lock bilan serial qilinadi va pre-existing duplicate fail-closed aniqlanadi. DB unique constraints va global cleanup qolgan.
Test Required: Real DB concurrent upsert, duplicate migration preflight, retention batch.
Regression Risk: Existing duplicates.  
Deployment Risk: MEDIUM/HIGH.  
Priority: P1.

### M-009

ID: M-009  
Severity: MEDIUM  
Status: OPEN  
Component: Timezone/date boundaries  
File: `src/lib/money.ts` 75–169; `.env.example`  
Line: `todayISO`, `todayISOAt`  
Problem: Server global `APP_TIMEZONE` (default Tashkent), browser esa device timezone; per-user timezone yo‘q. Invalid timezone silent server-local fallback qiladi.  
Evidence: Browser `toISO(new Date())`; server Intl with catch fallback.  
Root Cause: Calendar zone user modelida saqlanmagan.  
Impact: Sayohat/boshqa zonadagi userda day/month boundary mismatch.  
Reproduction: Device America/New_York, server Asia/Tashkent, UTC boundaryda default datesni taqqoslang.  
Recommended Fix: User timezone field yoki qat’iy product timezone; startup validation; API server date authority.  
Code Change: `.env.example`ga APP_TIMEZONE qo‘shildi; semantics ochiq.  
Test Required: UTC± zones, month/year/DST boundaries.  
Regression Risk: Historical date reinterpretation qilinmasin.  
Deployment Risk: MEDIUM.  
Priority: P2.

### M-010

ID: M-010  
Severity: MEDIUM  
Status: UNKNOWN / POLICY REQUIRED  
Component: Image privacy / external processing  
File: `src/lib/image/provider.ts` 15–23, 154–196; image pipeline  
Line: provider hints and data URI  
Problem: Financial image bytes va user yaratgan category names third-party vision endpointga yuboriladi; consent, provider retention/DPA, region yoki redaction policy repo’da yo‘q. “category names non-sensitive” taxmini kafolatlanmagan.  
Evidence: `categoryNames` promptga, full image base64 requestga qo‘shiladi.  
Root Cause: Feature security bor, privacy governance yo‘q.  
Impact: Moliyaviy/PII disclosure compliance riski.  
Reproduction: Sensitive category va receipt yuborib outbound payloadni test providerda inspect qiling.  
Recommended Fix: Explicit consent, privacy notice, provider zero-retention contract, categories hintni olib tashlash/redact, region controls.  
Code Change: Hali qilinmadi.  
Test Required: Payload redaction snapshot, consent gate.  
Regression Risk: OCR category accuracy kamayishi mumkin.  
Deployment Risk: HIGH policy risk.  
Priority: P1 before global enable.

### M-011

ID: M-011  
Severity: MEDIUM  
Status: PARTIALLY FIXED IN BRANCH
Component: Custom migration runner  
File: `scripts/migrate.mjs` 29–109; `drizzle/0008_debt_transaction_links.sql`  
Line: hash-only applied detection  
Problem: Applied migration faqat hash bilan taniladi; old SQL fayl tahrirlansa yangi migration sifatida qayta ishlaydi. Tag/order/drift invariant va hash UNIQUE yo‘q. 0008 backfill katta table’da 120s statement timeout/lockingga urilishi mumkin.  
Evidence: `Set(applied hash)`; journal tag DB’da saqlanmaydi.  
Root Cause: Drizzle migrator protocolning qisman custom implementatsiyasi.  
Impact: Deployment failure yoki qayta DDL; large production migration timeout.  
Reproduction: Applied migrationga comment qo‘shib predeployni stagingda ishga tushiring — hash yangi.  
Recommended Fix: Immutable migration policy + tag/hash unique journal; drift bo‘lsa fail, qayta apply emas; staging EXPLAIN/timing.  
Code Change: Snapshot drift fixed; runner journal tag/timestamp validityni tekshiradi va same-timestamp hash drift yoki historical ordering gap bo‘lsa SQLni qayta qo‘llash o‘rniga fail-closed qiladi. Large-data migration timing va journal protocol modernizatsiyasi qolgan.
Test Required: Modified applied migration, concurrent deploy, lock timeout, large data.  
Regression Risk: Existing journal bilan compatibility.  
Deployment Risk: MEDIUM.  
Priority: P2.

### M-012

ID: M-012  
Severity: MEDIUM (advisory), practical runtime risk LOW  
Status: OPEN  
Component: Dev dependencies  
File: `package-lock.json`, `package.json`  
Line: drizzle-kit transitive tree  
Problem: `npm audit` 4 moderate: old `esbuild@0.18.20` through deprecated `@esbuild-kit/*` in `drizzle-kit`.  
Evidence: GHSA-67mh-4wv8-2f99; production-only audit 0.  
Root Cause: Current drizzle-kit transitive legacy loader.  
Impact: Esbuild dev-server cross-origin issue; production runtime image omits dev deps.  
Reproduction: `npm audit`; `npm ls drizzle-kit ... esbuild`.  
Recommended Fix: Upgrade when upstream removes legacy loader; do not `npm audit fix --force` downgrade blindly.  
Code Change: Hali qilinmadi.  
Test Required: Migration generate after upgrade.  
Regression Risk: Drizzle metadata compatibility.  
Deployment Risk: LOW.  
Priority: P3.

### M-013

ID: M-013  
Severity: MEDIUM  
Status: OPEN / NEEDS VERIFICATION  
Component: Rate-limit identity, auth replay, diagnostics exposure  
File: `src/lib/security.ts` 43–58; `src/lib/user.ts` 119–134; health route 21–38  
Line: proxy headers/auth max age/public health  
Problem: Client-provided forwarding headersning trusted-proxy boundarysi aniqlanmagan; first XFF spoof bo‘lishi mumkin. Signed initData 24h replayable va server-side revoke yo‘q. Deep health public operational details beradi.  
Evidence: Header priority to‘g‘ridan-to‘g‘ri; max age 24h; health authsiz.  
Root Cause: Edge trust/session/ops endpoint threat model hujjatlanmagan.  
Impact: IP limit bypass, leaked initData replay oynasi, attackerga bot/config status.  
Reproduction: Custom XFF bilan rate-limit keysni aylantiring; valid initData’ni 24h ichida replay.  
Recommended Fix: Railway trusted header contractini verify; edge-provided identity; shorter auth age/session nonce; deep healthni secret/private monitor ortiga olish.  
Code Change: Query credential olib tashlandi va webhook compare constant-time qilindi; qolgan ochiq.  
Test Required: Proxy integration, replay, health auth.  
Regression Risk: Telegram WebView compatibility.  
Deployment Risk: MEDIUM.  
Priority: P2.

## LOW

### L-001

ID: L-001  
Severity: LOW  
Status: FIXED IN BRANCH  
Component: Secret/config hygiene  
File: `.gitignore`, startup/configure scripts, `src/lib/audit.ts`  
Line: N/A  
Problem: Baseline `.gitignore` faqat `.env`/`.env.local`ni ignore qilgan; `.env.production`, key/cert/npm token fayllari commit bo‘lishi mumkin. Secret minimum/Telegram charset tekshirilmagan; audit fallback raw `String(error)` loglagan.  
Evidence: Git history scan real secret topmadi, ammo preventive controls yetishmagan.  
Root Cause: Incomplete deny patterns/validation.  
Impact: Kelajakdagi accidental credential exposure yoki startup misconfig.  
Reproduction: Baseline’da `.env.production` `git status`da ko‘rinadi.  
Recommended Fix: `.env*` deny + example allow, key patterns, length/charset checks, safe errors.  
Code Change: Barchasi branch’da qo‘shildi.  
Test Required: Secret scan CI va startup negative tests.  
Regression Risk: Local `.npmrc` endi ataylab tracked bo‘la olmaydi.  
Deployment Risk: LOW.  
Priority: P2.

### L-002

ID: L-002  
Severity: LOW  
Status: OPEN  
Component: Maintainability/dead exports/duplication  
File: `finance.ts`, `mutations.ts`, `plans/page.tsx`, `state.ts`, multiple exports  
Line: module-level  
Problem: Juda katta modullar; jscpd 18 clone; ts-prune ko‘plab public-but-unused export va `state.ts`da `void` bilan ushlangan unused imports ko‘rsatdi.  
Evidence: 0.96% duplicate lines; `finance.ts` ~2k, `mutations.ts` ~1.7k. Circular dependency topilmadi.  
Root Cause: Featurelar bir necha monolitga yig‘ilgan.  
Impact: Review qiyin, transaction boundary regressioni ehtimoli oshadi.  
Reproduction: Static tools.  
Recommended Fix: Behaviour-preserving module split, public API inventory.  
Code Change: Hali qilinmadi.  
Test Required: Existing business tests + DB integration.  
Regression Risk: MEDIUM refactor risk.  
Deployment Risk: LOW if incremental.  
Priority: P3/P4.

### L-003

ID: L-003  
Severity: LOW  
Status: OPEN  
Component: Build ergonomics  
File: `src/db/index.ts` 5–6; `package.json`; Dockerfile 9–15  
Line: module import  
Problem: Oddiy `npm run build` DATABASE_URL bo‘lmasa page collection’da fail; Docker dummy URL beradi, lekin local/CI script self-contained emas.  
Evidence: Auditda plain build fail, syntactic URL bilan pass.  
Root Cause: DB pool import-time eager validation.  
Impact: CI/onboarding friction; noto‘g‘ri “build broken” signal.  
Reproduction: envsiz `npm run build`.  
Recommended Fix: CI’da documented build URL yoki lazy DB factory.  
Code Change: Hali qilinmadi.  
Test Required: Clean-env build.  
Regression Risk: Lazy init runtime misconfigni kechroq ko‘rsatadi.  
Deployment Risk: LOW.  
Priority: P3.

### L-004

ID: L-004  
Severity: LOW  
Status: OPEN  
Component: Container/dev environment supply chain  
File: `Dockerfile`, `.devcontainer/devcontainer.json`  
Line: base image/features  
Problem: Node base image va devcontainer feature tags digest bilan pin qilinmagan; devcontainer default DB credential va forwarded DB/Redis ports ishlatadi.  
Evidence: Mutable tags; credentials faqat local dummy — secret emas.  
Root Cause: Developer convenience.  
Impact: Reproducibility/supply-chain drift; dev machine exposure agar port public bind qilinsa.  
Reproduction: Vaqt o‘tib same Dockerfile boshqa digest oladi.  
Recommended Fix: Digest pin + Renovate/Dependabot; dev ports localhost policy.  
Code Change: Hali qilinmadi.  
Test Required: Container build/SBOM/signature.  
Regression Risk: Digest maintenance.  
Deployment Risk: LOW.  
Priority: P4.

### L-005

ID: L-005  
Severity: LOW  
Status: OPEN  
Component: Config/docs drift  
File: `RAILWAY_DEPLOYMENT.md`, `.env.example`, health response, configure script  
Line: various  
Problem: Webhook provisioning manual; startup faqat variable presence tekshiradi, actual Telegram webhookni reconcile qilmaydi. Service label eski `personal-financial-os`; repo root README yo‘q.  
Evidence: `ensureTelegramWebhook` export ishlatilmaydi; configure script operator tomonidan alohida bajariladi.  
Root Cause: Operational automation incomplete.  
Impact: Domain/secret rotationdan keyin bot broken, health faqat keyin warning beradi.  
Reproduction: App URLni almashtirib configure scriptni ishlatmang.  
Recommended Fix: Explicit deploy job/webhook reconciliation with no pending drop; root runbook.  
Code Change: APP_TIMEZONE/DB_POOL env docs va healthcheck RCA matni tuzatildi.  
Test Required: Staging domain rotation.  
Regression Risk: Automatic setWebhook noto‘g‘ri envda targetni almashtirishi mumkin; environment lock kerak.  
Deployment Risk: MEDIUM automation.  
Priority: P3.

## INFO

### I-001

ID: I-001  
Severity: INFO  
Status: CONFIRMED POSITIVE CONTROL  
Component: Authentication/authorization/security  
File: `src/lib/user.ts`, mutation/webhook routes, `src/proxy.ts`  
Line: multiple  
Problem: Improvement note — Telegram HMAC + timing-safe compare, mandatory auth_date, production fail-closed demo, same-origin mutation, owner-scoped queries, callback ownership, CSP/HSTS va admin fail-closed mavjud.  
Evidence: Code va passing tests.  
Root Cause: N/A.  
Impact: OWASP broken-auth/IDOR/XSS riskini sezilarli kamaytiradi.  
Reproduction: Security smoke test.  
Recommended Fix: Route integration test bilan enforce qilish.  
Code Change: Webhook secret compare ham branch’da timing-safe qilindi.  
Test Required: 401/403/404/IDOR matrix.  
Regression Risk: LOW.  
Deployment Risk: NONE.  
Priority: Maintain.

### I-002

ID: I-002  
Severity: INFO  
Status: CONFIRMED POSITIVE CONTROL  
Component: Core financial transactions  
File: `src/lib/mutations.ts`, `src/lib/reconciliation.ts`  
Line: pay/receive/debt pay/goal contribution paths  
Problem: Improvement note — ko‘p money operationlar parent state + ledger rowni bitta DB transactionda yozadi va dedicated pay/receive path CAS ishlatadi; soft-delete reconciliation mavjud.  
Evidence: Code va pure/DB test design.  
Root Cause: N/A.  
Impact: Partial write va common double-click riskini kamaytiradi.  
Reproduction: Existing lifecycle tests; real DB suite production-like DB bilan majburiy ishlatilishi kerak.  
Recommended Fix: Generic plan link va idempotency transaction boundaryni shu darajaga olib kelish.  
Code Change: Debt CAS qo‘shimcha hardening qilindi.  
Test Required: DB concurrency/fault injection.  
Regression Risk: LOW.  
Deployment Risk: NONE.  
Priority: Maintain.

---

## 6. SECURITY EVENTS DEEP AUDIT

### Schema

- `event`, `severity`, `request_id`, `created_at`: NOT NULL;
- `user_id`: nullable + `ON DELETE SET NULL` — security historyni saqlash uchun to‘g‘ri;
- `ip_hash`, `metadata`: nullable;
- index `(event, created_at)` event bo‘yicha timeline uchun foydali;
- severity CHECK, global `created_at` retention index, partition/retention yo‘q;
- event/request/text field length DB’da cheklanmagan, app slice faqat eventga qo‘llaydi.

### `security_event_write_failed`

```text
CONFIRMED:
- writeSecurityEvent ayni PostgreSQL pool/table’dan foydalanadi.
- INSERT failure catch qilinadi; business operationga throw qilinmaydi.
- fallback process stderr hisoblanadi.
- branch raw DB message o‘rniga errorName/errorCode chiqaradi.

PROBABLE (faqat ayni timestamp DB recovery bilan mos bo‘lsa):
- primary DB unavailable/reset/timeout security event INSERTni ham yiqitgan.

POSSIBLE:
- migration/table missing;
- FK user_id invalid;
- statement timeout/pool starvation;
- schema drift.

UNKNOWN:
- Berilgan logda PG code, phase va timestamp yo‘q; aniq root cause tasdiqlanmaydi.
```

Fallback architecture kerak: **ha**. Hozirgi stderr fallback businessni saqlaydi,
lekin durable independent sink emas. Railway log drain/OTel collector kabi DB’dan
mustaqil sink, sampling va local bounded queue kerak. Logger hech qachon asosiy
operationni yiqitmasligi shart — hozir catch orqali bu talab bajariladi.

---

## 7. DATABASE / DATA INTEGRITY SUMMARY

### Money operations matrix

| Operation | Atomic | Transactional | Idempotent | Concurrent-safe | Audit |
|---|---:|---:|---:|---:|---:|
| transaction create | ledger row tx; plan IDs rejected | yes | branch key-level | plan fulfilment dedicated CAS pathda | outside tx |
| transaction update | single statement | yes | set operation | last-write-wins | outside tx |
| transaction delete + plan revert | one tx | yes | soft-delete predicate | different concurrent reverts need DB test | outside tx |
| recurring pay | parent CAS + ledger tx | yes | CAS + API key | generally yes | outside tx |
| expected receive | parent CAS + ledger tx | yes | CAS + API key | generally yes | outside tx |
| debt create | debt + opening ledger tx | yes | branch key-level | duplicate distinct keys possible | outside tx |
| debt pay | SQL remaining guard + payment + ledger | yes | branch key-level | yes for overpay | outside tx |
| debt edit/cancel | branch CAS/invariant | yes | key-level | fixed identified race | outside tx |
| goal contribute | SQL cap + contribution + ledger | yes | key-level | cap-safe | outside tx |
| schedule create | parent + installments tx | yes | fingerprint claim | ambiguous needs reconciliation | audit outside tx |
| image confirm | per-draft claim + mutation | mutation tx | draft status | stale processing remains | outside tx |

### Missing/weak indexes and constraints

Priority candidates (production `EXPLAIN`/duplicate preflightdan keyin):

```sql
-- Do not run blindly; first prove no duplicates.
-- partial unique plan occurrence indexes
(user_id, recurring_id, planned_date) where recurring_id is not null and is_deleted=false
(user_id, expected_income_id, planned_date) where expected_income_id is not null and is_deleted=false

-- current state query
(user_id, date desc, id desc) where is_deleted=false

-- notification read
(user_id, created_at desc)

-- retention
security_events(created_at)
telegram_updates(processed_at)

-- schedule integrity
unique(plan_id, occurrence_number)
unique(plan_id, date)
```

Unused indexlar production `pg_stat_user_indexes` evidence’isiz aniqlanmadi:
`UNKNOWN / NEEDS VERIFICATION`.

---

## 8. AUTHENTICATION / AUTHORIZATION MATRIX

| Endpoint/action | Authentication | Authorization | Result |
|---|---|---|---|
| `GET /api/state` | Telegram initData HMAC/auth_date | resolved current user only | Good; header-only branch fix |
| `POST /api/mutate` | initData + same-origin | every major resource query user-scoped | Good with DB-constraint gaps |
| Telegram webhook | secret token | Telegram `from.id`; callback draft user+chat scope | Good; durable inbox gap |
| Notification cron | constant-time bearer | all users by system job | Secret good; job architecture weak |
| `/api/bot` | production 404 | dev simulator only | Good |
| `/api/admin/*` | proxy 404 | no admin feature | Fail-closed |
| `/api/health*` | public | operational only | Deep diagnostics exposure M-013 |

Password/JWT/cookie/refresh-token/OAuth yo‘q; Telegram identity yagona production auth.
Logout/session invalidation qo‘llanmaydi. Telegram initData server blacklist/revoke yo‘q.

---

## 9. SECRETS STATUS

| Secret/config | Repository | Production |
|---|---|---|
| Bot token | NOT FOUND | UNKNOWN |
| Webhook secret | NOT FOUND | UNKNOWN |
| Database URL credential | NOT FOUND (dummy dev/build URL only) | UNKNOWN |
| Redis credential | NOT FOUND | UNKNOWN |
| JWT secret | NOT USED | N/A |
| Encryption key | NOT USED | N/A |
| Vision API key | NOT FOUND | UNKNOWN |
| Cron secret | NOT FOUND | UNKNOWN |
| Log hash secret | NOT FOUND | UNKNOWN |
| Admin credentials | NOT FOUND / admin disabled | N/A |

Git tarixi bo‘yicha tracked env path faqat `.env.example`. Hech qanday real secret
qiymati output qilinmadi. Branch `.env*`, key/cert va `.npmrc`ni ignore qiladi.
Production variable strength/value va Railway visibility: `UNKNOWN`.

---

## 10. DEPENDENCY / LICENSE

- Lockfile: **FOUND**, npm lockfile v3.
- Production dependencies: 0 known npm audit vulnerability.
- Dev dependencies: 4 moderate advisory, `drizzle-kit → @esbuild-kit → esbuild@0.18.20`.
- Deprecated transitive packages: `@esbuild-kit/esm-loader`, `core-utils`; production runtime’da yo‘q.
- Runtime dependencylar ishlatiladi; depcheck Tailwind/PostCSSni config detection sabab false-positive ko‘rsatdi.
- Production licenses asosan MIT/Apache/ISC/BSD; sharp libvips LGPL dynamic binary dependency mavjud. Legal policy: `NEEDS VERIFICATION`, immediate code risk aniqlanmadi.

---

## 11. TEST AUDIT

| Category | Holat |
|---|---|
| Unit/pure finance | Strong |
| Reconciliation/business regression | Strong |
| UI source-contract tests | Ko‘p, lekin runtime browser E2E o‘rnini bosmaydi |
| Database integration | PASS: migrations + 3 suite, 22/22 test disposable PostgreSQL 18’da |
| Webhook route integration | Missing |
| Auth/security route integration | Missing; faqat smoke script/static assertions |
| Concurrent DB tests | Missing |
| DB failure/fault injection | Missing |
| E2E Telegram | Missing |
| Load/stress | Missing |
| Backup restore | Missing/UNKNOWN |

Majburiy P0 testlar:

1. create/update/delete transaction real Postgres;
2. same idempotency key concurrent va response-loss replay;
3. DB down before/after webhook claim;
4. duplicate webhook/update_id;
5. plan/debt/goal concurrent operations;
6. malformed/oversized request;
7. auth/IDOR/cross-origin;
8. security event DB failure businessni yiqitmasligi;
9. SIGTERM worker recovery;
10. currency isolation/guard.

---

## 12. LOAD / STRESS PLAN

Repo’da load test yo‘q. Staging’da production-size synthetic data bilan:

| Scenario | Load | Measure |
|---|---:|---|
| Mini App smoke | 10 concurrent users, 10 min | p50/p95/p99, 5xx, DB pool wait |
| Normal peak | 50 concurrent users | RSS/CPU, rows/query, PG latency |
| Growth | 100 concurrent users | pool saturation, timeouts, state payload MB |
| Telegram burst | 500 concurrent webhook POST | ack latency, duplicates/loss, inbox backlog |
| Redis outage | Above tests + Redis down | fallback latency/RSS/bucket count |
| DB restart | 50 webhook during staging restart | accepted/retried/lost/duplicate invariant |

Stop criteria:

- any duplicate/lost committed financial operation;
- webhook non-image p95 > 2s before queue architecture;
- state p95 > agreed SLO (recommend 1s warm);
- pool wait > 20% requests;
- 5xx > 1%;
- RSS monotonically grows after load ends.

Metrics: request duration/phase, event-loop lag, RSS/heap, pool total/idle/waiting,
PG active/locks/deadlocks/statement latency, Redis latency/errors, Telegram API
status, pending update count, queue depth, restart count.

---

## 13. BACKUP / DR PLAN

Current status: **UNKNOWN / HIGH finding**.

Recommended target before public production:

- RPO: ≤ 15 min (PITR/WAL); RTO: documented and drill-proven;
- Railway scheduled volume backup;
- PITR enabled and archiver health alert;
- encrypted offsite `pg_dump`;
- quarterly restore into separate staging service;
- restore verification: schema migration journal, user count, active/deleted
  transaction counts, per-user/per-currency sums, debt remaining, plan counters,
  FK/check constraints, app health and a real test mutation.

Production DB’ga `DROP/TRUNCATE/reset` ishlatilmasin.

---

## 14. CODE CHANGES PREPARED IN THIS BRANCH

1. Webhook pre-claim internal failures now 500; malformed JSON only gets 200.
2. Webhook claim-release secondary failure is visible.
3. Payment-schedule DB errors are no longer reported as duplicate success.
4. Mini App idempotency keeps ambiguous claims, reuses key, returns completed replay success, and expires exact keys safely.
5. Idempotency coverage expanded to account/category/budget.
6. PostgreSQL idle pool error listener added with secret-safe diagnostics.
7. New-user create race removed; bootstrap is row-locked and transactional with repair.
8. Debt edit/cancel optimistic financial guards added.
9. Image draft persistence + intake transition made atomic.
10. Redis reconnect/circuit and memory fallback bounded.
11. Raw DB error messages removed from audit/security fallback logs.
12. Telegram initData query transport removed; webhook secret compare timing-safe.
13. Secret gitignore and startup secret length/charset checks added.
14. Drizzle latest snapshot restored; migration drift regression added.
15. Incorrect healthcheck restart RCA documentation corrected.
16. Reliability regression tests added.
17. Ledger currency is now immutable; new mixed-currency posting is blocked and totals are currency-scoped with legacy mismatch alerts.
18. Generic transaction creation can no longer bypass CAS-protected plan pay/receive actions.
19. A production-safety GitHub Actions template is prepared for migrations, real PostgreSQL integration suites, Redis, lint, typecheck, build, and production audit; activation requires maintainer workflow permission.
20. Mutation/webhook JSON bodies now use a streaming byte limit, so missing or forged Content-Length cannot bypass payload caps.
21. Unauthenticated rejection floods are rate-limited before persistence and security-event DB writes are globally sampled.
22. Migration runner now fails closed on edited applied SQL hashes and historical ordering gaps.
23. Idempotency keys are bound to a SHA-256 request hash through a safe additive migration; payload-mismatched key reuse is rejected.
24. Financial category references now enforce owner, active state, income/expense direction, and valid root-parent depth in the service layer.
25. Nullable all-category budget upserts are serialized with a transaction advisory lock and existing duplicates fail closed.
26. Three database suites were executed on disposable PostgreSQL 18; stale copy assertions and a fixed-date expected-income test were corrected, yielding 22/22 pass.
27. New route/database integration coverage proves exact-once same-key replay, payload-mismatch rejection, currency/category/plan fail-closed guards, and concurrent NULL-budget uniqueness.

**Muhim:** branch `origin/main` bilan merge qilingan; uni eski `06bfd` SHA sifatida
bevosita deploy qilib keyingi UI/credit fixlarni rollback qilish xavfi yo‘q.
Baribir production faqat reviewed PR merge orqali deploy qilinsin.

---

## 15. VERIFICATION RESULT

```text
lint:                     PASS
typecheck:                PASS
unit/regression tests:    PASS 405 / 408 (3 conditional skips in no-DB run)
DB integration tests:     PASS 22 / 22 on disposable PostgreSQL 18
security/reliability:      PASS (pure/static); live route test pending
build:                    PASS with syntactic build DATABASE_URL
migration metadata drift: PASS (“No schema changes”)
script syntax:            PASS
circular dependencies:    NONE FOUND
production dependency CVE: NONE FOUND by npm audit
live startup/health:       UNKNOWN
production webhook:        UNKNOWN
production DB verification:UNKNOWN
```

---

# 16. TOTAL FINDINGS

```text
TOTAL FINDINGS: 38

CRITICAL: 4
HIGH: 14
MEDIUM: 13
LOW: 5
INFO: 2
```

Counts barcha topilmalarni, jumladan branch’da fix qilingan, lekin production’da
hali deploy qilinmagan holatlarni ham o‘z ichiga oladi.

## TOP 10 RISKS

1. `C-003` — currency dimension yo‘q, accounting totals noto‘g‘ri.
2. `C-002` — ambiguous mutation idempotency (branch’da safety fix, production pending).
3. `C-001` — DB outage’da webhook update loss (branch’da fixed, production pending).
4. `C-004` — schedule DB error false duplicate (branch’da fixed, production pending).
5. `H-014` — repeated unclean Postgres recovery, trigger unknown.
6. `H-001` — webhook durable inbox/status/lease yo‘q.
7. `H-002` — synchronous webhook va Telegram outbox yo‘q.
8. `H-005` — JS number monetary aggregation.
9. `H-009` — unbounded state build va DB pool saturation.
10. `H-012` — backup restore proofi yo‘q.

## ROOT CAUSE MAP

```text
Missing durable inbox/outbox
 ├─ webhook long processing
 ├─ Telegram send failure silently consumed
 ├─ stale update/draft/image processing claims
 └─ restart recovery ambiguity

Accounting model gaps
 ├─ currency is label, not dimension
 ├─ JS number aggregation
 ├─ deployed baseline’da generic va dedicated plan write paths (branch’da contained)
 └─ DB constraints do not encode all tenant/business invariants

Operational maturity gaps
 ├─ no CI-enforced real DB tests
 ├─ no continuous metrics/tracing/alerts
 ├─ no proven restore drill
 └─ Railway runtime evidence unavailable

Postgres abrupt restart
 ├─ connection reset/refused
 ├─ app pool idle error (branch fixed)
 ├─ webhook internal error
 ├─ claim-release failure → update stuck
 └─ security-event DB write failure → fallback-only observability
```

---

## 17. REMEDIATION ROADMAP

### PHASE 0 — SAFETY (today)

1. Production backup/PITR statusni tekshirish; isolated restore drill boshlash.
2. Postgres incident UTC timeline, exit reason va resource graphsni yig‘ish.
3. Production currency inventory va mixed-currency query bajarish.
4. Branch safety fixlarini stagingda real Postgres/Redis bilan tekshirish.
5. Production deploydan oldin rollback SHA va DB forward-only plan tayyorlash.

### PHASE 1 — CRITICAL (1–2 days)

1. C-001/C-002/C-004/H-003/H-004/H-006 fixlarini deploy qilish.
2. Branch’dagi currency containmentni deploy qilish va legacy mixed-currency inventoryni tekshirish.
3. Generic transaction plan-ID rejectionni deploy qilib, dedicated CAS pathlarni production smoke-test qilish.
4. Alertlar: DB unavailable, webhook 5xx, claim release failed, security event fallback.

### PHASE 2 — HIGH (1 week)

1. Telegram durable inbox + worker + outbox.
2. `processing` lease/reconciliation job.
3. `/api/state` DB aggregates + pagination.
4. Notification paginated durable dispatcher.
5. CI Postgres/Redis va mandatory DB suites.
6. Money minor-unit/Decimal migration design va shadow calculation.

### PHASE 3 — MEDIUM (2–4 weeks)

1. Composite tenant constraints, unique occurrences, NULL-safe budget unique.
2. Security/audit retention, partitioning, independent sink.
3. Timezone/user model.
4. Trusted proxy/auth replay/deep-health hardening.
5. Migration runner drift protocol.

### PHASE 4 — LOW

1. Split finance/mutation/plans modules.
2. Remove dead exports/duplication.
3. Reproducible container digest/SBOM.
4. Root README/runbook and config naming cleanup.

### PHASE 5 — HARDENING

1. Quarterly restore and chaos drills.
2. 10/50/100/500 load suite.
3. SLOs and dashboards.
4. External penetration test and privacy review.

---

## 18. SAFE DEPLOY + POST-DEPLOY VERIFICATION

### Pre-deploy

1. PR’ni current `main`ga merge qiling; eski SHA’ni bevosita deploy qilmang.
2. Staging’da migrations + 3 DB suite + reliability tests.
3. Read-only data checks: duplicate occurrences, NULL budgets, mixed currency,
   partial users, stuck processing claims.
4. Backup timestamp/PITR archiver statusni yozib oling.

### Deploy

1. Railway preDeploy migration logini kuzating.
2. New app deployment readiness 200 bo‘lsin.
3. Old deploymentni rollback uchun saqlang.
4. Faqat backward-compatible nullable `idempotency_keys.request_hash` column migrationi bor; staging backup/testdan keyin apply qiling. Old app columnni e’tiborsiz qoldirgani uchun app rollback riski past.

### Post-deploy

1. `/api/health` va `/api/health/live` tekshirish.
2. Valid Telegram text update va duplicate update_id yuborish.
3. Staging/controlled user bilan expense create; response-loss replayda bitta row ekanini tekshirish.
4. Debt pay/edit conflict va schedule confirm smoke.
5. Redisni stagingda vaqtincha uzib fallback/recoveryni ko‘rish.
6. Postgres staging restartida 500→retry→exactly-one outcome.
7. Loglarda secret/url yo‘qligi va yangi events borligini tekshirish.
8. 24 soat: webhook 5xx, pending updates, DB latency/connections, memory/CPU,
   restarts va `security_event_write_failed` alertlarini kuzatish.

---

# 19. FINAL HEALTH

Production’da branch fixlari hali deploy qilinmagani va DB restart trigger/backup
holati isbotlanmagani sabab konservativ baho:

```text
PRODUCTION HEALTH:
UNSAFE

DATABASE HEALTH:
AT RISK

ACCOUNTING INTEGRITY:
AT RISK

SECURITY:
DEGRADED

WEBHOOK:
DEGRADED

DEPLOYMENT:
NEEDS HARDENING
```

Branch fixlari staging + production verificationdan o‘tgach ham currency model,
durable webhook inbox/outbox, real DB concurrency tests va restore proofi
bajarilmaguncha umumiy holat `SAFE` deb belgilanmasin.
