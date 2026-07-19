# TCAT Manual Preview / Commit Gate Plan

# 黑貓 tcat 手動貨態 preview / commit gate 規劃

> **文件狀態**：✅ tcat production E2E 完成（J6D commit PASS + J6E closeout PASS）  
> **建立日期**：2026-06-13  
> **更新日期**：2026-06-13（J6E closeout 完成）  
> **參考文件**：`docs/step7/postoffice-manual-commit-flow.md`（postoffice E2E 已通過，作為 tcat 流程模板）

---

## 目前狀態

| 項目                              | 狀態                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| tcat 在 MANUAL_PROVIDER_WHITELIST | ✅ 已確認（logisticsSync.ts:79）                              |
| tcat /preview 支援                | ✅ 已確認（同一 validateManualProviderRequest）               |
| tcat /commit 支援                 | ✅ 已確認（同一 MANUAL_PROVIDER_WHITELIST 驗證）              |
| tcat supportsAutoSync             | ❌ `false`（providers.ts:60）                                 |
| tcat adapter                      | ✅ 已存在（adapters/tcatAdapter.ts）                          |
| tcat /preview dryRun smoke        | ✅ J6B PASS（2026-06-13，trackingId=3, wouldWriteEvents=4）   |
| tcat production /commit           | ✅ J6D PASS（insertedEventCount=4, trackingStatus=delivered） |
| tcat production E2E               | ✅ **完成**（J6A～J6E 全部 PASS，2026-06-13）                 |
| postoffice production E2E         | ✅ 已通過（2026-06-13，insertedEventCount=5, delivered）      |

**本文件只規劃流程，不代表 tcat 已正式通過 production commit。**  
postoffice 的成功 E2E 可作為 tcat 流程的完整模板。

---

## 支援邊界（完整說明）

| Provider         | 狀態                                                      |
| ---------------- | --------------------------------------------------------- |
| **familymart**   | ✅ 唯一正式 auto sync；scheduled sync 僅允許此 provider   |
| **postoffice**   | ✅ manual preview / commit gate 已通過 production E2E     |
| **tcat（黑貓）** | ⚠️ whitelist 已就緒，尚待 production E2E                  |
| **7-11**         | ❌ 尚未支援，不在 MANUAL_PROVIDER_WHITELIST，route 已硬拒 |

- `scheduled sync` 仍只允許 familymart（internalLogisticsSync.ts:57）
- `supportsAutoSync` 仍只允許 familymart（providers.ts:48）
- tcat 必須走 manual preview → commit gate，不可走 auto sync

---

## tcat 與 postoffice 共用流程

兩者使用完全相同的 endpoint 與驗證鏈，只有 `provider` 欄位不同。

```
1. GET  /api/me/store
       → 確認目前登入帳號的 storeId（production = 2）

2. GET  /api/stores/2/orders
       → 找 shipmentTracking.trackingProvider = "tcat" 且 isActive = true 的訂單
         shipmentTracking.id              = trackingId
         shipmentTracking.trackingCode   = tcat 單號
         shipmentTracking.isActive        = true

3. POST /api/stores/2/logistics/sync/manual-provider/preview
       → dryRun 查詢，取得 previewHash（TTL 10 分鐘）

4. POST /api/stores/2/logistics/sync/manual-provider/commit
       → 正式寫入（需使用者明確授權後才執行）
```

---

## tcat /preview body

```json
{
  "provider": "tcat",
  "trackingIds": [<tcat trackingId>]
}
```

- `provider`：固定 `"tcat"`
- `trackingIds`：來自 `GET /api/stores/2/orders` 找到的 `shipmentTracking.id`

### 回傳欄位（與 postoffice 完全相同）

| 欄位                       | 說明                                        |
| -------------------------- | ------------------------------------------- |
| `ok`                       | 必須為 `true`                               |
| `dryRun`                   | 必須為 `true`                               |
| `previewHashAvailable`     | 必須為 `true`                               |
| `jobs[0].previewHash`      | HMAC token，TTL 10 分鐘；**不可貼出完整值** |
| `jobs[0].trackingId`       | 對應的 trackingId                           |
| `jobs[0].trackingCode`     | 黑貓物流單號（/commit 需帶回）              |
| `jobs[0].wouldWriteEvents` | 外部 API 查到的總事件數                     |
| `jobs[0].duplicateEvents`  | 其中已存在於 DB 的事件數                    |
| `jobs[0].latestStatusText` | 最新貨態文字                                |
| `jobs[0].latestEventAt`    | 最新事件時間                                |
| `jobs[0].status`           | `"success"` 才可繼續 commit                 |
| `jobs[0].errorCode`        | 必須為 `null` / `undefined`                 |

