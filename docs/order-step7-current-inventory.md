# Step 7-CURRENT-INVENTORY 目前架構與檔案盤點

> 盤點日期：2026-06-09
> 盤點分支：`qa/step6f-cvs-store-selection-browser-mobile`
> 盤點目的：使用者整理 Step 7 master plan 前的完整現況彙整

---

## 1. 盤點目的

Step 7E Seller Agent Settings 已完成並通過使用者瀏覽器確認。  
使用者要求暫停施工，先盤點 Step 7 已完成哪些架構、哪些檔案、哪些是交疊，再制定下一步整合計畫。

---

## 2. 目前 branch / git 狀態

| 項目 | 狀態 |
|------|------|
| Current branch | `qa/step6f-cvs-store-selection-browser-mobile` |
| HEAD | `c66b0c4 docs-step7e-cleanup-decision` |
| staged changes | 無 |
| unstaged: `.replit` | M（系統自動修改，非施工所為）|
| unstaged: `EditOrderDialog.tsx` | M（Step 6F WIP，+221/-178 lines，**不可碰**）|
| `.replit` stash | 已 drop（pre-step7e-merge-local-replit-ports）|
| 剩餘 stash | stash@{0}: `step7e-active-preview-switch-preserve-tracked-changes`（Branch 6F 切換時保留）、stash@{1}: `wip-step6e-generated-types-stash`（Step 6E 殘留）|

---

## 3. Step 7 目前可辨識的大架構

Step 7 涵蓋三個主要子系統，目前完成進度不一：

| 子系統 | 別名 | 完成狀態 |
|--------|------|---------|
| 賣家 AI 代查設定（Seller Agent Settings UI） | Step 7E | **已完成**（DB + API + generated client + UI + user browser check PASS）|
| AI 代查 Worker API（agent tracking jobs / events / run-log）| Step 7D | **部分完成**（code 已寫，在 worktree commit 中，未正式 merge 至 main branch）|
| 出貨追蹤批次匯入（Tracking Import）| Step 7B | **部分完成**（API route 已存在，UI 整合未確認）|
| 出貨追蹤 Schema / Model | Step 7C | **Schema 已推至 DB**（code 在獨立 branch，未 merge 至 target）|

---

## 4. DB / Schema / Migration 盤點

### 4.1 目前 DB 存在的 Tables（PostgreSQL public schema）

| Table | 說明 | Step |
|-------|------|------|
| `stores` | 店家基本資料 | 基礎 |
| `orders` | 訂單（含 trackingCode, trackingProvider 欄位）| 基礎 + Step 7B |
| `products` | 商品 | 基礎 |
| `product_categories` | 商品分類 | 基礎 |
| `cvs_stores` | 超商門市資料 | Step 6B/6D/6E |
| `seller_agent_settings` | AI 代查設定（已 push）| **Step 7E 已完成** |
| `seller_agent_tokens` | Agent API Token | Step 7D（DB 存在，UI 未完成）|
| `agent_run_logs` | Agent 執行歷史 | Step 7D（DB 存在，UI 未完成）|
| `shipment_trackings` | 出貨追蹤任務 | Step 7C/7D（DB 存在，UI 未完成）|
| `shipment_tracking_events` | 出貨追蹤事件 | Step 7C/7D（DB 存在，UI 未完成）|

### 4.2 Schema 檔案（`lib/db/src/schema/`）

| 檔案 | 說明 | 狀態 |
|------|------|------|
| `sellerAgentSettings.ts` | seller_agent_settings Table | **已完成**（Step 7E）|
| `sellerAgentTokens.ts` | seller_agent_tokens Table | 已定義（Step 7D，DB 已推）|
| `agentRunLogs.ts` | agent_run_logs Table | 已定義（Step 7D，DB 已推）|
| `shipmentTrackings.ts` | shipment_trackings Table | 已定義（Step 7C，DB 已推）|
| `shipmentTrackingEvents.ts` | shipment_tracking_events Table | 已定義（Step 7C，DB 已推）|
| `cvsStores.ts` | cvs_stores Table | 已完成（Step 6B）|
| `orders.ts` | orders（含 trackingCode, trackingProvider）| 基礎完成 |
| `stores.ts` | stores | 基礎完成 |
| `index.ts` | 統一匯出 | 含所有 Step 7 schema |

