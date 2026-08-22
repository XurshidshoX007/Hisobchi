# HISOBCHI — TELEGRAM BOT COPY (onboarding & core actions)

Copy/UX layer only. **No business logic, no routing, no `callback_data`, no
database or Mini App behaviour was changed.** Every reply-keyboard label that
`bot-routing.ts` matches on is unchanged, so pinned keyboards in existing chats
keep working.

Scope: `/start`, the three core actions (Daromad · Xarajat · Transfer), the
Mini App entry point, and the confirmation / error / help messages that sit on
the path between them.

---

## 1. CURRENT PROBLEM (audit of the copy that was there)

### 1.1 `/start` did not say what Hisobchi is

```
Salom, {name} 👋

Daromad, xarajat va transferni tabiiy tilda yozing:

„150 ming ovqatga ketdi“
„1,5 mln maosh keldi“
„2.5 mln ijara to'ladim“

💰 Balans: 0 so'm
📅 AVGUST
💵 Kutilayotgan daromad: 0
📌 Majburiy: -0
✨ Sarflash mumkin: 0
📊 Daromad +0 / Xarajat -0
🔮 Prognoz: 0
```

| Problem | Effect on the user |
|---|---|
| No sentence explains the product | The user learns the input *syntax* before learning what the bot is for |
| A 7-line finance block is pasted into the welcome | For a new account it is **seven zeroes** — the first impression is an empty report |
| `Kutilayotgan daromad`, `Majburiy`, `Sarflash mumkin`, `Prognoz` at first contact | Dashboard vocabulary before the first transaction exists; nothing to act on |
| The keyboard (💰/💸/🔄) is never mentioned in the text | Three buttons appear with no explanation of what they do |
| Three examples in a row | Reads like documentation, not like a person |
| CTA missing | The message ends on a number, not on an action |

### 1.2 The Mini App arrived as a weak afterthought

Second message: *“Mini Appda to'liq boshqaruv, reja va prognoz mavjud.”*
Button: `📱 Mini Appni ochish`

* “to‘liq boshqaruv” is a slogan — it names nothing the user recognises;
* “reja va prognoz” duplicates what `/forecast` already does **inside** the bot,
  so the Mini App looked like a duplicate rather than the place where hisoblar,
  budjet, qarzdorlik, maqsadlar and tahlil actually live.

### 1.3 Button prompts repeated the button

| Button | Old reply |
|---|---|
| `💰 Daromad` | “💰 **Daromad** summasi va manbasini yozing. Misol: …” |
| `💸 Xarajat` | “💸 **Xarajat** summasi va maqsadini yozing. Misol: …” |
| `🔄 Transfer` | “🔄 Summani va ikkala hisob nomini yozing. Misol: „Naqd puldan Humo hisobiga 200 ming o'tkazdim“.” |

The first word of every answer is the word the user just tapped, and the
transfer example was 47 characters of prose.

### 1.4 The confirmation existed twice, in two wordings

`lib/bot.ts` said `Turi: Xarajat / Kategoriya: … / Sana: …`, while the real
Telegram path in `webhook/route.ts` rendered `➖ Xarajat / Summa: …`. Two
sources, two vocabularies (`➖/➕/↔️` vs `💸/💰/🔄`), one screen — a copy bug
waiting to drift further.

### 1.5 `/help` was a settings dump

`help` and `settings` shared one branch, so a user asking for help received
currency, minimal reserve, an income-confidence percentage and four
notification toggles before reaching a single usable sentence — 19 lines.

### 1.6 Smaller defects

* Mixed apostrophes: `to'lov` next to `to‘lov`, `so'm` next to `so‘m`.
* Three different words for one thing: *operatsiya* (bot), *yozuv* (image flow),
  *Operatsiya* (Mini App).
* “✅ Hammasini qo‘shish” vs “✅ Hammasini tasdiqlash” for the same gesture.
* Acks written as system events: “So'rov topilmadi”, “Bu so'rov avval qayta
  ishlangan”, “⛔ Operatsiyalarni saqlab bo'lmadi”.
