# Step 7D-2D-R1 — DB Schema Drift 安全補救盤點與決策文件

> 盤點日期：2026-06-08
> 分支：qa/step6f-cvs-store-selection-browser-mobile
> 前置文件：docs/order-step7d-agent-api-route-implementation-audit.md、docs/order-step8h-amount-note-pdf-delete-audit.md、docs/order-step8i-amount-adjustment-db-api-spec.md
> 本文件性質：決策與補救計畫，**不施工、不執行 DB push、不修改 API / UI**

---

## 0. 文件定位

- 本文件是 **Step 7D-2D-R1 schema drift 安全補救盤點**
- 本文件**只做決策與補救計畫**，不做任何施工
- 本次**不執行 DB push**（含 `drizzle-kit push`、`pnpm --filter @workspace/db push`、force push）
- 本次**不做 API 實作**，不修改 `lib/db/src/schema/orders.ts`、不修改 `artifacts/api-server/src/routes/orders.ts`、不修改前端 UI
- 本次**不 cherry-pick / push** commit `2f825bb feat-api-step7d-agent-auth-route-skeleton`

---

## 1. 問題現況

### 1.1 Step 7D 需要的四張表 / 欄位（main schema 已定義，DB 尚未套用）

Step 7D（Agent API）依賴以下 DB 物件，main 分支的 schema 程式碼已齊全（`shipmentTrackings.ts`、`shipmentTrackingEvents.ts`、`sellerAgentTokens.ts`、`agentRunLogs.ts`，且 `index.ts` 已 export），但**目前 `DATABASE_URL` 指向的 DB 完全沒有這些物件**：

| 目標物件 | main schema 是否定義 | 目前 DB 是否存在 |
|---|---|---|
| `shipment_trackings` | ✅ 已定義 | ❌ 不存在 |
| `shipment_tracking_events` | ✅ 已定義 | ❌ 不存在 |
| `seller_agent_tokens` | ✅ 已定義 | ❌ 不存在 |
| `agent_run_logs` | ✅ 已定義 | ❌ 不存在 |
| `shipment_tracking_events.idempotency_key` | ✅ 已定義 | ❌ 不存在 |

### 1.2 目前 DB 又多出 main schema 沒有定義的欄位（schema drift 的另一面）

與此同時，目前 DB 的 `orders` 表**多出兩個 main schema 沒有定義的欄位**：

| 欄位 | DB 現況 | main schema (`git show main:lib/db/src/schema/orders.ts`) | 目前 `qa/step6f` 分支 `lib/db/src/schema/orders.ts` |
|---|---|---|---|
| `orders.discount_amount` | 存在，型別 `integer`，`NOT NULL DEFAULT 0` | ❌ 未定義 | ✅ 已存在（L54：`discountAmount: integer("discount_amount").notNull().default(0)`，已隨 commit `ea84cc0 feat-step8j-order-discount-backend` 落盤於本分支）|
| `orders.discount_note` | 存在，型別 `text`，nullable | ❌ 未定義 | ✅ 已存在（L55：`discountNote: text("discount_note")`，同上）|

> 補充說明（2026-06-08 盤點期間發生的變化）：在本次盤點過程中，另一位協作者於本分支提交了 `ea84cc0 feat-step8j-order-discount-backend`，把原本處於 dirty 狀態的 `discountAmount` / `discountNote` schema 與對應的後端邏輯正式 commit 到 `qa/step6f-cvs-store-selection-browser-mobile` 分支（**非 main**）。這不影響本文件對 DB 現況與 main schema 落差的分析結論——main 分支仍是 `de1dcc3`，未包含這兩個欄位；DB 現況也未被本次盤點變更。

**資料現況精確盤點（已查 count，未輸出資料內容）：**

