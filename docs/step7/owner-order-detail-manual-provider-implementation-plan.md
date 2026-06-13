# Owner Order Detail Manual Provider Implementation Plan
# owner 訂單詳情「包裹追蹤」手動物流同步升級實作計畫

> **文件狀態**：實作計畫草稿（不施工）  
> **建立日期**：2026-06-13  
> **前置依賴**：`docs/step7/manual-provider-commit-ui-spec.md`（J5F-1 review PASS）  
> **主要改動目標**：`artifacts/shop-app/src/pages/EditOrderDialog.tsx`

---

## 1. 實作目標

升級 `EditOrderDialog.tsx`「包裹追蹤」區塊（目前 L1002–1051），從 dryRun-only 單一按鈕升級為完整 **preview → 二次確認 → commit** 流程。

**具體目標**：

| 目標 | 說明 |
|------|------|
| owner 可查詢 postoffice / tcat 最新貨態 | 呼叫 `/preview` dryRun，顯示 wouldWriteEvents |
| 先 preview，不直接寫入 | previewHash 只存 component state，不寫 DB |
| 若有新事件，顯示二次確認 modal | `netNewEvents > 0` 才啟用「確認寫入事件」 |
| 確認後才呼叫 `/commit` 正式寫入 | 帶 previewHash + confirmText + expected 欄位 |
| commit 成功後 refresh 訂單 | 呼叫 `qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) })` |
| 避免重複 commit | commit 後禁用按鈕，直到新 preview 顯示 `netNewEvents > 0` |
| familymart / 7-11 不顯示 manual commit UI | 沿用現有 provider 條件邏輯 |

---

## 2. 現有程式基準

**主要檔案**：`artifacts/shop-app/src/pages/EditOrderDialog.tsx`

| 現況項目 | 狀態 |
|----------|------|
| 「包裹追蹤」區塊位置 | L940–1054（IIFE render block）|
| 現有 manual query 狀態 | L234–240：3 個 `useState`（`manualQuerying`、`manualQueryResult`、`manualQueryError`）|
| 現有 API endpoint | L249：`/api/stores/${storeId}/logistics/sync/manual-provider`（舊 endpoint，dryRun:true）|
| 是否有 previewHash | ❌ 無（舊 endpoint 不回傳 previewHash）|
| 是否有 commit flow | ❌ 無（純 dryRun-only）|
| 是否有 confirm modal | ❌ 無（AlertDialog 未在此 file 使用）|
| query invalidation | ✅ L540：`qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) })`（已有，用在 updateOrder）|
| auth token 取法 | ✅ L220：`const { getToken } = useAuth()`（已有）|
| AlertDialog 在此 file | ❌ 未引入；Orders.tsx 已有完整用法可參考（L1258–1283）|

---

## 3. 建議檔案拆分

### 方案 A：在 EditOrderDialog.tsx 內直接升級

優點：
- 不需新增 component 檔案
- 可複用既有 `storeId`、`getToken`、`qc`
- 快速 smoke，不需改 import 架構

缺點：
- EditOrderDialog.tsx 已有約 1100 行；再加 preview/commit state machine 會更龐大
- state 與現有 form state 混雜（buyerName、paymentStatus 等 vs previewHash、commitState）

### 方案 B：抽出 ManualTrackingSyncPanel component

**建議路徑**：
```text
artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx
```
（與現有 `LogisticsSyncStatusNotice.tsx`、`RecipientAddressFields.tsx` 同層）

優點：
- 狀態隔離（component 內自管 preview/commit state machine）
- EditOrderDialog.tsx 只傳 props，不感知內部狀態
- 未來可在訂單列表卡片或其他頁面重用
- 測試更容易（component 獨立）

缺點：
- 初次需新增一個 component 檔案
- 需設計 props interface（storeId、tracking、onOrderRefresh）

### **建議採用方案 B（抽出 component）**

