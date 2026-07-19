# AI 開工包（給 ChatGPT 規劃審查／給 Claude Code 寫代碼）

> 版本：2026-07-07。**這份檔案自給自足**：ChatGPT 看不到 repo，把本檔整份上傳或貼給它即可開始規劃/審查；Claude Code 在 repo 內工作，本檔告訴它第一步讀什麼。
> 人類版摘要在同目錄 `PROJECT_PLAN.md`（短版，給老闆看）；本檔是 AI 詳細版。兩者衝突以 repo 內 `docs/ai-ops/*` 為準。

---

## 0. 三方分工與工作流程（老闆定的）

```text
ChatGPT   ＝ 規劃與審查。看不到 repo；依據＝本檔＋老闆貼上的檔案/回報。
Claude Code＝ 寫代碼。在 repo 內；開場必讀 AGENTS.md；依 CLAUDE.md 需被指定 worker 身份（A 或 B）。
老闆       ＝ 傳話與拍板。把 ChatGPT 的任務單貼給 Claude Code；把 Claude Code 的回報（dev-handoff/latest-A.md 或 latest-B.md 一鍵複製）貼回 ChatGPT。
```

一輪標準流程：

1. 老闆把「本檔＋要做的事」給 ChatGPT → ChatGPT 產出**任務單**（格式見 §6）。
2. 老闆把任務單貼給 Claude Code，**開頭必須寫「你是 Claude A」或「你是 Claude B」**（repo 的 CLAUDE.md 硬規定，沒寫它會停下來問）。
3. Claude Code 做完 → 自動寫入 `dev-handoff/latest-A.md`（或 B）→ 老闆複製貼回 ChatGPT。
4. ChatGPT 按 §7 審查清單審查 → 通過就進下一任務；不通過就出修正任務單（同一問題最多兩輪，之後必須換做法，不可原地重試）。

---

## 1. 專案是什麼

台灣代購／團購系統「揪單」（repo：github.com/pikainjapan0003/pika-system，本機 `C:\Users\Lnovo\Desktop\pika-system`）。
核心：**老闆少算、少複製、少漏單；客人快速下單、馬上看到總額。** 老闆最終只負責包貨出貨。

### 1a. 已完成（不要重做，規劃時當作既有能力）

- 商品上架、訂單管理、公開下單頁（客人不用登入）
- 7-11／全家選店：客人選店→店號店名回填訂單→後台看得到門市
- 四家物流 adapter（7-11、全家、郵局、黑貓）＋貨態追蹤 worker（自動同步收尾中）
- 固定運費表（`artifacts/api-server/src/lib/shippingFee.ts`）
- 訂單狀態機（pending→awaiting_payment→preparing→shipped→completed／cancelled）
- 出貨單／揀貨清單列印
- **沒有的**：成本／毛利計算（=接下來的主線）、Google Sheet 整合、第三方金流（目前手動記付款）

### 1b. 技術棧（Claude Code 用；ChatGPT 規劃時知道即可）

- pnpm workspace（強制 pnpm）。Node 24、TypeScript 5.9。
- 後端 `artifacts/api-server`：Express 5＋Drizzle ORM（PostgreSQL）。前端 `artifacts/shop-app`：React＋Vite＋Tailwind 4，Clerk 登入（後台）。
- API 規格 `lib/api-spec`（OpenAPI→Orval codegen→`lib/api-zod`、`lib/api-client-react`，生成物不可手改，改了 spec 要重跑 codegen）。
- DB schema `lib/db`（drizzle-kit push）。部署 Replit autoscale。
- 指令：`pnpm run typecheck`／`pnpm run build`；API 測試 `node --experimental-test-module-mocks --import tsx/esm --test src/routes/<name>.test.mjs`（在 artifacts/api-server 下；需 DATABASE_URL，**會寫真 DB，禁止指向 production**）。
- Git：commit message kebab-case；**AI 不准 push**（老闆授權才推）；不准 stage `dev-handoff/`、`.claude/`。

---

## 2. 成本的兩條線（老闆 2026-07-07 拍板，規劃時不可混）