* Confirmation replies pasted the whole 7-line summary again after every save.
* Image errors exposed operator detail to end users: “API kalit noto'g'ri”,
  “Operator sozlamalarini tekshiring”.

---

## 2. NEW COPY CONCEPT

One rule drives everything: **`/start` is a launchpad, not a report.**

1. The bot introduces itself in one sentence of plain Uzbek.
2. It shows the only three things it can do, each with a 2–3 word explanation.
3. It offers the faster path (just write it) as an option, not as the syllabus.
4. It names the Mini App as a *different place* with *different sections* —
   never as a bot capability.
5. It ends pointing at the keyboard.
6. Numbers appear only when they exist: a new account gets onboarding,
   a returning user gets balance + this month, both under 6 lines.

All bot strings now live in one module, **`src/lib/bot-copy.ts`** — the same
architectural choice `src/lib/copy.ts` already made for the Mini App.

---

## 3. NEW COPY

### `/start` — first contact (no transactions yet)

```
Assalomu alaykum, {Ism} 👋

Hisobchi pulingiz qayerdan kelib, qayerga ketayotganini yozib boradi.

💰 Daromad — pul keldi
💸 Xarajat — pul ketdi
🔄 Transfer — hisobdan hisobga

Yoki shunchaki yozing: „150 ming ovqatga ketdi“.

Birinchi operatsiyani hozir qo‘shing 👇
```

### `/start` — returning user

```
Assalomu alaykum, {Ism} 👋

💰 Balans: 12 480 000 so‘m
📅 Avgust: +4 200 000 / −1 950 000

Yangi operatsiya qo‘shamizmi? Tugmani bosing yoki yozib yuboring 👇
```

### Mini App (second `/start` message + inline button)

```
Hisoblar, budjet, qarzdorlik, maqsadlar va tahlil — Mini App’da.
```
Button: **`📱 Mini App’ni ochish`** *(web_app URL unchanged)*

### `💰 Daromad`

```
Qancha pul keldi?

Masalan: 1,5 mln maosh keldi
```

### `💸 Xarajat`

```
Qancha va nimaga sarfladingiz?

Masalan: 150 ming ovqatga ketdi
```

### `🔄 Transfer`

```
Qaysi hisobdan qaysi hisobga o‘tkazdingiz?

Masalan: Naqd puldan Humoga 200 ming
```

### Confirmation — one operation

```
Shunday yozib qo‘yaymi?

💸 Xarajat · 150 000 so‘m
Ovqat · 22 avgust
```
Buttons: `✅ Tasdiqlash` · `❌ Bekor qilish`

### Confirmation — several operations in one message

```
2 ta operatsiya topildi:

1. 💸 150 000 so‘m — Ovqat · 21 avgust
2. 💰 1 500 000 so‘m — Maosh · 22 avgust

Hammasini tasdiqlang yoki raqami bo‘yicha bittalab tanlang.
```
Buttons: `✅ Hammasini tasdiqlash` · `❌ Bekor qilish` · `✅ 1` `✅ 2`

### After saving

Telegram (inline confirmation):

```
✅ Xarajat qo‘shildi
```

Bot console / `POST /api/bot` (batch confirm), where a summary was already
being returned:

```
✅ 2 ta operatsiya saqlandi

💰 Balans: 12 330 000 so‘m
```

The old seven-line block (`Kutilayotgan daromad`, `Majburiy`,
`Sarflash mumkin`, `Prognoz`, …) is gone from post-save feedback: after adding
150 ming for lunch, the only number a person checks is the balance. The full
picture stays one tap away in the Mini App and one command away in
`/report` · `/forecast`.

### Not understood

```
Summani topa olmadim 🤔

Shunday yozing: „150 ming ovqatga ketdi“.
Bir nechta operatsiyani vergul bilan ajrating.
```

### Transfer without recognisable accounts

```
Ikkala hisob nomini ham yozing.

Masalan: Naqd puldan Humoga 200 ming

Hisoblaringizni Mini App’da ko‘rishingiz mumkin.
```

