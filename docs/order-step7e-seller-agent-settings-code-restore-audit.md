# Step 7E-1a-CODE-RESTORE seller_agent_settings Schema / Migration 恢復紀錄

**建立時間**：2026-06-08
**執行 worker**：Claude B（Code Restore Mode）
**任務編號**：Step 7E-1a-CODE-RESTORE

---

## 1. 任務背景

`seller_agent_settings` 的 schema 與 migration 先前歷經多次重建與遺失：

1. Step 7E-1a-R（schema / migration review）原本在 worktree `/home/runner/workspace-step7e-main` 完成，後因該 worktree 目錄被刪除而永久遺失。
2. Step 7E-1a-REBUILD 在新建的 worktree `/home/runner/workspace-step7e-rebuild` 重建了 `sellerAgentSettings.ts`、`0001_seller_agent_settings.sql` 與 `index.ts` export，並產出 handoff 同步回主 workspace（Step 7E-1a-REBUILD-H）。
3. Step 7E-1a-REBUILD-R（針對 REBUILD 結果的審查）也在同一個 `workspace-step7e-rebuild` worktree 完成，但該 worktree之後同樣從磁碟上消失，REBUILD-R 的審查內容無法 exact restore（已記錄於 `docs/order-step7e-rebuild-r-main-handoff-repair.md`）。
4. 最終確認：主 workspace（`/home/runner/workspace`）中實際上**從未存在** `sellerAgentSettings.ts`、`0001_seller_agent_settings.sql` 這兩個程式碼檔案——它們只存在於已消失的暫時 worktree 中。

## 2. 為什麼需要 code restore

前幾輪任務（REBUILD、REBUILD-R、REBUILD-RH、REBUILD-R-MAIN）皆只處理「handoff 文字紀錄」的同步或重建，並未真正讓 `sellerAgentSettings.ts` 與 `0001_seller_agent_settings.sql` 這兩個程式碼檔案落地到一個**持久化**的位置。

因此本次任務的目標是：在主 workspace 內建立一個**持久化**的 worktree（位於 `.worktrees/` 之下，不會像先前的外部 worktree 一樣容易被清理），重新撰寫並落地這兩個程式碼檔案，從根本解決「程式碼本體遺失」的問題，而不是再做一次 handoff 層級的轉述。

## 3. 持久 worktree 路徑

```
/home/runner/workspace/.worktrees/step7e-code-restore
```

此路徑位於主 workspace 內部（`.git/info/exclude` 已加入 `.worktrees/`，使其不會出現在 `git status` 的 untracked 清單中，也不會被 commit），相較於先前位於 `/home/runner/` 下的外部 worktree，更不容易因環境清理而遺失。

## 4. branch

```
qa/step7e-seller-agent-settings-code-restore
```

- 基底：`main`
- 已驗證 `git merge-base --is-ancestor d441fd9 HEAD` → `contains d441fd9` ✅

## 5. schema 檔案位置

```
lib/db/src/schema/sellerAgentSettings.ts   （新增）
lib/db/src/schema/index.ts                 （修改：新增 export）
```

`index.ts` 新增第 10 行：

```ts
export * from "./sellerAgentSettings.ts";
```

僅新增此一行，未改動其餘既有 export。

## 6. migration 檔案位置

```
lib/db/migrations/0001_seller_agent_settings.sql   （新增；migrations/ 目錄原本不存在，本次建立）
```

手寫 DDL，內容包含：

- `CREATE TABLE IF NOT EXISTS "seller_agent_settings"`（含 PK、UNIQUE、3 個 CHECK constraint、FK）
- 3 個 `CREATE INDEX IF NOT EXISTS`
- 檔頭註解明確說明：本專案原偏向 `drizzle-kit push`、本檔案是手寫 DDL 紀錄、未執行 DB push / migrate、未來可能與 `drizzle-kit generate` journal 編號衝突

未對任何既有資料表（`orders` / `seller_agent_tokens` / `agent_run_logs` / `shipment_trackings` / `shipment_tracking_events` 等）做 `DROP` / `ALTER` / `TRUNCATE`。

## 7. 欄位清單

