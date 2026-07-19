# Step 7E-1b-INTEGRATION-TEST Handoff Sync

## 任務背景

Step 7E-1b-DB-PUSH（commit 793a17f）完成後，本次執行真實 DB integration test，驗證 `seller_agent_settings` GET/PATCH API 的實際行為。

## API Worktree / Branch

| 項目     | 值                                             |
| -------- | ---------------------------------------------- |
| Worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| Branch   | `qa/step7e-seller-agent-settings-api`          |

## Integration Test Commit

| commit    | message                                             |
| --------- | --------------------------------------------------- |
| `5a62b9b` | `test-api-step7e-seller-agent-settings-integration` |

**新增檔案**：

- `artifacts/api-server/src/routes/sellerAgent.integration.test.mjs`
- `docs/order-step7e-seller-agent-settings-integration-test.md`

## DB Summary（不含 secret）

| 欄位            | 值                                  |
| --------------- | ----------------------------------- |
| Host            | `helium`                            |
| Database        | `heliumdb`                          |
| 環境            | Replit 本機 dev DB（非 production） |
| Test Store      | store_id=1（小軒代購）              |
| 測試前 row 狀態 | 無既有 row（0 rows）                |

## 測試結果（2026-06-09 重新驗證）

```
tests 25
suites 8
pass  25
fail  0
cancelled 0
skipped 0
todo  0
duration_ms 2132.583267
```

| Flow                                     | 案例數 | 結果       |
| ---------------------------------------- | ------ | ---------- |
| A: GET no row → default config           | 6      | ✅ 全 pass |
| B: PATCH valid payload → 建立 DB row     | 4      | ✅ 全 pass |
| C: GET row exists → safe response        | 3      | ✅ 全 pass |
| D: PATCH webhookSecret → hash in DB      | 4      | ✅ 全 pass |
| E: PATCH forbidden keys → 400            | 3      | ✅ 全 pass |
| F: PATCH platform_managed_reserved → 400 | 2      | ✅ 全 pass |
| G: Ownership failure → 403               | 2      | ✅ 全 pass |
| H: Cleanup 結構驗證                      | 1      | ✅ 全 pass |

## Cleanup / Restore 結果

- 測試前：store_id=1 無既有 row（0 rows）
- 測試過程寫入：1 row（seller_agent_settings store_id=1）
- 測試後 `after()` hook 執行：`DELETE FROM seller_agent_settings WHERE store_id = 1`
- 驗證結果：**0 rows**（完整清理）
- 還原狀態：符合測試前狀態

## 同步到 dev-handoff 的內容

- `dev-handoff/latest-B.json`：更新至 INTEGRATION-TEST（含 25 tests 結果、commit hash、cleanup 狀態）
- `dev-handoff/latest-B.md`：更新至 INTEGRATION-TEST
- `dev-handoff/latest.json`：更新為 latest-B relay copy
- `dev-handoff/` 未 stage，未 push

## 未執行項目

| 項目                          | 狀態                            |
| ----------------------------- | ------------------------------- |
| DB push                       | 未執行（上一步 793a17f 已完成） |
| migrate                       | 未執行                          |
| seed                          | 未執行                          |
| 施工 UI                       | 未執行                          |
| push GitHub                   | 未執行                          |
| 輸出 secret value             | 未執行                          |
| 修改 API / schema / migration | 未執行                          |
| 修改其他表資料                | 未執行                          |

## 風險與待確認

1. Integration test 使用真實 dev store（store_id=1），若該 store 被刪除需更新 `TEST_STORE_ID` 常數。
2. `--experimental-test-module-mocks` 為 Node.js 實驗性 API，Node.js 未來版本可能調整此 flag。
3. 未執行 `webhookSecret=null`（清除 secret）的 DB 側驗證，但 mock test（45 tests）已覆蓋此案例。
4. Worktree `.git` pointer file 在此 session 修復（之前遺失），已驗證 worktree 正常運作。

## 下一步建議

1. **可進入 UI 施工**：
   - API 無 bug
   - Integration test 25 tests pass（2026-06-09 重新驗證通過）
   - DB 已清理
2. 下一步：Step 7E-2 Seller Agent Settings UI 施工。
