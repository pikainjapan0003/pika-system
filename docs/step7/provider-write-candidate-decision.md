# Step 7P Provider Write Candidate Decision

**日期**：2026-06-26
**分支**：qa/step6f-cvs-store-selection-browser-mobile
**步驟**：7P-PROVIDER-WRITE-CANDIDATE-DECISION
**作者**：Claude A（worker = claude-a）

---

## 結論

```text
Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION = COMPLETED / PASS
```

本文件為決策文件，不含任何程式碼施工、DB 寫入、或 one-shot commit 授權。

決策結果：

| Provider | 目前層級 | Published UI | previewHash | duplicate-only | 建議 | 下一步 |
|---|---|---|---|---|---|---|
| familymart | Level 4 — Formal Auto Sync | PASS | 不適用 | 不適用 | 不參與 | 維持正式自動同步 |
| postoffice | Level 1 — Manual Preview-Only | PASS | hash-present | PASS | **第一順位 one-shot write candidate** | 另開 one-shot authorization |
| tcat | Level 1 — Manual Preview-Only | PASS | hash-present | PASS | **第二順位 one-shot write candidate** | 另開 one-shot authorization |
| 711 | Level 1 — Manual Preview-Only | PASS | hash-null | 未驗證寫入候選 | **暫不列入第一批** | 維持 preview-only |

---

## 1. Provider 現況

### 截圖驗收結果（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）

| Provider | 訂單 | 外部事件 | DB 事件 | 可新增 | previewHash | 有無寫入按鈕 |
|----------|------|---------|---------|-------|-------------|------------|
| familymart | #41 | 不適用（Level 4 auto-sync） | 不適用 | 不適用 | 不適用 | 不適用 |
| postoffice | #39（tracking ****0005） | 5 筆 | 5 筆 | 0 筆（duplicate-only） | hash-present | 無 |
| tcat | #40（tracking ****7146） | 4 筆 | 4 筆 | 0 筆（duplicate-only） | hash-present | 無 |
| 711 | #42（tracking ****0295） | 8 筆 | 不查（preview-only） | 不計算 | hash-null | 無 |

### 安全邊界確認

```text
COMMIT_ENABLED = false（ManualTrackingSyncPanel.tsx:147）
/manual-provider/commit 未呼叫
MANUAL_SYNC_PROVIDERS = ["postoffice", "tcat", "711"]
711 不在正式 commit 路徑
supportsAutoSync：familymart=true；其餘全為 false
DB write：未執行
```

---

## 2. 決策條件

每個 provider 以下列十項條件評估：

| 條件 | postoffice | tcat | 711 |
|------|-----------|------|-----|
| 1. Published UI 已 PASS | ✅ | ✅ | ✅ |
| 2. previewHash 狀態可靠（hash-present） | ✅ | ✅ | ❌（hash-null） |
| 3. 外部事件數穩定 | ✅（5 筆） | ✅（4 筆） | ✅（8 筆） |
| 4. DB 既有事件可判斷 | ✅（5 筆 DB 事件） | ✅（4 筆 DB 事件） | ⚠️（不查 DB，preview-only） |
| 5. 可清楚計算可新增事件 | ✅（0 筆，duplicate-only） | ✅（0 筆，duplicate-only） | ⚠️（不計算，preview-only） |
| 6. no write button 安全證據 | ✅（截圖確認） | ✅（截圖確認） | ✅（截圖確認） |
| 7. 無 provider-specific 風險阻礙 | ✅ | ✅ | ⚠️（hash-null；OCR 依賴） |
| 8. 適合 one-shot write candidate | ✅ | ✅ | ❌（暫不列入） |
| 9. 應停在 Level 1 | ✅（Level 不升；僅列候選） | ✅（Level 不升；僅列候選） | ✅ |
| 10. 需要更多樣本才進一步評估 | 否（可進入授權評估） | 否（可進入授權評估） | 是（建議補 hash-present 樣本） |

---

## 3. 候選排序

```text
第一順位：postoffice
  - hash-present 確認
  - duplicate-only 可計算
  - Published UI PASS
  - 無 provider-specific 障礙

第二順位：tcat
  - hash-present 確認
  - duplicate-only 可計算
  - Published UI PASS
  - 已有 #36 one-shot 成功先例（J5F-7H-B）

暫不列入：711
  - Published UI PASS
  - hash-null（無法驗證 previewHash 完整性）
  - 不查 DB / 不計算 duplicate-only
  - 未達 one-shot write 前置條件
```

---

## 4. Provider-by-provider Decision

### postoffice

**建議：第一順位 one-shot write candidate**

**理由**：
- Published UI Screenshot Evidence PASS（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
- previewHash = hash-present（可驗證 commit 一致性）
- 外部 5 筆 / DB 5 筆 / 可新增 0 筆（duplicate-only 成立，資料穩定）
- 無寫入按鈕（截圖確認）
- adapter / production E2E 已驗證（J5A～J5E，order #39）

**限制**：
- 目前仍為 Level 1 — Manual Preview-Only，層級**不升**
- 進入候選不等於已授權寫入
- 下一步仍需另開 one-shot authorization task，填妥完整授權欄位
- postoffice #38（外部 6 / DB 0 / 可寫 6，最新貨態「投遞成功」）為已知 can-write candidate，可優先考慮；惟授權需另開

### tcat

**建議：第二順位 one-shot write candidate**

