# 新 owner endpoints 安全檢查

日期：2026-07-31  
範圍：購物金 owner API、賣貨便匯出、包貨勾選。  
本包只確認全域安全標頭接線與提出限流建議，不新增任何限流規則。

## 安全標頭

三類 endpoint 都經過真實 `app.ts` 組裝的 middleware 鏈。整合測試以未登入請求確認：

- 購物金 GET：401
- 賣貨便匯出 POST：401
- 包貨勾選 POST：401
- 三個回應皆帶 `Referrer-Policy: no-referrer`
- 三個回應皆帶 `X-Content-Type-Options: nosniff`

這能鎖住 `configureSecurityHeaders(app)` 必須在 auth 與 routes 前生效，而不只是單測 helper。

## 現行限流盤點

- 公開建單與公開追蹤已有 route-specific limiter（`routes/public.ts:26-46`）。
- upload 另有上傳 limiter（`routes/upload.ts:39`）。
- 本次三類 owner endpoints 沒有獨立 limiter。
- 這些 endpoint 都有 Clerk auth 與 store-owner 驗證，因此風險低於公開建單，但仍可能被已登入帳號誤操作或自動化重試放大。

## 建議

### 購物金 POST：建議新增嚴格 mutation limiter

理由：直接寫入金額帳本，雖有確認 header、idempotency 與交易鎖，仍應限制單一 actor／store 的短時間大量操作。建議之後另開金額安全包，先蒐集正常操作量，再拍板窗口與上限；不得在本包猜數字。

### 賣貨便匯出 POST：建議新增中等 export limiter

理由：會讀取並回傳多筆明文個資，也寫 audit。可按 actor＋store 限制重複匯出，並保留目前 500 筆上限與雙確認。具體速率需依日常出貨批次決定。

### 包貨勾選 POST：暫不加嚴格 limiter

理由：包貨時會連續逐項點擊，過低限制會傷害正常操作；目前有 auth、owner、itemKey 長度與訂單狀態防線。建議先觀察每分鐘峰值，再決定是否採較寬鬆 limiter 或前端批次送出。

## 不建議

- 不可共用公開建單的 IP limiter 直接套在 owner 操作；同一店鋪可能有 NAT，共用 IP 會誤傷。
- 不可只按可偽造 header 限流。
- 不可在 rate-limit key 或 log 中放姓名、手機、publicToken、shareToken。
- 不可用限流取代現有 auth、owner、confirmation、idempotency 或 DB constraints。
