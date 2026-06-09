# Step 7E-2-UI-SMOKE-TEST Seller Agent Settings UI 實測紀錄

## 1. 任務背景

Step 7E-2-UI-REVIEW（commit `b17403b`）通過後，執行 Seller Agent Settings UI smoke test。
目標：驗證 `/settings/agent` 頁面的 GET、PATCH、Webhook Secret UX 等互動行為。

## 2. UI Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |

## 3. Reviewed Commits

| commit | message |
|--------|---------|
| `6a8153a` | `feat-ui-step7e-seller-agent-settings`（UI 實作） |
| `b17403b` | `docs-step7e-seller-agent-settings-ui-review`（review 文件） |

## 4. 測試環境

| 項目 | 狀態 |
|------|------|
| API server（port 8080） | ✅ 執行中 |
| Shop app（port 22696） | ✅ 執行中 |
| API server 來源 | 主 workspace（`/home/runner/workspace/artifacts/api-server`） |
| Shop app 來源 | 主 workspace（`/home/runner/workspace/artifacts/shop-app`） |

### 環境限制（重要）

**執行中的 API server 與 shop-app 均來自主 workspace，而 Step 7E 的 sellerAgent 路由與 `AgentSettings.tsx` UI 變更僅存在於 worktree（`qa/step7e-seller-agent-settings-ui` 分支）。**

因此：
1. 訪問 `/api/stores/:id/agent/settings` → 主 workspace API server 無此 route → 回應 `{"error":"Not found"}`（404）
2. 訪問 shop-app 的 `/settings/agent` → 主 workspace shop-app 無 `AgentSettings.tsx` → 頁面不存在
3. Clerk `requireAuth` 強制要求 session token，無法透過 curl 直接測試 worktree API server
4. 無 headless browser，無法執行 UI 互動測試

**結論：完整的 browser-based smoke test 在目前環境無法執行。** 需合併 worktree 分支至主線並重建服務後才能進行。

## 5. Preview URL

| 項目 | 值 |
|------|-----|
| 主 workspace shop-app | `http://localhost:22696`（無 AgentSettings.tsx） |
| 可訪問的 `/settings/agent` | ❌ 不可用（主 workspace 無此頁面） |

## 6. 測試 Store

| 項目 | 值 |
|------|-----|
| 可用 stores | id=44（我的代購店）、id=1（小軒代購） |
| 測試前 seller_agent_settings rows | **0 rows**（無任何設定資料） |

## 7. 測試前資料狀態

```sql
SELECT * FROM seller_agent_settings;
-- (0 rows)
```

pre-test 狀態：seller_agent_settings 表為空，無需還原。

## 8. Smoke Test Checklist 結果

由於環境限制，所有 browser-based 測試無法執行。以下記錄各項目狀態：

| 項目 | 驗證方式 | 結果 |
|------|---------|------|
| A. `/settings` 頁面：AI 代查設定入口卡片 | 靜態審查（UI-REVIEW） | ✅ 已確認存在 |
| A. 點擊卡片導覽至 `/settings/agent` | 靜態審查 | ✅ `setLocation("/settings/agent")` 正確 |
| B. `/settings/agent` 頁面標題 | 靜態審查 | ✅「AI 代查設定」 |
| B. GET settings（有 store 時） | ❌ 環境限制 | 無法執行 |
| B. 無 row 時顯示 default config | 靜態審查 | ✅ `isDefault = !settings.id` |
| B. loading / error 狀態 | 靜態審查 | ✅ 三種早期 return 均有 BottomNav |
| C. 修改欄位並儲存（PATCH） | ❌ 環境限制 | 無法執行 |
| C. toast 成功 | ❌ 環境限制 | 無法執行 |
| D. 重載後資料仍存在（GET refetch） | ❌ 環境限制 | 無法執行 |
| D. 不顯示 webhookSecretHash | 靜態審查 | ✅ 確認未存取此欄位 |
| E. webhookSecret 更換 | ❌ 環境限制 | 無法執行 |
| F. webhookSecret 清除 | ❌ 環境限制 | 無法執行 |
| G. PATCH 不送 forbidden fields | 靜態審查 | ✅ payload 已核對 |
| G. UI 不顯示 platform_managed_reserved | 靜態審查 | ✅ safeMode guard 正確 |

## 9. 已驗證項目（替代方式）

| 驗證項目 | 結果 |
|---------|------|
| DB schema `seller_agent_settings` 存在 | ✅（psql `\d` 確認） |
| DB 欄位與 API schema 一致 | ✅（store_id, agent_status, agent_mode, webhook_secret_hash 等） |
| API route 在 source 中已註冊 | ✅（`sellerAgent.ts` GET/PATCH routes 存在） |
| typecheck 0 errors | ✅（前輪 UI-IMPL 確認） |
| vite build success | ✅（前輪 UI-IMPL 確認） |
| integration test 25 pass | ✅（前輪 integration test 確認） |
| mock test 45 pass | ✅（前輪 mock test 確認） |

## 10. 儲存 / 重載結果

❌ 無法執行（環境限制）

## 11. Webhook Secret 更換 / 清除結果

❌ 無法執行（環境限制）

安全規則靜態驗證：
- `webhookSecret` 不顯示原文 ✅
- `webhookSecretHash` 不存取 ✅
- 更換邏輯：secretMode === "editing" + newSecret 非空 ✅
- 清除邏輯：window.confirm + PATCH `{ webhookSecret: null }` ✅

## 12. Cleanup / Restore 結果

**未寫入任何測試資料**（環境限制，無法呼叫 API）。

pre-test 狀態 = post-test 狀態：`seller_agent_settings` 表 0 rows，無需清理。

```sql
SELECT COUNT(*) FROM seller_agent_settings;
-- 0
```

## 13. 是否發現 Blocking Bug

**無 blocking bug。**

靜態審查（UI-REVIEW）已全部通過，未發現程式邏輯錯誤。

環境限制造成無法執行 browser-based 測試，但這是部署架構問題，非 UI 程式碼問題。

## 14. Non-blocking Notes

1. **環境限制（deployment gap）**：Worktree 分支尚未合併至主 workspace，執行中服務不包含 Step 7E 變更。Full smoke test 需合併後重建。
2. **webhookSecret 區塊顯示**（前輪 UI-REVIEW 已記錄）：不隨 `webhookEnabled` 收折，non-blocking UX issue。

## 15. 未執行項目

| 項目 | 狀態 |
|------|------|
| Browser-based UI 互動測試 | 未執行（環境限制：執行中服務無 Step 7E 變更） |
| 修改 UI 行為 | 未執行（本次為 smoke test） |
| 修改 backend API | 未執行 |
| DB push / migrate / seed | 未執行 |
| push GitHub | 未執行 |

## 16. 風險與待確認

1. **Deployment gap**：Full browser smoke test 需合併 `qa/step7e-seller-agent-settings-ui` 至主線並重建服務
2. 實際 GET/PATCH 端對端行為未驗證（已通過 integration test，具備信心度）
3. Toast 通知、button disabled state 等純 UI 行為未能實測

## 17. 下一步建議

**Step 7E-2-FINAL-REVIEW（或 MERGE-PREP）**：
1. 合併 `qa/step7e-seller-agent-settings-ui` → 主線
2. 重建 API server（加入 sellerAgent routes）
3. 重建 shop-app（加入 AgentSettings.tsx）
4. 執行完整 browser smoke test（已有 checklist）
5. 確認後進入 Step 7E-2-FINAL-REVIEW
