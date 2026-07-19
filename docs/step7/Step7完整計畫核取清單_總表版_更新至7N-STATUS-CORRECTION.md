# Step 7 完整計畫核取清單（總表版）— 更新至 7N-STATUS-CORRECTION

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-STATUS-CORRECTION-NOT-FINAL-CLOSEOUT
**Author**: Claude A（worker = claude-a）

---

## 0. 版本來源說明（重要）

本輪任務要求優先讀取 Google Drive 資料夾中的以下主計畫檔案作為來源：

- `Step7完整計畫核取清單_總表版_更新至7N-BRAND.md`
- `Step7完整計畫核取清單_總表版_更新至7N-J2F3.md`
- `Step7計劃表_修正版_v8_正式整理版.md`

實際對 workspace 全域（含 `docs/`、所有 `.worktrees/*`）執行搜尋後，**以上三個檔名皆未在 workspace 中找到**。本工具無法直接存取使用者的 Google Drive 檔案內容，因此**不宣稱已讀取上述 Drive 版本**。

> ⚠️ **需要使用者重新提供檔案**：若上述三份檔案中任何一份在 Drive 中存在且內容與本檔不同，請使用者重新提供（上傳至 workspace 或貼上內容），以便後續比對合併，避免本檔與 Drive 版本內容分岔。

本檔改以下列來源為基礎：

- 本輪任務 prompt 明確提供的「已完成」「未完成 / blocked」「下一步建議」等修正內容（逐項採用，視為本輪權威來源）
- workspace 內最近一版本機總表 `docs/step7/Step7完整計畫核取清單_總表版_更新至7N-MOBILE-BRAND-QA.md`（上一輪 Step 7N-UPDATE-MAIN-CHECKLIST-AFTER-MOBILE-BRAND-QA 產出，本身亦為 workspace 內新建，非 Drive 版本）
- `docs/step7/` 下其他既有紀錄文件

---

## 1. Step 7 核心目標

> 完成 Step 7 物流追蹤層，讓代購系統可以安全、可控地處理多物流商貨態，而不是亂開所有物流正式寫入。

---

## 2. 整體狀態（重要更正）

```text
Step 7 整體狀態：IN PROGRESS / PARTIAL PASS

不可標記為 COMPLETE
不可標記為 final closeout
```

上一輪「Step 7N-FINAL-LOGISTICS-LAYER-CLOSEOUT」方向**暫停**。本檔取代該方向作為目前的單一參照總表；後續任務請以本檔「6. 下一步建議」為準，不得直接沿用上一版總表的「下一步建議」。

---

## 3. 為什麼不能 final closeout

- postoffice 尚未完整正式上線，只完成 adapter / preview / controlled production E2E 驗證
- tcat 尚未完整正式上線，只完成 adapter / preview / controlled production E2E 與 #36 one-shot 驗證
- 7-11 尚未施工，仍是 blocked / research
- production 目前應維持 `COMMIT_ENABLED=false` / safe-preview-only
- 不可把 controlled verification 誤寫成 formal provider launch
- 多物流商「正式上線策略」（是否上線、上線標準、由誰/何時決定）尚未訂定

---

## 4. 已完成

| 項目                                                     | 狀態         | 備註 / commit                                                                                                     |
| -------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| familymart formal auto sync                              | ✅ Completed | `supportsAutoSync: true`，僅 familymart；正式自動同步運作中                                                       |
| postoffice adapter / preview / controlled production E2E | ✅ Verified  | J5A～J5E，order #39 / trackingId=2，insertedEventCount=5，delivered                                               |
| tcat adapter / preview / controlled production E2E       | ✅ Verified  | J6A～J6E，order #40 / trackingId=3，insertedEventCount=4，delivered                                               |
| tcat #36 one-shot owner UI production commit             | ✅ Verified  | J5F-7H-B，外部5 / DB0 → 寫入5筆，最新貨態「順利送達」                                                             |
| one-shot gate closed                                     | ✅ Done      | J5F-7H-C，`COMMIT_ENABLED` 恢復 `false`，one-shot 相關程式碼已移除                                                |
| production safe-preview-only restored                    | ✅ Done      | `ManualTrackingSyncPanel.tsx:141` `COMMIT_ENABLED: boolean = false`；safe-preview-only footer 顯示中              |
| brand / mobile QA                                        | ✅ Completed | Step 7N-BRAND-COPY-UI-RENAME-DRAWDREAM（commit `2a1a2f4`）＋ Step 7N-MOBILE-BRAND-QA-CLOSEOUT（commit `800ee68`） |

