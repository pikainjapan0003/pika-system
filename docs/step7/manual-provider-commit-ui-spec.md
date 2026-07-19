# Manual Provider Commit UI Spec

# 手動物流貨態 preview / commit UI 設計規格

> **文件狀態**：規格草稿（不施工）  
> **建立日期**：2026-06-13  
> **適用版本**：`qa/step6f-cvs-store-selection-browser-mobile`  
> **參考後端**：`logisticsSync.ts` L229–536（preview + commit route）  
> **參考前端**：`artifacts/shop-app/src/pages/EditOrderDialog.tsx` L1002–1051（現有「包裹追蹤」區塊）

---

## 1. 支援邊界

| Provider                   | UI 狀態                 | 說明                                                                           |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| **postoffice（中華郵政）** | 可納入 manual UI        | production E2E 已完成（J5A～J5E，2026-06-13，insertedEventCount=5，delivered） |
| **tcat（黑貓宅急便）**     | 可納入 manual UI        | production E2E 已完成（J6A～J6E，2026-06-13，insertedEventCount=4，delivered） |
| **familymart（全家）**     | 不顯示 manual commit UI | auto sync only；scheduled sync 唯一 provider；`supportsAutoSync=true`          |
| **711（7-11）**            | 不顯示                  | unsupported；尚未正式支援；route 已硬拒；MANUAL_PROVIDER_WHITELIST 不含 711    |

**重要說明**：

- `scheduled sync` 仍只允許 familymart（`internalLogisticsSync.ts:57`）
- `supportsAutoSync` 仍只允許 familymart（`providers.ts:48`）
- postoffice / tcat 必須走 manual preview → commit gate，不可走 auto sync
- **本 UI spec 不代表 7-11 已支援，不可在任何 UI 顯示 7-11 的手動 commit 按鈕**
- familymart 的手動 commit 按鈕亦不可顯示（走現有整批同步流程）

---

## 2. 現有 UI 狀態（升級前基準）

目前 `EditOrderDialog.tsx:1002–1051` 已有一個「包裹追蹤」手動查詢按鈕：

**現有按鈕文案**：

```
手動查詢郵局貨態（測試中）
手動查詢黑貓貨態（測試中）
```

**現有 API 呼叫**：

```
POST /api/stores/:storeId/logistics/sync/manual-provider
body: { provider, trackingIds: [trackingId], dryRun: true }
```

**現有限制**：

- 僅執行 dryRun preview，不做 commit
- 顯示 wouldWriteEvents、latestStatusText，但無 commit 流程
- 使用舊 endpoint（不含 `/preview` / `/commit` 路徑）

**舊 endpoint 狀態（J5F-1 review 確認）**：

舊 endpoint `POST /stores/:storeId/logistics/sync/manual-provider`（`logisticsSync.ts:167`）**仍然存在**，行為如下：

- 永遠以 `writeMode: "dryRun"` 執行，不可寫入（`dryRun === false` 被 safety lock 擋下，回 `USE_COMMIT_ENDPOINT`）
- response 不含 `previewHash` / `previewExpiresAt` / `duplicateEvents`（這些只有新 `/preview` endpoint 才回傳）
- 適用於純 dryRun 查詢（現有 EditOrderDialog.tsx 仍在使用）

**J5F-2 實作時**：應將前端改用新 `/preview` + `/commit` endpoint，不依賴舊 endpoint 做 commit 前驗證。舊 endpoint 可在「查詢貨態」場景保留，但不得用於 commit 流程。

**本 spec 設計升級目標**：

將現有 dryRun-only 按鈕升級為完整 preview → commit 流程，使用 J4 上線的新 endpoint：

- Preview：`POST /api/stores/:storeId/logistics/sync/manual-provider/preview`
- Commit：`POST /api/stores/:storeId/logistics/sync/manual-provider/commit`

---

## 3. 使用者角色與入口

**目標使用者**：store owner（店家老闆後台）

**入口位置**：訂單詳情 dialog（`EditOrderDialog.tsx`）→「包裹追蹤」區塊

**這不是**：

- 客人訂單查詢頁（`PublicOrder.tsx`）
- 訂單列表卡片上的快捷按鈕
- 大量批次操作

