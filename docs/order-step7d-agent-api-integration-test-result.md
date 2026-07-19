# Step 7D Agent API 真實 DB Integration Test 結果

日期：2026-06-08
執行者：Claude B
前置任務：Step 7D-4B-2（integration test skeleton，commit 5d6198b）

---

## 1. 執行基準

| 項目                | 值                                                                          |
| ------------------- | --------------------------------------------------------------------------- |
| main commit         | `5d6198b test-api-step7d-agent-integration-skeleton`                        |
| gitsafe-backup/main | `5d6198b`（與 main 一致）                                                   |
| worktree path       | `/home/runner/worktree-step7d-4b3-integration-run`                          |
| backup file         | `/home/runner/backups/backup-pre-step7d-4b3-integration-20260608140957.sql` |
| backup 大小         | 3.6M                                                                        |
| DATABASE_URL        | 已設定（值不輸出）                                                          |

**注意（執行環境調整）**：

- worktree 的 `artifacts/api-server/node_modules/@workspace/db` 必須指向 worktree 的 `lib/db`（而非 workspace 的 qa 分支 lib/db），因為 workspace 目前在 `qa/step6f-cvs-store-selection-browser-mobile` 分支，缺少 agent schema 檔案。
- 重建 api-server node_modules 目錄結構，將 `@workspace/db` symlink 指向 worktree 的 `/home/runner/worktree-step7d-4b3-integration-run/lib/db`。
- `tsx/esm` 使用絕對路徑：`/home/runner/workspace/scripts/node_modules/tsx/dist/esm/index.mjs`（tsx 只安裝於 scripts 子套件）。

---

## 2. 測試前 DB 物件確認

| 表 / 欄位                                     | 存在 |
| --------------------------------------------- | ---- |
| public.stores                                 | ✓    |
| public.products                               | ✓    |
| public.orders                                 | ✓    |
| public.shipment_trackings                     | ✓    |
| public.shipment_tracking_events               | ✓    |
| public.seller_agent_tokens                    | ✓    |
| public.agent_run_logs                         | ✓    |
| shipment_tracking_events.idempotency_key 欄位 | ✓    |

**測試前殘留資料確認（STEP7D*E2E* prefix count 全為 0）**：

| 表                                                        | count |
| --------------------------------------------------------- | ----- |
| stores (slug like STEP7D*E2E*%)                           | 0     |
| orders (public*token like STEP7D_E2E*%)                   | 0     |
| products (name like STEP7D*E2E*%)                         | 0     |
| seller*agent_tokens (name/token_prefix like STEP7D_E2E*%) | 0     |
| shipment*trackings (tracking_code like STEP7D_E2E*%)      | 0     |
| agent*run_logs (merchant_id like STEP7D_E2E*%)            | 0     |

---

## 3. 執行結果

### 3.1 Skip mode（未設 RUN_AGENT_INTEGRATION_TESTS）

```
﹣ Agent integration tests skipped — set RUN_AGENT_INTEGRATION_TESTS=1 and DATABASE_URL to enable
ℹ tests 1
ℹ skipped 1
ℹ fail 0
ℹ duration_ms 167ms
```

結果：1 skip，0 fail ✓

### 3.2 RUN_AGENT_INTEGRATION_TESTS=1 真實 DB E2E

```
▶ Flow A — Full happy path
  ✔ A-1: GET /orders/tracking-jobs returns seeded tracking for store main (40ms)
  ✔ A-2: POST /shipment-events inserts a new event row (22ms)
  ✔ A-3: PATCH /shipment-status updates tracking_status in DB (10ms)
  ✔ A-4: POST /run-log inserts agent_run_logs row with correct tokenId / storeId / merchantId (10ms)
✔ Flow A — Full happy path (359ms)
▶ Flow B — Cross-store isolation
  ✔ B-1: GET /orders/tracking-jobs with store A token does NOT return store B tracking (5ms)
  ✔ B-2: POST /shipment-events with store A token and store B trackingId → 404 (6ms)
  ✔ B-3: PATCH /shipment-status with store A token and store B trackingId → 404 (5ms)
✔ Flow B — Cross-store isolation (18ms)
▶ Flow C — Idempotency
  ✔ C-1: POST /shipment-events first call → 201 idempotent=false (8ms)
  ✔ C-2: POST /shipment-events repeat same idempotencyKey → 200 idempotent=true (no duplicate row) (7ms)
✔ Flow C — Idempotency (17ms)
▶ Flow D — rawPayload sanitization
  ✔ D-1: POST /shipment-events with sensitive keys in rawPayload — DB raw_data must be scrubbed (15ms)
✔ Flow D — rawPayload sanitization (15ms)
▶ Flow E — Validation errors and auth
  ✔ E-1: Invalid bearer token → 401 agent_auth_unauthorized (5ms)
  ✔ E-2: Missing Authorization header → 401 agent_auth_missing (1ms)
  ✔ E-3: Invalid tracking status filter → 400 invalid_tracking_status (2ms)
  ✔ E-4: Invalid eventStatus → 400 invalid_event_status (3ms)
  ✔ E-5: Invalid runType → 400 invalid_run_type (2ms)
  ✔ E-6: Invalid run status → 400 invalid_run_status (3ms)
✔ Flow E — Validation errors and auth (18ms)
▶ Flow F — DB field verification
  ✔ F-1: POST /run-log — agent_run_logs.token_id equals seeded token id (9ms)
  ✔ F-2: POST /run-log — store_id isolation: log goes to store A only (17ms)
✔ Flow F — DB field verification (26ms)
▶ Flow G — Cleanup guard (structural)
  ✔ G-1: cleanupAll() is a function and will run in after() hook (0ms)
✔ Flow G — Cleanup guard (structural) (0ms)

ℹ tests 19
ℹ suites 7
ℹ pass 19
ℹ fail 0
ℹ duration_ms 1478ms
```

