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
require_env NEXT_PUBLIC_APP_URL
require_env LOG_HASH_SECRET
require_env NOTIFICATION_CRON_SECRET

# Support canonical Railway names, while keeping TELEGRAM_* aliases compatible.
if [ -z "${BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}" ]; then
  echo "Missing required environment variable: BOT_TOKEN" >&2
  exit 1
fi
if [ -z "${WEBHOOK_SECRET:-${TELEGRAM_WEBHOOK_SECRET:-}}" ]; then
  echo "Missing required environment variable: WEBHOOK_SECRET" >&2
  exit 1
fi

if [ "${ALLOW_DEMO_IN_PRODUCTION:-false}" = "true" ]; then
  echo "ALLOW_DEMO_IN_PRODUCTION must not be enabled in production" >&2
  exit 1
fi

case "$NEXT_PUBLIC_APP_URL" in
  https://*) ;;
  *) echo "NEXT_PUBLIC_APP_URL must use HTTPS" >&2; exit 1 ;;
esac

# Railway runs the migration once as its pre-deploy step (railway.json).
# Do not run it again here: Railway can start/restart a container while another
# deployment is still finishing, and concurrent schema changes can deadlock or
# fail the otherwise healthy container.
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