理由：preview/commit state machine 有 12 個 state，含 previewHash 存放、TTL countdown、confirm modal、錯誤分支。與 EditOrderDialog 既有 form state（20+ useState）混在一起會造成長期維護困難。方案 B 讓 EditOrderDialog 只負責「顯示條件判斷 + 傳入 props」，職責清楚。

---

## 4. Component Props 設計

**component 名稱**：`ManualTrackingSyncPanel`  
**路徑**：`artifacts/shop-app/src/components/ManualTrackingSyncPanel.tsx`

```typescript
// Props interface 草案（不實作）

interface ShipmentTrackingSummary {
  id: number;
  trackingCode: string;
  trackingProvider: string;
  isActive: boolean;
  trackingStatus: string;
  latestEventDescription?: string | null;
  latestEventAt?: string | null;
  lastCheckedAt?: string | null;
}

interface ManualTrackingSyncPanelProps {
  storeId: number;
  orderId: number;
  shipmentTracking: ShipmentTrackingSummary;
  // callback：commit 成功後通知父層 refresh order
  onOrderRefresh: () => void;
  // 選填：外部 disabled（例如 dialog 正在儲存表單中）
  disabled?: boolean;
}
```

**父層使用方式（EditOrderDialog 負責條件判斷）**：

```typescript
// EditOrderDialog.tsx 內（不實作，僅示意）
{tracking &&
  (tracking.trackingProvider === "postoffice" || tracking.trackingProvider === "tcat") &&
  tracking.isActive &&
  tracking.trackingCode.trim() && (
    <ManualTrackingSyncPanel
      storeId={storeId}
      orderId={order.id}
      shipmentTracking={tracking}
      onOrderRefresh={() =>
        qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) })
      }
    />
  )
}
```

---

## 5. State Machine 實作設計

### 建議：使用 `useReducer`

原因：12 個 state + 多個 action 組合（previewSuccess、previewFail、commit、drift 等），用多個 `useState` 難以確保 state 一致性（例如不可能同時處於 `previewLoading` 和有 previewHash）。`useReducer` 可強制一次一個有效 state。

### State 定義（TypeScript interface 草案）

```typescript
type SyncState =
  | { phase: "idle" }
  | { phase: "previewLoading" }
  | {
      phase: "previewReadyCanCommit";
      job: PreviewJob;       // 完整 preview job，含 previewHash（存此處）
      expiresAt: string;     // previewExpiresAt，用於 countdown
    }
  | {
      phase: "previewReadyNoNewEvents";
      job: PreviewJob;
    }
  | { phase: "previewExpired" }
  | { phase: "previewError"; errorCode: string; message: string }
  | {
      phase: "commitConfirming";
      job: PreviewJob;       // 傳給 modal 顯示用（previewHash 也在此）
    }
  | { phase: "commitLoading" }
  | {
      phase: "commitSuccess";
      insertedEventCount: number;
      latestStatusText: string | null;
      latestEventAt: string | null;
    }
  | { phase: "commitIdempotentNoop" }
  | { phase: "commitError"; errorCode: string; message: string }
  | { phase: "drifted" };

interface PreviewJob {
  trackingId: number;
  trackingCode: string;
  previewHash: string;        // 只存在 state，不渲染到 DOM
  wouldWriteEvents: number;
  duplicateEvents: number;
  latestStatusText: string | null;
  latestEventAt: string | null;
  previewExpiresAt: string | null;
  status: string;
  errorCode?: string | null;
}
```

### previewHash 存放位置

`previewHash` 存在 `SyncState` 的 `previewReadyCanCommit.job.previewHash` 與 `commitConfirming.job.previewHash` 內。

**規則**：
- 不可從 DOM 讀（不可放 `data-*` 屬性或渲染到任何 HTML 元素）
- 不可寫 `localStorage` / `sessionStorage` / `cookie`
- phase 轉為 `idle` / `previewExpired` / `drifted` / `commitError` 時，含 previewHash 的 state 物件自然被清除

### countdown 設計

