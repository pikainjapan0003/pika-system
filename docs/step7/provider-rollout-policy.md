# Step 7 Provider Rollout Policy

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-PROVIDER-ROLLOUT-POLICY-DOC
**Author**: Claude A（worker = claude-a）

---

## 1. Purpose

```text
本文件是 Step 7 多物流商支援政策文件。
用途是把 provider rollout decision matrix 轉成正式規則。
本文件不是 final closeout。
本文件不代表 Step 7 全部完成。
```

本文件依據 `docs/step7/provider-rollout-decision-matrix.md` 的決策結果（familymart=Level 4 / postoffice=Level 1 / tcat=Level 1 / 7-11=Level 1），轉換為後續 Claude / Codex 必須遵守的可執行規則。本輪 Claude A 角色為「施工員」，僅產出政策文件，不做任何程式施工。

> **版本說明**：7-11 已於 Step 7O（2026-06-26）由 Level 0 升至 Level 1。familymart 層級已修正為 Level 4（原文件誤植 Level 3）。

Step 7 目前整體狀態為 `IN PROGRESS / PARTIAL PASS`（見 `docs/step7/Step7完整計畫核取清單_總表版_更新至7N-STATUS-CORRECTION.md`），本文件不更動該整體狀態。

---

## 2. Core Principle

```text
Step 7 的核心目的，是完成物流追蹤層，
讓代購系統可以安全、可控地處理多物流商貨態，
而不是亂開所有物流正式寫入。
```

任何後續施工（包含 Step 7N-IMPLEMENT-ROLLOUT-POLICY-CHECK 及之後的步驟），都必須以此原則為最高優先級：先確認「安全、可控」，再考慮「擴大支援範圍」。

---

## 3. Provider Support Policy

### familymart

- **Support Level**：Level 4 — Formal Auto Sync
- `supportsAutoSync = true`
- scheduled / batch sync allowed（維持既有正式自動同步機制）
- manual provider UI hidden / not needed（不在 `MANUAL_SYNC_PROVIDERS` 內）
- 不可被移入 manual preview UI
- 保持既有正式自動同步，不需額外人工 preview 流程

### postoffice

- **Support Level**：Level 1 — Formal Manual Preview-Only
- `supportsAutoSync = false`
- manual provider UI 可 preview（owner UI 可查詢貨態摘要）
- 可重新查詢（re-query / refresh 動作允許）
- duplicate-only 不顯示寫入按鈕
- can-write 不可直接寫入 production
- production write 只允許另開 one-shot authorization（見「7. Future Authorization Template」）
- postoffice #38 未授權，不可操作（不可作為本輪或後續任何例行步驟的寫入對象）

### tcat

- **Support Level**：Level 1 — Formal Manual Preview-Only
- `supportsAutoSync = false`
- manual provider UI 可 preview（owner UI 可查詢貨態摘要）
- 可重新查詢（re-query / refresh 動作允許）
- duplicate-only 不顯示寫入按鈕
- can-write 不可直接寫入 production
- production write 只允許另開 one-shot authorization（見「7. Future Authorization Template」）
- #36 one-shot commit 已完成並關回 gate（外部5 / DB0 → 寫入5筆，最新貨態「順利送達」，gate 已關閉）
- 不可把 #36 成功誤當成全黑貓正式寫入上線 —— #36 僅代表單一 order 的 one-shot 驗證成功，tcat 整體仍為 Level 1 Formal Manual Preview-Only，不是 Level 2/3 常態寫入

### 7-11

- **Support Level**：Level 1 — Manual Preview-Only（**updated 2026-06-26**，原 Level 0）
- 7-11 目前已達 Level 1 manual preview-only。
- `supportsAutoSync = false`
- manual preview 可查詢（owner 端可查詢、顯示貨態摘要）；Published 正式網站 UI QA PASS
- 不進 `MANUAL_SYNC_PROVIDERS` 正式清單；不支援 commit route；不支援 auto-sync
- 不可 production write；不可 DB mutation
- 未來若要進入 write candidate，必須另開 one-shot authorization（同 postoffice / tcat 規範）
- 不可把 Level 1 preview PASS 誤解為正式寫入授權

