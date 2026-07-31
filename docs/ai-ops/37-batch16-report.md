# BATCH-16 完工總報告

- repo：`C:\Users\Lnovo\Desktop\pika-system`
- 執行日：2026-07-31
- 開工基準：`3301cb7b4d228bb0070ef23a3df7d479fcc48f8f`
- 身份與範圍：非 Claude A/B worker；未讀寫 `dev-handoff/`、`.claude/`、generated、migration；未連既有或 production DB；未 push。

## 結論

BATCH-16 共 16 包：12 包完成、4 包依條件或兩輪停止規則跳過。完成內容涵蓋 asset loader 自動回歸、四頁 component／純函式測試、客戶詳情快照分流、兩組真資料庫 route 負向測試、Pending E2E runbook、五頁 44px 觸控區掃尾與手機驗收報告。最終全套純測試為 56 files／196 tests／196 pass／0 fail，libs、api-server、shop-app typecheck 與全庫 Prettier 全部通過。本批所有 commit 均只留在本機，沒有 push。

## 逐包結果

| 包                                  | 狀態    | commit      | 驗證與說明                                                                                                                                                           |
| ----------------------------------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 asset probe 進自動回歸網          | done    | `ad497d8`   | probe 改為 `*.test.mjs`，靜態註冊 loader 後動態載入真 PNG；CI 同款探索命中且 1/1 pass。                                                                              |
| 2 pending 仲裁後處理                | skipped | —           | 本地沒有 `gh`；唯讀查看 GitHub workflow 頁也找不到已執行的 Pending E2E run。依「尚未跑過」分支停止，四條 pending spec 未搬動、未修改。                               |
| 3 Orders 頁 component 測試          | skipped | —           | 兩輪均在載入 production 頁面前被 Node/tsx 的 `import.meta.env.BASE_URL` 缺失阻擋；未為測試修改產品碼，暫存測試已移除。                                               |
| 4 Customers 頁 component 測試       | done    | `4eacb36`   | 3/3 pass：預設遮罩、遮罩匯出筆數確認且無明文 header、二次確認後才送明文 header。                                                                                     |
| 5 PublicOrder 客人頁 component 測試 | done    | `1d2c95b`   | 3/3 pass：0.1×3 無浮點雜訊、零運費顯示「免費」、截止後不可送單。                                                                                                     |
| 6 Dashboard component 測試          | skipped | —           | 與包 3 相同，兩輪均被頁面頂層 `import.meta.env.BASE_URL` 的 Node harness 相容性阻擋；零產品碼變更。                                                                  |
| 7 Guide 頁 component 測試           | done    | `c4afbb1`   | 2/2 pass：技能開啟時顯示關鍵操作內容，未開時顯示 gate 卡片。                                                                                                         |
| 8 shippingFee 純函式補測            | done    | `cc3101c`   | 3/3 pass：所有正式取貨方式費率、未知值與 null 的既有 fail-safe 行為；盤點未發現獨立免運門檻函式，未虛構測試。                                                        |
| 9 monthlyProfitReport 補測          | skipped | —           | 兩輪新增案例都因測試期望字串的小數位格式寫錯而失敗；依兩輪停止規則完整還原，不改實作、不改既有期望值。                                                               |
| 10 customerDetail 補測              | done    | `5c778c0`   | 4/4 pass：單品、cart、免攤、pending、尚無快照混合歷史維持各自狀態。                                                                                                  |
| 11 audit-logs route 測試            | done    | `32474ec`   | 既有 401／跨店 403 不重複；新增 102 筆假紀錄實庫驗證只回最新 100 筆、排序正確且 response 不含假手機、訂單 token、批次 token。拋棄式 PostgreSQL route 集合 7/7 pass。 |
| 12 logistics import route 測試      | done    | `8cbc7c8`   | 13/13 pass：未登入、跨店、錯誤檔 4xx 且不洩內部路徑、A 店看不到 B 店批次；全是假資料與拋棄式 PostgreSQL。                                                            |
| 13 pending E2E 仲裁 runbook         | done    | `cbd979e`   | 新增老闆白話操作、綠燈搬遷、紅燈 trace 定位、未來 session 紀律；Prettier pass。                                                                                      |
| 14 剩餘 44px 觸控區掃尾             | done    | `5af1b5d`   | Customers、CustomerDetail、SkillMap、MonthlyProfit、Settings 僅 class 調整；shop 測試 73/73、typecheck、Prettier 全過。                                              |
| 15 手機驗收報告更新                 | done    | `2ee4061`   | 21 檔標記包 14 已修；四核心頁無新退化；包貨逐項勾選仍明列未拍板、未實作。                                                                                            |
| 16 完工總報告                       | done    | 本檔 commit | 逐包結果、驗證原文、風險、SHA-256 與未 push 聲明齊備。                                                                                                               |

