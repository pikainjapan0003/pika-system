# FamilyMart Tracking Adapter（Step 7D）

## 位置
`artifacts/api-server/src/lib/logistics/adapters/familyMartAdapter.ts`
共用型別：`adapters/types.ts`，匯出口：`adapters/index.ts`

## Endpoint
```
POST https://ecfme.fme.com.tw/FMEDCFPWebV2_II/list.aspx/GetOrderDetail
Content-Type: application/json

{ "EC_ORDER_NO": "<trackingCode>", "ORDER_NO": "<trackingCode>", "RCV_USER_NAME": null }
```
無 captcha / cookie / referer 需求。Response 為 ASP.NET 包裝 `{ "d": "<JSON string>" }`，
內層 `{ ErrorCode, ErrorMessage, List }`。`List` 實測為**最新在前**；adapter 以
`ORDER_DATE_R`（yyyy/MM/dd HH:mm）排序為舊→新，日期 parse 失敗時反轉原順序並在
`rawSummary.sortedByDate=false` 標示。

查無資料：`ErrorCode "999"` + `List: []` → `NO_RESULT`。

## API
```ts
queryFamilyMartTracking({ trackingCode, timeoutMs? }, { fetchImpl? })
  : Promise<TrackingAdapterResult<"familymart">>
```
成功：`{ ok: true, provider, trackingCode, normalizedStatus, latestStatusText, latestEventAt, events[], rawSummary }`
失敗：`{ ok: false, provider, trackingCode, errorCode, message, retryable }`

errorCode：`INVALID_TRACKING_CODE | NO_RESULT | REMOTE_ERROR | NETWORK_FAILED | TIMEOUT | PARSER_FAILED | REMOTE_CHANGED | UNKNOWN_ERROR`
retryable：TIMEOUT / NETWORK_FAILED / HTTP 5xx / 非 999 的 remote error 為 true。

## normalizedStatus mapping（保守）
| 全家文字 | normalized |
|---|---|
| 訂單成立未寄件 | pending |
| 已完成寄件（寄件人剛寄出，**非配達**）、貨件前往物流中心、配送中、轉運、運送 | in_transit |
| 貨件配達取件店舖、到店 | arrived_store |
| 取件完成、已取件、已取貨 | picked_up |
| 退回、退件、退貨 | returned |
| 異常、遺失、取消、逾期 | exception |
| 其他 | unknown |

不確定語意一律不標 delivered；目前全家店到店流程以 picked_up 為終態。

## 個資
events.rawData 只含物流節點欄位（ORDER_STATUS、STATUS_D、ORDER_DATE_R、寄/取件門市名）。
不輸出客人姓名 / 電話 / 地址，不 console.log raw response。

## Smoke test（live，手動跑）
```
node scripts/step7/test-familymart-adapter.mjs [trackingCode]
```
2026/06/10 實測 16341539811：3 events、latest「貨件前往物流中心」→ in_transit，全部 13 項 check PASS。

## 下一步
Step 7F-FAMILYMART-WORKER-INTEGRATION：worker 取 active shipment_trackings，呼叫本 adapter，
更新 tracking_status / latest_event_* / last_checked_at，寫 events 與 run log。
