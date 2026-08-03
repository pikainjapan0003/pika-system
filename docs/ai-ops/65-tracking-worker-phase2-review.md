# S-16 Phase 2 貨態寫入鏈啟用前審查（BATCH-22 包 10）

日期：2026-08-03

性質：唯讀安全報告；本包沒有修改 worker、route、環境變數、排程或資料庫。

審查範圍：`trackingWorkerPhase2.ts`、`trackingWorkerPhase2Runtime.ts`、`multiProviderControlledWriteWorker.ts`、`multiProviderDryRunWorker.ts`、`internalLogisticsSync.ts` 與公開追蹤回應。

## 1. 結論

**目前不准啟用 Phase 2 真寫入，也不准把 Replit 排程直接接到 Phase 2。**

既有程式具備精確字串 kill-switch、簽章 preview、全批 re-preview、50 事件異常門檻、provider 白名單及匿名 audit，方向正確；但仍有五個啟用前阻塞點：

1. commit 階段沒有消費已驗證 preview，而是再次呼叫 provider，存在 preview 驗證後到寫入前的資料漂移。
2. controlled writer 只用 `trackingId` 查資料，未把 job 的 `storeId`、`orderId`、active 狀態綁進寫入條件。
3. 一個 job 的 tracking snapshot、events、exception 與 run log 更新不是同一 transaction；批次也允許前半成功、後半失敗。
4. `>50` 門檻只看 preview 宣稱的可寫 event 數，沒有在真正 insert 前再次核對實際事件數；每次 commit 又重新抓 provider。
5. 現有 `/internal/logistics/sync/scheduled` 接的是既有全家 worker，不是 Phase 2。排程 route 的 10 分鐘 running 查詢也不是原子 lease，兩個同時進來仍可能一起通過。

包 11 必須先補完以上防線並有反證測試；否則包 12 只能寫成「尚不可啟用」的操作指南。

## 2. 什麼情況才會寫入

Phase 2 orchestration 的第一道 gate 是 `TRACKING_WORKER_WRITE_ENABLED` 必須逐字等於小寫 `true`；未設、空字串、`false`、`TRUE` 都會丟出 `TrackingWorkerPhase2NotEnabledError`（`trackingWorkerPhase2.ts:128-136`）。runtime 包裝層沒有自行改環境變數（`trackingWorkerPhase2Runtime.ts:95-104`）。

通過 gate 後，每一個 job 必須：

- provider 是 `postoffice` 或 `tcat`（Phase 2 型別及 controlled writer 白名單；`trackingWorkerPhase2.ts:16-20`、`multiProviderControlledWriteWorker.ts:217-228`）。
- dry-run preview 成功，且能簽出 preview token（`trackingWorkerPhase2Runtime.ts:20-53`）。
- 全批預估新增事件不超過 50（`trackingWorkerPhase2.ts:142-149`）。
- preview token 內容與 job／preview 相符，且第二次 preview 的事件數、最新文案、時間與 normalized status 全相同（`trackingWorkerPhase2.ts:151-162`）。
- controlled writer 查得到相同 `trackingId`，且 DB 的 provider、tracking code 與 job 相同（`multiProviderControlledWriteWorker.ts:231-248`）。

真正寫入的資料表只包含 shipment tracking snapshot、tracking events、tracking exceptions、run logs 及 Phase 2 audit；它不直接修改 `orders.status`、金額、客戶或訂單成本快照。

## 3. preview hash 與防漂移

### 已有防線

- token payload 包含 store、tracking、provider、code、事件數、最新狀態文字、時間與 normalized status（`trackingWorkerPhase2Runtime.ts:37-53`）。
- verify 逐欄比對 token payload 與記憶體中的 job／preview（`trackingWorkerPhase2Runtime.ts:56-72`）。
- orchestration 在第一筆 commit 前完成全批 re-preview；任何一筆不同會整批 abort 並記 `tracking_write_aborted`（`trackingWorkerPhase2.ts:151-162`）。

### 啟用前缺口（必修）

