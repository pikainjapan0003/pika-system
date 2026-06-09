# Step 7E-2-UI-PREVIEW-PORT-FIX Handoff Sync

## 1. 問題背景

上一輪 Preview Boot 啟動了 worktree shop-app on port 15173，但使用者 Replit panel 沒有顯示 8008 port，看到的仍是主 workspace 舊服務（port 22696 → 「店鋪設定」無 AI 代查設定卡片）。

## 2. UI Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |

## 3. Preview Port Fix Commit

| commit | message |
|--------|---------|
| `3e82926` | `docs-step7e-seller-agent-settings-ui-preview-port-fix` |

## 4. 最終服務 Port

| 服務 | port（local） | externalPort（.replit） |
|------|------|------|
| Worktree API server | 19080 | 8000 |
| Worktree shop-app | **22696** | **3000** |

## 5. 驗證結果

| 項目 | 結果 |
|------|------|
| `/settings/agent` | HTTP 200 OK ✅ |
| `AgentSettings.tsx` 來自 worktree | ✅ |
| `Settings.tsx` 含 AI 代查設定入口 | ✅ |
| `/api/stores/1/agent/settings` | HTTP 401（非 404）✅ |

## 6. 使用者下一步操作

**請在 Replit Preview panel 選 `22696 → 3000`**，再訪問 `/settings/agent`。

## 7. 未執行項目

- 修改 UI code、backend API、DB push/migrate/seed、push GitHub：均未執行

## 8. 風險與待確認

1. **服務持久性**：worktree shop-app（PID 90028）手動啟動，session 重啟後需重新執行
2. Replit process manager 可能重啟主 workspace shop-app，導致 port 22696 被搶回
3. Clerk auth 需 browser session
