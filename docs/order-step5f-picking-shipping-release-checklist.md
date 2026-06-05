# Order Step 5F — 撿貨單 / 出貨單 / CSV / 列印 Release Checklist

> 版本：Step 5F-E（列印功能 + QA 修正）｜分支：`order-step5f-b-picking-shipping-api`
> 用途：Step 5F 正式 release 前人工驗收，以及後續接手參考。
> 文件語言：繁體中文。

---

## 1. Step 5F 總覽

| 階段 | 說明 | 主要 Commit | 狀態 |
|------|------|-------------|------|
| **5F-A** | 撿貨單 / 出貨單 / CSV / 列印規格文件 | `e2aa067` | ✅ 完成 |
| **5F MVP 決策** | MVP 範圍決策文件（不做 server-side PDF / 物流標籤） | `5b5709a` | ✅ 完成 |
| **5F-B** | 撿貨單 JSON API（`POST /orders/picking-list`）| `a98f359` | ✅ 完成 |
| **5F-C** | 撿貨 CSV API（`POST /orders/picking-list.csv`）& 出貨 CSV API（`POST /orders/shipping-list.csv`）| `134dc8e` | ✅ 完成 |
| **5F-D** | Orders 前端：查看撿貨單 / 出貨單 / 下載 CSV | `c7bdac8` | ✅ 完成 |
| **5F-E** | Orders 前端：撿貨單 / 出貨單瀏覽器列印 | `9f029c9` | ✅ 完成 |
| **5F-E QA 修正** | 列印黑畫面修正（hidden iframe）；X 按鈕 focus 樣式修正 | `a9ec99f` `d4f8ff5` | ✅ 完成 |

> **出貨單 JSON API**（`POST /orders/shipping-list`）同於 5F-B 階段完成，commit 同 `a98f359`。

### Commit 清單（依時間順序）

```
e2aa067 docs-order-step5f-picking-shipping-export-spec
5b5709a docs-order-step5f-mvp-decisions
a98f359 api-order-step5f-picking-shipping-data
134dc8e api-order-step5f-csv-export
c7bdac8 ui-order-step5f-picking-shipping-tools
9f029c9 ui-order-step5f-print-view
a9ec99f fix-order-step5f-print-window-qa
1e2a3be ui-order-step5f-close-button-polish
d4f8ff5 fix-order-step5f-dialog-close-focus-style
```

---

## 2. 功能清單

### 後台 API（需登入，`requireAuth` + `verifyStoreOwner`）

| 功能 | 路由 | 方法 | 格式 |
|------|------|------|------|
| 撿貨單資料 | `/api/orders/picking-list` | POST | JSON |
| 出貨單資料 | `/api/orders/shipping-list` | POST | JSON |
| 撿貨 CSV 匯出 | `/api/orders/picking-list.csv` | POST | CSV（BOM UTF-8） |
| 出貨 CSV 匯出 | `/api/orders/shipping-list.csv` | POST | CSV（BOM UTF-8） |

**Request 格式**：`{ orderIds: string[] }`

**撿貨單回應欄位**（按商品 + 規格合計）：
- `productId`、`productName`、`specLabel`、`skuCode`
- `storageTemp`（room_temp / refrigerated / frozen）
- `shelfLife`
- `quantityTotal`（跨選取訂單合計）
- `orderNumbers`（來源訂單編號清單）
- `notes`
- `excludedOrderIds`（已取消訂單，自動排除）

**出貨單回應欄位**（每筆訂單一筆）：
- `orderId`、`orderNumber`、`status`
- `buyerName`、`buyerPhone`
- `productName`、`specValues`、`quantity`
- `paymentStatus`、`shippingStatus`
- `shippingMethod`、`trackingCode`、`trackingProvider`
- `storeCode`、`storeName`（超商取貨）
- `recipientName`、`recipientPhone`、`recipientAddress`
- `shippingNote`、`itemsText`
- **不含**：`internalNote`、`paymentNote`、`publicToken`

**CSV 欄位**（撿貨）：商品名稱、規格、SKU、溫層、保存期限、總數量、來源訂單、備註

**CSV 欄位**（出貨）：訂單編號、買家名稱、買家電話、商品名稱、規格、數量、付款狀態、出貨狀態、出貨方式、追蹤碼、超商店號、超商店名、收件人、收件電話、收件地址、物流備註

### Orders 前端功能

