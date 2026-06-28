# Deployment Options

## Option A — Recommended: Google Cloud Run + IAP + Secret Manager + GitHub Actions OIDC

### Architecture

```text
GitHub
  ↓
GitHub Actions OIDC / Workload Identity Federation
  ↓
Cloud Run: InfoHub Gateway
  ↓
IAP protects Cloud Run endpoint
  ↓
Gateway verifies IAP JWT
  ↓
Gateway calls n8n Action Items API with server-side secret
```

### 優點

- 與 Google identity / Gmail / Google Cloud 生態一致。
- Cloud Run 可直接被 IAP 保護。
- IAP 可以保護 `run.app` endpoint，避免只保護 Load Balancer 卻留下預設 URL。
- Secret Manager 適合保存 n8n secret。
- GitHub Actions 可使用 OIDC / WIF，避免長期 service account key。
- Serverless，維運負擔低。

### 缺點

- 需要設定 Google Cloud project、billing、IAP、IAM。
- IAP / Cloud Run audience 設定需要精準。
- local dev 與 production auth flow 需要分開。

### 適合

- 你想偏 Google 生態。
- 你想要 Google login。
- 你想把資安邊界做得清楚。
- 你想讓 GitHub / Codex / CI/CD 逐步接管。

## Option B — Cloudflare Access + Worker / Pages Functions

### Architecture

```text
Browser
  ↓
Cloudflare Access with Google IdP
  ↓
Cloudflare Worker / Pages Function
  ↓
n8n Action Items API
```

### 優點

- 若你已有 Cloudflare domain，入口設定可能更快。
- Cloudflare Access 可與 Google IdP 整合。
- Worker 很適合做小型 Gateway。
- 不需要完整 Google Cloud project 部署流程。

### 缺點

- 與 Google Cloud / IAP 文件與部署路線不同。
- Worker runtime 限制需注意。
- Cloudflare Access JWT 驗證與政策設定是另一套操作模式。

### 適合

- 你已有 Cloudflare domain。
- 你想快速保護一個私有 Dashboard。
- 你不想先進 GCP IAP。

## Option C — Firebase Hosting + Cloud Functions / Cloud Run + Firebase Auth

### Architecture

```text
Firebase Hosting
  ↓
Firebase Auth / Google sign-in
  ↓
Cloud Functions / Cloud Run Backend
  ↓
n8n
```

### 優點

- Frontend hosting 與 Google sign-in 整合自然。
- 適合後續做正式 Web App。
- 使用者登入體驗可高度自訂。

### 缺點

- Auth 實作責任落在應用程式。
- 比 IAP 需要更多 app-level auth code。
- 若只做個人 Dashboard，可能比 Cloud Run + IAP 複雜。

### 適合

- 你要做一個長期產品型 Web App。
- 你需要自訂登入畫面與 user profile。

## Option D — n8n-only Webhook with Header/JWT Auth

### Architecture

```text
Frontend
  ↓
n8n Webhook
```

### 優點

- 最快。
- 元件最少。

### 缺點

- 不適合 browser frontend，因為 secret 容易暴露。
- 難以做完整 user auth / allowlist / redaction / audit。
- 不建議作為正式 Dashboard 架構。

### 適合

- 只做 server-to-server 測試。
- 暫時內部測試。

## Option E — Self-hosted VPS + reverse proxy + oauth2-proxy

### Architecture

```text
Browser
  ↓
Caddy / Nginx
  ↓
oauth2-proxy / OIDC
  ↓
Gateway app
  ↓
n8n
```

### 優點

- 雲平台依賴較低。
- 控制權高。

### 缺點

- 需要維護 OS、patch、TLS、reverse proxy、logging。
- 資安維運負擔最高。
- 不建議作為 MVP。

### 適合

- 你有強烈 self-hosting 需求。
- 你願意承擔維運工作。

## 建議排序

```text
1. Google Cloud Run + IAP + Secret Manager + GitHub Actions OIDC
2. Cloudflare Access + Worker
3. Firebase Hosting + Cloud Functions / Cloud Run
4. n8n-only Header/JWT Auth
5. Self-hosted VPS + oauth2-proxy
```
