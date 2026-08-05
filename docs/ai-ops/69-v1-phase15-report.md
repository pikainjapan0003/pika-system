# V1 Phase 1 包 15 完工報告

日期：2026-08-05

Worktree：`C:\Users\Lnovo\Desktop\pika-v1-phase15`

分支：`feat/v1-fixed-cost`

基線：原包 15 報告 commit `558f1de`；本極小修正批未 push。

## 結論

固定成本資料模型、預估／實際／比較三頁、店鋪技能閘門、預設類別 seed 與 CI schema guard 已完成。終審指出的三個 P0 已在本極小修正批關閉：行程毛利重複計入固定成本、乾淨資料庫缺少固定成本預設資料、以及關帳後無法解鎖再修改預估的死路。另完成型別收斂、缺匯率 fail-closed 與兩頁真實 POST body 測試；沒有新增欄位或 API，沒有碰 generated、dev-handoff、production DB 或既有訂單快照。

前次交付曾錯誤宣稱全 repo Prettier 通過；終審實際找到 7 個格式違規檔。本續修批已只對該 7 檔執行 Prettier，並以全 repo `prettier --check` 重新驗證通過。

## 終審 findings 與修正

1. **P0：tripProfit 固定成本重複計入。** legacy 總額曾同時流入 JPY-origin 與 TWD-direct，造成 operating expense 與 profit 錯算。已改為只加 `fixedCostJpyOriginTwd + fixedCostTwdDirectTwd + variable + fee`；legacy 總額只保留一次，另以 `legacyFixedCostForFee` 作手續費費基。既有期望恢復為 operating expense `25375.00`、profit `13125.00`、`SALARY_TARGET_MET`，並新增 legacy/split 等價測試。
2. **P0：乾淨資料庫沒有固定成本預設資料。** schema push 只建表、不會執行 application seed，原 CI guard 對 11 類別與 singleton 的要求因此無法由乾淨環境滿足。已新增以 `FIXED_COST_CATEGORY_SEEDS` 為唯一來源的 idempotent seed，並在 CI schema push 後、guard 前執行；連跑兩次仍維持 11 類別與 singleton id=1 一筆。
3. **P0：關帳後估算無法合法解鎖再修改。** CLOSED 檢查曾先擋住 unlock，POST/PATCH 的 estimate lock 規則也不一致。已改為 CLOSED 且仍 locked 才拒絕，unlock 只檢查 `estimateLocked`；ESTIMATE 新增與修改都受 lock 保護，PATCH 禁止變更 mode。route 測試證明 close → unlock → 修改成功，且 `estimateModifiedAfterLock` 永久為 true。

## 原包 15 狀態

|  包 | 狀態 | Commit    | 內容／驗證摘要                                                   |
| --: | ---- | --------- | ---------------------------------------------------------------- |
|   1 | done | `a242a99` | trips/trip_routes 固定成本輸入欄位與 additive migration。        |
|   2 | done | `b868718` | 11 個固定成本類別資料表與種子定義。                              |
|   3 | done | `fc29bcf` | cost_entries ESTIMATE/ACTUAL 模型、狀態與約束。                  |
|   4 | done | `9e63501` | ExactDecimal 固定成本合計與 JPY/TWD/待補匯率分流。               |
|   5 | done | `c5ca6a8` | tripProfit 固定成本與 1.5% 費用基礎拆分。                        |
|   6 | done | `bd4571c` | 工作日推導與人工覆寫規則。                                       |
|   7 | done | `399cfab` | 預估鎖定、解鎖與修改後標記政策。                                 |
|   8 | done | `7744693` | 預估／實際差異比較純函式與方向判定。                             |
|   9 | done | `e30b7a9` | cost_entries CRUD；requireAuth、店主與 trip/store 綁定。         |
|  10 | done | `468a7db` | operating-inputs、close、unlock-estimate API 與狀態防線。        |
|  11 | done | `48b7e4c` | 固定成本摘要／比較 API，包含 11 類別與分開匯率。                 |
|  12 | done | `1727b57` | 預估成本頁：11 類別、零值、估算鎖定與手動解鎖。                  |
|  13 | done | `825c57e` | 實際成本頁：發票列、幣別、日期、可選照片與無單據標記。           |
|  14 | done | `d3f9a90` | 比較頁：預估／實際／差額、待補匯率狀態，無圖表。                 |
|  15 | done | `c71e848` | `/trips`、估算、實際、比較頁統一受 S-09 gate；設定入口同步顯隱。 |
|  16 | done | `2d4e8e4` | CI disposable schema guard。                                     |
|  17 | done | `558f1de` | 原版完工報告。                                                   |

