# Step 7E-2-UI-PREVIEW-BOOT Seller Agent Settings UI 預覽啟動紀錄

## 1. 任務背景

Step 7E-2-UI-SMOKE-TEST（commit `f6eb311`）因環境限制無法執行 browser-based 測試。
本次任務從 `qa/step7e-seller-agent-settings-ui` worktree 啟動正確版本服務，讓使用者可以實際操作 `/settings/agent` 頁面。

## 2. UI Worktree / Branch

| 項目     | 值                                            |
| -------- | --------------------------------------------- |
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch   | `qa/step7e-seller-agent-settings-ui`          |

## 3. Reviewed Commits

| commit    | message                                                              |
| --------- | -------------------------------------------------------------------- |
| `6a8153a` | `feat-ui-step7e-seller-agent-settings`（UI 實作）                    |
| `b17403b` | `docs-step7e-seller-agent-settings-ui-review`（review 文件）         |
| `f6eb311` | `docs-step7e-seller-agent-settings-ui-smoke-test`（smoke test 文件） |

## 4. 啟動的服務

### 4-1. API Server（worktree，port 19080）

**原因**：main workspace API server（port 8080）不含 `sellerAgent.ts` routes；需從 worktree source 重新 build 並啟動。

**Build 步驟**：

1. 在 `worktree/artifacts/api-server/node_modules/` 建立 symlink 結構：
   - `@workspace/api-zod` → worktree `lib/api-zod`（含 sellerAgent schemas）
   - `@workspace/db` → worktree `lib/db`（含 sellerAgentSettings schema）
   - `esbuild-plugin-pino`, `esbuild`, `pino`, `pino-http`, `pino-pretty`, `thread-stream` → pnpm 虛擬 store
   - 其他 runtime packages 以 absolute symlink 指向 main workspace api-server/node_modules 的真實路徑
2. 在 `worktree/node_modules/` 建立必要 lib 依賴 symlinks：
   - `zod`, `drizzle-orm`, `pg`, `drizzle-zod` → pnpm 虛擬 store
3. 執行 `node build.mjs`（esbuild 打包，334ms）
4. 啟動：`PORT=19080 node --enable-source-maps ./dist/index.mjs`

**啟動指令**（背景執行）：

```bash
cd /home/runner/workspace/.worktrees/step7e-ui/artifacts/api-server
PORT=19080 node --enable-source-maps ./dist/index.mjs &
```

### 4-2. Shop-App（worktree，port 15173）

**原因**：main workspace shop-app（port 22696）不含 `AgentSettings.tsx`；需從 worktree source 啟動 vite dev。

**準備步驟**：

1. 建立 `worktree/artifacts/shop-app/node_modules` → main workspace `artifacts/shop-app/node_modules` symlink
   （main shop-app 的 `@workspace/api-client-react` 已指向 worktree `lib/api-client-react`）

**啟動指令**（背景執行）：

```bash
cd /home/runner/workspace/.worktrees/step7e-ui/artifacts/shop-app
PORT=15173 BASE_PATH=/ API_SERVER_PORT=19080 NODE_ENV=development \
  /home/runner/workspace/artifacts/shop-app/node_modules/.bin/vite \
  --config vite.config.ts --host 0.0.0.0 &
```

## 5. 使用 Port

| 服務                    | port（local） | externalPort（.replit） |
| ----------------------- | ------------- | ----------------------- |
| Worktree API server     | 19080         | 8000                    |
| Worktree shop-app       | 15173         | 8008                    |
| Main API server（不變） | 8080          | 80                      |
| Main shop-app（不變）   | 22696         | 3000                    |

## 6. API Route 檢查結果

```bash
curl -i http://localhost:19080/api/stores/1/agent/settings
# HTTP/1.1 401 Unauthorized
# x-clerk-auth-reason: dev-browser-missing
# → route 已存在，需 Clerk session token
```

| 項目                       | 結果                          |
| -------------------------- | ----------------------------- |
| 是否為 404 route not found | ❌ 不是（回 401）             |
| Route 已正確載入           | ✅                            |
| 需 Auth                    | ✅（正常，Clerk requireAuth） |

## 7. Shop Route 檢查結果

```bash
curl -I http://localhost:15173/settings/agent
# HTTP/1.1 200 OK
# Content-Type: text/html
```

```bash
curl -s http://localhost:15173/src/pages/AgentSettings.tsx | head -3
# 確認回傳 AgentSettings.tsx source，來源路徑：
# /home/runner/workspace/.worktrees/step7e-ui/artifacts/shop-app/src/pages/AgentSettings.tsx
```

```bash
curl -I http://localhost:15173/api/stores/1/agent/settings
# HTTP/1.1 401 Unauthorized（via vite proxy → port 19080）
# → proxy 已正確轉發至 worktree API server
```

| 項目                                     | 結果 |
| ---------------------------------------- | ---- |
| `/settings/agent` 回 200                 | ✅   |
| `AgentSettings.tsx` 來自 worktree source | ✅   |
| `/api` proxy 轉發至 port 19080           | ✅   |

## 8. Preview URL

| 項目                         | 值                                      |
| ---------------------------- | --------------------------------------- |
| Worktree shop-app（local）   | `http://localhost:15173/settings/agent` |
| .replit externalPort 8008    | Replit webview port 8008                |
| Worktree API server（local） | `http://localhost:19080/api/...`        |
| .replit externalPort 8000    | Replit API port 8000                    |

> **注意**：worktree 服務需 Clerk session token。在 browser 中開啟 `http://localhost:15173/settings/agent`（或對應 Replit preview URL），並以已登入的 Clerk session 訪問，才能看到 AI 代查設定頁面。

## 9. 是否有 Blocking Bug

**無 blocking bug。**
Build 成功、服務啟動成功、route 正確載入。

## 10. Cleanup / Restore

**暫時建立的 symlink**（非 git tracked，不影響 commit）：

- `worktree/artifacts/api-server/node_modules/`（新建目錄，含 symlinks）
- `worktree/node_modules/`（新建目錄，含 symlinks）
- `worktree/artifacts/shop-app/node_modules`（symlink）
- `worktree/artifacts/api-server/dist/`（build 產出）

這些均在 `.gitignore` 或是 runtime 暫存，不會被 commit。

## 11. 未執行項目

| 項目                         | 狀態                        |
| ---------------------------- | --------------------------- |
| 修改 UI code                 | 未執行（僅啟動服務）        |
| 修改 backend API             | 未執行                      |
| DB push / migrate / seed     | 未執行                      |
| push GitHub                  | 未執行                      |
| 修改 package.json / lockfile | 未執行                      |
| 安裝依賴（pnpm install）     | 未執行（使用 symlink 方式） |

## 12. 風險與待確認

1. **Worktree 服務為手動啟動**：Replit session 重啟後需重新執行啟動指令
2. **Build 產物放在 worktree**：`dist/` 不在 main workspace，不影響 git
3. **Clerk auth**：browser smoke test 需使用已登入的 Clerk session

## 13. 下一步建議

**Step 7E-2-UI-SMOKE-TEST（重新執行）**：

1. 在 browser 中開啟 `http://localhost:15173/settings/agent`（或 externalPort 8008）
2. 以 Clerk session 登入
3. 驗證 GET 資料載入、PATCH 儲存、Webhook Secret 更換/清除、toast 顯示
4. 完成後進入 Step 7E-2-FINAL-REVIEW

若 Replit session 重啟後服務消失，請重新執行 Section 4 的啟動指令。
