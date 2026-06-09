# Step 7E-2-UI-PREFLIGHT Seller Agent Settings UI 施工前盤點

## 1. 任務背景

Step 7E-1b-INTEGRATION-TEST 已完成（commit `5a62b9b`）。
Integration test 25 tests pass，0 fail，API 無 bug，DB 已清理。

本次為 UI 施工前盤點，**不施工 UI**，僅分析現有前端結構、決定 route 與 component 策略、確認 API 串接方式。

## 2. UI Worktree / Branch

| 項目 | 值 |
|------|-----|
| Worktree | `/home/runner/workspace/.worktrees/step7e-ui` |
| Branch | `qa/step7e-seller-agent-settings-ui` |
| 起始 commit | `5a62b9b` (test-api-step7e-seller-agent-settings-integration) |
| 起點 | `qa/step7e-seller-agent-settings-api` |

## 3. Reviewed Commits

| commit | message |
|--------|---------|
| `5a62b9b` | test-api-step7e-seller-agent-settings-integration |
| `793a17f` | docs-step7e-seller-agent-settings-db-push |
| `dc75672` | feat-api-step7e-seller-agent-settings |
| `626b399` | feat-db-step7e-seller-agent-settings-schema |

---

## 4. Frontend App Structure

### App 層次

```
artifacts/shop-app/        ← Vite + React + wouter 前端 SPA
  src/
    App.tsx                ← Router / ClerkProvider / QueryClientProvider
    main.tsx
    pages/
      Dashboard.tsx        ← 後台首頁（含 BottomNav）
      Settings.tsx         ← 店鋪設定（/settings）
      Orders.tsx
      Products.tsx
      ProductForm.tsx
      ProductCategories.tsx
      ...
    components/ui/         ← shadcn/ui 元件庫
      switch.tsx           ← Switch ✓ 存在但尚未在 pages 中使用
      checkbox.tsx         ← Checkbox ✓ 存在但尚未在 pages 中使用
      select.tsx           ← Select ✓ 存在但尚未在 pages 中使用
      ...
    hooks/
      use-toast.ts         ← Toast hook（Orders.tsx 已使用）
    lib/
      queryClient.ts

lib/api-client-react/       ← 自動生成的 React Query API client
  src/
    generated/
      api.ts               ← orval 生成（DO NOT EDIT MANUALLY）
      api.schemas.ts       ← TypeScript types（orval 生成）
    custom-fetch.ts         ← 底層 fetch 封裝（自動帶 Bearer token）
    index.ts

lib/api-spec/
  openapi.yaml             ← API spec（orval codegen 來源）
  orval.config.ts
```

### Router 架構

- 使用 `wouter`（SPA routing）
- `App.tsx` 中 `AppRouter` 為最外層 route
- Merchant 功能路由由 `MerchantPortal` 元件包裝：
  - `/dashboard` → `DashboardPage`
  - `/products/*` → `ProductFormPage` / `ProductsPage`
  - `/orders` → `OrdersPage`
  - `/settings` → `SettingsPage`
  - `/categories` → `ProductCategoriesPage`
  - `/guide` → `GuidePage`
- `MerchantPortal` 在 render 前驗證 Clerk 登入 + store 存在，確保所有子 route 已有 session

### BottomNav

底部導覽列定義於 `Dashboard.tsx`，四個 tab：

```
dashboard | products | orders | settings
```

「設定」tab 對應 `/settings`，`active="settings"` 由各 settings 子頁面傳入。

---

## 5. 現有 Seller / Store UI Pattern

### storeId 取得方式

**所有頁面** 均使用相同 pattern：

```tsx
const { data: store } = useGetMyStore();
const storeId = store?.id;
// guard: if (!storeId) return;
```

`useGetMyStore()` 來自 `@workspace/api-client-react`，回傳 `Store` 型別（id, merchantId, name, slug, ...）。

`store.id` 為 DB integer，即 API 路徑中的 `:storeId`。

### Loading / Error State Pattern（Settings.tsx）

```tsx
const { data: store, isLoading } = useGetMyStore();
const mutation = useUpdateStore();
const [saved, setSaved] = useState(false);
const [error, setError] = useState("");

// Loading:
if (isLoading) return <SpinnerUI />;

// Error inline:
{error && (
  <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
    {error}
  </div>
)}

// Button state:
<button disabled={mutation.isPending}>
  {saved ? "已儲存！" : mutation.isPending ? "儲存中..." : "儲存設定"}
</button>
```

### Toast Pattern（Orders.tsx）

