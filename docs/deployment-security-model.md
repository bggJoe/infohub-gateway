# InfoHub Gateway 部署安全架構總說明

本文件說明 **InfoHub Gateway 在 GitHub + Google Cloud Platform (GCP) 上的部署安全架構**，目的是讓團隊在部署前、審查時、故障排查時，都能清楚理解：

- 這個架構要保護什麼
- 為什麼要這樣設計
- 每個元件在整體安全邊界中的角色
- 有哪些主要風險，以及如何降低
- 如果失敗，應該從哪裡開始排查與回復

> 如果你只想先開始跑程式或看 API，請先看 `apps/gateway/README.md`。  
> 如果你想深入理解 GitHub Actions OIDC 與 GCP Workload Identity Federation，請看 `docs/wif-oidc-explained.md`。

---

## 🎯 這份文件的目的

這不是單純的部署步驟清單，也不是程式碼實作手冊。

這份文件的定位是：

- **部署安全設計文件**
- **威脅模型說明文件**
- **架構審查用文件**
- **團隊共識文件**

換句話說，它回答的核心問題不是只有：

> 「怎麼部署？」

而是：

> 「為什麼這樣部署比較安全？這個架構實際在保護什麼？如果哪一層出錯，風險會發生在哪裡？」

---

## 👥 這份文件給誰看

### 1. 開發者
你會知道：
- 為什麼 production 一定要 `AUTH_MODE=iap`
- 為什麼不能把 n8n URL、legacy header secret 或 downstream JWT private key 放進前端或 repo
- 為什麼需要輸出白名單與資料脫敏

### 2. DevOps / 平台工程師
你會知道：
- 為什麼要分 deploy SA 和 runtime SA
- 為什麼推薦使用 OIDC / WIF 而不是 JSON key
- 部署失敗時應該優先查哪一層

### 3. 資安審查者
你會知道：
- 主要攻擊面在哪裡
- 每個威脅的控制點在哪裡
- 這個架構的安全假設與不變量是什麼

### 4. 決策者 / Reviewer
你會知道：
- 這套設計的優點、代價、複雜度
- 為什麼這個方案適合當前專案
- 哪些地方未來可能需要再強化

---

## 🏗️ 整體部署架構圖

