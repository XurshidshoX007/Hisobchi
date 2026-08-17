# HISOBCHI — UI COPY & TERMINOLOGY AUDIT

Presentation/copy layer only. **No finance logic, formula, schema or mutation
behaviour was changed.**

Commit: `4cbef6e`

---

## 1. Audited screens

| Surface | Screen / file | Result |
|---|---|---|
| Mini App | Dashboard (`app/page.tsx`) | changed |
| Mini App | Tarix (`app/transactions/page.tsx`) | changed |
| Mini App | Reja — To‘lovlar / Daromad / Pul oqimi (`app/plans/page.tsx`) | changed |
| Mini App | Tahlil (`app/analytics/page.tsx`) | changed |
| Mini App | Menyu (`app/more/page.tsx`) | changed |
| Mini App | Hisoblar + Kategoriyalar (`app/accounts/page.tsx`) | changed |
| Mini App | Budjetlar (`app/budgets/page.tsx`) | changed |
| Mini App | Qarzdorlik (`app/debts/page.tsx`) | changed |
| Mini App | Maqsadlar (`app/goals/page.tsx`) | changed |
| Mini App | Sozlamalar (`app/settings/page.tsx`) | changed |
| Mini App | Telegram bot sahifasi (`app/bot/page.tsx`) | changed |
| Chrome | App shell, bottom nav, sidebar, eslatmalar drawer | changed |
| Components | Sheet / modal, empty state, badge, button, filter, form kit, quick-add, plan summary, charts | changed |
| Bot | `lib/bot.ts` (keyboard + all reply blocks), `lib/bot-routing.ts`, webhook confirmations | changed |
| System | Toasts, error banners, alerts & notifications (`lib/state.ts`), server messages (`lib/mutations.ts`), image-flow acks | changed |

---

## 2 & 3. Old → New terminology table

### Dashboard (the requested removals)

| Old | New |
|---|---|
| `REAL · Joriy real balans` | **Balans** |
| `REAL · Oy yopilish real balansi` | **Oy yopilishi** |
| `REAL · Prognoz ochilish balansi` | **Ochilish balansi** |
| `Bu oy · daromad` | **Daromad** |
| `Bu oy · xarajat` | **Xarajat** |
| `PROGNOZ · Real yopilish balansi` | **Yopilish** |
| `PROGNOZ · Oy oxiri prognozi` | **Oy oxiri prognozi** |
| `Safe-to-Spend` | **Sarflash mumkin** |
| `Majburiyatlardan keyin xavfsiz` (sub-label) | *removed — the card title already says it* |
| `Bugungi global balans bilan aralashtirilmagan` | *removed* |
| `REAL · amalga oshgan` | **Bajarilgan** |
| `PROGNOZ · qayd etilgan` | **Prognoz** |
| `REJA · taxminiy / aniq / majburiy / ixtiyoriy` | **Reja · taxminiy / aniq / majburiy / ixtiyoriy** |
| `— REAL` / `— PROGNOZ` (chart legend) | **— Real** / **— Prognoz** |
| `Tarixiy real natija` / `Kelajak rejasi` | **O‘tgan oy** / **Kelasi oy** |
| `min / baza / max` | **min / o‘rta / max** |

### Global finance terminology

| Concept | Old (mixed) | New (single term) |
|---|---|---|
| Income | Kirim, kirim, Daromad | **Daromad** |
| Expense | Chiqim, chiqim, Xarajat | **Xarajat** |
| Balance | Joriy balans, REAL BALANS, Haqiqiy balans | **Balans** |
| Net | Sof, sof, Sof qoldiq, Sof holat | **Sof** |
| Forecast | Prognoz, Prognoz yakun, Forecast | **Prognoz** |
| Expected income | Kutilayotgan / Kutilgan / Aniq kutilmoqda | **Kutilayotgan daromad** |
| Cash flow | Cash-flow | **Pul oqimi** |
| Safe-to-spend | Safe-to-Spend, safe-to-spend, Xavfsiz sarflash | **Sarflash mumkin** |
| Payment | To‘lov | **To‘lov** |
| Plan | Reja va prognoz, Reja | **Reja** |
| Debt | Qarzdorlik | **Qarzdorlik** |
| History | Operatsiyalar, Tarix | **Tarix** |
| Filter | Filtr | **Filtr** |
| Total | Jami | **Jami** |
| Recurring | Doimiy | **Doimiy** |
| Term | Muddatli | **Muddatli** |
| Theme | Dark mode / Light mode / System | **Tungi / Kunduzgi / Tizim** |
| Product name | Moliya OS / Personal Finance | **Hisobchi / Shaxsiy moliya** |

