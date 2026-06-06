# Order Step 6E：買家端 CVS 選店 Release Checklist

> 文件日期：2026-06-06
> 適用步驟：Step 6E（Step 6E-A / 6E-B / 6E-C / 6E-D / 6E-D-Fix）

---

## 1. 目的

本文件用於收尾 Step 6E 買家端 CVS 選店功能。

**Step 6E 目標**：讓買家在下單流程中選擇 7-11 或全家門市，並將門市資料連同訂單一起送出及儲存。

本文件整理：
- Step 6E 各子步驟的完成狀態
- 已執行的自動化測試與 live curl 安全驗證結果
- 尚未完整執行的人工瀏覽器 / 手機 QA 項目
- CI / build 注意事項
- 已知風險與技術債
- 進下一階段前的前置條件建議

**特別聲明**：
- 本文件**不代表 emap 合規性已確認**（emap import endpoint 仍 disabled）
- 本文件**不代表完整人工瀏覽器 / 手機 QA 已完成**（環境限制，尚待人工驗收）
- 本文件**不承諾門市資料即時、完整、百分百準確**

---

## 2. 乾淨基準與分支狀態

### 推薦後續 Step 6E 基準

| Commit | 說明 |
|--------|------|
| `aac79ba` | Step 6E-B：API / Type / Security 補強 |
| `f1bfd49` | Step 6E-C：UX 小補強（TTL / 成功頁摘要）|
| `fix/step6e-live-server-security-validation` | Step 6E-D-Fix：live security 驗證後的乾淨分支 |

### 乾淨基準不含以下 Step 7B commits

| Commit | 說明 |
|--------|------|
| `ec3b3bd` | Step 7B API（禁止混入 Step 6E） |
| `47a6f81` | Step 7B UI（禁止混入 Step 6E） |

### 注意事項

- 不要從含 Step 7B 的分支繼續 Step 6E。
- 若需繼續 Step 6E 工作，請從 `f1bfd49` 或 Step 6E-D-Fix 驗證後的乾淨分支建立新分支。

---

## 3. Step 6E 已完成項目

### Step 6E-A：現況查核（docs only）

- [x] 買家端 CVS 選店現況查核完成
- [x] `PublicOrder.tsx` / `Cvs711Select.tsx` 現況確認
- [x] Step 6E 風險與待確認整理
- [x] 新增 `docs/order-step6e-buyer-cvs-store-selection-spec.md`

### Step 6E-B：API / Type / Security 補強

- [x] `OrderInput` 補 CVS 欄位（`cvsStoreId` / `cvsStoreName` / `cvsStoreAddress` / `cvsStorePhone`）
- [x] `SubmitOrderBody` 正式支援 CVS 欄位（via orval 重新產生）
- [x] `parseCvsExtension()` 已完全移除
- [x] public submit order API 從 zod `parsed.data` 讀 CVS 欄位（不信任 client）
- [x] `storeSelectedBy` 在公開端點永遠強制為 `"customer"`
- [x] `storeSelectedAt` 由 server 設定
- [x] `PublicOrder.tsx` 不再送 `storeSelectedBy`
- [x] `public.route.test.mjs` 20/20 pass（含 storeSelectedBy 偽造防護）
- [x] `orders.route.test.mjs` 118/118 pass
- [x] `cvs.route.test.mjs` 4/4 pass

### Step 6E-C：買家端 UX 小補強

- [x] localStorage TTL 24 小時（`CVS_STORE_TTL_MS`）
- [x] `loadCvsStore` 過期自動清除 + `removeItem`
- [x] 舊格式相容（只有 `savedAt` 的舊資料，回退計算 savedAt + 24h）
- [x] 成功頁顯示「已選門市」摘要（storeName / storeAddress / storePhone）
- [x] 成功送出後 `clearCvsStore` 清除暫存
- [x] 門市資料保守提醒文字：「門市資料可能因超商更新而異動，實際資訊以超商公告為準。」
- [x] `Cvs711Select.tsx` useAuth 相容性查核：`getToken()` 只在 admin 分支呼叫，public flow 不受影響

### Step 6E-D-Fix：live server 重建與安全驗證

- [x] `npx tsc --build lib/api-zod/tsconfig.json`（重建 `lib/api-zod/dist/*.d.ts`）
- [x] `pnpm --filter api-server build`（以 Step 6E-B source 重建 `dist/index.mjs`）
- [x] `parseCvsExtension` 出現次數 = 0（靜態驗證）
- [x] stale process（PID 74142，16:51 UTC，早於 dist rebuild 17:21:29 UTC）已清除
- [x] live server（PID 101013，17:22 UTC，在 dist rebuild 之後）確認載入正確安全版本
- [x] live curl `storeSelectedBy='admin'` → 實際儲存 `'customer'`（ORDER ID 686）
- [x] live curl `storeSelectedBy='staff'` → 實際儲存 `'customer'`
- [x] live curl 無 CVS → `storeSelectedBy=null`
- [x] live curl CVS 訂單 → `storeSelectedAt` 有 ISO timestamp