結果：**19 / 19 通過，0 fail** ✓

### 3.3 agent.route.test.mjs（unit mock test）

```
ℹ tests 78
ℹ suites 6
ℹ pass 78
ℹ fail 0
ℹ duration_ms 745ms
```

結果：**78 / 78 通過** ✓

### 3.4 Typecheck

既有問題（與本次任務無關）：

- `lib/db/dist/index.d.ts` 未重建（TS6305），所有使用 `@workspace/db` 的檔案均受影響
- `orders.ts`、`stores.ts`、`public.ts`、`cvs.ts` 等有既有 implicit any（TS7006）
- `cvs.ts:163` `geoMatch` possibly null（TS18047），已有 fix commit（7f4386d fix-step8x-cvs-geomatch-null-check）在 main 上

這些錯誤均為本次任務前既有，未在本次引入。

---

## 4. E2E 覆蓋流程

| Flow                        | 案例                                                                                             | 結果     |
| --------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| A — Full happy path         | A-1 GET /tracking-jobs, A-2 POST /shipment-events, A-3 PATCH /shipment-status, A-4 POST /run-log | 全通過 ✓ |
| B — Cross-store isolation   | B-1 token A 不見 store B tracking, B-2 B-3 token A 存取 store B 的 tracking → 404                | 全通過 ✓ |
| C — Idempotency             | C-1 第一次 → 201 idempotent=false，C-2 同 key 重複 → 200 idempotent=true                         | 全通過 ✓ |
| D — rawPayload sanitization | D-1 phone/address/name/email 送進 rawPayload，DB raw_data 不存這些 key                           | 通過 ✓   |
| E — Validation & auth       | E-1 invalid token → 401, E-2 missing header → 401, E-3~E-6 各種 validation error                 | 全通過 ✓ |
| F — DB field verification   | F-1 agent_run_logs.token_id = 正確 seeded token id, F-2 storeId isolation                        | 全通過 ✓ |
| G — Cleanup guard           | G-1 cleanupAll() 函數存在且 storeMain 已 seed                                                    | 通過 ✓   |

---

## 5. Cleanup 驗證

integration test 的 `after()` 鉤子執行 `cleanupAll()`，按 FK 依賴反向順序刪除。

測試後查 count：

| 表                                                         | count   |
| ---------------------------------------------------------- | ------- |
| shipment*tracking_events (raw_data contains STEP7D_E2E*)   | **0** ✓ |
| agent*run_logs (error_message/error_code like STEP7D_E2E*) | **0** ✓ |
| shipment*trackings (tracking_code like STEP7D_E2E*%)       | **0** ✓ |
| seller*agent_tokens (name/token_prefix like STEP7D_E2E*%)  | **0** ✓ |
| orders (public*token like STEP7D_E2E*%)                    | **0** ✓ |
| products (name like STEP7D*E2E*%)                          | **0** ✓ |
| stores (slug like STEP7D*E2E*%)                            | **0** ✓ |

**全部為 0，cleanup 完整。**

---

## 6. 風險與待確認

| 風險                                | 說明                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 共享 DB 測試資料                    | Integration test 寫入共享 DB，但用 STEP7D*E2E* prefix + after() cleanupAll() 控制，本次 cleanup 全部成功                         |
| Cleanup 失敗需人工處理              | 若 cleanup 失敗（DB error 或 FK 順序錯誤），需手動 DELETE WHERE slug/name/token like 'STEP7D*E2E*%'                              |
| orders 無 merchantId 欄位           | orders 表沒有 merchant_id，目前以 storeId 做租戶隔離，符合現有 API 設計                                                          |
| lib/db/dist 未重建                  | typecheck TS6305 既有問題，runtime 不受影響（tsx 直接 import TypeScript source）                                                 |
| worktree @workspace/db symlink 問題 | 若 workspace 的 qa 分支缺少 agent schema，worktree 測試必須手動修正 @workspace/db 指向。本次已處理，但未來 worktree 建立時需注意 |
| tsx 路徑依賴                        | tsx 只安裝於 scripts 套件，需使用絕對路徑 /home/runner/workspace/scripts/node_modules/tsx/dist/esm/index.mjs                     |

---

## 7. 下一步建議

| 優先序 | Step             | 說明                                                               |
| ------ | ---------------- | ------------------------------------------------------------------ |
| 1      | **Step 7E**      | Seller Agent Workspace UI 規劃，E2E 全通過可進入                   |
| 2      | **Step 7F**      | Agent 安全防護補強（rate limit / kill switch / scope enforcement） |
| 3      | lib/db dist 重建 | 解決 typecheck TS6305，但不阻擋 runtime                            |

---

## 8. 非目標

本次明確未執行：

- **本次未修改 API**（agent.ts 未動）
- **未修改 DB schema**
- **未執行 DB push**（原因：DB schema 已完成，本次只執行 Step 7D-4B-3 真實 DB integration test，不修改 DB schema）
- **未產生 migration**
- **未修改 UI**
- **未做 worker / 排程**
- **未做 Seller Agent Workspace**
