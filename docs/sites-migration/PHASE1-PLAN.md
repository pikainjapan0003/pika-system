# pika-system 單一店主・ChatGPT Sites 私人遷移：整合方案與 POC

更新：2026-09-27（Asia/Taipei）。使用者決定完整移除產品技能地圖，正在保存既有成果並拆除依賴；正常業務功能與既有停用決定保留，維持 Codex B＋Astra。**目前狀態以以下總進度及各階段實測報告為準；其餘方案與 G–J 節保留當時紀錄，不代表技能機制仍是未來產品需求。**

## 總進度

| 階段 | 狀態 | 實際成果／證據 | 下一步或阻礙 |
|---|---|---|---|
| 技能地圖／問卷／套餐／解鎖機制 | 進行中 | 產品決定移除，不是待搬功能；本輪已核對 GitHub 遷移分支仍在歷史基準，Sites 為第 6 版 | 保存 checkpoint、拆除依賴、自動測試、私人部署及測試專屬表清理；只同步遷移分支 |
| 最小方案與私人 POC | 已完成 | 本報告 G 節：指定店主、合成商品、下單、token 查單 | 保留既有業務規則與資料結構 |
| 線上獨立 API／PostgreSQL | 已完成 | [Phase 2 報告](PHASE2-ONLINE-TEST-REPORT.md)：Sites＋Railway，停止本機後仍可讀回 | 沿用隔離資源 |
| 私有 R2 商品圖片 | 已完成 | [R2 報告](R2-TEST-INTEGRATION-REPORT.md)：pika-sites-poc 真實存取及重啟驗證 | 不動正式 bucket |
| 真 OCR | 已完成 | [OCR 報告](OCR-TEST-INTEGRATION-REPORT.md)：一張合成收據、一次真呼叫、run 1 保存及刷新讀回 | 本輪不再呼叫 OCR |
| 全家查詢入口與程式接線 | 已完成 | 已部署 Railway API 與 Sites 第 5 版；[物流報告](LOGISTICS-TEST-INTEGRATION-REPORT.md) | 入口可展開不等於真物流整合完成 |
| 全家本機 fixture 與必要回歸 | 已完成 | 24 項測試、typecheck、build 已通過 | 本機 fixture 不作為有效外部貨態證據 |
| 全家有效外部貨態 → 線上存庫 → 後台／客人頁 | 待處理 | 尚未驗證；待合法官方測試單號或本人包裹唯讀授權 | 不阻擋其他遷移，不再重試或查他人包裹 |
| 客人物流頁瀏覽器驗收 | 延後驗收 | 本輪未完成；token API 只證明原假單仍可讀 | 待合法貨態後一併自動補驗，現在不需人工操作 |
| 既有成本快照摘要／每月毛利報表讀取 | 已完成 | 20 項測試、typecheck 通過；Railway 已部署；瀏覽器月報、月份切換與刷新均讀回；詳見 H 節 | 沿用定格快照，缺成本保持待確認；不代表新增成本公式已實作 |
| 既有客戶／行程基本功能 | 已完成 | 真 API 保存合成客戶 1／行程 1／路線 1；更版後同值，客戶明細及行程頁刷新讀回；測試與 typecheck 通過，詳見 I 節 | 完成範圍為基本資料與手填費用；後續三項接線另列如下 |
| 既有帳本寫入／客資匯出／商品交通成本套用 | 已完成 | 32 項局部測試、root typecheck 通過；私人 Sites＋Railway 已更新，假帳本餘額 20、假客戶 CSV、商品 3 的交通成本 6.3；API 重啟後同值，詳見 J 節 | 完成本階段可自動完成的接線，不開其他成本公式／正式副作用 |
| 本輪三項功能的瀏覽器畫面驗證 | 延後驗收 | 瀏覽器控制連續逾時；Sites 同源 HTTP、Clerk、後端與測試庫流程已通過 | 未宣稱完整瀏覽器 E2E；不要求使用者現在人工代測 |
| 人工功能驗收 | 延後驗收 | 依使用者指示，自動測試先行 | 只有必要登入、秘密設定或外部測試資料缺口才找使用者 |

**建議：Sites 承載 React 網站與輕量 HTTP 轉送層，保留獨立測試環境的 Express＋PostgreSQL。先停用多賣家建店入口，補上指定店主／指定店鋪的後端限制，再驗一條完整的假資料下單流程。**

2026-09-25 使用者已確認「Sites 前端／必要輕量轉送＋隔離 Express API＋獨立 PostgreSQL／Drizzle」，授權 B＋Astra 持續實作合成資料私人 POC。以下原讀碼盤點保留；本輪施工、測試與未完成的真登入／部署驗收會更新於本報告末段。未授權真資料、真金流、公開發布或新增費用。

### 給店主的最小方案

先沿用目前的網站、Clerk 登入和 PostgreSQL 業務邏輯。Sites 負責顯示網站與轉送 API 請求；原 Express API 改在隔離測試環境執行。這樣保住既有訂單交易、成本快照與資料關聯，主要修改集中在指定店主／店鋪授權、停用建店入口及部署適配。

第一個 POC 只驗「店主管理假商品 → 模擬客人下單 → 測試 PostgreSQL 真正存單 → 用既有 token 查單 → 店主後台收單」。商品圖先用合成靜態圖，OCR、物流、上傳、行程與報表保留，依後續小切片接入；不改成本公式或產品 OCR 模型。

先完成本機隔離切片，再接上私人 Site。遠端 API／測試庫、安全 HTTP 通道、Clerk 測試設定與 Site 私人存取仍需實測；不預設全部都在 Sites 或無額外費用。

