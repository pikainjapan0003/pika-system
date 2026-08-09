# V1 包 19 完工報告：六項費基與 HEP 單件交通成本

日期：2026-08-09

工作目錄：`C:\Users\Lnovo\Desktop\pika-v1-phase19`

分支：`feat/v1-transport-fee-hep`

基底：`origin/main@29f40790a7d77d45af049cc2d17dae5830617e09`

## 結論

本批將 1.5% 手續費費基改為 ETC、電車、油資、停車、紙板與境內運送六項日圓成本全收，既有 override 語意及境內、交通兩段結構不變。HEP 以 `hep_total_jpy ÷ total_item_quantity × exchange_rate` 算成第三段單件台幣成本，僅在 HEP 有值但總件數缺少或不大於零時 fail-closed 為 `pending_confirmation / missing_hep_item_quantity`。三筆程式與測試 commit 均已完成；最終 DB routes 95/95，純測試 439 中 433 通過、6 條均依審批者 B 裁定為 shop-app jsdom 等待型 F-1，所有金額類測試 0 fail，四套 typecheck 皆 exit 0。本批未重算或回填既有訂單快照、未連 production DB、未操作 Replit、未 push。

## Commit 清單

| 順序 | Commit                                     | Subject                               | 範圍                                              |
| ---: | ------------------------------------------ | ------------------------------------- | ------------------------------------------------- |
|    1 | `ec3eb3e9ea1bf86f91cdf2bf939a363e8de733ba` | `transport-fee-all-six-jpy-items`     | 六項日圓費基、26.03 對帳與 Fixture A/B 回歸鎖     |
|    2 | `48725ab7349010820666507aa5734e179d5ca9fe` | `hep-per-item-in-transport-cost`      | HEP 第三段、fail-closed 與 product transport 接線 |
|    3 | `ee9c16cb44c547fa1604b20353df3d0cd6adece1` | `sync-downstream-profit-expectations` | 凍結快照與單件毛利下游測試期望同步                |
|    4 | 本檔提交時產生                             | `phase19-report`                      | 本報告、自校驗與最終驗收證據索引                  |

前三筆相對基底合計只改 8 檔：`lib/db/src/transport-cost/index.ts`、`productTransportCost.ts` 與六個相關測試檔；未改 schema、migration、generated、CI、`orderProfitSnapshot.ts` 或 `lib/db/src/operating-cost/`。

## 公式與精確值

修訂後公式：

```text
fee1_5Pct =
  (etcJpy + trainJpy + fuelJpy + parkingJpy + cardboardJpy + shippingJpy)
  × 0.015

domesticPerItem = (cardboardJpy + shippingJpy) ÷ estQty

transportPerItem =
  (etcJpy + trainJpy + fuelJpy + parkingJpy + fee1_5Pct) ÷ estQty

hepPerItemTwd =
  hepTotalJpy ÷ totalItemQuantity × exchangeRate

finalCostPerItem =
  (domesticPerItem + transportPerItem) × exchangeRate + hepPerItemTwd
```

全部運算沿用 `ExactDecimal`；沒有引入 `Number`、`parseFloat` 或浮點寫入。`fee1_5PctOverride`、`totalJpy`、`domesticPerItem`、`transportPerItem` 與 `finalCostPerItem` 的 override 入口與語意均未改。

關鍵對照：

- 26.03 新千歲空港主表 T22：`11.137087500000000`。
- Fixture A：`fee1_5Pct=394.005`、`totalJpy=26661.005`、`domesticPerItem=41.64444444`、`transportPerItem=106.47225`、`finalCostPerItem=29.47522219`、顯示 `29`。
- Fixture B：`fee1_5Pct=268.665`、`totalJpy=18179.665`、`domesticPerItem=46.85`、`transportPerItem=66.77290625`、`finalCostPerItem=22.61095834`。
- HEP 對照：`hepPerItemTwd=6.017910447761194`。
- Fixture A/B 均明確拒絕舊的少收費結果 `fee1_5Pct=112.44`，並標為「系統公式 regression lock，非 Sheet 對帳」。

## HEP fail-closed 規則

