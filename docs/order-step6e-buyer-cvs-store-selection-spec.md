# Order Step 6E-A：買家端 CVS 選店流程規格與現況查核

> 文件版本：1.0  
> 建立日期：2026-06-06  
> 對應分支：`docs/step6e-buyer-cvs-store-selection-spec`  
> 基準 commit：`2efc030 docs-order-step6d-cvs-store-picker-release-checklist`

---

## 1. 目的

Step 6E 是買家端 CVS 選店流程的開發階段。  
**本文件是 Step 6E-A，只做規格定義與現況查核，不施工買家端功能。**

買家端選店比後台管理端更敏感，原因：

- 影響下單流程與轉換率（買家可能在選店步驟放棄下單）
- 影響手機 UX（買家主要以手機操作）
- 影響公開頁個資顯示策略（門市地址/電話是否對外顯示）
- 影響客服承諾（門市資料準確性、門市異動處理）
- 影響多端行為一致性（管理端後台已選的門市 vs 買家端選的門市）

**本文件聲明**：

- 本文件不代表買家端選店功能已開發完成。
- 本文件不代表 emap.pcsc.com.tw 使用已獲法務確認。
- 本文件不承諾門市資料即時、完整、百分百準確。
- 本文件中的「已實作」描述均指程式碼層面，未完整做過人工瀏覽器驗收。

---

## 2. 目前 Step 6 狀態

| 步驟                      | 描述                                                      | 狀態      | Commit    |
| ------------------------- | --------------------------------------------------------- | --------- | --------- |
| Step 6A                   | CVS 選店規格文件                                          | ✅ 完成   | `850bbb2` |
| Step 6B                   | CVS 既有實作查核與補強決策文件                            | ✅ 完成   | `25963e9` |
| Step 6C-0                 | CVS emap 匯入 endpoint 安全補丁                           | ✅ 完成   | `77381f1` |
| Step 6C-0b                | CVS emap 匯入 endpoint 權限模型查核                       | ✅ 完成   | `ab4a1e7` |
| Step 6C-0c                | 暫停 emap 匯入 endpoint                                   | ✅ 完成   | `20b2c87` |
| Step 6C proper            | Orders API / Type 補強                                    | ✅ 完成   | `52d0993` |
| Step 6D                   | EditOrderDialog 後台 CVS 選店器                           | ✅ 完成   | `cf799c6` |
| Step 6D-QA fix            | Enter key loading guard 修正                              | ✅ 完成   | `20ea74e` |
| Step 6D-Fix               | storeSelectedAt dirty tracking 修正 + 5 tests             | ✅ 完成   | `2a76ef0` |
| Step 6D-QA2               | 乾淨分支完整驗收（104/104 tests pass）                    | ✅ 完成   | —         |
| Step 6D-Release Checklist | `docs/order-step6d-cvs-store-picker-release-checklist.md` | ✅ 完成   | `2efc030` |
| Step 6D 人工瀏覽器驗收    | 需在有瀏覽器的環境補做                                    | ⬜ 未完成 | —         |
| Step 6E-A                 | 買家端選店規格與現況查核（本文件）                        | ✅ 完成   | —         |
| Step 6E-B+                | 買家端選店功能施工                                        | ⬜ 未開始 | —         |

### 乾淨基準建議

- 文件分支：`docs/step6d-cvs-store-picker-release-checklist`
- Commit：`2efc030 docs-order-step6d-cvs-store-picker-release-checklist`

### 污染 commit（不可使用）

| Commit    | 描述                                                               | 風險              |
| --------- | ------------------------------------------------------------------ | ----------------- |
| `ec3b3bd` | `feat-orders-tracking-import-api`（Step 7B API）                   | 混入 Step 7B 邏輯 |
| `47a6f81` | `feat-orders-tracking-import-ui`（Step 7B UI，Orders.tsx +256 行） | 混入 Step 7B 邏輯 |

---

## 3. 買家端現況查核

以下查核結果來自實際 repo 搜尋（2026-06-06）。

### 3.1 主要相關檔案

| 檔案                                            | 用途                                 | 行數   |
| ----------------------------------------------- | ------------------------------------ | ------ |
| `artifacts/shop-app/src/pages/PublicOrder.tsx`  | 買家下單頁（含 CVS 選店邏輯）        | 738 行 |
| `artifacts/shop-app/src/pages/Cvs711Select.tsx` | CVS 選店頁面（7-11 / 全家，共用）    | 298 行 |
| `artifacts/shop-app/src/pages/Cvs711Return.tsx` | CVS 選店回調頁（舊版 emap callback） | 存在   |
| `artifacts/shop-app/src/lib/cvs711.ts`          | CVS 工具函式庫                       | 存在   |
| `artifacts/shop-app/src/pages/TrackOrder.tsx`   | 買家追蹤訂單頁                       | 存在   |
| `artifacts/api-server/src/routes/public.ts`     | 買家端 API（下單 / 追蹤）            | 存在   |