### 4.3 Migration 檔案（`lib/db/migrations/`）

| 檔案 | 說明 | 狀態 |
|------|------|------|
| `0001_seller_agent_settings.sql` | seller_agent_settings Migration | **唯一已提交的 Migration SQL** |

> **注意**：`seller_agent_tokens`、`agent_run_logs`、`shipment_trackings`、`shipment_tracking_events` 已存在於 DB，但對應的 migration SQL 未在 `lib/db/migrations/` 中。這些 table 可能透過 `drizzle-kit push` 直接推入，未留 migration 記錄。後續整合計畫需要補齊。

### 4.4 DB 測試資料

| Table | store_id=1 rows | 說明 |
|-------|-----------------|------|
| `seller_agent_settings` | 0 | 使用者未按儲存，無殘留 |

---

## 5. API / Middleware / Tests 盤點

### 5.1 API Routes（`artifacts/api-server/src/routes/`）

| 檔案 | 路由 | 認證 | Step | 狀態 |
|------|------|------|------|------|
| `sellerAgent.ts` | `GET /stores/:storeId/agent/settings` | requireAuth + verifyStoreOwner | Step 7E | **已完成** |
| `sellerAgent.ts` | `PATCH /stores/:storeId/agent/settings` | requireAuth + verifyStoreOwner | Step 7E | **已完成** |
| `agent.ts` | `GET /orders/tracking-jobs` | agentTokenAuth | Step 7D | 已實作（在 worktree，未 merge）|
| `agent.ts` | `POST /shipment-events` | agentTokenAuth | Step 7D | 已實作（未 merge）|
| `agent.ts` | `PATCH /shipment-status` | agentTokenAuth | Step 7D | 已實作（未 merge）|
| `agent.ts` | `POST /run-log` | agentTokenAuth | Step 7D | 已實作（未 merge）|
| `orders.ts` | `POST /orders/tracking-import` | requireAuth | Step 7B | 已實作（已在 target branch）|
| `cvs.ts` | CVS 相關路由 | requireAuth / verifyStoreOwner | Step 6B/6D | 已完成 |

> **注意**：`agent.ts` 中的 Step 7D 路由雖然在 `artifacts/api-server/src/routes/` 下，但需確認是否已 merge 至當前 target branch，或只在 worktree 的 detached HEAD 中。

### 5.2 Middleware

| 檔案 | 功能 | Step |
|------|------|------|
| `middlewares/auth.ts` | Clerk requireAuth + verifyStoreOwner | 基礎 |
| `middlewares/agentAuth.ts` | Agent Token 驗證（Bearer token hash compare）| Step 7D |

### 5.3 Tests

| 檔案 | 內容 | 狀態 |
|------|------|------|
| `sellerAgent.route.test.mjs` | Unit test for seller agent settings API | 已寫 |
| `sellerAgent.integration.test.mjs` | Integration test | 已寫 |
| `agent.route.test.mjs` | Agent API route tests | 已寫（Step 7D）|
| `agent.integration.test.mjs` | Agent API integration tests | 已寫（Step 7D）|
| `orders.route.test.mjs` | Orders API tests | 已寫 |
| `cvs.route.test.mjs` | CVS route tests | 已寫 |

---

## 6. OpenAPI / Generated Client 盤點

### 6.1 OpenAPI（`lib/api-spec/openapi.yaml`）