**顯示條件**（所有條件同時成立才顯示手動 commit UI）：

| 條件                                   | 說明                                  |
| -------------------------------------- | ------------------------------------- |
| 使用者已通過 Clerk 認證                | `requireAuth` middleware              |
| 使用者是 store owner                   | `verifyStoreOwner` 通過               |
| `shipmentTracking` 存在                | `order.shipmentTracking !== null`     |
| `isActive === true`                    | tracking row 為啟用狀態               |
| `trackingCode` 有非空值                | `tracking.trackingCode.trim() !== ""` |
| `provider` in `["postoffice", "tcat"]` | 不顯示 familymart / 711 的 commit UI  |

---

## 4. UI 主流程

### A. Idle（初始狀態）

**顯示內容**：

- 物流商 provider 顯示名稱（由 `getProviderDisplayName()` 取得）
- trackingCode 遮罩或部分顯示
- 目前 `trackingStatus`（由 `TRACKING_STATUS_LABELS` 對應中文）
- `latestStatusText`（若有）
- `latestEventAt`（若有）

**按鈕**：

```
查詢最新貨態
```

**提示文字**：

```
這次查詢只會預覽，不會寫入資料。
```

**條件**：

- 按鈕只在以上「顯示條件」全部成立時出現
- 初次進入 dialog 時預設 idle
- commit 完成後回到 idle（可再次查詢）

---

### B. PreviewLoading（查詢中）

點擊「查詢最新貨態」後呼叫：

```
POST /api/stores/:storeId/logistics/sync/manual-provider/preview
```

**Request body**：

```json
{
  "provider": "postoffice",
  "trackingIds": [2]
}
```

或：

```json
{
  "provider": "tcat",
  "trackingIds": [3]
}
```

**UI 狀態**：

- 按鈕 disabled，文案改為「查詢中…」
- 顯示 spinner 或 loading indicator

---

### C. Preview 結果狀態（previewReady）

**Preview 回傳成功後，依 netNewEvents 分兩個子狀態**：

#### C1. PreviewReadyCanCommit（有新事件可寫入）

條件：`wouldWriteEvents > duplicateEvents`（即 netNewEvents > 0）

**顯示**：

- `dryRun=true`（不寫入）標籤
- `wouldWriteEvents`：外部查到 N 筆事件
- `duplicateEvents`：已存在 N 筆（會跳過）
- `netNewEvents = wouldWriteEvents - duplicateEvents`：**有 N 筆新貨態事件可寫入**
- `latestStatusText`：最新貨態文字
- `latestEventAt`：最新事件時間
- previewHash state：**只顯示「hash-present」，不顯示完整 hash 值**
- previewExpiresAt countdown：顯示剩餘有效時間（不顯示完整 token）
- 「確認寫入事件」按鈕（啟用）
- 「重新查詢」按鈕

**提示文字**：

```
目前有 N 筆新事件可寫入。寫入後會更新訂單貨態。
```

若 `duplicateEvents > 0`，額外顯示：

```
已有 N 筆事件存在，系統會避免重複寫入。
```

#### C2. PreviewReadyNoNewEvents（無新事件）

條件：`wouldWriteEvents === duplicateEvents`（netNewEvents = 0）

或 `wouldWriteEvents === 0`（完全沒有事件）

**顯示**：

- 不顯示「確認寫入事件」按鈕
- 顯示「已是最新」或「目前沒有新事件，不需寫入」
- 「重新查詢」按鈕（啟用）

**提示文字**：

```
這些事件已存在，不需重複寫入。
```

或：

```
目前查無貨態資料，單號可能尚未上網。
```

#### C3. PreviewExpired（hash 已過期）

條件：`previewHash` TTL 超過 10 分鐘（用戶停留過久）

**顯示**：

- 「預覽已過期，請重新查詢。」
- 「重新查詢」按鈕
- 不顯示「確認寫入事件」

#### C4. PreviewError（查詢失敗）

條件：HTTP 非 200，或 `body.ok !== true`，或 `errorCode` 存在

**顯示**：

- 錯誤訊息（依 §5 錯誤狀態表）
- 「重新查詢」按鈕
- 不顯示「確認寫入事件」

---

