# BATCH-14 完工總報告

- repo：`C:\Users\Lnovo\Desktop\pika-system`
- 日期：2026-07-19
- 開跑基準：`26c2d24`（符合派工單要求）
- 推送狀態：本批全程未 push
- 禁區核對：未動 generated、migration、金額寫入／計算邏輯、trips S-09 gate、`.gitattributes`、S-16 Phase 2、`dev-handoff/`

## 逐包結果

| 包                                  | 狀態    | commit                    | 驗證／原因                                                                                                                             |
| ----------------------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0 CI 探索 BATCH-13 測試             | done    | `1b9c124`                 | YAML parse PASS；CI 同款探索 48 檔、171 tests、0 fail；diff 僅 `ci.yml`。                                                              |
| 1 E2E 容器 harness 第三法           | skipped | `7f1a1c8`（只記軌跡）     | 兩輪分別卡在 Windows→WSL／Docker 指令轉交與環境交接；未取得 Playwright 結果原文，腳本已刪，27 檔如實補軌跡。                           |
| 2 技能入口 E2E                      | skipped | —                         | 包1未過前置門檻；未建立、未 commit 未驗證 spec。                                                                                       |
| 3 月報頁 E2E                        | skipped | —                         | 包1未過前置門檻；未建立、未 commit 未驗證 spec。                                                                                       |
| 4 客戶匯出 E2E                      | skipped | —                         | 包1未過前置門檻；未建立、未 commit 未驗證 spec。                                                                                       |
| 5 訂單編輯預覽 E2E                  | skipped | —                         | 包1未過前置門檻；未建立、未 commit 未驗證 spec。                                                                                       |
| 6 SkillMap 高風險 component 測試    | skipped | —                         | 兩輪皆 2/3；第一案例在 UI 前置條件「缺前置」即停止，無法真正抵達二段確認，暫存測試已刪。                                               |
| 7 EditOrderDialog component 測試    | skipped | `5a986d6`（只出阻礙報告） | 兩輪皆在 render 前被 Node ESM 的 `.png` import 擋下；無未驗證測試殘留，阻礙記於 32 檔。                                                |
| 8 moneyPreview 邊界                 | done    | `63b5e9b`                 | 7 tests、0 fail；unsafe／0／負 quantity、垃圾／空白價格與多品項 `unitPrice="0"` 現況均鎖住。                                           |
| 9 Provider stale request            | done    | `6d54a3c`                 | 5 tests、0 fail；舊請求完成後以 120ms 有界反向視窗確認狀態不翻轉。                                                                     |
| 10 public 限流 route                | done    | `772a725`                 | 拋棄式 PostgreSQL 實跑 2/2：建單第21次與追蹤第31次均 429，回應僅含安全 `error`。                                                       |
| 11 skills 負向盤點補缺              | done    | `b83915d`                 | 拋棄式 PostgreSQL 6/6：過期 catalog、前置未滿足、高風險未確認、套餐過期／未知等負向均通過。                                            |
| 12 出貨／物流狀態對照               | done    | `1c533f0`                 | 新增 29 檔；逐值列語意、寫入點與「未出貨」關係，未定新規則。                                                                           |
| 13 token 生命週期                   | done    | `70b3428`                 | 新增 30 檔；撤銷、輪替、有效期 A/B/C、影響、保守預設與題卡齊全。                                                                       |
| 14 手冊技能鎖 FAQ                   | done    | `663c21d`                 | 以非技術語言補「為何看不到」與實際按鈕步驟；Prettier 通過。                                                                            |
| 15 shop-app Prettier 清零           | done    | `28e63dc`                 | 149 檔盤點、112 檔純格式；固定點 hash 相同；shop typecheck、47 檔／172 tests 全綠。                                                    |
| 16 api-server／殘餘 Prettier 清零   | done    | `c01ff65`                 | 180 檔盤點、115 檔純格式；generated 誤觸在 commit 前完整還原，`FORBIDDEN_DIFF=0`；api/mockup typecheck 與 125 條非 DB route 測試全綠。 |
| 17 行號基準／債務歸零               | done    | `a7d899c`                 | 14/15/16/17/21 檔補歷史行號基準；20 檔記錄兩個格式 commit，欠帳歸零（generated 豁免）。                                                |
| 18 CI Prettier gate                 | done    | `27e0657`                 | 全 repo 本機 gate exit 0、YAML parse PASS；以 `--end-of-line auto` 相容 Windows CRLF，未碰禁止的 `.gitattributes`。                    |
| 19 audit/customers 授權負向         | done    | `c3a643f`                 | 盤點後只補缺口；拋棄式 PostgreSQL 6/6，詳情／匯出未登入、匯出跨店、audit-log 未登入／跨店均拒絕。                                      |
| 20 demo awaiting_payment            | done    | `c3e667b`                 | safety 7/7；拋棄庫首跑成功，實查 5 張單含 `awaiting_payment`＋captured 快照；重跑 exit 1 被冪等守衛拒絕；容器清除。                    |
| 21 README／手冊同步                 | no-op   | —                         | 包1未成功，不寫不存在的 harness 用法；手冊需補內容已由包14完成。                                                                       |
| 22 匯率 Hint component 測試         | skipped | —                         | 兩輪分別缺 shop cwd 的 `tsx` loader、缺 CI tsconfig alias 而無法載入 `@/lib`；依條件包規則刪除暫存測試。                               |
| 23 TrackOrder 末五碼 component 測試 | done    | `0a34550`                 | CI 同款 loader＋shop tsconfig 實跑 2/2；拒絕訊息與成功回傳 `54321` 更新值均驗證，shop typecheck 通過。                                 |
| 24 完工總報告                       | done    | 本 commit                 | 本檔逐包紀錄、SHA-256 可重算；commit 後再確認工作樹。                                                                                  |

