# 剩餘既有功能 PRIVATE 遷移

2026-09-27，B＋Astra。本輪能在現有授權及合成資料下完成的既有功能，已接到私人 Sites／Railway，線上保存、雲端 SQL 與 API 更版後讀回通過。沿用現有架構，沒有再呼叫真 OCR、查未授權包裹或要求人工驗收。

- **新增可用範圍**：分類、四層價格、訂單修改／人工付款、購物金完整生命週期、揀貨／出貨清單、訂單及賣貨便 CSV／真正 XLSM、兩家超商門市與 Excel 物流匯入、已保存合成貨態、日圓參考及手動套用、原 Audit／客戶明細／Dashboard。
- **仍缺外部資料**：全家、7-11、黑貓、郵局合法測試單號；本輪沒有真貨態查詢。兩家門市使用明確合成資料，未宣稱真門市來源驗收。
- **刻意排除或未定案**：EMap 外部匯入、真付款／寄件／通知、背景同步、自動票價／匯率、未定案公式、完整店鋪設定與 Seller Agent。技能地圖保持移除。
- **延後驗收**：本輪實際瀏覽器操作、Excel 實機開檔、正式寄件平台匯入及人工操作偏好。DOM／HTTP／資料庫證據與真瀏覽器分開列。
- **版本**：GitHub 執行程式 commit `eab7238c4443d235bd0242432e30f542a315393d`；Sites 第 8 版；Railway 最終 `39fc9e9f-cfa3-44ed-b0e1-ecd72fb2f27e`。最後只有測試及本報告／總進度收尾，沒有再改部署程式。
- **目前不需要使用者操作**。正式資料搬遷、正式身分／資源／用量、域名與公開範圍仍需另行確認；Replit 保留。

起點：本機與 GitHub `codex/chatgpt-sites-private-poc` 同為 `e7238369d5e5ee62ba39293258cfe1cd2ebfb488`。tracked 工作樹乾淨，既有 `.codex/` 與 controller recovery 未追蹤材料保留。PRIVATE Sites 第 7 版，來源 `528e32a3f2ec3bc54c79cc704a9e9079bdd8d4b6`；Railway API `c1657bda-c30f-4492-a870-9e4e3440be6e` SUCCESS，無 pre-deploy hook、無 GitHub 自動部署來源。Site `custom`、指定 owner 1 人，未擴大存取。

## 本輪範圍與現況

