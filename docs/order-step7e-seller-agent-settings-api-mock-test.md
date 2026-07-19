# Step 7E-1b-API-MOCK-TEST seller_agent_settings API mock 測試紀錄

## 1. 任務背景

- 任務名稱：Step 7E-1b-API-MOCK-TEST
- 執行時間：2026-06-09
- Worker：Claude B
- 目標：撰寫並執行 `GET/PATCH /stores/:storeId/agent/settings` mock-based route tests
- 前置任務：API-IMPL（dc75672）、API-IMPL-CLOSEOUT（251216d）、API-REVIEW（8bdcdb4）

## 2. API Worktree / Branch

| 項目     | 值                                             |
| -------- | ---------------------------------------------- |
| worktree | `/home/runner/workspace/.worktrees/step7e-api` |
| branch   | `qa/step7e-seller-agent-settings-api`          |

## 3. Test Environment

| 項目              | 值                                   |
| ----------------- | ------------------------------------ |
| Runtime           | Node.js v24 built-in `node:test`     |
| TypeScript Loader | tsx ESM (`tsx/dist/esm/index.cjs`)   |
| Flag              | `--experimental-test-module-mocks`   |
| DB mock           | `mock.module('@workspace/db', ...)`  |
| Auth mock         | `mock.module('@clerk/express', ...)` |
| Real DB           | 不需要（全部 mock）                  |

## 4. Test Run 指令

```bash
cd /home/runner/workspace/.worktrees/step7e-api/artifacts/api-server
node --experimental-test-module-mocks \
  --import /home/runner/workspace/node_modules/.pnpm/node_modules/tsx/dist/esm/index.cjs \
  --test src/routes/sellerAgent.route.test.mjs
```

## 5. 測試結果

```
✔ Auth — GET /stores/:storeId/agent/settings (4 tests)
✔ Auth — PATCH /stores/:storeId/agent/settings (3 tests)
✔ GET — no row → default response (9 tests)
✔ GET — row exists → safe response (6 tests)
✔ PATCH — forbidden and unknown keys → 400 (7 tests)
✔ PATCH — agentMode validation (4 tests)
✔ PATCH — webhookSecret hashing (7 tests)
✔ PATCH — upsert success (5 tests)

tests 45  |  pass 45  |  fail 0  |  skip 0
```

## 6. 測試覆蓋範圍

### Auth — GET（4 tests）

| 測試                                | 狀態 |
| ----------------------------------- | ---- |
| no auth header → 401                | ✓    |
| store not found → 404               | ✓    |
| wrong store owner → 403             | ✓    |
| invalid storeId (non-numeric) → 400 | ✓    |

### Auth — PATCH（3 tests）

| 測試                                       | 狀態 |
| ------------------------------------------ | ---- |
| no auth header → 401                       | ✓    |
| wrong store owner → 403, upsert NOT called | ✓    |
| invalid storeId (non-numeric) → 400        | ✓    |

### GET no-row → default response（9 tests）

| 測試                                          | 狀態 |
| --------------------------------------------- | ---- |
| returns 200 with data wrapper                 | ✓    |
| default agentStatus = disabled                | ✓    |
| default agentMode = rule_worker               | ✓    |
| default queryFrequency = manual               | ✓    |
| default webhookEnabled = false                | ✓    |
| default hasWebhookSecret = false              | ✓    |
| response does NOT contain webhookSecretHash   | ✓    |
| response does NOT contain webhookSecret key   | ✓    |
| GET no-row does NOT call upsert (no DB write) | ✓    |

### GET row exists → safe response（6 tests）

| 測試                                                   | 狀態 |
| ------------------------------------------------------ | ---- |
| returns 200                                            | ✓    |
| hasWebhookSecret = true when hash is present in DB     | ✓    |
| webhookSecretHash field and value NOT in response body | ✓    |
| webhookSecret key NOT in response                      | ✓    |
| enabledLogistics array returned correctly from DB row  | ✓    |
| hasWebhookSecret = false when row has null hash        | ✓    |

### PATCH forbidden/unknown keys → 400（7 tests）

| 測試                                  | 狀態 |
| ------------------------------------- | ---- |
| unknown key → 400                     | ✓    |
| forbidden key storeId → 400           | ✓    |
| forbidden key merchantId → 400        | ✓    |
| forbidden key id → 400                | ✓    |
| forbidden key webhookSecretHash → 400 | ✓    |
| forbidden key lastRunAt → 400         | ✓    |
| empty body → 400                      | ✓    |

### PATCH agentMode validation（4 tests）