- `orders` 表目前共 **27 筆**訂單
- `discount_amount` 為 `NOT NULL DEFAULT 0`，因此全部 27 筆都「非 NULL」——但進一步查詢 distinct 值分布，**27 筆全部都是預設值 `0`**，代表目前沒有任何訂單曾經被實際輸入過折讓金額（因為 Step 8J 後端 / Step 8K 前端 UI 都還沒有施工，沒有寫入路徑）
- `discount_note` 則 **27 筆全部為 NULL**，同樣代表沒有任何使用者輸入過折讓備註

**這代表什麼**：drizzle-kit 顯示「You're about to delete `discount_amount` column in orders table with **27 items**」中的「27 items」，**對應的是 `orders` 表目前的總列數**（因為該欄位 `NOT NULL`，全部列都「有值」），而不是「27 筆使用者已輸入的真實折讓資料」。換句話說：**目前還沒有任何業務上有意義的折讓資料會因刪除欄位而遺失**——但欄位定義本身、以及它在目前工作區 schema 程式碑中的對應關係，仍然會被破壞。

### 1.3 `drizzle-kit push` 的行為

執行 `pnpm --filter @workspace/db push`（不使用 force）時，drizzle-kit 會：

1. 先讀取目前 DB 的實際 schema
2. 與 main 分支的 schema 程式碼（即將套用的目標）比對
3. 偵測到 DB 中存在「main schema 未定義」的 `discount_amount`、`discount_note` 兩個欄位
4. 判定這是「需要刪除以對齊目標 schema」的欄位，並標記為「資料遺失語句（data-loss statements）」：

```
Warning  Found data-loss statements:
· You're about to delete discount_amount column in orders table with 27 items
· You're about to delete discount_note column in orders table with 27 items

THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED

Do you still want to push changes?
```

5. 要求互動式確認；因執行環境沒有 TTY，prompt 直接報錯中止，**DB 並未被實際變更**

---

## 2. 風險說明

### 2.1 為什麼不能 force

- `drizzle-kit push --force`（或 `pnpm --filter @workspace/db push-force`）會**跳過資料遺失確認，直接執行 `ALTER TABLE orders DROP COLUMN discount_amount` 與 `DROP COLUMN discount_note`**
- 這個操作是 **DDL 層級的不可逆操作**：欄位定義、型別、約束（`NOT NULL DEFAULT 0`）、以及該欄位上未來可能建立的 index 都會被永久刪除
- 即使目前資料都是預設值（`0` / `NULL`），**欄位本身被刪除後，需要重新走一次 schema 變更流程才能復原**，且復原後仍須處理「main schema 與目前已存在的 Step 8 進度」之間的對齊問題——等於白做工
- 任務指令明確禁止使用 force，這與「不可逆 DDL 操作必須先取得使用者確認」的一般原則一致

### 2.2 為什麼不能直接讓互動確認通過（手動回覆 yes）

- 即使在有 TTY 的環境下手動回覆「yes」讓 push 通過，**結果與 force 完全相同**：欄位會被 DROP
- 這個決定的影響範圍**超出本次任務授權範圍**：這兩個欄位屬於另一條進行中工作線（`qa/step6f` 分支的金額調整功能，Step 8H/8I 規格、Step 8J/8K 待施工），刪除它們會直接影響該功能線的後續開發，**不是 Step 7D 任務執行者可以單方面決定的事**
- 正確做法是：先解決「main schema 與目前 DB / 目前工作分支 schema 不同步」的根本問题，而不是用一次性的人工確認把分歧「推平」

### 2.3 為什麼不能讓 main schema 直接覆蓋目前 DB

