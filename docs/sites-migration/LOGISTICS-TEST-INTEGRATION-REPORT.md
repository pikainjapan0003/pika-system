# 私人 POC 物流狀態接線

更新：2026-09-26。Codex B＋Astra；單一寫入者，未啟用子代理、SWE-2／Devin。

## 目前結果

1. 選擇沿用 **全家店到店**：既有 adapter、worker、貨態表及後台／token 摘要已存在，改動最少。
2. **外部真查詢受阻：尚無合法測試單號。** 官方查詢頁存在，但本次未找到公開、可直接使用的官方 sandbox 測試資料。尚未送出任何包裹查詢；不沿用舊文件中的真實單號，不亂編單號查正式服務。
3. 本輪已補指定店主的單筆查詢入口、後台操作、交易保存與防舊事件覆蓋，並更新私人線上版。後台現在可展開「全家貨態查詢」；線上假訂單 1 仍沒有包裹貨態，客人 token API 同樣沒有物流事件，沒有灌入假外部結果。
4. **24 項測試、typecheck、前端 build 通過**：本機隔離 PostgreSQL／fixture HTTP transport 22 項、客人貨態標籤 2 項。Railway API 與 Sites 第 5 版已部署成功；但線上有效貨態的保存、後台／客人顯示及重啟讀回，仍須合法來源才能驗證。
5. 人工功能驗收延後。依使用者後續指示，**現在不需要使用者操作**；物流等日後取得合法全家測試單號及來源／唯讀授權再補一次最小完整驗證，不阻擋其他遷移工作，也不反覆重試。
6. 商品、R2、已完成 OCR 保留；本輪不再呼叫 OCR，不產生真出貨、金流或通知。

## 來源與最小選擇