### D. CommitConfirming（二次確認 modal）

點擊「確認寫入事件」後，彈出確認 modal。

**進入此狀態的前置條件**（全部成立才允許）：

| 條件                                 | 值                         |
| ------------------------------------ | -------------------------- |
| `ok`                                 | `true`                     |
| `dryRun`                             | `true`                     |
| `previewHashAvailable`               | `true`                     |
| `hashState`                          | `"hash-present"`           |
| `provider`                           | `"postoffice"` 或 `"tcat"` |
| `trackingId`                         | 正整數（與訂單一致）       |
| `trackingCode`                       | 非空字串                   |
| `jobStatus`                          | `"success"`                |
| `wouldWriteEvents > duplicateEvents` | true（有淨新增事件）       |
| `errorCode`                          | `null` / `undefined`       |
| previewHash TTL                      | 未過期                     |

**Modal 文案**：

```
將寫入正式貨態事件，寫入後不可直接復原。是否確認？
```

**Modal 按鈕**：

```
取消
確認寫入事件
```

**注意**：

- 使用者不需要自行輸入 `confirmText`
- Frontend 固定帶 `confirmText: "WRITE_TRACKING_EVENTS"`（不暴露給使用者）
- 「取消」回到 PreviewReadyCanCommit 狀態

---

### E. CommitLoading（寫入中）

點擊「確認寫入事件」後呼叫：

```
POST /api/stores/:storeId/logistics/sync/manual-provider/commit
```

**Commit request body**：

| 欄位                       | 來源                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `provider`                 | `jobs[0]` 的 provider（同 /preview request）                          |
| `trackingId`               | `jobs[0].trackingId`                                                  |
| `trackingCode`             | `jobs[0].trackingCode`                                                |
| `previewHash`              | `jobs[0].previewHash`（保存在 component state，不可 stringify 到 UI） |
| `confirmText`              | 固定值 `"WRITE_TRACKING_EVENTS"`（frontend hardcoded）                |
| `expectedEventCount`       | `jobs[0].wouldWriteEvents`                                            |
| `expectedLatestStatusText` | `jobs[0].latestStatusText ?? null`                                    |
| `expectedLatestEventAt`    | `jobs[0].latestEventAt ?? null`                                       |

**所有 `expected*` 欄位必須來自同一次 /preview response，不可混用。**

**UI 狀態**：

- Modal 按鈕 disabled，文案改為「寫入中…」
- spinner

---

### F. CommitSuccess（寫入完成）

`committed=true` 後：

**顯示**：

- 「寫入完成」標籤
- `insertedEventCount`：已寫入 N 筆事件
- `latestStatusText`：最新貨態
- `latestEventAt`：貨態時間
- `trackingStatus`（重新 fetch 訂單後更新）
- 「確認」按鈕，關閉 modal 並回到 idle

**成功後動作**：

- refetch 訂單詳情（重新呼叫 `GET /api/stores/:storeId/orders` 或觸發 query invalidation）
- 禁用「確認寫入事件」按鈕，直到下次 /preview 顯示 `wouldWriteEvents > duplicateEvents`
- 可重新跑 preview dryRun 驗證 `duplicateEvents`（不強制，為選填驗證步驟）

#### CommitIdempotentNoop（冪等無操作）

條件：`idempotentNoop=true`（`insertedEventCount=0`）

**顯示**：

- 「事件皆已存在，本次未寫入新資料。」
- 不視為錯誤

---

### G. CommitError（寫入失敗）

**顯示錯誤**（依 §5 錯誤狀態表），特別處理：

| 判斷條件                                                                     | 特殊行為                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| HTTP 409，`body.code === "PREVIEW_DRIFTED"`（欄位為 `code`，非 `errorCode`） | 關閉 modal，回到 idle，顯示「外部貨態已變動，請重新查詢後再確認。」 |
| `body.errorCode === "PREVIEW_EXPIRED"`                                       | 關閉 modal，回到 idle，顯示「預覽已過期，請重新查詢。」             |
| `body.errorCode === "PREVIEW_HASH_INVALID"`                                  | 關閉 modal，回到 idle                                               |
| 其他（`body.errorCode` 存在，非上述三種）                                    | 顯示 modal 內錯誤訊息，提供「關閉」按鈕                             |