### 3.2 買家端現況查核表

| 查核項目                                   | 查核結果                                                                                        | 檔案 / 證據                                | 風險                                                                                                | 建議                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------- |
| 是否存在 PublicOrder.tsx                   | ✅ 存在                                                                                         | `PublicOrder.tsx`（738 行）                | —                                                                                                   | —                                 |
| 是否存在買家下單頁                         | ✅ 存在，入口為 `/p/:shareToken`                                                                | `PublicOrder.tsx`                          | —                                                                                                   | —                                 |
| 是否存在 checkout / 購物車                 | ❌ 不存在，無 checkout / cart 頁面                                                              | —                                          | 下單流程全在 PublicOrder.tsx 單頁完成                                                               | —                                 |
| 買家是否可填 pickupMethod                  | ✅ 是，UI 有卡片式選取                                                                          | `PublicOrder.tsx:115, 469ff`               | —                                                                                                   | —                                 |
| 買家是否可填 shippingMethod                | ❌ 否，shippingMethod 欄位不在 submit payload                                                   | `PublicOrder.tsx:239ff`                    | 後台 shippingMethod 與 pickupMethod 分開管理，買家端只送 pickupMethod                               | 確認是否需要                      |
| 買家是否可填 storeCode / storeName（手填） | ❌ 否，PublicOrder.tsx 不提供手填欄位                                                           | `PublicOrder.tsx`                          | —                                                                                                   | 手填 fallback 需另行討論          |
| 買家是否可填 CVS snapshot                  | ✅ **已實作**，透過 Cvs711Select.tsx 頁面選店後 localStorage 暫存，submit 時帶入                | `PublicOrder.tsx:244-251`                  | 使用 `const body: any = {}` 繞過 TypeScript 型別                                                    | 補齊 TypeScript 型別              |
| 送出的 CVS 欄位                            | `cvsStoreId`, `cvsStoreName`, `cvsStoreAddress`, `cvsStorePhone`, `storeSelectedBy: "customer"` | `PublicOrder.tsx:246-250`                  | storeSelectedBy 固定為 "customer" ✅                                                                | —                                 |
| 是否驗證「超商方式必選門市」               | ✅ **已實作**，needsCvsStore && !cvsStore → 阻擋送出 + 錯誤訊息                                 | `PublicOrder.tsx:217-221`                  | —                                                                                                   | —                                 |
| 是否有 7-11 UI 卡片                        | ✅ 存在，已選門市顯示店名、地址、店號 + 「重選」按鈕                                            | `PublicOrder.tsx:511-535`                  | —                                                                                                   | —                                 |
| 是否有全家 UI 卡片                         | ✅ 存在，與 7-11 相同邏輯                                                                       | `PublicOrder.tsx:551-575`                  | —                                                                                                   | —                                 |
| 是否有「地址未回傳」邊緣處理               | ✅ 存在，顯示橘色提醒                                                                           | `PublicOrder.tsx:525, 565`                 | —                                                                                                   | —                                 |
| CVS 門市資料是否有保守說明                 | ❌ **未發現**免責聲明（後台 EditOrderDialog 有，買家端 PublicOrder 無）                         | —                                          | 買家端應補保守免責文字                                                                              | **需補**                          |
| 是否透過 /cvs/711/select 選店              | ✅ 是，openCvsStoreMap() 導向 Cvs711Select.tsx                                                  | `PublicOrder.tsx:185-192`, `lib/cvs711.ts` | —                                                                                                   | —                                 |
| 是否有 localStorage 暫存機制               | ✅ `saveCvsStore(shareToken, store)` / `loadCvsStore(shareToken)` / `clearCvsStore(shareToken)` | `lib/cvs711.ts:58-82`                      | 頁面跳轉後從 localStorage 還原選擇，有無 TTL 需確認                                                 | 建議加上 TTL 或到期清除           |
| public tracking GET 是否回傳 CVS 欄位      | ❌ **不回傳**，STRICTLY EXCLUDED                                                                | `public.ts:268-270`                        | 買家追蹤頁看不到自己選的門市                                                                        | 產品決策：是否顯示                |
| 下單後確認頁是否顯示門市資訊               | ❌ **未發現**，成功頁只顯示追蹤碼、商品、數量、金額、取貨方式                                   | `PublicOrder.tsx:298-330`                  | 買家下單後無法確認自己選的門市                                                                      | **建議補充**                      |
| GET /api/cvs/stores 是否公開               | ✅ 公開，無 auth                                                                                | `cvs.ts:51`                                | —                                                                                                   | —                                 |
| Cvs711Select.tsx 是否可重用於買家端        | ✅ **已重用**，source=customer 走 localStorage 流程                                             | `Cvs711Select.tsx:40, 148-153`             | 目前 import { useAuth } from @clerk/react，buyer 端不需要 auth 但 getToken 只在 source=admin 時呼叫 | 確認 Clerk 是否會在 public 頁報錯 |
| emap endpoint 是否仍停用                   | ✅ 仍停用，403 early return                                                                     | `cvs.ts:120-122`                           | —                                                                                                   | —                                 |

