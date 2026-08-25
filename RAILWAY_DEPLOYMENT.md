# Railway Production Deployment

> Loyiha backend + frontend + shared monorepo tuzilishiga o'tdi.
> Railway'da endi **ikki service** ishlaydi: `backend` (Fastify API + bot webhook)
> va `frontend` (nginx: statik Mini App + `/api` proksi).

## Architecture

```
                    ┌────────────────────────── Railway project ──────────────────────────┐
                    │                                                                     │
Telegram ──webhook─►│  backend service (Fastify, Docker: backend/Dockerfile)              │
                    │    ├── PostgreSQL service (private)                                 │
                    │    └── Redis service (private)                                      │
                    │                                                                     │
Mini App brauzeri ─►│  frontend service (nginx, Docker: frontend/Dockerfile)              │
                    │    └── /api ──proksi──► backend service (ichki tarmoq)              │
                    └─────────────────────────────────────────────────────────────────────┘
```

**Muhim (monorepo):** ikkala service uchun ham **Root Directory bo'sh qoldiriladi**
(repo ildizi = build context, chunki `shared/` paketi ikkalasiga ham kerak).
Dockerfile joylashuvi `RAILWAY_DOCKERFILE_PATH` o'zgaruvchisi orqali ko'rsatiladi.

## 1. Railway servislarini yaratish

1. Railway project yarating.
2. **PostgreSQL** va **Redis** qo'shing (private networking, portlarni ochmang).
3. **backend** service: repo'ni ulang va `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile` qo'ying.
4. **frontend** service: repo'ni ulang va `RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile` qo'ying.
5. Har biriga public domain generatsiya qiling.

## 2. backend service o'zgaruvchilari

| Variable | Required | Value |
|---|---:|---|
| `RAILWAY_DOCKERFILE_PATH` | yes | `backend/Dockerfile` |
| `DATABASE_URL` | yes | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | yes | `${{Redis.REDIS_URL}}` |
| `BOT_TOKEN` | yes | BotFather token (secret) |
| `WEBHOOK_SECRET` | yes | 32+ random bytes (secret) |
| `APP_URL` | yes | **frontend** service'ning public HTTPS URL'i |
| `FRONTEND_ORIGINS` | no | qo'shimcha ruxsat etilgan originlar (vergul bilan) |
| `LOG_HASH_SECRET` | yes | 32+ random bytes (secret) |
| `NOTIFICATION_CRON_SECRET` | yes | 32+ random bytes for the scheduled dispatcher |
| `NODE_ENV` | yes | `production` |
| `DISABLE_DEMO` | yes | `true` |
| `ALLOW_DEMO_IN_PRODUCTION` | yes | `false` |
| `DATABASE_SSL` | usually no | `false` for Railway private Postgres |
| `APP_TIMEZONE` | no | IANA zone for financial "today" (default `Asia/Tashkent`) |
| `PORT` | auto | Railway tomonidan beriladi |

Deploy sozlamalari (service Settings → Deploy):

- **Healthcheck Path**: `/api/health/live`
- **Pre-deploy Command**: `cd backend && node scripts/migrate.mjs`
  (yoki `npm run migrate --workspace backend` — repo ildizidan)
- **Start Command**: Dockerfile'dan keladi (`backend/scripts/start-production.sh`).

## 3. frontend service o'zgaruvchilari

| Variable | Required | Value |
|---|---:|---|
| `RAILWAY_DOCKERFILE_PATH` | yes | `frontend/Dockerfile` |
| `BACKEND_ORIGIN` | yes | backend service'ning ichki manzili, masalan `https://hisobchi-backend.up.railway.app` yoki private `http://backend.railway.internal:4000` |
| `API_PUBLIC_URL` | no | faqat frontend API'ni to'g'ridan-to'g'ri (boshqa domen orqali) chaqirsa — CSP `connect-src` uchun |
| `PORT` | auto | default `8080` |

Build-time frontend o'zgaruvchilari (agar kerak bo'lsa) `frontend/.env.example'da`.

## 4. Telegram sozlash

Webhook'ni o'rnatish (backend public domendan bir marta):

```bash
BOT_TOKEN=... WEBHOOK_SECRET=... APP_URL=https://<frontend-domain> \
  node backend/scripts/configure-telegram.mjs
```

- `APP_URL` — Mini App ochiladigan **frontend** domeni.
- BotFather → Bot Settings → Menu Button → Web App: `https://<frontend-domain>`.

## 5. Smoke-testlar

Deploy'dan keyin:

```bash
BASE_URL=https://<backend-domain> npm run security-smoke
curl -s https://<frontend-domain>/            # Mini App yuklanadi
curl -s https://<frontend-domain>/api/health  # proksi orqali backend javobi
```

## 6. Xavfsizlik qoidalari (o'zgarmadi)

- Demo rejim produksiyada o'chirilgan bo'lishi shart (`DISABLE_DEMO=true`,
  `ALLOW_DEMO_IN_PRODUCTION=false`).
- `LOG_HASH_SECRET`, `NOTIFICATION_CRON_SECRET`, `WEBHOOK_SECRET` — kamida 32 belgi.
- Admin namespace (`/api/admin/*`) fail-closed bloklangan (backend `app.ts`).
- CSP frontend nginx'da: `script-src 'self' https://telegram.org`, inline script yo'q
  (Vite faqat hashlangan fayllarni chiqaradi — nonce talab qilinmaydi).
- `/api/mutate` server tomonda origin allowlist tekshiruvi (`isAllowedMutationOrigin`)
  va Redis rate-limit bilan himoyalangan.
