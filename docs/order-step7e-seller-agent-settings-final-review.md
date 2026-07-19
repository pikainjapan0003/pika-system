# Step 7E-2-FINAL-REVIEW Seller Agent Settings 最終總審

## 1. 任務背景

本文件記錄 Step 7E Seller Agent Settings 功能全鏈路最終 code review，涵蓋 DB schema、API、OpenAPI Client、UI、Security、測試與文件完整性驗證。

審查日期：2026-06-09

Final review branch：`qa/step7e-seller-agent-settings-final-review`
起點：`qa/step7e-seller-agent-settings-active-preview`

## 2. Final Review Worktree / Branch

```
worktree:  /home/runner/workspace/.worktrees/step7e-final-review
branch:    qa/step7e-seller-agent-settings-final-review
base:      qa/step7e-seller-agent-settings-active-preview
```

## 3. Reviewed Branch / Commits

| Commit    | 說明                                                    |
| --------- | ------------------------------------------------------- |
| `626b399` | feat-schema-step7e-seller-agent-settings（DB schema）   |
| `dc75672` | feat-api-step7e-seller-agent-settings（API）            |
| `c73a68f` | test-api-step7e-seller-agent-settings（API mock tests） |
| `793a17f` | docs-step7e-seller-agent-settings-db-push               |
| `5a62b9b` | test-api-step7e-seller-agent-settings-integration       |
| `68659ce` | feat-client-step7e-seller-agent-settings-api（codegen） |
| `6a8153a` | feat-ui-step7e-seller-agent-settings                    |
| `b17403b` | docs-step7e-seller-agent-settings-ui-review             |
| `758e918` | docs-step7e-browser-smoke-closeout                      |

所有 commits 均包含在 `qa/step7e-seller-agent-settings-active-preview` 中，ancestry 驗證通過。

## 4. DB Schema Review

**結果：✅ PASS**

檔案：`lib/db/src/schema/sellerAgentSettings.ts`

| 審查項目                                            | 結果                                          |
| --------------------------------------------------- | --------------------------------------------- |
| agentStatus: disabled / enabled                     | ✅ DB CHECK constraint 完整                   |
| agentMode: 4 values（含 platform_managed_reserved） | ✅ DB CHECK constraint 完整                   |
| queryFrequency: 4 values                            | ✅ DB CHECK constraint 完整                   |
| enabledLogistics: JSONB（白名單於應用層驗證）       | ✅                                            |
| queryMethods: JSONB（白名單於應用層驗證）           | ✅                                            |
| webhookSecretHash: 只存 hash                        | ✅ 欄位有明確注釋                             |
| unique storeId 約束                                 | ✅ `seller_agent_settings_store_id_unique`    |
| FK storeId → stores(id) ON DELETE CASCADE           | ✅                                            |
| merchantId index                                    | ✅                                            |
| agentStatus index                                   | ✅                                            |
| queryFrequency index                                | ✅                                            |
| schema 匯出 (index.ts)                              | ✅ `export * from "./sellerAgentSettings.ts"` |

## 5. API Review

**結果：✅ PASS**

檔案：`artifacts/api-server/src/routes/sellerAgent.ts`

| 審查項目                                                                     | 結果                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------- |
| GET route 存在                                                               | ✅ `GET /stores/:storeId/agent/settings`            |
| PATCH route 存在                                                             | ✅ `PATCH /stores/:storeId/agent/settings`          |
| requireAuth 存在（GET）                                                      | ✅                                                  |
| requireAuth 存在（PATCH）                                                    | ✅                                                  |
| verifyStoreOwner 存在（GET）                                                 | ✅                                                  |
| verifyStoreOwner 存在（PATCH）                                               | ✅                                                  |
| GET 無 row → 回 defaultSettings，不寫 DB                                     | ✅                                                  |
| PATCH upsert（INSERT + onConflictDoUpdate）                                  | ✅                                                  |
| response 不含 webhookSecret                                                  | ✅ toSafeSettings 不含此欄位                        |
| response 不含 webhookSecretHash                                              | ✅ toSafeSettings 不含此欄位                        |
| response 含 hasWebhookSecret（boolean）                                      | ✅ `webhookSecretHash !== null`                     |
| PATCH 禁止 platform_managed_reserved                                         | ✅ VALID_AGENT_MODE_SELLER 不含此值                 |
| PATCH 禁止 forbidden keys（id, storeId, merchantId, ..., webhookSecretHash） | ✅ FORBIDDEN_PATCH_KEYS                             |
| PATCH 禁止 unknown keys                                                      | ✅ ALLOWED_PATCH_KEYS 白名單外一律拒絕              |
| webhookSecret 空 patch → 400                                                 | ✅ `No patchable fields provided`                   |
| webhookSecret: null → 清除 hash                                              | ✅ `patch.webhookSecretHash = null`                 |
| webhookSecret: string → SHA-256 hash                                         | ✅ `createHash("sha256").update(...).digest("hex")` |
| webhookSecret 長度限制 16–256 chars                                          | ✅                                                  |
| webhookUrl 格式驗證                                                          | ✅ `new URL(...)`                                   |
| route 在 index.ts 正確 use                                                   | ✅ `router.use(sellerAgentRouter)`                  |

