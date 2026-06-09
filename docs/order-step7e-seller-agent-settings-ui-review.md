# Step 7E-2-UI-REVIEW Seller Agent Settings UI 審查紀錄

## 1. 任務背景

Step 7E-2-UI-IMPL（commit `6a8153a`）完成後，本次對 Seller Agent Settings UI 頁面進行靜態程式碼審查。
審查範圍涵蓋：generated hooks 使用方式、安全規則、enum 對照、路由設定、Settings 入口卡片。

## 2. UI Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |

## 3. Reviewed Commits

| commit | message |
|--------|---------|
| `68659ce` | `feat-client-step7e-seller-agent-settings-api`（codegen） |
| `6a8153a` | `feat-ui-step7e-seller-agent-settings`（UI impl） |

## 4. Reviewed Files

- `artifacts/shop-app/src/pages/AgentSettings.tsx`
- `artifacts/shop-app/src/App.tsx`
- `artifacts/shop-app/src/pages/Settings.tsx`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`

## 5. AgentSettings.tsx Review

| 項目 | 實作 | 結果 |
|------|------|------|
| GET hook | `useGetSellerAgentSettings(storeId ?? 0, { query: { enabled: !!storeId } })` | ✅ |
| 回應 wrapper 存取 | `settings = settingsResp?.data`（雙層 `.data`） | ✅ |
| PATCH mutation | `useUpdateSellerAgentSettings()` | ✅ |
| mutateAsync 呼叫 | `{ storeId, data: payload as any }` | ✅ |
| 快取失效 | `getGetSellerAgentSettingsQueryKey(storeId)` | ✅ |
| form init 防止重複 | `initialized` ref，儲存後重置 | ✅ |
| isDefault 偵測 | `!settings.id`（`id?: number`，undefined = 無 DB row） | ✅ |
| Loading states | no-store / isLoading / isError 三種早期 return，均含 BottomNav | ✅ |

### Form 預設值核對（對照 backend defaultSettings()）

| 欄位 | DEFAULT_FORM | backend 預設 | 結果 |
|------|-------------|-------------|------|
| agentStatus | "disabled" | "disabled" | ✅ |
| agentMode | "rule_worker" | "rule_worker" | ✅ |
| enabledLogistics | [] | [] | ✅ |
| queryMethods | ["manual"] | ["manual"] | ✅ |
| queryFrequency | "manual" | "manual" | ✅ |
| notifyOnUnknown | true | true | ✅ |
| requireConfirmOnException | true | true | ✅ |
| requireConfirmOnReturned | false | false | ✅ |
| requireConfirmOnDelivered | false | false | ✅ |
| hideErrorDetailsFromBuyer | true | true | ✅ |
| webhookEnabled | false | false | ✅ |

## 6. Generated Hooks Review

| Hook / 型別 | 位置 | 結果 |
|------------|------|------|
| `useGetSellerAgentSettings` | `api.ts:1395` | ✅ 存在 |
| `useUpdateSellerAgentSettings` | `api.ts:1474` | ✅ 存在 |
| `getGetSellerAgentSettingsQueryKey` | `api.ts:1362` | ✅ 存在 |
| `GetSellerAgentSettings200` | `= { data: SellerAgentSettings }` | ✅ 回應 wrapper 正確 |
| `UpdateSellerAgentSettingsRequest.webhookSecret` | `?: string \| null`（null = 清除） | ✅ |
| `UpdateSellerAgentSettingsRequestAgentMode` | 排除 `platform_managed_reserved` | ✅ |

## 7. Route Review

| 位置 | 路由 | 結果 |
|------|------|------|
| AppRouter（App.tsx:302） | `/settings/agent` 在 `/settings` 之前 | ✅ 正確順序 |
| MerchantPortal Switch（App.tsx:252） | `/settings/agent` 在 `/settings` 之前 | ✅ 正確順序 |
| Import | `import AgentSettingsPage from "@/pages/AgentSettings"` | ✅ |

wouter `Switch` 需 more-specific path 在前，已正確實作。

## 8. Settings Entry Review

| 項目 | 結果 |
|------|------|
| 顯示條件 | 無條件顯示（非 `IS_DEV &&` 限定） | ✅ |
| 位置 | `DevHandoffEntry` 上方 | ✅ |
| 導覽目標 | `setLocation("/settings/agent")` | ✅ |
| 圖示 / 標題 | 🤖 / AI 代查設定 | ✅ |

## 9. Security Review

| 規則 | 結果 |
|------|------|
| `webhookSecret` 不顯示原文 | ✅（未出現在任何文字渲染中） |
| `webhookSecretHash` 不顯示 | ✅（未存取此欄位） |
| 顯示 `hasWebhookSecret` 狀態標籤 | ✅（已設定 / 未設定） |

## 10. PATCH Payload Review

PATCH payload 包含欄位：agentStatus, agentMode, queryFrequency, enabledLogistics, queryMethods, notifyOnUnknown, requireConfirmOnException, requireConfirmOnReturned, requireConfirmOnDelivered, hideErrorDetailsFromBuyer, webhookEnabled, webhookUrl（trim + null）

| 禁止欄位 | 是否出現在 PATCH | 結果 |
|---------|----------------|------|
| id | 否 | ✅ |
| storeId（作為 payload 欄位） | 否（僅作為路由參數） | ✅ |
| merchantId | 否 | ✅ |
| createdAt | 否 | ✅ |
| updatedAt | 否 | ✅ |
| lastRunAt | 否 | ✅ |
| lastTestRunAt | 否 | ✅ |
| webhookSecretHash | 否 | ✅ |
| hasWebhookSecret | 否 | ✅ |

## 11. webhookSecret UX Review

| 行為 | 實作 | 結果 |
|------|------|------|
| 顯示已設 / 未設狀態 | `hasWebhookSecret` badge | ✅ |
| 更換 Secret | `secretMode === "editing"` + password input | ✅ |
| 僅非空時送出 | `newSecret.trim()` 判斷 | ✅ |
| 清除 | `window.confirm()` + PATCH `{ webhookSecret: null }` | ✅ |
| 清除後重置 | `setSecretMode("hidden"); setNewSecret("")` | ✅ |

## 12. Typecheck / Build 狀態

| 指令 | 結果 |
|------|------|
| `tsc -p tsconfig.json --noEmit` | ✅ 0 errors |
| `vite build` | ✅ built in 2.75s |

## 13. Review Conclusion

**PASS — 未發現 blocking issue。**

所有主要需求均正確實作：
- API hooks 正確使用（含 enabled guard 與雙層 data 存取）
- Security 規則全部通過（不送禁止欄位、不顯示 secret/hash）
- Enum 值與 backend 一致，`platform_managed_reserved` 正確排除
- Routes 順序正確（wouter Switch more-specific first）
- Settings 入口卡片無條件顯示
- typecheck 與 vite build 均通過

## 14. Non-blocking Notes

- `webhookSecret` 區塊永遠顯示，不隨 `webhookEnabled` 收折。非安全風險，UX 可接受，可於後續 iteration 優化（例如：webhookEnabled = false 時收折 secret 區塊）。

## 15. 未執行項目

| 項目 | 狀態 |
|------|------|
| E2E / 手動 UI 功能測試 | 未執行（無 browser 環境） |
| 修改 UI 行為 | 未執行（本次為 review） |
| 修改 backend API | 未執行 |
| DB push / migrate / seed | 未執行 |
| push GitHub | 未執行 |

## 16. 風險與待確認

1. 手動 UI 測試未執行，表單互動行為（儲存、Secret 更換/清除、錯誤 toast）需部署後實際驗證
2. worktree 無獨立 node_modules，typecheck 需臨時 symlink 輔助

## 17. 下一步建議

可進入 **Step 7E-2-UI-SMOKE-TEST**：
1. 部署至測試環境
2. 手動訪問 `/settings/agent`
3. 驗證 GET 資料載入、表單儲存（PATCH）、Webhook Secret 更換/清除流程
4. 確認 toast 顯示正常