---

## 4. Commit Policy

```text
production must remain COMMIT_ENABLED=false
broad production commit access is prohibited
manual-provider/commit must remain guarded
future write tests require explicit one-shot authorization
one-shot authorization must specify provider, orderId, trackingCode last4, expectedEventCount
one-shot gate must be closed immediately after test
```

補充說明：

- `COMMIT_ENABLED` 為全域 guard（`ManualTrackingSyncPanel.tsx`），目前固定為 `false`；任何 provider（含 postoffice / tcat）皆不得在未經明確 one-shot authorization 的情況下將其改為 `true`。
- `/manual-provider/commit` 的 fetch 呼叫必須維持在 `!COMMIT_ENABLED` early-return 的 guard 內，不得移除或繞過此 guard。
- one-shot authorization 的範圍僅限「單次、單一 order、單一 provider」，測試完成後必須立即把 `COMMIT_ENABLED` 關回 `false`、移除任何臨時的 one-shot target 常數（例如 `ONE_SHOT_COMMIT_TARGET`），不得讓 gate 長期保持開啟。

---

## 5. UI Policy

- postoffice / tcat manual UI 可以 preview（owner 端可查詢、顯示貨態摘要、可重新查詢）
- familymart 不顯示 manual provider UI（維持現有正式自動同步，不需要、也不可加入 manual preview 流程）
- 7-11 manual preview 可查詢（Level 1；但不進 `MANUAL_SYNC_PROVIDERS` 正式清單，不進 commit route）
- duplicate-only 不顯示寫入按鈕（當判斷為 duplicate-only 時，UI 僅顯示查詢結果，不提供任何寫入操作）
- safe-preview-only footer 必須保留（提示使用者目前為安全預覽模式，不會寫入 production）
- previewHash 不可完整顯示（避免洩漏可用於重放 / 推測 production 資料的雜湊值，僅可顯示遮罩或部分片段）
- can-write 狀態不可自動寫入（即使後端回報 can-write，UI 仍只顯示狀態，不可觸發任何自動或一鍵寫入流程）
- 可顯示「目前為安全預覽模式」（作為使用者可見的安全狀態提示文字）

---

## 6. Rollout Rules

```text
Controlled verification ≠ formal write rollout
Adapter complete ≠ auto sync support
Preview complete ≠ production write enabled
One-shot success ≠ broad write access
7-11 research ≠ formal provider support
```

這五條規則適用於所有後續評估與施工決策。任何「某項驗證已通過」的結論，都不能直接推導為「可以正式開放對應的寫入 / 自動同步 / provider 支援範圍」，必須回到本文件對應 Provider Support Policy 的 Level 定義重新確認。

---

## 7. Future Authorization Template

若未來需要針對 postoffice 或 tcat 開啟 one-shot production write authorization，必須先填妥以下欄位：

```text
One-shot authorization required fields:
- provider:
- orderId:
- trackingCode last4:
- expectedEventCount:
- production URL:
- explicit approval phrase:
- rollback / close-gate step:
```

```text
沒有這些欄位，不得開 gate。
```

補充：

- 此授權格式僅適用於 Level 1 provider（目前為 postoffice / tcat）的 one-shot 寫入測試，不適用於擴大 provider 支援範圍（例如新增 7-11 或讓 familymart 進 manual UI）等決策 —— 那些屬於另一類決策，須另開對應的 decision / policy 文件。
- `rollback / close-gate step` 必須在授權當下就明確寫出，且必須在寫入測試完成後立即執行，恢復 `COMMIT_ENABLED=false` 與相關常數的移除。

---

## 8. Next Step

```text
Step 7P-POSTOFFICE-ONE-SHOT-AUTHORIZATION
（安全門規格已建立於 docs/step7/one-shot-write-safety-gate.md）
```

用途：

