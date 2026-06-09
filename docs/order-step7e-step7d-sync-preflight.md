# Step 7E-2B Step 7D 變更同步策略與規格修正盤點

## 1. 任務背景

Step 7E-2A（`docs/order-step7e-agent-existing-schema-audit.md`）盤點出一個關鍵事實：

* `seller_agent_tokens` 與 `agent_run_logs` 的 Drizzle schema **並非缺漏未寫**
* 兩張表已在 `main` 分支 commit `d441fd9 feat-db-step7d-agent-token-run-log-schema` 中完整撰寫，並通過 78 個 mock 測試與 19 個真實 DB E2E 測試
* 但**目前 QA 分支 `qa/step6f-cvs-store-selection-browser-mobile` 落後 `main`**，working tree 中尚未包含 Step 7D 的 schema / route / test commits

因此施工 Step 7E-1a（`seller_agent_settings` schema + migration）前，必須先決定「如何讓施工分支取得 Step 7D 的完整變更」，而不是直接在缺少依賴的分支上動工。

本次任務目的：盤點同步策略選項、檢查衝突風險、並對 Step 7E-2 規格中已確認的 `agent_run_logs` 顯示層命名落差進行最小範圍文件修正，產出一份「下一步可施工的決策文件」。

本次**不**執行 merge、cherry-pick、checkout 其他分支施工、新增 schema、產生 migration 或執行 DB push。

## 2. 目前分支狀態

* 目前分支：`qa/step6f-cvs-store-selection-browser-mobile`
* 與 `main` 的 merge-base：`cf799c6`
* `git merge-base --is-ancestor d441fd9 HEAD` → **HEAD missing d441fd9**（目前分支不包含該 commit）
* `git merge-base --is-ancestor d441fd9 main` → **main contains d441fd9**（`main` 已包含）
* 目前分支落後 `main` 至少 25 個與 Step 7B/7C/7D 相關的 commit（含 schema、route、middleware、test、docs），其中包含：

```
13c1904 test-api-step7d-agent-integration-result
5d6198b test-api-step7d-agent-integration-skeleton
71a802f docs-order-step7d-agent-api-integration-test-plan
a96d22a docs-order-step7d-agent-api-final-acceptance-audit
d2abac2 feat-api-step7d-agent-run-log
c6abd79 feat-api-step7d-agent-shipment-status
345f83d feat-api-step7d-agent-shipment-events
c98944f feat-api-step7d-agent-tracking-jobs
5c7d8a4 feat-api-step7d-agent-auth-route-skeleton
c76f675 fix-db-main-orders-discount-schema-drift
de1dcc3 docs-order-step7d-agent-api-route-implementation-audit
d441fd9 feat-db-step7d-agent-token-run-log-schema
f454ab4 docs-order-step7d-agent-schema-implementation-preflight
a856f1d docs-order-step7d-agent-token-run-log-schema-spec
d8e460e docs-order-step7d-agent-auth-token-decision
f555121 docs-order-step7d-agent-write-api-implementation-audit
df8a78a docs-order-step7d-agent-write-api-spec
d28bd36 docs-db-step7c-shipment-tracking-schema
ed8b3ab docs-order-step7c-schema-migration-implementation-audit
2b289c1 docs-order-step7c-shipment-tracking-model-spec-review-fix
f5fc4d7 docs-order-step7c-shipment-tracking-model-spec
4258c54 merge-step7b-tracking-import-api-ui
ecbaf69 docs-openapi-orders-tracking-import
7ba4dd4 qa-step6d-fix-enter-key-loading-guard
ec3b3bd feat-orders-tracking-import-api
a36ab2c docs-order-step7b-tracking-import-decision
dd8fa7c docs-order-step7b-tracking-import-spec
```

* 目前分支自身另有 Step 8 系列 commit（`feat-step8k-order-discount-edit-dialog-ui`、`feat-step8j-order-discount-backend` 等）以及 Step 6F CVS 選店相關的 QA 修正，這些變更**不存在於 `main`**，是本分支獨有的工作。
* 目前 working tree 另有既有殘留修改（依規範**不可處理**）：`.replit`、`artifacts/shop-app/src/lib/printHelpers.ts`、`artifacts/shop-app/src/pages/Orders.tsx`，以及多個未追蹤的 `docs/order-step7e-*` 文件。