| 測試                                        | 狀態 |
| ------------------------------------------- | ---- |
| agentMode = platform_managed_reserved → 400 | ✓    |
| agentMode = unknown_mode → 400              | ✓    |
| agentMode = rule_worker → 200               | ✓    |
| agentMode = self_hosted_webhook → 200       | ✓    |

### PATCH webhookSecret hashing（7 tests）— 安全性關鍵

| 測試                                              | 狀態 |
| ------------------------------------------------- | ---- |
| upsert 收到 SHA-256 hash，不含明文                | ✓    |
| upsert 不儲存 webhookSecret 明文                  | ✓    |
| response 不含 webhookSecretHash 欄位或值          | ✓    |
| response 不含 webhookSecret 明文                  | ✓    |
| hasWebhookSecret = true after setting secret      | ✓    |
| webhookSecret too short (< 16 chars) → 400        | ✓    |
| webhookSecret = null → clears secret (hash: null) | ✓    |

### PATCH upsert success（5 tests）

| 測試                                                | 狀態 |
| --------------------------------------------------- | ---- |
| 200, upsert storeId 來自 URL params                 | ✓    |
| upsert merchantId 來自 Clerk session（不信任 body） | ✓    |
| response data wrapper with correct agentStatus      | ✓    |
| agentStatus = invalid_value → 400                   | ✓    |
| DB error → 500                                      | ✓    |

## 7. Mock 設計

### @clerk/express mock

```javascript
mock.module("@clerk/express", {
  namedExports: {
    getAuth: (req) => {
      const userId = req.headers?.["x-test-user-id"] ?? null;
      return {
        userId: userId || null,
        sessionClaims: userId ? { userId } : undefined,
      };
    },
    clerkMiddleware: () => (_req, _res, next) => next(),
  },
});
```

### @workspace/db mock

```javascript
mock.module("@workspace/db", {
  namedExports: {
    db: {
      select: () => ({
        from: (table) => ({
          where: () => ({
            limit: async () => {
              if (table === mockStoresTable) return [...mockStoreCheckResult]; // verifyStoreOwner
              return [...mockSettingsResult]; // GET settings
            },
          }),
        }),
      }),
      insert: (_table) => ({
        values: (vals) => {
          mockUpsertCapture = vals ? { ...vals } : null;
          return {
            onConflictDoUpdate: (_opts) => ({
              returning: async () => {
                if (mockUpsertShouldThrow) throw mockUpsertShouldThrow;
                return [...mockUpsertResult];
              },
            }),
          };
        },
      }),
    },
    sellerAgentSettingsTable: mockSettingsTable,
    storesTable: mockStoresTable,
  },
});
```

## 8. 關鍵安全測試說明

### webhookSecret 不洩漏（3 層保護均測試）

1. `mockUpsertCapture.webhookSecretHash === sha256(secret)` — DB 收到 hash
2. `!Object.hasOwnProperty(mockUpsertCapture, 'webhookSecret')` — DB 不收明文
3. `!JSON.stringify(response).includes(PLAINTEXT_SECRET)` — response 不含明文
4. `!JSON.stringify(response).includes(EXPECTED_HASH)` — response 不含 hash

### GET 不觸發 INSERT（無副作用）

`mockUpsertCapture === null` after GET — 確認 GET 無副作用。

### ownership failure → upsert NOT called

`mockUpsertCapture === null` after PATCH with wrong owner — 確認鑑權失敗時不進行 DB write。

## 9. logger.error 注意事項

測試輸出中有一行 `seller_agent_settings_patch_failed` error log，這是 `DB error → 500` 測試案例的**預期行為**：

- mock 強制拋出 `Error('DB connection lost')`
- API catch block 呼叫 `logger.error()`
- 此為正常 test output，非測試失敗

## 10. Commit 結果

| commit    | message                                 | 角色       |
| --------- | --------------------------------------- | ---------- |
| `c73a68f` | `test-api-step7e-seller-agent-settings` | mock tests |

## 11. 未執行項目

- 未修改 API 行為
- 未 DB push
- 未 migrate
- 未施工 UI
- 未 push GitHub

## 12. 風險與待確認

| 風險                                  | 嚴重度 | 說明                                         |
| ------------------------------------- | ------ | -------------------------------------------- |
| `seller_agent_settings` table 未建立  | 中     | integration test 需 DB push 後才可執行       |
| mock 的 `.from()` 依賴 table identity | 低     | mock 設計按 table 物件識別路由，測試邏輯清晰 |

## 13. 下一步建議

1. **DB-PUSH-PREFLIGHT**：確認 seller_agent_settings table 建立計劃
2. DB push 後執行 integration test（使用真實 DB）
3. UI 施工：seller agent settings 管理頁面