```text
使用者決定對特定 postoffice order 執行 one-shot write 時，
依安全門規格提供完整授權文字，然後依規格執行並收尾。
不得在無授權文字的情況下執行寫入。
```

---

## Step 7P Closeout（2026-06-26）

```text
Step 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA = COMPLETED / PASS
Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT = COMPLETED / PASS
Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION = COMPLETED / PASS
```

| Provider   | Level                         | Published UI QA          | Write Candidate Decision              |
| ---------- | ----------------------------- | ------------------------ | ------------------------------------- |
| familymart | Level 4 — Formal Auto Sync    | PASS（對照確認）         | 不參與；維持正式自動同步              |
| postoffice | Level 1 — Manual Preview-Only | Screenshot Evidence PASS | **第一順位 one-shot write candidate** |
| tcat       | Level 1 — Manual Preview-Only | Screenshot Evidence PASS | **第二順位 one-shot write candidate** |
| 7-11       | Level 1 — Manual Preview-Only | Screenshot Evidence PASS | 暫不列入第一批；維持 preview-only     |

- Runtime files unchanged; no DB write; no commit route called; Level 不升
- postoffice / tcat 候選不等於已授權寫入；下一步需另開 one-shot authorization task
- See: `docs/step7/provider-write-candidate-decision.md`

```text
Step 7P-ONE-SHOT-WRITE-SAFETY-GATE = COMPLETED / PASS（2026-06-26）
```

安全門規格已建立：`docs/step7/one-shot-write-safety-gate.md`

- 授權格式：Section 4（使用者明確授權模板）
- 寫入前檢查：Section 5（10 條）
- 寫入期間限制：Section 6（8 條）
- close gate 步驟：Section 7（9 步驟）
- postoffice #38 尚未授權；下一步：`Step 7P-POSTOFFICE-ONE-SHOT-AUTHORIZATION`

---

## 嚴格禁止（沿用至下一輪）

```text
不可送出 /manual-provider/commit
不可 production write
不可 DB mutation
不可操作 postoffice #38
不可改 API
不可改 cron
不可改 supportsAutoSync
不可改 provider whitelist
不可把 COMMIT_ENABLED 改 true
不可新增 7-11 支援
不可讓 familymart 進 manual UI
不可 Publish runtime code
```

---

## Safety Check（本輪執行，read-only）

| 項目                              | 結果                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `COMMIT_ENABLED`                  | `false`（`ManualTrackingSyncPanel.tsx:141`），未變動                                                           |
| `/manual-provider/commit`         | 僅 `ManualTrackingSyncPanel.tsx:371`，於 guarded fetch 內（`!COMMIT_ENABLED` early return，未送出）            |
| `MANUAL_SYNC_PROVIDERS`           | `["postoffice", "tcat"] as const`（`ManualTrackingSyncPanel.tsx:37`），未變動                                  |
| `supportsAutoSync`                | `logisticsProviders.ts` / `providers.ts` 皆未變動；僅 familymart=`true`，7-11 / tcat / postoffice 均為 `false` |
| `localStorage` / `sessionStorage` | CLEAN（`ManualTrackingSyncPanel.tsx` 內 0 處）                                                                 |

---

## 參考文件

| 文件                                                                    | 內容                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `docs/step7/provider-rollout-decision-matrix.md`                        | 各 provider Support Level 決策結果（本文件據此轉為正式規則）        |
| `docs/step7/Step7完整計畫核取清單_總表版_更新至7N-STATUS-CORRECTION.md` | Step 7 目前狀態（IN PROGRESS / PARTIAL PASS）、已完成 / 未完成清單  |
| `docs/step7/manual-provider-production-can-write-candidates.md`         | postoffice #38 / tcat #36 can-write candidate 詳情                  |
| `docs/step7/manual-provider-commit-release-gate-decision.md`            | one-shot authorization 流程、Authorization Text 格式、Rollback Plan |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md`      | tcat #36 one-shot commit 收尾、gate 關回紀錄                        |
| `docs/step7/mobile-brand-qa-closeout.md`                                | safe-preview-only 安全狀態重新確認                                  |
