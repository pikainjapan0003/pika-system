# BATCH-17 完工總報告

日期：2026-07-31
Repo：`C:\Users\Lnovo\Desktop\pika-system`
基準 HEAD：`290feb6`
本批最終功能 HEAD：`79a989e`
推送狀態：未 push

## 結論

1. 20 包中 17 包完成、3 包跳過；完成內容分成 16 筆功能／文件 commit 與本報告 commit。
2. 賣貨便匯出、購物金帳本與訂單折抵、永久包貨勾選、首登問卷均已落地至本批允許的範圍。
3. 購物金 owner grant API 與 UI 因第 10 包連續兩輪 typecheck 失敗而完整回滾，未以其他內容替代；第 11 包因此依賴性跳過。
4. 第 12 包程式與測試完成，但 migration Docker harness 連續兩輪失敗，依派工規則標記「演練待 Fable 5 補跑」。
5. 第 19 包的純測試側 `import.meta.env` 墊片連續兩輪仍無法解開 Node alias 解析，全部試作已回滾，工作樹無殘留。

## 逐包狀態

| 包  | 狀態             | Commit                                               | 產出與驗證                                                                                                                                                                                                                         |
| --- | ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | done             | `fa7e0e3 normalize-line-endings`                     | 新增 `.gitattributes`；`git add --renormalize .` 對既有追蹤檔造成 0 筆內容變更，binary bytes 不變；純測試、三套 typecheck、Prettier gate 通過。                                                                                    |
| 2   | done             | `b4b6f06 add-product-shipping-temperature`           | 新增 `products.storage_temp_class` 與 migration `0020`，合法值 `normal/frozen/null`；拋棄式 PostgreSQL 演練與合法／非法值驗證通過。                                                                                                |
| 3   | done             | `f4d107e add-product-shipping-temperature-ui`        | ProductForm 加獨立賣貨便溫層欄，不改既有 `storage_temp`；component tests 與 shop typecheck 通過。                                                                                                                                  |
| 4   | done             | `3c88044 add-maihuobian-row-validation`              | 新增官方 v1.4 賣貨便列驗證純函式，金額走 ExactDecimal；11 組權威邊界 fixtures 通過。                                                                                                                                               |
| 5   | done             | `19800ef add-maihuobian-export-api`                  | 新增 owner-only 匯出 API、500 筆上限、日期與物流資格篩選、明文二次確認及匿名 audit；route tests 與 api typecheck 通過。                                                                                                            |
| 6   | done             | `309dd3f add-maihuobian-export-ui`                   | 訂單頁新增匯出面板、合格／不合格原因、筆數與個資確認；3 組 component tests 與 shop typecheck 通過。                                                                                                                                |
| 7   | done             | `7b76ed7 research-xlsm-template-fill-options`        | 產出 `38-xlsm-template-fill-options.md`，比較保留 v1.4 xlsm 的可行方案；只研究、未寫入實作。                                                                                                                                       |
| 8   | done             | `8d41203 add-store-credit-ledger`                    | 新增購物金流水 schema 與 migration `0021`，採不可變流水帳與 idempotency key；schema/typecheck 與相關測試通過。                                                                                                                     |
| 9   | done             | `433be80 add-store-credit-balance-functions`         | 新增 ExactDecimal 餘額、grant、spend、reversal 純函式；負餘額與重複 reversal 均 fail-closed，測試通過。                                                                                                                            |
| 10  | skipped          | —                                                    | owner grant/adjust API 連續兩輪仍有 route/type interface typecheck 失敗；依規完整回滾，未保留未驗證 API。                                                                                                                          |
| 11  | skipped          | —                                                    | 依賴第 10 包 owner API；禁止以無後端 UI 冒充完成，因此未實作。                                                                                                                                                                     |
| 12  | done（演練待補） | `5ab809c apply-store-credit-to-orders`               | 訂單新增 frozen `store_credit_applied` 與 ExactDecimal 折抵交易鏈；單元／route tests、libs/api/shop typecheck 通過。migration `0022` Docker harness 兩輪失敗，待 Fable 5 側補跑。                                                  |
| 13  | done             | `4e2ee30 reverse-store-credit-on-order-cancellation` | 訂單取消時以原 spend 建一次 reversal，重複取消不重複回沖；測試與 api typecheck 通過。                                                                                                                                              |
| 14  | done             | `2d644a3 finalize-store-credit-spec`                 | 依已落地行為同步 `19-store-credit-spec-draft.md`，清楚保留 owner grant API/UI 未完成狀態。                                                                                                                                         |
| 15  | done             | `2da92a7 add-persistent-order-picking-checks`        | 新增 `order_picking_checks` 與 migration `0023`，以穩定 item key 保存勾選；純函式測試與 schema/typecheck 通過。                                                                                                                    |
| 16  | done             | `6a008c3 persist-order-picking-progress`             | 包貨清單接永久讀寫 API，已出貨／完成單唯讀；route、component tests 與 api/shop typecheck 通過。                                                                                                                                    |
| 17  | done             | `96ee44d add-onboarding-questionnaire-scoring`       | 新增四題問卷與穩定套餐計分；8 組輸入輸出測試通過，規則記於 `39-onboarding-scoring.md`。                                                                                                                                            |
| 18  | done             | `79a989e add-onboarding-questionnaire-ui`            | 零技能 Dashboard 顯示問卷，推薦後先 preview、確認才 apply，跳過走 beginner；4 組 component tests、8 組 scoring tests 與 shop typecheck 通過。                                                                                      |
| 19  | skipped          | —                                                    | 純測試側墊片兩輪失敗：第一輪為測試 mock 路徑與 `@/lib` alias 解析錯誤；修正 mock 路徑後第二輪仍在註冊前拋 `ERR_MODULE_NOT_FOUND: @/lib`。依規停止並回滾 shim、Orders/Dashboard tests 與 monthlyProfitReport 試作，產品碼從未變更。 |
| 20  | done             | 本報告 commit                                        | 完成狀態、驗證、風險與老闆實機驗收卡；SELF_SHA256 可依本文規則重算。                                                                                                                                                               |

