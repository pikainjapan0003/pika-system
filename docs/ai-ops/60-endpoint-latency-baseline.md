# Endpoint latency baseline (BATCH-21)

Date: 2026-08-01  
Environment: disposable `postgres:16-alpine`, loopback `127.0.0.1:55448`, synthetic data only.  
Dataset: one store, one product, 500 customers, and 5,000 orders.  
Method: the SQL shapes used by the corresponding list/detail routes were run with
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Each query was executed five times after
the first warm-up; the reported `p95 (approx.)` is the maximum of those five runs,
not a production SLO or an HTTP end-to-end measurement.

## Measurements

| Endpoint/query shape                                    | Rows returned | Median execution (ms) | p95 (approx.) (ms) | Scan/index evidence                           | Recommendation                                                                                                 |
| ------------------------------------------------------- | ------------: | --------------------: | -----------------: | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /stores/:storeId/products`                         |             1 |                 0.231 |              0.423 | `Index Scan`, `products_store_id_idx`         | No action for this dataset.                                                                                    |
| `GET /stores/:storeId/customers` (ordered by code)      |           500 |                 2.245 |              3.250 | `Seq Scan` + in-memory sort                   | Recheck with a much larger customer table; consider a `(store_id, code)` access path if it becomes a hot list. |
| `GET /stores/:storeId/orders` (ordered by created time) |         5,000 |                14.843 |             19.302 | `Seq Scan` + in-memory sort                   | Consider a `(store_id, created_at)` index before materially increasing per-store order volume.                 |
| Monthly order list (`store_id` + created-at range)      |         5,000 |                17.323 |             28.263 | `Seq Scan` + in-memory sort                   | Consider a `(store_id, created_at)` index when monthly reporting or order volume grows.                        |
| Customer order history (`customer_id` + `store_id`)     |            10 |                 0.751 |              0.946 | `Bitmap Index Scan`, `orders_customer_id_idx` | Existing customer index is used; no action for this dataset.                                                   |

## Interpretation and limits

- These are database execution measurements, not measurements of network, authentication,
  JSON serialization, or browser rendering.
- The synthetic rows intentionally share one store so that the result describes a busy
  single-store shape. It does not predict production latency or capacity.
- The two order-list shapes scan and sort all matching rows. This is a query-plan observation,
  not an authorization or correctness finding; no index or production schema change is made
  by this report.
- The disposable container was removed after the run. No production or pre-existing
  `DATABASE_URL` was used.

## Reproduction

1. Create a new PostgreSQL 16 database and insert the same synthetic row counts.
2. Run each route-shaped query with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
3. Record the plan's `Execution Time` and recursively inspect scan nodes for an index name.
4. Remove the disposable database and container.

Status: read-only baseline; follow-up index work requires a separate, reviewed package.
