# FamilyMart Tracking Worker（Step 7F）

手動執行的全家貨態巡查 worker，把 `queryFamilyMartTracking` adapter 接到 DB 更新流程。無排程。

## 檔案

- `artifacts/api-server/src/lib/logistics/workers/familyMartTrackingWorker.ts`
- `scripts/step7/run-familymart-worker-once.mjs` — 手動跑一次
- `scripts/step7/test-familymart-worker-db-smoke.mjs` — live + DB smoke（手動）

## API

`runFamilyMartTrackingWorker(input?, deps?)`

input：`{ storeId?, limit? (預設 20), now?, dryRun?, trackingIds?, timeoutMs?, runType?, createdBy? }`

撈取條件：provider=familymart、is_active=true、tracking_status ∈ (pending, checking, active, failed)、
next_check_at is null 或 <= now。指定 `trackingIds` 時略過 next_check_at gate（方便手動重查）。

output：`{ ok, provider, runLogId, dryRun, totalJobs, successCount, failedCount, skippedCount, results[] }`

deps：`{ queryTracking? }` 可注入 mock adapter 供單元測試。

## 成功更新規則

- tracking_status：pending→pending、delivered→delivered、exception→failed、其餘（in_transit / arrived_store / picked_up / returned / unknown）→active
- latest_event_status = adapter normalizedStatus；latest_event_description = latestStatusText
- latest_event_at：全家「YYYY/MM/DD HH:mm」字串以 +08:00 解析
- last_checked_at = now、failure_count = 0、check_error = null
- next_check_at：終態貨態（picked_up / delivered / returned）→ null（停止巡查）；其餘 → now + 6h

## 失敗更新規則

- last_checked_at = now、failure_count += 1、check_error = `errorCode: message`（截 300 字）
- retryable（NETWORK_FAILED / TIMEOUT / 5xx）：tracking_status 保留原狀，next_check_at = now + min(6h, 30min × failureCount)
- non-retryable（NO_RESULT / INVALID / PARSER_FAILED…）：tracking_status = failed，next_check_at = null
- 同時寫 shipment_tracking_exceptions：source_type=worker、status=open、severity=warning（retryable）/ error（non-retryable）

## Events 防重

idempotency_key = `familymart:<trackingCode>:<occurredAt 原始字串>:<eventDescription>`，
配合 DB unique (shipment_tracking_id, idempotency_key) + `onConflictDoNothing`。
occurred_at 為 NOT NULL，日期 parse 不出的事件跳過不寫。raw_data 僅物流節點欄位，無個資。

## Run log

每輪寫一筆 shipment_tracking_run_logs（dryRun 不寫）：開始 status=running，
結束更新 success（無失敗，含 totalJobs=0）/ partial / failed 與計數。
error_summary 只放 errorCode 計數（如 `NO_RESULTx1`）。

## dryRun

查 adapter 但完全不寫 DB（trackings / events / exceptions / run log 全略過），runLogId = null。

## 手動執行

```
DRY_RUN=1 LIMIT=5 node scripts/step7/run-familymart-worker-once.mjs
TRACKING_ID=11 node scripts/step7/run-familymart-worker-once.mjs
```

輸出 trackingCode 一律遮罩（`1634****9811`）。