## 第 19 包完整失敗軌跡

### 第一輪

指令：

```text
node --experimental-test-module-mocks --import tsx/esm --test ../shop-app/src/test/dashboardPage.test.mjs ../shop-app/src/test/ordersPage.test.mjs
```

關鍵輸出：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from ...\dashboardPage.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\test\Dashboard' imported from ...\ordersPage.test.mjs
tests 2 / pass 0 / fail 2
```

已試方法：新增純測試 loader，把 JavaScript/TypeScript source 的 `import.meta.env` 換成測試全域值；補 `domBootstrap` 測試環境值；建立 Orders/Dashboard component tests。

### 第二輪

僅修測試 mock canonical path，未改產品碼，再執行同一指令。

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from ...\dashboardPage.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from ...\ordersPage.test.mjs
tests 2 / pass 0 / fail 2
```

裁決：Node 在 mock 註冊完成前解析 Vite alias；本包已達兩輪停止條件。所有試作以 patch 反向移除，`git status --short` 恢復零輸出。

## 最終總驗證

### 純測試全探索

執行範圍與 CI 相同：`lib/**`、`shop-app/src/lib`、`shop-app/src/test`、`api-server/src/lib`、API integration tests，排除 generated。

```text
PURE_TEST_FILES=65
tests 242
pass 242
fail 0
duration_ms 72656.2605
```

測試輸出中的 forced DB error 與 jsdom navigation 訊息均為既有判別案例；總程序 exit code 為 0。

### Typecheck

```text
corepack pnpm run typecheck:libs
> tsc --build
exit 0

corepack pnpm --filter @workspace/api-server run typecheck
> tsc -p tsconfig.json --noEmit
exit 0

corepack pnpm --filter @workspace/shop-app run typecheck
> tsc -p tsconfig.json --noEmit
exit 0

corepack pnpm --filter ./scripts run typecheck
> tsc -p tsconfig.json --noEmit
exit 0
```

## 老闆實機驗收卡

### A. 賣貨便匯出

1. 後台訂單頁挑一筆「未出貨＋7-11＋門市資料完整」的假單。
2. 打開賣貨便匯出，確認頁面列出合格／不合格原因與筆數。
3. 先匯出預設遮罩版；若要明文版，確認必須再勾明文確認。
4. 下載後核對欄序、溫層、商品、訂單金額與運費；不得使用真客戶資料做測試。

### B. 購物金 grant

本批 owner grant API 與 UI 已跳過，現在沒有安全入口可做實機 grant。不可直接改 DB 冒充驗收；需另開小包完成 owner-only API、二次確認、idempotency 與 audit 後再驗。

### C. 首登問卷推薦

1. 使用零技能的假店鋪開啟 Dashboard。
2. 完成四題，確認頁面先顯示推薦套餐與差異預覽，不會直接套用。
3. 按確認套用後回技能地圖核對；另測「跳過」只推薦 beginner 套餐。

## 風險與未解問題

1. `0022_order_store_credit.sql` 尚缺本批要求的拋棄式 PostgreSQL 實跑證據；程式與測試已通過，但在 Fable 5 補演練前不得套正式庫。
2. 購物金 owner grant/adjust API 與 UI 未完成，因此購物金目前只有底層帳本、訂單折抵與取消回沖鏈。
3. Orders／Dashboard component tests 與 monthlyProfitReport P3 測試仍待後續測試基建方案；本批沒有留下未驗證 spec。
4. 本批沒有 push，也沒有連 production／既有資料庫。

## 建議下一步

1. 先由 Fable 5 對本批做獨立審查，特別手算購物金折抵／回沖並補跑 migration `0022`。
2. 審查通過後再決定是否推送；不得把本報告視為 push 授權。
3. 另開極小包處理 owner grant API/UI；測試基建的 alias 問題獨立研究，避免再與功能包混在一起。

## BATCH-18 後續處理狀態

- 原第 1 項 migration `0022` 已由 Fable 5 在 BATCH-17 終審補做拋棄式 PostgreSQL 演練並 accepted；BATCH-18 未連 production 或既有 DB。
- 原第 2 項 owner grant/adjust API 與 UI 已補完：owner-only API 為 commit `b6ce2f6`，CustomerDetail 管理介面為 commit `a389855`，audit 記錄為 commit `2c73544`，完整生命週期 route 測試為 commit `dbf7e2a`。
- 原第 3 項 monthlyProfitReport 缺測已由 commit `5e587bb` 補齊。
- Orders／Dashboard component tests 仍未解。BATCH-18 包 5 的兩輪 harness 嘗試均失敗並已還原，未改 production code；因此依批次紀律，依賴該 shim 的包 6、7 也維持 skipped。

SELF_SHA256: 490e4f05b9023277decd864109751914f1132f5516b753063fe0d67956498c3f