1. **交通成本分攤線（現行主線）**：把一趟行程的交通費用平均分攤到每件商品。資料只用 Google Sheet「規劃成本暫存區」分頁。→ 規格已定案，見 §3。
2. **整體成本計算線（凍結）**：營收、毛利、優惠（滿免運/滿件匯率優惠）、固定/變異費用分類、1.5% 手續費範圍等。**有 5 個問題老闆還沒拍板（記錄在 repo `docs/ai-ops/12-owner-decisions.md` Q2/3/4/6/7），解凍前禁止規劃實作。**
3. 另外兩條老闆提過的未來線（都先不做）：匯率計算機；油價自動抓取（**已定案不做**：gogo.gs 官方 API 已終止服務，油價由老闆手填，UI 附連結）。

---

## 3. 現行任務：交通成本分攤模組（已可開工）

完整規格在 repo `docs/ai-ops/13-transport-cost-spec.md`。摘要（ChatGPT 審查時可直接用這裡的數字）：

### 3a. 資料模型

- `trip`（一趟）：名稱、**匯率（每趟一個，老闆手填，decimal）**、備註。
- `trip_route`（趟內一條路線，對應 Sheet 一列）：地區標題（唯一鍵）、起點、終點、電車費、油費、停車費、紙板費、境內運費、包裹件數（皆日圓手填，可 0）、預估件數（整數>0）、ETC 費（預設＝30×預估件數，可人工覆寫）。所有計算欄保留人工覆寫＋覆寫標記。

### 3b. 公式（單一真相；來源＝Sheet 公式原文＋老闆三定案）

```text
手續費1.5%   = (紙板費 + 境內運費) × 0.015          ← 只抽這兩項，不抽 ETC/油/停車
總計(日圓)   = ETC + 電車 + 油 + 停車 + 紙板 + 境內運費 + 手續費
單件境內運   = (紙板費 + 境內運費) ÷ 預估件數
單件交通費   = (ETC + 電車 + 油 + 停車 + 手續費) ÷ 預估件數
最後單件成本 = (單件境內運 + 單件交通費) × 匯率     ← 單位台幣，一定乘匯率（老闆定案）
```

- 進位（老闆定案）：內部全程 decimal 不進位；只在顯示層四捨五入取整數台幣。
- 防呆（必做）：預估件數 0/空/負 → 擋下提示；匯率空 → 擋下提示（**不可當 0 默默算**）；其他日圓欄空視為 0。

### 3c. 驗收用測試樣本（Sheet 真實資料，已人工逐步驗算）

**樣本 A（新千歲空港）**：ETC 5400、電車 0、油 8371、停車 5000、件數 180、紙板 1360、境內運費 6136、匯率 0.199
→ 手續費 112.44；總計 26379.44；單件境內運 41.6444444…；單件交通費 104.908；**最後單件成本 29.16393644**（顯示 29）。
**樣本 B（小樽）**：最後單件成本＝22.4166535。
**樣本 C（邊界）**：件數 0→擋下；匯率空→擋下；全 0＋件數 1＋匯率 0.2→成本 0。

### 3d. 實作驗收條件（Claude Code 交付、ChatGPT 審查都用這份）

1. 純函式模組放 `lib/`，不依賴 route/UI；DB 變更走 drizzle。
2. `pnpm run typecheck` 通過；樣本 A/B/C 以 node:test 全過。
3. 回報附樣本 A 逐步計算輸出 vs 預期值比對表。
4. 金額類＝高風險：不可只由實作者自稱完成；另開 fresh session 或由 ChatGPT 獨立手算一筆比對。
5. commit 不 push（等老闆授權）。

### 3e. 之後的排程（做完 3d 才輪到）

- 第 2 步：商品掛 trip_route，商品自動背「單件交通成本」；地區找不到要顯示警告不可默默 0。
- 第 3 步（需老闆點頭）：單件毛利顯示 → 訂單毛利 → 每趟總毛利；整體成本線解凍（先答完 Q2/3/4/6/7）。

---

## 4. repo 文件地圖（Claude Code 開場用；ChatGPT 想深挖時請老闆貼對應檔）

