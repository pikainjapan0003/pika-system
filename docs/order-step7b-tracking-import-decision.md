# Order Step 7B：物流號碼匯入施工決策鎖定

> **版本**：Step 7B Decision v1.0｜分支：`qa/step6d-edit-order-cvs-store-picker-browser`
> **依據規格**：`docs/order-step7b-tracking-import-spec.md`（commit dd8fa7c）
> **本文件為 MVP 施工決策鎖定，不含施工實作。**
> 文件語言：繁體中文。
>
> **用途**：將 `docs/order-step7b-tracking-import-spec.md` 第 17 節的 12 個 Pending Questions 逐一鎖定，作為後續 Step 7B 施工的明確依據，避免施工時產生歧義。

---

## 決策總表

| 編號 | 問題                         | 決策                                                           | 類型        |
| ---- | ---------------------------- | -------------------------------------------------------------- | ----------- |
| D1   | CSV 匹配 key                 | `orderId`（純數字）優先；同時支援 `#123` 格式                  | ✅ MVP 採用 |
| D2   | provider 初版清單            | `711` / `familymart` / `home_delivery` / `other`               | ✅ MVP 採用 |
| D3   | 重複匯入策略                 | 預設報錯，不覆蓋                                               | ✅ MVP 採用 |
| D4   | 一訂單多 trackingCode        | 只允許一組，不允許多組                                         | ✅ MVP 採用 |
| D5   | trackingCode 格式驗證        | 只做 trim、非空、長度上限（100 字元），不做業者專屬格式驗證    | ✅ MVP 採用 |
| D6   | familymart provider code     | 使用 `familymart`，與 `cvsStores.provider`（`family`）明確區分 | ✅ MVP 採用 |
| D7   | 失敗列 CSV 下載              | 先不做，只在 API response 回傳錯誤清單                         | ⏸ 延後      |
| D8   | 老闆手動覆寫 trackingCode    | 先不做，後續另開 overwrite 流程                                | ⏸ 延後      |
| D9   | 匯入後 shippingStatus 更新   | 不自動改為 `shipped`，維持現狀                                 | ✅ MVP 採用 |
| D10  | publicToken 禁止作為匯入 key | 明確禁止，不接受 publicToken 作為匹配欄位                      | ✅ MVP 採用 |

---

## D1：CSV 匹配 key

### 決策

**優先使用 `orderId`（純數字）。同時支援 `orderNumber`（`#123` 格式）。**

API 解析邏輯：

- 欄位名稱接受 `orderId` 或 `orderNumber`（擇一）
- 值若為純數字 → 直接當 `orders.id`
- 值若為 `#` 開頭接數字（如 `#101`） → 去掉 `#` 後當 `orders.id`
- 其他格式 → 列為驗證錯誤

### 原因

| 考量             | 說明                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| orderId 最直接   | 對應 DB primary key，無需字串解析，不易出錯                                                                                  |
| 支援 #123 格式   | 現有出貨 CSV 匯出的「訂單編號」欄位即為 `#${order.id}` 格式，讓老闆可在現有 CSV 基礎上直接新增追蹤碼欄位再匯回，不需額外轉換 |
| 不採 publicToken | publicToken 是安全 token，不應出現在可外洩的 CSV 中（詳見 D10）                                                              |

### 施工影響

- CSV 解析時讀取 `orderId` 或 `orderNumber` 欄位（程式碼用同一邏輯處理）
- 找不到對應訂單時，錯誤訊息用收到的原始值（不回顯 DB 內部 ID 格式以外的資訊）
- 驗證邏輯需處理：純數字、`#數字`、其他格式（報錯）

### 測試影響

| 測試案例                      | 說明                                                   |
| ----------------------------- | ------------------------------------------------------ |
| orderId 純數字正確匹配        | 欄位名 `orderId`，值 `101` → 對應 orders.id = 101      |
| orderNumber #123 格式正確匹配 | 欄位名 `orderNumber`，值 `#101` → 對應 orders.id = 101 |
| 非法格式報錯                  | 值 `ORDER-101`、`abc` → 列為驗證錯誤                   |
| 找不到訂單                    | orderId = 99999（不存在）→ 回報「找不到訂單」          |

---

## D2：provider 初版清單

### 決策

**MVP 只支援以下四個 provider code：**

| provider code   | 顯示名稱    | 用途                 |
| --------------- | ----------- | -------------------- |
| `711`           | 7-11 交貨便 | 7-11 超商取貨物流    |
| `familymart`    | 全家 B2C    | 全家超商取貨物流     |
| `home_delivery` | 宅配        | 黑貓、新竹等宅配物流 |
| `other`         | 其他        | 無法分類或特殊物流   |

