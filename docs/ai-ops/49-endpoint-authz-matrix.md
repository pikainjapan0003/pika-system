# API 端點權限矩陣

- 盤點日：2026-07-31
- 範圍：`artifacts/api-server/src/routes/*.ts`，所有路由統一掛在 `/api`；agent 路由另有 `/internal/agent` 前綴。
- 「店主」表示 `requireAuth` 後再以 `verifyStoreOwner`、等價 merchantId 比對，或由資源反查 store 後驗證。
- 「負向測試」只在測試明確覆蓋未登入 401、跨店 403/404、token/secret 拒絕時記為有；只測成功路徑不算。

## 高優先發現

1. **P1：行程與路線只有登入閘門，沒有店鋪隔離。** `trips`、`trip_routes` schema 沒有 `store_id`／`merchant_id`；任何已登入店主都能讀寫全部行程與路線。原始碼已在 `trips.ts:13-17` 明文警告。這不是少一條測試能修的問題，需要先拍板資料歸屬並做 additive migration。
2. 其餘帶店鋪或可由資源反查店鋪的後台端點，未發現明顯「只登入、不驗店主」的資料讀寫缺口。缺口主要是負向測試不足。

## 公開、內部與 agent 端點

| 方法與路徑                                                                                                      | 需求             | 實際防線                                       | 負向測試                                                      |
| --------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| GET `/healthz`                                                                                                  | 公開             | 無驗證；只回健康狀態                           | 有：安全標頭／真 app 組裝測試                                 |
| GET `/p/:shareToken`                                                                                            | 公開 bearer link | shareToken 查單一商品                          | 有：`public.route.test.mjs`                                   |
| POST `/p/:shareToken/orders`                                                                                    | 公開             | `submitOrderLimiter`＋輸入驗證                 | 有：`public.route.test.mjs`、`publicRateLimit.route.test.mjs` |
| POST `/cart/orders`                                                                                             | 公開             | `submitOrderLimiter`＋逐品項驗證               | 有：同上，含巢狀回應白名單                                    |
| GET `/orders/track/:publicToken`                                                                                | 公開 bearer link | `trackOrderLimiter`＋public allowlist          | 有：同上                                                      |
| PATCH `/orders/track/:publicToken/payment-last5`                                                                | 公開 bearer link | `trackOrderLimiter`＋狀態／格式限制            | 有：`public.route.test.mjs`                                   |
| GET `/cvs/regions`；GET `/cvs/stores`                                                                           | 公開             | 查詢參數限長／資料欄位固定                     | 有：`cvs.route.test.mjs`（以功能與輸入為主）                  |
| GET/DELETE `/dev/handoff/data[/a                                                                                | /b]`             | 只限非 production                              | production 不掛 router，handler 亦回 404                      | 有：`devHandoffProductionGuard.route.test.mjs` |
| POST `/internal/logistics/sync/scheduled`；POST `/internal/logistics/manual-snapshot-refresh`                   | 內部排程         | `CRON_SYNC_SECRET` 未設回 404；header 定時比較 | 未見專屬負向測試                                              |
| GET `/internal/agent/orders/tracking-jobs`                                                                      | agent bearer     | `agentTokenAuth`＋token store scope            | 有：`agent.route.test.mjs`、`agent.integration.test.mjs`      |
| POST `/internal/agent/shipment-events`；PATCH `/internal/agent/shipment-status`；POST `/internal/agent/run-log` | agent bearer     | `agentTokenAuth`＋資源／store scope            | 有：同上                                                      |

## 店鋪、商品、分類、行程與共用設定

| 方法與路徑                                                                                   | 需求               | 實際防線                                           | 負向測試                   |
| -------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------- | -------------------------- |
| GET `/me/store`；POST `/stores`                                                              | 登入本人           | `requireAuth`；以 `req.userId` 查詢／建立          | 未見專屬 401 測試          |
| PATCH `/stores/:storeId`；GET `/stores/:storeId/stats`                                       | 店主               | `requireAuth`＋merchantId 等價比對                 | 未見跨店負向測試           |
| GET/POST `/stores/:storeId/products`                                                         | 店主               | `requireAuth`＋`verifyStoreOwner`                  | 未見專屬負向測試           |
| GET/PATCH/DELETE `/stores/:storeId/products/:productId`                                      | 店主               | `requireAuth`＋`verifyStoreOwner`＋storeId 查詢    | 未見專屬負向測試           |
| GET/POST `/stores/:storeId/categories`                                                       | 店主               | `requireAuth`＋`verifyStoreOwner`                  | 未見專屬負向測試           |
| PATCH/DELETE `/stores/:storeId/categories/:categoryId`                                       | 店主               | `requireAuth`＋`verifyStoreOwner`＋storeId 查詢    | 未見專屬負向測試           |
| POST `/stores/:storeId/products/image`                                                       | 店主               | `requireAuth`＋`uploadLimiter`＋`verifyStoreOwner` | 未見專屬 401／跨店測試     |
| GET `/exchange-rate-reference/jpy[/compare]`                                                 | 任何登入店主       | `requireAuth`；資料為共用公開牌告，無店鋪資料      | 未見專屬 401 測試          |
| GET `/trips`；POST `/trips`                                                                  | **目前任何登入者** | 只有 `requireAuth`，無店鋪欄位                     | 無；且無法寫出合理跨店測試 |
| PATCH `/trips/:tripId`；POST `/trips/:tripId/routes`；PATCH `/trips/:tripId/routes/:routeId` | **目前任何登入者** | 只有 `requireAuth`，以全域 id 查寫                 | 無；屬上方 P1              |

