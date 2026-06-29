# InfoHub Gateway Architecture

## 目標架構

```text
Browser / Frontend Dashboard
  ↓
Google IAP / OIDC
  ↓
InfoHub Gateway / Backend
  ↓
n8n Action Items API
  ↓
n8n Data Table: info_items
```

## 分層責任

| Layer | Responsibility |
|---|---|
| Frontend Dashboard | 顯示 Dashboard-safe JSON，不持有 n8n URL、legacy header secret 或 downstream JWT private key |
| Google IAP / OIDC | 使用者身份驗證與入口保護 |
| InfoHub Gateway | 授權、allowlist、redaction、API contract、downstream JWT 簽發 |
| n8n | workflow、資料匯流、Data Table 查詢、驗證 Gateway-signed JWT |
| LLM / Dify / OpenAI | 分類、摘要、action item extraction |
| GitHub repo | 開發規格、程式碼、部署設定、審查紀錄 |

## 目前既有系統

已存在：

```text
n8n workflow:
- InfoHub - Gmail Action Intake
- InfoHub - Action Items API

Data Table:
- info_items
```

Gateway 不應直接讀 Gmail。  
Gateway 只讀 n8n 已整理好的 Dashboard-safe API，或讀經過 n8n redaction 後的資料。

## 資料流

```text
Gmail
  ↓
n8n Gmail Intake
  ↓
Normalize Email for AI
  ↓
AI Classify Email
  ↓
info_items
  ↓
n8n Action Items API
  ↓
InfoHub Gateway
  ↓
Frontend Dashboard
```

## 信任邊界

```text
Untrusted:
- Browser
- Query parameters
- Frontend code
- Any user-supplied request field

Trusted only after verification:
- IAP JWT / OIDC identity
- Gateway service account
- Gateway-signed downstream JWT verified by n8n

Never trusted:
- x-goog-authenticated-user-email alone
- user-submitted email field
- frontend-provided role
```

## Gateway-to-n8n Authentication

Production 預設使用 `N8N_AUTH_MODE=jwt`。Gateway 從 Secret Manager 取得 `N8N_JWT_PRIVATE_KEY_PEM`，對每一次 upstream request 簽發短效 RS256 JWT，並以 `Authorization: Bearer <jwt>` 呼叫 n8n。

n8n 端必須使用對應 public key 驗證 JWT，並檢查 `iss`、`aud`、`sub`、`email`、`scope`、`method`、`path`、`iat`、`exp`、`jti`。JWT 預設 60 秒過期。

`N8N_AUTH_MODE=header` 只作為非 production 的 legacy fallback，不是正式部署路徑。