- 目前 `DATABASE_URL` 指向的 DB，**並非單純落後於 main**，而是同時存在「落後 Step 7D」與「超前 main 的 orders schema（已含金額調整欄位）」兩種狀態
- 若放任 `drizzle-kit push` 把 main schema 視為唯一目標並覆蓋 DB：
  - **會破壞金額調整功能**：目前 `qa/step6f` 分支的 `lib/db/src/schema/orders.ts`（已隨 commit `ea84cc0 feat-step8j-order-discount-backend` 正式落盤，並有對應的後端邏輯與測試）已經包含 `discountAmount` / `discountNote`，若 DB 欄位被刪除，該分支的 schema 程式碼、後端邏輯與實際 DB 將立刻產生新的不一致，後續 typecheck / 執行時查詢 / 測試都會出錯
  - **會刪除欄位定義與既有列的欄位值**：雖然目前沒有「使用者已輸入的折讓資料」會遺失，但欄位定義、約束、預設值、以及 27 筆既有訂單列上對應欄位的儲存空間配置都會被刪除並需要重建
  - **會讓問題更複雜**：日後若要重新加回這兩個欄位（例如 Step 8J 施工時），又會再跑一次 `drizzle-kit push`，等於繞了一圈又回到原點，且過程中徒增「DB 曾經存在又被刪除又重建」的歷史包袱

---

## 3. Schema Drift 來源推測

綜合 git log、schema 程式碼比對、DB 現況查詢，目前最合理的推測是：

1. **Step 7D 的 schema（`shipmentTrackings` / `shipmentTrackingEvents` / `sellerAgentTokens` / `agentRunLogs` / `idempotency_key`）已經在 main 分支完成程式碼撰寫（commit `d441fd9 feat-db-step7d-agent-token-run-log-schema`），但尚未對目前 `DATABASE_URL` 執行過 `drizzle-kit push`** —— 這解釋了為什麼這四張表與 `idempotency_key` 欄位在目前 DB 中完全不存在
2. **金額調整欄位（`discount_amount` / `discount_note`）已經在 `qa/step6f` 分支新增到 `lib/db/src/schema/orders.ts`（盤點當下原為 dirty 狀態，盤點過程中已由協作者正式提交為 commit `ea84cc0 feat-step8j-order-discount-backend`），且已經對目前 `DATABASE_URL` 執行過 `drizzle-kit push` 套用到 DB** —— 這解釋了為什麼 DB 中已經有這兩個欄位、且型別與 Step 8I 規格（`integer notNull default(0)` / `text nullable`）完全吻合，但 main 分支（仍為 `de1dcc3`）的 `orders.ts` 卻沒有這兩個欄位
3. 換句話說，**目前 `DATABASE_URL` 的 DB 同時「落後於 main 的 Step 7D schema」又「超前於 main 的 orders schema」**：它是 `qa/step6f` 分支開發進度與 main 分支發布進度交錯下的產物，並非單純的「忘記 push」或「環境錯亂」

---

## 4. 解法比較

### 方案 A：先把 `discountAmount` / `discountNote` 納入 main 的 `orders` schema，再重新執行 Step 7D DB push（**推薦**）

- **做法**：先建立一個獨立、範圍受限的小任務，把目前 `qa/step6f` 分支中已經寫好且已驗證可用的 `discountAmount` / `discountNote` schema 定義，安全地補進 main 分支的 `lib/db/src/schema/orders.ts`（只動 schema 程式碼，不動 API / UI），讓 main schema 與目前 DB 的 `orders` 表狀態對齊
- **優點**：
  - **保留資料**：不需要 DROP 任何欄位，27 筆既有訂單的欄位值（即使目前都是預設值）原封不動保留
  - **讓 main schema 與目前 DB 對齊**：對齊後再執行 `drizzle-kit push`，drizzle-kit 比對時就不會再把 `discount_amount` / `discount_note` 視為「需要刪除的多餘欄位」，「資料遺失語句」警告會自然消失
  - **風險最低**：整個過程不涉及任何 DDL 層級的刪除操作，只新增 Step 7D 需要的四張表與 `idempotency_key` 欄位（純新增，不會觸發資料遺失警告）
  - **與既有規劃相容**：Step 8I 規格文件已經明確定義了這兩個欄位的型別、約束、預設值，補進 main 等於是「把已經規格化、已經在 DB 中驗證過的設計提前同步」，不是臨時拍板