---

## 5. 錯誤狀態 UI 文案

### Backend actual errorCode（後端實際回傳值）

| HTTP 狀態 / errorCode      | 來源                                                   | 顯示文案                             |
| -------------------------- | ------------------------------------------------------ | ------------------------------------ |
| 401                        | Clerk auth                                             | 請重新登入後再試。                   |
| 403                        | verifyStoreOwner                                       | 你沒有此店鋪的操作權限。             |
| 400                        | 各種 fail()                                            | 資料格式錯誤，請重新整理頁面後再試。 |
| 404 / `TRACKING_NOT_FOUND` | commit L445                                            | 找不到此物流資料。                   |
| `PROVIDER_NOT_ALLOWED`     | /preview validateManualProviderRequest:117             | 此物流目前不支援手動寫入。           |
| `INVALID_PROVIDER`         | /commit L362                                           | 此物流目前不支援手動寫入。           |
| `PREVIEW_EXPIRED`          | previewToken.ts:84 → commit L390                       | 預覽已過期，請重新查詢。             |
| `PREVIEW_HASH_INVALID`     | previewToken.ts:62–81 → commit                         | 預覽驗證失敗，請重新查詢。           |
| `PREVIEW_DRIFTED`          | commit L493（409 response，`code` 欄位非 `errorCode`） | 外部貨態已變動，請重新查詢後再確認。 |
| `WRITE_FAILED`             | commit L474/L512                                       | 伺服器暫時無法處理，請稍後再試。     |
| 網路錯誤（fetch throw）    | frontend                                               | 網路錯誤，請稍後再試。               |
| 其他 server error（5xx）   | server                                                 | 伺服器暫時無法處理，請稍後再試。     |

### UI-derived state（非後端 errorCode，由 frontend 從回傳值推導）

| UI 狀態                   | 推導條件                                     | 顯示文案                       |
| ------------------------- | -------------------------------------------- | ------------------------------ |
| `previewReadyNoNewEvents` | `/preview` ok=true，`wouldWriteEvents === 0` | 目前沒有新事件可寫入。         |
| `commitIdempotentNoop`    | `/commit` ok=true，`idempotentNoop === true` | 事件皆已存在，不需要重複寫入。 |

**注意**：`NO_NEW_EVENTS` 和 `DUPLICATE_ONLY` 不是後端 errorCode，後端不會回傳這些字串。前端應從 `wouldWriteEvents` / `duplicateEvents` / `idempotentNoop` 欄位自行推導 UI 狀態。

---

## 6. 安全規則

| 規則                                                                   | 說明                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| previewHash 永遠不可完整顯示                                           | 只顯示 `hash-present` 狀態，不渲染 hash 值到 DOM                |
| previewHash 只存在 component state（memory）                           | 不寫 `localStorage`、不寫 `sessionStorage`、不寫 `cookie`       |
| previewHash 過期必須重跑 preview                                       | TTL 10 分鐘；不可重用舊 hash                                    |
| commit body 必須來自同一次 preview response                            | 不可混用不同時間、不同 provider、不同 trackingId 的欄位         |
| 不可混用 postoffice / tcat 的 preview response                         | scope check 會驗證 provider 一致性，混用必定回 400/403          |
| 不可對 postoffice trackingId=2 重複 commit                             | post-commit duplicateEvents=5；再 commit 回 idempotentNoop=true |
| 不可對 tcat trackingId=3 重複 commit                                   | post-commit duplicateEvents=4；再 commit 回 idempotentNoop=true |
| 只有新 preview 顯示 wouldWriteEvents > duplicateEvents 才可再次 commit | 新事件出現前禁用「確認寫入事件」                                |
| 7-11 不顯示 commit UI                                                  | `provider === "711"` → 不渲染任何 manual commit 按鈕            |
| familymart 不顯示 manual commit UI                                     | `provider === "familymart"` → 不渲染；familymart 請走整批同步   |
| 409 PREVIEW_DRIFTED 必須停止                                           | 不可自動重試 commit；回 idle 讓使用者重新 preview               |
| confirmText 固定 hardcoded                                             | `"WRITE_TRACKING_EVENTS"` 由 frontend 帶入，不暴露給使用者輸入  |