```text
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Repository                           │
│                 bggJoe/infohub-gateway                         │
│                                                                 │
│  - source code                                                  │
│  - workflow definitions                                         │
│  - non-secret repository variables                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                    GitHub Actions workflow
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│              GitHub OIDC token (short-lived)                    │
│       issuer: token.actions.githubusercontent.com               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│          GCP Workload Identity Federation (WIF)                 │
│                                                                 │
│  驗證這次 GitHub workflow 的身份、來源、repository、branch        │
│  如果符合條件，換發短期 Google access token                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│     Deployment Service Account (GitHub Actions impersonates)    │
│   github-actions-infohub-deploy@<PROJECT_ID>.iam.gservice...    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
        ┌──────────────────────────────┬──────────────────────────┐
        ↓                              ↓                          ↓
 Artifact Registry              Cloud Run Deploy            Secret Manager
 Docker image push              service update              secret reference
        ↓                              ↓                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Cloud Run Service: infohub-gateway             │
│             Runtime SA: infohub-gateway-runtime                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Google IAP                                 │
│      驗證使用者身份，轉送 signed identity assertion             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    InfoHub Gateway App                          │
│   - verify IAP JWT                                              │
│   - enforce allowlist                                           │
│   - call n8n with Gateway-signed downstream JWT                 │
│   - redact output                                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    n8n Action Items API                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 這個架構真正要保護的是什麼

這個專案的核心問題不是「把 Node.js app 部署到 Cloud Run」而已。  
真正要保護的是下面幾件事：

### 1. 不讓前端直接持有 upstream credential
如果 frontend 直接呼叫 n8n webhook，或直接持有 URL、API key、header secret、JWT private key，風險很高：

- credential 容易洩露
- 無法有效限制請求參數
- 使用者可以繞過後端約束直接打上游

因此 Gateway 的存在，本身就是一個**安全邊界**。

### 2. 不讓 CI/CD 持有長期有效的 GCP 金鑰
如果 GitHub Actions 直接保存 service account JSON key：

- 一旦外洩，攻擊者可長期利用
- key rotation 容易出錯
- 很難精準限制誰能用、何時能用

因此部署認證必須改用 **OIDC + WIF**。

### 3. 不讓執行中的服務擁有過大的基礎設施權限
Cloud Run 上的應用只需要：
- 讀 Secret
- 寫 log / trace
- 執行 API 行為

它不應該：
- 部署自己
- 修改 IAM
- 推送 image
- 變更 Cloud Run 設定

因此 deploy SA 與 runtime SA 必須分離。

### 4. 不讓登入與授權只靠不可信的 header
如果應用只相信 `x-goog-authenticated-user-email` 之類未經驗簽的 header，
就有被偽造的風險。

因此必須驗證 `x-goog-iap-jwt-assertion`。

### 5. 不讓上游回傳資料原封不動暴露出去
就算 n8n 回傳很多欄位，也不能全部直接傳給 Dashboard。  
否則可能洩露：

- raw email body
- headers
- attachments
- tokens
- URL / internal fields

因此 Gateway 必須有**輸出白名單與資料脫敏**。

---

## 🧱 安全邊界（Security Boundaries）

這個架構至少有四層安全邊界：

### 邊界 1：GitHub 邊界
這裡是 source code 與 workflow 的管理面。

**應該存在：**
- repo source code
- workflow definitions
- non-secret repository variables

**不應該存在：**
- GCP service account JSON key
- n8n API secret
- production private credentials

這層的核心風險是：
- repo 被誤改
- workflow 被植入惡意步驟
- branch protection 不足

---

### 邊界 2：GCP 控制平面邊界
這裡是 GCP IAM、WIF、Cloud Run、Secret Manager 的控制面。

這層決定：
- 誰可以部署
- 誰可以 impersonate 哪個 service account
- 誰可以讀哪些 secrets
- 誰可以修改 Cloud Run 服務

這層如果配置錯誤，風險通常不是 app bug，而是**基礎設施層面的越權**。

---

### 邊界 3：應用執行邊界
這裡是 Cloud Run 上真正執行的 Gateway。

它的責任不是只轉發請求，而是要主動實施安全控制：

- 驗證 caller 身份
- 限制可用參數
- 遮蔽不應回傳的資料
- 統一記錄 observability data

---

### 邊界 4：上游依賴邊界
n8n 是受依賴的上游系統。  
即使它是你控制的系統，也不能假設它永遠返回安全、精簡、適合直接暴露的資料格式。

因此 Gateway 應該把 n8n 視為：

- **可信但不可直接暴露的上游**
- **可調用，但不能直接對外暴露的依賴**

---

## 🔑 角色與責任分工

### A. Deployment Service Account

建議名稱：

```text
github-actions-infohub-deploy@<PROJECT_ID>.iam.gserviceaccount.com
```

它的責任是：

- 讓 GitHub Actions 能部署 Cloud Run
- 讓 GitHub Actions 能 push image 到 Artifact Registry
- 讓 GitHub Actions 能把 Cloud Run service 綁到 runtime SA
- 視需要讓部署步驟引用 Secret Manager 內容

它**不應該**成為應用執行時身份。

---

### B. Runtime Service Account

建議名稱：

```text
infohub-gateway-runtime@<PROJECT_ID>.iam.gserviceaccount.com
```

它的責任是：

- 讓 Cloud Run service 在執行時讀取必要 secrets
- 寫入 Cloud Logging / Trace
- 作為應用的最小特權身份

它**不應該**有：
- 部署能力
- image push 權限
- IAM 管理能力

---

## 🤔 為什麼一定要分兩個 Service Account？

這是整個設計裡最重要的安全原則之一。

### 如果不分開，會發生什麼事？

若 deploy 與 runtime 共用一個 service account：

- 應用一旦被入侵，攻擊者可能直接取得部署能力
- Cloud Run runtime 可能能改自己的設定
- 應用可能間接取得 Secret Manager 以外的資源操作權限
- 稽核時很難分辨「這個操作是 CI/CD 做的」還是「執行中的 app 做的」

### 分開的好處

- 權限收斂
- 事故隔離
- 稽核清楚
- 風險範圍可預測

這種設計本質上是在實踐：

> **同一個系統的「建置者」與「執行者」不應共享完整能力。**

---

## 🔐 為什麼推薦 OIDC / WIF，而不是 JSON Key？

### 舊做法：把 service account key 放進 CI

```text
GitHub Actions → 讀取 JSON key → 使用 GCP API
```

這種做法雖然直接，但有幾個明顯問題：

1. **長期憑證風險高**
   - key 一旦被偷，通常不是幾分鐘風險，而是長期風險

2. **輪替麻煩**
   - 改 key 後，所有使用該 key 的地方都要一起更新

3. **可見性差**
   - 很難追蹤一個 key 到底被哪些流程使用

4. **粒度太粗**
   - 很難限制「只有某個 repo 的某條 branch 可以用」

---

### 新做法：GitHub OIDC + GCP WIF

```text
GitHub Actions → 取得短期 OIDC token → WIF 驗證 → 換短期 Google token → 部署
```

這種做法的核心優勢是：

- 不保存長期 GCP 私鑰
- 憑證短效
- 可以對 repository / branch 做條件限制
- 攻擊窗口顯著縮短
- 更符合現代 CI/CD 的 identity-based access model

---

## 🔄 OIDC / WIF 的角色意義

這裡不是只是「少一個 key」而已。

OIDC / WIF 實際上把部署權限從：

> 「誰持有檔案」

改成：

> 「這次 workflow 的身份是什麼」

這是很大的安全模型轉變。

### 以前
誰拿到 JSON key，誰就能操作。

### 現在
只有當下面條件都成立時，才會被授權：

- GitHub 確實簽發了 token
- token 的 issuer 正確
- token 的 claims 符合 GCP provider 的條件
- 該 repo / branch / workflow 被允許使用這個身份

這讓授權從「檔案 possession」轉成「identity assertion」。

---

## 🔒 Secret Manager 的角色與目的

InfoHub Gateway 目前涉及的敏感資訊至少包括：

- `N8N_ACTION_ITEMS_URL`
- `N8N_JWT_PRIVATE_KEY_PEM`

這些值不應該：
- 存在 repo
- 存在 `.env.example`
- 直接寫入 workflow yaml
- 以長期形式保存於 GitHub Secrets 作為主要真實來源

### 為什麼要交給 Secret Manager？

因為它提供：

- 中央化管理
- 權限控制
- 版本管理
- 讀取審計
- 輪替機制

### 真正的價值不是「更方便」
而是：

> **把敏感資訊管理從 source control / CI 平台，移回到雲端控制平面。**

---

## 🧠 GitHub Variables 與 Secrets 的分工

這裡很容易搞混，所以要分清楚。

### 適合放在 GitHub Repository Variables 的
這些值通常不是秘密，而是部署配置：

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `GCP_RUNTIME_SERVICE_ACCOUNT`
- `CLOUD_RUN_SERVICE`
- `IAP_AUDIENCE`
- `ALLOWED_USERS`
- `N8N_TIMEOUT_MS`
- `N8N_MAX_RETRIES`

### 不適合放在 GitHub Variables 的
真正敏感的值，例如：

- downstream JWT private key
- legacy n8n header secret
- upstream private token
- service account JSON key

### 為什麼這個分工重要？
因為你要讓部署流程既可自動化，又不把秘密擴散到不必要的系統中。

---

## 🛡️ 應用程式層的安全模型

即使 GCP 基礎設施層都設好了，應用程式本身仍然要實施最後一層控制。

### 1. Production 必須使用 IAP
在 production 中：

- `AUTH_MODE=iap`
- 驗證 `x-goog-iap-jwt-assertion`

### 2. 驗證內容至少要包括

- JWT signature
- `iss = https://cloud.google.com/iap`
- `aud = IAP_AUDIENCE`
- `exp` / `iat`
- email claim 存在
- email 在 `ALLOWED_USERS`