## 客戶、技能、audit 與 agent 設定

| 方法與路徑                                                              | 需求    | 實際防線                                                   | 負向測試                                                                        |
| ----------------------------------------------------------------------- | ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| GET/POST `/stores/:storeId/customers`                                   | 店主    | `requireAuth`＋`verifyStoreOwner`                          | 有：`customersAndProfitIsolation.route.test.mjs`（部分）                        |
| GET/PATCH `/stores/:storeId/customers/:customerId`                      | 店主    | `requireAuth`＋`verifyStoreOwner`＋storeId/customerId 綁定 | 有：同上（部分）                                                                |
| GET `/stores/:storeId/customers/export`                                 | 店主    | `requireAuth`＋`verifyStoreOwner`；明文需 header           | 有：`customersAndProfitIsolation.route.test.mjs`                                |
| GET `/stores/:storeId/customers/:customerId/store-credit`               | 店主    | `requireAuth`＋`verifyStoreOwner`＋客戶店鋪綁定            | 有：`customerStoreCredit.route.test.mjs`                                        |
| POST `/stores/:storeId/customers/:customerId/store-credit`              | 店主    | auth→owner→store limiter→二次確認/idempotency              | 有：`customerStoreCredit.route.test.mjs`、`storeCreditLifecycle.route.test.mjs` |
| GET `/stores/:storeId/audit-logs`；POST `/stores/:storeId/audit-events` | 店主    | `requireAuth`＋`verifyStoreOwner`；action allowlist        | 部分：隔離測試有涵蓋，內容與分頁仍不足                                          |
| GET `/stores/:storeId/skills`                                           | 店主    | `requireAuth`＋`verifyStoreOwner`                          | 有：`skills.route.test.mjs`                                                     |
| POST `/stores/:storeId/skills/:skillKey/preview                         | enable` | 店主                                                       | 同上＋catalog/prerequisite/high-risk guard                                      | 有：同上 |
| POST `/stores/:storeId/skill-packages/:packageKey/preview               | apply`  | 店主                                                       | 同上＋package preview/apply guard                                               | 有：同上 |
| GET/PATCH `/stores/:storeId/agent/settings`                             | 店主    | `requireAuth`＋`verifyStoreOwner`                          | 有：`sellerAgent.route.test.mjs`、integration test                              |

## 訂單端點

| 方法與路徑                                                                                 | 需求 | 實際防線                                                | 負向測試                                                                              |
| ------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET `/stores/:storeId/orders`；POST `/stores/:storeId/orders`                              | 店主 | `requireAuth`＋`verifyStoreOwner`                       | 有：orders／profit／credit route tests（部分）                                        |
| GET `/stores/:storeId/orders/profit-summary`；GET `/stores/:storeId/orders/monthly-profit` | 店主 | `requireAuth`＋`verifyStoreOwner`＋store query          | 有：`customersAndProfitIsolation.route.test.mjs`（summary）；monthly 未見專屬跨店測試 |
| GET `/stores/:storeId/orders/maihuobian-export`                                            | 店主 | `requireAuth`＋`verifyStoreOwner`；preview DTO 無明文列 | 有：`maihuobianExport.route.test.mjs`                                                 |
| POST `/stores/:storeId/orders/maihuobian-export`                                           | 店主 | auth→owner→store limiter→二次 header＋audit             | 有：同上                                                                              |
| GET `/stores/:storeId/orders/export`                                                       | 店主 | `requireAuth`＋`verifyStoreOwner`；明文需 header        | 有：隔離／公式注入測試（部分）                                                        |
| DELETE `/stores/:storeId/orders/:orderId`                                                  | 店主 | `requireAuth`＋`verifyStoreOwner`＋FK/物流防呆          | 有：`orders.route.test.mjs`、credit lifecycle（部分）                                 |
| PATCH `/orders/:orderId`；PATCH `/orders/:orderId/status`                                  | 店主 | `requireAuth`＋order→store→`verifyStoreOwner`           | 有：orders／store-credit tests（部分）                                                |
| POST `/orders/:orderId/profit-snapshot/backfill`                                           | 店主 | `requireAuth`＋order→store→owner＋一次性 guard          | 有：`orderProfitSnapshot.route.test.mjs`                                              |
| POST `/orders/:orderId/picking-check`                                                      | 店主 | `requireAuth`＋order→store→owner                        | 有：`orderPicking.route.test.mjs`                                                     |
| POST `/orders/picking-list[.csv]`                                                          | 店主 | `requireAuth`＋所有請求 store 的 owner 驗證             | 有：`orderPicking.route.test.mjs`（部分）                                             |
| POST `/orders/shipping-list[.csv]`                                                         | 店主 | `requireAuth`＋所有請求 store 的 owner 驗證             | 未見專屬跨店負向測試                                                                  |
| PATCH `/orders/bulk`                                                                       | 店主 | `requireAuth`＋所選訂單 store owner 驗證                | `orders.route.test.mjs` 有功能案例；未見明確跨店案例                                  |
| POST `/orders/tracking-import`                                                             | 店主 | `requireAuth`＋每列 order→store owner；拒 publicToken   | `orders.route.test.mjs` 有輸入案例；跨店覆蓋不足                                      |
| PATCH `/orders/:orderId/cvs`                                                               | 店主 | `requireAuth`＋order→store→`verifyStoreOwner`           | 有：`cvs.route.test.mjs`（部分）                                                      |

