# Step 7O 7-11 Manual Preview PROVIDER_NOT_ALLOWED Fix

## 1. 結論

- 狀態：needs-review（code + tests PASS，尚未人工 UI 再驗收）
- 未寫 DB
- 未開正式同步
- commit route 仍拒絕 7-11

## 2. 問題

UI 顯示「7-11（預覽）」，按「重新查詢」後 API 回：

```
PROVIDER_NOT_ALLOWED
此物流目前不支援手動查詢
```

## 3. 根因

雙重精確比對問題：

1. **Backend preview route interception**（`logisticsSync.ts`）：
   只攔截 `reqProvider === "711"` 精確字串。若前端送 `"7-11"`（DB alias），
   不被攔截，落入 `validateManualProviderRequest` → PROVIDER_NOT_ALLOWED。

2. **`handle711Preview` DB row 比對**（`logisticsSync.ts`）：
   只接受 `r.trackingProvider === "711"` 精確值。若 DB 中存的是 `"7-11"`
   （直接插入而未經 PATCH normalization），回 PROVIDER_MISMATCH。

3. **Frontend provider normalization 缺失**（`ManualTrackingSyncPanel.tsx`）：
   前端從 `shipmentTracking.trackingProvider` 直接取值送 API，
   若 DB 存 `"7-11"` 則 `isManualSyncProvider("7-11")` 為 false，panel 不顯示。

最可能的觸發路徑（UI 截圖情境）：
- DB `trackingProvider = "711"` → panel 顯示
- 前端送 `provider: "711"`
- 但部署的 backend 尚未執行 commit 50e4cd4（無 711 preview routing）
- 舊後端 `validateManualProviderRequest` → PROVIDER_NOT_ALLOWED

## 4. 修復

### Backend (`artifacts/api-server/src/routes/logisticsSync.ts`)

新增 helper：
```typescript
function normalizeSevenElevenProvider(provider: string | null | undefined): "711" | null {
  if (!provider) return null;
  const s = provider.trim().toLowerCase();
  if (s === "711" || s === "7-11" || s === "seven-eleven" || s === "seveneleven" || s === "seven_eleven") return "711";
  return null;
}
```

Preview route 攔截：
```diff
-if (reqProvider === "711") {
+if (normalizeSevenElevenProvider(reqProvider) === "711") {
```

`handle711Preview` DB 比對：
```diff
-if (rows.some((r) => r.trackingProvider !== "711")) {
+if (rows.some((r) => normalizeSevenElevenProvider(r.trackingProvider) !== "711")) {
```

### Frontend (`artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx`)

新增 helper：
```typescript
function isSevenElevenProvider(p: string | null | undefined): boolean {
  if (!p) return false;
  const s = p.trim().toLowerCase();
  return s === "711" || s === "7-11" || s === "seven-eleven" || s === "seveneleven" || s === "seven_eleven";
}
```

Provider normalization：
```diff
-const provider = shipmentTracking?.trackingProvider ?? null;
+const rawProvider = shipmentTracking?.trackingProvider ?? null;
+const provider = isSevenElevenProvider(rawProvider) ? ("711" as const) : rawProvider;
```

### Tests (`artifacts/api-server/src/routes/logisticsSyncManualProvider.route.test.mjs`)

新增：
- alias DB row（`trackingProvider = "7-11"`）
- `provider: "7-11"` + alias row → 200, dryRun=true
- `provider: "seven-eleven"` + canonical row → 200, dryRun=true
- `provider: "7-11"` + postoffice row → 400 PROVIDER_MISMATCH
- `commit provider: "7-11"` → 400 INVALID_PROVIDER

## 5. 安全邊界

- 未 production write
- 未 DB mutation
- 未改 supportsAutoSync
- 未改 provider formal whitelist（`MANUAL_PROVIDER_WHITELIST = ["postoffice", "tcat"]`）
- 未送 /manual-provider/commit
- 未 Publish
- 未 push
- 未顯示完整 tracking code
- commit route 仍拒絕 "711" 與 "7-11" 任何 alias

## 6. 下一步

若 route / typecheck / local tests 通過但還沒重新人工看 UI：

**Step 7O-711-MANUAL-PREVIEW-UI-QA-RETRY**

如果已能在瀏覽器確認 7-11 預覽成功：

**Step 7O-711-PREVIEW-ONLY-CLOSEOUT**