---

## 4. 已執行測試與結果

| 測試項目 | 結果 | 執行於 | 備註 |
|----------|------|--------|------|
| `public.route.test.mjs` | **20/20 pass** ✅ | Step 6E-B / C / D-Fix | 含 storeSelectedBy 偽造防護 |
| `orders.route.test.mjs` | **118/118 pass** ✅ | Step 6E-B | 訂單 CRUD 全覆蓋 |
| `cvs.route.test.mjs` | **4/4 pass** ✅ | Step 6E-B / D-Fix | emap disabled 確認 |
| shop-app typecheck | **pass** ✅ | Step 6E-B / C / D-Fix | — |
| api-server typecheck | **只剩 pre-existing `cvs.ts(163)`** ✅ | Step 6E-D-Fix | 非本次引入 |
| live curl `storeSelectedBy='admin'` | **admin → customer** ✅ | Step 6E-D-Fix | ORDER ID 686 |
| live curl `storeSelectedBy='staff'` | **staff → customer** ✅ | Step 6E-D-Fix | — |
| live curl 無 CVS | **`storeSelectedBy=null`** ✅ | Step 6E-D-Fix | — |
| live curl storeSelectedAt | **有 ISO timestamp** ✅ | Step 6E-D-Fix | — |
| 7-11 CVS 搜尋（懷民） | **1 筆回傳** ✅ | Step 6E-D | — |
| 全家 CVS 搜尋（板橋） | **3 筆回傳** ✅ | Step 6E-D | — |
| public tracking privacy | **未洩漏個資** ✅ | Step 6E-D 靜態 | 靜態確認 |
| emap import endpoint | **403 disabled** ✅ | Step 6E-D | 靜態 + 測試 |
| 靜態確認：parseCvsExtension 不在 source | **0 次** ✅ | Step 6E-D-Fix | — |
| 靜態確認：PublicOrder.tsx 不送 storeSelectedBy | ✅ | Step 6E-D | — |
| 靜態確認：localStorage expiresAt 寫入 + 過期清除 | ✅ | Step 6E-D | — |
| 靜態確認：submittedCvsStore 成功頁 + clearCvsStore | ✅ | Step 6E-D | — |

---

## 5. Live Security Validation

### 背景問題

Step 6E-D QA 發現：live API server 是 Step 6E-B 安全修正**前**啟動的 stale process，導致 `storeSelectedBy` 可被 client 偽造成 `"admin"`。

### 已處理

| 步驟 | 說明 |
|------|------|
| `npx tsc --build lib/api-zod/tsconfig.json` | 重建 `lib/api-zod/dist/*.d.ts`，含 CVS 欄位 |
| `pnpm --filter api-server build` | 以 Step 6E-B source 重建 `dist/index.mjs` |
| 清除 stale process（PID 74142） | 16:51 UTC 啟動，早於 dist rebuild 17:21:29 UTC |
| 驗證 PID 101013 | 17:22 UTC 啟動，在 dist rebuild 之後，載入正確安全版本 |

### 驗證結果

| 偽造測試 | Client 送入 | Server 實際儲存 | 結果 |
|----------|------------|----------------|------|
| 偽造 admin | `storeSelectedBy: "admin"` | `"customer"` | ✅ PASS |
| 偽造 staff | `storeSelectedBy: "staff"` | `"customer"` | ✅ PASS |
| 無 CVS | 無 cvsStoreId | `null` | ✅ PASS |
| storeSelectedAt | CVS 訂單 | `"2026-06-06T17:27:49.228Z"` | ✅ PASS |

### 後續注意

> **重要**：若後續部署 / server restart 流程異常，需重新驗證 live server 是否使用最新 build。`dist/index.mjs` 是編譯產物，不被 git 追蹤，每次 source 修改後必須重新 build 並重啟 server。

---

## 6. CI / Build 注意事項

### orval 重新產生後必須執行

```bash
npx tsc --build lib/api-zod/tsconfig.json
```

**原因**：`api-server` 使用 TypeScript project reference，讀取 `lib/api-zod/dist/*.d.ts`。若 orval 重新產生 `lib/api-zod/src/generated/api.ts` 後未執行此步驟，TypeScript 編譯器仍讀舊 `.d.ts`，導致如 `Property 'cvsStoreId' does not exist on type ...` 的錯誤。

