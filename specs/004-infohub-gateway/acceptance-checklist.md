# Acceptance Checklist

## 開發完成

- [ ] `apps/gateway` exists.
- [ ] TypeScript build passes.
- [ ] Tests pass.
- [ ] Dockerfile builds.
- [ ] README exists.
- [ ] `.env.example` exists and contains no secrets.

## API

- [ ] `GET /api/health` returns 200.
- [ ] `GET /api/action-items` supports `status`.
- [ ] `GET /api/action-items` supports `limit`.
- [ ] invalid `status` returns 400.
- [ ] `limit` cannot exceed 50.
- [ ] unknown route returns 404.

## Auth

- [ ] `AUTH_MODE=dev` works locally.
- [ ] `AUTH_MODE=iap` requires IAP JWT.
- [ ] invalid IAP JWT fails.
- [ ] email not in allowlist returns 403.
- [ ] unsigned identity headers alone are not trusted.

## n8n

- [ ] Gateway calls n8n using `Authorization: Bearer <gateway-signed-jwt>` in production.
- [ ] Downstream JWT contains `iss`, `aud`, `sub`, `email`, `scope`, `method`, `path`, `iat`, `exp`, and `jti`.
- [ ] Production rejects legacy `N8N_AUTH_MODE=header`.
- [ ] n8n URL is not exposed to frontend.
- [ ] n8n error is handled safely.
- [ ] n8n timeout is handled safely.

## Redaction

- [ ] response contains only allowed fields.
- [ ] response does not include `body_excerpt`.
- [ ] response does not include `html`.
- [ ] response does not include `headers`.
- [ ] response does not include `attachments`.
- [ ] response does not include `secret`.

## Deployment

- [ ] GitHub Actions uses OIDC / WIF.
- [ ] no long-lived service account JSON key.
- [ ] Cloud Run env vars configured.
- [ ] Secret Manager configured.
- [ ] IAP enabled.
- [ ] only allowlisted users can access.
