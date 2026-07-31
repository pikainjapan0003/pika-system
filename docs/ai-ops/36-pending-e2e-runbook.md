# Pending E2E 操作手冊

更新日：2026-07-20

## 給老闆：白話操作

Pending E2E 是四條尚在候選區的「真人瀏覽器流程測試」。它不會影響平常 CI 的綠燈，必須由你手動開始。

### 怎麼開始

1. 打開 GitHub 的 pika-system 專案。
2. 點上方 **Actions**。
3. 左側點 **Pending E2E**。
4. 右側點 **Run workflow**。
5. 分支選 **main**，再按綠色 **Run workflow**。
6. 等待結果完成，不要重複按。

### 結果是綠色

把該次執行網址交給 Codex 或 Fable 5。綠色只代表四條候選測試本次通過；還要經審查後，才可搬進每天自動執行的主 CI。

### 結果是紅色

1. 點進紅色的執行紀錄。
2. 展開 **Run pending Playwright tests**，先複製最前面的失敗訊息。
3. 頁面下方若有 **Artifacts**，下載 `pending-e2e-failure-*`。
4. 把失敗訊息、執行網址及下載的壓縮檔一起交給 Codex 或 Fable 5。
5. 不要自己改測試，也不要因為紅燈重複執行很多次。

候選測試失敗不代表正式網站一定壞掉；要先用錯誤紀錄判斷是功能、測試資料或測試環境的問題。

## 給未來 session：技術流程

### 現況與事實來源

- Workflow：`.github/workflows/e2e-pending.yml`
- Pending config：`e2e/playwright.pending.config.mjs`
- 候選 specs：`e2e/pending/*.spec.mjs`
- 正式 config：`e2e/playwright.config.mjs`
- 主 CI：`.github/workflows/ci.yml`

Pending workflow 只能用 `workflow_dispatch` 手動啟動；不得把 `--list` 或本機 skip 視為實跑通過。

### 綠燈仲裁與升級

1. 唯讀核對最近一次 `Pending E2E` 的 commit SHA、branch、結論與 run URL。
2. 確認四條 spec 都在 Linux runner 真正執行，不能只看 job 綠色或 discovery。
3. 將通過的 spec 從 `e2e/pending/` 移到 `e2e/`。
4. 移除檔頭的 `UNVERIFIED-PENDING` 標記。
5. 把新檔名逐一加入 `e2e/playwright.config.mjs` 的 `testMatch`；不要用寬鬆 glob 偷納入其他檔案。
6. 更新 README 的 Pending E2E 說明。
7. 以主 config 執行 `pnpm exec playwright test --config e2e/playwright.config.mjs --list`，確認數量為 10 tests in 6 files。
8. 依派工要求在可用 harness 真跑，或推送後以 current-HEAD 主 CI 作最終證據。

### 紅燈定位

1. 保存 run URL、commit SHA、失敗 step 原文及每條失敗 spec 名稱。
2. 下載 `pending-e2e-failure-<run_attempt>` artifact；保留其中的 trace、screenshot 及 error context。
3. 使用 Playwright trace viewer 檢查：
   - 最後成功的操作；
   - network request／response；
   - console error；
   - locator 找不到、文案不符或頁面尚未 ready；
   - Clerk stub 與 API mock 是否攔到正確 URL。
4. 先證明根因，再只修 spec 或 harness；不得為了讓候選測試通過而改 production 商業邏輯。
5. 修正後仍留在 `e2e/pending/`，再次由老闆手動觸發仲裁。
6. 同一修正連續失敗兩輪即停止，附完整軌跡回報。

### 不可做

- 不可自行觸發 workflow。
- 不可把 pending spec 直接加入主 CI。
- 不可弱化斷言、加 skip 或只調大 timeout 來消除紅燈。
- 不可放入真實客戶資料、正式 token 或 production 憑證。
