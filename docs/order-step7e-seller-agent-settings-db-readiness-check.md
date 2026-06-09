# Step 7E-1b-DB-READINESS-CHECK seller_agent_settings DB push 前唯讀確認

## 1. 任務背景

- 任務名稱：Step 7E-1b-DB-READINESS-CHECK
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：唯讀確認 DB 環境是否適合執行 seller_agent_settings DB push
- 前置任務：DB-PUSH-PREFLIGHT（27bc580）

## 2. API Worktree / Branch

| 項目 | 值 |
|------|-----|
| worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| branch | `qa/step7e-seller-agent-settings-api` |

## 3. Reviewed Commit

| commit | message |
|--------|---------|
| `27bc580` | `docs-step7e-seller-agent-settings-db-push-preflight` |

## 4. Env Key Existence（不含 secret value）

| Key | 狀態 |
|-----|------|
| `DATABASE_URL` | **SET** |
| `PGHOST` | **SET** |
| `PGDATABASE` | **SET** |
| `PGUSER` | **SET** |
| `PGPASSWORD` | **SET** |
| `PGPORT` | **SET** |

### DATABASE_URL 解析（不含 password）

| 欄位 | 值 |
|------|-----|
| protocol | `postgresql:` |
| host | `helium` |
| port | (default — 5432) |
| database | `heliumdb` |
| username | SET |
| password | SET（不輸出）|

## 5. DB Identity 檢查（唯讀）

查詢工具：`psql` (PostgreSQL 16.10)

```sql
SELECT
  current_database() AS database,
  current_schema() AS schema,
  current_user AS user_name,
  inet_server_addr() IS NOT NULL AS has_server_addr;
```

結果：

| database | schema | user_name | has_server_addr |
|----------|--------|-----------|-----------------|
| heliumdb | public | postgres  | f               |

**判斷**：
- `database = heliumdb`，`host = helium` → **Replit 本機開發 PostgreSQL**
- `inet_server_addr() IS NOT NULL = f` → 本機 socket 連線（非遠端）
- 非雲端 DB / production DB

## 6. Table Existence 檢查

```sql
SELECT
  to_regclass('public.stores') AS stores_table,
  to_regclass('public.seller_agent_settings') AS seller_agent_settings_table;
```

結果：

| stores_table | seller_agent_settings_table |
|---|---|
| stores | *(NULL)* |

| 表名 | 存在 | 說明 |
|------|------|------|
| `stores` | **✓ 存在** | FK 依賴已就緒 |
| `seller_agent_settings` | **✗ 不存在** | DB push 後將建立 |

## 7. Public Tables 盤點

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

結果（9 tables）：

| table_name |
|------------|
| agent_run_logs |
| cvs_stores |
| orders |
| product_categories |
| products |
| seller_agent_tokens |
| shipment_tracking_events |
| shipment_trackings |
| stores |

與專案 `lib/db/src/schema/index.ts` exports 對照：

| Schema Export | DB 存在 |
|--------------|---------|
| stores | ✓ |
| productCategories | ✓（products + product_categories）|
| products | ✓ |
| orders | ✓ |
| cvsStores | ✓ |
| shipmentTrackings | ✓ |
| shipmentTrackingEvents | ✓ |
| sellerAgentTokens | ✓ |
| agentRunLogs | ✓ |
| **sellerAgentSettings** | **✗（待建立）** |

## 8. Stores Count 確認

```sql
SELECT COUNT(*) AS stores_count FROM public.stores;
```

| stores_count |
|--------------|
| 2 |

`stores` 表有 2 筆資料，FK 依賴可以正常運作。

## 9. Readiness Conclusion

**結論：A — Ready for DB push**

| 條件 | 狀態 |
|------|------|
| `DATABASE_URL` 存在 | ✓ |
| DB 可連線 | ✓ |
| 確認非 production DB | ✓（host=helium，Replit 本機 dev）|
| `stores` 表存在 | ✓（2 rows，FK 就緒）|
| `seller_agent_settings` 表不存在 | ✓（push 後將建立）|
| public tables 符合開發環境預期 | ✓（9 個 tables，全為專案已知表）|

無 Blocked 或 Needs-user-confirmation 情況。

## 10. 建議 DB Push 指令（確認 ready 後執行）

```bash
cd /home/runner/workspace/.worktrees/step7e-api/lib/db

# 互動式 push（推薦，先確認 diff 只有 seller_agent_settings）
pnpm run push

# 或確認安全後用 force（跳過互動）
# pnpm run push-force
```

預期 push 結果：
- 建立 `seller_agent_settings` table
- 建立 3 個 indexes
- 建立 UNIQUE constraint `seller_agent_settings_store_id_unique`
- 建立 FK `seller_agent_settings_store_id_fk → stores(id) ON DELETE CASCADE`
- 建立 3 個 CHECK constraints

## 11. 未執行項目

- **未 DB push**
- **未 migrate**
- **未 seed**
- **未執行任何寫入 SQL（CREATE / ALTER / DROP / INSERT / UPDATE / DELETE）**
- **未輸出任何 secret value（DATABASE_URL 完整值 / PGPASSWORD）**
- **未修改 API 行為**
- **未修改 schema**
- **未修改 migration**
- **未施工 UI**
- **未 push GitHub**

## 12. 風險與待確認

| 風險 | 嚴重度 | 說明 |
|------|--------|------|
| drizzle-kit push 可能對其他表提出 ALTER | 中 | 須確認互動式 diff 只有 seller_agent_settings |
| worktree node_modules 是否有 drizzle-kit | 中 | 需確認 pnpm run push 可在 worktree 執行 |
| `0001_seller_agent_settings.sql` 未來編號衝突 | 低 | 維持 push-only 則無影響 |

## 13. 下一步建議

1. **DB push 現在可安全執行**（Ready 結論）
2. 執行：`cd /home/runner/workspace/.worktrees/step7e-api/lib/db && pnpm run push`
3. 確認互動式 diff 只列出 seller_agent_settings 建表操作
4. 確認後按 Enter 執行
5. Push 後執行 integration test（GET/PATCH 真實 DB）
6. UI 施工：seller agent settings 管理頁面
