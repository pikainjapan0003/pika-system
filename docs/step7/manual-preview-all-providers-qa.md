# Step 7P Manual Preview All Providers QA

**Date**: 2026-06-26
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA
**Author**: Claude A（worker = claude-a）

---

## Summary

**Status: COMPLETED / PASS**

Docs + repo safety checks: **PASS**
7-11 Published UI QA: **PASS**（Step 7O / Step 7P 使用者截圖驗收）
postoffice Published UI QA: **Published UI Screenshot Evidence PASS**（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
tcat Published UI QA: **Published UI Screenshot Evidence PASS**（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）

All three manual preview-only providers (postoffice, tcat, 7-11) are consistently documented and verified at Level 1. No runtime code was changed. No writes occurred.

---

## Provider Matrix

| Provider   | Support Level                     | supportsAutoSync | Scheduled Sync          | Production Write                               | Manual Preview UI                              |
| ---------- | --------------------------------- | ---------------- | ----------------------- | ---------------------------------------------- | ---------------------------------------------- |
| familymart | **Level 4 — Formal Auto Sync**    | `true`           | allowed（正式自動同步） | allowed via scheduled/batch sync only          | hidden / not needed                            |
| postoffice | **Level 1 — Manual Preview-Only** | `false`          | not scheduled           | not allowed（one-shot authorization required） | preview only                                   |
| tcat       | **Level 1 — Manual Preview-Only** | `false`          | not scheduled           | not allowed（one-shot authorization required） | preview only                                   |
| 7-11       | **Level 1 — Manual Preview-Only** | `false`          | not scheduled           | not allowed                                    | preview only（not in `MANUAL_SYNC_PROVIDERS`） |

---

## Manual Preview Providers

| Provider   | In `MANUAL_SYNC_PROVIDERS`                | Commit Route                         | Preview UI          |
| ---------- | ----------------------------------------- | ------------------------------------ | ------------------- |
| postoffice | ✅ yes                                    | ✅ guarded（`COMMIT_ENABLED=false`） | ✅ owner UI preview |
| tcat       | ✅ yes                                    | ✅ guarded（`COMMIT_ENABLED=false`） | ✅ owner UI preview |
| 7-11       | ❌ no（preview-only; not in formal list） | ❌ commit route rejects 7-11         | ✅ owner UI preview |

---

## QA Checklist

| 項目                                                          | 狀態    | 備註                                                                                 |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| provider labels are clear                                     | ✅ PASS | postoffice / tcat / 7-11 均有明確 preview-only 標示                                  |
| preview-only providers do not show normal write button        | ✅ PASS | `COMMIT_ENABLED=false` guard；`ManualTrackingSyncPanel.tsx:141`                      |
| preview-only providers do not trigger DB write                | ✅ PASS | 本輪未 production write；未 DB mutation                                              |
| preview-only providers do not trigger /manual-provider/commit | ✅ PASS | commit route 未呼叫；guarded at `!COMMIT_ENABLED` early return                       |
| preview-only providers do not expose full previewHash         | ✅ PASS | 僅顯示 masked；staged diff 無完整 hash                                               |
| preview-only providers do not expose full tracking code       | ✅ PASS | UI 僅顯示 masked last4（如 `****0295`）                                              |
| 7-11 clearly shows preview-only / write not available         | ✅ PASS | Published UI 明確顯示「7-11 目前為預覽模式，尚未開放寫入」（Step 7O 使用者截圖驗收） |
| familymart remains separate from manual preview flow          | ✅ PASS | familymart 不在 `MANUAL_SYNC_PROVIDERS`；不進 manual preview UI                      |
| scheduled sync remains familymart-only                        | ✅ PASS | postoffice / tcat / 7-11 均不在 cron / scheduled sync 路徑                           |

---

## Published UI QA

| Provider   | Published UI QA                                 | 說明                                                                                                                                                    |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7-11       | ✅ **PASS**（Step 7O / Step 7P 使用者截圖驗收） | order #42；tracking \*\*\*\*0295；8 筆外部事件；最新貨態：已完成包裹成功取件；取件門市：麟林；UI 顯示「7-11 目前為預覽模式，尚未開放寫入」；無寫入按鈕  |
| postoffice | ✅ **Published UI Screenshot Evidence PASS**    | order #39；tracking \*\*\*\*0005；5 筆外部事件；已存在 DB 5 筆；可新增 0 筆；最新貨態：投遞成功；提示「查到的事件皆已存在，不需要重複寫入」；無寫入按鈕 |
| tcat       | ✅ **Published UI Screenshot Evidence PASS**    | order #40；tracking \*\*\*\*7146；4 筆外部事件；已存在 DB 4 筆；可新增 0 筆；最新貨態：順利送達；提示「查到的事件皆已存在，不需要重複寫入」；無寫入按鈕 |

### 誠實註記

```text
preview 結果區塊：使用 masked last4，不顯示完整 tracking code。✅
previewHash：只顯示 hash-present / hash-null，不顯示實值。✅
owner 物流貨號主欄位：仍顯示完整物流號碼。
  → 屬既有 owner 管理畫面設計，本輪未修改，不在本輪 QA 範圍內。
```

