# PRIVATE POC 線上化與驗證

更新：2026-09-26。依「快速執行、B＋Astra、人工驗收延後」授權接續。

**私人測試版現在不需要你的電腦或 Docker 開著。** 原 Sites 網址已改接 Railway 的獨立 Express 和持久 PostgreSQL；本專案的舊本機 API、資料庫、Quick Tunnel 全部停止後，同一筆假訂單仍可查回。沿用 Clerk 和原業務規則。

| 你關心的事 | 實際結果 |
| --- | --- |
| 開哪裡？ | [私人測試站](https://pika-system-private-poc-20260925.bill831206.chatgpt.site)；商品管理 `/products`、訂單後台 `/orders` |
| 已能用什麼？ | 唯一管理帳號維護假商品、客人瀏覽／購物車下單、雲端 PG 真正存單、token 查單、後台收單、基本訂單統計 |
| 有沒有靠本機？ | **沒有**。API 重啟後、三個本機 POC 容器停止後，各自再次查單與核對庫存均通過；原本機資料卷保留作備援 |
| 哪些尚未接通？ | 外部圖片儲存、真 OCR、物流服務／匯入、排程尚未接入。OCR／物流／完整成本月報本輪只驗既有 fixture；線上缺成本資料維持「待確認」 |
| 自動測了什麼？ | 真 Clerk＋Sites＋Railway API／SQL 核心流程；容器 20 項、斷網 fixture 38 項、root typecheck 通過。完整瀏覽器 E2E 未完成；人工畫面驗收統一延後 |
| 現在要做什麼？ | 不需要再登入、設定或逐頁測試。使用現有 Railway 試用額度；目前沒有核心 blocker。試用到期／額度用完前，若要付費延續會另集中取得確認 |

## 1. 實際執行位置與私人範圍

| 元件 | 已讀回的資源／位置 |
| --- | --- |
| Sites | project `appgprj_6ab69a6062348191809b743a5635f83e`；沿用第 1 版，私人 deployment `appgdep_6ab6d89ab18c8191a6d7f1438b4f6939` **SUCCESS**；environment revision **2** |
| Sites 上游 | `PIKA_POC_API_ORIGIN=https://pika-poc-api-production.up.railway.app`；gateway secret 存平台秘密設定，沒有放入前端 |
| PRIVATE | access mode `custom`、policy revision **1**；只允許既有 **1 位 owner**，groups／editors／external visitors 均 0。本輪沒有擴大存取 |
| Railway 專案 | [pika-system-private-poc](https://railway.com/project/de13e86c-9d70-4396-85be-79cd73cd412f)，project `de13e86c-9d70-4396-85be-79cd73cd412f` |
| 環境 | `143266a9-b10c-4dec-9b8f-f4eec9bec86a`。Railway 預設標籤為 `production`，但它屬於**此次新建的隔離 POC 專案**，與 Replit production 無關 |
| Express | service `1068b8cf-3623-4b85-a702-d7bb7b70080e`（`pika-poc-api`）；Railway `sfo`、1 replica、port 8080；最後 deployment `ed470da8-3183-44a1-af3e-daf3daac3291` **SUCCESS** |
| PostgreSQL | service `8fefb8b0-4e60-4b2b-b87d-b3cd486388b8`；官方 PostgreSQL image、SQL 實回 **18.6**；私人 DNS `postgres.railway.internal`，DB `pika_sites_poc`、user `pika_poc`；沒有公開 PG URL／proxy |
| 持久儲存 | volume `809063d5-afe1-44b1-a463-ac39b5853c7d`，instance `6f742c69-29a1-4928-ad80-e8a8085e24a3`，**READY／500 MB**，掛載 `/var/lib/postgresql/data` |
| Clerk | 沿用 `pika-system-private-poc` **Development** application 與已確認的唯一 owner；新雲端合成 store **1** 精確綁定指定 userId；沒有重新註冊賣家或自動建店 |

API 的 `DATABASE_URL` 使用 `${{Postgres.DATABASE_URL}}` 私人 reference。建庫前實查 DB 身分及 public schema **0 張表**，才執行既有 Drizzle schema、六個 triggers 和合成 seed；沒有搬原本機／Replit 資料或使用正式憑證。雲端店 1 與前輪本機店 8 是不同測試資料，沒有共寫。

PRIVATE 與管理權限分開驗證：匿名 Sites 首頁／catalog 均 **401**；直接碰 Railway API、沒有 gateway secret 為 **403**；經 Sites 到管理 API、沒有 Clerk 為 **401**。管理請求仍須真 Clerk session、指定 owner 和 store 歸屬。平台邀請功能可用不等於已邀請外人，目前 external visitor 數為 0；另一已登入 ChatGPT 帳號未實測，不能宣稱這項跨帳號驗收已完成。

## 2. 真實線上核心流程與持久性

識別：`PIKA-ONLINE-20260925202620633`。合成 store **1**、product **2**、order **1**；沒有客戶真實個資。HTTP 自動化使用 Sites 官方 QA token 通過私人站點門檻，再以該指定 owner 的真 Clerk Development session 取得短效 JWT；應用層沒有測試登入後門。

| 步驟 | 實測結果 |
| --- | --- |
| 店主新增／維護商品 | POST **201**、PATCH **200**；單價 100、庫存 3，合成描述已更新 |
| 模擬客人瀏覽 | catalog／商品 **200**；依既有公開合約核對 `name`、`price`、`shareToken` |
| 客人購物車買 2 件 | POST **201**；面交，**100 × 2＋運費 0＝200** |
| token 查單 | **200**，orderTotal 200、quantity 2；沒有公開原始姓名／電話、內部備註或成本快照 |
| 店主後台收單 | **200**；同一 publicToken 對應 order 1；庫存 **3−2＝1** |
| 雲端直接 SQL | product／orders／stores join 精確匹配同一識別、owner 與 store 1，確認 price 100、quantity 2、total_price 200、shipping_fee 0、inventory 1 |
| API 重啟後 | 新 deployment 成功；token 查單、後台讀單及庫存再次相符 |
| 本機全部停止後 | 本專案 API、PG、tunnel 三容器為 `exited`；Sites 查單／後台／商品仍 **200**，同單 200 元、庫存 1 |
| 基本統計 | totalOrders 1、pendingOrders 1、totalRevenue 200、pending 分組 1 |
| 必要拒絕 | 無 Clerk 管理 **401**；錯 store 管理 **403**；建立另一店 **403**；不存在 token **404**；無 gateway 直連 API **403** |

真 Clerk owner 已測通；非 owner 的 live Clerk 第二帳號未建立，其拒絕仍以既有 mock 路由測試及明確 owner 檢查為證，不冒充雙真人帳號測試。

去密證據保存在被 Git 忽略的 `.poc/checks/`：`phase2-online-http.json`、`phase2-cloud-initialize.json`、`phase2-cloud-order-proof.json`、`phase2-online-persistence.json`、`phase2-online-resources.json`。報告不包含完整 token、JWT、cookie 或 DB 密碼。

## 3. 最小修改與驗證

- `sites/poc/Dockerfile`：Node **24.18.0**、pnpm **10.34.4**、原 frozen lockfile；建置原 Express bundle，以非 root 執行既有 POC 啟動器。不掛載使用者電腦。
- `sites/poc/prepare-api.mjs`、`Dockerfile.dockerignore`：封裝 API、必要 workspace libraries 與建置設定；排除 secrets、Git、node_modules、舊 dist 和 Windows junction。只上傳乾淨來源，沒有 push GitHub。
- `artifacts/api-server/src/poc/database-guard.mjs` 與其測試：保留本機 `db`；線上只接受明確釘選的 Railway 私人 host，仍要求 POC 模式、測試 DB／user。host 來自本輪新服務，不以名字當作隔離的唯一證據。
- `artifacts/api-server/src/poc/online-database.mjs`：一次性 inspect／initialize／verify。初始化拒絕非空庫；驗證採參數化 SQL，核對真實保存的合成單。**不在 API 啟動時執行**，最後部署 `preDeployCommand=[]`，start command 是 `node src/poc/start.mjs`。

沒有修改業務金額公式、訂單路由、既有授權 middleware、Clerk、產品 OCR 模型、schema／FK 或歷史 migration。本輪容器部署驗證由 B＋Astra 主會話執行；前輪獨立 Astra 唯讀審查與 40 項結果保留，不冒充本輪全部重跑或另一次獨立審查。

| 驗證／實際指令 | 結果 |
| --- | --- |
| `node --test artifacts/api-server/src/poc/database-guard.test.mjs` | **11/11 通過**；已包含在下面 20 項中，不重複累計 |
| `node sites/poc/prepare-api.mjs` | 通過；乾淨來源排除項 0、symlink 0；加上一次性 DB helper 後來源 388 檔 |
| `docker build --progress=plain -t pika-sites-poc-api:phase2 <乾淨來源目錄>` | **exit 0**；Railway 上傳後建置亦成功 |
| `docker compose -f sites/poc/compose.yaml run --rm tools run typecheck` | **exit 0**；libs、API、shop-app、mockup-sandbox、scripts |
| 容器內 `node --experimental-test-module-mocks --import tsx/esm --test src/poc/database-guard.test.mjs src/poc/privatePoc.integration.test.mjs` | **20/20 通過、exit 0**；使用本專案隔離本機 PG，Clerk 為測試 mock |
| 斷網容器內相同 Node flags，執行下列五個既有 fixture 檔 | **38/38 通過、exit 0**；`--network none`，沒有外部 OCR、物流或 DB 呼叫 |
| 一次性雲端 `node --import tsx/esm src/poc/online-database.mjs verify PIKA-ONLINE-20260925202620633` | **通過**；核對真 Railway SQL，驗證部署 `4f79ba40-7ba7-4d8b-a962-f0721bf2e2ae` 成功，隨後移除 hook |
| 完整瀏覽器 E2E／人工驗收 | **未完成／延後**；CUA 控制持續逾時，未執行真瀏覽器完整點擊鏈，沒有刪斷言或以 HTTP 冒充 |

五個 fixture：`src/lib/invoiceOcr/invoiceOcrCore.test.mjs`、`src/lib/logistics/workers/trackingWorkerPhase2Runtime.test.mjs`、`src/lib/monthlyProfitReport.test.mjs`（前三者在 API workspace），以及 `lib/db/src/transport-cost/productUnitProfit.test.mjs`、`orderProfitSnapshot.test.mjs`。記錄：`phase2-container-tests.txt`、`phase2-follow-on-fixtures.txt`、`phase2-image-build.txt`、`phase2-railway-final-deploy.txt`。

手算核對：沿用既有成本 fixture 的假商品售價 1900、日幣進價 8000、測試匯率 0.21、免運輸分攤，成本 **8000 × 0.21＝1680**，單件利潤 **1900−1680＝220**。這是測試輸入，未改任何商業參數。線上核心商品未填成本，既有回應為 `pending_confirmation / missing_product_cost_jpy`；購物車利潤快照為 `pending`，沒有把缺值算成零。

兩個已處理的建置／部署問題：Windows pnpm junction 使直接工作樹 build context 失敗，改乾淨來源封裝；Railway `redeploy` 會重用舊部署設定，曾重播初始化 hook，被「非空測試庫」檢查拒絕而失敗，**沒有覆寫資料**。之後明確設定 start command／空 hook，使用 `railway up` 套用新設定並成功；最後已讀回空 hook。[官方 deployment actions](https://docs.railway.com/deployments/deployment-actions)。

## 4. 後續功能的真實狀態

| 功能 | 本輪接續成果與界線 |
| --- | --- |
| 基本訂單統計 | 已直接使用現有線上 endpoint，核對 1 單／200 元，不改演算法 |
| 成本／快照／月報 | 原模組與資料欄位保留；缺值顯示在線上已核對，計算及月報 fixture 通過。完整成本輸入、行程分攤與月報 UI/API 尚未在私人 POC 全流程接通 |
| OCR／圖片 | 原影像檢查、OCR request／回應、重試、模型 allowlist、CSV fixture 通過；未變更產品模型。獨立測試儲存及 OCR 測試憑證尚缺，真上傳／OCR 呼叫／結果保存未接通 |
| 物流 | 原 adapter／worker 保留，fixture 核對狀態提交和跨店／跨單拒絕；線上 token 查單保留未出貨狀態。真查詢／匯入／配送服務未接通，未建立真物流單 |
| 背景工作 | 兩個 Railway service 均無 cron；POC 路由限制與外部憑證拒絕保留，未讓排程接觸正式訂單 |

以上外部缺口不阻擋已交付的核心；沒有建立新增付費資源來補齊，也沒有為了第一版刪除原功能。後續最小接線是獨立測試圖片儲存，再接依賴圖片的 OCR；目前沒有要求使用者逐頁人工驗收。

## 5. 費用、常駐服務、回復與版本

Railway 帳號已在 Chrome 完成 device 授權；官方 CLI **5.62.1** 只放在本專案忽略目錄，官方 release SHA-256 核對通過。2026-09-26 最後讀回：`plan=HOBBY` 同時 **`isTrialing=true`**、剩餘試用 **30 天／約 US$4.999**、**沒有付款方式**。使用現有試用信用，沒有綁卡、升級、購額度或啟用付費替補。API 和 PG 會持續消耗試用額度；此測試站不是永久免費承諾，額度／期限結束後需重新決定延續方式。Hobby 正式方案每月最低 US$5、含等額用量，超額另計；試用與 volume 到期保留政策見 [試用文件](https://docs.railway.com/pricing/free-trial) 及 [方案](https://docs.railway.com/pricing/plans)。未擅改可能影響其他專案的 workspace 整體用量限制。

- **持續在線**：原 PRIVATE Sites、Railway `pika-poc-api`、Postgres 及其持久 volume。沒有其他新 cron、真通知或金流服務。
- **本機已結束**：build／typecheck／所有本輪測試程序；fixture 容器 `--rm` 自動移除；原 `pika-sites-private-poc-api-1`、`pika-sites-private-poc-tunnel`、`pika-sites-private-poc-db-1` 已停止。資料卷與原 `.poc/api.env` 保留，不刪其他專案容器。
- **同一私人版本回復**：Sites 保存版本 `appgprj_6ab69a6062348191809b743a5635f83e~appgver_eb1013f9b82c8191ac6e43b6587493a8`、來源 commit `62b8e1331ddd969e53c61041bac61d09936756f8` 未改。可在本測試專案恢復已驗證的 API image／設定並重新私人部署；不要回復帶 initializer 的舊部署設定。
- **回到前輪本機備援**：先啟動本專案原 API／PG／tunnel，核對當次真正的 tunnel URL，再將 Sites API origin 改回並私人重部署同一保存版本；Quick Tunnel 舊網址不保證永久可用。這是備援，會重新依賴本機，且使用原本機 store 8，不搬雲端假單。更新前收據在 `phase2-sites-rollback.json`，舊 `.poc/deployment-receipt.json` 保留為歷史紀錄。
- **工作樹**：`codex/chatgpt-sites-private-poc`；HEAD／固定基準 `33953b1fa8586110863c76304f5b6d3dc9f1ba92`。延續既有未提交 POC，沒有 reset／stage／commit／push。
- **實際模式**：B＋Astra。沿用客戶端已觀測主會話 `gpt-6-astra/max`，前輪普通獨立審查 `gpt-6-astra/high`；沒有自行換模型、呼叫 SWE-2／Devin／Replit AI 或啟用子代理。後端內部模型不可獨立觀測。
- **原環境**：原 OCR 工作樹讀回仍乾淨、固定基準未改；main ref 仍 `87b6eaaf2c08c85164e80b72a80f7246e2ebbbd9`。Replit production、正式網域、真資料、production 憑證均未操作；Replit 只曾做失敗的唯讀列舉。
- **備份**：本輪改前差異／文件在 `C:/Users/Lnovo/Documents/Codex-backups/SITES-POC-20260926-online-prep/`；回復只作用於本次變更，先比對後續修改，不 reset／clean、不刪持久卷。

交易限制沿用 `PHASE1-PLAN.md` 已核對的 Sites Terms 2.5(e)、2.6、3.3 與 Help Center 第三方支付例外，沒有概括成「Sites 禁止電商」。本輪全部合成資料，不接真金流或新增支付整合。