All of the above are centralised in **`src/lib/copy.ts`** (`TERMS`, `TX_LABEL`,
`STATUS_LABEL`, `PLAN_TYPE_LABEL`, `LOADING`, `ERRORS`) — one dictionary shared
by the Mini App and the bot.

### Buttons / CTAs (§8)

| Old | New |
|---|---|
| `Rejani yaratish` / `Daromadni qo‘shish` / `Qarzni saqlash` / `Maqsadni saqlash` / `Budjetni saqlash` / `Hisobni saqlash` / `Kategoriyani saqlash` / `To‘lovni qayd etish` / `Jamg‘armani qo‘shish` | **Saqlash** (one verb, sheet title states the entity) |
| `Kirim qo‘shish` / `Chiqim qo‘shish` (sheet titles) | **+ Daromad** / **+ Xarajat** / **+ Transfer** |
| `To‘lov rejasi` / `Kutilayotgan daromad` | **+ To‘lov** / **+ Daromad** |
| `Yangi hisob` / `Yangi kategoriya` / `Yangi qarz` / `Yangi budjet` / `Yangi maqsad` | **+ Hisob / + Kategoriya / + Qarz / + Budjet / + Maqsad** |
| `Barchasini o‘qilgan deb belgilash` | **Hammasini o‘qilgan qilish** |
| `Barchasini tasdiqlash` / `Ha, qo‘sh` | **Tasdiqlash** |
| `Faol rejalarga qaytish` | **Faol rejalar** |
| `Bosh sahifaga qaytish` | **Asosiy sahifa** |
| `tahrir` / `yashir` / `ko‘rsat` | **Tahrir / Yashirish / Ko‘rsatish** |

### Status & badge copy (§9, §18)

`Kutilmoqda · Bajarilgan · To‘langan · Bekor qilingan · Xatolik · Qayta ishlanmoqda`
are now defined once in `STATUS_LABEL`. Plan lifecycle keeps its own four
authoritative words (`Faol · Pauza · Yakunlangan · Bekor qilingan`).

Badges normalised to sentence case: `noaktiv → Noaktiv`, `majburiy → Majburiy`,
`ixtiyoriy → Ixtiyoriy`, `taxminiy → Taxminiy`, `aniq → Aniq`,
`o‘qilgan/yangi → O‘qilgan/Yangi`, `rejada/ortda → Rejada/Ortda`,
`barqaror → Barqaror`, `arxiv hisob → Arxiv`.

Long history badges shortened: `Reja to‘lovi → To‘lov`,
`Kutilgan daromad → Reja`, `Kelajak sana → Kelajak`.

### Error messages (§12)

| Old | New |
|---|---|
| `Ma'lumotlarni yuklab bo'lmadi. Sahifani yangilang.` | `Ma’lumotlar yuklanmadi. Qayta urinib ko‘ring.` |
| `Ulanish xatosi. Internetni tekshirib qayta urinib ko'ring.` | `Ulanish yo‘q. Internetni tekshirib, qayta urinib ko‘ring.` |
| `So'rov bajarilmoqda, kuting…` | `Oldingi amal saqlanmoqda…` |
| `Xatolik` (generic toast fallback) | `Saqlab bo‘lmadi. Qayta urinib ko‘ring.` |
| `Noma'lum yoki ruxsat etilmagan amal` / `Noma'lum modul` / `Noma'lum amal` | `Bu amalni bajarib bo‘lmadi` |
| `ID kerak` | `Yozuv tanlanmadi` |
| `Ma'lumot noto'g'ri` | `Ma’lumot noto‘g‘ri. Tekshirib qayta urinib ko‘ring.` |
| `Ma'lumot to'liq emas` | `Ma’lumot to‘liq emas. Barcha maydonlarni to‘ldiring.` |
| `Faol hisob topilmadi — Hisoblar bo'limida kamida bitta hisobni faollashtiring` | `Faol hisob yo‘q. Hisoblar bo‘limida bitta hisobni faollashtiring.` |
| `Reja to'lovi chiqim bo'lib qolishi kerak` | `Reja to‘lovi xarajat bo‘lib qolishi kerak` |
| `⚠️ Ulanish xatosi.` (bot console) | shared `ERRORS.connection` |