### 原因

| 考量         | 說明                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| 業務現況     | 目前主要出貨管道為 7-11 與全家超商取貨，加宅配為補充                       |
| Step 7D 準備 | 711 / familymart 是最可能實作自動查詢的 provider，先確立 code 為後續做準備 |
| `other` 兜底 | 讓無法分類的物流也能匯入，不強迫老闆選一個不正確的 provider                |
| 不預設擴充   | 未確認的業者（黑貓宅急便等）暫不獨立列出，避免 enum 過早膨脹               |

### 施工影響

- API 層定義 `ALLOWED_PROVIDERS` 常數：`['711', 'familymart', 'home_delivery', 'other']`
- 驗證時不分大小寫（`trim()` 後 `toLowerCase()` 再比對）
- 後台 UI 下拉選單對應四個選項，顯示中文名稱
- 新增 provider 需修改常數，不需 DB migration（沿用自由文字欄位，方案 A）

### 測試影響

| 測試案例               | 說明                                              |
| ---------------------- | ------------------------------------------------- |
| 四個合法 code 均可匯入 | 711 / familymart / home_delivery / other 各測一筆 |
| 不支援的 code 報錯     | `黑貓`、`7-11`、`SEVEN`、空白 → 報錯，不寫入      |
| 大小寫容錯             | `Familymart`、`711`（已小寫） → 正規化後比對合法  |

---

## D3：重複匯入策略

### 決策

**預設報錯，不覆蓋。**

若同一筆訂單的 `trackingCode` 已有值（非 null 且非空），再次匯入相同或不同 trackingCode 時：

- **列為失敗**，回報「此訂單已有 trackingCode，如需覆蓋請使用後台手動修改」
- 不修改現有 `trackingCode`
- 不影響 CSV 中其他列的處理

### 原因

| 考量           | 說明                                                              |
| -------------- | ----------------------------------------------------------------- |
| 防止誤覆蓋     | 若老闆重複上傳舊 CSV，或 CSV 有誤，不應靜默覆蓋已正確的追蹤碼     |
| 明確的修改流程 | 需要覆蓋時，應透過後台單筆操作，讓老闆確認是否要更改              |
| MVP 保守原則   | 先確保資料安全，後續若有需求再評估加入 `--overwrite` 旗標         |
| 不同於空值匯入 | 若訂單的 `trackingCode` 目前為 null，匯入視為首次填入，可正常寫入 |

### 施工影響

- 匯入前先查詢該訂單的 `trackingCode` 是否已有值
- 若已有值 → 加入 errors 清單，不執行 UPDATE
- 若為 null → 正常執行 INSERT/UPDATE
- 錯誤訊息：`"此訂單已有物流追蹤碼，如需修改請至後台手動更新"`

### 測試影響

| 測試案例                           | 說明                           |
| ---------------------------------- | ------------------------------ |
| 首次匯入（trackingCode 為 null）   | 成功寫入                       |
| 重複匯入（trackingCode 已有值）    | 列為失敗，不覆蓋               |
| 同 CSV 同訂單出現兩次（均為 null） | 第一列成功，第二列因已有值報錯 |

---

## D4：一訂單只允許一組 trackingCode

### 決策

**MVP 只允許一個訂單對應一組 trackingCode。**

現有 DB `orders` 表只有 `tracking_code`（單一欄位）。若需要多組追蹤碼，需等 Step 7C 新增 `shipment_trackings` 資料表後才支援。

### 原因

| 考量         | 說明                                                          |
| ------------ | ------------------------------------------------------------- |
| DB 現況      | `orders.tracking_code` 是單一 text 欄位，無法儲存多組追蹤碼   |
| 業務現況     | 目前代購訂單通常是單件或同批出貨，多組追蹤碼需求尚不明確      |
| Step 7C 銜接 | Step 7C 若新增 `shipment_trackings`，則可支援一訂單多組追蹤碼 |
| 不做預先設計 | 不在 Step 7B 預先為「可能的需求」設計，避免過度工程           |

### 施工影響

- CSV 匯入邏輯：每個 orderId 只接受一列，若同 CSV 出現重複 orderId（且 trackingCode 非空），第二列列為失敗
- 文件與 UI 說明：明確告知一個訂單只能有一組追蹤碼

### 測試影響

| 測試案例                   | 說明                                                          |
| -------------------------- | ------------------------------------------------------------- |
| 同 CSV 同 orderId 出現兩次 | 第一列成功（假設 trackingCode 原為 null），第二列因已有值報錯 |
| 多組追蹤碼需求             | Step 7C 以後才處理                                            |

