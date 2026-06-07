# Claude Code Instructions — 揪單

## Dev Handoff Relay (必讀)

每次 Claude Code 完成任何任務、回覆任何訊息後，**必須在輸出最終回覆之前**，把本輪內容寫入**自己的固定 handoff 檔案**。

### Fixed Latest File Mode（預設模式）

每個 Claude Code 有自己的固定 handoff 檔案，**單人或多人均使用此模式**：

```
dev-handoff/
  latest-A.json    ← Claude A 的專屬 handoff 檔案
  latest-A.md      ← Claude A 的專屬 handoff 摘要
  latest-B.json    ← Claude B 的專屬 handoff 檔案
  latest-B.md      ← Claude B 的專屬 handoff 摘要
  latest.json      ← legacy / optional，不是本模式必要輸出
```

#### 檔案指派

| Claude Code | 只能寫入 |
|-------------|---------|
| Claude A | `dev-handoff/latest-A.json`、`dev-handoff/latest-A.md` |
| Claude B | `dev-handoff/latest-B.json`、`dev-handoff/latest-B.md` |

#### 嚴格禁止（無例外）

1. **Claude A 不得修改**：
   - `dev-handoff/latest.json`
   - `dev-handoff/latest-B.json`
   - `dev-handoff/latest-B.md`

2. **Claude B 不得修改**：
   - `dev-handoff/latest.json`
   - `dev-handoff/latest-A.json`
   - `dev-handoff/latest-A.md`

3. **任何情況下**：
   - 不得 stage `dev-handoff/`
   - 不得 stage `.claude/`
   - 不得 push GitHub
   - 不得輸出 secrets / token / env / credentials
   - 不得因 A/B 任務完成就自動更新 `dev-handoff/latest.json`

4. `dev-handoff/latest.json` 是 **legacy / optional** 檔案，不是本模式的預設輸出。

5. 使用者**沒有明確要求**時，不得整合 A/B、不得更新 `dev-handoff/latest.json`。

#### 適用情境（無例外）

- 修改了程式碼 → 寫入自己的 latest-A.json / latest-B.json
- 只回覆問題、沒有改檔案 → 也寫入
- 任務被 block 或 defer → 也寫入
- 輸出規格 / 文件 → 也寫入
- 驗收 / QA 回覆 → 也寫入

#### rawReply 規則（Exact Copy — 嚴格執行）

`rawReply` 是終端機最終回覆原文的 **byte-for-byte exact copy**，寫入自己的 latest-A.json / latest-B.json。

**必須做到**：

- 終端機輸出什麼，`rawReply` 就放什麼，一字不漏
- 所有 markdown、標題、表格、清單、程式碼區塊、符號、標點、換行全部原樣保留
- 中文、英文、數字、特殊符號全部原樣保留

**嚴格禁止**：

- 不可重寫（rewording）
- 不可摘要（summarizing）
- 不可修飾（paraphrasing）
- 不可刪減（omitting anything）
- 不可補充（adding anything）
- 不可只寫「本輪完整回覆」或類似佔位符

**正確作法**：

1. 先在 thinking 中組好完整回覆文字（`finalReplyText`）
2. 用 Write tool 把 `finalReplyText` 原封不動寫入 `dev-handoff/latest-A.json`（或 B）的 `rawReply`
3. 再把 `finalReplyText` 原封不動輸出為終端機最終回覆

**`rawReply` 與終端機輸出來自同一份 `finalReplyText`，不得分別手動重寫兩份。**

#### latest-A.json / latest-B.json 格式

```json
{
  "handoffVersion": "fixed-latest-v1",
  "mode": "fixed-latest-file",
  "worker": "claude-a",
  "taskTitle": "<task title>",
  "branch": "<current git branch>",
  "status": "completed | blocked | needs-review",
  "summary": [
    "<change summary item>"
  ],
  "modifiedFiles": [
    "<file path>"
  ],
  "testsRun": [
    "<test command or manual check>"
  ],
  "testsNotRun": [
    {
      "name": "<test name>",
      "reason": "<reason>"
    }
  ],
  "risks": [
    "<risk>"
  ],
  "pendingQuestions": [
    "<question>"
  ],
  "rawReply": "<exact final reply from this Claude Code>",
  "updatedAt": "<ISO timestamp>"
}
```

**欄位說明**：

- `worker`：Claude A 固定填 `"claude-a"`，Claude B 固定填 `"claude-b"`
- `rawReply`：本次最終回覆的 exact copy，不可摘要、不可重寫
- 不可把未執行測試寫成已通過
- 不可寫 `production ready`，除非任務明確要求且有完整測試證據
- 不可輸出 secrets / token / env / credentials

#### latest-A.md / latest-B.md 格式

