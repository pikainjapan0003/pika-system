# Step 7E-1b-API-REVIEW Handoff Sync

## 1. 任務背景

- 任務名稱：Step 7E-1b-API-REVIEW
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：審查 `GET/PATCH /stores/:storeId/agent/settings` API 實作並出具 review 結論

## 2. API Worktree / Branch

| 項目     | 值                                             |
| -------- | ---------------------------------------------- |
| worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| branch   | `qa/step7e-seller-agent-settings-api`          |

## 3. Implementation Commit

| commit    | message                                                |
| --------- | ------------------------------------------------------ |
| `dc75672` | `feat-api-step7e-seller-agent-settings`                |
| `251216d` | `docs-step7e-seller-agent-settings-api-implementation` |

## 4. Review Commit

| commit    | message                                        |
| --------- | ---------------------------------------------- |
| `8bdcdb4` | `docs-step7e-seller-agent-settings-api-review` |

## 5. Review Conclusion

**pass-with-notes**

無阻塞問題。3 項非阻塞式 notes：

1. import style：`index.ts` 的 `"./sellerAgent.ts"` 包含 `.ts` 副檔名，其他路由無
2. `logger` vs `req.log`：與 `agent.ts` 一致，但與 `stores.ts` / `orders.ts` 不同
3. `as any` upsert cast：與 `agent.ts` 現有模式一致，但喪失部分型別安全

## 6. 同步到 dev-handoff 的內容

### Auth / Ownership

- `requireAuth`：✓ GET 和 PATCH 均有
- `agentTokenAuth`：✓ 未使用
- `verifyStoreOwner`：✓ GET 和 PATCH 均呼叫
- `merchantId`：✓ 來自 `req.userId`，不信任 body

### GET Review

- row 不存在：✓ 回傳 in-memory default，無 INSERT
- row 存在：✓ 回傳安全 response（toSafeSettings）

### PATCH Review

- upsert：✓ `onConflictDoUpdate` on storeId
- FORBIDDEN_PATCH_KEYS：✓ id / storeId / merchantId / webhookSecretHash / lastRunAt / lastTestRunAt
- 未知 key 400：✓
- `platform_managed_reserved` 400：✓
- 陣列欄位逐項 Set 驗證：✓

### Response Safety

- `webhookSecretHash`：✓ 永不進 response
- `hasWebhookSecret: boolean`：✓ 替代
- `toSafeSettings()`：✓ 明確 mapping，不 spread 整個 row
- SHA-256 hash 不寫 log：✓

## 7. 未執行項目

- 未修改 API 行為
- 未 DB push
- 未 migrate
- 未施工 UI
- 未 push GitHub

## 8. 風險與待確認

- `seller_agent_settings` table 尚未建立，integration test 需 DB push 後才可執行
- import style 不一致（`./sellerAgent.ts` vs 其他無副檔名）
- `as any` upsert cast（型別安全性較低）

## 9. 下一步建議

1. **API-MOCK-TEST**：使用 supertest + vi.mock 執行 mock-based route test（不需真實 DB）
2. **DB-PUSH-PREFLIGHT**：確認 seller_agent_settings table 建立計劃
3. DB push 後執行 integration test