## 3. Step 7D commit / 檔案依賴盤點

### 3.1 `d441fd9` 本身變更的檔案

```
A  lib/db/src/schema/agentRunLogs.ts
M  lib/db/src/schema/index.ts
A  lib/db/src/schema/sellerAgentTokens.ts
M  lib/db/src/schema/shipmentTrackingEvents.ts
```

> 注意：`d441fd9` 修改了 `shipmentTrackingEvents.ts`，代表它**依賴**該檔案已存在 —— 而 `shipmentTrackingEvents.ts` 是由更早的 Step 7C commit（`d28bd36 docs-db-step7c-shipment-tracking-schema` 對應的程式碼變更鏈）建立的。**`d441fd9` 不是一個可以孤立套用的 commit，必須連同 Step 7C 的 shipment tracking schema 一起處理。**

### 3.2 `HEAD...main` 在關鍵路徑下的差異總覽

執行 `git diff --name-status HEAD...main -- lib/db/src/schema artifacts/api-server/src docs`，結果摘要：

**`main` 獨有（目前分支完全沒有）：**

| 類型 | 檔案 |
|---|---|
| schema 新增 | `lib/db/src/schema/agentRunLogs.ts`、`lib/db/src/schema/sellerAgentTokens.ts`、`lib/db/src/schema/shipmentTrackings.ts`、`lib/db/src/schema/shipmentTrackingEvents.ts` |
| route / middleware 新增 | `artifacts/api-server/src/middlewares/agentAuth.ts`、`artifacts/api-server/src/routes/agent.ts` |
| test 新增 | `artifacts/api-server/src/routes/agent.integration.test.mjs`、`artifacts/api-server/src/routes/agent.route.test.mjs` |
| docs 新增 | Step 7B / 7C / 7D 系列文件共 12 份（含 `docs/order-step7d-agent-api-route-implementation-audit.md`、`docs/order-step7d-agent-token-run-log-schema-spec.md` 等）|

**雙方都有改動、需要逐一核對是否衝突：**

| 檔案 | HEAD 自 merge-base 以來的變更 | main 自 merge-base 以來的變更 | 衝突風險 |
|---|---|---|---|
| `lib/db/src/schema/orders.ts` | +2 行（新增 `discountAmount` / `discountNote` 欄位） | +2 行（**內容與 HEAD 完全相同**，`git diff HEAD main` 結果為空） | **無衝突** — 兩邊改動內容一致（推測為同一變更已分別落到兩條歷史線）|
| `artifacts/api-server/src/routes/orders.ts` | +35 / -6 行 | +146 / -3 行 | **高衝突風險** — `git diff HEAD main` 顯示兩邊在 `PATCH /orders/:orderId`、CSV export 等**相同函式區塊**各自做了不同改動（HEAD 加入折讓欄位驗證邏輯與 `cvsChanged` 判斷；main 端的變更內容不同），逐行 diff 達 166 行，三方合併極可能在同一段落產生衝突 |
| `artifacts/api-server/src/routes/orders.route.test.mjs` | +382 行（全新增） | +355 / -1 行 | **高衝突風險** — `git diff HEAD main` 達 512 行差異，雙方都大量改寫測試內容，是否能自動合併存疑 |
| `artifacts/api-server/src/routes/index.ts` | 無變更 | +2 行（註冊 `agent` route）| 低風險（HEAD 未改動此檔，套用 main 的變更可直接套用）|
| `docs/order-step7c-schema-migration-implementation-audit.md` | 本分支已新增同名未追蹤檔案（working tree 中） | `main` 也有此檔案（commit 內容） | **需核對內容是否相同** — 目前是 untracked 狀態，合併時可能產生「新增 vs 新增」衝突 |

### 3.3 `shipmentTrackingEvents.ts` 缺口

`git cat-file -e HEAD:lib/db/src/schema/shipmentTrackingEvents.ts` → **不存在於 HEAD**。

