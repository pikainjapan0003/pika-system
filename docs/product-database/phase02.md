# Phase 2 — pricing v2 與唯讀 preview

DB-BUILD-02；作者任務 01a09584-681e-7ed2-870a-a51bb919ebb2。下列保留 revision 0 / 1 紀錄，最新修正見末節 revision 2。基線 30a36a64a78dfee1e5e75924552ff485c3ef0dd2，施工分支 feat/product-database-v1。本文件是作者交付紀錄，不代表獨立驗收 PASS。模型要求 Astra/medium，後端路由未驗證。

## 來源與計算

- 原計畫 SHA256：7BCC4F50333CE9A948C91BDA35403F40665A5B24FE2FE8A31892CA781DF09B51。
- 附件 SHA256：57C0F9C7216047517773A90F643A1D5034794C30684753397112DE503785CCEE。
- 管理根 reports/DB-PLAN-01_Sheet樣本證據_20260912.json SHA256：58D5DE30B84742322E0A4917E6AE395AC46D0AC081B609634827E02DDF64FC6D。
- GENERAL、LIVE、PERFUME 三個實際 Sheet 樣本各 20 個獨立預期值固定於 pricing.test.mjs；共 60 格，以 12 位十進位輸出核對。香水倍率 .915，百貨費 .0155；其他預設倍率 1、百貨費 0。

核心使用既有 ExactDecimal 有理數，不在中間步驟捨入。成本為有效日圓成本 × 採購匯率，加上完整 Route 成本、損耗、國際運費、採購付款費及百貨費。完整 Route resolver 已含 Route 付款費、區域物流與 HEP，核心不重複加收。目標售價以成本 / (1 - 目標淨利率) 計算；一般與 VIP 實售價各自計算淨利、淨利率、貢獻及感知價差，不自動填售價。金額輸出 12 位、顯示及最終售價 2 位 half-up。

缺成本、匯率、Route、重量、運費或某客群售價保留 null/pending；明示 Route 豁免才可用零。零售價與零分母拒絕。拒絕非十進位字串、非有限數、負費用、非法門檻及超出持久化金額界限。MANUAL 模板沒有明示有效成本時 pending。

## API 與相容性

新增 POST /api/stores/:storeId/pricing/preview，沿用登入與店鋪擁有權驗證。模板、運費方案、Route、trip、area 皆核對同店鋪。回應包含 settingsVersion、模板／運費方案識別及 Route metadata；不寫入資料庫。採購匯率與 Route trip 匯率分開使用。付款費參數優先使用 request、store settings、預設 .015；既有 v1 resolver 未傳參數仍維持 .015。

OpenAPI 新增 operation 及 schemas。衍生 client/zod 僅由 pnpm --filter @workspace/api-spec codegen 產生，該命令 exit 0。API 使用生成的 PreviewPricingV2Body.strict()，另檢查安全整數 ID。曾因 API 無直接 zod 依賴導致首次測試失敗，已改用既有生成套件，未新增依賴。

## 作者驗證與環境

外部備份、log、JUnit 與交付 manifest：C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase2-author-r0。既有修改檔與生成來源均已在修改前備份。

- 定價新測試與既有 transport / area / product transport / product profit / Phase0 Route 測試：79 PASS，0 fail、0 skip，exit 0。
- 既有 API 相容測試：54 PASS，exit 0。
- 新 preview 最終重跑：7 PASS，0 fail、0 skip，exit 0，包含 MANUAL 與非法 ID 覆蓋。
- 最終 pnpm run typecheck：exit 0。
- 最終 pnpm -r --if-present run build：exit 0，API 與 shop build 均 Done；PORT=3000、BASE_PATH=/，Git bash 加入本命令 PATH。前端有 UI sourcemap location 與大 chunk 警告，未阻止輸出。

API 測試僅連線既有合成 PostgreSQL pika-db-build01-phase0（127.0.0.1:55312，DB/user pika_phase0）。測試建立自己的 fixture，逐一對所有 public tables 比較預覽前後 row count 與內容 checksum，並於 after 清除自己的資料。未讀正式環境、未寫正式 DB 或 Sheet、未提交／推送／部署。Phase01 schema、migration、checker 與原測試未修改。獨立者須在作者停止寫入及服務後依 manifest 驗證。

