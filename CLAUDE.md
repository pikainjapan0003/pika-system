# Claude Code Instructions — 揪單

## Dev Handoff Relay (必讀)

每次 Claude Code 完成任何任務、回覆任何訊息後，**必須在輸出最終回覆之前**，把本輪內容寫入：

```
dev-handoff/latest.json
```

### 適用情境（無例外）

- 修改了程式碼 → 寫入
- 只回覆問題、沒有改檔案 → 也寫入
- 任務被 block 或 defer → 也寫入
- 輸出規格 / 文件 → 也寫入
- 驗收 / QA 回覆 → 也寫入

### rawReply 規則（Exact Copy — 嚴格執行）

`rawReply` 是終端機最終回覆原文的 **byte-for-byte exact copy**。

#### 必須做到

- 終端機輸出什麼，`rawReply` 就放什麼，一字不漏
- 所有 markdown、標題、表格、清單、程式碼區塊、符號、標點、換行全部原樣保留
- 中文、英文、數字、特殊符號全部原樣保留

#### 嚴格禁止

- 不可重寫（rewording）
- 不可摘要（summarizing）
- 不可修飾（paraphrasing）
- 不可翻譯（translating）
- 不可調整順序（reordering）
- 不可改標題（changing headings）
- 不可改標點（changing punctuation）
- 不可刪減（omitting anything）
- 不可補充（adding anything）
- 不可只寫「本輪完整回覆」或類似佔位符

#### 正確作法（Single Source of Truth）

1. 先在 thinking 中組好完整回覆文字（`finalReplyText`）
2. 用 Write tool 把 `finalReplyText` 原封不動寫入 `dev-handoff/latest.json` 的 `rawReply`
3. 用 Bash tool 執行驗證 script：`node scripts/write-dev-handoff.mjs`
   - script 自動計算 `rawReplySha256`（SHA-256 hex）
   - script 自動計算 `rawReplyLength`（字元數）
   - script 寫回 `latest.json`
4. 再把 `finalReplyText` 原封不動輸出為終端機最終回覆

**`rawReply` 與終端機輸出來自同一份 `finalReplyText`，不得分別手動重寫兩份。**

`summary` 才是放一段話摘要的地方。違反此規則 = Codex 拿到殘缺內容 = 三方工具斷線。

### JSON 格式

```json
{
  "generatedAt": "<由 scripts/write-dev-handoff.mjs 自動設定為當下時間>",
  "rawReply": "<finalReplyText 原文，byte-for-byte exact copy，不可修改>",
  "rawReplyMode": "exact_final_reply",
  "rawReplySha256": "<由 scripts/write-dev-handoff.mjs 自動填入>",
  "rawReplyLength": "<由 scripts/write-dev-handoff.mjs 自動填入>",
  "summary": "<一段話摘要，說明本輪做了什麼>",
  "filesChanged": ["<相對路徑>", "..."],
  "gitLog": "<git log --oneline -5 的輸出>",
  "gitStatus": "<git status --short 的輸出>",
  "stagedChanges": "<staged 的內容摘要，無則填空字串>",
  "claudeUntracked": <true 若 .claude/ 為 untracked，否則 false>,
  "acceptedFixes": ["<已完成的修改項目>", "..."],
  "blockedDeferred": ["<被 block 或 defer 的項目>", "..."],
  "nextTask": "<建議的下一步>",
  "finalStatus": "<completed | blocked | deferred | info | test>"
}
```

### 驗證 script

```bash
# 在 workspace root 執行（寫完 rawReply 後立即執行）
node scripts/write-dev-handoff.mjs
```

輸出範例：
```
[write-dev-handoff] Verification fields written:
  rawReplyLength : 1234 chars
  rawReplySha256 : a3f9...e7b2
```
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
→ 使用者貼給 Claude Code
→ Claude Code 執行並更新 dev-handoff/latest.json
→ 使用者在 /dev/handoff 一鍵複製
→ 貼給 Codex 接續上下文
```

不更新 = Codex 讀到舊的上下文 = 三方工具斷線。

---

### Single-Claude Mode（預設）

只有一個 Claude Code 工作時，維持原本 exact workflow：

1. 先在 thinking 中組好完整回覆文字（`finalReplyText`）
2. 用 Write tool 把 `finalReplyText` 原封不動寫入 `dev-handoff/latest.json` 的 `rawReply`
3. 執行 `node scripts/write-dev-handoff.mjs`
4. 再把 `finalReplyText` 原封不動輸出為終端機最終回覆

---

### Fixed Handoff Channel Mode

當使用者明確表示有兩個或多個 Claude Code 同時工作，且指定固定 channel 時，必須使用 Fixed Handoff Channel Mode。

#### Worker 規則（嚴格執行）

1. Worker **不得更新** `dev-handoff/latest.json`。
2. Worker **只能更新自己被指定的 channel**。
3. Worker **不得修改其他 channel**。
4. Worker **不得 stage `dev-handoff/`**。
5. Worker **不得 stage `.claude/`**。
6. Worker **不得輸出 secrets / token / env / credentials**。

#### Channel 目錄結構

```
dev-handoff/
  latest.json          ← Single-Claude Mode 使用；Fixed Channel Mode 下不動此檔
  channels/
    claude-a/
      latest.json
      latest.md
    claude-b/
      latest.json
      latest.md
```

#### Claude A 只能寫

```
dev-handoff/channels/claude-a/latest.json
dev-handoff/channels/claude-a/latest.md
```

#### Claude B 只能寫

```
dev-handoff/channels/claude-b/latest.json
dev-handoff/channels/claude-b/latest.md
```

#### 嚴格禁止寫入

```
dev-handoff/latest.json
其他 worker 的 channel 檔案
```

#### Channel latest.json 格式

```json
{
  "handoffVersion": "channel-v1",
  "mode": "fixed-handoff-channel",
  "channel": "claude-a",
  "role": "worker",
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
  "finalReplyDraft": "<worker final reply draft>",
  "updatedAt": "<ISO timestamp>"
}
```

#### Channel latest.md 格式

```markdown
# Channel Handoff：<channel>

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

## 給整合者的 final_reply 草稿
<final reply draft>
```

---

### Final Consolidation Mode

當使用者要求整合多個 channel 時，整合者（Consolidator）執行以下流程：

1. 讀取所有 worker channel，例如：
   - `dev-handoff/channels/claude-a/latest.json`
   - `dev-handoff/channels/claude-b/latest.json`
2. 執行 `git status` / `git diff` 確認 repo 實際狀態。
3. 產生總 `finalReplyText`（合併所有 worker 的工作結果）。
4. 依照 **Single-Claude exact workflow** 更新 `dev-handoff/latest.json`：
   - `rawReply` 必須是 `finalReplyText` 的 exact copy
   - 執行 `node scripts/write-dev-handoff.mjs`
5. 輸出同一份 `finalReplyText` 作為終端機回覆。
6. **不得 stage `dev-handoff/`**。
7. **不得 stage `.claude/`**。

---

## Git 規範

- 每次 commit 前確認 `.claude/` 未被 stage
- `dev-handoff/` 已在 .gitignore，不可 commit
- commit message 格式：`kebab-case-description`

## 語言

- 程式碼：英文
- 與使用者溝通：繁體中文