- **代價**：需要額外一個小任務來做 schema 同步（即下方建議的 Step 7D-2D-R2），但範圍很小（只動兩行 schema 定義），可控

### 方案 B：先匯出 `discount` 欄位資料，再允許刪欄位（**不推薦**）

- **做法**：用 `pg_dump` 或 SQL 匯出 `orders.discount_amount` / `orders.discount_note` 的資料，再執行 `drizzle-kit push --force` 刪除欄位，日後需要時再用 migration 加回並回填資料
- **不推薦原因**：
  - **會破壞進行中功能**：`qa/step6f` 分支的工作區 schema 已經依賴這兩個欄位存在，刪除後該分支立刻出現 schema 與 DB 不一致，相關 typecheck / 執行時查詢會直接失敗
  - **後續還要還原資料**：即使資料目前都是預設值、技術上「可重建」，但這個「先刪、再加、再回填」的流程本身就是不必要的往返工程（round-trip engineering），徒增操作步驟與出錯機會
  - **時序上不合理**：這兩個欄位是「未來 main 一定會需要」的欄位（已有 Step 8I 規格背書），刪除後勢必要再加回來，等於是在已知終點的情況下繞遠路

### 方案 C：用手寫 SQL 只建立 Step 7D 表，避開 Drizzle schema drift（**不推薦作為 MVP**）

- **做法**：不透過 `drizzle-kit push`，改用手寫的 `CREATE TABLE` SQL 直接在 DB 中建立 `shipment_trackings`、`shipment_tracking_events`、`seller_agent_tokens`、`agent_run_logs` 與 `idempotency_key` 欄位，跳過 drizzle 的 schema 比對流程
- **不推薦原因**：
  - **容易讓 Drizzle schema 與 DB 更分裂**：手寫 SQL 建立的表結構，必須與 Drizzle schema 程式碼定義（型別、約束、index、命名）完全一致，否則下次執行 `drizzle-kit push` 時，drizzle 仍會偵測到差異並嘗試「修正」，可能再次觸發資料遺失語句或產生非預期的 `ALTER TABLE`
  - **違反專案既有的 DB 變更流程**：本專案使用 Drizzle 作為 schema 真實來源（source of truth），手寫 SQL 等於繞過這個機制，會讓未來的 schema 追蹤、審查、與其他環境同步變得更困難
  - **本次任務也明確禁止產生 SQL migration 檔案**，手寫 `CREATE TABLE` 與此精神相違

### 方案 D：換一個乾淨 DB（**可行但不適合目前情境**）

- **做法**：建立一個全新、空白的 DB，把 `DATABASE_URL` 指向新 DB，再執行 `drizzle-kit push` 套用 main schema，全新 DB 不會有任何 schema drift 問題
- **評估**：
  - 技術上可行，且確實能徹底避開「DB 中已有 main 未定義欄位」的衝突
  - **但不適合目前已承載資料的 DB**：目前 DB 已有 27 筆真實訂單資料、以及其他既有表（`cvs_stores`、`product_categories`、`products`、`stores`）的資料，換 DB 等於要重新規劃資料遷移流程，影響範圍遠超過「補幾張表」的原始任務目標
  - 若要採用此方案，需要先確認「目前 DATABASE_URL 是否為正式環境」「是否有資料遷移計畫」等更高層級的問題，**已超出本次盤點的決策範圍**

---

## 5. 推薦決策

**推薦採用方案 A**：先把 `discountAmount` / `discountNote` 補進 main 的 `orders` schema，讓 main schema 與目前 DB 對齊，再重新執行 Step 7D 的 DB resync。

理由總結：
- 唯一一個**不需要刪除任何欄位、不會觸發資料遺失警告**的方案
- 兩個欄位的設計已經有 Step 8I 規格文件背書，補進 main **不是臨時決定，而是把已規劃、已驗證的設計提前同步**
- 範圍可以做到非常小：只新增兩行 schema 定義到 main 的 `orders.ts`，不動 API、不動 UI、不動其他表
- 對齊後，Step 7D 所需的四張新表與 `idempotency_key` 欄位都是「純新增」，不會與任何既有欄位衝突，`drizzle-kit push` 不會再出現資料遺失語句