## 凍結紀錄

2026-09-13 UTC。舊資料最終 checksum：customers 1 / f303907068734ad73e1d2669fecc74f4；orders 4 / 37cb1529030b349a36732fc810b6c290；products 2 / d15086194307f3f19274b5eb14c2e51b；stores 1 / ea69c7d877ded491bf1d5f903a285212，全部與 Phase0 固定投影相同。Phase1 的 13 檔 manifest 全部相符，兩個 Phase0 相容測試 hash 亦相同，共保留 15 檔。

精確容器 3ed1e52eb60654c2fea2fa81cf40f6a2ead16138037edba860abadebb4f5ea9d 已停止，inspect 為 exited / Running=false。測試程序正常結束，無持續 API 服務。git diff --check 通過。交付 hash 見外部 file-manifest.json；本批僅作者驗證完成，後續獨立檢驗、UI 與實機測試不在本次 PASS 宣告中。

## Revision 1 — 輸入契約修正

原 revision 0 經獨立驗證發現三個輸入缺陷：thresholds 未拒絕未知欄位、生成 ID schema 接受小數，以及超過 PostgreSQL integer 上界的 ID 可能在查詢時產生 500。定價公式與原 140 項測試已由獨立者通過；本輪只修正輸入邊界，不改公式與 Phase01 產物。

OpenAPI 的 storeId 路徑與 templateId / shippingProfileId / tripRouteId body 欄位均明列 minimum 1、maximum 2147483647、multipleOf 1。Orval 僅對 previewPricingV2 operation 啟用 body / param strict，遞迴拒絕 thresholds 未知欄位，並明示 param 數字轉換。生成結果為 min(1).max(2147483647).multipleOf(1)，不手改 generated。HTTP 直接使用 PreviewPricingV2Params 和 PreviewPricingV2Body，移除重複而不足的 safeInteger 判斷；非法 ID 在相應 DB lookup 之前回傳 400，合法但不存在的 ID 正常回傳 404（非擁有者店鋪維持 403）。

新增四項作者回歸測試，覆蓋所有 body IDs 與 path ID 的 1 / 2147483647 合法上下界、小數、超界、零、負值、非數、錯誤 JSON 型別，以及頂層／巢狀未知欄位。測試 Clerk mock 使用獨立者已成功的 ESM resolve 模式。原七項 API 測試預期保持。

本輪外部備份與日誌根：C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase2-author-r1。測試容器啟動後重新核對 port 55260、DB/user pika_phase0、loopback、SSL disable、PIKA_PHASE0_DISPOSABLE=DB-BUILD-01、KEEP_FIXTURES=0。作者自測不能代替同獨立者重驗。

### r1 實際驗證

| 檢查 | 結果 | 外部證據 |
| --- | --- | --- |
| Preview 原 7 項 + 新 4 項 | 11 PASS，exit 0 | api-regression.log / .junit.xml |
| 定價與 Route 相容套件 | 79 PASS，exit 0 | pure-rerun.log / .junit.xml |
| 既有 API 相容套件 | 53 PASS，加公開回應 allowlist 1 PASS，各 exit 0，共原 54 項 | api-compat.log、api-allowlist.log 及各 JUnit |
| 最終 codegen 及相同來源再次 codegen | 各 exit 0；112 檔 before/after hash 全相同 | codegen-final.log、codegen-repeat.log、codegen-reproducibility.json |
| 完整 pnpm run typecheck | exit 0，libs / API / shop / mockup / scripts 均完成 | typecheck.log |
| pnpm -r --if-present run build | exit 0，API / shop 完成；命令專用 PORT=3000、BASE_PATH=/、Git bash PATH | build.log |
| 生成影響範圍 | 僅 api-zod generated/api.ts、types/pricingV2PreviewInput.ts、api-client-react generated/api.schemas.ts 改變 | generated-scope-comparison.json |
| Phase01 保留 | 15 檔 hash 全相同 | phase1-preservation.json |
| 合成 DB 收尾 | 4 組舊投影 checksum 相同、14 張新表全空；精確容器 exited / false | legacy-final.log、new-table-counts-final.log、container-final.log |

