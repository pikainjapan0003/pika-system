# Step 7 完整計畫核取清單（總表版）— 更新至 7P-POSTOFFICE-ONE-SHOT-AUTHORIZATION-PRECHECK

**日期**：2026-06-26
**分支**：qa/step6f-cvs-store-selection-browser-mobile
**步驟**：7P-POSTOFFICE-ONE-SHOT-AUTHORIZATION-PRECHECK → CLOSEOUT
**作者**：Claude A（worker = claude-a）

---

## 0. 版本說明

本版本以 `Step7完整計畫核取清單_總表版_更新至7P-ONE-SHOT-WRITE-SAFETY-GATE.md` 為基底，
新增 Step 7P-POSTOFFICE-ONE-SHOT-AUTHORIZATION-PRECHECK 的完成記錄。

---

## 1. Step 7 核心目標

> 完成物流追蹤層，讓代購系統可以安全、可控地處理多物流商貨態，而不是亂開所有物流正式寫入。

---

## 2. 總表

| 區塊 | 項目 | 狀態 | 備註 / commit |
|------|------|------|------|
| Provider — familymart | 正式自動同步 | ✅ Done | `supportsAutoSync: true`，僅 familymart；正式運作中 |
| Provider — postoffice | adapter / preview / production E2E | ✅ Done | J5A～J5E，order #39 |
| Provider — tcat | adapter / preview / production E2E | ✅ Done | J6A～J6E，order #40 |
| Owner UI | manual provider preview / confirm / commit | ✅ Done | J5F-1～12 |
| Owner UI | tcat #36 one-shot production commit | ✅ Done | J5F-7H-B，外部5 / DB0 → 寫入5筆 |
| Owner UI | one-shot gate 關回 | ✅ Done | J5F-7H-C，`COMMIT_ENABLED` 恢復 `false` |
| Brand | 畫夢代購 / DrawDream UI 文案更名 | ✅ **PASS** | commit `2a1a2f4` |
| QA | mobile / brand / logistics UI closeout | ✅ **PASS** | commit `800ee68` |
| Provider — 7-11 | 全系列 7O 路線 | ✅ Done | Step 7O-711-*；commit `74de9b3`、`50e4cd4`、`f12f464` 等 |
| Provider — 7-11 | Published UI QA | ✅ **PASS** | Step 7O / Step 7P 使用者截圖驗收 |
| Provider — 7-11 | Level 1 manual preview-only closeout | ✅ **PASS** | 2026-06-26 |
| Manual Preview All Providers QA | 全系列 7P QA | ✅ **PASS** | commit `cbf8856`、`956378f`、`2ff7f7d` |
| Manual Preview All Providers QA | postoffice Published UI QA | ✅ **Screenshot Evidence PASS** | order #39；tracking ****0005 |
| Manual Preview All Providers QA | tcat Published UI QA | ✅ **Screenshot Evidence PASS** | order #40；tracking ****7146 |
| Provider Write Candidate Decision | postoffice | ✅ **第一順位 one-shot write candidate** | hash-present；Level 不升；commit `20cb617` |
| Provider Write Candidate Decision | tcat | ✅ **第二順位 one-shot write candidate** | hash-present；Level 不升 |
| Provider Write Candidate Decision | 711 | ✅ **暫不列入第一批** | hash-null；維持 Level 1 |
| One-Shot Write Safety Gate | 安全門規格文件 | ✅ **COMPLETED / PASS** | commit `8c6c8d1`；授權格式 / 寫入前後規則已建立 |
| One-Shot Write Safety Gate | postoffice 安全門 | ✅ **規格已建立；尚未授權寫入** | 待使用者提供完整授權文字 |
| One-Shot Write Safety Gate | tcat 安全門 | ✅ **規格已建立；尚未授權寫入** | 待使用者提供完整授權文字 |
| Postoffice One-Shot Authorization Precheck | 重新 preview #38 | ✅ **Screenshot Evidence PASS** | 使用者截圖確認；tracking ****3004；hash-present；外部6 / DB0 / 可寫6；最新貨態「投遞成功」 |
| Postoffice One-Shot Authorization Precheck | 授權草稿模板 | ✅ **草稿已填入實際數值** | 授權草稿見 `docs/step7/postoffice-one-shot-authorization-precheck.md`；待使用者明確貼出即視為授權 |
| Provider — postoffice #38 | one-shot production commit | ⏸️ READY-FOR-USER-AUTHORIZATION | 授權前條件全部符合；等待使用者明確貼出授權文字後才可進入 write |