**建議**：CI pipeline 在 `pnpm orval`（或任何 orval 指令）之後，自動加入此 build 步驟。

### api-server dist 與 live server 重啟

- `api-server` 的 `dist/index.mjs` 是編譯產物，**不被 git 追蹤**。
- source 修改後必須執行 `pnpm --filter api-server build` 重新編譯。
- 編譯後需重啟 live server，否則 stale process 會繼續跑舊程式碼。

### 目前 Replit live API server 設定

| 項目 | 值 |
|------|----|
| PORT | 8080 |
| 綁定介面 | IPv6 `::1`（即 `http://[::1]:8080`） |
| curl 測試目標 | `http://[::1]:8080/api/...` |

> **注意**：勿以舊的 `localhost:3001` 為 curl 測試目標，目前 port 3001 無 api-server 監聽。

---

## 7. 未完成 / 需人工補測項目

以下項目在 Claude A 的 headless 環境中無法完整驗證（shop-app browser flow 不可操作），**標記為未完成，不可寫成已通過**：

- [ ] 真瀏覽器開啟買家下單頁 `/p/:shareToken`
- [ ] 真瀏覽器選擇「7-11 取貨（先付款）」
- [ ] 真瀏覽器確認 CVS 選店入口出現
- [ ] 真瀏覽器進入 `/cvs/711/select?provider=seven&source=customer`
- [ ] 真瀏覽器搜尋「懷民」並確認有 1 筆結果
- [ ] 真瀏覽器選擇懷民門市後返回下單頁
- [ ] 真瀏覽器確認下單頁顯示已選門市名稱、地址
- [ ] 真瀏覽器 DevTools 確認 localStorage 含 `cvs711_store_<shareToken>`（含 `savedAt` / `expiresAt`）
- [ ] 真瀏覽器送出訂單並確認成功頁顯示「已選門市」區塊
- [ ] 真瀏覽器確認成功頁有保守提醒文字
- [ ] 真瀏覽器確認成功後 localStorage key 已清除
- [ ] 真瀏覽器測全家：選「全家取貨（先付款）」→ 搜尋「板橋」→ 選店 → 送出
- [ ] 真瀏覽器測未選門市阻擋：應顯示「請先選擇 7-11 門市」或「全家門市」錯誤
- [ ] 真瀏覽器測查無結果：搜尋 `ZZZNORESULTXXX999`
- [ ] 真瀏覽器測過期 localStorage：手動修改 `expiresAt` 為過去時間，重新載入應清除暫存並要求重選
- [ ] 手機寬度 375px 視覺確認（結果列表可滾動、選擇按鈕可點、下單頁不爆版）
- [ ] 後台 Orders 人工確認 `cvsStoreId` / `cvsStoreName` / `storeSelectedBy=customer` / `storeSelectedAt` 有值
- [ ] public tracking 人工確認不顯示 CVS 欄位、不洩漏個資
- [ ] emap import endpoint 人工確認回傳 403

---

## 8. 人工瀏覽器 / 手機 QA Checklist

請在 Replit web 或本機環境完成以下項目：

1. **開啟買家下單頁**：前往 `/p/:shareToken`（使用測試商品的 share token）
2. **選擇 7-11 取貨**：選「7-11 取貨（先付款）」
3. **確認 CVS 選店入口出現**：下單頁應顯示選店按鈕或入口
4. **進入選店頁**：點選，進入 `/cvs/711/select?provider=seven&source=customer`
5. **搜尋 7-11 懷民**：輸入「懷民」，確認搜尋結果有 1 筆
6. **選擇懷民門市**：點選，確認跳回下單頁
7. **確認已選門市顯示**：下單頁應顯示「懷民門市」名稱、地址
8. **確認 localStorage**：DevTools → Application → LocalStorage，確認有 `cvs711_store_<shareToken>`，含 `savedAt` 與 `expiresAt`（約 24h 後）
9. **送出訂單**：填好必填欄位後送出
10. **確認成功頁「已選門市」區塊**：應顯示門市名稱、地址，以及保守提醒文字
11. **確認 localStorage 清除**：成功後 `cvs711_store_<shareToken>` 應從 localStorage 移除
12. **測全家流程**：選「全家取貨（先付款）」→ 搜尋「板橋」→ 選店 → 回下單頁 → 送出
13. **測未選門市阻擋**：不選門市直接送出，應顯示錯誤提示
14. **測查無結果**：搜尋 `ZZZNORESULTXXX999`，應顯示查無結果
15. **測過期 localStorage**：手動將 `expiresAt` 改為過去時間，重新載入頁面，應清除暫存並要求重選
16. **手機寬度 375px**：DevTools 切換手機視角，確認結果列表可滾動、選擇按鈕可點、下單頁不爆版
17. **後台確認選店資料**：到後台 Orders，找到剛建立的訂單，確認 `cvsStoreId` / `cvsStoreName` / `cvsStoreAddress` / `cvsStorePhone` / `storeSelectedBy=customer` / `storeSelectedAt` 均有值
18. **public tracking 隱私確認**：前往 `/track/:publicToken`，確認不顯示 `recipientPhone` / `recipientAddress` / `internalNote` / `paymentNote` / `paidAmount` / CVS 個資欄位
19. **CVS 顯示策略確認**：public tracking 目前不顯示 CVS 門市資料，確認維持現狀
20. **emap 確認仍 disabled**：`POST /api/cvs/711/import-from-emap` 應回傳 403

