# TODO／FIXME／XXX／HACK 全庫盤點

掃描日期：2026-07-31  
範圍：全 repo，排除 generated、dist、node_modules、dev-handoff 與 `.git`  
指令：`rg -n -i '\b(TODO|FIXME|XXX|HACK)\b' ...`

## 結論

BATCH-20 包17（2026-08-01）已處理兩個真正待辦：未具備可執行方案的項目不改程式，而是在原規格處改為正式 backlog 參照 `BACKLOG-AGENT-ENTITLEMENT` 與 `BACKLOG-STEP7F-AUDIT-ACCEPTANCE`；兩項仍需老闆／產品決策或唯讀對照，未宣稱完成。

共命中 19 行；只有 2 行是真正的待辦語意，其餘 17 行是測試輸出中的 `todo 0`、範例網址／金額／電話的 `xxx`，或表單 placeholder。Production TypeScript 程式碼內沒有 `TODO`、`FIXME`、`XXX` 或 `HACK` 註解。

## 真正待辦

| 分類           | 位置                                                       | 現況                                                                                                                                                                     | 建議處理批次                                                                                                                              |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 安全／產品權益 | `docs/order-step7e-seller-agent-api-schema-spec.md:129`    | `every_2_hours_high_tier` 已在 `sellerAgent.ts` 與 DB check 接受，但文件仍留有「方案權益 plan check TODO」。目前看不到方案／訂閱層的權益檢查；是否限制高頻同步尚未拍板。 | 先由老闆決定是否存在付費方案與 entitlement 來源；拍板後獨立做「Agent 頻率權益 gate」包。不得在沒有方案資料源時硬猜。                      |
| 文件／稽核設計 | `docs/order-step7d-agent-token-run-log-schema-spec.md:216` | 歷史規格要求保留「完整 audit log 待 Step 7F」TODO。現在已有 `agent_run_logs` 寫入端點與一般 `audit_logs`，但這不自動證明當年的「完整 audit」驗收定義已全部滿足。         | 做一個唯讀對照包：把 Step 7F 當時要求逐項對照現行 `agent.ts`、`agent_run_logs`、`audit_logs`，若已滿足就移除過期 TODO；若未滿足只列缺口。 |

## 非待辦的 17 個命中

### 測試／報告計數

- `docs/ai-ops/37-batch16-report.md:45`：Node test runner 的 `todo 0`。
- `docs/order-step7e-integration-test-handoff-sync.md:44`：測試摘要 `todo 0`。
- `docs/order-step7e-seller-agent-settings-integration-test.md:92`：測試摘要 `todo 0`。

### 輸入 placeholder 與假資料

- `e2e/smoke.spec.mjs:40`
- `artifacts/shop-app/src/pages/PublicOrder.tsx:783,848`
- `artifacts/shop-app/src/pages/PublicCart.tsx:647`
- `artifacts/shop-app/qa-screenshots/receipt-with-discount-QA.html:306`
- `artifacts/shop-app/qa-screenshots/receipt-paid-full-QA.html:306`

以上皆為 `09xx-xxx-xxx` 或 QA 假電話，不是程式待辦。

### 文件中的通用範例值

- `docs/order-step7b-tracking-import-spec.md:371`
- `docs/order-step6b-cvs-existing-implementation-audit.md:253-254`
- `docs/order-step5f-picking-shipping-release-checklist.md:279`
- `docs/order-step5-payment-logistics-release-checklist.md:209`
- `docs/order-step4-payment-logistics-spec.md:866`
- `docs/order-step8i-amount-adjustment-db-api-spec.md:378,399`

以上 `XXX`／`xxx` 是示意 token、orderId、金額或錯誤輸入，不是 TODO。

## 分類摘要

| 類別       | 真正待辦數 | 說明                                                         |
| ---------- | ---------: | ------------------------------------------------------------ |
| 金額       |          0 | 沒有金額公式 TODO；高頻 Agent 方案是產品權益，不是金額計算。 |
| 個資       |          0 | 沒有個資處理 TODO；假電話 placeholder 不算。                 |
| 安全／權限 |          1 | 高頻 Agent 同步方案 entitlement 尚未定義。                   |
| 效能       |          0 | 沒有 FIXME／HACK 類效能註記。                                |
| 文件／雜項 |          1 | Step 7F audit TODO 需與現況對照後清理或重開。                |

## 注意

「沒有 TODO 註解」不代表沒有技術債。本批另有 endpoint 權限矩陣、錯誤日誌個資掃描與依賴健康報告；那些有證據的缺口不應因程式碼未寫 TODO 就被忽略。

## BATCH-20 收尾標記（2026-08-01）

package 17 已以 `093400f` 將兩項無法安全自行決定的 TODO 轉成正式 backlog；它們仍是待產品／老闆決策，不是已完成的功能。package 18 的雜項掃描沒有找到可安全修改的真正死碼，因此 no-op，未製造無意義變更。