| Path / Schema | 說明 | Step | 狀態 |
|---------------|------|------|------|
| `GET /stores/{storeId}/agent/settings` | 取得 AI 代查設定 | Step 7E | **已完成** |
| `PATCH /stores/{storeId}/agent/settings` | 更新 AI 代查設定 | Step 7E | **已完成** |
| `POST /orders/tracking-import` | 批次匯入追蹤碼 | Step 7B | 已定義（API 存在）|
| `SellerAgentSettings` schema | 完整設定 schema | Step 7E | **已完成** |
| `UpdateSellerAgentSettingsRequest` | 更新請求 schema | Step 7E | **已完成** |
| `TrackingImportBody` / `TrackingImportRow` / `TrackingImportError` / `TrackingImportResponse` | 批次追蹤碼匯入 | Step 7B | 已定義 |

> **注意**：Step 7D（agent tracking API）尚未加入 OpenAPI spec。

### 6.2 Generated React Hooks（`lib/api-client-react/src/generated/api.ts`）

| Hook | 說明 | Step | 狀態 |
|------|------|------|------|
| `useGetSellerAgentSettings` | 取得 AI 代查設定 | Step 7E | **已完成** |
| `useUpdateSellerAgentSettings` | 更新 AI 代查設定 | Step 7E | **已完成** |

### 6.3 Generated Types（`lib/api-zod/src/generated/types/`）

| Type / Enum | 說明 | Step |
|-------------|------|------|
| `SellerAgentSettings` | 主體 interface | Step 7E ✓ |
| `SellerAgentSettingsAgentStatus` | 狀態 enum（disabled/enabled）| Step 7E ✓ |
| `SellerAgentSettingsAgentMode` | 模式 enum | Step 7E ✓ |
| `SellerAgentSettingsQueryFrequency` | 查詢頻率 enum | Step 7E ✓ |
| `SellerAgentSettingsEnabledLogisticsItem` | 物流來源 enum | Step 7E ✓ |
| `SellerAgentSettingsQueryMethodsItem` | 查詢方式 enum | Step 7E ✓ |
| `UpdateSellerAgentSettingsRequest` | 更新請求 | Step 7E ✓ |
| `TrackingImportBody` / `Row` / `Error` / `Response` | 追蹤碼匯入 | Step 7B ✓ |
| `GetSellerAgentSettings200` | 回應包裝 | Step 7E ✓ |
| `UpdateSellerAgentSettings200` | 回應包裝 | Step 7E ✓ |

---

## 7. UI / Routes / Pages / Components 盤點

### 7.1 App.tsx 已註冊路由

| Path | Component | Step | 狀態 |
|------|-----------|------|------|
| `/settings/agent` | `AgentSettingsPage` | Step 7E | **已完成** |
| `/settings` | `SettingsPage` | 基礎 + Step 7E | **已完成**（含「AI 代查設定」入口）|
| `/orders` | `OrdersPage` | 基礎 + Step 7B | 基礎完成（TrackingImport 待確認）|
| `/p/:shareToken` | `PublicOrderPage` | Step 6E | 已完成 |
| `/cvs711/select` | `Cvs711SelectPage` | Step 6D | 已完成 |
| `/cvs711/return` | `Cvs711ReturnPage` | Step 6D | 已完成 |
| `/track` | `TrackLookupPage` | 基礎 | 已完成 |

### 7.2 Pages

| 檔案 | 功能 | Step | 狀態 |
|------|------|------|------|
| `AgentSettings.tsx` | AI 代查設定頁（完整 UI：狀態/查詢/物流/Webhook）| Step 7E | **已完成** |
| `Settings.tsx` | 設定總覽（含「AI 代查設定」入口 AgentSettingsEntry）| Step 7E | **已完成** |
| `Orders.tsx` | 訂單列表 | 基礎 | 已完成（TrackingImport Dialog 狀態待確認）|
| `EditOrderDialog.tsx` | 訂單編輯（含取貨方式卡片 UI 重構）| Step 6F | **WIP，不可碰** |
| `Cvs711Select.tsx` | 超商門市選擇 | Step 6D | 已完成 |
| `Cvs711Return.tsx` | 超商門市回傳 | Step 6D | 已完成 |
| `PublicOrder.tsx` | 買家訂購頁（含 CVS 門市選擇）| Step 6E | 已完成 |
| `TrackOrder.tsx` | 追蹤碼查詢（顯示 trackingCode, trackingProvider）| 基礎 | 已完成 |
| `ShippingListDialog.tsx` | 出貨清單（顯示 trackingCode）| 基礎 | 已完成 |