| 功能 | 證據／現在完成範圍 | 尚待完成或外部缺口 |
|---|---|---|
| 分類 | 已完成：原 categories CRUD／SET NULL，正常 Sites API 增改套用刪除及更版後讀回 | 瀏覽器延後 |
| 四層價格 | 已完成：原 `resolveTierPrice`，120／100／80／60 各買兩件 240／200／160／120；前端偽造 1 元未採用，缺合作價回 120；線上／SQL／更版讀回一致 | 驗證指定店主管理入口選取既有等級客戶，不新增客戶登入或公開 VIP 身分猜測 |
| 訂單／付款 | 已完成：原建立、備註、狀態、末五碼、部分付款 100→已付 240；數量 2→3→2 同步總額／應付；線上保存與更版讀回 | 真支付服務未開啟；畫面操作延後 |
| 購物金 | 已完成：80−10−30=40，重送不再扣，取消回沖至 70，再取消仍 70；雲端 SQL spend／reversal 各 1，重啟後餘額 70 | 本輪只用假客戶／假單 |
| 揀貨／出貨清單 | 已完成：原 Picking／Shipping List、持久勾選、線上 CSV 下載 | 實際列印及畫面操作延後；不寄件 |
| 訂單／賣貨便匯出 | 已完成線上資格預覽、CSV 及真正 v1.4 XLSM，VBA／欄位／金額一致 | Excel 實機開檔及正式平台匯入延後 |
| 7-11 門市 | 已完成合成門市搜尋／選擇／返回欄位／訂單保存；901001，120＋38=158，後台一致且來源強制 customer | 真門市來源未驗、EMap 匯入停用；瀏覽器返回操作延後 |
| 全家門市 | 另行完成同一路徑：901002，120＋60=180，線上後台快照及更版讀回一致 | 真門市來源未驗，瀏覽器返回操作延後 |
| 7-11／全家 Excel 物流匯入 | 已完成：各自全合成 XLSX→配對→確認→雲端存庫→token；重複確認 409、重複匯入同一 tracking、衝突拒絕、未匹配異常及歷史 | 不將檔案匯入稱為真貨態 |
| 物流異常／客人查單 | 已完成已保存合成狀態：711 arrived_store、Family unknown／failed；更版後後台與 token 為 arrived_store／exception，不暴露內部錯誤 | 真貨態待外部資料；DOM 通過，實際瀏覽器延後 |
| 全家真貨態 | 沿用已部署的查詢入口及前輪 24 項證據 | 等待合法單號，不重複查詢 |
| 7-11 貨態 | 原 preview-only 邏輯保留，沒有新增 commit／同步；私人預覽入口待合法單號才能查 | 外部查詢未驗 |
| 黑貓／郵局 | 原手動 preview／snapshot 保留；原 COMMIT_ENABLED=false 決定不改 | 外部查詢未驗；不新增寄件／自動同步 |
| 匯率參考 | 已完成：四家原官方 adapter 線上讀取、原專用匯率頁手動套用，保存後還原 0.2；fixture 驗不可用不填 0；原毛利快照未變 | 不新增背景抓取；完整店鋪 Settings PATCH 依原 J 節仍停用，僅 purchaseExchangeRate 可寫 |
| Audit Log | 已完成：原頁面／API 接回，帳本 spend／reversal、賣貨便匯出紀錄線上可查，重啟後仍在 | 未新增監控系統；實際瀏覽器延後 |
| 客戶明細／毛利／Dashboard | 已完成既有入口、客戶訂單／毛利資料、stats、物流入口／異常數；線上讀回及必要 DOM 測試 | 首頁重設計不在範圍；實際瀏覽器延後 |
| Seller Agent | 未定案，設定與背景入口仍未開放；共用物流程式保留 | 本輪刻意排除 |

## 線上第一輪證據

2026-09-26T20:44Z 前後，驗收從 Sites 同源 `/api` 經部署中 Railway Express，使用既有真 Clerk 測試 owner session。原生 Sites QA 授權只解開私人網站門禁，不替代 Express 的指定店主驗證。秘密僅由隱藏 stdin 傳入記憶體；收據沒有 key、JWT、查單 token 或真客資。

| 範圍 | 實際合成資料與結果 |
|---|---|
| 商務標記 | `RM-1790455214337`；store 1、商品 4；分類刪除後商品保留且 category 為 null |
| 四層價格 | 訂單 2／3／4／5：單價 120／100／80／60，兩件各 240／200／160／120；偽造前端 1 元被忽略，訂單 6 的空合作價依原規則回 120 |
| 人工付款及修改 | 訂單 2：末五碼 12345、先付 100 再記錄 240 已付；數量 2→3→2，應付 240→360→240；備註、內部備註、preparing、揀貨勾選保存 |
| 購物金 | 客戶 2 發放 80、調整 -10、訂單 7 折抵 30 後餘額 40；重送同請求回同一單，不同內容同鍵 409；取消兩次僅回沖一次，餘額 70 |
| 7-11 門市／匯入 | 客人訂單 8＝158、店號 901001；匯入對象訂單 9、tracking 1，批次 1／2／3 分別正常、重複、衝突 |
| 全家門市／匯入 | 客人訂單 10＝180、店號 901002；匯入對象訂單 11、tracking 2，批次 4／5／6 分別正常、重複、衝突 |
| 物流範圍 | 來源均為本輪合成門市及 XLSX，tracking 以 `POC-` 開頭；兩家各有未匹配異常，衝突沒有覆寫客人訂單；本輪外部貨態呼叫 0 |
| 下載 | 訂單／揀貨／出貨 CSV；賣貨便資格預覽、CSV 與真正 v1.4 XLSM。XLSM 34,429 bytes，店號 901001、金額 240.00、macro content type 與原 VBA hash 一致 |
| 匯率 | 原有 compare API 真正讀取臺銀／土銀／合庫／一銀官方來源，均回 available 且大於 0，保留各自公告與取得時間；手動套用臺銀 0.2047 後還原原值 0.2，沒有自動改商品或歷史毛利 |
| Audit／明細／Dashboard | 查到帳本 spend／reversal、明文賣貨便匯出等原 audit，客戶訂單含原毛利資料、stats 可讀；原訂單 1 仍 200 元且毛利快照未變 |
| 權限／排除 | 無 Clerk 管理請求 401、錯店 403；建店、EMap 匯入、物流 sync／commit、舊技能開通仍 403。無 OCR／真出貨／付款／通知 |

