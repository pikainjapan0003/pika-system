# AGENTS.md — pika-system（揪單／代購系統）AI 作業入口

> 所有模型（Sonnet / Opus / Haiku / Codex / 其他）每個 session 先讀這份。細節都在 `docs/ai-ops/*`，不要在這裡加長文。
> 本檔超過 150 行時必須把細節移出去（規則見 `docs/ai-ops/05-maintenance-protocol.md`）。

## 這個系統是什麼

代購／團購系統：即時上架商品 → 客人快速下單（含 7-11 店鋪選擇）→ 系統算成本與總額 → 老闆只負責包貨出貨。
核心不是炫技，而是：**老闆少算、少複製、少漏單；客人快速下單且看得到總額。**

## 開場流程（每個 session）

1. 讀本檔。
2. 確認任務類型，只讀對應文件，不要一次讀完全部：
   - 寫程式／改功能 → `docs/ai-ops/03-judgment-rubrics.md`（完成定義、高風險判準）
   - 要派 subagent → `docs/ai-ops/02-model-orchestration.md` + `docs/ai-ops/04-delegation-templates.md`
   - 踩坑了／要改規則 → `docs/ai-ops/05-maintenance-protocol.md`
   - 接手上個 session → `docs/ai-ops/06-future-session-letter.md`
   - 環境事實速查（指令、Sheet、gogo.gs）→ `docs/ai-ops/00-quick-diagnosis.md` 附錄
3. 規則優先序（永遠適用，高→低）：**使用者當下指示 > CLAUDE.md 禁止事項 > 本檔最小規則 > docs/ai-ops 細則 > 歷史 spec**。CLAUDE.md（Dev Handoff Relay A/B 協議）不可被本檔或 docs/ai-ops 任何內容覆寫（不 push、不 stage dev-handoff/ 與 .claude/）。

## 最小規則（違反任一條 = 任務不合格）

1. **不確定的 repo 事實必須查，不可猜。** 路徑、指令、欄位名都要工具實查；查不到寫「未確認＋確認方法」。
2. **大量讀取、掃 repo、查網頁、批次改檔，一律派 subagent 或分批工具**，主對話不要硬吞（>5 檔或 >500 行即算大量）。
3. **任何改檔任務完成前必須 read-back**：重新打開檔案確認內容，回報附檔案路徑。
4. **程式碼任務必須跑可用測試／typecheck**（root：`pnpm run typecheck`）；跑不了要寫明原因與替代驗證。
5. **成本、金流、訂單總額、物流費、客資 = 高風險區**：改前必讀 `docs/ai-ops/03-judgment-rubrics.md`「高風險改動」，至少用一筆樣本手算比對，不允許修改者自稱完成。
6. **gogo.gs 油價不可硬爬**：無官方穩定來源時，保留手動輸入油價／旅程成本（判準見 03 檔）。
7. **7-11 店鋪選擇是下單流程的一環**：任何改動都要保住「客人快速選店、老闆後台直接看到門市」，不是做地圖玩具。
8. **每次踩坑（>3 輪工具呼叫才解開的問題）都要寫回** `docs/ai-ops/05-maintenance-protocol.md` 的 Lessons Log。
9. **Google Sheet 是現有商業邏輯的證據**：不可嫌亂重做；先實讀欄位與公式，再抽成 domain model。Sheet 需 service account 才能讀（匿名 401）。
10. **同一子任務最多重試兩輪**，之後必須升級模型（帶失敗軌跡）或換路，不可原地重試。

## 本 repo 硬事實（2026-07-07 查證）

- pnpm workspace；`pnpm run typecheck` / `pnpm run build`（root package.json）。root 無 test script；API 測試用 Node 內建 `node:test`，完整指令見 `docs/ai-ops/01-session-plan.md` 速查（需 `--experimental-test-module-mocks` 與 `DATABASE_URL`；測試會寫真 DB——**不可對 production DB 跑**）。
- 主要程式：`artifacts/api-server`（Express 5 + Drizzle）、`artifacts/shop-app`（React+Vite）、`lib/db`（schema）、`lib/api-spec`（Orval codegen 來源，`lib/api-zod`、`lib/api-client-react` 是生成物勿手改）。物流 adapter（7-11／全家／郵局／黑貓）在 `artifacts/api-server/src/lib/logistics/`。部署：Replit autoscale。
- **成本／毛利計算目前不存在**（orders schema 只有 unitPrice/totalPrice/paidAmount/discountAmount）；Google Sheet 整合也不存在。這是待遷移核心，動工前必讀 `docs/ai-ops/03-judgment-rubrics.md`「Sheet 欄位遷移」。
- 歷史 spec 在 `docs/order-step*.md`（90 份，扁平）；技術踩坑筆記在 `.agents/memory/`（沿用，見 05 檔分工）。
- 禁止 push GitHub、禁止 stage `dev-handoff/` 與 `.claude/`（CLAUDE.md 規定）。commit message 用 kebab-case。
- 與使用者溝通用繁體中文；程式碼英文。
- **戰略層計畫（做什麼、順序、驗收、進度）在制度庫**：`C:\Users\Lnovo\Desktop\Claude library\projects\pika-system\BUYING_SYSTEM_ROADMAP.md`（2026-07-07 起）。本目錄 ai-ops 管「怎麼做」；兩邊衝突時優先序見該檔 §2b。成本 Sheet 欄位對照已落 `docs/ai-ops/10-cost-sheet-mapping.md`。

## 誠實條款

拆解、驗證、多樣本評審可以補執行品質；但模糊題、產品品味、商業取捨、客人體驗判斷，不能靠弱模型硬補——遇到就升級模型、找第二意見、或明說做不到。不要編造工具名、路徑、模型名、API 可用性。
