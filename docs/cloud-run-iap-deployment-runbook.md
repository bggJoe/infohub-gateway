# Cloud Run + IAP Deployment Runbook

This runbook covers the external Google Cloud and GitHub setup required after the Gateway code is built and tested.

## Required Inputs

```text
GCP_PROJECT_ID
GCP_PROJECT_NUMBER
GCP_REGION
CLOUD_RUN_SERVICE
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
GCP_RUNTIME_SERVICE_ACCOUNT
IAP_AUDIENCE
ALLOWED_USERS
N8N_ACTION_ITEMS_URL
N8N_JWT_PRIVATE_KEY_PEM
N8N_JWT_AUDIENCE
N8N_JWT_ISSUER
N8N_JWT_SCOPE
N8N_JWT_TTL_SECONDS
```

## Google Cloud Resources

Create or confirm:

```text
Cloud Run service: infohub-gateway
Runtime service account: infohub-gateway-runtime
Deploy service account: github-actions-infohub-deploy
Workload Identity Pool
Workload Identity Provider for GitHub
Secret Manager secrets:
  N8N_ACTION_ITEMS_URL
  N8N_JWT_PRIVATE_KEY_PEM
IAP enabled for the Cloud Run endpoint
```

## Runtime Service Account

Grant only secret access needed by the Gateway:

```text
roles/secretmanager.secretAccessor
```

Scope secret access to:

```text
N8N_ACTION_ITEMS_URL
N8N_JWT_PRIVATE_KEY_PEM
```

## Deploy Service Account

Grant the GitHub Actions deploy identity:

```text
roles/run.admin
roles/iam.serviceAccountUser on the runtime service account
roles/artifactregistry.writer if the project uses Artifact Registry builds
```

Do not create or commit service account JSON keys.

## GitHub Repository Variables

Create repository variables:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
GCP_RUNTIME_SERVICE_ACCOUNT
CLOUD_RUN_SERVICE
IAP_AUDIENCE
ALLOWED_USERS
N8N_TIMEOUT_MS
N8N_MAX_RETRIES
N8N_JWT_AUDIENCE
N8N_JWT_ISSUER
N8N_JWT_SCOPE
N8N_JWT_TTL_SECONDS
```

`N8N_JWT_ISSUER`, `N8N_JWT_SCOPE`, `N8N_JWT_TTL_SECONDS`, `N8N_TIMEOUT_MS`, and `N8N_MAX_RETRIES` may be omitted; the workflow defaults to `infohub-gateway`, `infohub:action-items:read`, `60`, `8000`, and `1`.

## Secret Manager

Create secret versions:

```text
N8N_ACTION_ITEMS_URL
N8N_JWT_PRIVATE_KEY_PEM
```

The deploy workflow maps these to Cloud Run environment variables with `--update-secrets`.

n8n must verify Gateway-signed JWTs from:

```text
Authorization: Bearer <jwt>
```

Required JWT checks:

```text
alg = RS256
iss = N8N_JWT_ISSUER
aud = N8N_JWT_AUDIENCE
exp / iat
scope = N8N_JWT_SCOPE
method = GET
path = /api/action-items
email present
jti present
```

## IAP

Configure IAP so requests reaching the Gateway include:

```text
x-goog-iap-jwt-assertion
```

Set the app env var:

```text
IAP_AUDIENCE=/projects/{PROJECT_NUMBER}/locations/{REGION}/services/{SERVICE_NAME}
```

Grant IAP access only to the intended Google identities. Keep `ALLOWED_USERS` in the app as a second allowlist layer.

## Deployment Verification

Before triggering GitHub Actions, run local preflight with the required non-secret environment variables exported:

```bash
scripts/preflight-gateway-deploy.sh
```

The script runs tests, build, audit, Docker build, and checks required Secret Manager secret names when `gcloud` is available. It does not print secret values.

To run only local gates before GCP login is ready:

```bash
SKIP_GCP_SECRET_CHECK=1 scripts/preflight-gateway-deploy.sh
```

Trigger deployment manually from GitHub Actions:

```text
Actions > Deploy Gateway > Run workflow
```

Regular pushes run `Gateway CI`; they do not deploy to Cloud Run.

After GitHub Actions deploys successfully:

```text
GET /api/health
```

Expected:

```json
{
  "ok": true,
  "service": "infohub-gateway",
  "version": "0.1.0"
}
```

Verify auth and data minimization:

```text
Unauthenticated request: rejected by IAP or Gateway
Valid IAP user not in ALLOWED_USERS: 403
Valid IAP user in ALLOWED_USERS: 200
GET /api/action-items?status=new&limit=50: returns only allowlisted fields
GET /api/action-items?status=invalid: 400
GET /api/action-items?limit=51: 400
n8n unavailable or slow: safe upstream error without n8n URL, downstream JWT, private key, or legacy header secret
```

## Rotation

Rotate the Gateway downstream JWT private key by adding a new Secret Manager version and updating n8n to trust the corresponding public key. No code change is required.
