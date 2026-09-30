# 商品資料庫整合與驗證（2026-09-30）

狀態：整合、既有 GitHub 分支同步、雲端資料庫／API 及 Sites 第 10 版更新完成；線上讀寫、持久性與原資料回歸通過。手機相機實機與完整瀏覽器操作仍未驗證。

## 範圍與來源

- 目標：既有 `codex/chatgpt-sites-private-poc` 工作樹，起點 `97e71ed93e74063c3ee3457e0a9da8f1c919edd5`。
- 來源：商品資料庫 `feat/product-database-v1`，功能差異 `30a36a6..51e9a501a3affbd5469219d3dcec68c6e8c2b51e`。來源工作樹維持唯讀。
- 整合條碼、全螢幕掃碼、圖片上傳、商品基本資料與歷史、定價預覽／上架快照、多品項訂單／成交統計、配對與審核式 Sheet 匯入。
- 保留現行公開品牌首頁、指定 Clerk 店主、私人 R2 圖片、原有 OCR 與物流；不恢復 Seller Agent、技能地圖、註冊或建店流程。
- 遷移編號由來源 0041–0045 改為目標 0045–0049，避開既有 invoice OCR、request identity 與移除 Agent 的 migration。
- Sites 保留既有交通成本模型。來源另一工作線的區域成本／HEP 不混入本次移植。新定價快照記錄 `transportModel: SITES_LEGACY_V1`。

## 備份與隔離

原 tracked source、diff、status 與測試庫 dump：
`C:/Users/Lnovo/Documents/Codex-backups/SITES-PRODUCT-DATABASE-20260930/`。

本機測試資料庫為本次獨立的 `pika_sites_catalog_test`，僅 `127.0.0.1:53611`；guard 要求指定庫名、帳號與本輪 marker。原測試庫完成 dump 後已停止，原資料卷保留。其他專案容器不動。

`catalogMigration.mjs` 先備份、SHA-256 讀回，再於單一交易加入五份 migration；驗證原表原欄位的筆數／內容 hash 與原 sequence。雲端分支另綁定既有 Railway project／environment／API service，備份只存既有私人 R2，無全域 schema push、seed 或舊訂單回算。

## 已完成驗證

| 驗證 | 結果 | 證據 |
|---|---|---|
| 固定公式、歷史金額、分層價格回歸 | 通過，80 項，0 失敗 | `.poc/checks/catalog-lib-tests-*.txt` |
| 60 個原 Sheet 公式欄位 | 通過，沿用來源預先固定的預期值 | `lib/db/src/pricing-v2/pricing.test.mjs` |
| 本機 migration | 通過，20 張既有表與 sequence 均不變 | `.poc/checks/catalog-migration-*.txt` |
| migration 再查 | 通過，`ALREADY_APPLIED`，五份 SQL hash 相符 | `.poc/checks/catalog-migration-verify-*.txt` |
| 線上改版前唯讀基準 | 通過，4 商品、11 訂單、原單總額 200；圖片 417 bytes | 備份目錄 `online-before.json` |
| 匿名管理與私人圖片存取 | 通過，原有拒絕邊界維持 | 同上 |
| API codegen、共用 lib 型別、API build | 通過 | `.poc/checks/catalog-codegen-*.txt`、`catalog-api-build-*.txt` |
| 完整 root typecheck、Sites build | 通過，exit 0；Sites 2216 modules | `catalog-typecheck-*.txt` 最後一輪、`catalog-site-build-*.txt` |
| 掃碼、相機控制、圖片、購物車、公開入口 | 通過 43 項 | `catalog-ui-tests-*.txt` 中其餘案例通過；首輪訂單頁缺依賴另列下行 |
| 訂單頁與價格顯示重驗 | 通過 8 項 | `catalog-orders-ui-*.txt` |
| 實際 PG 訂單整合 | 通過 13 項（含父測試）；舊單品／購物車、舊訂單原欄位不變、同單防重、成交量與不可覆寫快照 | `catalog-integration-*.txt` 最後一輪 |
| 匯出、揀貨、公用 DTO 回歸 | 通過 13 項 | `catalog-export-tests-*.txt` |
| 雲端 migration／備份 | 通過，20 張原表內容及原 sequence 不變；R2 備份 SHA 讀回一致 | `catalog-cloud-migration.json` |
| 新版線上保存及更版後持久性 | 通過；合成 catalog 1 新增、讀回、封存，更版後同筆仍在 | `catalog-online-before-final.json`、`catalog-online.json` |
| 原服務線上回歸 | 通過；4 商品、11 訂單、原單總額 200、圖片 hash 與物流狀態相同 | 備份目錄 `online-after-legacy.json` |
| Sites 第 10 版公開檔案 | 通過；首頁 200、主程式及四個商品資料庫頁面檔案 SHA 與本機 build 相同 | `catalog-frontend-live.json` |
| 手機相機與完整瀏覽器操作 | 未執行；不冒充實機通過 | 自動瀏覽器通路逾時；相機控制的本機測試已通過 |

