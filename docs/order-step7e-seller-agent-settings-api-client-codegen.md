# Step 7E-2-API-CLIENT-CODEGEN：Seller Agent Settings API Client Codegen

## 任務

在 `lib/api-spec/openapi.yaml` 補上 `/stores/{storeId}/agent/settings` GET / PATCH 路徑及 schemas，
執行 orval codegen，生成 React Query hooks 與 Zod validators。

## Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |

## 新增 OpenAPI Spec

### 路徑

- `GET /stores/{storeId}/agent/settings` — operationId: `getSellerAgentSettings`
- `PATCH /stores/{storeId}/agent/settings` — operationId: `updateSellerAgentSettings`

### 新增 Schemas

**SellerAgentSettings**（GET / PATCH 回應）
- 必要欄位：storeId, merchantId, agentStatus, agentMode, enabledLogistics, queryMethods, queryFrequency, 5 × boolean confirm/notify, webhookEnabled, hasWebhookSecret
- 選用欄位：id, webhookUrl, lastTestRunAt, lastRunAt, createdAt, updatedAt
- agentMode 含 `platform_managed_reserved`（response only，UI 不顯示）

**UpdateSellerAgentSettingsRequest**（PATCH 請求）
- 全部欄位為 optional
- agentMode 排除 `platform_managed_reserved`
- 含 webhookSecret（plaintext，null = 清除）

### Enum 值

| 欄位 | 值 |
|------|-----|
| agentStatus | disabled, enabled |
| agentMode (response) | rule_worker, external_agent, self_hosted_webhook, platform_managed_reserved |
| agentMode (request) | rule_worker, external_agent, self_hosted_webhook |
| queryFrequency | manual, daily, every_6_hours, every_2_hours_high_tier |
| enabledLogistics items | seven_eleven, family_mart, home_delivery, other, webhook |
| queryMethods items | manual, csv_import, webhook, scheduled |

## 生成的 Hooks

| Hook | 用途 |
|------|------|
| `useGetSellerAgentSettings(storeId)` | GET seller agent settings |
| `useUpdateSellerAgentSettings()` | PATCH seller agent settings (mutation) |

回應型別：`{ data: SellerAgentSettings }`
元件存取方式：`const { data } = useGetSellerAgentSettings(storeId!); const settings = data?.data;`

## 修改 / 生成檔案

### 修改
- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/index.ts`

### 新增（Zod validators）
- `lib/api-zod/src/generated/types/sellerAgentSettings.ts`
- `lib/api-zod/src/generated/types/sellerAgentSettingsAgentMode.ts`
- `lib/api-zod/src/generated/types/sellerAgentSettingsAgentStatus.ts`
- `lib/api-zod/src/generated/types/sellerAgentSettingsEnabledLogisticsItem.ts`
- `lib/api-zod/src/generated/types/sellerAgentSettingsQueryFrequency.ts`
- `lib/api-zod/src/generated/types/sellerAgentSettingsQueryMethodsItem.ts`
- `lib/api-zod/src/generated/types/updateSellerAgentSettingsRequest.ts`
- `lib/api-zod/src/generated/types/updateSellerAgentSettingsRequestAgentMode.ts`
- `lib/api-zod/src/generated/types/updateSellerAgentSettingsRequestAgentStatus.ts`
- `lib/api-zod/src/generated/types/updateSellerAgentSettingsRequestEnabledLogisticsItem.ts`
- `lib/api-zod/src/generated/types/updateSellerAgentSettingsRequestQueryFrequency.ts`
- `lib/api-zod/src/generated/types/updateSellerAgentSettingsRequestQueryMethodsItem.ts`
- `lib/api-zod/src/generated/types/getSellerAgentSettings200.ts`
- `lib/api-zod/src/generated/types/updateSellerAgentSettings200.ts`

## Codegen 執行方式

worktree 無獨立 `node_modules`，使用主 workspace 的 orval binary：
```
/home/runner/workspace/lib/api-spec/node_modules/.bin/orval --config ./orval.config.ts
```

從 `/home/runner/workspace/.worktrees/step7e-ui/lib/api-spec/` 執行。

## Typecheck 結果

```
pnpm -w run typecheck:libs → tsc --build → 0 errors
```

## 未執行項目

| 項目 | 原因 |
|------|------|
| UI 施工 | 非本次任務範圍 |
| backend API 修改 | 非本次任務範圍 |
| DB push / migrate / seed | 非本次任務範圍 |
| push GitHub | 禁止 |
