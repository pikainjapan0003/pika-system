# 賣貨便匯出個資審計

審計日：2026-07-31  
範圍：賣貨便匯出 API、後台匯出面板、匯出列驗證與 audit log。  
方法：唯讀程式碼與既有測試審查；本報告不修改產品邏輯。

## 結論

- 未發現公開、未登入或跨店使用者可取得賣貨便匯出資料。GET／POST 都經過 `requireAuth` 與 `verifyStoreOwner`，資料庫查詢也綁定 `store_id`。
- 正式匯出用固定 10 欄 allowlist 重建資料，不會展開整筆訂單；成本、毛利、token 與內部備註都不在輸出結構。
- 明文下載已有畫面警告、用途勾選及後端雙確認 header。
- audit log 不記姓名、手機或 token；但 target 目前只有筆數，還不是可區分每次匯出的 opaque 批次代號。
- 發現一項 P2：預覽 GET 在使用者完成二次確認前，已把完整姓名與手機送到瀏覽器；畫面其實不需要這些欄位。

## 欄位逐項審計

| 官方欄位     |         分級 | 實際來源與處理                                                                | 現有保護                                                                                 |
| ------------ | -----------: | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 取件人姓名   |           P0 | `recipientName`，空值時回落 `buyerName`（`validateMaihuobianRow.ts:144,243`） | 必填、10 units 上限、禁用字元與控制字元 fail-closed（`:154-164`）                        |
| 取件人手機   |           P0 | `recipientPhone`，空值時回落 `buyerPhone`（`:145,244`）                       | 只接受 `^09\d{8}$`（`:166-171`）                                                         |
| 取件門市     |           P2 | `cvsStoreId`（`:146,245`）                                                    | 只接受 6 碼數字（`:173-178`）                                                            |
| 溫層         |           P3 | 商品或購物車品項的 `storageTempClass`（`maihuobianExport.ts:208-232`）        | 只接受常溫／冷凍；混溫或缺值拒絕（`validateMaihuobianRow.ts:180-185`）                   |
| 商品         |           P2 | 商品名、規格及數量摘要（`maihuobianExport.ts:109-118,208-218`）               | 必填、200 字上限、控制字元拒絕（`validateMaihuobianRow.ts:187-196`）                     |
| 訂單金額     |           P2 | 定格的 `orders.total_price`，不重算（`maihuobianExport.ts:219-232`）          | `ExactDecimal` 驗證 0–20,000，輸出兩位小數（`validateMaihuobianRow.ts:149,198-203,248`） |
| 運費金額     |           P2 | `orders.shipping_fee`（`maihuobianExport.ts:228-229`）                        | `ExactDecimal` 驗證 0–100，輸出兩位小數（`validateMaihuobianRow.ts:150,205-210,249`）    |
| 買家下訂日期 |           P2 | `created_at` 轉 Asia/Taipei 日期（`validateMaihuobianRow.ts:93-115,151,250`） | 不輸出時分秒，但仍屬精確交易日期                                                         |
| 商品備註     | P0（依內容） | `orders.notes` 原文（`:152,251`）                                             | 只驗 200 字與控制字元（`:219-227`）；可能含使用者自行輸入的其他個資                      |
| FB／LINE／IG |           P3 | 固定空字串（`:252`）                                                          | 目前不匯出社群帳號                                                                       |

CSV 由固定欄序重新建立，不是展開 order 物件；公式開頭 `=`、`+`、`-`、`@` 會加單引號中和（`MaihuobianExportPanel.tsx:39-72`）。

## 授權與二次確認

- GET 預覽：`requireAuth` → `verifyStoreOwner`（`orders.ts:213-220`）。
- POST 匯出：同樣先驗身分及店主（`orders.ts:239-246`）。
- 畫面第一步是勾選合格訂單後按「準備匯出 N 筆」（`MaihuobianExportPanel.tsx:323-330`）。
- 第二步顯示明文用途與刪檔警告，必須勾選「我確認本檔僅用於賣貨便出貨」（`:334-354`）。
- 未勾選時下載按鈕 disabled（`:355-361`）。
- 送出時同時帶 `X-Confirm-Cleartext-Export: true` 與 `X-Confirm-Maihuobian-Export: true`（`:149-164`）。
- 後端任一 header 缺少便回 `CLEAR_TEXT_CONFIRMATION_REQUIRED`（`orders.ts:248-255`）。
- route tests 已覆蓋未登入 401、跨店 403、雙 header 及匿名 audit（`maihuobianExport.route.test.mjs:169-184,224-327`）。