---

## D5：trackingCode 格式驗證

### 決策

**只做 trim、非空驗證、長度上限（100 字元）。不做物流商專屬格式驗證。**

驗證規則：

1. `trim()` 去除前後空白
2. `length > 0`（不可為空字串）
3. `length <= 100`（超過長度視為錯誤）
4. 不驗證字元集（允許數字、英文、連字號等）
5. 不依 trackingProvider 做不同格式驗證

### 原因

| 考量             | 說明                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| 各業者格式不同   | 7-11 交貨便格式與全家不同，未來可能有更多業者，格式驗證難以維護        |
| 老闆輸入容錯     | 若格式驗證過嚴，老闆正確的追蹤碼被誤拒，客服成本高                     |
| MVP 保守         | 先確保基本防護（非空、長度），格式驗證留到 Step 7D 研究物流 API 後再加 |
| `other` provider | `other` 類型的追蹤碼無任何格式規範，無法驗證                           |

### 施工影響

- 驗證函式：`trackingCode.trim().length > 0 && trackingCode.trim().length <= 100`
- DB 儲存時存 `trim()` 後的值
- 若長度超過 100 → 報錯：`"物流追蹤碼長度超過上限（100 字元）"`

### 測試影響

| 測試案例           | 說明                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| 正常追蹤碼         | `F45913208600`、`FM123456789` → 通過                                                |
| 純空白             | `"   "` → trim 後為空，報錯                                                         |
| 超過 100 字元      | 101 字元 → 報錯                                                                     |
| 含特殊字元         | `-`、`/`、英文、數字 → 通過（不做格式限制）                                         |
| CSV injection 嘗試 | `=CMD(...)`、`+1+2` → 先 trim，存入 DB 前不執行，但 API response / CSV 匯出時需清洗 |

---

## D6：familymart provider code 命名

### 決策

**`trackingProvider` 使用 `familymart`。與 `cvsStores.provider`（使用 `family`）明確區分，兩者不互通。**

### 原因

| 考量                | 說明                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 概念不同            | `cvsStores.provider` 代表門市所屬物流商（用於門市選擇流程）；`trackingProvider` 代表包裹的物流查詢來源（用於貨態查詢）。兩者雖相關但語意不同 |
| 不混用              | 若用同一個 `family` code，未來維護時會混淆哪個 enum 屬於哪個脈絡                                                                             |
| `familymart` 更明確 | 全名更易讀，降低混淆風險                                                                                                                     |
| 不需同步            | 兩個欄位的 enum 不需對應，修改一個不影響另一個                                                                                               |

### 施工影響

- `ALLOWED_PROVIDERS` 中明確寫入 `'familymart'`（不是 `'family'`）
- 程式碼 comment 需說明：`trackingProvider 的 familymart ≠ cvsStores.provider 的 family`
- 後台 UI 下拉選單選項：顯示「全家 B2C」，value 為 `familymart`
- 若有已存在的自由文字資料（如 `"全家"`、`"family"`），匯入時不自動轉換，視為 provider 不支援

### 測試影響

| 測試案例            | 說明                              |
| ------------------- | --------------------------------- |
| `familymart` → 合法 | 通過驗證                          |
| `family` → 非法     | 報錯：`"trackingProvider 不支援"` |
| `全家` → 非法       | 報錯：`"trackingProvider 不支援"` |

---

## D7：失敗列 CSV 下載

### 決策

**MVP 先不做失敗列 CSV 下載。只在 API response 回傳錯誤清單。**

### 原因

| 考量       | 說明                                                        |
| ---------- | ----------------------------------------------------------- |
| 實作成本   | 生成失敗列 CSV 需要額外的檔案產生邏輯，增加 API 複雜度      |
| MVP 最小化 | 錯誤清單（JSON array）已足夠讓老闆知道哪些列失敗及原因      |
| 前端工期   | 「下載失敗列 CSV」需要前端 Blob 下載實作，延長 Step 7B 工期 |
| 後續可加   | 若實際使用後發現需求強烈，可在後續版本獨立補強              |

### 施工影響

- API response 回傳 `errors` array，每項含 `row`（CSV 行號）、`orderId`（輸入值）、`reason`（失敗原因）
- 前端只顯示錯誤清單（文字列表），不需下載按鈕
- 錯誤訊息需足夠清楚，讓老闆能手動修正 CSV 後重試

### 測試影響

- API response 包含 `errors` array（含 row / orderId / reason）✅
- 不需測試 CSV 下載功能

---

## D8：老闆手動覆寫 trackingCode

### 決策

