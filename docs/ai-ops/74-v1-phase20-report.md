# V1 包20 完工報告

日期：2026-08-10
基底：`origin/main@c257a3f6aeafe4cb6dfd351c870b456163ed201d`
分支：`feat/v1-hep-days-and-park-split`

## 結論

本批完成 D3 HEP 天數 4–14 與 D6 固定成本樂園門票拆分。HEP 的 migration、Drizzle schema 與 API validator 已一致接受整數 4–14，牌價表依 Owner 提供的官方現值補滿十一階，10 天由牌價 `19200` 更新為 `19300`；歷史實付 `19200` 與既有快照均未改動。固定成本由 11 項拆為 12 項，seed 後分類為 FIXED 12／VARIABLE 7／PURCHASE 1／total 20。

最終驗收使用 Node 24、pnpm 10.34.4 與全新 PostgreSQL 16 拋棄環境，依 CI 順序完成：codegen drift 無內容差異、Prettier 通過、schema push／seed／guard 通過、DB routes 97/97、pure suite 440/440、四套 typecheck 全部 exit 0。Docker 任務資源依 `v1.phase20=true` label 清理為 containers／volumes／networks 0／0／0；未連 production／既有 DB、未操作 Replit、未 push。

## Commit 清單

| 次序 | SHA                                        | Subject                        | 範圍                                                          |
| ---: | ------------------------------------------ | ------------------------------ | ------------------------------------------------------------- |
|   C1 | `8eb5ada2e0b6b88eb2054fdfce445ba222d66ae3` | `hep-days-four-to-fourteen`    | 0035、HEP 三層契約、十一階牌價與 API／DB 測試                 |
|   C2 | `ebb7e35f5fcdf5602d226d7fb1df119d6133fa00` | `fixed-cost-park-split-twelve` | 0036、12 項 seed、CI guard、UI 文案與一致的 component fixture |
| 報告 | 本提交                                     | `phase20-report`               | 本報告與 `SELF_SHA256`                                        |

## A. D3：HEP 天數 4–14

### HEP 契約三層對齊

| 層級           | 改前            | 改後                               |
| -------------- | --------------- | ---------------------------------- | ------------ | --- | -------------- | ----------------------------- |
| migration      | `IN (4, 5, 10)` | `hep_days >= 4 AND hep_days <= 14` |
| Drizzle schema | `IN (4, 5, 10)` | `hepDays >= 4 AND hepDays <= 14`   |
| API validator  | `parsed === 4   |                                    | parsed === 5 |     | parsed === 10` | `parsed >= 4 && parsed <= 14` |
| 牌價表         | 3 階            | 11 階；4–14，10 天 `19200 → 19300` |

`openapi.yaml` 無 `hepDays`，本批不需要 codegen；此事由審批者 B 全庫掃描確認，執行端亦以 repo 搜尋複核沒有第四個 enum、zod schema 或 UI 下拉選項。

### 0035 CHECK

`lib/db/migrations/0035_hep_days_four_to_fourteen.sql` 先刪除舊 `trips_hep_days_valid`，再以範圍式 CHECK 重建。`lib/db/src/schema/trips.ts` 使用相同範圍條件，避免 CI 的 schema push 與 production 手寫 migration 形成不同契約。

API route 與 DB CHECK 分層測試：

- API：4、9、14 成功；3、15 回 400；`null` 成功且 DB 回讀仍為 SQL NULL。
- DB：直接寫入 4、9、14、NULL 成功；3、15 精確以 PostgreSQL `23514` 與 constraint `trips_hep_days_valid` 拒絕。
- 最終 DB route suite 因新增上述兩條案例，由基建包 F 的 95 條增加為 97 條，結果 97/97。

### HEP 十一階牌價

來源：<https://www.jprentacar.com/tw/rentacars/hep>

牌價擷取日：2026-08-10。

| 天數 |   JPY |
| ---: | ----: |
|    4 |  7700 |
|    5 |  9600 |
|    6 | 11600 |
|    7 | 13500 |
|    8 | 15400 |
|    9 | 17200 |
|   10 | 19300 |
|   11 | 21200 |
|   12 | 23100 |
|   13 | 25000 |
|   14 | 27000 |

本表只供填表輔助；每趟實付仍以 `trips.hep_total_jpy` 為準，日後牌價調整不會改寫既有行程。

### `19200 → 19300` 影響範圍複查

