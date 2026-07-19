# Order Step 6F：超商選店 QA 報告

> 文件日期：2026-06-07（人工瀏覽器 / 手機 QA 補測完成）
> Branch：`qa/step6f-cvs-store-selection-browser-mobile`
> Base commit：`7cf0b92`（Step 6E Release Checklist）

---

## 1. QA 目的

驗證 Step 6 超商門市選擇（後台與買家端）的功能正確性、安全性、資料保存與隱私保護。

本次 QA 分兩階段：

**Phase 1（2026-06-06）**：在 Replit headless 環境執行，包含：

- 自動化測試（route tests / typecheck）
- API 端對端 curl 測試
- 原始碼靜態確認
- Live server 安全驗證

**Phase 2（2026-06-07）**：人工瀏覽器 / 手機互動補測，包含：

- 真瀏覽器買家端 7-11 / 全家選店完整流程
- 375 × 812 手機版視覺確認
- 後台 Orders CVS 門市資料顯示確認
- 桌機寬度取貨方式卡片回歸

---

## 2. 測試環境

| 項目         | 說明                                            |
| ------------ | ----------------------------------------------- |
| 環境         | Replit headless server                          |
| OS           | Linux 6.17.5                                    |
| Node.js      | 24.13.0                                         |
| Branch       | `qa/step6f-cvs-store-selection-browser-mobile`  |
| Base         | `7cf0b92`（Step 6E Release Checklist）          |
| API server   | `http://[::1]:8080`（PORT=8080，IPv6 loopback） |
| Shop-app     | `http://localhost:80`（Vite dev server）        |
| API proxy    | `/api/*` → api-server（Vite 代理）              |
| 手機 QA 工具 | Chrome DevTools 375 × 812（模擬）               |

---

## 3. 分支 / Commit 狀態

| Commit                              | 分支內？         |
| ----------------------------------- | ---------------- |
| `7cf0b92` Step 6E Release Checklist | IN branch ✅     |
| `f1bfd49` Step 6E-C UX polish       | IN branch ✅     |
| `aac79ba` Step 6E-B security        | IN branch ✅     |
| `ec3b3bd` Step 7B API               | NOT in branch ✅ |
| `47a6f81` Step 7B UI                | NOT in branch ✅ |

---

## 4. Dist / Server 狀態

| 項目                         | 狀態                                                    |
| ---------------------------- | ------------------------------------------------------- |
| dist 重建                    | ✅ `pnpm --filter api-server build`（本次 QA 執行）     |
| `parseCvsExtension` 出現次數 | **0** ✅                                                |
| stale process 清除           | ✅ PID 109193（17:36 UTC，早於本次 dist rebuild）已殺除 |
| 新 process（PID 118882）     | ✅ PORT=8080，在重建後啟動                              |
| api-zod dist                 | ✅ `lib/api-zod/dist/` 含 CVS 欄位                      |

> **注意**：Replit 啟動腳本在 session 啟動時，從舊分支（`docs/order-step6b-cvs-existing-implementation-audit`，仍含 `parseCvsExtension`）build dist。本次 QA 開始時，dist 已是過時版本，已手動重建。這是 Replit 啟動腳本與 git 分支不同步的問題，CI 環境不受影響。

---

## 5. 後台 Orders 選店 QA

| 項目                                                                      | 方式                       | 結果                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| EditOrderDialog CVS 選店器存在                                            | 靜態確認（原始碼）         | ✅                                                                                                                                              |
| storeCode / storeName 自動填入                                            | 靜態確認                   | ✅                                                                                                                                              |
| 已選門市卡片顯示地址 / 電話                                               | 靜態確認                   | ✅（lines 565–570）                                                                                                                             |
| 儲存後資料持久化（cvsStoreId/cvsStoreName/cvsStoreAddress/cvsStorePhone） | curl API 確認              | ✅                                                                                                                                              |
| 只改 paymentStatus → storeSelectedAt 不變                                 | orders.route.test 確認     | ✅（104/104）                                                                                                                                   |
| 只改 shippingStatus/trackingCode → storeSelectedAt 不變                   | orders.route.test 確認     | ✅                                                                                                                                              |
| 改新門市 → storeSelectedAt 更新                                           | orders.route.test 確認     | ✅（dirty tracking）                                                                                                                            |
| Step 5 付款 / 物流欄位顯示正常                                            | 靜態確認                   | ✅（不影響）                                                                                                                                    |
| **後台 Orders 頁顯示 7-11 門市資料（訂單 #739）**                         | **人工確認（2026-06-07）** | ✅ 門市名稱：7-11 懷民門市、地址：新北市板橋區民治街111號、門市編號：284754、電話：(02)22504664、選擇來源：客人選擇、選擇時間：2026/06/07 14:41 |
| **後台 Orders 頁顯示全家門市資料**                                        | **人工確認（2026-06-07）** | ✅ 全家板橋新翠店門市名稱、地址、門市編號、電話、選擇來源、選擇時間均顯示正常                                                                   |
| **真瀏覽器操作 EditOrderDialog**                                          | **未執行**                 | ⬜ 本輪人工 QA 未確認                                                                                                                           |
| **手機寬度 EditOrderDialog 不爆版**                                       | **未執行**                 | ⬜ 本輪人工 QA 未確認                                                                                                                           |

