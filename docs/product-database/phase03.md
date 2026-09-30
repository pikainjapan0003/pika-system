# Phase 3 — Catalog API、搜尋與設定

本批 DB-BUILD-03 revision 0，施工基線 `30a36a64a78dfee1e5e75924552ff485c3ef0dd2`，分支 `feat/product-database-v1`。唯一作者任務 `01a09584-681e-7ed2-870a-a51bb919ebb2`；主控 `01a0956d-d03f-72e3-bdfb-9ba0800e520a`；獨立驗證須由主控安排。本文件記作者實作與測試，不代表獨立驗收 PASS。

授權時段：2026-09-13 18:09–19:09 UTC。指定角色 astra_builder、模型 gpt-6-astra/medium；實際後端路由仍 UNVERIFIED。角色來源 SHA256 `0BC22001165C7E819132746EF25F1DBCCA8E663B77A9F5C50D76699F1B34CF44`；原計畫 `7BCC4F50333CE9A948C91BDA35403F40665A5B24FE2FE8A31892CA781DF09B51`；附件 `57C0F9C7216047517773A90F643A1D5034794C30684753397112DE503785CCEE`。

## 介面與授權

以下 31 個操作全在 `/api/stores/{storeId}` 下，由 Clerk 身分與既有 verifyStoreOwner 驗證。路徑／query／body 使用 OpenAPI 產生的嚴格 Zod schema；拒絕未知欄位、非正規 ID、超出 PostgreSQL integer 範圍。寫入交易重新確認店鋪擁有者，鎖店鋪及相關 Catalog row，所有子資源與外鍵驗證同店鋪。actor 來自伺服器認證，不接受 body 指定。

| 相對路徑 | 方法 |
| --- | --- |
| `/catalog-products` | GET、POST |
| `/catalog-products/{catalogProductId}` | GET、PATCH、DELETE |
| `…/correct-barcode`、`…/clone-with-new-barcode` | POST |
| `…/aliases` | GET、POST |
| `…/aliases/{aliasId}` | DELETE |
| `…/cost-records` | GET、POST |
| `…/cost-records/{recordId}/void` | POST |
| `…/shopee-prices` | GET、POST |
| `…/shopee-prices/{recordId}/void` | POST |
| `…/relationships` | GET、POST |
| `…/relationships/{relationshipId}` | DELETE |
| `…/audit` | GET |
| `/pricing-settings` | GET、PATCH |
| `/pricing-settings/initialize` | POST |
| `/pricing-templates` | GET、POST |
| `/pricing-templates/{templateId}` | PATCH、DELETE |
| `/shipping-profiles` | GET、POST |
| `/shipping-profiles/{shippingProfileId}` | PATCH、DELETE |

客人路由沒有接入 Catalog DTO；上述敏感成本／設定只有店主可讀。既有公開 DTO 的相容測試保留原檔與預期。

## 商品、搜尋與歷史

- 名稱以 NFKC、空白及標點處理後保存 normalizedName；改名在同一交易留下 RENAMED 別名。容量單位如 `15 ml` 正規化為 `15ml`。別名依 normalizedName 去重。
- 條碼是字串，保留開頭零與長碼。REAL 必須是數字且不是單一 `0`；NONE 必須是 `0`，不當作精確條碼搜尋或真實條碼重複比對。REAL 同碼回 409 與候選，forceCreate 可明確放行；NONE 用標準名、重量、目前原價做建檔重複提示。
- 搜尋在 PostgreSQL 端完成篩選、總數與分頁。依精確 REAL 條碼、精確正式名、精確別名、正式名前綴、別名前綴、部分相符、分類、trigram 模糊排序，id 穩定打破同分。`%`、`_`、反斜線經 LIKE escape 當文字；不是使用者萬用字元。
- query 支援 q、status、categoryId、barcodeStatus、includeArchived、page、pageSize、filter。預設排除封存；要求 ARCHIVED 須 includeArchived=true。page 上限 100000，pageSize 上限 100。POSSIBLE_DUPLICATE 僅比較 REAL 條碼；COST_UPDATED 為目前 ACTIVE 成本具有 supersedes 指標；MISSING_DATA 為缺目前 ACTIVE 成本。
- 重量限制兩位小數；金額／倍率用精確十進位字串，不先轉浮點數或偷偷截斷。NONE、RATE、MANUAL 分開處理原價與有效成本；矛盾的衍生金額拒絕。
- 成本追加歷史、替換 current 指標；supersedes 必須同商品同店鋪且 ACTIVE。作廢目前成本時依建立時間與 ID 選最新仍 ACTIVE 成本，全部作廢後 current 為空，不復活 VOIDED。
- Shopee 日期是有效曆日字串，拒絕不存在的日期；參考價追加與作廢以稽核留下原因和 actor。OTHER 去掉前後空白後仍須說明。
- 更正條碼留 before/after；換商品複製建立獨立主檔與成本，來源／新商品以稽核關聯，不搬走歷史。商品關聯採小 ID／大 ID 順序唯一化，反向重複拒絕。
- 有任何歷史、別名、關聯或使用紀錄的永久刪除回 409，使用封存。真正未使用且無歷史的資料可刪，另存店鋪級稽核。

