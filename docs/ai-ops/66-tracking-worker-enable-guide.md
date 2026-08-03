# 貨態自動同步啟用指南（BATCH-22 包12）

日期：2026-08-03

## 老闆先看這段

**目前先不要開啟寫入，也不要建立 Phase 2 排程。** 安全寫入鏈已補強並通過拋棄式資料庫測試，但正式排程網址 `/internal/logistics/sync/scheduled` 現在接的是「全家」舊 worker，不是郵局／黑貓的 Phase 2。只設定 `TRACKING_WORKER_WRITE_ENABLED=true` 不會把 Phase 2 接上排程，也不會控制現有全家排程。

正確順序是：先完成 Phase 2 排程 route 接線與 route 測試，交 Fable 5 審查，再觀察只讀結果至少 7 天；確認抓取正確後，最後才由老闆親自打開寫入開關。現在任何人都不應代替老闆設定環境變數或建立排程。

## 現況：兩條鏈不可混用

| 項目               | 現行 `/internal/logistics/sync/scheduled` | Phase 2 安全寫入鏈               |
| ------------------ | ----------------------------------------- | -------------------------------- |
| provider           | 全家                                      | 郵局、黑貓                       |
| 是否已接排程 route | 是                                        | **否**                           |
| 寫入開關           | 不受 `TRACKING_WORKER_WRITE_ENABLED` 控制 | 只有逐字小寫 `true` 才可寫       |
| 防重疊             | 10 分鐘 running log 查詢，非原子 lease    | PostgreSQL advisory lease        |
| 本批結論           | 維持既有行為                              | 安全核心完成，排程接線仍待後續包 |

因此，本文件記錄的是「通過後要怎麼操作」，不是現在的啟用授權。

## 未來通過審查後的 Replit 設定步驟

以下步驟必須等 Phase 2 route 接線、拋棄式 DB route tests、Fable 5 終審全部通過後才可執行。

1. 在 Replit 建立一組足夠長、不可猜測的 `CRON_SYNC_SECRET`。
2. Scheduled Deployment 使用 `POST` 呼叫正式核准的 Phase 2 endpoint。若後續仍沿用 `/internal/logistics/sync/scheduled`，必須先確認該 route 的程式碼已真的呼叫 Phase 2，而不是目前的全家 worker。
3. request header 設為 `x-internal-sync-secret: <CRON_SYNC_SECRET>`。不得把 secret 放在 URL、query string、日誌或畫面文字。
4. 建議頻率先設每 60 分鐘一次。通過觀察後，若物流量需要再另案調整；不要用高頻率補救錯誤。
5. 一開始將 `TRACKING_WORKER_WRITE_ENABLED` 保持未設定或設為 `false`。未精確等於小寫 `true` 時，Phase 2 必須 fail closed，不得寫入。

## 先只跑不寫：至少觀察 7 天

1. 保持 `TRACKING_WORKER_WRITE_ENABLED` 未設定或為 `false`。
2. 每天檢查差異報告與 audit，抽查郵局、黑貓各至少數筆假資料／可安全核對的訂單。
3. 比對物流官網的最新事件、時間與系統預覽是否一致。
4. 觀察是否出現 provider 錯誤、日期無法解析、一次超過 50 筆、preview drift、ownership mismatch 或 lease unavailable。
5. 連續至少 7 天沒有錯誤更新，且 Fable 5 對觀察紀錄放行後，才進入寫入啟用決策。

## 怎麼看 audit 判斷是否正常

同一輪以匿名 `runId` 串起來，目標字串不應包含姓名、電話、tracking code、token 或 preview hash。

- `tracking_write_started`：本輪開始。
- `tracking_write_completed`：單一 job 的 snapshot、events 與 audit 已在同一 transaction 完成。
- `tracking_write_finished`：整輪成功結束。
- `tracking_write_partial`：前面可能已有 job 完成，後面失敗；要人工查明，不能直接重跑。
- `tracking_write_aborted`：異常門檻或 preview drift 觸發，應保持零新增寫入。

正常觀察至少要能從 started 對到 finished；看到 partial、aborted 或只有 started 沒有 finished，都先視為異常。

## 最後才開寫入

通過所有前置審查後，由老闆在 Replit Production secrets 將：

```text
TRACKING_WORKER_WRITE_ENABLED=true
```

值必須精確為小寫 `true`。這是高風險開關；不得寫進 repo、不得貼在聊天記錄，也不得由程式自動改值。

## 出事時的一步關閉

在 Replit Production secrets 將 `TRACKING_WORKER_WRITE_ENABLED` 刪除或改為 `false`，再停用 Phase 2 Scheduled Deployment。先關閉、保留 audit 與 run log，不要立即重跑；由審查者依 runId、partial／aborted 紀錄與 DB transaction 結果判斷是否需修復。

## 尚未完成的啟用前條件

- 將 Phase 2 明確接到專用 scheduled route，不能與現行全家 worker 混淆。
- route 必須使用 Phase 2 advisory lease，不可只依賴先查 running log。
- route tests 必須證明 secret 缺失拒絕、防重疊、run/audit correlation，以及 gate 關閉時零寫入。
- 以上完成並再經 Fable 5 放行前：**不得設定 `TRACKING_WORKER_WRITE_ENABLED=true`，不得建立 Phase 2 Replit 排程。**
