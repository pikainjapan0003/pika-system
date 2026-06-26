# Step 7P One-Shot Write Safety Gate

**日期**：2026-06-26
**分支**：qa/step6f-cvs-store-selection-browser-mobile
**步驟**：7P-ONE-SHOT-WRITE-SAFETY-GATE
**作者**：Claude A（worker = claude-a）

---

## 結論

```text
Step 7P-ONE-SHOT-WRITE-SAFETY-GATE = COMPLETED / PASS
```

本文件為**安全門規格文件**，不含任何 DB 寫入、commit route 呼叫、或寫入授權。

安全門現況：

```text
postoffice = 第一順位 candidate，安全門規格已建立，尚未授權寫入
tcat = 第二順位 candidate，安全門規格已建立，尚未授權寫入
711 = 不列入第一批 candidate，不得進入安全門流程
familymart = 不參與，維持 Level 4 formal auto-sync
```

---

## 1. 適用範圍

本安全門適用於以下情況：

```text
使用者明確提供授權文字後，對 postoffice 或 tcat 執行單筆 one-shot production write。
```

前置條件一覽：

```text
- Provider 已被決策為 candidate（postoffice / tcat）
- 使用者已填妥本文件「3. 授權格式」中的完整授權模板
- previewHash = hash-present
- 外部事件數、DB 事件數、可新增事件數與授權一致
- Claude 未收到「明確授權文字」前，不得執行任何寫入動作
```

---

## 2. 不適用範圍

以下情況**不適用**本安全門，不得嘗試進入寫入流程：

```text
711 = 不列入第一批 candidate；不進 commit route；不進安全門
familymart = 維持 Level 4 auto-sync；不進 manual 安全門
postoffice #38 = 尚未授權；不得直接操作（需另開完整授權流程）
任何 tcat / postoffice 以外的 provider = 不適用
常態正式寫入（non-one-shot）= 不適用，此安全門只允許單次
scheduled sync = 不適用，此安全門不開排程
```

---

## 3. Candidate 狀態

| Provider | 目前層級 | Candidate 狀態 | 安全門狀態 |
|----------|---------|---------------|-----------|
| familymart | Level 4 — Formal Auto Sync | 不參與 | 不適用 |
| postoffice | Level 1 — Manual Preview-Only | **第一順位 candidate（尚未授權寫入）** | 規格已建立；待授權 |
| tcat | Level 1 — Manual Preview-Only | **第二順位 candidate（尚未授權寫入）** | 規格已建立；待授權 |
| 711 | Level 1 — Manual Preview-Only | 不列入第一批 | 不適用 |

**重要**：candidate 狀態不等於已授權寫入。進入寫入流程前必須取得使用者明確授權。

---

## 4. 授權格式

使用者必須提供以下完整格式的授權文字。缺少任何欄位均不得執行寫入。

```text
我明確授權執行 one-shot write：

Provider:
Order ID:
Tracking ID:
Tracking last4:
Expected external events:
Expected DB existing events:
Expected writable events:
Expected latest status:
允許行為：只允許本次單筆寫入
禁止行為：不得開 scheduled sync、不得開常態正式寫入、不得修改其他 provider
授權有效範圍：本次任務完成即失效
```

**填寫範例（不代表實際授權，僅供格式參考）**：

```text
我明確授權執行 one-shot write：

Provider: postoffice
Order ID: （使用者填入）
Tracking ID: （使用者填入）
Tracking last4: （使用者填入，不需完整號碼）
Expected external events: （使用者填入）
Expected DB existing events: 0
Expected writable events: （使用者填入）
Expected latest status: （使用者填入）
允許行為：只允許本次單筆寫入
禁止行為：不得開 scheduled sync、不得開常態正式寫入、不得修改其他 provider
授權有效範圍：本次任務完成即失效
```

**注意**：使用者提供授權文字後，Claude 必須先確認授權欄位與 preview 結果一致，再執行寫入。

---

## 5. 寫入前檢查

執行 one-shot write 前，以下十項必須全部通過：

| # | 檢查項目 | 確認方式 |
|---|---------|---------|
| 1 | Provider 必須是已決策 candidate（postoffice 或 tcat） | 確認 provider 欄位 |
| 2 | 使用者必須明確授權（提供完整授權文字） | 確認授權文字齊備 |
| 3 | 僅能單一 provider / 單一 order / 單一 tracking | 確認無多 provider / 多 order 混入 |
| 4 | previewHash 必須為 hash-present | 確認 preview 結果 hash 狀態 |
| 5 | preview 未過期（previewExpiresAt 未到期） | 確認 preview 剩餘秒數 > 0 |
| 6 | 外部事件數、DB 既有事件數、可新增事件數必須與授權一致 | 對比授權文字與 preview job 欄位 |
| 7 | latest status 必須與授權一致 | 對比授權文字與 preview job.latestStatusText |
| 8 | COMMIT_ENABLED 不得長期開啟；寫入後立即關回 | 確認關門計畫 |
| 9 | 寫入前必須確認無 unrelated runtime diff（`git diff -- .replit replit.nix artifacts/`） | 執行 diff 指令，確認空 |
| 10 | 寫入前必須確認不會動 scheduled sync（cron / 排程相關檔案無異動） | 確認 diff 空 |

---

## 6. 寫入期間限制

one-shot write 執行期間必須嚴格遵守：