---

## tcat /commit body（全部必填）

| 欄位                       | 型別           | 來源                               |
| -------------------------- | -------------- | ---------------------------------- |
| `provider`                 | string         | 固定 `"tcat"`                      |
| `trackingId`               | number         | `jobs[0].trackingId`               |
| `trackingCode`             | string         | `jobs[0].trackingCode`             |
| `previewHash`              | string         | `jobs[0].previewHash`              |
| `confirmText`              | string         | 固定值 `"WRITE_TRACKING_EVENTS"`   |
| `expectedEventCount`       | number         | `jobs[0].wouldWriteEvents`         |
| `expectedLatestStatusText` | string \| null | `jobs[0].latestStatusText ?? null` |
| `expectedLatestEventAt`    | string \| null | `jobs[0].latestEventAt ?? null`    |

**所有 `expected*` 欄位必須來自同一次 /preview response。不可混用 postoffice 的 preview 資料。**

---

## tcat 特有注意事項：idempotency key 格式

tcat 有一個 postoffice 沒有的特殊行為（程式碼來源：multiProviderDryRunWorker.ts:110-125）：

> **黑貓會出現同時間、同狀態、不同地點的事件**
> 例：兩筆「超商代收」皆 `2026/05/28 15:02`，但地點不同

因此 tcat 的 idempotency key 追加了 `:location`：

```
postoffice key:  `postoffice:{trackingCode}:{occurredAt}:{description}`
tcat key:        `tcat:{trackingCode}:{occurredAt}:{description}:{eventLocation}`
```

**影響**：tcat 的 `duplicateEvents` 計算比 postoffice 更精確，不會因為地點不同的同時間事件而誤判為重複。這是預期行為，不是 bug。

---

## tcat production E2E 計畫（J6A～J6E）

### J6A：找 production storeId=2 的 tcat tracking

**只用 read-only endpoint，不寫入任何資料。**

在 `drawdream.replit.app` 已登入 browser console 執行：

```js
fetch("/api/stores/2/orders")
  .then((r) => r.json())
  .then((orders) => {
    const hits = orders
      .filter((o) => o.shipmentTracking && o.shipmentTracking.isActive)
      .filter((o) => o.shipmentTracking.trackingProvider === "tcat")
      .map((o) => ({
        orderId: o.id,
        orderNo: o.orderNo,
        trackingId: o.shipmentTracking.id,
        provider: o.shipmentTracking.trackingProvider,
        trackingCode: o.shipmentTracking.trackingCode,
        trackingStatus: o.shipmentTracking.trackingStatus,
      }));
    console.log("tcat tracking 筆數:", hits.length);
    console.table(hits);
    window.__tcatHits = hits;
  });
```

**找到條件**：

- `shipmentTracking.isActive = true`
- `shipmentTracking.trackingProvider = "tcat"`
- 有 `trackingCode`
- 不碰 postoffice trackingId=2
- 不碰 storeId=1 / trackingId=153

**若 0 筆**：回報 `orders.length` 及任何 tracking 的 provider 值，確認 storeId=2 底下是否真的沒有 tcat 訂單。

---

### J6B：tcat /preview dryRun smoke

條件（全部必須符合才繼續）：

| 欄位                   | 必須值                                                   |
| ---------------------- | -------------------------------------------------------- |
| `httpStatus`           | 200                                                      |
| `ok`                   | `true`                                                   |
| `dryRun`               | `true`                                                   |
| `provider`             | `"tcat"`                                                 |
| `previewHashAvailable` | `true`                                                   |
| `hashState`            | `"hash-present"`                                         |
| `jobStatus`            | `"success"` 或 `"empty"`（empty 代表無新事件，不算失敗） |
| `trackingId`           | 等於 J6A 找到的 tcat trackingId                          |
| `trackingCodePresent`  | `true`                                                   |
| `errorCode`            | `undefined` / `null`                                     |

- **dryRun smoke 不寫入任何資料**
- `jobStatus=empty` 代表黑貓 API 目前無新事件可寫，屬正常狀態
- 若 `jobStatus=empty`，仍算 /preview 功能正常；/commit 此時無意義（`wouldWriteEvents=0`）

---

### J6C：tcat /commit manual gate 規劃

只規劃 body 與 expected fields，不執行 commit。

與 postoffice 流程完全相同（見 postoffice-manual-commit-flow.md），將 `provider` 替換為 `"tcat"`。

---

