# Order Step 7C：貨態追蹤資料模型規格

> **版本**：Step 7C Spec v1.0｜分支：`qa/step6f-cvs-store-selection-browser-mobile`
> **現況依據**：`docs/order-step7b-tracking-import-spec.md`（已合併至 main）、`docs/order-step7-current-field-audit.md`（commit 8794d8c）
> **本文件為規格文件，不含施工實作。**
> 文件語言：繁體中文。
>
> **重要聲明**：本規格不承諾貨態即時或百分百準確。自動查詢功能依賴物流業者 API 可用性（Step 7D），本文件僅定義資料模型。

---

## 1. Step 7C 定位

### 本文件聲明

- **本文件只做資料模型規格定義。不施工 DB migration / API / UI / worker。**
- 所有 schema 描述均為規劃草案，待施工時需在對應任務中實作。
- Step 7C 的施工需在本規格確認後單獨執行。

### Step 7C 是什麼

Step 7C 是「貨態追蹤資料模型」，為後續自動貨態查詢（Step 7D）與貨態時間軸顯示（Step 7E）預先建立資料庫結構。

Step 7C 新增兩張資料表：

| 資料表                     | 用途                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `shipment_trackings`       | 每筆訂單的物流追蹤記錄（查詢頻率控制、失敗計數、最新快照） |
| `shipment_tracking_events` | 每次查詢得到的貨態事件 timeline（Step 7E 顯示用）          |

### Step 7C 不是什麼

| 不包含                     | 說明                                          |
| -------------------------- | --------------------------------------------- |
| 自動貨態查詢 worker        | Step 7D，需先完成本步驟資料模型               |
| 物流業者 API 串接          | Step 7D，依賴業者 API 方案確認                |
| 貨態 timeline 前端顯示     | Step 7E（TrackOrder.tsx 修改），依賴本資料表  |
| OpenClaw / E-Tracking 整合 | 業務決策未確認，不在本規格範圍                |
| CSV 匯入 trackingCode      | 已在 Step 7B 完成，本步驟不重複               |
| 修改現有 orders 表欄位     | 現有 trackingCode / trackingProvider 欄位不動 |
| 自動出貨通知               | Step 7F                                       |

---

## 2. Step 7 整體架構圖

```
Step 7A：公開查詢頁強化（已完成）
  → 客人以 publicToken 查詢訂單貨態

Step 7B：老闆匯入物流號碼（已完成）
  → orders.trackingCode / trackingProvider 有穩定資料
  → trackingProvider 已標準化（711 / familymart / home_delivery / other）

Step 7C：貨態追蹤資料模型（本規格）
  → 新增 shipment_trackings（追蹤任務記錄）
  → 新增 shipment_tracking_events（貨態事件 timeline）

Step 7D：worker 自動查詢貨態（依賴 7C）
  → 定時讀取 shipment_trackings，呼叫物流業者 API
  → 將回傳的事件寫入 shipment_tracking_events
  → 更新 shipment_trackings 的最新狀態快照

Step 7E：貨態 history 顯示（依賴 7C、7D）
  → TrackOrder.tsx 顯示 shipment_tracking_events 的時間軸

Step 7F：自動出貨通知（依賴 7D）
  → 貨態變更時發送 LINE / Email 通知
```

---

## 3. 前置條件確認

### 3.1 Step 7B 完成後的狀態

| 項目                                     | 確認狀態                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `orders.trackingCode`                    | 已存在，store-side 手動填入                                                              |
| `orders.trackingProvider`                | 已存在，Step 7B 後已標準化（711 / familymart / home_delivery / other）                   |
| `orders.shippingStatus`                  | 已存在（not_shipped / preparing / shipped / arrived / picked_up / returned / cancelled） |
| 匯入 API（POST /orders/tracking-import） | Step 7B 已施工                                                                           |
| 一訂單只允許一組 trackingCode            | Step 7B 決策 D4 已鎖定                                                                   |

### 3.2 目前不存在的欄位（Step 7C 要建立的）

| 欄位 / 表                         | 說明                                   |
| --------------------------------- | -------------------------------------- |
| `shipment_trackings` 資料表       | 追蹤任務記錄，目前不存在               |
| `shipment_tracking_events` 資料表 | 貨態事件 timeline，目前不存在          |
| `lastCheckedAt`                   | 上次自動查詢時間，目前不存在           |
| `failureCount`                    | 連續查詢失敗計數，目前不存在           |
| `checkError`                      | 最後一次查詢錯誤，目前不存在           |
| `latestTrackingStatus`            | 物流業者回傳的最新貨態快照，目前不存在 |

---

## 4. 資料模型設計方案比較

### 方案 A：在 orders 表新增欄位（Snapshot 模式）

直接在現有 `orders` 表新增追蹤相關欄位：