## 驗證輸出原文

### 全套純測試

```text
PURE_TEST_FILES=56
ℹ tests 196
ℹ suites 0
ℹ pass 196
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 96945.2234
```

Customers 匯出 component 測試在 jsdom 下載連結點擊後會印出既有 `Not implemented: navigation (except hash changes)` 診斷；測試結果仍為 pass，且 request header 與二次確認斷言均已完成。這是 jsdom 不實作瀏覽器下載導航的測試環境訊息，不是產品錯誤。

### Typecheck 與格式

```text
> workspace@0.0.0 typecheck:libs
> tsc --build
exit 0

> @workspace/api-server@0.0.0 typecheck
> tsc -p tsconfig.json --noEmit
exit 0

> @workspace/shop-app@0.0.0 typecheck
> tsc -p tsconfig.json --noEmit
exit 0

Checking formatting...
All matched files use Prettier code style!
exit 0

git diff --check
exit 0
```

### 拋棄式 PostgreSQL route 驗證

```text
customersAndProfitIsolation.route.test.mjs
tests 7
pass 7
fail 0

logisticsImports.route.test.mjs
tests 13
pass 13
fail 0

docker ps --filter label=batch16.routes=true
0 containers
```

資料庫為本次新建的 `postgres:16-alpine` 拋棄式容器，只綁定本機回環埠；schema 建立與 route 測試皆使用假店鋪、假客戶、假 token、假檔案，完成後容器已刪除。未連 production 或任何既有 DB。

## 風險與未解問題

1. Pending E2E 尚無已執行結果，因此四條 spec 仍留在 `e2e/pending/`，未進主 CI。需由老闆在 GitHub Actions 手動觸發後再依 36 檔仲裁。
2. Orders 與 Dashboard 頁面的 production module 頂層依賴 `import.meta.env.BASE_URL`，目前的 Node/tsx component harness 無法直接載入。這是測試基建缺口；本批沒有以修改產品碼迴避。
3. monthlyProfitReport 的本批新增測試未落地；原因是兩輪測試期望字串的小數位格式錯誤，依批次紀律停止而非改實作或硬改期望值。
4. Customers 匯出測試的 jsdom navigation 診斷會增加測試輸出噪音，但不影響 pass/fail 或產品行為。
5. 包貨逐項勾選仍是未拍板功能，本批只維持既有報告標記。

## 建議下一步

先交 Fable 5 終審。若 accepted，再一次推送本批 commits 並觀察 current-HEAD `CI/verify`；另外手動觸發 `Pending E2E`，依 `docs/ai-ops/36-pending-e2e-runbook.md` 決定是否把四條 pending spec 升入主 CI。Orders／Dashboard component harness 與 monthlyProfitReport 缺測建議各自另開極小測試包，不與功能修改混做。

## BATCH-18 後續處理狀態

- 原第 3 項 monthlyProfitReport 缺測已由 BATCH-18 commit `5e587bb` 補齊：包含僅 pending、僅 missing、混合負毛利與 Asia/Taipei 閏年跨月邊界。
- 原第 2 項 Orders／Dashboard component harness 仍未解。BATCH-18 包 5 依規再試兩輪：第一輪卡在 React 載入，第二輪卡在 Testing Library `screen` 綁定全域 document 的時點；已完整還原嘗試內容，未留下以修改 production code 規避測試環境的變更。
- Pending E2E 仍未有 GitHub Actions 執行紀錄；BATCH-18 唯讀查詢結果為 0 runs，因此沒有將 pending specs 搬入主 CI。

## Git 與未 push 聲明

本批從 `3301cb7` 開始，所有完成包各自獨立 commit；本檔提交後工作樹應為乾淨。本批未執行 `git push`，未修改 origin。

## SHA-256

重算方式：以本檔 UTF-8 bytes 為準，刪除整行 `SELF_SHA256:`（含該行換行）後計算 SHA-256。

SELF_SHA256: 9dc2ac35f73af5c3c8935447a480310eac46582a4eeb33bfc926228a74a72d48
