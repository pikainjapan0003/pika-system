# 私人 POC OCR 真整合紀錄

更新：2026-09-26。狀態：**已完成一張合成收據的真 OCR、雲端保存、後台展示及刷新／API 重啟後讀回。** 僅執行使用者核准的一次 `gpt-5.6-terra` 辨識，沒有重試；費用估算低於 US$0.05 上限。最終帳單扣款尚未取得，不以估算冒充帳單。

## 先看這裡

1. **已接通真正 OpenAI OCR。** Railway 使用專用 API key；線上走 OpenAI Responses API，fixture 只在本機自動測試內注入。
2. **完整流程已跑通：**指定店主正常上傳的私有 R2 收據 → 私人 Sites 後台按一次「開始辨識」→ Railway 真 provider → 測試 PostgreSQL 的 run/review → 後台顯示。
3. 使用 900×1000 的合成 PNG：**PIKA TEST MART、2026-09-26、TWD 123.45**。四欄位都辨識正確；標準答案沒有傳給 provider，也沒有用開發中的模型代填結果。
4. **刷新及受控 API 重啟後仍為 case 1／run 1。** 已核對新啟動日誌、同一筆完成結果、相同圖片 bytes／SHA-256，以及 Chrome 重載後的四欄位與用量。圖片與結果不依賴本機電腦或 Docker。
5. **真 OCR 1 次、可觀測重試 0 次。**實際輸入 2,095、輸出 92、合計 2,187 tokens；cached input 0、reasoning 0。按標準單價換算 **US$0.005294**；即使將全部輸入按 1.25 倍 cache-write 計價，保守上界為 **US$0.0063415**，均低於 US$0.05。最終帳單未取得，原因與計算見下。
6. **使用者目前無須再操作。**專用 key 已安全存入 Railway 並套用新部署；測試、存庫、畫面與重啟驗證均已自動完成。人工驗收延後，`reviewedAt` 保持 null，沒有按下人工核准或自動入帳。
7. 本次只證明這一張合成圖片與接線成功，未驗證所有收據準確率。PRIVATE、唯一店主與私有 bucket 保留；物流仍是 fixture，沒有真物流、金流或正式資料搬移。

## 現況與最小修改

- 目錄：`C:/Users/Lnovo/Documents/ChatGPT/pika-system-Sites私人遷移`。
- 分支：`codex/chatgpt-sites-private-poc`。原始基準與目前 HEAD：`33953b1fa8586110863c76304f5b6d3dc9f1ba92`；保留之前未提交成果，原工作樹未 reset、stage 或 GitHub push。僅向既有專用 Sites 產物 checkout 同步前端與 Worker。
- 開發依使用者指定 Codex B＋Astra，沒有啟用子代理、SWE-2 或 Devin；沒有更換產品 OCR 模型。
- 原本 OCR 已實作真 provider、結構化輸出、run/review、唯一 clientRequestId、處理中互斥與終態保護。`INVOICE_OCR_TEST_MODE` 要求測試範圍與指定帳號，並不是 fixture 開關。
- 本輪起始缺口為：POC 啟動器拒絕 OpenAI key、路由未放行 OCR、圖片只存在單次請求記憶體、Sites 25 秒轉送及未轉送 clientRequestId，以及尚無專用 OCR key；本輪已逐項接通。
- 不需改 schema。沿用 `invoice_ocr_test_cases` 的 storeId／imageSha256 作為穩定 R2 識別，與 `invoice_ocr_runs`、`invoice_ocr_reviews` 原表。

主要程式位置：