執行端與獨立唯讀代理分別搜尋 `19200`、`HEP_TOTAL_JPY_BY_DAYS` 與 `resolveHepTotalJpy`：

- 牌價改動只落在 `hepRates.ts`，測試只需更新 `hepRates.test.mjs` 的表格值與 resolver 值。
- helper 除 `operating-cost/index.ts`、`lib/db/src/index.ts` re-export 外，生產端消費者為 0。
- `transport-cost.test.mjs`、`productTransportCost.test.mjs`、`hepCost.test.mjs` 與 68 號報告中的 `19200` 是歷史實付或測試直接輸入，不經牌價 helper，全部保持不變。
- 26.03 試算表 D63 的 `19200` 是該趟歷史實付，不是今日牌價，不得修改。

高風險對照：10 天「牌價輔助值」現在解析為 `19300`；已存在行程若明確存有 `hep_total_jpy=19200`，交通成本仍使用該筆 `19200`，不會被 helper 重算或覆寫。

### F-7：HEP 無 UI 寫入路徑

`artifacts/shop-app` 搜尋 HEP／hep 為零命中；目前 `hep_days` 與 `hep_total_jpy` 的唯一產品入口是 `PATCH /trips/:id/operating-inputs`。本批未順手新增 UI，依凍結規則登記至包23；屆時 `hep_days` 應使用 4–14 下拉選單。

## B. D6：固定成本 11 → 12

### 五處連帶更新

| 項目                    | 改前                                                  | 改後                                                                    |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| seed schema             | `THEME_PARK／樂園門票費用`                            | `THEME_PARK_DISNEY／迪士尼門票費用`＋`THEME_PARK_USJ／環球影城門票費用` |
| CI FIXED 清單           | 11 codes                                              | 12 codes，兩個新 code 取代舊 code                                       |
| CI 總數 guard           | `rows.length !== 19`                                  | `rows.length !== 20`                                                    |
| TripEstimate 標題       | `固定費用（11 項）`                                   | `固定費用（12 項）`                                                     |
| component fixture／斷言 | fixed 11、VARIABLE id 12 起、PURCHASE id 19、input 11 | fixed 12、VARIABLE id 13 起、PURCHASE id 20、input 12                   |

其他 10 個 FIXED 分類的 code、名稱與相對順序未改；VARIABLE 7 項與 PURCHASE 1 項也未改。seed 計數程式未修改，實跑原文為：

```text
V1_COST_DEFAULTS_SEEDED fixed=12 variable=7 purchase=1 total=20 operating_settings_id_1=1
```

### component fixture 假綠風險

若只把標題改成「固定費用（12 項）」而不更新 fixture，測試仍提供 11 筆 FIXED，input count 也仍斷言 11，因此標題顯示 12、資料實際 11、數量斷言 11 會恰好全綠，沒有驗到 D6。若只把 fixed length 改成 12，VARIABLE 第一筆又會與 fixed 最後一筆共用 id 12。故五個機械值必須同步更新，才能鎖住 12／7／1 與唯一 fixture id。

### 0036 fail-closed 與冪等設計

`0036_theme_park_split.sql` 使用 transaction：

1. 刪除 `THEME_PARK`；若任何 `cost_entries.category_id` 仍引用它，`ON DELETE RESTRICT` 會令整個 transaction 失敗並回滾，不猜測該筆應屬 Disney 或 USJ。
2. 以 `ON CONFLICT DO NOTHING` 插入兩個新 FIXED 分類。
3. 透過 canonical `VALUES` 對存在的 code 絕對指定 `sort_order`；不存在的 VARIABLE／PURCHASE 自然 no-op。
4. 只自驗本檔負責的範圍：舊 code 消失、FIXED=12、兩個新分類的 name／kind／sort_order 精確；不驗全域 total。

不用相對 `+1`，因舊 code 已不存在時重跑會再次推移排序；絕對指定使 0036 可重複執行且維持原狀。也不在 migration 重複 INSERT VARIABLE／PURCHASE，避免與 seed 建立第二個真相來源。

在 delta DB 先機械還原為包20前狀態，再執行 0035／0036：首次 `DELETE 1／INSERT 2／UPDATE 20`，第二次為 `DELETE 0／INSERT 0／UPDATE 20` 並成功。最終 FIXED=12、total=20、legacy=0，兩個新分類名稱、種類、排序精確。

## C. schema 與 migration 一致性

CI 路徑使用 current schema `push-force`：schema push 成功、seed 產生 12／7／1／20、schema guard 印出 `V1_FIXED_COST_SCHEMA_GUARD=PASS`。