**注意**：以上「Verified / Completed」均指 controlled verification（preview / one-shot / 小規模 E2E），**不等於 formal provider launch**。

---

## 5. 未完成 / blocked

| 項目                               | 狀態                         | 備註                                                                                                               |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| postoffice formal rollout decision | ⏸️ Not decided               | 是否、何時正式上線、正式上線標準均未訂定                                                                           |
| tcat formal rollout decision       | ⏸️ Not decided               | 是否、何時正式上線、正式上線標準均未訂定                                                                           |
| postoffice #38                     | ⏸️ Blocked（未授權，不可動） | can-write candidate（外部6 / DB0 / 可寫6，最新貨態「投遞成功」），須使用者另行提供完整 Authorization Text 才可操作 |
| 7-11                               | ⛔ Blocked / research        | 尚未施工；`MANUAL_SYNC_PROVIDERS` / `supportsAutoSync` 均未包含，不得新增正式支援                                  |
| 多物流商正式上線策略               | ⏸️ Not decided               | postoffice / tcat 是否、何時、依何標準轉為 formal launch 尚未決定                                                  |
| Step 7 總收尾                      | ⛔ 不可進行                  | 上述未完成項目存在期間，Step 7 不可標記為 complete / final closeout                                                |

---

## 6. 下一步建議

```text
Step 7N-PROVIDER-ROLLOUT-DECISION-MATRIX
```

用途：

- 決定 postoffice / tcat 要不要正式上線
- 決定正式上線標準
- 決定是否需要更多 controlled one-shot
- 決定 7-11 是另開 research 還是延後
- 決定 Step 7 何時才可以真正 closeout

---

## 7. 嚴格禁止（本輪適用，沿用至下一輪）

```text
不可送出 /manual-provider/commit
不可 production write
不可 DB mutation
不可操作 postoffice #38 寫入
不可改 API
不可改 cron
不可改 supportsAutoSync
不可改 provider whitelist
不可把 COMMIT_ENABLED 改 true
不可新增 7-11 支援
不可 Publish runtime code
```

---

## 8. 參考文件

| 文件                                                                   | 內容                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/step7/Step7完整計畫核取清單_總表版_更新至7N-MOBILE-BRAND-QA.md`  | 上一版總表（其「整體狀態」與「下一步建議」已由本檔修正取代，其餘逐項紀錄仍可參照） |
| `docs/step7/postoffice-manual-commit-flow.md`                          | postoffice J5A～E production E2E 記錄                                              |
| `docs/step7/tcat-manual-commit-gate-plan.md`                           | tcat J6A～E production E2E 記錄                                                    |
| `docs/step7/manual-provider-commit-ui-spec.md`                         | owner UI commit 規格                                                               |
| `docs/step7/manual-provider-commit-ui-commit-integration-plan.md`      | commit 整合計畫                                                                    |
| `docs/step7/manual-provider-commit-release-gate-decision.md`           | release gate 決策、Authorization Text 格式、Rollback Plan                          |
| `docs/step7/manual-provider-production-can-write-candidates.md`        | postoffice #38 / tcat #36 can-write candidate 詳情                                 |
| `docs/step7/manual-provider-safe-preview-only-closeout.md`             | J5F-8 safe-preview-only 收尾                                                       |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md`     | J5F 全系列最終收尾（tcat #36）                                                     |
| `docs/step7/brand-copy-ui-rename-drawdream.md`                         | 品牌文案更名（畫夢代購 / DrawDream），commit `2a1a2f4`                             |
| `docs/step7/mobile-brand-qa-closeout.md`                               | mobile / brand / logistics UI QA closeout，commit `800ee68`                        |
| `docs/step7/owner-order-detail-manual-provider-implementation-plan.md` | owner UI 實作步驟切分（J5F-2A～12）                                                |
