# Phase 4 商品資料庫畫面與整合

DB-BUILD-04 revision 0；唯一作者 01a09584-681e-7ed2-870a-a51bb919ebb2。沿 Phase3 r1 的 98 檔固定基線，契約與原規劃位於本案管理根。此文件記作者實作及自測，不代表獨立驗收或 Owner 視覺簽核。

## Scan

既有 React 19.1、Tailwind 4.1、Deepsea palette、shadcn primitive、TanStack Query 與 Clerk token bridge 可直接沿用。App 有外層 MerchantPortal 與內層頁面兩層路由；兩層都加入商品資料庫。底欄維持五項，商品為 active。現有上架商品頁新增入口。

## Diagnose

原 Catalog 通用回應型別不足以可靠呈現成本、歷史、範本及候選；OpenAPI 改為 operation-specific DTO，再正式產生 client/Zod。Phase3 實際 wire 保持不變。無條碼即時相似提示原本沒有公開三因子查詢，因此 catalogList 最小新增 similarName、similarWeightGrams、similarOriginalPriceJpy，要求完整三因子、正規化名稱與精確數值 SQL 比對、店鋪隔離及 server count/page。原搜尋路徑不變。

舊金額 helper 不符合負數與缺值語義；新增 Decimal 字串格式化，JPY 0 位、TWD 2 位、weight 2 位，負數保留負號與朗讀文字，缺值為待確認。金額不經 Number。

## Priorities / 實作

1. 新增列表、建立／編輯、詳細頁。搜尋有 debounce、AbortSignal 與含 store/filter/page 的 query key；清除回到第一頁。
2. 表单必填錯誤摘要可聚焦，欄位有 label 與描述。REAL 同碼只有讀取真實 409 details 後明確確認才 forceCreate；NONE 可建立並提供跨完整資料集的相似提示。
3. metadata 編輯與 immutable 成本追加分開；改名保留 alias、成本作廢留理由、封存／還原、更正條碼／換品複製、Shopee、關聯及稽核均走正式 handler。
4. 百貨手續費率可明確覆寫或留白依範本。新增、編輯均送字串或 null；不把當下範本費率複製成隱藏覆寫，既有自訂值保留可編輯。試算帶入實際 templateId 與明確 override。
5. 計價設定提供 fallback 說明與明確初始化，範本及國際航運 CRUD。GET 不寫資料。
6. 詳細頁十區採 accordion；後續上架、成交統計、Sheet 與相機依本輪範圍顯示未接入，不造假資料或以 0 補缺值。

## 驗證與接續

外部證據根：C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase4-author-r0。

已使用 ui-design-toolkit、ui-ux-pro-max、React best practices；依有效 Owner 授權持續施工，未新增逐關批准。G0–G2 沿本案既定需求與設計，G3–G5 以型別、建置與實際 browser 驗證，G6 GPU 不適用，G7 Owner 最後視覺簽核待完成。

測試入口 e2e/product-database-runner.mjs 使用 exact task/container/loopback guard、獨立合成 PostgreSQL 與真實 API route/service/SQL；只替換 Clerk 測試認證。這不是正式 Clerk 登入測試，也不是實體 iPhone／Android 證據。Playwright 單 worker，viewport 序列執行，不與完整 build 同時進行。

最終結果、檔案 hash 與服務停止證據由外部 manifest／自測紀錄提供；本文件不把尚未執行項目寫成 PASS。

### revision 0 作者自測結果

- Playwright 最終 4 組通過、0 skipped。三頁各驗 320／390／768／1024／1440px、無整頁水平溢出，檢查 main 的可見互動元件至少 44px，五項底欄至少 44px。截圖於 browser-final；作者已檢視 390px 三頁畫面。
- 真 API 邊界檢查 14 項通過：認證、跨店、完整三因子與 canonical 數字、26 筆相似結果的 server count/page、原搜尋隔離。
- 既有 compatibility 1、preview 13、core 35 項通過；金額／驗證／錯誤語義 UI helper 3 項通過。
- 最後完整型別檢查通過；設定 task-local PORT、BASE_PATH 與合成 Clerk publishable key 後，全部工作區序列 build 通過。首次最後建置缺 PORT 的失敗日誌保留；未為此更動原 Vite 設定。
- 最後 codegen 重跑 190 檔 hash 全部相同。新 query 最初接受前導零的缺口已收緊 OpenAPI 並重新產生，真 API 回歸確認 400。
- browser-final 完整操作流程 console error 0、page error 0；先前測試定位／小數字面格式失敗的 trace 保留，不作為通過證據。詳細頁最終截圖加入等待內容後才拍攝。
- PostgreSQL 容器 0f81d228ade85258221e87673187bf51946e0e3b55cf09775b427badf93609c7 已正常停止、ExitCode 0；兩個合成資料庫舊四表 projection 校驗值均未改變。