```markdown
# Claude Handoff：claude-a

## 任務
<task title>

## 分支
<branch>

## 變更摘要
- ...

## 修改檔案
- ...

## 測試結果
- 已執行：
  - ...
- 未執行：
  - 原因：...

## 風險與待確認
- ...

## 最終回覆
<rawReply exact copy>
```

### 重要限制

- **不要把 dev-handoff/ 加入 git**（已在 .gitignore）
- **不要 stage .claude/**
- **不要在 JSON 內容中寫入任何 secret、token、key、password、URL**
- 若有 secret 疑慮，對應欄位填 `"[REDACTED]"`

### 原因

使用者的工作流是：
```
ChatGPT 給指令
→ 使用者貼給 Claude Code（A 或 B）
→ Claude Code 執行並更新自己的 dev-handoff/latest-A.json 或 latest-B.json
→ 使用者在 /dev/handoff 一鍵複製對應 channel
→ 貼給 Codex 接續上下文
```

不更新 = Codex 讀到舊的上下文 = 三方工具斷線。

---

### Optional Summary Task（非必要）

**Fixed Latest File Mode 不需要 Final Consolidation。**

- A/B Worker 完成後，各自的 `latest-A.json` / `latest-B.json` 即為正式交接結果。
- 使用者**沒有明確要求**時，不得整合 A/B、不得更新 `dev-handoff/latest.json`。
- `dev-handoff/latest.json` 不是本模式的預設輸出。

**只有使用者明確要求「另外產生總結」時**，才可執行以下流程：

1. 讀取 `dev-handoff/latest-A.json` 與 `dev-handoff/latest-B.json`。
2. 執行 `git status` / `git diff` 確認 repo 實際狀態。
3. 產生總結文字，依使用者指定格式輸出。
4. 若使用者明確要求更新 `dev-handoff/latest.json`，才寫入；否則不寫。
5. 不得 stage `dev-handoff/`、不得 stage `.claude/`。

---

## Claude A / Claude B Worker 身份判定規則

本專案使用 Fixed Latest File Mode 時，Claude 的 worker 身份以「本次任務提示詞」為最高優先級。

如果本次任務提示詞明確寫：

- 「你是 Claude A」或「worker = claude-a」
  - 本次 worker 必須視為 `claude-a`
  - 本次只能更新：
    - `dev-handoff/latest-A.json`
    - `dev-handoff/latest-A.md`

- 「你是 Claude B」或「worker = claude-b」
  - 本次 worker 必須視為 `claude-b`
  - 本次只能更新：
    - `dev-handoff/latest-B.json`
    - `dev-handoff/latest-B.md`

不得用以下任何資訊覆蓋本次任務提示詞指定的 worker 身份：

- 上一輪任務使用的 worker
- 歷史 handoff 內容
- `dev-handoff/latest-A.json` 或 `dev-handoff/latest-B.json` 的既有內容
- 目前 Git 分支名稱
- 目前對話習慣
- Claude 自我推定
- 舊的 CLAUDE.md 記憶
- 任務是否由同一個模型或同一個視窗執行

Claude A / Claude B 是「本次任務指定的工作線」，不是固定人格或永久身份。

同一個 Claude 執行環境，今天可以被使用者指定為 Claude A，明天也可以被使用者指定為 Claude B。

如果本次任務提示詞沒有明確指定 Claude A 或 Claude B，必須停止並詢問使用者，不得自行推定 worker 身份。

### 禁止跨 worker 修改 handoff

- worker = `claude-a` 時，不得修改：
  - `dev-handoff/latest-B.json`
  - `dev-handoff/latest-B.md`

- worker = `claude-b` 時，不得修改：
  - `dev-handoff/latest-A.json`
  - `dev-handoff/latest-A.md`

- 任何 worker 都不得自行更新：
  - `dev-handoff/latest.json`

除非使用者明確提出「整合 handoff」或「更新 latest.json」任務。

---

## Dev Handoff Relay 顯示原則

Dev Handoff Relay 應分線顯示 A / B 狀態：

- Claude A 區塊固定讀取 `dev-handoff/latest-A.json`
- Claude B 區塊固定讀取 `dev-handoff/latest-B.json`

Relay 不應自動把 A / B 合併成單一「最新 handoff」狀態。
Relay 不應用 `updatedAt` 較新的 handoff 覆蓋另一條工作線。
Relay 不應依賴 `dev-handoff/latest.json` 作為 A/B 工作線的唯一狀態來源。

A blocked 就讓 A 顯示 blocked。
B completed 就讓 B 顯示 completed。
A / B 是並行工作線，不是排行榜。

---

## Git 規範

- 每次 commit 前確認 `.claude/` 未被 stage
- `dev-handoff/` 已在 .gitignore，不可 commit
- commit message 格式：`kebab-case-description`

## 語言

- 程式碼：英文
- 與使用者溝通：繁體中文
