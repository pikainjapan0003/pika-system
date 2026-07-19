# Step 7F — FamilyMart Tracking Worker 排程入口

## 入口

| 用途                                              | 指令                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| 排程正式跑（建議 Workflow 用）                    | `pnpm step7:familymart-worker`                                                |
| 等價 node 指令                                    | `node scripts/step7/run-familymart-worker-scheduled.mjs`                      |
| 手動 dry-run（不寫 DB）                           | `DRY_RUN=1 LIMIT=5 node scripts/step7/run-familymart-worker-scheduled.mjs`    |
| 手動正式跑（manual_worker，沿用既有 once script） | `LIMIT=20 TIMEOUT_MS=15000 node scripts/step7/run-familymart-worker-once.mjs` |

scheduled script 與 once script 差異：

- `run-familymart-worker-scheduled.mjs`：`run_type = scheduled_worker`、預設 `LIMIT=20`、`TIMEOUT_MS=15000`，且啟動前有防重檢查（見下）。
- `run-familymart-worker-once.mjs`：`run_type = manual_worker`，支援 `TRACKING_ID` 指定單筆重查，無防重檢查。

## 環境變數（scheduled script）

| 變數         | 預設   | 說明                            |
| ------------ | ------ | ------------------------------- |
| `LIMIT`      | 20     | 單輪最多處理筆數                |
| `TIMEOUT_MS` | 15000  | 單筆查詢 timeout                |
| `DRY_RUN`    | 0      | `1` = 只查不寫 DB、不寫 run log |
| `STORE_ID`   | （無） | 不填 = 全店家                   |

輸出僅含遮罩後 trackingCode（`1634****9811`）與狀態摘要，不輸出姓名 / 電話 / 地址 / raw response。

## 防止同時執行（方案 B：scheduling script 前置檢查）

scheduled script 啟動時查 `shipment_tracking_run_logs`：

- `provider = familymart`
- `run_type = scheduled_worker`
- `status = running`
- `started_at` 在最近 30 分鐘內

若存在 → 輸出 `already_running: runLogId=... — skip this round` 並 `exit 0`，不啟動第二輪。

注意事項：

- 不使用 process lock 檔案（Replit 重啟可能殘留）。
- 殘留保護：若上一輪 crash 導致 run log 永遠停在 `running`，30 分鐘窗口過後 lock 自動失效，排程恢復執行。
- 已知限制：兩個 process 在「查詢 → 寫入 running run log」的毫秒級窗口內同時啟動仍可能重疊，但 events 有 idempotency_key 防重，重疊的副作用僅是多打一次 endpoint。
- `manual_worker`（once script）不受此 lock 影響，方便手動除錯。

## Replit Workflow 建議設定

> 注意：本輪**未**修改 `.replit`，以下為使用者自行設定 Workflow 時的建議。

- 名稱：`familymart-tracking-worker`
- 指令：`pnpm step7:familymart-worker`
- 頻率：初期 **每 1 小時**，穩定一週後可縮短到每 30 分鐘

初期建議：

1. 先手動 dry-run 確認輸出正常。
2. 設每 1 小時、`LIMIT=20`（預設即是）。
3. 觀察 `shipment_tracking_run_logs` 與 `shipment_tracking_exceptions` 數天。
4. 穩定後再考慮 30 分鐘頻率。

worker 本身的巡查節流（與排程頻率疊加）：

- 成功且未終態 → `next_check_at` = 6 小時後，期間排程跑到也不會重查同一筆。
- retryable 失敗 → backoff `min(6h, 30min × failureCount)`。
- 終態（picked_up / delivered / returned）→ `next_check_at = null`，停止巡查。

## 風險

1. 全家 endpoint 是未公開 API，格式或防爬策略可能無預警變動 → non-retryable 會寫 `shipment_tracking_exceptions`，需定期查看。
2. 網路錯誤會 retry backoff，不會立即標記失敗。
3. 請勿設過高頻率（< 30 分鐘）打 endpoint，避免被封鎖。
4. lock 為查詢式防重，非 DB 層原子鎖（見上方已知限制）。