| 功能 | 操作 |
|------|------|
| 查看撿貨單 | 勾選訂單 → 點「查看撿貨單」→ 底部 Sheet 展開 |
| 查看出貨單 | 勾選訂單 → 點「查看出貨單」→ 底部 Sheet 展開 |
| 下載撿貨 CSV | 勾選訂單 → 點「↓撿貨CSV」→ 自動下載 .csv |
| 下載出貨 CSV | 勾選訂單 → 點「↓出貨CSV」→ 自動下載 .csv |
| 撿貨單列印 | 撿貨單 Sheet → 點「列印」→ 系統列印對話框 |
| 出貨單列印 | 出貨單 Sheet → 點「列印」→ 系統列印對話框 |
| 關閉 Sheet | Sheet 右上角 X → 正常關閉 |

**列印實作方式**：hidden iframe（`document.createElement('iframe')`），不開新分頁。
**CSV 編碼**：BOM UTF-8（Excel / Numbers 相容）。

---

## 3. QA 結果

| 項目 | 結果 | 備註 |
|------|------|------|
| API tests | ✅ 91 / 91 通過 | 含 picking-list / shipping-list / CSV 路由測試 |
| Typecheck（全專案）| ✅ 通過 | `pnpm --filter @workspace/shop-app typecheck` |
| shop-app build | ✅ 通過 | Replit Workflow 環境（PORT=22696） |
| 查看撿貨單 | ✅ 瀏覽器 QA 通過 | Sheet 展開、資料正確 |
| 查看出貨單 | ✅ 瀏覽器 QA 通過 | Sheet 展開、資料正確 |
| 下載撿貨 CSV | ✅ 瀏覽器 QA 通過 | 自動下載、BOM 編碼正常 |
| 下載出貨 CSV | ✅ 瀏覽器 QA 通過 | 自動下載、BOM 編碼正常 |
| 撿貨單列印 | ✅ 瀏覽器 QA 通過 | 系統列印對話框正常彈出 |
| 出貨單列印 | ✅ 瀏覽器 QA 通過 | 系統列印對話框正常彈出 |
| 重複列印不黑畫面 | ✅ 瀏覽器 QA 通過 | hidden iframe 修正後解決 |
| X 按鈕 UI | ✅ 瀏覽器 QA 通過 | 無紅色外圈，灰色中性關閉按鈕 |
| 批次付款 / 出貨操作 | ✅ 迴歸測試通過 | Step 5F 修改未影響原有批次操作 |

> **QA 過程記錄**：
>
> - **5F-D 404 問題**：api-server 跑舊 dist，rebuild + restart 後解決。
> - **5F-E 黑畫面問題**：`window.open("", "_blank")` 在 Replit preview 造成 popup 覆蓋與 focus-trap 異常。修正為 hidden iframe 方式。
> - **X 按鈕紅色外圈問題**：全域 `--ring` 為 rose 紅色；`SheetContent` 內建 X 按鈕（`absolute right-4 top-4`）使用 `focus:ring-ring` 與自訂 X 重疊。修正：SheetContent 加 `[&>button:first-child]:hidden`；自訂按鈕改用 `focus-visible:ring-neutral-300`。

---

## 4. 個資與安全確認

| 欄位 | 後台 JSON | 後台 CSV | 列印 | 公開頁 |
|------|-----------|----------|------|--------|
| `internalNote` | ❌ 不回傳 | ❌ 不匯出 | ❌ 不列印 | ❌ 不存在 |
| `paymentNote` | ❌ 不回傳 | ❌ 不匯出 | ❌ 不列印 | ❌ 不存在 |
| `publicToken` | ❌ 不回傳 | ❌ 不匯出 | ❌ 不列印 | 用於驗證身份 |
| `buyerPhone` | ✅ 後台可見 | ✅ 後台 CSV | ✅ 後台列印 | ❌ 不公開 |
| `recipientPhone` | ✅ 後台可見 | ✅ 後台 CSV | ✅ 後台列印 | ❌ 不公開 |
| `recipientAddress` | ✅ 後台可見 | ✅ 後台 CSV | ✅ 後台列印 | ❌ 不公開 |
| `trackingCode` | ✅ 後台可見 | ✅ 後台 CSV | ✅ 後台列印 | 依產品決策 |

**重要提醒**：