### J6D：tcat production /commit 授權執行

**只能在使用者再次明確授權後執行。**

J6B wouldWriteEvents > 0 且 duplicateEvents = 0，且使用者說出：

> 「我授權 production /commit 正式寫入 tcat trackingId=X」

才可執行。

---

### J6E：tcat closeout

commit 後驗證：

- `GET /api/stores/2/orders` → `trackingStatus` 是否更新
- post-commit `/preview dryRun` → `duplicateEvents` 是否增加（等於 wouldWriteEvents）
- 記錄 `insertedEventCount`
- 標記 tcat idempotency key 是否正常（location 追加的 key 不應有誤去重）

---

## 若 production storeId=2 沒有 tcat tracking

若 J6A 回傳 0 筆（`hits.length = 0`），可能是：

1. storeId=2 目前沒有任何黑貓訂單
2. 有黑貓訂單但 `isActive=false`（tracking row 已停用）

**建議（不施工）：**

| 選項                                         | 說明                                               |
| -------------------------------------------- | -------------------------------------------------- |
| 等待真實黑貓訂單                             | 當有真實黑貓 order 建立後，tracking row 會自動產生 |
| 另開任務設計 synthetic tracking 安全建立流程 | 需授權、需 DB 寫入任務、需確認 storeId=2           |
| 先做 J5F UI spec                             | 不依賴 tcat 資料，可獨立進行                       |

**不可本輪直接新增 DB row。**

---

## 安全規則

| 禁止                                         | 說明                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| 不可使用 postoffice 的 previewHash           | previewHash 綁定 provider，tcat 必須用 tcat /preview 取得的 hash |
| 不可混用不同 provider 的 preview response    | scope check 會驗證 provider 一致性                               |
| 不可對 postoffice trackingId=2 再次 commit   | postoffice E2E 已完成，duplicateEvents=5                         |
| 不可對 7-11 操作                             | route 已硬拒，尚未實作                                           |
| 不可 familymart manual commit                | route 已硬拒                                                     |
| 不可未授權 commit                            | 每次 commit 需獨立授權                                           |
| 不可使用過期 previewHash                     | TTL 10 分鐘                                                      |
| 不可多筆 tracking 同時 commit                | 一次一筆                                                         |
| 若 409 PREVIEW_DRIFTED 必須停止              | 不可硬寫，重新 /preview                                          |
| 若找不到 tcat tracking                       | 不可造資料、不寫 DB，只回報缺口                                  |
| 不可貼 cookie / token / secret / previewHash | 安全規範                                                         |
| 不可對 storeId=1 / trackingId=153 操作       | workspace dev DB artifacts，非 production                        |

---

---

## J6B production /preview 實測結果（2026-06-13）

| 欄位                 | 值                             |
| -------------------- | ------------------------------ |
| production URL       | `https://drawdream.replit.app` |
| storeId              | 2                              |
| orderId              | 40                             |
| trackingId           | 3                              |
| provider             | tcat                           |
| httpStatus           | 200                            |
| ok                   | true                           |
| dryRun               | true                           |
| previewHashAvailable | true                           |
| hashState            | hash-present                   |
| jobStatus            | success                        |
| wouldWriteEvents     | **4**                          |
| duplicateEvents      | **0**                          |
| latestStatusText     | 順利送達                       |
| latestEventAt        | 2026/05/28 09:51               |
| errorCode            | undefined                      |

**判定**：J6B PASS。4 筆新事件可寫入，無重複，已進 J6D。

---

## J6D 執行前必備條件

| 條件                          | 說明                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| 使用者在正式站重新跑 /preview | 不可使用 J6B 的舊 previewHash（已過期）                      |
| hashState = hash-present      | previewHash 非 null                                          |
| jobStatus = success           | dryRun 查詢成功                                              |
| wouldWriteEvents > 0          | 有實際事件可寫入                                             |
| duplicateEvents = 0           | 無重複，乾淨首次 commit                                      |
| provider = tcat               | 固定                                                         |
| storeId = 2                   | production 正式站 owner                                      |
| trackingId = 3                | 目前唯一確認的 tcat tracking                                 |
| 使用者明確授權文字            | 例：「我授權 production /commit 正式寫入 tcat trackingId=3」 |
| previewHash 在 10 分鐘 TTL 內 | 授權到執行不得超過 10 分鐘                                   |

---

## J6D /commit body（完整格式）

