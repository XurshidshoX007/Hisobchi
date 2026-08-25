# Hisobchi — Shaxsiy moliya (Telegram Mini App)

Balans, daromad, xarajat, reja va prognoz — Telegram bot va Mini App.

## Arxitektura

Loyiha **backend + frontend + shared** ko'rinishida uch mustaqil paketga ajratilgan
monorepo (npm workspaces):

```
hisobchi/
├── shared/                  # @hisobchi/shared — ikki tomon ham ishlatadigan sof TS modullari
│   └── src/lib/             #   money, finance, nlp, reconciliation, types, copy, bot-copy
├── backend/                 # @hisobchi/backend — Fastify API + Telegram bot webhook
│   ├── src/routes/          #   /api/state, /api/mutate, /api/bot, /api/health,
│   │                        #   /api/telegram/webhook, /api/telegram/notifications
│   ├── src/lib/             #   xavfsizlik (rate-limit, initData auth), bot mantiqi,
│   │                        #   image intelligence, mutatsiyalar, holat quruvchi
│   ├── src/db/              #   Drizzle ORM (PostgreSQL): schema + pool
│   ├── drizzle/             #   SQL migratsiyalar
│   └── scripts/             #   migrate, db-preflight, security-smoke, configure-telegram
├── frontend/                # @hisobchi/frontend — Vite + React SPA (Telegram Mini App)
│   ├── src/pages/           #   dashboard, transactions, plans, analytics, accounts, ...
│   ├── src/components/      #   UI komponentlari
│   ├── src/lib/             #   faqat frontend modullari (form-kit, navigation, ...)
│   └── nginx.conf.template  #   prod: statik fayllar + /api proksi + CSP sarlavhalari
├── tests/                   # ikkala paketni qamrab oluvchi regressiya testlari
├── docker-compose.yml       # to'liq lokal stack: Postgres + Redis + backend + frontend
└── package.json             # workspaces ildizi
```

### Bog'lanish sxemasi

```
Telegram (brauzer/webview)
        │
        ▼
frontend (Vite/nginx)  ──/api proksi──►  backend (Fastify)  ──►  PostgreSQL
                                              │
                                              ├──►  Redis (rate-limit)
                                              └──►  Telegram Bot API (webhook, bildirishnomalar)
```

- Frontend API'ga **nisbiy** `/api/...` chaqiruvlari bilan murojaat qiladi — dev rejimda
  Vite proksi, produksiyada nginx proksi. Kerak bo'lsa `VITE_API_URL` bilan to'g'ridan-to'g'ri
  bog'lanish ham mumkin.
- `shared` paketi ikkala tomon tiplari va hisob-kitob mantiqini bir manbadan oladi
  (`@hisobchi/shared/lib/...`).

## Tez boshlash (lokal)

Talab: Node 22+, PostgreSQL, Redis (yoki Docker).

```bash
npm install                      # workspaces: shared + backend + frontend
cp backend/.env.example backend/.env   # DATABASE_URL va BOT_TOKEN to'ldiring
npm run migrate                  # drizzle migratsiyalari
npm run dev                      # backend :4000 + frontend :5173 (bir vaqtda)
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:4000/api/health

Yoki Docker bilan bitta buyruqda to'liq stack:

```bash
docker compose up --build        # frontend :8080, backend :4000, Postgres, Redis
docker compose exec backend node scripts/migrate.mjs   # birinchi safarda
```

## Skriptlar

| Buyruq | Nima qiladi |
|---|---|
| `npm run dev` | backend + frontend birga (dev rejim) |
| `npm run build` | frontend production build (Vite) |
| `npm run typecheck` | barcha paketlar + root testlar typecheck |
| `npm test` | root regressiya testlari |
| `npm run test:all` | root + shared + backend + frontend testlari |
| `npm run test:db` | PostgreSQL talab qiluvchi integratsion testlar |
| `npm run migrate` | drizzle migratsiyalari |
| `npm run audit:db` | DB preflight tekshiruvlari |
| `npm run security-smoke` | ishlayotgan serverda xavfsizlik smoke-test |

## Konfiguratsiya

- **backend**: `backend/.env` — `DATABASE_URL`, `REDIS_URL`, `BOT_TOKEN`, `WEBHOOK_SECRET`,
  `APP_URL` (frontend'ning ommaviy manzili), `LOG_HASH_SECRET`, `NOTIFICATION_CRON_SECRET`.
  To'liq ro'yxat: `backend/.env.example`.
- **frontend**: `frontend/.env` — `VITE_API_URL` (ixtiyoriy), `VITE_TELEGRAM_BOT_USERNAME`.

## Deploy

Railway'da ikkita service — qarang: [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md).

## Testlar joylashuvi

| Papka | Nima sinaydi |
|---|---|
| `shared/tests` | moliyaviy hisob-kitob, reconciliation, plan lifecycle |
| `backend/tests` | bot marshrutlash, image intelligence, mutatsiya/qat'iyat (`*-db.test.ts` — bazaga bog'liq) |
| `frontend/tests` | UI strukturaviy guardlar, add-flow, swipe, dashboard faktlari |
| `tests/` | ikkala paketni qamrab oluvchi umumiy regressiyalar |
