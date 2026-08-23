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
| `NOTIFICATION_CRON_SECRET` | yes | 32+ random bytes for the scheduled dispatcher |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | recommended | BotFather username without `@` |
| `NODE_ENV` | yes | `production` |
| `DISABLE_DEMO` | yes | `true` |
| `ALLOW_DEMO_IN_PRODUCTION` | yes | `false` |
| `DATABASE_SSL` | usually no | `false` for Railway private Postgres |
| `APP_TIMEZONE` | no | IANA zone for financial "today" (default `Asia/Tashkent`) |

### Image intelligence (Telegram photo/document analysis)

Feature-flagged and **OFF by default**. Both the flag *and* a vision provider
key are required — neither is bypassed in code.

| Variable | Required | Value |
|---|---:|---|
| `IMAGE_INTELLIGENCE_ENABLED` | no | `false` until QA passes, then `true`. Only the exact string `true` enables it. |
| `IMAGE_INTELLIGENCE_TEST_USERS` | no | Comma-separated Telegram user ids enabled while the flag is `false` |
| `VISION_API_KEY` | for images | Vision provider key (secret). `OPENAI_API_KEY` is an accepted fallback name. |
| `VISION_BASE_URL` | no | OpenAI-compatible base URL (default `https://api.openai.com/v1`) |
| `VISION_MODEL` | no | Vision-capable chat model (default `gpt-5.4-mini`) |
| `VISION_REASONING_EFFORT` | no | `none` \| `low` \| `medium` \| `high` for GPT-5 class models |
| `IMAGE_MAX_BYTES` | no | Per-image cap in bytes (default `5242880`) |

`VISION_MODEL` **must accept image input on `/chat/completions`**. Verify the
model in the provider's current catalogue before deploying — a text-only or
retired model id makes every photo fail. The provider adapts its request
parameters automatically (`max_completion_tokens` for GPT-5/o-series,
`max_tokens` + `temperature` for older chat models).

Rollout (each stage is independently verifiable):

1. **Stage 1** — `IMAGE_INTELLIGENCE_ENABLED=false`,
   `IMAGE_INTELLIGENCE_TEST_USERS=<your Telegram id>`, `VISION_API_KEY=<secret>`.
2. **Stage 2** — deploy, then check `GET /api/health` →
   `imageIntelligence.state` is `test-users-only` and `providerConfigured` is
   `true`.
3. **Stage 3** — send real photos from the allowlisted account: shopping list,
   credit schedule, expected income, debt list, mixed image. Confirm each batch
   and verify the result in the Mini App (History, Plans, Debts, Dashboard).
4. **Stage 4** — set `IMAGE_INTELLIGENCE_ENABLED=true` for everyone.
5. **Stage 5** — monitor the audit actions `image_classified`,
   `image_extraction_success`, `image_extraction_partial`,
   `image_processing_failed`, `image_duplicate`, `image_rate_limited`,
   `image_provider_unconfigured`, `image_provider_rate_limited`.

Health reports the image capability **without secrets** — provider name, model
name and endpoint host only, never the API key:

```json
"imageIntelligence": {
  "enabled": true, "testUserCount": 0, "providerConfigured": true,
  "providerName": "openai-compatible", "model": "gpt-5.4-mini",
  "endpointHost": "api.openai.com", "state": "configured"
}
```

If `state` is `provider-missing` the flag is on but the key is absent: users
receive "Rasm tahlil xizmati vaqtincha mavjud emas" (never a misleading
"feature disabled"), and health raises a warning.

Do **not** set demo credentials. `start-production.sh` refuses to
start if demo is enabled or a required secret is missing.

Generate secrets locally without printing them into shell history where
possible, e.g. a password manager's secure generator. Rotate immediately if a
secret reaches source control or logs.

## 3. Build and startup

Railway uses the Dockerfile. Deployment/startup order is:

1. Railway runs `node scripts/migrate.mjs` once as the `preDeployCommand`, using `DATABASE_URL`.
2. The migration runner serializes overlapping deploys with a PostgreSQL advisory lock, applies only versioned migrations from `drizzle/`, and records them in its migration journal.
3. The container validates required production env and starts Next.js on Railway's `$PORT` (it intentionally does **not** run DDL a second time).
4. Railway checks `GET /api/health/live` before activating the new deployment.
5. The old and new deployments overlap for 20 seconds; the old deployment gets a 30-second SIGTERM→SIGKILL drain window (`railway.json`). This reduces cut-over loss, but long webhook work must still move to a durable queue.

If a migration fails, open the **pre-deploy logs**: the runner prints the PostgreSQL error code and message. Confirm `DATABASE_URL` is exactly `${{Postgres.DATABASE_URL}}` and that the Postgres service is in the same Railway project/environment before retrying.

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
- CSP (per-request script nonce in production), HSTS, MIME sniffing, referrer
  and permissions policies are enabled.
- Security/audit logs contain request IDs and hashed network identifiers, not
  tokens, initData, DB credentials or request bodies.

## 6. Health and operational checks

Two endpoints with two different jobs:

- `GET /api/health/live` — lightweight **deployment readiness** endpoint kept
  at the historical path. Process + database only, no outbound Telegram calls.
  Railway uses its configured HTTP healthcheck while activating a deployment;
  the Docker image also declares this URL as its health signal.
- `GET /api/health` — **deep diagnostics** for humans/dashboards. Includes
  Redis, env warnings and the Telegram Bot API/webhook state (cached ~60 s).

Neither endpoint is a substitute for continuous external monitoring. A failed
Railway deployment healthcheck marks that deployment failed; it is not evidence
that this endpoint continuously restarted an already-running service.

```bash
curl -fsS https://YOUR-SERVICE.up.railway.app/api/health
```

Expected production response:

- `status: "ok"`
- `database: "connected"`
- `redis: "connected"`
- `demo: false`
- `verifiedAuthRequired: true`
- `bot: "connected"`
- `webhookUrlMatches: true`
- no warnings

If status is `warning`, do not open beta access until warnings are resolved.

### Keeping the service awake (Telegram bots must not sleep)

A Telegram webhook bot receives inbound HTTPS calls at unpredictable times; if
the service is asleep, Telegram's delivery hits a cold container and the user
sees a dead bot. Three settings keep it always-on:

1. `railway.json` ships `"sleepApplication": false` — do not override it.
2. In the Railway service **Settings → App Sleeping**, verify sleeping is
   **disabled** (UI settings win over stale deployments if they diverge).
3. Keep the service on a plan that allows always-on workloads (the Free/Trial
   tier stops services when credits run out — that also looks like
   "the app fell asleep").

If the bot still appears frozen, correlate `Deployments → Logs`, runtime exit
codes, memory/CPU graphs, Telegram `last_error_date`, and Postgres timestamps.
Do not infer a restart loop from the HTTP deployment healthcheck alone: Railway
uses that check to activate a new deployment, not as continuous uptime
monitoring. `/api/health/live` stays minimal so deploy readiness is independent
of Telegram/Redis latency.

Configure a Railway Cron service (for example every hour) to invoke the same
web service's dispatcher. It sends payment, income, budget and risk alerts with
Redis-backed deduplication:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $NOTIFICATION_CRON_SECRET" \
  https://YOUR-SERVICE.up.railway.app/api/telegram/notifications
```

The cron secret must never be prefixed with `NEXT_PUBLIC_`.

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