---

## 7. 狀態機

| state                     | 進入條件                                                                               | 顯示                                                                            | 可用按鈕                       | 禁用按鈕           | 下一步                                                         |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ | ------------------ | -------------------------------------------------------------- |
| `idle`                    | 初始、commit 完成後、重設後                                                            | provider 資訊、目前 trackingStatus                                              | 查詢最新貨態                   | —                  | previewLoading                                                 |
| `previewLoading`          | 點擊「查詢最新貨態」                                                                   | spinner、「查詢中…」                                                            | —                              | 查詢最新貨態       | previewReadyCanCommit / previewReadyNoNewEvents / previewError |
| `previewReadyCanCommit`   | /preview ok=true, netNewEvents > 0                                                     | wouldWriteEvents、duplicateEvents、netNewEvents、latestStatusText、hash-present | 確認寫入事件、重新查詢         | —                  | commitConfirming / previewLoading                              |
| `previewReadyNoNewEvents` | /preview ok=true, netNewEvents = 0                                                     | 「目前沒有新事件」、wouldWriteEvents = duplicateEvents                          | 重新查詢、已是最新（disabled） | 確認寫入事件       | previewLoading                                                 |
| `previewExpired`          | TTL 超過 10 分鐘後用戶嘗試 commit                                                      | 「預覽已過期，請重新查詢。」                                                    | 重新查詢                       | 確認寫入事件       | previewLoading                                                 |
| `previewError`            | /preview !ok 或 errorCode 存在                                                         | 錯誤訊息                                                                        | 重新查詢                       | 確認寫入事件       | previewLoading                                                 |
| `commitConfirming`        | 點擊「確認寫入事件」（通過前置條件）                                                   | 確認 modal：「寫入後不可直接復原，是否確認？」                                  | 確認寫入事件（modal）、取消    | —                  | commitLoading / previewReadyCanCommit（取消）                  |
| `commitLoading`           | 點擊 modal「確認寫入事件」                                                             | modal spinner、按鈕 disabled                                                    | —                              | 確認寫入事件、取消 | commitSuccess / commitIdempotentNoop / commitError             |
| `commitSuccess`           | /commit committed=true                                                                 | 「寫入完成」、insertedEventCount、latestStatusText                              | 確認（關閉 modal）             | —                  | idle                                                           |
| `commitIdempotentNoop`    | /commit idempotentNoop=true                                                            | 「事件皆已存在，本次未寫入新資料。」                                            | 確認（關閉 modal）             | —                  | idle                                                           |
| `commitError`             | /commit !ok 或 HTTP 非 200                                                             | 錯誤訊息（依 §5）                                                               | 關閉                           | —                  | idle（DRIFTED/EXPIRED）或 commitConfirming（其他）             |
| `drifted`                 | HTTP 409 且 `body.code === "PREVIEW_DRIFTED"`（注意：欄位是 `code`，不是 `errorCode`） | 「外部貨態已變動，請重新查詢後再確認。」                                        | 重新查詢                       | 確認寫入事件       | previewLoading                                                 |

---

## 8. API Contract Subset

### Preview Request

```json
{
  "provider": "postoffice",
  "trackingIds": [2]
}
```

### Preview Response Subset（前端需使用的欄位）

| 欄位                       | 型別           | 說明                                                            |
| -------------------------- | -------------- | --------------------------------------------------------------- |
| `ok`                       | boolean        | 必須為 `true`                                                   |
| `dryRun`                   | boolean        | 必須為 `true`                                                   |
| `provider`                 | string         | 必須與 request 一致                                             |
| `previewHashAvailable`     | boolean        | `true` = SESSION_SECRET 有效                                    |
| `jobs[0].trackingId`       | number         | 對應的 trackingId                                               |
| `jobs[0].trackingCode`     | string         | 物流單號                                                        |
| `jobs[0].previewHash`      | string         | HMAC token，**只存 state，不渲染**，TTL 10 分鐘                 |
| `jobs[0].wouldWriteEvents` | number         | 外部查到的總事件數                                              |
| `jobs[0].duplicateEvents`  | number         | 已存在 DB 的事件數                                              |
| `jobs[0].latestStatusText` | string \| null | 最新貨態文字                                                    |
| `jobs[0].latestEventAt`    | string \| null | 最新事件時間                                                    |
| `jobs[0].previewExpiresAt` | string \| null | previewHash 到期時間（用於 countdown）                          |
| `jobs[0].status`           | string         | `"success"` 才可繼續；`"empty"` 代表無事件                      |
| `jobs[0].errorCode`        | string \| null | 存在時不可 commit（來自 worker 內部）                           |
| `jobs[0].skippedReason`    | string \| null | 跳過原因（worker-level）；`errorMessage` 欄位**不存在**，勿使用 |