不同店鋪測試使用真 API 的另一個 exact 測試 token，並重新載入頁面；沒有宣稱測到正式 Clerk 帳號即時切換事件。實體手機、正式登入、Owner 最後視覺簽核與獨立驗證仍待完成。Phase5–9 按主控後續契約接續，不由此輪提前實作。

### revision 1 焦點修正

依獨立 r0 的 FOCUS-RETURN／FOCUS-OBSCURED 兩類 P2 修正。新隔離環境先重現三個原斷言：設定／追加成本關閉後 activeElement=BODY；390×400 從備註 Tab 到新增，按鈕 y339–383，中心命中底欄「首頁」。紅燈 JSON、JUnit、trace 與截圖留於 phase4-author-r1/red。

設定與 ActionEditor 使用真實 opener ref 在 onCloseAutoFocus 返回焦點；巢狀取消／Escape／成功保存及 query refresh 保留返回位置。ActionEditor 的 opener 已移除時，只在仍連接的原區域尋找可用操作；頁面已離開則不嘗試舊按鈕。重複條碼確認取消／Escape 回到表單送出鈕，保留輸入；成功導航不強制聚焦舊元素。沒有更改全域 Dialog primitive。

Shell 僅處理本 main DOM 內取得焦點的元素，依 visual viewport 及本頁固定底欄實際 top，在必要時即時最小捲動，讓焦點位於底欄上方。Portal dialog 的焦點不進入這個處理；底欄元件與全域事件均未改動。錯誤摘要連結明確聚焦對應欄位，使用相同可見性規則。沒有任意 timeout、隱藏底欄或改變正常跳頁來避開缺陷。

作者最終自測：原 E2E 四組加兩組焦點測試，6 passed／0 failed／0 skipped；原三個斷言全綠，新增按鈕 y252–296 且中心命中自己，完整位於底欄上方。另有13筆焦點矩陣紀錄，涵蓋巢狀取消／Escape／成功保存、成本取消／保存、同碼取消／Escape、短視窗正反 Tab、錯誤摘要連結、正常390×844。三頁320／390／768／1024／1440無溢出檢查保留。UI helper 3項、完整typecheck、shop build皆通過。

所有後端／OpenAPI／generated與金額算法維持r0指紋；本輪未重跑或改寫已通過的獨立API81、回歸49或codegen。新測試容器0668818da9d0a7ce10403d25da08dc227cf8f6f68c69d9c04ccd79ad5f76750c已正常停止，main／compat舊資料projection均不變，測試服務與worker PID均已結束。證據根 C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase4-author-r1。

此為作者修正及自測，仍待同一獨立者 r1 重驗；390×400 為軟體短視窗測試，不冒稱實體手機鍵盤驗證。

### revision 2 測試就緒條件

獨立r1原三個產品焦點probe已PASS，但整批作者E2E為5 pass／1 fail：短視窗矩陣在初始化請求仍pending、送出鈕disabled時就Tab，正確跳到取消，造成測試前提錯誤。原失敗trace、JUnit與獨立loading診斷留在phase4-verifier-r1，未覆寫或改稱通過。

本輪只改測試與文件。新建表單的鍵盤步驟先明確expect「新增商品」toBeEnabled，再由備註focus、Tab；正常視窗與建立helper也確認同一可觀察前提。原activeElement、中心hit、Shift+Tab、錯誤連結及輸入保留斷言全部保留，沒有直接focus送出鈕或任意waitForTimeout。

矩陣另以route.fetch取得真實pricing-settings回應，暫扣回傳、不改payload。pending时确认submit disabled且由備註Tab到取消；放行後等待enabled，再从備註执行原順Tab与後續完整焦點斷言。loading-boundary.json與截圖明確區分兩個狀態。

测试DB harness先核對exact container/image/label/loopback URL guard，再以容器TCP127.0.0.1:5432執行SELECT 1，最多60次、每次連線timeout2秒、失敗間隔1秒，成功才restore；不再以暫時UNIX socket接受連線當作PG完成啟動。失敗仍停止exact新container，dump digest、migrations及全部guard不變。本次新庫第8次TCP查詢成功後restore成功。

作者r2實測：完整6組E2E全部PASS、0 skipped；另外直接import原r0 focus-probe.mjs，先核其固定SHA，再原樣執行，原3項全PASS。13筆ready焦點矩陣完成，pending-disabled另有明確紀錄。所有產品UI/API/schema/OpenAPI/generated與r1指紋相同，因此繼承r1完整typecheck/shop build及r0獨立API81／回歸49，未重跑無關heavybuild或codegen。

證據根C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase4-author-r2；新容器d9f1a2a914a320e5b68f6526c75e691ed690bac74f0004e4a331025ab52fd1af已正常停止，兩個合成庫舊projection均未變。完整149檔manifest、3檔touched、原removed tombstone與PID/creationtime收尾另存。作者自測仍不代表獨立r2驗收或完整Phase4/v1 PASS。
