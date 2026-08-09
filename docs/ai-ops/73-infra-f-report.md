# 基建包 F 完工報告

日期：2026-08-10
基底：`origin/main@10d8d886b656ac880ed181acef69b9a4bab8b8c4`
分支：`fix/infra-test-clock-and-codegen-guard`

## 結論

本包修復 shop-app jsdom 測試的牆鐘假紅、補上 OpenAPI codegen 漂移防護並統一 CI 的 17 條 DB route test 縮排。最終驗證以 Node 24、pnpm 10.34.4 與全新 PostgreSQL 16 拋棄庫依 CI 順序執行：patched codegen 正向無漂移、Prettier 通過、schema／seed／guard 通過、DB routes 95/95、pure suite 440/440，四套 typecheck 皆 exit 0。所有 Docker 資源均只依 `infra.f=true` label 清理至 0；未連 production／既有 DB、未操作 Replit、未 push。

## Commit 清單

| 次序 | SHA                                        | Subject                             | 範圍                                      |
| ---: | ------------------------------------------ | ----------------------------------- | ----------------------------------------- |
|   C1 | `bfe8facb4577dfb79610c2b96e8452312a7c0767` | `test-wall-clock-resilience`        | 初始牆鐘變因與 tripEstimate 15 秒上限     |
|   C2 | `423f9791d4bf76ad45a521d39bf9a12dc45e679e` | `ci-codegen-drift-guard`            | codegen 漂移閘門與 17 條 route 縮排       |
| C2.1 | `c29b6afba3d9f9106cd8122a6dc4640be6b5de39` | `ci-codegen-guard-untracked-fix`    | intent-to-add 補上 untracked 新檔偵測     |
|   C5 | `0c38541c3becfe7aa2ef11d8c9a980a1f89b7ba5` | `fix-dom-bootstrap-configure-order` | DOM 安裝後同步 configure 與共用實例 probe |
|   C4 | `18a036bd0d5fdaa138cbe96beed12929bd836b2a` | `fix-phase18-flaky-attribution`     | 更正 71 號報告的 F-4 錯誤歸因             |
| 報告 | 本提交                                     | `infra-f-report`                    | 本報告與 SELF_SHA256                      |

## A. F-1 完整診斷與最終根因

### 決定性對照

| 樣本                                 | 併發          | domBootstrap 靜態 RTL configure | tests | pass | fail |   duration_ms |
| ------------------------------------ | ------------- | ------------------------------- | ----: | ---: | ---: | ------------: |
| 基建包 F 第一輪 run1                 | Node 預設     | 有                              |   439 |  422 |   17 | 281415.532571 |
| 第二輪 Run A                         | concurrency=1 | 有                              |   439 |  422 |   17 | 476554.169976 |
| 第二輪 Run B（容器副本暫時移除兩行） | concurrency=1 | 無                              |   439 |  439 |    0 | 283588.842555 |
| 第三輪正式修法                       | Node 預設     | 無；改為 DOM 安裝後同步 require |   440 |  440 |    0 | 252344.447553 |

第一輪 run1 與 Run A 的 17 條失敗集合完全相同。序列化沒有改變任何失敗檔案或案例，因此這不是排程飢餓造成的隨機擴散，而是相同 module 初始化順序必然重現的確定性失敗。

CPU 事實亦排除配額誤判：`nproc=8`、Node `availableParallelism=8`、`os.cpus().length=8`、`/proc/cpuinfo=8`，cgroup v2 `cpu.max` 為 `max 100000`，沒有 CPU quota 限制。歷史 package 19 run3 的預設併發耗時為約 289,179ms；Run B 序列化仍只需 283,588ms，略快於該預設併發樣本，顯示這套測試不是 CPU-bound，治理併發沒有實質收益。

### 最終根因

repo 內 22 個 shop-app jsdom test 全部遵守同一不變量：先同步呼叫 `installTestDom()` 安裝 `window`、`document`、`MutationObserver` 等 globals，之後才以 `await import("@testing-library/react")` 載入 DOM 相依模組。

C1 卻在 `domBootstrap.mjs` module scope 靜態 import `@testing-library/react`。ESM 靜態 import 會在 module body 與 `installTestDom()` 呼叫之前求值，令 RTL／DTL 在 DOM globals 尚不存在時完成初始化；同步 container query 尚可運作，但 `waitFor`／`findBy*` 無法正確觀測後續 jsdom DOM 變動，最終全部走到牆鐘逾時。

正式修法保留同步 `installTestDom()` 簽章，以安全的 `node:module` `createRequire` 在 module scope 建立 require function；待所有 globals 寫入後，才於 `installTestDom()` 內同步 `require("@testing-library/react")` 並執行 `configure({ asyncUtilTimeout: 15_000 })`。probe 隨後使用與其餘測試相同的動態 import 取得 `getConfig()`，確認 `asyncUtilTimeout === 15_000`，同時鎖住設定值與 module 實例共用兩項契約。

