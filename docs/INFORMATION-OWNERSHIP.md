# Information Ownership Map — Design V2

> Yagona qoida: **"Bir fakt — bitta uy, ko‘p yengil reference."**
> Yangi card qo‘shishdan oldin shu jadvalni tekshiring: agar ma'lumotning
> PRIMARY uyi boshqa sahifada bo‘lsa — to‘liq card emas, compact reference
> (bir qatorli matn, badge yoki link) ishlating.

## 0. Baseline audit (o‘zgartirishdan OLDIN topilgan duplikatsiyalar)

| # | Duplikat | Qayerda takrorlangan edi | Qaror |
|---|----------|--------------------------|-------|
| 1 | `forecast.currentBalance` (katta raqam) | Dashboard hero, Desktop sidebar ("Umumiy balans" — katta), Accounts ("Umumiy balans" — mustaqil qayta hisoblangan!), Analytics "Balance History" (katta Money) | Dashboard = PRIMARY. Sidebar → bir qatorli reference-link. Accounts → canonical manbadan (forecast.currentBalance) compact ko‘rinishda. Analytics → katta raqam olib tashlandi, faqat chart qoldi. |
| 2 | `month.forecastClosingBase` (oy oxiri prognozi) | Dashboard hero PROGNOZ bloki + Dashboard "Oylik xulosa"dagi "Prognoz balans" tile (bitta sahifada 2 marta!) | Hero = PRIMARY. Summary'dagi takror tile olib tashlandi. |
| 3 | `realIncome / realExpense` | Dashboard hero ostidagi qator + Dashboard "Oylik xulosa"dagi 2 ta tile (bitta sahifada 2 marta) | Hero = PRIMARY. Summary endi faqat REJA tomonini ko‘rsatadi. |
| 4 | Risk | Dashboard hero badge ("🔴 … xavf") + to‘liq risk card (yonma-yon), Plans/Cash-flow "Xavf kunlari" card | Dashboard risk card = PRIMARY (bitta kuchli card). Hero badge olib tashlandi. Cash-flow'da risk faqat timeline kontekstida compact qatorlar + Dashboardga link. |
| 5 | Keyingi to‘lovlar ro‘yxati | Dashboard "Keyingi muhim voqealar" (5 ta), Plans (to‘liq), Cash-flow "Muhim sanalar" | Plans = PRIMARY (to‘liq ro‘yxat). Dashboard → faqat 3 ta voqea + "Rejalar →" link. Cash-flow → timeline event sifatida qoladi. |
| 6 | Qarzdorlik / Maqsadlar xulosasi | Debts/Goals sahifalari + More sahifasida to‘liq progress-cardlar | Debts/Goals = PRIMARY. More → link qatori ichida bir qatorli compact reference. |
| 7 | "Oylik trend" (oldingi oy bilan taqqoslash) | Dashboard "Oylik trend" card + Analytics (delta metrikalar) | Analytics = PRIMARY (interpretatsiya). Dashboard → bir qatorli insight + "Tahlil →" link. |
| 8 | Cash-flow stat grid | 6 ta StatCard, shundan "Bugungi balans" va "Oy oxiri prognoz" Dashboard hero'ni takrorlar edi | Bitta compact strip: Ochilish → Kirim → Chiqim → Yopilish (oy konteksti). Majburiy/Kutilayotgan tile'lar olib tashlandi (ular To‘lovlar/Daromad tablarining PRIMARY ma'lumoti). |
| 9 | Har bir to‘lov rejasi atrofida katta frame | Plans: har bir plan alohida katta Card (badge qatori, nested progress box, yillik yuklama…) | Yengil row'lar: nom + summa + sana + bitta CTA + "•••". Yillik yuklama faqat yuqoridagi stats gridda. |
| 10 | History'da har kun alohida Card | Transactions: har bir sana guruhi Card ichida | LIST FIRST: sana sarlavhasi + divider'li qatorlar, frame yo‘q. |

## 1. Ownership jadvali

| Ma'lumot / metrika | PRIMARY (uyi) | SECONDARY (kontekst) | REFERENCE (yengil) |
|---|---|---|---|
| `currentBalance` | **Dashboard hero** | Accounts (hisoblar taqsimoti sababli, canonical manbadan) | Sidebar bir qatorli link; Menu header compact; Settings STS formulasi qatori |
| Oy oxiri prognozi (`forecastClosingBase`) | **Dashboard hero** | Cash-flow "Yopilish" (oy konteksti) | — |
| Risk (`riskDates`, birinchi xavf kuni) | **Dashboard risk card** | Cash-flow timeline (sana qatori) | Notifications alert → Dashboard/Plans'ga link |
| Safe-to-Spend / Free-to-Spend | **Dashboard** | — | Settings'da formula izohi |
| REAL daromad/xarajat (bu oy) | **Dashboard hero** | Analytics (faqat delta/taqqoslash bilan) | — |
| Kutilayotgan daromad | **Plans → Daromad** | Dashboard summary (compact, REJA belgisi bilan) | Forecast ichki hisobda ishlatadi |
| Majburiy oylik yuk | **Plans → To‘lovlar (MonthLoadCard)** | Dashboard summary (compact) | — |
| To‘lov jadvali (to‘liq ro‘yxat) | **Plans** | Cash-flow "Muhim sanalar" (timeline) | Dashboard "Keyingi voqealar" (max 3) |
| Tranzaksiyalar (to‘liq tarix) | **History (/transactions)** | — | Plan kartadan `?plan=` filtri bilan link |
| Trend / taqqoslash / nisbatlar | **Analytics** | — | Dashboard bir qatorli insight + link |
| Kategoriya tahlili | **Analytics** | Budgets (limit konteksti) | — |
| Budjet limitlari | **Budgets** | — | — |
| Qarz balanslari | **Debts** | — | More link qatorida compact summa |
| Maqsadlar progressi | **Goals** | — | More link qatorida compact holat |
| Profil / mavzu / eslatmalar | **Menu (More) + header** | — | Sidebar tugmalar |
| Notifications | **Eslatmalar sheet (Menu qatlami)** | — | Alertlar Plans/Dashboardga link qiladi |

## 2. Hisoblash manbalari (logic dedup, §35)

- `forecast.currentBalance` — balansning YAGONA canonical hisobi
  (`src/lib/finance.ts`, faol hisoblar ledger yig‘indisi). UI hech qayerda
  balansni qayta hisoblamaydi (Accounts sahifasi ham endi shu manbani oladi).
- `month.forecastClosingBase`, `safeToSpend`, `riskDates` — faqat
  `buildForecast`/`buildMonthlyViews` ichida hisoblanadi.
- Sahifalar faqat o‘qiydi; hech bir page komponenti metrikani mustaqil
  qayta hisoblamaydi (faqat lokal filtr yig‘indilari — masalan History
  filtridagi jami — bunga kirmaydi, chunki u boshqa savolga javob beradi).

## 3. Komponent ierarxiyasi (§24)

- `Card` — faqat PRIMARY moliyaviy tushuncha uchun (hero, risk, STS,
  MonthLoadCard, asosiy chart).
- `Section` (`src/components/ui.tsx`) — frame'siz guruhlash: sarlavha +
  kontent. Ro‘yxatlar va ikkilamchi bloklar uchun.
- Row — `divide-y divide-line` ichidagi yengil qator (History, Plans
  ro‘yxati, More menyusi).

## 4. Har bir ekran qaysi savolga javob beradi

| Ekran | Savol |
|---|---|
| Dashboard | "Hozir moliyaviy ahvolim qanday va nimaga e'tibor beray?" |
| History | "Pul real qayerga ketdi / qayerdan keldi?" |
| Plans | "Oldinda qanday majburiyat va tushumlar bor?" |
| Cash-flow | "Qachon pulim kamayadi?" |
| Analytics | "Nega shunday bo‘lyapti, trend qanday?" |
| Budgets | "Limitlarim qay ahvolda?" |
| Debts / Goals | "Qarz/maqsad progressi qanday?" |
| More | "Ikkilamchi bo‘limlarga qanday o‘taman?" |