最終成功輪共 144 項作者測試通過，無 fail / skip。首次純函式測試從 lib/db 以 --import tsx 啟動，因該套件沒有直接 tsx 依賴而在載入前失敗（pure.log）；改從已有 tsx 的 artifacts/api-server 目錄重跑成功，未安裝依賴、未修改核心或預期。第一次 operation override 生成時發現 param coercion 未繼承，已明示 param number coercion 後才執行 HTTP 測試。

實際測試入口使用 pnpm exec node --import tsx --test，API 測試另加 --experimental-test-module-mocks，既有 API 套件使用 --test-concurrency=1。全部使用 spec / junit reporter 寫入上述日誌。純函式入口為 lib/db/src/pricing-v2/pricing.test.mjs，以及 transport-cost 目錄的 transport-cost、areaDomesticCost、productTransportCost、productUnitProfit、productDatabaseRouteBaseline 五個 .test.mjs。API 相容入口為 src/lib 的 orderProfitSnapshot.batch、productEstimatedProfit、publicCartItems、publicResponseAllowlist.snapshot、publicOrderResponse，以及 src/routes 的 coreMutationAuthorization.route、customersAndProfitIsolation.route、orderProfitSnapshot.route、productDatabaseCompatibility、public.route、tripRouteFuelNullable.route 各 .test.mjs。

生成命令為 pnpm --filter @workspace/api-spec codegen。既有 Zod 從 PreviewPricingV2Response 宣告至檔案結尾與 r0 備份逐字相同；定價核心、原定價測試及三個 Route 實作也與 r0 manifest 相同。獨立探針及其 attempt5 log hash 維持契約所列值；作者未修改或執行該固定 port 的獨立探針。

### r1 交付凍結

2026-09-13 UTC，在 16:57 截止前完成。三個輸入缺陷均作者自測 PASS，完整 typecheck / build exit 0。建置仍出現與 r0 相同的 UI sourcemap location / 大 chunk 提示，沒有導致失敗。本輪 8 檔修正；完整 Phase2 清單包含原 25 檔與新增授權的 orval.config.ts，共 26 檔，hash 見 phase2-author-r1/file-manifest.json。所有本輪測試、生成及建置程序均已完成，測試容器已停止，沒有持續 API 服務；git diff --check 通過後停止作者寫入。模型要求 Astra/medium；角色來源 hash 與契約一致，後端模型路由仍 UNVERIFIED。待原獨立者重驗；未將作者自測宣告為獨立 PASS 或整案／實機驗收。

## Revision 2 — 恢復 storeId 字面契約

原 r1 的三個缺陷已由獨立者重驗通過；新增 boundary probe 發現數字 coercion 讓科學記號、小數、正號、空白、前導零與十六進位 path 被接受。本輪恢復 canonical positive decimal spelling，不改 r1 的 integer / range / strict body 規則。外部備份與證據根為 C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase2-author-r2。

新增純函式 preprocessPreviewPricingParams：字串須符合正整數字面且沒有首尾空白；number 原樣交給生成的 integer / 1..2147483647 驗證。其他型別與非法字串回傳 undefined，令 safeParse 正常失敗，不丟例外。HTTP 已使用 PreviewPricingV2Params，在店主查詢之前驗證，因此不需要額外、可能分歧的 HTTP regex。

本機 Orval 8.9.1 雖宣告 preprocess.param，實作卻從 preprocess.response 讀 mutator，且只回傳 response mutator import。orval.config.ts 用內建 clients.zod 的 operation 專用包裝補正：先取得原始生成結果，再以正式 mutator 設定單獨生成 param 與 import，保留原 body / response 字串。只對 previewPricingV2 啟用；若生成結構改變則明確失敗，不靜默產生錯誤程式。沒有修改套件、沒有手改 generated、沒有將預處理套到 response。

