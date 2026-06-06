# Order Step 6F：超商選店 QA 報告

> 文件日期：2026-06-06
> Branch：`qa/step6f-cvs-store-selection-browser-mobile`
> Base commit：`7cf0b92`（Step 6E Release Checklist）

---

## 1. QA 目的

驗證 Step 6 超商門市選擇（後台與買家端）的功能正確性、安全性、資料保存與隱私保護。

本次 QA 在 Replit headless 環境執行，包含：
- 自動化測試（route tests / typecheck）
- API 端對端 curl 測試
- 原始碼靜態確認
- Live server 安全驗證

**瀏覽器 / 手機互動 QA 無法執行**（headless 環境，無法操作真瀏覽器），需人工另行補測。

---

## 2. 測試環境

| 項目 | 說明 |
|------|------|
| 環境 | Replit headless server |
| OS | Linux 6.17.5 |
| Node.js | 24.13.0 |
| Branch | `qa/step6f-cvs-store-selection-browser-mobile` |
| Base | `7cf0b92`（Step 6E Release Checklist） |
| API server | `http://[::1]:8080`（PORT=8080，IPv6 loopback） |
| Shop-app | `http://localhost:80`（Vite dev server） |
| API proxy | `/api/*` → api-server（Vite 代理） |

---

## 3. 分支 / Commit 狀態

| Commit | 分支內？ |
|--------|---------|
| `7cf0b92` Step 6E Release Checklist | IN branch ✅ |
| `f1bfd49` Step 6E-C UX polish | IN branch ✅ |
| `aac79ba` Step 6E-B security | IN branch ✅ |
| `ec3b3bd` Step 7B API | NOT in branch ✅ |
| `47a6f81` Step 7B UI | NOT in branch ✅ |

---

## 4. Dist / Server 狀態

| 項目 | 狀態 |
|------|------|
| dist 重建 | ✅ `pnpm --filter api-server build`（本次 QA 執行） |
| `parseCvsExtension` 出現次數 | **0** ✅ |
| stale process 清除 | ✅ PID 109193（17:36 UTC，早於本次 dist rebuild）已殺除 |
| 新 process（PID 118882） | ✅ PORT=8080，在重建後啟動 |
| api-zod dist | ✅ `lib/api-zod/dist/` 含 CVS 欄位 |

> **注意**：Replit 啟動腳本在 session 啟動時，從舊分支（`docs/order-step6b-cvs-existing-implementation-audit`，仍含 `parseCvsExtension`）build dist。本次 QA 開始時，dist 已是過時版本，已手動重建。這是 Replit 啟動腳本與 git 分支不同步的問題，CI 環境不受影響。

---

## 5. 後台 Orders 選店 QA

| 項目 | 方式 | 結果 |
|------|------|------|
| EditOrderDialog CVS 選店器存在 | 靜態確認（原始碼） | ✅ |
| storeCode / storeName 自動填入 | 靜態確認 | ✅ |
| 已選門市卡片顯示地址 / 電話 | 靜態確認 | ✅（lines 565–570）|
| 儲存後資料持久化（cvsStoreId/cvsStoreName/cvsStoreAddress/cvsStorePhone） | curl API 確認 | ✅ |
| 只改 paymentStatus → storeSelectedAt 不變 | orders.route.test 確認 | ✅（104/104） |
| 只改 shippingStatus/trackingCode → storeSelectedAt 不變 | orders.route.test 確認 | ✅ |
| 改新門市 → storeSelectedAt 更新 | orders.route.test 確認 | ✅（dirty tracking）|
| Step 5 付款 / 物流欄位顯示正常 | 靜態確認 | ✅（不影響） |
| **真瀏覽器操作 EditOrderDialog** | **未執行** | ⬜ 需人工補測 |
| **手機寬度 EditOrderDialog 不爆版** | **未執行** | ⬜ 需人工補測 |

---

## 6. 買家端 PublicOrder 選店 QA

### API 端對端驗證（curl）

