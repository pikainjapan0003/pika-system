# Step 7E-2-MERGE-PREP Seller Agent Settings 合併前盤點

## 任務背景

Step 7E Seller Agent Settings 已通過 final review（PASS）。
本文件為合併前的盤點報告，不執行實際 merge。

Final review branch：`qa/step7e-seller-agent-settings-final-review`
Final review commit：`985424f`

## Current Main Workspace Branch

```
qa/step6f-cvs-store-selection-browser-mobile
```

### 主 workspace unstaged files（不清理、不 stage）

```
M .replit
M artifacts/shop-app/src/lib/printHelpers.ts
M artifacts/shop-app/src/pages/EditOrderDialog.tsx
M artifacts/shop-app/tsconfig.json
M artifacts/shop-app/vite.config.ts
```

## Target Branch Candidate

```
qa/step6f-cvs-store-selection-browser-mobile
```

> **Target branch pending user confirmation**

## Source Branch

```
qa/step7e-seller-agent-settings-final-review
HEAD: 985424f
```

## Merge Base

```
cf799c6eef549310f6850fb1ebadaabae78fbf53
```

## Step 7E Branches / Commits 盤點

### Step 7E Branches

| Branch | HEAD |
|--------|------|
| `qa/step7e-seller-agent-settings-code-restore` | `c71616a` |
| `qa/step7e-seller-agent-settings-api` | `5a62b9b` |
| `qa/step7e-seller-agent-settings-ui` | `3e82926` |
| `qa/step7e-seller-agent-settings-active-preview` | `758e918` |
| `qa/step7e-seller-agent-settings-final-review` | `985424f` |

### Step 7E Required Commits（全部驗證通過）

| Commit | 說明 | 存在於 final-review |
|--------|------|---------------------|
| `626b399` | feat-db-step7e-seller-agent-settings-schema | ✓ |
| `dc75672` | feat-api-step7e-seller-agent-settings | ✓ |
| `c73a68f` | test-api-step7e-seller-agent-settings | ✓ |
| `793a17f` | docs-step7e-seller-agent-settings-db-push | ✓ |
| `5a62b9b` | test-api-step7e-seller-agent-settings-integration | ✓ |
| `68659ce` | feat-client-step7e-seller-agent-settings-api | ✓ |
| `6a8153a` | feat-ui-step7e-seller-agent-settings | ✓ |
| `758e918` | docs-step7e-browser-smoke-closeout | ✓ |
| `985424f` | docs-step7e-seller-agent-settings-final-review | ✓ |

### Test Evidence（來自 final review）

- DB schema typecheck：0 errors
- API mock tests：45 pass / 0 fail
- API integration tests：25 pass / 0 fail
- typecheck:libs：0 errors
- UI typecheck：0 errors
- vite build：success
- UI review：PASS
- Browser smoke test：PASS
- DB cleanup：remaining_rows = 0

## Diff Summary

Source → Target（自 merge-base `cf799c6` 起）：

- Commits in source not in target：22 commits
- Files changed：97 files
- Insertions：16,775 lines
- Deletions：89 lines

## Changed Files by Category

### A. DB / Schema

| 檔案 | 狀態 | 說明 |
|------|------|------|
| `lib/db/migrations/0001_seller_agent_settings.sql` | A | DB migration（Step 7E 新增） |
| `lib/db/src/schema/agentRunLogs.ts` | A | Step 7D 相關 |
| `lib/db/src/schema/sellerAgentSettings.ts` | A | Step 7E 核心 schema |
| `lib/db/src/schema/sellerAgentTokens.ts` | A | Step 7D 相關 |
| `lib/db/src/schema/shipmentTrackingEvents.ts` | A | Step 7C 相關 |
| `lib/db/src/schema/shipmentTrackings.ts` | A | Step 7C 相關 |
| `lib/db/src/schema/index.ts` | M | ⚠️ OVERLAP 風險 |
| `lib/db/src/schema/orders.ts` | M | ⚠️ OVERLAP 風險 |

### B. API Server

| 檔案 | 狀態 | 說明 |
|------|------|------|
| `artifacts/api-server/src/middlewares/agentAuth.ts` | A | Step 7D agent auth |
| `artifacts/api-server/src/routes/agent.ts` | A | Step 7D agent routes |
| `artifacts/api-server/src/routes/agent.route.test.mjs` | A | Step 7D agent tests |
| `artifacts/api-server/src/routes/agent.integration.test.mjs` | A | Step 7D integration |
| `artifacts/api-server/src/routes/sellerAgent.ts` | A | Step 7E seller agent |
| `artifacts/api-server/src/routes/sellerAgent.route.test.mjs` | A | Step 7E tests |
| `artifacts/api-server/src/routes/sellerAgent.integration.test.mjs` | A | Step 7E integration |
| `artifacts/api-server/src/routes/index.ts` | M | router registration |
| `artifacts/api-server/src/routes/orders.ts` | M | ⚠️ HIGH RISK OVERLAP |
| `artifacts/api-server/src/routes/orders.route.test.mjs` | M | ⚠️ HIGH RISK OVERLAP |

