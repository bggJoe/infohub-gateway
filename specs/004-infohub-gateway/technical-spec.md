# Technical Spec: InfoHub Gateway

## 1. Runtime

推薦：

```text
Node.js 22 LTS
TypeScript
Fastify
```

可接受替代：

```text
Express
Hono
Spring Boot
```

第一版推薦 TypeScript 是因為 Gateway 很薄，且容易與 Frontend / Codex 工作流整合。

## 2. Repo structure

```text
apps/
  gateway/
    package.json
    tsconfig.json
    Dockerfile
    src/
      server.ts
      config.ts
      routes/
        health.ts
        action-items.ts
      auth/
        auth-context.ts
        verify-iap.ts
        dev-auth.ts
        allowlist.ts
      clients/
        n8n-client.ts
      security/
        redaction.ts
        headers.ts
        validation.ts
      logging/
        logger.ts
      tests/
        action-items.test.ts
        redaction.test.ts
        allowlist.test.ts
        iap-auth.test.ts
    README.md

specs/
  004-infohub-gateway/
    spec.md
    technical-spec.md
    security-requirements.md
    deployment-options.md
    recommended-cloud-run-iap-plan.md
    codex-task.md
```

## 3. Environment variables

```text
NODE_ENV=production
PORT=8080

AUTH_MODE=iap
IAP_AUDIENCE=/projects/{PROJECT_NUMBER}/locations/{REGION}/services/{SERVICE_NAME}
ALLOWED_USERS=joelovesband@gmail.com

N8N_ACTION_ITEMS_URL=https://...
N8N_API_AUTH_HEADER_NAME=x-infohub-api-key
N8N_API_AUTH_HEADER_VALUE=...
N8N_TIMEOUT_MS=8000
N8N_MAX_RETRIES=1

LOG_LEVEL=info
```

Local dev：

```text
AUTH_MODE=dev
DEV_USER_EMAIL=joelovesband@gmail.com
```

## 4. API routes

### GET /api/health

Public in dev mode.  
In production with IAP, it can still be protected by IAP, but app should not require n8n connectivity for health.

Response:

```json
{
  "ok": true,
  "service": "infohub-gateway",
  "version": "0.1.0"
}
```

### GET /api/action-items

Request:

```http
GET /api/action-items?status=new&limit=50
```

Validation:

```text
status in new | reviewed | done | ignored
limit numeric, 1..50
```

Internal call to n8n:

```http
GET {N8N_ACTION_ITEMS_URL}?status={status}&limit={limit}
{N8N_API_AUTH_HEADER_NAME}: {N8N_API_AUTH_HEADER_VALUE}
```

Gateway response:

```json
{
  "ok": true,
  "count": 2,
  "filters": {
    "status": "new",
    "limit": 50,
    "action_required": true
  },
  "data": []
}
```

## 5. Auth flow

```text
Request
  ↓
extract x-goog-iap-jwt-assertion
  ↓
verify JWT signature / issuer / audience / exp / iat
  ↓
extract email
  ↓
check ALLOWED_USERS
  ↓
continue route
```

For local dev:

```text
AUTH_MODE=dev
  ↓
use DEV_USER_EMAIL
  ↓
check ALLOWED_USERS
```

## 6. IAP JWT validation

Use one of:

```text
jose
google-auth-library
```

Required checks:

```text
JWT exists
signature valid
alg = ES256
iss = https://cloud.google.com/iap
aud = IAP_AUDIENCE
exp valid
iat valid
email exists
```

JWK endpoint:

```text
https://www.gstatic.com/iap/verify/public_key-jwk
```

## 7. Redaction policy

Implement `redactActionItem(row)`.

Allowed fields only:

```ts
const allowedFields = [
  "id",
  "source",
  "source_type",
  "source_group",
  "category",
  "priority",
  "status",
  "action_required",
  "action_text",
  "summary",
  "subject",
  "sender",
  "received_at",
  "entities",
  "topics",
  "confidence",
  "needs_human_review",
  "source_url",
  "message_id",
  "thread_id",
];
```

All other fields must be dropped.

## 8. Error model

Response shape:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required"
  }
}
```

Error codes:

```text
AUTH_REQUIRED
AUTH_INVALID
FORBIDDEN
BAD_REQUEST
N8N_UPSTREAM_ERROR
N8N_TIMEOUT
INTERNAL_ERROR
```

Do not include stack trace in production response.

## 9. Logging

Use structured JSON logs.

Required fields:

```text
request_id
method
path
status_code
duration_ms
user_email
error_code
```

Forbidden in logs:

```text
N8N_API_AUTH_HEADER_VALUE
raw email body
request authorization headers
full n8n response
```

## 10. Testing

Unit tests:

```text
redaction.test.ts
validation.test.ts
allowlist.test.ts
n8n-client.test.ts
auth-dev.test.ts
auth-iap-missing-token.test.ts
```

Integration test with mocked n8n:

```text
GET /api/action-items returns only redacted fields.
GET /api/action-items?status=invalid returns 400.
GET /api/action-items?limit=1000 clamps to 50 or returns 400.
```

## 11. Dockerfile requirement

Use multi-stage build.

Runtime image must not include dev dependencies where practical.

Expose:

```text
PORT=8080
```
