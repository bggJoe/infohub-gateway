# InfoHub Gateway

Security-focused backend for InfoHub Dashboard. The Gateway authenticates the caller, enforces an email allowlist, calls the n8n Action Items API with a server-side secret, and returns only Dashboard-safe JSON.

## Local Development

```bash
cd apps/gateway
npm install
cp .env.example .env
npm run dev
```

Use dev auth locally:

```text
AUTH_MODE=dev
DEV_USER_EMAIL=joelovesband@gmail.com
ALLOWED_USERS=joelovesband@gmail.com
```

Health check:

```bash
curl http://localhost:8080/api/health
```

Action items:

```bash
curl "http://localhost:8080/api/action-items?status=new&limit=50"
```

## Environment Variables

```text
NODE_ENV=production
PORT=8080
AUTH_MODE=iap
IAP_AUDIENCE=/projects/{PROJECT_NUMBER}/locations/{REGION}/services/infohub-gateway
ALLOWED_USERS=joelovesband@gmail.com
N8N_ACTION_ITEMS_URL=https://...
N8N_API_AUTH_HEADER_NAME=x-infohub-api-key
N8N_API_AUTH_HEADER_VALUE=...
N8N_TIMEOUT_MS=8000
N8N_MAX_RETRIES=1
LOG_LEVEL=info
```

`N8N_ACTION_ITEMS_URL`, `N8N_API_AUTH_HEADER_NAME`, and `N8N_API_AUTH_HEADER_VALUE` should come from Secret Manager or another deployment secret store in production.

## Security Model

Production uses `AUTH_MODE=iap`. The app verifies `x-goog-iap-jwt-assertion` with Google's IAP public JWKs and checks:

- JWT signature
- `iss = https://cloud.google.com/iap`
- `aud = IAP_AUDIENCE`
- `exp` / `iat`
- `email` exists
- `email` is in `ALLOWED_USERS`

The Gateway does not trust `x-goog-authenticated-user-email` by itself.

## API

`GET /api/health` returns:

```json
{
  "ok": true,
  "service": "infohub-gateway",
  "version": "0.1.0"
}
```

`GET /api/action-items` accepts only:

```text
status=new|reviewed|done|ignored
limit=1..50
```

The Gateway always sends `action_required=true` to n8n and never passes arbitrary query parameters through.

## Output Redaction

Responses include only these fields:

```text
id
source
source_type
source_group
category
priority
status
action_required
action_text
summary
subject
sender
received_at
entities
topics
confidence
needs_human_review
source_url
message_id
thread_id
```

Do not expose raw email bodies, Gmail headers, attachments, n8n URLs, API secrets, tokens, or arbitrary upstream response fields.

## Observability

The Gateway writes structured JSON logs with request-level metadata:

```text
request_id
method
path
status_code
duration_ms
user_email
n8n_status
error_code
```

Logs do not include full request headers, n8n secrets, raw email bodies, attachments, or raw n8n responses.

## Test And Build

```bash
npm test
npm run build
docker build -t infohub-gateway .
```

## Deployment Assumptions

The recommended deployment is Cloud Run + IAP + Secret Manager + GitHub Actions OIDC / Workload Identity Federation.

GitHub Actions should use:

```yaml
permissions:
  contents: read
  id-token: write
```

Do not use long-lived Google Cloud service account JSON keys.

### GitHub Repository Variables

Create these repository variables before running `.github/workflows/deploy-gateway.yml`:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
CLOUD_RUN_SERVICE
IAP_AUDIENCE
ALLOWED_USERS
```

### Google Secret Manager

Create these Secret Manager secrets in the target Google Cloud project:

```text
N8N_ACTION_ITEMS_URL
N8N_API_AUTH_HEADER_NAME
N8N_API_AUTH_HEADER_VALUE
```

The workflow references `latest` for each secret. Rotate by adding a new secret version, not by changing code.

### Pre-deploy Verification

Run locally before deployment:

```bash
npm test
npm run build
npm audit --audit-level=moderate
docker build -t infohub-gateway .
```

Docker verification requires Docker Desktop or another Docker daemon to be running.