**MVP 不做 CSV 覆蓋流程。覆寫需透過後台單筆操作（現有 `PATCH /orders/:orderId`）。**

### 原因

| 考量       | 說明                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| 與 D3 一致 | 重複匯入已決策為報錯，覆蓋邏輯不一致會造成操作混淆                                      |
| 單筆已可用 | 現有 `PATCH /orders/:orderId` 已支援覆蓋 trackingCode，不需額外施工                     |
| 防誤操作   | CSV 批次覆蓋的風險高（一次改多筆），MVP 先由老闆逐筆確認                                |
| 後續規劃   | 若批次覆蓋需求強烈，可在 Step 7B+ 另開「覆蓋模式」CSV 匯入（如加旗標 `overwrite=true`） |

### 施工影響

- `POST /orders/tracking-import` 不接受覆蓋參數
- 後台 UI 顯示說明文字：「若需修改已存在的追蹤碼，請至訂單詳情頁手動更新」
- 不需實作 overwrite 邏輯

### 測試影響

- 重複匯入一律報錯（與 D3 測試案例一致），不需測試覆蓋路徑

---

## D9：匯入後 shippingStatus 更新

### 決策

**匯入 trackingCode 成功後，不自動將 `shippingStatus` 更新為 `shipped`。維持現有值。**

### 原因

| 考量                          | 說明                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| 業務流程分離                  | 「有追蹤碼」不等於「已出貨」。老闆可能提前填入追蹤碼但尚未實際出貨                      |
| 避免誤觸                      | 若匯入即改為 `shipped`，老闆需先確認訂單真的已出貨才能匯入，限制靈活性                  |
| shippingStatus 有獨立更新路徑 | 老闆可透過現有後台批次更新 shippingStatus（`PATCH /orders/batch-status`），兩個動作分開 |
| 回歸測試                      | 若自動改 shippingStatus，需測試所有 shippingStatus 相關流程，增加施工範圍               |

### 施工影響

- `POST /orders/tracking-import` 只更新 `tracking_code` 與 `tracking_provider` 欄位
- 不修改 `shipping_status`
- API response 不含 shippingStatus 變更資訊

### 測試影響

| 測試案例                         | 說明                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| 匯入前後 shippingStatus 不變     | 匯入成功後確認 shippingStatus 維持原值（如 `not_shipped`） |
| 不需測試 shippingStatus 自動轉換 | 因為不做此功能                                             |

---

## D10：publicToken 禁止作為 CSV 匯入 key

### 決策

**明確禁止使用 `publicToken` 作為 CSV 匯入的匹配欄位。**

- API 若收到含 `publicToken` 欄位的 CSV，整份拒絕（HTTP 422），回報：`"CSV 不應包含 publicToken 欄位，請改用 orderId 或 orderNumber"`
- 文件說明：publicToken 是訂單查詢 token，不是匯入鍵值

### 原因

| 考量           | 說明                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| 安全性         | publicToken 是客人查詢訂單的 URL 入口 token，出現在 CSV 中等於外洩所有客人的查詢 URL     |
| 最小曝露原則   | 物流匯入 CSV 的生命週期難以控制（可能被 email 傳遞、存在電腦桌面），不應含有 publicToken |
| orderId 已足夠 | orderId 是中性的業務識別碼，無安全風險                                                   |
| 積極防護       | 不只是「不支援」，而是「積極拒絕」，讓老闆了解此欄位不應出現在 CSV                       |

### 施工影響

- CSV header 解析時，若發現欄位名稱包含 `publicToken`（不分大小寫）→ 整份拒絕，HTTP 422
- 錯誤訊息：`"CSV 不應包含 publicToken 欄位，請改用 orderId 或 orderNumber 作為訂單識別"`

### 測試影響

| 測試案例                                | 說明               |
| --------------------------------------- | ------------------ |
| CSV header 含 publicToken               | 整份拒絕，HTTP 422 |
| CSV header 含 PublicToken（大小寫變體） | 同上               |
| 只含 orderId 或 orderNumber             | 正常處理           |

---

## 施工影響總整理

### 需施工的部分

| 項目                                           | 說明                                              | 決策依據    |
| ---------------------------------------------- | ------------------------------------------------- | ----------- |
| `ALLOWED_PROVIDERS` 常數                       | `['711', 'familymart', 'home_delivery', 'other']` | D2          |
| CSV 解析邏輯（orderId / orderNumber 兩種格式） | 純數字 + `#數字` 均支援                           | D1          |
| publicToken header 偵測與拒絕                  | CSV header 含 publicToken 時整份拒絕              | D10         |
| 重複匯入偵測（trackingCode 已有值）            | 查 DB 後決定是否允許寫入                          | D3、D4      |
| trackingCode trim + 非空 + 長度驗證            | `trim()` + `length > 0` + `length <= 100`         | D5          |
| 匯入只更新 tracking_code + tracking_provider   | 不動 shipping_status                              | D9          |
| 錯誤清單回傳（不做 CSV 下載）                  | JSON array 回傳 errors                            | D7          |
| 後台 UI 說明文字                               | 說明覆寫需至單筆操作                              | D8          |
| CSV injection 清洗                             | `=`、`+`、`-`、`@` 開頭清洗                       | 規格第 9 節 |