| 檔案                                    | 是什麼                                                      | 誰讀                           |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `AGENTS.md`                             | AI 作業入口＋十條最小規則                                   | Claude Code 每次開場必讀       |
| `CLAUDE.md`                             | Dev Handoff A/B 協議（worker 身份、handoff 格式、禁 push）  | Claude Code                    |
| `docs/ai-ops/00`～`06`,`99`             | 制度細則（診斷/開場/派工/判準/模板/維護/交接/審查紀錄）     | Claude Code 按任務類型選讀     |
| `docs/ai-ops/10-cost-sheet-mapping.md`  | 成本 Sheet 21 分頁實讀對照（欄位＋公式原文＋12 條未確認項） | 兩者（審成本題時貼給 ChatGPT） |
| `docs/ai-ops/12-owner-decisions.md`     | 老闆拍板紀錄（已答 3 題＋凍結 5 題）                        | 兩者                           |
| `docs/ai-ops/13-transport-cost-spec.md` | **現行任務的實作規格**                                      | 兩者                           |
| `docs/order-step*.md`（90 份）          | 歷史功能 spec                                               | 需要才查，別全讀               |
| `docs/plan/PROJECT_PLAN.*`              | 老闆看的短版計畫（md/docx/pdf）                             | 老闆                           |

---

## 5. 鐵律（ChatGPT 出任務單時要寫進去；Claude Code 本來就受制度約束）

1. 不確定的 repo 事實必須查證，不可猜；查不到標「未確認＋確認方法」。
2. **成本、金流、訂單總額、物流費、客資＝高風險**：改動必附一筆樣本逐步手算；不可自驗收工。
3. 公式歧義不准猜：新歧義一律追加到 `12-owner-decisions.md` 等老闆答。
4. 商業參數（費率、利潤率、優惠門檻）只有老闆能定，AI 不可發明。
5. 同一問題同一模型最多重試兩輪，之後換做法或升級。
6. 每次改檔完成前 read-back；程式必跑 typecheck＋可用測試。
7. 生成物（lib/api-zod、lib/api-client-react）不可手改。
8. 不 push、不 stage dev-handoff/ 與 .claude/、不碰 production DB。

## 6. 【模板】老闆貼給 Claude Code 的任務單（ChatGPT 照這個格式產出）

```text
你是 Claude A。（或 Claude B——必寫，否則它會停下來問）

任務目標：
（一句話＋為什麼）

開工前必讀：
AGENTS.md、docs/ai-ops/13-transport-cost-spec.md（本任務規格）

要做的事：
1. …
2. …

禁止事項：
不 push；不動生成物；公式照 13 檔不可自創；歧義追加 12 檔後停下回報。

驗收條件：
1. pnpm run typecheck 通過。
2. 樣本 A/B/C 測試通過（13 檔 §5）。
3. 回報附樣本 A 逐步計算 vs 預期比對表。
4. 列出改了哪些檔（路徑）＋殘留風險。

回報格式：
照 CLAUDE.md 寫入 dev-handoff/latest-A.md；結論先行，不要長篇推理。
```

## 7. 【模板】ChatGPT 審查清單（收到 Claude Code 回報後逐條打勾）

```text
1. 回報有沒有列出具體檔案路徑？沒有＝退回。
2. typecheck／測試結果是不是「原文貼上」而不是一句「都通過」？
3. 樣本 A 比對表在嗎？自己重算一次：手續費=(1360+6136)×0.015=112.44；
   最後單件成本=(41.6444444+104.908)×0.199=29.16393644。對不上＝退回。
4. 防呆：件數 0 與匯率空是否「擋下」而非算出 0？
5. 有沒有偷改測試期望值來讓測試變綠？（比對 13 檔 §5 的數字）
6. 有沒有動到規格外的檔案（特別是生成物、費率表）？有＝要求解釋。
7. 有沒有新歧義被「順手假設」掉？有＝退回，要求追加 12 檔。
8. 同一問題已退回兩次？→ 不要再退第三次，改拆小任務或換做法。
```

## 8. 老闆使用說明（最短路徑）

1. 把本檔上傳給 ChatGPT，說「照 §6 幫我出第一張任務單：實作交通成本分攤模組」。
2. 把任務單複製貼給 Claude Code（記得開頭「你是 Claude A」）。
3. Claude Code 做完，開 `dev-handoff/latest-A.md` 全選複製，貼回 ChatGPT 說「照 §7 審查」。
4. ChatGPT 說通過 → 你抽查 5 分鐘（拿 Sheet 新千歲那列數字對系統）→ 跟 Claude Code 說「授權 push」。
