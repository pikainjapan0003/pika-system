# Step 7 Provider Rollout Decision Matrix

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-PROVIDER-ROLLOUT-DECISION-MATRIX
**Author**: Claude A（worker = claude-a）

---

## 1. Purpose

```text
本文件不是 final closeout。
本文件用來決定 Step 7 各物流商正式支援層級，避免把 controlled verification 誤當 formal rollout。
```

本文件為決策表（decision matrix），不涉及任何程式碼變更。本輪 Claude A 角色為「施工員」，僅產出文件；任何 code alignment 須留待下一階段 `Step 7N-PROVIDER-ROLLOUT-POLICY-DOC` 另行規劃與授權。

Step 7 目前整體狀態為 `IN PROGRESS / PARTIAL PASS`（見 `docs/step7/Step7完整計畫核取清單_總表版_更新至7N-STATUS-CORRECTION.md`），本文件不更動該整體狀態。

---

## Support Level 定義

| Level | 名稱 | 定義 |
|---|---|---|
| Level 0 | Blocked / Research Only | 不顯示正式 manual UI；不可 production write；不可 `supportsAutoSync`；只允許研究文件或另開 research task |
| Level 1 | Formal Manual Preview-Only | 可在 owner UI 查詢 / preview；可顯示貨態摘要；duplicate-only 不顯示寫入按鈕；can-write 也不可直接正式寫入；production 維持 safe-preview-only |
| Level 2 | One-Shot Authorized Commit | 僅限單一 provider / orderId / trackingCode / expected event count；必須有明確授權；寫完必須關回 gate；不可變成常態功能 |
| Level 3 | Formal Regular Write | 可常態性正式寫入（非批次排程）；需另行授權；不可自動觸發；目前無 provider 達此層級 |
| Level 4 | Formal Auto Sync | 可 scheduled / batch sync；必須經過完整上線審核；目前只有 familymart |

---

## 2. Current Provider Matrix

| Provider | Current Evidence | Current Support Level | Production Write Policy | supportsAutoSync | Manual UI | Status | Next Action |
|---|---|---|---|---|---|---|---|
| familymart | 正式自動同步已上線運作中；`supportsAutoSync: true`（`logisticsProviders.ts` / `providers.ts`）；scheduled / batch sync 目前僅 familymart | **Level 4 — Formal Auto Sync** | allowed via existing scheduled/batch sync only | `true` | hidden / not needed（不在 `MANUAL_SYNC_PROVIDERS` 內） | keep as-is | 無；維持現狀 |
| postoffice | adapter / preview / controlled production E2E 已驗證（J5A～J5E：order #39 / trackingId=2，insertedEventCount=5，delivered）；#38 為 can-write candidate（外部6 / DB0 / 可寫6，最新貨態「投遞成功」），尚未授權 | **Level 1 — Formal Manual Preview-Only** | no broad write; one-shot authorization required | `false` | preview only（`MANUAL_SYNC_PROVIDERS` 含 postoffice） | partial rollout, not full formal write | keep preview-only; postoffice #38 requires separate authorization |
| tcat | adapter / preview / controlled production E2E 已驗證（J6A～J6E：order #40 / trackingId=3，insertedEventCount=4，delivered）；#36 owner UI one-shot production commit 已成功（外部5 / DB0 → 寫入5筆，最新貨態「順利送達」），one-shot gate 已關回 | **Level 1 — Formal Manual Preview-Only** | no broad write; one-shot authorization required | `false` | preview only（`MANUAL_SYNC_PROVIDERS` 含 tcat） | partial rollout, not full formal write | keep preview-only |
| 7-11 | manual preview-only 已完成；Published 正式網站 UI QA PASS（8 筆外部事件，最新貨態：已完成包裹成功取件）；未列入 `MANUAL_SYNC_PROVIDERS`；`supportsAutoSync: false`；未 production write；未開 auto-sync；見 `docs/step7/711-preview-only-closeout.md` | **Level 1 — Manual Preview-Only** | none（7-11 preview-only；不支援正式寫入；不支援 auto-sync；不進 commit route） | `false` | preview only（7-11 可進 manual preview，但不在 `MANUAL_SYNC_PROVIDERS` 正式清單中） | Level 1 manual preview-only PASS（**updated 2026-06-26**） | Step 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA；之後再評估 write candidate decision |

---

## 3. Decision Summary

```text
Do not open broad production commit access.
Keep production COMMIT_ENABLED=false.
Postoffice and tcat may be treated as formal preview-only providers, not formal write providers.
Any future write test must be one-shot authorized.
7-11 remains blocked / research only.
```

本輪採納以下方案作為決策結果（與「2. Current Provider Matrix」一致）：

