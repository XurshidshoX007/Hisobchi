# Hisobchi — Senior Audit va Optimallashtirish Rejasi

Sana: 2026-08-22. Muammo: **"loyiha uxlab qolyapti"** — bot/Mini App birinchi
murojaatda javob bermaydi yoki juda sekin uyg'onadi.

---

## 1. Diagnoz — nega "uxlab qolyapti"

Kodni to'liq o'rganib chiqib, uch mustaqil sabab aniqlandi. Uchchalasi ham
tashqaridan bir xil ko'rinadi ("bot o'lik"), lekin davosi har xil:

### 1.1. Healthcheck restart-loop (eng xavflisi — kodda edi, TUZATILDI)

`railway.json` va `Dockerfile` HEALTHCHECK ikkalasi ham `/api/health` ni
so'rar edi. Bu endpoint har chaqiruvda **Telegram Bot API'ga ikkita tashqi
so'rov** yuboradi (`getMe` + `getWebhookInfo`, har biri 2.5 s timeout) hamda
Redis ping qiladi. Docker HEALTHCHECK timeout'i esa 5 sekund:

- Telegram API sekinlashsa yoki tarmoq titrasa → probe 5 s ichida ulgurmaydi;
- 3 marta ketma-ket fail → konteyner **restart** bo'ladi;
- restart paytida kelgan webhook update'lar yo'qoladi/kechikadi;
- foydalanuvchi uchun bu xuddi "uxlab qolgan" bot.

Sog'lom konteynerning taqdiri tashqi servisning (api.telegram.org) kayfiyatiga
bog'lab qo'yilgan edi — bu liveness-probe antipatterni.

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
| 1 | Yangi **minimal liveness endpoint** `/api/health/live` — faqat process + `SELECT 1` (DB). Telegram/Redis'ga chiqmaydi, millisekundlarda javob beradi | `src/app/api/health/live/route.ts` (yangi) |
| 2 | Railway healthcheck va Docker HEALTHCHECK endi `/api/health/live` ni so'raydi — restart qarori faqat shu yengil probe asosida | `railway.json`, `Dockerfile` |
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
3. `Deployments → Logs`da restart-loop bor-yo'qligini ko'rish — eski
   deploy'larda healthcheck-fail restartlari ko'ringan bo'lishi kerak; yangi
   deploy'dan keyin yo'qolishi lozim.

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

"Uxlab qolish"ning kod ichidagi ildizi — og'ir `/api/health`ga bog'langan
restart-loop — **shu branch'da tuzatildi**. Infra tomondan App Sleeping va
tarif holatini Railway panelda bir marta tekshirish shart (2-bo'lim, 3 qadam).
Keyingi bosqichda P0 bandlari (state payload, cleanup, dispatcher) tizimni
foydalanuvchi soni o'sganda ham barqaror ushlab turadi.
