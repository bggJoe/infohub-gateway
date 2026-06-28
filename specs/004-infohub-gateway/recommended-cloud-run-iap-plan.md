# Recommended Deployment Plan: Cloud Run + IAP + Secret Manager + GitHub Actions OIDC

## 1. Recommended architecture

```text
GitHub repo
  ↓
GitHub Actions
  ↓
Workload Identity Federation
  ↓
Cloud Run deploy
  ↓
IAP protects Cloud Run
  ↓
Gateway verifies x-goog-iap-jwt-assertion
  ↓
Gateway calls n8n Action Items API
```

## 2. Required Google Cloud resources

```text
Google Cloud project
Cloud Run service: infohub-gateway
Secret Manager secrets:
  - N8N_ACTION_ITEMS_URL
  - N8N_JWT_PRIVATE_KEY_PEM
Workload Identity Pool
Workload Identity Provider for GitHub
Deploy service account
Runtime service account
IAP enabled on Cloud Run
```

## 3. Runtime service account

Recommended name:

```text
infohub-gateway-runtime
```

Permissions:

```text
roles/secretmanager.secretAccessor
```

Only for the required secrets.

## 4. Deploy service account

Recommended name:

```text
github-actions-infohub-deploy
```

Minimum likely permissions:

```text
roles/run.admin
roles/iam.serviceAccountUser on runtime service account
roles/artifactregistry.writer if using Artifact Registry
```

Prefer Workload Identity Federation over long-lived JSON key.

## 5. Cloud Run settings

```text
Service name: infohub-gateway
Region: asia-east1 or asia-northeast1
Port: 8080
Min instances: 0 for MVP
Max instances: small cap, e.g. 2 or 3
Ingress: prefer IAP-protected Cloud Run endpoint
Authentication: IAP
```

If using IAP directly on Cloud Run, ensure the IAP service account can invoke Cloud Run.

## 6. Environment variables

```text
NODE_ENV=production
PORT=8080
AUTH_MODE=iap
IAP_AUDIENCE=/projects/{PROJECT_NUMBER}/locations/{REGION}/services/infohub-gateway
ALLOWED_USERS=joelovesband@gmail.com
N8N_TIMEOUT_MS=8000
N8N_MAX_RETRIES=1
N8N_AUTH_MODE=jwt
N8N_JWT_ISSUER=infohub-gateway
N8N_JWT_AUDIENCE=infohub-n8n
N8N_JWT_SCOPE=infohub:action-items:read
N8N_JWT_TTL_SECONDS=60
LOG_LEVEL=info
```

Secrets:

```text
N8N_ACTION_ITEMS_URL
N8N_JWT_PRIVATE_KEY_PEM
```

## 7. GitHub Actions workflow

Create:

```text
.github/workflows/deploy-gateway.yml
```

Required characteristics:

```yaml
permissions:
  contents: read
  id-token: write
```

High-level steps:

```text
checkout
setup node
install
test
build
authenticate to Google Cloud via WIF
deploy to Cloud Run
```

## 8. Codex implementation tasks

1. Implement Gateway app.
2. Add tests.
3. Add Dockerfile.
4. Add GitHub Actions deploy workflow template.
5. Add README with env vars and deployment steps.
6. Add security checklist.
7. Add sample `.env.example` without secrets.

## 9. Deployment acceptance tests

### 9.1 Auth

- [ ] Without IAP / without valid JWT: request rejected.
- [ ] With valid IAP user not in allowlist: 403.
- [ ] With valid IAP user in allowlist: 200.

### 9.2 Data minimization

- [ ] Response does not contain `body_excerpt`.
- [ ] Response does not contain `html`.
- [ ] Response does not contain `headers`.
- [ ] Response does not contain `attachments`.

### 9.3 Gateway behavior

- [ ] `GET /api/health` works.
- [ ] `GET /api/action-items?status=new&limit=50` works.
- [ ] Invalid `status` returns 400.
- [ ] `limit > 50` does not return more than 50.
- [ ] n8n timeout returns safe error.

### 9.4 Logging

- [ ] Logs contain route / status / duration.
- [ ] Logs do not contain n8n secret.
- [ ] Logs do not contain raw email body.