- 後台 API 全部需要 `requireAuth` + `verifyStoreOwner`，未登入回 401
- CSV / 出貨單屬**店家內部工具**，請勿公開分享下載連結
- `publicToken` 不出現在任何撿貨 / 出貨回應中
- `internalNote` / `paymentNote` 不出現在前端 dialog、CSV、列印任何位置
- 收件電話 / 地址出現在 CSV / 列印中，屬店家後台操作範圍，不影響公開追蹤頁

---

## 5. 已知限制

### 本 MVP 明確不做

| 功能 | 說明 |
|------|------|
| Server-side PDF | 瀏覽器列印已可輸出 PDF，不再做後端 PDF 生成 |
| 物流標籤 | 尚未規劃，建議 Step 5G |
| 模板自訂 | 列印版型固定，不可自訂 |
| 一品項一列 CSV | 目前 CSV 是按訂單彙整；一品項一列模式未做 |
| 自動金流串接 | 付款狀態仍為店家手動記錄 |
| 自動物流串接 | 出貨狀態仍為店家手動記錄 |
| 買家通知 | 出貨後無自動通知信 / SMS |

### 環境

- Production / Staging DB schema 已含 Step 5 欄位（本功能不需額外 migration）
- api-server 每次部署需確認使用最新 build（詳見 Section 8 Release Checklist）

---

## 6. 架構說明（接手參考）

### Monorepo 結構

```
artifacts/api-server/   Express.js + TypeScript API
artifacts/shop-app/     React + Vite 前端
lib/api-spec/           OpenAPI 3.1 YAML
lib/api-zod/            由 openapi-zod-client 生成（Zod validators）
lib/api-client-react/   由 orval 生成（React Query hooks）
lib/db/                 Drizzle ORM + PostgreSQL
```

### 前端關鍵檔案

| 檔案 | 說明 |
|------|------|
| `artifacts/shop-app/src/pages/Orders.tsx` | 訂單列表頁，含批次選取 + 4 個撿貨 / 出貨按鈕 |
| `artifacts/shop-app/src/pages/PickingListDialog.tsx` | 撿貨單底部 Sheet |
| `artifacts/shop-app/src/pages/ShippingListDialog.tsx` | 出貨單底部 Sheet |
| `artifacts/shop-app/src/lib/printHelpers.ts` | 列印輔助函式（hidden iframe 方式） |

### API 關鍵檔案

| 檔案 | 說明 |
|------|------|
| `artifacts/api-server/src/routes/orders.ts` | 訂單 routes，含 picking-list / shipping-list / CSV |
| `lib/api-spec/openapi.yaml` | OpenAPI 規格，picking-list / shipping-list 端點 |
| `lib/api-zod/`（generated）| Zod validators，由 YAML 生成 |
| `lib/api-client-react/`（generated）| React Query hooks，由 orval 生成 |

### 列印實作說明

```ts
// printHelpers.ts — hidden iframe 方式，不開新分頁
function openPrint(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  // 隱藏但可渲染
  iframe.style.cssText = "position:fixed;...;visibility:hidden;z-index:-9999;";
  document.body.appendChild(iframe);
  doc.write(html);
  setTimeout(() => {
    cw.focus();
    cw.print();
    cw.addEventListener("afterprint", cleanup, { once: true });
  }, 250);
}
```

---

## 7. Git / 分支注意事項

### 目前分支

- `order-step5f-b-picking-shipping-api`（Step 5F 工作分支）
- base：從 `order-step5-payment-logistics-fields` 分出（已 merge 回 main 的 Step 5 基礎上建立）

### 不可 Stage 清單

- `.claude/settings.local.json`
- `dev-handoff/`（已在 .gitignore）
- 任何 secrets / credentials / env 檔案

### Replit 環境注意

- api-server 由 Replit Workflow 管理，使用**絕對路徑**啟動
- 手動 `node ./dist/index.mjs`（相對路徑）會導致 Workflow 的 `pkill` 無法匹配 → port 衝突
- 每次 Workflow 重啟前會自動 `pkill -f 'artifacts/api-server/dist/index.mjs'` 並 rebuild

---

## 8. Release Checklist

請在 release 前逐項確認。

### A. 環境準備

- [ ] api-server 使用最新 build（Replit Workflow 已 rebuild）
- [ ] api-server 正常回應 `GET /api/healthz` → 200
- [ ] shop-app dev server 正常在 port 22696
- [ ] 相關環境變數確認（`VITE_CLERK_PUBLISHABLE_KEY`、`CLERK_SECRET_KEY`、`DATABASE_URL` 均已設定）

### B. API Routes 確認