## 極小修正批

| 修正 | 狀態 | Commit    | 內容／驗證摘要                                                           |
| ---: | ---- | --------- | ------------------------------------------------------------------------ |
|    1 | done | `d12c7d3` | 消除 tripProfit 固定成本重複計入；10/10 tests。                          |
|    2 | done | `f6cd1aa` | idempotent 類別/singleton seed 串入 CI；schema guard PASS。              |
|    3 | done | `e732aeb` | breakeven、variance 型別窄化與三個前端 BottomNav 型別修復。              |
|    4 | done | `e6a46bb` | close → unlock → 修改估算路徑與 mode 不可變；route tests 2/2。           |
|    5 | done | `79893d7` | 任一側有 JPY 列但缺該側匯率時回 pending「缺少匯率」；9/9 tests。         |
|    6 | done | `d58149d` | 儲存按鈕逐字選取、React value setter、輪詢真 POST body；8/8 page tests。 |
|    7 | done | 本 commit | 全批 Prettier 與本報告更正、自校驗。                                     |

## 續修批

| 修正 | 狀態 | Commit    | 內容／驗證摘要                                                                     |
| ---: | ---- | --------- | ---------------------------------------------------------------------------------- |
|    1 | done | `e984973` | 只格式化終審列出的 7 檔；全 repo Prettier gate 通過。                              |
|    2 | done | `a523c42` | 統一缺少損益兩平資料訊息；U+F699 不存在，breakeven tests `10/10`。                 |
|    3 | done | `339b3ab` | CLOSED 但已解鎖時重新鎖定估算且保留永久修改旗標；api typecheck 與 route 測試通過。 |

## 驗證紀錄

- 四套 typecheck：libs、api-server、shop-app、scripts 均 exit 0。
- CI 同範圍純測試：`96 files / 411 tests / 411 pass / 0 fail / 0 skipped`。
- tripProfit：`10 pass / 0 fail`。
- fixedCostVariance：`9 pass / 0 fail`。
- 預估解鎖 route：`2 pass / 0 fail`。
- 預估／實際／比較三頁：`11 pass / 0 fail`；其中兩條儲存案例都精確斷言 POST `/cost-entries` 的 method 與 JSON body。
- 全新 `postgres:16-alpine`：drizzle-kit CLI schema push 顯示 `[✓] Changes applied`、無 `no parameter $1`；`operating_settings` 的 CHECK 為字面值 `id = 1`；seed 連跑兩次後 `cost_categories=11`、`operating_settings_id_1=1`；CI 同款 guard 印出 `V1_FIXED_COST_SCHEMA_GUARD=PASS`。
- Docker 清理：本批 label containers `0`、volumes `0`。
- 前次交付的 Prettier 通過宣稱不正確：終審實際有 7 檔失敗；本續修批已修正該 7 檔，全 repo Prettier 與 `git diff --check` 現已通過。

## 風險與未解項目

1. `lib/db/src/transport-cost/index.ts` 仍有既存手續費字面量 `"0.015"`；因此目前不能宣稱手續費常數全 repo 只有一個來源。本批不改該既有債。
2. `tripProfit` 的 `variableCostBaseTotalTwd` 契約是「未含 1.5% 手續費」，但 `routeCost.totalRouteCostTwd` 與 `consolidationCost.totalCostTwd` 都已含費。後續包 12 接線若直接把後兩者餵入，會重複計費；接線前必須拆出未含費費基。
3. `TripActual` 的照片預覽沿用既有產品圖片 upload endpoint，沒有新增 URL 欄位；正式環境仍需依既有檔案服務權限驗收。
4. 固定成本頁的 UI 入口受 S-09 gate 控制；server API 仍以 requireAuth、verifyStoreOwner 與 store_id 綁定作最終權限邊界。
5. `lib/db/src/operating-cost/entryMutationPolicy.ts` 目前只由 `lib/db/src/operating-cost/index.ts` re-export，沒有任何 route 實際呼叫；鎖定／解鎖政策仍分散在 routes。此為凍結技術債，本續修批只如實記錄，不重構。

## Git 狀態

- Coding HEAD（報告提交前）：`339b3ab`。
- 最終收尾 commit subject：`update-report`；其 SHA 由 Git 提交後產生，避免在報告內宣稱自我參照 SHA。
- Branch：`feat/v1-fixed-cost`。
- Push：未 push。
- 完工條件：報告提交後 `git status --short` 零輸出。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

SELF_SHA256: e300efc19d64a835b8b23b027e63b9b2eea338c3f0090aab511d4f80746a1fa9
