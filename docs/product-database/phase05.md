# Phase 5：上架計價與商品資料庫整合

施工批次 DB-BUILD-05 r0。唯一施工根為 pika-product-database-v1，沿原計畫 Phase 5；本文件不是獨立驗收或完整 v1 通過宣告。Phase 6 正式成交／VIP 歷史、Phase 7–8 匯入及 Phase 9 相機掃碼仍在後續範圍。

## 保存與精度

- 0043 是新增遷移，0041／0042 不修改。products 新增五個可空值欄位：weightGrams、originalPriceJpy、effectiveCostJpy、pricingTemplateId、internationalShippingProfileId；模板與運費以 storeId 複合外鍵限制。
- 不回填舊上架。克重以 numeric(12,2) 為準，JPY 原價／有效成本為 numeric(30,12)，一般／VIP 為 numeric(10,2)。costJpy 相容欄保存有效成本。
- weightKg 僅相容顯示。0.01 g 保存為精確克重，舊 kg 為 0.000；12.34 g 的舊 kg 為 0.012。若換算後超過 numeric(8,3)，明確將相容 kg 保存為 NULL，保留精確克重；快照 metadata 記錄此情況。沒有截斷或以浮點數改写新精度欄位。
- 上架條碼獨立於 SKU，保存於目前快照 listingBarcode；空值代表無條碼。上架改條碼不會自行更正 Catalog。
- 新的連結上架必須完成成本、運費、一般及 VIP 售價才可保存。缺值回傳待確認／422，不以 0 補齊。舊未連結商品仍使用原 API。

## API 與交易

正式路由與測試入口均註冊：

1. POST /stores/:storeId/catalog-products/:catalogProductId/create-listing
2. POST /stores/:storeId/products/:productId/recalculate-pricing
3. GET /stores/:storeId/products/:productId/pricing-history

POST 的 PREVIEW 模式只回傳估算、來源及 context 指紋，不寫商品或快照。SAVE 必須帶同一預覽的 expectedContext；改動成本、設定、模板、運费、旅程／路線或同一上架後，回傳可恢復的 409，保留前端手動輸入。一般／VIP 的低利潤或虧損必須另行確認，且確認限於當次輸入。

所有上架寫入先鎖 stores，再讀相關資料；Catalog 同步、product、immutable snapshot 與 current pointer 使用同一 PostgreSQL connection／transaction。catalogExecuteInTransaction 不另開交易，原 catalogExecute 保留原入口及錯誤映射。pricingResolution 接受 caller executor，沿用原 pricing-v2 與 transport resolver，沒有複製或修改計算公式。預覽既有 strict body、canonical storeId、最大 ID 邊界與 routeMetadata 保留。

快照新增 sourceCostRecordId、listingBarcode、pricingContext 與 createdBy。舊金融快照不改写；成本 append 和目前成本作廢回退以來源 ID 判斷「成本資料已更新」。預覽不改售價，明確保存才追加快照並更換 current pointer。一般／VIP 手動改價也會產生新快照。

pricingContext 保存當時模板、設定、利潤門檻、來源成本、實際解析輸入及完整預覽；設定不存在時明確記錄使用 v2 公式預設門檻。0043 rollback 在已有任何本批新欄位資料時拒絕執行，避免以移除欄位破壞歷史 metadata。

同步清單預設空白；server allowlist 只處理勾選欄位。成本同步呼叫正式追加成本流程；條碼同步呼叫正式更正流程，保留 REAL／NONE、原因、重複確認與 audit。任何同步錯誤回滾整次保存。已有快照／訂單的上架刪除回覆 409，下架保留歷史。

## 介面

既有 /products/new 與 /products/:productId/edit 加入資料庫選擇與計價；保留圖片上傳、規格、庫存、溫層、SKU、備註、截止時間、批發價、夥伴價及分享成功頁。Catalog 卡片可以建立上架，詳細頁可以查看實際連結上架。

一般售價初始空白；目標售價只作參考。VIP 沒有正式成交提供者時回傳明確 null，跟隨一般價直到手動修改；編輯既有商品保留其售價。正式最新 VIP 成交必須於 Phase 6 接通，本批沒有偽造成交。

旅程與路線只選本店資料。舊旅程 API 省略 storeId 且兼容待回填資料，因此本批不依它猜測所有權；上架預覽與歷史端點提供伺服器以明確 storeId 查得的 availableTrips，不含 NULL 所有權。偏好標籤只在使用者所選旅程中解析；沒有或不唯一時要求自行選擇，選擇另一 Catalog 先清除先前路線。DISCONTINUED 仍可搜尋；封存商品提供回到資料庫恢復的入口，不自動恢復。

既有上架可查看原本估算、最新成本重算、差異、價格與完整快照歷史。手動套用前保留原售價及原快照。資料庫同步清單列出每欄原值與上架值，不把未勾選欄位一併回寫。

## 自測與接續

證據根：C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase5-author-r0。
新 DB-BUILD-05 容器使用指定 PostgreSQL 16 digest 與經 hash 驗證的合成 legacy dump；main 和 compat 都在 fixture 前執行 0043 up/down/up。原 Phase01／3／4 凍結容器不啟動、不修改。