## 物流端點

| 方法與路徑                                                                                                     | 需求           | 實際防線                                            | 負向測試                                      |
| -------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------- | --------------------------------------------- |
| POST `/stores/:storeId/logistics/imports/dry-run`；POST `/stores/:storeId/logistics/imports/:batchId/confirm`  | 店主           | `requireAuth`＋`verifyStoreOwner`＋batch/store 綁定 | 有：`logisticsImports.route.test.mjs`         |
| GET `/stores/:storeId/logistics/import-batches`；GET `/stores/:storeId/logistics/import-batches/:batchId/rows` | 店主           | 同上                                                | 有：同上（部分）                              |
| GET `/stores/:storeId/logistics/exceptions`                                                                    | 店主           | `requireAuth`＋`verifyStoreOwner`                   | 未見專屬負向測試                              |
| PATCH `/stores/:storeId/logistics/exceptions/:id`；POST `.../:id/retry`                                        | 店主           | `requireAuth`＋`verifyStoreOwner`＋store/id 綁定    | 未見專屬負向測試                              |
| POST `/stores/:storeId/logistics/sync`                                                                         | 店主           | `requireAuth`＋`verifyStoreOwner`＋dry-run guard    | logistics sync tests 部分涵蓋                 |
| POST `/stores/:storeId/logistics/sync/manual-provider`                                                         | 店主           | `requireAuth`＋owner；直接寫入受安全鎖阻擋          | 有：manual provider tests                     |
| POST `/stores/:storeId/logistics/sync/manual-provider/preview`                                                 | 店主           | `requireAuth`＋owner＋preview hash                  | 有：同上                                      |
| POST `/stores/:storeId/logistics/sync/manual-provider/commit`                                                  | 店主           | `requireAuth`＋owner＋server kill-switch＋hash/確認 | 有：commit kill-switch／manual provider tests |
| GET `/stores/:storeId/logistics/sync/status`                                                                   | 店主           | `requireAuth`＋`verifyStoreOwner`                   | 未見專屬跨店負向測試                          |
| POST `/cvs/711/import-from-emap`                                                                               | 登入但永久關閉 | `requireAuth` 後固定 403，不碰外部資料或 DB         | 有：`cvs.route.test.mjs`                      |

## 包25 優先補測清單

依「會動資料優先」，先補最多 10 個缺口：

1. POST `/stores` 未登入 401。
2. PATCH `/stores/:storeId` 跨店 403。
3. POST `/stores/:storeId/products` 未登入 401、跨店 403。
4. PATCH `/stores/:storeId/products/:productId` 跨店 403。
5. DELETE `/stores/:storeId/products/:productId` 跨店 403。
6. POST `/stores/:storeId/categories` 跨店 403。
7. PATCH `/stores/:storeId/categories/:categoryId` 跨店 403。
8. DELETE `/stores/:storeId/categories/:categoryId` 跨店 403。
9. POST `/stores/:storeId/products/image` 跨店 403（必須在寫檔前拒絕）。
10. PATCH `/orders/bulk` 跨店 403。

其餘待補：物流 exceptions 三路、shipping-list 兩路、tracking-import、monthly-profit、audit logs、exchange-rate 401、internal cron secret。行程 P1 不列入「補測即可」清單，需先補 schema ownership 才能定義正確測試。
