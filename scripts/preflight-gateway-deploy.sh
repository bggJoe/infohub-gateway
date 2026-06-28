#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAY_DIR="${ROOT_DIR}/apps/gateway"

required_env_vars=(
  GCP_PROJECT_ID
  GCP_REGION
  GCP_WORKLOAD_IDENTITY_PROVIDER
  GCP_DEPLOY_SERVICE_ACCOUNT
  GCP_RUNTIME_SERVICE_ACCOUNT
  CLOUD_RUN_SERVICE
  IAP_AUDIENCE
  ALLOWED_USERS
  N8N_JWT_AUDIENCE
)

required_secrets=(
  N8N_ACTION_ITEMS_URL
  N8N_JWT_PRIVATE_KEY_PEM
)

failures=0

info() {
  printf '[info] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1"
  failures=$((failures + 1))
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing command: $1"
  fi
}

info "Checking required commands"
require_command node
require_command npm
require_command docker
require_command git

if command -v gcloud >/dev/null 2>&1; then
  info "gcloud found"
else
  warn "gcloud not found; skip GCP secret existence checks"
fi

info "Checking required environment variables"
for name in "${required_env_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    fail "Missing env var: ${name}"
  fi
done

if [[ "${failures}" -gt 0 ]]; then
  printf '\nPreflight failed before local quality gates with %s issue(s).\n' "${failures}"
  exit 1
fi

info "Checking local Gateway quality gates"
(
  cd "${GATEWAY_DIR}"
  npm test
  npm run build
  npm audit --audit-level=moderate
  docker build -t infohub-gateway .
)

if [[ "${SKIP_GCP_SECRET_CHECK:-}" == "1" ]]; then
  warn "Skipping GCP Secret Manager checks because SKIP_GCP_SECRET_CHECK=1"
elif command -v gcloud >/dev/null 2>&1 && [[ -n "${GCP_PROJECT_ID:-}" ]]; then
  info "Checking required Secret Manager secret names"
  for secret in "${required_secrets[@]}"; do
    if gcloud secrets describe "${secret}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
      info "Secret exists: ${secret}"
    else
      fail "Missing Secret Manager secret: ${secret}"
    fi
  done
fi

if [[ "${failures}" -gt 0 ]]; then
  printf '\nPreflight failed with %s issue(s).\n' "${failures}"
  exit 1
fi

printf '\nPreflight passed.\n'
