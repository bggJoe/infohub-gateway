# GitHub Actions OIDC 與 GCP Workload Identity Federation 深入說明

本文件聚焦在 **GitHub Actions 如何透過 OIDC 與 GCP Workload Identity Federation (WIF) 安全地取得部署能力**。

如果 `docs/deployment-security-model.md` 回答的是：

> 為什麼整體架構這樣設計？

那本文件回答的是：

> OIDC / WIF 到底怎麼運作？它安全在哪裡？又會在哪裡失敗？

---

## 🎯 這份文件的定位

這不是整體部署總覽，也不是操作手冊，而是：

- GitHub OIDC / GCP WIF 的技術附錄
- 認證機制解釋文件
- 部署身分鏈的除錯參考文件

它的目標讀者是：

- 想理解 WIF 為什麼安全的工程師
- 需要設定 provider / binding 的平台工程師
- 在 deploy auth 失敗時需要排查的人

---

## 🧠 先講核心觀念

很多人第一次接觸 OIDC / WIF 時，會以為它只是：

> 「不用 JSON key 的新做法」

這樣理解不算錯，但不夠深。

更準確地說，OIDC / WIF 是把部署授權模式從：

- **憑證 possession model**
  - 誰持有 key，誰就能用

改成：

- **identity assertion model**
  - 只有當這次 workflow 能證明自己的身份，而且身份符合條件，才被授權

這是本質差異。

---

## 🔑 OIDC 是什麼？

OIDC（OpenID Connect）是建立在 OAuth 2.0 之上的身份層協議。

在這個場景裡，你可以把它想成：

- GitHub 是身份提供者
- GitHub Actions workflow 在執行時向 GitHub 請求一個短期身份 token
- 這個 token 是簽名的 JWT
- GCP 透過 WIF 驗證這個 JWT 是否可信

所以這個 token 的角色不是 API key，而是：

> **一份由 GitHub 簽發、可以被 GCP 驗證的「這次 workflow 是誰」的證明。**

---

## 🏗️ WIF 是什麼？

WIF（Workload Identity Federation）是 GCP 提供的一個橋樑，讓外部身份系統可以在不使用 GCP long-lived key 的前提下，換取短期 GCP 存取能力。

在這個專案裡，外部身份來源就是：

```text
https://token.actions.githubusercontent.com
```

也就是 GitHub Actions 的 OIDC issuer。

WIF 的工作不是直接授權所有東西，而是：

1. 接收外部 JWT
2. 驗證 issuer、signature、claims
3. 根據 policy 決定是否接受
4. 若接受，允許該身份 impersonate 某個 GCP service account
5. 進一步取得短期 GCP access token

---

## 🔄 完整身份交換流程

```text
GitHub Actions workflow 啟動
  ↓
workflow 宣告 permissions.id-token: write
  ↓
GitHub 簽發短期 OIDC token
  ↓
token 帶有 repository / ref / actor / sub 等 claims
  ↓
workflow 把 token 提交給 GCP WIF provider
  ↓
WIF 驗證：
  - issuer 是否正確
  - 簽名是否有效
  - claims 是否符合條件
  ↓
若驗證通過：
  允許 impersonate deploy service account
  ↓
取得短期 Google access token
  ↓
使用 gcloud / Cloud Run / Artifact Registry API 執行部署
```

---

## 🔍 GitHub OIDC token 在安全上代表什麼

這個 token 最大的意義是：  
它不是「靜態秘密」，而是「上下文身份」。

也就是說，token 裡會表達：

- 這是哪個 repository 的 workflow
- 這是哪一個 branch / ref 觸發的
- 執行者是誰
- token 由誰簽發
- token 有效期間是多久

因此 GCP 可以根據這些上下文條件來判斷：

> 「我要不要相信這次部署請求？」

---

## 🧩 常見 claims 與其意義

實務上，常見會用到這些 claims：

- `sub`
- `repository`
- `repository_owner`
- `ref`
- `actor`

### `repository`
例如：

```text
bggJoe/infohub-gateway
```

用來限制只有這個 repo 的 workflow 能請求這條部署身份鏈。

### `ref`
例如：

```text
refs/heads/main
```

用來限制只有 `main` 分支能部署。

### `actor`
代表誰觸發了 workflow。  
它不是最核心的限制條件，但在 audit 或某些細化策略時可能有用。

### `sub`
通常是更綜合的 subject 表示。  
很多 provider policy 會圍繞這個 subject 來做 principalSet 條件限制。

---

## 🎯 為什麼限制 repo / branch 很重要？

如果你只驗 issuer 正確，而不限制 repo / branch，風險會很高。

### 沒有限制 repo 的風險
只要是 GitHub Actions 發出的 token，理論上都可能嘗試來換取身份。  
這顯然太寬鬆。

### 沒有限制 branch 的風險
就算 repo 是對的，若任何 branch 都可部署，風險包括：

- feature branch 誤部署
- 未審查分支取得 production 部署能力
- 惡意分支植入 exfiltration code 後執行部署

所以最基本建議是：

- 限制 repo
- 限制 branch
- 視情況再限制 workflow / environment

---

## 🔐 為什麼這種模式比 JSON key 安全？

### JSON key 的本質
JSON key 是一個可被複製、可被長期保存的靜態祕密。  
拿到它的人，通常就等於拿到 service account 的能力。

### OIDC / WIF 的本質
OIDC token 是短期、具上下文、可驗證來源的身份斷言。  
就算 token 泄露：

- 有效時間短
- 可用範圍受 policy 限制
- 通常不能無限期重複使用