### 3. 不信任未簽名身份 header
也就是說：

- 不能只因為某個 header 看起來像 email 就相信它
- 一定要基於已驗證的 signed assertion

### 4. 嚴格限制 API 參數
`GET /api/action-items` 只能接受：

- `status = new | reviewed | done | ignored`
- `limit = 1..50`

不能把任意 query param 直接 passthrough 到 n8n。

### 5. 嚴格控制輸出資料
只回傳 Dashboard 真的需要的資料欄位。  
這是從資料最小揭露原則出發，而不是單純為了簡潔。

---

## 🚨 威脅模型（Threat Model）

以下是這套架構最值得優先關注的威脅：

| 威脅 | 攻擊方式 | 可能後果 | 主要防禦 |
|---|---|---|---|
| CI 憑證洩露 | 竊取部署憑證 | 攻擊者部署惡意版本 | OIDC/WIF 短效 token，無長期 key |
| 惡意 workflow 修改 | 在 workflow 加入 exfiltration | 洩露 secrets / 濫用部署權限 | branch protection, review, 最小權限 |
| Runtime 被攻擊 | 利用 app 漏洞取得執行權 | 橫向移動、讀更多資源 | runtime SA 最小權限、不得具部署能力 |
| 未授權直接呼叫 Cloud Run | 繞過登入層 | 未授權存取資料 | `--no-allow-unauthenticated` + IAP |
| 偽造身分 header | 自造 email header | 冒用使用者身份 | 驗證 IAP JWT，不信任未驗簽 header |
| 上游資料過曝 | 原樣轉發 n8n 回應 | 敏感資料外洩 | response allowlist + redaction |
| 配置漂移 | 漏設 env / secret / audience | 保護失效或系統誤開放 | preflight + fail-closed startup |

