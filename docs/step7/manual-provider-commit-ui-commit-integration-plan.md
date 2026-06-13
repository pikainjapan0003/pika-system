# ManualTrackingSyncPanel — Commit Endpoint Integration Plan
## Step 7N-J5F-7（plan only，不施工）

> **Code Verified：** 本計畫已於 2026-06-13 由 Claude A 讀取
> `artifacts/api-server/src/routes/logisticsSync.ts`（lines 328–534）
> 及 `artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx`（lines 1–460）實際比對，
> 所有欄位名稱、型別、error code 均與後端代碼一致。

---

## 0. 前置狀態

| 項目 | 狀態 |
|------|------|
| `/preview` 串接 | ✅ 已完成（J5F-4） |
| previewHash 儲存 | ✅ React state（job.previewHash），不渲染，不存 localStorage |
| previewExpired countdown | ✅ 已完成（J5F-5） |
| Confirm modal skeleton | ✅ 已完成（J5F-6） |
| 「確認寫入」按鈕 | 目前 disabled，本計畫定義啟用時機與流程 |
| `/commit` 串接 | 尚未施工，本輪只做計畫 |

---

## 1. Commit Request Body — 正確完整版本

### 錯誤示範（不可施工）

以下為不完整 body，後端驗證必然失敗：

```ts
// ❌ 不可使用 — 缺少必填欄位
{ provider, trackingId, previewHash }
```

後端 `/commit` 需要全部以下欄位（缺一回 400）：

```ts
// ✅ 正確 commit request body
{
  provider:                  job.provider,            // string："postoffice" | "tcat"
  trackingId:                job.trackingId,          // number
  trackingCode:              job.trackingCode,        // string（來自 job，不可從 DOM 讀）
  previewHash:               job.previewHash,         // string（來自 job，不可從 DOM 讀）
  confirmText:               "WRITE_TRACKING_EVENTS", // hardcoded，不可由 UI 輸入
  expectedEventCount:        job.wouldWriteEvents,    // number
  expectedLatestStatusText:  job.latestStatusText ?? null,  // string | null
  expectedLatestEventAt:     job.latestEventAt ?? null,     // string | null
}
```

### 關鍵安全規則

| 規則 | 原因 |
|------|------|
| `trackingCode` 必須來自 `job.trackingCode`（React state） | 後端做 scope check：previewHash 內的 trackingCode 必須與 request body 完全相符 |
| `previewHash` 必須來自 `job.previewHash`（React state） | 不可從 DOM 讀取、不可從 localStorage / sessionStorage 讀取 |
| `confirmText` 必須 frontend hardcoded `"WRITE_TRACKING_EVENTS"` | 後端 `COMMIT_CONFIRM_TEXT === "WRITE_TRACKING_EVENTS"`，不一致 → 400 CONFIRM_TEXT_INVALID |
| `expectedEventCount` 必須等於 `job.wouldWriteEvents`（整數） | 後端比對 token payload 的 expectedEventCount，不符 → 400 EXPECTED_EVENT_COUNT_MISMATCH |
| `expectedLatestStatusText` 必須等於 `job.latestStatusText ?? null` | 後端比對 token payload，不符 → 400 EXPECTED_LATEST_STATUS_MISMATCH |
| `expectedLatestEventAt` 必須等於 `job.latestEventAt ?? null` | 後端比對 token payload，不符 → 400 EXPECTED_LATEST_EVENT_AT_MISMATCH |
| 不可 commit previewExpired state | previewHash 已過期 → 後端 400 PREVIEW_EXPIRED |
| 不可 commit previewReadyNoNewEvents | wouldWriteEvents === 0，commit 無意義 |
| 不可 commit previewReadyDuplicateOnly | netNew === 0，commit 無意義 |
| 只允許 previewReadyCanCommit commit | netNew > 0 + previewHash 有效 |

### TypeScript 型別定義（J5F-7A 施工）

