# 99 審查報告

> 重大審查結果追加在本檔（規則見 04 檔模板 5）。

## 2026-07-07 初版制度 fresh-context 對抗審查

- 審查者：fresh-context general-purpose agent（Sonnet），事前不知實作過程。
- 範圍：AGENTS.md + docs/ai-ops/00–06 共 8 份，對照 repo 實況抽查路徑與指令。

### 發現與處置（全部已修）

| 嚴重度 | 問題 | 處置 |
|---|---|---|
| 高 | AGENTS.md 優先序只寫「衝突時」，弱模型可能漏讀；完整優先序只在 05 檔 | 完整優先序搬進 AGENTS.md 開場流程第 3 條 |
| 高 | 01 檔 API 測試指令缺 `--experimental-test-module-mocks`（clerk mock 需要，見 cvs.route.test.mjs 檔頭），照抄會失敗 | 01 檔速查改為完整指令＋「以測試檔頭註解為準」 |
| 高 | 03 §9 引用同一不完整指令，高風險驗證會空轉 | 改為引用 01 檔速查並註明 flag |
| 中 | 04 模板 1 範例用未實查的 glob 當輸入 | 標明「glob 是起點不是結論」 |
| 中 | 04 模板 2 範例依賴尚不存在的 10-cost-sheet-mapping.md，無 fallback | 加「不存在就先用模板 1/4 建立，不得跳過」 |
| 中 | 02 §3 環境事實（agent/model 清單）寫進長期文件無過期機制 | 加 7 天過期重查條款 |
| 低 | 04 模板 5 範例路徑不完整（PublicOrder.tsx 等） | 補完整路徑 |

### 已驗無問題的面向

- 模糊語句：門檻均已數字化（>5 檔/>500 行、兩輪、20 條、150 行）。
- 無 Sonnet 跑不動的要求（判準皆 checklist 化）。
- 無捏造工具名/模型名/API（agent 與 model 參數對照實際環境清單一致）。
- package.json scripts、shippingFee.ts、cvs711.ts、orderStatusMachine.ts、.agents/memory/、dev-handoff/ 路徑全部實際存在。
- 無與代購系統無關的空泛 AI 管理文字。

### Read-back 驗證（修復後，2026-07-07）

10 份檔案逐一確認存在且含關鍵節（驗證方式：重新開檔比對行數與標題）：AGENTS.md、docs/ai-ops/00–06、99（本檔）；CLAUDE.md 未改動（L0）。
