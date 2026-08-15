# Railway Production Deployment

## Architecture

One Railway **Web service** runs both Telegram Bot webhook and Mini App API/UI.
It connects to one Railway **PostgreSQL** service and one private **Redis**
service. This preserves one backend and one source of truth.

## 1. Create Railway services

1. Create a Railway project.
2. Add **PostgreSQL**.
3. Add **Redis**.
4. Add a service from this Git repository (Railway detects `railway.json` and
   `Dockerfile`).
5. Generate a public domain for the web service.

PostgreSQL and Redis must stay on Railway private networking; do not expose
ports 5432 or 6379 publicly.

## 2. Web-service variables

Configure these in Railway Variables (never commit values):

| Variable | Required | Value |
|---|---:|---|
| `DATABASE_URL` | yes | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | yes | `${{Redis.REDIS_URL}}` |
| `BOT_TOKEN` | yes | BotFather token (secret) |
| `WEBHOOK_SECRET` | yes | 32+ random bytes (secret) |
| `NEXT_PUBLIC_APP_URL` | yes | Railway public HTTPS URL, no trailing slash |
| `LOG_HASH_SECRET` | yes | 32+ random bytes (secret) |
| `NODE_ENV` | yes | `production` |
| `DISABLE_DEMO` | yes | `true` |
| `ALLOW_DEMO_IN_PRODUCTION` | yes | `false` |
| `DATABASE_SSL` | usually no | `false` for Railway private Postgres |

Do **not** set test users or demo credentials. `start-production.sh` refuses to
start if demo is enabled or a required secret is missing.

Generate secrets locally without printing them into shell history where
possible, e.g. a password manager's secure generator. Rotate immediately if a
secret reaches source control or logs.

## 3. Build and startup

Railway uses the Dockerfile. Startup order is:

1. Validate required production env.
2. Run `node scripts/migrate.mjs` using `DATABASE_URL`.
3. Drizzle applies only versioned migrations from `drizzle/` and records them
   in its migration journal.
4. Start Next.js on Railway's `$PORT`.
5. Railway checks `GET /api/health`.

Never run `drizzle-kit push` against production. All schema changes must be a
reviewed migration generated with:

```bash
npx drizzle-kit generate --config=drizzle.config.ts
```

Back up PostgreSQL before applying later destructive migrations. Validate each
migration on staging first.

## 4. Telegram setup after the first healthy deploy

Run once from a trusted machine with production variables loaded:

```bash
BOT_TOKEN=... \
WEBHOOK_SECRET=... \
NEXT_PUBLIC_APP_URL=https://YOUR-SERVICE.up.railway.app \
node scripts/configure-telegram.mjs
```

This configures:

- webhook: `https://YOUR-SERVICE.up.railway.app/api/telegram/webhook`
- allowed updates: `message`, `callback_query`
- commands: `/start`, `/report`, `/forecast`, `/help`
- Telegram menu button: **Moliyam** → Mini App HTTPS URL

In BotFather, configure the same Mini App URL and allowed domain.

## 5. Security gates

Production behaviour:

- Telegram `initData` signature and `auth_date` are mandatory.
- Missing/invalid auth receives HTTP 401.
- Demo seed/fallback is disabled.
- `/api/admin/*` is fail-closed (404) until separate MFA/RBAC is implemented.
- All user-resource queries are scoped by current authenticated user.
- Financial mutations require `Idempotency-Key` and are rate-limited.
- Webhook requires `secret_token`, update idempotency and callback ownership.
- CSP, HSTS, MIME sniffing, referrer and permissions policies are enabled.
- Security/audit logs contain request IDs and hashed network identifiers, not
  tokens, initData, DB credentials or request bodies.

## 6. Health and operational checks

```bash
curl -fsS https://YOUR-SERVICE.up.railway.app/api/health
```

Expected production response:

- `status: "ok"`
- `database: "connected"`
- `redis: "connected"`
- `demo: false`
- `verifiedAuthRequired: true`
- `bot: "configured"`
- no warnings

If status is `warning`, do not open beta access until warnings are resolved.

## 7. Backup / restore

Enable Railway PostgreSQL backups. Before beta:

1. Take a manual backup.
2. Restore it into a separate staging PostgreSQL service.
3. Point a staging web service at the restored database.
4. Verify user counts, transaction sums, balances, constraints and health.
5. Record RPO/RTO and the responsible operator.

## 8. Rollback

Application rollback: use Railway deployment history to redeploy the last good
image. Database rollback: prefer forward fixes. Never automatically reverse a
migration containing financial data without a reviewed restore/forward plan.

## 9. Remaining platform controls

Outside the repository, configure:

- Railway project access with MFA and least privilege.
- Protected Git production branch and required CI checks.
- Railway private networking for PostgreSQL and Redis.
- Backup retention and restore drills.
- Error monitoring/alerts for 401, 403, 429, webhook and DB failures.
- WAF/CDN/custom domain if required by threat/load model.
- Independent penetration test before public launch.