| 欄位（TS / SQL） | 型別 | 預設值 / 約束 | 備註 |
|---|---|---|---|
| `id` / `id` | serial PK | — | |
| `storeId` / `store_id` | integer NOT NULL | UNIQUE, FK → `stores.id` ON DELETE CASCADE | 一個 store 僅能有一組設定 |
| `merchantId` / `merchant_id` | text NOT NULL | — | 對齊 `stores.merchantId` 命名風格 |
| `agentStatus` / `agent_status` | text NOT NULL | default `'disabled'`，CHECK IN (`disabled`,`enabled`) | |
| `agentMode` / `agent_mode` | text NOT NULL | default `'rule_worker'`，CHECK 四值白名單 | 不接受任意 provider code |
| `enabledLogistics` / `enabled_logistics` | jsonb NOT NULL | default `[]` | 應用層白名單驗證 |
| `queryMethods` / `query_methods` | jsonb NOT NULL | default `["manual"]` | 應用層白名單驗證 |
| `queryFrequency` / `query_frequency` | text NOT NULL | default `'manual'`，CHECK 四值白名單 | 不接受任意 cron 字串 |
| `notifyOnUnknown` / `notify_on_unknown` | boolean NOT NULL | default `true` | |
| `requireConfirmOnException` / `require_confirm_on_exception` | boolean NOT NULL | default `true` | |
| `requireConfirmOnReturned` / `require_confirm_on_returned` | boolean NOT NULL | default `false` | |
| `requireConfirmOnDelivered` / `require_confirm_on_delivered` | boolean NOT NULL | default `false` | |
| `hideErrorDetailsFromBuyer` / `hide_error_details_from_buyer` | boolean NOT NULL | default `true` | |
| `webhookEnabled` / `webhook_enabled` | boolean NOT NULL | default `false` | |
| `webhookUrl` / `webhook_url` | text | NULL | |
| `webhookSecretHash` / `webhook_secret_hash` | text | NULL | 只存雜湊，不存明文 |
| `lastTestRunAt` / `last_test_run_at` | timestamptz | NULL | |
| `lastRunAt` / `last_run_at` | timestamptz | NULL | |
| `createdAt` / `created_at` | timestamptz NOT NULL | default `now()` | |
| `updatedAt` / `updated_at` | timestamptz NOT NULL | default `now()`，`$onUpdate` | |

## 8. enum / allowed values

定義於 `sellerAgentSettings.ts`，供應用層引用（避免散落各處的字串字面量）：

- `sellerAgentStatusEnum`：`disabled` / `enabled`
- `sellerAgentModeEnum`：`self_hosted_webhook` / `external_agent` / `rule_worker` / `platform_managed_reserved`（保留值，目前不開放選用——**不接受自由 provider code**）
- `sellerAgentQueryFrequencyEnum`：`manual` / `daily` / `every_6_hours` / `every_2_hours_high_tier`（**不接受任意 cron 字串**）
- `sellerAgentLogisticsEnum`（應用層白名單）：`seven_eleven` / `family_mart` / `home_delivery` / `other` / `webhook`
- `sellerAgentQueryMethodEnum`（應用層白名單）：`manual` / `csv_import` / `webhook` / `scheduled`

設計上明確**不支援多 Agent per store**（`storeId` 為 UNIQUE）、**不接受自由 prompt**（schema 中無任何自由文字 prompt 欄位，`agentMode` 僅限固定列舉）。

## 9. index / constraint / FK

- **PRIMARY KEY**：`id`
- **UNIQUE**：`seller_agent_settings_store_id_unique` on `store_id`（一 store 一組設定）
- **FOREIGN KEY**：`store_id` → `stores(id)`，`ON DELETE CASCADE`
- **CHECK constraints**（3 個）：
  - `seller_agent_settings_agent_status_valid`
  - `seller_agent_settings_agent_mode_valid`
  - `seller_agent_settings_query_frequency_valid`
- **INDEX**（3 個）：
  - `seller_agent_settings_merchant_id_store_id_idx` on (`merchant_id`, `store_id`)
  - `seller_agent_settings_agent_status_idx` on `agent_status`
  - `seller_agent_settings_query_frequency_idx` on `query_frequency`

風格與既有 `sellerAgentTokens.ts` / `agentRunLogs.ts` 一致（使用 `pgTable` + `index` / `unique` / `check` + `sql` template、`createInsertSchema` / `drizzle-zod` 產生 insert schema 與型別）。

## 10. 未施工項目