`runtimeDeps.commit` 沒有使用傳入的已驗證 preview；它呼叫 `runControlledDbWrite`，後者會再次向 provider 取一次資料（`trackingWorkerPhase2Runtime.ts:73-88`、`multiProviderControlledWriteWorker.ts:250-270`）。換言之，真正寫進 DB 的是第三次外部回應，不是 hash 驗證過的第二次回應。若第三次狀態或事件改變，hash 防漂移不會阻止它。

**必修原則：** commit 必須寫入「已驗證 preview 所對應的不可變 payload」，或在同一次受控 writer 呼叫內完成 fetch→hash 驗證→transactional commit；不得在驗證後重新抓取未驗證資料。

## 4. `>50` 異常門檻

常數為 50，條件是 `expectedChanges > 50` 才 abort，因此恰好 50 可繼續（`trackingWorkerPhase2.ts:5-7,142-149`）。此外 controlled writer 自身限制單批最多 5 jobs，runtime 現在每次 commit 只送一個 job。

缺口是門檻只合計 initial preview 的 `expectedEventCount`；真正 commit 會再次抓 provider，沒有確認第三次回應仍在同一事件數內。必須先關閉上一節的 TOCTOU，並在 transaction 前再次以實際待 insert 筆數執行同一門檻。門檻超標時應零寫入、留下匿名 aborted audit。

## 5. kill-switch 是否真的能擋

**在直接呼叫 Phase 2 orchestration 的路徑上可以。** 判斷是嚴格的 `!== "true"`，fail-closed，且發生在 preview／adapter／DB write 之前（`trackingWorkerPhase2.ts:128-140`）。既有測試覆蓋未設、false、大小寫與 true。

但現有 scheduled endpoint 根本沒有呼叫 Phase 2；它呼叫 `runFamilyMartTrackingWorker`（`internalLogisticsSync.ts:79-83`）。所以切換 `TRACKING_WORKER_WRITE_ENABLED` 不會控制現有全家排程。啟用文件若把兩條鏈混為一談，會造成老闆以為已關閉 Phase 2，實際上操作的是另一支 worker。

## 6. 失敗、部分成功與 rollback

orchestrator 先完成全批 preview／verify，再逐 job commit（`trackingWorkerPhase2.ts:138-180`）。commit #2 失敗時，job #1 已寫入，不會回滾；程式會為已完成 job 留 completed audit，再留 run-level partial audit，然後把錯誤往外丟。

controlled writer 內部同一 job 的 snapshot update、event inserts、exception insert、run-log update 亦不是包在同一 transaction（`multiProviderControlledWriteWorker.ts:293-338,374-413,436-449`）。因此中途 DB 例外可能留下「snapshot 已更新但 events 未全寫」或「資料已寫但 run log 還是 running」。

**啟用前必修：**

- 每個 job 的 scope 重查、snapshot、events／exception、run log／audit 必須在單一 transaction；任一步失敗，該 job 零寫入。
- 批次允許逐 job 成功，但每一筆必須有 durable completed/failed audit；run-level 最終狀態必須保證落地。
- 不承諾整批 rollback；文件要明說是「逐件原子、整批可 partial」。

## 7. DB scope 與白名單

controlled writer 會由 tracking row join order 讀出真實 `storeId`，但查詢條件只有 `trackingId IN (...)`（`multiProviderControlledWriteWorker.ts:157-178`）。後續只驗 provider/code，沒有驗 job 的 `storeId`、`orderId`，也沒有驗 `shipment_trackings.is_active=true`（`multiProviderControlledWriteWorker.ts:231-248`）；update 也只綁 tracking id（`:293-308`）。

這代表內部 job 若拿到別店 trackingId 並搭配正確 provider/code，仍可能寫到別店。雖然這不是公開路由，Phase 2 自動排程上線前仍必須把「trackingId＋orderId＋storeId＋isActive」全部綁到同一 DB row，並在 transaction 中重驗。

## 8. audit 與 run log 是否足夠

### 已有優點

- Phase 2 audit target 不含 tracking code、preview hash 或個資。
- completed audit 逐 job 留下序號與 insert 數；partial/aborted audit 按 store 留 run-level 聚合。
- controlled writer 留 total/success/failed/skipped/error summary。

