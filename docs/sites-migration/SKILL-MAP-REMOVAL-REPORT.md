# 產品技能地圖移除

更新：2026-09-27（Asia/Taipei）。B＋Astra、單一寫入者；僅私人 POC 與 GitHub 遷移分支。

## 結果摘要

1. 技能地圖原本保存每店技能狀態，透過 provider／頁面 gate、導航與首登問卷決定哪些業務入口可用；它不是 Clerk 店主授權。
2. 現行技能頁、問卷、套餐、開通 API、catalog／prerequisite、同步 hook、schema export、seed 初始化及專屬測試已移除。商品、訂單、客戶、OCR、物流、成本與報表保留，正常功能直接使用既有店主權限。
3. 本機與雲端隔離庫的 `store_skill_states` 已備份後以 `RESTRICT` 移除；獨立 SQL 查回不存在。其餘商店 1、商品 3、訂單 1、客戶 1、帳本 2 筆不變。
4. GitHub 遷移分支、Sites 第 7 版與 Railway API 已更新。41 項必要案例、完整 typecheck／build 通過；部署後 8 個業務讀取與 R2 圖片內容雜湊跟部署前一致。技能頁的內外路由已刪除，網站新 bundle 沒有技能接線，舊 JS 也不再提供；瀏覽器控制逾時，因此未宣稱實際畫面 E2E 通過。
5. `main`、原 OCR 分支與 Git 歷史刻意保留。沒有重新呼叫付費 OCR、查包裹、接真付款／出貨或更動正式資源。使用者現在不需操作；人工功能驗收延後。

**新 Sites 產品與 GitHub 遷移分支已移除技能地圖；正常業務功能保留；舊分支與 Git 歷史未改。**

## 來源與回復點

- 工作樹：`C:/Users/Lnovo/Documents/ChatGPT/pika-system-Sites私人遷移`。
- GitHub：`pikainjapan0003/pika-system`，唯一推送分支 `codex/chatgpt-sites-private-poc`。
- 歷史起點 `33953b1fa8586110863c76304f5b6d3dc9f1ba92` 沒有被用來 reset。
- 成功版本 checkpoint：`5d89f4ffaa98e79b1daafe4bd2363afd6d86f46e`，已推送且讀回相同。涵蓋前輪僅存在本機的 Sites／Railway／R2／OCR／管理功能來源；未提交秘密、dump、`.codex` 綁定或 controller-recovery 材料。
- 變更前本機備份：`C:/Users/Lnovo/Documents/Codex-backups/SKILL-MAP-REMOVAL-2026-09-26T16-46-52-096Z`。測試表回復材料只留本機，不推 GitHub。
- 舊 Sites 第 6 版來源：專用產物 repository 的 `470f67445261318825126a698b85f2921d782bf2`。與 GitHub 原始碼 repository 是兩個不同來源，不混用 hash。
- 舊 Railway API deployment：`81e941f9-91e5-49b5-a735-e600e93839a6`。
- 清理 commit／GitHub 分支已讀回：`87b0c50f170b095eb7c706b642c60f18c2bb4613`。後續交付文件 commit 不改產品來源。
- 新 Sites 第 7 版來源：`528e32a3f2ec3bc54c79cc704a9e9079bdd8d4b6`，deployment `appgdep_6ab802a5813881918dfd8288ec5427f3` 為 succeeded，環境 revision 2。是同一個既有 PRIVATE 站點；讀回只有 owner、沒有群組／外部訪客。
- Railway 新 API 來源為清理 commit 的乾淨本機上傳，deployment `2d278555-0ea0-4443-be3d-9fd93fcce5af` 為 SUCCESS；並非 GitHub 自動部署，也不拿 Sites 的產物 commit 冒充 API 來源。
- 最終 Railway 正常運行 deployment：`c1657bda-c30f-4492-a870-9e4e3440be6e`，SUCCESS，同一份 `87b0c50` 程式；實際部署 metadata 讀回 `preDeployCommand=[]`、`startCommand=node src/poc/start.mjs`。不存在永久刪表 hook。
- 本輪遠端讀回原分支：`main=6190ef22584d19fb8f2427e76d09d23c7aa88d3c`、`codex/invoice-ocr-integration=33953b1fa8586110863c76304f5b6d3dc9f1ba92`，與施工前相同。清理版讀回時遷移分支 HEAD=`87b0c50f170b095eb7c706b642c60f18c2bb4613`；最後純文件提交及遠端 HEAD 另由同輪最終回覆與 `.poc/checks/skill-removal-final-refs.json` 記錄，避免在 commit 內寫自己的循環 hash。
- Railway：project `de13e86c-9d70-4396-85be-79cd73cd412f`（pika-system-private-poc）、environment `143266a9-b10c-4dec-9b8f-f4eec9bec86a`（名稱 production，但為隔離 POC）、API service `1068b8cf-3623-4b85-a702-d7bb7b70080e`（pika-poc-api）。資料庫 `pika_sites_poc`／角色 `pika_poc`。
- 推送前核對：GitHub repository hooks 為空；現行 GitHub workflows 只有檢查／建置、手動 E2E，沒有部署 job；Railway API／PG 都沒有連結 GitHub repo。未修改 Replit 平台或其專案。部署前 Railway staged patch 讀回 `{}`，不套用其他人的設定。

