# Security Boundary

## 核心原則

1. Frontend 不直接呼叫 n8n。
2. Frontend 不持有 n8n API key / header secret / downstream JWT private key。
3. Gateway 是唯一可以呼叫 n8n Action Items API 的應用層元件。
4. Gateway 必須驗證使用者身份。
5. Gateway 必須做 email allowlist。
6. Gateway 必須做 output redaction。
7. Gateway 不提供任意 query。
8. Gateway 不回傳 full email body / attachments / credentials。
9. 所有 write API 之後才做，且必須更嚴格審查。

## 推薦防護層

```text
IAP / OIDC
  ↓
IAP JWT validation
  ↓
Email allowlist
  ↓
Route allowlist
  ↓
Query validation
  ↓
n8n server-to-server secret
  ↓
Output redaction
  ↓
Security headers
```

## Gateway 必須拒絕

- 沒有 IAP JWT 的 request
- IAP JWT 驗證失敗
- email 不在 allowlist
- status 不在 allowlist
- limit 超過 50
- method 不符合 route 定義
- path 不在 route allowlist
- n8n response 含有未允許欄位時不得原樣透傳

## 不可實作

- 不可把 n8n URL 暴露給 frontend 使用。
- 不可把 n8n secret 寫在 frontend。
- 不可把 n8n secret 寫死在 repo。
- 不可回傳 raw email body。
- 不可回傳 attachment。
- 不可支援 arbitrary Gmail query。
- 不可支援 arbitrary Data Table query。
- 不可支援 user-controlled n8n path。