## 6. OpenAPI / Client Review

**結果：✅ PASS**

| 審查項目                                                                           | 結果                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------- |
| GET path `/stores/{storeId}/agent/settings`                                        | ✅                                       |
| PATCH path `/stores/{storeId}/agent/settings`                                      | ✅                                       |
| response schema `{ data: SellerAgentSettings }`                                    | ✅                                       |
| SellerAgentSettings schema 有 hasWebhookSecret                                     | ✅                                       |
| SellerAgentSettings schema 無 webhookSecretHash                                    | ✅                                       |
| SellerAgentSettings agentMode enum 含 platform_managed_reserved（response 可表示） | ✅                                       |
| UpdateSellerAgentSettingsRequest agentMode enum 不含 platform_managed_reserved     | ✅ 只有 3 個 seller-selectable 值        |
| UpdateSellerAgentSettingsRequest 含 webhookSecret（可 null 或 string）             | ✅                                       |
| UpdateSellerAgentSettingsRequest 不含 webhookSecretHash                            | ✅                                       |
| 生成 hook useGetSellerAgentSettings                                                | ✅                                       |
| 生成 hook useUpdateSellerAgentSettings                                             | ✅                                       |
| 生成 getGetSellerAgentSettingsQueryKey                                             | ✅                                       |
| UI 使用 `settingsResp?.data` 存取資料                                              | ✅ `const settings = settingsResp?.data` |

## 7. UI Review

**結果：✅ PASS**

檔案：`artifacts/shop-app/src/pages/AgentSettings.tsx`, `Settings.tsx`, `App.tsx`

| 審查項目                                        | 結果                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| `/settings/agent` route 掛上 App.tsx            | ✅ line 252                                              |
| Settings page 有「AI 代查設定」入口             | ✅ AgentSettingsEntry component                          |
| UI 不顯示 platform_managed_reserved             | ✅ AgentMode type 僅 3 values，select option 僅 3 個     |
| UI 不顯示 secret 明文                           | ✅ 僅顯示 hasWebhookSecret 狀態（「已設定」/「未設定」） |
| UI 不顯示 webhookSecretHash                     | ✅                                                       |
| PATCH payload 不送 forbidden fields             | ✅ payload 僅含 allowed fields                           |
| Secret 更換送 `webhookSecret: newSecret.trim()` | ✅ line 148                                              |
| Secret 清除送 `webhookSecret: null`             | ✅ line 176                                              |
| UI review（前輪）結論                           | ✅ PASS — 無 blocking issue                              |
| Browser smoke test                              | ✅ PASS（使用者人工確認）                                |

## 8. Security Review

**結果：✅ PASS**

### Auth

- 兩個 API route 均有 `requireAuth`（Clerk session 必要）
- 401 → 未認證，Clerk 處理

### Authorization

- 兩個 API route 均有 `verifyStoreOwner`
- 錯誤所有人 → 403，DB 不修改（integration test G-1, G-2 覆蓋）

### Secret 保護

| 層             | 處理方式                                       |
| -------------- | ---------------------------------------------- |
| PATCH request  | 接受明文 `webhookSecret`（transient）          |
| API 處理       | 即刻 SHA-256 hash，丟棄明文                    |
| DB             | 只存 `webhook_secret_hash`，明文不存           |
| GET response   | 只回 `hasWebhookSecret: boolean`               |
| PATCH response | `toSafeSettings()` 不含 hash 也不含明文        |
| UI             | 只讀 `hasWebhookSecret`，不顯示 secret 或 hash |

### Over-posting 防護

- `FORBIDDEN_PATCH_KEYS`：id, storeId, merchantId, createdAt, updatedAt, lastRunAt, lastTestRunAt, webhookSecretHash
- `ALLOWED_PATCH_KEYS`：業務欄位白名單，未知 key 一律 400
- Integration test C 覆蓋 forbidden fields 的 PATCH 拒絕行為

### Platform Reserved Mode

- DB / API response / OpenAPI 可表示 `platform_managed_reserved`
- `VALID_AGENT_MODE_SELLER` 明確排除此值
- UpdateSellerAgentSettingsRequest enum 不含此值
- UI AgentMode type 不含此值，select options 不含此值

## 9. Test Evidence