| 位置 | 本輪變更 |
| --- | --- |
| `artifacts/api-server/src/lib/invoiceOcr/privateStorage.ts` | 使用既有 R2 helper；私有收據讀寫、hash 核對、有界且不含原始請求的結果備份 |
| `artifacts/api-server/src/routes/invoiceOcr.ts` | 正常上傳先存 R2；POC analyze 只使用資料庫關聯的 R2 圖片；店主圖片 GET；同一筆結果恢復 |
| `artifacts/api-server/src/lib/invoiceOcr/config.ts`、`openaiInvoiceExtractor.ts` | POC 最多一次 provider attempt；SDK 保持 `maxRetries: 0`；固定標準 service tier、1200 output 上限；實際 model／response ID 缺失不得冒充成功 |
| `artifacts/api-server/src/lib/privatePoc.ts`、`src/poc/start.mjs` | 只放行 OCR 必要路由；保持測試 Clerk、明確店主、測試隔離及官方 API 入口 |
| `artifacts/shop-app/src/pages/InvoiceOcrTest.tsx`、`src/lib/invoiceOcrUi.ts`、`src/App.tsx` | 沿用原頁面並加入收據入口，授權讀取已保存圖片；重載選回既有結果，不自動辨識；不宣稱 API project 已開資料分享或免費額度 |
| `sites/worker.mjs` | 傳遞防重 ID；僅 analyze 等待 140 秒，其餘維持 25 秒；前端 150 秒、provider 90 秒並保留 R2 讀寫上限；修正深層頁面刷新回首頁 |

圖片 key 規則：`invoice-ocr/{storeId}/{imageSha256}`。已驗證結果的恢復備份位於該 key 下 `runs/{runId}.json`。兩者均不使用公開商品圖片路由、不接受任意 URL／bucket、不保存預簽網址。

本輪瀏覽器發現深層頁面會返回首頁。既有 fallback 對 ASSETS 請求 `/index.html`，會觸發資產服務的 canonical redirect；改為內部請求 `/` 回傳 HTML，保留瀏覽器原路徑。[Cloudflare HTML handling 文件](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) 支持此轉址行為；回歸測試涵蓋商品、查單與 OCR 深層路由。

若 provider 成功而資料庫交易失敗，run 保持 `processing` 並記錄 `invoice_ocr_result_save_failed`；重送相同請求或再次處理該案例會優先恢復 R2 中已取得的結果，不再呼叫 provider。原有 completed／failed 不可變 trigger 保留。若連 R2 備份與 DB 都不可用，保留可確認的失敗資訊，不能宣稱已保存或盲目重送。

## 模型、設定與費用

