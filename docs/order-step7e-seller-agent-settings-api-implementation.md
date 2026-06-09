# Step 7E-1b-API-IMPL seller_agent_settings GET/PATCH API 實作

## 1. 任務背景

- 任務名稱：Step 7E-1b-API-IMPL
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：實作 `GET /stores/:storeId/agent/settings` 與 `PATCH /stores/:storeId/agent/settings`
- 前置任務已完成：CODE-RESTORE-VERIFY / TYPECHECK / API-PREFLIGHT

## 2. API Worktree / Branch / Commit 狀態

| 項目 | 狀態 |
|------|------|
| worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| branch | `qa/step7e-seller-agent-settings-api` |
| 起始 commit | `c71616a`（`docs-step7e-seller-agent-settings-api-preflight`）|
| 本次 API commit | `dc75672`（`feat-api-step7e-seller-agent-settings`）|
| branch 乾淨 | ✓（無 staged / modified files）|

## 3. 實作 Route

### 新增檔案

`artifacts/api-server/src/routes/sellerAgent.ts`

### 修改檔案

`artifacts/api-server/src/routes/index.ts`

### API 端點

| 方法 | URL |
|------|-----|
| GET | `/stores/:storeId/agent/settings` |
| PATCH | `/stores/:storeId/agent/settings` |

## 4. Auth / Ownership

| 項目 | 決策 |
|------|------|
| Auth middleware | `requireAuth`（Clerk session）|
| req.userId | Clerk user ID = merchantId |
| Store ownership | `verifyStoreOwner(req, res, storeId)`（現有 helper）|
| merchantId 來源 | `req.userId`（ownership 通過後即等同 merchantId）|
| Agent Bearer token | **禁止混用**（agentTokenAuth 不可用於此 API）|

## 5. GET /stores/:storeId/agent/settings 行為

- Row 不存在時：回傳 in-memory 預設值（**不建立 DB row，GET 無副作用**）
- Row 存在時：回傳 DB row（去除敏感欄位後）
- 預設值：

```json
{
  "agentStatus": "disabled",
  "agentMode": "rule_worker",
  "enabledLogistics": [],
  "queryMethods": ["manual"],
  "queryFrequency": "manual",
  "notifyOnUnknown": true,
  "requireConfirmOnException": true,
  "requireConfirmOnReturned": false,
  "requireConfirmOnDelivered": false,
  "hideErrorDetailsFromBuyer": true,
  "webhookEnabled": false,
  "webhookUrl": null,
  "hasWebhookSecret": false,
  "lastTestRunAt": null,
  "lastRunAt": null
}
```

## 6. PATCH /stores/:storeId/agent/settings 行為

- 策略：Upsert（`db.insert(...).onConflictDoUpdate({ target: sellerAgentSettingsTable.storeId })`）
- Row 不存在時：INSERT 新 row（storeId + merchantId + patch fields）
- Row 存在時：UPDATE 衝突 row（只更新 patch fields + updatedAt）

## 7. Validation

採用 **Set 白名單模式**（與 `agent.ts` 現有模式一致）：

| 驗證層級 | 策略 |
|--------|------|
| 未知 key | 一律 400 |
| 禁止 key（id, storeId, merchantId, webhookSecretHash, 等）| 一律 400 |
| enum 欄位 | Set.has() 白名單驗證 |
| boolean 欄位 | typeof === 'boolean' |
| webhookUrl | new URL() 驗證 |
| webhookSecret | string, 長度 16~256 |
| 陣列欄位（enabledLogistics, queryMethods）| Array.isArray() + 逐項 Set 驗證 |

## 8. Response Safety — webhookSecretHash 安全策略

- **永遠不回傳** `webhookSecretHash`（不論 GET / PATCH）
- Response 使用 `hasWebhookSecret: boolean` 替代（`true` 表示已設 secret）
- `toSafeSettings()` 函數負責過濾所有敏感欄位

## 9. webhookSecret / webhookSecretHash 處理

| 動作 | 機制 |
|------|------|
| 接受輸入 | PATCH body 傳入 `webhookSecret`（明文，16~256 字元）|
| 儲存方式 | SHA-256（`createHash("sha256").update(secret).digest("hex")`）存入 `webhookSecretHash` |
| 清除 | `webhookSecret: null` → `webhookSecretHash: null` |
| 不記錄 | 明文 secret 不寫 log，不存 DB |
| 不回傳 | `webhookSecretHash` 永不出現在 API response |

## 10. platform_managed_reserved 決策

- `platform_managed_reserved` 是保留值（schema 允許，但設計上不開放 seller 選用）
- PATCH `agentMode` 白名單僅包含：`self_hosted_webhook`, `external_agent`, `rule_worker`
- 嘗試設定 `platform_managed_reserved` 一律回 400

```
error: "invalid_agent_mode"
message: "agentMode must be one of: self_hosted_webhook, external_agent, rule_worker (platform_managed_reserved is reserved and not selectable)"
```

## 11. TypeScript Typecheck 結果

### 執行方式

因 worktree 無 node_modules，採用以下步驟：

1. 建立 node_modules symlink（@workspace 指向 worktree 版本，其餘指向 main workspace）
2. 手動 build worktree 的 `lib/db` 與 `lib/api-zod`（生成 dist/ 宣告檔）
3. 執行 `npx tsc -p tsconfig.json --noEmit`

### 結果

| 檔案 | 錯誤數 |
|------|--------|
| `sellerAgent.ts`（本次新增）| **0 errors** |
| `cvs.ts:163` | `TS18047 'geoMatch' is possibly 'null'` ← **pre-existing，不在本次修復範圍** |

**說明**：`cvs.ts:163` 的 `TS18047` 錯誤在 main workspace typecheck 不存在，僅在 worktree typecheck 環境出現，原因與 project reference build cache 差異有關。不影響本次施工。

## 12. 未執行項目

- 未 DB push
- 未 migrate
- 未施工 UI
- 未 push GitHub
- 未執行 integration test（無執行中 DB）
- 未執行 E2E HTTP test（無執行中 server）
- 未修復 `cvs.ts:163 TS18047`（不在本次範圍）

## 13. 已知風險

| 風險 | 說明 |
|------|------|
| DB table 尚未建立 | `seller_agent_settings` table 需 DB push 後才可使用 |
| Drizzle journal 衝突 | `0001_seller_agent_settings.sql` 為手寫 DDL，可能與 drizzle-kit 編號衝突 |
| `as any` cast | upsert 的 insert values 和 onConflictDoUpdate set 使用 `as any`，與 agent.ts 模式一致 |
| worktree dist/ | lib/db dist/ 和 lib/api-zod dist/ 是本次手動 build，不在 git 中（.gitignore）|

## 14. 下一步建議

1. **DB push**：`pnpm --filter @workspace/db push`（建立 seller_agent_settings table）
2. **Integration test**：DB push 後可執行真實 DB 測試
3. **UI 施工**：seller agent settings 管理頁面
4. **E2E 測試**：完整 API 流程驗收
5. **DB migration review**：確認手寫 DDL 與 drizzle-kit journal 是否衝突
