# BATCH-22 完工總報告

日期：2026-08-03

分支：`batch/22`

開工基底：`origin/main@208abee`
推送狀態：本批未 push

## 結論

BATCH-22 共 15 包：9 包完成並各自提交、5 包依批次停止規則 skipped、1 包為本完工報告。Trips 已加入 nullable 店鋪歸屬、參數化安全回填工具與五條 owner-scoped routes，但正式回填、NOT NULL 與 FK 尚未執行。購物金三個新增回應欄位已收斂為 decimal 字串；Phase 2 貨態核心寫入鏈已補齊交易、租戶、漂移、事件數與 lease 防線，但現行 scheduled route 尚未接上 Phase 2，因此不得啟用環境變數或排程。全批回歸結果為純測試 322/322、DB route 83/83、四套 typecheck 與 Prettier 全綠，未連 production／既有 DB。

## 逐包結果

| 包  | 狀態    | Commit    | 驗證／原因                                                                                                                                                                           |
| --- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | done    | `86ba0ae` | additive migration 0026、顯式參數 dry-run/apply 回填工具與安全測試完成；拋棄式 PG 前後 captured snapshot 均為 `count=2, sum=20.000000000000`，回填後 2 trips／2 routes、0 mismatch。 |
| 2   | done    | `0f1c6b4` | 五條 trips routes 均接 `requireAuth`、`verifyStoreOwner` 與店鋪條件；過渡期保留 `store_id IS NULL` 相容分支；拋棄式 route test 6/6。                                                 |
| 3   | done    | `aa43b1c` | 新增白話回填指南，並同步權限矩陣與歸屬方案文件；明載 NOT NULL／FK 是回填後另包。                                                                                                     |
| 4   | skipped | —         | onboarding E2E 容器 harness 兩輪均無法產生可信的五連跑結果；未猜修法、未留下 spec 變更。                                                                                             |
| 5   | done    | `78ab0ba` | `e2e/pending` 正名為 `e2e/suite`，真正隔離區保留在 `e2e/unverified`；主 config `--list` 維持 15 tests in 11 files。                                                                  |
| 6   | skipped | —         | maihuobian eligibility E2E 容器 harness 兩輪未能完成可信實跑；spec 留在 unverified，未納入主 testMatch。                                                                             |
| 7   | skipped | —         | Orval 8.x 候選產生非位元等價 generated diff 並牽動 Zod 4；依禁動 generated 規則整包撤回，manifest、lockfile 與 generated 均無殘留。                                                  |
| 8   | done    | `2024ce5` | 只把 `creditSpent`、`payableAfterCredit`、`remainingAmount` 改為 decimal 字串；其他既有金額契約與公式不變，route／pure／component 對照測試通過。                                     |
| 9   | skipped | —         | 客戶軟刪的 migration/schema 拋棄庫 harness 兩輪未能在安全條件內完成；所有暫時變更已撤回，未動 production／既有 DB。                                                                  |
| 10  | done    | `989287b` | 完成 Phase 2 七面向唯讀審查，列出啟用前必補防線與最壞情境；未改產品碼。                                                                                                              |
| 11  | done    | `1cc6947` | 補上 signed orderId/payload digest、交易內精確租戶與啟用狀態鎖定、原子寫入、實際事件數 50 筆 gate、process lease 與 partial audit；14/14 tests，其中 5 條為拋棄式 PG 整合測試。      |
| 12  | done    | `de1d22e` | 完成安全啟用指南；明載現行 scheduled route 仍是 FamilyMart，不得設定 Phase 2 寫入開關或排程。                                                                                        |
| 13  | skipped | —         | 現行 `/internal/logistics/sync/scheduled` 未接 Phase 2 gate；若只測既有 route 或注入假 Phase 2 會冒充架構已完成，因此沒有新增假綠測試。                                              |
| 14  | done    | `872da98` | 全批回歸全綠；同步 43／47／52／65 檔狀態，並修正賣貨便測試 fixture 的官方 38 元運費。                                                                                                |
| 15  | done    | 本檔提交  | 完工報告、風險、老闆待辦與可重算 SELF_SHA256 已落檔。                                                                                                                                |

## 全批驗證原文摘要

- `typecheck:libs`：exit 0
- `@workspace/api-server typecheck`：exit 0
- `@workspace/shop-app typecheck`：exit 0
- `@workspace/scripts typecheck`：exit 0
- CI 同款純測試：`FILES=80 / tests=322 / pass=322 / fail=0 / skipped=0`
- 拋棄式 PostgreSQL 全 route 清單：`14 files / tests=83 / pass=83 / fail=0 / skipped=0`
- Phase 2 專項：`14/14 pass`，其中 `5` 條真 PostgreSQL integration tests
- E2E 主 config 探索：`Total: 15 tests in 11 files`
- Prettier：`All matched files use Prettier code style!`
- `git diff --check`：零輸出
- 回歸 PostgreSQL container label：`0`
- Phase 2 PostgreSQL container label：`0`

所有資料庫驗證只使用本批新建、可丟棄的 PostgreSQL 與假資料；沒有讀取或寫入 production／既有資料庫。

## 風險與未解問題

1. Trips migration 目前只加 nullable `store_id`。為避免正式回填前服務中斷，route 暫時允許 owner 看見 `store_id IS NULL` 的 legacy rows；完成正式回填後必須另包移除此分支並加 NOT NULL／FK。
2. 客戶軟刪尚未實作；個資匿名化、購物金流水與訂單關聯保留仍須照 43 檔完成。
3. Orval 依賴安全升級尚未完成；不得提交非預期 generated 變更來遷就升級。
4. onboarding flaky 與 maihuobian eligibility E2E 尚未取得可信容器實跑證據；後者仍留在 `e2e/unverified`。
5. Phase 2 核心寫入鏈雖已補強，scheduled route 尚未整合；本批不構成啟用授權。

## 老闆待辦

### Trips 正式回填

1. 依 `docs/ai-ops/68-trip-store-backfill-guide.md` 在 Replit Production SQL console 先查店鋪與訂單分布。
2. 若訂單不是集中在唯一店鋪，立即停止並交回審查，不猜 store id。
3. 使用顯式 `--database-url`、`--store-id` 先跑 dry-run；核對 trips／routes 數量與 captured snapshot 的 count/sum。
4. 確認後才加 `--apply`，保存前後 count/sum 原文。
5. 回填證據終審通過後，再開獨立 migration 包加 NOT NULL／FK 並移除 `IS NULL` 過渡分支。

### Phase 2 貨態同步

目前不要設定 `TRACKING_WORKER_WRITE_ENABLED=true`，也不要建立 Replit schedule。下一包必須先把專用 scheduled route 接到已補強的 Phase 2 runtime，補 secret／lease／gate-off／run-log route tests，再交終審；通過後依 66 檔先 dry-run 觀察至少 7 天，最後才由老闆親自啟用。

## Git 聲明

本批每個完成的 coding／文件包均為獨立 commit；沒有 push、force、production DB、Replit 排程或環境變數變更。完工時工作樹應為乾淨狀態。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

PowerShell 重算核心指令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 1c4e84408b8fbc66f1e4814cc59d87dbec74af6b3810e46fa3e9853278b714e6
