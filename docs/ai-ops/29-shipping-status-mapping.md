# 出貨／物流狀態機對照

盤點日：2026-07-19  
用途：作為「賣貨便匯出資格＝未出貨」題卡的前置事實；本文件只描述現況，不拍板匯出規則。

## 1. 三組不同狀態

系統同時存在三組狀態，不能互相代用：

| 狀態機       | 欄位                                 | 全部合法值                                                                             | 事實來源                                                     |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 訂單流程     | `orders.status`                      | `pending`、`awaiting_payment`、`preparing`、`shipped`、`completed`、`cancelled`        | `lib/db/src/schema/orders.ts:19-27`、DB check `:179-182`     |
| 訂單出貨     | `orders.shipping_status`             | `not_shipped`、`preparing`、`shipped`、`arrived`、`picked_up`、`returned`、`cancelled` | `lib/db/src/schema/orders.ts:55-64`，預設值 `:108`           |
| 物流查詢任務 | `shipment_trackings.tracking_status` | `pending`、`checking`、`active`、`delivered`、`failed`、`inactive`                     | `lib/db/src/schema/shipmentTrackings.ts:17-26`，預設值 `:41` |

另有「標準化物流事件」`shipment_tracking_events.event_status`，合法值為 `unknown`、`pending`、`in_transit`、`arrived_store`、`picked_up`、`delivered`、`returned`、`exception`（`lib/db/src/schema/shipmentTrackingEvents.ts:17-28`）。它描述包裹事件，不是訂單的出貨欄位。

## 2. 訂單流程狀態

| 值                 | 現行語意       | 主要寫入點                                                            | 與「未出貨」的關係                                       |
| ------------------ | -------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `pending`          | 新單、待處理   | 公開建單預設寫入：`artifacts/api-server/src/routes/public.ts:267,452` | 不能單獨代表未出貨；其 `shipping_status` 仍須另看        |
| `awaiting_payment` | 待付款         | 店主手動切換：`artifacts/api-server/src/routes/orders.ts:1234`        | 付款狀態語意，不等於物流狀態                             |
| `preparing`        | 處理／備貨中   | 同上                                                                  | 可能尚未出貨，但欄位本身不是匯出資格的唯一事實           |
| `shipped`          | 訂單流程已出貨 | 同上                                                                  | 名稱與出貨狀態接近，但資料庫未強制同步 `shipping_status` |
| `completed`        | 訂單完成       | 同上                                                                  | 不保證物流欄位為何值                                     |
| `cancelled`        | 訂單取消       | 同上                                                                  | 是否排除匯出屬產品規則，尚未拍板                         |

訂單流程允許店主切到任一不同的合法狀態，包含從 `completed`／`cancelled` 恢復；實作見 `artifacts/api-server/src/lib/orderStatusMachine.ts:3-22`。

## 3. 訂單出貨狀態

| 值            | 現行語意     | 主要寫入點                                                   | 「未出貨」口徑事實                                 |
| ------------- | ------------ | ------------------------------------------------------------ | -------------------------------------------------- |
| `not_shipped` | 尚未出貨     | 新單預設；批次更新 `orders.ts:632`；單筆編輯 `orders.ts:868` | 這是目前唯一名稱與資料模型都直接表達「未出貨」的值 |
| `preparing`   | 備貨中       | 同上                                                         | 已離開 `not_shipped`，但是否仍可匯出需老闆決定     |
| `shipped`     | 已交寄／出貨 | 同上                                                         | 非未出貨                                           |
| `arrived`     | 已到店／到站 | 同上                                                         | 非未出貨                                           |
| `picked_up`   | 已取件       | 同上                                                         | 非未出貨                                           |
| `returned`    | 退回         | 同上                                                         | 是否可再次匯出需另定規則                           |
| `cancelled`   | 物流取消     | 同上                                                         | 是否可再次匯出需另定規則                           |

既有匯入流程明文只更新追蹤碼與供應商，**不改** `shipping_status`（`artifacts/api-server/src/routes/orders.ts:767`）。因此外部物流匯入不能被當成出貨狀態已同步的證據。

## 4. 物流查詢任務與事件

| 值          | 現行語意           | 寫入點例                                                                       | 與「未出貨」的關係                                    |
| ----------- | ------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `pending`   | 等待首次查詢       | 匯入建立 `logisticsImports.ts:268`；追蹤種子 `trackingSeed.ts:92`              | 只表示查詢任務待跑                                    |
| `checking`  | worker 查詢中      | worker／agent 寫入鏈                                                           | 暫態，不代表訂單已出貨                                |
| `active`    | 可持續查詢         | agent／worker 寫入鏈                                                           | 不代表訂單出貨欄位                                    |
| `delivered` | 物流供應商回報完成 | `familyMartTrackingWorker.ts:189`、`multiProviderControlledWriteWorker.ts:271` | 可作交叉檢查，但不會自動等同 `orders.shipping_status` |
| `failed`    | 查詢失敗且不再重試 | `familyMartTrackingWorker.ts:245`、`multiProviderControlledWriteWorker.ts:349` | 技術狀態，不是貨物狀態                                |
| `inactive`  | 舊追蹤碼停用       | `orders.ts:792`、`trackingSeed.ts:84`                                          | 技術狀態，不是貨物狀態                                |

標準化事件由 agent／worker 寫入 `latest_event_status` 與事件表；例如 `artifacts/api-server/src/routes/agent.ts:328-413`、`artifacts/api-server/src/lib/logistics/workers/familyMartTrackingWorker.ts:189-190`。事件與訂單出貨欄沒有資料庫層強制同步。

## 5. 給賣貨便規格的前置結論

- 事實：目前最直接的「未出貨」欄位是 `orders.shipping_status = 'not_shipped'`。
- 事實：`orders.status`、`orders.shipping_status`、`shipment_trackings.tracking_status` 是獨立狀態機。
- 不確定／待拍板：賣貨便匯出是否還須排除 `orders.status = 'cancelled'`、是否允許 `shipping_status = 'preparing'`、匯出後何時把出貨狀態往前推。
- 禁止推論：不能只因訂單流程是 `pending` 或物流任務是 `pending`，就把訂單認定為可匯出的「未出貨單」。
