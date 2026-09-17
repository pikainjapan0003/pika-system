# Phase 7–8 r1：配對預覽 HTTP query

修正 `DB78-LISTING-PAGE-QUERY-TYPE`：瀏覽器送出 `?page=1`，原產生的數值 schema 拒絕 HTTP 字串而回傳 400。

`listingMatchQuery.ts` 僅將標準正整數字串轉成 1–100000 的整數。缺省 page 保持原 API 預設 1；空值、零、負數、小數、超界、文字、重複值陣列、物件均拒絕。保留原鍵供嚴格物件 schema 拒絕未知參數。其他 Catalog 操作不套用此轉換。

Orval 8.9.1 產生 query preprocess 時實際讀取 response mutator，因此設定仿照現有 path workaround，單獨產生此操作的 query，再保留原 path/body/response。所有 generated 檔均經正式 Orval 產生，不手改。

新增 API 回歸以實際 HTTP 驗證至少 26 筆資料的第 1、2 頁、缺省及最大頁、17 種非法 query（包含編碼的尾端換行），並比對全部 public 表資料沒有寫入。390/1440 上架配對 UI 額外核對實際 page=1 HTTP 200，保留完整 XLSX 流程和既有斷言。

主控於 DB78-R1-20260916 契約另批准 harness 新增精確 `product-database-resume-20260916/phase78-author-r1`、`phase78-verifier-r1` 根與 r1 容器名；保留 r0 路徑、127.0.0.1、image digest、dump hash、label、精確 container ID 及 legacy 保護。只建立新的合成資料庫。

實際命令、成功／失敗、產物指紋與服務關閉證據交付於外部 `C:/Users/Lnovo/Documents/Codex-backups/product-database-resume-20260916/phase78-author-r1/FINAL_REPORT.json`。作者自測不等同獨立驗收通過。