| 測試 | 輸入 | 結果 |
|------|------|------|
| 7-11 CVS 訂單建立 | cvsStoreId=284754, storeName=懷民門市 | ✅ 正確儲存 |
| 全家 CVS 訂單建立 | cvsStoreId=family-015125, storeName=全家板橋中勝店 | ✅ 正確儲存 |
| storeSelectedBy 偽造（admin） | `storeSelectedBy: "admin"` | ✅ 儲存為 `"customer"` |
| storeSelectedBy 偽造（staff） | `storeSelectedBy: "staff"` | ✅ 儲存為 `"customer"` |
| 無 CVS 訂單 | 黑貓宅急便，無 cvsStoreId | ✅ `storeSelectedBy: null` |
| storeSelectedAt 設定 | CVS 訂單 | ✅ 有 ISO timestamp |
| 查無結果 | q=ZZZNORESULTXXX999 | ✅ `{"stores":[]}` |
| 7-11 懷民搜尋 | q=懷民 | ✅ 1 筆（懷民門市，板橋民治街111號） |
| 全家板橋搜尋 | q=板橋 | ✅ 3 筆（中勝、互維、亞東一店） |

### 原始碼靜態確認

| 項目 | 確認 |
|------|------|
| 未選門市阻擋邏輯（L218-220） | ✅ `請先選擇 7-11 門市` / `請先選擇全家門市` |
| localStorage TTL 24h（`expiresAt`） | ✅ `CVS_STORE_TTL_MS = 24 * 60 * 60 * 1000` |
| 成功頁「已選門市」摘要 | ✅ `submittedCvsStore` state |
| 成功頁保守提醒文字 | ✅ 「門市資料可能因超商更新而異動，實際資訊以超商公告為準。」|
| submit 後 `clearCvsStore` | ✅ L257 |
| `storeSelectedBy` 不從 client 讀取（已移除） | ✅ source 無 `parseCvsExtension` |
| `PublicOrder.tsx` 不送 `storeSelectedBy` | ✅ submit body 無此欄位 |

### 未執行（需人工補測）

- [ ] 真瀏覽器操作買家選店完整流程
- [ ] localStorage 實際寫入 / 讀取確認
- [ ] expiresAt 約 24h 後確認
- [ ] 成功頁視覺確認
- [ ] 成功後 localStorage 清除確認
- [ ] 手機 375px 視覺確認

---

## 7. 手機寬度 QA 結果

| 項目 | 狀態 |
|------|------|
| 真瀏覽器 375px 視覺確認 | **未執行**，headless 環境 |
| 結果列表可滾動 | **未執行** |
| 選擇按鈕可點 | **未執行** |
| 下單頁不爆版 | **未執行** |
| 成功頁不爆版 | **未執行** |
| EditOrderDialog 不爆版 | **未執行** |

> 以上全部需人工在 Replit web 或本機 DevTools 375px 模式確認。

---

## 8. 安全 / Privacy / emap 回歸

| 項目 | 測試方式 | 結果 |
|------|----------|------|
| storeSelectedBy='admin' → customer | live curl | ✅ PASS |
| storeSelectedBy='staff' → customer | live curl | ✅ PASS |
| 無 CVS → storeSelectedBy=null | live curl | ✅ PASS |
| public tracking 不洩漏 recipientPhone | curl + field check | ✅ absent |
| public tracking 不洩漏 recipientAddress | curl + field check | ✅ absent |
| public tracking 不洩漏 internalNote | curl + field check | ✅ absent |
| public tracking 不洩漏 paymentNote | curl + field check | ✅ absent |
| public tracking 不洩漏 paidAmount | curl + field check | ✅ absent |
| public tracking 不洩漏 buyerPhone | curl + field check | ✅ absent |
| public tracking 不洩漏 cvsStoreId | curl + field check | ✅ absent |
| public tracking CVS 顯示策略維持現狀 | curl 確認 | ✅ 不顯示 CVS 欄位 |
| emap 未登入 | curl → 401 | ✅ `{"error":"Unauthorized"}` |
| emap 測試中 disabled | cvs.route.test 4/4 | ✅ 403 DISABLED |
| 不呼叫真實 emap | 程式碼確認 | ✅ early return 403 |
| DB schema 未修改 | git diff 確認 | ✅ |
| Step 7B 未混入 | git log 確認 | ✅ ec3b3bd / 47a6f81 NOT in branch |

---

## 9. 自動化測試結果

| 測試套件 | 結果 | 備註 |
|----------|------|------|
| `public.route.test.mjs` | **20/20 pass** ✅ | 含 storeSelectedBy 安全驗證 |
| `orders.route.test.mjs` | **104/104 pass** ✅ | 含 storeSelectedAt dirty tracking |
| `cvs.route.test.mjs` | **4/4 pass** ✅ | emap disabled 確認 |
| shop-app typecheck | **pass** ✅ | — |
| api-server typecheck | **pre-existing 錯誤** ⚠️ | `cvs.ts(163,15): 'geoMatch' is possibly 'null'`，非本次引入 |