---

## 🧯 最強反證：這套設計有沒有代價？

有，而且應該明講。

### 代價 1：複雜度提高
相較於「直接丟一個 JSON key 到 GitHub Secrets」，
OIDC / WIF 明顯更複雜：

- 要建 WIF pool/provider
- 要設 attribute mapping
- 要配 IAM binding
- 要理解 branch / repo 條件

### 代價 2：除錯門檻較高
部署失敗時，有可能卡在：
- issuer 不符
- provider name 錯
- branch 不匹配
- impersonation policy 沒設好

### 代價 3：文件品質要求更高
如果沒有好的文件，團隊會難以理解為什麼這樣做。

---

## ✅ 為什麼仍然值得？

因為這個專案的定位本來就不是「快速 demo」而是：

- 安全中介層
- 有身份驗證要求
- 有 upstream credential 管理需求
- 要能長期維護與審查

因此，多一點控制面複雜度，換來：

- 更小的爆炸半徑
- 更好的稽核能力
- 更可靠的權限邊界

這筆交換是合理的。

---

## 🔄 部署流程的決策樹

```text
GitHub Actions 啟動
  ↓
workflow 是否有 id-token: write？
  ├─ 否 → 無法取得 OIDC token，部署失敗
  └─ 是
      ↓
向 GitHub 取得 OIDC token
      ↓
WIF provider 是否接受這個 token？
  ├─ 否 → 檢查 issuer / claims / repo / branch 條件
  └─ 是
      ↓
是否能 impersonate deploy SA？
  ├─ 否 → 檢查 roles/iam.workloadIdentityUser 綁定
  └─ 是
      ↓
是否能 push image / deploy Cloud Run？
  ├─ 否 → 檢查 deploy SA 權限
  └─ 是
      ↓
Cloud Run 是否能以 runtime SA 啟動？
  ├─ 否 → 檢查 runtime SA / env / secret access
  └─ 是
      ↓
IAP + app auth 是否正常？
  ├─ 否 → 檢查 IAP_AUDIENCE / allowlist / JWT verification
  └─ 是
      ↓
部署完成
```

---

## 🧪 部署前檢查（Preflight）的真正意義

`scripts/preflight-gateway-deploy.sh` 不只是方便，而是安全流程的一部分。

它要做的事情不是「幫你少打字」，而是：

- 提前攔下缺少必要 env 的部署
- 確保本地品質門檻先通過
- 避免你把不完整配置推進 production
- 在 GCP 還沒真的動作前，先抓掉大部分低階錯誤

### 它檢查的東西，對應的安全意義

- `GCP_WORKLOAD_IDENTITY_PROVIDER`：沒有它就代表部署身份鏈不完整
- `GCP_RUNTIME_SERVICE_ACCOUNT`：沒有它代表執行身份不明確
- `IAP_AUDIENCE`：沒有它代表 app 可能無法正確驗證 caller
- `ALLOWED_USERS`：沒有它代表授權邊界不完整
- secret existence checks：避免部署一個啟動後一定拿不到上游秘密的版本

---

## 🚨 常見失敗點與恢復思路

### 1. GitHub Actions 一開始就認證失敗
優先檢查：
- workflow 是否有 `id-token: write`
- provider resource name 是否正確
- repo / branch 條件是否匹配

### 2. Image build 或 push 失敗
優先檢查：
- Docker build 是否通過
- Artifact Registry 權限是否足夠
- registry auth 是否設好

### 3. Cloud Run deploy 成功，但服務不能用
優先檢查：
- runtime SA 是否正確綁定
- secret access 是否有權限
- env vars 是否完整

### 4. Cloud Run 起來了，但 API 401 / 403
優先檢查：
- IAP 是否正確配置
- `IAP_AUDIENCE` 是否與實際資源一致
- `ALLOWED_USERS` 是否包含測試帳號

### 5. 回傳資料看起來不安全
優先檢查：
- response allowlist 是否仍存在
- redaction 是否有被繞過
- 是否新增了未審查欄位 passthrough

---

## ↩️ 回滾策略

