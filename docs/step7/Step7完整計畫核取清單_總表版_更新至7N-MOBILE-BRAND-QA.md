# Step 7 完整計畫核取清單（總表版）— 更新至 7N-MOBILE-BRAND-QA

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-UPDATE-MAIN-CHECKLIST-AFTER-MOBILE-BRAND-QA
**Author**: Claude A（worker = claude-a）

---

## 0. 版本來源說明

本輪任務要求「優先使用目前最新總表 `Step7完整計畫核取清單_總表版_更新至7N-BRAND.md`」，若找不到則執行：

```bash
find /home/runner/workspace -name "*Step7*總表*7N*BRAND*.md" -o -name "*Step7完整計畫核取清單*.md"
```

實際執行結果：**未找到任何符合的檔案**（包含 `docs/`、`docs/step7/`、所有 `.worktrees/*` 皆已搜尋，無 `總表`、`核取清單`、`checklist`、`master`、`主計畫` 等命名的 Step 7 總表檔案）。

因此本檔為**全新建立**的 Step 7 總表版，內容依據：

- 本輪任務 prompt 提供的「目前已完成」清單與「目前 Step 7 狀態摘要」
- `docs/step7/` 下既有的各階段紀錄文件（postoffice / tcat E2E、J5F owner UI 全流程、品牌更名、mobile-brand QA closeout 等）

彙整而成，作為後續任務的單一參照總表。若使用者手邊在其他地方（例如 Claude B 的輸出、ChatGPT 對話）有更早版本的「...更新至7N-BRAND.md」，建議之後人工比對合併；本檔不假設、不杜撰未在 repo 中找到的舊版內容。

---

## 1. Step 7 核心目標

> 完成物流追蹤層，讓代購系統可以安全、可控地處理多物流商貨態，而不是亂開所有物流正式寫入。

---

## 2. 總表

| 區塊                      | 項目                                                                  | 狀態                        | 備註 / commit                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider — familymart     | 正式自動同步                                                          | ✅ Done                     | `supportsAutoSync: true`，僅 familymart；正式運作中，不進 manual UI                                                                                     |
| Provider — postoffice     | adapter / preview / production E2E                                    | ✅ Done                     | J5A～J5E，order #39 / trackingId=2，insertedEventCount=5，delivered，post-commit duplicateEvents=5                                                      |
| Provider — tcat           | adapter / preview / production E2E                                    | ✅ Done                     | J6A～J6E，order #40 / trackingId=3，insertedEventCount=4，delivered，post-commit duplicateEvents=4                                                      |
| Owner UI                  | manual provider preview / confirm / commit（ManualTrackingSyncPanel） | ✅ Done                     | J5F-1～12（含 7A～7H、7H-A～7H-C、FINAL-CLOSEOUT）                                                                                                      |
| Owner UI                  | tcat #36 one-shot production commit                                   | ✅ Done                     | J5F-7H-B，外部5 / DB0 → 寫入5筆，最新貨態「順利送達」                                                                                                   |
| Owner UI                  | one-shot gate 關回                                                    | ✅ Done                     | J5F-7H-C，`COMMIT_ENABLED` 恢復 `false`，one-shot 相關程式碼已移除                                                                                      |
| Owner UI                  | J5F final closeout                                                    | ✅ Done                     | commit `46158dc`（docs-only）                                                                                                                           |
| Brand                     | 畫夢代購 / DrawDream UI 文案更名                                      | ✅ **PASS / completed**     | **Step 7N-BRAND-COPY-UI-RENAME-DRAWDREAM**，commit `2a1a2f4`，正式站品牌文案已生效（首頁 logo/wordmark/footer、登入頁 subtitle、index.html title/meta） |
| QA                        | mobile / brand / logistics UI closeout                                | ✅ **PASS / completed**     | **Step 7N-MOBILE-BRAND-QA-CLOSEOUT**，commit `800ee68`：使用者人工確認正式站首頁品牌文案顯示正常、主要按鈕可按；production 維持 safe-preview-only       |
| Provider — postoffice #38 | one-shot production commit                                            | ⏸️ Blocked（待授權）        | can-write candidate（外部6 / DB0 / 可寫6，最新貨態「投遞成功」），J5F-7H-D 暫緩，須使用者另行提供完整 Authorization Text 才可操作                       |
| Provider — 7-11           | 正式支援                                                              | ⛔ Not supported / research | 不屬於目前正式支援 provider，`MANUAL_SYNC_PROVIDERS` / `supportsAutoSync` 均未包含，不得新增正式支援                                                    |

---

## 3. 目前 Step 7 狀態

```text
目前 Step 7 狀態：
- familymart：正式自動同步完成
- postoffice：adapter / preview / production E2E 完成
- tcat：adapter / preview / production E2E 完成
- owner UI manual provider preview / confirm / one-shot commit path 已驗證
- tcat #36 one-shot production commit 成功
- one-shot gate 已關回
- production 目前 safe-preview-only
- mobile / brand / logistics UI closeout PASS
```

---

## 4. 警告（務必保留）

```text
postoffice #38 尚未授權寫入；不得直接操作。
7-11 不屬於目前正式支援 provider；不得新增正式支援。
production 應維持 COMMIT_ENABLED=false / safe-preview-only。
```

---

## 5. 下一步建議

```text
Step 7N-FINAL-LOGISTICS-LAYER-CLOSEOUT
```

用途：

- 總結 Step 7 物流追蹤層完成度
- 明確列出 production 安全狀態（`COMMIT_ENABLED=false` / safe-preview-only / 各 provider manual UI 行為）
- 明確列出 7-11 仍 blocked / research，不得新增正式支援
- 明確列出 postoffice #38 仍需另行授權才可 one-shot write（Authorization Text 格式見 `manual-provider-commit-release-gate-decision.md` Section 7）
- 判斷是否進入 Step 8 或回到產品主線

不建議將 postoffice #38 one-shot commit（J5F-7H-D）排為下一步首選。

---

## 6. 參考文件

| 文件                                                                   | 內容                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `docs/step7/postoffice-manual-commit-flow.md`                          | postoffice J5A～E production E2E 記錄                       |
| `docs/step7/tcat-manual-commit-gate-plan.md`                           | tcat J6A～E production E2E 記錄                             |
| `docs/step7/manual-provider-commit-ui-spec.md`                         | owner UI commit 規格                                        |
| `docs/step7/manual-provider-commit-ui-commit-integration-plan.md`      | commit 整合計畫                                             |
| `docs/step7/manual-provider-commit-release-gate-decision.md`           | release gate 決策、Authorization Text 格式、Rollback Plan   |
| `docs/step7/manual-provider-production-can-write-candidates.md`        | postoffice #38 / tcat #36 can-write candidate 詳情          |
| `docs/step7/manual-provider-safe-preview-only-closeout.md`             | J5F-8 safe-preview-only 收尾                                |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md`     | J5F 全系列最終收尾（tcat #36）                              |
| `docs/step7/brand-copy-ui-rename-drawdream.md`                         | 品牌文案更名（畫夢代購 / DrawDream），commit `2a1a2f4`      |
| `docs/step7/mobile-brand-qa-closeout.md`                               | mobile / brand / logistics UI QA closeout，commit `800ee68` |
| `docs/step7/owner-order-detail-manual-provider-implementation-plan.md` | owner UI 實作步驟切分（J5F-2A～12）                         |