### 7.3 Step 6F WIP（`EditOrderDialog.tsx`）

| 項目 | 說明 |
|------|------|
| 變更量 | +221 insertions / -178 deletions（vs HEAD）|
| 主要變更 | 取貨方式由 `<select>` 重構為卡片式 UI（`SHIPPING_CARD_OPTIONS`）；新增 `Mail` icon for 郵局宅配 |
| 是否 staged | **否** |
| 是否可碰 | **不可碰**（使用者主動開發中的 WIP）|

---

## 8. Docs 盤點

### 8.1 Step 7E 文件鏈（已完成，可作為參考）

| 文件 | 說明 |
|------|------|
| `order-step7e-seller-agent-api-schema-spec.md` | API schema 規格 |
| `order-step7e-seller-agent-settings-api-implementation.md` | API 實作記錄 |
| `order-step7e-seller-agent-settings-api-review.md` | API 審查 |
| `order-step7e-seller-agent-settings-db-push.md` | DB push 記錄 |
| `order-step7e-seller-agent-settings-integration-test.md` | 整合測試 |
| `order-step7e-seller-agent-settings-ui-implementation.md` | UI 實作記錄 |
| `order-step7e-seller-agent-settings-ui-smoke-test.md` | UI Smoke test |
| `order-step7e-seller-agent-settings-final-review.md` | Final review |
| `order-step7e-merge-execute.md` | Merge 執行記錄 |
| `order-step7e-post-merge-verify.md` | Post-merge 驗證 |
| `order-step7e-safepoint-restore-dryrun.md` | Safepoint dry-run |
| `order-step7e-app-smoke.md` | App smoke test |
| `order-step7e-preview-expose-fix.md` | Preview port 修正 |
| `order-step7e-user-browser-check-closeout.md` | 使用者 browser check |
| `order-step7e-cleanup-decision.md` | 清理決策 |

### 8.2 Step 7B / 7C / 7D 文件（架構已定義，未完成整合）

| 文件 | 說明 |
|------|------|
| `order-step7b-tracking-import-spec.md` | 批次追蹤碼匯入規格 |
| `order-step7b-tracking-import-decision.md` | 決策記錄 |
| `order-step7c-shipment-tracking-model-spec.md` | Shipment tracking model 規格 |
| `order-step7c-schema-migration-implementation-audit.md` | Schema migration 稽查 |
| `order-step7d-agent-write-api-spec.md` | Agent write API 規格 |
| `order-step7d-agent-write-api-implementation-audit.md` | 實作稽查 |
| `order-step7d-agent-api-route-implementation-audit.md` | Route 稽查 |
| `order-step7d-agent-api-integration-test-plan.md` | 整合測試計畫 |
| `order-step7d-agent-api-integration-test-result.md` | 整合測試結果 |
| `order-step7d-agent-api-final-acceptance-audit.md` | 最終驗收稽查 |
| `order-step7d-agent-auth-token-decision.md` | Token 認證決策 |
| `order-step7d-agent-token-run-log-schema-spec.md` | Token + run log schema 規格 |
| `order-step7d-db-schema-drift-resolution-plan.md` | DB schema drift 解決計畫 |

### 8.3 整合計畫最重要文件

下列文件是撰寫 Step 7 master plan 時的關鍵參考：