審批者 B 先前提出的「純資源競爭」與「screen 綁定 document.body」兩個假說均已被本輪數據推翻，不得沿用。

## B. F-2 codegen 漂移守衛

原守衛會執行官方 `api-spec` codegen，再對 `lib/api-client-react/src/generated` 與 `lib/api-zod/src/generated` 執行 `git diff --exit-code`。它能攔截 tracked 修改與刪除，但看不到 codegen 新產生的 untracked file。

C2.1 在 diff 前新增：

```bash
git add --intent-to-add -- lib/api-client-react/src/generated lib/api-zod/src/generated
```

正向路徑沒有 untracked file，因此不產生 intent-to-add entry，Git status 維持乾淨。失敗路徑則由 intent-to-add 將新檔納入 diff，守衛立即輸出明確錯誤並 exit 1；後續 CI 步驟不讀取 Git index，沒有 index 副作用。

三項判別力證據：

1. 正向：目前 HEAD 官方 codegen 後 generated 零 diff，exit 0。
2. 反向一：暫改既有 `Store.name` description，tracked generated diff 被攔截，exit 1，隨後還原乾淨。
3. 反向二：暫增全新 `InfraFNegativeProbe` schema，codegen 產生 `?? lib/api-zod/src/generated/types/infraFNegativeProbe.ts`；intent-to-add 後 diff 顯示 `new file mode 100644` 並 exit 1，隨後還原乾淨。

## C. F-5 CI route test 縮排

`Test database routes` 的 17 條路徑已統一續行縮排。機械比對結果為 `ROUTE_LIST_UNCHANGED=17`；內容、數量與順序均未改動。最終 DB routes 仍為 95/95。

## D. F-3／F-4 文件歸因更正

`docs/ai-ops/71-v1-phase18-report.md` 原將 `customerStoreCredit.route.test.mjs` 的批次失敗歸因為「同毫秒排序」，但查詢已有 `ORDER BY created_at DESC, id DESC` 穩定決勝鍵，且測試先建 `adjust-1`、後建 `grant-2`，serial id 必然較大；該歸因不成立。真因仍未定位，登記為 F-4，已知線索只有 17 檔完整批次曾出現、單檔原樣重跑 8/8。

commit subject 仍沿用 `fix-phase18-flaky-attribution`，因 F-3 編號已進既有計畫書；維持原名可避免製造追溯斷點。本報告明載此命名沿革。

## E. 派工單缺陷紀錄

本包至此，執行端每一次停止都正確，缺陷全在派工端：

1. F-3 指錯檔案與內容；71 號報告根本沒有 onboarding／flaky 字樣。
2. 診斷方向錯誤：先斷言「純資源競爭、放寬耐心即可」，後被耗時相近而失敗數近三倍的數據推翻。
3. 修法機制猜錯：先假設為 screen 綁定 `document.body`，實際是靜態 import 破壞既有動態載入不變量。
4. 原派工要求修改共用 configure 時，未先掃描 repo 既有 import 慣例，因此未預見會違反 22 檔一致的架構不變量。

結論：本包的瓶頸同樣是規格簽發品質，不是實作品質。

## F. 證據索引

### 第二輪診斷

證據目錄：`C:\Users\Lnovo\Documents\Codex\2026-08-10\infra-f-diagnostic`

| 證據                              | SHA-256                                                            | 結果                                 |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `cpu-facts.log`                   | `A76C079161E51D76E4B84AC8B84D5C3E2B59F0BC4EFD8B3D872F05AA99BB10BF` | 8 核、cgroup quota=max               |
| `run-a-hypothesis.txt`            | `A2144D38CCD7A4373EFFA28251C6341EA583AFF1B51C0F3A686F579099554E0B` | Run A 事前判讀                       |
| `pure-run-a.log`                  | `F60E748144F80531186BA077CFD5D1E649199B37DB78D23496CDF68535F60D72` | 439 tests、422 pass、17 fail         |
| `pure-run-a.exit`                 | `F1B2F662800122BED0FF255693DF89C4487FBDCF453D3524A42D4EC20C3D9C04` | exit 1                               |
| `run-b-hypothesis.txt`            | `FEBE30DFBB9BBBDDF3F795430C1CA932EFC67B352397487F7070D0D6802517BD` | Run B 事前判讀                       |
| `pure-run-b.log`                  | `C901EC044F2FC49E9D2611C00FD08899FA5D5327864A79C74822C0D34F9A005B` | 439/439、bootstrap restored          |
| `pure-run-b.exit`                 | `13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354` | exit 0                               |
| `codegen-baseline.log`            | `E17A01691EF9AF494065236F53947DB8433A2013207AEDC99CAF59D3F03ACF62` | patched workflow baseline            |
| `codegen-patched-positive.log`    | `708EAAB075EB59073EE6F7FE836B0A211549C5A7E36148F7C0F0BDE83EEAA514` | patched guard 正向 exit 0            |
| `codegen-new-schema-negative.log` | `0F349CB7F5F7C46EB54D40589BC08D417F261D28DE378618D7A83179F94335BC` | untracked 新檔被攔截，exit 1         |
| `install.log`                     | `2465876678AC41CEB5FEE318CB7E0947D5C105F81D0F5ED2AC771702A6A3A165` | Node 24／pnpm 10.34.4 frozen install |
| `schema-push.log`                 | `7AFD73E7BB5B8F516DBBFDD0C0F97F66F3B7B388663CA7C26A740963EA7A6AA7` | schema push 成功                     |
| `schema-seed.log`                 | `5F76F1923171CFEB36F6EF3F745DC8A881FF38E087846C48597D3E4A9A32D72C` | fixed=11／variable=7／purchase=1     |

