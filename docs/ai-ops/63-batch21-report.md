# BATCH-21 完工總報告

日期：2026-08-01  
Repo：`C:\Users\Lnovo\Desktop\pika-system`  
起始 HEAD：`901c98e`  
本批原則：每包獨立 commit、未 push、未連正式資料庫。

## 包狀態

|  包 | 狀態    | Commit             | 驗證／原因                                                                                                 |
| --: | ------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
|   1 | done    | `874cf2f`          | 13 個物流／訂單錯誤記錄點改用 `sanitizeError`；API typecheck、測試、Prettier 通過。                        |
|   2 | done    | `f70af28`          | 未標記 4xx 使用固定公開文案；`PublicSafeError` 可明確揭露受控訊息；5 個 integration tests pass。           |
|   3 | done    | `52fddb3`          | 備份／還原 runbook；Prettier 通過。                                                                        |
|   4 | done    | `50aefa8`          | `verify-backup` 僅接受顯式 dump／拋棄式 URL，拒絕 production／Replit；scripts typecheck 通過。             |
|   5 | done    | `eb5afc3`          | 完整性稽核 5 類異常以拋棄式 PG 實測，共抓到 16 個假異常；容器已清理。                                      |
|   6 | done    | `7017b5d`          | `/api/healthz` 增加 DB、migration、build metadata；健康／降級測試 3 pass。                                 |
|   7 | done    | `db4a082`          | request id middleware、回應標頭與錯誤日誌關聯；3 個 integration tests pass。                               |
|   8 | skipped | —                  | Orval 8.x codegen 產生 generated diff，違反 generated 不得變更與 byte-identical 門檻；已完整還原，未提交。 |
|  9a | done    | `b753644`          | AWS SDK S3 小版本升級；typecheck／純測試／Prettier 通過。                                                  |
|  9b | done    | `9d61615`          | Clerk Express 小版本升級；typecheck／純測試／Prettier 通過。                                               |
|  9c | done    | `1b8e326`          | express-rate-limit 升級；typecheck／純測試／Prettier 通過。                                                |
|  9d | done    | `13ca15d`          | pg 升級；typecheck／純測試／Prettier 通過。                                                                |
|  9e | done    | `ed2a43f`          | tsx catalog 升級；typecheck／純測試／Prettier 通過。                                                       |
|  10 | done    | `387ec0d`          | dependency health 報告更新；`pnpm audit` 實測剩 0 critical／13 high／5 moderate／3 low。                   |
|  11 | done    | `564e693`          | Customers 頁遮罩／匯出／搜尋／詳情導航 component coverage；4 pass。                                        |
|  12 | done    | `28ff1c2`          | CustomerDetail 四狀態、遮罩與揭露 audit component tests；4 pass。                                          |
|  13 | done    | `9fd0934`          | SkillMap 套餐／前置條件／高風險 component coverage；6 pass。                                               |
|  14 | done    | `f8de7a1`          | PublicCart 多品項、免費運費、空購物車 component tests；3 pass。                                            |
|  15 | done    | `307173d`          | TrackOrder 遮罩／取消狀態／末五碼 component coverage；4 pass。                                             |
|  16 | done    | `8b8c70e`          | 第三層權限矩陣盤點；trips／trip_routes 仍明列為待拍板 P1。                                                 |
|  17 | done    | `02752b0`          | 公開建立單、購物車、追蹤回應 keyset snapshots；4 pass。                                                    |
|  18 | done    | `05e986f`          | 高風險技能與客戶明文匯出 audit completeness tests；完整 DB 回歸 77 pass。                                  |
|  19 | skipped | —                  | trips 歸屬尚未拍板；依規不得改 schema、migration 或路由。                                                  |
|  20 | skipped | —                  | `formatOrder` decimal API 契約尚未拍板；依規不改 number/string 契約。                                      |
|  21 | done    | `fe5dc51`          | 老闆驗收腳本補備份、完整性稽核、healthz 操作說明；Prettier 通過。                                          |
|  22 | done    | `36bd135`          | 操作手冊新增異常處理章節；Prettier 通過。                                                                  |
|  23 | done    | `81e859c`          | README／docs index 同步 BATCH-21 文件入口；Prettier 通過。                                                 |
|  24 | done    | `0694783`          | 拋棄式 PG 量測 5000 orders／500 customers；報告含 EXPLAIN、median／近似 p95。                              |
|  25 | done    | `0a0d1f3`          | Windows Rollup 原生件不可執行，改做靜態 bundle inventory；未改 production build。                          |
|  26 | done    | `25b2da5`          | 錯誤路徑覆蓋盤點；列出既有高風險缺口。                                                                     |
|  27 | done    | `b6c18d7`          | TODO 第三梯盤點；兩項真 backlog，其餘為測試／範例／已處理項。                                              |
|  28 | skipped | —                  | `gh` CLI 不在環境且未觸發 Pending E2E；workflow runs=0，未搬移或修改 spec。                                |
|  29 | done    | `da24274`          | 全回歸完成；錯誤訊息隱私報告標記包 1／2 已解與剩餘待辦。                                                   |
|  30 | done    | this report commit | 本文件；SELF_SHA256 見文末。                                                                               |

## 回歸證據

```text
CI 同款純測試：FILES=78 / tests 303 / pass 303 / fail 0 / exit 0
PostgreSQL route tests（全新 postgres:16-alpine，13 檔）：tests 77 / pass 77 / fail 0 / exit 0
typecheck:libs=0
typecheck:api-server=0
typecheck:shop-app=0
typecheck:scripts=0
prettier --check . --ignore-path .prettierignore --end-of-line auto
All matched files use Prettier code style!
```

本批建立的 PostgreSQL 容器只使用 `127.0.0.1` 與假資料；`fable5.batch21.regression`、`fable5.batch21.latency` label 查詢均為零，無容器殘留。未執行 root typecheck，未連 production／既有 DATABASE_URL，未 push。

## 已解與仍待辦

- 已解：13 個物流／訂單錯誤記錄點改用 sanitizer（`874cf2f`）；未知 4xx 改受控公開文案（`f70af28`）；request id、healthz、備份與完整性稽核工具、測試與文件均落地。
- 仍待辦：trips/trip_routes 店鋪歸屬（需老闆回答 54 檔題卡）；`formatOrder` decimal API 契約（47 檔題卡）；Pending E2E 尚無 run；Orval 需另議 generated 變更；剩餘依賴 advisories；XLSM 需老闆以 Excel 實開與官方匯入驗證。
- 觀察：`console.error` 呼叫仍存在，但本批 13 個指定錯誤路徑的 payload 已經過 `sanitizeError`；不可把「呼叫點仍在」誤稱為未清理的原始錯誤洩漏。

## Git 狀態

- 本批最後 commit：本報告的 commit（以 `git rev-parse HEAD` 為準）。
- `origin/main` 仍為 `290feb6c9ac1e62c385971af274fb2d2fad8c730`；本批所有 commit 均未 push。
- 完工報告提交後應再次確認 `git status --short` 零輸出。

SELF_SHA256: b402297def3e5502978092d0ea6eda57c09f4dc04bf9cc3be5449b9339db7e95