```
orders 表（現有）：
  + lastCheckedAt: timestamp nullable
  + failureCount: integer default 0
  + checkError: text nullable
  + latestTrackingStatus: text nullable
  + latestTrackingStatusAt: timestamp nullable
```

| 優點                             | 缺點                             |
| -------------------------------- | -------------------------------- |
| 不需新增資料表，migration 最簡單 | orders 表持續膨脹，職責混雜      |
| JOIN 查詢簡單（只有一張表）      | 無法儲存 history（只有最新快照） |
| 既有 API 修改量最小              | Step 7E 的 timeline 無法實作     |
| 適合只需「目前狀態」的場景       | 換 trackingCode 後舊記錄遺失     |

**結論：不推薦。** Step 7E 需要 timeline，若用此方案日後需破壞性重構。

---

### 方案 B：新增 shipment_trackings + shipment_tracking_events（建議採用）

新增兩張資料表：

```
shipment_trackings 表（新增）：
  追蹤任務記錄（每筆 trackingCode 一個 active 記錄）
  含查詢任務控制欄位：lastCheckedAt, nextCheckAt, failureCount, checkError

shipment_tracking_events 表（新增）：
  每次查詢得到的貨態事件（1 對多）
```

| 優點                                                         | 缺點                                         |
| ------------------------------------------------------------ | -------------------------------------------- |
| 支援完整 history 與 timeline（Step 7E 可直接使用）           | 需同時建立兩張表，migration 稍複雜           |
| orders 表保持簡潔，職責分離                                  | JOIN 查詢比方案 A 複雜                       |
| 換 trackingCode 後可保留舊 tracking 記錄（isActive = false） | 初期無事件資料（Step 7D 完成前 events 為空） |
| 為 Step 7D / 7E / 7F 提供最佳資料基礎                        | —                                            |

**結論：建議採用。** 雖然初期資料為空，資料模型正確性最高，避免日後破壞性重構。

> **為何不做「只有 shipment_trackings」的過渡方案**：若初期只新增 shipment_trackings 而不含 events 表，Step 7E 的 timeline 功能仍需二次 migration。兩張表同時建立的成本（migration 稍複雜）遠低於日後重構的風險。

---

## 5. 建議方案（方案 B）詳細規格

### 5.1 shipment_trackings 表

#### 用途

- 每筆 `trackingCode` 對應一筆 `shipment_trackings` 記錄
- 記錄 Step 7D worker 的查詢控制狀態（何時查、失敗幾次、最後錯誤）
- 儲存物流業者回傳的最新貨態快照（latestStatus）

#### Drizzle ORM Schema（規劃，待施工時實作）

```typescript
// lib/db/src/schema/shipmentTrackings.ts

import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { ordersTable } from "./orders.ts";

export const shipmentTrackingStatusEnum = [
  "pending", // 尚未查詢
  "checking", // 查詢中（worker lock，避免重複查詢）
  "active", // 正常查詢中
  "delivered", // 已送達（可停止查詢）
  "failed", // 連續失敗超過閾值，已停止查詢
  "inactive", // 已手動停用（如換 trackingCode）
] as const;
export type ShipmentTrackingStatus =
  (typeof shipmentTrackingStatusEnum)[number];

export const shipmentTrackingsTable = pgTable(
  "shipment_trackings",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    trackingCode: text("tracking_code").notNull(),
    trackingProvider: text("tracking_provider").notNull(),
    // 查詢控制欄位
    isActive: boolean("is_active").notNull().default(true),
    trackingStatus: text("tracking_status").notNull().default("pending"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
    checkError: text("check_error"),
    // 最新貨態快照
    latestEventStatus: text("latest_event_status"),
    latestEventDescription: text("latest_event_description"),
    latestEventAt: timestamp("latest_event_at", { withTimezone: true }),
    // 元資料
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("shipment_trackings_order_id_idx").on(t.orderId),
    index("shipment_trackings_active_next_check_idx").on(
      t.isActive,
      t.nextCheckAt,
    ),
  ],
);

export type ShipmentTracking = typeof shipmentTrackingsTable.$inferSelect;
```

#### 欄位說明