### 3.3 API 與型別現況

| 項目                                           | 現況                                                                                    | 缺口                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /p/:shareToken/orders` 是否接受 CVS 欄位 | ✅ 接受（`parseCvsExtension()` 繞過 zod 驗證）                                          | CVS 欄位不在 `SubmitOrderBody` zod schema 內 |
| `SubmitOrderBody` zod schema                   | ❌ 無 CVS 欄位（buyerName / buyerPhone / pickupMethod / notes / specValues / quantity） | 需補 CVS 欄位才能有完整驗證                  |
| `OrderInput` OpenAPI type                      | ❌ 無 CVS 欄位                                                                          | 需補齊規格                                   |
| generated `OrderInput` TypeScript              | ❌ 無 CVS 欄位                                                                          | 需重新 codegen 或手動補                      |
| `storeSelectedAt` 設定時機                     | ✅ 伺服器端設定（`hasCvs ? new Date() : null`）                                         | —                                            |
| `storeSelectedBy`                              | ✅ 固定 "customer"（`parseCvsExtension` 預設）                                          | 可讓客端傳入，但已有安全預設值               |
| `GET /orders/track/:publicToken` CVS 欄位      | ❌ 不回傳任何 CVS 欄位                                                                  | 產品決策：是否讓買家在追蹤頁看到門市資訊     |
| 買家下單成功後回傳 CVS 欄位                    | ✅ API 回傳（含 cvsStoreId 等），但前端未顯示                                           | 補充成功頁顯示邏輯                           |

---

## 4. Step 6E 目標

Step 6E 的核心目標：

1. **買家可以在下單流程選擇 7-11 / 全家門市**，不需要手填店號 / 店名。
2. **選定門市後，系統保存完整 CVS snapshot**：
   - `cvsStoreId`
   - `cvsStoreName`
   - `cvsStoreAddress`
   - `cvsStorePhone`
   - `storeSelectedBy = 'customer'`
   - `storeSelectedAt`（伺服器端設定）
3. **管理端後台可查看買家選的門市**（已透過 Step 6D 實作）。
4. **public tracking 是否顯示門市資訊**：需產品決策（預設保守，不顯示）。
5. **不做正式物流託運**（下單後的物流操作由老闆手動完成）。
6. **不承諾門市資料即時、完整、百分百準確**（資料來自本地 DB，需定期更新）。

---

## 5. MVP 範圍

### 現況（Step 6E-A 查核結論）

**買家端 CVS 選店的核心功能已大幅實作**，包含：

- PublicOrder.tsx：選店入口、localStorage 還原、payload 組裝、必填驗證 ✅
- Cvs711Select.tsx：搜尋頁面、結果列表、選擇邏輯（支援 source=customer） ✅
- public.ts：POST 接受 CVS 欄位，設定 storeSelectedAt ✅

**尚待補強項目**：

| 項目                                     | 重要性 | 說明                                                          |
| ---------------------------------------- | ------ | ------------------------------------------------------------- |
| `SubmitOrderBody` zod schema 補 CVS 欄位 | 高     | 目前繞過 schema 驗證，型別不安全                              |
| `OrderInput` OpenAPI spec 補 CVS 欄位    | 高     | 影響 codegen 型別                                             |
| PublicOrder.tsx 買家端保守免責聲明       | 高     | 後台有，買家端缺漏                                            |
| 成功頁顯示已選門市資訊                   | 中     | 下單成功後買家無法確認選擇                                    |
| public tracking 顯示門市（產品決策）     | 待決   | 需確認是否要讓買家在追蹤頁看到門市                            |
| localStorage TTL / 過期清除              | 中     | 避免舊選擇長期殘留                                            |
| 自動化測試（買家端選店流程）             | 高     | 目前無測試覆蓋                                                |
| 人工瀏覽器驗收                           | 高     | 無法在 headless 環境執行                                      |
| `useAuth` 在 public 頁的相容性           | 待確認 | Cvs711Select.tsx import useAuth，buyer 端可能無 Clerk session |

### MVP 功能定義

- [x] 支援 7-11 / 全家（已實作）
- [x] 手機優先（Cvs711Select.tsx max-w-[480px]，已實作）
- [x] pickupMethod 為超商方式時才顯示 CVS picker（已實作）
- [x] provider selector 7-11 / 全家（Cvs711Select.tsx 已實作）
- [x] keyword 搜尋（Cvs711Select.tsx 已實作）
- [x] 結果列表（已實作）
- [x] 選定後顯示已選門市確認卡（已實作）
- [x] 下單 payload 帶入 CVS snapshot（已實作，繞過 zod 型別）
- [x] `storeSelectedBy = 'customer'`（已實作）
- [x] `storeSelectedAt` 由後端設定（已實作）
- [x] 管理端後台可看到買家選的門市（Step 6D 已完成）
- [ ] 買家端免責聲明補充（**待補**）
- [ ] 成功頁顯示門市資訊（**待補**）
- [ ] TypeScript 型別補齊（**待補**）
- [ ] 自動化測試（**待補**）

---

## 6. 非目標

Step 6E-A 不施工、不修改任何功能：

- 不修改 PublicOrder.tsx
- 不修改 Cvs711Select.tsx
- 不修改 public.ts API
- 不修改 DB schema / migration
- 不修改 generated client / OpenAPI spec
- 不新增 cvsProvider 欄位
- 不恢復 `POST /cvs/711/import-from-emap`
- 不做正式物流託運
- 不做 Step 7B 貨態匯入
- 不做 OpenClaw
- 不承諾門市資料即時更新
- 不修改 public tracking 顯示策略（除非後續產品決策）
- 不做多包裹 / 多門市
- 不做任何未在本文件明確要求的功能

---

## 7. 買家端 UX Flow

### 7.1 主流程（超商取貨）

```
1. 買家進入下單頁 /p/:shareToken
   └─ 顯示商品資訊、規格選取、取貨方式卡片

