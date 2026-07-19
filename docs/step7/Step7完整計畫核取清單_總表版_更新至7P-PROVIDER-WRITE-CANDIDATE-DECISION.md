# Step 7 完整計畫核取清單（總表版）— 更新至 7P-PROVIDER-WRITE-CANDIDATE-DECISION

**日期**：2026-06-26
**分支**：qa/step6f-cvs-store-selection-browser-mobile
**步驟**：7P-PROVIDER-WRITE-CANDIDATE-DECISION
**作者**：Claude A（worker = claude-a）

---

## 0. 版本說明

本版本以 `Step7完整計畫核取清單_總表版_更新至7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA.md` 為基底，
新增 Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT 與 Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION 的完成記錄。

---

## 1. Step 7 核心目標

> 完成物流追蹤層，讓代購系統可以安全、可控地處理多物流商貨態，而不是亂開所有物流正式寫入。

---

## 2. 總表

| 區塊                              | 項目                                                                  | 狀態                                     | 備註 / commit                                                                            |
| --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Provider — familymart             | 正式自動同步                                                          | ✅ Done                                  | `supportsAutoSync: true`，僅 familymart；正式運作中，不進 manual UI                      |
| Provider — postoffice             | adapter / preview / production E2E                                    | ✅ Done                                  | J5A～J5E，order #39 / trackingId=2，insertedEventCount=5，delivered                      |
| Provider — tcat                   | adapter / preview / production E2E                                    | ✅ Done                                  | J6A～J6E，order #40 / trackingId=3，insertedEventCount=4，delivered                      |
| Owner UI                          | manual provider preview / confirm / commit（ManualTrackingSyncPanel） | ✅ Done                                  | J5F-1～12（含 7A～7H、7H-A～7H-C、FINAL-CLOSEOUT）                                       |
| Owner UI                          | tcat #36 one-shot production commit                                   | ✅ Done                                  | J5F-7H-B，外部5 / DB0 → 寫入5筆，最新貨態「順利送達」                                    |
| Owner UI                          | one-shot gate 關回                                                    | ✅ Done                                  | J5F-7H-C，`COMMIT_ENABLED` 恢復 `false`                                                  |
| Owner UI                          | J5F final closeout                                                    | ✅ Done                                  | commit `46158dc`（docs-only）                                                            |
| Brand                             | 畫夢代購 / DrawDream UI 文案更名                                      | ✅ **PASS**                              | Step 7N-BRAND-COPY-UI-RENAME-DRAWDREAM，commit `2a1a2f4`                                 |
| QA                                | mobile / brand / logistics UI closeout                                | ✅ **PASS**                              | Step 7N-MOBILE-BRAND-QA-CLOSEOUT，commit `800ee68`                                       |
| Provider — 7-11                   | 可行性研究                                                            | ✅ Done                                  | Step 7O-711-LIGHTWEIGHT-FEASIBILITY                                                      |
| Provider — 7-11                   | adapter spike                                                         | ✅ Done                                  | Step 7O-711-MINIMAL-PREVIEW-ADAPTER-SPIKE                                                |
| Provider — 7-11                   | OCR / captcha 驗證                                                    | ✅ Done                                  | Step 7O-711-OCR-OR-SOURCE-VALIDATION                                                     |
| Provider — 7-11                   | 真實 E2E 查詢                                                         | ✅ Done                                  | Step 7O-711-FULL-PREVIEW-E2E-TEST；取得 8 筆外部貨態事件                                 |
| Provider — 7-11                   | normalization 穩定性                                                  | ✅ Done                                  | Step 7O-711-E2E-STABILITY-RETRY；2/8 → 8/8 correct                                       |
| Provider — 7-11                   | manual preview integration                                            | ✅ Done                                  | Step 7O-711-MANUAL-PREVIEW-INTEGRATION；commit `50e4cd4`                                 |
| Provider — 7-11                   | provider alias fix                                                    | ✅ Done                                  | Step 7O-711-MANUAL-PREVIEW-PROVIDER-NOT-ALLOWED-FIX；commit `f12f464`                    |
| Provider — 7-11                   | tesseract runtime fix（workspace）                                    | ✅ Done                                  | Step 7O-711-RUNTIME-TESSERACT-FIX；commit `325a35f`                                      |
| Provider — 7-11                   | Published runtime 診斷                                                | ✅ Done                                  | Step 7O-711-PUBLISHED-RUNTIME-TESSERACT-FIX；commit `8ea5c11`                            |
| Provider — 7-11                   | replit.nix tesseract enable                                           | ✅ Done                                  | Step 7O-711-REPLIT-NIX-TESSERACT-ENABLE；commit `74de9b3`                                |
| Provider — 7-11                   | Published UI QA                                                       | ✅ **PASS**                              | Step 7O-711-PREVIEW-ONLY-CLOSEOUT；使用者截圖驗收                                        |
| Provider — 7-11                   | Level 1 manual preview-only closeout                                  | ✅ **PASS**                              | 2026-06-26；7-11 Level 1；未正式寫入；未 auto-sync                                       |
| Manual Preview All Providers QA   | docs + repo safety check                                              | ✅ **PASS**                              | Step 7P；commit `cbf8856`                                                                |
| Manual Preview All Providers QA   | provider policy consistency（Level 4 修正）                           | ✅ **PASS**                              | familymart=Level 4；Step 7P-POSTOFFICE-TCAT-PUBLISHED-UI-QA-CLOSEOUT；commit `956378f`   |
| Manual Preview All Providers QA   | 7-11 Published UI QA                                                  | ✅ **PASS**                              | Step 7O / Step 7P 截圖驗收                                                               |
| Manual Preview All Providers QA   | postoffice Published UI QA                                            | ✅ **Screenshot Evidence PASS**          | Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT；order #39；tracking \*\*\*\*0005；commit `2ff7f7d` |
| Manual Preview All Providers QA   | tcat Published UI QA                                                  | ✅ **Screenshot Evidence PASS**          | Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT；order #40；tracking \*\*\*\*7146；commit `2ff7f7d` |
| Provider Write Candidate Decision | postoffice candidate                                                  | ✅ **第一順位 one-shot write candidate** | hash-present；duplicate-only PASS；Level 不升                                            |
| Provider Write Candidate Decision | tcat candidate                                                        | ✅ **第二順位 one-shot write candidate** | hash-present；duplicate-only PASS；Level 不升                                            |
| Provider Write Candidate Decision | 711                                                                   | ✅ **暫不列入第一批**                    | hash-null；不計算 duplicate-only；維持 Level 1                                           |
| Provider Write Candidate Decision | familymart                                                            | ✅ **不參與**                            | 維持 Level 4 正式自動同步                                                                |
| Provider — postoffice #38         | one-shot production commit                                            | ⏸️ Blocked（待授權）                     | can-write candidate（外部6 / DB0 / 可寫6），須另開 one-shot authorization task           |