如果新版本部署後有問題，回滾應該優先以 **Cloud Run revision** 的概念思考，而不是直接在 panic 狀態下亂改設定。

### 回滾原則

1. 先判斷是：
   - build 問題
   - deploy 配置問題
   - runtime secret / auth 問題
   - 上游整合問題

2. 若影響 production 可用性，優先：
   - 切回前一個健康 revision
   - 保留出問題 revision 供事後調查

3. 回滾後再處理根因，不要在 production 線上臨時 patch 一堆未審查變更

---

## 📆 Day-2 Operations：上線後你還要持續維持什麼？

這套架構不是設好一次就永遠安全。  
上線後至少還要維持：

### 1. Secret rotation
- 新增 secret version
- 驗證新版本可用
- 必要時重新部署或 refresh config

### 2. Allowlist 維護
- 新成員加入時增加 email
- 人員離開時移除 email
- 定期檢查名單是否過度寬鬆

### 3. IAM 權限收斂
- deploy SA 權限是否有擴張
- runtime SA 是否被加了不必要角色

### 4. Workflow 變更審查
- 是否新增了不必要的 GitHub permissions
- 是否加入了敏感資訊輸出
- 是否破壞 OIDC / WIF 假設

### 5. Logging 與隱私
- logs 是否出現不該記錄的 payload
- 是否有洩露 token / raw response / email body

---

## 💰 成本與複雜度取捨

### 成本面
這套方案本身不會因 OIDC / WIF 直接增加太高成本。  
主要費用還是來自：

- Cloud Run
- Artifact Registry
- Secret Manager
- Logging / Trace

### 複雜度面
最大的成本其實是**理解與維運複雜度**。

但如果你的目標是：
- 控制 secret 風險
- 保留審計能力
- 做可維護的 production deployment

那這個複雜度是合理的。

---

## ✅ 這個架構必須維持的安全不變量

未來不論你怎麼重構 workflow、換部署方式、調整 app，都應盡量維持下列條件：

1. **不使用長期 GCP JSON key**
2. **deploy SA 與 runtime SA 分離**
3. **Cloud Run 不允許匿名流量**
4. **production 使用 `AUTH_MODE=iap`**
5. **敏感資訊從 secret store 注入，不進 repo**
6. **IAP JWT 驗證不能被繞過**
7. **上游資料輸出維持 allowlist / redaction**
8. **部署前存在 preflight 檢查或等價機制**

如果這些不變量被打破，整體安全性通常會明顯下降。

---

## ✅ Reviewer Checklist

### 架構層
- [ ] deploy SA 與 runtime SA 已分離
- [ ] Cloud Run 為 `--no-allow-unauthenticated`
- [ ] Production 使用 IAP 模式

### GitHub / CI 層
- [ ] workflow 使用 `permissions: id-token: write`
- [ ] repo / workflow 中沒有 service account JSON key
- [ ] WIF 綁定有 repo / branch 限制

### Secret 層
- [ ] `N8N_ACTION_ITEMS_URL` 已建於 Secret Manager
- [ ] `N8N_JWT_PRIVATE_KEY_PEM` 已建於 Secret Manager
- [ ] n8n 已設定對應 public key 並驗證 Gateway-signed JWT

### 應用層
- [ ] 驗證 `x-goog-iap-jwt-assertion`
- [ ] `IAP_AUDIENCE` 與實際資源一致
- [ ] `ALLOWED_USERS` 設定合理
- [ ] output allowlist / redaction 邏輯存在

### 流程層
- [ ] preflight script 或等價檢查已執行
- [ ] 有明確回滾方式
- [ ] deploy log 與 runtime log 可供排查

---

## 📎 相關文件

- 專案入口：`README.md`
- 應用實作與本機開發：`apps/gateway/README.md`
- OIDC / WIF 深入說明：`docs/wif-oidc-explained.md`
- 架構文件：`docs/architecture-infohub-gateway.md`
- 安全邊界：`docs/security-boundary.md`
- 部署 runbook：`docs/cloud-run-iap-deployment-runbook.md`

---

## 最後總結

如果只從「可不可以部署成功」來看，這套設計確實比直接塞一把 JSON key 複雜。  
但如果從「是否能長期安全維運、是否能降低憑證風險、是否能在出事時快速定位責任與影響範圍」來看，這套架構是合理而且成熟的。

這個架構的核心價值不是炫技，而是：

- 用更短效、更可審計的身份鏈做部署
- 用更小的權限邊界執行應用
- 用更嚴格的輸入與輸出控制保護資料
- 用更清楚的文件幫助團隊理解與維護