## 實際依賴與拆接

| 原依賴 | 本次處理 | 保留內容 |
|---|---|---|
| `SkillMap.tsx`、App `/skill-map`、Settings 技能入口 | 刪除頁面、內外路由與導航 | 舊網址落到既有 not-found，不再有技能操作 |
| `dailySkillVisibility*`、`DailySkillPageGate`、`skillStateSync` | 刪除 provider／hook／同步，拆掉頁面及導航 gate | MerchantPortal、Clerk、指定店主／店鋪 guard |
| `OnboardingQuestionnaireCard`、`onboardingQuestionnaire`、`skillMap` | 刪除問卷、推荐、套餐與前端 catalog | 正常商品、訂單、客戶、成本／月報／行程、OCR 頁面 |
| API `routes/skills.ts`、`automationFoundation.ts` | 刪除狀態、preview／enable／package 與專屬能力判定 | 原物流 worker／adapter 未刪；skill API 只引用 worker 作為可用性事實，沒有包住其執行入口 |
| `lib/db/src/skills/skillState.ts`、`schema/storeSkillStates.ts`、`@workspace/db/skill-map` | 刪除定義、exports、套件入口、TS path 與 seed 初始化 | 其他 DB 業務 exports、資料表及關聯 |
| 技能專屬測試、E2E skills mock、CI 測試清單 | 刪純技能測試；保留業務測試，改測直接使用／機制已移除 | 金額、授權、防重、訂單快照、CSV 遮罩等斷言 |

`PIKA_PRIVATE_POC` 原有邊界保留。物流批次匯入、例外工作台、Agent、audit 等本階段未開放頁面以原 POC 模式維持停用，沒有另造功能開關平台。真付款／出貨／通知、自動票價等限制保持；全家有效外部貨態仍等待合法測試單號。

## Schema、seed 與文件

- 保留已套用歷史 `0019_store_skill_states.sql`，新增向前步驟 `0042_drop_store_skill_states.sql`；只 `DROP TABLE IF EXISTS public.store_skill_states RESTRICT`，不用 CASCADE、force schema push。
- 一次性清理 script `artifacts/api-server/src/poc/remove-skill-map-table.mjs` 不在啟動流程執行；釘選本 POC project／environment／service、DB、owner，備份 hash 一致才允許刪表，並確認 stores/products/orders/customers/ledger 筆數不變。
- `scripts/demo-seed.mjs` 不再建立或回傳技能開通資料；正常功能不需技能表。
- README、現行操作手冊、驗收脚本、API matrix、交接與本總進度已更新。舊盤點／問卷考古／歷史約束報告保留當時事實並加歷史標示；Codex Skills／AGENTS 工具設定完全不屬本次刪除。
- Site 封裝原先覆蓋複製會殘留四個舊 JS bundle；`sites/prepare-site.mjs` 現在先核對專用 checkout 絕對路徑，只清生成的 frontend／dist，再封裝新版，避免舊技能程式仍能從舊 asset URL 取得。

