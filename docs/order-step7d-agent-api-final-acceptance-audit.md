# Step 7D Agent API 整體驗收盤點

日期：2026-06-08
執行者：Claude B

---

## 1. 驗收基準

| 項目                | 值                                      |
| ------------------- | --------------------------------------- |
| main commit         | `d2abac2 feat-api-step7d-agent-run-log` |
| gitsafe-backup/main | `d2abac2`（與 main 一致）               |
| 測試執行時間        | 2026-06-08                              |
| 測試結果            | **78 / 78 通過，0 失敗**                |

---

## 2. 已完成 API Endpoint

| Endpoint                                       | 狀態     | 功能                                                   | 安全邊界                                                      | 測試狀態           |
| ---------------------------------------------- | -------- | ------------------------------------------------------ | ------------------------------------------------------------- | ------------------ |
| `GET /api/internal/agent/orders/tracking-jobs` | ✓ 已完成 | Agent 查待追蹤任務清單（分頁、狀態過濾、dueOnly 過濾） | storeId 隔離、不回買家個資                                    | ✓ 已測（15 tests） |
| `POST /api/internal/agent/shipment-events`     | ✓ 已完成 | 寫入物流 timeline event                                | idempotencyKey 防重、rawPayload 敏感欄位清洗、ownership check | ✓ 已測（16 tests） |
| `PATCH /api/internal/agent/shipment-status`    | ✓ 已完成 | 更新 shipment_trackings latest status snapshot         | 不改 orders.shippingStatus、ownership check                   | ✓ 已測（16 tests） |
| `POST /api/internal/agent/run-log`             | ✓ 已完成 | 寫入 agent 執行紀錄至 agent_run_logs                   | tokenId/merchantId/storeId 取自 token 不信任 body             | ✓ 已測（16 tests） |

**無 501 殘留。** `NOT_IMPLEMENTED` 常數定義仍存在於 agent.ts（第 9–12 行）但未被任何 route handler 引用。

---

## 3. Router 掛載確認

| 項目                            | 狀態                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| agentRouter 掛載路徑            | `/api/internal/agent`（`artifacts/api-server/src/routes/index.ts:23`） |
| agentTokenAuth middleware       | ✓ 存在（`artifacts/api-server/src/middlewares/agentAuth.ts`）          |
| Bearer token 驗證               | ✓ 雜湊比對、status/revokedAt/expiresAt 全部過濾                        |
| fire-and-forget lastUsedAt 更新 | ✓ 已實作                                                               |

---

## 4. DB 物件驗收

| 物件                                       | 類型   | 狀態                   |
| ------------------------------------------ | ------ | ---------------------- |
| `public.shipment_trackings`                | 資料表 | ✓ 存在                 |
| `public.shipment_tracking_events`          | 資料表 | ✓ 存在                 |
| `public.seller_agent_tokens`               | 資料表 | ✓ 存在                 |
| `public.agent_run_logs`                    | 資料表 | ✓ 存在                 |
| `shipment_tracking_events.idempotency_key` | 欄位   | ✓ 存在                 |
| `orders.discount_amount`                   | 欄位   | ✓ 存在（Step 8J 已加） |
| `orders.discount_note`                     | 欄位   | ✓ 存在（Step 8J 已加） |

---

## 5. 測試結果

### agent.route.test.mjs

執行指令：

```
node --experimental-test-module-mocks --import tsx/esm \
  --test src/routes/agent.route.test.mjs
```

結果：**78 / 78 通過，0 失敗**

| 測試套件                  | tests | 結果     |
| ------------------------- | ----- | -------- |
| Agent auth middleware     | 9     | ✓ 全通過 |
| Agent route skeleton      | 6     | ✓ 全通過 |
| GET /orders/tracking-jobs | 15    | ✓ 全通過 |
| POST /shipment-events     | 16    | ✓ 全通過 |
| PATCH /shipment-status    | 16    | ✓ 全通過 |
| POST /run-log             | 16    | ✓ 全通過 |

### TypeScript typecheck

```
tsc -p artifacts/api-server/tsconfig.json --noEmit
```

結果：**5 個錯誤（既有環境問題，非 API 程式碼錯誤）**

| 檔案             | 錯誤                                       | 原因                 |
| ---------------- | ------------------------------------------ | -------------------- |
| `agentAuth.ts:3` | `sellerAgentTokensTable` not exported      | lib/db/dist 未重建   |
| `agent.ts:3`     | `shipmentTrackingsTable` not exported      | lib/db/dist 未重建   |
| `agent.ts:3`     | `shipmentTrackingEventsTable` not exported | lib/db/dist 未重建   |
| `agent.ts:3`     | `agentRunLogsTable` not exported           | lib/db/dist 未重建   |
| `cvs.ts:163`     | `geoMatch` possibly null                   | 既有問題，非本次引入 |