### Empty states (§13)

| Old | New |
|---|---|
| `Operatsiya topilmadi` + `Yangi operatsiyalarni Dashboard orqali kiriting.` | `Tarix hozircha bo‘sh.` + `Operatsiyalar Asosiy sahifada kiritiladi.` |
| `Faol reja yo‘q` + `Ijara, kommunal, kredit kabi takrorlanuvchi to‘lovlarni…` | `Rejalashtirilgan to‘lovlar yo‘q.` + `Pastdagi + tugmasi orqali to‘lov rejasini qo‘shing.` |
| `Faol daromad rejasi yo‘q` + `Keladigan daromadni … cash-flow uni hisobga oladi.` | `Daromadlar hali kiritilmagan.` + `Pastdagi + tugmasi orqali kutilayotgan daromadni qo‘shing.` |
| `Faol to‘lov rejasi yo‘q.` (plan summary) | `Rejalashtirilgan to‘lovlar yo‘q.` |
| `Bu oyda ochiq to‘lov qolmadi.` | `Ochiq to‘lov yo‘q.` |
| `Bu oyda rejalashtirilgan hodisa yo‘q.` | `Rejalashtirilgan to‘lovlar yo‘q.` |
| `Bu oyda pul yetishmasligi xavfi aniqlanmadi (butun 180 kunlik prognoz tekshirildi).` | `Xavf aniqlanmadi.` |
| `Budjet yo‘q` / `Qarzlar yo‘q` / `Maqsadlar yo‘q` / `Hisoblar yo‘q` | `… yo‘q.` + `Pastdagi + tugmasi orqali … qo‘shing.` |
| `Faol qarz yo‘q — yaxshi holat.` | `Qarz yo‘q.` |

### Loading states (§14)

Centralised in `LOADING`: `Yuklanmoqda…`, `Saqlanmoqda…`, `Tahlil qilinmoqda…`,
`O‘chirilmoqda…`. Bot console `yozilmoqda…` → `Yuklanmoqda…`.

---

## 4. Removed duplicate texts (§15)

Every removal below was a label repeating something already visible **in the
same viewport**:

* Dashboard hero — `REAL ·` / `PROGNOZ ·` prefixes: the card *is* the balance/
  forecast surface.
* Dashboard hero — `Bu oy ·` prefixes: the month switcher directly above states
  the month.
* Dashboard hero — `Bugungi global balans bilan aralashtirilmagan` (the month
  switcher already communicates "not the current month").
* Dashboard — `Majburiyatlardan keyin xavfsiz` under the "Sarflash mumkin"
  title (same sentence twice).
* Dashboard — `hint="REJA tomoni · to‘liq ro‘yxat Rejalarda"` next to a
  `Rejalar →` link that says exactly that.
* Dashboard — `sr-only` heading `Oylik asosiy ko‘rsatkichlar` duplicating the
  visible section title `Oylik xulosa`.
* Dashboard — `hint` on "Keyingi muhim voqealar" repeating the month + count.
* Tarix — subtitle `Real pul harakatlari` (the page title says Tarix).
* Tarix — footer paragraph `Muhim operatsiyalar o‘chirilmaydi — belgilanadi…`
  (the delete sheet explains it at the moment it matters).
* Tarix delete sheet — `Bu to‘lov tarixdan o‘chiriladi.` immediately above
  `Operatsiya tarixdan olib tashlanadi.`
* Reja — subtitle `Kelajakdagi majburiyatlar va kutilayotgan pullar markazi`.
* Reja → Daromad — badge `kutilmoqda` duplicated by the section label.
* Reja → Daromad — StatCard sub-captions `tasdiqlangan manbalar` /
  `diapazon o‘rtachasi` repeating `Aniq` / `Taxminiy`.