2. 買家選擇取貨方式（pickupMethod）
   ├─ 若選「7-11 貨到付款」或「7-11 取貨（先付款）」
   │   └─ isSevenElevenMethod() = true → needsCvsStore = true
   ├─ 若選「全家貨到付款」或「全家取貨（先付款）」
   │   └─ isFamilyMartMethod() = true → needsCvsStore = true
   └─ 若選宅配 / 面交 → CVS picker 不顯示

3. 超商方式：顯示 CVS 選店入口卡片
   ├─ 若已有暫存門市（localStorage）→ 顯示已選門市確認卡
   └─ 若無暫存門市 → 顯示「請選擇取貨門市」+ 選擇按鈕

4. 買家點「選擇 7-11 門市」或「選擇全家門市」按鈕
   └─ openCvsStoreMap({ provider, source: "customer", shareToken, returnPath })
   └─ 導向 /cvs/711/select?provider=seven|family&source=customer&shareToken=...&returnTo=...

5. 買家在 Cvs711Select.tsx 搜尋門市
   ├─ 輸入關鍵字 → 呼叫 GET /api/cvs/stores?provider=&q=&limit=20
   ├─ 顯示結果列表（店名、地址、電話、更新日期）
   ├─ 查無結果 → 提示換關鍵字
   └─ 搜尋失敗 → 錯誤提示

6. 買家點選某門市「選擇」按鈕
   └─ source=customer → saveCvsStore(shareToken, storeData) 存 localStorage
   └─ setLocation(returnTo) → 返回 PublicOrder.tsx

7. PublicOrder.tsx 從 localStorage 還原已選門市
   └─ loadCvsStore(shareToken) → setCvsStore(stored)
   └─ 已選門市確認卡顯示：店名、地址、門市編號、「重選」按鈕

8. 買家填寫姓名、電話、數量等資料後送出
   └─ 驗證：needsCvsStore && !cvsStore → 阻擋送出
   └─ 組裝 payload：含 cvsStoreId / cvsStoreName / cvsStoreAddress / cvsStorePhone / storeSelectedBy: "customer"
   └─ POST /p/:shareToken/orders

9. API 接受 CVS 欄位（parseCvsExtension），設定 storeSelectedAt
   └─ 回傳 201 Created

10. 前端顯示下單成功頁
    └─ 顯示：追蹤碼、商品、數量、金額、取貨方式、下單時間
    └─ ❌ 目前未顯示已選門市資訊（待補）

11. clearCvsStore(shareToken) → 清除 localStorage 暫存

