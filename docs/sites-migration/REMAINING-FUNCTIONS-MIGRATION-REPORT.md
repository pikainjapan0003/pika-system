# 剩餘既有功能 PRIVATE 遷移

2026-09-27，B＋Astra；本輪施工中。使用現有架構與合成資料，不重跑真 OCR、不查未授權包裹、不要求人工驗收。

起點：本機與 GitHub `codex/chatgpt-sites-private-poc` 同為 `e7238369d5e5ee62ba39293258cfe1cd2ebfb488`。tracked 工作樹乾淨，既有 `.codex/` 與 controller recovery 未追蹤材料保留。PRIVATE Sites 第 7 版，來源 `528e32a3f2ec3bc54c79cc704a9e9079bdd8d4b6`；Railway API `c1657bda-c30f-4492-a870-9e4e3440be6e` SUCCESS，無 pre-deploy hook、無 GitHub 自動部署來源。Site `custom`、指定 owner 1 人，未擴大存取。

## 本輪範圍與現況

| 功能 | 證據／現在完成範圍 | 尚待完成或外部缺口 |
|---|---|---|
| 分類 | 原 categories CRUD、商品 FK 的 SET NULL；新增私人路由；合成 PG 增改套用刪除讀回通過 | 線上部署／讀回 |
| 四層價格 | 原 `resolveTierPrice`；一般 120、VIP 100、批發 80、合作 60，各買兩件 240／200／160／120；前端偽造 1 元未採用；缺合作價回 120 | 線上驗證；不新增客戶登入或公開 VIP 身分猜測 |
| 訂單／付款 | 原建立、備註、狀態、付款末五碼、部分付款 100→已付 240；修改數量 2→3 同步總額／應付 240→360，再回 2 | 線上保存 |
| 購物金 | 原帳本與交易；80−10−30=40，重送不再扣，取消回沖 30→70，再取消仍 70；PG spend／reversal 各 1 筆 | 線上保存／部署後再讀 |
| 揀貨／出貨清單 | 原 Picking／Shipping List、持久勾選、CSV 已由 API 驗證 | 線上下載與畫面 |
| 訂單／賣貨便匯出 | 原資格判斷、清楚區分可匯出及不可匯出；CSV 與真正 v1.4 XLSM，VBA 保持原 hash | 線上檔案驗證；Excel 實機開檔及正式平台匯入延後 |
| 7-11 門市 | 搜尋及店號 901001；正常客人下單 120＋38=158，後台門市快照一致、來源強制 customer | 線上；真門市來源未驗、EMap 匯入仍停用 |
| 全家門市 | 另驗 family 搜尋及店號 901002；客人下單 120＋60=180、門市保存一致 | 線上；真門市來源未驗 |
| 7-11／全家 Excel 物流匯入 | 分別生成全合成 Excel，解析→配對→確認→PG→token；重複確認 409，重複匯入保持同一 tracking；未匹配列保存異常 | 線上部署及重讀；不將檔案匯入稱為真貨態 |
| 物流異常／客人查單 | 隔離庫保存明確 fixture：711 arrived_store、Family unknown／查詢 failed；token 分別回 arrived_store／exception，不暴露內部錯誤；匯入異常／歷史可查 | 線上保存／讀回；瀏覽器控制逾時，畫面延後 |
| 全家真貨態 | 沿用已部署的查詢入口及前輪 24 項證據 | 等待合法單號，不重複查詢 |
| 7-11 貨態 | 原 preview-only 邏輯保留，沒有新增 commit／同步；私人預覽入口待合法單號才能查 | 外部查詢未驗 |
| 黑貓／郵局 | 原手動 preview／snapshot 保留；原 COMMIT_ENABLED=false 決定不改 | 外部查詢未驗；不新增寄件／自動同步 |
| 匯率參考 | 原官方 adapter 與手動套用；fixture 驗來源／時間／不可用不填 0 通過；不新增背景抓取 | 線上參考讀取及手動保存驗證 |
| Audit Log | 重新接上原頁面／API；帳本 spend／reversal audit 由 PG 路徑驗證 | 線上查回／其他既有操作證據 |
| 客戶明細／毛利／Dashboard | 保留原客戶訂單資料、毛利快照、待處理資訊；接回物流入口／異常數 | 最小線上讀回與畫面測試 |
| Seller Agent | 未定案，設定與背景入口仍未開放；共用物流程式保留 | 本輪刻意排除 |

