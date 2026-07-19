# Manual Provider Safe-Preview-Only Closeout

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-J5F-8-SAFE-PREVIEW-ONLY-CLOSEOUT
**Author**: Claude A（worker = claude-a）

---

## Status

```
Status: CLOSED AS SAFE-PREVIEW-ONLY
Commit enabled: NO
COMMIT_ENABLED: false
Production write: NO
```

---

## What Is Complete

| Item                                                                                                    | Status  | Step Completed                     |
| ------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------- |
| postoffice / tcat manual preview UI                                                                     | ✅ Done | J5F-3 / J5F-4                      |
| preview endpoint integration（/manual-provider/preview）                                                | ✅ Done | J5F-4                              |
| preview countdown / expired state                                                                       | ✅ Done | J5F-6                              |
| duplicate-only state UI                                                                                 | ✅ Done | J5F-4                              |
| confirm modal skeleton（AlertDialog）                                                                   | ✅ Done | J5F-6                              |
| commit request type + body builder（buildCommitBody）                                                   | ✅ Done | J5F-7A                             |
| guarded handleCommit skeleton（COMMIT_ENABLED=false）                                                   | ✅ Done | J5F-7B                             |
| commit result UI states（commitSuccess / commitIdempotentNoop / commitError / drifted / commitLoading） | ✅ Done | J5F-7D                             |
| post-commit refresh / invalidation wiring（refreshOrderAfterCommit）                                    | ✅ Done | J5F-7E                             |
| local browser QA（static analysis + dev server 疎通）                                                   | ✅ Done | J5F-7F（環境限制，使用者人工補測） |
| production preview smoke（#39/#40/#41）                                                                 | ✅ Done | J5F-7G（使用者人工確認）           |
| release gate decision 文件                                                                              | ✅ Done | J5F-7H                             |
| production commit 決策：NO-GO                                                                           | ✅ Done | J5F-7H                             |
| safe-preview-only closeout 文件（本文件）                                                               | ✅ Done | J5F-8                              |
| UI footer 文案更新（安全預覽模式）                                                                      | ✅ Done | J5F-8                              |

---

## Current Safe Behavior

| Behavior                                                            | Status                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| postoffice 可查詢 preview                                           | ✅ 可以                                                        |
| tcat 可查詢 preview                                                 | ✅ 可以                                                        |
| duplicate-only 不顯示寫入按鈕                                       | ✅ 確認（previewReadyDuplicateOnly branch 無 commit button）   |
| can-write 狀態點確認 → COMMIT_DISABLED 擋下                         | ✅ 確認（COMMIT_ENABLED=false guard，line 132）                |
| modal 點「確認寫入（尚未啟用）」→ modal 關閉 + COMMIT_DISABLED 錯誤 | ✅ 確認                                                        |
| familymart 不顯示 manual UI                                         | ✅ 確認（MANUAL_SYNC_PROVIDERS 排除，returns null）            |
| 7-11 不顯示 manual UI                                               | ✅ 確認（同上）                                                |
| previewHash 不顯示完整值                                            | ✅ 確認（只顯示 hash-present / hash-null）                     |
| /commit 不執行                                                      | ✅ 確認（COMMIT_ENABLED=false guard 在 fetch 前 early return） |
| localStorage / sessionStorage                                       | ✅ CLEAN（safety grep 無輸出）                                 |

---

## Why Commit Remains Disabled

1. **沒有 production 可新寫入 > 0 candidate**
   - postoffice #39：外部 5 / DB 5 / 可寫 0（duplicate-only）
   - tcat #40：外部 4 / DB 4 / 可寫 0（duplicate-only）
   - 不應使用 duplicate-only 案例測試 production commit

2. **production DB write 需要單筆 trackingId 明確授權**
   - `shipment_tracking_events` 新增 rows 屬不可逆操作
   - 必須使用者以文字明確授權才可執行

3. **rollback 需要 data rollback plan**
   - 若寫入錯誤事件，需 DB 層手動清除
   - 目前尚未備妥

4. **preview → commit 真實路徑從未在 production 走過**
   - CONFIRM_TEXT 核對、previewHash TTL、PREVIEW_DRIFTED 分支行為尚未驗證

---

## Future Reopen Condition

**未來只有符合以下全部條件，才重新開 J5F-7H-A：**

- [ ] 找到 production postoffice 或 tcat 訂單，preview 顯示 `可新寫入 > 0`（wouldWriteEvents > 0）
- [ ] preview 顯示 `hash-present`（previewHash 不為 null）
- [ ] 使用者提供 Authorization Text（見 `manual-provider-commit-release-gate-decision.md` Section 7）格式
- [ ] 已備妥 data rollback plan（能清除本次 commit 新增的 `shipment_tracking_events` rows）
- [ ] 只允許**單筆** trackingId commit，不做 bulk
- [ ] 先做 production preview smoke，確認正確後再做 release gate

**不符合以上任一條件，不得修改 `COMMIT_ENABLED`。**

---

## Related Documents

| Document                                               | Purpose                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `manual-provider-commit-ui-commit-integration-plan.md` | 原始 J5F-7 commit endpoint 串接計畫                                                       |
| `manual-provider-commit-ui-spec.md`                    | UI spec                                                                                   |
| `manual-provider-commit-release-gate-decision.md`      | J5F-7H release gate 決策（NO-GO 理由 + GO criteria + Authorization Text + Rollback Plan） |
| `manual-provider-safe-preview-only-closeout.md`        | 本文件；J5F-8 safe-preview-only 收尾                                                      |

---

## Explicit Non-actions at Closeout

- **COMMIT_ENABLED 未改動**（仍為 `const COMMIT_ENABLED: boolean = false`，ManualTrackingSyncPanel.tsx line 132）
- **/commit 未送出**（guard 保持，fetch 不執行）
- **production write 未執行**
- **DB 未修改**
- **git commit / push / Publish 未執行**
- **previewHash 完整值未對外貼出**