---

## 9. 已知風險與待確認

| # | 風險 / 待確認 | 影響 | 建議處理 |
|---|--------------|------|----------|
| 1 | 人工瀏覽器 / 手機 QA 尚未完成 | 買家端實際使用體驗未驗收 | 優先在 Replit web 或本機執行 Section 8 checklist |
| 2 | CI 尚未確認加入 `api-zod dist build` | orval 後 TypeScript 可能讀舊型別 | 在 CI pipeline 的 orval 後加入 `npx tsc --build lib/api-zod/tsconfig.json` |
| 3 | api-server PORT=8080 / IPv6 `::1` | 舊的 `localhost:3001` curl 測試目標無效 | 更新開發文件 / CI script 使用 `[::1]:8080` |
| 4 | `shippingFeeOverride` 仍在 zod 外讀取 | 不在 zod schema 內，無型別驗證 | 後續另立 task 補強，或納入 zod schema |
| 5 | `cvs.ts(163,15)`: `'geoMatch' is possibly 'null'` | 既有 TypeScript 錯誤，非本次引入 | 後續另立 task 修復 |
| 6 | public tracking 是否顯示 CVS 門市資料 | 目前不顯示，待產品決策 | 不要在未確認前擅自顯示 |
| 7 | emap 合規性未確認，endpoint 仍 disabled | 任何人仍無法觸發 emap import | 不要恢復 endpoint，直到合規與授權確認 |
| 8 | localStorage TTL 沒有前端單元測試 | 過期清除邏輯僅靜態確認 | 後續若導入前端測試框架可補 |

---

## 10. Step 6E Release 判斷

### 可收尾項目

| 面向 | 狀態 |
|------|------|
| API / Type / Security | ✅ 可收尾（自動測試 + live curl 均通過） |
| UX small polish | ✅ 可收尾（程式碼靜態確認） |
| Live security validation | ✅ 可收尾（stale process 清除，偽造測試通過） |
| emap import | ✅ 維持 disabled |

### 尚待完成

| 面向 | 狀態 |
|------|------|
| 瀏覽器 / 手機人工 QA | ⬜ 未完成，需人工補測 |
| CI pipeline api-zod dist build | ⬜ 尚未確認加入 |
| public tracking CVS 顯示策略 | ⬜ 待產品決策 |

### 整體判斷

本次 Step 6E 已完成 API / Type / Security / UX polish 的 MVP 基礎，自動化測試全數通過，live security validation 確認。

**完整 release 前仍建議先完成人工瀏覽器 / 手機 QA**（Section 8 checklist），確認買家端實際操作流程無問題。

> 本文件不代表 production ready。不代表完整人工 QA 已完成。

---

## 11. 下一步建議

1. **優先：人工瀏覽器 / 手機 QA**
   在 Replit web 或本機環境完成 Section 8 的 20 項 checklist，確認買家端 CVS 選店完整流程可用。

2. **CI 補強：api-zod dist build**
   在 CI pipeline 的 `pnpm orval`（或任何 orval 指令）後加入：
   ```bash
   npx tsc --build lib/api-zod/tsconfig.json
   ```

3. **人工 QA 通過後：Step 6E MVP 收尾**
   若 Section 8 checklist 全數通過，可將 Step 6E 視為 MVP 收尾，準備進入下一階段。

4. **後續規劃：public tracking 是否顯示 CVS 門市資料**
   目前 public tracking 不顯示 CVS 欄位，是否開放顯示需產品討論與決策。

5. **後續規劃：`shippingFeeOverride` zod 補強**
   目前 `shippingFeeOverride` 在 zod 外讀取，後續可評估納入 zod schema。

6. **後續規劃：`cvs.ts(163)` 技術債**
   `'geoMatch' is possibly 'null'` 非本次引入，後續可另立 task 修復。

7. **emap import：維持 disabled**
   不要恢復 `POST /api/cvs/711/import-from-emap`，直到法務合規與 API 授權確認。
