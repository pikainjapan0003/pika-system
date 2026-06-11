# Step 7B — 物流表格解析 + 訂單配對規格（dry-run）

回答核心問題：**系統如何知道 Excel 裡的哪一列對應哪一張系統訂單？**
答案是 deterministic matching：姓名遮罩 + 門市名稱（全家再加電話遮罩），且候選必須唯一才算配對。

Dry-run 實作：`scripts/step7/logistics-file-matching-dry-run.mjs`
（read-only，不寫 DB；`DRY_RUN_MOCK=1` 可用合成訂單驗證規則。）

## 來源檔案

- 7-11 賣貨便：`data/step7-fixtures/*賣貨便*.xlsx`（sheet「非訂單匯入」，header 在第 3 列）
- 全家好賣＋：`data/step7-fixtures/<24hex>.xlsx`（Sheet1，header 在第 1 列）

欄位一律**以 header 名稱尋找**，欄位字母只作 debug 參考。

## 欄位 mapping（以本次樣本實測）

### 7-11

| 欄位 | header 關鍵字 | 樣本欄位 |
|---|---|---|
| recipientNameColumn | 收件人姓名 | H |
| trackingCodeColumn | 配送單編號 / 配送單號 / 物流單號 | I |
| storeNameColumn | 取件地址 / 取件門市 / 門市名稱 | L（實為門市名，如「全茂門市」） |
| externalOrderNoColumn | 訂單編號 | E |
| productTextColumn | 商品名稱 | M |
| statusColumn | 狀態 | F |

注意：樣本 50 列中僅 37 列有收件人姓名（部分賣場類型不帶姓名），缺姓名列無法自動配對。

### 全家

| 欄位 | header 關鍵字 | 樣本欄位 |
|---|---|---|
| recipientNameColumn | 收件人姓名 / 取件人姓名 | J |
| recipientPhoneColumn | 取件人手機 / 收件人電話 | K |
| trackingCodeColumn | 寄件編號 / 託運單號 / 物流單號 | L |
| storeNameColumn | 取件店名 | P |
| externalOrderNoColumn | 訂單編號 | C |
| shippedAtColumn | 寄件日期 | AD |
| pickedUpAtColumn | 取件日期 | AE |

兩份 Excel 的姓名/電話**本身已是遮罩值**（如 林*賢、0*7*****9*）。

## 系統訂單可比對欄位（orders）

`buyer_name`、`buyer_phone`、`recipient_name`、`recipient_phone`、
`shipping_method`（convenience_store）、`cvs_store_name`、`status`、
`tracking_code`、`tracking_provider`。比對時 recipient_* 優先，空則退回 buyer_*。

## 正規化

- 門市：去除空白/全形符號/括號/dash、去除品牌詞（7-11、統一、全家、FamilyMart）、去尾綴「門市」「店」。先 exact normalized match；contains 只能當候選（needs_review），不可單獨自動匯入。
- 電話：去除 dash/空白/括號後逐位比對，`*` 為萬用字元；**長度必須一致**。
- 姓名遮罩：第一個可見字與最後一個可見字一致即符合（高*庭 ↔ 高雅庭）；無 `*` 時 exact compare。

## 候選訂單條件（兩家共通）

1. `status` 不是 completed / cancelled
2. `tracking_code` 為空，或等於該列 trackingCode
3. `shipping_method = 'convenience_store'` 或 `cvs_store_name` 非空

## 自動配對條件

- 7-11：姓名遮罩符合 + 門市 exact normalized 符合 + 候選唯一 + trackingCode 未被他單使用
- 全家：電話遮罩符合（必要）+ 門市符合 + 姓名符合或不矛盾（不矛盾時降 confidence 並記 `name_not_verified`）+ 候選唯一 + trackingCode 未被他單使用

任一不滿足 → 進 exception，不自動寫入：

| matchStatus / errorCode | 意義 |
|---|---|
| not_found / NO_STORE_MATCH、NO_NAME_MATCH、NO_PHONE_MATCH | 找不到候選 |
| ambiguous / MULTIPLE_CANDIDATES | 候選 >1 |
| conflict / TRACKING_CODE_CONFLICT、ORDER_ALREADY_MATCHED | 單號或訂單重複占用 |
| needs_review（contains-only store match） | 需人工確認 |
| invalid / MISSING_TRACKING_CODE、MISSING_STORE_NAME | 列資料不完整 |

## 輸出

JSON 報告（per provider）：columnMapping、totalRows、matchedRows、needsReviewRows、ambiguousRows、notFoundRows、conflictRows、invalidRows、rows[]。
rows 只含遮罩姓名/電話、門市名、trackingCode、matchedOrderId、confidence、reasons。**不得輸出姓名/電話/地址原文。**

## 已知限制與下一步

1. repo 無 Excel reader 依賴；dry-run 用零依賴 zip+XML 解析（夠 spike 用）。**正式匯入需批准新增 reader（建議 exceljs 或 xlsx）。**
2. dev DB 為測試資料，與真實營運樣本無門市交集 → 真實 DB dry-run 全 not_found 屬預期；規則已用 `DRY_RUN_MOCK=1` 合成訂單驗證（matched / ambiguous / conflict 均覆蓋）。
3. 下一個最小施工任務：批准 Excel reader 依賴 → 把 parser/matcher 移入 `artifacts/api-server/src/lib/logistics/importers/`（types / parseSevenElevenSpreadsheet / parseFamilyMartSpreadsheet / matchLogisticsImportRows）＋ 單元測試，仍維持 dry-run（不寫 orders）。
