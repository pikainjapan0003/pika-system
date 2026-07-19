# Step 7 完整計畫核取清單（總表版）— 更新至 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA

**Date**: 2026-06-26
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA
**Author**: Claude A（worker = claude-a）

---

## 0. 版本說明

本版本以 `Step7完整計畫核取清單_總表版_更新至7O-711-PREVIEW-ONLY-CLOSEOUT.md` 為基底，
新增 Step 7P Manual Preview All Providers QA 的完成記錄，
確認三家 manual preview-only 物流商（postoffice / tcat / 7-11）的一致性文件與安全邊界。

---

## 1. Step 7 核心目標

> 完成物流追蹤層，讓代購系統可以安全、可控地處理多物流商貨態，而不是亂開所有物流正式寫入。

---

## 2. 總表

| 區塊                            | 項目                                                                  | 狀態                                         | 備註 / commit                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider — familymart           | 正式自動同步                                                          | ✅ Done                                      | `supportsAutoSync: true`，僅 familymart；正式運作中，不進 manual UI                                                                                      |
| Provider — postoffice           | adapter / preview / production E2E                                    | ✅ Done                                      | J5A～J5E，order #39 / trackingId=2，insertedEventCount=5，delivered，post-commit duplicateEvents=5                                                       |
| Provider — tcat                 | adapter / preview / production E2E                                    | ✅ Done                                      | J6A～J6E，order #40 / trackingId=3，insertedEventCount=4，delivered，post-commit duplicateEvents=4                                                       |
| Owner UI                        | manual provider preview / confirm / commit（ManualTrackingSyncPanel） | ✅ Done                                      | J5F-1～12（含 7A～7H、7H-A～7H-C、FINAL-CLOSEOUT）                                                                                                       |
| Owner UI                        | tcat #36 one-shot production commit                                   | ✅ Done                                      | J5F-7H-B，外部5 / DB0 → 寫入5筆，最新貨態「順利送達」                                                                                                    |
| Owner UI                        | one-shot gate 關回                                                    | ✅ Done                                      | J5F-7H-C，`COMMIT_ENABLED` 恢復 `false`，one-shot 相關程式碼已移除                                                                                       |
| Owner UI                        | J5F final closeout                                                    | ✅ Done                                      | commit `46158dc`（docs-only）                                                                                                                            |
| Brand                           | 畫夢代購 / DrawDream UI 文案更名                                      | ✅ **PASS / completed**                      | Step 7N-BRAND-COPY-UI-RENAME-DRAWDREAM，commit `2a1a2f4`                                                                                                 |
| QA                              | mobile / brand / logistics UI closeout                                | ✅ **PASS / completed**                      | Step 7N-MOBILE-BRAND-QA-CLOSEOUT，commit `800ee68`                                                                                                       |
| Provider — 7-11                 | 可行性研究                                                            | ✅ Done                                      | Step 7O-711-LIGHTWEIGHT-FEASIBILITY                                                                                                                      |
| Provider — 7-11                 | adapter spike                                                         | ✅ Done                                      | Step 7O-711-MINIMAL-PREVIEW-ADAPTER-SPIKE                                                                                                                |
| Provider — 7-11                 | OCR / captcha 驗證                                                    | ✅ Done                                      | Step 7O-711-OCR-OR-SOURCE-VALIDATION                                                                                                                     |
| Provider — 7-11                 | 真實 E2E 查詢                                                         | ✅ Done                                      | Step 7O-711-FULL-PREVIEW-E2E-TEST；取得 8 筆外部貨態事件                                                                                                 |
| Provider — 7-11                 | normalization 穩定性                                                  | ✅ Done                                      | Step 7O-711-E2E-STABILITY-RETRY；2/8 → 8/8 correct                                                                                                       |
| Provider — 7-11                 | manual preview integration                                            | ✅ Done                                      | Step 7O-711-MANUAL-PREVIEW-INTEGRATION；commit `50e4cd4`                                                                                                 |
| Provider — 7-11                 | provider alias fix                                                    | ✅ Done                                      | Step 7O-711-MANUAL-PREVIEW-PROVIDER-NOT-ALLOWED-FIX；commit `f12f464`                                                                                    |
| Provider — 7-11                 | tesseract runtime fix（workspace）                                    | ✅ Done                                      | Step 7O-711-RUNTIME-TESSERACT-FIX；commit `325a35f`                                                                                                      |
| Provider — 7-11                 | Published runtime 診斷                                                | ✅ Done                                      | Step 7O-711-PUBLISHED-RUNTIME-TESSERACT-FIX；commit `8ea5c11`                                                                                            |
| Provider — 7-11                 | replit.nix tesseract enable                                           | ✅ Done                                      | Step 7O-711-REPLIT-NIX-TESSERACT-ENABLE；commit `74de9b3`；pkgs.tesseract4                                                                               |
| Provider — 7-11                 | Published UI QA                                                       | ✅ **PASS**                                  | Step 7O-711-PREVIEW-ONLY-CLOSEOUT；使用者人工驗收：8 筆外部事件，最新貨態「已完成包裹成功取件」，無 OCR_FAILED，無 PROVIDER_NOT_ALLOWED，UI 顯示預覽模式 |
| Provider — 7-11                 | **Level 1 manual preview-only closeout**                              | ✅ **PASS**                                  | 2026-06-26；7-11 Level 0 → Level 1；未正式寫入；未 auto-sync                                                                                             |
| Manual Preview All Providers QA | docs + repo safety check                                              | ✅ **PASS**                                  | Step 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA；2026-06-26；runtime 未變動                                                                                      |
| Manual Preview All Providers QA | provider policy consistency                                           | ✅ **PASS**                                  | postoffice / tcat / 7-11 均確認為 Level 1；familymart 確認為 Level 4（已修正）                                                                           |
| Manual Preview All Providers QA | 7-11 Published UI QA                                                  | ✅ **PASS**                                  | 沿用 Step 7O 使用者截圖驗收結果                                                                                                                          |
| Manual Preview All Providers QA | postoffice Published UI QA                                            | ✅ **Published UI Screenshot Evidence PASS** | Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT；order #39；tracking \*\*\*\*0005；5 筆外部 / DB 5 筆；最新貨態：投遞成功；無寫入按鈕                               |
| Manual Preview All Providers QA | tcat Published UI QA                                                  | ✅ **Published UI Screenshot Evidence PASS** | Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT；order #40；tracking \*\*\*\*7146；4 筆外部 / DB 4 筆；最新貨態：順利送達；無寫入按鈕                               |
| Provider — postoffice #38       | one-shot production commit                                            | ⏸️ Blocked（待授權）                         | can-write candidate（外部6 / DB0 / 可寫6，最新貨態「投遞成功」），須使用者另行提供完整 Authorization Text                                                |

