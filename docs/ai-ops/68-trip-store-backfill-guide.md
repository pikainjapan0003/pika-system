# 行程資料店鋪歸屬回填指南

更新日期：2026-08-03

## 先看白話版

這次先讓新建的行程與路線自動記住店鋪，舊資料暫時仍可使用。正式資料庫的舊行程尚未自動回填；老闆必須先確認舊資料全部屬於哪一家店，再另開一次有紀錄的正式回填。確認完成前，不得把欄位改成必填，也不得自行猜店鋪。

## 本批已完成

- `0026_trip_store_ownership_nullable.sql` 只為 `trips` 與 `trip_routes` 新增 nullable `store_id` 與索引。
- 五條 trips API 已從登入 merchant 的唯一店鋪解析 owner，並執行 `requireAuth`、`verifyStoreOwner` 與 store-scoped 查詢。
- 新資料會寫入目前店鋪；舊的 `store_id IS NULL` 資料只在正式回填過渡期內保留可見。
- 前端仍使用既有 `/trips` API；資料篩選由後端完成，因此不需要修改 generated client。

## 正式回填前的唯讀確認

在正式資料庫的受控 SQL 工具中依序執行下列唯讀查詢，保存原文結果：

```sql
SELECT id, merchant_id, name
FROM stores
ORDER BY id;
```

```sql
SELECT
  (SELECT count(*) FROM trips WHERE store_id IS NULL) AS trips_without_store,
  (SELECT count(*) FROM trip_routes WHERE store_id IS NULL) AS routes_without_store;
```

```sql
SELECT
  count(*)::text AS captured_count,
  sum(profit_snapshot_transport_cost_twd)::text AS captured_transport_sum
FROM orders
WHERE profit_snapshot_status = 'captured';
```

只有在老闆能明確指出「所有未歸屬行程都是同一家店」時才可繼續。如果資料可能屬於多家店，立即停止並逐筆整理，不得選第一家店或用最小 ID 猜測。

## 拋棄庫演練工具

`scripts/backfill-trip-store.mjs` 只供本機或拋棄式資料庫演練，必須明確提供連線字串與店鋪 ID；它不會讀取環境中的 `DATABASE_URL`，且會拒絕含 Replit／production 標記的目標。

預覽（不寫入）：

```powershell
corepack pnpm --filter ./scripts exec tsx ./backfill-trip-store.mjs --database-url "<拋棄庫連線字串>" --store-id <店鋪ID>
```

演練套用：

```powershell
corepack pnpm --filter ./scripts exec tsx ./backfill-trip-store.mjs --database-url "<拋棄庫連線字串>" --store-id <店鋪ID> --apply
```

演練通過條件：dry-run 後資料不變；apply 的 trips/routes 更新筆數符合預覽；route 與 parent trip 的 `store_id` 一致；captured 交通成本快照的 count 與 numeric sum 逐字相同。

## 正式回填的批准流程

1. 保存上述三組唯讀查詢的結果。
2. 由老闆明示唯一目標店鋪 ID。
3. 另開正式回填派工，逐行審核 SQL、rollback、操作者與執行窗口。
4. 正式回填前後重跑 captured snapshot 查詢，兩個字串值都必須完全相同。
5. 回填後確認 `trips.store_id IS NULL` 與 `trip_routes.store_id IS NULL` 都是 0，且 route 與 parent trip 無不一致。
6. 只有完成以上證據後，才另開 additive migration 加 `NOT NULL` 與 `stores(id)` foreign key。

本批沒有執行正式回填、沒有連正式資料庫，也沒有建立 NOT NULL／FK。
