# Implementation Status: InfoHub Gateway

Last updated: 2026-06-28

## Local Implementation

| Checklist item | Status | Evidence |
|---|---:|---|
| `apps/gateway` exists | Done | `apps/gateway` committed |
| TypeScript build passes | Done | `npm run build` |
| Tests pass | Done | `npm test` |
| Dockerfile builds | Done | `docker build -t infohub-gateway .` |
| README exists | Done | `apps/gateway/README.md` |
| `.env.example` exists and contains no secrets | Done | `apps/gateway/.env.example` uses placeholders only |

## API

| Checklist item | Status | Evidence |
|---|---:|---|
| `GET /api/health` returns 200 | Done | route test and manual HTTP check |
| `GET /api/action-items` supports `status` | Done | route and validation tests |
| `GET /api/action-items` supports `limit` | Done | route and validation tests |
| invalid `status` returns 400 | Done | route and validation tests |
| `limit` cannot exceed 50 | Done | route and validation tests |
| unknown route returns 404 | Done | route test |

## Auth

| Checklist item | Status | Evidence |
|---|---:|---|
| `AUTH_MODE=dev` works locally | Done | route and config tests |
| production requires `AUTH_MODE=iap` | Done | config test |
| `AUTH_MODE=iap` requires IAP JWT | Done | route and config tests |
| invalid IAP JWT fails | Done | route test |
| valid signed IAP JWT works | Done | route test with ES256 JWT and seeded JWKS |
| email not in allowlist returns 403 | Done | dev and signed IAP route tests |
| unsigned identity headers alone are not trusted | Done | route test |

## n8n

| Checklist item | Status | Evidence |
|---|---:|---|
| Gateway calls n8n using server-side credential only | Done | `N8nClient` signs short-lived RS256 JWTs or uses legacy header fallback |
| n8n URL is not exposed to frontend | Done | error tests assert URL is not returned |
| n8n error is handled safely | Done | client and route tests |
| n8n timeout is handled safely | Done | client and route tests |

## Redaction

| Checklist item | Status | Evidence |
|---|---:|---|
| response contains only allowed fields | Done | redaction and route tests |
| response does not include `body_excerpt` | Done | redaction test |
| response does not include `html` | Done | redaction and route tests |
| response does not include `headers` | Done | redaction and route tests |
| response does not include `attachments` | Done | redaction and route tests |
| response does not include `secret` | Done | redaction and route tests |

## Deployment

| Checklist item | Status | Evidence |
|---|---:|---|
| GitHub Actions uses OIDC / WIF | Done | `.github/workflows/deploy-gateway.yml` uses `id-token: write` and `google-github-actions/auth` |
| no long-lived service account JSON key | Done | workflow has no JSON key input |
| Cloud Run env vars configured | Ready for external config | workflow writes env-vars YAML from GitHub repository variables |
| Secret Manager configured | Requires GCP project/secrets | create `N8N_ACTION_ITEMS_URL`, `N8N_JWT_PRIVATE_KEY_PEM` |
| IAP enabled | Requires GCP/IAP setup | configure Cloud Run IAP and `IAP_AUDIENCE`; workflow deploys with `--no-allow-unauthenticated` |
| only allowlisted users can access | Ready for external config | set `ALLOWED_USERS`, IAP policy, and `GCP_RUNTIME_SERVICE_ACCOUNT` |