### C. OpenAPI / Generated Client

| 檔案 | 狀態 | 說明 |
|------|------|------|
| `lib/api-spec/openapi.yaml` | M | ⚠️ HIGH RISK OVERLAP |
| `lib/api-client-react/src/generated/api.schemas.ts` | M | ⚠️ OVERLAP 風險 |
| `lib/api-client-react/src/generated/api.ts` | M | source only |
| `lib/api-zod/src/generated/api.ts` | M | ⚠️ OVERLAP 風險 |
| `lib/api-zod/src/generated/types/index.ts` | M | ⚠️ OVERLAP 風險 |
| `lib/api-zod/src/generated/types/order.ts` | M | ⚠️ OVERLAP 風險 |
| `lib/api-zod/src/generated/types/orderUpdate.ts` | M | ⚠️ OVERLAP 風險 |
| `lib/api-zod/src/generated/types/orderUpdateStoreSelectedBy.ts` | A/A | 兩側均新增，需確認內容 |
| 其餘 `lib/api-zod/src/generated/types/*.ts` | M | generated，OVERLAP 風險 |
| Step 7E 新增 types（sellerAgentSettings*, updateSellerAgentSettings*） | A | source only |

### D. UI App

| 檔案 | 狀態 | 說明 |
|------|------|------|
| `artifacts/shop-app/src/pages/AgentSettings.tsx` | A | Step 7E 核心 UI |
| `artifacts/shop-app/src/App.tsx` | M | ⚠️ OVERLAP 風險 |
| `artifacts/shop-app/src/pages/EditOrderDialog.tsx` | M | ⚠️ HIGH RISK + unstaged in workspace |
| `artifacts/shop-app/src/pages/Orders.tsx` | M | ⚠️ OVERLAP 風險 |
| `artifacts/shop-app/src/pages/Settings.tsx` | M | source only |

### E. Docs

47 個 docs 新增（step7b, step7c, step7d, step7e）。

3 個 docs 在 target 和 source 均有新增（OVERLAP，需確認內容是否相同）：
- `docs/order-step7c-schema-migration-implementation-audit.md`
- `docs/order-step7c-shipment-tracking-model-spec.md`
- `docs/order-step7d-agent-api-route-implementation-audit.md`

### F. dev-handoff（應排除）

`dev-handoff/` 已在 `.gitignore`，不應進入 merge commit。

### G. `.replit`

`.replit` **不在** Step 7E source diff。
`.replit` 是主 workspace 的既有 unstaged 修改，不屬於 Step 7E merge commit。

## Conflict Risk 衝突風險

### 高風險（需人工解決）

| 檔案 | 原因 |
|------|------|
| `artifacts/api-server/src/routes/orders.ts` | 兩側均修改 orders 路由邏輯 |
| `artifacts/api-server/src/routes/orders.route.test.mjs` | 兩側均修改 orders 測試 |
| `artifacts/shop-app/src/pages/EditOrderDialog.tsx` | 兩側均修改，且主 workspace 有 unstaged changes |
| `lib/api-spec/openapi.yaml` | 兩側均修改 OpenAPI spec |
| `lib/api-client-react/src/generated/api.schemas.ts` | 兩側均修改 generated schemas |

### 中風險（generated 或較小修改）