原始去敏收據 `.poc/checks/remaining-online-run.jsonl`，可重跑程式為 `src/poc/remainingOnline.verify.mjs` 及兩個 scenario。上述為正常 HTTP→雲端 DB→讀回證據，未宣稱使用真瀏覽器點擊。

雲端 SQL 複查：部署 `cacc30e9-329f-44ff-9353-61a89fb2b927` 的一次性 `remainingDatabase.verify.mjs` 先核對專用 DB／role／PRIVATE／指定店主，再只找本輪商品標記。確定訂單 2–11 恰為 10 筆、前四筆金額正確、取消訂單 7 的 spend／reversal 各 1 筆且各 30.000000000000。相同交易只對本輪 tracking 1／2 寫入明確合成貨態：711 arrived_store，Family unknown＋查詢 failed；不是外部物流成功。結構化收據 `.poc/checks/remaining-database-deployment.json`。隨後移除 pre-deploy 指令，再部署同一來源作最終持久性讀回。

**更版後讀回通過**：最終 API `39fc9e9f-cfa3-44ed-b0e1-ecd72fb2f27e` SUCCESS，服務 `preDeployCommand=[]`。`remainingOnline.verify.mjs` 的 verify 模式只讀既有紀錄，再由 Sites 取得原訂單 1 金額 200、訂單 2–5 分層價格、取消訂單 7／購物金 70、原 tracking 1／2 及兩家門市快照。後台與 token 對同一筆合成物流分別顯示 arrived_store／exception，不顯示內部 checkError／internalNote；再次確認指定店鋪、匿名管理拒絕及原停用入口。收據 `.poc/checks/remaining-online-verify.jsonl`，exit 0；沒有重建資料或再次呼叫銀行／OCR／物流。

## 必要修正

- `privatePoc.ts` 只增加本輪需要的既有路由，保留 gateway、Clerk 指定店主／指定店鋪與原業務確認；技能地圖不恢復。
- `sites/worker.mjs` 補轉送 `x-confirm-maihuobian-export` 與下載 `Content-Disposition`，避免第二個既有確認被代理丟掉。
- `orders.ts` 讀購物金帳本補接受既有 `adjust` 類型。新增可選 UUID 請求識別＋內容 hash，交易鎖和 `(store_id,client_request_id)` 唯一 index 讓同一次新增訂單重送回原單，內容不同回 409。
- `CreateOrderDialog` 沿用同一份 tier price helper 顯示客戶層級售價，送出穩定請求識別；業務售價仍由伺服器重新讀取計算。
- 向前 migration `0043_order_request_identity.sql` 僅新增 nullable 欄位／index，不重寫歷史訂單或成本快照。一次性 `remaining-functions-setup.mjs` 只對指定隔離 POC 執行，加入兩間合成門市，開通選店，不呼叫寄件商。

## 驗證與已知限制

本機首批商務／帳本／揀貨／XLSM／匯率 30 項通過；最終 API／CVS／既有手動 provider 73 項通過；新增衝突情境後，三個完整合成 API 案例再通過（含真正 PG 讀寫與合成狀態展示）。舊 provider 測試初次失敗來自缺測試簽章、固定歷史列及已過時的「preview 完全不存摘要」預期；改用自建資料與原程式已存在的摘要語意後通過。正式私人版仍不開放其 commit 入口。

