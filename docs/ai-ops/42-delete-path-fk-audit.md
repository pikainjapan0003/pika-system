# DELETE 路徑與外鍵阻擋審計

審計日：2026-07-31  
範圍：`lib/db/src/schema/*` 外鍵與 production DB 刪除流程。  
方法：唯讀掃描；本報告不修改 schema、migration 或產品邏輯。

## 結論

- 共掃到 30 個 FK；阻擋型只有 4 個：`orders.product_id -> products.id` 使用 PostgreSQL 預設 `NO ACTION`，以及 `store_credit_transactions` 的 store、customer、related order 三個 `RESTRICT`。
- production DB 硬刪流程只有分類、商品、訂單，以及取消包貨勾選時刪除明細；`customers`、`stores`、`trips`、`trip_routes` 目前沒有 DELETE route。
- 未發現常態路徑會無保護地撞 FK：商品 route 會把 23503 轉為 409；訂單 route 已在 BATCH-18 package 0 預查購物金流水。
- 訂單預查與最後 DELETE 間仍有理論競態；另外購物金阻擋目前沿用物流／完成訂單文案，建議後續修正。

## 阻擋型 FK 完整表

| 父資料／刪除目標 | 子 FK 證據                                                                                       | `onDelete`          | 現有 DELETE                                           | 現況與建議                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| products         | `lib/db/src/schema/orders.ts:77-79`                                                              | 未指定＝`NO ACTION` | `artifacts/api-server/src/routes/products.ts:283-313` | 有歷史訂單時 DB 23503；route 轉 409「此商品有歷史訂單…請改下架」（`:305-310`）。安全阻擋。UI `Products.tsx:129-132` 沒有 catch／toast，建議補錯誤提示與下架引導。 |
| stores           | `lib/db/src/schema/storeCreditTransactions.ts:41-43`；`0021_store_credit_transactions.sql:25-28` | `RESTRICT`          | 無                                                    | 目前沒有刪店入口。建議維持無硬刪；未來關店採封存／停用＋匯出，不可 cascade 掉購物金帳本。                                                                         |
| customers        | `storeCreditTransactions.ts:44-46`；`0021...sql:30-33`                                           | `RESTRICT`          | 無                                                    | 目前沒有刪客入口。`orders.customer_id` 雖為 `SET NULL`，購物金帳本仍會阻擋；建議採封存／匿名化。                                                                  |
| orders           | `storeCreditTransactions.ts:50-52`；`0021...sql:35-38`                                           | `RESTRICT`          | `orders.ts:1656-1708`                                 | package 0 已於 `:1692-1699` 預查購物金流水並回 409。建議換成購物金專屬文案；最後 DELETE `:1701-1705` 仍應 catch 23503，或用 transaction／advisory lock 關閉競態。 |

## 現行刪除 flow

| 刪除 flow        | 程式證據                                                                | 相關 FK                                                  | 目前 UX／錯誤                                                               | 裁決                                                              |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 商品硬刪         | API `products.ts:283-313`；UI `Products.tsx:129-132,436-445`            | `orders.product_id` NO ACTION                            | 先 confirm；API 有歷史訂單回 409，但頁面本身未顯示錯誤                      | DB 安全阻擋；補 UI toast／下架連結。                              |
| 分類硬刪         | API `categories.ts:110-133`；UI `ProductCategories.tsx:103-117,261-277` | `products.category_id` SET NULL                          | confirm 明說商品會變未分類，錯誤會 alert                                    | 已安全，無需修改。                                                |
| 訂單硬刪         | API `orders.ts:1656-1708`；UI `Orders.tsx:502-520,2145-2202,2429-2461`  | 購物金 RESTRICT；物流與包貨 CASCADE；匯入／例外 SET NULL | shipped、completed、tracking 或 credit 都回 409；前端有二段確認及 API error | DB 安全；補 credit 專屬文案、前端預先 disable、23503 race catch。 |
| 取消包貨勾選     | `orders.ts:816-834`                                                     | `order_picking_checks` 是 leaf                           | 取消即刪該 item row                                                         | 安全，無 incoming FK。                                            |
| dev-handoff 清空 | `devHandoff.ts:107-120`                                                 | 非 DB                                                    | production 固定 404                                                         | FK 範圍外。                                                       |

## 訂單刪除的非阻擋 FK

- `shipment_trackings.order_id` CASCADE：`lib/db/src/schema/shipmentTrackings.ts:32-34`；events 再 CASCADE：`shipmentTrackingEvents.ts:34-36`。
- `order_picking_checks.order_id` CASCADE：`orderPickingChecks.ts:27-29`。
- `logistics_import_rows.matched_order_id` SET NULL：`logisticsImportRows.ts:48-51`。
- `shipment_tracking_exceptions.order_id` SET NULL：`shipmentTrackingExceptions.ts:67-69`；tracking FK 亦 SET NULL（`:70-72`）。

因此，沒有購物金流水且未被業務 guard 阻擋的訂單可以安全硬刪，不會留下 dangling FK。

## 尚無 DELETE route 的關聯

- `trips`／`trip_routes`：`trips.ts:19-197` 只有 GET、POST、PATCH。若未來刪 trip，routes 會 CASCADE；route 被刪時 products 會 SET NULL。資料庫語意可行，但新增 route 前仍需處理 ownership，現行 route file 已註明全域共用。
- `customers`：orders 會 SET NULL，但購物金 RESTRICT；不可把「orders 可斷開」誤判為「customer 可硬刪」。
- `stores`：多數 child 會 CASCADE，但購物金 store FK RESTRICT 會阻止刪店；目前沒有刪店 route 是正確的 fail-closed。

## 建議優先序

1. 訂單 DELETE catch PostgreSQL 23503，回同一個 409，關閉預查競態造成 500 的理論路徑。
2. 購物金阻擋改用專屬文案，UI 同步提前辨識。
3. 商品刪除 409 在 UI 顯示明確訊息並引導下架。
4. customer／store 永遠先設計封存與個資匿名化，再考慮任何 DELETE API。

## 掃描證據

- `rg -n 'references\(' lib/db/src/schema --glob '*.ts'`：30 個 references call。
- `rg -n 'onDelete'`：只有 store-credit 三個 restrict；唯一未指定 `onDelete` 是 `orders.ts:79`。
- 排除 tests、generated、dist 後，`.delete(` 只命中 `categories.ts:122`、`products.ts:296`、`orders.ts:827/1702` 與非 DB 的 `devHandoff.ts:107`。