12. 管理後台：老闆可在 EditOrderDialog 看到買家選的門市
```

### 7.2 手機 UX 要求

| 項目             | 說明                                           |
| ---------------- | ---------------------------------------------- |
| PublicOrder.tsx  | max-w-[480px] mx-auto，手機優先                |
| Cvs711Select.tsx | min-h-[100dvh] max-w-[480px] mx-auto，手機優先 |
| 選擇按鈕         | 全寬、高度 40px，可點擊                        |
| 結果列表         | 可滾動，不爆版                                 |
| 輸入框           | 手機鍵盤友善                                   |

### 7.3 各狀態說明

| 狀態                 | 顯示                                                |
| -------------------- | --------------------------------------------------- |
| 未選取貨方式         | 不顯示 CVS picker                                   |
| 選了超商方式，無暫存 | 顯示「請選擇取貨門市」+ 選擇按鈕                    |
| 選了超商方式，有暫存 | 顯示已選門市卡（店名、地址、編號）+ 「重選」按鈕    |
| 搜尋中               | Cvs711Select.tsx 顯示載入狀態                       |
| 查無結果             | 提示換關鍵字                                        |
| 搜尋失敗             | 顯示「搜尋失敗，請稍後再試」（根據 cvs711.ts 邏輯） |
| 地址未回傳           | 顯示橘色提示「地址資料未完整回傳，請確認門市資訊」  |
| 未選門市就送出       | 「請先選擇 7-11 門市」/ 「請先選擇全家門市」        |

### 7.4 門市資料提醒文字建議

> 門市資料可能因超商更新而異動，實際資訊以超商公告為準。

（目前 PublicOrder.tsx 缺少此提醒，後台 EditOrderDialog 已有，建議買家端補充。）

---

## 8. API / Type 規劃

> 本節只規劃，不實作。

### 8.1 現況

`POST /p/:shareToken/orders` 已支援 CVS 欄位，但透過 `parseCvsExtension()` 繞過 zod schema：

```javascript
// public.ts 現況
const cvsData = parseCvsExtension(req.body); // 繞過 SubmitOrderBody 驗證
const hasCvs = !!cvsData.cvsStoreId;
```

`SubmitOrderBody` zod schema 目前只有：

```javascript
SubmitOrderBody = zod.object({
  buyerName,
  buyerPhone,
  pickupMethod,
  notes,
  specValues,
  quantity,
  // ❌ 無 CVS 欄位
});
```

### 8.2 建議補強方向

**方案 A（建議）：在 SubmitOrderBody 補 CVS 欄位（optional）**

```javascript
SubmitOrderBody = zod.object({
  buyerName: zod.string().min(1),
  buyerPhone: zod.string().min(1),
  pickupMethod: zod.string().min(1),
  notes: zod.string().optional(),
  specValues: zod.object({}).passthrough().optional(),
  quantity: zod.number().min(1),
  // 新增（optional）
  cvsStoreId: zod.string().optional(),
  cvsStoreName: zod.string().optional(),
  cvsStoreAddress: zod.string().optional(),
  cvsStorePhone: zod.string().nullable().optional(),
  storeSelectedBy: zod.enum(["customer", "admin", "system"]).optional(),
});
```

**方案 B：維持 parseCvsExtension 旁路，只補 OpenAPI spec 和 TypeScript 型別**

- 優點：不改 zod schema
- 缺點：仍然繞過驗證，技術債未清

**OpenAPI spec 需補 OrderInput CVS 欄位**：

```yaml
OrderInput:
  properties:
    # 現有欄位...
    # 新增
    cvsStoreId: { type: string }
    cvsStoreName: { type: string }
    cvsStoreAddress: { type: string }
    cvsStorePhone: { type: string, nullable: true }
    storeSelectedBy: { type: string, enum: [customer, admin, system] }
