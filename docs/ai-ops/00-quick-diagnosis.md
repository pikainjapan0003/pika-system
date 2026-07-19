# 00 快速診斷：harness 最漏 token、最易失焦、最易出錯的十件事

> 讀者：Sonnet / Opus / Haiku 等未來 session。每一項都有「症狀 → 傷害 → 修法 → 操作規則 → 正例/反例」。
> 本檔由 Fable 5 於 2026-07-07 建立，依據：pika-system repo 實掃、Claude library 制度庫經驗、本機環境實測。

---

## 1. 重複講同樣規則

- **症狀**：同一條規則（例如「不要 push」「用繁中溝通」）在 CLAUDE.md、對話、handoff、commit message 裡各講一遍；每個 session 又重新解釋一次。
- **為什麼漏 token**：規則每重複一次就吃一次 context；更糟的是兩份規則微妙不同時，弱模型會兩邊都想遵守而卡住。
- **對代購系統的傷害**：入口檔膨脹 → 每個 session 開場就燒掉幾千 token → 真正做成本計算時 context 不夠。
- **修法**：規則只有一個 home。入口檔（AGENTS.md）只放一行 + 引用；細節放 `docs/ai-ops/*`。
- **操作規則**：發現同一規則出現 ≥3 處時，保留 `docs/ai-ops/*` 那份，其他改成一行引用。改完 read-back 兩份檔確認沒有殘留矛盾。
- **正例**：AGENTS.md 寫「派工規則見 docs/ai-ops/02-model-orchestration.md §2」。
- **反例**：把整段派工三件套複製進 AGENTS.md、CLAUDE.md、和每個模板裡。

## 2. 主模型親自掃大量檔案

- **症狀**：主對話一個一個 Read 幾十個檔、自己 grep 全 repo、自己讀整包 diff。
- **為什麼漏 token**：每個檔案內容都進主對話 context，之後每一輪都要重複付費（cache miss 時整包重讀）。
- **傷害**：掃完 repo 後 context 剩不多，真正要改成本公式時已經失焦或被壓縮。
- **修法**：大量讀取一律派 Explore/general-purpose subagent，只收結論＋路徑:行號。
- **操作規則**：預估要讀 >5 個檔或 >500 行才能回答的問題 → 派 subagent。主對話只讀「即將要改的那個檔」。
- **正例**：本 session 用 Explore agent 掃 pika-system 805 檔，主對話只讀了 CLAUDE.md 和 package.json。
- **反例**：主對話 Read 了 20 個 logistics adapter 檔案「先了解一下」，然後才開始做任務。

## 3. 沒有 read-back 就宣稱完成

- **症狀**：回報「已完成」但沒有重新打開檔案確認內容真的寫進去、寫對位置。
- **為什麼出錯**：Write/Edit 可能寫錯路徑、被 hook 攔截、內容被截斷；弱模型特別容易把「我打算寫」記成「我寫了」。
- **傷害**：使用者以為制度已落地，下個 session 讀不到 → 同樣的坑再踩一次。
- **修法**：完成定義 = 檔案已寫入 + read-back 看過新內容 + 回報附路徑。
- **操作規則**：見 `03-judgment-rubrics.md`「何時算真的完成」。回報格式必含：檔案路徑、驗證方式、殘留風險。
- **正例**：「已更新 shippingFee.ts:42-58，read-back 確認新費率表存在，typecheck 通過。」
- **反例**：「物流費計算已修正。」（沒路徑、沒驗證）

## 4. 沒查 repo 就猜架構

- **症狀**：憑印象說「這個 repo 應該有 Express server」「成本計算應該在 utils 裡」，然後基於猜測寫 code 或制度。
- **為什麼出錯**：pika-system 實際是 pnpm workspace + Hono/API server + 多個 artifacts，跟「典型 Node 專案」不同；猜錯 = 白做。
- **傷害**：在錯的路徑建檔、引用不存在的模組、跟現有 7-11 adapter 重工。
- **修法**：任何 repo 事實（路徑、指令、依賴）都要 Glob/Grep/Read 驗證後才能寫進回報或文件。
- **操作規則**：寫下任何 `路徑:行號` 之前，該路徑必須在本 session 被工具實際看過。查不到就寫「未確認」。
- **正例**：「typecheck 指令是 `pnpm run typecheck`（package.json:9）」。
- **反例**：「跑 `npm test` 驗證」——本 repo 用 pnpm，且 root 沒有 test script。

## 5. 沒查 Sheet 就猜成本欄位

- **症狀**：直接假設 Sheet 有「日圓成本、匯率、重量」等欄位並開始寫遷移程式。
- **事實（2026-07-07 實測）**：成本 Sheet（17U5QBLq…）匿名讀取回 **401**，必須用 service account（SA 金鑰在使用者本機，參考嗶咔報價流程）或請使用者匯出 CSV。
- **傷害**：猜錯欄位 → 成本公式接錯 → 報價錯 → 整團虧損。這是本系統最貴的錯誤類型。
- **修法**：讀不到 Sheet 時只有兩條路：(a) 用 SA 憑證實讀；(b) 請使用者匯出 CSV 貼上或放進 repo `data/`。禁止第三條路「憑常識假設欄位」。
- **操作規則**：任何引用 Sheet 欄位名的程式或文件，欄位名必須來自實讀的 Sheet 或使用者提供的匯出檔，並在文件裡標註讀取日期。
- **正例**：「欄位 `單件交通費` 來自 2026-07-07 匯出的 gid=0 CSV 第 3 欄。」
- **反例**：「Sheet 通常會有 exchange_rate 欄位，先照這個寫。」

