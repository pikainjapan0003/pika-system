# Step 7E-2-UI-PREVIEW-PORT-FIX Seller Agent Settings UI 預覽 Port 修正紀錄

## 1. 問題背景

Step 7E-2-UI-PREVIEW-BOOT 將 worktree shop-app 啟動於 port 15173（.replit externalPort 8008），但：

- 使用者截圖顯示 Replit Preview panel 只有：`8081→8081`, `8080→80`, `22696→3000`, `8082→4200`
- 沒有 `15173 → 8008`
- 使用者打開 `/settings` 看到的仍是主 workspace 舊「店鋪設定」，沒有「AI 代查設定」卡片

根本原因：

1. 主 workspace shop-app 仍在 port 22696 執行（使用者看到的就是這個）
2. 上一輪 worktree shop-app (15173) 在 Replit session 重啟後已停止
3. 使用者 Replit Preview panel 顯示的 port 22696 對應的是舊主 workspace 服務

## 2. Port / Process 盤點結果

| Port  | PID   | CWD                                                                | 服務                                       |
| ----- | ----- | ------------------------------------------------------------------ | ------------------------------------------ |
| 8080  | 79632 | `/home/runner/workspace/artifacts/api-server`                      | 主 workspace API server（有 restart loop） |
| 22696 | 79450 | `/home/runner/workspace/artifacts/shop-app`                        | 主 workspace shop-app vite（**目標停止**） |
| 8081  | 324   | `/home/runner/workspace/artifacts/mockup-sandbox`                  | mockup-sandbox（舊 session）               |
| 8082  | 79457 | `/home/runner/workspace/artifacts/mockup-sandbox`                  | mockup-sandbox（新 session）               |
| 19080 | 74476 | `/home/runner/workspace/.worktrees/step7e-ui/artifacts/api-server` | **Worktree API server ✅ 仍活著**          |
| 15173 | —     | —                                                                  | 上一輪 worktree shop-app（已停止）         |

## 3. 停止了哪些舊 Process

| PID   | 服務                                                | 動作                                                 |
| ----- | --------------------------------------------------- | ---------------------------------------------------- |
| 79387 | pnpm --filter @workspace/shop-app run dev（parent） | `kill 79387`                                         |
| 79449 | sh -c vite（中間層）                                | `kill 79449`                                         |
| 79450 | main workspace vite（port 22696）                   | `kill -9 79450`（前兩個 kill 後仍佔 port，強制停止） |

**不動**：

- PID 79632（主 workspace API server，port 8080）：有 restart loop，不影響，保留
- PID 74476（worktree API server，port 19080）：保留
- 所有 mockup-sandbox 和 DB 相關 process

## 4. 啟動了哪些 Worktree Service

### Worktree API Server（port 19080）

**已在上一輪 session 啟動，本次直接沿用。**

| 項目     | 值                                                                 |
| -------- | ------------------------------------------------------------------ |
| 啟動指令 | `PORT=19080 node --enable-source-maps ./dist/index.mjs`            |
| CWD      | `/home/runner/workspace/.worktrees/step7e-ui/artifacts/api-server` |
| PID      | 74476                                                              |
| 狀態     | ✅ 仍在執行                                                        |

### Worktree Shop-App（port 22696）

**本次新啟動，替換主 workspace 服務。**

| 項目     | 值                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 啟動指令 | `PORT=22696 BASE_PATH=/ API_SERVER_PORT=19080 NODE_ENV=development /home/runner/workspace/artifacts/shop-app/node_modules/.bin/vite --config vite.config.ts --host 0.0.0.0` |
| CWD      | `/home/runner/workspace/.worktrees/step7e-ui/artifacts/shop-app`                                                                                                            |
| PID      | 90028                                                                                                                                                                       |
| 狀態     | ✅ 執行中                                                                                                                                                                   |

## 5. 最終使用 Port

| 服務                | port（local） | externalPort（.replit） |
| ------------------- | ------------- | ----------------------- |
| Worktree API server | 19080         | 8000                    |
| Worktree shop-app   | **22696**     | **3000**                |

## 6. 驗證結果

| 項目                           | 指令                                                               | 結果                                                          |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/settings/agent`              | `curl -I http://localhost:22696/settings/agent`                    | **HTTP 200 OK** ✅                                            |
| `AgentSettings.tsx`            | `curl -s http://localhost:22696/src/pages/AgentSettings.tsx`       | **worktree source 確認** ✅                                   |
| `Settings.tsx`                 | `curl -s http://localhost:22696/src/pages/Settings.tsx \| grep AI` | **含「AI 代查設定」、AgentSettingsEntry、/settings/agent** ✅ |
| `/api/stores/1/agent/settings` | `curl -i http://localhost:22696/api/stores/1/agent/settings`       | **HTTP 401（非 404）** ✅                                     |

## 7. 使用者操作指示

**請在 Replit Preview panel 選：`22696 → 3000`**

然後在 URL 列輸入：

```
/settings/agent
```

或直接打開「設定」頁面（`/settings`），點選「AI 代查設定」卡片。

> 注意：需以 Clerk session 登入後才能看到設定頁面內容。若看到 loading 或 error，請確認已登入。

## 8. 未執行項目

| 項目                                                       | 狀態   |
| ---------------------------------------------------------- | ------ |
| 修改 UI code（AgentSettings.tsx / App.tsx / Settings.tsx） | 未執行 |
| 修改 backend API                                           | 未執行 |
| DB push / migrate / seed                                   | 未執行 |
| push GitHub                                                | 未執行 |
| pnpm install / npm install                                 | 未執行 |
| 修改 package.json / lockfile                               | 未執行 |

## 9. 風險與待確認

1. **服務持久性**：worktree shop-app（PID 90028）為手動啟動，若 Replit session 重啟後服務消失，需重新執行啟動指令
2. **Replit 可能嘗試重啟主 workspace shop-app**：若 Replit process manager 偵測到 shop-app task 結束並重啟，port 22696 可能被搶回。若發生，需再次重複停止主服務並啟動 worktree 服務。
3. **Clerk auth**：browser smoke test 需使用已登入的 Clerk session

## 10. 下一步建議

**使用者執行 Browser Smoke Test**：

1. 在 Replit Preview 選 `22696 → 3000`
2. 以 Clerk session 登入
3. 訪問 `/settings` → 點「AI 代查設定」卡片 → 驗證 `/settings/agent` 頁面
4. 驗證：GET 資料載入、修改設定後 PATCH 儲存、toast 顯示、Webhook Secret 更換/清除
5. 無 bug → Step 7E-2-FINAL-REVIEW

若服務消失，重新執行：

```bash
# Step 1: 停止主 workspace shop-app（若已重啟）
PVID=$(ps aux | grep 'artifacts/shop-app.*vite' | grep -v grep | grep -v worktrees | awk '{print $2}' | head -1)
[ -n "$PVID" ] && kill -9 "$PVID"

# Step 2: 啟動 worktree shop-app
cd /home/runner/workspace/.worktrees/step7e-ui/artifacts/shop-app
PORT=22696 BASE_PATH=/ API_SERVER_PORT=19080 NODE_ENV=development \
  /home/runner/workspace/artifacts/shop-app/node_modules/.bin/vite \
  --config vite.config.ts --host 0.0.0.0 &

# Step 3: 確認 worktree API server 仍活著（若停了需重啟）
curl -si http://localhost:19080/api/stores/1/agent/settings | head -2
# 若 connection refused，重啟：
# cd /home/runner/workspace/.worktrees/step7e-ui/artifacts/api-server
# PORT=19080 node --enable-source-maps ./dist/index.mjs &
```
