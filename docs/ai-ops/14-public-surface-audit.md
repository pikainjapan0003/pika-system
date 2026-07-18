# T-02 公開面隱私與成本洩漏審計

- 審計日：2026-07-18（Asia/Taipei）
- 範圍：`artifacts/api-server/src/routes/public.ts` 的全部五個公開端點，以及它們直接使用的公開 DTO／品項淨化函式。
- 方法：唯讀逐欄審查；未連線資料庫、未呼叫正式站、未修改任何程式。

## 分級

- **P0**：完整個資、內部備註、成本、匯率、交通成本、毛利等絕不可公開資料。
- **P1**：可取得訂單／物流資料的 bearer token、完整追蹤碼，或可導致 P0 外流的高風險設計。
- **P2**：內部 ID、精確庫存／時間、付款末五碼、遮罩後個資及營運狀態。
- **P3**：功能本來就必須提供給客人的商品、售價、訂單與物流顯示資料。

分級描述的是欄位敏感度；某欄標成 P1/P2，不代表目前已發生未授權洩漏。

## 結論與 findings

### P0／P1 程式缺陷：無

- 五個公開端點均未回傳商品日圓成本、店鋪匯率、交通成本、毛利、`profit_snapshot_*`、`cart_profit_snapshot_*` 或購物車品項內的 `profitSnapshot`。
- 單品建單回應由固定 16 鍵 DTO 建立（`publicOrderResponse.ts:3-20,48-76`），不再展開資料庫整列。
- 購物車建立與追蹤的 `items` 都經 `sanitizePublicCartItems()` 重建七鍵新物件（`public.ts:472-479,533-564`；`publicCartItems.ts:1-19,35-66,69-82`）。未列入的現在與未來欄位結構上都不會通過。
- 追蹤回應只回遮罩姓名／電話／地址摘要；完整 buyer／recipient 個資、內部備註、付款內部欄及物流原始資料均未列入回應（`public.ts:533-570`）。

### P2-1：bearer URL 外流會連帶暴露追蹤資料

`publicToken` 本身具 128-bit 熵，無法實務暴力枚舉；但它就是追蹤頁的存取能力。若網址進入瀏覽器同步、截圖、第三方 referrer 或 access log，持有人可讀 P1/P2 的追蹤碼、付款末五碼與遮罩收件資料。建議部署層確認 `Referrer-Policy: no-referrer`、第三方 script 範圍、access log 遮罩與 token 撤銷策略。本包只報告，不改碼。

### P2-2：精確庫存與門市資料屬必要但可再縮減的營運資訊

商品頁回精確 `inventory`；單品建單成功回應回門市店號、地址與電話。這些不是成本或完整客戶個資，但比「是否有貨」或「門市名稱」揭露更多。現有 UI 需要這些欄位，是否縮減屬產品決策。

## 端點 1：`GET /p/:shareToken`

來源：`public.ts:114-153`。

| 回應欄位                    | 分級 | 判定                                         |
| --------------------------- | ---- | -------------------------------------------- |
| `id`                        | P2   | 內部商品連號；沒有以此 ID 查商品的公開端點   |
| `name`                      | P3   | 公開商品名稱                                 |
| `description`               | P3   | 公開商品說明                                 |
| `price`                     | P3   | 對客售價，不是成本                           |
| `specs`                     | P3   | 下單規格                                     |
| `inventory`                 | P2   | 精確庫存屬營運資訊                           |
| `imageUrl`                  | P3   | 公開商品圖片                                 |
| `storeName`                 | P3   | 公開店名                                     |
| `shareToken`                | P3   | 請求網址已含同一公開分享 token               |
| `orderDeadlineAt`           | P3   | 公開收單截止時間                             |
| `storageTemp`               | P3   | 公開保存溫層                                 |
| `shelfLife`                 | P3   | 公開效期說明                                 |
| `weightKg`                  | P3   | 公開商品重量                                 |
| `brandPrimaryColor`         | P3   | 公開品牌色                                   |
| `shippingCvsEnabled`        | P3   | 可選物流方式                                 |
| `shippingBlackCatEnabled`   | P3   | 可選物流方式                                 |
| `shippingPostOfficeEnabled` | P3   | 可選物流方式                                 |
| `shippingSelfPickupEnabled` | P3   | 可選物流方式                                 |
| `error`（404）              | P3   | 固定 `Product not found`，停用與不存在不分流 |

**明確未回：**`costJpy`、`isTransportCostExempt`、`tripRouteId`、店鋪進貨匯率、四層內部分級價以外的任何成本／毛利欄、商品內部備註與店主資料。

## 端點 2：`POST /p/:shareToken/orders`