`previewExpiresAt` 是 ISO 字串（job-level），**不在 state machine 中計算**。

建議用 `useEffect` + `setInterval` 在 component 內計算剩餘秒數：

```typescript
// 概念示意（不實作）
const remainingSeconds = useMemo(() => {
  if (state.phase !== "previewReadyCanCommit") return null;
  const exp = new Date(state.expiresAt).getTime();
  return Math.max(0, Math.floor((exp - Date.now()) / 1000));
}, [state, tick]); // tick 每秒更新一次
```

若 `remainingSeconds <= 0`，dispatch `{ type: "PREVIEW_EXPIRED" }` 轉為 `previewExpired` state。

---

## 6. API 呼叫設計

### Preview 呼叫

```typescript
// 示意（不實作）
async function callPreview(
  storeId: number,
  provider: "postoffice" | "tcat",
  trackingId: number,
  getToken: () => Promise<string | null>
): Promise<PreviewResponse> {
  const token = await getToken();
  const res = await fetch(
    `/api/stores/${storeId}/logistics/sync/manual-provider/preview`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ provider, trackingIds: [trackingId] }),
    }
  );
  return res.json();
}
```

### Commit 呼叫

```typescript
// 示意（不實作）
async function callCommit(
  storeId: number,
  job: PreviewJob,           // 來自同一次 preview response（含 previewHash）
  getToken: () => Promise<string | null>
): Promise<CommitResponse> {
  const token = await getToken();
  const res = await fetch(
    `/api/stores/${storeId}/logistics/sync/manual-provider/commit`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        provider: job.provider,         // 注意：PreviewJob 需含 provider
        trackingId: job.trackingId,
        trackingCode: job.trackingCode,
        previewHash: job.previewHash,   // 從 state 取，不從 DOM
        confirmText: "WRITE_TRACKING_EVENTS",  // hardcoded，不暴露使用者輸入
        expectedEventCount: job.wouldWriteEvents,
        expectedLatestStatusText: job.latestStatusText ?? null,
        expectedLatestEventAt: job.latestEventAt ?? null,
      }),
    }
  );
  return res.json();
}
```

**嚴格規則**：
- `previewHash` 必須從 `state.job.previewHash` 取（component state），不可從 DOM 讀
- 不可寫 `localStorage`
- 不可讓使用者輸入 `confirmText`
- commit body 必須全部來自同一次 preview response 的 `job` 物件
- 不可混用不同 provider 或不同 trackingId 的 job

---

## 7. UI 顯示條件

### ManualTrackingSyncPanel 顯示條件（由父層 EditOrderDialog 判斷）

| 條件 | 來源 |
|------|------|
| 使用者已認證 | Clerk auth（`requireAuth`，後端驗證）|
| `shipmentTracking` 存在且非 null | `order.shipmentTracking !== null` |
| `isActive === true` | `tracking.isActive === true` |
| `trackingCode.trim() !== ""` | 非空字串 |
| `trackingProvider` in `["postoffice", "tcat"]` | 使用 `normalizeTrackingProvider()` 正規化後比對 |

### 不顯示 / disabled 條件

| 條件 | 說明 |
|------|------|
| `trackingProvider === "familymart"` | 不渲染 panel；familymart 走整批同步 |
| `trackingProvider === "711"` | 不渲染 panel；7-11 尚未支援 |
| `isActive === false` | 不渲染 panel |
| `trackingCode` 空字串 | 不渲染 panel |
| `props.disabled === true` | panel 顯示但所有按鈕 disabled |
| commit 完成後、且 phase 在 `commitSuccess` / `commitIdempotentNoop` | 「確認寫入事件」禁用，直到新 preview 顯示 `netNewEvents > 0` |

---

## 8. 二次確認 Modal 設計

### 使用 AlertDialog（與 Orders.tsx 同套件）

Orders.tsx 已有完整範例（L1258–1283）：
```typescript
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
```

### Modal 顯示資料（從 `state.job` 取）