```tsx
import { toast } from "@/hooks/use-toast";
toast({ title: "成功訊息" });
```

### Toggle / Switch Pattern（Products.tsx）

目前 Products.tsx 使用自訂 div-toggle，但 `components/ui/switch.tsx`（shadcn/ui）已存在，建議直接使用。

---

## 6. 現有 API Client Pattern

### 呼叫方式

所有 API 呼叫使用 `@workspace/api-client-react` 的 React Query hooks：

```tsx
import {
  useGetMyStore,
  useUpdateStore,
  getGetMyStoreQueryKey,
} from "@workspace/api-client-react";
```

### 底層 fetch

`custom-fetch.ts` 封裝 `customFetch()`：
- 自動附加 `Authorization: Bearer <token>`（由 `ClerkTokenBridge` 設定 `setAuthTokenGetter`）
- 自動解析 JSON response
- 非 2xx → 拋出 `ApiError`（含 `status`、`data.error`）

### 現有 agent settings 在 generated client 中的情況

**重要：`/stores/:storeId/agent/settings` 目前不在 `openapi.yaml` 中。**

因此：
- `lib/api-client-react/src/generated/api.ts` 無 `useGetSellerAgentSettings` / `usePatchSellerAgentSettings`
- 需要補充 API spec 或手寫 hook

---

## 7. 建議 Route

### 結論：新增獨立 route `/settings/agent`

| 項目 | 建議 |
|------|------|
| Route path | `/settings/agent` |
| Component | `AgentSettingsPage` |
| File | `artifacts/shop-app/src/pages/AgentSettings.tsx` |
| Entry point | 在 `Settings.tsx` 加一個 navigation card，點擊跳轉 |
| BottomNav | `active="settings"`（與 Settings.tsx 相同） |

### 理由

- Agent 設定欄位多（15+ 欄位），放在現有 Settings.tsx 會過長
- 獨立頁面可有自己的 loading / error state
- 符合現有 "獨立頁面" 模式（ProductCategories 也是獨立 route）

### App.tsx 需新增（UI 施工時）

```tsx
// AppRouter 中（與 /settings 同層）:
<Route path="/settings/agent" component={MerchantPortal} />

// MerchantPortal Switch 中：
<Route path="/settings/agent" component={AgentSettingsPage} />
```

---

## 8. 建議 Component 結構

```
artifacts/shop-app/src/pages/AgentSettings.tsx
```

主要結構：

```tsx
export default function AgentSettingsPage() {
  const { data: store } = useGetMyStore();
  const storeId = store?.id;

  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // On mount: GET /stores/:storeId/agent/settings
  // On submit: PATCH /stores/:storeId/agent/settings

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-24">
      <header>...</header>
      <form onSubmit={handleSubmit}>
        {/* agentStatus Switch */}
        {/* agentMode Select */}
        {/* queryFrequency Select */}
        {/* enabledLogistics Checkbox group */}
        {/* queryMethods Checkbox group */}
        {/* confirm / notify booleans */}
        {/* webhook section */}
        {/* webhookSecret section */}
      </form>
      <BottomNav active="settings" />
    </div>
  );
}
```

---

## 9. API Integration Plan

### 方案 A（建議）：補充 openapi.yaml + regenerate

1. 在 `lib/api-spec/openapi.yaml` 新增 `/stores/{storeId}/agent/settings` GET / PATCH 端點
2. 執行 `pnpm --filter @workspace/api-spec codegen`
3. 生成 `useGetSellerAgentSettings` / `useUpdateSellerAgentSettings` hooks
4. `AgentSettings.tsx` 直接 import 使用

**優點：** 保持 type-safe codegen；`api.schemas.ts` 自動更新。

### 方案 B（備案）：手寫 custom hook

若 codegen 有困難（如 node_modules 缺失），直接使用 `customFetch`：

```tsx
// lib/api-client-react/src/sellerAgent.ts（手寫，非 generated）
import { customFetch } from "./custom-fetch";

export type AgentSettings = {
  storeId: number;
  merchantId: string;
  agentStatus: "disabled" | "enabled";
  agentMode: "self_hosted_webhook" | "external_agent" | "rule_worker";
  enabledLogistics: string[];
  queryMethods: string[];
  queryFrequency: "manual" | "daily" | "every_6_hours" | "every_2_hours_high_tier";
  notifyOnUnknown: boolean;
  requireConfirmOnException: boolean;
  requireConfirmOnReturned: boolean;
  requireConfirmOnDelivered: boolean;
  hideErrorDetailsFromBuyer: boolean;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  hasWebhookSecret: boolean;
};

export async function getSellerAgentSettings(storeId: number): Promise<AgentSettings> {
  const res = await customFetch<{ data: AgentSettings }>(
    `/api/stores/${storeId}/agent/settings`
  );
  return res.data;
}

export async function patchSellerAgentSettings(
  storeId: number,
  patch: Partial<AgentSettings> & { webhookSecret?: string | null }
): Promise<AgentSettings> {
  const res = await customFetch<{ data: AgentSettings }>(
    `/api/stores/${storeId}/agent/settings`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
  return res.data;
}
```