OpenAPI 補上 API 已存在的三個等級售價，Orval 生成、libraries 與完整 root typecheck 通過；API 與 shop-app 指定打包皆 exit 0。root build 在完成 typecheck 後，進入無關的 mockup sandbox 打包，已停止該次程序，改跑 API／shop-app，因此不宣稱整條 root build 通過。Vite 既有 sourcemap 定位與大 bundle 警告保留。前端原批次 22 項有 21 通過、1 個 React 更新等待逾時；讓測試等待 React act 完成後，匯出面板原 7 項全部通過，未修改業務斷言。另客人查單 6/6 通過，含已保存合成貨態、付款末五碼、取消與不顯示內部錯誤；這些是測試 DOM，不冒充線上瀏覽器。

本機 PostgreSQL 是 `pika-sites-private-poc-db-1`，`pika_sites_poc`／`pika_poc`；雲端沿用 Railway project `de13e86c-9d70-4396-85be-79cd73cd412f`、environment `143266a9-b10c-4dec-9b8f-f4eec9bec86a`（名稱 production，但用途為隔離 POC）、API `1068b8cf-3623-4b85-a702-d7bb7b70080e`。未讀取正式客戶、原正式資料庫或正式圖片。

新版自動案例在 `src/poc/remainingCommerce.integration.test.mjs`，可重用 HTTP scenario 供線上驗證。原物流測試中含來源不明的歷史遮罩檔，本輪不拿它作測試資料；另用原解析器接受的標頭生成全合成 Excel。

2026-09-27 瀏覽器 inventory 可讀，但 Chrome 開 PRIVATE 站點逾時；目前不宣稱完整畫面 E2E，不要求使用者代測。新增外部 API 費用、真 OCR 呼叫、真物流單、付款、通知均未執行。

| 自動驗證 | 結果與界線 |
|---|---|
| 既有購物金生命週期／訂單折抵、揀貨、賣貨便 CSV／真模板 XLSM、匯率 fixture | 首批 30 項通過；只對本機隔離庫／mock，不代表外部服務成功 |
| 新商務完整流程＋CVS＋既有手動物流 adapter 路由 | 73 項通過；provider 全部 mock，含既有確認／交易／防重與安全分支，線上 commit 仍停用 |
| 新增兩家匯入衝突後的商務／物流完整流程 | 3 個整合案例通過；每個包含多個正常 HTTP 寫入、真正 PostgreSQL 讀回及已保存合成貨態 |
| Dashboard、匯率提示、匯出面板、Orders、揀貨、公開下單元件 | 22 個不同案例都有通過證據；其中匯出面板修正測試等待後 7/7，屬測試 DOM，不等於真瀏覽器 E2E |
| Sites worker | 6/6；確認標頭、下載檔名與既有授權轉送 |
| Orval／完整 root typecheck | 通過；生成差異只增加實際已存在的 3 個等級價格欄位 |
| 客人 token 查單元件 | 6/6；末五碼、取消、711 已到店、Family 需確認及內部訊息遮蔽 |
| API／shop-app 指定 build | 通過，exit 0；未要求不相關 mockup sandbox 完整 build |

上述批次有重疊，不能相加成「全部功能完成率」。本輪使用的命令及完整非秘密輸出保存在忽略的 `.poc/checks/remaining-*.txt`；可重跑的合成 scenario／測試原碼已納入 Git。

主要命令：

```text
node --import tsx/esm --experimental-test-module-mocks --test --test-concurrency=1 src/poc/remainingCommerce.integration.test.mjs src/routes/cvs.route.test.mjs src/routes/logisticsSyncManualProvider.route.test.mjs
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/shop-app run build
node --test sites/worker.test.mjs
```

Node／pnpm 命令在既有 `sites/poc/compose.yaml` 工具環境或本輪專用 Linux 測試容器執行，沒有對 production DATABASE_URL 跑測試。