| 欄位 | 說明 |
|------|------|
| provider label | `getProviderDisplayName(state.job.provider)` |
| trackingCode | 後 4 碼顯示（`****${code.slice(-4)}`）|
| netNewEvents | `state.job.wouldWriteEvents - state.job.duplicateEvents` |
| duplicateEvents | 已存在 N 筆（`state.job.duplicateEvents`）|
| latestStatusText | `state.job.latestStatusText` |
| latestEventAt | `state.job.latestEventAt` |
| countdown | 剩餘 TTL 秒數（derived，見 §5）|

### Modal 文案

```
標題：確認寫入貨態事件
說明：將寫入正式貨態事件，寫入後不可直接復原。是否確認？

[取消]  [確認寫入事件]
```

**注意**：
- `AlertDialogCancel` → dispatch `{ type: "CANCEL_CONFIRM" }` → 回到 `previewReadyCanCommit`
- `AlertDialogAction` → dispatch `{ type: "CONFIRM_COMMIT" }` → 進入 `commitLoading`

---

## 9. Post-Commit Refresh / Invalidation

### 最小安全做法

```typescript
// ManualTrackingSyncPanel 內（概念示意）
// commit 成功後：
dispatch({ type: "COMMIT_SUCCESS", payload: commitResponse });
props.onOrderRefresh();  // → 父層呼叫 qc.invalidateQueries(getListOrdersQueryKey)
```

EditOrderDialog 傳入的 `onOrderRefresh` 實作：
```typescript
onOrderRefresh={() => qc.invalidateQueries({ queryKey: getListOrdersQueryKey(storeId) })}
```

### invalidateQueries 注意事項

- `getListOrdersQueryKey(storeId)` 的 query 會重新 fetch，更新 `shipmentTracking.trackingStatus`
- **不需要**單獨 invalidate 某個 order 詳情，因為 EditOrderDialog 的 `order` prop 來自 `useListOrders` 的同一個 query
- commit 成功後 phase 進入 `commitSuccess`，此時「確認寫入事件」禁用，防止重複

### 可選驗證步驟（非必須）

commit 成功後，可選擇重新跑 preview 驗證 `duplicateEvents === wouldWriteEvents`：
- 若重新 preview，會把 state 從 `commitSuccess` 轉回 `previewLoading`
- 建議以「重新查詢」按鈕觸發，不自動執行（避免 TTL 問題）

---

## 10. Error Handling Mapping

### Backend actual errorCode → UI state + 中文文案

| errorCode / 狀況 | UI state | 中文文案 |
|----------------|---------|---------|
| `PREVIEW_EXPIRED`（previewToken.ts:84）| `previewExpired` | 預覽已過期，請重新查詢。 |
| `PREVIEW_HASH_INVALID`（previewToken.ts:62–81）| `commitError` → dispatch idle | 預覽驗證失敗，請重新查詢。 |
| HTTP 409，`body.code === "PREVIEW_DRIFTED"` | `drifted` | 外部貨態已變動，請重新查詢後再確認。 |
| `PROVIDER_NOT_ALLOWED`（/preview L117）| `previewError` | 此物流目前不支援手動寫入。 |
| `INVALID_PROVIDER`（/commit L362）| `commitError` | 此物流目前不支援手動寫入。 |
| `TRACKING_NOT_FOUND`（/commit L445）| `commitError` | 找不到此物流資料，請重新整理後再試。 |
| `WRITE_FAILED`（/commit L474/L512）| `commitError` | 伺服器暫時無法處理，請稍後再試。 |
| HTTP 401 | `previewError` / `commitError` | 請重新登入後再試。 |
| HTTP 403 | `previewError` / `commitError` | 你沒有此店鋪的操作權限。 |
| fetch throw（網路錯誤）| `previewError` / `commitError` | 網路錯誤，請稍後再試。 |
| 其他 5xx | `previewError` / `commitError` | 伺服器暫時無法處理，請稍後再試。 |