這代表：`d441fd9` 對 `shipmentTrackingEvents.ts` 的修改（M）是建立在「該檔案已存在」的前提上；若只取 `d441fd9`，這個檔案在目前分支中根本不存在，`git apply` / cherry-pick 該 commit 時會直接失敗或產生不完整的結果。**完整依賴鏈至少要往前回溯到 Step 7C 建立 `shipmentTrackings.ts` / `shipmentTrackingEvents.ts` 的 commit。**

## 4. 同步方案比較

### 方案 A：直接 merge `main` 進目前 QA 分支

* **優點**：一次性取得 `main` 上所有 Step 7B/7C/7D 的完整變更，包含 schema、route、middleware、test、docs，依賴關係由 git 自動處理，不需要手動排序 commit。
* **風險**：
  * `artifacts/api-server/src/routes/orders.ts` 與 `artifacts/api-server/src/routes/orders.route.test.mjs` 雙方都有大量、針對相同函式區塊的修改（見 §3.2），**極可能產生需要手動解決的合併衝突**。
  * 會把 `main` 上所有「與 Step 7E 無關」的變更（例如 Step 7B tracking import、Step 6D QA fix 等共 25+ commit）一併帶入本分支，**範圍遠大於 Step 7E-1a 實際需要的依賴**，使本分支的變更歷史更難追蹤與回退。
  * **目前 working tree 是 dirty 狀態**：存在未提交的殘留修改（`.replit`、`printHelpers.ts`、`Orders.tsx`）以及多個未追蹤的 `docs/order-step7e-*` / `docs/order-step7c-schema-migration-implementation-audit.md` 文件。在 dirty workspace 上執行 merge，一旦發生衝突，merge 過程的中介狀態會與這些既有殘留交織在一起，大幅提高誤改、誤復原既有殘留的風險（而既有殘留依規範不可處理）。
  * `docs/order-step7c-schema-migration-implementation-audit.md` 目前是本分支的 untracked 檔案，但 `main` 也有同名 commit 內容 —— merge 時可能出現「untracked file would be overwritten by merge」的錯誤，需要先處理這個檔案的狀態才能進行。
* **是否適合目前 dirty workspace**：**不適合**。在尚有未提交殘留修改、且预期會有多處衝突的情況下執行 merge，混合風險過高。

### 方案 B：cherry-pick Step 7D 必要 commits

* **優點**：理論上可以「精準挑選」只與 Agent 功能相關的 commit，避免帶入無關變更，看起來範圍比 merge 小。
* **風險**：
  * **依賴鏈比表面看起來長且複雜**：`d441fd9`（agent token/run-log schema）依賴 `shipmentTrackingEvents.ts` 已存在 → 依賴 Step 7C 的 shipment tracking schema commit（`f5fc4d7` / `2b289c1` / `d28bd36` 鏈路上的程式碼變更）→ 而 Step 7D 的 route 實作（`c98944f`/`345f83d`/`c6abd79`/`d2abac2`/`5c7d8a4`）又依賴 `agentAuth.ts` 與 schema 都已存在 → 測試（`5d6198b`/`13c1904`/route test）又依賴前述全部都已就緒。**至少需要 cherry-pick 12～15 個彼此依賴的 commit，且必須嚴格按照原始順序套用**。
  * 過程中極可能漏掉某個中介依賴（例如 `c76f675 fix-db-main-orders-discount-schema-drift` 這類「修正型」commit，若遺漏會讓後續 commit 套用在錯誤的基礎上）、或漏掉 schema drift 修正、某個 route、某份測試或某份 docs，導致「看似套用成功，但實際上功能不完整或測試對不上 schema」。
  * 每個 cherry-pick 都可能各自產生衝突（尤其是 `orders.ts` route 與 `orders.route.test.mjs`，這兩個檔案在 §3.2 已確認雙方都有大幅改動），**衝突總數可能比一次性 merge 更多**，因為衝突會被拆散到多個獨立的 cherry-pick 步驟中分別處理，且每次都要重新建立上下文。
  * **是否比 merge main 安全**：理論上「範圍可控」，但實務上「依賴鏈長 + 多次重複處理同一組檔案的衝突」使其**並不比 merge 更安全**，反而更容易在中途漏掉某個必要 commit 而留下難以察覺的半套用狀態。

