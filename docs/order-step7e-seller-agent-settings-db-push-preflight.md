# Step 7E-1b-DB-PUSH-PREFLIGHT seller_agent_settings DB 建表前置盤點

## 1. 任務背景

- 任務名稱：Step 7E-1b-DB-PUSH-PREFLIGHT
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：評估 seller_agent_settings table 建立的前置條件，不執行實際 DB push
- 前置任務：API-IMPL / API-REVIEW / API-MOCK-TEST（全部完成）

## 2. API Worktree / Branch

| 項目 | 值 |
|------|-----|
| worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| branch | `qa/step7e-seller-agent-settings-api` |

## 3. Reviewed Commits

| commit | message | 角色 |
|--------|---------|------|
| `626b399` | `feat-db-step7e-seller-agent-settings-schema` | schema |
| `437d7e9` | `docs-step7e-seller-agent-settings-typecheck` | typecheck |
| `dc75672` | `feat-api-step7e-seller-agent-settings` | API |
| `251216d` | `docs-step7e-seller-agent-settings-api-implementation` | impl doc |
| `8bdcdb4` | `docs-step7e-seller-agent-settings-api-review` | review doc |
| `c73a68f` | `test-api-step7e-seller-agent-settings` | mock tests |
| `cbb7c34` | `docs-step7e-seller-agent-settings-api-mock-test` | test doc |

## 4. DB Package / Drizzle Config 盤點

### 4.1 Package 位置

```
lib/db/
  package.json          — @workspace/db
  drizzle.config.ts     — 唯一 drizzle config
  tsconfig.json
  src/schema/index.ts   — schema 入口
  src/schema/sellerAgentSettings.ts
  migrations/
    0001_seller_agent_settings.sql
```

### 4.2 `lib/db/drizzle.config.ts` 內容

