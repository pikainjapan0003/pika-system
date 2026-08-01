# BATCH-20 包26：資料庫約束總覽

盤點日期：2026-08-01  
範圍：`lib/db/src/schema/` 的 Drizzle schema；本包唯讀，不修改 schema、migration 或路由。下表以 schema 宣告為準，正式資料庫是否已套用各 migration 不在本包驗證。

## 重要資料表與約束

| 表                          | 主要 FK／刪除語意                                         | 唯一／索引                                                                                      | 主要 CHECK／形狀約束                                                                                                     |
| --------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `stores`                    | 根表；無上游 FK                                           | `slug` unique；`merchant_id` index                                                              | `purchase_exchange_rate` 為 NULL 或 ≥0；四種物流開關有 default true                                                      |
| `customers`                 | `store_id → stores` cascade                               | `(store_id, code)` unique；`store_id` index                                                     | tier 僅 `general/vip/wholesale/partner`                                                                                  |
| `products`                  | `store_id → stores` cascade；category/trip route set null | `share_token` unique；store／trip_route indexes                                                 | inventory、三層價格、cost_jpy 非負；storage temp enum                                                                    |
| `orders`                    | product／store FK；customer `SET NULL`                    | `public_token` unique；store／customer／product indexes                                         | 六種 order status；末五碼長度 5；credit 非負；單品快照與 cart 快照狀態／欄位配對；免攤交通為 0                           |
| `trips`                     | 目前無 `store_id`                                         | 僅 serial PK                                                                                    | exchange rate 可 NULL（待確認）                                                                                          |
| `trip_routes`               | `trip_id → trips` cascade                                 | `(trip_id, area_title)` unique；trip index                                                      | est_qty >0、parcel_count ≥0、日圓欄非負；覆寫旗標必有值且覆寫值非負                                                      |
| `audit_logs`                | `store_id → stores` cascade                               | `(store_id, at)` index                                                                          | actor/action/target 長度分別 1–200／1–100／1–200                                                                         |
| `store_skill_states`        | `store_id → stores` cascade                               | `(store_id, skill_key)` composite PK；store/enabled index                                       | source enum；catalog_version >0；enabled 時必有 enabled_at/enabled_by                                                    |
| `store_credit_transactions` | store/customer/order FK，皆 restrict                      | store/customer/time、customer、related order indexes；spend/reversal/idempotency partial unique | direction/type enum；amount >0；方向與交易類型相容；reason/idempotency 長度限制；migration trigger 使 ledger append-only |
| `order_picking_checks`      | `order_id → orders` cascade                               | `(order_id, item_key)` unique；order index                                                      | item_key 1–500；checked_by 1–200                                                                                         |
| `logistics_import_batches`  | `store_id → stores` cascade                               | store/provider/status/created indexes                                                           | provider 僅 711/familymart；status 僅 dry_run/confirmed/cancelled/failed                                                 |
| `logistics_import_rows`     | batch cascade；matched order set null                     | batch/order/tracking/status indexes                                                             | match status 僅正式列舉值                                                                                                |

## 其他重要 FK 群組

`shipment_trackings`、`shipment_tracking_events`、`shipment_tracking_exceptions`、`shipment_tracking_run_logs` 均以 FK、provider/status enum 與 store/order/tracking 索引維持物流資料的店鋪隔離與刪除鏈；`seller_agent_tokens`、`seller_agent_settings`、`agent_run_logs` 對 stores 採 cascade，token hash 與店鋪設定另有 unique 約束。`product_categories` 對 `(store_id, name)` unique，避免同店分類重複。

## 金額欄位檢查

- 訂單售價／運費／總額為 `numeric(10,2)`；信用額度與快照終點欄位為 `numeric(30,12)`，並有非負或狀態形狀約束。
- 商品一般／VIP／批發／夥伴價格與 cost_jpy 有 nullable non-negative CHECK；店鋪進貨匯率與行程 ETC 也允許 NULL 表示待確認，非默認 0。
- `trip_routes` 的計算覆寫欄位沒有繞過純函式：schema 只做「旗標配對」與非負形狀檢查，公式仍由 lib 純函式處理。

## 已知治理缺口（不在本包修正）

1. `trips`／`trip_routes` 沒有 `store_id`，而現行路由缺少店主歸屬驗證；這是 BATCH-19 稽核揭露的 P1，需先由老闆決定資料歸屬，再另開 schema＋授權包。本報告不以「補 CHECK」冒充解決。
2. FK 與 CHECK 只保護資料形狀，不取代 route 層的 `requireAuth`、`verifyStoreOwner`、跨店條件與公開 API allowlist。
3. PostgreSQL 實際部署狀態應由正式 migration／部署流程另行核對；本報告沒有連 production DB。

## 證據索引

主要來源：`lib/db/src/schema/orders.ts:76-251`、`products.ts:19-97`、`tripRoutes.ts:21-106`、`trips.ts:6-25`、`customers.ts:27-56`、`stores.ts:18-51`、`auditLogs.ts:17-42`、`storeCreditTransactions.ts:40-107`、`orderPickingChecks.ts:26-57`、`storeSkillStates.ts:20-48`、`logisticsImportBatches.ts:33-73`、`logisticsImportRows.ts:36-77`。盤點命令：`rg -n "check\\(|uniqueIndex|unique\\(|foreignKey|references\\(|primaryKey|index\\(" lib/db/src/schema --glob '*.ts'`。