| 欄位                     | 型別                  | 說明                                                                                            | 預設值    |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| `id`                     | serial PK             | 主鍵                                                                                            | auto      |
| `orderId`                | integer FK            | 關聯 orders.id                                                                                  | —         |
| `trackingCode`           | text NOT NULL         | 物流追蹤碼，來自 orders.trackingCode                                                            | —         |
| `trackingProvider`       | text NOT NULL         | 物流商代碼（711 / familymart / home_delivery / other）                                          | —         |
| `isActive`               | boolean NOT NULL      | 是否為當前有效的追蹤記錄                                                                        | true      |
| `trackingStatus`         | text NOT NULL         | **查詢任務狀態（tracking job status）**，代表 worker 排程控制狀態；**非物流貨態狀態**（見下表） | `pending` |
| `lastCheckedAt`          | timestamp TZ          | 上次執行查詢的時間                                                                              | NULL      |
| `nextCheckAt`            | timestamp TZ          | 下次預計查詢時間（worker 排程用）                                                               | NULL      |
| `failureCount`           | integer NOT NULL      | 連續查詢失敗次數（成功後重置為 0）                                                              | 0         |
| `checkError`             | text                  | 最後一次查詢的錯誤訊息                                                                          | NULL      |
| `latestEventStatus`      | text                  | 物流業者回傳的最新貨態代碼                                                                      | NULL      |
| `latestEventDescription` | text                  | 最新貨態的文字描述                                                                              | NULL      |
| `latestEventAt`          | timestamp TZ          | 最新貨態事件發生時間                                                                            | NULL      |
| `createdAt`              | timestamp TZ NOT NULL | 記錄建立時間                                                                                    | NOW()     |
| `updatedAt`              | timestamp TZ NOT NULL | 記錄最後更新時間                                                                                | NOW()     |

#### trackingStatus 狀態說明（查詢任務狀態 / tracking job status）

> **重要區分**：`trackingStatus` 是「查詢任務狀態（tracking job status）」，代表 Step 7D worker 對這筆追蹤記錄的排程與執行狀態（是否正在查詢、查詢是否失敗等）。**這與物流貨態標準狀態（eventStatus）是完全不同的概念，不可混用。** 物流貨態標準狀態（unknown / pending / in_transit / arrived_store / picked_up / delivered / returned / exception）請見第 5.2 節 eventStatus 標準化值。

| 狀態值      | 說明                                           | 可接受的下一狀態                              |
| ----------- | ---------------------------------------------- | --------------------------------------------- |
| `pending`   | 記錄已建立，尚未進行第一次查詢                 | `checking`, `inactive`                        |
| `checking`  | Worker 正在執行查詢（lock 狀態，避免重複查詢） | `active`, `failed`                            |
| `active`    | 正常查詢中，有成功過至少一次                   | `checking`, `delivered`, `failed`, `inactive` |
| `delivered` | 貨態已達「送達」終態，停止自動查詢             | `inactive`（手動停用）                        |
| `failed`    | 連續失敗超過閾值（建議 10 次），停止自動查詢   | `pending`（手動重試）、`inactive`             |
| `inactive`  | 已手動停用，或因換 trackingCode 而被取代       | —                                             |

---

### 5.2 shipment_tracking_events 表

#### 用途

- 儲存每次 Step 7D worker 查詢物流業者 API 後回傳的貨態事件
- 一個 `shipment_trackings` 記錄對應多筆事件（1 對多）
- 支援 Step 7E 的貨態時間軸顯示

#### Drizzle ORM Schema（規劃，待施工時實作）

```typescript
// lib/db/src/schema/shipmentTrackingEvents.ts

import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { shipmentTrackingsTable } from "./shipmentTrackings.ts";

export const shipmentTrackingEventsTable = pgTable(
  "shipment_tracking_events",
  {
    id: serial("id").primaryKey(),
    shipmentTrackingId: integer("shipment_tracking_id")
      .notNull()
      .references(() => shipmentTrackingsTable.id, { onDelete: "cascade" }),
    // 事件內容
    eventCode: text("event_code"), // 業者原始狀態代碼（如 "ARRIVED_AT_CVS"）
    eventStatus: text("event_status").notNull(), // 系統標準化狀態（見下表）
    eventDescription: text("event_description"), // 業者原始描述文字
    eventLocation: text("event_location"), // 事件發生地點（如門市名稱）
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), // 事件發生時間（業者回傳）
    // 原始資料保留
    rawData: jsonb("raw_data"), // 業者 API 原始回傳（方便除錯）
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("shipment_tracking_events_tracking_id_idx").on(t.shipmentTrackingId),
    index("shipment_tracking_events_occurred_at_idx").on(t.occurredAt),
  ],
);

export type ShipmentTrackingEvent =
  typeof shipmentTrackingEventsTable.$inferSelect;
```

#### 欄位說明

| 欄位                 | 型別                  | 說明                                           |
| -------------------- | --------------------- | ---------------------------------------------- |
| `id`                 | serial PK             | 主鍵                                           |
| `shipmentTrackingId` | integer FK            | 關聯 shipment_trackings.id                     |
| `eventCode`          | text                  | 物流業者原始狀態代碼（各業者不同，保留原始值） |
| `eventStatus`        | text NOT NULL         | 系統標準化狀態（見下表）                       |
| `eventDescription`   | text                  | 業者原始描述文字（中文或業者原文）             |
| `eventLocation`      | text                  | 事件發生地點（如「台北大安門市」）             |
| `occurredAt`         | timestamp TZ NOT NULL | 事件發生時間（業者提供，非系統時間）           |
| `rawData`            | jsonb                 | 業者 API 原始回傳 JSON，方便除錯與稽核         |
| `createdAt`          | timestamp TZ NOT NULL | 本記錄寫入系統的時間                           |