1. `order-step7-customer-shipment-status-spec.md` — Step 7 整體目標定義
2. `order-step7-current-field-audit.md` — 目前欄位稽查
3. `order-step7b-tracking-import-spec.md` — Step 7B 範圍定義
4. `order-step7c-shipment-tracking-model-spec.md` — Step 7C schema 設計
5. `order-step7d-agent-write-api-spec.md` — Step 7D API 規格
6. `order-step7d-agent-api-final-acceptance-audit.md` — Step 7D 驗收結果
7. `order-step7e-seller-agent-settings-final-review.md` — Step 7E final review（已完成）
8. `order-step7d-db-schema-drift-resolution-plan.md` — DB 狀態說明

---

## 9. Branches / Worktrees / Stash 盤點

### 9.1 Step 7 相關 Local Branches

| Branch | 說明 | 可清理？ |
|--------|------|---------|
| `qa/step7e-post-merge-safepoint-dryrun` | Step 7E merge 前的 dry-run 分支 | 可（已完成）|
| `qa/step6f-pre-step7e-merge-safepoint` | Step 6F WIP 保護點 | **建議保留**（Step 6F 仍 WIP）|
| `qa/step7e-seller-agent-settings-final-review` | Step 7E final review 分支 | 可（已 merge）|
| `qa/step7e-seller-agent-settings-active-preview` | Step 7E active preview 分支 | 可（已 merge）|
| `qa/step7e-seller-agent-settings-ui` | Step 7E UI 開發分支 | 可（已 merge）|
| `qa/step7e-seller-agent-settings-api` | Step 7E API 開發分支 | 可（已 merge）|
| `qa/step7e-seller-agent-workspace-main-base` | Step 7E workspace base | 可 |
| `qa/step7e-seller-agent-workspace-rebuild` | Step 7E workspace rebuild | 可 |
| `qa/step7e-seller-agent-settings-code-restore` | Code restore 分支 | 可 |
| `feat/step7c-shipment-tracking-model` | Step 7C schema 開發分支 | 需要確認（Step 7C 未整合）|
| `integration/step7b-tracking-import` | Step 7B 整合分支 | 需要確認（Step 7B 未整合）|

### 9.2 Prunable Worktrees（均標記為 prunable）

| Worktree 路徑 | 說明 | 狀態 |
|--------------|------|------|
| `/home/runner/workspace-step7e-main` | Step 7E workspace | prunable |
| `/home/runner/workspace-step7e-rebuild` | Step 7E rebuild workspace | prunable |
| `/home/runner/workspace/.worktrees/step7e-api` | Step 7E API worktree | prunable |
| `/home/runner/workspace/.worktrees/step7e-code-restore` | Code restore worktree | prunable |
| `/home/runner/workspace/.worktrees/step7e-final-review` | Final review worktree | prunable |
| `/home/runner/workspace/.worktrees/step7e-ui` | UI worktree | prunable |
| `/home/runner/worktree-step7c-*` | Step 7C shipment tracking | prunable |
| `/home/runner/worktree-step7d-*` | Step 7D agent API（多個）| prunable |

> 所有 prunable worktrees 可執行 `git worktree prune` 清理。

### 9.3 Stash

| Stash | 說明 | 建議 |
|-------|------|------|
| stash@{0}: `step7e-active-preview-switch-preserve-tracked-changes` | Step 7E 切換前保存的 tracked changes | 需確認是否仍需要，可能可以 drop |
| stash@{1}: `wip-step6e-generated-types-stash` | Step 6E generated types WIP | Step 6E 已完成，可能可以 drop |

---

## 10. Step 7E 已完成項目（完整清單）

