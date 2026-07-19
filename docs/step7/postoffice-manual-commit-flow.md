# Postoffice Manual Preview / Commit Flow

# 郵局手動貨態 preview / commit 正式流程

> **文件狀態**：已通過 production E2E（2026-06-13）  
> **適用版本**：`qa/step6f-cvs-store-selection-browser-mobile`（含 J4B /commit endpoint）

---

## 目前支援邊界

| Provider         | 狀態                                                             |
| ---------------- | ---------------------------------------------------------------- |
| **familymart**   | ✅ 唯一正式 auto sync provider；scheduled sync 僅允許此 provider |
| **postoffice**   | ✅ manual preview / commit gate 已通過 production E2E            |
| **tcat（黑貓）** | ⚠️ 可複製同流程，但尚未完成 production E2E（見後續擴充）         |
| **7-11**         | ❌ 尚未支援，不得宣稱正式整合；route 已硬拒                      |

**重要限制**：

- `scheduled sync` 仍只允許 familymart
- `supportsAutoSync` 仍只允許 familymart
- postoffice / tcat 必須走 manual preview → commit gate，不可走 auto sync

---

## 正式站成功案例（production E2E 記錄）

| 欄位                        | 值                                                                           |
| --------------------------- | ---------------------------------------------------------------------------- |
| production URL              | `https://drawdream.replit.app`                                               |
| storeId                     | 2                                                                            |
| storeName                   | 我的代購店                                                                   |
| orderId                     | 39                                                                           |
| trackingId                  | 2                                                                            |
| provider                    | postoffice                                                                   |
| /preview 結果               | ok=true, dryRun=true, wouldWriteEvents=5, duplicateEvents=0                  |
| /commit 結果                | committed=true, insertedEventCount=5, idempotentNoop=false                   |
| latestStatusText            | 投遞成功                                                                     |
| latestEventAt               | 2026/06/08 11:21:53                                                          |
| trackingStatus after commit | **delivered**                                                                |
| post-commit /preview        | wouldWriteEvents=5, **duplicateEvents=5**（5 筆全部已存在，不應再次 commit） |

**duplicateEvents=5 語義**：代表 5 筆事件已寫入 DB，idempotency key 全部命中。再次 /commit 將回 idempotentNoop=true，insertedEventCount=0。

---

## API 流程概覽

```
1. GET  /api/me/store
       → 確認目前登入帳號的 storeId

2. GET  /api/stores/:storeId/orders
       → 列出訂單，每筆含 shipmentTracking 欄位
         shipmentTracking.id        = trackingId
         shipmentTracking.trackingProvider = provider
         shipmentTracking.isActive  = boolean

3. POST /api/stores/:storeId/logistics/sync/manual-provider/preview
       → dryRun 查詢，取得 previewHash

4. POST /api/stores/:storeId/logistics/sync/manual-provider/commit
       → 正式寫入，需帶 previewHash + confirmText + expected fields
```

---

## /preview

### Request body

```json
{
  "provider": "postoffice",
  "trackingIds": [2]
}
```

- `provider`：`"postoffice"` 或 `"tcat"`
- `trackingIds`：正整數陣列，一次最多 5 筆

### 重點回傳欄位

| 欄位                       | 說明                                                |
| -------------------------- | --------------------------------------------------- |
| `ok`                       | 必須為 `true`                                       |
| `dryRun`                   | 必須為 `true`（永遠 dryRun，不寫入）                |
| `previewHashAvailable`     | `true` = SESSION_SECRET 有效，可簽發 previewHash    |
| `jobs[0].previewHash`      | HMAC token，TTL 10 分鐘；**不可貼出完整值**         |
| `jobs[0].trackingId`       | 對應的 trackingId                                   |
| `jobs[0].trackingCode`     | 物流單號（/commit 需帶回）                          |
| `jobs[0].wouldWriteEvents` | 外部 API 查到的總事件數                             |
| `jobs[0].duplicateEvents`  | 其中已存在於 DB 的事件數（idempotency key 比對）    |
| `jobs[0].latestStatusText` | 最新貨態文字（/commit 需帶回作 drift check）        |
| `jobs[0].latestEventAt`    | 最新事件時間（/commit 需帶回作 drift check）        |
| `jobs[0].status`           | `"success"` 才可繼續 commit；`"empty"` 代表無新事件 |
| `jobs[0].errorCode`        | 必須為 `null` / `undefined`                         |

### previewHash 安全規則

- **不可貼出完整 previewHash**（含 cookie、token）
- TTL 約 10 分鐘；過期回 `PREVIEW_EXPIRED`
- commit 前必須重新跑 preview 取得新 hash
- 不可使用舊 previewHash（不同 session 或超過 TTL）

---

## /commit

### Request body（全部必填）