## 版本與回復

施工 commit `eab7238c4443d235bd0242432e30f542a315393d` 已推送。395 個 API／lib／workspace 設定檔與乾淨上傳目錄逐位元組相符。Railway `98f95c7b-4f2a-418a-96e6-7f8efe2260a3` SUCCESS；pre-deploy 結構化紀錄 `remaining_functions_setup` 確認 store 1、migration 0043、seven／family 合成門市已套用。

Sites 第 **8** 版部署 `appgdep_6ab82d45991c8191a4ad29eae4ac8001` succeeded，產物來源 `3a9a3c090c142d905b051d36df64f58cf1ef757f`、env revision 2。原生 Sites 工作流已保存／推送來源；Windows Bash 封裝路徑不相容，沿用既有 `.poc/publish-source.mjs` 核對遠端 HEAD、build 與 tar 後由原生工具部署，沒有改權限或新建發版框架。讀回仍為 custom、owner 1 人、群組及外部訪客 0。線上業務與更版後讀回均已通過。

| 來源／服務 | 最終識別 |
|---|---|
| GitHub 遷移分支執行程式 | `eab7238c4443d235bd0242432e30f542a315393d`；其後收尾 commit 僅本報告、PHASE1 及已通過的查單元件測試，以本報告所在 Git commit 為準 |
| Sites 產物 repo | `3a9a3c090c142d905b051d36df64f58cf1ef757f`；來自上述 root 執行程式與成功 build，非 GitHub main |
| Sites version／deployment | 8／`appgdep_6ab82d45991c8191a4ad29eae4ac8001` |
| Railway 最終 API | `39fc9e9f-cfa3-44ed-b0e1-ecd72fb2f27e` SUCCESS；與 395 檔核對的 eab7238 乾淨來源相同，pre-deploy 已清空 |
| 專用雲端 PostgreSQL | Railway `8fefb8b0-4e60-4b2b-b87d-b3cd486388b8`，PG 18.6，`pika_sites_poc`／`pika_poc`；沒有為驗收新增公開 DB 代理 |
| 保留的原分支 | main `6190ef22584d19fb8f2427e76d09d23c7aa88d3c`；原 OCR `33953b1fa8586110863c76304f5b6d3dc9f1ba92`，read-back 一致、未推送這兩支 |

沒有更改 Railway／Sites／R2 的秘密或方案，部署前 staged patch 皆先確認為空；只使用本輪明確的一次性 pre-deploy 設定，最後清除。本機 `pika-remaining-api-tests` 與本輪啟動的 `pika-sites-private-poc-db-1` 已停止，資料卷保留；線上私人服務繼續運作。既有 R2／OCR 成功案例保留，本輪未重做付費驗收。

原碼回復依本輪前 `e7238369` 與既有私人部署：Sites 第 7 版、Railway `c1657bda-c30f-4492-a870-9e4e3440be6e`。新 nullable 欄位可保留，不必刪資料才能回復；合成門市與本輪新增合成紀錄保留。未新增付費服務、升級或更改付款設定；既有服務本輪用量費用及當下餘額未取得，不宣稱零成本或引用舊餘額保證。

本輪備份：專案外 `Codex-backups/REMAINING-FUNCTIONS-2026-09-26T19-04-40.869Z`，含改前來源 zip／總進度。main、原 OCR 分支與 Git 歷史不改。

回復時使用正常 revert／既有部署的上一版本，不 reset 工作樹；還原本輪新增的私人路由與 Sites 產物即可。0043 的 nullable 欄位／唯一 index 可保留，合成訂單、帳本及成功案例不用刪除。若要還原選店開關，只改此 POC store 1 的 `shipping_cvs_enabled`，不影響正式店鋪。

正式切換不在本輪：真資料／正式圖片搬移及核對、正式登入／資源與用量、網域切換及公開範圍都還需專門確認；Replit 保留。外部物流需合法單號；Excel 實機／官方寄件平台匯入延後。本輪沒有新開 Seller Agent、自動匯率／票價或未定案成本公式。