### `/help`

```
Hisobchi shunday ishlaydi 👇

Operatsiyani o‘z so‘zingiz bilan yozing:
• „150 ming ovqatga ketdi“
• „kecha 150 ming ovqat, 70 ming taksi“ — bir nechtasi birdan
• „15-avgust 500 ming ijara to‘ladim“ — o‘tgan sana bilan

Tugmalar: 💰 Daromad · 💸 Xarajat · 🔄 Transfer

Buyruqlar:
/report — bugun va bu oy
/forecast — kelayotgan to‘lovlar va prognoz
/start — boshidan

Hisoblar, budjet, qarzdorlik, maqsadlar va tahlil — Mini App’da.
```

### Acks (Telegram callback answers)

| Old | New |
|---|---|
| `So'rov topilmadi` | `Bu so‘rov topilmadi` |
| `Bu so'rov avval yakunlangan` | `Bu allaqachon yakunlangan` |
| `Bu so'rov avval qayta ishlangan` | `Bu allaqachon saqlangan` |
| `Tasdiqlash muddati tugagan` | `Muddati tugadi. Operatsiyani qayta yuboring` |
| `✅ 3 ta operatsiya qayd etildi` | `✅ 3 ta operatsiya saqlandi` |
| `✅ 2 ta qayd etildi, ❓ 1 ta aniqlashtirish kutmoqda` | `✅ 2 ta saqlandi · ❓ 1 tasi aniqlashtirishni kutmoqda` |
| `⛔ Operatsiyalarni saqlab bo'lmadi` | `⛔ Saqlanmadi. Qayta urinib ko‘ring` |
| `Noto'g'ri so'rov` | `So‘rov noto‘g‘ri` |

### Credit schedule

| Old | New |
|---|---|
| `1 ta to‘lov topildi. Bu kredit rejasimi yoki oddiy to‘lovmi? Agar kredit jadvali bo‘lsa, to‘liq jadvalni yuboring.` | `Bu yerda bitta to‘lov ko‘rinyapti.` + `Agar kredit bo‘lsa — to‘liq jadvalni yuboring.` + `Oddiy to‘lov bo‘lsa — summani yozing…` |
| `⚠️ Kredit jadvalida xatolik: …Qayta tekshirib yuboring.` | `⚠️ Jadvalni to‘liq o‘qib bo‘lmadi:` + bullets + `Tekshirib, qayta yuboring.` |
| `✅ Hammasini qo‘shish` | `✅ Hammasini tasdiqlash` (one gesture, one label) |
| — | `Hammasini qo‘shamizmi?` added as the closing question |

### Image flow (feature-flagged; never promised in `/start` or `/help`)

| Old | New |
|---|---|
| `📷 Rasm qabul qilindi…\n🔍 Tahlil qilinmoqda…` | `📷 Rasm keldi. O‘qiyapman…` |
| `📷 Rasm tahlil qilindi.` | `📷 Rasm o‘qildi.` |
| `🔐 Rasm tahlil xizmati sozlanmagan yoki API kalit noto'g'ri. Operator sozlamalarini tekshirib…` | `🔐 Rasm o‘qish xizmati sozlanmagan.` + `Keyinroq urinib ko‘ring yoki summani yozib yuboring.` |
| `🖼 Rasm tahlili hozircha yoqilmagan…` | `🖼 Rasmdan o‘qish hozircha ishlamaydi…` |
| `♻️ Bu rasm avval qayta ishlangan — takroriy yozuvlar yaratilmadi…` | `♻️ Bu rasm avval o‘qilgan — takroriy operatsiya yaratilmadi.` |
| `✅ N ta yozuv topildi.` | `✅ N ta operatsiya topildi.` |

### Telegram chrome (BotFather-level copy)

| Surface | Old | New |
|---|---|---|
| `/start` command | Botni boshlash | Boshlash |
| `/report` command | Tezkor hisobot | Bugun va bu oy |
| `/forecast` command | Reja va prognoz | Kelayotgan to‘lovlar va prognoz |
| `/help` command | Yordam | Qanday ishlaydi |
| Chat menu button | `Moliyam` | `Mini App` |

