# Codex Task: Implement InfoHub Gateway

## Role

You are implementing a security-focused Gateway / Backend for InfoHub.

Read these files first:

```text
specs/004-infohub-gateway/spec.md
specs/004-infohub-gateway/technical-spec.md
specs/004-infohub-gateway/security-requirements.md
specs/004-infohub-gateway/recommended-cloud-run-iap-plan.md
docs/architecture-infohub-gateway.md
docs/security-boundary.md
```

## Task

Implement `apps/gateway`.

## Required implementation

Create:

```text
apps/gateway/
  package.json
  tsconfig.json
  Dockerfile
  README.md
  .env.example
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
      redaction.test.ts
      validation.test.ts
      allowlist.test.ts
      n8n-client.test.ts
```

## Tech stack

Recommended:

```text
Node.js 22
TypeScript
Fastify
Vitest
jose
pino
undici or native fetch
```

## Routes

### GET /api/health

Return:

```json
{
  "ok": true,
  "service": "infohub-gateway",
  "version": "0.1.0"
}
```

### GET /api/action-items

Validate:

```text
status: new | reviewed | done | ignored
limit: 1..50
```

Call n8n:

```text
N8N_ACTION_ITEMS_URL
N8N_AUTH_MODE=jwt
N8N_JWT_PRIVATE_KEY_PEM
N8N_JWT_ISSUER
N8N_JWT_AUDIENCE
N8N_JWT_SCOPE
N8N_JWT_TTL_SECONDS
```

Gateway must call n8n with:

```text
Authorization: Bearer <gateway-signed-jwt>
```

JWT claims:

```text
iss, aud, sub, email, scope, method, path, iat, exp, jti
```

Use RS256 and default `exp` to 60 seconds. Preserve `N8N_AUTH_MODE=header` only as legacy fallback.

Return only Dashboard-safe JSON.

## Auth

Implement:

```text
AUTH_MODE=dev
AUTH_MODE=iap
```

### dev mode

Use:

```text
DEV_USER_EMAIL
```

Still enforce `ALLOWED_USERS`.

### iap mode

Verify:

```text
x-goog-iap-jwt-assertion
```

Checks:

```text
signature
iss = https://cloud.google.com/iap
aud = IAP_AUDIENCE
exp
iat
email exists
email in ALLOWED_USERS
```

Do not trust unsigned identity headers alone.

## Security

Must pass:

- No n8n URL, legacy header secret, or downstream JWT private key in frontend.
- No raw email body in response.
- No arbitrary n8n path.
- No arbitrary query passthrough.
- Fail closed.
- Production error does not leak internal details.

## Tests

Implement tests for:

```text
redaction
status validation
limit validation
allowlist
dev auth
missing IAP JWT
n8n timeout / upstream failure
```

## GitHub Actions

Add template workflow:

```text
.github/workflows/deploy-gateway.yml
```

Use OIDC / WIF placeholders:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
CLOUD_RUN_SERVICE
```

Workflow must not require service account JSON key.

## Documentation

`apps/gateway/README.md` must include:

- local dev instructions
- env vars
- security model
- deployment assumptions
- how to test
- what not to expose

## Definition of Done

- `npm test` passes.
- `npm run build` passes.
- Dockerfile builds.
- README exists.
- `.env.example` contains no secrets.
- `GET /api/health` works.
- `GET /api/action-items` works in dev mode using mocked or configured n8n.
- Security requirements are explicitly addressed.