### 缺口

- Phase 2 audit 與 controlled writer 各自產生紀錄，缺一個共同的不可變 correlation id；controlled writer 的 run type 仍是 `manual_worker`（`multiProviderControlledWriteWorker.ts:183-197`）。
- Phase 2 run 沒有獨立的 durable `started`／`finished` row；若在第一個 audit 前 crash，事後無從知道該 run 曾啟動。
- run log 的 provider/error summary 不能證明 hash、異常門檻、store scope 各自是否通過。

必須讓同一 `runId` 貫穿 started、每個 job 的 preview/commit outcome、partial/aborted/completed 與 finished；只存匿名 id／計數／錯誤碼，不存貨號、token 或個資。

## 9. 排程與防重疊

現有 scheduled route 使用 secret header，缺 secret 時隱藏為 404、錯 secret 為 401（`internalLogisticsSync.ts:25-45`）。它會查近 10 分鐘的 running log後跳過（`:47-76`）。

這個「先查再跑」不是 DB advisory lock、unique lease 或 compare-and-set；兩個同時請求可能都在對方寫 running log 前通過。Phase 2 排程需要原子 lease，lease key 至少區分 worker/provider，並能在 crash 後安全過期。

## 10. 最壞情況：寫錯後會發生什麼

controlled writer 可能把 `shipment_trackings.tracking_status`、`latest_event_status`、`latest_event_description`、`latest_event_at` 改成錯誤值，並插入錯誤 events；非 retryable adapter error 會把 tracking status 設為 `failed` 並新增 exception。

公開追蹤 endpoint 會直接讀 active tracking 的 status／latest event（`public.ts:582-609`），將 `failed` 對客人顯示為「需店家確認」，其他 normalized status 則轉成客人可見的貨態文案（`public.ts:633-644`）。因此最壞情況不是改壞訂單金額，而是：

- 客人看到包裹已送達／退回／需店家確認，但實際物流不是如此。
- terminal status 會令下一次檢查時間變成 null，錯誤結果可能停止自動修正。
- 錯誤事件進入歷史後，即使後續抓對，也可能留下矛盾時間線。
- scope 漏洞若被內部 job 誤配，可能更新另一家店的貨態。

## 11. 包 11 啟用前必修清單

1. 消除 preview→commit 第三次未驗證 fetch；commit 只消費已驗證 payload。
2. transaction 內重驗 trackingId/orderId/storeId/isActive/provider/code，所有 update 都綁相同 scope。
3. 每 job transaction；run-level started/final/partial 必定落 audit，統一 correlation id。
4. 以真正待寫 events 再驗一次 50 筆門檻，超標零寫入。
5. scheduled Phase 2 使用原子 lease；不得把現有 FamilyMart route 誤稱為 Phase 2。
6. 對上述每項補反證測試：舊 payload 漂移、跨店 id、inactive row、job 中途 DB error、51 events、同時兩請求。

在六項全部完成且測試／拋棄式 DB 演練通過前，`TRACKING_WORKER_WRITE_ENABLED` 必須保持未設或非 `true`，不得建立 Phase 2 Replit 排程。

## BATCH-22 包11補強結果（2026-08-03）

Commit `1cc6947` 已完成核心寫入鏈補強：preview token 綁定訂單 id 與 payload digest、commit 前不再第三次抓取、交易內以店鋪／訂單／provider／貨態碼／啟用狀態精確鎖定、snapshot／events／audit 原子寫入、以實際事件數執行 50 筆閘門，並加入 PostgreSQL process lease 與 partial audit。相關 14 條測試全綠，其中 5 條為拋棄式 PostgreSQL 整合測試。

排程入口仍未接上 Phase 2：現有 `/internal/logistics/sync/scheduled` 是 FamilyMart 流程，不能冒充本鏈。包12已把安全啟用步驟寫成操作指南；包13因此依規 skipped。在另包完成專用 route 接線、route 測試與終審前，禁止設定 `TRACKING_WORKER_WRITE_ENABLED=true` 或建立排程。
