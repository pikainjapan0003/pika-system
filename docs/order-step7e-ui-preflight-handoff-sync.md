# Step 7E-2-UI-PREFLIGHT Handoff Sync

## 任務背景

Step 7E-1b-INTEGRATION-TEST（commit `5a62b9b`）完成後，本次執行 UI Preflight。
建立 UI worktree，盤點前端結構，確認 route / component / API 串接方案，**未施工 UI**。

## UI Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |
| 起點 | `qa/step7e-seller-agent-settings-api`（含 commit `5a62b9b`）|

## UI Preflight Commit

| commit | message |
|--------|---------|
| `5e1125b` | `docs-step7e-seller-agent-settings-ui-preflight` |

**新增檔案**：
- `docs/order-step7e-seller-agent-settings-ui-preflight.md`

## 同步到 dev-handoff 的內容

- `dev-handoff/latest-B.json`：更新至 UI-PREFLIGHT（含 worktree、route、API plan、UX plan）
- `dev-handoff/latest-B.md`：更新至 UI-PREFLIGHT
- `dev-handoff/latest.json`：更新為 latest-B relay copy
- `dev-handoff/` 未 stage，未 push

## UI Preflight 摘要

### Route 決策
| 項目 | 決定 |
|------|------|
| Route | `/settings/agent` |
| Component | `AgentSettingsPage` |
| File | `artifacts/shop-app/src/pages/AgentSettings.tsx` |

### API 串接方案
- 方案 A（建議）：更新 `openapi.yaml` → orval codegen → 生成 React Query hooks
- 方案 B（備案）：手寫 `customFetch` hook，不修改 generated 檔案

### Form Fields
- agentStatus: Switch
- agentMode: Select（排除 platform_managed_reserved）
- queryFrequency: Select
- enabledLogistics: Checkbox group
- queryMethods: Checkbox group
- notify/confirm booleans: Switch × 5
- webhookEnabled: Switch
- webhookUrl: Input（條件顯示）
- webhookSecret: 僅顯示 hasWebhookSecret，提供更換/清除功能

## 未執行項目

| 項目 | 狀態 |
|------|------|
| 施工 UI | 未執行（本次為 preflight） |
| 修改 API | 未執行 |
| DB push | 未執行 |
| migrate | 未執行 |
| seed | 未執行 |
| push GitHub | 未執行 |
| 修改 openapi.yaml | 未執行（施工時需要） |

## 風險與待確認

1. `openapi.yaml` codegen（方案 A）需在 step7e-ui worktree 中執行，node_modules 需可用
2. `agentMode` / `queryFrequency` 等欄位需確認中文顯示 label
3. `webhookSecret` 清除操作建議加確認 dialog（不可復原）
4. `App.tsx` route 需同時更新 `AppRouter` 與 `MerchantPortal`

## 下一步建議

1. 進入 **Step 7E-2 UI 施工**：
   - 決定 API 串接方案（A 或 B）
   - 新增 `AgentSettings.tsx`
   - 更新 `App.tsx` routes
   - 在 `Settings.tsx` 加入 navigation card
2. 施工完成後手動 UI 測試
3. commit `feat-ui-step7e-seller-agent-settings`