```

### 8.3 建議 POST payload（買家端送出）

```json
{
  "buyerName": "王小明",
  "buyerPhone": "0912345678",
  "pickupMethod": "7-11 取貨（先付款）",
  "quantity": 1,
  "specValues": { "顏色": "黑色" },
  "cvsStoreId": "284754",
  "cvsStoreName": "懷民門市",
  "cvsStoreAddress": "新北市板橋區民治街111號",
  "cvsStorePhone": "(02)22504664",
  "storeSelectedBy": "customer"
}
```

### 8.4 重要命名提醒

| 容易混淆的名詞             | 正確意義                                           |
| -------------------------- | -------------------------------------------------- |
| `publicToken`              | 訂單追蹤碼，不是門市編號                           |
| `storeCode` / `cvsStoreId` | 超商門市編號，不是 trackingCode                    |
| `cvsStorePhone`            | 超商門市電話，不是 `recipientPhone`（收件人電話）  |
| `cvsStoreAddress`          | 超商門市地址，不是 `recipientAddress`（收件地址）  |
| `shareToken`               | 商品分享連結 token，用於區分 localStorage CVS 暫存 |

### 8.5 public tracking 顯示 CVS 門市（待產品決策）

目前 `GET /orders/track/:publicToken` 不回傳 CVS 欄位，STRICTLY EXCLUDED。

若後續決策要顯示：

```json
// 追蹤 API 可選擇性補充
{
  "cvsStoreName": "懷民門市", // 建議：相對安全，公開門市資訊
  "cvsStoreAddress": "新北市板橋區...", // 待確認：門市地址對外顯示安全性
  "cvsStorePhone": "(02)22504664" // 待確認：門市電話是否顯示
}
```

> **建議**：`cvsStoreName` 相對安全（公開資料），`cvsStoreAddress` / `cvsStorePhone` 是門市公開資料但需確認顯示策略後再補。

---

## 9. UI / Component 規劃

> 本節只規劃，不實作。

### 9.1 現況元件

| 元件 / 檔案           | 現況                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `Cvs711Select.tsx`    | 完整選店頁（7-11 / 全家），支援 source=customer / admin                     |
| `PublicOrder.tsx`     | 已內嵌選店入口、確認卡 UI                                                   |
| `EditOrderDialog.tsx` | 後台已有內嵌 picker（inline 搜尋）                                          |
| `cvs711.ts`           | 工具函式庫（openCvsStoreMap / saveCvsStore / loadCvsStore / clearCvsStore） |

### 9.2 方案比較

#### 方案 A：維持現況（買家端使用 Cvs711Select.tsx 頁面跳轉）

**描述**：買家點選按鈕後跳轉至 `/cvs/711/select?source=customer&...`，選完後跳回 PublicOrder。

| 面向 | 說明                                                                     |
| ---- | ------------------------------------------------------------------------ |
| 優點 | 已完整實作；Cvs711Select.tsx 可搜尋、有結果列表、手機優先                |
| 優點 | 不需要抽元件，維護成本低                                                 |
| 優點 | 後台 admin 流程與買家端流程統一使用同一頁面                              |
| 缺點 | 頁面跳轉（全頁離開 PublicOrder → Cvs711Select → 回來），使用者體驗較中斷 |
| 缺點 | 手機上跳轉動畫可能影響感知                                               |
| 缺點 | localStorage 機制在少數瀏覽器（私密模式 / 限制 storage）可能失效         |
| 風險 | `useAuth` 在 public 頁是否會報錯（Cvs711Select 有 import useAuth）       |
| 建議 | **短期維持此方案**，先補型別缺口、免責聲明、測試後再評估是否抽元件       |

#### 方案 B：抽共用 `CvsStorePicker` component，內嵌於 PublicOrder.tsx

**描述**：將 Cvs711Select.tsx 的搜尋邏輯抽成 component，在 PublicOrder.tsx 內嵌顯示（不跳頁）。

| 面向 | 說明                                                      |
| ---- | --------------------------------------------------------- |
| 優點 | 不跳頁，使用者體驗流暢                                    |
| 優點 | 後台 EditOrderDialog 已走內嵌路線，可保持一致             |
| 優點 | 可移除 `useAuth` 依賴（buyer 端不需要）                   |
| 缺點 | 需要重構 Cvs711Select.tsx 或新增 CvsStorePicker component |
| 缺點 | 工期較長，需新增 component + 測試                         |
| 缺點 | 需確認 PublicOrder.tsx layout 空間                        |
| 風險 | 重構範圍大，可能引入回歸                                  |
| 建議 | 中期目標，待方案 A 穩定後評估                             |

#### 方案 C：重用 /cvs/711/select 頁面（維持現況，修補 useAuth 問題）

**描述**：維持方案 A 的頁面跳轉，但確認 Cvs711Select.tsx 在 public 頁（無 Clerk session）不會報錯。

| 面向 | 說明                                                       |
| ---- | ---------------------------------------------------------- |
| 優點 | 改動最小                                                   |
| 優點 | 已完整驗證 source=admin 流程；source=customer 流程只差驗收 |
| 缺點 | 使用者體驗仍是跳頁                                         |
| 缺點 | `useAuth` 潛在相容性風險未解決                             |
| 風險 | Clerk 在 public 頁（無 session）是否拋錯需確認             |
| 建議 | **現階段採用此方案 + 確認 useAuth 相容性**                 |

### 9.3 UI 需要補充的項目

1. **PublicOrder.tsx 成功頁**：補充已選門市資訊（下單成功後讓買家確認）
2. **PublicOrder.tsx 選店前提醒**：補充保守免責聲明
3. **Cvs711Select.tsx `useAuth` 相容性**：確認 public 頁（無 session）呼叫 getToken 行為

---

## 10. 個資與安全

| 項目                                    | 現況                                                                                        | 建議                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| 買家可看到自己選的門市                  | ✅ Cvs711Select.tsx 選完後顯示確認卡                                                        | —                                    |
| 買家下單成功後是否能確認門市            | ❌ 成功頁未顯示門市                                                                         | 補充成功頁門市摘要                   |
| public tracking 是否顯示門市            | ❌ 不顯示（STRICTLY EXCLUDED）                                                              | 維持保守，待產品決策                 |
| recipientPhone 是否暴露                 | ✅ 不暴露（STRICTLY EXCLUDED）                                                              | —                                    |
| recipientAddress 是否暴露               | ✅ 不暴露（STRICTLY EXCLUDED）                                                              | —                                    |
| internalNote / paymentNote / paidAmount | ✅ 不暴露（STRICTLY EXCLUDED）                                                              | —                                    |
| cvsStorePhone 是門市公開電話            | ✅ 是公開門市資料，但 public tracking 不回傳                                                | 待產品決策是否在追蹤頁顯示           |
| cvsStoreAddress 是門市公開地址          | ✅ 是公開資料，但 public tracking 不回傳                                                    | 同上                                 |
| 錯誤訊息是否洩漏 stack trace            | 需確認                                                                                      | 確保錯誤訊息只回傳 { error: string } |
| secrets / env / token                   | ✅ 不輸出                                                                                   | —                                    |
| emap import endpoint                    | ✅ 仍 disabled（403 early return）                                                          | —                                    |
| CVS 搜尋 API 回傳資料                   | ✅ 只回傳公開門市資料（storeName, storeAddress, storePhone, city, district, businessHours） | —                                    |
| storeSelectedBy 值                      | ✅ 買家端固定 "customer"                                                                    | 確認 API 不允許買家偽造 "admin"      |

> **注意**：`storeSelectedBy` 目前由 `parseCvsExtension` 從 req.body 讀取，買家理論上可以傳 `storeSelectedBy: "admin"` 偽造管理員選店。建議在 API 層強制覆寫為 "customer"（公開端點），不信任客端傳入值。

---

## 11. 測試計畫

> 以下測試計畫供後續 Step 6E-B / 6E-C 實作時執行，**本次 Step 6E-A 未執行**。

### 11.1 API 測試（整合測試）

| 測試項目                                                    | 測試方法                |
| ----------------------------------------------------------- | ----------------------- |
| `POST /p/:shareToken/orders` 帶 CVS snapshot → 訂單正確保存 | integration test        |
| `storeSelectedBy = 'customer'` 正確寫入 DB                  | integration test        |
| `storeSelectedAt` 在帶 CVS 欄位時設定                       | integration test        |
| `storeSelectedAt` 在不帶 CVS 欄位時為 null                  | integration test        |
| 超商方式未選門市是否阻擋（前端驗證，API 接受 null）         | integration test        |
| `GET /orders/track/:publicToken` 確認不回傳 CVS 欄位        | integration test        |
| CVS 搜尋 API 在 public 頁（無 auth）可存取                  | curl / integration test |
| 買家端無法偽造 storeSelectedBy='admin'                      | integration test        |

### 11.2 UI 測試（瀏覽器驗收）

| 測試項目                                                        | 測試方法 |
| --------------------------------------------------------------- | -------- |
| 手機版（375px）選 7-11 → 跳轉 → 搜尋 → 選定 → 返回 → 確認卡顯示 | 手動     |
| 手機版全家流程同上                                              | 手動     |
| 查無結果提示                                                    | 手動     |
| 搜尋失敗提示                                                    | 手動     |
| 未選門市直接送出 → 阻擋 + 錯誤訊息                              | 手動     |
| 選定門市後送出 → 成功頁顯示正確資訊                             | 手動     |
| 管理後台 EditOrderDialog 可看到買家選的門市                     | 手動     |
| localStorage 清除（下單成功後不殘留舊選擇）                     | 手動     |
| Cvs711Select.tsx 在 public 頁（無 Clerk session）不報錯         | 手動     |

### 11.3 回歸測試

| 測試項目                                | 測試方法                |
| --------------------------------------- | ----------------------- |
| Step 6D 後台 EditOrderDialog 選店器不壞 | 整合測試 104/104 + 手動 |
| Step 5 / Step 5F 功能不壞               | 整合測試                |
| emap endpoint 仍 disabled（401/403）    | 整合測試                |
| public tracking 不洩漏個資              | 整合測試                |
| 現有下單流程（宅配 / 面交）不壞         | 手動                    |

---

## 12. 分階段建議

| 階段          | 描述                                                                    | 狀態                      |
| ------------- | ----------------------------------------------------------------------- | ------------------------- |
| **Step 6E-A** | 規格與現況查核（本文件）                                                | ✅ 完成                   |
| **Step 6E-B** | 型別安全補強：`SubmitOrderBody` 補 CVS 欄位、OpenAPI spec 更新、codegen | ⬜ 建議下一步             |
| **Step 6E-C** | 買家端 UX 補強：成功頁顯示門市、免責聲明、`useAuth` 相容性確認          | ⬜ 建議與 6E-B 一起或之後 |
| **Step 6E-D** | 買家端 QA：瀏覽器 / 手機驗收、管理後台確認                              | ⬜ 待 6E-C 完成後         |
| **Step 6E-E** | Release checklist：人工補測、已知風險整理、文件收尾                     | ⬜ 最後                   |

### Step 6E-B 詳細建議

因為買家端選店功能的主體邏輯已實作，Step 6E-B 的工作較輕量：

1. 在 `SubmitOrderBody` zod schema 補 CVS 欄位（optional）
2. 在 `OrderInput` OpenAPI spec 補 CVS 欄位
3. 執行 codegen
4. 移除 `PublicOrder.tsx` 的 `const body: any = {}` 強型別繞過
5. 確認 `storeSelectedBy` 在 API 層強制為 "customer"（不信任客端）
6. 補充 integration tests

### Step 6E-C 詳細建議

1. `PublicOrder.tsx` 成功頁補充已選門市摘要
2. `PublicOrder.tsx` 選店前補充保守免責聲明
3. 確認 `Cvs711Select.tsx` 的 `useAuth` 在 public 頁（無 Clerk session）行為

---

## 13. 待確認問題

| #   | 問題                                                                                   | 重要性 | 決策者 |
| --- | -------------------------------------------------------------------------------------- | ------ | ------ |
| 1   | 買家端選店目前使用頁面跳轉（Cvs711Select.tsx），是否接受這個 UX？或需改為內嵌 picker？ | 高     | 產品   |
| 2   | 買家選超商取貨時，是否必填門市（目前阻擋）？還是允許先下單、門市稍後補？               | 高     | 產品   |
| 3   | 是否允許買家先下單、老闆後補門市？（影響驗證邏輯）                                     | 高     | 產品   |
| 4   | public tracking 是否顯示門市名稱（cvsStoreName）？                                     | 中     | 產品   |
| 5   | public tracking 是否顯示門市地址（cvsStoreAddress）？                                  | 中     | 產品   |
| 6   | public tracking 是否顯示門市電話（cvsStorePhone）？                                    | 中     | 產品   |
| 7   | 買家端是否允許手動輸入 storeCode / storeName fallback（目前無）？                      | 低     | 產品   |
| 8   | 是否要抽共用 `CvsStorePicker` component（供後台 + 買家端共用）？                       | 中     | 工程   |
| 9   | `Cvs711Select.tsx` 在 public 頁（無 Clerk session）的 `useAuth` 相容性是否已確認？     | 高     | 工程   |
| 10  | `storeSelectedBy` 是否要在公開端點 API 層強制為 "customer"（防偽造）？                 | 高     | 工程   |
| 11  | localStorage CVS 暫存是否需要加 TTL / 過期清除？                                       | 中     | 工程   |
| 12  | 門市資料更新頻率與合規性如何處理？目前 DB 靜態資料。                                   | 中     | 產品   |
| 13  | emap endpoint 何時恢復？需法務確認 emap.pcsc.com.tw 使用授權。                         | 低     | 法務   |
| 14  | Step 6D 人工瀏覽器補測何時完成？（Replit web / 本機）                                  | 高     | 工程   |
| 15  | 是否要先處理 `cvs.ts(163)` geoMatch possibly null 技術債？                             | 低     | 工程   |

---

## 附錄：現況查核指令

以下指令供後續驗證使用：

```bash
# 確認買家端已有 CVS 選店
grep -n "cvsStoreId\|storeSelectedBy\|needsCvsStore\|openCvsStoreMap" \
  artifacts/shop-app/src/pages/PublicOrder.tsx | head -20

# 確認 public API 接受 CVS 欄位
grep -n "parseCvsExtension\|hasCvs\|cvsStoreId" \
  artifacts/api-server/src/routes/public.ts | head -20

# 確認 public tracking 不回傳 CVS 欄位
grep -n "STRICTLY EXCLUDED\|cvsStore" \
  artifacts/api-server/src/routes/public.ts

# 確認 emap 仍停用
grep -n "DISABLED\|403\|import-from-emap" \
  artifacts/api-server/src/routes/cvs.ts | head -10

# 確認型別缺口
grep -n "SubmitOrderBody" lib/api-zod/src/generated/api.ts
```