### 不需施工的部分（延後）

| 項目                        | 延後原因              |
| --------------------------- | --------------------- |
| 失敗列 CSV 下載             | D7 決策延後           |
| 覆蓋模式（overwrite=true）  | D8 決策延後           |
| 自動更新 shippingStatus     | D9 決策不做           |
| trackingCode 業者格式驗證   | D5 決策延後至 Step 7D |
| 多組 trackingCode           | D4 決策延後至 Step 7C |
| provider 清單擴充（黑貓等） | D2 決策 MVP 只做四個  |

---

## 測試影響總整理

### 必測案例（Step 7B 施工完成後）

| 編號    | 案例                                   | 決策 |
| ------- | -------------------------------------- | ---- |
| T-D1-1  | orderId 純數字正確匹配                 | D1   |
| T-D1-2  | orderNumber #123 格式正確匹配          | D1   |
| T-D1-3  | 非法格式報錯                           | D1   |
| T-D2-1  | 四個合法 provider code 均可匯入        | D2   |
| T-D2-2  | 不支援的 provider code 報錯            | D2   |
| T-D3-1  | 首次匯入（trackingCode 為 null）成功   | D3   |
| T-D3-2  | 重複匯入（trackingCode 已有值）報錯    | D3   |
| T-D4-1  | 同 CSV 同 orderId 出現兩次，第二列報錯 | D4   |
| T-D5-1  | 正常追蹤碼通過                         | D5   |
| T-D5-2  | 空白報錯                               | D5   |
| T-D5-3  | 超過 100 字元報錯                      | D5   |
| T-D6-1  | `familymart` 合法                      | D6   |
| T-D6-2  | `family` 非法（報錯，不自動轉換）      | D6   |
| T-D9-1  | 匯入後 shippingStatus 不變             | D9   |
| T-D10-1 | CSV header 含 publicToken 整份拒絕     | D10  |

### 不需測試的案例（決策為延後）

| 案例                                   | 原因    |
| -------------------------------------- | ------- |
| 失敗列 CSV 下載                        | D7 延後 |
| 覆蓋已有 trackingCode                  | D8 延後 |
| 匯入後 shippingStatus 自動改為 shipped | D9 不做 |

---

## 待未來版本處理事項

| 事項                               | 說明                                                         | 建議時機                |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------- |
| 失敗列 CSV 下載                    | 若老闆反映每次都要手動複製錯誤列，可補強                     | Step 7B+ 或 Step 7B v2  |
| 覆蓋模式（overwrite=true 旗標）    | 若老闆有批次更正追蹤碼的需求，開放覆蓋                       | Step 7B+                |
| provider 清單擴充                  | 黑貓（`black_cat`）、新竹（`hct`）等宅配業者，依業務需求新增 | Step 7D 研究物流 API 時 |
| trackingCode 業者格式驗證          | 7-11 / 全家格式驗證，確認 API 格式後加入                     | Step 7D                 |
| 多組 trackingCode                  | 一訂單支援多組追蹤碼，需新增 `shipment_trackings` 資料表     | Step 7C                 |
| 自動更新 shippingStatus            | 若業務需求是「有追蹤碼即代表已出貨」，可重新評估             | 另行業務討論            |
| 匯入後自動發出貨通知               | 通知客人已出貨，附追蹤碼                                     | Step 7F                 |
| 前端匯入預覽（上傳後先確認再提交） | 提升使用者體驗，防止大量誤操作                               | Step 7B+                |

---

## 文件版本與決策歷程

| 時間       | 版本 | 變更                                              |
| ---------- | ---- | ------------------------------------------------- |
| 2026-06-06 | v1.0 | 根據 Step 7B-0 規格（dd8fa7c）鎖定 10 項 MVP 決策 |

---

_文件版本：Step 7B Decision v1.0_
_決策日期：2026-06-06_
_撰寫：Claude B（Fixed Latest File Mode）_
_依據規格：docs/order-step7b-tracking-import-spec.md（commit dd8fa7c）_
_分支：qa/step6d-edit-order-cvs-store-picker-browser_