使用方式（AgentSettings.tsx）：

```tsx
// GET on mount (via useState + useEffect)
useEffect(() => {
  if (!storeId) return;
  setIsLoading(true);
  getSellerAgentSettings(storeId)
    .then(s => { setSettings(s); setIsLoading(false); })
    .catch(err => { setError("載入設定失敗"); setIsLoading(false); });
}, [storeId]);

// PATCH on submit
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSaving(true);
  setError("");
  try {
    const updated = await patchSellerAgentSettings(storeId!, formValues);
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  } catch (err: any) {
    setError(err?.data?.error ?? "儲存失敗，請稍後再試");
  } finally {
    setIsSaving(false);
  }
};
```

### 推薦順序

施工時先嘗試方案 A（codegen）；若 codegen 受阻則直接用方案 B（手寫 customFetch）。方案 B 不修改 generated 檔案。

---

## 10. Form Fields Plan

### 群組 1：AI 助理狀態

| 欄位 | UI 元件 | 選項 |
|------|---------|------|
| `agentStatus` | Switch（開/關） | `enabled` / `disabled` |
| `agentMode` | Select | `rule_worker`（規則工人）/ `external_agent`（外部 Agent）/ `self_hosted_webhook`（自架 Webhook） |

注意：`platform_managed_reserved` **不出現在 UI**。

### 群組 2：查詢設定

| 欄位 | UI 元件 | 選項 |
|------|---------|------|
| `queryFrequency` | Select | manual / daily / every_6_hours / every_2_hours_high_tier |
| `queryMethods` | Checkbox group | manual / csv_import / webhook / scheduled |

### 群組 3：出貨物流

| 欄位 | UI 元件 | 選項 |
|------|---------|------|
| `enabledLogistics` | Checkbox group | seven_eleven / family_mart / home_delivery / other / webhook |

### 群組 4：確認設定

| 欄位 | UI 元件 |
|------|---------|
| `notifyOnUnknown` | Switch（發現未知狀態時通知）|
| `requireConfirmOnException` | Switch（例外狀態需確認）|
| `requireConfirmOnReturned` | Switch（退回需確認）|
| `requireConfirmOnDelivered` | Switch（已送達需確認）|
| `hideErrorDetailsFromBuyer` | Switch（對買家隱藏錯誤細節）|

### 群組 5：Webhook

| 欄位 | UI 元件 |
|------|---------|
| `webhookEnabled` | Switch（啟用 Webhook）|
| `webhookUrl` | Input（條件顯示：webhookEnabled = true）|

---

## 11. Webhook Secret UX Plan

### 設計原則

- **永遠不顯示** hash 或明文
- 只顯示 `hasWebhookSecret` 狀態：「已設定」/ 「未設定」
- 提供「更換 Secret」/ 「清除 Secret」兩個動作

### UI 流程

```
[ Webhook Secret ]
  狀態：已設定 ✓   [更換]  [清除]

  ↓ 點擊「更換」
  輸入新的 Webhook Secret：
  [______________] [確認更換]

  ↓ 點擊「清除」
  確認清除 Webhook Secret 嗎？
  [取消]  [確認清除]
```

### 實作細節

```tsx
// 未設定狀態
const [showSecretInput, setShowSecretInput] = useState(false);
const [newSecret, setNewSecret] = useState("");

// PATCH with new secret
await patchSellerAgentSettings(storeId, { webhookSecret: newSecret });

// PATCH to clear secret
await patchSellerAgentSettings(storeId, { webhookSecret: null });
```

- `webhookSecret` 欄位在 `PATCH` body 中才出現（不在 form state 中常態持有）
- input type="password"，可切換顯示/隱藏
- 「清除」動作需確認對話（防誤觸）
- 儲存後自動清空 input、顯示「已設定 ✓」

---

## 12. Validation / Error Handling Plan

### Client-side validation