| 類別 | 項目 | 狀態 |
|------|------|------|
| DB | `seller_agent_settings` table | ✓ pushed |
| DB | `0001_seller_agent_settings.sql` migration | ✓ 有記錄 |
| API | `GET /stores/:storeId/agent/settings` | ✓ merged |
| API | `PATCH /stores/:storeId/agent/settings` | ✓ merged |
| API | webhookSecret 以 SHA-256 hash 儲存，明文不落地 | ✓ |
| API | `hasWebhookSecret: boolean`（不洩漏 hash 原文）| ✓ |
| API | Tests: unit + integration | ✓ |
| OpenAPI | `GET /PATCH /stores/{storeId}/agent/settings` path | ✓ |
| OpenAPI | `SellerAgentSettings` schema（含所有 enum）| ✓ |
| Generated | `useGetSellerAgentSettings` hook | ✓ |
| Generated | `useUpdateSellerAgentSettings` hook | ✓ |
| Generated | SellerAgentSettings types（AgentMode, Status, Frequency 等）| ✓ |
| UI | `AgentSettings.tsx`（完整 5 區塊 UI）| ✓ merged |
| UI | `/settings/agent` route（App.tsx）| ✓ merged |
| UI | Settings.tsx 「AI 代查設定」入口（AgentSettingsEntry）| ✓ merged |
| Merge | `6611817 merge-step7e-seller-agent-settings` | ✓ |
| Fix | `f59116a fix-step7e-agent-settings-query-type`（UseQueryOptions as any）| ✓ |
| Verify | POST-MERGE-VERIFY PASS | ✓ |
| Verify | SAFEPOINT-RESTORE-DRYRUN SKIP RECOMMENDED | ✓ |
| Verify | APP-SMOKE PASS | ✓ |
| Verify | USER-BROWSER-CHECK PASS（使用者確認）| ✓ |
| Cleanup | `.replit` stash dropped | ✓ |
| Cleanup | 舊 process（8082/5173）清理 | ✓ |

---

## 11. Step 6F / Step 7 / Step 8 交疊項目

| 項目 | 交疊說明 | 狀態 |
|------|---------|------|
| `EditOrderDialog.tsx` | Step 6F CVS 門市選擇 WIP，與 Step 7E merge 後的 target branch 共存 | **WIP，不可碰** |
| `printHelpers.ts` | Step 6F WIP（discountAmount, discountNote, getReceiptFulfillmentCat）已在 `34066e8` | 已整合，stable |
| `tsconfig.json` / `vite.config.ts` | Step 6F WIP 小幅調整已在 `34066e8` | 已整合，stable |
| `TrackingImportDialog` | Step 7B 的 UI 部分，是否存在於 Orders.tsx 需確認 | **需要回頭定義** |
| `agent.ts` routes | Step 7D 實作，目前在 target branch 的 `artifacts/api-server/src/routes/agent.ts` | 需確認是否已 merge |
| `34066e8 feat-step8m-fulfillment-ui-and-receipt-split` | Step 8M 出單/收據分割，已在 target branch | 已整合 |

---

## 12. 目前 WIP / 不可碰項目

| 項目 | 原因 | 處理方式 |
|------|------|---------|
| `EditOrderDialog.tsx` | Step 6F CVS 門市選擇重構 WIP | **不可碰**，等使用者 commit |
| `.replit` | Replit 系統自動修改 | 不要 stage |
| stash@{0} | step7e-active-preview-switch 保存 | 需使用者決策 |
| `feat/step7c-shipment-tracking-model` branch | Step 7C 開發 branch，未 merge | 需要確認是否仍需要整合 |
| `integration/step7b-tracking-import` branch | Step 7B 整合 branch | 需要確認 |

---

## 13. 後續整合 Step 7 Master Plan 時必讀檔案

整合計畫前建議依序閱讀：

1. **Step 7 總體目標**
   - `docs/order-step7-customer-shipment-status-spec.md`
   - `docs/order-step7-current-field-audit.md`

2. **Step 7B（Tracking Import）**
   - `docs/order-step7b-tracking-import-spec.md`
   - `docs/order-step7b-tracking-import-decision.md`
   - `artifacts/api-server/src/routes/orders.ts`（line 488：`POST /orders/tracking-import`）

