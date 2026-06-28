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

## 文件清單

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
  security-boundary.md
```

## Codex 入口文件

Codex 應優先閱讀：

```text
specs/004-infohub-gateway/codex-task.md
```
