# Manual Provider Commit Release Gate Decision

**Date**: 2026-06-13
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7N-J5F-7H-PRODUCTION-COMMIT-RELEASE-GATE-DECISION
**Author**: Claude A（worker = claude-a）

---

## 1. Decision Summary

```
目前決策：NO-GO，不啟用 production commit。
原因：production 尚無可新寫入 > 0 的測試單；目前 #39/#40 皆為 duplicate-only，無法驗證真正 commit 寫入路徑。
```

```
COMMIT_ENABLED 必須維持 false。
```

**Current value**（ManualTrackingSyncPanel.tsx, line 131）：

```ts
const COMMIT_ENABLED: boolean = false;
```

此行不得修改，直到使用者完成 Section 4 全部 GO criteria 且明確授權（Section 7）。

---

## 2. Current Verified State

| Item | Status | Notes |
|------|--------|-------|
| postoffice #39 preview | PASS（duplicate-only） | 外部5 / DB5 / 可寫0；J5F-7F/7G 人工確認 |
| tcat #40 preview | PASS（duplicate-only） | 外部4 / DB4 / 可寫0；J5F-7F/7G 人工確認 |
| familymart #41 manual UI | PASS（hidden） | MANUAL_SYNC_PROVIDERS 排除，component returns null |
| COMMIT_DISABLED guard | PASS | line 341，在 fetch（line 362）前 early return |
| previewHash 不顯示完整值 | PASS | line 480 只顯示 hash-present / hash-null |
| commit endpoint auth guard | PASS | POST /api/stores/2/.../commit → 401（無 auth） |
| production write | 尚未授權、尚未執行 | — |
| COMMIT_ENABLED | false（hardcoded） | ManualTrackingSyncPanel.tsx line 131 |
| typecheck | PASS | npx tsc -p tsconfig.json --noEmit 無輸出 |
| localStorage / sessionStorage | CLEAN | safety grep 無輸出 |

---

## 3. Why Not Enable Yet

以下任一條件不符合即不得開啟 commit：

1. **沒有 production `wouldWriteEvents > 0` 測試單**
   - 目前 #39 postoffice 可寫入 0、#40 tcat 可寫入 0
   - duplicate-only 只能驗證「不重複寫入」，無法驗證「真正 insert 路徑」
   - 貿然啟用 commit 後無法確認 backend insertedEventCount 是否正確

2. **commit 一旦寫入會改 production DB，需要明確授權**
   - `shipment_tracking_events` 表新增 rows 屬不可逆操作（UI rollback 無法自動清除 DB rows）
   - 必須使用者以文字明確授權才可執行

3. **rollback 不是單純 UI rollback**
   - 若 commit 後發現寫入錯誤事件，需 DBA 或 SQL 手動刪除
   - 必須先準備 data rollback plan（Section 6）

4. **CONFIRM_TEXT 機制驗證尚未真實觸發**
   - `buildCommitBody` 中 `confirmText: "WRITE_TRACKING_EVENTS"` 邏輯正確（static）
   - 但 production 端 `COMMIT_CONFIRM_TEXT` 核對路徑從未在真實 production commit 中走過

5. **previewHash TTL 行為在 production 時序下尚未確認**
   - preview TTL 可能在 UI confirm modal 等待期間過期
   - 真實 production commit 路徑中 previewExpired / PREVIEW_DRIFTED 分支行為尚未驗證

---

## 4. Required GO Criteria

**必須全部符合才可進入 GO：**

- [ ] 找到一筆 production postoffice 或 tcat 訂單，preview 顯示：
  - `外部查到事件 > 0`（wouldWriteEvents > 0）
  - `可新寫入 > 0`（wouldWriteEvents - duplicateEvents > 0）
  - `hash-present`（previewHash 不為 null）
  - 沒有完整 previewHash 值顯示在 UI
- [ ] familymart / 7-11 仍隱藏 manual UI（在 GO 前再次確認一次）
- [ ] 使用者以 Section 7 格式明確文字授權，包含 storeId / provider / trackingId / trackingCode 末四碼
- [ ] 確認 rollback 方式（DB 事件清理 SQL 或等效方式）
- [ ] 確認 backend commit endpoint 在 production 可正確接受 8 欄位 body 並回 `ok: true`
- [ ] 只允許**單筆** trackingId，不做 bulk commit

---

## 5. Proposed Release Steps if GO Later

**只規劃，不施工。**