## 驗證與後續收據

- `pnpm run typecheck`：root libraries＋API＋shop-app＋mockup＋scripts 全部通過。
- 真本機隔離 PostgreSQL、移除技能表後，三個 POC integration suite：24/24 通過；涵蓋無技能表、合法店主下的舊 route 404、POC 邊界 403、商品／訂單／token 查單、客戶、帳本、CSV、交通成本、快照及重啟讀回。
- 部署前 Sites 同源真 Clerk 讀取八個管理 endpoint、token 假单 1（200 元）、帳本 20、商品 3 成本摘要／毛利 94、商品 1 R2 圖片 417 bytes、OCR run 1 均成功；保存回應與圖片 hash 作為部署後比對，沒有新增真 OCR 呼叫。
- 首輪 API 命令超時不是斷言失敗；確認并停止本輪專用容器後重跑取得上述完整結果。畫面測試中的 mock `getToken` 每次 render 變動造成循環，已修為穩定參照；帳本首次等待逾時後原斷言重跑通過。首次失敗／中止及重跑收據保留在被忽略的 `.poc/checks`，沒有刪除業務測試以掩蓋失敗。
- 前端相關測試：重跑的 Dashboard／Guide／Orders／帳本 12/12 通過；首輪已完成的客戶列表／匯出／導航 4 項與 asset loader 1 項通過。合計 17 項不同斷言案例通過，沒有把首輪被中止的 command 宣稱成功。
- `pnpm -r --if-present run build`：通過（API／shop-app／mockup）。前端 1958 modules、產物 `index-DFxtgZ9X.js`；有既有 select／sheet sourcemap 診斷及 bundle 大小警告，未把警告改寫成失敗或擴大重構。
- 新 Sites／API 已部署，雲端表清理與部署後讀回全部通過，明細見下表。
- Chrome 控制連續兩次逾時，目前不宣稱完整瀏覽器 E2E。私人頁面與 API 證據分開核對，不要求使用者人工點擊。

主要驗證命令（均在本專案隔離 Docker／合成 PG 執行）：

```sh
pnpm run typecheck
pnpm -r --if-present run build
node --experimental-test-module-mocks --import tsx/esm --test --test-concurrency=1 src/poc/privatePoc.integration.test.mjs src/poc/privatePocAdvanced.integration.test.mjs src/poc/privatePocManagement.integration.test.mjs
# 前端：TSX_TSCONFIG_PATH=../shop-app/tsconfig.json、VITE_PRIVATE_POC=true
node --experimental-test-module-mocks --import tsx/esm --test --test-concurrency=1 ../shop-app/src/test/dashboardPage.test.mjs ../shop-app/src/test/guidePage.test.mjs ../shop-app/src/test/ordersPage.test.mjs ../shop-app/src/test/customerStoreCreditPanel.test.mjs
```

## 簡單回復

使用 checkpoint 或本輪前的既有部署版本重新建置／部署，不 reset 他人後續修改、不回到原始遷移起點。若回復舊 API，先在同一隔離 DB 執行已保存的 `cloud-store-skill-states-restore.sql`（含歷史 0019 結構與兩筆備份資料），再啟動依賴該表的舊版本；其他業務資料不回滾。PRIVATE／Clerk／R2／正式資源與憑證不需更動。

## 雲端清理方式

