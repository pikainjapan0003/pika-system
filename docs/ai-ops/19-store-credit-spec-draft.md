# 購物金正式規格

- 拍板日期：2026-07-20
- 規格定案日期：2026-07-31
- 狀態：**正式規格**
- 拍板出處：Dream-system `13_USER_DECISION_LOG.md`「2026-07-20 答題卡 22 題全數拍板」

## 1. 核心原則

購物金是店鋪內、綁定既有客戶的付款工具。它不改商品成交單價、不改
`total_price`，也不改成本或毛利快照。所有金額使用 PostgreSQL `numeric`
及 `ExactDecimal`；禁止 JavaScript 浮點數參與金額計算。

帳本採不可變流水。餘額永遠由 credit 流水減 debit 流水精確加總得出，
不得另存一個可直接覆寫的餘額欄。已入帳流水禁止 UPDATE 或 DELETE；
修正只能新增反向流水。

## 2. C1–C8 拍板值

| 編號 | 正式規則                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | 購物金只由店主手動發放；本版不接受客人儲值，也不做消費回饋自動發放。                                                                                      |
| C2   | 每單可折抵至應付金額恰為 0；不得超過訂單應付金額或客戶可用餘額。                                                                                          |
| C3   | 訂單第一次轉為 `cancelled` 時，自動全數回沖該單原 spend；原 spend 不修改，新增一筆 reversal。重複或併發取消不得重複回沖。取消前 UI 必須明示將退回的金額。 |
| C4   | 購物金永久有效；本版沒有到期日或到期扣除。                                                                                                                |
| C5   | 餘額禁止為負；扣款必須在資料庫交易內鎖定客戶帳本並精確驗餘額，不能只靠 UI。                                                                               |
| C6   | 只有經 `requireAuth` 與 `verifyStoreOwner` 驗證的店主能手動調整。                                                                                         |
| C7   | 購物金是付款工具，不是折扣；使用購物金不改成交毛利。                                                                                                      |
| C8   | 必須先選定已建檔的 `customer_id` 才能使用；禁止用手機或其他個資自動猜歸戶。                                                                               |

## 3. 資料模型

`store_credit_transactions` 是 append-only 帳本：

| 欄位               | 規則                                  |
| ------------------ | ------------------------------------- |
| `store_id`         | 必填；所有讀寫先綁店鋪。              |
| `customer_id`      | 必填；帳本屬於明確客戶。              |
| `direction`        | 僅 `credit` / `debit`。               |
| `type`             | 僅 `grant` / `spend` / `reversal`。   |
| `amount`           | `numeric(30,12)` 且大於 0。           |
| `related_order_id` | grant 為空；spend/reversal 指向訂單。 |
| `note`             | 可空；不得存 token 或明文個資。       |
| `created_by`       | 操作者 opaque ID。                    |
| `created_at`       | 帳本建立時間。                        |

同一訂單最多一筆 spend、最多一筆 reversal。資料庫 unique index 是最後一道
冪等防線；應用層仍須在同一交易中鎖定帳本並先檢查。

訂單另外保存：

- `credit_spent`：成交時實際使用的購物金，預設 0。
- `payable_after_credit`：原訂單應付金額減購物金後的結果。

兩欄都不取代或重寫既有 `unit_price`、`total_price`、`shipping_fee`、
`discount_amount`、成本快照或毛利快照。

## 4. 店主手動發放

1. 店主選定同店客戶。
2. 輸入明確且大於 0 的 decimal 金額。
3. 後端重新驗證 owner 與 customer 的店鋪歸屬。
4. 新增 `direction=credit, type=grant` 流水。
5. 回傳由完整帳本精確加總的新餘額。

不得提供直接覆寫餘額、負額扣減或匿名客戶發放。

## 5. 建單折抵

1. 先依既有規則算出成交價、運費及其他既有訂單金額。
2. 只有選定 `customer_id` 後才接受正數 `credit_spent`。
3. 同一資料庫交易內取得該客戶 advisory lock、重讀流水並計算餘額。
4. 驗證 `0 ≤ credit_spent ≤ min(可用餘額, 訂單應付金額)`。
5. 建立訂單並寫 `credit_spent`、`payable_after_credit`。
6. 正數折抵同交易新增 `direction=debit, type=spend` 流水。
7. 任一步失敗則整筆 rollback，訂單與 spend 都不得留下半套資料。

匿名單與未選客戶的訂單仍可正常建立，但購物金必須為 0。

## 6. 取消回沖

第一次把有正數 `credit_spent` 的訂單轉為 `cancelled` 時：

1. 鎖定訂單列及該客戶帳本。
2. 找到該訂單唯一的原 spend。
3. 若尚無 reversal，新增等額 `direction=credit, type=reversal` 流水。
4. 在同一交易內更新訂單狀態。

重複取消是成功 no-op；併發取消最終也只能存在一筆 reversal。訂單若日後由
店主恢復狀態再取消，已存在的 reversal 不再新增第二筆。

## 7. 權限、個資與稽核

- 管理端全部走 `requireAuth`＋`verifyStoreOwner`。
- 客人公開端不得輸出餘額、流水、成本或毛利欄。
- 流水與 audit target 只用 opaque 客戶／訂單／流水 ID。
- 不記 token、登入密鑰、明文姓名、手機、地址或付款資訊。
- 明文購物金流水匯出不在本版；未來若做，另走二次確認與 audit gate。

## 8. 本版不做

- 客人儲值或任何金流串接。
- 消費回饋、自動贈點或依客戶等級自動發放。
- 效期、到期批次扣除或到期通知。
- 負餘額、透支或 owner 強制負額。
- 員工角色與分級調整權限；目前僅店主。
- 部分退款、比例退款或現金／購物金混合退款公式。
- 將購物金視為折扣、改寫毛利或重算歷史訂單。
