#!/usr/bin/env bash
# push-worker-secrets.sh
# Same idea as push-secrets.sh, but targets Worker secrets instead of Pages
# secrets — these are a separate store, so Pages having them already set
# does not carry over.
#
# Usage: ./push-worker-secrets.sh .env.local

set -euo pipefail

ENV_FILE="${1:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Run this from your project root." >&2
  exit 1
fi

SECRET_KEYS=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "PROVIDER_API_KEY"
  "BREVO_API_KEY"
  "CRON_SECRET"
  "KORAPAY_SECRET_KEY"
)

while IFS='=' read -r raw_key raw_value; do
  key=$(echo "$raw_key" | xargs)
  [[ -z "$key" || "$key" =~ ^# ]] && continue

  is_secret=false
  for k in "${SECRET_KEYS[@]}"; do
    [ "$k" = "$key" ] && is_secret=true
  done
  [ "$is_secret" = false ] && continue

  value="${raw_value}"
  [ -z "$value" ] && { echo "Skipping $key (empty value)"; continue; }

  echo "Pushing Worker secret: $key"
  printf '%s' "$value" | npx wrangler secret put "$key"
done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")

echo
echo "Done. Verify with: npx wrangler secret list"