- `hepTotalJpy` 未填：`hepPerItemTwd=0`，結果仍可為 ready。
- `hepTotalJpy` 有值且 `totalItemQuantity` 為 `NULL`、`0` 或無效：回 `pending_confirmation / missing_hep_item_quantity`。
- HEP 為負數：沿用既有非負 ExactDecimal 驗證並拋錯。
- 手動 override 不得繞過缺少 HEP 件數的 pending gate。
- HEP 是路線換算後額外加入的第三段台幣成本，不被重複納入 1.5% 日圓費基。

## A. HEP 上線的活資料影響

`trips.hep_total_jpy` 與 `trips.total_item_quantity` 是兩個獨立可空欄位。Schema 沒有「有 HEP 就必須有件數」的交叉約束，而且 `total_item_quantity` 的 CHECK 允許 `0`。

合併後，若既有行程的 `hep_total_jpy` 有值，但 `total_item_quantity` 為 `NULL` 或 `0`，其下尚未凍結的商品毛利會改為 `pending_confirmation / missing_hep_item_quantity`，不會把缺值默認為零。已 captured 的訂單快照是持久化資料，本批沒有重算或回填路徑，因此不受影響。

Owner 在合併前必須於 production 執行以下唯讀計數；本輪沒有連線或代為執行：

```sql
SELECT count(*)
FROM trips
WHERE hep_total_jpy IS NOT NULL
  AND (total_item_quantity IS NULL OR total_item_quantity = 0);
```

若結果大於 0，應先補齊對應行程的總件數，再讓未凍結商品進入新公式。

## B. 技術債 F-6：獨立 HEP helper 尚無生產消費者

`lib/db/src/operating-cost/hepCost.ts` 的 `calculateHepCost` 目前只有定義與測試，生產端消費者為 0。本包未刪除、未修改該 helper；實際產品接線只在 `transport-cost` 內完成。

因此目前不存在 `calculateHepCost` 與 transport-cost 同時扣除 HEP 的雙重計算風險。未來若要啟用該 helper，必須先明確定義唯一消費者與兩條計算路徑的去重規則。

## C. 技術債 F-1：jsdom 牆鐘等待不穩定

失敗數會隨整套測試耗時與機器負載擴散：

| 樣本 | 總耗時 | jsdom 等待失敗 |
| ---- | -----: | -------------: |
| base | 268 秒 |              3 |
| run3 | 289 秒 |              6 |
| 首輪 | 352 秒 |              9 |
| run2 | 504 秒 |             14 |

跨越反例：同一條 JPY conversion preview 曾在分支耗時 3188ms 時通過，卻在 base 耗時 2263ms 時失敗，證明單次耗時較短並不代表必然通過。`tripEstimatePage.test.mjs:150` 的 `waitForCondition` 使用固定 1500ms 牆鐘、每 10ms 輪詢，結果受 CPU 排程與同程序負載影響。

run3 的 6 條失敗包含 5 條 `tripEstimatePage` `renderPage(:168)` 等待逾時，以及 1 條 `maihuobianExportPanel` 的 Testing Library `waitFor` callback 逾時；後者逾時當下 DOM 仍停在「檢查中…」非終態。審批者 B 依機制定義裁定六條全屬 F-1，不阻塞。本批不修改測試、timeout、skip 或 retry，F-1 留待獨立測試基建包。

## D. Docker baseline 與清理判準

Docker volume 是機器全域共享狀態，絕對數不是本批可控制的不變量。判準已改為：

- 主閘門：以本批 label 篩選 container 與 volume，清理後必須各為 0。
- 診斷層：記錄本輪 preflight/postflight total volume 差量，但不以絕對數否決。

run3 實測：

- preflight total volumes：134。
- postflight total volumes：134。
- 差異：0。
- `label=v1.phase19.final=true` 清理後 containers：0。
- `label=v1.phase19.final=true` 清理後 volumes：0。
- 未執行 `docker volume prune`，未刪除任何外部資源。

收尾 typecheck 使用獨立 `label=v1.phase19.typecheck=true` node-only 容器，未建立 PostgreSQL 或具名 volume；清理後 label containers=0、label volumes=0，total volumes 仍為 134。

## E. 派工單錯誤紀錄

本批產品程式碼從未出錯，六次停工均源於派工單或驗收規格缺陷：