本輪最終通過 157 項測試（80＋43＋8＋13＋13，含父測試；重跑不重複計數）。驗證方式為獨立 Node 測試程序、原 Sheet 固定值與 PostgreSQL 交易前後核對；沒有宣稱另有獨立人工審查。原 feature 的 E2E／隔離 harness 同步保留作來源，沒有宣稱本輪已跑完整瀏覽器 E2E 或 GitHub CI。

## 固定手算

交通成本樣本：交通 ¥1,000、國內費 ¥500、國內費手續費 1.5%、20 件、匯率 0.2。
`(1000 + 500 + 500 × 0.015) ÷ 20 × 0.2 = 15.075 TWD`，與 Sites 原模型相符。

新多品項驗收固定值：A 成本為 `(100 JPY × 0.2) × 1.015 = 20.3 TWD`，單價 50、2 件；B 成本為 `(50 JPY × 0.2) × 1.015 = 10.15 TWD`，單價 30、1 件。指定免交通、零國際運費與零保護金，商品總額為 `2 × 50 + 30 = 130`，品項毛利合計為 `2 × (50 − 20.3) + (30 − 10.15) = 79.25`。實際 HTTP／PG 交易、追加新成本後歷史不變、成交數量 2／1 與完成事件僅一筆均通過。

## 環境狀況

- 舊本機 PG 用 template 複製測試庫失敗兩次；保留失敗記錄，改用成功的 `pg_dump` 還原至本次獨立 PG，不再重送 template 操作。
- 原 workspace 排除 Windows 原生建置套件，且 root preinstall 依賴 `sh`；相依檔已載入，但該 Linux housekeeping 在 Windows 回 exit 1。Windows 原生套件使用既有精確版本補至被忽略的本機資料夾，不改產品套件版本或雲端環境。
- 首輪純函式 runner 從沒有 `tsx` 直接依賴的 `lib/db` 啟動，屬環境失敗；改由 API 的既有 `tsx` 啟動後 80 項通過。
- 整合測試假設與 Sites 現有契約不符的部分已校正：訂單以列表查回；重複完成由未修改的 `orderStatusMachine.ts` 回 422；原手動訂單防重重送回 200、新建回 201。依既有契約更正測試，保留「仍只有一筆完成事件」、同單 ID 與精確金額斷言；沒有為通過測試改鬆狀態機。
- 首輪訂單頁發現遺漏直接依賴 `decimal.js`；已補回來源使用的精確版本 `10.6.0`，frozen lockfile 安裝 exit 0，訂單頁另隔離其未測的成本編輯對話框，四項既有訂單操作斷言與四項金額顯示斷言通過。
- 套件連結更新期間，舊 Windows `.CMD` 型別檢查程序仍持有過期內容；僅終止本次 own PID 5576 的樹，保留診斷，再從穩定依賴重跑 root typecheck。不要在驗證執行中重建套件連結。
- 瀏覽器控制讀取逾時；目前未把工具未能觀察的手機相機畫面列為通過。
- Sites bundled workflow 已先開啟來源並成功推送新版，但其 Bash 封裝在 Windows／WSL 路徑失敗；Git Bash 路徑嘗試也未完成。改用本專案既有、固定 Site／remote／checkout 且透過 stdin 接收原生短效 credential 的 Windows 封裝器；核對乾淨 commit、Worker、tar 清單、遠端 HEAD 後，由原生 Sites 儲存並部署成功。沒有修改外掛、WSL、登入或全域設定。
- 線上更版後核對初次因合成品名全形分隔符失敗；原 `catalogName` 明確採 NFKC。驗證腳本改用同一名稱正規化後讀回 catalog 1；沒有改商品名稱、另建重複商品或修改產品規則。

