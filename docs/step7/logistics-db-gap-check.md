# Step 7C — Logistics DB Gap Check

檢查日期：2026-06-10（read-only：schema 檔 + information_schema，未寫 DB、未新增 migration）

## 一、現況總覽

| 表                           | schema 檔                                      | 實際 DB | 結論                                     |
| ---------------------------- | ---------------------------------------------- | ------- | ---------------------------------------- |
| shipment_trackings           | ✅ lib/db/src/schema/shipmentTrackings.ts      | ✅ 存在 | 幾乎齊全，缺 1 欄                        |
| shipment_tracking_events     | ✅ lib/db/src/schema/shipmentTrackingEvents.ts | ✅ 存在 | 齊全（部分欄位名不同但語意等價）         |
| logistics_import_batches     | ❌                                             | ❌      | 缺整張表                                 |
| logistics_import_rows        | ❌                                             | ❌      | 缺整張表                                 |
| shipment_tracking_exceptions | ❌                                             | ❌      | 缺整張表                                 |
| shipment_tracking_run_logs   | ❌                                             | ❌      | 缺整張表（但 agent_run_logs 模式可參考） |

DB 實際 public tables：agent_run_logs, cvs_stores, orders, product_categories, products, seller_agent_settings, seller_agent_tokens, shipment_tracking_events, shipment_trackings, stores。

## 二、逐表欄位比對

### shipment_trackings（存在）

| 需求欄位              | 現況                                                              |
| --------------------- | ----------------------------------------------------------------- |
| orderId               | ✅ order_id（FK orders, cascade）                                 |
| provider              | ✅ tracking_provider（名稱不同，語意等價）                        |
| trackingCode          | ✅ tracking_code                                                  |
| latestStatusText      | ✅ latest_event_status + latest_event_description（拆兩欄，等價） |
| latestEventAt         | ✅ latest_event_at                                                |
| lastCheckedAt         | ✅ last_checked_at                                                |
| nextCheckAt           | ✅ next_check_at                                                  |
| failureCount          | ✅ failure_count                                                  |
| checkError            | ✅ check_error                                                    |
| isActive              | ✅ is_active                                                      |
| **sourceType**        | ❌ **缺**（無法區分 file_import / manual / agent 來源）           |
| createdAt / updatedAt | ✅                                                                |

另有 tracking_status（pending/checking/active/delivered/failed/inactive）超出需求，對 worker 有利。
缺索引建議：`(tracking_provider, tracking_code)` unique 或 index，防跨訂單重複占用單號（matcher 的 TRACKING_CODE_CONFLICT 目前只在記憶體判斷）。

### shipment_tracking_events（存在）

| 需求欄位           | 現況                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| shipmentTrackingId | ✅ shipment_tracking_id（FK, cascade）                                                                      |
| provider           | ⚠️ 表上沒有，但可經 shipment_trackings join 取得（denormalize 非必要）                                      |
| trackingCode       | ⚠️ 同上，join 可得                                                                                          |
| occurredAt         | ✅ occurred_at                                                                                              |
| statusText         | ✅ event_description                                                                                        |
| location           | ✅ event_location                                                                                           |
| normalizedStatus   | ✅ event_status（含 enum：unknown/pending/in_transit/arrived_store/picked_up/delivered/returned/exception） |
| rawText            | ⚠️ 無獨立欄位，可放 raw_data(jsonb) 內                                                                      |
| rawData            | ✅ raw_data                                                                                                 |
| idempotencyKey     | ✅ idempotency_key（含 (tracking_id, key) unique）                                                          |
| createdAt          | ✅                                                                                                          |

結論：等價可用，不需 migration（provider/trackingCode/rawText 屬 nice-to-have denormalization）。

### logistics_import_batches（缺整張）

需新增全部欄位：provider, file_name, uploaded_by, status（draft/confirmed/cancelled）, total_rows, matched_rows, needs_review_rows, ambiguous_rows, not_found_rows, conflict_rows, invalid_rows, created_at, confirmed_at。
建議補：store_id（綁店家 scope，呼應 7B 風險「endpoint 未綁 store」）。

### logistics_import_rows（缺整張）

需新增全部欄位：batch_id(FK), row_number, tracking_code, recipient_name_masked, recipient_phone_masked, store_name, external_order_no, matched_order_id(FK orders nullable), match_status, confidence, reasons(jsonb), error_code, raw_row_json(jsonb), created_at。
個資注意：只存遮罩值；raw_row_json 若含原始列資料需先遮罩再存，或不存名稱/電話欄。

### shipment_tracking_exceptions（缺整張）

需新增全部欄位：order_id(FK nullable), shipment_tracking_id(FK nullable), provider, tracking_code, error_code, message, status（open/resolved/ignored）, resolved_at, created_at。

### shipment_tracking_run_logs（缺整張）

需新增全部欄位：run_type, provider, started_at, finished_at, status, total_jobs, success_count, failed_count, skipped_count, error_summary, created_at。
可直接仿 agent_run_logs 模式（含「error_message 不可含個資/token」註解慣例）。

## 三、是否足夠做 Step 7B-LOGISTICS-IMPORT-CONFIRM？

**不足（PARTIAL）。**

- 最小可行（只寫 orders.tracking_code + 建 shipment_trackings）：現有兩張表「勉強可行」，但缺 `source_type` 會無法稽核來源，且**缺 batch/rows 表就沒有「老闆確認」的持久化載體**——confirm 流程需要先存 dry-run 結果（batch+rows）再讓老闆按確認，否則 confirm 與 dry-run 之間檔案內容可能不一致。
- 結論：IMPORT-CONFIRM 前必須先補 batches + rows 兩張表；exceptions / run_logs 可延後到 worker 階段（7D）。

## 四、建議 migration 順序

1. **Step 7C-M1-IMPORT-BATCH-TABLES**：新增 logistics_import_batches + logistics_import_rows（含 store_id scope）。IMPORT-CONFIRM 的硬依賴。
2. **Step 7C-M2-TRACKING-SOURCE-TYPE**：shipment_trackings 加 source_type（file_import/manual/agent）＋ (tracking_provider, tracking_code) 防重索引。小、低風險。
3. **Step 7C-M3-EXCEPTIONS-TABLE**：shipment_tracking_exceptions。worker/例外佇列（7D）前置。
4. **Step 7C-M4-RUN-LOGS-TABLE**：shipment_tracking_run_logs。worker 排程（7D）前置，可與 M3 併一個 migration。

migration 機制注意：lib/db/migrations 目前只有 0001_seller_agent_settings.sql，多數表疑似由 drizzle push 直接同步；新表建議沿用現行流程（drizzle schema 檔 + push 或 SQL migration，需與使用者確認慣例）。
