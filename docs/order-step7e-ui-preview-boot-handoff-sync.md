# Step 7E-2-UI-PREVIEW-BOOT Handoff Sync

## 1. 任務背景

Step 7E-2-UI-SMOKE-TEST 因環境限制無法執行完整 browser-based 測試。
本次從 `qa/step7e-seller-agent-settings-ui` worktree 啟動正確版本服務（API server + shop-app），讓使用者可以實際操作 `/settings/agent` 頁面。

## 2. UI Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |

## 3. Preview Boot Commit

| commit | message |
|--------|---------|
| `fe15a55` | `docs-step7e-seller-agent-settings-ui-preview-boot` |

## 4. 啟動服務與 Port

| 服務 | port（local） | externalPort（.replit） |
|------|------|------|
| Worktree API server（含 sellerAgent routes） | 19080 | 8000 |
| Worktree shop-app（含 AgentSettings.tsx） | 15173 | 8008 |

## 5. API Route 檢查結果

```bash
curl -i http://localhost:19080/api/stores/1/agent/settings
# HTTP/1.1 401 Unauthorized（非 404 - route 已正確載入）
```

| 項目 | 結果 |
|------|------|
| 不再是 404 | ✅ |
| 需要 Clerk auth | ✅（正常） |

## 6. Shop Route 檢查結果

```bash
curl -I http://localhost:15173/settings/agent
# HTTP/1.1 200 OK
```

```bash
curl -s http://localhost:15173/src/pages/AgentSettings.tsx | head -1
# import __vite__cjsImport0_react_jsxDevRuntime ... (worktree source 確認)
```

| 項目 | 結果 |
|------|------|
| `/settings/agent` 回 200 | ✅ |
| `AgentSettings.tsx` 來自 worktree | ✅ |
| `/api` proxy 轉發至 port 19080 | ✅ |

## 7. Preview URL

| 項目 | 值 |
|------|-----|
| Worktree shop-app（local） | `http://localhost:15173/settings/agent` |
| .replit externalPort 8008 | Replit webview port 8008 |

> 需在 browser 以 Clerk session 訪問，才能實際測試 AI 代查設定頁面。

## 8. 下一步建議：Browser Smoke Test

由使用者手動執行：
1. 開啟 `http://localhost:15173/settings/agent`（或 Replit port 8008）
2. 以 Clerk session 登入
3. 驗證以下功能：
   - GET settings（有 store 時載入設定）
   - 無 row 時顯示 default config
   - 修改設定後 PATCH 儲存
   - toast 成功顯示
   - 重載後資料仍存在
   - Webhook Secret 更換 / 清除
   - PATCH 不送 forbidden fields（network tab 驗證）
4. 如有 bug，回報後進行 Step 7E-2-UI-FIX
5. 無 bug，進入 Step 7E-2-FINAL-REVIEW

## 9. 注意事項

- Worktree 服務為手動啟動，Replit session 重啟後需重新執行
- Build 產出在 `worktree/artifacts/api-server/dist/`（不影響 git）
- 暫時 symlink 在 `worktree/node_modules/` 和 `worktree/artifacts/*/node_modules`（不影響 git）