## 最終版本與線上證據

- 產品執行來源：`7b500907d48ef1a04c7cb23624b621e364348266`，已正常推送 `codex/chatgpt-sites-private-poc`；不是 main。收尾文件另提交，不改產品執行來源。
- API 乾淨來源 568 個檔案，路徑／內容 manifest SHA-256：`8bdea6efc41a64ee8abd6f6de3fa7bee1269af6fc2a6a0a3a4bfff8ef0e353fc`。沒有上傳 `.env`、`.poc`、`node_modules` 或私人設定。
- 備份及升級 deployment：`0f206c68-da72-44d1-aeb0-5e375d2b738b`，SUCCESS。備份位於既有私人 R2 `pika-sites-poc` 的 `database-backups/SITES-PRODUCT-DATABASE-20260930/c868a0775a7a1eb1ebce53648fa0d05f4fce04f3d3315f8d5e8d5ad32e076e7d.json`，136,054 bytes，SHA-256 同檔名。資料庫另保留 `pika_catalog_backup_20260930` 與 receipt。
- 最終 API deployment：`980d6d82-c3b3-4e9c-a07a-bbfcc7e099ea`，SUCCESS；`preDeployCommand=[]`、timeout 恢復原 120 秒、start command 維持 `node src/poc/start.mjs`，staged patch 為空。
- Sites 第 **10** 版：`appgprj_6ab69a6062348191809b743a5635f83e~appgver_b0efbac6c6808191a59479a78b8bfbb2`；部署 `appgdep_6abc5b4330148191bf11e306b171cd93`，succeeded，env revision 2。產物來源 commit `1603d5de9e27c9d2297a7b9b5df51e3e4eef89a8`，archive hash `141be3335b40daaf9f7a24b9a68e795069d19e1025313fac243db214f33d5029`。
- 正式網址沿用 <https://pika-jpselects.com>；管理入口 <https://pika-jpselects.com/product-database>，仍需指定店主登入。Site access public、原管理 API／合成 token／私人圖片邊界均保留。
- 2026-09-30T00:45:13Z 最後讀回：catalog 1 仍封存、不是重建；原商品 4、訂單 11，不新增訂單；兩份 before／after 商品訂單回應逐欄一致。原 200 元假單、圖片 SHA `5ebf45e7206f8cfc6dab1a35c320bdd9506cf6f754b3ef8e83d791cfca67048c`、訂單 9 的 arrived_store 與訂單 11 的 exception 相同。
- 本輪未呼叫真 OCR、承運商、付款或通知，未操作 Replit AI，未中斷其他專案。

回復需保留新增 catalog／order_items 的資料，不能直接執行破壞性 rollback。既有第 9 版與 API `632d96db-029b-4f7c-80b3-493d4fa8ec6d` 是改版前參考；若未來需回退，先核對後續訂單及本輪備份，再決定相容方式，不能覆蓋新資料。
