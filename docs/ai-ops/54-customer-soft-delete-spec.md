# 客戶軟刪與個資遮蔽實作規格

日期：2026-07-31  
狀態：設計定案草案；本文件不授權實作。  
依據：`43-customer-deletion-options.md` 的方案 B（軟刪＋遮蔽）。

## 目標與不變條件

- 保留 customer 主鍵、歷史訂單關聯及購物金不可竄改流水。
- 封存後不得再出現在一般客戶清單、搜尋、後台建單選擇器或新交易定價流程。
- 個資處理與封存必須在同一個資料庫 transaction 完成；任何一步失敗都整筆 rollback。
- 不可刪除、改寫或用 audit log 備份購物金流水與被清除的個資。

## 欄位設計

`customers` additive 新欄：

| 欄位         | 型別                            | 規則                                          |
| ------------ | ------------------------------- | --------------------------------------------- |
| `deleted_at` | `timestamp with time zone NULL` | `NULL` 表示可使用；有值表示已封存且不可恢復。 |

沿用欄位的封存後值：

- `code`：換成 store 內唯一、不可由原代號推回的 opaque 值，例如 `deleted-<random>`。
- `name`：是否寫成「已刪除客戶 #<id>」或完全匿名值，待老闆拍板。
- `phone`、`cvs_store_id`、`cvs_store_name`、`cvs_store_address`、`cvs_store_phone`、`notes`：是否在封存時清為 `NULL`，待老闆拍板；若拍板匿名化，必須同一 transaction 清除。
- `tier`：重設為 `general`，避免封存資料影響新交易。

不得新增保存原姓名、原手機或原備註的 shadow 欄位。

## 帳本與歷史資料保留

- `store_credit_transactions` rows、金額、類型、related order 與 idempotency key 永久不由此流程變更。
- `orders.customer_id` 保持原 customer id，不設 NULL；歷史訂單仍能對帳。
- 封存前若購物金餘額不為精確 0，server 回 `409`，不得默認歸零或自動產生調整流水。
- 歷史報表可使用 opaque 顯示名指向同一 customer id，但不得重新顯示已清除個資。

## 查詢與寫入過濾

下列一般查詢一律加 `customers.deleted_at IS NULL`：

1. 客戶清單、搜尋、詳情編輯入口。
2. 後台建單的客戶選擇器與常用門市帶入。
3. 等級定價與新訂單 customer 驗證。
4. 客戶 CSV 匯出的預設資料集。

直接以已封存 customer id 建立新訂單、修改客戶或發放／調整購物金時，回 `404`，避免洩漏封存資料是否存在。歷史訂單、帳本與稽核專用查詢可包含封存客戶，但只能回 opaque 身分。

## 匯出與報表

- 一般客戶匯出排除 `deleted_at IS NOT NULL`。
- 封存前資料可攜仍走 owner-only、二次確認與 audit；封存後不提供已清除個資。
- 訂單／毛利／購物金報表保留歷史金額，客戶欄只顯示匿名標記。
- audit action 固定為 `archive_customer_and_redact_pii`，target 僅可為 opaque customer id，不得含姓名、手機、code 或 token。

## 不可逆確認流程

1. owner 在客戶詳情啟動「封存並移除個資」。
2. server 預覽影響：歷史訂單與帳本保留、哪些欄位將清除、操作不可復原；預覽不回完整個資。
3. 餘額不為 0 時回 `409` 並停止。
4. UI 要求第二次輸入固定確認文字；commit request 同時帶預覽 hash，資料漂移即拒絕。
5. server 再驗 owner、餘額、未封存狀態與 hash，在單一 transaction 寫 `deleted_at`、遮蔽欄位及 audit。
6. 成功回應只含狀態與 opaque customer id；重複呼叫回 `409`。

## 驗收案例

- 封存成功後，客戶從清單／搜尋／建單選擇器消失，歷史訂單及流水筆數與金額不變。
- 餘額非 0、缺確認文字、hash 漂移、跨店與重複封存都不得寫入。
- API、CSV、log 與 audit 均不能找到封存前姓名、手機、門市地址或備註。
- 封存 transaction 中途失敗時，`deleted_at` 與所有個資欄維持原狀。

## 待老闆拍板題卡

### 1. 是否真的匿名化姓名與手機？

- A：只設 `deleted_at`，原個資保留。實作最小，但不符合個資最小化。
- B（建議）：姓名改匿名顯示值，手機、門市與備註清空；不可復原。
- C：先軟刪，經短期等待後再匿名化。可補救誤操作，但個資會多留一段時間。

### 2. 歷史資料保留期限？

- A：依會計／法規指定固定年限後再由另案處理。
- B（保守建議）：未取得會計與法務意見前保留帳本與歷史訂單，不自動刪除；個資仍按題 1 清除。
- C：永久保留所有資料。不建議，個資與帳務保留目的不同。

未完成以上兩題拍板前，不得新增封存端點或 migration。