---

## 4. What was NOT changed (by design)

* Reply-keyboard labels `💰 Daromad`, `💸 Xarajat`, `🔄 Transfer` — they are
  routing keys in `bot-routing.ts` **and** already the strongest possible
  labels: one verb-noun each, in the product's own vocabulary.
* Every `callback_data` (`draft:*`, `batch:*`, `schedule:*`, `ed:*`, `ec:*`).
* `MORE_MENU` labels, all legacy aliases (`Kirim`, `Chiqim`,
  `Majburiy to'lovlar`, `Reja va prognoz`) and apostrophe normalisation in
  routing — old pinned keyboards keep working.
* `lib/finance.ts`, `db/schema.ts`, `drizzle/**`, `lib/mutations.ts` logic,
  Mini App pages and components.

---

## 5. COPY CONSISTENCY CHECK

| Check | Result |
|---|---|
| **One term per concept** | Daromad · Xarajat · Transfer · Balans · Operatsiya · To‘lov. The retired synonym *yozuv* is gone from the bot and the image flow; `TERMS` in `copy.ts` remains the single dictionary. |
| **Button ↔ message alignment** | No prompt repeats its own button (`💰 Daromad` → “Qancha pul keldi?”). Enforced by a test. |
| **One gesture, one label** | `✅ Tasdiqlash` / `✅ Hammasini tasdiqlash` / `❌ Bekor qilish` everywhere, including the credit schedule and the image batch. |
| **No false Mini App promises** | A test fails if the words *budjet / qarzdorlik / maqsad / tahlil* appear in a bot sentence that does not name the Mini App. The bot only claims Daromad, Xarajat, Transfer, `/report`, `/forecast`. |
| **No onboarding bloat** | `/start` (new) = 9 non-empty lines, no figures; `/start` (returning) = 5; every action prompt = 2. Line budgets are asserted in tests. |
| **Next step always obvious** | Both `/start` variants end with 👇 and a live keyboard; every error message ends with the exact sentence to type; every confirmation ends with two buttons. |
| **Typography** | Only `‘`/`’` apostrophes in bot copy (`so‘m`, `to‘lov`, `Mini App’ni`) — asserted by a test over `bot-copy.ts` and `bot.ts`. |
| **One source of truth** | `draftSummary` / `batchSummary` are now rendered from one module by both `lib/bot.ts` and the Telegram webhook; a test fails if the old duplicated wording returns. |
| **Tone** | No “platforma”, “analitika”, “moliyaviy boshqaruv”, no warnings, no slogans. The heaviest remaining finance words live in `/report` and `/forecast`, where the user asked for them. |

### Verification

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | **359 pass, 0 fail** (7 new copy regression tests) |
| Typecheck | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass, 0 warnings |
| Build | `npm run build` | pass — 13/13 routes |

New guards in `tests/regressions.test.ts`:

1. `/start` for a new account onboards without a wall of zeroes (greeting,
   product sentence, three actions, no figures, ≤ 9 lines, ends on the CTA).
2. `/start` for a returning user states two facts and one action.
3. The bot never advertises a Mini App feature as its own.
4. An action prompt never repeats the button the user just pressed.
5. Bot copy speaks one vocabulary and one apostrophe.
6. A draft confirmation shows the three facts a user verifies.
7. `/help` explains the bot without turning into a settings dump.

### Files changed

`src/lib/bot-copy.ts` **(new)** · `src/lib/bot.ts` ·
`src/app/api/telegram/webhook/route.ts` · `src/lib/image/ux.ts` ·
`src/lib/image/draft-edit.ts` · `src/lib/drafts.ts` · `src/app/bot/page.tsx` ·
`scripts/configure-telegram.mjs` · `tests/regressions.test.ts` ·
`tests/image-activation.test.ts` · `tests/image-intelligence.test.ts` ·
`tests/image-pipeline-db.test.ts`