```typescript
import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

**關鍵觀察**：
- `out` 欄位**未設定** → 不產生 migration journal
- 這確認本專案為 **push-only** 工作流（不使用 drizzle-kit generate）
- `DATABASE_URL` 為必要環境變數

## 5. Scripts 盤點

### 5.1 `lib/db/package.json` scripts

```json
{
  "push":       "drizzle-kit push --config ./drizzle.config.ts",
  "push-force": "drizzle-kit push --force --config ./drizzle.config.ts",
  "seed":       "tsx src/seed.ts"
}
```

### 5.2 盤點結論

| Script | 存在 | 說明 |
|--------|------|------|
| `push` | ✓ | `drizzle-kit push --config ./drizzle.config.ts` |
| `push-force` | ✓ | 加 `--force`，跳過互動式確認 |
| `generate` | ✗ | 未設定，push-only 工作流無需 generate |
| `migrate` | ✗ | 未設定，不使用 migration journal |
| `seed` | ✓ | `tsx src/seed.ts`（非必須）|

### 5.3 建議 DB push 指令

**方式 A — 從 worktree lib/db 執行（需確認 drizzle-kit 在 PATH）**：
```bash
cd /home/runner/workspace/.worktrees/step7e-api/lib/db
pnpm run push
```

**方式 B — 從主 workspace 用 pnpm filter 執行**（需先將 schema merge/cherry-pick 至主 workspace）：
```bash
cd /home/runner/workspace
pnpm --filter @workspace/db run push
```

**注意**：方式 B 需確認主 workspace 已有 `sellerAgentSettings.ts` schema 與 schema/index.ts export。

## 6. Schema / Migration 盤點

### 6.1 Schema 結構（`sellerAgentSettings.ts`）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | serial PK | 自增主鍵 |
| `store_id` | integer NOT NULL | FK → stores(id) ON DELETE CASCADE |
| `merchant_id` | text NOT NULL | Clerk userId |
| `agent_status` | text NOT NULL DEFAULT 'disabled' | CHECK constraint |
| `agent_mode` | text NOT NULL DEFAULT 'rule_worker' | CHECK constraint |
| `enabled_logistics` | jsonb NOT NULL DEFAULT [] | 無 DB CHECK |
| `query_methods` | jsonb NOT NULL DEFAULT ["manual"] | 無 DB CHECK |
| `query_frequency` | text NOT NULL DEFAULT 'manual' | CHECK constraint |
| `notify_on_unknown` | boolean NOT NULL DEFAULT true | |
| `require_confirm_on_exception` | boolean NOT NULL DEFAULT true | |
| `require_confirm_on_returned` | boolean NOT NULL DEFAULT false | |
| `require_confirm_on_delivered` | boolean NOT NULL DEFAULT false | |
| `hide_error_details_from_buyer` | boolean NOT NULL DEFAULT true | |
| `webhook_enabled` | boolean NOT NULL DEFAULT false | |
| `webhook_url` | text | nullable |
| `webhook_secret_hash` | text | nullable，只存 SHA-256 hash |
| `last_test_run_at` | timestamptz | nullable |
| `last_run_at` | timestamptz | nullable |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | $onUpdate |

**Constraints**：
- `UNIQUE(store_id)` — 一家店只有一筆設定
- `FK store_id → stores(id) ON DELETE CASCADE`
- `CHECK agent_status IN ('disabled', 'enabled')`
- `CHECK agent_mode IN ('self_hosted_webhook', 'external_agent', 'rule_worker', 'platform_managed_reserved')`
- `CHECK query_frequency IN ('manual', 'daily', 'every_6_hours', 'every_2_hours_high_tier')`

**Indexes**：
- `(merchant_id, store_id)` — 複合索引
- `(agent_status)` — 單欄索引
- `(query_frequency)` — 單欄索引

### 6.2 `0001_seller_agent_settings.sql` 定位判斷

**結論：手寫 DDL 文件記錄，不是正式 migration 檔案**

根據檔案開頭注釋：

> 本專案原本偏向使用 `drizzle-kit push`（push-only 工作流，不使用 drizzle-kit generate 產生的編號 migration journal）。本檔案是手寫 DDL 紀錄，用於說明 sellerAgentSettingsTable 對應的實際資料庫結構，並非透過 `drizzle-kit generate` 自動產生。

| 問題 | 判斷 |
|------|------|
| 是否為正式 migration？ | 否 — 手寫 DDL 文件記錄 |
| 是否應直接執行？ | 否 — drizzle-kit push 會自動產生 DDL，此 SQL 僅供人工參考 |
| 未來切換 generate 時 0001 編號是否衝突？ | **有風險** — drizzle-kit generate 會從 0000 開始自動編號，可能衝突 |
| DB push 前是否需先決定 migration 策略？ | 建議確認，但 push-only 流程可直接 push |

## 7. Env Key Existence（不含 secret value）

| Key | 存在 |
|-----|------|
| `DATABASE_URL` | **SET** |
| `POSTGRES_URL` | MISSING |
| `POSTGRES_PRISMA_URL` | MISSING |
| `SUPABASE_DB_URL` | MISSING |
| `SUPABASE_URL` | MISSING |
| `SUPABASE_SERVICE_ROLE_KEY` | MISSING |
| `PGHOST` | **SET** |
| `PGDATABASE` | **SET** |
| `PGUSER` | **SET** |
| `PGPASSWORD` | **SET** |
| `PGPORT` | **SET** |

`DATABASE_URL` 已設定，drizzle-kit push 所需環境變數齊備。

## 8. Migration Strategy 判斷

| 判斷項目 | 結論 |
|--------|------|
| 工作流類型 | **drizzle-kit push（push-only）** |
| `out` 欄位 | 未設定 → 無 migration journal |
| `generate` script | 不存在 → 確認 push-only |
| `0001_seller_agent_settings.sql` | 手寫 DDL 記錄，非 drizzle-kit 管理的 migration |
| push-only 工作流定義 | drizzle-kit 比較 Drizzle schema 與真實 DB，直接同步，不產生 SQL journal |

**建議**：
- 本次使用 **push-only** 流程，無需處理 migration journal
- `0001_seller_agent_settings.sql` 保留作為 DDL 文件，不直接執行
- 未來若有遷移到 `generate` 的計畫，需先清理此 SQL 文件的編號

## 9. DB Push 風險評估

| 問題 | 回答 |
|------|------|
| push 會建立 `seller_agent_settings`？ | 是，若 DB 中不存在此 table |
| push 會嘗試改動既有表？ | drizzle-kit push 會掃描所有 schema，**可能**對非 sellerAgentSettings 的表提出 ALTER 若有 schema drift；建議確認 |
| 能在不看真實 DB 的情況下保證安全？ | **不能** — 無法保證既有表無 schema drift |
| 需要先備份 DB？ | **建議備份**，尤其若有 production 資料 |
| 需要先在 staging / dev DB 執行？ | **建議**先在 staging 測試 |
| 需要先確認 stores 表存在？ | **是** — FK 依賴 stores(id)，若 stores 不存在則 push 失敗 |
| `store_id UNIQUE` 是否有衝突風險？ | 新表新 constraint，無衝突風險 |
| push 失敗時 rollback？ | 新表建立失敗通常 atomic，無 partial state；若成功後需回滾，執行 DROP |
| 建議本地直接 push？ | 先確認 DB 環境為開發 DB，確認後可 push |
| integration test 應在 push 後跑哪些項目？ | 見第 12 節 |

## 10. 建議 DB Push 計畫

### 前置確認（執行 push 前）

1. 確認目前連線 DB 為**開發 / staging DB**，非 production
2. 確認 `stores` 表存在（FK 依賴）
3. 確認現有表無 schema drift（可先執行 `drizzle-kit push` 並觀察互動式提示，不確認則不實際 push）

### 執行步驟

```bash
# Step 1: 切換至 API worktree lib/db
cd /home/runner/workspace/.worktrees/step7e-api/lib/db

