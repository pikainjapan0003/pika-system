# Seller Agent 移除與公開商店

2026-09-27，B＋Astra，依使用者要求在安全節點暫停，供重開機釋放記憶體。使用者明確授權移除 Seller Agent、同步遷移分支、公開客人網站與綁定 pika-jpselects.com；不搬真資料、不改 main／原 OCR／Replit。

## 重開機後接續位置

- 本輪修改保存為本機 `checkpoint-public-launch-paused` commit；尚未 push，GitHub／Sites／Railway 執行版仍是下列改前版本。既有未追蹤 `.codex/` 及 controller-recovery 交接材料未納入本輪提交。
- 已通過：API／libs／scripts／mockup typecheck、API build、物流 8 項、公開 API 5 項、Worker 7 項、品牌／圖片 4 項、單品 5 項、購物車與查單末五碼 9 項。完整 root typecheck 的 shop 部分找到 queryKey 與 null narrowing 兩處型別錯誤，均已修正；最終 shop typecheck／build 因本次安全暫停未完成，不算通過。
- 本輪本機建置／測試容器停止，資料卷保留。持續輸出的測試紀錄在 `.poc/checks/public-launch-*.txt`。線上原始讀回基準保留 `.poc/checks/public-launch-online-baseline.jsonl`，不要覆蓋。
- 先續跑 shop typecheck 及 `.poc/checks/build-public-shop.mjs`，必要時重跑受修正影響的小測試。API 清理腳本新增刪表後 `to_regclass` 核對；此更新尚未複製到之前的 `.poc/api-source-plrGju`，部署前以 `sites/poc/prepare-api.mjs` 重新產生乾淨來源。
- 測試通過後再正常 push 遷移分支、設定隔離 API 的 `PIKA_PUBLIC_SHOP=true`（保留 `PIKA_PRIVATE_POC=true`）並部署。先讓新版 API 不再依賴 Agent，才執行 `src/poc/remove-seller-agent.mjs drop`；僅空的專屬表允許刪除，非空會中止；部署後清空一次性 preDeployCommand。雲端目前尚未執行此清理。
- 前端 build 後沿用 `sites/prepare-site.mjs` 與既有 Site source checkout，先私人部署新版、用 `publicLaunchOnline.verify.mjs` 比較基準，再改 Sites access 為 public 並發布。不得把 GitHub commit 和 Site 產物 commit 混寫。
- Site ID `appgprj_6ab69a6062348191809b743a5635f83e`；Railway project `de13e86c-9d70-4396-85be-79cd73cd412f`、environment `143266a9-b10c-4dec-9b8f-f4eec9bec86a`、API service `1068b8cf-3623-4b85-a702-d7bb7b70080e`。重開機後重查 deployment/staged changes；不要套用他人暫存變更。
- Domain 已新增一次，ID 與 DNS 值見下方，不要重建。瀏覽器控制連線逾時而無法操作 DNS；尚未確認網域商登入狀態。其餘工程完成後，若仍無法操作再集中提出最少 DNS 登入／設定事項。

沒有新增付費、真 OCR、真物流或正式資料操作。此次暫停不代表公開網站或網域綁定完成。

目前基準 `923fd0899a9c1e99264fd7f678c7c65fce31a672`；Sites 第 8 版／來源 `3a9a3c090c142d905b051d36df64f58cf1ef757f`；Railway `39fc9e9f-cfa3-44ed-b0e1-ecd72fb2f27e`。工作樹 tracked 乾淨，既有未追蹤交接材料保留；改前 Git archive 備份在專案外 `Codex-backups/PUBLIC-LAUNCH-2026-09-27T06-48-13-068Z/source.zip`。

## 依賴與處理

Seller Agent 的 `sellerAgent.ts` 管設定、`agent.ts` 提供舊外部控制 API、`agentAuth.ts` 讀專用 token；三張 Agent 表只供上述入口使用。原物流 adapter 僅在註解提到舊 agent endpoint，沒有呼叫或 import。獨立物流 routes、FamilyMart worker、其他 adapters、匯入、異常、shipment tables／events 與客人查單保留。

