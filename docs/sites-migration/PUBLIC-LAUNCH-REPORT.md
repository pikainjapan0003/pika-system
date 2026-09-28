# 公開網站與搬遷收尾（含 Seller Agent 移除紀錄）

更新：2026-09-28，Codex B＋Astra。沿用 `codex/chatgpt-sites-private-poc`；本輪只更新本報告與 PHASE1-PLAN，不改程式、DNS、Clerk、Railway、R2、資料庫或重新部署。未 reset、未改 main／原 OCR 分支或 Git 歷史，未使用 SWE-2／Devin 或另開審查。

## 目前結果

- **本次已約定範圍的功能與網站搬遷主體已收尾。** 原有保留功能在私人／合成資料範圍完成遷移；Sites、Railway API、PostgreSQL、R2 與一筆真 OCR 沿用既有完成報告，不代表所有外部整合及正式營運全面驗收。
- **Seller Agent 已從新產品、GitHub 遷移分支、Sites 第 9 版、Railway API 與隔離庫移除。** 真正物流能力、一般 audit 與店主業務功能保留。
- **客人品牌入口公開，管理後台受授權保護，測試資料不公開。** 本輪 Sites 查回第 9 版、access `public`；「商品準備中／尚未開放下單」沿用該版來源與先前部署紀錄。本輪沒有上架真商品或開始正式接單。
- **指定 Clerk 店主與資料邊界沿用 2026-09-27 第 9 版驗收。** 管理 API 401、合成 token／圖片 404、指定 owner 可讀的證據見下方；本輪未重新驗證 Clerk 登入或全部 API。技能地圖／問卷／套餐／解鎖已移除；多賣家註冊、onboarding、Setup、自動建店及第二店主入口維持原移除／停用決定。
- **pika-jpselects.com 已確認可開啟。** 使用者直接回報可正常看到網站；本輪另唯讀取得 HTTPS 200，Sites 自訂網域／provider／SSL 狀態均為 active，current_live_url 為正式網域。原 DNS 操作／登入待辦已移除；本輪沒有修改 DNS、MX 或郵件。
- **歷史正式資料搬遷不適用。** 使用者確認目前沒有歷史正式資料需要搬遷；沒有執行搬移，不寫成資料已搬完。
- **Replit 停機不適用於本輪操作。** 使用者回報因未續費已停止；本輪未操作或獨立核對該帳號，不再把它描述成仍在線或可立即切回的備援。舊程式／Git 歷史仍是來源紀錄，Replit 服務恢復能力未驗證。
- 不需使用者再截圖或逐頁驗收。外部物流、部分瀏覽器／實機及更多 OCR 驗證保留為後續事項；沒有查真包裹、重跑 OCR、啟用付款／寄件／通知或背景自動化，沒有加購、升級或新增監控。既有平台用量／費用未另查，維持未知。