| Step | Name | 說明 | Production Write |
|------|------|------|-----------------|
| J5F-7H-A | FIND-PRODUCTION-CAN-WRITE-CANDIDATE | 在正式站找 wouldWriteEvents > 0 的訂單 | 否（只 preview） |
| J5F-7H-B | PRODUCTION-PREVIEW-RECORD | 對候選訂單做 preview，記錄 response（不含完整 previewHash） | 否（只 preview） |
| J5F-7H-C | EXPLICIT-USER-AUTHORIZATION | 使用者以 Section 7 格式明確授權單筆 trackingId | 否 |
| J5F-7H-D | ENABLE-COMMIT-GATE | 將 `COMMIT_ENABLED: boolean = false` 改為 `true`（或建立 one-shot release branch） | 否（只改 flag） |
| J5F-7H-E | SINGLE-TRACKINGID-COMMIT | 對單筆 trackingId 做 production commit，觀察 response | **是** |
| J5F-7H-F | POST-COMMIT-VERIFY | 確認 insertedEventCount / order trackingStatus / 再次 preview 顯示 duplicate-only | 否（唯讀） |
| J5F-7H-G | GATE-DECISION | 決定是否保留 COMMIT_ENABLED=true 或 rollback | 視情況 |

---

## 6. Rollback Plan

### UI Rollback

1. 將 `COMMIT_ENABLED: boolean = false` 改回（ManualTrackingSyncPanel.tsx line 131）
2. Publish / deploy 前端
3. 此步驟不改 DB，只關閉 UI 入口
4. 執行時間：約 5 分鐘

### Data Rollback（若 commit 寫入錯誤事件）

1. 確認 trackingId 和本次 commit 的 insertedEventCount
2. 僅刪除本次 commit 新增的 `shipment_tracking_events` rows（依 trackingId 和 createdAt 時間範圍）
3. 不刪除既有事件（duplicateEvents 對應的既有 rows）
4. 不操作其他 trackingId 的事件
5. 操作前先 SELECT 確認目標 rows
6. 執行後再次 preview 確認 duplicate-only 或事件計數

**注意**：Data rollback 需 DB 存取權限，需使用者或 DBA 執行。

### Operational Rollback

1. 立即停止再做 manual commit
2. 保留以下資訊：
   - 本次 commit 的 trackingId
   - insertedEventCount
   - previewHash（不對外貼出）
   - request / response timestamp
3. 回報使用者確認後再決定下一步

---

## 7. Authorization Text

**使用者未來要啟用 GO 時，必須在任務提示詞或對話中明確貼入以下格式（全部欄位必填）：**

```text
我授權 Step 7N-J5F-7H production commit release gate：
storeId=2
provider=postoffice 或 tcat（擇一）
trackingId=<正式站 trackingId>
trackingCode=<末四碼確認>
只允許單筆 commit
確認 COMMIT_ENABLED 可暫時開啟
確認可寫入 production DB
確認已準備 data rollback 方式
```

**沒有完整填寫以上格式者，不得啟用 COMMIT_ENABLED。**

---

## 8. Explicit Non-actions This Round

本輪（J5F-7H decision round）明確沒有：

- **沒有改 COMMIT_ENABLED**（仍為 false，line 131）
- **沒有送出 /commit**（guard 保持，fetch 不執行）
- **沒有 production write**
- **沒有改 DB**
- **沒有改 API code**
- **沒有改 frontend runtime code**（本輪只新增文件）
- **沒有 git commit**
- **沒有 push**
- **沒有 Publish**
- **沒有貼出完整 previewHash**
- **沒有貼出 token / cookie / secret / DATABASE_URL**

---

## 9. Recommended Decision

```
Recommended decision: NO-GO for enabling production commit now.

理由：
- production 目前無 wouldWriteEvents > 0 候選訂單（#39/#40 皆為 duplicate-only）
- 缺少真實 insert 路徑的 production 端驗證
- 缺少 data rollback 確認

Recommended next step（二擇一）：
A. 若近期有新貨態可寫入的 postoffice / tcat 訂單出現：
   → 進行 J5F-7H-A（找 can-write candidate），再逐步執行 J5F-7H-B ～ J5F-7H-G。
B. 若不急於 production commit，且 preview-only 功能已滿足目前需求：
   → 維持 COMMIT_ENABLED=false，關閉 J5F UI guard 階段，
     以 safe-preview-only 模式收尾（可在 UI 上調整按鈕文字為「預覽模式（僅查詢）」）。
```
