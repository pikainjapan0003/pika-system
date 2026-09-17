# Phase 7 — 既有上架人工配對

範圍：DB-BUILD-07-08 r0；只在獨立工作樹與一次性合成資料庫實作／驗證。正式資料、母工作樹、提交與部署不在本批授權。

`GET /api/stores/:storeId/listing-matches/preview` 分頁提供名稱、一般／VIP 售價、legacy 有效日幣成本、原價、重量與來源、Route、SKU、listing-local 真實條碼及相關訂單數。new g 優先；legacy kg 精確乘 1000 並明示精度限制。真實條碼取 current pricing snapshot；SKU 不代替 barcode。原價缺失不以折後成本補，NONE 只可人工明確確認。

訂單數計算 distinct order：存在 order_items 時只看該表；否則依 legacy items JSON，再退回 scalar product_id；不按件數、不把雙寫重複計算。這是相關訂單數，並非正式成交均價。

`POST /api/stores/:storeId/listing-matches/apply` 逐列 LINK／CREATE／IGNORE，所有 checkbox 初始為 false。CREATE 要求人工確認必填值；LINK 只能本店；已連結商品不能另建或任意改連結。requestKey 綁定 input hash 並保存 append-only listing_match_actions；相同 request 回傳相同結果、異內容拒絕。store-first lock 與單一 transaction 保證同批原子性。

操作只修改 listing 的 catalog link；不覆寫舊價格、成本、訂單或 pricing snapshot，不替旧 completed 訂單回填 catalog 或回溯歸屬成交統計。新訂單才擷取當下 link。

入口 `/product-database/matches`；390／1440 使用同一流程，顯示缺資料、測試品提示與配對衝突；人工輸入遇錯保留。永久商品、上架和訂單快照仍為三個不同層次。

驗證來源：`reviewedImports.phase78.test.mjs` 及 `e2e/product-import.spec.mjs`。作者實測結果、固定 source hash、截圖、原欄位保留與程序關閉證據在外部 phase78-author-r0 交付包；本文件不是獨立 PASS 聲明。