3. **Step 7C（Schema）**
   - `docs/order-step7c-shipment-tracking-model-spec.md`
   - `lib/db/src/schema/shipmentTrackings.ts`
   - `lib/db/src/schema/shipmentTrackingEvents.ts`

4. **Step 7D（Agent Worker API）**
   - `docs/order-step7d-agent-write-api-spec.md`
   - `docs/order-step7d-agent-api-final-acceptance-audit.md`
   - `docs/order-step7d-db-schema-drift-resolution-plan.md`
   - `artifacts/api-server/src/routes/agent.ts`
   - `lib/db/src/schema/sellerAgentTokens.ts`
   - `lib/db/src/schema/agentRunLogs.ts`

5. **Step 7E（已完成參考）**
   - `docs/order-step7e-seller-agent-settings-final-review.md`
   - `artifacts/shop-app/src/pages/AgentSettings.tsx`
   - `artifacts/api-server/src/routes/sellerAgent.ts`

---

## 14. 建議下一步如何整理 Step 7 計畫表

### 建議確認順序

1. **確認 Step 7D 狀態**
   - `agent.ts` 目前是否已在 target branch？（grep 結果顯示已存在 `artifacts/api-server/src/routes/agent.ts`）
   - DB tables（seller_agent_tokens, agent_run_logs 等）是否有 migration SQL 記錄？
   - Step 7D API tests 是否通過？

2. **決定 Step 7B 整合方式**
   - `POST /orders/tracking-import` 已實作
   - UI 是否有 TrackingImportDialog？在哪裡？
   - 是否需要獨立整合計畫？

3. **決定 Step 7D 整合方式**
   - agent.ts 是否需要重新 review？
   - Agent token 管理 UI 是否在 Step 7E 之外另外做？
   - run_log 查詢 UI 是否在規劃中？

4. **Step 6F 收尾**
   - EditOrderDialog.tsx WIP 需要 commit
   - 與 Step 7 master plan 的 interface 是否有影響？

5. **DB migration 補齊**
   - 已推至 DB 但無 migration SQL 的 tables（seller_agent_tokens, agent_run_logs, shipment_trackings, shipment_tracking_events）
   - 後續 CI/CD 部署是否需要補齊？

---

## 15. 不確定項目 / 需要使用者決策

| 項目 | 問題 | 優先級 |
|------|------|--------|
| `agent.ts` 目前 merge 狀態 | Step 7D routes 是否已正式 merge 到 target branch，還是只在 worktree？ | 高 |
| DB migration 記錄 | seller_agent_tokens 等 3 個 table 無 migration SQL，是否需要補？ | 高 |
| Step 7B UI | TrackingImportDialog 是否存在？在哪個 branch？ | 中 |
| Stash@{0} | step7e-active-preview-switch-preserve-tracked-changes 是否仍需要？ | 低 |
| Worktrees | prunable worktrees 是否可以 `git worktree prune`？ | 低 |
| Branch cleanup | feat/step7c, integration/step7b, qa/step7e-* 等舊 branch 是否可刪？ | 低 |

---

## 16. 結論

```
Step 7-CURRENT-INVENTORY conclusion:
- Step 7E：已完成（DB + API + generated client + UI + user browser check PASS）
- Step 7D：API code 已實作（agent.ts），DB tables 已 push，但整合狀態需確認
- Step 7B：API route 已實作（POST /orders/tracking-import），UI 整合狀態需確認
- Step 7C：Schema 已定義並 push 至 DB，但無 migration SQL 記錄
- Step 6F：EditOrderDialog.tsx WIP 進行中，不可碰
- 建議使用者先確認 Step 7B / 7C / 7D 狀態後，再制定 Step 7 整合計畫
```

---

*Generated by Claude B — Step 7-CURRENT-INVENTORY — 2026-06-09*