既有欄位反向證據：`C:\Users\Lnovo\Documents\Codex\2026-08-09\infra-f-evidence\codegen-negative.log`，SHA-256 `1BEA655950AD614BBCB684D1D2F7AC174D2F0705267319348F8355ECC9104DA8`。

### 第三輪最終驗證

證據目錄：`C:\Users\Lnovo\Documents\Codex\2026-08-10\infra-f-final`

| 證據                       | SHA-256                                                            | 結果                              |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `install.log`              | `30F1FDBDBE02835D2BF9F1E4EBA46C3635713FAAE72716EF2662EF31925ECEEE` | frozen install 成功               |
| `codegen-positive.log`     | `F2FEB6ADE0DE74590EF6CD05E6190DA3FBF6A1BC5A11596E42B013B7334F073B` | patched guard 正向 exit 0         |
| `prettier.log`             | `FBDD37869C73CE85AFB11FFEFA058E0181874C073FDFEE7D7A4B5086B7EA3B1B` | 全 repo Prettier 通過             |
| `schema-push.log`          | `1B254A1991BC0B819D6D6E39526D331D24826091A23AE5410A0E04F846332B24` | Changes applied                   |
| `schema-seed.log`          | `5F76F1923171CFEB36F6EF3F745DC8A881FF38E087846C48597D3E4A9A32D72C` | fixed=11／variable=7／purchase=1  |
| `schema-guard.log`         | `273B8FCFDEF2297F92BE71926228525331FE70A6F84B010CC086A683C99A482E` | `V1_FIXED_COST_SCHEMA_GUARD=PASS` |
| `database-routes.log`      | `F942CA48BC1C3E7F2CB10C7F457AB88A588A2740AFADBCEF32F55A2A8CFAF0CB` | 95/95                             |
| `pure-gate.txt`            | `DA57CA5E8185428B70B624ADDE693B503557FCF4765A6B9FB5D643FDDDFBD232` | 440/440 事前門檻                  |
| `pure-tests.log`           | `91A2C07063CF74FC9F6D4B1B5B0A28079BF04B35787F9EFB57C7BE84DCA383AE` | 440/440；probe 通過               |
| `pure-tests.exit`          | `13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354` | exit 0                            |
| `typecheck-libs.log`       | `0569F97C6B288483FAB5B2D975337A37D8ED96FBC1FCB0378C86082C5A0FDFE2` | exit 0                            |
| `typecheck-api-server.log` | `942447A546975F5B4A85D7144E065769825EFF71B12F1908F41BB0D08418867E` | exit 0                            |
| `typecheck-shop-app.log`   | `3F91C72CDA71C783FE746FF07B195B035B2A66F6210E8921EAC52CA233E4D9C2` | exit 0                            |
| `typecheck-scripts.log`    | `4B37EDD91D92627D3F2667CB06DAEBC69BB4AC234246481668E6FD4073966104` | exit 0                            |

Docker preflight：label containers=0、label volumes=0、total volumes=134。
Docker postflight：label containers=0、label volumes=0、total volumes=134。
只依 `infra.f=true` label 清理，未使用 volume prune，未碰觸 buzz-\* 或其他外部資源。

## G. 未驗項與發布狀態

Build 與 Playwright 本機未驗，留待 push 後 current-HEAD CI；本報告不宣稱已通過。

- 未連 production／既有 DB。
- 未操作 Replit／Republish。
- 未 push；等待 Owner 授權。
- 報告建立前相對 `origin/main` 為 0 behind / 5 ahead；完成後應為 0 behind / 6 ahead。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

PowerShell 重算指令：`$text=[IO.File]::ReadAllText($path,[Text.UTF8Encoding]::new($false)); $normalized=[regex]::Replace($text,'(?m)^SELF_SHA256:.*(?:\r?\n)?',''); $sha=[Security.Cryptography.SHA256]::Create(); (($sha.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($normalized)) | ForEach-Object ToString x2) -join '')`

SELF_SHA256: 8231ee06ca5d6248647b4ca2744c09b4e95e32aa3fcc07416f4f4d4c4360aaf7
