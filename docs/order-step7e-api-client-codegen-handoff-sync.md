# Step 7E-2-API-CLIENT-CODEGEN Handoff Sync

## 任務背景

Step 7E-2-UI-PREFLIGHT（commit `5e1125b`）完成後，本次執行 API Client Codegen。
在 UI worktree 補充 openapi.yaml，執行 orval codegen，生成 React Query hooks。

## UI Worktree / Branch

| 項目     | 值                                            |
| -------- | --------------------------------------------- |
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch   | `qa/step7e-seller-agent-settings-ui`          |
| 起點     | 接續 UI-PREFLIGHT commit `5e1125b`            |

## Codegen Commit

| commit    | message                                        |
| --------- | ---------------------------------------------- |
| `68659ce` | `feat-client-step7e-seller-agent-settings-api` |

## 修改/新增檔案（共 20 files）

### 修改

- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/index.ts`

### 新增（Zod validators + doc）

- `lib/api-zod/src/generated/types/[14 new files]`
- `docs/order-step7e-seller-agent-settings-api-client-codegen.md`

## 生成的 Hooks

| Hook                                 | 用途                            |
| ------------------------------------ | ------------------------------- |
| `useGetSellerAgentSettings(storeId)` | React Query GET hook            |
| `useUpdateSellerAgentSettings()`     | React Query mutation PATCH hook |

元件存取方式：

```tsx
const { data } = useGetSellerAgentSettings(storeId!);
const settings = data?.data; // settings: SellerAgentSettings | undefined
```

## Enum 值

| 欄位                   | 值                                                                          |
| ---------------------- | --------------------------------------------------------------------------- |
| agentStatus            | disabled, enabled                                                           |
| agentMode (response)   | rule_worker, external_agent, self_hosted_webhook, platform_managed_reserved |
| agentMode (request)    | rule_worker, external_agent, self_hosted_webhook                            |
| queryFrequency         | manual, daily, every_6_hours, every_2_hours_high_tier                       |
| enabledLogistics items | seven_eleven, family_mart, home_delivery, other, webhook                    |
| queryMethods items     | manual, csv_import, webhook, scheduled                                      |

## Typecheck 結果

```
pnpm -w run typecheck:libs → tsc --build → 0 errors
```

## 未執行項目

| 項目                     | 狀態                     |
| ------------------------ | ------------------------ |
| 施工 UI                  | 未執行（本次為 codegen） |
| 修改 backend API         | 未執行                   |
| DB push / migrate / seed | 未執行                   |
| push GitHub              | 未執行                   |

## 風險與待確認

1. UI 元件存取 settings 時需用 `data?.data`（雙層），因回應 wrapper 為 `{ data: SellerAgentSettings }`
2. worktree 無獨立 `node_modules`，codegen 使用主 workspace binary
3. worktree `.git` pointer 已修復，restart 後可能再次遺失

## 下一步建議

進入 **Step 7E-2 UI 施工**：

1. 新增 `AgentSettings.tsx`
2. 更新 `App.tsx` routes
3. `Settings.tsx` 加入 navigation card
4. commit `feat-ui-step7e-seller-agent-settings`
