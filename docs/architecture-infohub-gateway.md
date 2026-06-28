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
| Frontend Dashboard | 顯示 Dashboard-safe JSON，不持有 n8n secret |
| Google IAP / OIDC | 使用者身份驗證與入口保護 |
| InfoHub Gateway | 授權、allowlist、redaction、API contract、n8n secret 保護 |
| n8n | workflow、資料匯流、Data Table 查詢 |
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
- n8n server-to-server secret

Never trusted:
- x-goog-authenticated-user-email alone
- user-submitted email field
- frontend-provided role
```
