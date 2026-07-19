# Brand Copy UI Rename — 畫夢代購 / DrawDream

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-BRAND-COPY-UI-RENAME-DRAWDREAM
**Author**: Claude A（worker = claude-a）

---

## 品牌規格

```text
中文品牌：畫夢代購
英文品牌：DrawDream
正式站網址：drawdream.replit.app
```

---

## 搜尋盤點結果

執行：

```bash
grep -R "代購系統\|代購平台\|我的代購店\|DrawDream\|drawdream\|畫夢\|買夢\|Dream\|storefront\|Buying" -n \
  artifacts/shop-app/src artifacts/api-server/src docs \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build
```

### 命中分類（原始 grep）

| 命中                                                                                                                                                  | 分類                                                  | 處理                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| `App.tsx:168` `name: "我的代購店"`                                                                                                                    | 新店預設 storeName（寫入 DB）                         | 不改（見「刻意不改的項目」）           |
| `App.tsx:219` `請重新登入後繼續使用代購系統。`                                                                                                        | UI copy                                               | ✅ 已改                                |
| `Dashboard.tsx:85` `store?.name === "我的代購店"`                                                                                                     | 與上一項預設值配對的條件判斷                          | 不改（見「刻意不改的項目」）           |
| `docs/step7/postoffice-manual-commit-flow.md`、`docs/step7/tcat-manual-commit-gate-plan.md`                                                           | production E2E 歷史紀錄（storeName / production URL） | 不改                                   |
| `docs/order-step7e-seller-agent-settings-ui-smoke-test.md`                                                                                            | 測試 fixture 資料                                     | 不改                                   |
| `docs/order-step4-payment-logistics-spec.md`、`docs/order-step7-customer-shipment-status-spec.md`、`docs/order-step8h-*.md`、`docs/order-step8i-*.md` | 內部 spec / audit 文件，「代購系統」為一般描述用語    | 不改（非對外品牌顯示，屬歷史規劃文件） |

### 額外盤點：實際對外品牌顯示

原始 grep 字串未涵蓋目前實際使用中的品牌字「揪單」與 `index.html` 的 `<title>團購管理</title>`（Replit 預設 boilerplate，從未客製化）。這兩者才是使用者實際會看到的「app 品牌」，故額外搜尋並列為本輪主要更名目標：

| 命中                                                       | 分類                         | 處理                                               |
| ---------------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| `index.html` `<title>` / `og:*` / `twitter:*` = `團購管理` | 瀏覽器分頁標題 / social meta | ✅ 已改為「畫夢代購 DrawDream」                    |
| `Home.tsx:11,13` logo badge + wordmark `揪` / `揪單`       | 首頁 header logo             | ✅ 已改為「畫」/「畫夢代購」                       |
| `Home.tsx:63` footer `揪單 — 小型商家訂單管理`             | 首頁 footer                  | ✅ 已改為「畫夢代購 DrawDream — 小型商家訂單管理」 |
| `Setup.tsx:66` logo badge `揪`                             | 建立店鋪頁 logo              | ✅ 已改為「畫」（與首頁一致）                      |
| `App.tsx:348` Clerk signIn subtitle `登入您的揪單帳號`     | 登入頁副標                   | ✅ 已改為「登入您的畫夢代購帳號」                  |

---

## 改了哪些品牌文案

| 檔案                                     | 行          | 改前                                                                                                                            | 改後                                    |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `artifacts/shop-app/index.html`          | 6           | `<title>團購管理</title>`                                                                                                       | `<title>畫夢代購 DrawDream</title>`     |
| `artifacts/shop-app/index.html`          | 7 / 10 / 14 | `團購管理 — built on Replit. Update this description to reflect the app.`（description / og:description / twitter:description） | `畫夢代購 DrawDream — 團購代購訂單管理` |
| `artifacts/shop-app/index.html`          | 9 / 13      | `og:title` / `twitter:title` = `團購管理`                                                                                       | `畫夢代購 DrawDream`                    |
| `artifacts/shop-app/src/pages/Home.tsx`  | 11          | logo badge 文字 `揪`                                                                                                            | `畫`                                    |
| `artifacts/shop-app/src/pages/Home.tsx`  | 13          | wordmark `揪單`                                                                                                                 | `畫夢代購`                              |
| `artifacts/shop-app/src/pages/Home.tsx`  | 63          | footer `揪單 — 小型商家訂單管理`                                                                                                | `畫夢代購 DrawDream — 小型商家訂單管理` |
| `artifacts/shop-app/src/pages/Setup.tsx` | 66          | logo badge 文字 `揪`                                                                                                            | `畫`                                    |
| `artifacts/shop-app/src/App.tsx`         | 219         | `請重新登入後繼續使用代購系統。`                                                                                                | `請重新登入後繼續使用畫夢代購。`        |
| `artifacts/shop-app/src/App.tsx`         | 348         | Clerk signIn subtitle `登入您的揪單帳號`                                                                                        | `登入您的畫夢代購帳號`                  |