## 初始化、migration 與產生器

GET 設定回系統 fallback，不偷偷寫庫。明確 initialize 在店鋪鎖內執行，併發仍冪等，不覆蓋使用者既有設定與範本。設定、範本、運費新增／修改／刪除都更新 settingsVersion。停用範本保留引用；被引用的刪除由外鍵回 409。運費基準重量必須大於零；設定門檻驗證順序與毛利率小於 1。

新增 `0042_catalog_search_audit.sql`：pg_trgm、normalized name/alias GIN 索引、店鋪稽核表與 immutable trigger、Shopee 內容不可修改及不可刪除 trigger。新 schema 模組 `catalogAudit.ts` 加到 schema/index.ts；這是 Phase 1 凍結清單中唯一獲准修改的 export 接點。0041 與 checker 未修改。0042 rollback 在非空 audit 時先拒絕，避免刪除歷史；保留可能預先存在的 pg_trgm extension。空資料環境 up/down/up 及非空拒絕各有測試。

OpenAPI 為來源，Orval 生出 React client 與 Zod/types。Catalog 專用 wrapper 解決目前 Orval 的 path preprocess 問題，名稱用 PathParams 避免 query 型別衝突；空 initialize body 補 strict 的程式碼在 generator 內，有形狀檢查，不手改產物。既有 Phase 2 preview wrapper 保留。重現性紀錄比較兩次生成的完整 api-zod/src 與 api-client-react/src SHA256。

## 可重現測試環境與證據

所有證據位於 `C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase3-author-r0`。修改既有檔前備份於此；新檔無舊目標。`file-manifest.json` 是最後凍結的完整未提交產物 SHA256 清單，另有前階段 preservation 比對。

本批容器 `b51d25c7f6da9426fc9167480e264af72375e8f9ce9cfa91017ab8ec4d3ae372`，名稱 `/pika-db-build03-r0-1789323940701`，loopback port 57359，標籤 pika.task=DB-BUILD-03 / pika.phase=phase3。固定 postgres:16-alpine image digest `57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`。腳本以 exact ID、標籤、DB/user、loopback、synthetic URL 多重核對；不讀 ambient 正式 URL。

主資料庫 pika_phase3 保留測試合成資料與 immutable history；相容資料庫 pika_phase0 也在這個新容器內，供原封不動的舊測試使用。原 Phase 0/1/2 凍結容器 `3ed1e52eb60654c2fea2fa81cf40f6a2ead16138037edba860abadebb4f5ea9d` 未啟動、未寫入。建立環境先核 legacy dump SHA256 `19135A07E2D468AC2A764D1C99F9F4305EF167D4E9E4B7B73CBA76AEF98EACE2`，恢復後 0041 及 0042 up/down/up，舊四表投影 checksum 前後一致。

執行點：`node scripts/product-database-test-db.mjs create DB-BUILD-03`；`compat DB-BUILD-03 <exact-id>` 只建一次相容 DB；`stop DB-BUILD-03 <exact-id>` 保留容器停止供驗證者接手。不得把對合成庫的測試當成正式 migration 或資料匯入授權。