# Step 2: 確認環境變數已設定（只確認存在，不印值）
node -e "console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'MISSING')"

# Step 3: 先用 drizzle-kit push 的互動模式確認 diff（不用 --force）
pnpm run push
# → 檢視 drizzle-kit 列出的 pending changes，確認只有 seller_agent_settings 的建表

# Step 4: 若確認安全，按 Enter 確認（或若需非互動，用 push-force）
# pnpm run push-force  ← 只在確認安全後使用
```

### 預期輸出

```
[✓] Pulling schema from database...
[✓] Changes:
  + CREATE TABLE seller_agent_settings ...
[?] Do you want to execute this? (yes/no)
```

若出現除 `seller_agent_settings` 建表以外的任何 ALTER / DROP，**停止並確認**。

## 11. Rollback / Recovery 計畫

### 情境 A：push 成功後需回滾

```sql
-- 只需 DROP 新建的 table，不影響其他表
DROP TABLE IF EXISTS seller_agent_settings CASCADE;
```

CASCADE 會同時清除依賴此表的 objects（index、constraint），安全。

### 情境 B：push 失敗（FK 錯誤 / stores 不存在）

- push 失敗通常 atomic（新表未建立），無需 rollback
- 確認 stores 表存在後重試

### 情境 C：push 嘗試 ALTER 其他表

- 立即中止 push（不在互動式提示中確認）
- 調查 schema drift 原因
- 修復 schema 後再 push

## 12. DB Push 後 Integration Test 建議

| 測試項目 | 說明 |
|--------|------|
| GET /stores/:storeId/agent/settings（無 row）| 確認回傳 in-memory default，不 INSERT |
| GET /stores/:storeId/agent/settings（有 row）| 確認 DB row 正確回傳 |
| PATCH upsert（storeId 不存在於 stores）| 確認 FK constraint 觸發 500（非 403）|
| PATCH upsert（第一次，INSERT）| 確認新 row 建立 |
| PATCH upsert（第二次，UPDATE）| 確認 onConflictDoUpdate 正確更新 |
| PATCH webhookSecret → DB 有 hash | 確認真實 DB 儲存 SHA-256，不含明文 |
| PATCH platform_managed_reserved → 400 | DB CHECK constraint 或應用層 |
| PATCH forbidden keys → 400 | 確認應用層 validation 仍生效 |
| 多 store 隔離 | 確認不同 storeId 各自獨立，不互相覆蓋 |
| ON DELETE CASCADE | 確認刪除 store 後 seller_agent_settings row 自動刪除 |

## 13. 未執行項目

- **未 DB push**
- **未 migrate**
- **未 seed**
- **未施工 UI**
- **未 push GitHub**
- **未修改 API 行為**
- **未修改 schema**
- **未修改 migration**
- **未輸出任何 secret value**

## 14. 風險與待確認

| 風險 | 嚴重度 | 說明 |
|------|--------|------|
| drizzle-kit push 可能對其他表提出 ALTER | 高 | 建議先查看互動式 diff，確認只有 seller_agent_settings |
| worktree node_modules 是否有 drizzle-kit | 中 | 若無，需從主 workspace 執行，但主 workspace 需先有 schema |
| `0001_seller_agent_settings.sql` 未來編號衝突 | 低 | 若切換到 generate 工作流需處理 |
| stores 表必須存在 | 高 | FK 依賴，push 前確認 |
| 直接 push production DB | 極高 | 絕對禁止，必須先確認為開發 DB |

## 15. 下一步建議

1. **確認 DB 環境**：確認目前 `DATABASE_URL` 指向開發 / staging DB
2. **確認 stores 表存在**：`SELECT 1 FROM stores LIMIT 1;`
3. **執行互動式 push**（不用 --force）：確認 diff 只有 seller_agent_settings 建表
4. **確認 push 後執行 integration test**（第 12 節列表）
5. **決定 `0001_seller_agent_settings.sql` 定位**：
   - 若維持 push-only：此 SQL 為文件記錄，不執行
   - 若未來改 generate：需決定是否保留此編號或清除
6. **UI 施工**：seller agent settings 管理頁面