- [ ] `POST /api/orders/picking-list` → 未登入回 401，登入後回 200
- [ ] `POST /api/orders/shipping-list` → 未登入回 401，登入後回 200
- [ ] `POST /api/orders/picking-list.csv` → 未登入回 401，登入後下載 CSV
- [ ] `POST /api/orders/shipping-list.csv` → 未登入回 401，登入後下載 CSV

### C. 前端功能 QA

- [ ] 勾選 2～3 筆訂單 → 點「查看撿貨單」→ Sheet 展開，資料正確
- [ ] 點「列印」→ 系統列印對話框出現（不開新分頁）
- [ ] 關閉列印 → X 按鈕可正常關閉 Sheet（無紅色外圈）
- [ ] 再次點「列印」→ 不出現黑畫面
- [ ] 勾選 2～3 筆訂單 → 點「查看出貨單」→ Sheet 展開，資料正確
- [ ] 出貨單列印正常
- [ ] 點「↓撿貨CSV」→ 自動下載，Excel / Numbers 可正常開啟（中文不亂碼）
- [ ] 點「↓出貨CSV」→ 自動下載，Excel / Numbers 可正常開啟（中文不亂碼）

### D. 個資安全確認

- [ ] 出貨單 Sheet 不顯示 `internalNote`
- [ ] 出貨單 Sheet 不顯示 `paymentNote`
- [ ] 出貨單 Sheet 不顯示 `publicToken`
- [ ] 出貨 CSV 不包含 `publicToken` 欄位
- [ ] 列印畫面不顯示 `internalNote` / `paymentNote` / `publicToken`
- [ ] 已取消訂單自動排除，並於 Sheet 顯示排除提示（excludedOrderIds）

### E. 迴歸測試

- [ ] 訂單列表可正常載入
- [ ] 批次付款狀態更新仍正常
- [ ] 批次出貨狀態更新仍正常
- [ ] 公開追蹤頁（`/order?token=xxx`）未受影響

### F. 程式碼 / CI 確認

- [ ] API tests 91 / 91 通過
- [ ] Typecheck 通過
- [ ] `.claude/` 未 staged
- [ ] `dev-handoff/` 未 staged
- [ ] 無 secrets / credentials 被 stage 或 commit

---

## 9. Release 判斷規則

| 狀態 | 定義 |
|------|------|
| **READY** | 所有 critical 項目通過，沒有 blocking bug。 |
| **READY WITH NOTES** | 可出貨 / 試跑，但仍有非阻斷性待確認事項。 |
| **NEEDS WORK** | 功能大致可用，但有 UI / 文案 / 小流程問題需修。 |
| **NOT READY** | 任一 critical 項失敗。 |
| **BLOCKED** | 缺環境、缺登入、缺測試資料，無法判斷。 |

**Critical 項目定義**（以下任一失敗 → NOT READY）：

- 撿貨單 / 出貨單 API 無法回應（404 / 500）
- CSV 下載失敗
- `internalNote` / `paymentNote` / `publicToken` 出現在任何前端畫面
- 後台 API 未登入可存取（未回 401）

**目前判斷：READY**（所有 critical 項目已通過瀏覽器 QA）

---

## 10. 下一階段建議

| 選項 | 說明 | 建議時機 |
|------|------|----------|
| **Merge Step 5F 回 main** | 將本分支合併，正式 release | 完成本 checklist 人工驗收後 |
| **Step 5G：物流標籤** | 超商物流標籤列印 / PDF | Step 5F merge 後另開任務 |
| **Step 5G：PDF 匯出** | Server-side PDF（puppeteer 等）| 建議延後，不要混入 5F |
| **Step 5G：模板自訂** | 自訂列印版型 | 建議延後，不要混入 5F |
| **Step 5G：買家通知** | 出貨後自動通知信 / SMS | 建議延後，不要混入 5F |

> **建議**：先 merge Step 5F 回 main，穩定後再另開 Step 5G 工作分支，避免範圍蔓延。

---

## 附記

- 本文件對應分支：`order-step5f-b-picking-shipping-api`
- Step 5F 規格文件：`docs/order-step5f-picking-shipping-export-spec.md`
- Step 5F MVP 決策文件：參見 commit `5b5709a`（`docs/order-step5f-mvp-decisions.md`）
- Step 5 Release Checklist（付款 / 物流欄位）：`docs/order-step5-payment-logistics-release-checklist.md`
- 每次 Step 5F 相關功能有改動，應重新逐項勾選 Section 8 Release Checklist
