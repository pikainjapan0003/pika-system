# 發票 AI 辨識第一階段：新手操作說明

這份文件只說明第一階段的測試功能。目標是先用 10 張不同商家的發票，確認 AI 能不能正確讀出店名、日期、總額和幣別。

## 先看目前狀態

### 已經在本機專案完成

- 已建立「發票 AI 辨識測試」頁面與後端程式。
- 已限制一次只能處理一張 JPG、PNG 或 WebP 圖片，最大 12 MB。
- 已限制只有指定的 Clerk 帳號可以使用。「Clerk」是目前網站用來確認登入身分的服務。
- 已準備獨立的發票測試資料表與回復檔案，不會把 AI 結果直接寫進正式訂單、成本或利潤資料。
- 圖片只會短暫留在瀏覽器預覽和後端記憶體，不會永久存入 PostgreSQL 或 Replit 本機磁碟。
- RapidOCR 舊測試工具沒有被刪除或替換。

「本機專案完成」只代表程式檔已經寫在目前的本機 Git 分支，測試結果仍要以工程驗證回報為準，不代表正式網站已經更新。

### 還沒有做

- **尚未發布或 Republish 正式網站。**
- **尚未在開發或正式資料庫執行 migration。**「migration」是有紀錄地新增或修改資料庫欄位的方法。
- **尚未呼叫真實 OpenAI API，所以目前沒有使用真實 Token，也沒有產生這項 API 測試費用。**
- **尚未上傳或使用真實發票照片。**
- **尚未處理 Google Drive 的 137 張發票。**第一階段只測 10 張。
- 尚未把 AI 結果接到正式入帳流程。

## Replit Secrets 不是 Replit AI

這次不需要使用 Replit AI，也不需要在 Replit Agent 裡對話。

「Replit Secrets」只是 Replit 裡保存密碼和 API Key 的保險箱。手動把設定放進 Secrets，不等於使用 Replit AI，也不會因為這個動作產生 Replit AI 對話費用。

未來辨識一張發票時，可能產生的是 OpenAI API 用量；網站在 Replit 執行仍可能有一般主機用量。這兩者都和 Replit AI 對話費用不同。

## 一張發票會怎麼走

```text
你登入網站
  ↓
選一張發票，先填人工正確答案
  ↓
人工答案保存到「發票測試專用資料表」
  ↓
你按下開始辨識
  ↓
後端只把圖片＋固定辨識規則送給 OpenAI
  │
  └─ 人工正確答案不會放進 OpenAI 請求
  ↓
OpenAI 回傳四個預測欄位、複查提醒、Token 和處理時間
  ↓
結果保存到「發票測試專用資料表」，並和人工答案比較
  ↓
你看原圖逐欄確認；需要修改時另存人工修正值
  ↓
可以下載不含圖片、API Key 或完整發票文字的 CSV 報告
```

AI 的預測值保存後不能被覆蓋。人工修正會另外保存，方便之後公平比較模型。

## 第一階段需要的環境變數

「環境變數」是放在伺服器設定裡的文字，不必寫死在程式碼。

| 名稱 | 第一階段建議值 | 白話用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 只放專用 Key | OpenAI API 的密碼，只能放在伺服器 Secrets。 |
| `OPENAI_INVOICE_MODEL` | `gpt-5.6-terra` | 預設先測 Terra。 |
| `OPENAI_INVOICE_COMPARE_MODELS` | `gpt-5.6-sol,gpt-5.6-luna` | 允許之後手動比較的模型，不會自動一起呼叫。 |
| `OPENAI_INVOICE_IMAGE_DETAIL` | `original` | 優先保留小字辨識需要的原圖細節。 |
| `OPENAI_INVOICE_REASONING_EFFORT` | `low` | 第一輪固定使用低推理量，方便公平比較。 |
| `INVOICE_OCR_REQUEST_TIMEOUT_MS` | `90000` | 最長等待 90 秒；超時後前端不會一直轉圈。 |
| `INVOICE_OCR_ENABLED` | 一開始 `false` | 總開關。確認開發資料庫與設定安全後，測試環境才改成 `true`。 |
| `INVOICE_OCR_TEST_MODE` | `true` | 保證目前只開測試模式。 |
| `INVOICE_OCR_MAX_FILE_MB` | `12` | 單張圖片最大 12 MB。 |
| `INVOICE_OCR_ALLOWED_CLERK_USER_IDS` | 你的 `user_...` | 只允許你自己的 Clerk 帳號；多個 ID 才用逗號分開。 |
| `DATABASE_URL` | 沿用開發資料庫設定 | 資料庫連線密碼；不是新增的 OCR 設定，也不能顯示或貼到聊天。 |

不要把上述伺服器秘密命名成 `VITE_...` 或 `REACT_APP_...`，因為這類名稱可能被打包到瀏覽器。`.env.example` 只能留空白範例，不能放真實 Key。

## 你要在 OpenAI Platform 手動做的事

