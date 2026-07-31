# 新資料表索引盤點

日期：2026-07-31  
範圍：`store_credit_transactions` 與 `order_picking_checks`。  
方法：唯讀比對 schema 索引及現行 route 查詢；未修改 schema 或 migration。

## 結論

- 兩張表的日常 route 查詢大致都有索引支援，未發現立即性的全表掃描風險。
- `order_picking_checks` 的讀取、單項更新、重複保護與 order cascade 均有合適索引。
- 主要缺口是 `store_credit_transactions.customer_id` 沒有單欄前綴索引；PostgreSQL 在刪除／更新 customer 時進行 FK 反查，可能掃描整張購物金帳本。
- 購物金餘額目前會讀取該客戶完整流水後在應用層精確加總；資料量大時是 O(N)，但這不是立即性的正確性問題。

## `store_credit_transactions`

### 既有索引

- `(store_id, customer_id, created_at)`：`storeCreditTransactions.ts:63`
- `related_order_id`：`:68`
- spend／reversal partial unique：`:69`
- `(store_id, idempotency_key)` partial unique：`:75`

### 查詢對應

| 查詢                                | 證據                                     | 判斷                                                                                             |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 店鋪＋客戶讀完整帳本算餘額          | `customers.ts:169`、`orders.ts:496,1995` | 命中 `(store_id, customer_id, …)` 前綴；只讀該客戶 rows，不是全表掃描。                          |
| 帳本分頁 `created_at DESC, id DESC` | `customers.ts:183`                       | 可反向掃描 `created_at`，但索引未含 `id` tie-breaker，可能需要額外排序；深頁 offset 會逐漸變慢。 |
| idempotency 查詢                    | `customers.ts:282`                       | `(store_id, idempotency_key)` partial unique 精確匹配。                                          |
| 依訂單查流水、阻擋刪單              | `orders.ts:1685`                         | `related_order_id` 精確匹配。                                                                    |
| 一單一次 spend／reversal            | `orders.ts:585,2024`                     | 兩個 partial unique index 正確保護。                                                             |

### 風險與建議

#### 中度：customer FK 反查可能全表掃描

`customer_id` FK 是 restrict（`storeCreditTransactions.ts:44`）。現有複合索引以 `store_id` 開頭，不能直接服務只用 `customer_id` 的 FK 反查。建議另案新增：

```sql
CREATE INDEX store_credit_transactions_customer_id_idx
  ON store_credit_transactions (customer_id);
```

#### 低度：帳本排序未完整涵蓋 `id DESC`

資料量明顯成長時，可評估：

```sql
(store_id, customer_id, created_at DESC, id DESC)
```

正式新增或替換前，應在代表性假資料庫用 `EXPLAIN (ANALYZE, BUFFERS)` 驗證，不可只靠推測移除舊索引。

#### 低度：餘額為每客戶 O(N)

同一 GET 先讀全部 rows 算 balance，再讀一次分頁（`customers.ts:169,183`）。未來可改成 PostgreSQL `numeric SUM(CASE…)` 加 `count(*)`，但必須保留 decimal 精確度，且需金額包獨立審查。

## `order_picking_checks`

### 既有索引

- unique `(order_id, item_key)`：`orderPickingChecks.ts:37`
- `order_id`：`:41`

### 查詢對應

| 查詢                                  | 證據                          | 判斷                                    |
| ------------------------------------- | ----------------------------- | --------------------------------------- |
| 多訂單 `order_id IN (…)` 載入勾選     | `orders.ts:747`               | `order_id` 索引直接匹配。               |
| 單項取消與回讀 `(order_id, item_key)` | `orders.ts:825,835`           | unique composite index 精確匹配。       |
| 重複勾選 `ON CONFLICT DO NOTHING`     | `orders.ts:815`               | unique composite index 正確提供衝突鍵。 |
| 刪除 order 時 cascade                 | `orderPickingChecks.ts:27-29` | `order_id` 索引支援 FK cascade。        |

目前沒有缺索引或明顯 full-scan 風險。`order_id` 單欄索引理論上可由 unique composite 的左前綴替代，但單欄索引較窄，對批次讀取及 cascade 可能更便宜；沒有 `EXPLAIN` 實證前不建議移除。

## 建議優先序

1. 下一個允許 additive migration 的基建包，加入 `store_credit_transactions(customer_id)`。
2. 資料量成長後再實測 ledger 分頁索引與餘額 O(N) 成本。
3. `order_picking_checks` 暫不調整索引。