### 方案 C：另開乾淨 Step 7E worktree / branch，以 `main` 為基底施工

* **作法**：以 `main`（已包含完整 Step 7D 成果，含 schema、route、middleware、78 mock + 19 E2E 測試）為基底，建立新的 worktree 或分支，在其上進行 Step 7E-1a 及後續施工；目前 QA 分支保留給 Step 6F / Step 8 相關工作。
* **優點**：
  * `main` 已經是「Step 7D 完整且通過驗證」的乾淨基底，**不需要處理任何 merge / cherry-pick 衝突**，`seller_agent_settings` 可以直接 import `sellerAgentTokensTable` 而不會有編譯問題。
  * 完全不會干擾目前 QA 分支上的 Step 6F / Step 8 工作與既有殘留修改，兩條工作線互不影響。
  * 符合「Step 7 是資料庫 / Agent 功能主線，Step 6F 是 QA 分支」的工作劃分 —— **DB schema / migration 類工作本來就更適合在貼近 `main` 的乾淨基底上進行**，而不是在落後 `main` 且已有大量無關殘留的 QA 分支上動工。
* **風險**：
  * 需要額外建立並維護一條新的工作線（worktree 或 branch），對使用者的工作流（ChatGPT → Claude Code → dev-handoff → Codex）而言，需要明確告知「Step 7E-1a 之後的施工請在新分支上進行」，避免後續任務指令仍指向舊分支造成混淆。
  * 目前 Step 7E-0 / 7E-1 / 7E-2 / 7E-2A / 7E-2B 文件都是在本分支的 `docs/` 目錄下以 untracked 檔案產出的，若改到新分支施工，**需要先決定如何把這些文件帶過去**（例如：在新分支重新建立、或從本分支複製、或等待使用者另行整合）。本次盤點不涉及檔案搬移，僅指出此處需要使用者決策。
* **是否最符合 Step 7 主線並避免污染 QA 分支**：**是**。

### 方案比較小結

| 比較項目 | 方案 A：merge main | 方案 B：cherry-pick | 方案 C：新 worktree/branch |
|---|---|---|---|
| 取得 Step 7D 完整依賴 | 一次到位，但連帶帶入大量無關 commit | 需精準排序 12-15 個 commit，易漏 | 直接基於已驗證的 `main`，天然完整 |
| 衝突風險 | 高（`orders.ts`、`orders.route.test.mjs`）| 高且分散到多個步驟 | 無（不需要 merge/cherry-pick）|
| 對既有 dirty workspace 的影響 | 高（merge 中介狀態與殘留交織）| 中（每次 cherry-pick 都要面對 dirty workspace）| 無（新工作線，不影響本分支殘留）|
| 帶入無關變更 | 多（Step 7B/6D 等 25+ commit）| 可控但實務上難完全避免 | 無（`main` 即為目標基底，無「帶入」問題）|
| 是否符合 Step 7 主線定位 | 否（混入 QA 分支）| 否（混入 QA 分支）| 是 |

## 5. 建議同步策略

**建議採用方案 C：以 `main` 的 Step 7D 完成狀態為基底，另開乾淨的 Step 7E worktree / branch 進行 Step 7E-1a 及後續施工。**

理由：

1. Step 7E-1a 屬於 **DB schema / migration** 類工作，對基底的乾淨度與依賴完整性要求最高 —— `main` 已經是「Step 7D 完整撰寫且通過 78 mock + 19 E2E 測試」的已驗證狀態，是最安全的起點。
2. 目前 QA 分支（`qa/step6f-cvs-store-selection-browser-mobile`）落後 `main` 達 25+ commit，且 working tree 本身已是 dirty 狀態（多個既有殘留修改 + 多份未追蹤文件），**不適合在其上直接進行 merge 或 cherry-pick 這類高衝突風險的操作**。
3. 方案 A、B 都會在 `orders.ts` route 與 `orders.route.test.mjs` 上產生高風險衝突（見 §3.2、§4），且方案 B 的依賴鏈比表面複雜，容易漏掉中介 commit。**兩者都不比方案 C 安全**。
4. 不建議只 cherry-pick `d441fd9` 單一 commit —— 已確認它依賴 `shipmentTrackingEvents.ts` 已存在（Step 7C 的成果），單獨套用會直接失敗或產生不完整結果。