```ts
interface CommitRequestBody {
  provider: string;
  trackingId: number;
  trackingCode: string;
  previewHash: string;
  confirmText: "WRITE_TRACKING_EVENTS";
  expectedEventCount: number;
  expectedLatestStatusText: string | null;
  expectedLatestEventAt: string | null;
}

interface CommitSuccessResponse {
  ok: true;
  provider: string;
  trackingId: number;
  trackingCode: string;
  committed: true;
  insertedEventCount: number;
  idempotentNoop: boolean;
  runLogId: number;
  latestStatusText: string | null;
  latestEventAt: string | null;
}

interface CommitDriftedResponse {
  ok: false;
  code: "PREVIEW_DRIFTED";   // 注意：是 code，不是 errorCode
  message: string;
  freshPreview: {
    expectedEventCount: number;
    latestStatusText: string | null;
    latestEventAt: string | null;
  };
}

interface CommitErrorResponse {
  ok: false;
  errorCode: string;
  message: string;
}
```

---

## 2. confirmText 處理規則

```ts
// ✅ 正確：hardcoded 常數
const COMMIT_CONFIRM_TEXT = "WRITE_TRACKING_EVENTS" as const;

// ❌ 禁止：用戶輸入
// ❌ 禁止：prompt()
// ❌ 禁止：文字 input
// ❌ 禁止：可被 UI 修改
```

施工時：
- `confirmText` 作為 module-level 常數定義
- 不顯示給使用者輸入
- 直接包含在 commit body

---

## 3. Commit State Machine Plan

### 新增 state（補入現有 SyncPhase union）

```ts
type SyncPhase =
  // 既有（J5F-3 ~ J5F-6）
  | { phase: "idle" }
  | { phase: "previewLoading" }
  | { phase: "previewReadyCanCommit"; job: PreviewJob }
  | { phase: "previewReadyNoNewEvents"; job: PreviewJob }
  | { phase: "previewReadyDuplicateOnly"; job: PreviewJob }
  | { phase: "previewExpired"; job: PreviewJob }
  | { phase: "previewError"; errorCode: string; message: string }
  // 新增（J5F-7A）
  | { phase: "commitLoading"; job: PreviewJob }
  | { phase: "commitSuccess";
      insertedEventCount: number;
      latestStatusText: string | null;
      latestEventAt: string | null;
    }
  | { phase: "commitIdempotentNoop";
      latestStatusText: string | null;
      latestEventAt: string | null;
    }
  | { phase: "commitError"; errorCode: string; message: string }
  | { phase: "drifted";
      freshPreview: {
        expectedEventCount: number;
        latestStatusText: string | null;
        latestEventAt: string | null;
      };
    };
```

### 各 state 顯示文案

| State | Panel 顯示 | Modal 行為 |
|-------|-----------|------------|
| `commitLoading` | 結果卡維持顯示；按鈕文案「寫入中…」，disabled | Modal 開啟中，按鈕 disabled |
| `commitSuccess` | 「已寫入 N 筆貨態事件。」＋ 最新貨態 / 最新時間 | Modal 關閉 |
| `commitIdempotentNoop` | 「事件已存在，不需重複寫入。」 | Modal 關閉 |
| `commitError` | 中文錯誤訊息（errorCode）| Modal 關閉 |
| `drifted` | 「外部貨態已變動，請重新查詢後再確認。」 | Modal 關閉 |

### State 轉換圖

```
previewReadyCanCommit
  → [點擊「確認寫入」] → commitLoading
      → [ok=true, idempotentNoop=false] → commitSuccess → (關閉 modal, onOrderRefresh)
      → [ok=true, idempotentNoop=true]  → commitIdempotentNoop → (關閉 modal)
      → [409 PREVIEW_DRIFTED]           → drifted → (關閉 modal)
      → [其他錯誤]                       → commitError → (關閉 modal)
      → [network 錯誤]                   → commitError (NETWORK_ERROR)

commitSuccess / commitIdempotentNoop / drifted / commitError
  → [點擊「重新查詢」] → previewLoading → ...
```