正式網址：[PIKA JP Selects](https://pika-jpselects.com/)。本次「收尾」只結束約定搬遷工作，不關閉線上服務、不刪合成資料或圖片。

## 版本與來源

本輪起始本機及 GitHub 遷移分支皆為 `50b47de9006bf0598b6fe2484c06d648397f3aa0`，tracked 工作樹乾淨，既有未追蹤交接材料保留。本次收尾 commit 僅含這兩份文件，正常 push 後另讀回遠端 HEAD。下列部署 SHA、Railway 狀態、表筆數與測試為 2026-09-27 既有證據；本輪只另核對 GitHub、Sites 第 9 版／public、自訂網域與正式 HTTPS，不重跑部署驗收。

| 層次 | 已核對結果 |
|---|---|
| 原可用 checkpoint | `923fd0899a9c1e99264fd7f678c7c65fce31a672`；Sites 第 8 版；Railway `39fc9e9f-cfa3-44ed-b0e1-ecd72fb2f27e` |
| 2026-09-28 收尾前 GitHub 最新版本 | `50b47de9006bf0598b6fe2484c06d648397f3aa0`，與本機相同；其執行程式與下列 9737f77 相同，本輪再追加文件提交 |
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

## 2026-09-27 自動驗證紀錄（本輪引用，未重跑）

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

## pika-jpselects.com 收尾證據（2026-09-28）

| 來源 | 實際結果 | 證據限制 |
|---|---|---|
| 使用者本輪直接回報 | 已實際開啟 https://pika-jpselects.com 並正常看到網站 | 不擴大成全部功能、登入或外部服務已驗收 |
| 本輪 HTTPS 唯讀 GET | 2026-09-28 15:03（UTC+8；07:03Z），HTTP 200、最終 URL `https://pika-jpselects.com/`、content-type text/html、title PIKA JP Selects；HTML 引用 `/assets/index-CmLCoC3E.js`，與第 9 版資產名稱一致 | 單一本機網路環境的 HTTPS／HTML 證據；未執行瀏覽器互動或登入測試 |
| Sites list_custom_domains | 原 domain ID `appgdom_6ab8bc58fce481919e81e44c332c0fbd`；hostname pika-jpselects.com；status／provider_status／ssl_status 全為 active，last_error null | 平台查回狀態，沒有宣稱 DNS 全球快取或所有地區 TLS 都逐一測過 |
| Sites get_site | 原 Site `appgprj_6ab69a6062348191809b743a5635f83e`、第 9 版、access public、current_live_url `https://pika-jpselects.com` | 本輪沒有建立新 Site 或重新部署；後台授權沿用前次證據 |

前次 pending、舊 A 位址與 DNS 登入阻礙是 2026-09-27 的歷史狀態，現在已由上述新證據取代，不再要求使用者填 DNS。紀錄更新不代表本輪曾操作 DNS；本輪只讀取平台現況。

## 後續驗證／未啟用（不阻擋本次收尾）

| 項目 | 保留的實際範圍／缺口 |
|---|---|
| 全家有效外部貨態 | 入口、worker、fixture 及合成資料保存流程已有證據；合法單號的真查詢仍未驗證 |
| 7-11 有效外部貨態 | 仍 preview-only，沒有本輪新增 commit 或 auto sync；真查詢未驗證 |
| 黑貓／郵局有效外部貨態 | 沿用原手動查詢、預覽、摘要／確認範圍；合法外部貨態未驗證，不做真寄件 |
| 7-11／全家門市來源 | 合成門市選擇／保存已有證據，真資料來源仍未驗；原 7-11 EMap 外部匯入停用決定不變 |
| 完整瀏覽器流程 | 新線上環境完整 Browser E2E 延後；使用者看到首頁與本輪 HTTPS 200 不替代全部畫面驗收 |
| 賣貨便 XLSM | 既有產檔與巨集格式證據保留；Excel 實機開啟、官方平台正式匯入延後 |
| OCR | 一張合成收據的一次真 OCR 成功紀錄保留；更多收據準確率、人工複核體驗未全面驗證，本輪不再付費呼叫 |
| 正式副作用／背景自動化 | 真付款、真寄件、真通知與原未啟用自動化維持停用；worker／排程入口存在不等於雲端已定時執行 |

## 回復與剩餘範圍

公開存取若需回復，先把同一 Site 改回原 owner-private，再以既有部署方式回到第 8 版。若同時回復含 Agent 的舊 API，必須先由 checkpoint 的原 schema／migration 還原三張空表，不能只切舊 image。不要 reset 他人修改、不回到最初遷移基準；用正常 revert／新 commit。原始碼額外備份仍在專案外 `Codex-backups/PUBLIC-LAUNCH-2026-09-27T06-48-13-068Z/source.zip`。

歷史正式資料搬遷已改為不適用，不是未完成搬移；Replit 已停止是使用者回報，不是本輪執行結果，也不是可立即切回的在線備援。上述原碼／checkpoint 回復說明僅保留既有來源證據，不保證 Replit 帳號、方案或服務可直接恢復。本輪未改正式資料庫／R2、main、原 OCR 分支或 Git 歷史；合成測試成果保留，不重建空店。後續驗證表不觸發下一輪工程。
