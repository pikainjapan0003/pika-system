# Step 7O 7-11 Manual Preview Integration

## 1. 結論

- 7-11 已接進手動 preview 查詢路徑 ✓
- 可透過 `/manual-provider/preview` route 觸發 sevenElevenAdapter 查詢 ✓
- preview 結果可顯示事件數、最新貨態、取件門市、取件期限 ✓
- DB 未寫入任何資料（dryRun: true, commitDisabled: true）✓
- 未開正式同步 ✓
- 仍需 UI / runtime 人工驗收（尚未在瀏覽器中實際確認 7-11 訂單的 UI 顯示）

## 2. 實作範圍

### Backend

- `artifacts/api-server/src/routes/logisticsSync.ts`
  - 新增 import：`trackSevenElevenShipment`、`bridgeSevenElevenResult`（sevenElevenAdapter）
  - 新增 `handle711Preview(req, res)` 函式：
    - 驗證 storeOwner、trackingIds、storeScope、providerMatch（7-11 only）
    - 呼叫 `trackSevenElevenShipment` + `bridgeSevenElevenResult`
    - 回傳 `commitDisabled: true`、`previewHash: null`、`previewHashAvailable: false`
    - 永不寫 DB
  - preview route（`/manual-provider/preview`）：provider=711 時提前進入 `handle711Preview`，不走 `validateManualProviderRequest` + `runControlledDbWrite` 路徑

### Frontend

- `artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx`
  - `MANUAL_SYNC_PROVIDERS` 加入 `"711"`（preview-only）
  - `PreviewJob` interface 加入 `commitDisabled?`、`pickupStoreName?`、`pickupDeadline?`、`eventCount?`
  - provider=711 時：顯示 `"7-11（預覽）"` 標籤
  - 隱藏「已存在於 DB」欄位（7-11 preview 不查 DB 重複）
  - 顯示取件門市 / 取件期限（如後端提供）
  - `previewReadyCanCommit` + provider=711：顯示「7-11 目前為預覽模式，尚未開放寫入」而非 commit 按鈕
  - `canShowModal`：provider=711 時不開確認 modal
  - footer：provider=711 時顯示「7-11 目前為預覽模式，尚未開放寫入。此查詢不寫入任何資料。」

### Tests

- `artifacts/api-server/src/routes/logisticsSyncManualProvider.route.test.mjs`
  - 新增 `mock.module()` for `sevenElevenAdapter.ts`（不打真外部、不需 tesseract）
  - 新增 `sevenElevenTrackingId` 測試用 DB row（provider=711）
  - 原「711 rejected 400」測試更新為「PROVIDER_MISMATCH」（provider=711 + 非711 tracking id）
  - 新增「711 preview 成功」測試：200、dryRun、commitDisabled、previewHash=null、DB 不變

### Docs

- `docs/step7/711-manual-preview-integration.md`（本檔）

## 3. 安全邊界

- 未 production write
- 未 DB mutation（shipment_tracking_events / shipment_trackings 均不寫入）
- 未改 supportsAutoSync（providers.ts 不變）
- 未改 provider whitelist（MANUAL_PROVIDER_WHITELIST 仍為 `["postoffice", "tcat"]`）
- 未加入正式自動同步（cron / scheduled sync 不變）
- 未送 /manual-provider/commit（commit route 仍拒絕 provider=711 → INVALID_PROVIDER 400）
- 未顯示完整 tracking code（maskTrackingCode 邏輯不變）
- 未 Publish
- 未 push
- COMMIT_ENABLED 維持 false

## 4. 驗收結果

| 項目 | 結果 |
|------|------|
| 7-11 normalization test | ✓ 通過（8/8 patterns, 見 step7O fix commit） |
| backend preview 新增 7-11 支援 | ✓（handle711Preview 實作） |
| preview route 仍拒絕 provider=711 + 非711 tracking id | ✓ PROVIDER_MISMATCH 400 |
| commit route 仍拒絕 provider=711 | ✓（MANUAL_PROVIDER_WHITELIST 不含 711） |
| UI build / typecheck | ✓（pnpm build 通過） |
| backend typecheck / build | ✓（tsc 通過） |
| 7-11 preview 測試（mock adapter） | ✓（200、commitDisabled=true、previewHash=null） |
| DB 不寫入 | ✓（countEvents=0 斷言） |

## 5. 下一步

UI 代碼已實作但尚未在瀏覽器中以真實 7-11 訂單確認 UI 顯示與互動：

**Step 7O-711-MANUAL-PREVIEW-UI-QA**

若 tesseract 5.3.4 在 API runtime 已確認可用，且 UI 已通過人工確認後：

**Step 7O-711-PREVIEW-ONLY-CLOSEOUT**
