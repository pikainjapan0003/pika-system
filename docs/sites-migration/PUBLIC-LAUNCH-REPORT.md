# Seller Agent 移除與公開商店

更新：2026-09-27。沿用 `codex/chatgpt-sites-private-poc`；未 reset、未改 main／原 OCR／Replit。

## 目前結果

- **Seller Agent 已從新產品、GitHub 遷移分支、Sites 第 9 版、Railway API 與隔離庫移除。** 真正物流能力、一般 audit 與店主業務功能保留。
- **客人品牌入口已公開。** Sites access 為 `public`，公開發布成功；首頁與商品入口顯示「商品準備中／尚未開放下單」，不列出合成商品、假客戶或假訂單。
- **後台仍只允許指定 Clerk 店主。** 合成商品／訂單 token、私人圖片與測試門市資料也只允許該店主讀寫。註冊、Setup、自動建店、第二店主及 Seller Agent 入口已移除。
- **pika-jpselects.com 尚未接通。** 已加入原 Site，DNS／TLS 驗證仍 pending；目前 A 仍是舊位址 `152.42.254.130`，驗證 TXT 尚不存在。沒有改 DNS、MX 或郵件。
- **唯一外部待辦是 DNS 操作連線／登入。** 重開後 CUA 顯示沒有可操作瀏覽器；Chrome 與內建瀏覽器皆回報 unavailable。已提出最少的接回瀏覽器並登入 Namecheap 請求，沒有要求人工功能驗收。
- 沒有搬真資料、查真包裹、重跑 OCR、真付款／寄件／通知；沒有新增方案、綁卡或充值。既有平台本輪計量費用未另查，不能聲稱為零。