---

## 6. 買家端 PublicOrder 選店 QA

### API 端對端驗證（curl）

| 測試                          | 輸入                                               | 結果                                 |
| ----------------------------- | -------------------------------------------------- | ------------------------------------ |
| 7-11 CVS 訂單建立             | cvsStoreId=284754, storeName=懷民門市              | ✅ 正確儲存                          |
| 全家 CVS 訂單建立             | cvsStoreId=family-015125, storeName=全家板橋中勝店 | ✅ 正確儲存                          |
| storeSelectedBy 偽造（admin） | `storeSelectedBy: "admin"`                         | ✅ 儲存為 `"customer"`               |
| storeSelectedBy 偽造（staff） | `storeSelectedBy: "staff"`                         | ✅ 儲存為 `"customer"`               |
| 無 CVS 訂單                   | 黑貓宅急便，無 cvsStoreId                          | ✅ `storeSelectedBy: null`           |
| storeSelectedAt 設定          | CVS 訂單                                           | ✅ 有 ISO timestamp                  |
| 查無結果                      | q=ZZZNORESULTXXX999                                | ✅ `{"stores":[]}`                   |
| 7-11 懷民搜尋                 | q=懷民                                             | ✅ 1 筆（懷民門市，板橋民治街111號） |
| 全家板橋搜尋                  | q=板橋                                             | ✅ 3 筆（中勝、互維、亞東一店）      |

### 原始碼靜態確認

| 項目                                         | 確認                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| 未選門市阻擋邏輯（L218-220）                 | ✅ `請先選擇 7-11 門市` / `請先選擇全家門市`                  |
| localStorage TTL 24h（`expiresAt`）          | ✅ `CVS_STORE_TTL_MS = 24 * 60 * 60 * 1000`                   |
| 成功頁「已選門市」摘要                       | ✅ `submittedCvsStore` state                                  |
| 成功頁保守提醒文字                           | ✅ 「門市資料可能因超商更新而異動，實際資訊以超商公告為準。」 |
| submit 後 `clearCvsStore`                    | ✅ L257                                                       |
| `storeSelectedBy` 不從 client 讀取（已移除） | ✅ source 無 `parseCvsExtension`                              |
| `PublicOrder.tsx` 不送 `storeSelectedBy`     | ✅ submit body 無此欄位                                       |

### 人工瀏覽器補測（2026-06-07）

| 項目                                               | 結果                           |
| -------------------------------------------------- | ------------------------------ |
| 真瀏覽器開啟買家下單頁                             | ✅                             |
| 選擇 7-11 取貨（先付款）                           | ✅ 卡片 selected 狀態正常      |
| 進入 CVS 選店頁（7-11）                            | ✅ 跳轉正常                    |
| 搜尋「懷民」，確認 1 筆結果                        | ✅                             |
| 選擇「7-11 懷民門市」，確認跳回下單頁              | ✅                             |
| 取貨方式維持 selected 狀態（回下單頁後）           | ✅                             |
| 已選門市卡片顯示清楚（名稱、地址、門市編號、電話） | ✅                             |
| 先填姓名電話，再選門市，回來後姓名電話保留         | ✅ sessionStorage 草稿保留正常 |
| 成功送出訂單                                       | ✅                             |
| 成功頁顯示 7-11 門市摘要                           | ✅                             |
| 成功後 sessionStorage 草稿清除                     | ✅                             |
| 選擇全家取貨方式                                   | ✅                             |
| 選擇「全家板橋新翠店」                             | ✅                             |
| 成功頁顯示全家門市摘要                             | ✅                             |
| DevTools localStorage 確認 savedAt / expiresAt     | ⬜ 本輪未確認                  |
| expiresAt 約 24h 後驗證                            | ⬜ 本輪未確認                  |
| 成功後 localStorage 清除確認                       | ⬜ 本輪未確認                  |
| 真瀏覽器測未選門市阻擋                             | ⬜ 本輪未確認                  |
| 真瀏覽器測過期 localStorage                        | ⬜ 本輪未確認                  |

