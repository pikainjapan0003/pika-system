# BATCH-12 包1：技能入口 E2E harness 失敗軌跡

日期：2026-07-19  
裁決：`skipped`（遵守同包兩輪失敗即跳過；產品碼與未驗證 spec 均未保留）

## 預定驗證

以 `e2e/customer-navigation.spec.mjs` 的 signed-in Clerk stub，模擬 S-19 從關閉到開啟，確認不重新整理頁面時 `/settings` 立即出現「客戶管理」，且 `/customers` gate 放行。

## 第一輪

方法：使用 `mcr.microsoft.com/playwright:v1.55.0-noble`，在容器內啟動 shop-app Vite，再執行目標 Playwright spec。

結果原文（映像首次下載完成後）：

```text
Status: Downloaded newer image for mcr.microsoft.com/playwright:v1.55.0-noble
```

Docker exit code 為 0，但沒有 `Running 1 test` 或任何 Playwright 結果；因此不得視為通過。

## 第二輪

方法：同一容器流程加入 `E2E_CONTAINER_START`、`VITE_READY`、`E2E_CONTAINER_DONE` 三個明確標記與 Vite 失敗時輸出日誌。

結果原文：

```text
E2E_CONTAINER_START
```

Docker exit code 仍為 0，但後兩個標記與 Playwright 結果皆未出現。判定為 Windows PowerShell 對原生 `docker run ... bash -lc` 長指令的轉交在背景程序段提前結束，測試未執行。

## 已試方法與停止理由

1. Linux Playwright 容器＋背景 Vite＋目標 spec。
2. 同一路徑加入 readiness loop、失敗日誌與階段標記。

兩輪都沒有進入 Playwright，依 BATCH-12 明訂停止條件跳過。本包未用 `node --check` 或靜態閱讀冒充 E2E 綠燈；後續若重開，應改用獨立 `.sh` 腳本以 stdin 傳入容器，或直接交由 current-HEAD GitHub Actions Linux runner 仲裁。

## BATCH-14 第三法續跑（2026-07-19）

依 BATCH-14 包 1，曾新增獨立 `e2e/run-in-container.sh`，讓 host 只把短命令交給 Playwright 容器，再由容器內腳本建立乾淨副本、安裝依賴、套用拋棄式 schema、seed 假資料、啟動 API 與 Vite、等待 readiness，最後執行既有 `smoke.spec.mjs`。

第一輪從 Windows PowerShell 呼叫 `bash e2e/run-in-container.sh`，在 Playwright 結果前以 exit 1 結束，沒有任何可採信的 Playwright 原文。

第二輪加入 `bash -x` 取得以下決定性軌跡：

```text
+ repo_source=/mnt/c/Users/Lnovo/Desktop/pika-system
+ docker network create pika-e2e-29817-19974
+ cleanup_host
HARNESS_EXIT=1
```

本機的 `bash` 實際進入 WSL 路徑語意，且在建立拋棄式 Docker network 時即失敗；尚未進入 PostgreSQL、依賴安裝、Vite 或 Playwright。依同包兩輪停止規則，包 1 標記 skipped，刪除未驗證 harness；以包 1 為前置的包 2–5 同步 skipped，沒有留下未實跑的 spec 或 `testMatch` 變更。