1. T-10「既有 Fixture 精確值不變」與 D1 六項全收的數學結果互斥。
2. 下游隱藏的第二層斷言未列出，共 5 個需同步的新公式數字。
3. 顯示值字面值 `"187"` 未列出；新結果跨過 half-up 的 0.5 邊界後正確值為 `"186"`。
4. 「volume 必須回到 130」誤把機器全域共享狀態寫成本批不變量。
5. 驗收順序與 `ci.yml` 相反，令需要 schema 的 integration tests 在空庫執行並產生 42P01。
6. F-1 簽名被寫成特定錯誤字串列舉，而非等待機制定義，誤擋 Maihuobian 的 `waitFor` callback 逾時。

結論：本批的瓶頸是規格簽發品質，不是實作品質。所有衝突均先停止、取得裁決後才續行，沒有自行猜測或擴大白名單。

## F. 最終驗收證據索引

run3 證據目錄：`C:\Users\Lnovo\Documents\Codex\2026-08-09\phase19-final-evidence-run3`

| 證據                        | SHA-256                                                            | 結果                                                    |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| `prettier.log`              | `17AA973D3F004560237D9A95171210B0671DEFF23D61628EECF7322FF5938F20` | 全 repo Prettier 通過                                   |
| `schema-push.log`           | `D4A96111C4F4754FCE1D05E0505C22F2F3FD49D39D1C5CEF4A81EB212A14A8DF` | Drizzle schema changes applied                          |
| `schema-seed.log`           | `460C2EFF4CF747BAD7F5C8822C3089037BD405777939712C267A30970B5C26E1` | fixed=11、variable=7、purchase=1、total=19、singleton=1 |
| `schema-guard.log`          | `3CE194E7E8109AE76CDFB40C1D747AA01C65C99AC8A0F8AE49B30DC43081624A` | `V1_FIXED_COST_SCHEMA_GUARD=PASS`                       |
| `database-routes-final.log` | `9046026CC7F3C1094143C21572D97A0B60FDD9210CD9298CE1E7E4916FA7C324` | 95/95 pass、0 fail、0 skipped                           |
| `pure-tests-final.log`      | `69EA8CBC9497C7741EFA24AE3E7269F794F227B1B3B2B28401E8A07CD84C0EA5` | 439 tests、433 pass、6 個 F-1、金額類 0 fail            |

Typecheck 證據目錄：`C:\Users\Lnovo\Documents\Codex\2026-08-09\phase19-typecheck-evidence`

| Typecheck  | Exit | Log SHA-256                                                        |
| ---------- | ---: | ------------------------------------------------------------------ |
| libs       |    0 | `18DC1FDA5AED7851799A3BC5C0B56E15E3CE78C1FB26D94987838DA16866A060` |
| api-server |    0 | `0CB5E07E90993D5811599446BAD29A4193AF887D8DD9D884787AF5E9F3D222CF` |
| shop-app   |    0 | `BFCE589EA09407A6DCBEDFCCC9B287552E3096BA00BEB2242CACBBB04637CB5B` |
| scripts    |    0 | `A7D4A582BC395399E1BA40675C69C809BABBED17555581ED42A9B53D267E9C53` |

## 快照與禁區核對

- `lib/db/src/transport-cost/orderProfitSnapshot.ts` 本批零修改。
- `calculateOrderProfitSnapshot` 仍只在建立或明確 backfill 流程計算；沒有新增重算 captured 快照的路徑。
- `captured order stays frozen when the current store rate changes` 與 DB route 的 frozen snapshot 案例全綠。
- 本批沒有 migration、schema、generated 或 CI 變更。
- 本批沒有修改 `lib/db/src/operating-cost/`。
- 沒有連 production／既有 DB；所有 DB 驗證均使用全新 `postgres:16-alpine` 拋棄庫。
- Build 與 Playwright 本機未驗，依既定 Windows/Linux 邊界留待 push 後 CI；本報告不宣稱已通過。

## Git 與發布狀態

- 報告建立前 HEAD：`ee9c16cb44c547fa1604b20353df3d0cd6adece1`。
- 報告建立前相對 `origin/main`：0 behind / 3 ahead。
- 完成後應為 0 behind / 4 ahead，工作樹乾淨。
- 未 push；等待 Owner 授權與 push 後 current-HEAD CI。
- 未操作 Replit／Republish。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

PowerShell 重算指令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 72f04c4cf42f263850beedc6e0dfa4266a5250c87c3ad9c8d1ecf0be21c34756