- 現況：`lib/logistics/providers.ts` 只有 `familymart` 的 `supportsAutoSync=true`。7-11 是半自動查詢、另需驗證碼；黑貓／郵局是預覽／受控寫入，沒有本案測試資料。不改供應商、不新增聚合服務。
- [全家官方常見問題](https://www.family.com.tw/Marketing/zh/Faq) 提供線上寄件查詢；[官方寄件查詢](https://ecfme.fme.com.tw/FMEDCFPWebV2_II/index.aspx) 要求寄件／訂單編號。這證明有查詢入口，不證明是 sandbox，也不授權查他人包裹。
- 2026-09-26 只讀官方 `index.aspx`／`list.aspx` 均 HTTP 200；頁面 JavaScript 仍使用 `list.aspx/GetOrderDetail`，參數 `EC_ORDER_NO`、`RCV_USER_NAME`、`ORDER_NO`，與既有 adapter 相符。**沒有 POST 單號、沒有破解或代解驗證碼。** 未取得有效包裹回應，所以回傳格式／實際可用性仍待一筆合法樣本驗證。
- Railway 本 POC 無物流相關環境設定；線上假訂單 `1` 金額 `200`，目前無 shipment tracking。缺口是授權測試資料，不是 OpenAI／R2 key。

## 本輪局部修改

| 位置 | 修改 |
|---|---|
| `artifacts/api-server/src/routes/logisticsSync.ts` | 新增單筆 `POST /api/stores/:storeId/orders/:orderId/logistics/familymart`；Clerk 指定店主＋店鋪校驗；只綁定本店訂單，單號衝突不覆蓋；重用既有 worker，不改訂單狀態／金額 |
| `artifacts/api-server/src/lib/privatePoc.ts` | 僅放行這一條單筆入口；整批同步、cron、agent 仍未開放 |
| `artifacts/api-server/src/lib/logistics/workers/familyMartTrackingWorker.ts` | 快照與事件同交易保存、鎖定追蹤列、事件去重、舊／無日期事件不覆蓋新快照；保存失敗標記 run failed，不再查 provider；錯誤只保存安全代碼 |
| `artifacts/shop-app/src/components/FamilyMartTrackingPanel.tsx`、`pages/Orders.tsx` | 訂單卡片增加全家單筆查詢；防連點；完成後只重讀既有訂單，刷新頁面不觸發外部查詢 |
| `artifacts/shop-app/src/pages/TrackOrder.tsx`、`lib/trackingStatusDisplay.ts` | 單有單號不再標成已出貨；pending 顯示待寄件，未知狀態需店家確認；貨態時間不再拿系統更新時間代替 |
| `artifacts/shop-app/src/lib/trackingStatusDisplay.test.mjs` | 兩項貨態語意測試：沒有物流事件不能宣稱已出貨／送達，已知事件及取消狀態維持既有顯示 |
| `artifacts/api-server/src/poc/privatePocLogistics.integration.test.mjs` | 用真正 adapter／路由／worker／本機 PG，僅 HTTP 來源及 Clerk 為測試替身，拒絕所有其他外連 |

唯一新增服務端設定 `PIKA_POC_FAMILYMART_TRACKING_CODE`：只在取得合法單號與授權後設定於指定 Railway API；目前未設定。未設定回 `503 LOGISTICS_TEST_SOURCE_REQUIRED`，不建立 tracking 或呼叫外部。沒有新增 key、前端秘密或可由請求指定的外部 URL。

正常讀取仍為 `GET /api/stores/1/orders` 的 `shipmentTracking` 與 `GET /api/orders/track/:publicToken` 的安全 DTO。客人只見已正規化貨態／事件時間等原本允許的欄位，不見 provider 原始回應、錯誤內容、內部備註。查詢時間與物流事件時間分開保存。單筆 provider timeout 15 秒，既有 Sites 一般轉送 timeout 25 秒，本輪沒有拉長 timeout 或加自動重試。

## 環境、版本與回復

- 工作分支 `codex/chatgpt-sites-private-poc`；原始基準／root HEAD `33953b1fa8586110863c76304f5b6d3dc9f1ba92`。延續既有未提交成果，沒有 reset、強推、原 GitHub push 或 stage 他人改動。
- Railway project `de13e86c-9d70-4396-85be-79cd73cd412f`（pika-system-private-poc）；environment `143266a9-b10c-4dec-9b8f-f4eec9bec86a`（名稱 production，用途為隔離 POC）；service `1068b8cf-3623-4b85-a702-d7bb7b70080e`（pika-poc-api）。
- 開始前可用 API deployment `b2cc6688-5545-4eb4-bafe-d8affeb09def`；Site version `appgprj_6ab69a6062348191809b743a5635f83e~appgver_8ea889e5d9888191ae8224b91508b1b7`、專用來源 commit `d115706a4ec31b180d1d5da6ea341a8d8fef1357`。
- 本輪 Railway API deployment `6b31b5cf-5503-4471-831f-36473f2b9bfd`：SUCCESS；image `sha256:e774619ee1922e15bc8b4fd086ed1155c67fb6d2e1ccb7e15f47761df5888d04`。未修改服務環境變數、未執行 migration／pre-deploy 寫入。
- 最終 Sites **第 5 版**：version `appgprj_6ab69a6062348191809b743a5635f83e~appgver_472bce8a4a9c81918eb02e9335d23615`；deployment `appgdep_6ab7b79acd2c81918b51c7f0b79668b5`，2026-09-26T12:16:41Z `succeeded`；專用 Sites source commit `8320b7927924adbea95aad95f64cc954b13c22a7`，已由官方版本來源讀回核對。這是專用網站產物庫的 commit，並非原 GitHub 分支 push。
- [私人站點](https://pika-system-private-poc-20260925.bill831206.chatgpt.site/) 的環境 revision 維持 2，沒有改 PRIVATE 存取、轉送秘密或 tunnel。部署後再讀 access policy，仍只有 owner 1 人、editor／group／external visitor 均 0。
- 本輪讀回 Sites access policy：`custom`、允許使用者 1 位、editor 0、group 0、external visitor 0；Railway `environmentStagedChanges.patch` 為空，沒有混入他人待套用設定。
- 修改前原檔與差異保存在忽略目錄 `.poc/backups/logistics-20260926/`。回復只撤回本輪差異、移除本輪測試單號設定，或回到上述私人部署；不刪 DB、bucket、圖片或已完成 OCR 結果。不覆蓋後續修改。
- 原 OCR 分支、main、Replit production、正式 R2／網域未被本輪修改。未加購、升級或啟用新收費服務；平台當下用量／帳單金額未知，不引用舊試用餘額。

## 驗證紀錄

| 項目 | 實際結果 |
|---|---|
| 物流本機整合 | 通過 8 項：指定店主／店鋪／授權來源、adapter 正規化→PG→後台與 token DTO、重複事件、舊／無日期事件、未知狀態、查無資料／逾時、保存失敗原子回復、API 重啟讀回且不重查 provider |
| 核心回歸 | 通過 14 項：既有商品、下單、token、隔離／權限及商品圖 fixture；没有再呼叫付費 OCR |
| 客人貨態語意 | 通過 2 項：缺事件／pending／unknown 不誤報已出貨或已送達；已知物流事件與取消語意正確 |
| 型別檢查／建置 | 根目錄 `pnpm run typecheck` 通過；最後客人頁修正另跑 shop-app typecheck 及 production build 均 exit 0。既有 UI sourcemap／大 chunk 警告不阻擋建置 |
| 部署後 API | 新入口無測試來源回 503 `LOGISTICS_TEST_SOURCE_REQUIRED`；未登入回 401；後台與 token 都仍讀回假訂單 1、總額 200、無貨態，不建立 tracking 或查外部 |
| 執行方式 | 獨立 Node test 程序＋Docker 專用 PostgreSQL，測試期間停止修改程式；測試檔只允許 DB host `db`，不連線 Railway／正式 DB。不是第二位模型的獨立審查，亦不以此替代外部實測 |
| 外部真查詢 | 未執行，0 筆包裹查詢；缺合法測試單號 |
| 線上有效貨態／重啟持久性 | 未執行，不能用本機 fixture 取代 |
| 瀏覽器 | 已自動展開後台「全家貨態查詢」，看到單號輸入與查詢按鈕；第 5 版部署後刷新仍讀回假單 1／NT$200／未出貨及查詢入口。客人頁本輪瀏覽器驗證因控制逾時未完成；token API 已讀回。沒有有效貨態，因此不宣稱真物流 E2E 通過 |
| 本機依賴 | 最終建置完成後已停止本輪專用本機 PostgreSQL，保留 volume；未啟動本機 API，線上資料仍由 Railway 提供 |

命令：API workspace 的 `node --experimental-test-module-mocks --import tsx/esm --test --test-concurrency=1 src/poc/privatePocLogistics.integration.test.mjs src/poc/privatePoc.integration.test.mjs src/poc/privatePocImages.integration.test.mjs`，隔離容器回傳 exit 0（22 pass／0 fail）。fixture HTTP 只攔截全家單一查詢網址，其他非本機外連一律斷言拒絕。實際輸出 `.poc/checks/logistics-local-tests.txt`；本輪已測檔案 hash `.poc/checks/logistics-tested-source.json`。

其他命令：`node --test artifacts/shop-app/src/lib/trackingStatusDisplay.test.mjs`（2 pass／0 fail）；`docker compose -f sites/poc/compose.yaml run --rm --no-deps tools run typecheck`（exit 0）。部署後去敏證據在 `.poc/checks/logistics-online-proof.json`；測試記錄不包含 token、provider 憑證或真包裹資料。

最後前端驗證：同一隔離 tools 容器執行 `--filter @workspace/shop-app run typecheck` 及 `--filter @workspace/shop-app run build`（`VITE_PRIVATE_POC=true`、既有 Clerk 公開 key），均 exit 0；輸出 `.poc/checks/logistics-ui-typecheck.txt`／`logistics-frontend-build-final.txt`。`git diff --check` 通過。Windows Sites shell 包裝腳本的既有路徑問題，以同一 source commit 的官方 build validator 加原生 `tar.exe` 打包完成；沒有因此重新建案或改存取範圍。

人工驗收延後不影響缺陷修正；未授權寫入、錯店關聯、重複事件、舊事件覆蓋、未知／查無資料、逾時與保存失敗均列入自動測試。樣本金額保持 `100 × 2 + 0 = 200`，不自動調整訂單、成本、庫存或付款。

## 本輪停止位置

程式準備、測試及私人部署已完成；**全家有效外部貨態待合法測試單號，尚未驗證**。尚沒有可交付的真物流 run／event 識別、外部回應或線上貨態持久性證據，不以本機測試紀錄冒充。包裹外部查詢數為 0；一般平台用量／帳單未知。此項保留等待來源，整體遷移接續總計畫中的其他已核准功能；不呼叫 OCR、不新增出貨、付款、通知或排程。
