# Claude Handoff：claude-a

## 任務
Step 7P-POSTOFFICE-ONE-SHOT-WRITE（gate-open 階段）

## 分支
qa/step6f-cvs-store-selection-browser-mobile

## 變更摘要
- 使用者已提供完整授權文字（postoffice #38 / tracking last4=3004 / 外部6 / DB0 / 可寫6 / 最新貨態「投遞成功」）
- 10 條寫入前檢查全部通過（check #5 preview 到期，需使用者在 UI 重新 preview）
- ManualTrackingSyncPanel.tsx 修改：COMMIT_ENABLED=true；加入 ONE_SHOT_COMMIT_PROVIDER / TRACKING_LAST4 / isOneShotCommitOrder；更新 handleCommit guard / canShowModal
- commit 6d74859: feat(step7): open one-shot gate postoffice order 38
- ⚠️ 等待使用者在 Published UI 執行寫入並回報結果

## 修改檔案
- artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx（gate-open：COMMIT_ENABLED=true + ONE_SHOT_COMMIT guard）

## 測試結果
- 已執行：
  - 10 條寫入前檢查：1–4 ✅ / 5 ⚠️（需重新 preview）/ 6–10 ✅
  - git diff runtime（gate-open 前）：空，確認無其他 runtime 異動
  - diff 審查：4 處修改精確，無旁及其他邏輯
- 未執行：
  - 實際寫入到 DB：需使用者在 Published UI 重新 preview 並點擊確認寫入後方可完成

## 風險與待確認
- ⚠️ gate 目前為 OPEN（COMMIT_ENABLED=true）— 使用者完成寫入後必須立刻通知 Claude A 關閉 gate
- preview 已過期，使用者需重新 preview 才能看到確認按鈕
- 一旦使用者在 UI 確認寫入，Claude A 必須立刻執行 J5F-7P-B（gate close）

## 最終回覆
**Gate 已開啟（commit `6d74859`）。**

---

## 寫入前 10 條檢查

| # | 條件 | 結果 |
|---|------|------|
| 1 | Provider = postoffice（第一順位 candidate） | ✅ |
| 2 | 使用者明確授權文字已收到，格式完整 | ✅ |
| 3 | 單一 provider / 單一 order #38 / 單一 tracking ****3004 | ✅ |
| 4 | previewHash = hash-present（截圖確認） | ✅ |
| 5 | preview 未過期 | ⚠️ 截圖剩餘 599 秒已過期；需重新 preview |
| 6 | 外部 6 / DB 0 / 可寫 6 與授權一致 | ✅ |
| 7 | latest status「投遞成功」與授權一致 | ✅ |
| 8 | 關門計畫已確認 | ✅ |
| 9 | Runtime diff 空（gate-open 前已驗證） | ✅ |
| 10 | 無 scheduled sync 異動 | ✅ |

---

## Gate 開啟內容（commit 6d74859）

```typescript
COMMIT_ENABLED: boolean = true
ONE_SHOT_COMMIT_PROVIDER = "postoffice"
ONE_SHOT_COMMIT_TRACKING_LAST4 = "3004"
function isOneShotCommitOrder(job): boolean { ... }
// handleCommit 加入 isOneShotCommitOrder guard
// canShowModal 加入 isOneShotCommitOrder check
```

postoffice ****3004 / order #38 以外的所有 order 仍被 guard 擋住，不會顯示確認按鈕。

---

## 請使用者執行（UI 操作）

1. 前往 Published 正式網站 Owner UI
2. 找到 postoffice order #38
3. 點擊「手動物流查詢」，執行**重新 preview**（舊 preview 已過期）
4. 確認顯示「6 筆新貨態事件可寫入」與「最新貨態：投遞成功」
5. 確認 previewHash = hash-present
6. 點擊「**確認寫入**」
7. 等待寫入完成，截圖結果（insertedEventCount / latestStatusText）
8. **回報給 Claude A**，讓我立刻關閉 gate（J5F-7P-B）

---

## ⚠️ 重要

Gate 目前為 **OPEN**。使用者完成寫入後必須立刻通知 Claude A，讓我執行 J5F-7P-B（COMMIT_ENABLED=false，移除 ONE_SHOT 常數，commit close-gate）。

**不得讓 gate 長期保持 open。**