## 最終驗證原文摘要

```text
lib pure tests
tests 63
pass 63
fail 0

shop-app pure/component tests
tests 55
pass 55
fail 0

api-server pure tests（分組一）
tests 36
pass 36
fail 0

api-server pure/integration tests（分組二）
tests 20
pass 20
fail 0

總計
PURE_TEST_FILES=48
tests 174
pass 174
fail 0

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

mockup-sandbox typecheck
> tsc -p tsconfig.json --noEmit
exit 0
```

## 實庫演練摘要

```text
包19：customersAndProfitIsolation.route.test.mjs
tests 6 / pass 6 / fail 0

包20：demo seed
DEMO_SEED_OK
awaiting_payment | demo-order-awaiting-payment-... | captured

第二次執行
DEMO_SEED_FAILED Demo data already exists (8 matching rows); rerun with --append only if duplication is intentional
Exit status 1

容器殘留
0
```

## 風險與未解問題

1. Windows 本機仍沒有可用的 Playwright Docker harness；因此包2–5 按鐵律沒有留下未實跑 spec。
2. SkillMap 高風險案例的第一條測試被真實前置條件擋住，需先建立能滿足前置的 component fixture，不能以弱化條件繞過。
3. EditOrderDialog 的 `.png` ESM 載入與匯率 Hint 的 tsconfig alias 啟動方式仍是本機 component harness 技術債；本批不改 production code 解測試問題。
4. 本批未 push；`origin/main` 仍停在 `ebc242a`。總報告 commit 前本地相對 origin ahead 42，完成包24後預期 ahead 43（含早先已存在的未推 commits）。

## 建議下一步

先交 Fable 5 終審。通過後再依老闆指示一次推送，讓 current-HEAD CI 的新 Prettier gate、DB route 測試與新增 component 測試在 Linux runner 完整驗證；CI 綠後才進 Replit Republish。

## SHA-256

重算規則：讀取本檔原始 bytes，雜湊範圍自第一 byte 起，至最後一行 `SELF_SHA256:` 的 `S` 之前（不含最後一行）。演算法為 SHA-256。

SELF_SHA256: 735374fa753b98a418ed911f5eac3a844ad4cb11a6d709e6a5469ef14ed92d16