| 欄位                       | 型別           | 來源                               |
| -------------------------- | -------------- | ---------------------------------- |
| `provider`                 | string         | `"postoffice"` 或 `"tcat"`         |
| `trackingId`               | number         | `jobs[0].trackingId`               |
| `trackingCode`             | string         | `jobs[0].trackingCode`             |
| `previewHash`              | string         | `jobs[0].previewHash`              |
| `confirmText`              | string         | 固定值 `"WRITE_TRACKING_EVENTS"`   |
| `expectedEventCount`       | number         | `jobs[0].wouldWriteEvents`         |
| `expectedLatestStatusText` | string \| null | `jobs[0].latestStatusText ?? null` |
| `expectedLatestEventAt`    | string \| null | `jobs[0].latestEventAt ?? null`    |

**重要**：所有 `expected*` 欄位必須來自**同一次** /preview response。不可混用不同次 preview 的值。

### /commit 驗證鏈

```
auth → verifyStoreOwner
provider whitelist（711/familymart 一律拒）
trackingId 正整數
trackingCode 非空
previewHash 存在 + isPreviewTokenAvailable()
verifyPreviewToken → PREVIEW_HASH_INVALID / PREVIEW_EXPIRED
scope check：storeId / trackingId / provider / trackingCode 全符合 token payload
confirmText === "WRITE_TRACKING_EVENTS"
expectedEventCount 符合 token.expectedEventCount
expectedLatestStatusText / expectedLatestEventAt 符合 token payload
DB lookup：trackingId 存在 + ownerStoreId === storeId
isActive === true
provider / trackingCode 與 DB 紀錄符合
re-dryRun drift check（第二次 dryRun）
drift 比較：fresh vs token.expected → 若不符 → 409 PREVIEW_DRIFTED
writeMode="write" 正式寫入
```

### 409 PREVIEW_DRIFTED

代表外部貨態在 /preview → /commit 之間已更新。

**必須停止，不可硬寫，不可重試。**

重新執行完整流程：`/preview dryRun → 確認 → 授權 → /commit`

---

## 人工 gate 安全 Checklist

```
[ ] 確認正式站登入帳號為 store owner
[ ] GET /api/me/store → 確認 storeId
[ ] GET /api/stores/:storeId/orders → 找目標訂單的 trackingId
[ ] POST /preview dryRun → 確認 hashState=hash-present
[ ] 確認 jobStatus=success
[ ] 確認 wouldWriteEvents > 0（有事件可寫；= 0 則停止，不 commit）
[ ] 確認 duplicateEvents = 0（無重複；> 0 代表已寫入，不 commit）
[ ] 使用者明確授權「同意 production /commit 正式寫入 trackingId=X」
[ ] 組 /commit body，所有 expected 欄位來自同一次 /preview response
[ ] 執行 /commit，TTL 10 分鐘內完成
[ ] commit 後：GET /api/stores/:storeId/orders → 確認 trackingStatus 更新
[ ] commit 後：重新 /preview dryRun → 確認 duplicateEvents 增加
[ ] 記錄 insertedEventCount
[ ] 禁止再次 commit，除非 /preview 顯示 wouldWriteEvents > duplicateEvents
```

---

## 禁止事項

| 禁止                                   | 說明                                      |
| -------------------------------------- | ----------------------------------------- |
| 不可對 storeId=1 / trackingId=153 操作 | workspace dev DB artifacts，非 production |
| 不可 7-11                              | route 已硬拒，尚未實作                    |
| 不可 familymart 走 manual commit       | familymart 請用批次同步；route 已硬拒     |
| 不可未授權 commit                      | 每次 commit 需獨立授權                    |
| 不可使用過期 previewHash               | TTL 10 分鐘                               |
| 不可多筆 tracking 同時 commit          | 一次一筆，避免 drift 混淆                 |
| 不可在 PREVIEW_DRIFTED 時硬寫          | 必須重新 /preview                         |
| 不可貼 cookie / token / secret         | 安全規範                                  |
| 不可貼完整 previewHash                 | 安全規範                                  |
| 不可改 cron                            | 與 manual commit 流程無關                 |
| 不可改 supportsAutoSync                | familymart 專屬                           |

---

## 後續擴充建議

**J5F — UI 正式寫入按鈕設計 spec（不施工）**

前端 owner 介面規劃：

- 「查詢」→ 呼叫 /preview dryRun → 顯示 wouldWriteEvents + previewHash 狀態
- 「確認寫入」按鈕（僅 wouldWriteEvents > 0 且 duplicateEvents = 0 時啟用）→ 呼叫 /commit
- 結果顯示：insertedEventCount / trackingStatus / latestStatusText

**J6 — 黑貓 tcat 同流程 dryRun / commit gate（不施工）**

- postoffice E2E 已驗證，tcat 邏輯相同（同一 MANUAL_PROVIDER_WHITELIST）
- 找 production storeId=2 底下的 tcat tracking，執行一次 /preview smoke + commit gate
- 複製 J5A～J5E 流程

**品牌任務 — 畫夢代購 / DrawDream UI 文案更名（不施工）**

- 若 `drawdream.replit.app` 要對外，統一品牌文案（繁中「揪單」/ 英文 DrawDream）
- 純 UI copy，不涉及後端邏輯