手寫 migration 的本批 delta 則在獨立 DB 驗證：先以 current schema 建庫並 seed，再機械還原為包20前的 HEP CHECK、舊 theme code 與 1–19 排序，接著套用 0035／0036並回讀。結果與 current schema／seed 完全一致，且0036重跑冪等。

### F-8：migration 鏈與 seed 漂移

嘗試從空 DB 依序執行全部手寫 migrations 時，既有 `0001_seller_agent_settings.sql` 即因 `stores` 表不存在而失敗。靜態複查亦確認 `0031_cost_categories.sql` 只建立11個FIXED分類，VARIABLE 7項與PURCHASE 1項從未進任何migration，只存在於 `seedFixedCostDefaults.ts`。因此單靠 `migrations/` 從零執行會得到殘缺或不可建立的系統；目前CI無事是因為採schema push＋seed。

本批不修F-8，只登記。0036刻意不驗total=20、也不重複定義其他8個分類，以免擴大成migration基建重整。

## D. 最終驗收

驗收環境：`node:24-bookworm`、Node 24、pnpm 10.34.4、`postgres:16-alpine`。repo唯讀掛載後複製至容器工作目錄，DB為本批新建拋棄庫。

| 步驟                 | 結果                                                    |
| -------------------- | ------------------------------------------------------- |
| frozen install       | success                                                 |
| codegen drift        | corrected harness下exit 0，generated內容零差異          |
| Prettier             | `All matched files use Prettier code style!`            |
| schema push          | `Changes applied`                                       |
| seed                 | fixed=12／variable=7／purchase=1／total=20／singleton=1 |
| schema guard         | `V1_FIXED_COST_SCHEMA_GUARD=PASS`                       |
| DB routes            | 97 tests／97 pass／0 fail／0 skipped                    |
| pure suite           | 440 tests／440 pass／0 fail／0 skipped，預設併發        |
| typecheck:libs       | exit 0                                                  |
| api-server typecheck | exit 0                                                  |
| shop-app typecheck   | exit 0                                                  |
| scripts typecheck    | exit 0                                                  |

DB routes與pure suite各只執行一次，沒有filter、retry、concurrency flag、timeout修改或F-1豁免。

`pure-tests.log`另有兩筆jsdom `Error: Not implemented: navigation (except hash changes)` diagnostic，來源是`customersPage.test.mjs`下載CSV後`<a>` navigation未由jsdom實作、透過VirtualConsole轉送至stderr。這兩筆不是test failure：node:test仍為440 cases、JUnit failure／error／skipped均為0，且無`not ok`；已驗收的基建包F 440/440基線log（SHA-256 `91A2C07063CF74FC9F6D4B1B5B0A28079BF04B35787F9EFB57C7BE84DCA383AE`）也精確出現同型、同數兩筆。本批未修改Customers頁或其測試；此項屬既有non-failing stderr noise，不是F-1等待逾時豁免，也不構成jsdom測試紅燈，但在此如實揭露。

### codegen驗收harness更正

容器內以新Git repo建立驗收基線時，NTFS唯讀掛載令generated `.ts`全被暫存index記為`100755`；Orval正常重建為`100644`後，第一次guard顯示77檔mode-only差異，`0 insertions／0 deletions`。這不是內容drift。執行端沒有修改repo或CI，而是在同一驗收容器設定暫存Git `core.fileMode=false`、restore generated並確認status為空，再執行corrected guard；官方codegen與兩個target成功，內容diff為零。第一次假紅與corrected綠燈log皆保留。

測試建立的容器Git唯一差異是CI命令產生的未追蹤`test-results/`；source與generated均無漂移。

## E. Docker 資源

| 階段       | label containers | label volumes | label networks | total volumes |
| ---------- | ---------------: | ------------: | -------------: | ------------: |
| preflight  |                0 |             0 |              0 |           134 |
| postflight |                0 |             0 |              0 |           134 |

所有本批資源均帶`v1.phase20=true`，只依該label精確刪除；未使用`docker volume prune`、未用名稱萬用字元刪除，也未碰觸buzz-\*或其他外部資源。

## F. 證據索引

證據目錄：`C:\Users\Lnovo\Documents\Codex\2026-08-10\v1-phase20-final`

