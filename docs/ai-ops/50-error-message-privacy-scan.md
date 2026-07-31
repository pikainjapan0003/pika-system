# API 錯誤訊息與日誌個資掃描

掃描日期：2026-07-31  
範圍：`artifacts/api-server/src/**/*.ts`，排除 generated 與測試檔  
性質：唯讀盤點；本報告不修改回應、日誌或執行期行為

## 結論

明確寫在 4xx／5xx HTTP 回應裡的固定文案，未發現姓名、手機、地址、token、SQL 或檔案路徑直接外送。API request logger 也刻意只記不含 query string 的 URL，並遮蔽 authorization、cookie 與 set-cookie。

但目前多個錯誤路徑會把原始 `Error` 物件直接寫進 server log。Drizzle／PostgreSQL 的錯誤物件可能包含 SQL、參數與 stack 絕對路徑；若參數是姓名、手機或地址，明文會進入日誌。因此「對 HTTP 客戶端安全」不等於「對營運日誌安全」。

## 方法與數量

- 靜態掃描 263 個 `.status(4xx|5xx)` 呼叫點。
- 靜態掃描 31 個 `req.log`／`logger`／`console` 的 error、warn、info 呼叫點。
- 另查 38 個把 `parsed.error.message`／`error.message`／`err.message` 帶入路由回應的動態訊息點。
- 逐一檢查 request serializer、logger redaction、全域 error handler 與所有 raw-error log 呼叫。
- 本掃描不向 production 發請求，也不讀 production log 或資料庫。

## Findings

### P1：原始資料庫／第三方錯誤物件會進入 server log

代表位置：

- `artifacts/api-server/src/app.ts:86`
- `artifacts/api-server/src/routes/stores.ts:22,65`
- `artifacts/api-server/src/routes/agent.ts:176,365,372,536,676`
- `artifacts/api-server/src/routes/sellerAgent.ts:163,384`
- `artifacts/api-server/src/routes/exchangeRateReference.ts:19`
- `artifacts/api-server/src/routes/internalLogisticsSync.ts:108,170`
- `artifacts/api-server/src/routes/logisticsSync.ts:67,124,340,416,705,903,932,970,1071`
- `artifacts/api-server/src/routes/orders.ts:1617`
- `artifacts/api-server/src/lib/logistics/workers/manualSnapshotRefreshWorker.ts:150`

這些位置使用 `{ err }`／`{ error }` 或 `console.error(..., err)` 記錄完整錯誤物件。PostgreSQL／Drizzle error 可攜帶 query、params 與 stack；params 可能是訂單或客戶輸入，stack 會含部署機器的絕對路徑。

影響：日誌平台、除錯匯出或截圖可能保存個資、SQL 與內部路徑。這不是公開 API 回應洩漏，但違反「日誌不記明文個資／SQL／路徑」的目標。

建議最小修法：新增共用 `sanitizeErrorForLog(error)`，只保留 allowlist（例如 error 類別、受控 code、HTTP status、固定 operation 名稱），禁止記 `query`、`params`、`stack`、request body 與 headers；以單元測試餵入仿 Drizzle error，斷言序列化後無 SQL、手機、token、路徑。此修正應獨立成安全包，不在本唯讀包內動碼。

### P2：全域 error handler 對任何 4xx error 直接回傳 `err.message`

位置：`artifacts/api-server/src/app.ts:85-90`

5xx 已固定回 `Internal server error`，但只要任一套件或 middleware 丟出的錯誤帶 `status`／`statusCode < 500`，其原始 message 就會被回給客戶端。現有已知路由多數會自行處理錯誤，因此本輪沒有找到可直接重現的個資洩漏；風險在未來新增 middleware 或套件錯誤時出現。

建議最小修法：全域 handler 的 4xx 也只接受本系統明確標記的 public-safe error 類型／code，其他一律回固定 `Bad request`；加一條整合測試，讓 error 同時含手機、SQL 與 Windows／Linux 路徑，斷言 response 與 log 的安全版本皆不含原文。

### P3：失敗的 Agent token 會記錄 token hash 前 8 碼

位置：`artifacts/api-server/src/middlewares/agentAuth.ts:59-64`

這不是明文 token，且註解明確禁止 raw token；8 hex 只提供 32-bit 診斷前綴。現況可接受，但若日誌公開範圍擴大或威脅模型提高，建議改為每次請求產生的 correlation ID，完全不留下 token 衍生值。

## 已確認安全的防線

- `artifacts/api-server/src/app.ts:29-40` 的 request serializer 只留 request id、method 與移除 query string 的 URL，不記 body、query、headers 或 IP。
- `artifacts/api-server/src/lib/logger.ts:6-10` 明確遮蔽 authorization、cookie 與 set-cookie；但此 redaction 不會自動清洗巢狀 `err.query`／`err.params`，因此不能解掉 P1。
- 明確 5xx response 使用固定錯誤碼／文案；掃描未見直接把 raw exception、SQL 或 stack 放入 5xx body。
- 店主 CSV 匯出 info log 只記 action、storeId、mode、count；不記 CSV 內容、姓名、手機或 token（`customers.ts:428-430`、`orders.ts:315-321,1659-1662`）。
- Agent auth 401 body 只回固定 code／message，從未回傳 token 或 hash 前綴。
- Zod／解析器錯誤回應主要暴露欄位規則與 enum，而非 request input；仍建議未來以受控 code 取代完整 parser message，降低 schema 枚舉面。

## 建議處理順序

1. 先解 P1：共用安全 error logger，替換 raw-error log 呼叫，補反洩漏測試。
2. 再解 P2：建立 public-safe error 類型，收緊全域 4xx message。
3. 最後視威脅模型決定是否移除 token hash 前綴。