---

## 7. 手機寬度 QA 結果

> 測試工具：Chrome DevTools 375 × 812（2026-06-07）

| 項目                                                                | 狀態                      |
| ------------------------------------------------------------------- | ------------------------- |
| 買家下單頁不爆版                                                    | ✅ 確認                   |
| 取貨方式卡片兩行排版（行一：radio＋logo＋費用，行二：取貨方式文字） | ✅ 文字可讀，不再擠成多行 |
| 7-11 / 全家 / 黑貓 / 郵局 / 面交卡片文字可讀                        | ✅ 各卡片文字顯示正常     |
| 費用顯示清楚                                                        | ✅                        |
| selected 狀態正常（radio / 外框 / 背景）                            | ✅                        |
| 已選門市卡片正常                                                    | ✅                        |
| 選店頁 375px 搜尋框、結果卡片、選擇按鈕可用                         | ✅                        |
| 結果列表可滾動                                                      | ✅（由選店頁可用確認）    |
| 桌機寬度取貨方式卡片橫向排版回歸（sm: 以上）                        | ✅ 未被 polish 改壞       |
| 成功頁 375px 不爆版                                                 | ⬜ 本輪未明確確認         |
| EditOrderDialog 375px 不爆版                                        | ⬜ 本輪未確認             |

---

## 8. 安全 / Privacy / emap 回歸

| 項目                                    | 測試方式           | 結果                               |
| --------------------------------------- | ------------------ | ---------------------------------- |
| storeSelectedBy='admin' → customer      | live curl          | ✅ PASS                            |
| storeSelectedBy='staff' → customer      | live curl          | ✅ PASS                            |
| 無 CVS → storeSelectedBy=null           | live curl          | ✅ PASS                            |
| public tracking 不洩漏 recipientPhone   | curl + field check | ✅ absent                          |
| public tracking 不洩漏 recipientAddress | curl + field check | ✅ absent                          |
| public tracking 不洩漏 internalNote     | curl + field check | ✅ absent                          |
| public tracking 不洩漏 paymentNote      | curl + field check | ✅ absent                          |
| public tracking 不洩漏 paidAmount       | curl + field check | ✅ absent                          |
| public tracking 不洩漏 buyerPhone       | curl + field check | ✅ absent                          |
| public tracking 不洩漏 cvsStoreId       | curl + field check | ✅ absent                          |
| public tracking CVS 顯示策略維持現狀    | curl 確認          | ✅ 不顯示 CVS 欄位                 |
| emap 未登入                             | curl → 401         | ✅ `{"error":"Unauthorized"}`      |
| emap 測試中 disabled                    | cvs.route.test 4/4 | ✅ 403 DISABLED                    |
| 不呼叫真實 emap                         | 程式碼確認         | ✅ early return 403                |
| DB schema 未修改                        | git diff 確認      | ✅                                 |
| Step 7B 未混入                          | git log 確認       | ✅ ec3b3bd / 47a6f81 NOT in branch |

---

## 9. 自動化測試結果

| 測試套件                | 結果                     | 備註                                                        |
| ----------------------- | ------------------------ | ----------------------------------------------------------- |
| `public.route.test.mjs` | **20/20 pass** ✅        | 含 storeSelectedBy 安全驗證                                 |
| `orders.route.test.mjs` | **104/104 pass** ✅      | 含 storeSelectedAt dirty tracking                           |
| `cvs.route.test.mjs`    | **4/4 pass** ✅          | emap disabled 確認                                          |
| shop-app typecheck      | **pass** ✅              | —                                                           |
| api-server typecheck    | **pre-existing 錯誤** ⚠️ | `cvs.ts(163,15): 'geoMatch' is possibly 'null'`，非本次引入 |