| 欄位                       | 型別           | 來源                                          |
| -------------------------- | -------------- | --------------------------------------------- |
| `provider`                 | string         | 固定 `"tcat"`                                 |
| `trackingId`               | number         | `jobs[0].trackingId`（= 3）                   |
| `trackingCode`             | string         | `jobs[0].trackingCode`                        |
| `previewHash`              | string         | `jobs[0].previewHash`（新一次 /preview 取得） |
| `confirmText`              | string         | 固定值 `"WRITE_TRACKING_EVENTS"`              |
| `expectedEventCount`       | number         | `jobs[0].wouldWriteEvents`                    |
| `expectedLatestStatusText` | string \| null | `jobs[0].latestStatusText ?? null`            |
| `expectedLatestEventAt`    | string \| null | `jobs[0].latestEventAt ?? null`               |

**所有欄位必須來自同一次 /preview response。不可混用 postoffice 或不同次 tcat preview 的資料。**

---

## J6D 風險清單

| 風險                               | 說明                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| previewHash TTL 10 分鐘            | 授權到執行必須快速完成                                                                  |
| 黑貓外部貨態 drift                 | /commit 內建 re-dryRun；若 409 PREVIEW_DRIFTED 必須停止                                 |
| tcat idempotency key 含 location   | `tcat:{code}:{time}:{status}:{location}`；若相同時間+狀態但不同地點，key 不同，不誤去重 |
| duplicateEvents 重判               | commit 前需確認 duplicateEvents = 0；若 > 0 可能部分已寫，需手動確認                    |
| wouldWriteEvents = duplicateEvents | 代表全部已存在，不可 commit（idempotentNoop）                                           |
| errorCode 出現                     | 立刻停止，不可 commit                                                                   |

---

## J6D 禁止事項

| 禁止                                             | 原因                                     |
| ------------------------------------------------ | ---------------------------------------- |
| 不可使用舊 previewHash                           | TTL 10 分鐘；過期回 PREVIEW_EXPIRED      |
| 不可使用 postoffice 的 previewHash               | scope check 會驗證 provider=tcat         |
| 不可未授權 commit                                | 每次 commit 需獨立授權                   |
| 不可對 storeId=1 / trackingId=153 操作           | workspace dev DB artifacts               |
| 不可對 postoffice trackingId=2 再次 commit       | postoffice E2E 已完成，duplicateEvents=5 |
| 不可 7-11                                        | route 已硬拒                             |
| 不可 familymart manual commit                    | route 已硬拒                             |
| 不可多筆 tracking 同時 commit                    | 一次一筆                                 |
| 不可在 409 PREVIEW_DRIFTED 時硬寫                | 重新 /preview                            |
| 不可貼完整 previewHash / cookie / token / secret | 安全規範                                 |

---

## 後續任務規劃

| 任務名稱                                 | 狀態    | 說明                                                |
| ---------------------------------------- | ------- | --------------------------------------------------- |
| `J6A-TCAT-PRODUCTION-TRACKING-DISCOVERY` | ✅ PASS | orderId=40, trackingId=3, provider=tcat 找到        |
| `J6B-TCAT-PREVIEW-DRYRUN-SMOKE`          | ✅ PASS | wouldWriteEvents=4, duplicateEvents=0, hash-present |
| `J6C-TCAT-COMMIT-GATE-PLAN`              | ✅ PASS | /commit body + J6D gate 規劃完成                    |
| `J6D-TCAT-COMMIT-EXECUTION-AUTHORIZED`   | ✅ PASS | insertedEventCount=4, trackingStatus=delivered      |
| `J6E-TCAT-CLOSEOUT`                      | ✅ PASS | duplicateEvents=4，不應再次 commit                  |

---

## J6D production /commit 實測結果（2026-06-13）

| 欄位                                  | 值                                   |
| ------------------------------------- | ------------------------------------ |
| production URL                        | `https://drawdream.replit.app`       |
| storeId                               | 2                                    |
| orderId                               | 40                                   |
| trackingId                            | 3                                    |
| provider                              | tcat                                 |
| insertedEventCount                    | **4**                                |
| idempotentNoop                        | false                                |
| latestStatusText                      | 順利送達                             |
| latestEventAt                         | 2026/05/28 09:51                     |
| trackingStatus after commit           | **delivered**                        |
| post-commit /preview wouldWriteEvents | 4                                    |
| post-commit /preview duplicateEvents  | **4**（全部已存在，不應再次 commit） |

**trackingId=3 後續 commit 條件**（三者同時成立才可再 commit）：

1. 新一次 /preview 顯示 `wouldWriteEvents > duplicateEvents`（有新事件未寫）
2. 取得全新 `previewHash`（10 分鐘內）
3. 使用者明確授權新一次 commit
