# InfoHub Gateway Spec Package

本 spec package 是給 Codex 與人類 reviewer 閱讀的開發需求與技術規格。

目標是建立一個具備資安防護能力的中介 Gateway，讓 Frontend Dashboard 不直接呼叫 n8n Webhook，也不持有 n8n secret。

## 推薦方案

推薦採用：

```text
GitHub repo
  ↓
GitHub Actions OIDC / Workload Identity Federation
  ↓
Google Cloud Run
  ↓
Google IAP
  ↓
InfoHub Gateway
  ↓
n8n Action Items API
  ↓
n8n Data Table: info_items
```

## 文件導覽

### 快速入口

- 想快速理解專案目標與整體架構：閱讀本文件（README）
- 想開始實作與本機開發：`apps/gateway/README.md`
- 想了解完整部署資安模型與威脅分析：`docs/deployment-security-model.md`
- 想深入理解 GitHub OIDC / GCP WIF 技術細節：`docs/wif-oidc-explained.md`
- 想進行部署前檢查：`scripts/preflight-gateway-deploy.sh`

### 文件清單

```text
specs/004-infohub-gateway/
  spec.md
  technical-spec.md
  security-requirements.md
  deployment-options.md
  recommended-cloud-run-iap-plan.md
  codex-task.md
  acceptance-checklist.md
docs/
  architecture-infohub-gateway.md
  cloud-run-iap-deployment-runbook.md
  security-boundary.md
  deployment-security-model.md
  wif-oidc-explained.md
apps/gateway/
  README.md
scripts/
  preflight-gateway-deploy.sh
```

## 讀者導覽路徑

- **新開發者**：README → `apps/gateway/README.md`（Local Development）
- **部署工程師**：README → `docs/deployment-security-model.md`（實作清單）→ `scripts/preflight-gateway-deploy.sh`
- **資安審查者**：README → `docs/deployment-security-model.md`（威脅模型 / 防禦矩陣）
- **平台架構師**：README → `docs/wif-oidc-explained.md`（OIDC / WIF 深入）

## Codex 入口文件

Codex 應優先閱讀：

```text
specs/004-infohub-gateway/codex-task.md
```
