# Step 7O 7-11 Tracking Lightweight Feasibility

**Date**: 2026-06-14
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7O-711-TRACKING-LIGHTWEIGHT-FEASIBILITY
**Author**: Claude A（worker = claude-a）

---

## 1. 結論

7-11 是 Step 7 的核心目標之一，不是永久 blocked。
本輪只做 feasibility 確認，不施工、不改 code。
Tracking endpoint 已知（`eservice.7-11.com.tw/e-tracking/search.aspx`），adapter POC 已存在。
最大阻礙是 captcha 要求 OCR，目前 OCR 在正式環境的可靠性未確認，也未知是否有免 captcha 的替代 API。
下一個最小任務：`Step 7O-711-MINIMAL-PREVIEW-ADAPTER-SPIKE`（驗證 OCR 可靠性 / 找替代 API）。

---

## 2. 目前已知

### 其他 provider 現況（簡述）
| provider | 狀態 |
|----------|------|
| familymart | Level 3 — 正式自動同步，已上線 |
| postoffice | Level 1 — Manual Preview-Only，COMMIT_ENABLED=false |
| tcat | Level 1 — Manual Preview-Only，#36 one-shot 驗證完成，gate 已關 |
| 7-11 | Level 0 — Blocked / Research Only（本輪目標） |

### 7-11 目前狀態
- `supportsAutoSync: false`（`providers.ts` / `logisticsProviders.ts`）
- 不在 `MANUAL_SYNC_PROVIDERS`（前端 `ManualTrackingSyncPanel.tsx`）
- 不在後端 `MANUAL_PROVIDER_WHITELIST`（`logisticsSync.ts`）
- dry-run worker：`manualSyncEnabled=true, controlledWorkerEnabled=false`（gate-only，不外部查詢）

### 現有 code 線索（已存在，未上線）
| 檔案 | 說明 |
|------|------|
| `adapters/sevenElevenAdapter.ts` | 7-11 tracking adapter POC；endpoint、HTML parser、OCR flow 已寫 |
| `adapters/sevenElevenAdapter.ts` | `bridgeSevenElevenResult`：型別轉換橋接，Step 7N-C 已完成 |
| `adapters/sevenElevenAdapter.ts` | `normalizeSevenElevenStatus`：貨態 normalize 已完成 |
| `importers/parseSevenElevenSpreadsheet.ts` | 7-11 賣貨便 Excel 批次匯入（功能性，已在 `LogisticsImport.tsx` 使用） |
| `workers/multiProviderDryRunWorker.ts` | 711 gate 定義：manualSyncEnabled=true / controlledWorkerEnabled=false |

---

## 3. 7-11 tracking 缺口

| 項目 | 狀態 |
|------|------|
| Tracking endpoint | KNOWN：`https://eservice.7-11.com.tw/e-tracking/search.aspx`（GET→POST with VIEWSTATE） |
| Tracking code 格式 | KNOWN：8 / 11 / 12 位數字（`isValidOrderId`） |
| 回傳貨態格式 | KNOWN：HTML `#timeline_status` UL，`#query_no` span，時間格式 `YYYY/MM/DD HH:mm` |
| Captcha 需求 | REQUIRED：4 位數字圖片（`ValidateImage.aspx`），每次查詢必要 |
| OCR 可靠性（正式環境） | UNKNOWN：tesseract POC 存在，但正式環境 PATH / 成功率未確認 |
| 替代免 captcha API | UNKNOWN：未找到 7-11 的 JSON API；是否存在未知 |
| Preview-only 接入可行性 | 條件式 POSSIBLE：若 OCR 可靠或有替代 API，現有 adapter bridge 可接 preview flow |

---

## 4. 最小可行路線

1. **確認 OCR 可靠性 / 替代 API**：在 staging 環境測試 `sevenElevenAdapter.ts`，確認 tesseract 是否安裝且 OCR 成功率是否可用；同時調查是否有不需 captcha 的 7-11 交貨便 API（非公開文件或 app endpoint）。
2. **若有可用查詢路徑，做 preview-only spike**：不寫 DB、不接 worker；只驗證 adapter 返回正確的 `TrackingAdapterResult<"711">`，並通過 `bridgeSevenElevenResult` 型別橋接。
3. **通過後再評估是否納入 manual preview UI**：仍不開 production write、不改 supportsAutoSync、不改 provider whitelist，僅作為 preview-only 功能。

---

## 5. 明確不做

- 不改 code
- 不新增 7-11 支援（不進 MANUAL_SYNC_PROVIDERS / MANUAL_PROVIDER_WHITELIST）
- 不開 production write
- 不改 supportsAutoSync
- 不碰 emap import endpoint
- 不做 final closeout
- 不開 COMMIT_ENABLED

---

## 6. 下一步建議

**→ Step 7O-711-MINIMAL-PREVIEW-ADAPTER-SPIKE**

原因：Tracking endpoint 與格式已知，adapter POC 已存在；阻礙是 OCR 可靠性與是否有替代 API，屬於 spike 驗證範疇，不需要先做 source confirmation。