原 11 項 preview 預期保留，新增 generated Params 型別／字面測試與 HTTP 字面測試。HTTP helper 對 path 使用 encodeURIComponent，依實際 fixture ID 構造非 canonical 等價字面，並檢查登入非擁有者也先收到 400；正常 fixture 仍 200。換行、tab、null、boolean、array、object、bigint、symbol 及原 numeric bounds 同時涵蓋。核心 79、既有 API 54、Sheet 60 格不重跑；依契約保留未變 source hash 的既有獨立證據。

### r2 實際驗證

- Preview 原 11 + 新 2：13 PASS，0 fail / skip，exit 0。命令在 artifacts/api-server 執行 pnpm exec node --experimental-test-module-mocks --import tsx --test，入口 src/routes/pricingV2.test.mjs，spec / junit reporter 寫入 api-regression.log / api-regression.junit.xml。
- 本輪明示合成連線為 127.0.0.1:51650、DB/user pika_phase0，PGSSLMODE=disable、PIKA_PHASE0_DISPOSABLE=DB-BUILD-01、KEEP_FIXTURES=0。原四組 legacy projection checksum 未變；14 張新表全空。容器 3ed1e52eb60654c2fea2fa81cf40f6a2ead16138037edba860abadebb4f5ea9d 已停止，inspect exited / false。
- Phase01 的 15 檔 hash 相同（phase1-preservation.json）；原 pricing-v2 核心／測試與 Route 三個實作對照 r1 manifest 相同。独立 id-boundaries.mjs SHA256 1C3C099339C3DC7DA5961F993A72754BA86024B9FAEFE099F748B40C73B966F8；其 log SHA256 7C3C41BC3BC7756DEE6E6F56E09A66446B9B1FE175CBE08DA1EE6C6268715C9A，作者只讀、未執行或修改。
- 首次 pnpm --filter @workspace/api-spec codegen exit 0。產生的 PreviewPricingV2Params 實際為 zod.preprocess(preprocessPreviewPricingParams, ...)，且從 previewPricingV2BodyTemplateIdMax 起至檔尾與 r1 原件逐字一致；body / response 與其他 operation 不受影響。
- 同來源再次 codegen exit 0；113 檔 hash 全部一致，見 codegen-repeat.log、codegen-reproducibility.json。對照 r1，api-zod / api-client-react 的檔案差異僅新 previewPricingParams.ts 與 generated/api.ts，見 generated-scope-comparison.json；React client 與其餘生成檔保持不變。
- 完整 pnpm run typecheck exit 0，libs / API / shop / mockup / scripts 全部完成，見 typecheck.log。git diff --check 通過。所有檢查依序執行；原 Phase01、pricing-v2 與 Route 實作不變。
- pnpm -r --if-present run build exit 0，mockup / API / shop 全部完成，見 build.log。使用命令專用 PORT=3000、BASE_PATH=/ 與 Git bash PATH；有既有 UI sourcemap 提示，未導致失敗。

### r2 最終凍結

2026-09-13 UTC，在 17:46 截止前完成。generated Params 與 HTTP 的 canonical path 缺陷均作者自測 PASS。r1 的整數／範圍與 body strict 契約保持，未改定價公式、原測試預期或獨立探針。本輪五檔差異（orval.config.ts、新 previewPricingParams.ts、generated/api.ts、pricingV2.test.mjs、本文）；完整 Phase2 清單為原 r1 26 檔加新 helper，共 27 檔，見 phase2-author-r2/file-manifest.json 與 revision2-delta.json。

本輪測試、codegen、typecheck、build 程序均正常結束；測試容器已停止，沒有持續 API 服務。凍結後停止作者寫入，待同獨立者重驗；作者自測不是獨立 PASS 或整案／實機驗收。requested Astra/medium；角色來源 hash 核對一致，後端模型路由仍 UNVERIFIED。未使用 rescue，未修改正式 DB / Sheet、未提交／推送／部署。