- **未施工 API**：`GET/PATCH /api/seller/agent/settings` 尚未建立
- **未施工 UI**：Seller Agent 設定面板尚未建立
- **未修改 middleware / orders route / tracking route**
- **未修改 package.json / lockfile**
- **未執行 DB push**（`drizzle-kit push`）
- **未執行 migrate**
- **未 seed**
- **未 commit**：所有變更皆為 untracked / 未 staged 狀態
- **未 push**

## 11. 測試與檢查結果

已執行：

- `git worktree add -b qa/step7e-seller-agent-settings-code-restore .worktrees/step7e-code-restore main` → 成功
- `git merge-base --is-ancestor d441fd9 HEAD` → `contains d441fd9` ✅
- `git status --short` / `git diff --cached --name-status` → 確認無 staged changes，新增檔案皆為 untracked
- 手動核對 `enabledLogistics` / `queryMethods` / `agentMode` / `queryFrequency` 列舉值與規格需求（`agentStatus` / `agentMode` / `queryFrequency` / `enabledLogistics` / `queryMethods` 五組白名單）逐一比對一致 ✅
- 手動核對 FK 參照 `storesTable`，風格與 `sellerAgentTokens.ts`、`agentRunLogs.ts` 一致 ✅
- 手動核對 `UNIQUE on storeId`、`ON DELETE CASCADE`、`webhookSecretHash` 只存雜湊（命名與註解皆對齊 `sellerAgentTokensTable.tokenHash` 的處理方式）✅

未執行：

- **typecheck**：未執行有效 typecheck，原因是：本 worktree 未安裝 node_modules（`ls node_modules/.bin/tsc`、`ls lib/db/node_modules/.bin/tsc` 皆無結果），且依規範不安裝依賴 / 不觸發網路下載。**因此 `sellerAgentSettings.ts` 的 TypeScript 語法正確性尚未經編譯器驗證，不可視為已通過 typecheck。**
- `drizzle-kit push` / `migrate` / `seed`：依規範本次不執行任何 DB 寫入
- API / UI 相關測試：本次不施工 API / UI

## 12. 風險與待確認

1. **typecheck 仍未驗證**：`sellerAgentSettings.ts` 的語法正確性自始至終未經 TypeScript 編譯器驗證，建議在具備完整 `node_modules` 的環境執行 `pnpm --filter @workspace/db exec tsc --noEmit`。
2. **migration 定位未決**：`lib/db/migrations/` 目錄原本不存在，本次新建並寫入手寫 DDL；本專案原本偏向 `drizzle-kit push`，此手寫 SQL 未來可能與 `drizzle-kit generate` 自動產生的 journal 編號衝突，需使用者決定其定位（baseline 保留 / 正式 migration / 刪除回 push-only）。
3. **JSONB 白名單無 DB CHECK**：`enabledLogistics` / `queryMethods` 的白名單僅在應用層驗證，DB 層無 CHECK constraint，無效值可被直接插入，API 層必須嚴格驗證。
4. **DB schema drift**：`seller_agent_settings` 表尚未建立於實際 DB，Step 7E-1b API 施工前需先決定是否執行 `drizzle-kit push`。
5. **持久化 worktree 仍需使用者妥善保留**：雖然 `.worktrees/step7e-code-restore` 位於主 workspace 內部、已加入 `.git/info/exclude`，理論上比外部 worktree 更穩定，但仍建議盡快將本次新增的程式碼 commit 到適當分支，以徹底排除再次遺失的風險（本次依規範未 commit）。

## 13. 下一步建議

1. **typecheck 補強**：在具備完整 `node_modules` 的環境對 `sellerAgentSettings.ts` 執行 `pnpm --filter @workspace/db exec tsc --noEmit`。
2. **migration 策略決策**：確認 `0001_seller_agent_settings.sql` 的定位（baseline 保留 / 正式 migration / push-only）。
3. **考慮儘早 commit**：待使用者確認內容無誤後，將本次新增的程式碼 commit 到適當分支，避免再度因環境變動而遺失。
4. **DB push（視需要）**：若可安全連接 DB，執行 `drizzle-kit push` 建立 `seller_agent_settings` 表。
5. **Step 7E-1b**：建立 `GET/PATCH /api/seller/agent/settings` API，以 Seller session auth 保護，不混用 Agent Bearer token。