---

## 3. 目前 Step 7 狀態

```text
目前 Step 7 狀態：
- familymart：Level 4 正式自動同步完成（層級已修正為 Level 4）
- postoffice：Level 1 manual preview-only PASS（production E2E 完成；原始碼驗查通過）
- tcat：Level 1 manual preview-only PASS（production E2E 完成；#36 one-shot done；原始碼驗查通過）
- 7-11：Level 1 manual preview-only PASS（Published UI QA 完成）
- owner UI manual provider preview / confirm / one-shot commit path 已驗證
- tcat #36 one-shot production commit 成功
- one-shot gate 已關回
- production 目前 safe-preview-only
- mobile / brand / logistics UI closeout PASS
- Step 7P manual preview all providers QA：COMPLETED / PASS
```

---

## 4. 警告（務必保留）

```text
postoffice #38 尚未授權寫入；不得直接操作。
7-11 Level 1 preview PASS ≠ 正式寫入授權；不得 production write。
7-11 不在 MANUAL_SYNC_PROVIDERS 正式清單；不進 commit route；不支援 auto-sync。
production 應維持 COMMIT_ENABLED=false / safe-preview-only。
```

---

## 5. 下一步建議

### 首選：Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION

目的：評估 postoffice / tcat / 7-11 是否進入 one-shot write candidate，或維持 Level 1 manual preview-only 至 Step 8 之後再決定。

---

## 6. 參考文件

| 文件                                                               | 內容                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `docs/step7/manual-preview-all-providers-qa.md`                    | **Step 7P QA closeout（本輪）**                             |
| `docs/step7/postoffice-manual-commit-flow.md`                      | postoffice J5A～E production E2E 記錄                       |
| `docs/step7/tcat-manual-commit-gate-plan.md`                       | tcat J6A～E production E2E 記錄                             |
| `docs/step7/manual-provider-commit-ui-spec.md`                     | owner UI commit 規格                                        |
| `docs/step7/manual-provider-commit-release-gate-decision.md`       | release gate 決策、Authorization Text 格式、Rollback Plan   |
| `docs/step7/manual-provider-production-can-write-candidates.md`    | postoffice #38 / tcat #36 can-write candidate 詳情          |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md` | J5F 全系列最終收尾（tcat #36）                              |
| `docs/step7/brand-copy-ui-rename-drawdream.md`                     | 品牌文案更名（畫夢代購 / DrawDream），commit `2a1a2f4`      |
| `docs/step7/mobile-brand-qa-closeout.md`                           | mobile / brand / logistics UI QA closeout，commit `800ee68` |
| `docs/step7/711-preview-only-closeout.md`                          | 7-11 Level 1 manual preview-only closeout                   |
| `docs/step7/provider-rollout-decision-matrix.md`                   | 各 provider Support Level 決策（Step 7P 已更新）            |
| `docs/step7/provider-rollout-policy.md`                            | Provider rollout 政策（Step 7P 已更新）                     |
