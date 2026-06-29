# Security Requirements: InfoHub Gateway

## 1. Threat model

### Assets

```text
n8n Webhook URL
n8n downstream JWT private key
Gmail-derived summaries
Action items
User identity
Data Table metadata
```

### Threats

```text
Browser exfiltrates n8n URL, legacy header secret, downstream JWT private key, or downstream JWT
Unauthenticated user calls n8n webhook
Forged identity header
Prompt-injected email content appears in Dashboard
Frontend requests arbitrary n8n query
Excessive data exposure
Leaky logs
CSRF on future write API
Overly broad GitHub Actions cloud permissions
```

## 2. Security controls

### SC-001: No direct n8n access from Frontend

Frontend must call only Gateway routes.

### SC-002: Gateway-held n8n credential

Production must use:

```text
N8N_AUTH_MODE=jwt
```

`N8N_JWT_PRIVATE_KEY_PEM` must be stored in Secret Manager or a deployment secret store.

Gateway must sign a short-lived RS256 JWT for n8n with:

```text
iss
aud
sub
email
scope
method
path
iat
exp
jti
```

Default `exp` is 60 seconds after `iat`.

Legacy `N8N_AUTH_MODE=header` is retained only as fallback outside production.

Private keys, JWTs, and legacy header secrets must never be committed to GitHub.

### SC-003: IAP JWT validation

Production must use:

```text
AUTH_MODE=iap
```

Gateway must verify:

```text
x-goog-iap-jwt-assertion
```

Do not trust `x-goog-authenticated-user-email` alone.

### SC-004: Email allowlist

Only email addresses in `ALLOWED_USERS` can access data.

### SC-005: Route allowlist

Only implement:

```text
GET /api/health
GET /api/action-items
```

All unknown routes return 404.

### SC-006: Query allowlist

Only allow:

```text
status
limit
```

Do not pass arbitrary query to n8n.

### SC-007: Output allowlist

Gateway must construct output object explicitly.

Do not forward n8n response as-is.

### SC-008: Data minimization

Do not return:

```text
raw email body
full Gmail headers
attachments
secrets
tokens
```

### SC-009: Security headers

Required response headers:

```text
Cache-Control: no-store
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

### SC-010: Error hygiene

Production error responses must not include:

```text
stack trace
n8n URL
legacy n8n header secret
downstream JWT private key
downstream JWT
raw upstream response
```

### SC-011: GitHub Actions hardening

Deployment should use OIDC / Workload Identity Federation instead of long-lived Google Cloud service account keys.

GitHub Actions permissions should be least privilege:

```yaml
permissions:
  contents: read
  id-token: write
```

### SC-012: Secret rotation

n8n Gateway downstream JWT private key must be rotatable without code change.

### SC-013: Future write API protection

Any future `POST /api/action-items/:id/status` must require:

```text
same auth controls
CSRF strategy or same-site session design
allowed status transition
audit log
id validation
no arbitrary field update
```

## 3. Security acceptance checklist

- [ ] No n8n URL, legacy header secret, or downstream JWT private key in frontend bundle.
- [ ] No n8n URL, legacy header secret, or downstream JWT private key in repo.
- [ ] IAP JWT validation implemented.
- [ ] `ALLOWED_USERS` enforced.
- [ ] Unauthorized request fails closed.
- [ ] Redaction test proves forbidden fields are dropped.
- [ ] n8n timeout handled.
- [ ] n8n error does not leak secret.
- [ ] Logs do not contain raw email body.
- [ ] GitHub Actions uses OIDC / WIF or equivalent secretless deployment.
