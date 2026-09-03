#!/usr/bin/env bash
# push-secrets.sh
# Reads .env.local and pushes each server-side secret into your Cloudflare
# Pages project using `wrangler pages secret put`.
#
# Usage:
#   chmod +x push-secrets.sh
#   ./push-secrets.sh ryzel .env.local
#
# Run this from your project root (/mnt/c/dev/ryzel), where .env.local lives.
# Requires: wrangler already authenticated (CLOUDFLARE_API_TOKEN /
# CLOUDFLARE_ACCOUNT_ID exported, or `wrangler login` already done).

set -euo pipefail

PROJECT_NAME="${1:-ryzel}"
ENV_FILE="${2:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Run this from your project root or pass a path." >&2
  exit 1
fi

# Vars that are safe as PLAIN Pages env vars (not secrets) because they're
# already NEXT_PUBLIC_* (shipped to the browser) or genuinely non-sensitive.
# These should be set via `wrangler pages project` / dashboard "Environment
# Variables", not as secrets. We skip them here.
PUBLIC_OR_HARMLESS_KEYS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "NEXT_PUBLIC_APP_URL"
  "ADMIN_EMAILS"
  "CORS_ORIGINS"
  "NUMBERS_PROVIDER"
  "PROVIDER"
  "PROVIDER_BASE_URL"
  "PROVIDER_FALLBACK"
  "ORDER_TIMEOUT_SECONDS"
  "USD_NGN_RATE"
  "FIVESIM_RATE_TO_WALLET_MINOR_UNITS"
  "BREVO_SENDER_NAME"
  "BREVO_SENDER_EMAIL"
  "PAYMENTS_PROVIDER"
  "KORAPAY_PUBLIC_KEY"
  "KORAPAY_DEFAULT_CURRENCY"
  "KORAPAY_REDIRECT_URL"
  "INVOICE_FEE_NGN"
  "TRACKER_FEE_NGN"
  "MARKUP_PERCENT"
  "MARKUP_FLAT_NGN"
  "MIN_PRICE_NGN"
  "ENVIRONMENT"
)

is_public() {
  local key="$1"
  for k in "${PUBLIC_OR_HARMLESS_KEYS[@]}"; do
    [ "$k" = "$key" ] && return 0
  done
  return 1
}

echo "Project: $PROJECT_NAME"
echo "Reading: $ENV_FILE"
echo

while IFS='=' read -r raw_key raw_value; do
  # skip blank lines and comments
  [[ -z "$raw_key" || "$raw_key" =~ ^[[:space:]]*# ]] && continue

  key=$(echo "$raw_key" | xargs)
  value="${raw_value#*=}"
  # handle KEY=VALUE where VALUE may itself contain '='
  value="${raw_value}"
  # trim leading/trailing whitespace from value only (not touching content)
  value="$(echo -n "$value" | sed -e 's/^[[:space:]]*//')"

  [ -z "$key" ] && continue
  [ -z "$value" ] && { echo "Skipping $key (empty value)"; continue; }

  if is_public "$key"; then
    echo "Skipping $key (public/non-secret — set via Pages env vars or dashboard instead)"
    continue
  fi

  echo "Pushing secret: $key"
  printf '%s' "$value" | npx wrangler pages secret put "$key" --project-name="$PROJECT_NAME"
done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")

echo
echo "Done. Verify with: npx wrangler pages secret list --project-name=$PROJECT_NAME"
