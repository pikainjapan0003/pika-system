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

## Git 規範

- 每次 commit 前確認 `.claude/` 未被 stage
- `dev-handoff/` 已在 .gitignore，不可 commit
- commit message 格式：`kebab-case-description`

## 語言

- 程式碼：英文
- 與使用者溝通：繁體中文