Railway SSH 命令因沒有既有 SSH key 而未執行；沒有新增 key、公開 PG 入口或要求使用者額外登入。沿用 Phase 2 已使用的一次性 pre-deploy command，在既有私網執行 scoped script；失敗不自動重送資料操作。其作用域及失敗行為與 [Railway 官方文件](https://docs.railway.com/deployments/pre-deploy-command) 一致。

唯讀備份 deployment `af88f005-d256-436f-ab5d-f1005d73cd44` SUCCESS，僅兩筆技能狀態。Railway 將 JSON 行拆為結構化 log 欄位，重新解析既有紀錄即可，不重新執行備份。已將 JSON／還原 SQL 存至上方本機回復資料夾，讀回與 SHA-256 `d0b5410e5e3207347c862c977ffb97a66adf33f6d2358e8c8d9098875b9eb53e` 一致；沒有資料庫密碼或客戶資料。

刪表 deployment `fb866625-6186-4af4-9882-6aee8a74b98b` SUCCESS，只執行一次 drop。複合命令紀錄未證明 verify 已執行，因此另以獨立唯讀 deployment `cd43ee5c-ff0f-46e1-80fd-cc5dd61f8da5` 取得 `absent:true`。最後以先前所列 `c1657bda` 部署回空 hook，再作線上讀取，沒有盲目重送 drop。

## 最終線上證據與界限

| 層次 | 實際結果 |
|---|---|
| 正常業務資料 | 2026-09-27 01:18 與 01:48（台北）讀取 8 個 endpoint，產品／訂單／客戶／帳本／CSV／行程／月報／OCR 的完整回應雜湊相同 |
| 假單／成本／帳本 | 訂單 1 的 token 查回 200 元；商品 3 仍關聯路線 1、毛利顯示 94；假客戶帳本餘額仍 20，沒有新付款 |
| R2／OCR 回歸 | 商品 1 原 PNG 同為 417 bytes，base64 內容雜湊相同；原 OCR testcase 1／run 1 仍是同一筆，真 OCR 呼叫數 0 |
| 技能 API | 真 Clerk 指定店主經 Sites 同源呼叫狀態、preview、enable、package preview／apply，5 項均回 403 `POC_FEATURE_NOT_ENABLED`；另外本機指定店主測實際 Express router 均為 404，證明不是只靠匿名拒絕 |
| 原有授權與停用 | 未登入管理讀取 401、跨店 403；未開放的店鋪設定／狀態副作用／Agent／物流同步操作仍 403；本機 non-owner 及混店／越權案例通過 |
| 實際部署前端 | Sites 取得的 HTML 引用與本機新版一致的 `/assets/index-DFxtgZ9X.js`；實際 JS 不含技能頁／套餐／provider／gate，四個舊 JS 位址均不再提供 JavaScript |
| 私人範圍 | Sites 工具讀回 owner 1、群組 0、外部訪客 0；無平台登入／QA 憑證存取站點實回 401；沒有放寬 PRIVATE 或 bucket |
| 畫面證據 | Dashboard／Guide／Orders／客戶／帳本 DOM 自動測試通過；Chrome 控制兩次逾時，實際瀏覽器導航、舊頁 not-found 畫面尚未驗證。路由原碼、已部署 bundle／API 證據不能冒充瀏覽器 E2E |

殘留引用僅有：歷史 0019／向前 0042 migration、一次性清理工具、驗證舊機制不存在的回歸斷言、已標示的歷史產品報告。Codex Skills／AGENTS 指引不是產品技能地圖，不在刪除範圍。現行 runtime imports／路由／schema／seed 已無技能狀態依賴；乾淨初始化仍使用現行 Drizzle schema，沒有舊技能 export。

本輪沒有新增服務、方案、金流或付費 OCR；既有部署資源的實際帳單增量未知，未宣稱免費。原正式 R2、Replit production、正式 DB、正式網域未操作，原分支 HEAD 已另核對。物流仍等待合法測試單號，不反覆查詢、不當成已完成真貨態。到此停止本輪，不增加新功能或人工驗收工作。