來源：`public.ts:155-301`；DTO：`publicOrderResponse.ts:3-20,48-76`。

| 回應欄位           | 分級 | 判定                                         |
| ------------------ | ---- | -------------------------------------------- |
| `publicToken`      | P1   | 後續追蹤的 bearer capability；建單者必須取得 |
| `productName`      | P3   | 成交商品名稱                                 |
| `quantity`         | P3   | 成交數量                                     |
| `unitPrice`        | P3   | 成交單價，不是成本                           |
| `shippingFee`      | P3   | 對客運費                                     |
| `totalPrice`       | P3   | 商品小計                                     |
| `orderTotal`       | P3   | 小計加運費                                   |
| `pickupMethod`     | P3   | 取貨方式                                     |
| `specValues`       | P3   | 成交規格                                     |
| `status`           | P3   | 訂單狀態碼                                   |
| `statusLabel`      | P3   | 訂單狀態中文                                 |
| `cvsStoreId`       | P2   | 客人剛選的門市代碼                           |
| `cvsStoreName`     | P2   | 客人剛選的門市名                             |
| `cvsStoreAddress`  | P2   | 公開門市地址，也能推知取貨地區               |
| `cvsStorePhone`    | P2   | 公開門市電話                                 |
| `createdAt`        | P2   | 精確建單時間                                 |
| `error`／`message` | P3   | 固定驗證、庫存與截止訊息；無 row 或 stack    |

**明確未回：**完整買家／收件姓名、電話、地址、客人備註、店家內部備註、付款內部欄、物流內部欄、所有單件成本快照欄。

## 端點 3：`POST /cart/orders`

來源：`public.ts:306-489`；巢狀品項白名單：`publicCartItems.ts:1-19,35-82`。

| 回應欄位                  | 分級 | 判定                          |
| ------------------------- | ---- | ----------------------------- |
| `publicToken`             | P1   | 訂單追蹤 bearer token         |
| `pickupMethod`            | P3   | 取貨方式                      |
| `createdAt`               | P2   | 精確建單時間                  |
| `shippingFee`             | P3   | 對客運費                      |
| `totalPrice`              | P3   | 商品小計                      |
| `items[].productId`       | P2   | 內部商品 ID，無公開 ID lookup |
| `items[].productName`     | P3   | 商品名稱                      |
| `items[].productImageUrl` | P3   | 商品圖片                      |
| `items[].specValues`      | P3   | 成交規格                      |
| `items[].quantity`        | P3   | 成交數量                      |
| `items[].unitPrice`       | P3   | 成交單價                      |
| `items[].subtotal`        | P3   | 品項小計                      |
| `error`／`message`        | P3   | 固定驗證、庫存與截止訊息      |

**防洩漏關鍵：**資料庫內 `resolvedItems` 保留完整不可變快照（`public.ts:421-465`），HTTP 邊界則重新建立七鍵物件（`:472-479`）。`shareToken`、`profitSnapshot`、`costJpy`、匯率、交通與毛利均不會通過。

## 端點 4：`GET /orders/track/:publicToken`

來源：`public.ts:491-570`。

| 回應欄位                                | 分級  | 判定                                                |
| --------------------------------------- | ----- | --------------------------------------------------- |
| `publicToken`                           | P1    | 原請求已帶的 bearer token；回傳非必要但不增加可猜性 |
| `productName`                           | P3    | 商品名稱                                            |
| `quantity`                              | P3    | 數量                                                |
| `unitPrice`                             | P3    | 成交單價                                            |
| `shippingFee`                           | P3    | 對客運費                                            |
| `totalPrice`                            | P3    | 商品小計                                            |
| `orderTotal`                            | P3    | 對客訂單總額                                        |
| `paymentLast5`                          | P2    | 付款帳號末五碼，非完整帳號但仍屬財務識別資訊        |
| `pickupMethod`                          | P3    | 取貨方式                                            |
| `specValues`                            | P3    | 成交規格                                            |
| `status`／`statusLabel`                 | P3    | 訂單狀態碼與中文                                    |
| `shippingStatus`／`shippingStatusLabel` | P3    | 出貨狀態碼與中文                                    |
| `trackingCode`                          | P1    | 完整物流追蹤碼；bearer URL 外流時會一併外流         |
| `trackingProvider`                      | P2    | 物流商代碼                                          |
| `trackingProviderLabel`                 | P3    | 物流商名稱                                          |
| `latestTrackingStatus`                  | P2    | 標準化物流事件碼                                    |
| `latestTrackingStatusLabel`             | P3    | 客人可理解的物流文案                                |
| `latestTrackingTime`                    | P2    | 精確物流事件時間                                    |
| `shipmentUpdatedAt`                     | P2    | 精確同步時間                                        |
| `storeName`                             | P3    | 店名                                                |
| `recipientNameMasked`                   | P2    | 嚴格只露第一字，其餘以圓圈遮罩                      |
| `recipientPhoneMasked`                  | P2    | 遮罩電話                                            |
| `recipientAddressMasked`                | P2    | 縣市行政區摘要；非完整地址                          |
| `items`                                 | P2/P3 | 七鍵商品明細；只有 `productId` 為 P2                |
| `createdAt`                             | P2    | 精確建單時間                                        |
| `error`（404）                          | P3    | 固定 `Order not found`                              |