| 證據                                       | SHA-256                                                            | 結果                             |
| ------------------------------------------ | ------------------------------------------------------------------ | -------------------------------- |
| `preflight.log`                            | `6AEBA04FA48AFF31E223C57FF0B8F44C705FC0C3044F7919A91311DF5F787845` | label 0／0／0，total volumes 134 |
| `install.log`                              | `50BA62582B1705084B6AA813987F91C20DBCFF687F01DB7285831F525410DC09` | frozen install成功               |
| `codegen-drift.log`                        | `582EE0BD3CCECFE90483C17B13904B153BADFEC29FE51E5C7A9AE82AA9872889` | 初始harness 77檔mode-only假紅    |
| `codegen-harness-status-after-restore.log` | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` | correction前基線乾淨             |
| `codegen-drift-corrected.log`              | `04F3D53183109DDDA91DECB73F9E1BC4AF66AFEF87667CEFA3C3D1FCD5C77CB9` | official codegen與guard exit 0   |
| `prettier.log`                             | `34D14F3148327930C85AEA9BD84BB3425F7BF68B5DD00285F38724E35028B73D` | 全repo Prettier通過              |
| `schema-push.log`                          | `0B12CBDDE58CD5D7BAA0245DEEB3A2DED7B61FBF3CC3FF977B23EB35F751C6E7` | schema push成功                  |
| `schema-seed.log`                          | `29DF5097AA93A57C7D5C9A263DCD237EC6FFBC008849ADE6DDAECCFA5C965A1C` | 12／7／1／20／singleton=1        |
| `schema-guard.log`                         | `6E0BF69EC8F82CFC1CBB80796248E002A27BA0FC2FD662E59A309187C85A803A` | guard PASS                       |
| `migration-delta-apply.log`                | `7B7CF5575CC8EEA540B5D1A085BA4A2D6BB2E85296636B36702C0CEA8594F3E0` | 0035／0036成功                   |
| `migration-delta-0036-rerun.log`           | `B7AB2599CA4DECD46D2953669792C57D7DE9E0AB26C856F1045A30AC102C1374` | 0036重跑成功                     |
| `migration-delta-verify.log`               | `66F2FD9AA27B7DE034DBBFB1319DBB1CA8649DBD6D8381B7A0E2967D547A7308` | category與HEP CHECK回讀通過      |
| `database-routes.log`                      | `EA270C3F80FA0411EC1FA0A2B411D3259C2F4D7F37C89027FDEFB4A4BC84C21E` | 97/97                            |
| `database-routes.junit.xml`                | `08B34F144869BD93B94CF8F82AF0CA9387CAA244CB2D707F8F8E5CAD84D8EF88` | DB JUnit                         |
| `pure-tests.log`                           | `F20B13E69C2E70CBA8596BFBF6D8F38E562FFE08266BAF612AADBC3A2CAF405C` | 440/440                          |
| `pure-functions.junit.xml`                 | `C441D4096584F0D154FA82B00A799D09ADE8B155456A8A781805FE67DABA3668` | pure JUnit                       |
| `typecheck-libs.log`                       | `C343189B7F304AD088C9ADC8AC6997FFB54435C1C90C7BBDDCB3751EDC2086D2` | exit 0                           |
| `typecheck-api-server.log`                 | `AD5E517F001F8CDD4BE4B0C6B0CA43C228B229F203C4AB8620429AF97A7AA957` | exit 0                           |
| `typecheck-shop-app.log`                   | `17521EC367A5C295EC025A3570DE0D06CA6466BE3411F124D949DD96574E615F` | exit 0                           |
| `typecheck-scripts.log`                    | `D4C8907F187BCB08A99E371D5E4DBDB66795356420B58CEA6BFD8F8E1AA41E97` | exit 0                           |
| `postflight.log`                           | `626A08C544055370A1A83836E675780300E69D4CDFADE50CC2A4C141928D07D8` | label 0／0／0，total volumes 134 |

## G. 未驗項與發布狀態

Build與Playwright本機未驗，留待push後current-HEAD CI；本報告不宣稱通過。

- 未連production／既有DB。
- 未操作Replit／Republish。
- 未push；等待Owner授權。
- 報告前相對`origin/main`為0 behind／2 ahead；完成後應為0 behind／3 ahead。

## SELF_SHA256

重算規則：讀取本檔UTF-8原始bytes，刪除整行`SELF_SHA256:`（含換行）後計算SHA-256。

PowerShell重算指令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 3d96363a6221ba5ae81f06ceea49225f9193e0cd373db4a8da870ea7eb6dd9cd
