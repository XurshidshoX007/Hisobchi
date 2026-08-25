#!/bin/sh
set -eu

require_env() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"
  if [ -z "$var_value" ]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
}

require_env DATABASE_URL
require_env REDIS_URL
require_env LOG_HASH_SECRET
require_env NOTIFICATION_CRON_SECRET

# APP_URL — Mini App'ning (frontend) ommaviy HTTPS manzili.
# Eski NEXT_PUBLIC_APP_URL nomi ham qabul qilinadi (bitta qiymat bo'lishi kerak).
app_url="${APP_URL:-${NEXT_PUBLIC_APP_URL:-}}"
if [ -z "$app_url" ]; then
  echo "Missing required environment variable: APP_URL" >&2
  exit 1
fi
if [ -n "${APP_URL:-}" ] && [ -n "${NEXT_PUBLIC_APP_URL:-}" ] && [ "$APP_URL" != "$NEXT_PUBLIC_APP_URL" ]; then
  echo "APP_URL and NEXT_PUBLIC_APP_URL must be identical" >&2
  exit 1
fi
export APP_URL="$app_url"

if [ "${#LOG_HASH_SECRET}" -lt 32 ]; then
  echo "LOG_HASH_SECRET must be at least 32 characters" >&2
  exit 1
fi
if [ "${#NOTIFICATION_CRON_SECRET}" -lt 32 ]; then
  echo "NOTIFICATION_CRON_SECRET must be at least 32 characters" >&2
  exit 1
fi

# Support canonical Railway names, while keeping TELEGRAM_* aliases compatible.
bot_token="${BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
webhook_secret="${WEBHOOK_SECRET:-${TELEGRAM_WEBHOOK_SECRET:-}}"
if [ -z "$bot_token" ]; then
  echo "Missing required environment variable: BOT_TOKEN" >&2
  exit 1
fi
if [ -z "$webhook_secret" ]; then
  echo "Missing required environment variable: WEBHOOK_SECRET" >&2
  exit 1
fi
if [ -n "${WEBHOOK_SECRET:-}" ] && [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ] && [ "$WEBHOOK_SECRET" != "$TELEGRAM_WEBHOOK_SECRET" ]; then
  echo "WEBHOOK_SECRET and TELEGRAM_WEBHOOK_SECRET must be identical" >&2
  exit 1
fi
if [ "${#webhook_secret}" -lt 32 ] || [ "${#webhook_secret}" -gt 256 ]; then
  echo "WEBHOOK_SECRET must be 32-256 characters" >&2
  exit 1
fi
case "$webhook_secret" in
  *[!A-Za-z0-9_-]*) echo "WEBHOOK_SECRET contains characters Telegram does not allow" >&2; exit 1 ;;
esac

if [ "${ALLOW_DEMO_IN_PRODUCTION:-false}" = "true" ]; then
  echo "ALLOW_DEMO_IN_PRODUCTION must not be enabled in production" >&2
  exit 1
fi

case "$APP_URL" in
  https://*) ;;
  *) echo "APP_URL must use HTTPS" >&2; exit 1 ;;
esac

# Railway runs the migration once as its pre-deploy step.
# Do not run it again here: Railway can start/restart a container while another
# deployment is still finishing, and concurrent schema changes can deadlock or
# fail the otherwise healthy container.
exec node --import tsx src/index.ts