---

## 6. 下一步建議

**下一步不是 Step 7D-3B push。**

正確的施工順序應該是：

### Step 7D-2D-R2：把 `discount_amount` / `discount_note` 補進 main `orders` schema，保護既有 DB 資料

- 範圍：只在 main 分支的 `lib/db/src/schema/orders.ts` 新增 `discountAmount` / `discountNote` 兩個欄位定義（型別、約束比照 Step 8I 規格與目前 DB 實際狀態：`integer notNull default(0)` / `text nullable`）
- 不動 API、不動 UI、不動其他 schema 檔案
- 目標：讓 main schema 與目前 `DATABASE_URL` 的 `orders` 表狀態完全對齊，消除 schema drift 中「DB 多出 main 未定義欄位」的那一面

### 接著才是 Step 7D-2D-R3：重新執行 DB schema resync / `drizzle-kit push`

- 在 main schema 與目前 DB 的 `orders` 表對齊後，重新執行 `pnpm --filter @workspace/db push`（仍然不使用 force）
- 此時 drizzle-kit 比對到的差異應該只剩「純新增」（`shipment_trackings`、`shipment_tracking_events`、`seller_agent_tokens`、`agent_run_logs`、`idempotency_key`），不應再出現任何資料遺失語句
- 完成後依照 Step 7D-2D-R 原訂的驗收標準，逐一驗證四張表、`idempotency_key` 欄位、主要欄位與 indexes 是否存在

### 最後才是 Step 7D-3B 收尾：cherry-pick `2f825bb` 到 main + push

- 在 DB schema 完全與 main 對齊、Step 7D 所需物件都驗證存在後，才回頭處理 `2f825bb feat-api-step7d-agent-auth-route-skeleton` 的 cherry-pick 與 push
- 這個順序能確保 cherry-pick 後的程式碼在執行時能正確找到它依賴的 `seller_agent_tokens` / `agent_run_logs` 表與 `idempotency_key` 欄位

---

## 7. 非目標（本文件與後續建議步驟的範圍邊界）

本文件與其建議的下一步（Step 7D-2D-R2 / R3）**不包含**：

- ❌ 不刪資料 —— 任何步驟都不應執行 `DROP COLUMN` / `DROP TABLE`
- ❌ 不 force DB push —— 任何步驟都不應使用 `--force` 或繞過資料遺失確認
- ❌ 不直接進 Step 7D-3C —— 在 Step 7D-3B 完成 cherry-pick / push 之前，不討論、不規劃 Step 7D-3C
- ❌ 不直接推 `2f825bb` —— 必須先完成 DB schema 同步與驗收
- ❌ 不做完整 Agent API —— Step 7D-2D-R2 只新增 schema 定義，不實作 Agent API 的業務邏輯
- ❌ 不做 UI —— 不涉及任何前端頁面或元件變更

---

## 8. 結論

目前的 DB schema drift 並非單純的「main schema 尚未套用到 DB」，而是**兩條工作線（Step 7D 的 Agent API schema、`qa/step6f` 的金額調整 schema）在不同進度下交錯產生的雙向落差**：DB 落後 Step 7D，又超前於 main 的 `orders` schema。

直接執行 `drizzle-kit push` 會把這個雙向落差簡化為「DB 多出來的欄位 = 應該刪除」，因而觸發不可逆的資料遺失警告。正確的解法是先承認並修正「main schema 落後於 DB 已有的金額調整欄位」這一面（方案 A / Step 7D-2D-R2），讓比對基準對齊，再進行純新增式的 Step 7D schema resync（Step 7D-2D-R3），最後才回頭完成 Step 7D-3B 的 cherry-pick / push。
