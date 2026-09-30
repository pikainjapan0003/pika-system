# Phase 8 — 單分頁来源審核與可回復匯入

## 來源與欄位

接受真實 multipart XLSX bytes 或明確標記 STRUCTURED_CELLS。XLSX 先列出分頁，由人選唯一分頁，未選不建立批次。A 停售、B 條碼、C 名稱、D 日本原價、E 重量 g、F 有效成本、G Route、M 運費來源參考、R 蝦皮觀察價；W／X／AC／AL 僅歷史來源參考，永不進正式成交統計。

原始儲存格型態、row／column、原值、公式、cached value、標題留存，不執行公式或讀外部工作簿。文字條碼保留前導 0；超安全整數 numeric 條碼必須人工修正。金額使用精確十進位字串，XML numeric lexeme 避免先經 Number 失真；D 與 F 永遠分離。缺值不得以 0 假補；NONE 必須明確人工确认。

Worker 在 ExcelJS 整份載入前檢查 ZIP 結構、CRC、實際解壓量及 XML：原檔 2 MiB、128 entries、總解壓 12 MiB、單 entry 4 MiB、8 sheets、500 rows、64 columns、10,000 cells、文字 4,096、公式 2,048 字元；禁加密、ZIP64、DTD／entity、路徑穿越／重複 entry。XML 深度40、nodes50,000；worker 12秒截止，old generation 128 MiB。只解析本地 bytes，無 eval 或來源網路存取。

原始 XLSX SHA256、所選分頁 canonical SHA256、審核計畫 SHA256 分開保存。未選分頁變動可改原檔 hash 而不改選定分頁 hash。上傳副本無法證明 live Sheet 新鮮度，source metadata 明列 UNVERIFIED；未接 Google credentials。

## 六個真實 API 與交易

Store-scoped `/sheet-imports/preview`、`/:batchId`、`/:batchId/resolve`、`/:batchId/approve`、`/:batchId/commit`、`/:batchId/rollback` 全部掛在正式路由。授權先於 multipart。OpenAPI 與 Orval 生成型別／Zod 同步；multipart 檔案由 Multer 限制，metadata 由同一生成 validator 檢查。

Preview 原始來源不可變。Resolve 保存人工 LINK／CREATE／IGNORE、理由及確認值；任何列或 FX 更動使 APPROVED 失效並增加版本。Approve 要求所有 PRODUCT 已決定、正匯率與當前 reviewVersion；approval 綁定 source、row resolution 及 FX。Commit 再驗證全部 hash／version，在 store-first lock 的單交易追加 catalog／cost／觀察價、effect mapping、audit；重送 COMMITTED 不重複寫入。相同批次多列 LINK 同一商品拒絕，避免不明確的成本回復鏈。

Rollback 先全批檢查後續商品變更／上架／order_items／pricing snapshot／成本／其他 import 引用，以及先前 current 是否仍 ACTIVE；任一 blocker 回409且全批不變。可安全回復時 VOID 本批成本、恢復先前 active current、ARCHIVE 本批新建商品、VOID 本批蝦皮觀察；不刪任何歷史。COMMITTED／ROLLED_BACK 原始資料、列與審核內容不可再改。

0045 migration 為 additive：新增來源與批准欄位、sheet_import_effects、sheet_import_audit、listing_match_actions 及不可變／狀態 trigger。Down 只在不存在本功能持久歷史時允許；主／兼容合成資料庫需 up→down→up 並比對原本16筆資料所有原欄位。

## 操作與交付驗證

`/product-database/import` 提供 upload→選分頁→逐列審核→保存正 FX→批准→執行／安全回復；每頁10列、44px 主要操作、鍵盤、錯誤保留輸入。商品詳情另有 Sheet 來源參考區。正式來源寫入需另有 Owner 授權；本批實際 commit／rollback 只用合成資料。

重現使用新增 `e2e/product-import-harness.mjs`；只接受 phase78-author-r0／phase78-verifier-r0 證據根。外部 delivery-target 提供固定 source／assets 驗证與 API／browser runner，不覆寫既有 phase5／6 harness。依序 source freeze→當前 production build→API→Chromium UI／回歸；重型編譯与瀏覽器互斥。作者報告另列每次失败、source delta、native exit、hash、實看截圖與PID／creation epoch／port／profile／container closure，獨立驗證另行判定。