**若使用者基於其他考量（例如不想開新分支）必須留在本分支施工**，則退而求其次的順序建議為：

1. 優先評估**完整 cherry-pick Step 7D commit chain**（需先picking 完整依賴順序：Step 7C shipment tracking schema → `d441fd9` agent schema → `agentAuth.ts` → 各 agent route commit → 各 agent test commit → 相關 docs），且必須在每一步驟後驗證編譯與測試通過，再進行下一步。
2. 其次才考慮 merge `main`，但需先處理 dirty workspace（與使用者確認既有殘留修改的去向）並預留時間手動解決 `orders.ts` / `orders.route.test.mjs` 的衝突。

## 6. Step 7E-2 規格修正項目

已依 Step 7E-2A 盤點結果，對 `docs/order-step7e-seller-agent-api-schema-spec.md` 第 5 節「`agent_run_logs` 顯示規格」做最小範圍修正（僅修改 run logs 顯示規格相關文字，未重寫整份文件）：

1. **`status` 顯示值**：原文寫「`status`（執行狀態（success / failure / partial））」，已修正為註明底層實際 enum 為 `running / completed / failed / partial`，並補上顯示層映射建議（`running`→執行中、`completed`→完成、`failed`→失敗、`partial`→部分成功）。
2. **`jobCount`**：已修正為標註「API response 可使用 `jobCount` 作為顯示別名，但底層 DB 欄位來源是 `checkedCount`，schema 中沒有 `jobCount` 欄位，不可假設存在」。
3. **`errorSummary`**：已修正為標註「`errorSummary` 是 API 回應層組合而成的欄位，來源為 `errorCode` + `errorMessage`，DB 底層沒有單一 `errorSummary` 欄位」。
4. **`tokenPrefix`**：已修正為標註「`agent_run_logs` 本身沒有 `tokenPrefix` 欄位，僅有 `tokenId`；若要顯示 `tokenPrefix` 需要 JOIN `seller_agent_tokens`；MVP 階段若不 JOIN，可先不顯示 token 相關識別資訊，或只顯示 `tokenId` 的安全別名」。
5. **`rawPayload`**：已修正為標註「`agent_run_logs` 本身沒有 `rawPayload` 欄位；run logs API 不應回傳任何 raw external response / stack trace / secret；`rawPayload`/`rawData` 類禁止規則的真正適用對象是 `shipment_tracking_events`（或外部物流 API 原始回應），而非 `agent_run_logs`」。

修正後的內容已直接寫入 `docs/order-step7e-seller-agent-api-schema-spec.md` 第 5.2、5.3 節，可於下方 git diff 核對確切變更範圍（僅限 run logs 顯示規格段落，未動到其他章節）。

## 7. Step 7E-1a 施工前必要條件

1. **先決定同步策略**（建議方案 C，見 §5），並由使用者確認新工作線的命名與 Step 7E 文件的搬移方式。
2. **確認新工作線已包含 `d441fd9` 及其完整依賴**（`git merge-base --is-ancestor d441fd9 HEAD` 應回傳 true），且 `lib/db/src/schema/index.ts` 已 export `sellerAgentTokensTable` / `agentRunLogsTable`，使 `seller_agent_settings` 的 schema 設計可以直接 import 並建立 FK 關聯。
3. **核對 DB schema drift 狀態**：依 `docs/order-step7d-db-schema-drift-resolution-plan.md` 計畫，確認新工作線所連接的 `DATABASE_URL` 是否已實際建立 `seller_agent_tokens` / `agent_run_logs` / `shipment_trackings` / `shipment_tracking_events` 等表與 `idempotency_key` 欄位。
4. **確認 §6 修正後的 Step 7E-2 規格已被採用**作為 Step 7E-1d（run-logs API）的命名依據，避免實作時出現「規格寫的欄位在 DB 找不到」的狀況。
5. **以實際 DB `\d seller_agent_tokens` / `\d agent_run_logs` 核對 index/constraint 數量**（Step 7E-2A 已指出文件間的計數落差，見該文件 §7.4）。

