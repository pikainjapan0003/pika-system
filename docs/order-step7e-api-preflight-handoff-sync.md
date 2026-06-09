# Step 7E-1b-API-PREFLIGHT 主 Workspace 同步文件

## 1. 任務背景

- 任務名稱：Step 7E-1b-API-PREFLIGHT
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：盤點 `GET/PATCH seller_agent_settings` API 施工前條件，不實作 API

## 2. Preflight Worktree / Branch

| 項目 | 值 |
|------|---|
| worktree | `/home/runner/workspace/.worktrees/step7e-code-restore` |
| branch | `qa/step7e-seller-agent-settings-code-restore` |
| 起始 commit | `437d7e9`（typecheck doc）|

## 3. Preflight Commit

| 項目 | 值 |
|------|---|
| commit hash | `c71616a` |
| commit message | `docs-step7e-seller-agent-settings-api-preflight` |
| staged 檔案 | `docs/order-step7e-seller-agent-settings-api-preflight.md` |
| 是否 push | 否 |

## 4. 同步到 dev-handoff 的內容

已更新主 workspace：
- `dev-handoff/latest-B.json`：taskTitle = `Step 7E-1b-API-PREFLIGHT：seller_agent_settings GET/PATCH API 施工前盤點`
- `dev-handoff/latest-B.md`
- `dev-handoff/latest.json`（relay copy）

### 關鍵 preflight 結論

| 問題 | 結論 |
|------|------|
| 建議 API URL | `GET/PATCH /stores/:storeId/agent/settings` |
| Auth middleware | `requireAuth`（Clerk session，不可用 Agent Bearer）|
| Store ownership 驗證 | `verifyStoreOwner(req, res, storeId)`（現有 helper）|
| merchantId 來源 | `req.userId`（Clerk userId = merchantId）|
| GET 無 row 時 | 回傳 in-memory default config，不建立 DB row |
| PATCH 策略 | upsert（INSERT ... ON CONFLICT DO UPDATE）|
| webhookSecretHash | 永遠不進 response，改為 `hasWebhookSecret: boolean` |
| webhookSecret PATCH | 接受明文，server SHA-256 hash 後存 |
| 白名單驗證位置 | API 層 zod schema（`z.enum()`），非 DB CHECK |
| DB push 前提 | 需先執行 `drizzle-kit push` 或 migration |

## 5. 未執行項目

- 未施工 API（route 未修改）
- 未 DB push
- 未 migrate
- 未施工 UI
- 未修改 schema
- 未修改 migration
- 未 push

## 6. 風險與待確認

- `seller_agent_settings` table 尚未建立於 DB，API 寫完後需決定何時 DB push
- `0001_seller_agent_settings.sql` 為手寫 DDL，可能與 drizzle-kit journal 編號衝突
- `platform_managed_reserved` agentMode 是保留值，PATCH 是否拒絕需確認

## 7. 下一步建議

- Step 7E-1b-API-IMPL：建立 `artifacts/api-server/src/routes/sellerAgent.ts`
- 實作 GET（含 default fallback）+ PATCH（含 upsert + webhookSecret hash）
- 更新 `routes/index.ts` 引入新 router
- DB push 後執行 integration test
