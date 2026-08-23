# Hisobchi — Senior Audit va Optimallashtirish Rejasi

> **2026-08-23 forensic correction:** bu hujjatdagi “healthcheck restart-loop
> aniqlandi” xulosasi runtime loglari bilan tasdiqlanmagan. Railway HTTP
> healthcheck'i deploy vaqtida ishlaydi; u continuous monitor emas. Docker
> `HEALTHCHECK` esa o'zi restart siyosati emas. Endpointni yengillashtirish foydali
> hardening bo'lsa-da, uni production restartlarining tasdiqlangan root cause'i
> deb bo'lmaydi. To'liq evidence/severity tahlili:
> [`PRODUCTION-FORENSIC-AUDIT.md`](./PRODUCTION-FORENSIC-AUDIT.md).

Sana: 2026-08-22. Muammo: **"loyiha uxlab qolyapti"** — bot/Mini App birinchi
murojaatda javob bermaydi yoki juda sekin uyg'onadi.

---

## 1. Diagnoz — nega "uxlab qolyapti"

Kodni to'liq o'rganib chiqib, uch mustaqil sabab aniqlandi. Uchchalasi ham
tashqaridan bir xil ko'rinadi ("bot o'lik"), lekin davosi har xil:

### 1.1. Og'ir health endpoint (kodda edi, yengillashtirildi; restart RCA EMAS)

`railway.json` va Docker `HEALTHCHECK` ikkalasi ham `/api/health` ni so'rar
edi. Bu endpoint Telegram Bot API'ga ikkita tashqi so'rov yuboradi va Redis'ni
tekshiradi; uni yengillashtirish deploy readiness va health signalini tashqi
servis latency'sidan ajratdi.

Lekin oldingi “3 fail → Railway production konteyneri restart bo'ladi” zanjiri
repository yoki runtime log bilan isbotlanmagan. Railway HTTP healthcheck'i yangi
deploymentni faollashtirish vaqtida ishlaydi, continuous monitor emas; Docker
`HEALTHCHECK` ham yolg'iz o'zi restart policy emas. Shuning uchun bu change
**hardening**, production restartining tasdiqlangan root cause'i emas.

### 1.2. Railway App Sleeping / tarif (infra — Railway panelda tekshiriladi)

Railway'da **App Sleeping** yoqilgan bo'lsa, trafik bo'lmaganda servis
uxlatiladi. Webhook-bot uchun bu halokat: Telegram xabarni sovuq konteynerga
uradi, birinchi javob 10–30 s kechikadi yoki delivery fail bo'ladi.
Shuningdek Free/Trial tarifda kredit tugasa servis to'xtaydi — bu ham
"uxlash"ga o'xshaydi.

### 1.3. Og'ir so'rovlar tufayli "sekin uyg'onish" tuyg'usi (kod arxitekturasi)