### Commit Request Subset

| 欄位                       | 型別           | 來源                                                   |
| -------------------------- | -------------- | ------------------------------------------------------ |
| `provider`                 | string         | `jobs[0].provider`（與 preview request 一致）          |
| `trackingId`               | number         | `jobs[0].trackingId`                                   |
| `trackingCode`             | string         | `jobs[0].trackingCode`                                 |
| `previewHash`              | string         | `jobs[0].previewHash`（來自 component state）          |
| `confirmText`              | string         | 固定值 `"WRITE_TRACKING_EVENTS"`（frontend hardcoded） |
| `expectedEventCount`       | number         | `jobs[0].wouldWriteEvents`                             |
| `expectedLatestStatusText` | string \| null | `jobs[0].latestStatusText ?? null`                     |
| `expectedLatestEventAt`    | string \| null | `jobs[0].latestEventAt ?? null`                        |

### Commit Response Subset

**成功回應（HTTP 200）**：

| 欄位                 | 型別           | 說明                                              |
| -------------------- | -------------- | ------------------------------------------------- |
| `ok`                 | boolean        | `true`                                            |
| `committed`          | boolean        | `true` = 有寫入                                   |
| `insertedEventCount` | number         | 實際寫入筆數                                      |
| `idempotentNoop`     | boolean        | `true` = 全部已存在，無新寫入（UI-derived state） |
| `provider`           | string         | 同 request                                        |
| `trackingId`         | number         | 同 request                                        |
| `trackingCode`       | string         | 物流單號                                          |
| `latestStatusText`   | string \| null | commit 後最新貨態                                 |
| `latestEventAt`      | string \| null | commit 後最新事件時間                             |
| `runLogId`           | string \| null | 後端寫入 log id（前端可忽略）                     |

**一般錯誤回應（HTTP 4xx / 5xx，由 `fail()` 產生）**：

```json
{ "ok": false, "errorCode": "...", "message": "..." }
```

注意：欄位名稱是 `errorCode`，**不是** `error` 或 `code`。

**409 PREVIEW_DRIFTED 特殊回應**（唯一使用 `code` 欄位的情況）：

```json
{
  "ok": false,
  "code": "PREVIEW_DRIFTED",
  "message": "外部貨態已更新，請重新預覽後再寫入。",
  "freshPreview": {
    "expectedEventCount": ...,
    "latestStatusText": "...",
    "latestEventAt": "..."
  }
}
```

注意：409 的欄位是 `code`（非 `errorCode`）；前端讀取 DRIFTED 判斷需同時檢查 `res.status === 409` 或 `body.code === "PREVIEW_DRIFTED"`。

---

## 9. UI 文案草案

### 按鈕

| 場景                   | 文案         |
| ---------------------- | ------------ |
| idle                   | 查詢最新貨態 |
| 查詢中                 | 查詢中…      |
| preview 成功，有新事件 | 確認寫入事件 |
| preview 成功，無新事件 | 已是最新     |
| commit 完成            | 寫入完成     |
| 重新查詢               | 重新查詢     |

### 提示

| 場景               | 文案                                    |
| ------------------ | --------------------------------------- |
| idle 下方          | 這次查詢只會預覽，不會寫入資料。        |
| preview 有新事件   | 目前有 N 筆新事件可寫入。               |
| preview 有重複事件 | 已有 N 筆事件存在，系統會避免重複寫入。 |
| commit 前提示      | 寫入後會更新訂單貨態。                  |
| hash 過期          | 預覽已過期，請重新查詢。                |

### 警告