## 8. 風險與防呆

1. **分支選擇錯誤風險**：若後續任務指令仍指示在目前 QA 分支進行 Step 7E-1a 施工，但實際依賴位於 `main`，會導致 TypeScript 編譯失敗（`sellerAgentTokensTable` 找不到）或施工者誤以為需要重新設計 schema。建議在指派 Step 7E-1a 任務時，**明確指定施工分支**（新 worktree/branch 名稱），避免依賴 worker 自行推定。
2. **Step 7E 文件遺失風險**：若改到新工作線施工，目前累積的 Step 7E-0 / 7E-1 / 7E-2 / 7E-2A / 7E-2B 文件（皆位於本分支 `docs/` 下，且部分為 untracked）需要明確的搬移計畫，否則新工作線的施工者可能讀不到這些前置盤點成果。
3. **`orders.ts` 相關衝突風險（若選擇方案 A/B）**：`artifacts/api-server/src/routes/orders.ts` 與 `orders.route.test.mjs` 在本分支與 `main` 上都有大幅且不同的修改（折讓功能 vs. 其他功能），逐行 diff 達 166～512 行，**任何形式的整合都需要審慎的人工 review，不應自動套用**。
4. **`docs/order-step7c-schema-migration-implementation-audit.md` 重複問題**：本分支已存在同名 untracked 檔案，`main` 也有對應 commit 內容；若日後執行 merge / cherry-pick，需先確認兩者內容是否一致，避免「新增 vs 新增」衝突或內容互相覆蓋。
5. **既有殘留修改不可處理**：`.replit`、`printHelpers.ts`、`Orders.tsx` 三個檔案的未提交修改，本次盤點過程**未查看內容、未嘗試理解其用途、未做任何處理**，僅在 git 狀態檢查中確認其存在，遵照任務指示原樣保留。

## 9. 非目標

本次任務明確不包含、也未執行：

* `git merge` main 進目前分支
* `git cherry-pick` 任何 commit
* `git checkout` 到其他分支進行施工
* 新增或修改 `seller_agent_settings`、`seller_agent_tokens`、`agent_run_logs` 等任何 Drizzle schema 檔案
* 新增、修改 migration 或執行 `drizzle-kit generate` / `drizzle-kit push` / DB push
* 修改 `agentAuth.ts`、`agent.ts`、任何 route 或 middleware
* 修改任何測試檔案或新增測試
* 修改 UI 程式碼、新增 component 或頁面
* 實作 token 管理 API、run-logs API 或 webhook
* 修改 `package.json`、lockfile、`.replit`
* 修改 `artifacts/shop-app/src/lib/printHelpers.ts`、`artifacts/shop-app/src/pages/Orders.tsx`
* 處理、復原、stash 或 reset 既有殘留修改
* commit、push、stage `dev-handoff/`、stage `.claude/`

## 10. 下一步建議

1. **請使用者決定是否採納方案 C**：以 `main` 為基底另開 Step 7E worktree / branch。若同意，下一步任務應明確指定新工作線的名稱與建立方式（例如 `git worktree add` 或 `git checkout -b` 的目標分支名），並說明目前累積的 Step 7E 文件如何處理（複製過去 / 重新產出 / 暫不處理）。
2. **若使用者選擇留在本分支**，建議下一個任務先處理「dirty workspace 整理」與「衝突範圍確認」這兩件事，而不是直接開始 merge / cherry-pick —— 例如先請使用者確認 `.replit` / `printHelpers.ts` / `Orders.tsx` 的殘留修改是否該先收斂（commit 或留待之後處理），再評估 `orders.ts` 衝突的具體解法。
3. **無論採用哪個方案**，在實際進行同步操作前，建議先以唯讀方式（`git diff` / `git log` / `git show`）對 `orders.ts` route 與 `orders.route.test.mjs` 的雙邊差異做更細緻的逐段比對，確認哪些區塊可以自動合併、哪些需要人工抉擇，降低正式同步時的不確定性。
4. **Step 7E-2 規格修正已完成**（見 §6），後續 Step 7E-1d（run-logs API）實作可直接參照修正後的欄位映射規則，不需要再回頭釐清命名問題。