### 重要：commit success 後的處理

```ts
// 成功後順序：
1. setSyncState({ phase: "commitSuccess", ... })
2. setModalOpen(false)
3. onOrderRefresh?.()    // qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) })
// 不轉回 previewReadyCanCommit（避免使用者意外再次 commit 同一個 previewHash）
```

---

## 4. Commit Error Mapping

### handleCommit 錯誤分類

```ts
// PREVIEW_DRIFTED 特殊處理：409 response 用 body.code，不是 body.errorCode
if (res.status === 409 && body.code === "PREVIEW_DRIFTED") {
  setSyncState({ phase: "drifted", freshPreview: body.freshPreview });
  setModalOpen(false);
  return;
}
```

### 完整 errorCode → 中文文案 mapping

| errorCode | 中文文案 |
|-----------|---------|
| `PREVIEW_EXPIRED` | 預覽已過期，請重新查詢後再確認。|
| `PREVIEW_HASH_INVALID` | 預覽驗證失敗，請重新查詢後再確認。|
| `PREVIEW_HASH_UNAVAILABLE` | 服務暫時無法處理，請稍後再試。|
| `PREVIEW_SCOPE_MISMATCH` | 預覽資料與請求不符，請重新查詢。|
| `PREVIEW_DRIFTED` | 外部貨態已變動，請重新查詢後再確認。（409，body.code，不是 body.errorCode）|
| `CONFIRM_TEXT_REQUIRED` | 系統錯誤：缺少確認欄位。（前端 bug，不應發生）|
| `CONFIRM_TEXT_INVALID` | 系統錯誤：確認欄位有誤。（前端 bug，不應發生）|
| `EXPECTED_EVENT_COUNT_MISMATCH` | 事件數量與預覽不符，請重新查詢。|
| `EXPECTED_LATEST_STATUS_MISMATCH` | 貨態與預覽不符，請重新查詢。|
| `EXPECTED_LATEST_EVENT_AT_MISMATCH` | 事件時間與預覽不符，請重新查詢。|
| `INVALID_PROVIDER` | 此物流目前不支援手動查詢。（後端唯一 provider 錯誤碼，含 711 / familymart 攔截）|
| `PROVIDER_NOT_ALLOWED` | **此 errorCode 不存在於後端**。後端一律回傳 `INVALID_PROVIDER`，前端 mapping 勿建立此 key。|
| `INVALID_TRACKING_ID` | 物流 ID 無效，請聯絡客服。|
| `TRACKING_CODE_MISMATCH` | 追蹤單號不符，請重新查詢。|
| `TRACKING_NOT_FOUND` | 找不到此物流資料。|
| `TRACKING_INACTIVE` | 此物流追蹤已停用。|
| `PROVIDER_MISMATCH` | 物流商與紀錄不符，請重新查詢。|
| `WRITE_FAILED` | 寫入失敗，請稍後再試。|
| `NETWORK_ERROR` | 網路錯誤，寫入未完成。|
| HTTP 401 | 請重新登入後再試。|
| HTTP 403 | 您沒有權限執行此操作。|
| HTTP 404 | 找不到此物流資料。（TRACKING_NOT_FOUND 同義）|
| HTTP 503 | 服務暫時無法處理，請稍後再試。（PREVIEW_HASH_UNAVAILABLE）|
| 其他 / UNKNOWN | 寫入失敗，請稍後再試。（fallback）|

### idempotentNoop 判斷

```ts
// 後端回傳：
// { ok: true, insertedEventCount: 0, idempotentNoop: true }
// → 表示 token.expectedEventCount > 0 但實際已全部存在（race condition）
// 前端顯示「事件已存在，不需重複寫入。」而非錯誤
if (body.ok && body.idempotentNoop) {
  setSyncState({ phase: "commitIdempotentNoop", latestStatusText: body.latestStatusText, latestEventAt: body.latestEventAt });
  setModalOpen(false);
  onOrderRefresh?.();
  return;
}
```