**交易限制更正（2026-09-25 查證）**：2026-07-23 更新的 ChatGPT Sites Terms **2.5(e)** 禁止金融交易，但明確排除 **2.6** 許可、由第三方支付供應商處理的電商活動。2.6 允許透過第三方供應商銷售商品／服務與收款；整合、履約、退款、客服、保固及稅務等責任由站主負責。**3.3** 對付款卡／PCI 資料也有對應例外：只能由第三方支付供應商收集及處理，不得交由 OpenAI 處理。條款載明衝突時 Sites Terms 對 Sites 的使用優先。因此不能將 Sites 一概寫成禁止電商。[Sites Terms](https://openai.com/policies/chatgpt-sites-terms/)

Help Center 同樣明確支持第三方支付例外與站主責任；概述頁的簡寫不應覆蓋這項例外。本輪依使用者範圍仍只用合成假單，**不接真金流、不新增支付整合**。日後正式交易需逐項確認實際支付資料流與服務條款，這不是本次假單 POC 的驗收。[Creating and managing ChatGPT Sites](https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites)

## 0. 方案交付時的事實、證據與限制（施工結果續記於末段）

| 項目 | 核對結果 |
| --- | --- |
| 工作目錄 | `C:/Users/Lnovo/Documents/ChatGPT/pika-system-Sites私人遷移` |
| Repo／來源分支 | `pikainjapan0003/pika-system`／`codex/invoice-ocr-integration` |
| 固定基準 | `33953b1fa8586110863c76304f5b6d3dc9f1ba92` |
| 遷移分支 | `codex/chatgpt-sites-private-poc`；本輪 HEAD 仍為固定基準，`merge-base --is-ancestor` 回傳 0。沿用已存在 worktree 與未提交成果，沒有 reset 或重新 fetch |
| 工作路由 | 直接 B 主會話作業；本輪無 SWE-2／Devin、其他模型派工或子代理 |
| 模型 | 本輪要求 Astra；本案綁定要求 `gpt-6-astra`／`medium`，未改模型或派其他模型。官方 list/read 未回傳本輪模型／effort 接受值，獨立後端觀測未知。原準備會話的 `gpt-6-astra`／`max` 客戶端紀錄僅屬歷史，不代表本輪實測 |
| 專案身分 | 本輪官方 list/read 成功核對 projectId `4eb00f1d-b20d-4c77-bbc1-d073eee756fe`、host `local`、目前 cwd；唯一主控 `01a0d870-7de3-78f2-bb79-3c7a31ac6f05`，不重建 |
| Sites | 本輪 owner 範圍 `sites_list_sites({limit:20,role:"owner"})` 成功：`isError=false`、`items=[]`、`cursor=null`；本地 `.openai/hosting.json` 不存在。只證明此帳號清單可讀，未證明建立／部署權限、額度或業務流程 |
| 本機檢查 | 歷史 `backfillTripStoreSafety.test.mjs` 7/7 通過（Node v24.13.1），本輪未重跑；本輪只核對 Git／文件／工具，不連 DB、不執行 backfill |
| 未執行 | dependency install、完整 build/typecheck、DB/API/Clerk/瀏覽器 E2E、真 OCR／物流、Sites 部署及獨立第二會話審查 |

本文標示「程式」指固定 commit 的實作；「官方本機文件」指本機已安裝 Sites 技能；「工具」指真實連接器回覆；「建議／推論」並非已實作或部署。

初次調查已列 Git refs／worktree、取回既存遷移 ref 並建立獨立工作樹；本次不重做。本次 Git tracked diff 仍只有既有 AGENTS 說明，新增成果集中於交接文件與 `.codex/`。A、B 節沿用同一固定 HEAD 的既有讀碼結果，不以歷史文件取代實作證據。沒有 reset、改動來源分支、push 或啟動原部署。Replit 平台端的自動部署設定仍未登入核對。

## A. 固定版本的架構摘要

### A1. 套件、建置與測試

| 位置 | 現況與入口 | 對遷移的意義 |
| --- | --- | --- |
| `package.json`、`pnpm-workspace.yaml` | pnpm monorepo，`artifacts/*`、`lib/*`、`scripts`；根 `build` 先 typecheck，再遞迴 build；根沒有 `test` script | 不把單一前端 build 當全案測試；保留 lockfile／workspace |
| `artifacts/shop-app/package.json`、`vite.config.ts:7,21,34,71,84` | React 19、Vite 7、Wouter、TanStack Query；Vite 需要 PORT／BASE_PATH，輸出 `dist/public`；開發期 `/api` 代理到本機 API | Sites 需要獨立封裝產物與真實 API 路徑；開發 proxy 不會自然出現在部署後 |
| `artifacts/api-server/package.json`、`build.mjs:13`、`src/index.ts:19` | Express 5；esbuild Node ESM，pino worker；`build` → `dist/index.mjs`，`start` 啟動 `app.listen(PORT)` | 是常駐 Node server，不是可以直接上 Sites 的 Worker fetch 入口 |
| `lib/db/src/index.ts:1`、`drizzle.config.ts` | `pg.Pool`＋Drizzle node-postgres，匯入即要求 DATABASE_URL；PostgreSQL schema | 先保留獨立 API 內的連線；瀏覽器與 Sites 靜態包都不放 DB 憑證 |
| `lib/api-spec/orval.config.ts`、`lib/api-zod`、`lib/api-client-react` | OpenAPI/Orval 產生驗證與 API 客戶端；`custom-fetch.ts:28,43` 已有 base URL／token getter | 生成物不手改；同源 `/api` 轉送可減少廣泛改 frontend fetch |
| `.github/workflows/ci.yml` | Ubuntu、Node 24、pnpm 10.34.4、隔離 PostgreSQL 16；包含 DB push、合成資料與 Node/瀏覽器測試 | 不能在繼承 production env 的環境整套照跑 |

`pnpm-workspace.yaml` 將許多非 Linux-x64 原生套件排除。Windows 直接完整安裝／建置的相容性本輪未驗證；下一階段優先使用獨立 Linux/WSL 或已核准建置環境，保留原 lockfile，不先改全域 Node 或套件政策。

### A2. 公開客人與管理端資料流

- **客人**：`App.tsx:454` 的 `/p/:shareToken`、`/cart`、`/track`、`/track/:publicToken`，另有 CVS 選店／回跳頁。`TrackLookup.tsx:9` 使用追蹤碼，不是客戶帳號登入。
- **公開 API**：`routes/public.ts:122,164,337,560,661` 分別是商品、單品下單、購物車下單、查單與付款末五碼。下單在交易中鎖商品列、扣庫存、保存訂單與成本快照；查單只輸出指定欄位並遮罩個資。這些都要保留。
- **店主後台**：`App.tsx:183` 的 MerchantPortal 包住 dashboard、商品、訂單、月毛利、客戶、物流、代理設定、OCR、店鋪設定與行程等頁面。不是看到 merchant 就刪掉整個後台。
- **現在的身分規則**：`middlewares/auth.ts:5` 驗 Clerk 登入；`:16` 的 `verifyStoreOwner` 比對 `stores.merchantId` 與使用者 ID。它保障一般多店隔離，但尚無「本系統只接受一位指定店主」的統一限制。
- **新增店鋪入口**：`App.tsx:211` 對 `/me/store` 的 404 自動呼叫 createStore；`pages/Setup.tsx:49` 可手動建店；`Home.tsx:32` 導向註冊；`routes/stores.ts:28` 允許已登入且尚無店鋪者建立。必須一起規劃停用，不能只藏首頁按鈕。
- **`/me/store`**：`routes/stores.ts:10` 依目前 merchantId 查店並 limit(1)。不是查全庫第一家，但若同 ID 存在多店會有歧義；單店方案改用明確可信的 store ID 並驗證對應，不依賴 limit(1)。
- **替代入口**：`agentAuth.ts:14` 用有效 agent token，`agent.ts:87` 按 token 的 storeId 取物流工作；`internalLogisticsSync.ts:28` 用 CRON_SYNC_SECRET。不能以「Clerk middleware 已改」推論這些入口也已受單店限制。

固定基準發現：`public.ts:396–500` 逐件讀商品，但訂單 storeId 取第一件商品所屬店鋪，該段沒有逐件同店檢查。批准後已在 POC 模式逐件限制指定店鋪，並以真測試 PG 驗證混店整筆回滾；非 POC 路徑保持原行為。實作及測試另見 G 節。

### A3. 資料、約束與業務依賴

| 實際位置 | 必須保留的內容 |
| --- | --- |
| `lib/db/src/schema/stores.ts:18` | 原店鋪 ID、merchantId、slug、品牌、物流開關、匯率；merchantId 有 index，不等於 unique 約束 |
| `schema/products.ts`、`schema/orders.ts:73` | 商品／店鋪／客戶關聯；order publicToken 唯一；庫存與交易；普通／VIP／批發／合作價格不等於多賣家帳戶 |
| `schema/customers.ts:24` | 永久數字 ID、storeId、(storeId,code) 唯一、general/vip/wholesale/partner；四級客戶資料保留 |
| `schema/orders.ts:94,101,128,169` | 金額 numeric(10,2)、儲值與毛利 numeric(30,12)、JSONB 多品項與快照、訂單當時資訊；不要改成浮點財務儲存 |
| `schema/storeCreditTransactions.ts:31`、`migrations/0021_store_credit_transactions.sql:46` | append-only 帳本、restrict 外鍵、部分唯一 index、UPDATE/DELETE 拒絕 trigger；僅產生 Drizzle table 不代表 trigger 已備齊 |
| `schema/trips.ts:17`、`schema/tripRoutes.ts:23`、`migrations/0026_trip_store_ownership_nullable.sql` | 店鋪歸屬目前 nullable、尚待歷史回填；trip_routes→trips 有關聯，但這兩個 storeId 未在 schema 宣告 stores 外鍵。不能把 NULL 自動認領給唯一店主 |
| `schema/invoiceOcr*.ts`、`migrations/0041_invoice_ocr_benchmark.sql` | 案例／run／人工 review、店鋪關聯、重試來源、唯一條件、鎖定標準答案及終態保護 triggers |
| `schema/cvsStores.ts`、shipment tracking 系列表、auditLogs | 超商門市、物流查詢與操作歷史；與平台租戶不是同一概念 |

沒有讀取真實資料庫，因此無法斷言目前只有一筆 stores、NULL storeId 已清完、歷史資料全屬店主、migration 全已套用。以上是程式／SQL 的依賴盤點，不是實際資料清理結論。

### A4. OCR、上傳、物流與平台假設

- **產品 OCR**：`lib/invoiceOcr/config.ts:1,28,134` 定義 terra／sol／luna 清單，預設 `gpt-5.6-terra`、low、original，env 可覆蓋；未讀真實 env，不能聲稱正式環境就用預設。`openaiInvoiceExtractor.ts:20,358` 用官方 OpenAI Responses structured parse，`store:false`，預設請求上限 90 秒（可設定範圍 10–180 秒）。它不受「工程全 Astra」要求影響。
- **OCR 授權／檔案**：`invoiceOcrSupport.ts:24,157` 用記憶體上傳、檔案限制、店鋪 owner 檢查、enabled/testMode／Clerk allowlist；`invoiceOcr.ts` 另有人工確認及 UNKNOWN 防重跑。下一階段先 fixture/mock；本輪沒有真呼叫或更改 timeout。
- **商品圖**：`upload.ts:53` 經 owner 驗證，記憶體上傳限 5 MiB，AWS S3 client 寫 R2，回傳公開 URL（`:99`）；`r2.ts:11` 讀伺服器 env。現有公開圖片 URL 不能因 Sites 私有就當成私有素材。
- **物流**：`sellerAgent.ts:138` 管理店主自動化設定；`agent.ts` 取工作／回報事件／更新摘要；`internalLogisticsSync.ts` 與 `scripts/step7/run-familymart-worker-scheduled.mjs:27` 是 Node 排程／子程序入口，不是前端功能。排程入口無指定店鋪參數時可能掃多店，需在未來單店版本明確收窄。
- **CVS**：`routes/cvs.ts:34,78` 查本地門市；`:156` 的 e-map 匯入有現行 403 停用，保持。客人選店流程保留，私人平台對外部回跳是否通暢需後續驗證，不能為通過改成公開。
- **Replit**：`.replit:1,3,21,26,33` 假定 Node24、autoscale、Linux 路徑、shell/pkill/重啟迴圈與 post-merge 腳本。這些不在新線執行。Vite 的 Replit runtime overlay／dev plugins、API proxy 和 Clerk `getClerkProxyHost` 都要在遷移建置／代理路徑檢查。
- **Clerk**：`clerkProxyMiddleware.ts:26,55` 的 `/api/__clerk` 只在 production 分支啟用，依 forwarded host 組 proxy URL。應沿用驗證模型，測試 Site hostname、Clerk 允許來源、cookie／token 與代理 headers，不直接移除 Clerk。

### A5. 文件與版本差異

1. 原 `AGENTS.md:39` 說成本／毛利尚不存在；目前 orders 已有快照、API 已有計算與月毛利頁。這是過期敘述，不以它重做財務核心。
2. `custom-fetch.ts:40` 註解不建議 web 使用 token getter，但 `App.tsx:493` 已實際注入 Clerk token getter。保留實作，下一階段測跨代理行為；不靠註解斷言可移除。
3. 此 commit 的 OCR 是辨識測試／benchmark／review 路線，不能稱已完成所有正式 OCR 記帳整合。客戶是目前四級主檔，公開查單是 token 方式，沒有在這些入口看到客戶自助登入。若期望其他專案後來新增的完整 VIP／CRM 功能，需另核對差異；本輪不改用別的 commit 偷補。
4. 原物流文件中的 code-ready／測試「完成」不證明正式外部服務已開啟。此輪只讀碼與純本機測試。

## B. 單一店主最小簡化與四類盤點

分類針對具體入口或結構，不把同名模組一刀切。沒有確認過的歷史資料不列為可刪。

| 類別 | 實際位置／目前用途 | 相依功能 | 建議處理與理由 |
| --- | --- | --- | --- |
| 1 現在仍需要 | `schema/stores.ts`、各表 storeId／merchantId／FK | 商品、訂單、客戶、OCR、稽核、物流 | 保留穩定 ID；單店並不消除資料歸屬 |
| 1 | `middlewares/auth.ts`、`routes/stores.ts` 的 GET/PATCH/stats | 所有管理 API、店鋪設定 | 保留 Clerk 與 ownership，再限制指定 owner＋store；不拆掉 authorization |
| 1 | `App.tsx` 的 MerchantPortal 與管理頁 | 商品、月毛利、客戶、行程、訂單 | 保留後台，去除自動 onboarding 分支 |
| 1 | `routes/public.ts`、PublicOrder／PublicCart／TrackLookup／TrackOrder | 客人分享、下單、付款末五碼、查單 | 保留 token／遮罩／限流；加指定店鋪範圍與混店拒絕 |
| 1 | `schema/customers.ts`、products 價格級別、customers／orders routes | 客戶及不同售價、歷史／儲值 | 保留；客戶層級不是其他賣家。首 POC 沿用公開普通價格，不新增客戶登入規格 |
| 1 | trips／tripRoutes、成本 domain、毛利快照及帳本 | 分攤、成本、月報／歷史 | 保留公式、精度、NULL 待確認狀態；不為單店重新計算舊資料 |
| 1 | `routes/sellerAgent.ts`、`agent.ts`、`agentAuth.ts`、sellerAgentSettings/Tokens | 既有店主物流自動化 | 保留並核對 token 的指定店鋪；名稱 seller 不是停用理由 |
| 1 | `routes/cvs.ts`、cvsStores、前端 CVS 選店頁 | 超商門市與收貨快照 | 保留；維持現有 e-map 匯入停用，不順手開外部服務 |
| 1 | `invoiceOcr*`、OCR merchantName | 發票上的商家／辨識證據 | 保留原模型與限制；merchantName 不是登入商家帳號 |
| 1 | `routes/skills.ts:129`、storeSkillStates、`lib/OnboardingQuestionnaireCard.tsx:26` | 店主成本／物流／團購功能建議與啟用 | 與建立新 seller 不同；不要一起刪除，目前保留 |
| 2 單店後可停用 | `Home.tsx:32`、`App.tsx:149,449` 的 sign-up 入口 | 新賣家註冊入口 | 移除平台招募／註冊路由；後端仍獨立拒絕非 owner。Clerk 帳號端策略另核對，不在本輪改帳號 |
| 2 | `App.tsx:211` 404→createStore | 登入自動建另一間店 | 改為明確設定錯誤／無權限，不再自動造店 |
| 2 | `routes/stores.ts:28` POST `/stores` | Setup 及自動建店 | 在單店部署拒絕新增店鋪，即使是 owner 也不從此入口增設第二家；POC 用專用合成資料初始化 |
| 2 | `App.tsx:442,465` `/setup` 與 createStore 導航 | seller onboarding | 停止服務此入口；既有店鋪設定 PATCH 保留 |
| 3 暫留但不使用 | `pages/Setup.tsx`、SignUpPage 元件與相關 create-store API contract | 歷史功能、生成型別、舊測試 | 先斷入口；避免第一輪刪檔牽動生成物或歷史測試，可明確標示停用 |
| 3 | `.replit`、Replit 專用 Vite 分支及原 shell 流程 | 原平台回溯依據 | 新 Sites 建置不執行；原 OCR／production 完全保留，不改原平台設定 |
| 4 待資料依賴確認才可刪 | `stores` 與指向它的 products/orders/customers/audit/OCR 等歷史列、merchantId/storeId | 可能有 cascade/restrict／NULL／舊識別關係 | 現在不刪。不讀歷史庫就不能認定其他 store 列是垃圾；未來若真要刪資料需獨立核對與授權 |
| 4 | `lib/db/migrations/*`、歷史建店 contract／舊測試依賴 | 重建、回溯、生成客戶端 | migration 歷史繼續保留；只在將來證明無消費端、無重播依賴後評估清除舊介面，並非本案必要工作 |

盤點範圍包含以上實際入口、關鍵 middleware、schema／SQL、背景工作及關聯測試。未宣稱所有程式行或真實歷史資料都已審完；完整管理 API 的負向路由矩陣會是下一階段的驗收材料。

### 唯一店主與店鋪的確認方式（已採用，驗收結果另記）

1. 保留 Clerk 簽章驗證，不信任 request body 自填 userId。新增 `PIKA_PRIVATE_POC=true` 的隔離模式，由 `PIKA_OWNER_CLERK_USER_ID`／`PIKA_OWNER_STORE_ID` 明確指定店主與店鋪。POC 精確比對 Clerk 的 `auth.userId`，不使用可另行映射的 `sessionClaims.userId` 來提升其他帳戶；非 POC 原有映射保留。
2. 啟動／請求時驗證指定店鋪存在、merchantId 與 owner 對應。缺設定、對應不符或歧義都拒絕管理操作，不能挑第一筆、不用 storeId=1、不把第一位登入者認成 owner。
3. 管理端同時驗證「已認證 owner＋資源屬於指定店鋪」；orders/customer/product ID 也回查歸屬。公開端不要求客人登入店主，但只處理指定店鋪的分享商品／訂單。
4. 物流 agent token、internal cron 等替代入口各自保留原驗證並加店鋪限制；首 POC 不啟動它們，不把測試用 header/mock 放入部署後的放行規則。
5. 不新增 DB singleton constraints、不批次刪舊店。合成 POC 店的 ID 由插入結果取得，再以可信設定明確綁定。

## C. ChatGPT Sites 相容性

### C1. 來源與本次增量查證

- **官方本機技能**：`C:/Users/Lnovo/.codex/plugins/cache/openai-curated-remote/sites/0.1.71/skills/sites-building/SKILL.md:212–235`：既有架構可保留；server build 要 Worker-compatible ESM/default fetch；static 目錄有指定清單；hosted Sites 不支援 raw TCP socket，外部 DB／服務須走 HTTP。
- **官方本機細則**：同技能 `references/persistence-and-storage.md`、`authentication.md`、`starter-capabilities.md`；`sites-hosting/SKILL.md`：D1/R2 binding、環境值由平台管理、私人部署操作與存取核對。D1 migration 可能在 Worker 發布失敗前已生效，不能以回版代表資料回復。
- **官方網頁**：方案階段讀取 [Sites 開發指南](https://learn.chatgpt.com/docs/sites) 的存取／秘密、儲存、版本與 runtime 限制；HTTP／HTTPS 可用、raw TCP 不支援。批准實作後，另實際開啟最新 [Sites Terms](https://openai.com/policies/chatgpt-sites-terms/) 與 [Sites 建立與管理](https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites) 全文，交易例外見開頭。owner／workspace admin 的平台權限與應用 Clerk 登入是兩層。[workspace 管理](https://help.openai.com/en/articles/20001338-managing-chatgpt-sites-for-your-workspace) 仍列歷史參考，不冒稱重讀。
- **本次重讀本機官方技能**：`sites-building/SKILL.md`、`sites-hosting/SKILL.md`、`authentication.md`、`persistence-and-storage.md`；既有架構可保留，server 產物需 Worker-compatible fetch；Sites 外部 DB 走 HTTP；D1／R2 為原生選項，沒有因此改寫既有 PostgreSQL。
- **真工具**：方案階段 `sites_list_sites` 成功但無既有 Site。批准後已用 `sites_create_site` 建立一次私人 POC Site，並以 `sites_get_site` 讀回 owner-only 清單；真 ID 與實際存取限制見 G 節。尚無保存版本、來源推送或部署，不以工具存在等同發布成功。
- **尚未測通**：Sites Worker 到 HTTPS API 的連線、真 Clerk 登入、部署後第三人拒絕、外部儲存及瀏覽器完整下單。沒有啟動平台 AI 寫程式；產品 OCR 模型維持原設定，平台內部模型亦未驗證。

### C2. 相容性表

| 現有需求 | 已確認 Sites 能力 | 最小適配建議 | 依據 | 尚未確認 |
| --- | --- | --- | --- | --- |
| React/Vite＋pnpm workspace | 可接既有前端 build；static 支援 dist、dist/client、out、build、.output/public | 保留 monorepo，將 `shop-app/dist/public` 封裝成 Site 允許的公開輸出；SPA 深連結 fallback；不重寫 UI | 程式 A1＋本機 skill:212,226；Linux frozen install／前端 build 已通過 | Sites runtime 與真 Clerk 的瀏覽器結果仍待驗 |
| Express app.listen＋pino | server artifact 需 Worker ESM 的 fetch entry，沒有直接 Node listen 承諾 | Express 留在獨立測試 API；Sites 僅加小型 HTTP 轉送 Worker，靜態檔與 `/api` 同源 | index.ts:19、build.mjs:19；skill:224 | 私有 Site 的 Worker 路由／headers／streaming 實測 |
| pg TCP＋Drizzle/Postgres | **hosted Sites 不支援 raw TCP connect()**；官方網頁亦確認，可走 HTTP API | Site → 受保護 HTTPS API → 私網測試 PostgreSQL；不將 pg 原封搬到 Worker | skill:233；db/index.ts；[runtime 限制](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses)；本機隔離 PG 下單已測通 | API 的 HTTPS 通道與 Sites 到 API 完整路徑尚未配置或測通 |
| Clerk 身分＋owner authorization | 文件列出外部身分提供者網站形態；Sites audience 是另一層，未證明此 Clerk 部署可用 | 保留 Clerk token 檢查，補指定 owner/store；只將必要 headers 轉送；信任的 host 配置不可取自任意 client | auth.ts、App.tsx:493、Clerk proxy；authentication.md；官方開發指南 | Clerk 現有 app 是否允許 Site 網域／proxy、新測試 app 是否需要；未改認證設定 |
| R2/S3 圖片上傳與下載 | 官方 native R2 binding 可用；不能假定原 bucket 可直接變成本平台 binding | 首切片只用合成靜態圖片；下一切片用隔離 bucket 或核准 native R2；機密圖片需受控下載，不能沿用公開 URL 假稱私有 | upload.ts、r2.ts；storage reference | bucket 權限、尺寸、費用、私有素材與下載headers；未搬舊圖 |
| OCR 秘密、出站、90s/12MiB 預設 | 有伺服器 env/secret 管理及 HTTP 用途；不代表 repo 的長請求已通過 | 留 API 的原模型、validation／UNKNOWN 行為；先 fake extractor，圖片記憶體處理，下一切片驗封包／proxy 上限 | config.ts、extractor；starter/hosting 細則 | Sites/APIGateway body、CPU、duration 限制與真 OCR；不在此輪呼叫 |
| 物流回跳／webhook | HTTP route 可做；私人 audience 可能擋外部呼叫 | 保留 handler 分層；先 fixture callback；原 cron/agent 未啟動。不為測 webhook 放寬 Site audience | cvs／agent／internalSync 程式；官方私有規則 | 外部平台是否可穿過 private audience、handler 位置與認證；真正整合仍未驗 |
| 排程、背景子程序、物流 worker | 所讀文件／工具未確認本帳號可執行既有 Node cron/child_process | 留在隔離 API 主機的後續工作；首 POC 不啟動排程。工具中存在 tunnel 欄位不代表已可供使用 | scheduled script:27；Sites 工具能力盤點 | scheduler 配額／常駐能力／核准網路通道，均未配置 |
| PRIVATE、預覽、部署與將來公開 | 私人部署與存取設定工具存在；所有 deploy URL 都是部署，非 local preview | 本輪已獲准私人 POC；建立後讀回 audience，確認 owner/admin 可見範圍，再 private deploy；客人仍在私人範圍內模擬 | 官方管理文件＋hosting 細則 | 本 workspace 管理員可見性實測；第三人拒絕測試；公開發布未授權 |
| 真實商業交易用途 | Terms 2.5(e)、2.6 與 Help Center 明確允許第三方支付處理的電商；3.3 要求卡片／PCI 資料僅由該供應商處理 | 本 POC 只做合成假單，不新增支付整合；保留既有手動記帳邏輯 | [Sites Terms](https://openai.com/policies/chatgpt-sites-terms/)、[Help Center](https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites) | 尚未設計或驗收真支付資料流；不能由假單驗收推論支付已整合 |

**不能原樣全包搬入 Sites，但目前沒有證據否定「Sites＋獨立 API＋PostgreSQL」這條優先路徑。** raw TCP 限制是直接搬 pg 的具體障礙，不是重寫資料庫的理由。

## D. PostgreSQL 優先方案與回復界線

```text
使用者／私人測試中的客人情境
  → Sites 私人存取限制
  → React/Vite + 同源 /api HTTP 轉送
  → 獨立測試 Express API（Clerk／owner／store 授權）
  → 獨立 PostgreSQL（空 schema＋合成資料）
```

Sites 轉送到 API 必須另有服務端受信任通道：優先既有已核准的隔離 API 主機；以 HTTPS＋伺服器端憑證／網路限制保護直連，不能只靠 CORS 或隱藏 API URL。前端不持有服務憑證、DB URL 或 Clerk secret。轉送只允許固定 upstream 與必要路徑，管理請求仍由 Express 驗 Clerk 身分；不建立任意 URL proxy。

目前選用**本機 Docker Desktop 的獨立 Node24 API 容器與 PostgreSQL16 容器**；測試 PG 已建立，API 的真登入啟動待 Clerk 測試設定。DB 不對主機開埠；API 只綁 `127.0.0.1:8087`。Sites 仍需受保護的 HTTPS 通道才能存取此 API，尚未配置。這不是全部服務都在 Sites，也不是已取得永久遠端主機；沒有購買新服務。詳見 G 節。

最小網路驗證依序是：Sites 轉送端能以 HTTPS 呼叫隔離 API、API 拒絕沒有服務端通道憑證的直連、管理 API 仍驗 Clerk owner/store、API 透過私有連線存取測試 PG。客人情境可通過 Site 私人存取但不帶 Clerk 管理 token。這是待驗證路徑，不是本輪已通的服務。

官方 hosting 流程需要推送與保存版本相同的 Site 來源 commit。本案禁止推送 GitHub／原 production；不能直接對目前 GitHub origin 執行發布腳本。`sites/prepare-site.mjs` 將前端產物與小型 Worker 封裝至被忽略的 `.poc/site-source`，未來僅由該目錄同步 Site 自己的來源庫；不搬原專案、不改原 remote、不上傳 API 原始碼、秘密、DB 或客資。Site 已註冊並取得官方短期來源存取資料，但尚未使用、落入 repo 或執行 commit/push。

### D1. 空測試庫怎麼建立才不漏規則

- 專用測試連線、合成店主與店鋪，不複製 prod dump、不沿用 `.env`。連線憑證僅存環境 secret，本機測試也明確注入測試值。
- 保留既有 PostgreSQL/Drizzle schema、numeric、JSONB、FK、unique/check/index、時間欄位與交易 row lock。
- migration 是增量集合，不保證從空庫逐檔跑即可成功；先比較 schema 初始化路徑與增量 SQL，產出空庫初始化步驟，再在隔離庫驗 table/constraint/trigger catalog。**不能只跑 push-force 就宣告所有規則齊備。**
- 特別驗 0021 帳本保護及 0041 OCR triggers，不能因首切片不用 OCR 就丟掉其 schema；首 POC 不執行 OCR workflow。
- 保留 nullable trip ownership，不把測試初始化等同真資料回填。歷史 migration 是否生效要留待將來用已核准唯讀資料核對。

### D2. 為什麼目前不選 D1 重寫

Sites 有 D1 原生資料層，但 PostgreSQL 的 transaction/row lock、精確 numeric、JSONB、部分唯一 index、PL/pgSQL triggers 與現有 route tests 不能只換 driver 即等價。只有保留 PG 的 API 主機／連線路徑確定不可取得或使用者否決額外後端時，才另提 D1 差異實驗；不在本輪移植、也不並行開第二套資料層。

### D3. 未來正式遷移／rollback

首 POC 的 DB、儲存、認證測試配置與外部副作用皆獨立。停用 POC 即可回到原系統使用，不回寫原正式庫。這只證明 POC 隔離，不是正式資料搬移 rollback 已驗證。

未來若要切正式系統，需要另外核准資料盤點、備份／還原演練、店鋪與 ID 對照、一次切換的寫入凍結或增量策略、切換後新訂單處理及回切點。不能讓新舊系統共寫正式庫，又只靠 Git 回版聲稱可回復。

## E. 方案確認後的最小施工與驗收

### E1. 順序與範圍

| 步驟 | 最少工作 | 預計檔案範圍／交付 | 完成條件 |
| --- | --- | --- | --- |
| 1 | 沿用已核實的唯一主控／worktree／分支；準備隔離 Linux/Node24 建置、測試 PG 與合成 owner/store | 此案既有交接＋測試環境，保留 lockfile，不重建專案 | 無 production env；來源仍 pinned；維持 B＋Astra，不新增其他模型 |
| 2 | 用伺服器 trusted owner/store 關係收窄管理 API；停 sign-up/setup/auto-create/POST stores | `auth.ts`、`routes/stores.ts`、必要 ownership helper；`App.tsx`、`Home.tsx`、Setup 入口與負向測試 | 任意登入者及錯誤店鋪都被拒；缺設定拒絕；無自動造店 |
| 3 | 公開產品／單品／購物車／查單只操作指定店鋪；混店在 transaction 內拒絕 | `routes/public.ts` 及 public/authz/price snapshot tests | 客人不需店主登入；無混店寫入、越店查詢或客資外洩；快照／公式不變 |
| 4 | 空測試 PG 初始化完整規則＋少量合成資料；本機完整切片 | 只新增隔離初始化／驗證腳本，不改歷史 migration | 持久化、交易回滾、trigger與隔離測試通過；不以 mock DB 冒充 |
| 5 | Sites 打包、SPA fallback、固定 upstream 的同源 HTTP 轉送、Clerk proxy 與秘密管理 | 建議新增 `sites/` 小型 Worker 及包裝腳本；`.openai/hosting.json` 只在正式建立 Site 後寫真 ID | 本機 build 通過；API 不可被繞過；隔離 API／PG 與 Site 專用來源同步範圍核對完成 |
| 6 | 首次 PRIVATE POC（需本方案獲准後才執行） | 真實 private deployment、存取檢查及驗收報告 | 下表全部通過；記真 Site/version/URL/audience，而非文字宣稱 |
| 7 後續切片 | 商品圖持久性，OCR fixture，物流 fixture/callback，既有成本／客戶／儲值回歸 | 既有模組＋必要隔離 adapter／test | 分別標示 mock／sandbox／真服務狀態；需要真外部呼叫另按核准範圍安排 |

首 POC 不做整站美化、不刪 schema、不新建 CRM／顧客帳號、不改成本公式、不移植 Node 到 Worker、不啟動實際物流 worker。店主保留目前所有需要的功能入口及後續測試清單；未完成入口不能被標為已整合。

### E2. 第一條真正完整的 POC

以下金額／姓名僅是**預定合成 fixture**，不是實際客戶或已測結果：單一測試店、一般售價商品 100 元、庫存 3 件，模擬客人選面交，購買 2 件，運費 0。預期商品小計 200 元、庫存剩 1。商品測試 ID 由資料庫回傳，不假設等於 1。

| 驗收 | 操作與預期證據 |
| --- | --- |
| 指定店主 | 真 Clerk 測試登入後可讀寫測試商品；另一合法登入者／無登入／錯 store 直接打 API 仍拒絕；測試 mock auth 與真登入結果分開 |
| 停止建店 | `/sign-up`、`/setup` 與 auto-create 不再建店；POST `/stores` 不新增列；缺設定／owner-store 不匹配時保持失敗 |
| 私人與客人分開 | 私人平台內模擬不帶 Clerk 管理 token 的客人請求；仍能讀指定商品。這不是把 Site 公開給外界 |
| 真保存 | 單品及多品項購物車各走既有路徑；DB 有合成訂單，重新載入／重啟測試 API 後仍可查到；不能只存 memory/localStorage |
| 查自己的訂單 | 保留隨機 publicToken 的既有查詢方式；有正確 token 看遮罩摘要，無效 token 無資料；不聲稱這是登入身分級的客戶所有權驗證 |
| 店主收單 | 後台同 store 能看到新訂單與 200 元樣本；其他 store／使用者無法讀它 |
| 業務不退化 | 數量超庫存拒絕且不留半單；混入非指定店鋪商品整筆回滾；保留訂單／JSONB 成本快照與精度，缺成本仍按原規則標缺失，不填假利潤 |
| 隱私與入口 | 公開回傳不含完整電話／地址／internalNote／成本；含有效 token 的連結也不進公開 log；原 CVS 選店／快照的 fixture 回歸保留 |
| 真私人可見性 | 核對 site audience；授權帳號可進，另一未授權帳號拒絕；管理員可見性依實際設定記錄，不能聲稱絕對只有本人 |
| 側作用／收尾 | 無真 OCR／物流單／付款／簡訊／郵件；無 production 連線；測試程序收尾，資料保留於隔離庫；報告固定版本與可回復位置 |

首切片通過只能稱「私人下單切片通過」。所有 OCR、長請求、實際物流回跳／排程、真資料遷移與正式公開營運仍分開驗收。

### E3. 已存在測試如何沿用

- 純函式／schema／domain：`lib/db` 成本及快照、`lib/privacy`、shop `src/lib`、API `src/lib` 的 Node tests；部分需 workspace dependencies/tsx，不能拿未執行或 skip 當 PASS。
- DB route suites：`public.route.test.mjs`、`coreMutationAuthorization.route.test.mjs`、`authzGapSecondTier.route.test.mjs`、`tripsStoreIsolation.route.test.mjs`、`customersAndProfitIsolation.route.test.mjs`、`orderProfitSnapshot.route.test.mjs`、store-credit／invoice suites。會寫資料，只用隔離 PG；沿用 CI 的 module-mocks/tsx 方式。
- 部署前 build/typecheck＋前端 DOM/Playwright，檢查 API／Clerk／SPA deep links；mock Clerk 不證明真網站登入，HTTP fixture 不證明物流平台回呼。
- 若進入高風險產品修改，採另一個正常 Astra 普通會話獨立唯讀驗證，作者先停寫。不使用停用的子代理，也不在缺工具時自稱已獨驗。

## F. 真正阻礙、一次確認與可延後事項

| 類型 | 狀態／影響 | 最少下一步 |
| --- | --- | --- |
| 已解除的工具缺口 | Desktop 工具恢復，本輪 list_projects/read_thread 真呼叫成功；Sites owner 清單也成功 | 沿用現有專案與主控，不重建、不重做修復；函式可用不等於未呼叫的建立／部署權限已驗證 |
| 直接相容性障礙 | 原 Express listen/pg TCP 不能照搬 Sites Worker | 已有最少修改方向：保留獨立 API＋PG，不是停工理由，也不用立刻改 D1 |
| 遠端 POC 前的實際依賴 | Docker 測試 PG 可用；隔離 API 啟動設定已做，HTTPS 通道尚無 | 真 Clerk 設定完成後啟動 API、配置受保護測試通道；不購買主機或使用正式服務。依本機主機的路徑會在關機後停止 |
| 真登入前的實際依賴 | 使用者確認沒有 Clerk 測試 application，希望本機完成後協助建立 | Dashboard 已排入本任務；需使用者完成 Clerk 登入，才能建立獨立 Development app、指定 owner 與取測試金鑰。不把聊天中的姓名／Site owner 自動當 Clerk userId |
| Private 部署前的依賴 | 真 Site 已註冊，access mode 為 custom、只列一位 owner，其他名單皆空；版本 0、未部署 | 沿用 `.openai/hosting.json` 的真 ID；待通道／真登入／獨立審查完成才保存與私人發布；部署後另驗第三人拒絕。未宣稱排除 workspace 管理員 |
| Site 來源同步邊界 | 官方發布需推送 Site 來源 commit；本案原 GitHub／production 推送仍不在授權內 | 先做本機切片，再準備可審閱的 Site 專用來源與固定目的地；不得讓發布腳本改動原 remote 或自動部署原系統 |
| 正式交易另階段驗收 | 已核對第三方支付電商例外；尚無實際支付整合或卡片資料流 | 本輪不新增支付；未來依 2.6／3.3 的資料處理及站主責任條件另驗收，不將電商一概列為禁止 |
| 可延後 | 真 OCR、物流 callback/cron、R2 私有素材、長請求限制、歷史 store/NULL 歸屬、正式切換／rollback | 不阻擋本輪方案或純本機切片；各自於對應階段驗證，不混成已完成 |

使用者本輪已明確確認：**保留 Express＋PostgreSQL，實作隔離、合成資料的私人 POC；真資料、正式網域、公開發布及新增費用另行確認。** 無需逐小步重新核准。

## 方案階段交付與回復（歷史）

本次沿用並更新 `PHASE1-PLAN.md`，只同步 `PROJECT-HANDOFF.md` 的目前狀態；不另建報告制度。初次調查的根 AGENTS 說明、`PHASE1-EVIDENCE.json`、`LOCAL-CHECKS.txt`、BINDING 與工具修復收據都保留。本次沒有修改任何產品 TS/TSX、schema、migration、套件、全域設定或共享 harness。

本次讀取原 OCR 工作樹結果為乾淨，分支／HEAD 仍為 `codex/invoice-ocr-integration`／`33953b1fa8586110863c76304f5b6d3dc9f1ba92`；main ref 為 `87b6eaaf2c08c85164e80b72a80f7246e2ebbbd9`。本輪未呼叫 Replit、未部署或連正式庫；不能把未操作誇成已監測到整個 production 健康。

`LOCAL-CHECKS.txt` 是初次調查真實 7 項本機測試輸出，這次未重跑；`PHASE1-EVIDENCE.json` 保留當時的 Git／工具／模型／hash，與本次更新後報告 hash 不同是預期。這次只做文件與必要唯讀查證，未跑 build/typecheck／DB 測試，不能算產品或 Sites E2E 通過。

本次改前備份及當時 Git 差異位於 `C:/Users/Lnovo/Documents/Codex-backups/SITES-PLAN-REFRESH-20260925-1436/`。PHASE1 改前 SHA-256：`f7e53bbd3d72bbcd2283b751d63ec0a5e3138c72a9b09006729b1bf7b4a16dd5`；HANDOFF 改前 SHA-256：`6029ce42a2f7155dbd943daf1470541b2d22ffaafa0525ad76e4eb728a119dd5`。文件編輯使用 apply_patch，完成後重新讀回與比對；回復仍需核對後續修改，不能直接覆蓋。

回復前比對本輪安裝 hash，再以外部 `AGENTS.md.before` 與原始 diff 移除本輪新增段落；有後續修改時不得直接覆蓋。不執行 reset/clean/remove-worktree，不宣稱已驗證正式環境 rollback。

**方案確認點已通過，進入上述核准範圍的施工與測試。**

## G. 批准後的實作與驗收（2026-09-26）

**最小私人 POC 已可試用。本機切片、獨立 Astra 審查與真正跨服務 HTTP 流程已通過；Sites 第 1 版已 PRIVATE 部署。使用者已親自登入 Clerk 測試應用，指定管理帳號與合成店鋪已精確綁定。真 Clerk 簽章經 Sites → Express → 獨立 PostgreSQL，完成商品維護、客人購物車下單、token 查單與後台收單。使用者已確認前台及管理商品／訂單頁均可見假商品與 200 元假單。瀏覽器控制連線逾時，完整自動化瀏覽器下單驗收未完成；不可將 HTTP 與人工畫面確認說成自動化瀏覽器 E2E。** 全程 B＋Astra，沒有 SWE-2／Devin、子代理、其他開發模型、OCR 模型變更或全域設定修改。本次本機執行日誌可觀測主會話 `gpt-6-astra`／`max`、獨立審查 `gpt-6-astra`／`high`；未自行改模型。這是客戶端路由紀錄，並非獨立後端內部證明；0 節保留方案當時的觀測限制。

### G1. 最小改動與保留內容

| 實際檔案 | 已落檔的行為 |
| --- | --- |
| `artifacts/api-server/src/lib/privatePoc.ts`、`src/app.ts` | opt-in `PIKA_PRIVATE_POC=true`；先驗服務端 gateway secret，再只開放第一條商品／下單／查單／後台 API。其他功能明確回 403，保留程式及 schema。POC request log 不記 URL，避免 publicToken 進 log；不啟用 OCR、上傳、物流、排程或付款末五碼等外部／後續切片 |
| `src/middlewares/auth.ts`、`src/routes/stores.ts` | 管理 API 精確驗 Clerk `auth.userId` 與可信 owner 設定，並再次讀庫驗 store→merchantId；拒絕其他登入者、錯店、缺設定、owner 對應改變。`/me/store` 不選第一家；POST 建店停用 |
| `src/routes/public.ts` | 合成商品目錄；分享商品、單品下單、購物車與 token 查單只限指定店鋪。混店在原 DB transaction 中拒絕，前項已扣庫存也會回滾。保留價格、成本快照、限流、遮罩與庫存公式；非 POC 路徑沿用原行為 |
| `artifacts/shop-app/src/App.tsx`、`src/pages/PocShop.tsx` | 沿用原商品管理／下單／購物車／查單頁；新增簡單合成商品首頁及假資料提示。POC 停 sign-up/setup/404 自動建店，未登入管理頁導向 Clerk 登入；無權限顯示錯誤，不自動成為 owner |
| `sites/worker.mjs`、`sites/prepare-site.mjs` | 固定 HTTPS upstream、只傳必要 Authorization/Content-Type，伺服器端加入 gateway secret；拒絕 upstream redirect、不轉送 client gateway/cookie/forwarded host。靜態檔＋SPA fallback；獨立封裝前端及 Worker 至 `.poc/site-source`，不改原 GitHub remote |
| `sites/poc/compose.yaml`、`artifacts/api-server/src/poc/{database-guard,initialize,seed,start}.mjs` | 獨立 Docker PG／Node；DB guard 僅接受專用 Docker host/user/db；空庫 Drizzle schema＋原 migration 的六個保護 trigger。seed 需明確 Clerk 測試 owner，已有 store owner 不合拒絕重指定；啟動只收 pk_test/sk_test，拒收 OCR/R2/cron 等正式副作用憑證 |

`stores`、`storeId`、`merchantId`、外鍵、歷史 migrations、Clerk、成本規則、OCR 模型與物流／行程／報表模組全保留。這些後續功能第一版未接通，不是刪除或已完成外部整合。商品圖片先用既有空圖佔位，沒有正式 bucket 或 R2 憑證。

此處「店主」只代表**使用者本人唯一的後台管理帳號**，不是另一套賣家註冊制度。使用者不用建立新店或完成 onboarding；固定合成店由隔離 seed 建立。其他登入者不自動建店、不取得管理權限，客人可不登入 Clerk 瀏覽、下單及持 token 查單。PRIVATE 期間模擬客人仍須先通過 Sites 的私人存取門禁。

### G2. API、資料庫與 PRIVATE 的實際位置

- **PG 已實跑**：本機 Docker Desktop 的 `pika-sites-private-poc-db-1`，PostgreSQL **16.15**，DB `pika_sites_poc`／user `pika_poc`。volume `pika-sites-private-poc_postgres` 只由空庫初始化，沒有 host port。測試連線由 compose 明確指定，不繼承 host `DATABASE_URL`，不讀 production `.env` 或 dump。SQL 初始化確認六個帳本／OCR 保護 triggers 存在。
- **API 已常駐啟動**：同一 Docker network 的 Node **24.18.0**，容器 `pika-sites-private-poc-api-1`，僅綁本機 `127.0.0.1:8087`。啟動器保留測試庫、測試 Clerk key、固定管理帳號／店鋪及副作用憑證檢查，以原生 Node 執行現有 API build；不再用 tsx 在啟動時重載整套路由。後續若改 API 原始碼，須先重建 `@workspace/api-server` 再重啟。Node 單元／整合測試仍是 mock Clerk；本次常駐服務及跨站 HTTP 驗收使用真 Clerk，沒有測試 header 放行。
- **Clerk Development 與唯一管理帳號已綁定**：應用 `pika-system-private-poc`，app ID `app_3JpNmDlXneh874yBRpHj8mHPXya`，instance ID `ins_3JpNmBzRfWBKoGKa7DpPtlxZBCX`。使用者在 Account Portal 親自登入後，依畫面身分精確比對已驗證 email 的 userId，設定 `PIKA_OWNER_CLERK_USER_ID`；未依使用者排序或第一位登入者推定。固定合成店 ID **8**，seed 已完成。測試 key 與綁定只存被忽略的 `.poc/api.env`，沒有正式 Clerk 憑證；前端只含 publishable key，secret key／gateway key 不進 bundle。Clerk SK 只在本機 API，Sites 只存 API origin 與秘密 gateway key。
- **Site 第 1 版 PRIVATE 部署成功**：`appgprj_6ab69a6062348191809b743a5635f83e`，沿用 `.openai/hosting.json`；網址 [私人合成資料 POC](https://pika-system-private-poc-20260925.bill831206.chatgpt.site)。專用 Sites 來源 commit `62b8e1331ddd969e53c61041bac61d09936756f8` 已推送，產物以相同 commit 封裝，原生 `save_version_and_deploy_private` 成功；deployment `appgdep_6ab6baf6d37081919c076cf771aef4bb`，environment revision **1**。這是 Sites 專用來源庫，不是原 GitHub repo 或其 main。
- **實際讀回 audience**（2026-09-25T15:59:35.908798+00:00，policy revision 1）：access mode `custom`，目前帳戶角色 owner，allowed account users／allowed users 各 **1 位 owner**；allowed groups、workspace groups、tenant groups、editors 皆空，external visitor count **0**。external invite 功能可用不代表有人獲邀，本輪沒有邀請。平台文件中的 workspace admin 治理權限仍可能適用；**未做另一帳號的 HTTP 拒絕測試，不宣稱管理員絕對不可見**。Site PRIVATE 與 Express 店主授權各自保留。

Sites 已透過 Cloudflare 免費 Quick Tunnel 呼叫本機 API，origin `https://largest-mud-end-what.trycloudflare.com`，容器 `pika-sites-private-poc-tunnel`；官方 image digest `sha256:072c067d25ccbe61d46e18f0d0723255f2bb5304f7317caa95b27031520ff92c`。通道位址在網路可達，但 API 每條路徑先驗秘密 gateway key；管理路徑再驗 Clerk 與店鋪歸屬。資料庫沒有對外埠。電腦／Docker 必須持續執行，Quick Tunnel 沒有永久主機／可用性保證；若重建通道得到新網址，要更新 Sites origin 並部署套用。沒有新購服務、付費方案或正式網域更動。

前一輪曾停止 DB 保存資料卷；本輪已啟動同一 PG volume，並建立供操作的合成店與假單，沒有重建庫。POC 的 API／DB／tunnel 目前保留執行供驗收；其他專案 Docker 服務未操作。不要 `down -v` 或重複初始化。

### G3. 測試狀態與樣本

| 驗證 | 狀態／實際範圍 |
| --- | --- |
| Linux 隔離安裝 | **通過**；frozen lockfile，671 packages；沒有改套件或原 lockfile |
| `pnpm run typecheck`（root） | **通過，exit 0**；DB／生成型別及 mockup、API、shop-app 全部完成。首次 nested pnpm 不在 PATH 是工具環境失敗，補 compose Corepack shim 後重跑通過 |
| 前端／API build | **通過，exit 0**；API esbuild 與 Vite production build 完成。其後以新 Clerk Development 的真正 publishable key 重建前端，**exit 0，6m43s**；掃描產物確認含正確 test key、不含舊佔位值／secret key。完整新輸出在 `.poc/checks/clerk-development-build.txt`。Vite 的既有 select/sheet sourcemap 定位及 >500 kB bundle 警告仍在，未擴大拆包重構 |
| 既有 `public.route.test.mjs`＋`coreMutationAuthorization.route.test.mjs` | **通過 27/27**，同一隔離真 PG，原測試內容未改 |
| 新 `src/poc/privatePoc.integration.test.mjs` | **重跑通過 9/9，exit 0，沒有 skip**。首次 8/9 的唯一失敗是新增測試誤寫缺貨應回 422，固定基準原契約即為 409；修正測試期待並增加 DB 訂單數恰增 1 的斷言後通過，產品錯誤碼及金額規則未改 |
| `node --test sites/worker.test.mjs` | **通過 4/4**；固定 upstream／可信 headers、設定缺失、redirect 拒絕、SPA fallback。這是本機 Worker 函式測試，不是 Sites runtime 連線 |
| Site 專用封裝／部署 | **通過**；真 test key 的乾淨封裝只含前端、Worker、build/package 與真 Site ID，沒有 API／DB／env／原 Git 歷史。專用來源 push、原生 PRIVATE 部署成功，收據 `.poc/source-receipt.json`、`.poc/deployment-receipt.json` |
| 真 Clerk／跨站 HTTP／真 PG | **通過**；使用者既有活躍測試會話經 Clerk 官方 Backend API 簽發短效 session JWT，未 mock 或代填密碼。平台原生提供的測試存取 token 只在記憶體授權 Sites 測試請求；它不取代 Express 的 Clerk 驗證。商品 POST 201／PATCH 200、訪客目錄與商品 200、購物車訂單 201、token 查單 200、管理收單 200；直接 SQL 核對訂單與庫存。這是 HTTP 驗收，不是前端登入 UI 驗收 |
| PRIVATE 與 API 負向驗證 | **通過所列範圍**；網站首頁與 `/api/poc/catalog` 的匿名 HTTP 請求皆 401，平台授權首頁 200；直連公開網路 tunnel 無 gateway 403，有 gateway 的 API health 200；管理 API 無 Clerk、無效 JWT、偽造測試 user header 均 401，建店 POST 403，錯 token 404。另一個真 Clerk 使用者及另一個已登入 ChatGPT 帳號尚未實測；前者已有隔離 mock 測試，後者只有原生 audience 讀回與匿名拒絕證據 |
| 瀏覽器畫面／完整 E2E | **人工畫面確認通過；完整自動化流程未完成**。使用者先確認前台合成商品列表，再確認 `/products` 與 `/orders` 兩頁可見假商品／200 元假單。CUA 導覽／讀頁／重新取得既有 browser 皆逾時，`open_in_codex` 回 queued；未以工具實走整條前端下單表單，不用 HTTP 驗收冒充，不修改全域工具設定 |
| 獨立高風險審查 | **通過，可進入真登入／PRIVATE 驗收**；真 threadId `01a0d95e-c03d-7382-8f79-53c701046328`，官方 read/wait 確認回合 `01a0d95f-02c4-7e92-ab60-21d90bd27811` completed。未發現阻擋最小 POC 的具體缺陷；審查者獨立重跑 Worker 4/4、核對原候選差異／測試斷言與手算，未重跑寫 DB 測試或真網站 E2E。收據在 `.poc/checks/independent-review.txt`，沒有啟用子代理 |

先前本機 Node mock 測試使用合成客人與指定測試店：售價 **100 × 2 = 200**，面交運費 **0**，訂單總額 **200.00**；庫存 **3 − 2 = 1**。HTTP 下單後直接 SQL/Drizzle 查 DB 斷言已保存；關閉並重新開啟 HTTP listener（**同一測試程序**）後以 publicToken 查到 200，管理 GET orders 也收到同筆。無效或錯店 token 回 404；公開回傳未含姓名電話原文／internalNote／profitSnapshot／recipientAddress。這份歷史測試只證明真 DB 寫讀與 listener 重連；本輪真 Clerk／Sites 樣本另見 G4，不混稱為同一項驗收。

POC 測試另驗：先插入同 owner 的 decoy store 仍只選設定店；其他登入者即使 claims 填 owner ID 仍拒絕；直連缺 gateway key、建店、上傳及 cron 路徑拒絕；混店購物車整筆回滾；DB owner 被更動時拒絕管理；六個保護 triggers 存在。token 查單是持有隨機 token 的查詢權，不是客戶登入身分驗證。

重現指令（此工作樹，僅指定測試 compose；首次 install/schema/trigger 已完成，不需重複初始化）：

```powershell
docker compose -f sites/poc/compose.yaml run --rm tools run typecheck
docker compose -f sites/poc/compose.yaml run --rm tools --filter @workspace/api-server exec node --experimental-test-module-mocks --import tsx/esm --test src/poc/privatePoc.integration.test.mjs src/routes/public.route.test.mjs src/routes/coreMutationAuthorization.route.test.mjs
node --test sites/worker.test.mjs
```

### G4. 本次實際樣本與最小接續

合成店 **8** → 指定管理帳號建立商品 **7**（100 元、庫存 3）並修改描述 → 不帶 Clerk JWT 的模擬客人購物車下單 2 件 → 訂單 **19** 保存。直接 PostgreSQL 查詢確認 `quantity=2`、`total_price=200.00`、`shipping_fee=0`、`status=pending`、剩餘庫存 **1**，符合手算 **100 × 2 + 0 = 200；3 − 2 = 1**。token 查詢與管理訂單列表收到同筆。客人姓名／電話全為合成值；公開查詢不含原文客資、內部備註或毛利快照。

證據：`.poc/checks/live-http-verification.json`、`live-postgres-proof.json`、`site-access.json`；測試商品／訂單收據亦在該被忽略的資料夾。沒有將 Clerk JWT、Site 測試存取 token 或秘密 key 寫入收據。

1. **本輪最小 POC 可試用，在此交付**：HTTP 全流程＋使用者前台／後台畫面確認均已取得。最小下一步是在同一私人網址用假資料試用，保留 OCR／物流／上傳等供後續小切片，不再註冊賣家、開店或重建任何服務。完整自動化瀏覽器下單仍未驗；另一個已登入 ChatGPT 帳號的拒絕測試也尚缺該帳號，不能用平台測試存取 token 冒充。
2. **獨立審查沿用通過結果**：普通 Astra 唯讀任務已完成，沒有重派或啟用子代理。其後僅改 POC 啟動器／compose 使用現有 API build 與原生 Node；授權及業務候選未改。啟動守衛仍執行，已真實測通；語法檢查通過，root typecheck 重跑 **exit 0**。
3. **缺少 bundled helper 已完成最小替代**：未重裝外掛或改全域設定。被忽略的一次性 `.poc/publish-source.mjs` 只接受本 Site 原生短效 credential、固定專用 remote／checkout，經 stdin 接收，不落地 token；核對乾淨 source commit、build、tar 與遠端 HEAD 後才原生保存／PRIVATE 部署。部署已成功，不再列為 blocker。

沒有真 OCR／物流單／付款／通知、沒有真客戶資料、production DB／憑證或舊 bucket、沒有改原 OCR 分支／main／Replit production／正式網域，沒有原 GitHub push。固定 HEAD 保持 `33953b1fa8586110863c76304f5b6d3dc9f1ba92`，產品改動保留於本遷移工作樹。改前原檔、status、tracked diff 保存在 `C:/Users/Lnovo/Documents/Codex-backups/SITES-POC-20260925-implementation/`；歷史證據檔保持原樣，不用 reset/clean 覆蓋後續成果。

## H. 既有成本快照與月報讀取（2026-09-26）

使用者已指示物流不阻擋其他已核准遷移。選擇 E1 第 7 步已有的成本／報表：沿用 `routes/orders.ts` 的 `GET /stores/:storeId/orders/profit-summary`、`GET /stores/:storeId/orders/monthly-profit`，及 `pages/MonthlyProfit.tsx`。既有 dashboard 與訂單頁已使用毛利摘要，月報頁已有月份選擇及待確認／尚無快照數量。

本輪產品程式只在 `artifacts/api-server/src/lib/privatePoc.ts` 放行上述兩個 **GET**；原 Clerk 指定店主、指定店鋪校驗保留。沒有修改成本公式、訂單狀態、快照、帳本或 schema，也不把 OCR 結果套入成本。

- 部署前線上核對：月報回 `403 POC_FEATURE_NOT_ENABLED`；假訂單 1 金額 200，`cartProfitSnapshotStatus=pending`。成本未填是待確認，不是假設零成本或 200 元利潤。
- 新增 `artifacts/api-server/src/poc/privatePocReports.integration.test.mjs`：專用本機 PG、真正 Express／報表路由，僅 Clerk 為測試替身；測 gateway／指定 owner／指定 store／非 GET 拒絕、台灣月份邊界、快照原值不被改寫、空月份／非法月份、重啟後同一結果。
- 合成手算：`8000 JPY × 0.21 + 0 = 1680 TWD`；`(1900 − 1680) × 2 = 440 TWD`。同月另一筆 pending、另一筆無快照分開計數，不納入已定格毛利。僅本機合成測試列，不修改雲端原假單。
- 本機隔離測試 **20/20 通過、無 skip**：新報表整合 5 項、既有月報函式 6 項、POC 核心下單／查單 9 項。獨立 Node 測試程序執行期間未修改產品程式；測試只接受本機 `db`，未連雲端／正式庫。記錄 `.poc/checks/reports-tests.txt`。
- root `pnpm run typecheck` 通過，exit 0；記錄 `.poc/checks/reports-typecheck.txt`。產品差異是一條唯讀 allowlist；原成本函式、報表 API 與前端未改。
- Railway deployment `1ab7d242-ff27-440e-946a-9f3124d0d1f3`，2026-09-26T12:48:55Z 建立、`SUCCESS`；沿用 project `de13e86c-9d70-4396-85be-79cd73cd412f`／environment `143266a9-b10c-4dec-9b8f-f4eec9bec86a`／API service `1068b8cf-3623-4b85-a702-d7bb7b70080e`。沒有新增變數或 migration；Sites 仍為第 5 版，沒有重複部署前端。
- 部署後真 API：2026-09 月報與總摘要均 200；訂單 1 筆、待確認 1、無快照 0、已定格毛利小計 0。這表示尚無已定格毛利，不表示那筆訂單成本為 0。未登入 401，無 gateway／錯店／POST 寫入均 403。原假單逐欄未改，token 查單仍為 200 元；去敏證據 `.poc/checks/reports-online-proof.json`。
- 真瀏覽器：既有 `/reports/monthly-profit` 顯示 9 月上述結果；以月份欄位原生鍵盤操作切 8 月得到 0 筆，再回 9 月得到 1 筆；整頁刷新後仍為同一結果。瀏覽器曾短暫失聯，重用同一 Chrome 登入的新分頁及原生月份控制恢復；沒有要求使用者人工驗收。
- 原始 Git HEAD／分支未改；候選 hash 與部署前備份路徑見 `.poc/checks/reports-source.json`。回復可將 API 切回 `6b31b5cf-5503-4471-831f-36473f2b9bfd`，或僅撤回此新增 GET allowlist；不刪資料。沒有新費用設定、真 OCR／物流呼叫、正式資源變更。本機測試 PG 已停止，volume 保留。
- 人工驗收延後；全家有效外部貨態及客人物流頁瀏覽器驗收仍依總進度分開等待，不再重試物流查詢。接續原計畫的客戶與行程基本功能，不新增業務規格。

## I. 既有客戶與行程基本功能（2026-09-26，已完成所列切片）

既有客戶新增／修改／清單／明細及帳本唯讀，既有行程新增／修改／手填路線費用，均已在私人站點接通。合成客戶 **1**（`POC-MANAGE`）、行程 **1**、路線 **1** 已經正常真 Clerk API 保存至 Railway 隔離 PostgreSQL；API 更版後讀回逐欄一致，真瀏覽器客戶明細及行程頁刷新也讀回同一筆。使用者目前不需要操作。

主要修改限定 `artifacts/api-server/src/`：

- `lib/privatePoc.ts`：放行上述既有 API，以及客戶 S-19 開關的 preview／enable；沒有開放其他技能設定。
- `routes/trips.ts`：PRIVATE POC 使用明確指定店鋪，不取同帳號第一間店、不認領 NULL 歸屬資料；修改路線也核對父行程。非 POC 原行為保留，沒有改成本公式／schema。
- `routes/customers.ts`：新增／修改遇到 PostgreSQL 重複碼時，也辨識 Drizzle 的 `cause.code=23505`，依原契約回 409；原資料不被覆寫。
- `poc/privatePocManagement.integration.test.mjs`：真隔離 PG／Express，僅 Clerk 為本機替身；驗指定 owner/store、先插入的同 owner 另一店、NULL／父子歸屬不一致拒絕、重複客戶、缺匯率 null、基本讀寫、開關及 listener 重啟讀回。

| 驗證 | 最終結果／證據 |
|---|---|
| 管理＋月報＋舊行程回歸 | **18/18 通過、exit 0、無 skip**；`.poc/checks/management-tests.txt`。首輪客戶重複碼處理及測試 image 預設模式問題已修正；失敗證據另存，沒有改低斷言或關掉線上 POC |
| 客戶開關補驗 | 新版管理整合 **8 個測試全通過**；`.poc/checks/management-skill-tests.txt`。同一命令附帶的前端測試因 API image 缺前端依賴而失敗，所以該合併命令 exit 1，不能報整條命令成功；前端已換正確環境如下，API 8 項沒有失敗 |
| 前端既有可見性 | 完整 tools／shop-app 的 Node 24 原生測試 **7/7、exit 0**；`.poc/checks/management-visibility-tests.txt`。shop-app 沒有 tsx，未加套件；原 loader 失敗亦保留 |
| 最後 root typecheck | **通過、exit 0**；`.poc/checks/management-skill-typecheck.txt`。`git diff --check` 通過；測試期間凍結產品檔案，工作檔／封裝 hash 一致 |
| 線上真 API／PG | 新增 201、修改／讀回 200。行程匯率先為 null，明確輸入 0.21；路線 10 件、電車 100 JPY、ETC 修改為 200 JPY。只驗手填值保存，未套用商品交通成本 |
| 更版持久性 | 客戶／行程資料先在 `c7ab70f5-0e18-4a42-9c94-2b9446d35f24` 保存；替換成最終部署後逐欄一致。本機 PG 已停止、volume 保留；不依賴本機 API |
| 真瀏覽器 | `/customers` 看見唯一合成客戶；點詳情至 `/customers/1`，刷新後仍有代碼、一般等級、遮罩與空帳本。`/trips` 顯示同一行程與上述費用，刷新後不變。這是自動畫面驗證；未將 API 新增說成 UI 表單新增驗收 |
| 權限與核心回歸 | 匿名客戶／行程新增 401；缺 gateway、錯店 403；Site 匿名首頁 401。原假單逐欄未改，200 元 token 查單、商品及月報仍成功；沒有重新呼叫 OCR／物流 |

最終 Railway deployment **`4ddb2e1b-d30b-4b63-8dc6-c6c0da7e8319`**，2026-09-26T13:36:33Z 建立、`SUCCESS`。沿用 H 節同一 project／environment／API service；兩次部署前 staged patch 均空，未改環境變數／migration，Sites 仍為第 5 版。S-19 由既有 API 驗前置條件及影響確認後啟用；再次讀回其他技能逐欄未變。去敏證據集中在 `.poc/checks/management-online-proof.json`，候選 hash／備份在 `management-source.json`。

分支仍 `codex/chatgpt-sites-private-poc`，root HEAD／歷史基準仍 `33953b1fa8586110863c76304f5b6d3dc9f1ba92`；新增成果保留於工作樹與部署來源，沒有新增 root commit、stage、GitHub push 或 reset，也未覆蓋先前成果。B＋Astra 單一寫入者，沒有額外審查任務、子代理或開發模型切換。

簡單回復：若要撤回整個客戶／行程切片，先用現有 S-19 enable API 設 `enabled=false`，再把 API 回到報表版 `1ab7d242-ff27-440e-946a-9f3124d0d1f3`；保留合成資料即可，不需刪庫。程式回復只比對本輪備份／hash 後撤回本次檔案差異，不整個 reset。原正式 R2、Replit production、原 OCR 分支、main、正式網域未由本輪修改；沒有新增付費設定，現有服務實際用量費用未另查，不宣稱零成本。

本輪完成到上述基本切片，**不是宣稱所有進階成本／客戶功能都已遷移**：儲值帳本寫入、客資匯出、S-09 商品交通成本套用、自動票價／匯率及物流排程仍未啟用；相關原碼與資料結構保留。新成本公式仍受原店主裁決限制，不自行補規格。人工表單／操作偏好驗收延後。全家有效外部貨態及客人物流頁依總進度等待合法測試單號／本人包裹授權，沒有再查詢或要求使用者現在操作。

## J. 帳本、假客戶 CSV、商品交通成本（本輪接續）

2026-09-26 使用者明確批准在同一私人環境接續原有三項功能。本段更新 I 節的當時停止位置，不重做前面已完成的驗收。

| 項目 | 判斷及最小範圍 |
|---|---|
| 帳本寫入 | 原 `routes/customers.ts` 已有追加帳本、確認標頭、防重鍵及稽核；接通合成客戶的 grant／adjust，不開付款、折抵訂單或通知入口 |
| 客資匯出 | 原 `customerExport.ts`／Customers 頁已有預設遮罩及明文二次確認；只驗隔離庫的假客戶，不開訂單寄件匯出或正式資料匯出 |
| 商品交通成本 | 原 ProductForm／products route 已保存 tripRouteId，成本 loader 已分開採購匯率與行程匯率；`23-operations-manual.md` 記載正常商品成本流程。沿用既有公式，不把早期 spec 尚未施工敘述當成目前程式不存在 |
| 必要測試設定 | 僅允許隔離店鋪的既有 purchaseExchangeRate 欄位設定，用明確合成匯率補齊測試前提；其餘店鋪設定仍由 POC 拒絕。S-09 只在合成商品已連結合法路線後，走既有確認 API 啟用，不整組開成本套餐 |
| 刻意保持停用 | 多賣家建店／onboarding、自動票價與油價抓取、自動匯率、真付款、通知、物流排程及尚未裁決的新成本公式 |

本機里程碑：26 項局部測試全部通過（新增進階整合 7、原管理功能 8、原帳本 API 8、CSV 純函式 3），另 Sites 轉送 6 項通過，合計 **32 項**；root typecheck 與本輪差異的 `git diff --check` 都 exit 0。涵蓋帳本精度與重送、CSV 確認與隔離、交通成本手算、跨店路線拒絕、下單快照及重啟讀回。早期執行曾因合成路線名稱重複及錯誤的套件匯出路徑失敗，均已修正，保留失敗收據，沒有放寬業務斷言。獨立 Node 測試程序執行固定候選來源；沒有追加審查任務或子代理，也不把主會話檢查稱為第二位審查者。

線上里程碑：Sites 第 6 版及 Railway `81e941f9-91e5-49b5-a735-e600e93839a6` 均部署成功。經真正的 Sites 同源轉送＋Clerk：假客戶 1 帳本建立 100 與 -80 兩筆（ledger 1／2），餘額 20，重送同一調整仍只有兩筆；遮罩 CSV 與有確認標頭的明文 CSV 均可取得。新假商品 3 連結既有路線 1：交通 `(100+200)/10×0.21=6.3`，採購 `1000×0.2=200`，售價 300 的毛利 93.7，API 的既有顯示欄位為 94（四捨五入，非瀏覽器實測）。原商品 1／2 及原 200 元訂單逐筆 hash 未變，token 查單仍為 200 元。單次受控 API restart 成功後，2026-09-26T15:03:42Z 再經 Sites 讀回相同帳本、CSV 與商品關聯；不是只在本機記憶體保存。

### J1. 實際修改、版本及驗證依據

- `artifacts/api-server/src/lib/privatePoc.ts`：只接通客戶帳本 POST、客戶 CSV GET、進貨匯率 PATCH、S-09 的既有確認入口；其他功能仍受 POC 限制。
- `routes/customers.ts`：既有扣額紀錄的 idempotency 判斷移到新扣額餘額檢查之前。範例 `100.100000000001 - 80.000000000001 = 20.1`，重送不再被剩餘餘額誤判為新扣額；不同內容同鍵回 409、超額新扣款回 422、追加式帳本 trigger 未改。
- `routes/products.ts`、`lib/orderProfitSnapshot.ts`：POC 中必須同時符合路線及父行程的店鋪歸屬，NULL／跨店／不一致關聯拒絕套用，既有不一致資料讀取保留待確認；非 POC 歷史模式不改。
- `routes/stores.ts`：本切片只接受既有 `purchaseExchangeRate` 欄位，不開完整店鋪設定。合成採購匯率為 0.2、既有合成行程匯率 0.21，兩者用途分開，未接自動匯率服務。
- `sites/worker.mjs`：轉送原產品所需的兩個確認標頭；沒有新增身分後門，Clerk 及指定店主仍由 Express 驗證。既有 React 表單／CSV 下載程式沿用，前端資產未重寫。
- 分支 `codex/chatgpt-sites-private-poc`；root HEAD／歷史基準仍 `33953b1fa8586110863c76304f5b6d3dc9f1ba92`。本輪成果保留於工作樹 diff；沒有 root stage／commit／GitHub push／reset。
- Sites 專用產物來源 commit `470f67445261318825126a698b85f2921d782bf2`，版本 6，deployment `appgdep_6ab7dbf50d2c819181d348ba810c1888`，env revision 2，`succeeded`。這是 Site 自己的來源庫，非原 GitHub 的 main。
- Railway 沿用隔離 project `pika-system-private-poc`（`de13e86c-9d70-4396-85be-79cd73cd412f`），environment `production`（`143266a9-b10c-4dec-9b8f-f4eec9bec86a`，僅指這個測試專案），API `pika-poc-api`（`1068b8cf-3623-4b85-a702-d7bb7b70080e`）。新 deployment `81e941f9-91e5-49b5-a735-e600e93839a6` 的 build／服務及 restart 後狀態均為 `SUCCESS`。
- 沒有修改服務環境變數或 schema／migration；部署前 staged patch 為空。仍使用線上獨立 PostgreSQL `pika_sites_poc`，不是 Replit 正式庫。

驗證命令與收據：API 工作目錄執行 `node --experimental-test-module-mocks --import tsx/esm --test --test-concurrency=1`，指定 `src/poc/privatePocAdvanced.integration.test.mjs`、`src/poc/privatePocManagement.integration.test.mjs`、`src/routes/customerStoreCredit.route.test.mjs`、`src/lib/customerExport.test.mjs`（26/26）；根目錄 `node --test sites/worker.test.mjs`（6/6）；`docker compose -f sites/poc/compose.yaml run --rm --no-deps tools run typecheck`（exit 0）。沒有再跑整套 R2／OCR／物流驗收，也沒有真 OCR 或物流查詢。

去敏證據存於 `.poc/checks/advanced-tests-native.txt`、`advanced-worker.txt`、`advanced-typecheck.txt`、`advanced-online-proof.json`、`advanced-source.json`、`advanced-restart.txt`。線上腳本 `advanced-online.mjs seed` 與 `verify` 均 exit 0；透過原生 Sites 授權測試通道及真正 Clerk token 呼叫同源 API，秘密只由隱藏 stdin／本機既有 POC 設定取得，不寫進收據。兩次來源 hash 比對一致。

PRIVATE 再核對：Site access policy 只有 owner、editor／group／外部訪客皆 0；匿名 Site HTTP 401。部署中無 Clerk 的帳本寫入及 CSV 請求均 401，缺帳本確認標頭 428，未確認明文 CSV 400，其他店鋪設定 403。非指定店主與跨店路線由隔離 API 測試覆蓋。瀏覽器工具連續逾時，**未宣稱頁面顯示、按鈕操作或完整瀏覽器 E2E 通過**；這部分列延後驗收，不要求使用者代測。

### J2. 收尾分類與回復

| 分類 | 本輪收尾 |
|---|---|
| 已完成 | 原計畫這三項既有功能的最小接線、合成線上保存／讀回、API 重啟持久性、指定店主與原假單回歸；保留假帳本及商品 3 供後續使用 |
| 外部受阻 | 全家有效外部貨態仍等待合法官方測試單號或本人包裹唯讀授權；尚未驗證，不反覆查詢、不影響本輪成果 |
| 刻意停用 | 多賣家註冊／建店／onboarding、真付款／通知／出貨、物流排程、自動票價／油價／匯率、未定案成本公式、完整店鋪設定及本階段未授權入口 |
| 延後驗收 | 本輪瀏覽器畫面自動驗證、客人物流頁、人工操作偏好及正式資料實用性；目前不需要使用者操作 |

回復：將 API 回到 `4ddb2e1b-d30b-4b63-8dc6-c6c0da7e8319`、Site 回到第 5 版即可撤回新增入口與轉送。若要還原顯示設定，在 API 回復前用既有確認 API 停用本次 S-09，將合成採購匯率還原為 null；合成帳本與商品可保留，不刪 ledger、bucket 或資料庫。程式只依 `advanced-source.json` 及備份 `C:/Users/Lnovo/Documents/Codex-backups/SITES-ADVANCED-2026-09-26T14-00-36-354Z` 比對後撤回本輪差異，不覆蓋後續修改。

收尾時已移除本輪已結束的本機測試容器並停止專用 compose PostgreSQL，保留其測試 volume；線上私人版本繼續運作，不依賴這些本機服務。

維持 B＋Astra 單一寫入者，未追加代理或模型路由。本輪未新增付費服務／升級／付款設定；既有服務實際用量費用未另取得，不宣稱為零。原正式 R2、Replit production、原 OCR 分支、main、正式資料及正式網域未由本輪修改。原計畫本階段可完成部分已收尾，不自行開始下一輪工程。