#### eventStatus 標準化值（初版）

> **重要**：以下是「物流貨態標準狀態」，與上方 trackingStatus（查詢任務狀態）是完全不同的概念。

| eventStatus     | 說明                                   | 對應 shippingStatus |
| --------------- | -------------------------------------- | ------------------- |
| `pending`       | 物流單已建立，尚未有掃描事件           | `preparing`         |
| `in_transit`    | 運送中                                 | `shipped`           |
| `arrived_store` | 已到達取件門市（超商等待取件）         | `arrived`           |
| `picked_up`     | 客人已取件（超商取貨完成）             | `picked_up`         |
| `delivered`     | 已送達終點（宅配到家或確認送達）       | `picked_up`         |
| `returned`      | 已退回寄件方                           | `returned`          |
| `exception`     | 異常（地址錯誤、遺失等）               | 維持原狀            |
| `unknown`       | 無法對應的業者狀態，或業者回傳格式未知 | 維持原狀            |

> **注意**：eventStatus 與 orders.shippingStatus 不完全相同，eventStatus 是業者事件層級的描述；shippingStatus 是訂單層級的狀態摘要。Step 7D 施工時需定義兩者的映射規則。
>
> **查不到貨態不等於包裹遺失**：當業者 API 無回傳或查詢失敗時，僅記錄 failureCount，eventStatus 保持原值或設為 `unknown`。不得對客人顯示「包裹異常」或「可能遺失」等誤導文字。

---

### 5.3 shipment_trackings 與 orders 的關聯

#### 一訂單的多筆 tracking 記錄

依 Step 7B 決策 D4（「只允許一組 trackingCode」），同一時間只有一筆 `isActive = true` 的 tracking 記錄：

```
orders.id = 101
  ├── shipment_trackings.id = 1  (trackingCode = "OLD001", isActive = false)  ← 舊記錄（已廢棄）
  └── shipment_trackings.id = 2  (trackingCode = "NEW999", isActive = true)   ← 當前記錄
```

當老闆更新 trackingCode 時（Step 7D 施工後需確認）：

1. 將舊 `shipment_trackings` 設為 `isActive = false`、`trackingStatus = inactive`
2. 新建一筆 `shipment_trackings`（`isActive = true`、`trackingStatus = pending`）

#### FK 關係圖

```
orders (1)
  └── shipment_trackings (多，通常只有 1 筆 isActive = true)
        └── shipment_tracking_events (多)
```

#### 查詢最新追蹤記錄

```sql
-- 查詢訂單的最新 active tracking 記錄
SELECT st.*
FROM shipment_trackings st
WHERE st.order_id = :orderId
  AND st.is_active = true
ORDER BY st.created_at DESC
LIMIT 1;

-- 查詢最新追蹤記錄的所有事件（按時間倒序）
SELECT ste.*
FROM shipment_tracking_events ste
JOIN shipment_trackings st ON ste.shipment_tracking_id = st.id
WHERE st.order_id = :orderId
  AND st.is_active = true
ORDER BY ste.occurred_at DESC;
```

---

### 5.4 shipment_trackings 生命週期

#### 建立時機

Step 7C 的資料模型建立後，`shipment_trackings` 記錄的建立時機需在 Step 7D 施工時確認。

建議的觸發時機選項：

| 選項                               | 時機                                                                                             | 優缺點                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **A（推薦）**：trackingCode 更新時 | 老闆透過後台 PATCH /orders/:orderId 或 CSV 匯入填入 trackingCode 時，自動建立 shipment_trackings | 覆蓋率最高，只要有 trackingCode 就會自動排程查詢 |
| B：手動觸發                        | 老闆點擊「開始追蹤」按鈕才建立                                                                   | 需額外 UI，操作成本高                            |
| C：定時掃描                        | Worker 定時掃描 orders 表，找出有 trackingCode 但無 shipment_trackings 的訂單                    | 建立時機有延遲，但不需改現有 API                 |

**建議選項 A**：在 Step 7B 的 PATCH /orders/:orderId 與 tracking-import API 中，填入 trackingCode 時同步建立 shipment_trackings 記錄。

#### 停止查詢時機

| 停止條件                             | 機制                                        |
| ------------------------------------ | ------------------------------------------- |
| 貨態到達終態（picked_up / returned） | trackingStatus = delivered，停止查詢        |
| 連續失敗超過閾值（建議 10 次）       | trackingStatus = failed，停止查詢，通知店家 |
| 老闆更新 trackingCode                | 舊記錄 isActive = false，新建記錄           |
| 訂單取消                             | 可評估是否設為 inactive（Step 7D 決定）     |