## 6. 把一次性任務和長期制度混在一起

- **症狀**：修一個 bug 順手在 AGENTS.md 加三條只跟這個 bug 有關的規則；或反過來，把應該長期化的教訓只留在對話裡。
- **傷害**：入口檔變成 lessons 垃圾場；真正的長期規則被淹沒。
- **修法**：一次性經驗先進 `05-maintenance-protocol.md` 的 Lessons Log；出現第二次才升級成規則；升級路徑見該檔 §10。
- **操作規則**：改 AGENTS.md 前自問「這條規則未來 10 個 session 都用得到嗎？」不是 → 進 Lessons Log。
- **正例**：「FamilyMart importer 的日期格式坑」→ Lessons Log 一條。
- **反例**：在 AGENTS.md 加「注意 2026-07-07 那次 importer 日期格式問題」。

## 7. 遇到可能被擋的網站硬做整合（gogo.gs 型錯誤）

- **症狀**：發現 gogo.gs 沒有 API，就開始寫 HTML scraper、繞 JS 渲染、調 UA 假裝瀏覽器。
- **事實（2026-07-07）**：gogo.gs 首頁帶 UA 可回 200，但**未發現官方 API**（未確認；確認方法見 `03-judgment-rubrics.md`「油價整合」）。
- **傷害**：脆弱爬蟲 = 每次改版就壞 = 成本計算靜默用到舊油價 = 錯的成本分攤。壞掉的自動化比手動輸入更危險。
- **修法**：整合前先過 `03-judgment-rubrics.md` 的可行性判準（官方 API？ToS 允許？穩定 endpoint？失敗可偵測？）。任一不過 → 用手動輸入油價方案（同檔有設計）。
- **正例**：「gogo.gs 無官方 API，保留 `trip_fuel_cost` 手動輸入欄位，UI 附 gogo.gs 連結供老闆查價。」
- **反例**：用 regex 從 gogo.gs HTML 撈價格，沒有失敗告警。

## 8. 沒有把踩坑寫回文件

- **症狀**：session 內解決了一個難纏問題（例如 pnpm workspace filter 語法、7-11 匯入格式），下個 session 從零再踩一次。
- **傷害**：弱模型沒有跨 session 記憶，不落檔 = 教訓蒸發 = 重複付 debug 成本。
- **修法**：每次踩坑，當場寫進 `05-maintenance-protocol.md` Lessons Log（格式在該檔），不要等收尾。
- **操作規則**：判斷標準——「這個坑花了我 >3 輪工具呼叫才解開」→ 必須落檔。
- **正例**：解開 importer 編碼問題後立刻寫 Lessons Log，含觸發情境與正確做法。
- **反例**：在最終回報裡提一句「過程中也解決了編碼問題」，然後沒寫檔。

## 9. 沒有驗收條件就派工

- **症狀**：派 subagent 時只寫「幫我整理成本相關檔案」，沒說要什麼格式、怎樣算完成。
- **傷害**：subagent 回來一大篇散文，主對話還要再花 token 消化重問；或回報看似完整實則猜的。
- **修法**：派工必含三件套：目標與動機、驗收條件、回報格式。模板在 `04-delegation-templates.md`。
- **正例**：見 `04-delegation-templates.md` 各模板的填好範例。
- **反例**：「請研究一下物流模組。」

## 10. 同一個錯誤用同一模型反覆重試

- **症狀**：Haiku/Sonnet 同一子任務失敗，換個措辭再叫同一模型試第三、四次。
- **傷害**：每次重試都是全額 token；失敗模式相同時重試成功率極低；最後還是要升級，等於付了兩份錢。
- **修法**：升降級路徑硬規則——同一子任務最多重試兩輪；第二次失敗必須「帶完整失敗軌跡」升級模型或換路（縮小範圍／加驗證／改人工）。見 `02-model-orchestration.md` §5。
- **正例**：「Sonnet 兩次都無法正確解析 7-11 匯入格式，附上兩次的輸入輸出，升級 Opus 判斷是否格式本身有歧義。」
- **反例**：同一個 prompt 對 Haiku 重送四次，只改了開頭一句「請更仔細」。

---

## 附錄：本 session 環境實查結果（2026-07-07）

| 項目                 | 結果                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| pika-system 本機位置 | 原本不在本機；本 session clone 到 `C:\Users\Lnovo\Desktop\pika-system`（depth 1）                                                                     |
| AI 指示檔            | repo 內原有 `CLAUDE.md`（Dev Handoff Relay A/B 協議，禁止 push、禁止 stage dev-handoff/.claude）；本 session 新增 `AGENTS.md` + `docs/ai-ops/*`       |
| Package manager      | pnpm workspace（package.json:6 preinstall 強制 pnpm）                                                                                                 |
| 指令                 | `pnpm run typecheck`、`pnpm run build`（package.json:8-9）；root 無 test/lint script（各 workspace 見 01-session-plan.md）                            |
| 部署                 | 有 `replit.md`/`replit.nix`，推測 Replit 相關（未確認實際部署狀態）                                                                                   |
| 成本 Sheet           | 匿名 401；**SA 可讀已實證（2026-07-07，cc-663@my-openclaw-491003）**，金鑰在使用者 Windows 桌面（勿寫進 repo）。欄位對照見 `10-cost-sheet-mapping.md` |
| gogo.gs              | **已定案**：官方 API 已終止支援（api.gogo.gs 公告），不整合，手動輸入（見 `11-fuel-price-research.md`）                                               |
| 可用模型             | 本 session 的 Agent 工具可指定 `sonnet` / `opus` / `haiku` / `fable`；未來 session 以當下環境實查為準，不可照抄                                       |