| 場景                  | 文案                                 |
| --------------------- | ------------------------------------ |
| commit modal 二次確認 | 正式寫入後不可直接復原。             |
| PREVIEW_DRIFTED       | 外部貨態已變動，請重新查詢後再確認。 |
| provider 不支援       | 此物流目前不支援手動寫入。           |

### Provider 顯示名稱（使用 `getProviderDisplayName()`）

| provider code | 顯示名稱             |
| ------------- | -------------------- |
| `postoffice`  | 中華郵政             |
| `tcat`        | 黑貓宅急便           |
| `familymart`  | （不顯示 manual UI） |
| `711`         | （不顯示 manual UI） |

---

## 10. 不做事項

本 spec 範圍內不施工的項目：

- 不實作 React component
- 不改 `EditOrderDialog.tsx` 或任何 `.tsx` 檔案
- 不串接 API（不寫 fetch / useQuery / useMutation）
- 不新增 API route
- 不新增 DB 欄位或 migration
- 不改 `MANUAL_PROVIDER_WHITELIST`
- 不新增 7-11 支援
- 不改 familymart auto sync
- 不設計 synthetic tracking（不在本 spec 範圍）
- 不改 `cron`、不改 `supportsAutoSync`
- 不改 `providers.ts`
- 不打 production `/preview`
- 不打 production `/commit`

---

## 11. 後續任務拆分

| 任務代號                                                 | 說明                                                                                              | 前置條件          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------- |
| **J5F-1：UI spec review**                                | 確認本 spec 是否與後端 contract 完全一致；邀請後端確認欄位名稱、errorCode 清單                    | 本文件完成        |
| **J5F-2：owner order detail 貨態區塊實作計畫**           | 規劃 `EditOrderDialog.tsx` 中「包裹追蹤」區塊的升級計畫：component 拆分、state 設計、API 串接方式 | J5F-1 review 通過 |
| **J5F-3：preview button integration plan**               | 規劃「查詢最新貨態」按鈕的整合：新 endpoint 呼叫、response 欄位對應、previewHash 存放 state       | J5F-2 計畫完成    |
| **J5F-4：commit confirm modal integration plan**         | 規劃 commit modal 的整合：AlertDialog 元件選用、二次確認、hardcoded confirmText、body 組裝        | J5F-3 計畫完成    |
| **J5F-5：error / expired / drifted state handling plan** | 規劃所有錯誤路徑的 UI 處理：PREVIEW_DRIFTED 回 idle、PREVIEW_EXPIRED 回 idle、5xx 重試機制        | J5F-4 計畫完成    |
| **J5F-6：post-commit refresh plan**                      | 規劃 commit 成功後的 order refetch 機制：query invalidation、refetch 觸發點、UI 回饋              | J5F-5 計畫完成    |
| **J5F-7：mobile QA plan**                                | 規劃手機版 QA 項目：按鈕可點擊性、modal 可見性、countdown 顯示、viewport 適配                     | J5F-6 計畫完成    |
| **J5F-8：production smoke plan**                         | 規劃完整實作後的 production smoke test 清單：idle → preview → commit → 驗證 trackingStatus        | J5F-7 QA 通過     |

---

## 附錄：tcat idempotency key 特殊說明

tcat 的 idempotency key 格式與 postoffice 不同（`multiProviderDryRunWorker.ts:110-125`）：

```
postoffice: {provider}:{trackingCode}:{occurredAt}:{description}
tcat:       {provider}:{trackingCode}:{occurredAt}:{description}:{eventLocation}
```

**UI 影響**：無。前端不需要自行計算 idempotency key，這由後端處理。  
**文案影響**：tcat 的 `duplicateEvents` 計算更精確（同時間同狀態不同地點不誤判重複），前端顯示 `duplicateEvents` 數字即可，不需要特別說明。

---

## 附錄：production E2E 參考數據

| Provider   | trackingId | insertedEventCount | trackingStatus | post-commit duplicateEvents |
| ---------- | ---------- | ------------------ | -------------- | --------------------------- |
| postoffice | 2          | 5                  | delivered      | 5（不可再 commit）          |
| tcat       | 3          | 4                  | delivered      | 4（不可再 commit）          |