## Audit log

資料表欄位只有 `id`、`store_id`、`actor`、`action`、`target`、`at`（`lib/db/src/schema/auditLogs.ts:14-24`）。

賣貨便匯出實際寫入：

- `storeId`
- `actor = req.userId`
- `action = export_maihuobian_cleartext`
- `target = maihuobian-export:orders-{eligibleCount}`
- `at` 使用資料庫預設時間

證據：`orders.ts:292-297`。一般 server log 只記 action、storeId 與合格／不合格筆數，不含姓名、手機或 token（`:298-305`）。route test 也明確反證 audit target 不含假手機與假姓名（`maihuobianExport.route.test.mjs:314-327`）。

## Findings

### P2：預覽 GET 提前回傳明文個資

GET 預覽與確認後 POST 共用 `loadMaihuobianExportPreview()`；其中 `eligible[].row` 已含姓名、手機、門市等完整匯出列（`orders.ts:159-177,213-229`；`maihuobianExport.ts:245-258`）。畫面預覽只需要 orderId、數量與失敗原因，卻在二次確認前先收到 P0 資料。

最小修法：新增不含 `row` 的 preview DTO；GET 只回 orderId、合格狀態與原因，確認後 POST 才回明文 row。補遞迴回應測試，斷言 GET 不含 `recipientName`、`recipientPhone`。

**BATCH-19 狀態：已解。** `e231afe` 將 GET preview 改為資格摘要 DTO，POST export 才保留明文列；測試會遞迴拒絕明文鍵。

### P3：audit target 不是唯一批次 ID

`maihuobian-export:orders-1` 只代表筆數；不同時間兩次匯出同樣筆數時無法區分。最小修法是加入 server 產生的隨機 opaque export ID，仍不可放姓名、手機或 order token。

**BATCH-19 狀態：已解。** `a49700d` 改用 server 產生的隨機 opaque export ID；回歸測試確認兩次匯出的 ID 不同且不含個資或 token。

### P3：CSV 公式中和缺專門回歸測試

實作已有 `csvCell()` 中和，但現有 panel tests 沒直接以 `=HYPERLINK(...)`、`+cmd` 等假資料驗輸出。建議補純函式測試。

**BATCH-19 狀態：已解。** `40da9b0` 加入 `=HYPERLINK(...)`、`+cmd`、`-cmd`、`@SUM(...)` 與 CSV 引號／換行回歸測試。

### P3：文件互相矛盾

賣貨便規格明定官方格式需要明文，不可遮罩（`docs/ai-ops/18-maihuobian-export-spec.md:55-64`），但 BATCH-17 驗收卡仍寫「先匯出預設遮罩版」（`docs/ai-ops/40-batch17-report.md:112-117`）。實作只有確認後的明文版，應修正後者。

### P3：商品備註可能攜帶額外個資

`orders.notes` 除長度與控制字元外原樣匯出。這符合目前欄位規格，但可能含地址、LINE ID 等非必要資訊。建議確認畫面逐欄提示「商品備註也會寫入檔案」，或另行拍板預設留空。

## XLSM 後續安全門檻

目前畫面明示仍輸出 CSV，官方 XLSM 套版尚未完成（`MaihuobianExportPanel.tsx:363-365`）。未來接上 XLSM 前需重新確認：

- 範本為受控資產並固定 SHA-256。
- 後端只填值，不執行 VBA。
- B1 版本號不是 1.4 時 fail-closed。
- 伺服器不保留輸出檔。
- owner-only、雙確認、500 筆上限及匿名 audit 不得弱化。

依據：`docs/ai-ops/38-xlsm-template-fill-options.md:138-145`。
