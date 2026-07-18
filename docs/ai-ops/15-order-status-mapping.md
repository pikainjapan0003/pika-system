# T-07 訂單狀態對照盤點

- 盤點日期：2026-07-18
- 範圍：`orders.status` 的六種資料庫狀態，以及老闆端、客人端、CSV 與列印收據所使用的繁中文案
- 排除：付款狀態、出貨狀態、物流追蹤事件；它們是不同狀態機，不與 `orders.status` 混算

## 權威狀態集合

資料庫與型別的權威集合是六態：`pending`、`awaiting_payment`、`preparing`、`shipped`、`completed`、`cancelled`。

- 型別來源：`lib/db/src/schema/orders.ts:9`
- 資料庫 check 約束：`lib/db/src/schema/orders.ts:92`

## 六態對照表

| 值                 | 老闆端文案 | 客人端文案 | 結果               | 證據                                                                                                                                                                               |
| ------------------ | ---------- | ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`          | 待確認     | 待確認     | 一致               | 老闆端 `artifacts/shop-app/src/lib/orderStatus.ts:2`；客人建立單 `artifacts/api-server/src/lib/publicOrderResponse.ts:23`；客人查單 `artifacts/api-server/src/routes/public.ts:47` |
| `awaiting_payment` | 待付款     | 待付款     | 一致；列印收據例外 | 老闆端 `artifacts/shop-app/src/lib/orderStatus.ts:3`；客人建立單 `artifacts/api-server/src/lib/publicOrderResponse.ts:24`；客人查單 `artifacts/api-server/src/routes/public.ts:48` |
| `preparing`        | 備貨中     | 備貨中     | 一致               | 老闆端 `artifacts/shop-app/src/lib/orderStatus.ts:4`；客人建立單 `artifacts/api-server/src/lib/publicOrderResponse.ts:25`；客人查單 `artifacts/api-server/src/routes/public.ts:49` |
| `shipped`          | 已出貨     | 已出貨     | 一致               | 老闆端 `artifacts/shop-app/src/lib/orderStatus.ts:5`；客人建立單 `artifacts/api-server/src/lib/publicOrderResponse.ts:26`；客人查單 `artifacts/api-server/src/routes/public.ts:50` |
| `completed`        | 已完成     | 已完成     | 一致               | 老闆端 `artifacts/shop-app/src/lib/orderStatus.ts:6`；客人建立單 `artifacts/api-server/src/lib/publicOrderResponse.ts:27`；客人查單 `artifacts/api-server/src/routes/public.ts:51` |
| `cancelled`        | 已取消     | 已取消     | 一致               | 老闆端 `artifacts/shop-app/src/lib/orderStatus.ts:7`；客人建立單 `artifacts/api-server/src/lib/publicOrderResponse.ts:28`；客人查單 `artifacts/api-server/src/routes/public.ts:52` |

## 使用面盤點

| 使用面                               | 字典或來源                                                       | 結果                                               |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------- |
| 老闆首頁與最近訂單                   | 共用 `STATUS_LABELS`；`Dashboard.tsx:5,192,324`                  | 六態一致，未知值才顯示原值                         |
| 老闆訂單列表、篩選、詳情與改狀態確認 | 共用 `STATUS_LABELS`；`Orders.tsx:8,750,839,1363,1474,1493,1707` | 六態一致，未發明新狀態                             |
| 客人追蹤頁進度列                     | 共用 `STATUS_LABELS` 與 `STATUS_STEPS`；`TrackOrder.tsx:4,284`   | 六態文案一致；取消態不進一般流程列，符合終止態語意 |
| 客人建立訂單 201 回應                | `publicOrderResponse.ts:22-29,67`                                | 六態一致                                           |
| 客人公開查單回應                     | `public.ts:46-53,545`                                            | 六態一致                                           |
| 老闆訂單 CSV                         | `orderExport.ts:29-36,118`                                       | 六態一致                                           |
| 列印收據                             | `printHelpers.ts:332-340,582`                                    | 有落差，見下節                                     |

## 無對應／不一致／發明新狀態

### 1. 列印收據漏掉 `awaiting_payment`

`ORDER_STATUS_RECEIPT_LABELS` 沒有 `awaiting_payment`，所以待付款訂單列印時會回退顯示原始英文 `awaiting_payment`，而不是「待付款」。位置：`artifacts/shop-app/src/lib/printHelpers.ts:332-340,582`。

建議修法（本盤點不施工）：列印收據改用共用 `orderStatus.ts` 字典，或至少補上 `awaiting_payment: "待付款"` 並加六態完整性測試。

### 2. 列印收據字典殘留兩個資料庫不存在的值

`confirmed`（已確認）與 `arrived`（已到貨）出現在 `printHelpers.ts:334,337`，但不在資料庫六態與 check 約束中。現有正常資料不會產生這兩值，因此目前屬死分支／舊制殘留，而不是第七、八種合法狀態。

建議修法（本盤點不施工）：確認無歷史資料依賴後移除，並讓字典型別以 `OrderStatus` 約束，避免再發明資料庫不存在的狀態。

## 結論

一般老闆端、客人端與 CSV 的六態文案完全一致。唯一缺口集中在列印收據的獨立字典：漏掉一個合法狀態，並保留兩個不合法舊狀態；不影響資料庫狀態本身，但會讓待付款收據顯示英文原值。

## BATCH-12 修復結果（2026-07-19）

commit `84263dc` 已關閉上述兩項缺口：列印收據改用與老闆端相同的六態共用字典，`awaiting_payment` 現在顯示「待付款」，`confirmed` 與 `arrived` 舊制分支已移除。完整性測試逐一鎖住六個合法資料庫狀態，因此日後漏字典或新增非資料庫狀態都會失敗。