**判斷 PREVIEW_DRIFTED 的正確方式**（409 用 `code` 欄位，非 `errorCode`）：
```typescript
if (res.status === 409 && body.code === "PREVIEW_DRIFTED") {
  dispatch({ type: "DRIFTED" });
  return;
}
```

### UI-derived state → 中文文案

| UI state | 推導條件 | 中文文案 |
|----------|---------|---------|
| `previewReadyNoNewEvents` | `wouldWriteEvents === 0` 或 `wouldWriteEvents === duplicateEvents` | 目前沒有新事件，不需寫入。 |
| `commitIdempotentNoop` | `ok=true` 且 `idempotentNoop === true` | 事件皆已存在，本次未寫入新資料。 |

---

## 11. 測試計畫

### Unit / Component Test（規劃，不執行）

| 測試項目 | 目的 |
|----------|------|
| postoffice provider → 顯示 panel | provider allowlist 正確 |
| tcat provider → 顯示 panel | provider allowlist 正確 |
| familymart provider → 不顯示 panel | provider exclusion 正確 |
| 7-11 provider → 不顯示 panel | provider exclusion 正確 |
| `isActive=false` → 不顯示 panel | isActive gate 正確 |
| `trackingCode=""` → 不顯示 panel | trackingCode gate 正確 |
| preview success, netNewEvents > 0 → 顯示「確認寫入事件」按鈕 | happy path |
| preview success, netNewEvents = 0 → 「確認寫入事件」不顯示 / disabled | no-op path |
| previewHash 不存在於 DOM（無 `data-*` 屬性）| 安全規則 |
| PREVIEW_DRIFTED → dispatch drifted state | 特殊 409 處理 |
| commit success → `onOrderRefresh` 被呼叫 | refresh callback 正確 |

### Browser QA（規劃，不執行）

| 情境 | 預期行為 |
|------|---------|
| preview success（netNewEvents > 0）| 顯示新事件數，「確認寫入事件」可點 |
| preview no new events | 顯示「已是最新」，commit 按鈕不顯示 |
| commit success | 顯示「寫入完成 N 筆」，order refetch |
| commit idempotentNoop | 顯示「事件皆已存在」 |
| preview expired（等待 10 分鐘後 commit）| 顯示「預覽已過期」，回 idle |
| drifted | 顯示「外部貨態已變動」，重新查詢 |
| mobile layout | 按鈕可點、modal 可見、文字不截斷 |

### Production Smoke（規劃，不執行）

| 操作 | 限制 |
|------|------|
| `/preview` dryRun smoke | ✅ 允許（read-only，不寫入）|
| `/commit` | ❌ 不允許，除非使用者再次明確授權 |
| 驗證 previewHash 不在 DOM | ✅ 允許（DevTools 檢查）|

---

## 12. 實作步驟切分

| 步驟 | 任務名稱 | 說明 |
|------|----------|------|
| J5F-2A | 確認 implementation plan | 本文件確認（不施工）|
| **J5F-3** | component skeleton，不串 commit | 建立 `ManualTrackingSyncPanel.tsx`，只有 idle state + 顯示條件；EditOrderDialog 引入但不實際呼叫 API |
| **J5F-4** | 串 preview endpoint | 呼叫 `/preview`，存 `PreviewJob` 到 state，顯示 wouldWriteEvents / duplicateEvents |
| **J5F-5** | preview state + UI 顯示 | 完整 previewReady / previewExpired / previewError state + 文案 + countdown |
| **J5F-6** | 二次確認 modal | 引入 AlertDialog，`commitConfirming` state + modal 顯示資料 |
| **J5F-7** | 串 commit endpoint（mock/staging 先）| 呼叫 `/commit`，處理 commitSuccess / commitIdempotentNoop |
| **J5F-8** | error / drift / expired handling | PREVIEW_DRIFTED（409 `body.code`）/ PREVIEW_EXPIRED / PREVIEW_HASH_INVALID 完整錯誤分支 |
| **J5F-9** | post-commit refresh | `onOrderRefresh()` callback → `qc.invalidateQueries`，commit 後禁用按鈕 |
| **J5F-10** | mobile QA | 按鈕可點性、modal viewport、長字串截斷 |
| **J5F-11** | production preview smoke | `/preview` dryRun smoke（不 commit）|
| **J5F-12** | 正式 release gate | production commit 測試（需獨立授權），移除「測試中」標籤 |