測試使用 artifacts/api-server 工作目錄與既有 tsx，Node test module mocks 模擬 Clerk。Catalog 設定 PIKA_PHASE3_DISPOSABLE=DB-BUILD-03、PIKA_PHASE3_CONTAINER 為本批 ID；舊相容測試依原檔使用 PIKA_PHASE0_DISPOSABLE=DB-BUILD-01，指向本批相容 DB。DATABASE_SSLMODE/PGSSLMODE=disable 僅限 loopback。

已觀察：Catalog 純函式 6 + API 17 = 23/23 通過（catalog-final.log / junit）。首輪 15/20 暴露搜尋 ORDER BY 常數、COUNT 綁定參數及空 body strict 三項問題，修正後再通過。其後新增 OTHER 空白原因測試，最後結果另記。原相容測試首輪 13/14，原因是新 DB 首筆範本 ID=1 與舊測試「合法但不存在=1」假設碰撞；清理後保留原測試重跑。一次重跑撞到 codegen 清理產物，屬執行時序錯誤，已等待產生結束再執行。

最終凍結證據：

- `catalog-frozen.log` / `catalog-frozen.junit.xml`：24/24 PASS（純函式 7、API 17），包含 OTHER 原因的空白處理；exit 0。
- `compat-stable.log` / `compat-stable.junit.xml`：14/14 PASS（preview 13、Phase 0 相容 1），exit 0；原測試與預期未改。
- `codegen-reproducibility.json`：157 檔比較，差異 0，PASS；codegen-repeat exit 0。
- `database-final.json`：兩個新合成 DB 的原始 customers/orders/products/stores 投影 checksum 均與 dump 基線一致；另存所有 public 表的 row count 與內容 hash。stores 僅取原始 id=8，其他新增合成店鋪與歷史保留，不冒充空資料庫。
- `database-stopped.json`：exact 本批容器於 19:00:40 UTC 停止，Running=false、PID=0、ExitCode=0；停止命令 exit 0。
- `prior-preservation.json`：Phase 1 r1 manifest 13 檔中 12 不變，僅 schema/index.ts 新 export；Phase 2 r2 manifest 27 檔中 19 不變，8 個變更均為授權 route mount、OpenAPI、Orval、產生物及 db package export。原始 Phase 0 兩個測試另列保存證據。
- `git diff --check` 無輸出、exit 0，branch 與 HEAD 仍為上述基線。
- `phase0-preservation.json`：原始 Phase 0 API／Route 兩個測試 SHA256 均保持一致；與 Phase 1 manifest 合計 15 檔，14 不變，1 個授權 export 修改。
- 首次 typecheck 發現動態欄位映射的聯集推導錯誤，已改明確 Record<string,string>；`typecheck-final.log` 完整 root typecheck（libs、API、shop-app、mockup-sandbox、scripts）exit 0。
- `build.log`：完整 `pnpm -r --if-present run build` exit 0；API、mockup-sandbox、shop-app 均完成。shop-app 有 sourcemap 定位與 chunk 大小訊息，未造成失敗；沒有藉本批修改既有 UI。
- 2026-09-13 19:07:49 UTC 已讀回最後 build 程序 terminal exit 0。Catalog、compat、codegen、typecheck、build 與容器停止命令均已終止；本批沒有持續服務或背景 writer。原凍結容器再次唯讀確認 exited / running=false。
- 最終完整 manifest 98 檔（前階段 42 + 新增 56）；本批差異 manifest 65 檔（新增 56 + 授權接點變更 9）。最後文件更新後重算 hash，外部 `freeze-summary.json` 記 manifest SHA256 與退出碼。作者交付完成，獨立驗證 PENDING。

## 範圍與接續

本批僅 Phase 3 API／搜尋／設定及必要 migration/codegen。UI、上架整合、正式 order_items 寫入流程、Sheet 正式資料與實機掃碼留後續原計畫，不宣稱全案完成。未 commit、push、部署或接觸正式資料。獨立驗證時應停寫，按 manifest 比對；有變更必須重新驗證。

## Revision 1 — Shopee 歷史與列表成本精度修正