---

## 10. 已修小 Bug

| Bug | 說明 | 處理方式 |
|-----|------|----------|
| dist stale | Replit 啟動腳本從舊分支 build，dist 仍含 `parseCvsExtension` | 手動執行 `pnpm --filter api-server build` 重建 |

> 無應用程式碼修改。

---

## 11. 未完成項目

以下項目因 headless 環境限制，**無法**在本次 QA 完整驗收：

### 後台 Orders QA（需人工）

- [ ] 真瀏覽器開啟後台 Orders 頁
- [ ] 真瀏覽器打開 EditOrderDialog
- [ ] 真瀏覽器在 CVS 選店器搜尋「懷民」
- [ ] 真瀏覽器選擇門市，確認 storeCode / storeName 填入
- [ ] 真瀏覽器確認已選門市卡片顯示地址 / 電話
- [ ] 真瀏覽器儲存後重新打開，確認欄位持久化
- [ ] 真瀏覽器只改 paymentStatus，確認 storeSelectedAt 不變
- [ ] 真瀏覽器只改 trackingCode，確認 storeSelectedAt 不變
- [ ] 真瀏覽器改新門市，確認 storeSelectedAt 更新
- [ ] 真瀏覽器切換全家，搜尋「板橋」並選店
- [ ] 真瀏覽器確認 Step 5 欄位正常
- [ ] 手機 375px EditOrderDialog 不爆版

### 買家端 PublicOrder QA（需人工）

- [ ] 真瀏覽器開啟 `/p/:shareToken`
- [ ] 真瀏覽器選 7-11 取貨
- [ ] 真瀏覽器進入 CVS 選店頁 `/cvs/711/select?provider=seven&source=customer`
- [ ] 真瀏覽器搜尋「懷民」，確認 1 筆結果
- [ ] 真瀏覽器選擇懷民門市，確認跳回下單頁
- [ ] 真瀏覽器確認已選門市卡片顯示
- [ ] 真瀏覽器 DevTools localStorage 含 savedAt / expiresAt（約 24h 後）
- [ ] 真瀏覽器送出訂單
- [ ] 真瀏覽器成功頁顯示「已選門市」
- [ ] 真瀏覽器成功後 localStorage 清除
- [ ] 真瀏覽器測全家板橋下單流程
- [ ] 真瀏覽器測未選門市阻擋
- [ ] 真瀏覽器測過期 localStorage（手動改 expiresAt）
- [ ] 手機 375px 買家下單頁 / 選店頁 / 成功頁視覺確認

---

## 12. Blocked / Needs-Review 項目

| 項目 | 說明 | 影響 |
|------|------|------|
| ⬜ 瀏覽器 / 手機 QA | headless 環境，無法操作真瀏覽器 | Step 6F 瀏覽器部分仍未完整驗收 |
| ⚠️ Replit dist 啟動問題 | 啟動腳本從 HEAD branch 編譯，若 HEAD 是舊分支則 dist stale | 每次 session 開始需確認 dist 版本；CI 不受影響 |
| ⚠️ cvs.ts(163) TypeScript 錯誤 | pre-existing，非本次引入 | 非阻塞，需後續修復 |

---

## 13. 下一步建議

1. **優先：人工瀏覽器 / 手機 QA**
   在 Replit web 或本機完成 Section 11 的所有 checklist 項目。

2. **Replit dist 啟動問題**
   每次 session 開始時，若 git branch 與上次不同，需手動執行 `pnpm --filter api-server build` 確保 dist 最新。
   長期可考慮在 `.replit` 啟動腳本中指定固定 commit 或不自動 build。

3. **CI 補強**
   orval 後需加入 `npx tsc --build lib/api-zod/tsconfig.json`。

4. **人工 QA 通過後**
   可正式收尾 Step 6 超商選店 MVP。

5. **後續規劃**
   - public tracking 是否顯示 CVS 門市資料（待產品決策）
   - `shippingFeeOverride` zod 補強
   - `cvs.ts(163)` 技術債修復
   - emap 維持 disabled 直到合規確認
