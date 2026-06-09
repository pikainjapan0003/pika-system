# Step 7E-1b-API-REVIEW seller_agent_settings API 審查紀錄

## 1. 任務背景

- 任務名稱：Step 7E-1b-API-REVIEW
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：審查 `GET/PATCH /stores/:storeId/agent/settings` API 實作
- 前置任務：API-IMPL（dc75672）、API-IMPL-CLOSEOUT（251216d）

## 2. API Worktree / Branch

| 項目 | 值 |
|------|-----|
| worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| branch | `qa/step7e-seller-agent-settings-api` |

## 3. Reviewed Commits

| commit | message | 角色 |
|--------|---------|------|
| `dc75672` | `feat-api-step7e-seller-agent-settings` | API 實作 |
| `251216d` | `docs-step7e-seller-agent-settings-api-implementation` | implementation doc |

## 4. Reviewed Files

| 檔案 | 用途 |
|------|------|
| `artifacts/api-server/src/routes/sellerAgent.ts` | 本次審查主體 |
| `artifacts/api-server/src/routes/index.ts` | route 掛載確認 |
| `artifacts/api-server/src/routes/stores.ts` | 現有 route 風格參考 |
| `artifacts/api-server/src/routes/orders.ts` | 現有 route 風格參考（含 verifyStoreOwner）|
| `artifacts/api-server/src/routes/agent.ts` | agent route 風格參考 |
| `artifacts/api-server/src/middlewares/auth.ts` | requireAuth / verifyStoreOwner 定義 |
| `artifacts/api-server/src/middlewares/agentAuth.ts` | agentTokenAuth 定義（確認未使用）|
| `lib/db/src/schema/sellerAgentSettings.ts` | DB schema 對照 |

## 5. Auth Review

| 審查項目 | 結果 | 說明 |
|--------|------|------|
| 使用 `requireAuth` | ✓ PASS | GET 和 PATCH 均有 `requireAuth` middleware |
| 未使用 `agentTokenAuth` | ✓ PASS | 未 import，未使用 |
| `requireAuth` 設定 `req.userId` | ✓ PASS | Clerk session userId 正確設定 |

**細節**：`requireAuth` 從 `../middlewares/auth.ts` 引入，同 `stores.ts` / `orders.ts` / `agent.ts` 用法一致。

## 6. Ownership Review

| 審查項目 | 結果 | 說明 |
|--------|------|------|
| 使用 `verifyStoreOwner` | ✓ PASS | GET 和 PATCH 均在 auth 後呼叫 |
| `storeId` 從 params 取得 | ✓ PASS | `req.params.storeId` |
| `parseInt` 有 radix 10 | ✓ PASS | `parseInt(req.params.storeId, 10)` |
| `isNaN` 檢查 | ✓ PASS | 無效 storeId 回 400 |
| `merchantId` 來自 session | ✓ PASS | 使用 `req.userId`，不從 body 取得 |

**細節**：ownership 驗證流程與 `orders.ts` 完全一致。

## 7. GET Review

| 審查項目 | 結果 | 說明 |
|--------|------|------|
| row 不存在時回傳 in-memory default | ✓ PASS | `defaultSettings(storeId, req.userId)` |
| row 不存在時無 INSERT | ✓ PASS | 僅 `db.select()`，無副作用 |
| row 存在時回傳安全 response | ✓ PASS | `toSafeSettings(row)` 明確 mapping |
| 回傳 `{ data: ... }` 包裝 | ✓ PASS | 一致的 response 結構 |
| try/catch 錯誤處理 | ✓ PASS | 500 with logger |

## 8. PATCH Review

| 審查項目 | 結果 | 說明 |
|--------|------|------|
| 使用 upsert（`onConflictDoUpdate`）| ✓ PASS | target: `storeId` unique constraint |
| insert values 含 storeId + merchantId | ✓ PASS | 新 row 所需 required fields |
| conflict set 不覆蓋 storeId / merchantId | ✓ PASS | 只更新 patch fields + updatedAt |
| `storeId` 在 FORBIDDEN_PATCH_KEYS | ✓ PASS | 拒絕 400 |
| `merchantId` 在 FORBIDDEN_PATCH_KEYS | ✓ PASS | 拒絕 400 |
| `id` 在 FORBIDDEN_PATCH_KEYS | ✓ PASS | 拒絕 400 |
| `webhookSecretHash` 在 FORBIDDEN_PATCH_KEYS | ✓ PASS | 拒絕 400 |
| `lastRunAt` / `lastTestRunAt` 在 FORBIDDEN_PATCH_KEYS | ✓ PASS | 拒絕 400 |
| 未知 key 一律 400 | ✓ PASS | `ALLOWED_PATCH_KEYS` Set 明確白名單 |
| `platform_managed_reserved` agentMode 拒絕 400 | ✓ PASS | `VALID_AGENT_MODE_SELLER` 不含此值 |
| 空 body（無可 patch 欄位）回 400 | ✓ PASS | `Object.keys(patch).length === 0` 檢查 |
| try/catch 錯誤處理 | ✓ PASS | 500 with logger |

## 9. Validation Review