- `artifacts/shop-app/src/App.tsx`
- `artifacts/shop-app/src/pages/Orders.tsx`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/order.ts`
- `lib/api-zod/src/generated/types/orderUpdate.ts`
- `lib/db/src/schema/orders.ts`
- `lib/db/src/schema/index.ts`
- 多個 `lib/api-zod/src/generated/types/*.ts`

### 低風險

- `docs/order-step7c-*.md`、`docs/order-step7d-*.md`（docs，可能內容相同）

### 重要：Unstaged Changes 風險

主 workspace 有 unstaged changes：
- `artifacts/shop-app/src/pages/EditOrderDialog.tsx` ← 也在 source diff，merge 前需先 commit 或 stash
- `artifacts/shop-app/src/lib/printHelpers.ts`
- `artifacts/shop-app/tsconfig.json`
- `artifacts/shop-app/vite.config.ts`
- `.replit`

**merge 前必須先處理這些 unstaged changes，否則 merge 可能失敗或造成 changes 遺失。**

## `.replit` 狀態

```
 M .replit
```

`.replit` 有以下 unstaged 修改：
```diff
+[[ports]]
+localPort = 15173
+externalPort = 8008
+
+[[ports]]
+localPort = 19080
+externalPort = 8000
```

結論：
- `.replit` **不在** Step 7E source diff
- `.replit` 是主 workspace 既有 unstaged 修改
- **不應**被 stage 或包含在 merge commit 中
- merge 後 port 設定需獨立評估（Step 7E 曾使用 API port 19080）

## DB Table / Cleanup 狀態

| 項目 | 狀態 |
|------|------|
| `seller_agent_settings` table 存在 | ✓ 存在 |
| `remaining_rows` (store_id=1) | 0（smoke cleanup 已完成）|
| 本次 DB push / migrate / seed | 未執行 |

## Merge Strategy 分析

### 選項一：Merge Commit（適合保留 audit trail）

```bash
git merge qa/step7e-seller-agent-settings-final-review
```

- **優點**：保留 Step 7E 完整 commit history（schema → API → test → UI → smoke → final-review）
- **缺點**：主線多 22+ commits，其中有許多 docs commits
- **建議情境**：有完整 audit trail 需求

### 選項二：Squash Merge（不建議）

```bash
git merge --squash qa/step7e-seller-agent-settings-final-review
```

- **優點**：主線只有 1 個 commit
- **缺點**：失去 schema → API → UI 的階段性記錄
- **不建議**：Step 7E 有完整 final review 記錄，audit trail 有保存價值

### 選項三：Cherry-pick Curated Commits（適合只帶 code）

只 cherry-pick code commits，跳過 docs-only commits：

```
626b399  feat-db-step7e-seller-agent-settings-schema
dc75672  feat-api-step7e-seller-agent-settings
c73a68f  test-api-step7e-seller-agent-settings
5a62b9b  test-api-step7e-seller-agent-settings-integration
68659ce  feat-client-step7e-seller-agent-settings-api
6a8153a  feat-ui-step7e-seller-agent-settings
```

- **優點**：主線較乾淨，保留主要 code 歷史
- **缺點**：需解決每個 commit 的衝突；generated files 可能漏帶；DB push 文件 `793a17f` 是 docs-only 但有 audit 價值

**推薦**：**Merge Commit**，若 target 為 `qa/step6f-cvs-store-selection-browser-mobile`。
若主線 commit 數過多，可考慮 cherry-pick curated commits（只帶 code + `793a17f` DB push）。
不建議手動複製檔案。

## Recommended Next Action

1. **使用者確認 target branch**（是否為 `qa/step6f-cvs-store-selection-browser-mobile`）
2. 處理主 workspace unstaged changes：
   - `artifacts/shop-app/src/pages/EditOrderDialog.tsx` → commit 或 stash（merge 前必須）
   - 其他 unstaged 檔案 → 視情況 commit 或 stash
3. 確認 merge strategy（建議 merge commit）
4. 執行 merge
5. 預期需要人工解決至少 5 個高風險衝突檔案
6. 解決衝突後重新執行：typecheck + vite build

## Blocking Issues

1. **Target branch 尚未確認**（pending user confirmation）
2. **主 workspace 有 unstaged changes**（特別是 `EditOrderDialog.tsx`，與 source 衝突）

## Non-blocking Notes

- `.replit` port 設定（15173→8008, 19080→8000）在 merge 後需獨立評估
- docs 重疊（3 個 docs）通常不會造成程式衝突，merge 時可能需要手動確認
- `lib/api-zod/src/generated/types/orderUpdateStoreSelectedBy.ts` 兩側均新增，需確認內容是否相同

## 未執行項目

- 未實際 merge
- 未 git rebase / cherry-pick
- 未 DB push / migrate / seed
- 未 push GitHub
- 未修改 `.replit`
- 未 stage `dev-handoff/`
- 未 stage `.claude/`

## 風險與待確認

| 優先級 | 項目 |
|--------|------|
| 高 | 使用者確認 target branch |
| 高 | `artifacts/api-server/src/routes/orders.ts` 兩側均修改，需 review |
| 高 | `artifacts/shop-app/src/pages/EditOrderDialog.tsx` 主 workspace 有 unstaged changes |
| 高 | `lib/api-spec/openapi.yaml` 兩側均修改 |
| 中 | Generated files 可能需要 merge 後重新 codegen |
| 低 | `.replit` port 設定需 merge 後獨立處理 |

---

## MERGE-PREP Conclusion

```
MERGE-PREP conclusion: pending target branch confirmation
```

Step 7E Seller Agent Settings 已通過 final review，技術上可進行 merge。
但因有多個高風險衝突檔案，且主 workspace 有 unstaged changes，
**必須先由使用者確認 target branch，並處理 unstaged changes 後，再執行 merge。**

---

*Generated by Claude B — Step 7E-2-MERGE-PREP — 2026-06-09*
