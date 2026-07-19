# Windows 本機 build 解鎖選項

日期：2026-07-20  
性質：唯讀研究／決策題卡；本報告不修改依賴、lockfile、CI 或 build 設定。

## 1. 現況與根因

目前 workspace 明確以 Replit／Linux x64 為部署目標。`pnpm-workspace.yaml` 的 `overrides` 排除了 Windows 對應的原生套件，包含：

- `@esbuild/win32-*`
- `lightningcss-win32-*-msvc`
- `@tailwindcss/oxide-win32-*-msvc`
- `@rollup/rollup-win32-*`

因此 Windows 可以執行 TypeScript typecheck、Node 純測試與 jsdom component 測試，但 Vite dev/build 或依賴其原生 binary 的本機流程不保證可用。這是目前設定的直接結果，不是商品／訂單功能缺陷。

既有證據：

- `docs/ai-ops/25-provider-test-feasibility.md`：記錄 Windows 工作區因 Linux-only Rollup 原生件，無法穩定啟動 Vite。
- `docs/ai-ops/27-batch12-e2e-skill-visibility-harness.md`：記錄 Windows→Docker 長命令轉交未取得 Playwright 結果。
- `docs/ai-ops/28-batch13-report.md`、`31-batch14-report.md`：再次確認本機容器 harness 未能形成可信 E2E 證據。
- BATCH-15 已另建手動 GitHub Actions Pending E2E，讓 Linux runner 承擔尚未納入主 CI 的四條 spec。

## 2. 選項比較

| 選項                                   | 作法                                                                                                          | 優點                                                                             | 代價／風險                                                                                               | 適用時機                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A. 恢復 Windows 原生依賴               | 從 overrides 移除 Windows 的 esbuild／Rollup／Lightning CSS／Oxide 排除項，重新產生並驗證 lockfile            | Windows 可直接跑 Vite、build 與 Playwright；除錯路徑最直覺                       | lockfile 與安裝集合擴大；需同時驗 Windows 與 Linux/Replit；可能改變既有供應鏈與原生套件選擇；不是小修    | 確定 Windows 本機前端開發是長期核心需求，且有人負責雙平台驗證 |
| **B. 維持 Linux-only，測試移到 Linux** | 不動 overrides；Windows 只跑 typecheck、純測試、jsdom；Vite/build/E2E 由 GitHub Actions 或標準 Linux 環境執行 | **變更最小、最符合正式部署環境、既有 CI 已證實可用；不增加 production 依賴風險** | 本機無法即時看完整 Vite/E2E；失敗要到 Actions 取 log/artifact；手動 Pending workflow 仍需觸發            | **目前建議；專案正式環境仍是 Replit/Linux 時**                |
| C. 建立固定 Linux 開發環境             | 提供受版本控制的 devcontainer／WSL 腳本或短命 Docker compose，把 pnpm install、Vite、Playwright 全放進 Linux  | 開發與 CI／Replit一致；可在本機取得完整結果                                      | 初期維護成本最高；Windows、WSL、Docker 掛載與 port 行為仍需治理；先前 harness 失敗顯示不可再靠臨時長命令 | 團隊擴大、需要每天本機跑完整 E2E，且願意維護正式開發容器時    |

## 3. 建議

建議採 **B：維持 Linux-only，讓 GitHub Actions／標準 Linux runner 負責 build 與 E2E**。

理由：

1. production 是 Replit/Linux，Linux 驗證最接近真實環境。
2. 主 CI 已涵蓋 typecheck、build、純測試、DB route tests 與既有 E2E；BATCH-15 的手動 Pending E2E 可承接四條待驗 spec。
3. 本批新 asset loader 與 jsdom component tests 已讓 Windows 能驗證主要 UI 邏輯，不必為少數 Vite 流程擴張跨平台原生依賴面。
4. A／C 都是基建決策，不應在功能批次內順手更改。

## 4. 採 B 的操作邊界

- Windows 可作為可信證據：`typecheck`、Node 純測試、jsdom component tests、Prettier。
- Linux 才作為可信證據：Vite build、Playwright、依賴 Linux 原生 binary 的完整流程。
- Pending E2E 只有在手動 workflow 真正出現 Playwright pass 原文後，才能從 pending 升為已驗證；`--list` 僅證明可被探索，不代表功能通過。
- 若日後要改採 A 或 C，應另開單一基建包，同時驗 Windows 與 current Linux CI，並保留可回退的獨立 commit。

## 5. 待老闆拍板

- A：讓 Windows 也能直接跑完整 build/E2E，接受依賴與雙平台維護成本。
- **B（建議）**：維持現況，完整 build/E2E 走 Linux CI／手動 workflow。
- C：投入時間建立正式 devcontainer／WSL 開發環境。