2026-09-13 DB-BUILD-03-r1，期限 20:14 UTC，作者／主控／獨立者及基線同上。有效契約 SHA256 `D8B6B6F8AFB7F37AA6D8528735BC312BFFD7CBF3803C82A0E4AEE1659C5C12DC`。開工時核對 r0 完整 manifest 98/98 相符；初始缺陷為獨立 r0 報告的 Shopee GET SQLSTATE 42702，主控於本轮補充授權列表成本精度疑慮的重現與必要修正（同 writer／截止），實測後納入第二項修正。前述 r0 作者成功紀錄不等於独立 PASS：獨立檢查發現原測試沒有合法店主成功 GET 的覆蓋。

根因與修正：`SELECT *, observed_at::text AS observed_at` 產生兩個同名輸出，未限定的 `ORDER BY observed_at` 有歧義，即使空資料也回 HTTP 500。本輪只修改 catalogService 的 catalogShopee 查詢，明列所有既有欄位，date cast 只輸出一次，排序用 `o.observed_at DESC NULLS LAST, o.id DESC`，WHERE 仍同時限制店鋪與商品。

新增獨立於其他案例先後順序的作者 GET 回歸：合法店主空歷史回空陣列；0001、0099、2000 閏日、2024 閏日、9999 日期保持 ISO date-only；跨日期倒序、同日較大 ID 先出；ACTIVE／VOIDED 全部保留；12 位小數價格不變；既有 DDL 允許的 NULL 日期以合成 SHEET_IMPORT row 驗證排末；外店 parent 404，合法外店 owner 只讀其自己的完整紀錄。未改 DDL，也沒有刪除原有 assert 或 skip 失敗案例。

先加測試、保持舊 SQL 執行 `--test-name-pattern='Shopee GET returns'`，`shopee-red.log` / JUnit exit 1，重現相同 ambiguity；改 SQL 後同命令 `shopee-green.log` / JUnit 4/4 PASS。計數包含一個父 test 與三個子 test。原獨立 probe SHA256 `686B7D3E40A3A39B2FC441E0AF492EC24A1A41B53BDF95F86B936EAC54958CE1` 保持唯讀；它的 after hook 寫死原驗證資料夾 `independent-final.json`，為保留原證據，本作者沒有直接執行或修改它，交同獨立者另行重驗。

本輪證據／改前備份：`C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase3-author-r1`。只預計變更 service、作者測試與本文件共 3 檔。OpenAPI、Orval、生成物、migration、既有 Phase 0/1/2 產物不需要變更；157 個生成檔以唯讀 hash 比對，r0 codegen 可重現證據繼續保留，沒有把本輪未執行 codegen 說成重跑。

使用原作者自有 container `b51d25c7f6da9426fc9167480e264af72375e8f9ce9cfa91017ab8ec4d3ae372`，啟動前核 exact ID、名稱、標籤、固定 image 與停止狀態；啟動後重新 inspect 得 loopback port **61466**，未沿用舊 port。主／相容 DB 都先核原四表投影與 r0 基線一致才執行測試；身份與前狀態記 db-identity.json / container-before.json。未操作原 Phase01 或獨立者容器；immutable 測試歷史保留。

補充缺陷：列表 currentCost 原先 `to_jsonb(pc)` 把 PostgreSQL numeric 作 JSON number 傳給 pg，經 JSON 解析成 JS Number 已失去精度。新回歸先證明詳細／歷史正確而列表錯誤：最大 numeric(30,12) 被四捨五入、`9007199254740993.123456789012` 變成 `9007199254740994`，rate `0.123456789012` 及有效成本亦變 Number。`numeric-red.log` / JUnit 保存修正前 exit 1，不把源碼疑慮直接當成已測事實。

修正只在原本有店鋪／商品限制的 current_cost 子查詢，以 `to_jsonb(pc) || jsonb_build_object(...)` 將 original_price_jpy、effective_cost_jpy、adjustment_rate 在入 JSON 前明確 `::text`，避免 Number 轉回 String 的假修復。NULL 倍率仍是 null、date 仍是 date-only、ID 保持數字、isCurrent 保持 boolean；排序、count、LIMIT/OFFSET 沒有改成全表記憶體處理，資料與計價公式也不變。新增三組列表／詳細／歷史等值與型別測試，包含最大值、超過安全整數的原價／手動有效成本、12dp 倍率與 null 倍率，並跨兩頁確認 total 與分頁。