---

### 5.5 Worker 排程考量（預留設計，Step 7D 施工）

`shipment_trackings` 表的設計需支援以下 Worker 模式：

#### nextCheckAt 欄位用途

`nextCheckAt` 讓 Worker 能以指定頻率查詢，而不是固定間隔：

- 剛建立的記錄：`nextCheckAt = NOW()` 或 `NOW() + 5 minutes`（立即或短暫延遲）
- 成功查詢後：根據 `latestEventStatus` 動態調整
  - 在途中（`in_transit`）：`nextCheckAt = NOW() + 2 hours`
  - 到達門市（`arrived_store`）：`nextCheckAt = NOW() + 30 minutes`（客人即將取件）
  - 已取件（`picked_up`）：停止查詢
- 查詢失敗後：指數退避（`nextCheckAt = NOW() + failureCount * 30 minutes`）

#### checking 鎖定機制

避免多個 Worker 同時查詢同一筆 tracking：

```sql
-- Worker 取得下一個需要查詢的 tracking（原子操作）
UPDATE shipment_trackings
SET tracking_status = 'checking', updated_at = NOW()
WHERE id = (
  SELECT id FROM shipment_trackings
  WHERE is_active = true
    AND tracking_status IN ('pending', 'active')
    AND (next_check_at IS NULL OR next_check_at <= NOW())
  ORDER BY next_check_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

> **注意**：以上 SQL 僅為設計概念，實際施工時依 Drizzle ORM 的 `for update skip locked` 語法實作。

---

## 6. 索引規劃

| 索引                                       | 欄位                         | 用途                               |
| ------------------------------------------ | ---------------------------- | ---------------------------------- |
| `shipment_trackings_order_id_idx`          | `order_id`                   | 查詢特定訂單的追蹤記錄             |
| `shipment_trackings_active_next_check_idx` | `is_active`, `next_check_at` | Worker 查詢待執行的追蹤任務        |
| `shipment_tracking_events_tracking_id_idx` | `shipment_tracking_id`       | 查詢特定追蹤記錄的所有事件         |
| `shipment_tracking_events_occurred_at_idx` | `occurred_at`                | 按時間排序事件（Step 7E timeline） |

---

## 7. DB Migration 計畫

### 7.1 本次 Step 7C 的 migration 範圍

| 操作                               | 說明                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| 新增 `shipment_trackings` 表       | 見第 5.1 節 schema                                   |
| 新增 `shipment_tracking_events` 表 | 見第 5.2 節 schema                                   |
| 不修改 `orders` 表                 | 現有欄位保持不動                                     |
| 不新增 orders 表的新欄位           | lastCheckedAt 等控制欄位在 shipment_trackings 表管理 |

### 7.2 Migration 風險評估

| 風險                  | 等級 | 說明                                                 |
| --------------------- | ---- | ---------------------------------------------------- |
| 破壞現有 orders 表    | 低   | 本次不修改 orders 表，無破壞風險                     |
| 現有 API 回傳格式改變 | 低   | 新增表不影響現有 API                                 |
| 資料遺失              | 無   | 只新增表，不刪除或修改                               |
| FK 約束失敗           | 低   | shipment_trackings 依賴 orders.id（orders 表已存在） |

### 7.3 Migration 執行策略

Step 7C 施工時，使用 Drizzle Kit 生成並執行 migration：

```bash
# 1. 撰寫 schema 檔案（lib/db/src/schema/shipmentTrackings.ts）
# 2. 撰寫 schema 檔案（lib/db/src/schema/shipmentTrackingEvents.ts）
# 3. 更新 lib/db/src/schema/index.ts，export 新 schema
# 4. 生成 migration
pnpm drizzle-kit generate
# 5. 確認生成的 SQL 正確
# 6. 執行 migration
pnpm drizzle-kit migrate
```

### 7.4 Rollback 計畫

若需回滾：

```sql
DROP TABLE IF EXISTS shipment_tracking_events;
DROP TABLE IF EXISTS shipment_trackings;
```

由於只新增表、不修改現有表，回滾不影響現有資料。

---

## 8. API 規劃（規劃，不施工）

本次 Step 7C 只建立資料模型，不新增 API。以下為 Step 7D / 7E 施工時的 API 設計參考。

### 8.1 公開查詢 API 擴充（Step 7E 施工）

```
GET /api/orders/track/:publicToken
```

現有 API 回傳：`trackingCode`, `trackingProvider`, `shippingStatus`, `shippingStatusLabel`

Step 7E 擴充（加入 timeline）：

```json
{
  "trackingCode": "F45913208600",
  "trackingProvider": "711",
  "shippingStatus": "arrived",
  "shippingStatusLabel": "已到門市",
  "trackingEvents": [
    {
      "eventStatus": "arrived_store",
      "eventDescription": "包裹已送達取件門市",
      "eventLocation": "台北大安門市",
      "occurredAt": "2026-06-07T10:30:00+08:00"
    },
    {
      "eventStatus": "in_transit",
      "eventDescription": "包裹運送中",
      "eventLocation": null,
      "occurredAt": "2026-06-06T08:00:00+08:00"
    }
  ]
}
```

> **個資保護**：`trackingEvents` 不含任何個資（recipientPhone / recipientAddress / 門市詳細地址等）。

### 8.2 後台追蹤狀態 API（Step 7D 施工）

```
GET /orders/:orderId/tracking
```

後台用途：老闆查看訂單的追蹤任務狀態（failureCount、lastCheckedAt 等）。需 `requireAuth`。

### 8.3 OpenClaw / Worker 邊界（Step 7D 施工）

#### OpenClaw 的邊界限制

若 Step 7D 採用 OpenClaw 作為物流查詢方案：

| 規則                           | 說明                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **OpenClaw 不直接操作 DB**     | OpenClaw 查詢物流業者 API 後，透過後台內部 API（requireAuth）將結果寫回，不得直接執行 Drizzle ORM 或 raw SQL     |
| **OpenClaw 透過後台 API 寫回** | 寫入 shipment_tracking_events 與更新 shipment_trackings 均需透過 API 呼叫，確保業務邏輯集中在 API 層             |
| **不保證即時性**               | OpenClaw 為定時觸發，查詢結果可能延遲數分鐘至數小時，公開頁不可顯示「即時貨態」字樣                              |
| **查不到貨態不等於包裹遺失**   | 業者 API 查詢失敗（HTTP 錯誤、timeout、無記錄）時，僅記錄 failureCount，不得對客人顯示「包裹異常」或類似誤導文字 |

#### 內部 Worker 的邊界限制

若 Step 7D 採用 Replit background worker 或內部排程：

| 規則                           | 說明                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| **透過統一 service 層操作 DB** | Worker 可使用 Drizzle ORM，但需透過統一的 service 函式，不在 worker 中散落 raw query |
| **不繞過 storeId 隔離**        | Worker 更新 DB 時確保只操作屬於對應訂單的 tracking 記錄                              |
| **不保證即時性**               | 同上，查詢為定時輪詢，有延遲，不得對外承諾即時                                       |
| **查不到貨態不等於包裹遺失**   | 同上，查詢失敗只記錄 failureCount，不觸發「遺失」警示                                |

---

## 9. 與 trackingProvider 標準化的關係

Step 7B 決策 D2 鎖定的 provider code（`711` / `familymart` / `home_delivery` / `other`）與 Step 7D 物流業者 API 路由的對應關係：

| trackingProvider | Step 7D 查詢 API            | 備註                              |
| ---------------- | --------------------------- | --------------------------------- |
| `711`            | 待確認（7-11 C2C 查詢 API） | 需確認商用條款與存取方式          |
| `familymart`     | 待確認（全家 B2C 查詢 API） | 需確認商用條款與存取方式          |
| `home_delivery`  | 暫不自動查詢                | 宅配業者 API 各異，Step 7D 再評估 |
| `other`          | 不自動查詢                  | 人工處理                          |

> **重要**：`home_delivery` 與 `other` 的 tracking record 建立後，`trackingStatus` 可維持 `pending` 直到決定不查詢為止，或直接設為 `inactive`。Step 7D 施工時需鎖定此行為。

---

## 10. 個資與安全

### 10.1 shipment_trackings 的個資規則

| 欄位                   | 個資風險                                   | 處理                            |
| ---------------------- | ------------------------------------------ | ------------------------------- |
| `trackingCode`         | 低（物流追蹤碼，非個人身份資訊）           | 公開查詢 API 已回傳             |
| `trackingProvider`     | 無                                         | 公開查詢 API 已回傳             |
| `checkError`           | 低（物流業者錯誤訊息，可能含部分業者資訊） | 不在公開 API 回傳               |
| `rawData`（events 表） | 中（業者回傳可能含地址等）                 | 不在公開 API 回傳，只在後台顯示 |

### 10.2 公開查詢 API 的事件資料個資限制

Step 7E 擴充公開 API 時，`trackingEvents` 以及整個公開回應**絕對不得包含**下列任何欄位或資訊：

| 禁止項目                      | 說明                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `recipientPhone`              | 收件人電話，屬個資                                                                |
| `recipientAddress`            | 收件地址，屬個資                                                                  |
| `internalNote`                | 後台內部備註，屬後台機密                                                          |
| `paymentNote`                 | 付款備註，屬後台機密                                                              |
| `rawData` / `rawPayload`      | 業者原始回傳 JSON，可能含收件人資訊；任何 rawData 欄位均不可出現在公開 API 回傳中 |
| worker 錯誤訊息 / stack trace | `checkError`、`failureCount`、worker 內部錯誤均屬後台資訊，不對客人顯示           |
| 收件人姓名                    | 即使業者 API 回傳了收件人姓名，也不得轉傳至前端                                   |
| 完整收件地址                  | `eventLocation` 只允許門市名稱或城市等非個資地點資訊                              |
| 任何可辨識收件人身份的資訊    | 包括電話、Email、真實姓名組合等                                                   |

### 10.3 rawData 的個資清洗

Worker 寫入 `shipment_tracking_events.rawData` 前，需清洗業者原始回傳：

- 移除或遮蔽收件人姓名（`recipientName` 或類似欄位）
- 移除電話號碼
- 保留：追蹤碼、狀態代碼、地點（門市名）、時間

### 10.4 不輸出的資訊（對外任何端點均適用）

| 禁止輸出                                                               | 說明                                         |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| `recipientPhone` / `recipientAddress` / `internalNote` / `paymentNote` | 個資與後台機密                               |
| `rawData` / `rawPayload` 完整內容                                      | 可能含個資，只在後台 debug 用途下顯示        |
| worker error message / stack trace / `checkError`                      | 後台除錯資訊，不對公開端點回傳               |
| `failureCount` / `lastCheckedAt` / `nextCheckAt`                       | 查詢任務控制欄位，後台監控用，不對公開頁回傳 |
| DB 錯誤 stack trace / SQL 查詢內容                                     | 任何 DB 內部錯誤均不可透傳至前端             |
| 物流業者 API key / token / 認證資訊                                    | 不得出現在任何回應、log 或錯誤訊息中         |

---

## 11. 測試計畫

本次為規格文件，測試計畫為後續施工時的執行清單。

### 11.1 Migration 測試（Step 7C 施工後執行）

| 測試案例 | 情境                                     | 預期結果                          |
| -------- | ---------------------------------------- | --------------------------------- |
| M1       | 執行 migration，建立兩張表               | 兩張表成功建立，無報錯            |
| M2       | 新增 shipment_trackings 記錄（正常案例） | 成功插入，FK 約束通過             |
| M3       | 插入不存在的 orderId                     | FK 約束失敗，報錯                 |
| M4       | 新增 shipment_tracking_events 記錄       | 成功插入，FK 約束通過             |
| M5       | 回滾 migration                           | 兩張表成功刪除，orders 表不受影響 |

### 11.2 Schema 驗證測試（Step 7C 施工後執行）

| 測試案例 | 情境                    | 預期結果                                                       |
| -------- | ----------------------- | -------------------------------------------------------------- |
| S1       | `isActive` 預設值       | 新建記錄 isActive = true                                       |
| S2       | `failureCount` 預設值   | 新建記錄 failureCount = 0                                      |
| S3       | `trackingStatus` 預設值 | 新建記錄 trackingStatus = 'pending'                            |
| S4       | `onDelete: "cascade"`   | 刪除 orders 記錄時，相關 shipment_trackings 與 events 自動刪除 |
| S5       | `updatedAt` 自動更新    | 修改 shipment_trackings 記錄時，updatedAt 自動更新             |

### 11.3 回歸測試

| 測試案例 | 情境                               | 預期結果                                    |
| -------- | ---------------------------------- | ------------------------------------------- |
| R1       | Step 7A 公開查詢 API 仍正常        | GET /api/orders/track/:publicToken 不受影響 |
| R2       | Step 7B tracking-import API 仍正常 | POST /orders/tracking-import 不受影響       |
| R3       | Step 5C 個資保護測試未失效         | 個資排除邏輯不受新表影響                    |
| R4       | PATCH /orders/:orderId 仍正常      | 單筆更新 trackingCode 不受影響              |

### 11.4 不執行的測試（Step 7C）

| 未執行項目                    | 原因                           |
| ----------------------------- | ------------------------------ |
| Worker 自動查詢貨態           | Step 7D 才施工 worker          |
| 物流業者 API 實際呼叫         | Step 7D 才串接業者 API         |
| 貨態 timeline 前端顯示        | Step 7E 才施工 UI              |
| trackingStatus 狀態機完整測試 | Step 7D 施工時才有狀態轉移邏輯 |

---

## 12. 非目標

以下功能**在 Step 7C 不做**：

| 非目標                                  | 說明                                              |
| --------------------------------------- | ------------------------------------------------- |
| Worker 自動查詢貨態                     | Step 7D                                           |
| 物流業者 API 串接（7-11 / 全家）        | Step 7D，需確認商用條款                           |
| 公開查詢頁 timeline 顯示                | Step 7E（TrackOrder.tsx 修改）                    |
| 後台追蹤狀態 UI                         | Step 7D 施工時一併考慮                            |
| 自動出貨通知                            | Step 7F                                           |
| 修改現有 orders 表欄位                  | 保持現有 trackingCode / trackingProvider 欄位不動 |
| trackingProvider 的 DB check constraint | Step 7B 決策 A（API 層驗證），暫不做 DB 層約束    |
| OpenClaw / E-Tracking 整合              | 業務決策未確認                                    |
| 多 trackingCode 每訂單                  | Step 7B 決策 D4（只允許一組），本規格不改變此決策 |

---

## 13. 待確認問題

| 編號 | 問題                                                                                                                 | 優先順序 | 影響範圍                |
| ---- | -------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- |
| Q1   | `shipment_trackings` 記錄的建立時機：選項 A（trackingCode 更新時自動建立）、B（手動觸發）、C（定時掃描），哪個優先？ | 高       | Step 7D 施工、API 設計  |
| Q2   | `home_delivery` 和 `other` 的 tracking record 建立後，trackingStatus 設為 `pending` 還是 `inactive`？                | 高       | Worker 設計、資料一致性 |
| Q3   | failureCount 的停止查詢閾值定為幾次？（建議 10 次）                                                                  | 中       | Worker 設計             |
| Q4   | `checking` 狀態的 lock timeout 設為多少？（避免 worker crash 後永遠鎖定）                                            | 中       | Worker 設計、資料可靠性 |
| Q5   | rawData 的個資清洗：由 Worker 在寫入前清洗，還是在讀取時遮蔽？                                                       | 中       | 個資合規                |
| Q6   | `nextCheckAt` 的動態調整策略：是否由 Worker 自行計算，還是由設定檔控制？                                             | 中       | Worker 設計             |
| Q7   | 訂單取消（order.status = cancelled）時，是否自動將 shipment_trackings 設為 inactive？                                | 中       | 業務邏輯                |
| Q8   | `eventStatus` 標準化值是否需要在施工前先確認物流業者 API 的實際回傳格式？                                            | 中       | 業者 API 研究           |
| Q9   | 是否需要在後台顯示 `failureCount` 和 `checkError`（讓老闆知道查詢失敗）？                                            | 低       | 後台 UI                 |
| Q10  | `shipment_tracking_events` 的資料保留期限？（長期累積可能造成表膨脹）                                                | 低       | 資料管理                |

---

## 14. 下一步 Step 7D 銜接建議

### Step 7D 的前提

Step 7D（worker 自動查詢貨態）需在 Step 7C 完成後執行，原因：

1. Step 7D 需要 `shipment_trackings` 表作為任務佇列
2. Step 7D 需要 `shipment_tracking_events` 表儲存查詢結果
3. Step 7D 需要確認物流業者 API 的存取方式（7-11 / 全家）

### Step 7D 需要決定的事項

| 項目                            | 說明                                               |
| ------------------------------- | -------------------------------------------------- |
| 物流業者 API 方案               | OpenClaw、E-Tracking、直接串接業者，三者僅其一可用 |
| Worker 執行環境                 | Replit background worker / cron job / 外部排程     |
| 查詢頻率策略                    | 固定間隔 vs 動態調整（依貨態調整 nextCheckAt）     |
| `checking` lock timeout         | 避免 worker crash 後記錄永遠卡在 checking 狀態     |
| trackingStatus 狀態機完整實作   | 依本規格第 5.1 節的狀態表實作                      |
| eventStatus 映射規則            | 業者回傳代碼 → 系統標準 eventStatus                |
| shipment_trackings 建立觸發時機 | 見本規格第 13 節 Q1                                |

### Step 7D 不可提前施工的部分

- 物流業者 API 方案未確認前，Step 7D 的 worker 邏輯無法撰寫
- 需先確認 7-11 / 全家 C2C 查詢 API 的商用條款與存取限制
- E-Tracking 可商用性未確認，不得以 E-Tracking 作為 Step 7D 的前提

---

## 15. 附錄：schema 檔案建議目錄結構

Step 7C 施工時建議的檔案佈局：

```
lib/db/src/schema/
  ├── index.ts                        ← 更新：export shipmentTrackings / shipmentTrackingEvents
  ├── orders.ts                       ← 不修改
  ├── cvsStores.ts                    ← 不修改
  ├── shipmentTrackings.ts            ← 新增（本規格 5.1 節）
  └── shipmentTrackingEvents.ts       ← 新增（本規格 5.2 節）
```

---

_文件版本：Step 7C Spec v1.1（review fix）_
_撰寫日期：2026-06-07_
_修訂日期：2026-06-07（review fix：方案重組 A/B、eventStatus 標準化、trackingStatus 明確標注、OpenClaw 邊界、公開頁個資清單）_
_撰寫：Claude B（Fixed Latest File Mode）_
_現況依據：docs/order-step7b-tracking-import-spec.md（main HEAD 4258c54）、lib/db/src/schema/orders.ts_
_分支：qa/step6f-cvs-store-selection-browser-mobile（main 基準：4258c54）_