---

## 10. 已修小 Bug

| Bug                              | 說明                                                         | 處理方式                                                                                                    |
| -------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| dist stale                       | Replit 啟動腳本從舊分支 build，dist 仍含 `parseCvsExtension` | 手動執行 `pnpm --filter api-server build` 重建                                                              |
| 後台 Orders 門市電話未顯示       | UI 缺口：Orders.tsx CVS 門市卡片沒有 cvsStorePhone 顯示      | 補加 conditional render 於 7-11 / 全家門市卡片（`{o.cvsStorePhone && <div>電話：{o.cvsStorePhone}</div>}`） |
| 買家端取貨方式卡片手機版文字擠壓 | 375px 下 logo＋label＋fee 同行，文字被擠成多行               | 改成兩行排版（手機 `flex-col`，桌機 `sm:flex-row`）                                                         |

> 後兩項 bug fix 均已補在 unstaged changes，未 commit。

---

## 11. 未完成項目

以下項目於本輪人工 QA 尚未確認：

### 後台 Orders QA（部分已完成）

- [x] 真瀏覽器開啟後台 Orders 頁 ✅（2026-06-07）
- [x] 後台 Orders CVS 門市資料顯示正確 ✅（7-11 懷民門市、全家板橋新翠店）
- [ ] 真瀏覽器打開 EditOrderDialog（尚未人工確認）
- [ ] 真瀏覽器在 CVS 選店器搜尋「懷民」（尚未人工確認）
- [ ] 真瀏覽器選擇門市，確認 storeCode / storeName 填入（尚未人工確認）
- [ ] 真瀏覽器確認已選門市卡片顯示地址 / 電話（尚未人工確認）
- [ ] 真瀏覽器儲存後重新打開，確認欄位持久化（尚未人工確認）
- [ ] 真瀏覽器只改 paymentStatus，確認 storeSelectedAt 不變（尚未人工確認）
- [ ] 真瀏覽器只改 trackingCode，確認 storeSelectedAt 不變（尚未人工確認）
- [ ] 真瀏覽器改新門市，確認 storeSelectedAt 更新（尚未人工確認）
- [ ] 真瀏覽器切換全家，搜尋「板橋」並選店（尚未人工確認）
- [ ] 真瀏覽器確認 Step 5 欄位正常（尚未人工確認）
- [ ] 手機 375px EditOrderDialog 不爆版（尚未人工確認）

### 買家端 PublicOrder QA（部分已完成）

- [x] 真瀏覽器開啟 `/p/:shareToken` ✅（2026-06-07）
- [x] 真瀏覽器選 7-11 取貨 ✅
- [x] 真瀏覽器進入 CVS 選店頁 ✅
- [x] 真瀏覽器搜尋「懷民」，確認 1 筆結果 ✅
- [x] 真瀏覽器選擇懷民門市，確認跳回下單頁 ✅
- [x] 真瀏覽器確認已選門市卡片顯示 ✅
- [x] 先填姓名電話，再選門市，回來後姓名電話保留 ✅（sessionStorage 草稿保留）
- [x] 真瀏覽器送出訂單 ✅
- [x] 真瀏覽器成功頁顯示「已選門市」 ✅
- [x] 真瀏覽器成功後 sessionStorage 草稿清除 ✅
- [x] 真瀏覽器測全家板橋下單流程 ✅（全家板橋新翠店）
- [ ] 真瀏覽器 DevTools localStorage 含 savedAt / expiresAt（約 24h 後）
- [ ] 真瀏覽器成功後 localStorage 清除確認
- [ ] 真瀏覽器測未選門市阻擋
- [ ] 真瀏覽器測過期 localStorage（手動改 expiresAt）
- [ ] 手機 375px 成功頁視覺確認

---

## 12. Step 6F QA 收尾狀態

**整體狀態：accepted with known risks**