| 欄位 | 驗證方式 | 結果 |
|------|--------|------|
| `agentStatus` | `VALID_AGENT_STATUS.has()` | ✓ PASS |
| `agentMode` | `VALID_AGENT_MODE_SELLER.has()`（排除 platform_managed_reserved）| ✓ PASS |
| `queryFrequency` | `VALID_QUERY_FREQUENCY.has()` | ✓ PASS |
| `enabledLogistics` | `Array.isArray()` + 逐項 `VALID_LOGISTICS.has()` | ✓ PASS |
| `queryMethods` | `Array.isArray()` + 逐項 `VALID_QUERY_METHODS.has()` | ✓ PASS |
| `notifyOnUnknown` 等 boolean 欄位 | `typeof === 'boolean'` | ✓ PASS |
| `webhookEnabled` | `typeof === 'boolean'` | ✓ PASS |
| `webhookUrl` | `new URL()` 驗證或 `null` | ✓ PASS |
| `webhookSecret` | string, 長度 16~256 | ✓ PASS |

## 10. Response Safety Review

| 審查項目 | 結果 | 說明 |
|--------|------|------|
| `webhookSecretHash` 不出現在 response | ✓ PASS | `toSafeSettings()` 明確 mapping，不包含此欄位 |
| `webhookSecret` 不出現在 response | ✓ PASS | body 輸入欄位，不進 response |
| `hasWebhookSecret: boolean` 替代 | ✓ PASS | `row.webhookSecretHash !== null` |
| `toSafeSettings()` 不 spread 整個 row | ✓ PASS | 每個欄位明確列舉 |
| `defaultSettings()` 不含敏感欄位 | ✓ PASS | 硬編碼安全預設值 |

## 11. Webhook Secret Review

| 審查項目 | 結果 | 說明 |
|--------|------|------|
| 接受明文 `webhookSecret` | ✓ PASS | PATCH body `webhookSecret` 欄位 |
| SHA-256 雜湊儲存 | ✓ PASS | `createHash("sha256").update(secret).digest("hex")` |
| 明文不寫 log | ✓ PASS | 只傳 `patch.webhookSecretHash` 至 DB |
| 清除 secret（`webhookSecret: null`）| ✓ PASS | 設 `webhookSecretHash: null` |
| `webhookSecretHash` 在 FORBIDDEN_PATCH_KEYS | ✓ PASS | 無法直接 PATCH hash 欄位 |

## 12. Route Mounting Review

| 審查項目 | 結果 | 說明 |
|--------|------|------|
| `router.use(sellerAgentRouter)` 無前綴掛載 | ✓ PASS | 與 storesRouter / ordersRouter 模式一致 |
| route path `/stores/:storeId/agent/settings` | ✓ PASS | 符合 `/stores/:storeId/*` 命名慣例 |
| import 在正確位置 | ✓ PASS | 在 `devHandoffRouter` 之前 |

## 13. Typecheck / 測試狀態

| 項目 | 狀態 |
|------|------|
| `sellerAgent.ts` typecheck | **0 errors** |
| full API typecheck | 1 pre-existing error（`cvs.ts:163 TS18047 'geoMatch' is possibly 'null'`）|
| Integration test | 未執行（無執行中 DB）|
| E2E HTTP test | 未執行（無執行中 server）|

## 14. Review Conclusion

### 結論：**pass-with-notes**

可進下一步（API-MOCK-TEST 或 DB-PUSH-PREFLIGHT）。

無阻塞問題。有以下 3 項非阻塞式 notes。

## 15. 非阻塞 Notes（pass-with-notes 原因）

### Note 1：import style 不一致

`index.ts` 中 `sellerAgentRouter` 的 import 包含 `.ts` 副檔名：

```ts
import sellerAgentRouter from "./sellerAgent.ts";  // 有 .ts
import storesRouter from "./stores";               // 無 .ts
import ordersRouter from "./orders";               // 無 .ts
```

不影響功能（`allowImportingTsExtensions: true`），但與其他路由 import 風格不一致。

**建議**：未來統一移除 `.ts` 副檔名（或全部加上），但不影響本次驗收。

### Note 2：logger vs req.log

`sellerAgent.ts` 使用 `logger` 模組：

```ts
logger.error({ err }, "seller_agent_settings_get_failed");
```

`stores.ts` / `orders.ts` 使用 `req.log`（pino-http request logger）。兩者均可接受，`agent.ts` 也使用 `logger`。

**建議**：若需統一，使用 `req.log` 可以自動帶入 request context（request ID 等）。不影響本次驗收。

### Note 3：as any upsert cast

```ts
.insert(sellerAgentSettingsTable)
.values({ storeId, merchantId: req.userId, ...(patch as any) })
.onConflictDoUpdate({
  target: sellerAgentSettingsTable.storeId,
  set: { ...(patch as any), updatedAt: new Date() },
})
```

使用 `as any` 繞過 Drizzle 型別系統。與 `agent.ts` 現有模式一致，但喪失 compile-time 型別安全。

**建議**：未來可考慮使用 Drizzle 的 `InferInsertModel` 做更嚴謹的型別，但不影響本次驗收。

## 16. 未執行項目

- 未修改 API 行為
- 未 DB push
- 未 migrate
- 未施工 UI
- 未 push GitHub

## 17. 風險與待確認

| 風險 | 嚴重度 | 說明 |
|------|--------|------|
| `seller_agent_settings` table 未建立 | 中 | integration test 需 DB push 後才可執行 |
| import style 不一致 | 低 | 功能正常，但風格問題 |
| `logger` vs `req.log` | 低 | 功能正常，request context 可能較少 |
| `as any` upsert cast | 低 | 型別安全性較低，執行正常 |

## 18. 下一步建議

1. **API-MOCK-TEST**：使用 supertest + vi.mock 執行 mock-based route test（不需真實 DB）
2. **DB-PUSH-PREFLIGHT**：確認 seller_agent_settings table 建立計劃，評估 DDL 與 drizzle-kit journal 相容性
3. DB push 後執行 integration test
4. UI 施工：seller agent settings 管理頁面