```text
familymart：Formal Auto Sync
postoffice：Formal Manual Preview-Only；正式寫入需另行 one-shot authorization
tcat：Formal Manual Preview-Only；正式寫入需另行 one-shot authorization
7-11：Formal Manual Preview-Only（updated 2026-06-26；Published UI QA PASS；不支援正式寫入；不支援 auto-sync）
```

---

## 4. What This Means for Step 7

```text
Step 7 is not final complete yet.
Step 7 has completed the technical verification and safe preview path for multiple providers.
Remaining work is rollout policy / implementation alignment, not uncontrolled provider expansion.
```

「2. Current Provider Matrix」中的 Support Level 為目前狀態的**決策結果**，不代表已完成對應的 code alignment（例如：目前程式碼層級並無明確的「Level」標記欄位）。是否需要把這些 Level 落實到程式碼／文件規則，留待 `Step 7N-PROVIDER-ROLLOUT-POLICY-DOC` 決定。

---

## 5. Required Next Step

```text
Step 7P-ONE-SHOT-WRITE-SAFETY-GATE
```

用途：

- 正式建立 postoffice / tcat one-shot write safety gate 規格
- 確認 Authorization Text 格式、gate 開關流程、close gate 後驗收步驟
- 不直接開寫入，只建立規格文件與流程

---

## Step 7P Closeout（2026-06-26）

```text
Step 7P-MANUAL-PREVIEW-ALL-PROVIDERS-QA = COMPLETED / PARTIAL
```

| Provider | Level | 狀態 |
|----------|-------|------|
| familymart | Level 4 — Formal Auto Sync | ✅ unchanged |
| postoffice | Level 1 — Manual Preview-Only | ✅ confirmed |
| tcat | Level 1 — Manual Preview-Only | ✅ confirmed |
| 7-11 | Level 1 — Manual Preview-Only | ✅ confirmed |

- Docs + repo safety: PASS
- 7-11 Published UI QA: PASS（Step 7O / Step 7P 截圖驗收）
- postoffice Published UI QA: Published UI Screenshot Evidence PASS（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
- tcat Published UI QA: Published UI Screenshot Evidence PASS（Step 7P-SCREENSHOT-EVIDENCE-CLOSEOUT）
- Runtime files unchanged; no DB write; no commit route called
- See: `docs/step7/manual-preview-all-providers-qa.md`

---

## Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION Closeout（2026-06-26）

```text
Step 7P-PROVIDER-WRITE-CANDIDATE-DECISION = COMPLETED / PASS
```

| Provider | 決策 | 說明 |
|----------|------|------|
| familymart | 不參與 | 維持 Level 4 正式自動同步 |
| postoffice | **第一順位 one-shot write candidate** | hash-present；duplicate-only PASS；Published UI PASS；Level 不升 |
| tcat | **第二順位 one-shot write candidate** | hash-present；duplicate-only PASS；Published UI PASS；Level 不升 |
| 711 | **暫不列入第一批** | hash-null；不計算 duplicate-only；維持 Level 1 preview-only |

- postoffice / tcat 列為候選不等於已授權寫入；下一步需另開 one-shot authorization task
- 安全門規則：13 條，見 `docs/step7/provider-write-candidate-decision.md` Section 7
- See: `docs/step7/provider-write-candidate-decision.md`

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

| 項目 | 結果 |
|---|---|
| `COMMIT_ENABLED` | `false`（`ManualTrackingSyncPanel.tsx:141`） |
| `/manual-provider/commit` | 僅 `ManualTrackingSyncPanel.tsx:371`，於 guarded fetch 內（`!COMMIT_ENABLED` early return，未送出） |
| `MANUAL_SYNC_PROVIDERS` | `["postoffice", "tcat"] as const`（`ManualTrackingSyncPanel.tsx:37`），未變動 |
| `supportsAutoSync` | `logisticsProviders.ts` / `providers.ts` 皆未變動；僅 familymart=`true`，7-11 / tcat / postoffice 均為 `false` |
| `localStorage` / `sessionStorage` | CLEAN（`ManualTrackingSyncPanel.tsx` 內 0 處） |

---

## 參考文件

| 文件 | 內容 |
|---|---|
| `docs/step7/Step7完整計畫核取清單_總表版_更新至7N-STATUS-CORRECTION.md` | Step 7 目前狀態（IN PROGRESS / PARTIAL PASS）、已完成 / 未完成清單 |
| `docs/step7/manual-provider-production-can-write-candidates.md` | postoffice #38 / tcat #36 can-write candidate 詳情 |
| `docs/step7/manual-provider-commit-release-gate-decision.md` | one-shot authorization 流程、Authorization Text 格式、Rollback Plan |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md` | tcat #36 one-shot commit 收尾、gate 關回紀錄 |
| `docs/step7/mobile-brand-qa-closeout.md` | safe-preview-only 安全狀態重新確認 |