### postoffice / tcat 原始碼驗查明細（ManualTrackingSyncPanel.tsx）

| 驗查項目                                        | 結果    | 原始碼依據                                                                                                         |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| provider label 清楚                             | ✅ PASS | `getProviderDisplayName(provider) ?? provider`（line 292）                                                         |
| 顯示手動預覽結果 / preview-only 狀態            | ✅ PASS | preview result card 顯示外部事件數、最新貨態（line 483-582）                                                       |
| 不顯示可用的正常寫入按鈕                        | ✅ PASS | 按鈕標示「寫入事件（尚未啟用）」；確認 modal 標示「確認寫入（尚未啟用）」；`COMMIT_ENABLED=false` guard 確保不觸發 |
| 不呼叫 `/manual-provider/commit`                | ✅ PASS | `handleCommit()` 第一行：`if (!COMMIT_ENABLED)` early return（line 366）；`COMMIT_ENABLED=false`（line 147）       |
| 不寫 DB                                         | ✅ PASS | 由 `COMMIT_ENABLED=false` 確保；commit route 未送出                                                                |
| 不顯示完整 tracking code                        | ✅ PASS | `maskTrackingCode()` 遮罩為 `****XXXX`（line 164-167, 466, 689）                                                   |
| 不顯示完整 previewHash                          | ✅ PASS | 只顯示 `"• hash-present"` 或 `"• hash-null"`（line 507）；不顯示 hash 實值                                         |
| 明確標示 manual preview-only / 尚未開放正式寫入 | ✅ PASS | footer：`"目前為安全預覽模式：可查詢與預覽，不會寫入正式貨態事件。正式自動同步仍只有全家。"`（line 663）           |
| familymart 仍是唯一正式自動同步 provider        | ✅ PASS | footer 文字明確；`MANUAL_SYNC_PROVIDERS=["postoffice","tcat","711"]`（line 38）；familymart 不在其中               |
| 7-11 仍是 Level 1 manual preview-only           | ✅ PASS | 7-11 不進 commit modal（line 456-457）；顯示「7-11 目前為預覽模式，尚未開放寫入。」（line 550, 661）               |

---

## Safety Boundaries

本輪以下操作均**未執行**：

```text
No DB write.
No commit route call.
No auto-sync enablement.
No provider whitelist expansion.
No supportsAutoSync changes.
No .replit / replit.nix change.
No src runtime change.
No push.
No Publish.
No full tracking code exposed.
No full previewHash exposed.
```

Repo safety confirmation:

| 項目                          | 結果                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| Branch                        | `qa/step6f-cvs-store-selection-browser-mobile` ✅              |
| HEAD                          | `1bab379` ✅                                                   |
| Runtime files changed         | None（`git diff -- .replit replit.nix artifacts/...` = empty） |
| `.claude/settings.local.json` | Modified but untracked；not staged ✅                          |
| `COMMIT_ENABLED`              | `false`（`ManualTrackingSyncPanel.tsx:141`）；unchanged ✅     |
| `MANUAL_SYNC_PROVIDERS`       | `["postoffice", "tcat"] as const`；unchanged ✅                |
| `supportsAutoSync`            | familymart=`true`；all others=`false`；unchanged ✅            |

Safety statements preserved:

```text
COMMIT_ENABLED=false                               ✅
postoffice/tcat/711 are not scheduled providers    ✅
postoffice/tcat/711 are not formal auto-sync providers  ✅
7-11 is not in any formal write whitelist          ✅
7-11 is not in any scheduled sync path             ✅
manual preview-only does not mean production ready ✅
one-shot write candidate does not mean normal write support  ✅
```

---

## Result

**Step 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA = COMPLETED / PASS**

- Docs + repo safety: PASS
- Provider policy consistency: PASS（familymart=Level 4 已修正）
- 7-11 Published UI QA: PASS（Step 7O / Step 7P 使用者截圖驗收）
- postoffice Published UI QA: **Published UI Screenshot Evidence PASS**（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
- tcat Published UI QA: **Published UI Screenshot Evidence PASS**（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
- familymart 對照確認: PASS（Level 4 正式自動同步，不在 manual preview 流程）

---

## Recommended Next Step

```text
Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION
```

目的：評估 postoffice / tcat / 7-11 是否進入 one-shot write candidate，或維持 Level 1 manual preview-only 至 Step 8 之後再決定。

---

## 參考文件

| 文件                                                       | 內容                                        |
| ---------------------------------------------------------- | ------------------------------------------- |
| `docs/step7/711-preview-only-closeout.md`                  | 7-11 Level 1 closeout，Published UI QA PASS |
| `docs/step7/provider-rollout-decision-matrix.md`           | 各 provider Support Level 決策表            |
| `docs/step7/provider-rollout-policy.md`                    | Provider rollout 政策                       |
| `docs/step7/postoffice-manual-commit-flow.md`              | postoffice J5A～E production E2E 記錄       |
| `docs/step7/tcat-manual-commit-gate-plan.md`               | tcat J6A～E production E2E 記錄             |
| `docs/step7/manual-provider-safe-preview-only-closeout.md` | safe-preview-only 安全狀態收尾              |
