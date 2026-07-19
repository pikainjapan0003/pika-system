# Step 7E Active Preview Switch

## 1. 問題背景

上一輪 `UI-PREVIEW-PORT-FIX` 嘗試讓 worktree 的 Vite dev server 搶佔 port 22696，但使用者實測後，Replit Preview 選 `22696 → 3000` 仍然顯示舊版 UI：

- `/settings` 只有「店鋪設定」，沒有「AI 代查設定」
- `/settings/agent` 顯示 404
- 結論：port 搶佔未成功，使用者看到的仍是主 workspace 舊版

## 2. 使用者實測結果（觸發本輪）

| 項目                        | 結果        |
| --------------------------- | ----------- |
| `/settings` AI 代查設定卡片 | ❌ 不存在   |
| `/settings/agent`           | ❌ 404      |
| Replit Preview 22696→3000   | ❌ 仍是舊版 |

## 3. 改用主 workspace Active Preview Branch

**策略改變**：不再用 worktree 搶佔 port，而是直接把主 workspace 切換到 Step 7E UI branch。

主 workspace 的 preview process 由 Replit 統一管理，`22696 → 3000` 永遠連到主 workspace 的 port 22696。因此只要主 workspace checkout 到正確 branch 並啟動服務，使用者就能直接看到新版 UI。

### 流程

1. Stash 主 workspace 未 commit 的 tracked changes
2. 從 `qa/step7e-seller-agent-settings-ui` 建立新 branch
3. 主 workspace checkout 到新 branch
4. 停止舊的 shop-app process
5. 以 `API_SERVER_PORT=19080` 重啟 shop-app（19080 = worktree API server，已有 Step 7E routes）

## 4. Active Preview Branch

```
Branch:   qa/step7e-seller-agent-settings-active-preview
起點:     qa/step7e-seller-agent-settings-ui
HEAD:     3e82926  docs-step7e-seller-agent-settings-ui-preview-port-fix
```

包含的必要 commits：

- `6a8153a` feat-ui-step7e-seller-agent-settings ✅
- `b17403b` docs-step7e-seller-agent-settings-ui-review ✅
- `3e82926` docs-step7e-seller-agent-settings-ui-preview-port-fix ✅

## 5. 服務啟動

| 服務                       | Port  | 說明                                        |
| -------------------------- | ----- | ------------------------------------------- |
| shop-app (Vite dev server) | 22696 | 主 workspace active preview branch          |
| API server                 | 19080 | worktree step7e-ui API（含 Step 7E routes） |

shop-app 啟動指令：

```bash
PORT=22696 BASE_PATH=/ API_SERVER_PORT=19080 NODE_ENV=development \
  vite --config vite.config.ts --host 0.0.0.0 --port 22696
```

Vite proxy 設定（`vite.config.ts`）：

```typescript
proxy: {
  "/api": {
    target: `http://localhost:${process.env.API_SERVER_PORT ?? "8080"}`,
    changeOrigin: true,
  },
},
```

→ `API_SERVER_PORT=19080` 讓 proxy 打到 worktree API server

## 6. 驗證結果

| 驗收項目                              | 結果 | 說明                                           |
| ------------------------------------- | ---- | ---------------------------------------------- |
| `/settings/agent` 可回應              | ✅   | HTTP 200 (SPA fallback)                        |
| `AgentSettings.tsx` 存在              | ✅   | Vite 正常提供                                  |
| `Settings.tsx` 含「AI 代查設定」      | ✅   | `AgentSettingsEntry` + 「AI 代查設定」文字確認 |
| `/api/stores/1/agent/settings` 非 404 | ✅   | **HTTP 401** (Clerk auth 擋住，route 存在)     |
| 未修改 UI code                        | ✅   | 只做 branch 切換                               |
| 未修改 backend API                    | ✅   |                                                |
| 未 DB push / migrate / seed           | ✅   |                                                |
| 未 push GitHub                        | ✅   |                                                |

## 7. 使用者操作指示

請打開 Replit Preview：

```
22696 → 3000
```

然後進：

```
/settings
```

應該看到「AI 代查設定」卡片。

或直接進：

```
/settings/agent
```

## 8. 未執行項目

| 項目              | 原因                             |
| ----------------- | -------------------------------- |
| 瀏覽器 E2E 截圖   | 非本輪任務範疇，需使用者自行確認 |
| DB push / migrate | 明確禁止                         |
| GitHub push       | 明確禁止                         |
| pnpm install      | 明確禁止                         |

## 9. 風險與待確認

1. **API server on 19080 is worktree process**：worktree 的 API server (PID 74476) 從 11:08 開始運行，若 Replit session 重啟，需確認它是否自動重啟。
2. **主 workspace 已 stash tracked changes**：`qa/step6f-cvs-store-selection-browser-mobile` 的 modified files 已 stash，若需要恢復需 `git stash pop`。
3. **Replit Workflow 未更新**：`.replit` workflow 仍設定 `API_SERVER_PORT` 預設為 8080。若 Replit 重啟 workflow，shop-app 會重新以 port 8080 啟動，需要再次手動調整。

## 10. 下一步建議

1. 使用者開啟 `22696 → 3000` 確認 `/settings` 顯示「AI 代查設定」
2. 確認 `/settings/agent` 可進入並顯示設定表單
3. 若 Replit 重啟，需手動重新執行：
   ```bash
   cd /home/runner/workspace
   # 確認在 active preview branch
   git branch --show-current
   # 重啟 shop-app 指向 19080
   pkill -f 'artifacts/shop-app' 2>/dev/null; sleep 1
   PORT=22696 BASE_PATH=/ API_SERVER_PORT=19080 NODE_ENV=development \
     vite --config artifacts/shop-app/vite.config.ts --host 0.0.0.0 --port 22696 &
   ```
