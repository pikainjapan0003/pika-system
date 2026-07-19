# Step 7E-2-UI-IMPL：Seller Agent Settings UI Implementation

## 任務

新增 Seller Agent Settings 管理頁面，讓老闆在 Settings 頁面可以進入設定 AI 代查功能。

## Worktree / Branch

| 項目     | 值                                            |
| -------- | --------------------------------------------- |
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch   | `qa/step7e-seller-agent-settings-ui`          |

## 新增 / 修改檔案

### 新增

- `artifacts/shop-app/src/pages/AgentSettings.tsx`

### 修改

- `artifacts/shop-app/src/App.tsx`
- `artifacts/shop-app/src/pages/Settings.tsx`

## 頁面功能說明

### 路由

| 路由              | 元件                |
| ----------------- | ------------------- |
| `/settings/agent` | `AgentSettingsPage` |

App.tsx 新增兩處：AppRouter 和 MerchantPortal Switch。

### Settings.tsx 導覽

在原有頁面新增 `AgentSettingsEntry` 元件（🤖 AI 代查設定），放於 `DevHandoffEntry` 上方，對所有用戶顯示（非 IS_DEV 限定）。

### AgentSettings.tsx 功能區塊

| 區塊            | 欄位                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A. AI 狀態      | agentStatus（Switch）、agentMode（Select）                                                                                               |
| B. 查詢設定     | queryFrequency（Select）、queryMethods（Checkbox 列表）                                                                                  |
| C. 物流來源     | enabledLogistics（Checkbox 列表）                                                                                                        |
| D. 例外確認設定 | 5 × Switch（notifyOnUnknown, requireConfirmOnException, requireConfirmOnReturned, requireConfirmOnDelivered, hideErrorDetailsFromBuyer） |
| E. Webhook      | webhookEnabled（Switch）、webhookUrl（text input）、webhookSecret（UX：顯示已設/未設狀態，可更換/清除）                                  |

### Webhook Secret 安全處理

- **不顯示**原文或 hash
- 顯示 `hasWebhookSecret: boolean` 狀態標籤
- 提供「更換 Secret」（password input）和「清除」（window.confirm 確認）
- PATCH 僅在 `secretMode === "editing"` 且 `newSecret` 非空時帶入 `webhookSecret`
- 清除 secret：PATCH `{ webhookSecret: null }`

### 禁止送出欄位

PATCH payload 不包含：`id, storeId, merchantId, createdAt, updatedAt, lastRunAt, lastTestRunAt, webhookSecretHash, hasWebhookSecret`

### API Hooks 使用

```tsx
const { data: settingsResp } = useGetSellerAgentSettings(storeId, {
  query: { enabled: !!storeId },
});
const settings = settingsResp?.data; // data?.data 雙層存取
```

```tsx
await updateMutation.mutateAsync({ storeId, data: payload });
await qc.invalidateQueries({
  queryKey: getGetSellerAgentSettingsQueryKey(storeId),
});
```

## Enum 對照

| 欄位             | 值                      | 顯示                |
| ---------------- | ----------------------- | ------------------- |
| agentMode        | rule_worker             | 規則工作器          |
| agentMode        | external_agent          | 外部 Agent          |
| agentMode        | self_hosted_webhook     | 自架 Webhook        |
| queryFrequency   | manual                  | 手動                |
| queryFrequency   | daily                   | 每日                |
| queryFrequency   | every_6_hours           | 每 6 小時           |
| queryFrequency   | every_2_hours_high_tier | 每 2 小時，高頻方案 |
| enabledLogistics | seven_eleven            | 7-11                |
| enabledLogistics | family_mart             | 全家                |
| enabledLogistics | home_delivery           | 宅配                |
| enabledLogistics | other                   | 其他                |
| enabledLogistics | webhook                 | Webhook             |
| queryMethods     | manual                  | 手動查詢            |
| queryMethods     | csv_import              | CSV 匯入            |
| queryMethods     | webhook                 | Webhook             |
| queryMethods     | scheduled               | 排程查詢            |

注意：`platform_managed_reserved` 不出現在 UI Select 選項中。

## 測試結果

```
tsc -p tsconfig.json --noEmit → 0 errors
vite build → ✓ built in 2.75s
```

## 未執行項目

| 項目                     | 原因                         |
| ------------------------ | ---------------------------- |
| 手動 UI 功能測試（E2E）  | 無 dev server / browser 環境 |
| 修改 backend API         | 禁止                         |
| DB push / migrate / seed | 禁止                         |
| push GitHub              | 禁止                         |