手算樣本：PERFUME 原價 1000、有效成本 915、匯率 .21、重量 12.34 g、虎航 1050/20000、免攤交通、保護 5、刷卡 .015、百貨 .0155：
192.15 + 2.88225 + 3.255 + 5 + .64785 = 203.9351。一般售價 500.25 的完整淨利 = 296.3149。API 逐欄比對原精度。

最終自測結果、程序停止、來源 manifest 與未完成項目以本輪外部 author-report 為準；作者不自行宣告獨立驗收。

Phase4 原有六個 E2E 保留。PIKA_ORIGINAL_FOCUS_PROBE 未設定；舊獨立 raw probe 缺少 ready precondition，正式歸類 obsolete diagnostic，本輪不宣稱該歷史探針通過。

## r1 表單修正

提交錯誤使用頁首下方的可聚焦摘要，保留輸入並提供欄位連結；同一錯誤再次提交也重新定位。一般／分級售價驗證、API 欄位格式、待確認或過期預覽等保存錯誤皆進入相同摘要。後端結構化欄位錯誤對應至表單欄位，其他錯誤提供重新預覽與相關輸入入口。重新預覽清除前次摘要。焦點捲動區分鍵盤與滑鼠，避免滑鼠按下時移動按鈕。

資料庫選入只載入未由使用者編輯的欄位。人工標記涵蓋名稱、圖片（含選檔／刪除／網址）、分類、備註、重量、有效成本、日本原價、上架條碼、模板、運費與百貨費率；資料庫載入或既有商品 hydrate 不會建立人工標記。選入後列出保留的欄位；不另設覆寫確認，也不自動清除一般售價。VIP 人工來源及路線仍按所選商品重設，VIP 回到跟隨目前一般售價。同步 checkbox 每次選入仍預設全不勾選。店鋪／商品切換清除前一份表單狀態，既有商品只 hydrate 一次，避免 refetch 覆寫編輯中的輸入。

r1 外部證據根為 C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase5-author-r1。最終完整 16 個瀏覽器案例（原 11 加 5 個新行為案例）全部通過，保留原有斷言、五種 viewport 與 focus 矩陣。僅原 Catalog 多步驟長案例的整案預算調為 180 秒：独立 trace 在約 119 秒才進入最後編輯頁，第一輪 r1 該案例實際完成約 130 秒；每項 expect 仍為 15 秒，全域 timeout 及 retries 不變。這不是單一操作效能驗收豁免。原獨立失敗與本輪初次兩個失敗、修正過程均留存；完整結果及來源 hash 以本輪 author-report 為準。

## r2 非同步與同頁切店修正

r1 獨立補測發現兩個 P2：deep-link A 晚回覆覆蓋較新 UI 選擇 B，以及不 reload 切店保留舊免攤交通。r2 為請求加上 store/product 上下文、選擇世代與操作序號。選擇、略過、切店、切商品及卸載使舊回覆失效；deep load、history metadata、preview/latest、save 與父層保存／上傳／clipboard 的舊結果和錯誤不再發布，舊 finally 不解除新請求 busy。最新成本讀取期間有較新人工輸入時不覆寫。Query 的 store/key/epoch 與 AbortSignal 隔離 options/history。

同頁切店清除免攤交通、路線、預覽、確認、差異、busy、modal、圖片與成功頁等暫存；合法本店既有上架仍 hydrate 自己保存的 exemption。一般同店 Catalog 改選維持 r1 人工欄位、一般價、VIP 來源與路線規則。

手動圖片上傳另用 store/product 表單 scope，不因同店改選 Catalog 而失效；切店／切商品／卸載與較新圖片請求才使舊上傳失效。新增三個合成 PNG／mock upload transport UI 回歸，核對同表單改選仍完成、切店後舊成功與舊錯誤均不改新表單；外部圖片儲存未驗。最終完整 suite 為原 23 加此三案，共 26 案，業務 API／SQL 仍真實。

新七個瀏覽器回歸使用真 API 回覆的延遲交付，包含改選 B 後保存來源仍 B、人工輸入、略過、同頁切店、前後 preview busy、延遲最新成本與延遲歷史。切店用合成授權 header 與實際 /api/me/store invalidate，核對 timeOrigin 不變；在新店以 UI 手選真實旅程／路線並預覽，檢查無舊店免攤交通或路線殘留。

證據根為 C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase5-author-r2。首輪完整 23 案為 22 通過、1 筆跨尺寸整案逾時；15 次 goto、20 個 readiness assertion 已成功，最後 320px detail 控制項讀取耗尽 120s。主控以正式追加契約僅將此 5 尺寸 × 3 路由案例整案預算調至 180s，保留全部操作／44px／overflow／截圖斷言，原另一長案 180s、全域 120s、expect15s、retries0 不變。此為有限整組預算校正，不是產品效能改善，原失敗不改判。最終完整重跑、typecheck/build、資源關閉及來源 hash 以 r2 author-report 為準；作者結果仍待同獨立者驗收，Phase6 尚未開工。