* Reja → Pul oqimi — `— to‘liq ro‘yxat To‘lovlar / Daromad tablarida` (the tabs
  are on screen).
* Sozlamalar — whole `Integratsiya` card (API endpoints — developer info, not
  user copy) and `Dark mode alohida dizayn tizimi asosida ishlaydi.`
* Sozlamalar — hint `Taxminiy daromadlar ehtiyotkorlik bilan hisoblanadi`
  duplicating the slider's own 0 %–100 % legend.
* App shell auth screen — the BotFather explanation paragraph.
* Bot page — `Bu sahifa simulator emas.` and the long capabilities prose.

---

## 5. Technical terms hidden from the UI (§11, §25)

| Internal identifier | Status | User-facing wording |
|---|---|---|
| `safeToSpend`, `safeToSpendParts`, `freeToSpend` | **INTERNAL ONLY** (unchanged) | "Sarflash mumkin" |
| `occurrence`, `occurrenceCount`, `nextOccurrenceDate` | **INTERNAL ONLY** | "Reja qayta ochiladi", "Takrorlanishlar soni" |
| `frequency` / "chastota" | **INTERNAL ONLY** | "Takrorlanish" |
| `baseAmount`, `installmentCount`, `installmentsPaid` | **INTERNAL ONLY** | "Summa", "Bo‘lib to‘lashlar soni" |
| `planType: recurring \| term \| one_time` | **INTERNAL ONLY** | "Doimiy / Muddatli / Bir martalik" |
| `CashFlowStrip`, `ForecastArea` (components) | **INTERNAL ONLY** | tab label "Pul oqimi" |
| `cashflow` (tab key) | **INTERNAL ONLY** | "Pul oqimi" |
| `GET /api/state`, `POST /api/mutate`, `POST /api/bot` badges | **REPLACE** → removed from Settings / Bot pages | — |
| `pending / completed / cancelled / paid / failed / processing` (DB) | **INTERNAL ONLY** | `STATUS_LABEL` dictionary |
| `Webhook`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | **REPLACE** → removed / rephrased | "Bot havolasi hozircha mavjud emas." |

Code identifiers were deliberately **not** renamed — only labels.

---

## 6. Bot / Mini App consistency

**Status: aligned.** Both read the same `src/lib/copy.ts`.

New bot keyboard (was → is):

```
💰 Kirim  💸 Chiqim  🔄 Transfer     →  💰 Daromad  💸 Xarajat  🔄 Transfer
📊 Hisobot  📅 Reja va prognoz       →  📊 Hisobot  📅 Reja
📌 Majburiy to'lovlar                →  📌 To‘lovlar
💵 Kutilayotgan daromadlar           →  💵 Kutilayotgan daromad
```

Reply blocks now use `Balans`, `Daromad`, `Xarajat`, `Sof`, `Prognoz`,
`Kutilayotgan daromad`, `Sarflash mumkin`, `Jami` — identical to the Mini App.

**Backwards compatibility:** keyboards already pinned in existing chats send the
old strings. `botIntent` still accepts `Kirim`, `Chiqim`,
`Majburiy to'lovlar`, `Reja va prognoz`, and now normalises `'`, `’`, `‘`, `ʻ`
apostrophes, so no existing chat breaks. Verified live against the running bot
endpoint for all 19 button variants.

---

## 7. Responsive issues found

No overflow or clipping was introduced — the change is net-shortening:

* Longest **removed** user-facing label: **110 chars**; longest **added**: **69**
  (a `<meta description>`, never rendered in a layout).
* Dashboard hero micro-labels are now ≤ 17 chars (`SARFLASH MUMKIN`,
  `OY OXIRI PROGNOZI`) vs. 22–26 before (`REAL · Joriy real balans`) — the
  two-column hero grid gets more breathing room at 320 px.
* Card/strip labels that share a row are now single words (`Daromad`,
  `Xarajat`, `Yopilish`, `Ochilish`) — the Pul oqimi 4-column strip and the
  plan metrics container query (`@min-[362px]:grid-cols-4`) fit comfortably.