**⚠️ 重要邊界：** 後端 idempotentNoop 條件為
`insertedEventCount === 0 && tokenPayload.expectedEventCount > 0`。
若 preview 時 `wouldWriteEvents === 0`（noNewEvents），此 phase 在前端已被攔截不進 previewReadyCanCommit，
故正式 commit path 不會收到 `expectedEventCount === 0` 的 commit request。
換言之，idempotentNoop 只在 race condition（preview 後、commit 前另一個 request 搶先寫入）時出現。

---

## 5. Modal UI 施工計畫

### 觸發條件（J5F-7C）

```tsx
// previewReadyCanCommit 結果卡內的觸發按鈕：
<button onClick={() => setModalOpen(true)}>
  寫入事件
</button>
// （移除「尚未啟用」文字）
```

### Modal 確認按鈕（J5F-7C）

```tsx
// 目前（J5F-6）
<AlertDialogAction disabled>確認寫入（尚未啟用）</AlertDialogAction>

// J5F-7C 施工後
<AlertDialogAction
  onClick={() => void handleCommit()}
  disabled={syncState.phase === "commitLoading"}
>
  {syncState.phase === "commitLoading" ? "寫入中…" : "確認寫入"}
</AlertDialogAction>
```

### commit result 顯示（J5F-7D）

commitSuccess：
```tsx
<div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs">
  <p className="text-green-700 font-medium">已寫入 {insertedEventCount} 筆貨態事件。</p>
  {latestStatusText && <p className="text-muted-foreground">最新貨態：{latestStatusText}</p>}
</div>
```

commitIdempotentNoop：
```tsx
<p className="text-xs text-foreground/60 bg-secondary rounded-xl px-3 py-2">
  事件已存在，不需重複寫入。
</p>
```

drifted：
```tsx
<p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
  外部貨態已變動，請重新查詢後再確認。
</p>
```

commitError：
```tsx
<p className="text-xs text-destructive bg-red-50 border border-red-200 rounded-xl px-3 py-2">
  {message}（{errorCode}）
</p>
```

---

## 6. Safety Grep Plan（正式施工後必執行）

```bash
# /commit 只能出現在 commit fetch handler 中
grep -n "manual-provider/commit" artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx

# WRITE_TRACKING_EVENTS 只能出現在 hardcoded 常數定義
grep -n "WRITE_TRACKING_EVENTS" artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx

# previewHash 不可出現在 innerHTML / DOM 渲染中
grep -n "previewHash" artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx

# 不可使用瀏覽器儲存
grep -n "localStorage\|sessionStorage" artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx
```

通過條件：
- `/commit` 出現：僅在 `handleCommit` 的 `fetch(...)` url 中，其餘不應出現
- `WRITE_TRACKING_EVENTS`：僅在常數定義 `const COMMIT_CONFIRM_TEXT = "WRITE_TRACKING_EVENTS"` 一行
- `previewHash`：僅在 state 型別定義 `PreviewJob.previewHash` 及 commit body 建構，不在 JSX 渲染
- `localStorage` / `sessionStorage`：完全不出現

---

## 7. 後續施工拆分（J5F-7A ～ J5F-7H）