**說明**：`lib/db/src/` 已有正確 schema 定義並匯出（`schema/index.ts` 有 `export * from "./agentRunLogs.ts"` 等），但 `lib/db/dist/` 為預建置產物尚未重建，導致 typecheck 時 `@workspace/db` 解析到舊的 dist。Runtime 不受影響（`package.json exports` 指向 `src/`）。修復方式：在 CI/build 流程加入 `pnpm --filter @workspace/db build`。

---

## 6. 安全邊界驗收

| 項目                             | 狀態 | 說明                                                                         |
| -------------------------------- | ---- | ---------------------------------------------------------------------------- |
| Agent token 驗證                 | ✓    | Bearer token → SHA-256 雜湊比對，status/revoked/expired 三重過濾             |
| storeId 租戶隔離                 | ✓    | 所有讀寫均以 token 的 storeId 限制，不可跨店                                 |
| 不信任 body 身份欄位             | ✓    | tokenId/merchantId/storeId 固定取自 agentToken，body 值被忽略                |
| rawPayload 敏感欄位清洗          | ✓    | `sanitizePayload()` 遞迴移除 phone/tel/address/name/email/token 等 key       |
| response 不回 rawData/rawPayload | ✓    | 所有 route handler 不在 response 中包含 rawData/rawPayload/raw_data          |
| idempotencyKey 防重              | ✓    | pre-check + 23505 race condition 均處理                                      |
| 不修改 orders.shippingStatus     | ✓    | PATCH /shipment-status 只寫 shipment_trackings，不碰 orders                  |
| 不修改買家公開資料               | ✓    | GET /tracking-jobs 不回 buyerPhone/buyerName/recipientPhone/recipientAddress |
| 不輸出 token/hash/secrets        | ✓    | 錯誤 log 只用 tokenHashPrefix（前 8 碼）                                     |
| seller_agent_tokens lastUsedAt   | ✓    | fire-and-forget 更新，不影響主流程                                           |

---

## 7. 尚未完成 / 待確認

| 項目                                | 說明                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| 真實 DB end-to-end integration test | 目前 78 個測試均為 unit mock 測試，尚未有針對真實 DB 的 E2E seed 測試                      |
| Seller Agent Workspace UI           | Step 7E，尚未開始                                                                          |
| Worker / 排程                       | Step 7F/7G，自動化物流查詢排程尚未實作                                                     |
| Rate limit / kill switch            | 高頻呼叫防護尚未加入                                                                       |
| Audit log 進階防護                  | agent_run_logs 目前僅做基本寫入，無異常告警                                                |
| orders 表無 merchantId 欄位         | 目前只以 storeId 做租戶隔離；若 merchant 跨多 store 需額外驗證                             |
| lib/db/dist 重建                    | 需於 CI/build 流程加入 `pnpm --filter @workspace/db build`                                 |
| agent_run_logs tokenId nullable     | tokenId FK 設為 `onDelete: "set null"`，token 刪除後歷史紀錄仍保留，但 tokenId 欄位為 null |

---

## 8. 下一步建議

| 優先序 | Step           | 說明                                                                                                           |
| ------ | -------------- | -------------------------------------------------------------------------------------------------------------- |
| 1      | **Step 7D-4B** | 真實 DB integration test：最小 E2E seed（建立 store/token/order/tracking），驗證 4 支 API 在真實 DB 的完整行為 |
| 2      | **Step 7E**    | Seller Agent Workspace UI（管理 token、查看 run logs、查看 tracking timeline）                                 |
| 3      | **Step 7F**    | Agent 安全防護強化（rate limit、kill switch、scopes 驗證）                                                     |
| 4      | **Step 7G**    | 物流來源串接（物流商 API 呼叫、自動化 worker）                                                                 |
| 5      | **Step 7H**    | 買家安全 timeline UI（public-facing 物流狀態頁）                                                               |

---

## 9. 非目標（本文件明確排除）

- **不新增功能**
- **不修改 API 程式碼**（`agent.ts`、`agent.route.test.mjs` 均未更動）
- **不修改 DB schema**
- **不執行 DB push / drizzle-kit push**
- **不做 Seller Agent Workspace**
- **不做 worker / 排程**
- **不處理主工作區 dirty files**

---

## 10. Git 歷程（Step 7D 完整 commit 序列）

```
d2abac2 feat-api-step7d-agent-run-log
c6abd79 feat-api-step7d-agent-shipment-status
345f83d feat-api-step7d-agent-shipment-events
c98944f feat-api-step7d-agent-tracking-jobs
5c7d8a4 feat-api-step7d-agent-auth-route-skeleton
c76f675 fix-db-main-orders-discount-schema-drift
de1dcc3 docs-order-step7d-agent-api-route-implementation-audit
d441fd9 feat-db-step7d-agent-token-run-log-schema
```
