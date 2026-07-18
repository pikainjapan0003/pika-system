# BATCH-12 完工總報告

- 日期：2026-07-19（Asia/Taipei）
- 基準：`ebc242a`
- BATCH-11 推送：完成；current-HEAD CI 成功
- CI run：https://github.com/pikainjapan0003/pika-system/actions/runs/29656983721
- BATCH-12：每包獨立 commit；全批未 push

## 結論

BATCH-12 共 12 包：11 包完成、1 包依兩輪停止規則跳過。列印狀態、Dashboard 幣別、三處預覽 decimal、三組 44px 觸控區與兩個安全標頭均已落地；未改任何金額寫入、快照或成本公式。技能開啟即時顯示 E2E 因 Windows→Docker harness 兩輪都沒有真正進入 Playwright，已誠實跳過且未保留未驗證 spec。README 與操作手冊經複核沒有因本批產生過期敘述，因此包12不做無意義文字改寫。

## 逐包狀態

| 包                  | 狀態    | commit    | 交付與驗證                                                                                                                                        |
| ------------------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 技能入口 E2E 重試 | skipped | `e1362a4` | 兩輪 Docker harness 都未出現 Playwright 結果；完整指令方法與原文已落 `27-batch12-e2e-skill-visibility-harness.md`，產品碼與未驗證 spec 均未保留。 |
| 2 列印收據狀態字典  | done    | `84263dc` | 改用六態共用字典，補 `awaiting_payment`、移除 `confirmed/arrived`；相關測試 3/3，shop typecheck exit 0。                                          |
| 3 Dashboard 幣別    | done    | `ab2d268` | 採最小方案：`NT$`＋「商品小計」，不發明新計算；顯示 helper 測試 3/3，shop typecheck exit 0。                                                      |
| 4 預覽 ExactDecimal | done    | `dabee42` | 單品、購物車、後台編輯預覽改用共用 decimal helper；判別測試 4/4（含 `0.1 × 3`），寫入與快照鏈未動。                                               |
| 5 客人端 44px       | done    | `5b02e48` | PublicOrder／TrackOrder 指定控制提升至至少 44px；純 class 變更，shop typecheck exit 0。                                                           |
| 6 訂單卡 44px       | done    | `70b5e52` | 指定門市、模板、編輯、複製、列印、狀態與危險操作提升至至少 44px；二段確認保留，shop typecheck exit 0。                                            |
| 7 包貨清單觸控區    | done    | `00f17a5` | 列印與關閉提升至至少 44px；未偷做未拍板勾選流程，shop typecheck exit 0。                                                                          |
| 8 安全 headers      | done    | `34c74e8` | 全域加入 `Referrer-Policy: no-referrer` 與 `X-Content-Type-Options: nosniff`；真 Express HTTP 測試 2/2，api typecheck exit 0。                    |
| 9 Provider 測試評估 | done    | `1510f5c` | 確認現有基建缺 DOM／React renderer；未新增依賴，提出 `@testing-library/react`＋`jsdom` 後續最小包。                                               |
| 10 Prettier 分批一  | done    | `487adfa` | 僅 root／scripts／e2e 機械格式化；指定範圍 Prettier 全過、純測試 155/155、demo safety 6/6、scripts typecheck exit 0。                             |
| 11 審計文件同步     | done    | `759695b` | 14／15／17／21 檔同步狀態、金額、觸控區與安全標頭修復事實；四檔 Prettier 全過。                                                                   |
| 12 文件與總報告     | done    | 本 commit | README／操作手冊複核無過期敘述；新增本報告，完成全批總驗證並確認工作樹乾淨。                                                                      |

## 最終驗證原文末段

```text
typecheck:libs
> tsc --build
exit 0

api-server typecheck
> tsc -p tsconfig.json --noEmit
exit 0

shop-app typecheck
> tsc -p tsconfig.json --noEmit
exit 0

scripts typecheck
> tsc -p tsconfig.json --noEmit
exit 0

PURE_TEST_FILES=43
ℹ tests 155
ℹ pass 155
ℹ fail 0
PURE_EXIT=0

demoSeedSafety
ℹ tests 6
ℹ pass 6
ℹ fail 0

Prettier（root＋scripts＋e2e）
All matched files use Prettier code style!

git diff --check
無輸出
```

## Scope 與禁止事項核對

- 未動 migration、generated、`dev-handoff/*`、`.claude/*`。
- 未實作賣貨便匯出、購物金、首登問卷、包貨勾選或 S-16 Phase 2 後續。
- 未連 production／既有資料庫；本批測試均為純函式或本機 HTTP 假資料。
- 未執行 root typecheck。
- BATCH-12 commits 全數未 push；只有已獲准的 BATCH-11 在本批開始前推送。

## 風險與未解問題

1. 技能開啟後入口即時顯示仍缺一條真正執行過的 E2E；應改用獨立 Linux shell harness 或直接交由 GitHub Actions current-HEAD 執行，不能再把容器 exit 0 當成測試通過。
2. `StoreSkillVisibilityProvider` 的初載、背景刷新與競態仍只有純規則測試；若批准新增測試依賴，建議補 `@testing-library/react`＋`jsdom` Provider 級測試。
3. Prettier 僅清理 root／scripts／e2e；其餘既有欠帳仍依 `20-prettier-debt.md` 分批處理。
4. CSP、HSTS 與 frame policy 未加入，這是避免破壞既有 Clerk／Replit 載入的刻意範圍界線，不代表已完成全部部署安全標頭。
5. 包貨逐品項勾選仍待老闆決定狀態存本機或資料庫；本批沒有越權實作。

## 建議下一步

先交 Fable 5 依本報告複審 BATCH-12；通過後再一次推送本批 commits 並觀察 current-HEAD CI。下一個 coding 包若要補測試，優先做 Provider 測試基建與 Linux E2E harness；產品功能則繼續等待賣貨便、購物金、首登問卷與包貨勾選題卡拍板。