| # | 限制 | 說明 |
|---|------|------|
| 1 | 只能執行一次 | 不可重複呼叫 /manual-provider/commit |
| 2 | 只能打指定 commit route | 不可呼叫其他寫入 API |
| 3 | 不能批次寫入 | trackingIds 只含一筆 |
| 4 | 不能寫其他 provider | 只允許授權 provider |
| 5 | 不能寫其他 order | 只允許授權 orderId |
| 6 | 不能修改主訂單狀態 | commit route 只寫 tracking events |
| 7 | 不能新增 scheduled sync | cron / 排程相關設定保持不動 |
| 8 | 不能開 UI 常態寫入按鈕 | COMMIT_ENABLED 只在 one-shot 授權期間設為 true |

---

## 7. 寫入後 close gate

one-shot write 完成後，以下步驟必須**按順序全部執行**：

| # | 步驟 | 確認方式 |
|---|------|---------|
| 1 | 立刻關閉 one-shot gate（COMMIT_ENABLED=false） | 確認 code 已恢復 false |
| 2 | 確認 provider whitelist 沒擴張（MANUAL_SYNC_PROVIDERS 未變動） | grep 確認 |
| 3 | 確認 supportsAutoSync 沒改（各 provider 維持原值） | grep 確認 |
| 4 | 重新查詢同一筆 tracking（呼叫 preview，不呼叫 commit） | 執行 preview 查詢 |
| 5 | 預期結果應變成 duplicate-only（可新增事件數 = 0） | 確認 preview 結果 |
| 6 | 可新增事件數應為 0 | 確認 netNew = 0 |
| 7 | 不應再顯示寫入按鈕（duplicate-only 不顯示 commit 按鈕） | 確認 UI 狀態 |
| 8 | 文件記錄 inserted count / duplicate count / latest status | 更新 closeout 文件 |
| 9 | commit docs-only closeout（close gate 確認文件） | git commit |

---

## 8. duplicate-only 再驗證

close gate 後，重新查詢的 preview 結果必須符合：

```text
外部事件數：≥ 原授權 expected writable events（已寫入，故不再有新增）
DB 事件數：= 外部事件數（已寫入完畢）
可新增事件數：= 0（duplicate-only）
latestStatusText：= 授權中的 Expected latest status
hash 狀態：hash-present
UI 狀態：顯示「查到的事件皆已存在，不需要重複寫入」
不顯示寫入按鈕
```

若 duplicate-only 再驗證失敗（可新增 > 0），**必須停止並回報**，不得再次執行寫入。

---

## 9. 禁止事項

```text
不得在無授權的情況下執行寫入
不得把 candidate decision 視為已授權
不得操作 postoffice #38（尚未授權；需另開完整授權流程）
不得操作 711（不列入第一批 candidate）
不得開 scheduled sync
不得開常態正式寫入
不得讓 COMMIT_ENABLED 長期保持 true
不得把 Level 1 誤升為 Level 3 / Level 4
不得在寫入後不執行 close gate
不得在 close gate 前提交 docs
不得把 one-shot 寫入當成 provider 全面上線的依據
```

---

## 10. postoffice #38 特別說明

```text
postoffice #38 已知資料：
- 外部 6 筆事件 / DB 0 筆事件 / 可寫 6 筆
- 最新貨態：投遞成功

現況：尚未授權寫入，不得直接操作。

若使用者決定對 #38 執行 one-shot write，必須：
1. 另開 Step 7P-POSTOFFICE-ONE-SHOT-AUTHORIZATION task
2. 使用者提供完整授權文字（依本文件第 4 節格式）
3. 確認 previewHash = hash-present（需重新 preview）
4. 確認外部事件數、DB 事件數、可新增事件數仍為 6 / 0 / 6
5. 方可進入本安全門流程
```

---

## 11. 安全邊界

本輪以下操作均**未執行**：

```text
未改 runtime code
未 production write
未 DB mutation
未呼叫 /manual-provider/commit
未改 COMMIT_ENABLED
未改 supportsAutoSync
未改 provider whitelist
未開 scheduled sync
未操作 postoffice #38
未 push GitHub
未 Publish
未暴露完整 tracking code
未暴露完整 previewHash
```

---

## 12. 下一步

```text
Step 7P-POSTOFFICE-ONE-SHOT-AUTHORIZATION
```

目的：

```text
使用者決定對特定 postoffice order 執行 one-shot write 時，
依本文件第 4 節格式提供授權文字，
然後依本文件第 5～9 節步驟執行並收尾。
```

> 注意：若使用者決定不立即執行 one-shot write，可直接跳至 Step 8。
> 本安全門文件長期有效，隨時可依此規格執行授權寫入。

---

## 參考文件

| 文件 | 內容 |
|------|------|
| `docs/step7/provider-write-candidate-decision.md` | write candidate 決策結果 |
| `docs/step7/step7p-published-ui-screenshot-evidence-closeout.md` | Published UI 截圖驗收結果 |
| `docs/step7/manual-provider-commit-release-gate-decision.md` | one-shot authorization 歷史記錄（tcat #36） |
| `docs/step7/manual-provider-production-can-write-candidates.md` | postoffice #38 / tcat #36 can-write candidate 詳情 |
| `docs/step7/manual-provider-production-one-shot-final-closeout.md` | tcat #36 one-shot commit 收尾流程記錄 |
| `docs/step7/provider-rollout-decision-matrix.md` | 各 provider Support Level 決策表 |
| `docs/step7/provider-rollout-policy.md` | Provider rollout 政策 |