## 必要修正

- `privatePoc.ts` 只增加本輪需要的既有路由，保留 gateway、Clerk 指定店主／指定店鋪與原業務確認；技能地圖不恢復。
- `sites/worker.mjs` 補轉送 `x-confirm-maihuobian-export` 與下載 `Content-Disposition`，避免第二個既有確認被代理丟掉。
- `orders.ts` 讀購物金帳本補接受既有 `adjust` 類型。新增可選 UUID 請求識別＋內容 hash，交易鎖和 `(store_id,client_request_id)` 唯一 index 讓同一次新增訂單重送回原單，內容不同回 409。
- `CreateOrderDialog` 沿用同一份 tier price helper 顯示客戶層級售價，送出穩定請求識別；業務售價仍由伺服器重新讀取計算。
- 向前 migration `0043_order_request_identity.sql` 僅新增 nullable 欄位／index，不重寫歷史訂單或成本快照。一次性 `remaining-functions-setup.mjs` 只對指定隔離 POC 執行，加入兩間合成門市，開通選店，不呼叫寄件商。

## 驗證與已知限制

本機首批商務／帳本／揀貨／XLSM／匯率 30 項通過；最終 API／CVS／既有手動 provider 73 項通過；新增衝突情境後，三個完整合成 API 案例再通過（含真正 PG 讀寫與合成狀態展示）。舊 provider 測試初次失敗來自缺測試簽章、固定歷史列及已過時的「preview 完全不存摘要」預期；改用自建資料與原程式已存在的摘要語意後通過。正式私人版仍不開放其 commit 入口。

OpenAPI 補上 API 已存在的三個等級售價，Orval 生成與 libraries typecheck 通過；root build／前端測試收尾中。前端原批次 22 項有 21 通過、1 個 React 更新等待逾時，正補驗，未提前列全綠。

本機 PostgreSQL 是 `pika-sites-private-poc-db-1`，`pika_sites_poc`／`pika_poc`；雲端沿用 Railway project `de13e86c-9d70-4396-85be-79cd73cd412f`、environment `143266a9-b10c-4dec-9b8f-f4eec9bec86a`（名稱 production，但用途為隔離 POC）、API `1068b8cf-3623-4b85-a702-d7bb7b70080e`。未讀取正式客戶、原正式資料庫或正式圖片。

新版自動案例在 `src/poc/remainingCommerce.integration.test.mjs`，可重用 HTTP scenario 供線上驗證。原物流測試中含來源不明的歷史遮罩檔，本輪不拿它作測試資料；另用原解析器接受的標頭生成全合成 Excel。

2026-09-27 瀏覽器 inventory 可讀，但 Chrome 開 PRIVATE 站點逾時；目前不宣稱完整畫面 E2E，不要求使用者代測。新增外部 API 費用、真 OCR 呼叫、真物流單、付款、通知均未執行。

## 版本與回復（施工後補實測）

原碼回復依本輪前 `e7238369` 與既有私人部署。新 nullable 欄位可保留，不必刪資料才能回復；合成門市與本輪新增合成紀錄保留。新增費用／方案變更：無；當下餘額未查，不引用舊餘額保證。

本輪備份：專案外 `Codex-backups/REMAINING-FUNCTIONS-2026-09-26T19-04-40.869Z`，含改前來源 zip／總進度。main、原 OCR 分支與 Git 歷史不改。