- 沿用 `gpt-5.6-terra`，OpenAI SDK `responses.parse()`／官方 `/v1/responses`。圖片由後端以 data URL 傳入；R2 金鑰不交給 provider。
- `imageDetail: original`、`reasoningEffort: low`、`service_tier: default`、`max_output_tokens: 1200`、`store: false`。明確使用標準計價，避免繼承 project 的其他服務層級；1200 上限包含推理及可見輸出 tokens。
- 2026-09-26 核對 [官方模型資料](https://developers.openai.com/api/docs/models/gpt-5.6-terra) 及 [圖片輸入文件](https://developers.openai.com/api/docs/guides/images-vision)。送出前以專用 project header 查詢 `/v1/models/gpt-5.6-terra` 回 200；這是一次非推論的模型資料 GET，不計入真 OCR 次數。隨後真辨識的 requested model 與 API actual model 均為 `gpt-5.6-terra`。
- 使用者已核准一次真 OCR、最高 US$0.05，不重送未知結果、不充值、不升級。2026-09-26 再核對官方標價：input US$2／cached input US$0.20／output US$12 每百萬 tokens；cache write 以一般 input 的 1.25 倍保守計入。
- 送出前離線建立實際 request，去掉圖片 data URL 後的完整 JSON 為 4,156 UTF-8 bytes；加入明確 service tier 後為 4,181 bytes。文字 token 以每 byte 一個 token 高估。900×1000 原圖共有 `ceil(900/32)×ceil(1000/32)=928` patches，terra 係數 1.2，向上估 1,114 tokens。另預留序列化／訊息額外空間，將輸入整體高估至 9,000 tokens；包含 1.25 倍 cache-write 計價後，上界估算 `9000×2.5/1000000 + 1200×12/1000000 = US$0.0369`，低於核准額度。本請求不使用額外付費工具。
- 實際 API usage：input 2095、output 92、total 2187、cached input 0、reasoning 0。標準計價為 `(2095×2 + 92×12)/1000000 = US$0.005294`；回傳未區分 cache-write tokens，因此另列全部輸入按 1.25 倍計價的保守上界 `(2095×2.5 + 92×12)/1000000 = US$0.0063415`。OpenAI Usage 控制台切換到 POC 專案時瀏覽器控制逾時，未取得可確認的最終帳單金額；不引用其他 project 或舊月份的支出作為本次費用。
- 新 OpenAI project：`pika-sites-private-poc`／`proj_tvI8rtYQVJhSvkIbs9YCaToe`。建立表單已準備 key 名稱 `pika-sites-poc-ocr`、30 天有效期、Restricted，僅 Responses Write 與 List models Read；由使用者本人完成建立與秘密填入，已核對 Railway key 存在及專用 project 的模型存取成功。未讀取或取用舊 `Invoice OCR` project 的 Replit key，沒有綁卡、充值、升級或啟用新付費服務。
- 已套用並讀回的 Railway 服務端設定：`INVOICE_OCR_ENABLED=true`、`INVOICE_OCR_TEST_MODE=true`、`INVOICE_OCR_ALLOWED_CLERK_USER_IDS`（僅既有指定店主）、`OPENAI_INVOICE_MODEL=gpt-5.6-terra`、`OPENAI_INVOICE_COMPARE_MODELS`（空字串）、`INVOICE_OCR_REQUEST_TIMEOUT_MS=90000`。
- `OPENAI_API_KEY` 已設於指定 Railway API 後端並套用成功部署；設定前後差異只有此鍵名，沒有順手套用其他變數異動。`OPENAI_BASE_URL` 沒有覆寫。key 不在 Sites、`VITE_*`、Git、報告或本機金鑰檔。只開原有 terra 模型，歷史 schema／模型值不刪除。

## 環境与驗收資料

- Railway project：`pika-system-private-poc`／`de13e86c-9d70-4396-85be-79cd73cd412f`。
- environment：`production`／`143266a9-b10c-4dec-9b8f-f4eec9bec86a`，依實際用途確認為隔離 POC，並非 Replit production。
- API service：`pika-poc-api`／`1068b8cf-3623-4b85-a702-d7bb7b70080e`。
- PostgreSQL：同 project 私人網路 `postgres.railway.internal`、DB `pika_sites_poc`，不使用 production DATABASE_URL。
- 私有 bucket：`pika-sites-poc`，沿用上一輪專用、限 bucket 物件讀寫的 R2 憑證。沒有開 r2.dev、DNS 或公開 bucket。
- Sites：`appgprj_6ab69a6062348191809b743a5635f83e`；本輪重新讀回 policy revision 1：custom、唯一 owner、0 groups、0 editors、0 external visitors。
- 本輪前可工作的 Railway deployment：`1de6c71e-7df4-4d08-b8df-71ae9e8ca258`。
- 本輪前 Sites version：`appgprj_6ab69a6062348191809b743a5635f83e~appgver_eb1013f9b82c8191ac6e43b6587493a8`，來源 commit `62b8e1331ddd969e53c61041bac61d09936756f8`。
- 本輪 Sites 最終 version：`appgprj_6ab69a6062348191809b743a5635f83e~appgver_8ea889e5d9888191ae8224b91508b1b7`，專用產物來源 commit `d115706a4ec31b180d1d5da6ea341a8d8fef1357`，deployment `appgdep_6ab77fab55288191a2f703f535872d2d`，2026-09-26 08:18:03 UTC succeeded，env revision 2。使用 owner-private 部署操作，沒有改可見範圍。
- 前一個本輪中間版本 `c3de9ea52a97095d6ef6f07bee7577b1b32fd6d8` 已被上列深層路由修正版取代。原生 source workflow 確認 push；Windows npm／Bash 封裝 wrapper 失敗後，使用本站既有 build.mjs、官方 prepare-site-build.cjs 與 Windows tar 封裝同一份乾淨 checkout，再呼叫原生 PRIVATE 部署。封裝只含前端、Worker、hosting metadata，無 API secrets／Git／DB。
- 接線準備版本 Railway deployment：`7d305831-0a9d-4739-abc4-f6f95f69b3dd`，2026-09-26 07:45:01 UTC 成功。source snapshot SHA-256：`56d463234db123a0a56413ca053b83079e68abc4891f977351182be5e5a27335`；image digest：`91be15f25136640ebd75d8ecb6210dfe7c81ebbfbf4fe6c2ba5216c76e54f937`。可作為本次標準計價修改前的程式回復參照。
- **實際真驗收部署**：`b2cc6688-5545-4eb4-bafe-d8affeb09def`，2026-09-26 10:23:17 UTC 建立、已讀回 SUCCESS。乾淨來源 `.poc/api-source-N03W3l`；image digest `sha256:0376515e24fab42c7f2bcdd2ca4fc3417200f4df6acaf3e77bf56c95b63a5f4f`。start command 為 `node src/poc/start.mjs`，preDeployCommand 為空；沒有重播 initializer、改 schema 或執行 migration。
- 真 run ID `1`／case ID `1`，clientRequestId `6532e80e-c220-4e5e-adda-a609d5bb9ed4`。requested／actual model 均為 `gpt-5.6-terra`；request ID `req_dc75091ea0a04e2ca4360470f855daf5`；response ID `resp_03065e2dc4cf291d016ab79da8a1fc87d0bc88421929f1502c`。上述 provider 識別由私有 R2 的已驗證結果備份讀回，不是從 requested model 猜造。
- run 於 10:25:44.048 UTC 建立、10:25:47.440 UTC completed；provider latency 2550 ms，run 起訖 3392 ms。attemptCount 1、SDK maxRetries 0、可觀測重試 0；errorCode null。review 四欄機器比對皆 true，`reviewedAt` null。模型 `review_required=false` 只表示未標示額外疑慮，後台仍顯示「仍須人工確認」。
- 合成收據：`.poc/synthetic-ocr-receipt.png`，25,663 bytes；SHA-256 `6117332faf48d9a55cbdbed37f5bd7a50f33af43c3203bc03c83e091b70dc846`。人工手算基準：100.00＋23.45＝123.45 TWD。
- 雲端 case ID `1`、store ID `1`，建立時間 2026-09-26 07:47:16.234 UTC。R2 key：`invoice-ocr/1/6117332faf48d9a55cbdbed37f5bd7a50f33af43c3203bc03c83e091b70dc846`。正常授權上傳回 201；本次沿用該圖片，沒有重傳。結果備份為同 key 下 `runs/1.json`，與 DB 結果經 snake_case／camelCase 正常映射後四欄一致。
- 受控 restart 於 10:29:38 UTC 送出，Railway 10:30:30 UTC 出現新的 `Server listening` 日誌，部署回 SUCCESS。重啟後案例 GET 200，仍只有 completed 的 run 1、原 completedAt、attemptCount 1；圖片 GET 200、25,663 bytes、SHA-256 相同。ground truth amount 保持 `123.450000000000`，按既有規則在開始辨識後鎖定。這是部署中的 API 從測試 PG／R2 重讀，不是本機記憶體結果。
- 未登入讀圖及啟動辨識均回 401。未簽署的 R2 直接請求回 400，未開放匿名存取。沒有掃描或更動正式 bucket。

| 必驗欄位 | 合成圖片標準答案 | 真辨識結果 |
| --- | --- | --- |
| 店名 | PIKA TEST MART | PIKA TEST MART，正確 |
| 日期 | 2026-09-26 | 2026-09-26，正確 |
| 總額 | 123.45（100.00＋23.45） | 123.45，正確 |
| 幣別 | TWD | TWD，正確 |

## 自動驗證紀錄（持續更新）

使用本機隔離 Docker PG；測試用 Clerk、R2、provider fixture 只存在測試程序，不會部署為線上成功回應。

下列 Node 測試命令以 Linux 測試映像中的 `/workspace/artifacts/api-server` 為 cwd，掛載本輪差異，資料庫只連 `pika-sites-private-poc` Docker network 的測試 DB。本次没有對 Railway 或正式庫執行 fixture 測試／資料清理。

- 原商品／下單／查單 9 項、R2 5 項核心回歸：通過。
- OCR 核心 schema／請求／用量／POC 單次 attempt、安全測試及 Worker 轉送：通過。
- 新 OCR 路由：上傳保存、PG 關聯、指定店主拒絕測試、缺 key／缺圖／未允許模型、並行同 ID 防重、結果與圖片重讀：已通過。
- 第一輪 67 項：59 通過、8 失敗。問題為結果恢復使用 Zod v3/v4 混用，以及舊 multipart 測試繼承 POC 容器旗標。已使用既有 schema 的 `zod/v4`，並在舊路徑測試明確關閉 POC。
- 修正後受影響的 20 項全部通過（7 項新 POC OCR＋13 項既有路由）；其餘 47 項先前已通過且未受修改影響。沒有宣稱同一次 67/67 全跑。
- root `pnpm run typecheck` 最終回 0，所有 libs、API、shop-app、scripts、mockup 通過。前端 production build 回 0；存在原有 sourcemap／bundle size 提示，沒有建置錯誤。
- 深層路由修正後另外重跑 Worker 5 項，5/5 通過。線上合成商品 catalog 與店主 orders GET 均回 200，原 1 筆假訂單仍可讀取；未新增訂單、物流或金流副作用。
- Chrome 正常既有 Google／Clerk 登入後，商品管理頁顯示 2 個假商品及原 R2 商品圖片；送出前收據原圖確實完成解碼，naturalWidth／naturalHeight 為 900／1000。勾選合成照片確認後，只按一次「開始辨識」，畫面曾顯示「OpenAI 正在辨識」。
- 真辨識後 Chrome 顯示 AI 原始預測、四欄正確比對、actual model、2187 tokens、2.5 秒，以及「仍須人工確認」。一般刷新及受控 API 重啟後再刷新，皆讀回同一筆完成結果；辨識紀錄始終 1 筆。沒有按人工確認、保存人工修正或套用業務欄位。
- 真 provider → R2 安全結果備份 → 測試 PG run/review → 後台顯示 → 重啟後重讀：**通過**。重啟後再次檢查未登入讀取圖片、查詢結果及啟動辨識，全回 401；未簽署 R2 回 400。非指定店主拒絕由既有本機 fixture 測試覆蓋，未另建真人帳號。
- 小量線上回歸：catalog 200／2 商品、店主 orders 200／1 假單、該假單原 token 查單 200／總額 200；没有再建立訂單、金流或物流。再次查詢 OCR 仍為 run 1、attemptCount 1。
- 取得 US$0.05 授權後的追加檢查：固定 `service_tier: default` 並斷言 1200 output 上限，17 項 OCR 核心測試通過。首次安全測試因獨立容器漏掛載前端原始檔而 4 項失敗；補上唯讀掛載後，11 項安全測試全部通過。全程 `--network none`、沒有真 provider 請求。追加 root typecheck 最終 exit 0，libs、API、shop-app、scripts、mockup 全部通過；紀錄在 `.poc/checks/ocr-budget-typecheck-final.txt`。
- 乾淨來源 `.poc/api-source-N03W3l` 已明確指定既有 project／environment／API service，用 `railway up --path-as-root --detach --json` 部署一次；包含標準計價參數，不含 `.poc`／`.git`／本機秘密。沒有新建其他 Railway 專案或服務。

去密紀錄保存在 `.poc/checks/ocr-typecheck-final.txt`、`ocr-focused-tests.txt`、`ocr-worker-final.txt`、`ocr-frontend-build.txt`、`ocr-online-preparation.json`、`ocr-sites-deployment.json`、`ocr-final-preparation-proof.json`。本輪本機測試 PostgreSQL 容器已停止，volume 保留；線上不使用它。

本次真驗收補充：`.poc/checks/ocr-real-preflight.json`、`ocr-real-attempt.json`、`ocr-real-result.json`、`ocr-provider-checkpoint.json`、`ocr-final-integration-proof.json`。均不包含 key、cookie、DB 密碼、完整 data URL 或預簽 URL。最後一份含部署、重啟新日誌、回讀狀態、雜湊、用量與費用計算。

命令：

```text
docker compose -f sites/poc/compose.yaml run --rm tools run typecheck
node --experimental-test-module-mocks --import tsx/esm --test --test-concurrency=1
  src/lib/invoiceOcr/invoiceOcrCore.test.mjs
  src/lib/invoiceOcr/invoiceOcrSafety.test.mjs
  src/routes/invoiceOcr.route.test.mjs
  src/poc/privatePocOcr.integration.test.mjs
  src/poc/privatePocImages.integration.test.mjs
  src/poc/privatePoc.integration.test.mjs
  /workspace/sites/worker.test.mjs
```

## 保存與回復

- 修改前備份：`C:/Users/Lnovo/Documents/Codex-backups/SITES-OCR-20260926`，含既有檔案與 `before.diff`。原 Phase 1／Phase 2／R2 報告保留。
- 可先設 `INVOICE_OCR_ENABLED=false` 並重新部署停用 OCR；商品、訂單、圖片接線保留。測試旗標與指定店主設定不關閉。
- 若完整回到本輪前 R2 API 版本，該舊啟動器會拒絕 `OPENAI_API_KEY`，須先移除本輪 OCR key／設定再回復，不能只切 deployment 後假設會正常啟動。Sites 可部署上列既有版本。
- 不以刪除 bucket、圖片、run 或資料庫為 rollback；不撤銷正式服務的 token。
- 本輪未修改原正式 R2、Replit production、原 OCR 分支、main 或正式網域。分支／HEAD 再次核對與上述一致；main ref 仍為 `87b6eaaf2c08c85164e80b72a80f7246e2ebbbd9`。只有已核准的一次 API 用量，沒有新增付費啟用、充值、升級或改付款方式。

## 秘密設定與完成界限

用量授權及專用 `OPENAI_API_KEY` 均已到位。使用者本人透過一次性 `127.0.0.1` 密碼欄位完成秘密輸入；表單檢查 Host／Origin、限制請求大小、禁止快取與嵌入。金鑰只經記憶體與 Railway CLI stdin 設定到指定 API service，不寫本機金鑰檔、不回顯；設定後已讀回確認，並以新部署與真辨識驗證生效。

首次填入曾因 `no-referrer` 與 HTML form POST 的 Origin 檢查衝突而被拒，當時已查證 Railway 無 key、未送出 OCR。改為 `same-origin` 並保留其餘檢查，以假值 callback 驗證 Chrome 送出成功、異來源仍回 403；使用者再次貼入同一把 key 後已成功，沒有因表單錯誤重建憑證。

本輪已完成並停止，不再送出辨識或擴大整合。剩餘未驗證事項只有最終帳單金額、多樣收據準確率與人工複核；這些不冒充已通過。正常可用的專用 key、私有圖片、run／review、R2 結果備份及部署版本保留。物流繼續 fixture，沒有真金流、正式圖片搬移或公開發布。
