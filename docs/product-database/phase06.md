# Phase 6：訂單品項、成本捕捉與正式成交

本階段讓 Catalog、Listing 與一次性品項進入真正的 `order_items`。一次性品項不需要假 Catalog 或 Listing；`orders.product_id` 可為空。舊 `orders.items` 與單品欄位仍可讀取，新 reader 優先使用正式品項。

## 寫入與成本

- `POST /api/stores/:storeId/catalog-orders`：同店客戶身分由伺服器判定；Listing 售價依該身分決定，Catalog／一次性品項使用明確輸入的售價。可選另存 Catalog 與初始成本在同一交易完成。
- `POST /api/stores/:storeId/orders/:orderId/items/:itemId/capture`：只補合法 PENDING 品項，使用同一計價 resolver、同一交易 executor。
- 每品項保存數量、精確售價／小計、規格、客群／價格來源、完整費用／成本／利潤、公式／設定版本與捕捉條件。`capturedAt` 使用資料庫真實時間，與建立及完成時間分開。
- EXEMPT 只免交通攤提，其他必要成本不能缺少。PENDING 可以先保存，但全部品項完整之前不得完成訂單。
- 已捕捉單位價格、成本與利潤不受現行 Catalog、FX、費率或完成操作影響。第一次完成前單品數量可改，品項及相容摘要原子更新；多品項非財務編輯不傳整單 scalar quantity。

## 完成、庫存與刪除

每次進入／離開 completed 追加不可變完成／反轉事件。重送相同狀態沿既有 422／no-op 行為，重完成不重複計入成交；未知舊完成時間不以建立日期補造。完成過的訂單重開後仍禁止改歷史數量與價格；保留原數量的聯絡資料修改可保存。

店家開單不扣庫存；public 單品／cart 扣有追蹤的庫存，null 保持 null，改狀態不補庫存。store 先鎖、Listing 依 ID 排序鎖定，重複 cart 品項累計檢查，失敗整筆回復。

原 shipped／completed／tracking／credit 刪除限制保留。有完成歷史不能刪；無引用且可安全刪除的誤建訂單，在同一交易內清理品項及訂單。

## 成交與 reader

`catalog-sales?ids=…` 批次讀取目前 completed 訂單最新真完成事件，依品項捕捉的 Catalog 及 general／VIP 分組。顯示總件數、最低／最高、數量加權均價、最近售價及同一筆最近單位利潤。wholesale／partner 保持不同客群，不混入兩組統計。詳情的目前成本重算另外標示，不改歷史。

`staleSaleDays` 預設 180 並可保存；無可靠日期顯示未知。上架 VIP 支援跟隨一般價、最近正式 VIP 成交與人工輸入，沿用既有店鋪／表單非同步保護。

Orders、編輯、撿貨、報表、訊息、真銷貨單與公開追蹤使用品項明細。公開品項只有七個銷售欄位，不帶內部成本、FX、利潤或客群。一般 CSV 保留原 20 欄順序及每單一列，尾端追加「品項明細」「整單完整成本」「整單完整淨利」，多品項售價明確標示見明細，缺成本不補零。賣貨便仍須符合原配送、門市、取件人與溫層規則。

## 遷移與驗證

公開追蹤的 `orderTotal` 依已保存 `payableAfterCredit`（包含真正零元）、已確定 `orderTotal`、最後舊單商品加運費減折扣的優先序顯示；舊單回退採精確小數且不低於零，不回填新快照。公開 DTO 不增加購物金帳本、付款內部資料或成本欄位。新增／編輯訂單使用可見 SheetTitle；建立、儲存與取消操作至少44px，維持原表單及多品項語意。r2的API/UI回歸與原Catalog180秒單項結果分開記錄於本輪外部證據，不把前輪逾時改寫為通過。

Catalog Shell 的焦點可視性保護在 pointer 按下期間不強制捲動，避免取得焦點後按鈕移走、pointerup落到別處；放開／取消pointer或切換鍵盤後仍採原viewport與footer安全範圍。1440px原始事件曾記錄81px位移及click遺失；修正前後的同入口pointer證據與鍵盤回歸另列，不以此推論歷史Catalog CRUD逾時根因。

`0044_order_items_capture.sql` 增加成本完整性與不可變 guard、完成事件 trigger 及必要欄位／索引。對應 rollback 只適用尚無本階段訂單／捕捉／歷史的資料庫；有資料時安全拒絕，不刪歷史達成回復。正式資料 migration 沒有在本批執行。

測試只用 `e2e/product-order-harness.mjs` 新建且核對標籤、digest、loopback 的 DB-BUILD-06 隔離庫。main／compat 原資料全欄比對、API／DB 負向案例、370／265／105／6 混單、一般／VIP 加權案例及 browser 證據見外部 `phase6-author-r0/author-report.md`。Clerk 使用合成驗證替身，手機寬度是 Chromium 視窗；作者自測不等於獨立驗收、正式 Clerk、正式匯入或真手機相機驗證。
