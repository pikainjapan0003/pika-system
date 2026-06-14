# Step 7O 7-11 Minimal Preview Adapter Spike

**Date**: 2026-06-14
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7O-711-MINIMAL-PREVIEW-ADAPTER-SPIKE
**Author**: Claude A（worker = claude-a）

---

## 1. 結論

本輪完成 preview-only fixture spike。
adapter POC（`sevenElevenAdapter.ts`）存在且可用，parser / normalization / bridge 以 fixture HTML 驗證全部 PASS。
未打外部：無安全測試 tracking code，不執行外部 HTTP 查詢。
OCR / captcha 狀態：**BLOCKED** — tesseract NOT_FOUND（此執行環境未安裝）。
無正式寫入：未寫 DB、未改 supportsAutoSync、未改 provider whitelist。
**本輪狀態：PARTIAL**（fixture parser 可行，外部查詢 / OCR 未驗證）。

---

## 2. Spike 結果

| 項目 | 結果 | 證據 | 備註 |
|------|------|------|------|
| adapter POC 是否存在 | YES | `adapters/sevenElevenAdapter.ts` | endpoint + parser + OCR flow 已實作 |
| endpoint 是否可用 | KNOWN | `https://eservice.7-11.com.tw/e-tracking/search.aspx` | 前次 feasibility 已確認 |
| fixture parser 是否可用 | PASS | Test 1–5 全 PASS（見下方） | fixture HTML → 3 events 解析正確 |
| normalizeSevenElevenStatus | 10/10 PASS | 含 picked_up / arrived_store / in_transit / returned / exception / pending / unknown | 純函式，無外部依賴 |
| bridgeSevenElevenResult | PASS | success + error 兩路徑皆正確 | 型別轉換橋接完整 |
| OCR / captcha 是否可用 | NOT_AVAILABLE | `which tesseract` → NOT_FOUND | 此 env 未安裝 tesseract；無法實測 |
| 外部查詢是否執行 | NO | 無安全測試 tracking code，不打外部 | fetchImpl 以 mock 替代 |
| normalized preview result 是否可產生 | YES（fixture） | `normalizedStatus: "arrived_store"`, `latestStatusText: "已到店"` | 以 fixture 資料驗證 |
| DB write 是否為否 | YES | 無 DB 操作 | adapter 本身標明「本檔不寫 DB」 |
| supportsAutoSync 是否未變動 | YES | 未修改 providers.ts / logisticsProviders.ts | |
| provider whitelist 是否未變動 | YES | 未修改 logisticsSync.ts MANUAL_PROVIDER_WHITELIST | |

---

## 3. Preview-only 輸出格式

以下為 fixture spike 實際產生的 preview event shape（tracking code REDACTED）：

```
provider:          "711"
normalizedStatus:  "arrived_store"
latestStatusText:  "已到店"
latestEventAt:     "2026/06/14 10:30:00"
events:
  - occurredAt: "2026/06/14 10:30:00" | status: "已到店"
  - occurredAt: "2026/06/14 08:00:00" | status: "配送中"
  - occurredAt: "2026/06/13 15:00:00" | status: "交寄建立"
```

`bridgeSevenElevenResult` 輸出型別為 `TrackingAdapterResult<"711">`，與其他 provider 格式一致。

---

## 4. 缺口

1. **OCR 可靠性（核心阻礙）**：tesseract 未安裝於此執行環境，無法測試真實驗證碼辨識。即使安裝，成功率在正式環境中仍未確認。
2. **是否有免 captcha 替代 API**：7-11 是否有不需 captcha 的 JSON endpoint（app API / 非公開）仍未知。
3. **無真實安全測試 tracking code**：無法在不打外部的情況下做端對端驗證；現有 `test-seven-eleven-adapter.mjs` 中的 code 屬外部 spike 用途，非本輪範圍。

---

## 5. 下一步

**→ Step 7O-711-OCR-OR-SOURCE-VALIDATION**

原因：fixture parser 已驗證可行，阻礙是 OCR 執行環境（tesseract 未安裝）及是否有替代 API。
下一步需確認：(a) tesseract 是否可安裝於正式/staging 環境，或 (b) 是否存在免 captcha 的 7-11 tracking endpoint。

---

## 6. 明確未做

- 未 production write
- 未 DB mutation
- 未改 supportsAutoSync
- 未改 provider whitelist
- 未把 7-11 加入正式自動同步
- 未加入 MANUAL_SYNC_PROVIDERS
- 未 Publish
- 未 push
- 未打外部 7-11 endpoint
- 未執行真實 OCR / tesseract
- 未修改任何 route / worker / cron