---

## 13. 風險與回滾

### 主要風險

| 風險 | 說明 | 緩解 |
|------|------|------|
| previewHash 過期（TTL 10 分鐘）| 使用者 preview 後久未操作 | countdown 顯示，過期自動回 `previewExpired` |
| PREVIEW_DRIFTED | 外部貨態 /preview 到 /commit 之間更新 | 409 回 `drifted` state，不可自動重試 |
| provider 混用 | postoffice previewHash 用於 tcat commit | previewHash 綁 provider；scope check 後端驗證 |
| 重複 commit | commit 成功後再次點擊 | commit 成功後 phase 轉 `commitSuccess`，按鈕 disabled |
| UI 誤顯示 7-11 manual panel | provider allowlist 實作錯誤 | `normalizeTrackingProvider()` 後嚴格比對 `["postoffice", "tcat"]` |
| familymart 被誤加入 manual | provider allowlist 實作錯誤 | familymart exclusion 明確加入 disabled 條件 |
| order scope / store owner 權限 | 後端 `verifyStoreOwner` 會驗證，前端可信任 403 回傳 | 顯示「你沒有此店鋪的操作權限。」 |
| mobile 按鈕誤觸 confirm modal | 手機螢幕小，AlertDialogAction 容易誤點 | modal 開啟後需明確點「確認寫入事件」，cancel 位置靠左 |

### 回滾策略

| 策略 | 說明 |
|------|------|
| **J5F-3 分步施工** | component skeleton 先只顯示 idle UI，不串 commit；可隨時 revert J5F-7 commit endpoint 部分 |
| **commit button 預設 disabled** | `netNewEvents <= 0` 時不顯示 / disabled，避免誤觸 |
| **provider allowlist 硬編碼** | `["postoffice", "tcat"]` 是顯示條件，不從 API 動態取；後端有獨立 whitelist 作第二道防線 |
| **「測試中」標籤保留到 J5F-12** | 正式 release 前保留按鈕文案「（測試中）」，提示 owner 仍在 QA 階段 |
| **production commit 需獨立授權** | J5F-11 只做 preview smoke；J5F-12 production commit 需使用者再次明確授權 |

---

## 附錄：需要注意的現有程式碼位置

| 檔案 | 位置 | 說明 |
|------|------|------|
| `EditOrderDialog.tsx` | L234–273 | 現有 manual query state + handler（需替換）|
| `EditOrderDialog.tsx` | L1002–1051 | 現有「包裹追蹤」手動查詢 UI（需升級）|
| `EditOrderDialog.tsx` | L540 | `qc.invalidateQueries(getListOrdersQueryKey)` 用法（可複用）|
| `EditOrderDialog.tsx` | L220 | `const { getToken } = useAuth()`（需傳給 component）|
| `Orders.tsx` | L1258–1283 | AlertDialog 完整用法範例（component 可參考）|
| `logisticsProviders.ts` | L26–71 | `LOGISTICS_PROVIDERS` + `getProviderDisplayName()`（component 引入）|
| `logisticsSync.ts` | L167–215 | 舊 endpoint（仍存在，不依賴此做 commit）|
| `logisticsSync.ts` | L233–325 | `/preview` endpoint（新；component 呼叫目標）|
| `logisticsSync.ts` | L336–536 | `/commit` endpoint（新；component 呼叫目標）|
| `previewToken.ts` | L56–86 | verifyPreviewToken 回傳 `PREVIEW_HASH_INVALID` / `PREVIEW_EXPIRED`（不含 UI 判斷）|
