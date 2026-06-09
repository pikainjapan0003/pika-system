# Step 7E-1b-DB-PUSH-PREFLIGHT Handoff Sync

## 1. 任務背景

- 任務名稱：Step 7E-1b-DB-PUSH-PREFLIGHT
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：評估 seller_agent_settings table 建立的前置條件，不執行實際 DB push

## 2. API Worktree / Branch

| 項目 | 值 |
|------|-----|
| worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| branch | `qa/step7e-seller-agent-settings-api` |

## 3. Preflight Commit

| commit | message |
|--------|---------|
| `27bc580` | `docs-step7e-seller-agent-settings-db-push-preflight` |

## 4. 同步到 dev-handoff 的內容

### DB / Drizzle 設定

- 工作流：**drizzle-kit push（push-only）**
- config：`lib/db/drizzle.config.ts`（無 `out` 欄位 → 無 migration journal）
- 環境變數：`DATABASE_URL=SET`、`PGHOST/PGDATABASE/PGUSER/PGPASSWORD/PGPORT=SET`

### Scripts

| Script | 指令 |
|--------|------|
| `push` | `drizzle-kit push --config ./drizzle.config.ts` |
| `push-force` | `drizzle-kit push --force --config ./drizzle.config.ts` |
| `seed` | `tsx src/seed.ts` |

**無 generate / migrate script** — 確認 push-only 工作流

### 建議 DB push 指令

```bash
cd /home/runner/workspace/.worktrees/step7e-api/lib/db
pnpm run push
```

先用互動模式確認 diff 只有 seller_agent_settings 建表，確認後才 push。

### Migration Strategy 判斷

- `0001_seller_agent_settings.sql` 是手寫 DDL 文件記錄，非正式 migration
- 維持 push-only 流程，不直接執行此 SQL
- 若未來切換 generate，需決定此 SQL 的定位

### Env Key Existence（不含 secret）

| Key | 狀態 |
|-----|------|
| DATABASE_URL | SET |
| PGHOST / PGDATABASE / PGUSER / PGPASSWORD / PGPORT | SET |
| POSTGRES_URL / SUPABASE_* | MISSING |

### 風險提示

- drizzle-kit push 可能對其他表提出 ALTER（需確認互動式 diff）
- stores 表必須存在（FK 依賴）
- 絕對禁止 push production DB

## 5. 未執行項目

- 未 DB push
- 未 migrate
- 未 seed
- 未施工 UI
- 未 push GitHub
- 未修改 API / schema / migration
- 未輸出任何 secret value

## 6. 風險與待確認

- drizzle-kit push 可能對其他表提出 ALTER（高）
- worktree node_modules 是否有 drizzle-kit（中）
- stores 表必須存在（高）
- 直接 push production DB（極高危，禁止）

## 7. 下一步建議

1. 確認 DB 環境為開發 / staging DB
2. 確認 stores 表存在
3. 執行互動式 push，確認 diff 只有 seller_agent_settings
4. Push 後執行 integration test（GET/PATCH 真實 DB）
5. UI 施工：seller agent settings 管理頁面
