# Step 7E-1b Integration Test：seller_agent_settings GET/PATCH API

## 任務背景

Step 7E-1b-DB-PUSH 已完成後，本次執行真實 DB integration test，驗證 seller_agent_settings API 對 GET / PATCH 的實際行為。

## API Worktree / Branch

- **Worktree**：`/home/runner/workspace/.worktrees/step7e-api`
- **Branch**：`qa/step7e-seller-agent-settings-api`

## DB Push Commit

- **DB push commit**：`793a17f` (docs-step7e-seller-agent-settings-db-push)
- 確認：`git merge-base --is-ancestor 793a17f HEAD` → 已包含

## DB Identity Summary（不含 secret）

| 欄位     | 值             |
| -------- | -------------- |
| Protocol | `postgresql:`  |
| Host     | `helium`       |
| Database | `heliumdb`     |
| Port     | (default 5432) |
| Username | SET            |
| Password | SET（未輸出）  |

## Test Store

| 欄位        | 值                                 |
| ----------- | ---------------------------------- |
| store_id    | `1`                                |
| merchant_id | `user_3ESB3C2JbFwb68MtvKgLe70Hpg4` |
| name        | `小軒代購`                         |

## 測試前 Row 狀態

- 測試前 `seller_agent_settings WHERE store_id = 1` → **0 rows（無既有 row）**
- 因此測試後需 DELETE 測試 row

## 測試方式

**方案 A（實際採用）**：

- Integration guard：`RUN_SELLER_AGENT_INTEGRATION_TESTS=1` + `DATABASE_URL` 必須 SET
- Mock：僅 `@clerk/express`（讀取 `x-test-user-id` header 作為 userId）
- DB：真實 DB（`@workspace/db` 無 mock）
- 測試框架：Node.js v24 built-in `node:test`
- 啟動方式：`--experimental-test-module-mocks` + `tsx` ESM loader

**執行指令**：

```bash
cd /home/runner/workspace/.worktrees/step7e-api

RUN_SELLER_AGENT_INTEGRATION_TESTS=1 \
  node --experimental-test-module-mocks \
  --import /home/runner/workspace/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/esm/index.cjs \
  --test artifacts/api-server/src/routes/sellerAgent.integration.test.mjs
```

**測試檔路徑**：

```
artifacts/api-server/src/routes/sellerAgent.integration.test.mjs
```

## 測試案例

| Flow | 案例       | 描述                                                                           |
| ---- | ---------- | ------------------------------------------------------------------------------ |
| A    | A-1 ～ A-6 | GET no row → default config（不寫入 DB）                                       |
| B    | B-1 ～ B-4 | PATCH valid payload → 建立 DB row（storeId 來自 URL、merchantId 來自 session） |
| C    | C-1 ～ C-3 | GET row exists → 安全 response（不含 webhookSecretHash）                       |
| D    | D-1 ～ D-4 | PATCH webhookSecret → DB 存 SHA-256 hash、不存明文、response 不含 hash / 明文  |
| E    | E-1 ～ E-3 | PATCH forbidden keys（storeId、merchantId、webhookSecretHash）→ 400            |
| F    | F-1 ～ F-2 | PATCH platform_managed_reserved → 400、DB 不更新                               |
| G    | G-1 ～ G-2 | 錯誤 userId（ownership failure）→ 403、DB 不修改                               |
| H    | H-1        | Cleanup 結構驗證                                                               |

**總計**：8 flows、25 tests

## 測試結果

```
tests 25
suites 8
pass  25
fail  0
cancelled 0
skipped 0
todo  0
duration_ms 1907.151684
```

**所有 25 tests 通過，0 fail。**

## Cleanup / Restore 結果

- 測試前：store_id=1 的 `seller_agent_settings` 無 row
- 測試過程：寫入 1 row（PATCH 測試用）
- 測試後：`after()` hook 執行 `DELETE FROM seller_agent_settings WHERE store_id = 1`
- 驗證：測試結束後查詢 → **0 rows**（已完整清理）
- 無需還原，因測試前無既有 row

## 是否發現 API Bug

**否。** 所有 25 tests 通過，API 行為符合預期：

- GET no row → 回傳 in-memory default，不建立 DB row ✓
- PATCH → upsert DB row，storeId 來自 URL、merchantId 來自 session ✓
- webhookSecret → SHA-256 hash 存 DB，明文不存、不回傳 ✓
- forbidden keys / platform_managed_reserved → 400 ✓
- ownership failure → 403，DB 不修改 ✓

## 未執行項目

| 項目                                              | 原因                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 不同 storeId 的隔離測試                           | 只有 2 個 dev store，已用 store_id=1 + 錯誤 merchant 測試 ownership，足以驗證隔離                  |
| webhookSecret null（清除 secret）流程的 DB verify | 已有 mock test 覆蓋此案例（sellerAgent.route.test.mjs 有 `webhookSecret = null` 案例），未重複測試 |

## 嚴格限制確認

| 項目                                | 結果                                             |
| ----------------------------------- | ------------------------------------------------ |
| 本次未 DB push                      | ✓                                                |
| 本次未 migrate                      | ✓                                                |
| 本次未 seed                         | ✓                                                |
| 本次未施工 UI                       | ✓                                                |
| 本次未 push GitHub                  | ✓                                                |
| 本次未輸出 secret value             | ✓                                                |
| 本次有執行測試資料寫入              | ✓（seller_agent_settings store_id=1 寫入 1 row） |
| 本次已清理 / 還原                   | ✓（after() 執行 DELETE，驗證 0 rows）            |
| 本次未修改 API / schema / migration | ✓                                                |
| 本次未修改其他表資料                | ✓                                                |

## 風險與待確認

1. Integration test 使用真實 dev store（store_id=1）。若未來 store_id=1 被刪除，需更新 `TEST_STORE_ID` 常數。
2. `webhookSecret` 的明文存活於測試函數 scope，不寫入任何外部 log 或檔案。
3. Integration test 使用 `--experimental-test-module-mocks`，Node.js 可能在未來版本中修改此 API。

## 下一步建議

1. **可進入 UI 施工**：API 無 bug，所有 integration test 通過，DB 已清理。
2. 若需 CI 整合，建議在 staging DB 環境中加入 `RUN_SELLER_AGENT_INTEGRATION_TESTS=1` 設定。
3. 下一步 Step 7E-2：前端 Seller Agent Settings UI 施工。