---

## 3. 目前 Step 7 狀態

```text
目前 Step 7 狀態：
- familymart：Level 4 正式自動同步完成
- postoffice：Level 1 manual preview-only PASS；第一順位 one-shot write candidate；安全門規格已建立；precheck COMPLETED / READY-FOR-USER-AUTHORIZATION（tracking ****3004；hash-present；外部6 / DB0 / 可寫6；最新貨態「投遞成功」）
- tcat：Level 1 manual preview-only PASS；第二順位 one-shot write candidate；安全門規格已建立；尚未授權寫入
- 7-11：Level 1 manual preview-only PASS；暫不列入 one-shot write candidate
- Step 7P 全系列 = COMPLETED / PASS
- production 目前 safe-preview-only（COMMIT_ENABLED=false）
- 安全門規格：docs/step7/one-shot-write-safety-gate.md
- Precheck 文件：docs/step7/postoffice-one-shot-authorization-precheck.md
```

---

## 4. 警告（務必保留）

```text
postoffice #38 尚未授權寫入；不得直接操作。
候選 decision 不等於已授權寫入。
one-shot candidate 不等於常態正式寫入。
Level 1 不得直接升 Level 3 / Level 4。
production 應維持 COMMIT_ENABLED=false / safe-preview-only。
711 hash-null；不符合 one-shot write 前置條件；不得進入安全門流程。
任何寫入操作必須依 docs/step7/one-shot-write-safety-gate.md 執行。
precheck READY-FOR-USER-AUTHORIZATION = 授權前條件全部通過；等待使用者明確貼出授權文字後才可進入 write。
```

---

## 5. 下一步

### 首選：等待使用者明確貼出授權文字

precheck 已完成，授權草稿已填入實際數值（見 `docs/step7/postoffice-one-shot-authorization-precheck.md`）。

使用者確認數值後，請把授權草稿完整貼給 Claude A：

```text
我明確授權執行 one-shot write：

Provider: postoffice
Order ID: #38
Tracking ID: 不顯示完整，只記錄 last4=3004
Tracking last4: 3004
Expected external events: 6
Expected DB existing events: 0
Expected writable events: 6
Expected latest status: 投遞成功
允許行為：只允許本次單筆寫入
禁止行為：不得開 scheduled sync、不得開常態正式寫入、不得修改其他 provider、不得寫入其他 order/tracking
授權有效範圍：本次任務完成即失效
```

### 授權後繼續：Step 7P-POSTOFFICE-ONE-SHOT-WRITE

使用者明確貼出授權文字後，Claude A 才可開下一輪：
- 確認 preview 資料與授權一致（10 條寫入前檢查）
- 開啟 one-shot gate（COMMIT_ENABLED=true，短暫）
- 執行單筆寫入（依安全門規格）
- 立刻 close gate（COMMIT_ENABLED=false）
- 重新 preview 確認 duplicate-only
- docs-only closeout

---

## 6. 參考文件

| 文件 | 內容 |
|------|------|
| `docs/step7/postoffice-one-shot-authorization-precheck.md` | **Step 7P Precheck — COMPLETED / READY-FOR-USER-AUTHORIZATION；含已填值授權草稿** |
| `docs/step7/one-shot-write-safety-gate.md` | one-shot write 安全門規格 |
| `docs/step7/provider-write-candidate-decision.md` | write candidate 決策結果 |
| `docs/step7/step7p-published-ui-screenshot-evidence-closeout.md` | Published UI 截圖驗收結果 |
| `docs/step7/manual-preview-all-providers-qa.md` | Step 7P 統一 QA closeout |
| `docs/step7/provider-rollout-decision-matrix.md` | 各 provider Support Level 決策 |
| `docs/step7/provider-rollout-policy.md` | Provider rollout 政策 |
| `docs/step7/manual-provider-commit-release-gate-decision.md` | one-shot authorization 歷史記錄 |
| `docs/step7/manual-provider-production-can-write-candidates.md` | postoffice #38 / tcat #36 can-write candidate 詳情 |