**理由**：
- Published UI Screenshot Evidence PASS（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
- previewHash = hash-present（可驗證 commit 一致性）
- 外部 4 筆 / DB 4 筆 / 可新增 0 筆（duplicate-only 成立，資料穩定）
- 無寫入按鈕（截圖確認）
- 已有 #36 one-shot production commit 成功先例（J5F-7H-B，外部 5 / DB 0 → 寫入 5 筆，最新貨態「順利送達」，gate 已關回）

**限制**：
- 目前仍為 Level 1 — Manual Preview-Only，層級**不升**
- 進入候選不等於已授權寫入
- #36 成功不代表 tcat 常態寫入可開放，僅代表單一 one-shot 路徑可行
- 下一步仍需另開 one-shot authorization task

### 711

**建議：暫不列入第一批 one-shot write candidate**

**理由**：
- Published UI Screenshot Evidence PASS（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
- 但 previewHash = hash-null（無法驗證 commit 一致性，不符合 one-shot 前置條件）
- 目前 UI 設計不查 DB / 不計算 duplicate-only（preview-only 模式）
- 未達 one-shot write 前置條件

**後續評估方向**：
- 確認 711 adapter 是否能產出 hash-present
- 補充 DB duplicate-only 驗證流程
- 達到 hash-present + duplicate-only 計算後，才可重新評估進入候選

**維持**：Level 1 — Manual Preview-Only；不開 commit route；不開 DB write；不開 auto-sync

### familymart

**不參與 candidate decision**

- 維持 Level 4 — Formal Auto Sync
- 不進 manual preview 流程
- 不在 `MANUAL_SYNC_PROVIDERS` 內
- 無需額外決策

---

## 5. 不開放項目

無論本輪決策結果為何，以下均**永不自動開放**：

```text
不開常態正式寫入（non-one-shot production write）
不開任何 provider 的 scheduled sync（除 familymart 既有路徑）
不開 711 commit route
不把 postoffice / tcat 升至 Level 3 / Level 4
不把任何 candidate decision 視為已授權
不把 duplicate-only 樣本視為「可寫入資料」（duplicate-only = 無新事件）
不自動升級 supportsAutoSync
```

---

## 6. one-shot write 前置條件

任何 provider 進行 one-shot write 前，必須全部滿足：

```text
1. Published UI QA PASS（截圖或等效驗收）
2. previewHash = hash-present
3. 外部事件數、DB 事件數、可新增事件數明確
4. 使用者提供明確 Authorization Text，包含：
   - provider
   - orderId
   - trackingCode（明確，不僅 last4）
   - expectedEventCount
   - explicit approval phrase
5. COMMIT_ENABLED 僅在授權期間設為 true
6. 寫入後立即關回 gate（COMMIT_ENABLED = false）
7. close gate 後必須重新查詢，確認 duplicate-only
8. 不得開 scheduled sync
9. 不得開常態正式寫入
10. 不得把 Level 1 誤升為 Level 3 / Level 4
```

---

## 7. 安全門規則

未來任何 one-shot write 都必須符合以下十三條：

```text
1. 單一 provider
2. 單一 order
3. 單一 tracking
4. 使用者明確授權（Authorization Text 格式，見 manual-provider-commit-release-gate-decision.md）
5. 寫入前 preview 已確認外部事件數、DB 事件數、可新增事件數
6. previewHash 必須為 hash-present
7. confirmText / expected count / latest status 必須一致
8. COMMIT_ENABLED 不得長期打開
9. 寫入後必須立刻 close gate
10. close gate 後必須重新查詢 duplicate-only
11. 不得開 scheduled sync
12. 不得開常態正式寫入
13. 不得把 Level 1 誤升為 Level 3 / Level 4
```

---

## 8. 下一步

```text
Step 7P-ONE-SHOT-WRITE-SAFETY-GATE
```

目的：

```text
正式建立 postoffice / tcat one-shot write safety gate 規格。
確認 Authorization Text 格式、gate 開關流程、close gate 後驗收步驟。
不直接開寫入，只建立規格文件與流程。
```

> 注意：若使用者決定不立即開 one-shot write，可直接跳至 Step 8 進行其他功能。
> 本輪決策僅代表「postoffice / tcat 技術條件符合候選門檻」，不代表「已獲授權寫入」。

---

## 安全邊界

本輪以下操作均**未執行**：

```text
未改 runtime code
未 production write
未 DB mutation
未呼叫 /manual-provider/commit
未改 COMMIT_ENABLED
未改 supportsAutoSync
未改 provider whitelist
未開 scheduled sync
未 push GitHub
未 Publish
未暴露完整 tracking code
未暴露完整 previewHash
```

---

## 參考文件

| 文件 | 內容 |
|------|------|
| `docs/step7/step7p-published-ui-screenshot-evidence-closeout.md` | Published UI 截圖驗收結果 |
| `docs/step7/manual-preview-all-providers-qa.md` | Step 7P 統一 QA closeout |
| `docs/step7/provider-rollout-decision-matrix.md` | 各 provider Support Level 決策表 |
| `docs/step7/provider-rollout-policy.md` | Provider rollout 政策 |
| `docs/step7/manual-provider-commit-release-gate-decision.md` | one-shot authorization 格式、Rollback Plan |
| `docs/step7/manual-provider-production-can-write-candidates.md` | postoffice #38 / tcat #36 can-write candidate 詳情 |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md` | tcat #36 one-shot commit 收尾 |
