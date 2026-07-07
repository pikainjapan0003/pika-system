# 05 維護協議：規則怎麼長、怎麼瘦、怎麼死

## 1. 檔案權限分級

| 級別 | 檔案 | 規則 |
|---|---|---|
| L0 永不直改 | `CLAUDE.md`（Dev Handoff 協議）、`docs/order-step*.md` 既定 spec、`lib/api-zod` `lib/api-client-react` 生成物 | 要改先問使用者；生成物只能由 codegen 更新 |
| L1 改前先問 | `AGENTS.md` 的最小規則清單、`shippingFee.ts` 費率表、任何商業參數、`data/` 既有資料檔 | 提案＋理由＋後果，等使用者批准 |
| L2 可自行改 | `docs/ai-ops/*`（含本檔 Lessons Log）、`.agents/memory/*`、程式碼（依 03 檔判準與驗證）、新增文件 | 改完 read-back＋回報路徑 |

## 2. 踩坑寫回哪裡（兩個 log 的分工）

- **技術坑**（框架、工具、語法、build/test 的坑）→ 沿用既有慣例 `.agents/memory/`：一坑一檔＋更新 `MEMORY.md` 索引。
- **流程／制度坑**（派工失敗、驗證漏洞、規則衝突、模型調度錯誤）→ 本檔下方 Lessons Log。
- 判斷標準：這個坑「換一個 repo 還會踩」→ 技術坑；「換一個流程就不會踩」→ 制度坑。兩邊都像就寫制度坑。

## 3. 教訓格式（Lessons Log 每條照此格式）

```markdown
### YYYY-MM-DD - 事件標題
- 觸發情境：
- 發生錯誤：
- 根因：
- 正確做法：
- 要更新的規則：（沒有就寫「暫不升級，觀察是否再發生」）
- 可刪除或合併的舊規則：（沒有寫「無」）
```

## 4. 精簡規則（防膨脹，數字是硬門檻）

1. Lessons Log 超過 **20 條** → 必須整理：重複模式升級成上方永久規則或 03 檔判準，原始條目刪除。
2. `AGENTS.md` 超過 **150 行** → 把細節移到 `docs/ai-ops/*`，入口只留一行引用。
3. 同一規則出現 **3 次** → 保留 docs/ai-ops 一份，其他改引用。
4. 每次整理要在 Lessons Log 記一條「YYYY-MM-DD 整理紀錄：合併/刪除了什麼」。

## 5. 淘汰過時規則

- 規則引用的檔案／工具／模型已不存在 → 刪規則，Lessons Log 記一行。
- 規則被新規則涵蓋 → 刪舊留新。
- 不確定是否還適用 → 標 `[疑似過時 YYYY-MM-DD]`，兩次 session 後仍沒人需要它就刪。

## 6. 規則衝突處理

優先序（高→低）：**使用者當下指示 > CLAUDE.md 禁止事項 > AGENTS.md 最小規則 > docs/ai-ops 細則 > 歷史 spec**。
發現衝突：1) 按優先序執行；2) Lessons Log 記下衝突內容；3) 低優先序那條改成引用或刪除。不允許「兩條都留著下次再說」。

## 7. 未確認事實標註法

寫任何文件時，查不到的事實一律四件套：

```text
未確認：{事實內容}
原因：{為什麼查不到}
下次怎麼確認：{具體命令/URL/要問誰}
目前安全假設：{在確認前按什麼行動}
```

禁止用「應該」「大概」「通常」偽裝成已確認。

## 8. 一次性經驗 → 長期規則的升級路徑

1. 第一次發生 → Lessons Log（或 .agents/memory）一條。
2. 第二次發生同模式 → 升級：寫進 03 判準或 02 調度規則，附正例反例。
3. 影響每個 session 的開場行為 → 才進 AGENTS.md（一行＋引用）。
4. 反向也成立：AGENTS.md 裡三個月沒被用到的細節規則，降級回 docs/ai-ops。

---

## Lessons Log

### 2026-07-07 - 同一本機 clone 被兩個 AI session 同時操作，分支被互相覆蓋
- 觸發情境：Fable 5 主 session 在 `Desktop\pika-system` commit+push 期間，制度庫另一個 session 在同一目錄 `git reset` 回舊 commit，導致本機分支倒退、已 push 的檔案從磁碟消失（remote 未受損，靠 `git merge --ff-only origin/main` 恢復）。
- 發生錯誤：兩條工作線在同一個 working copy 上互踩；若當時尚未 push，工作會直接遺失。
- 根因：CLAUDE.md 的 A/B 協議只隔離了 dev-handoff 檔案，沒有隔離 git 分支與 working tree。
- 正確做法：**動 git 前先 `git status`＋`git log --oneline -3` 確認狀態與自己上一步一致；發現 HEAD 不是自己留下的樣子，先 `git fetch` 比對 origin，用 fast-forward 恢復，不得 force**；重要產出完成就立即 commit（＋授權時 push），不留在工作區過夜。
- 要更新的規則：已含在 06 檔「你不是唯一的手」；再犯就升級成 AGENTS.md 最小規則。
- 可刪除或合併的舊規則：無。

### 2026-07-07 - 初始化
- 觸發情境：Fable 5 制度建立 session。
- 發生錯誤：（非錯誤）記錄基準事實：pika-system 原不在本機，clone 至 `C:\Users\Lnovo\Desktop\pika-system`；成本/毛利模組與 Sheet 整合當時不存在；成本 Sheet 匿名 401 需 SA。
- 根因：—
- 正確做法：後續 session 開場照 AGENTS.md。
- 要更新的規則：無。
- 可刪除或合併的舊規則：無。