OpenAI 頁面文字偶爾會調整，但原則不變。

1. 登入 [OpenAI Platform](https://platform.openai.com/)。這是 API 管理頁，不是一般 ChatGPT 對話頁。
2. 到 Settings 或 Projects，新增一個 Project，名稱可填 `Invoice OCR`。
3. 到 Data Controls 的 Sharing 設定，選擇「只對指定 Project 開啟」，並只選 `Invoice OCR`。
4. 確認你理解：為了取得符合資格的每日免費 Token，這個 Project 的 API 輸入與輸出會和 OpenAI 分享。測試照片應避免敏感個資。
5. 到 Billing 確認目前仍有正餘額。以前儲值過 US$5，不代表現在一定還有餘額。
6. 建議關閉不需要的 Auto-recharge，或設成很低的加值金額；同時設定低預算與用量提醒。提醒可能不是強制斷電開關，仍要自己查看 Usage 和 Costs。
7. 在 `Invoice OCR` Project 裡建立一把專用 API Key。
8. Key 通常只完整顯示一次。直接貼到 Replit Secrets，不要貼到 ChatGPT、Codex、Replit AI、GitHub 或程式碼。

免費 Token 是否適用，要以當天帳號資格、Project 的資料分享設定、正餘額，以及 OpenAI Usage／Costs Dashboard 為準。程式和畫面都不能保證「這次一定免費」。

程式請求會使用 `store: false`，但這不等於關閉 Project 的資料分享。是否分享仍由 OpenAI Platform 的 Data Controls 決定。

## 你要在 Replit 手動做的事

以下操作不需要打開 Replit AI：

1. 打開這個 Replit 專案的 Workspace。
2. 在左側 Tools 找到 `Secrets`，通常是鎖頭圖示；找不到可用 Tools 搜尋 `Secrets`。
3. 逐一新增上一節中以 `OPENAI_` 或 `INVOICE_` 開頭的設定。`OPENAI_API_KEY` 的值只貼在 Secrets 欄位。既有的 `DATABASE_URL` 只核對，不要在這一步新增或改寫。
4. 到 Clerk Dashboard 的 Users 找到你自己的帳號，複製以 `user_` 開頭的 User ID，填進 `INVOICE_OCR_ALLOWED_CLERK_USER_IDS`。不要用 Email 代替。
5. 在資料庫尚未確認、migration 尚未完成前，保持：

   ```text
   INVOICE_OCR_ENABLED=false
   INVOICE_OCR_TEST_MODE=true
   ```

6. 等開發資料庫完成 migration 且安全檢查通過後，才在**開發環境**把 `INVOICE_OCR_ENABLED` 改成 `true`。
7. Secrets 變更後可以重新啟動開發 Preview。這不代表 Republish，也不要按正式部署按鈕。

不要把 API Key 放進前端設定，也不要把完整 Secrets 截圖貼到聊天。

## 先確認開發資料庫不是正式資料庫

你已說明 Replit 的開發展示和正式網址各有一個資料庫；在執行 migration 前，仍要再核對一次實際連線，避免設定被改過。

最安全的做法是請工程人員在「開發資料庫」和「Production 資料庫」各執行一次下面這段**只讀查詢**：

```sql
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  inet_server_addr() AS server_address,
  inet_server_port() AS server_port;
```

接著確認：

- 開發與 Production 顯示的資料庫身分不是同一個。
- 目前 Shell 的 `DATABASE_URL` 明確指向開發資料庫。
- 已有備份或可回復點。
- `INVOICE_OCR_ENABLED=false`。
- 若看不懂結果、兩邊相同，或任何一項無法確認，就先停下來，不執行 migration。

不要執行 `echo $DATABASE_URL`，因為它可能把完整資料庫密碼顯示在畫面或 Log。

確認是開發資料庫後，工程人員才可在 Replit Shell 手動執行：

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/0041_invoice_ocr_benchmark.sql
```

如果環境沒有 `psql` 指令，請停下來處理工具問題，不要改用不明指令，也不要用 `push-force`。

這份 migration 只新增三張測試表：

- `invoice_ocr_test_cases`
- `invoice_ocr_runs`
- `invoice_ocr_reviews`

它不應修改訂單、成本、採購或利潤資料表。**截至本文件建立時，這份 migration 尚未被執行。**

## 第一次 10 張基準測試

「基準測試」是用固定的 10 張圖片和固定設定，公平比較不同模型。

### 先準備照片

- 10 張必須來自 10 個不同商家，不要只挑最清楚的照片。
- 可參考中文 4 張、日文 3 張、英文 3 張，再依實際發票比例微調。
- 至少包含一張歪斜或光線較差、一張長收據、一張有小計／稅／折扣／付款／找零，以及一張幣別符號容易混淆的照片。
- 優先選沒有姓名、電話、卡號或地址等敏感資料的發票。
- 若需要遮住非必要個資，另外做一份測試副本，不要改原始照片。
- 格式使用 JPG、PNG 或 WebP，每張不超過 12 MB。HEIC 先轉成 JPG。
- 每張先由人確認店名、日期、總額和三碼幣別，例如 `TWD`、`JPY`、`USD`。

### 每張照片的操作

1. 登入開發 Preview，不要進正式網址。
2. 從設定頁進入「發票 AI 辨識測試」，網址路徑是 `/settings/invoice-ocr`。
3. 閱讀資料分享提醒，確認這張照片可以傳給 OpenAI 後再勾選。
4. 選擇一張照片，檢查畫面預覽是否清楚且方向正確。
5. 填入人工確認的店名、日期、總額和幣別。
6. 按「保存人工正確答案」。保存後才可以開始 AI 辨識。
7. 第一輪保持 `gpt-5.6-terra`，按「開始辨識」一次。
8. 等待顯示完成或明確錯誤，不要重複按按鈕。
9. 對照原圖，逐欄確認 AI 預測；若要修改，存成另外的人工修正值。
10. 重複以上步驟，直到 10 個不同商家完成。
11. 下載 CSV，確認報告沒有圖片、Base64、API Key 或完整發票文字。

先只測 Terra。只有真的需要比較時，才用相同 10 張、相同圖片細節、相同推理設定與相同提示詞版本，手動選 Sol 或 Luna 重跑。看到某一張答案後，不可只為那張修改提示詞再混入同一組成績。

第一階段門檻是：店名至少 8/10，日期、總額和幣別各至少 9/10，10/10 都能產生合格格式；只要 AI 填錯卻沒有標示複查疑慮，該模型就不能通過。

## Token 和費用怎麼看

「Token」是 API 計算文字與圖片處理量的單位，不等於固定台幣金額。

- 每次結果會記錄輸入 Token、輸出 Token、總 Token、模型與處理時間。
- 單次 API 回應不能證明最後一定套用免費 Token。
- 免費方案、模型價格與資格可能改變，不會寫死在程式裡。
- 真正費用以 OpenAI Usage 和 Costs Dashboard 為準。
- 暫時性網路或伺服器錯誤最多可能自動重試一次；重試也可能再次消耗 Token。
- 同一張圖重跑同一模型前會要求確認，舊結果不會被覆蓋。
- 完成 10 張後，才能依實際 Token 粗估 137 張，不用理論值猜費用。

## 發布正式網站前檢查表

這一節是未來要發布時使用，現在不要發布。

- [ ] 本機 typecheck、測試與 production build 都有實際結果。
- [ ] 自動測試只用假的 OpenAI 回應，沒有花真實 Token。
- [ ] 開發資料庫已確認和 Production 分開。
- [ ] migration 只在開發資料庫成功執行並檢查三張新表。
- [ ] 真實 API Key 只存在 Replit Secrets，Git 和 Log 都找不到。
- [ ] 只有自己的 Clerk User ID 在允許名單。
- [ ] 開發 Preview 能正常拒絕未登入或非允許帳號。
- [ ] Ground Truth 不會出現在 OpenAI 請求。
- [ ] 圖片、Base64、完整 API 回應和敏感錯誤不會寫入 Log。
- [ ] AI 結果只寫入 `invoice_ocr_*` 測試表，不會進正式帳務表。
- [ ] 10 張 Terra 測試結果與嚴重錯誤數已人工確認。
- [ ] OpenAI Usage／Costs、餘額、Auto-recharge 和提醒已再次確認。
- [ ] 已準備資料庫備份與 rollback 方法。
- [ ] 由你明確同意後，才可執行 Production migration 與 Republish。

## 需要關閉或回復時

最先做的是把伺服器設定改為：

```text
INVOICE_OCR_ENABLED=false
```

重新啟動對應的執行環境後，這會停止新的發票 API 呼叫。若只是暫停功能，不需要刪除資料表。

程式回復應使用正常的 Git revert 或回到先前已驗證版本；不要用 `git reset --hard`。正式網站是否重新發布，仍要由你另外同意。

資料庫 rollback 會**永久刪除三張發票測試表及其中的測試結果**，所以只有在確認資料不需要或已備份後才能執行。它不應刪除正式訂單、成本或利潤表。工程人員確認目標資料庫後才可執行：

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/rollback/0041_invoice_ocr_benchmark_rollback.sql
```

若不能百分之百確認目前連到哪個資料庫，就不要執行 rollback。

## 官方資料

- [OpenAI 模型總覽](https://developers.openai.com/api/docs/models)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [圖片與 Vision](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [API 資料分享與免費 Token 說明](https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai)
- [預付 API Billing 說明](https://help.openai.com/en/articles/8264644-how-can-i-set-up-prepaid-billing)
- [OpenAI Usage Dashboard](https://platform.openai.com/usage)
- [OpenAI API 價格](https://openai.com/api/pricing/)

最後提醒：如果官方文件和目前設定不同，以官方當下文件為準，先停下來確認，不要偷偷換模型、降低圖片細節或改用舊 API。