Shopee 修正第一輪完整 Catalog 28/28、compat/core 39/39、typecheck/build 均 exit 0，保留 catalog.log、compat-core.log、typecheck.log、build.log。補充精度授權抵達時容器已停止，因新重現重新按 guard 啟動同作者容器，fresh inspect 得 port **61736**；兩庫原四投影再次一致，身份另存 db-identity-numeric.json，未覆寫第一段啟停證據。精度修正後以 *-final.log / JUnit 重跑全部受影響檢查，最終結果及停止證據在收尾補入。

精度單點 numeric-green 4/4 PASS；首次合併回歸 catalog-final 28/29，唯一失敗是新增測試用「Precision Regression」文字也模糊匹配到同輪「Shopee GET regression」，導致 total=4。保留失敗日志，以專屬分類隔離候選集合，仍嚴格驗證 total=3、兩頁與所有金額型別／原值，不改產品搜尋或放寬斷言。最後完整重跑改名 catalog-verified，避免覆蓋先前失敗證據。

本輪實際測試命令（cwd artifacts/api-server，合成 URL／guard env 如上，spec 與 JUnit reporter 輸出到 r1 證據目錄）：

- 紅綠單點：`node --experimental-test-module-mocks --import tsx --test --test-name-pattern='Shopee GET returns' src/routes/catalogProducts.test.mjs`；精度用同命令 pattern `Catalog list preserves`。
- 完整 Catalog：`node --experimental-test-module-mocks --import tsx --test --test-concurrency=1 ../../lib/db/src/catalog/catalog.test.mjs src/routes/catalogProducts.test.mjs`。
- 相容／core：`node --experimental-test-module-mocks --import tsx --test --test-concurrency=1 ../../lib/db/src/pricing-v2/pricing.test.mjs src/routes/pricingV2.test.mjs src/routes/productDatabaseCompatibility.test.mjs`。
- 根目錄依序 `pnpm run typecheck`、`pnpm -r --if-present run build`；build 使用本地 PORT=3000、BASE_PATH=/，只建置、不啟動服務。

最終 r1 結果：

| 項目 | 結果與證據 |
| --- | --- |
| Shopee 42702 修復 | 紅 0/4、綠 4/4；最終完整回歸仍通過 |
| 列表 numeric 精度修復 | 紅 0/4、綠 4/4；最終專屬分類版本在完整回歸通過 |
| Catalog 完整回歸 | catalog-verified.log / catalog-verified.junit.xml，32/32，exit 0（含父／子 test 計數） |
| Phase2／Phase0／pricing core | compat-core-final.log / compat-core-final.junit.xml，39/39，exit 0 |
| 完整型別與建置 | typecheck-final.log / build-final.log，均 exit 0；保留既有 sourcemap／chunk 提示，未改 UI |
| 資料保護 | database-final-numeric.json：兩庫原四表投影均未變；保存 public 全表 row count／hash，其他 client connections=0 |
| 停止 | database-stopped-numeric.json：20:02:17 UTC，Running=false、PID=0、ExitCode=0；closure.json：23924／25080 建置根 PID 已不存在，所有測試／檢查程序 terminal |
| 保留 | 原獨立報告、probe、evidence manifest hash 全匹配；157 生成檔與原比對相同；本輪只改 service、作者測試、本文件 3 檔，其餘 r0 95 檔不變 |

完整 98 檔 file-manifest.json、本輪 3 檔 r1-touched-manifest.json、r0-preservation.json 及 freeze-summary.json 皆在 r1 外部證據目錄，最後文件更新後再計算雜湊。兩項產品缺陷已完成作者修正及回歸；測試隔離失敗與初始紅燈日志均保留，沒有當成 PASS。未 stage／commit／push／部署，原 Phase01 與獨立容器未啟動。

r1 作者結果不是獨立重驗結果；交同獨立者 r1 驗证，狀態 PENDING。requested gpt-6-astra/medium，後端路由 UNVERIFIED。Phase4–9 不在本修正 writer lease 內。
