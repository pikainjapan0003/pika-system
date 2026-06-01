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

### JSON 格式

```json
{
  "generatedAt": "<ISO 8601 timestamp, e.g. 2026-06-01T10:00:00Z>",
  "rawReply": "<本輪 Claude 完整回覆的文字摘要>",
  "summary": "<一段話說明本輪做了什麼或回覆了什麼>",
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