---

## 3. 目前 Step 7 狀態

```text
目前 Step 7 狀態：
- familymart：Level 4 正式自動同步完成
- postoffice：Level 1 manual preview-only PASS；第一順位 one-shot write candidate
- tcat：Level 1 manual preview-only PASS；第二順位 one-shot write candidate
- 7-11：Level 1 manual preview-only PASS；暫不列入 one-shot write candidate
- Step 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA = COMPLETED / PASS
- Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT = COMPLETED / PASS
- Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION = COMPLETED / PASS
- production 目前 safe-preview-only（COMMIT_ENABLED=false）
```

---

## 4. 警告（務必保留）

```text
postoffice #38 尚未授權寫入；不得直接操作。
候選 decision 不等於已授權寫入。
one-shot candidate 不等於常態正式寫入。
Level 1 不得直接升 Level 3 / Level 4。
production 應維持 COMMIT_ENABLED=false / safe-preview-only。
711 hash-null；不得列入 one-shot write 前置條件尚未滿足的候選。
```

---

## 5. 下一步建議

### 首選：Step 7P-ONE-SHOT-WRITE-SAFETY-GATE

目的：正式建立 postoffice / tcat one-shot write safety gate 規格，確認 Authorization Text 格式、gate 開關流程。不直接開寫入。

### 可選：直接進入 Step 8

若使用者決定不立即開 one-shot write，可直接跳至 Step 8 進行其他功能。

---

## 6. 參考文件

| 文件                                                               | 內容                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `docs/step7/provider-write-candidate-decision.md`                  | **Step 7P write candidate decision（本輪）**                |
| `docs/step7/step7p-published-ui-screenshot-evidence-closeout.md`   | Published UI 截圖驗收結果                                   |
| `docs/step7/manual-preview-all-providers-qa.md`                    | Step 7P 統一 QA closeout                                    |
| `docs/step7/provider-rollout-decision-matrix.md`                   | 各 provider Support Level 決策（已更新 candidate decision） |
| `docs/step7/provider-rollout-policy.md`                            | Provider rollout 政策（已更新 candidate decision）          |
| `docs/step7/manual-provider-commit-release-gate-decision.md`       | one-shot authorization 格式、Rollback Plan                  |
| `docs/step7/manual-provider-production-can-write-candidates.md`    | postoffice #38 / tcat #36 can-write candidate 詳情          |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md` | tcat #36 one-shot commit 收尾                               |