| 面向                         | 狀態        | 說明                                            |
| ---------------------------- | ----------- | ----------------------------------------------- |
| 自動化測試                   | ✅ 通過     | 128/128 pass（route tests）                     |
| API 安全性                   | ✅ 通過     | storeSelectedBy 偽造防護、emap disabled         |
| 買家端 CVS 選店（7-11）      | ✅ 人工確認 | 完整流程通過（2026-06-07）                      |
| 買家端 CVS 選店（全家）      | ✅ 人工確認 | 全家板橋新翠店流程通過（2026-06-07）            |
| 後台 Orders CVS 顯示         | ✅ 人工確認 | 7-11 / 全家門市資料含電話顯示正常（2026-06-07） |
| 手機 375px 取貨方式卡片      | ✅ 人工確認 | 兩行排版，文字清楚（2026-06-07）                |
| 桌機取貨方式卡片回歸         | ✅ 人工確認 | sm: 橫向排版正常（2026-06-07）                  |
| EditOrderDialog 真瀏覽器操作 | ⬜ 未確認   | 本輪未執行；資料層已自動化驗證                  |
| EditOrderDialog 手機版       | ⬜ 未確認   | 本輪未執行                                      |
| localStorage TTL 過期測試    | ⬜ 未確認   | 本輪未執行；TTL 邏輯已靜態確認                  |
| 成功頁 375px                 | ⬜ 未確認   | 本輪未明確確認                                  |

> 核心買家端 CVS 選店流程（7-11 / 全家）、後台 Orders 門市資料顯示（含電話）、375px 手機版排版均已人工確認通過。
> EditOrderDialog 真瀏覽器操作與 localStorage TTL 過期測試尚未執行，列為已知風險，不阻塞收尾。
> emap import endpoint 仍 disabled，public tracking 不顯示 CVS 欄位（現行策略維持，隱私優先）。
> 不宣稱 production ready。

---

## 13. Blocked / Known Risks

| 項目                               | 說明                                                       | 影響                                                   |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| ⬜ EditOrderDialog 真瀏覽器操作    | 本輪人工 QA 未確認                                         | 低影響；資料層已自動化驗證，後續補測                   |
| ⬜ localStorage TTL 過期測試       | 本輪未執行                                                 | 低影響；24h TTL 邏輯已靜態確認                         |
| ⬜ 成功頁 375px 視覺確認           | 本輪未明確確認                                             | 低影響；買家端下單流程已通過                           |
| ⬜ sticky 確認下單按鈕遮擋確認     | 未在 375px 下明確滾動測試                                  | 低影響；目前 form py-5 可接受，後續觀察                |
| ⚠️ Row 2 文字縮排                  | 取貨方式卡片 Row 2 文字從左緣開始，未對齊 logo 位置        | 低影響；視覺可讀，未阻塞功能，可後續 polish（補 pl-9） |
| ⚠️ Replit dist 啟動問題            | 啟動腳本從 HEAD branch 編譯，若 HEAD 是舊分支則 dist stale | 每次 session 開始需確認 dist 版本；CI 不受影響         |
| ⚠️ cvs.ts(163) TypeScript 錯誤     | pre-existing，非本次引入                                   | 非阻塞，需後續修復                                     |
| ⚠️ emap import endpoint disabled   | 維持 disabled 直到合規確認                                 | 需獨立合規決策                                         |
| ⚠️ public tracking 不顯示 CVS 欄位 | 現行策略維持，隱私優先                                     | 若未來要顯示需另開產品決策                             |

---

## 14. 下一步建議

1. **已完成**：Step 6F 核心功能 QA 通過，可正式收尾超商選店 MVP。

2. **後續低優先**（不阻塞 Step 6F 收尾）：
   - EditOrderDialog 真瀏覽器操作補測
   - localStorage TTL 過期流程補測
   - 成功頁 375px 視覺確認
   - sticky 確認下單按鈕 375px 滾動行為觀察
   - Row 2 文字縮排 polish（若需要，補 `pl-9`）

3. **Replit dist 啟動問題**
   每次 session 開始時，若 git branch 與上次不同，需手動執行 `pnpm --filter api-server build` 確保 dist 最新。
   長期可考慮在 `.replit` 啟動腳本中指定固定 commit 或不自動 build。

4. **CI 補強**
   orval 後需加入 `npx tsc --build lib/api-zod/tsconfig.json`。

5. **後續規劃**
   - public tracking 是否顯示 CVS 門市資料（待產品決策）
   - `shippingFeeOverride` zod 補強
   - `cvs.ts(163)` 技術債修復
   - emap 維持 disabled 直到合規確認