這並不是說 OIDC token 泄露就沒風險，而是：

> **風險仍然存在，但爆炸半徑與利用時間都更小。**

---

## 🧱 GCP 端實際需要哪些元件？

至少需要這些元件：

### 1. Workload Identity Pool
用來承載來自外部身份提供者的 federated identities。

### 2. OIDC Provider
設定 GitHub 的 issuer，並定義 attribute mapping。

### 3. Deploy Service Account
實際被 impersonate 的 GCP 身份。

### 4. IAM Binding
授予某些來自 WIF 的身份可使用：

```text
roles/iam.workloadIdentityUser
```

這個 binding 是整條鏈是否成立的關鍵之一。

---

## 🧭 `permissions: id-token: write` 為什麼重要？

如果 workflow 沒有：

```yaml
permissions:
  id-token: write
```

那 GitHub 就不會讓該 job 取得 OIDC token。

這不是小細節，而是整條 OIDC / WIF 流程的入口條件。

所以如果部署一開始就失敗，這通常是第一個該檢查的點之一。

---

## ⚠️ 常見失敗情境與解釋

### 情境 1：`Permission denied to impersonate service account`
表示 token 有可能已經被接受，但在 impersonate deploy SA 時失敗。

常見原因：
- 沒有 `roles/iam.workloadIdentityUser`
- binding 綁錯 principal / principalSet
- claim 條件與實際 workflow 不匹配

---

### 情境 2：`id-token permission missing`
表示 workflow 根本拿不到 OIDC token。

常見原因：
- workflow 沒有 `permissions.id-token: write`

---

### 情境 3：`invalid_grant` 或 token exchange failed
通常發生在 WIF provider 交換階段。

常見原因：
- provider resource name 寫錯
- issuer 設錯
- attribute mapping 不正確
- repo / branch 條件寫錯

---

### 情境 4：認證成功，但 Cloud Run deploy 失敗
表示 OIDC / WIF 本身可能沒問題，但 deploy SA 權限不足。

常見原因：
- 沒有 `roles/run.admin`
- 沒有 Artifact Registry push 權限
- 沒有 `roles/iam.serviceAccountUser`

---

## 🧪 排查順序建議

遇到 deploy auth 問題時，不要一次亂改全部設定。  
建議按這個順序查：

### 第一步：查 workflow 層
- 有沒有 `id-token: write`
- 這次 workflow 是從哪個 branch 跑的

### 第二步：查 provider 層
- provider name 是否正確
- issuer URI 是否正確
- attribute mapping 是否符合預期

### 第三步：查 IAM binding 層
- deploy SA 是否授予 `roles/iam.workloadIdentityUser`
- principalSet 條件是否與 repo / ref 匹配

### 第四步：查 deploy SA 權限層
- Cloud Run deploy 權限是否足夠
- Artifact Registry push 是否有權限

這樣你能很快分辨問題是在：
- GitHub
- WIF
- IAM
- 部署角色權限

---

## 🧯 這套設計的限制與代價

### 限制 1：比較不直覺
對剛接觸 GCP IAM 的人來說，principalSet / attribute mapping 很抽象。

### 限制 2：錯誤訊息不一定友善
有些 GCP / auth 相關錯誤訊息很短，容易讓人誤判問題層級。

### 限制 3：需要文件支撐
如果沒有像本 repo 這樣的設計文件，後續維運者會很難接手。

---

## ✅ 但它換來了什麼？

- 不需要長期 GCP 私鑰
- 可明確限制哪個 repo / branch 能部署
- 可在稽核時追蹤部署身份鏈
- 讓 CI/CD 權限模型更現代化、更細粒度

所以它不是「比較潮的做法」，而是：

> **更適合長期維護與安全要求較高的做法。**

---

## ✅ 實作層 checklist

- [ ] GitHub workflow 有 `permissions: id-token: write`
- [ ] 已建立 WIF pool
- [ ] 已建立 GitHub OIDC provider
- [ ] provider issuer 指向 `https://token.actions.githubusercontent.com`
- [ ] provider attribute mapping 正確
- [ ] deploy SA 已建立
- [ ] deploy SA 有 `roles/iam.workloadIdentityUser` 相關綁定
- [ ] 綁定已限制 `bggJoe/infohub-gateway`
- [ ] 綁定已限制 `refs/heads/main`
- [ ] deploy SA 具備 Cloud Run / Artifact Registry 所需權限

---

## ❓ FAQ

### Q1：OIDC token 洩露就完全沒事嗎？
不是。  
它仍然有風險，只是通常比長期 JSON key 的風險小很多，因為：

- 有效時間短
- 條件限制較多
- 不容易作為長期後門使用

### Q2：可不可以只用一個 service account？
技術上可以，但不建議。  
這會把 deploy 與 runtime 權限混在一起，破壞最小特權原則。

### Q3：可不可以不限制 branch？
可以，但通常不應該。  
不限制 branch 幾乎等於放大 deploy surface。

### Q4：是不是就完全不需要 GitHub Secrets？
不一定。  
GitHub 仍可能需要保存某些非 GCP 類型的秘密。  
但對本架構來說，GCP access 不應再依賴 service account JSON key。

### Q5：是不是每個小專案都值得用 WIF？
不一定。  
如果只是極短命、低風險、內部 demo，可能嫌複雜。  
但只要你關心長期維護、審查、secret 管控與 deploy audit，它通常值得。

---

## 📎 與其他文件的關係

- 總體部署安全架構：`docs/deployment-security-model.md`
- 應用設定與行為：`apps/gateway/README.md`
- 專案導覽：`README.md`