公開前先把合成工程資料與正常品牌入口分開。指定店主 Clerk／store 校驗、隔離 DB 與既有副作用限制維持；不以公開 Sites 為理由開放管理 API。

## 網域

已使用既有 Site Custom Domain 功能新增 `pika-jpselects.com`，ID `appgdom_6ab8bc58fce481919e81e44c332c0fbd`，目前 pending。DNS authoritative NS 為 `dns1.registrar-servers.com`／`dns2.registrar-servers.com`；不是由既有 R2 帳號自動取得 DNS 管理權限。

Sites 實際要求：

| Type | Name | Value |
|---|---|---|
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=bKITDHZy1USHczTFLS6NEPBWjxN-57Vcu_q4XmgBQ_c |
| TXT | _cf-custom-hostname | 1d69faae-f3c3-408d-ae40-163c3b733914 |

以上為公開 DNS 驗證值，不是 API 密鑰。尚未改 DNS，將先完成程式與測試，再核對可操作的網域管理 session。保留 MX／郵件及其他無關紀錄。

## 驗證與交付

已移除 AgentSettings、sellerAgent／agent routes、agentAuth、三份 schema 與 exports、Seller Agent OpenAPI／生成 client、4 份專屬測試。`Setup.tsx`、前端自動建店、SignUp 與 `POST /stores` 也已移除。舊建表 migration 保留；0044 為正常向前刪除，不用 CASCADE。歷史報告加註已移除；一般 audit 保留。

`VITE_PUBLIC_SHOP=true` 只改品牌入口與外觀；`VITE_PRIVATE_POC=true`／`PIKA_PRIVATE_POC=true` 維持。`PIKA_PUBLIC_SHOP=true` 在 Clerk 驗證後保護合成 catalog、有效商品／訂單 token、圖片及合成門市資料。指定店主仍可讀取測試紀錄；匿名與其他帳號無法讀取或寫入。商品圖片用同源 bearer fetch 顯示 blob，資料庫仍存原穩定圖片網址。上傳與管理 API 仍校驗指定店主及店鋪。

本機已通過：Orval 生成及 libs typecheck、API build、物流 8 項回歸、公開權限 5 項、worker 7 項、公開品牌／授權圖片 4 項、單品頁 5 項、購物車與查單末五碼 9 項。首次 OCR 讀取案例缺測試旗標、圖片案例因本機負載超過預設等待，修正測試環境後保留原行為斷言通過；沒有放寬權限／金額或重跑真 OCR。最後前端 build/typecheck 待重開機後續跑，部署尚未變更。

線上更版前唯讀基準：4 個商品、11 筆訂單、原訂單 1 總額 200；商品 1 圖片 417 bytes，SHA-256 `5ebf45e7206f8cfc6dab1a35c320bdd9506cf6f754b3ef8e83d791cfca67048c`；訂單 9／11 的已存合成物流顯示 `arrived_store`／`exception`。讀取既有 OCR test case 1，不重新辨識。檢查使用現有 Clerk 測試 owner session 及原 Sites 同源 API，沒有新的登入後門。

目前 DNS apex A 仍為 `152.42.254.130`，MX 是既有 Namecheap forwarding，未更動。NS 對應 [Namecheap BasicDNS 官方說明](https://www.namecheap.com/support/knowledgebase/article.aspx/923/10/what-is-your-basicdns/)。CUA 讀取與 Chrome 開頁逾時，Windows computer-use 初始化也逾時；尚無可操作的 DNS 控制台，不能宣稱已設定或只是 DNS 傳播。瀏覽器畫面驗證目前未完成；DOM、HTTP、API 及資料庫證據分開記錄，不要求人工功能驗收。

待补實際部署、清表及匿名公開讀回；真商品／客戶／訂單／歷史搬移、四家真物流、完整瀏覽器／Excel／正式平台驗收全部延後。