`/api/state` har chaqiruvda foydalanuvchining **BUTUN tranzaksiya tarixini**
(`transactions` jadvalidan LIMIT'siz) o'qiydi va `finance.ts` (2010 qator)
ichida 180 kunlik forecast, analytics, health-score — hammasini qayta
hisoblaydi. Ma'lumot ko'paygan sari bu chiziqli sekinlashadi; Mini App ochilishi
"uxlab qolgandek" uzoq davom etadi.

---

## 2. Ushbu branch'da QILINGAN tuzatishlar

| # | O'zgarish | Fayl |
|---|---|---|
| 1 | Yangi yengil **deployment readiness** endpoint `/api/health/live` — process + `SELECT 1` (DB), Telegram/Redis'ga chiqmaydi | `src/app/api/health/live/route.ts` (yangi) |
| 2 | Railway healthcheck va Docker HEALTHCHECK endi `/api/health/live` ni so'raydi; bu tashqi dependency latency'sini health signalidan ajratadi | `railway.json`, `Dockerfile` |
| 3 | `"sleepApplication": false` — Railway config-as-code darajasida uxlash taqiqlandi | `railway.json` |
| 4 | `telegramHealth()` natijasi **60 s kesh**lanadi (in-flight dedup bilan) — `/api/health` ni dashboard poll qilsa ham Bot API'ga so'rovlar to'planmaydi. Xato natija keshlanmaydi | `src/lib/telegram.ts` |
| 5 | Hujjat: liveness vs deep-diagnostics farqi, App Sleeping tekshiruv checklisti | `RAILWAY_DEPLOYMENT.md` |

Tekshirildi: `tsc --noEmit` ✅, `eslint` ✅, `npm test` (360/360) ✅,
`next build` ✅ (`/api/health/live` route'da ko'rinadi).

### Deploy'dan keyin operator qiladigan 3 qadam (kod bilan hal bo'lmaydi)

1. Railway service → **Settings → App Sleeping** → **Disabled** ekanini
   tasdiqlash.
2. Servis **always-on ruxsat beradigan tarifda** ekanini tekshirish (Trial
   kredit tugagan bo'lsa — bu asosiy sabab bo'lishi mumkin).
3. `Deployments → Logs`, runtime exit code va resource graphlarini bir xil UTC
   timestamp bo'yicha tekshirish. Healthcheck failure'ni restart sababi deb
   faqat platform event/log buni ko'rsatsa belgilash.

---

## 3. Optimallashtirish rejasi (ustuvorlik bo'yicha)

### P0 — Barqarorlik (keyingi sprint)

**3.1. `/api/state` payload'ini chegaralash.**
Hozir `buildAppState` LIMIT'siz butun ledgerni tortadi va to'liq
`transactions: TxView[]` ni klientga jo'natadi. Reja:
- Balans/analitika uchun to'liq ledger kerak bo'lgan joyda SQL'da agregatsiya
  qilish (`SUM ... GROUP BY account_id`, oy kesimlari) — satrlarni Node'ga
  tashimasdan;
- Klientga faqat oxirgi N (masalan 200) tranzaksiya + `/api/transactions?before=`
  pagination endpoint;
- `tx_user_date_idx` allaqachon bor — index tayyor, faqat query'ni o'zgartirish
  kerak.

**3.2. Texnik jadvallar uchun cleanup job.**
`telegram_updates` va `idempotency_keys` (24 h TTL yozilyapti, lekin **hech kim
o'chirmayapti**) cheksiz o'sadi. Notification cron allaqachon bor — o'sha
route oxirida `DELETE ... WHERE expires_at < now()` va
`DELETE FROM telegram_updates WHERE created_at < now() - interval '7 days'`
qo'shish kifoya. `idempotency_expires_idx` mavjud.

**3.3. Notification dispatcher'ni parallellash.**
`/api/telegram/notifications` 1000 tagacha foydalanuvchi uchun **ketma-ket**
`buildAppState` (eng og'ir funksiya!) chaqiradi. Foydalanuvchi ko'paysa cron
bir soatga cho'zilib, HTTP timeout'ga uchraydi. Reja: 5–10 talik batch'larda
`Promise.allSettled`, umumiy deadline (masalan 4 min), qolganini keyingi
cron'ga qoldirish (Redis cursor).

### P1 — Tezlik

**3.4. `buildAppState` natijasini qisqa keshlash.**
Bir foydalanuvchi Mini App'ni ochganda focus/visibility/pageshow hodisalari
sabab bir necha sekund ichida bir xil state qayta quriladi (klientda 1.2 s
dedup bor, lekin server tomonda yo'q). Redis'da `pfos:state:{userId}` ni
15–30 s TTL bilan saqlash, har `runMutation` muvaffaqiyatida invalidatsiya
qilish. Bot ↔ Mini App sinxronligi buzilmaydi, DB yuki keskin kamayadi.

**3.5. `bootstrapNewUser` — N+1 insert.**
Yangi foydalanuvchi uchun kategoriya daraxti bittalab INSERT qilinadi
(~40+ round-trip) — birinchi `/start` sekin. Parent'larni bitta batch,
child'larni bitta batch qilib 2–3 so'rovga tushirish.

**3.6. Webhook'da og'ir ishni javobdan ajratish.**
Rasm pipeline'i (`processImageMessage`: download + vision + DB) Telegram
webhook javobini ushlab turadi. Telegram 60 s kutadi, lekin sekin javob
`pending_update_count` o'sishiga olib keladi. Reja: avval `IMAGE_RECEIVED`
ack yuborib 200 qaytarish, extract'ni `after`-ish fon vazifasiga o'tkazish
(yoki Redis queue + cron worker).

### P2 — Kod salomatligi

**3.7. `finance.ts` (2010 qator) va `mutations.ts` (1748 qator) ni bo'lish.**
`finance/balances.ts`, `finance/forecast.ts`, `finance/analytics.ts`,
`finance/health.ts` modullariga ajratish — test yozish va review osonlashadi
(hozirgi 362 test xavfsiz refactor uchun yaxshi to'r).

**3.8. Klient bundle.**
Barcha sahifalar `"use client"`; `plans/page.tsx` 1735 qator. Route-level
code-splitting Next'da avtomatik, lekin og'ir grafik komponentlarni
(`charts.tsx`) `next/dynamic` bilan lazy qilish first-paint'ni yengillashtiradi.

**3.9. Kuzatuv (observability).**
`/api/state` va webhook uchun davomiylik logi (requestId bilan, p95 ni
kuzatish). "Sekin" degan shikoyat kelganda taxmin emas, o'lchov bo'ladi.

---

## 4. Xulosa

Og'ir `/api/health` dependency'si yengillashtirildi, lekin “uxlab qolish”ning
production root cause'i runtime exit/resource/deployment loglarisiz
**UNKNOWN / NEEDS VERIFICATION**. App Sleeping, tarif, process exit va Postgres
restart vaqtlarini bir timeline'da tekshirish shart. Keyingi P0 bandlari (state
payload, cleanup, dispatcher) tizimni foydalanuvchi soni o'sganda barqaror
ushlab turadi.