目前公開網址：[PIKA JP Selects](https://pika-system-private-poc-20260925.bill831206.chatgpt.site/)。

## 版本與來源

| 層次 | 已核對結果 |
|---|---|
| 原可用 checkpoint | `923fd0899a9c1e99264fd7f678c7c65fce31a672`；Sites 第 8 版；Railway `39fc9e9f-cfa3-44ed-b0e1-ecd72fb2f27e` |
| 本輪程式 checkpoint | `3a713e8463b9fb68c6d354dd8f28a050fcd34bf9`，`checkpoint-public-launch-paused`；重開前保存，沒有回到最初基準 |
| 已推送及讀回的 GitHub 執行來源 | `9737f77ec5193c432a6e56cfcbe71b29f9db7a65`；執行程式與 3a713e8 相同，另記最終 build／typecheck；本報告收尾提交只更新文件 |
| Sites source | `207c55d7ef66122df61a96d2995f0b767302c54e`，專用產物 repo；由相同已驗證程式建置，JS `index-CmLCoC3E.js` |
| Sites 版本 | 第 9 版，`appgprj_6ab69a6062348191809b743a5635f83e~appgver_a2b85df53b188191864d0aad81410c33` |
| 私人檢查部署 | `appgdep_6ab8f4812eb081918c726050a3fcc34c`，succeeded |
| 公開部署 | `appgdep_6ab8f5e085f4819190e38c7826700de0`，succeeded；access public、revision 2、env revision 2 |
| 最終 Railway API | `632d96db-029b-4f7c-80b3-493d4fa8ec6d`，SUCCESS；preDeployCommand 已清空，無其他 staged changes |
| main／原 OCR | 仍分別為 `6190ef22584d19fb8f2427e76d09d23c7aa88d3c`／`33953b1fa8586110863c76304f5b6d3dc9f1ba92` |

API 使用原隔離 project `de13e86c-9d70-4396-85be-79cd73cd412f`、environment `143266a9-b10c-4dec-9b8f-f4eec9bec86a`（名稱 production，實際用途仍是 POC）、service `1068b8cf-3623-4b85-a702-d7bb7b70080e`。來源由 `sites/poc/prepare-api.mjs` 產生 `.poc/api-source-Oqfl15` 後上傳，排除 env、keys、node_modules、Git 歷史與本機資料；不是 GitHub 自動部署。

Site 開啟步驟已由 bundled workflow 核對原 source。後續發布時該插件 helper 路徑消失，限定插件目錄搜尋亦無結果；沿用本案既有 `.poc/publish-source.mjs` 核對固定 Site remote、推送 SHA、建置及 archive，再由原生工具 save／deploy。沒有建立新 Site 或改動 GitHub main。

## 依賴拆除與保留

| 原依賴 | 處理 |
|---|---|
| AgentSettings、Settings 導航 | 刪頁面、導航及直接路由；舊 `/settings/agent` 回 404 |
| sellerAgent／agent routes、agentAuth | 完整移除設定與外部控制入口、專用 token auth；沒有改成永遠 enabled |
| Seller Agent OpenAPI／client／zod | 刪專屬定義，Orval 正常重生成；未手改生成物 |
| sellerAgentSettings、sellerAgentTokens、agentRunLogs | 刪現行 schema／exports，新增正常向前 migration 0044 |
| 專屬 tests／文件 | 刪 4 份 Agent 專屬測試與 6 份 Agent 設計／API／測試計畫；更新 README、操作手冊、權限表與總進度 |
| 真正物流 | FamilyMart worker、7-11 preview、黑貓／郵局 adapters、查詢／更新 workers、匯入、異常、tracking tables／events、客人查貨均保留；adapter 只移除過期 Agent 註解 |
| 其他業務 | 商品、分類、訂單、客戶、價格／購物金、成本、報表、行程、OCR 與 audit 保留；原刻意停用副作用未開啟 |

歷史建表 migration、歷史驗收／結果報告及舊分支保留；相關現行文件標明 Agent 已移除。未操作 Codex Skill、AGENTS 工具能力或使用者停用設定。全程直接 B 作業，未呼叫 SWE-2／Devin 或另派模型／子代理；Astra 為本案要求，工具未回傳可獨立核對的本輪 model ID。

## 公開與授權設計

`VITE_PUBLIC_SHOP=true` 控制公開品牌入口；`VITE_PRIVATE_POC=true`、`PIKA_PRIVATE_POC=true` 保留單店主、隔離資料與原功能限制。後端新增 `PIKA_PUBLIC_SHOP=true`，在 Clerk 驗證後保護合成 catalog、有效商品／訂單 token、圖片及門市資料。公開不等於開放測試資料。

`Setup.tsx`、SignUp、前端自動 createStore 與後端 `POST /stores` 已移除；沒有第一位登入者自動當店主。管理頁仍經 MerchantPortal，API 經原 requireAuth／指定 owner 與 store 校驗。

原穩定商品圖片網址不變；ProductImage 透過同源 bearer fetch 顯示 blob，不向任意外部 host 傳 token。購物車、查單末五碼及門市搜尋的原生 fetch 補上登入 token，讓店主仍可操作隔離測試資料。

## 隔離資料庫清理

先部署無 Agent 依賴的 API `0078de84-73a0-4e18-8966-3203b1d4b7d4`，SUCCESS 後才執行清理 deployment `978eccf3-ddec-43cd-a39c-74c4309239ac`。

`remove-seller-agent.mjs` 校驗精確 project／environment／service、資料庫 `pika_sites_poc`、帳號 `pika_poc` 及店主，交易內鎖表並檢查依賴。三張 Agent 表刪前各 0 筆；0044 不使用 CASCADE，刪後 `to_regclass` 全部不存在。若有資料會中止而非清空。

12 個業務表前後筆數一致：stores 1、products 4、orders 11、customers 5、store_credit_transactions 6、shipment_trackings 2、shipment_tracking_events 2、shipment_tracking_run_logs 6、shipment_tracking_exceptions 4、logistics_import_batches 6、logistics_import_rows 10、invoice_ocr_runs 1。

一次性 preDeploy 已移除並再部署最終 API；正常啟動不會再次執行刪表。空表回復材料為原 checkpoint 的 schema／migration；沒有 Agent row 需要備份。

## 自動驗證

- Orval 生成及 libs、API、scripts、mockup 型別檢查通過。root 首次在 shop 找到 queryKey／null narrowing 兩處錯誤；修正後單獨 shop typecheck exit 0，其他已通過 workspace 不重跑。
- API build、最終 shop build、migration 腳本語法檢查通過。Vite 有既有 shadcn sourcemap 與 bundle size 警告，build exit 0，未因本輪擴大重構。
- 本機物流 8 項、公開 API 5 項、Worker 7 項、品牌／圖片 4 項、單品頁 5 項、購物車／查單末五碼 9 項通過。僅 fixture 測物流與 OCR 錯誤路徑，沒有真外部呼叫。
- 公開 API 整合測試使用真隔離本機 PostgreSQL，移除 Agent 表後正常讀業務；匿名、非指定帳號、跨店、建店與真副作用拒絕。另關閉本機 POC allowlist 後以已授權測試證明舊 Agent router 真正不存在，沒有把匿名被拒當作移除證據。
- 刪表後用私人 Sites 正常 API、最終 API 重啟後用公開 Sites 正常 API 分別讀回；公開驗證完全不帶 OAI-Sites-Authorization。均與更版前基準一致：商品 4、訂單 11、原訂單 1 金額 200；商品 1 圖片 417 bytes，SHA-256 `5ebf45e7206f8cfc6dab1a35c320bdd9506cf6f754b3ef8e83d791cfca67048c`。
- 既存合成物流訂單 9／11 仍為 arrived_store／exception，沒有誤判送達或回傳內部錯誤；客戶、成本、既有 OCR case 1、物流匯入／異常／狀態與 audit 可讀。
- 無 Site 登入、無 Clerk token 時：`/`、`/shop`、`/cart`、`/track` HTTP 200；管理 API 401；有效測試分享／查單／圖片及下單入口 404；`/sign-up`、`/setup`、`/settings/agent` 404。現場 Agent API 仍先由部署 allowlist 回 403，本機測試補足實際 router 移除證據。
- 實際瀏覽器畫面尚未驗證。DOM、型別、路由、HTTP、API 與 SQL 證據不冒充 Browser E2E；沒有要求使用者逐頁驗收。

主要命令沿用現有工具：
`docker compose -f sites/poc/compose.yaml run --rm --no-deps tools --filter @workspace/shop-app run typecheck`、
`.poc/checks/build-public-shop.mjs`、
API workspace 的 `node --import tsx/esm --experimental-test-module-mocks --test`、
`node --test sites/worker.test.mjs`、
`.poc/checks/run-public-online.mjs private|public`。
測試回條保存在 ignored `.poc/checks/public-launch-*.txt` 及 baseline／private／public JSONL，只有去敏摘要，無 key 或完整 token。

## pika-jpselects.com 待辦

原 Site 已新增 domain ID `appgdom_6ab8bc58fce481919e81e44c332c0fbd`，不要重建。最新查回 status pending、SSL pending_validation；authoritative NS 是 `dns1.registrar-servers.com`／`dns2.registrar-servers.com`，對應 [Namecheap BasicDNS](https://www.namecheap.com/support/knowledgebase/article.aspx/923/10/what-is-your-basicdns/)。

Sites 實際要求以下 DNS；A 的兩筆取代目前指向舊網站的 apex A，保留 MX／郵件及所有無關紀錄：

| Type | Name | Value |
|---|---|---|
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=bKITDHZy1USHczTFLS6NEPBWjxN-57Vcu_q4XmgBQ_c |
| TXT | _cf-custom-hostname | 1d69faae-f3c3-408d-ae40-163c3b733914 |

以上是公開 DNS 驗證值，不是 API secret。DNS 尚未寫入，不能說只是傳播中，也不能說正式網域已由 Sites 提供。接回瀏覽器並登入後，只設定上述紀錄，refresh 同一 domain status，再驗證 HTTPS 與新 Site；不改無關 DNS。

## 回復與剩餘範圍

公開存取若需回復，先把同一 Site 改回原 owner-private，再以既有部署方式回到第 8 版。若同時回復含 Agent 的舊 API，必須先由 checkpoint 的原 schema／migration 還原三張空表，不能只切舊 image。不要 reset 他人修改、不回到最初遷移基準；用正常 revert／新 commit。原始碼額外備份仍在專案外 `Codex-backups/PUBLIC-LAUNCH-2026-09-27T06-48-13-068Z/source.zip`。

真商品／客戶／訂單／歷史搬遷、四家物流合法單號、真門市來源、完整 Browser E2E、Excel 實機與正式平台匯入仍延後。舊 Replit、正式資料庫／R2、main、原 OCR 分支及 Git 歷史未改。本輪不自動開始任何上述工作。