| 測試項目                     | 結果                | 說明                                                                      |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------- |
| DB schema typecheck          | ✅ PASS             | exit code 0，無 errors（order-step7e-seller-agent-settings-typecheck.md） |
| API mock tests               | ✅ 45 pass / 0 fail | order-step7e-seller-agent-settings-api-mock-test.md                       |
| API integration tests        | ✅ 25 pass / 0 fail | order-step7e-seller-agent-settings-integration-test.md                    |
| OpenAPI codegen              | ✅ hooks generated  | lib/api-client-react/src/generated/api.ts                                 |
| typecheck:libs（pnpm -w）    | ✅ 0 errors         | 本次執行確認                                                              |
| UI typecheck（tsc --noEmit） | ✅ 0 errors         | order-step7e-seller-agent-settings-ui-review.md                           |
| vite build                   | ✅ success（2.75s） | order-step7e-seller-agent-settings-ui-review.md                           |
| UI review（前輪）            | ✅ PASS             | b17403b docs-step7e-seller-agent-settings-ui-review                       |
| Browser smoke test           | ✅ PASS             | 758e918 docs-step7e-browser-smoke-closeout                                |

## 10. Browser Smoke Evidence

使用者於 2026-06-09 在 Replit Preview (`22696 → 3000`) 完成人工測試：

- `/settings/agent` 可進入 ✅
- 設定可修改並儲存 ✅
- 重新整理後資料保留 ✅
- Webhook URL 保留 ✅
- Webhook Secret 更換（「已設定」） ✅
- Webhook Secret 清除（「未設定」） ✅
- secret / hash 未外洩 ✅

詳見：`docs/order-step7e-browser-smoke-closeout.md`

## 11. DB Cleanup Verification

```sql
SELECT COUNT(*) AS remaining_rows
FROM public.seller_agent_settings
WHERE store_id = 1;
```

結果：

```
remaining_rows = 0
```

Smoke test 資料已清理。

## 12. Blocking Issues

**無 Blocking Issue。**

## 13. Non-blocking Notes

1. **SellerAgentSettings response schema 含 platform_managed_reserved**：Response OpenAPI schema 的 `agentMode` enum 包含此值，這是正確的（API 若 DB 中存有此值需能表示），但 seller-facing PATCH / UI 均已明確排除。無需修改。
2. **Main workspace 在 step6f branch**：主 workspace 有既有 step6f unstaged changes，與 Step 7E 無關，無影響。
3. **API server 在 worktree port 19080**：preview 使用 worktree API，非主 workflow port。若 Replit 重啟需手動重啟 worktree API server。

## 14. Final Conclusion

```
PASS — Step 7E Seller Agent Settings 可進 MERGE-PREP
```

所有審查項目通過：

- DB schema ✅
- API ✅
- OpenAPI / Client ✅
- UI ✅
- Security ✅
- Tests ✅
- Browser smoke ✅
- DB cleanup ✅

## 15. Merge-Prep Readiness

Step 7E Seller Agent Settings 已具備以下條件可進入 MERGE-PREP：

- [ ] 確認 MERGE-PREP 的目標 branch
- [ ] 確認 cherry-pick 或 merge 策略
- [ ] 確認 step6f 是否已完成（step7e branch 從 step6f 上游分出）
- [ ] 確認 DB migration 已在目標環境套用
- [ ] 確認 preview / staging 環境 API server 是否設定 `PORT=19080`

## 16. 未執行項目

| 項目                       | 原因                                  |
| -------------------------- | ------------------------------------- |
| 重新執行 integration tests | 禁止重跑 DB write tests，引用既有結果 |
| E2E 自動化測試             | 超出本輪範疇                          |
| DB push                    | 明確禁止                              |
| migrate                    | 明確禁止                              |
| seed                       | 明確禁止                              |
| GitHub push                | 明確禁止                              |

## 17. 風險與待確認

1. **worktree API server 不自動重啟**：`PORT=19080` API server 在 worktree process，session 重啟需手動重啟
2. **Replit workflow 指向 8080**：若 Replit 重跑 workflow，shop-app proxy 會打到不存在的 8080
3. **MERGE-PREP 目標 branch 未定**：需確認 Step 7E 如何合回主線

## 18. 下一步建議

**Step 7E-2-MERGE-PREP**：

1. 確認合併目標 branch（main 或 develop）
2. 準備 cherry-pick 或 squash merge 計畫
3. 確認 DB migration 在目標環境狀態
4. 更新 `.replit` workflow 以正確啟動 API server
5. 最終合併並執行 post-merge verification

---

**本次審查說明：**

- 本次未修改 UI code
- 本次未修改 backend API
- 本次未修改 OpenAPI / codegen
- 本次未修改 schema
- 本次未修改 migration
- 本次未執行 DB push
- 本次未執行 migrate
- 本次未執行 seed
- 本次未 push GitHub