* One genuinely long string was found and shortened during the audit:
  `"Yakunlangan. Tahrirlash uni qayta ochmaydi; bo‘lib to‘lashlar sonini
  oshirsangiz qolgan to‘lovlar davom etadi."` (110 chars, inflated the plan
  form's status box) → `"Yakunlangan. To‘lovlar soni oshirilsa, reja davom
  etadi."`.
* No geometry, class names, grid templates, `truncate`/`break-words` rules or
  container queries were touched, so the existing responsive guards
  (`tests/add-flow-responsive.test.ts`, `tests/ux-layout.test.ts` — 30+
  structural assertions on sheet width, horizontal scroll, touch targets,
  container queries) still hold and still pass.

**Verification limits (reported honestly):** the sandbox could not download a
headless browser (Playwright Chromium download is network-blocked), so no pixel
screenshots were captured. Instead: all 11 routes were rendered by a live dev
server against a real seeded Postgres (HTTP 200), the bot endpoint was exercised
end-to-end, and label lengths were audited programmatically old-vs-new.

### Number formatting (§17)

One formatting issue was found **and fixed** in the bot's `/start` summary — it
mixed `formatAmount` (`12 480 000`) and `compact` (`4 mln`) inside the same
block. It now uses full amounts throughout; `/report` and `/forecast` stay
compact throughout. Two artifacts also fixed: `Ixtiyoriy reja: -0` → `0`, and a
trailing space after `Eng past`.

---

## 8. Files changed (35)

**New:** `src/lib/copy.ts`

**Mini App pages:** `app/page.tsx`, `app/transactions/page.tsx`,
`app/plans/page.tsx`, `app/analytics/page.tsx`, `app/more/page.tsx`,
`app/accounts/page.tsx`, `app/budgets/page.tsx`, `app/debts/page.tsx`,
`app/goals/page.tsx`, `app/settings/page.tsx`, `app/bot/page.tsx`,
`app/layout.tsx`

**Components:** `app-shell.tsx`, `charts.tsx`, `form-kit.tsx`,
`providers.tsx`, `quick-add.tsx`,
`transaction-filter.tsx`, `ui.tsx`

**Lib:** `lib/bot.ts`, `lib/bot-routing.ts`, `lib/fab.ts`, `lib/form-kit.ts`,
`lib/mutations.ts`, `lib/state.ts`, `lib/image/draft-edit.ts`,
`lib/image/ux.ts`, `app/api/telegram/webhook/route.ts`

**Tests:** `add-flow.test.ts`, `fab-context.test.ts`, `form-kit.test.ts`,
`regressions.test.ts`, `ux-layout.test.ts`

**Untouched (business logic):** `lib/finance.ts`, `db/schema.ts`,
`lib/reconciliation.ts`, `drizzle/**` — 0 changes. `lib/mutations.ts` diff
contains **only** `message:` string literals.

---

## 9–12. Verification

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | **282 tests, 281 pass, 0 fail, 1 skipped (DB-only)** |
| Typecheck | `npm run typecheck` | **pass** |
| Lint | `npm run lint` | **pass, 0 warnings** |
| Build | `npm run build` | **pass — 13/13 routes generated** |
| Runtime | dev server + seeded Postgres | all 11 routes HTTP 200, bot replies verified |

Three new regression tests were added to keep the audit enforced:

1. *every bot keyboard button routes to a real intent* — no button may fall
   through to the NLP parser, and legacy Kirim/Chiqim keyboards keep working.
2. *Mini App and bot never mix synonyms for one concept* — fails on any
   user-facing `Kirim`/`Chiqim`/`Safe-to-Spend`/`Cash Flow` literal.
3. *the dashboard hero states each figure exactly once* — fails if
   `REAL ·`, `Joriy real balans`, `Bu oy · daromad`, `Bu oy · xarajat` return.

## 13. Commit SHA

`4cbef6e` on `arena/01a00c93-hisobchi` (pushed).

---

## Reported separately: no logic bugs found

Per §23, no label revealed an underlying finance-logic bug. The only
inconsistencies found were pure presentation (mixed number formatting and a
`-0` render in the bot forecast block) and were fixed in the copy layer without
touching any calculation.