共 4 個檔案、9 處 UI copy。

---

## 刻意不改的項目

| 項目                                                                                                                      | 位置                                                                      | 原因                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `name: "我的代購店"`                                                                                                      | `App.tsx:168`（新店預設 storeName）                                       | 寫入 DB 的預設值，屬使用者資料欄位，非靜態 UI copy；任務明確禁止改 DB / 硬改 storeName              |
| `store?.name === "我的代購店"`                                                                                            | `Dashboard.tsx:85`（完善商店資訊提示條件）                                | 與上一項預設值配對的條件判斷，屬商業邏輯；單獨修改會破壞既有行為                                    |
| `store?.name ?? "我的店鋪"`                                                                                               | `Dashboard.tsx:72`                                                        | 顯示使用者自己的店鋪名稱／通用 fallback，非 app 品牌名                                              |
| `placeholder="例：小美代購"`                                                                                              | `Setup.tsx:79`                                                            | 店鋪名稱輸入框的範例文字，示範使用者可自訂的店名，非 app 品牌                                       |
| `開始管理您的團購訂單`                                                                                                    | `App.tsx:354`（Clerk signUp subtitle）                                    | 功能性描述（團購＝業務類別），非品牌名稱                                                            |
| `團購代購\n輕鬆管理`                                                                                                      | `Home.tsx:20`（首頁主標語）                                               | 行銷標語／功能描述，非品牌名稱；本輪僅更名品牌顯示，不重寫行銷文案                                  |
| 全家 / 中華郵政 / 黑貓宅急便                                                                                              | `logisticsProviders.ts`、`ManualTrackingSyncPanel.tsx` 等                 | 物流 provider 顯示名稱，任務明確要求不可改                                                          |
| `MANUAL_SYNC_PROVIDERS` / `supportsAutoSync` / `COMMIT_ENABLED` / `/manual-provider/commit`                               | `ManualTrackingSyncPanel.tsx`、`logisticsProviders.ts`、`providers.ts` 等 | 業務邏輯 / commit gate，與品牌文案無關，本輪未觸碰                                                  |
| `docs/step7/postoffice-manual-commit-flow.md`、`docs/step7/tcat-manual-commit-gate-plan.md` 內 storeName / production URL | production E2E 歷史紀錄                                                   | 屬實際測試時的事實紀錄（已是 `drawdream.replit.app` / `我的代購店`），非待更名的「現在顯示」UI copy |
| `docs/order-step7e-seller-agent-settings-ui-smoke-test.md` 內 store 名稱                                                  | 測試 fixture 資料                                                         | 測試資料，不更動                                                                                    |
| `docs/order-step4/7/8*-*.md` 內「代購系統」                                                                               | 內部 spec / audit 文件的一般性描述用語                                    | 非對外品牌顯示，屬歷史規劃文件，本輪聚焦於使用者實際看到的 UI                                       |

---

## Safety Check

| 項目                              | 結果                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- |
| `COMMIT_ENABLED`                  | `false`（`ManualTrackingSyncPanel.tsx:141`，未變動）                        |
| `manual-provider/commit`          | 僅 `ManualTrackingSyncPanel.tsx:371`，guarded fetch 內，未變動              |
| `MANUAL_SYNC_PROVIDERS`           | `["postoffice", "tcat"] as const`，未變動                                   |
| `supportsAutoSync`                | `logisticsProviders.ts`（shop-app）/ `providers.ts`（api-server）皆未變動   |
| `localStorage` / `sessionStorage` | CLEAN（`ManualTrackingSyncPanel.tsx` 內 0 處）                              |
| typecheck                         | PASS（`cd artifacts/shop-app && npx tsc -p tsconfig.json --noEmit` 無輸出） |

---

## Non-actions This Round

- 沒有改 DB / 沒有 production write
- 沒有改 API 行為 / response schema
- 沒有改物流 provider 邏輯或顯示名稱（全家／中華郵政／黑貓宅急便不變）
- 沒有改 `COMMIT_ENABLED`、`supportsAutoSync`、`MANUAL_SYNC_PROVIDERS`
- 沒有送出 `/manual-provider/commit`
- 沒有新增 7-11、沒有讓 familymart 進入 manual UI
- 沒有改 `.replit` / secrets / env
- 沒有 Publish

---

## 建議下一步

PASS 後建議使用者人工開啟正式站 / 預覽畫面確認：

- 首頁（登出狀態）：logo + wordmark + footer
- 登入頁：Clerk subtitle「登入您的畫夢代購帳號」
- 登入狀態失效時的錯誤訊息「請重新登入後繼續使用畫夢代購。」
- 瀏覽器分頁標題 / 分享預覽（og / twitter meta）：「畫夢代購 DrawDream」
- 建立店鋪頁（Setup）：logo badge「畫」

確認品牌文案自然、置中、不截斷，且不影響登入 / 建店 / 訂單操作流程。
