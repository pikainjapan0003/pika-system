# Manual Provider Production Can-Write Candidates

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-J5F-7H-A-FIND-PRODUCTION-CAN-WRITE-CANDIDATE
**Author**: Claude A（worker = claude-a）

---

## Candidate Summary

| Candidate | Status |
|-----------|--------|
| postoffice #38 | GO candidate |
| tcat #36 | GO candidate |

---

## Candidate Details

### postoffice #38

| Field | Value |
|-------|-------|
| orderId | #38 |
| provider | postoffice |
| trackingCode | last4: 3004（完整值不記錄） |
| external events | 6 |
| existing DB events | 0 |
| wouldWriteEvents | 6 |
| latestStatusText | 投遞成功 |
| latestEventAt | 2026/06/11 10:32:48 |
| previewHash display status | hash-present only |

### tcat #36

| Field | Value |
|-------|-------|
| orderId | #36 |
| provider | tcat |
| trackingCode | last4: 4096（完整值不記錄） |
| external events | 5 |
| existing DB events | 0 |
| wouldWriteEvents | 5 |
| latestStatusText | 順利送達 |
| latestEventAt | 2026/05/29 08:31 |
| previewHash display status | hash-present only |

---

## Recommended first commit target

**tcat #36**

原因：
- 可寫事件較少（5 筆 vs 6 筆），rollback 範圍較小
- 黑貓流程前面已驗證過 duplicate-only 與 COMMIT_DISABLED guard（tcat #40）
- 萬一 commit 部分失敗，影響範圍最小

備選：
- postoffice #38（wouldWriteEvents=6）

---

## Required authorization before write

寫入前必須由使用者明確回覆以下完整格式（全部欄位必填）：

```
我授權 Step 7N-J5F-7H-B production one-shot commit：
storeId=2
provider=tcat
orderId=36
trackingCode last4=4096
wouldWriteEvents=5
只允許單筆 commit
確認可暫時開啟 COMMIT_ENABLED
確認可寫入 production DB
確認 commit 後需立刻驗證 duplicate-only
```

**沒有完整填寫以上格式者，不得啟用 COMMIT_ENABLED。**

---

## Non-actions this round

- **沒有改 COMMIT_ENABLED**（仍為 `const COMMIT_ENABLED: boolean = false`，ManualTrackingSyncPanel.tsx line 132）
- **沒有送出 /commit**（guard 保持，fetch 不執行）
- **沒有 production write**
- **沒有 DB mutation**
- **沒有 git commit / push / Publish**

---

## Related documents

| Document | Purpose |
|----------|---------|
| `manual-provider-commit-release-gate-decision.md` | Release gate 決策文件（Section 4 GO criteria、Section 7 Authorization Text 格式） |
| `manual-provider-safe-preview-only-closeout.md` | J5F-8 safe-preview-only 收尾文件 |
| `manual-provider-production-can-write-candidates.md` | 本文件；J5F-7H-A can-write candidate 確認 |