| 欄位 | 驗證 |
|------|------|
| `webhookUrl` | 若 webhookEnabled=true 且 url 不空，validate URL format |
| `agentMode` | 下拉已限制不含 `platform_managed_reserved`，無需額外 validation |
| `enabledLogistics` / `queryMethods` | 陣列型，空值允許（API 不限制非空）|

### API error handling

```tsx
catch (err: any) {
  // API 400 error body: { error: "...", message: "..." }
  const msg = err?.data?.message || err?.data?.error || "儲存失敗，請稍後再試";
  setError(msg);
}
```

### 「尚未儲存」狀態

GET 回傳的 default config（無 DB row 時）：
- API 文件確認：GET 無 row 時回傳 in-memory default，不建立 DB row
- UI 建議：**不特別顯示「尚未儲存」**，因為 default config 與初次儲存後的 UI 相同，顯示「尚未儲存」反而容易誤導
- 等使用者首次 PATCH 後，UI 正常顯示「已儲存！」

---

## 13. Testing Plan

### 施工完成後建議執行

1. **手動 UI 測試（必做）**
   - 載入 `/settings/agent`：確認 GET 成功，顯示 default 或 DB 值
   - 修改各欄位後 PATCH：確認儲存成功，重新 GET 驗證
   - webhookSecret 更換：確認 `hasWebhookSecret=true`，不顯示 hash
   - webhookSecret 清除：確認 `hasWebhookSecret=false`
   - 錯誤狀態：斷線、invalid value → 顯示 error

2. **整合 mock test 擴充（可選）**
   - 目前 mock tests 在 API server 側（45 tests）
   - UI 側若要 mock test，建議用 vitest + @testing-library/react

3. **E2E（暫不安排）**
   - 因目前無 E2E 框架（Playwright / Cypress 未設定）

---

## 14. 未執行項目

| 項目 | 狀態 |
|------|------|
| 施工 UI | **本次未執行** |
| 修改 API | **本次未執行** |
| 修改 openapi.yaml | **本次未執行**（施工時方案 A 需要） |
| DB push | **本次未執行** |
| migrate | **本次未執行** |
| seed | **本次未執行** |
| push GitHub | **本次未執行** |
| 修改 package.json / lockfile | **本次未執行** |

---

## 15. 風險與待確認

1. **openapi.yaml codegen 方案（方案 A）**：需在 `.worktrees/step7e-ui` 環境執行 `pnpm codegen`。若 node_modules 缺失或 orval 版本問題，改用方案 B（手寫 customFetch）。

2. **AgentSettings 欄位中文 label**：`agentMode` / `queryFrequency` / `enabledLogistics` / `queryMethods` 的中文顯示名稱尚未確認，施工時需設計對照表。

3. **Switch vs Checkbox**：`agentStatus` 以 Switch 顯示（明確 enabled/disabled）；多選欄位（`enabledLogistics`, `queryMethods`）用 Checkbox group；單一 boolean 欄位（`notifyOnUnknown` 等）用 Switch。需設計統一視覺 style。

4. **webhookSecret 清除確認**：建議 `alert-dialog` 確認，否則誤點清除無法復原（DB hash 直接刪掉）。

5. **App.tsx route 新增**：須在 `AppRouter` 與 `MerchantPortal` 同時新增 `/settings/agent` route，否則 wouter 會 fallback 到 NotFoundPage。

6. **`queryFrequency = "every_2_hours_high_tier"`**：此為高頻方案，UI 可考慮加說明「需升級方案」。目前 API 不做 tier 驗證，但 UI 可顯示提示。

---

## 16. 下一步施工建議

### Step 7E-2 施工清單

1. **決定 API 串接方案（A 或 B）**：
   - 方案 A：更新 `lib/api-spec/openapi.yaml` → codegen → 使用生成 hooks
   - 方案 B：在 `lib/api-client-react/src/` 新增手寫 `sellerAgent.ts`

2. **新增 AgentSettings.tsx**：
   - `artifacts/shop-app/src/pages/AgentSettings.tsx`
   - import `useGetMyStore` 取得 storeId
   - 使用 `getSellerAgentSettings` / `patchSellerAgentSettings`

3. **更新 App.tsx**：
   - `AppRouter` 新增 `<Route path="/settings/agent" component={MerchantPortal} />`
   - `MerchantPortal Switch` 新增 `<Route path="/settings/agent" component={AgentSettingsPage} />`

4. **更新 Settings.tsx**：
   - 在「店鋪設定」頁面末尾加「AI 助理設定」navigation card

5. **手動 UI 測試**

6. **commit `feat-ui-step7e-seller-agent-settings`**
