# 產品技能地圖移除

更新：2026-09-27（Asia/Taipei）。B＋Astra、單一寫入者；僅私人 POC 與 GitHub 遷移分支。

## 結果摘要（施工中）

1. 技能地圖原本保存每店技能狀態，透過 provider／頁面 gate、導航與首登問卷決定哪些業務入口可用；它不是 Clerk 店主授權。
2. 現行技能頁、問卷、套餐、開通 API、catalog／prerequisite、同步 hook、schema export、seed 初始化及專屬測試已移除。商品、訂單、客戶、OCR、物流、成本與報表保留，正常功能直接使用既有店主權限。
3. 本機隔離庫已備份並移除 `store_skill_states`，24 項 API 回歸及完整 typecheck 通過。雲端表待新版 API 成功部署後，先備份再以 `RESTRICT` 移除。
4. GitHub 已保存成功版本 checkpoint；清理版、私人網站與 API 的部署／讀回證據會在下方接續記錄，現在不能宣稱所有層都完成。
5. `main`、原 OCR 分支與 Git 歷史刻意保留。沒有重新呼叫付費 OCR、查包裹、接真付款／出貨或更動正式資源。使用者目前不需操作；人工功能驗收延後。

## 來源與回復點

- 工作樹：`C:/Users/Lnovo/Documents/ChatGPT/pika-system-Sites私人遷移`。
- GitHub：`pikainjapan0003/pika-system`，唯一推送分支 `codex/chatgpt-sites-private-poc`。
- 歷史起點 `33953b1fa8586110863c76304f5b6d3dc9f1ba92` 沒有被用來 reset。
- 成功版本 checkpoint：`5d89f4ffaa98e79b1daafe4bd2363afd6d86f46e`，已推送且讀回相同。涵蓋前輪僅存在本機的 Sites／Railway／R2／OCR／管理功能來源；未提交秘密、dump、`.codex` 綁定或 controller-recovery 材料。
- 變更前本機備份：`C:/Users/Lnovo/Documents/Codex-backups/SKILL-MAP-REMOVAL-2026-09-26T16-46-52-096Z`。測試表回復材料只留本機，不推 GitHub。
- 舊 Sites 第 6 版來源：專用產物 repository 的 `470f67445261318825126a698b85f2921d782bf2`。與 GitHub 原始碼 repository 是兩個不同來源，不混用 hash。
- 舊 Railway API deployment：`81e941f9-91e5-49b5-a735-e600e93839a6`。
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
- build、新部署、雲端表清理及部署後讀回：進行中。
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

使用 checkpoint 或本輪前的既有部署版本重新建置／部署，不 reset 他人後續修改、不回到原始迁移起點。若回復舊 API，先在同一隔離 DB 恢復歷史 0019 表結構和本輪專屬表備份，再啟動依賴該表的舊版本；其他业务資料不回滾。PRIVATE／Clerk／R2／正式資源與憑證不需更動。