**明確未回：**完整買家／收件資料、CVS 四欄、內部／付款／物流備註、付款方式與已付金額、折扣內部說明、選店稽核欄、物流 raw data、單品與購物車成本快照。

## 端點 5：`PATCH /orders/track/:publicToken/payment-last5`

來源：`public.ts:573-599`。

| 回應欄位               | 分級 | 判定                                           |
| ---------------------- | ---- | ---------------------------------------------- |
| `paymentLast5`         | P2   | 只回更新後末五碼或 `null`                      |
| `error`（404/409/422） | P3   | 固定找不到、狀態不允許或格式錯誤，不回訂單資料 |

端點只在 `pending`／`awaiting_payment` 期間允許修改（`:575-590`），並套 10 分鐘 30 次追蹤限流（`:36-44,573`）。

## token 長度、熵與枚舉性

| 值                 | 產生處                               | 長度／熵                                            | 約束與判定                                                                |
| ------------------ | ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| 商品 `shareToken`  | `routes/products.ts:68`              | `randomBytes(12).toString("hex")`＝24 hex＝96 bits  | DB unique（`schema/products.ts:21`）；公開分享 capability，實務不可暴力猜 |
| 訂單 `publicToken` | `public.ts:174,335`、`orders.ts:140` | `randomBytes(16).toString("hex")`＝32 hex＝128 bits | DB unique（`schema/orders.ts:33`）；實務不可暴力猜，碰撞最多重試三次      |
| `id`／`productId`  | DB integer                           | 可預測連號                                          | `public.ts` 無接收這些 ID 讀既有訂單的路由，不能藉此枚舉                  |

公開建單 10 分鐘最多 20 次，追蹤／末五碼 10 分鐘最多 30 次（`public.ts:26-44`）。96/128-bit 熵已遠高於限流下可猜範圍。

## 成本／毛利遞迴掃描結果

正常成功回應的頂層與 `items[]` 均未出現下列任何語意：

- `costJpy`、`exchangeRate`、`purchaseExchangeRate`
- `transportCost`、`tripRouteId`
- `profit`、`margin`
- `profitSnapshot*`、`cartProfitSnapshot*`
- `internalNote`、`discountNote`、`paymentNote`、`shippingNote`
- 未遮罩的 buyer／recipient 姓名、電話與地址

其中購物車快照確實存在於資料庫寫入物件，但公開回應只經七鍵 allowlist，這是「保存帳務證據」與「客戶不可見成本」同時成立的必要分界。

## 建議後續（本包不修改）

1. 對正式站確認 `Referrer-Policy`、第三方 script、代理 access log 不保存完整 `publicToken`。
2. 產品若不需要精確庫存，可把 `inventory` 縮成有貨／低庫存狀態；這是產品決策，不是現行洩漏。
3. 保留頂層與 `items[]` 雙層 keyset 測試；新增任何公開欄位必須顯式審查。
4. 評估追蹤 token 撤銷／輪替與有效期限；目前 token 永久有效，安全性依賴 URL 保密。

## 最終裁決

**本次未發現 P0 成本、毛利、完整客戶個資或他人資料洩漏。**公開 DTO 已從早期 denylist 改為 allowlist，購物車巢狀快照也已在 HTTP 邊界剝除；96/128-bit token 熵與現有限流足以抵抗枚舉。殘餘風險主要是 bearer URL 被轉傳／記錄後的能力外流，以及精確庫存等必要營運資訊的最小揭露問題。

## BATCH-12 後續處理（2026-07-19）

- commit `34c74e8` 已在所有 middleware 與公開路由前設定 `Referrer-Policy: no-referrer`，降低 bearer URL 經瀏覽器 Referer 外流的風險。
- 同一 commit 設定 `X-Content-Type-Options: nosniff`，避免瀏覽器自行猜測回應內容型別。
- 真實 Express HTTP 測試已覆蓋成功與 404 回應，兩種回應都必須帶上述標頭；未加入會改變現有頁面載入語意的 CSP/HSTS。
