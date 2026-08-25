# Hisobchi — Dizayn optimallashtirish (2026-08)

> Ushbu hujjat `arena/01a037e0-hisobchi` branch'ida bajarilgan dizayn
> optimallashtirishning **audit → qaror → natija** yozuvidir. Barcha o'zgarishlar
> faqat presentation qatlamida: biznes logika, mutations va finance hisob-kitoblari
> **teginilmagan** (420 testda bu ham tekshiriladi).

---

## 1. Audit — nima topildi

Proyekt allaqachon kuchli token tizimiga ega (WCAG-verified palette, yagona sheet
motion, geometriya CSS o'zgaruvchilari). Lekin bir necha tizimli nomuvofiqlik bor edi:

| # | Muammo | Qayerda | Nima uchun muhim |
|---|---|---|---|
| 1 | **Ikonka ikki tilda gapirardi**: navigatsiya — stroke SVG, qolgan chrome — emoji (🔔 🌙 ☀️ 🖥 🤖 💳 🎯 📋 🏆 ⚙️ 📊 ✏️ 🧾 🚫 ❚❚ ▶ ⏳ 🔴 ✅ ⛔ ℹ️) | app-shell, more, analytics, plans, accounts, settings, form-kit, providers | Emoji renderi platformaga bog'liq (Telegram Android / iOS / desktop har xil), rang/tema meros qilib olmaydi, font-o'lchamiga qarab siljiydi. Eng ko'p ko'rinadigan nomuvofiqlik edi. |
| 2 | **SVG gradient ID'lar dublikat** (`fa-fill`, `bl-fill`) | `charts.tsx` | Bitta sahifada ikkita `ForecastArea`/`BalanceLine` bo'lsa, DOM'da bir xil `id` takrorlanadi va `url(#…)` birinchi elementga bog'lanadi — bu haqiqiy DOM xatosi. |
| 3 | **Diagrammalarning AT (screen reader) nomi yo'q** | `IncomeExpenseBars`, `BalanceLine`, `CategoryBars`, `Sparkline`, `CashFlowStrip`, `Ring` | `role="img"` bor, lekin `aria-label` yo'q — screen reader "img" deb e'lon qiladi, nimani ko'rsatayotganini aytmaydi. |
| 4 | **Toast'lar `aria-live`siz** | `providers.tsx` | Muvaffaqiyat/xato xabari ekranga chiqadi, lekin AT'ga e'lon qilinmaydi. |
| 5 | **So'yalgan qattiq rgba shadow'lar** | `dashboard.tsx` (hero, kategoriya ro'yxati) | `--shadow-card` token'ga mos emas; qorong'u rejimda alohida sozlanmaydigan 4-5 xil shadow. |
| 6 | **Z-index ixtiyoriy qiymat** | toast `z-[100]` | `--z-bottom-nav/fab/sheet` shkalasi bor edi, toast tashqarida. |
| 7 | **EmptyState tili**: emoji har xil uslubda | barcha bo'sh holatlar | Chrome bo'sh holatlari ham platformaga bog'liq emoji edi. |

---

## 2. Qarorlar (design system qoidalari)

1. **Chrome = yagona stroke SVG to'plami.** `src/components/icons.tsx` —
   24×24 viewBox, `currentColor`, 1.8px, round caps/joins. Barcha interfeys
   qismlari shu to'plamdan foydalanadi.
2. **Ma'lumot = emoji qoladi.** Foydalanuvchi tanlagan kategoriya emoji'lar
   (DB'da saqlanadi) va bot tilidagi buyruq emoji'lari (📊 Hisobot va h.k.)
   **aloqasiz** — ular kontent, chrome emas.
3. **Chrome bo'sh holatlari ham ikonka bilan.** `EmptyState` endi `ReactNode`
   qabul qiladi (eski string'lar ishlashda davom etadi).
4. **Elevation — bitta ramp.** `--shadow-card` → `--shadow-card-soft` →
   `--shadow-card-raised` → `--shadow-fab`; komponentlarda rgba yozilmaydi.
5. **Radius/geometry, motion, scroll-lock** — oldingi tizim saqlanadi, bu
   hujjatda o'zgartirilmadi.

---

## 3. Qilingan o'zgarishlar

### 3.1. `src/components/icons.tsx` (yangi)

- Navigatsiya: `HomeIcon`, `ListIcon`, `CalendarIcon`, `ChartIcon`, `GridIcon`.
- Chrome: `BellIcon`, `SunIcon`, `MoonIcon`, `MonitorIcon`, `BotIcon`,
  `PlusIcon`, `XIcon`, `SearchIcon`, `FunnelIcon`, `Chevron{Right,Left,Down}Icon`,
  `DotsIcon`, `PencilIcon`, `ReceiptIcon`, `BanIcon`, `PauseIcon`, `PlayIcon`,
  `CheckIcon`, `InfoIcon`, `WarningIcon`, `ClockIcon`, `TrashIcon`, `RefreshIcon`.
- Moliya: `WalletIcon`, `Trend{Up,Down}Icon`, `CashIcon`, `CardIcon`, `BankIcon`,
  `PhoneIcon`, `TargetIcon`, `ClipboardIcon`, `TrophyIcon`, `SettingsIcon`,
  `FolderIcon`, `PinIcon`, `SparkleIcon`.
- `AccountTypeIcon` + `ACCOUNT_TYPE_ICON` — belgilangan hisob turlari uchun
  yagona xaritalash (`cash/uzcard/humo/bank/ewallet/other`).

### 3.2. Qaysi fayllarda emoji → SVG

| Fayl | O'zgarish |
|---|---|
| `app-shell.tsx` | sidebar bot, eslatmalar, mavzu tugmalari; mobil header tugmalari; alert sheet severity ikonkalari; nav ikonkalari endi shared setdan |
| `more/page.tsx` | 6 ta menyu qatori → stroke ikonka + animatsiyali chevron |
| `plans/page.tsx` | action sheet (✏️🧾🚫❚❚▶ → SVG); `🧾 N ta` → ReceiptIcon; `•••` → DotsIcon; overdue 🔴 → rangli nuqta, ⏳ → ClockIcon; "Xavf kunlari" ⚠️ → WarningIcon; bo'sh holatlar → Pin/Cash/Ban/Trophy/Pause |
| `accounts/page.tsx` | hisob turi ikonkalari, segmented tab'lar (Hisoblar/Kategoriyalar) |
| `form-kit.tsx` | account picker (single + chip), "Boshqa" sana chipi; `ChoiceOption.icon` endi `ReactNode` |
| `analytics/page.tsx` | 📊 tile → accent-tile ichida SVG |
| `dashboard.tsx` | hero wallet + trend ikonkalari shared setdan |
| `fab.tsx` | plus ikonka shared setdan (rotatsiya animatsiyasi saqlangan) |
| `filter-controls.tsx` | FunnelIcon shared setdan |
| `transaction-filter.tsx` | kategoriya expand ⌃/› → chevron SVG |
| `balance-breakdown.tsx` | chevron-down shared setdan |
| `transactions/page.tsx` | qidiruv ikonka shared setdan (pencil — test-shartnoma bo'lgani uchun inline SVG qoldi, izohli) |
| `settings/page.tsx` | Mavzu segmented → Sun/Moon/Monitor ikonka + matn |
| `providers.tsx` | toast'lar → tone-rangli ikonka + **`aria-live="polite"`**, `role="status"`, `--z-toast` |

### 3.3. Charts (`charts.tsx`)

- `useId()` → har bir `ForecastArea`/`BalanceLine` uchun **yagona** gradient ID.
- `IncomeExpenseBars`, `BalanceLine`, `CategoryBars`, `Sparkline`, `CashFlowStrip`
  — `aria-label` (default va override prop bilan).
- `Ring` → `role="progressbar"` + `aria-valuenow/min/max`, `ariaLabel` prop.
- `CashFlowStrip` → `role="group"` + `aria-label` (scrollable region AT uchun
  ochiq qoladi).

### 3.4. Tokens (`globals.css`)

```css
--shadow-card-soft / --shadow-card-raised / --shadow-fab   /* light + dark */
@theme inline: --shadow-soft, --shadow-raised, --shadow-fab-token
--z-toast: 100
```

`dashboard.tsx` endi `shadow-soft` / `hover:shadow-raised` ishlatadi;
`.global-fab` → `var(--shadow-fab-token)`.

### 3.5. Kichik narsalar

- `segmented` option `label` endi `ReactNode` (ikonka+matn uchun; eski string
  ishlaydi).
- `EmptyState.icon` endi `ReactNode`.
- `icon.svg` — ilova faviconi (₮ belgisi, dark navy + accent).

---

## 4. Nima saqlanib qoldi (dizayn bo'yicha)

- WCAG-verified rang tokеn'lari va `--fg/--muted` rampa.
- Bitta sheet motion tizimi (`--motion-*`), scroll-lock, swipe-back/tab-swipe.
- Uzun segmentlar uchun `Segmented` scroll; forma ichida hech qachon x-scroll.
- `prefers-reduced-motion` qoidalari.
- Pencil orientatsiya testi (U+270E emas, SVG) — `ux-layout.test.ts` shartnomasi.
- Foydalanuvchi ma'lumoti (kategoriya emoji'lar) va bot buyruq emoji'lari.

---

## 5. Tekshirish

```
npm run typecheck  ✅ (tsc --noEmit)
npm run lint       ✅ (eslint .)
npm test           ✅ 420 test: 417 pass / 3 skip (DB testlari — lokal Postgres yo'q) / 0 fail
npm run build      ✅ (DATABASE_URL, REDIS_URL mock bilan; barcha 16 route build bo'ldi)
```

---

## 6. Keyingi bosqichlar (taklif)

- **P0 (performance):** OPTIMIZATION-PLAN.md §3.1-3.6 — `/api/state` payload
  limiti, cleanup job, dispatcher batch, state kesh.
- **P2:** `plans/page.tsx` (1814 qator) va `form-kit.tsx` (1049) modullarga
  bo'lish — test to'ri saqlanib qoladi.
- **Ikonka auditi 2-bosqich:** bot sahifasi quick-chip'lari va menyu
  description'laridagi emoji'lar (kontent sifatida saqlab qolish tavsiya).
- `docs/DASHBOARD-PREVIEW.html` yangi token/ikonka tizimiga ko'ra yangilash.