| 步驟 | 任務名稱 | 內容 | 是否改 runtime fetch |
|------|---------|------|---------------------|
| J5F-7A | COMMIT-REQUEST-BUILDER-NO-CALL | CommitRequestBody 型別 + buildCommitBody helper + 新增 SyncPhase states | 否（無 fetch） |
| J5F-7B | COMMIT-FETCH-HANDLER-MOCK-GUARD | handleCommit() 函式 + 頂層 guard（`COMMIT_ENABLED = false` → early return） | 是，但 guard 確保不送出 |
| J5F-7C | ENABLE-MODAL-CONFIRM-BUTTON | AlertDialogAction 移除 disabled，觸發按鈕文案更新，wire handleCommit | 是，guard 此時可移除 |
| J5F-7D | COMMIT-RESULT-UI-STATES | commitSuccess / commitIdempotentNoop / drifted / commitError UI 顯示 | 否（UI only） |
| J5F-7E | POST-COMMIT-REFRESH | onOrderRefresh?.() + qc.invalidateQueries 確認 | 否（已在 J5F-4 預留） |
| J5F-7F | BROWSER-QA-LOCAL-ONLY | 本機 dev server 手動 QA，確認 modal / states / error / drifted 流程 | 否 |
| J5F-7G | PRODUCTION-PREVIEW-SMOKE-ONLY | Production 只打 /preview，確認 previewHash 取得，不 commit | 否 |
| J5F-7H | PRODUCTION-COMMIT-RELEASE-GATE | Production 正式 commit，**需使用者明確授權** | 是，正式 production write |

### J5F-7H 發布門檻（必須全部滿足）

- [ ] J5F-7A ～ J5F-7G 全部 PASS
- [ ] typecheck PASS
- [ ] safety grep CLEAN
- [ ] browser QA 確認 modal 流程、DRIFTED 處理、success 後 UI
- [ ] production /preview smoke 確認 previewHash 正確取得
- [ ] 使用者明確授權「可以 production commit」
- [ ] 不得自行判斷「應該可以 commit」

---

## 8. 本輪不做事項（明確確認）

| 項目 | 狀態 |
|------|------|
| 修改 ManualTrackingSyncPanel.tsx runtime code | ❌ 不做 |
| 修改 EditOrderDialog.tsx | ❌ 不做 |
| 新增 commit fetch | ❌ 不做 |
| 串接 /commit endpoint | ❌ 不做 |
| 啟用「確認寫入」按鈕 | ❌ 不做 |
| Production /preview | ❌ 不做 |
| Production /commit | ❌ 不做 |
| 改 API code / DB / cron / supportsAutoSync | ❌ 不做 |
| git commit / push / Publish | ❌ 不做 |
| 貼出 token / secret / DATABASE_URL | ❌ 不做 |
| previewHash 渲染到 DOM | ❌ 不做 |
| previewHash 寫入 localStorage / sessionStorage | ❌ 不做 |

---

## 9. 關鍵 backend 行為備忘（已 code-verified 2026-06-13）

| 項目 | 後端行為 | 來源行號 |
|------|---------|---------|
| 409 PREVIEW_DRIFTED | `body.code === "PREVIEW_DRIFTED"`（不是 body.errorCode！）| logisticsSync.ts:493 |
| idempotentNoop | `ok=true && insertedEventCount===0 && idempotentNoop===true`；條件：`expectedEventCount > 0` | logisticsSync.ts:521 |
| scope check | previewHash 的 storeId + trackingId + provider + trackingCode 必須與 request body 完全相符 | logisticsSync.ts:~395 |
| re-dryRun | commit 前強制重做 dryRun，不符 → 409 PREVIEW_DRIFTED | logisticsSync.ts:487 |
| previewHash TTL | 10 分鐘，過期 → 400 PREVIEW_EXPIRED | previewToken.ts |
| WRITE_FAILED 來源 | DB lookup 失敗 → 500 / re-dryRun 失敗 → 502 / write 失敗 → 500 | logisticsSync.ts:~470~510 |
| PROVIDER_NOT_ALLOWED | **不存在**，後端使用 INVALID_PROVIDER（含 711 / familymart 訊息分支）| logisticsSync.ts:~357 |
| expectedEventCount 型別 | 後端做 `Number(expectedEventCount)` + `Number.isInteger` + `>= 0` 驗證 | logisticsSync.ts:416 |
| COMMIT_CONFIRM_TEXT 常數 | `"WRITE_TRACKING_EVENTS"`（後端 module-level const）| logisticsSync.ts:328 |
