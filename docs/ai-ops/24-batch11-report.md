# BATCH-11 完工總報告

- repo：`C:\Users\Lnovo\Desktop\pika-system`
- 日期：2026-07-18
- 起始點：`81fd5a3`，開工時與 `origin/main` 相同、工作樹乾淨
- 推送：**本批全程未 push**
- 禁區：未動 generated、migration、既有金額公式、S-16 Phase 2 寫入鏈、`dev-handoff/`、`.claude/`

## 逐包結果

| 包                     | 狀態    | commit    | 驗證／一句結論                                                                                                                                  |
| ---------------------- | ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 技能入口 E2E         | skipped | —         | 兩輪停止：第一輪本機缺 Playwright Chromium；第二輪雖起瀏覽器但 mock 後只得到空白 App，依批次規則不改產品碼、不再猜，變更全數還原。              |
| 2 客戶詳情導航 E2E     | done    | `7228559` | 本機 Playwright：`1 passed (13.5s)`；列表點「詳情」進 `/customers/:id`，畫面非 404。                                                            |
| 3 visibility 背景刷新  | done    | `74a98ce` | 純測試 `7 pass / 0 fail`；shop-app typecheck exit 0；初載行為與 requestId 防競態保留。                                                          |
| 4 Prettier 收尾與盤點  | done    | `626a1fd` | 兩個指定檔 Prettier check 通過；相關測試 `2 pass / 0 fail`；盤點 505 個既有違規檔，只列不改。                                                   |
| 5 T-02 公開面審計      | done    | `751a333` | 報告 Prettier：`All matched files use Prettier code style!`；目前無成本／毛利 P0 洩漏。                                                         |
| 6 首登問卷考古         | done    | `cd4a651` | 報告確認 BATCH-8 當時因推薦計分、平手與衝突規則未拍板而跳過；現有 preview/apply API 可複用。                                                    |
| 7 首登問卷實作         | skipped | —         | 前置不成立：包6確認推薦映射語意仍未拍板；依規不自創問卷演算法、不改後端。                                                                       |
| 8 export 路由順序回歸  | done    | `cdb0dd3` | 拋棄式 PostgreSQL route test：`4 pass / 0 fail`；api-server typecheck exit 0。                                                                  |
| 9 客戶／技能跨店負測試 | done    | `b517d5d` | customers `5 pass / 0 fail`、skills `2 pass / 0 fail`；補 401 與跨 merchant 403，既有案例不重複。                                               |
| 10 T-07 狀態對照       | done    | `3bec4bf` | 報告列出六態雙端文案；主流程一致，列印收據字典缺 awaiting_payment 且含死狀態。                                                                  |
| 11 T-19 頁面流程       | done    | `071098b` | 報告完成全路由、受眾、gate 與最短步數；列出 trips 與規則表接線差異。                                                                            |
| 12 T-20 金額顯示       | done    | `36710a1` | 報告涵蓋對外金額、幣別、取整與待確認；發現 Dashboard 最近訂單幣別標示與來源語意需後續確認。                                                     |
| 13 375px 手機驗收      | done    | `f351514` | 報告 Prettier 通過；四頁無寬表格，但包貨清單缺「逐項勾已包」，觸控區另有 28–40px 小缺陷。                                                       |
| 14 賣貨便 XLSM spec    | done    | `7851e85` | 報告 Prettier 通過；v1.4 十欄映射、500 筆上限、個資二次確認及 7 張待拍板題卡齊備，零程式碼。                                                    |
| 15 購物金 spec         | done    | `bf3282c` | 報告 Prettier 通過；建議不可變流水帳；折抵、退款、效期與毛利關係全部標待拍板，零程式碼。                                                        |
| 16 demo seed 擴充      | done    | `c9141be` | safety tests `6 pass / 0 fail`、scripts typecheck exit 0；拋棄式 DB 為 1 假客戶／3 已開技能／4 連結訂單，重跑 exit 1 被冪等守衛拒絕；容器已刪。 |
| 17 手冊差異與補頁      | done    | `465567a` | 五個指定頁面皆已 covered，記錄「無缺頁」；同步多銀行比價現況，單一手冊檔 Prettier 通過。                                                        |
| 18 文件同步收尾        | done    | 本 commit | README 同步四家銀行、示範客戶／技能與手冊入口；本報告記錄全批結果。                                                                             |

## 重要發現與未解問題

1. **包貨清單不是可勾選流程。** 要先決定勾選只存在瀏覽器，還是要永久寫入資料庫；未拍板前不應偷做。
2. **首登問卷仍未開放。** API 基礎已存在，但題目到套餐的計分、平手與衝突規則需要老闆決定。
3. **賣貨便仍是設計稿。** 溫層、運費 0–100、訂單金額口徑、超額與長姓名處理都等題卡答案。
4. **購物金仍是設計稿。** 尤其「付款工具或折扣」會影響毛利／會計，必須先拍板。
5. 公開 API 審計目前未見成本、匯率、毛利或跨客戶資料洩漏；分享 token 仍應視為 bearer credential 保密。

## 最終驗證摘要

- 指定程式檔均通過 Prettier；報告文件均通過 Prettier check。
- package 相關測試結果如逐包表，全部執行到的測試為綠；包1依兩輪規則跳過，沒有留下產品碼變更。
- 最終重跑 shop-app 相關純測試：`9 pass / 0 fail`；scripts safety：`6 pass / 0 fail`。shop-app 第一次誤用該 workspace 未安裝的 `tsx` loader 而得到 `ERR_MODULE_NOT_FOUND`，改用 repo 既有 Node 24 直接入口後全綠，屬驗證指令問題、未改碼。
- 拋棄式 PostgreSQL／Docker 僅用假資料，未連 production 或既有 DB；容器 label 查詢零殘留。
- 最終分套 typecheck（libs、api-server、shop-app、scripts）與工作樹清潔狀態，以本 commit 後總回報原文為準。
