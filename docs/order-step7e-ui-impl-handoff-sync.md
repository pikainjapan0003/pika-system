# Step 7E-2-UI-IMPL Handoff Sync

## 任務背景

接續 API Client Codegen（commit `68659ce`），本次實作 Seller Agent Settings UI 頁面。

## UI Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |

## Commit

| commit | message |
|--------|---------|
| `6a8153a` | `feat-ui-step7e-seller-agent-settings` |

## 新增 / 修改檔案

### 新增
- `artifacts/shop-app/src/pages/AgentSettings.tsx`（UI 頁面主體）
- `docs/order-step7e-seller-agent-settings-ui-implementation.md`（實作文件）

### 修改
- `artifacts/shop-app/src/App.tsx`（新增 /settings/agent 路由）
- `artifacts/shop-app/src/pages/Settings.tsx`（新增 AgentSettingsEntry 導覽卡片）

## 頁面重點

- 路由：`/settings/agent`
- 分 5 個 Section：AI 狀態、查詢設定、物流來源、例外確認設定、Webhook
- webhookSecret 安全 UX：不顯示原文，僅顯示 hasWebhookSecret，可更換/清除
- PATCH 不送：id, storeId, merchantId, createdAt, updatedAt, lastRunAt, lastTestRunAt, webhookSecretHash, hasWebhookSecret

## 測試結果

```
tsc -p tsconfig.json --noEmit → 0 errors
vite build → ✓ built in 2.75s
```

## 未執行項目

| 項目 | 狀態 |
|------|------|
| E2E / 手動 UI 測試 | 未執行（無 browser 環境） |
| 修改 backend API | 未執行 |
| DB push / migrate / seed | 未執行 |
| push GitHub | 未執行 |
