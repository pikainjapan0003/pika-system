# 商品資料庫整合與驗證（2026-09-30）

狀態：驗證進行中，尚未更新雲端 API 或 Sites 第 9 版。

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

本機測試資料库為本次獨立的 `pika_sites_catalog_test`，僅 `127.0.0.1:53611`；guard 要求指定庫名、帳號與本輪 marker。原測試庫完成 dump 後已停止，原資料卷保留。其他專案容器不動。

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
| 線上新版與手機相機 | 未執行 | 尚未更新網站；不得以模擬測試冒充實機 |

本輪最終通過 157 項測試（80＋43＋8＋13＋13，含父測試；重跑不重複計數）。驗證方式為獨立 Node 測試程序、原 Sheet 固定值與 PostgreSQL 交易前後核對；沒有宣稱另有獨立人工審查。原 feature 的 E2E／隔離 harness 同步保留作來源，沒有宣稱本輪已跑完整瀏覽器 E2E 或 GitHub CI。

## 固定手算

交通成本樣本：交通 ¥1,000、國內費 ¥500、國內費手續費 1.5%、20 件、匯率 0.2。
`(1000 + 500 + 500 × 0.015) ÷ 20 × 0.2 = 15.075 TWD`，與 Sites 原模型相符。

新多品項驗收固定值：A 成本 ¥100 × 0.2 + 1.5% = 20.3；單價 50、2 件。B 成本 ¥50 × 0.2 + 1.5% = 10.15；單價 30、1 件。指定免交通、零國際運費與零保護金，商品總額為 `2 × 50 + 30 = 130`，品項毛利合計為 `2 × (50 − 20.3) + (30 − 10.15) = 79.25`。實際 HTTP／PG 交易、追加新成本後歷史不變、成交數量 2／1 與完成事件僅一筆均通過。

## 環境狀況

- 舊本機 PG 用 template 複製測試庫失敗兩次；保留失敗記錄，改用成功的 `pg_dump` 還原至本次獨立 PG，不再重送 template 操作。
- 原 workspace 排除 Windows 原生建置套件，且 root preinstall 依賴 `sh`；相依檔已載入，但該 Linux housekeeping 在 Windows 回 exit 1。Windows 原生套件使用既有精確版本補至被忽略的本機資料夾，不改產品套件版本或雲端環境。
- 首輪純函式 runner 從沒有 `tsx` 直接依賴的 `lib/db` 啟动，屬環境失敗；改由 API 的既有 `tsx` 啟動後 80 項通過。
- 整合測試假設與 Sites 現有契約不符的部分已校正：訂單以列表查回；重複完成由未修改的 `orderStatusMachine.ts` 回 422；原手動訂單防重重送回 200、新建回 201。依既有契約更正測試，保留「仍只有一筆完成事件」、同單 ID 與精確金額斷言；沒有為通過測試改鬆狀態機。
- 首輪訂單頁發現遺漏直接依賴 `decimal.js`；已補回來源使用的精確版本 `10.6.0`，frozen lockfile 安裝 exit 0，訂單頁另隔離其未測的成本編輯對話框，四項既有訂單操作斷言與四項金額顯示斷言通過。
- 套件連結更新期間，舊 Windows `.CMD` 型別檢查程序仍持有過期內容；僅終止本次 own PID 5576 的樹，保留診斷，再從穩定依賴重跑 root typecheck。不要在驗證執行中重建套件連結。
- 瀏覽器控制讀取逾時；目前未把工具未能觀察的手機相機畫面列為通過。
