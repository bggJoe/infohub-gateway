# Spec: InfoHub Gateway

## 1. 背景

目前已建立 n8n Gmail intake workflow，能把 `action_required` email 轉成 `info_items`。  
下一步需要一個中介 Gateway，讓 Frontend Dashboard 可以安全讀取整理後的 action items。

這個 Gateway 不是資料分析器，也不是 Gmail reader。  
它是資安邊界與應用 backend。

## 2. 目標

建立一個可由 GitHub / Codex 開發與維護的 Gateway application。

Gateway 必須：

1. 接收 Frontend request。
2. 驗證使用者身份。
3. 檢查使用者 email allowlist。
4. 呼叫 n8n Action Items API。
5. 過濾與遮罩 n8n 回傳資料。
6. 回傳 Dashboard-safe JSON。
7. 不讓 Frontend 直接接觸 n8n URL、legacy header secret 或 downstream JWT private key。

## 3. Non-goals

本階段不做：

- 不直接讀 Gmail。
- 不直接寫 Gmail。
- 不建立新的 LLM 分析流程。
- 不建立 write API。
- 不處理 action item status update。
- 不做多使用者 RBAC。
- 不做完整前端 Dashboard。
- 不做 Dify RAG / knowledge base。

## 4. Persona

### Primary user

個人使用者 / developer / platform engineer，透過 Dashboard 查看每日 action items。

### Secondary actor

Codex / AI coding agent，需要讀 spec 後實作 Gateway。

## 5. Functional Requirements

### FR-001: Health check

提供：

```http
GET /api/health
```

回傳：

```json
{
  "ok": true,
  "service": "infohub-gateway",
  "version": "0.1.0"
}
```

### FR-002: Action items read API

提供：

```http
GET /api/action-items?status=new&limit=50
```

預設：

```text
status = new
limit = 50
```

允許：

```text
status: new | reviewed | done | ignored
limit: 1..50
```

固定條件：

```text
action_required = true
```

### FR-003: n8n client

Gateway 應呼叫既有 n8n Action Items API。

n8n URL 與 downstream JWT signing key 必須由環境變數或 Secret Manager 注入。

```text
N8N_ACTION_ITEMS_URL
N8N_AUTH_MODE=jwt
N8N_JWT_PRIVATE_KEY_PEM
N8N_JWT_ISSUER
N8N_JWT_AUDIENCE
N8N_JWT_SCOPE
N8N_JWT_TTL_SECONDS
```

Gateway 呼叫 n8n 時使用：

```text
Authorization: Bearer <gateway-signed-jwt>
```

JWT 必須使用 RS256，且包含：

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

`exp` 預設 60 秒。`N8N_AUTH_MODE=header` 僅保留為 legacy fallback。

### FR-004: Output redaction

Gateway 只允許回傳以下欄位：

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

不得回傳：

```text
body
body_raw
body_excerpt
textPlain
textHtml
html
headers
attachments
credential
token
secret
raw
```

### FR-005: Identity

推薦方案中 Gateway 應驗證 Google IAP JWT：

```text
x-goog-iap-jwt-assertion
```

並從 verified JWT payload 取得：

```text
email
sub
```

不可單獨信任：

```text
x-goog-authenticated-user-email
```

### FR-006: Allowlist

Gateway 必須支援 email allowlist：

```text
ALLOWED_USERS=joelovesband@gmail.com,another@example.com
```

若使用者 email 不在 allowlist，回傳：

```http
403 Forbidden
```

### FR-007: Security headers

所有 JSON API 回應至少包含：

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

若未來同時 serve frontend HTML，再補：

```http
Content-Security-Policy
X-Frame-Options 或 CSP frame-ancestors
```

## 6. Non-functional Requirements

### NFR-001: Minimal attack surface

Gateway 只提供 allowlisted routes。  
所有未知 path 回傳 404。

### NFR-002: Fail closed

任何 auth / config / n8n call / validation failure 都不能回傳敏感資料。

### NFR-003: Observability

Log 應包含：

```text
request_id
route
status_code
duration_ms
user_email_hash 或 user_email
n8n_status
error_code
```

不得 log：

```text
n8n URL
legacy n8n header secret
downstream JWT private key
raw email body
full request headers
full n8n response
```

### NFR-004: Local development

Local dev 可使用：

```text
AUTH_MODE=dev
DEV_USER_EMAIL=...
```

但 production 必須使用：

```text
AUTH_MODE=iap
```

### NFR-005: Testability

必須提供 unit tests：

- query validation
- allowlist
- redaction
- n8n client error handling
- IAP JWT missing / invalid behavior

## 7. Acceptance Criteria

完成條件：

1. `apps/gateway` 可啟動。
2. `GET /api/health` 回傳 200。
3. `GET /api/action-items` 在未授權時回傳 401 / 403。
4. dev mode 下 allowlisted email 可取得 action items。
5. `status` 不合法時回傳 400。
6. `limit > 50` 時自動 clamp 或回傳 400；建議 clamp to 50 並在 response metadata 中標示。
7. response 不含 raw email body / attachment / secret。
8. n8n failure 不洩漏 n8n URL secret。
9. README 說明 deploy 所需環境變數。
10. 有 Codex 可執行的 task checklist。
