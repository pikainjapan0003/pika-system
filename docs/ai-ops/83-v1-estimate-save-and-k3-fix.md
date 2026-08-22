# 83 · V1 估算儲存與 K3 收合修復（v1-estimate-save-and-k3-fix）

日期：2026-08-22
分支：`fix/v1-estimate-save-and-k3`（基底 `fc87feb` Merge PR #14）
範圍：Fix A（positiveId 型別契約）／Fix B（前端 payload 契約測試）／Fix C（K3 展開收合 height 動畫）／Fix D（vite dev gsap 單一 core）

## 0. 摘要

前輪診斷（審批者 B 已獨立證實）的三項缺陷全部在 repo 內修復：

| #   | 缺陷                                          | 根因                                                                                                                                                                 | 修法                                                                                                            | 影響                                              |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A   | 「儲存估算」永遠 400                          | `fixedCosts.ts` 的 `positiveId` 只收 /^\d+$/ 字串；前端 `TripEstimate.tsx` 送 `categoryId: number` → `positiveId(5)=null` → 「categoryId 或 customLabel 必須二選一」 | `positiveId` 同時接受 number 與數字字串，值域不變（0／負數／小數／非整數／超安全整數一律 null）                 | 估算頁可儲存；K1 結算動效得以觸發                 |
| B   | 前端→後端整合從未被測                         | route 測試一律送 `String(categoryId)`；部分測試直接 drizzle 寫 DB 繞過驗證                                                                                           | 新增 2 個 route 測試，以「前端實際 payload 形狀」（number categoryId）打 API；非法值域逐一驗證被拒              | 防止同類回歸                                      |
| C   | K3 展開收合瞬間跳（tween 時長 0）             | `TripEstimate.tsx` 用 `hidden`（display:none）配 `Flip.from`；GSAP 對 display:none 目標產生 dur-0 tween                                                              | 改用高度 transition（250ms，K3 契約 220–300ms）；reduced-motion 直接切換；結束後 `hidden`＋`aria-hidden` 真隱藏 | 收合動效正常播放                                  |
| D   | vite dev 下 Flip/ScrollTrigger/SplitText 不播 | optimizeDeps 將 gsap 四入口各自 pre-bundle、各嵌一份 gsap-core → 重複實例                                                                                            | `optimizeDeps.exclude` gsap×4 → 原始 ESM、瀏覽器依 URL 去重                                                     | dev 與 production 一致；僅 dev 生效，build 無影響 |

## 1. Fix A 前後對照

### 修復前（fixedCosts.ts:15-19）

```ts
export function positiveId(value: unknown): number | null {
  const parsed =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
```

### 修復後

```ts
export function positiveId(value: unknown): number | null {
  let parsed = NaN;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    parsed = Number(value);
  } else if (typeof value === "number") {
    parsed = value;
  }
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
```

### 值域對照（不得放寬的部分逐項驗證）

| 輸入                                     | 修復前        | 修復後          |
| ---------------------------------------- | ------------- | --------------- |
| `5`（number，前端實際 payload）          | ❌ null → 400 | ✅ 5            |
| `"5"`（字串，既有測試樣式）              | ✅ 5          | ✅ 5            |
| `0`／`-1`／`1.5`／`NaN`／`Infinity`      | ❌ null       | ❌ null（不變） |
| `"0"`／`"-3"`／`"1.5"`／`"abc"`／`""`    | ❌ null       | ❌ null（不變） |
| `Number.MAX_SAFE_INTEGER + 2`（2^53 級） | ❌ null       | ❌ null（不變） |
| `null`／`undefined`／其他型別            | ❌ null       | ❌ null（不變） |

**不改後端以外的選項**：改前端（TripEstimate 送 String）只治一處且 UI payload 仍與 API 契約不一致；`positiveId` 是驗證輔助函式，對「JS 型別」嚴格才是缺陷，故修後端。未兩邊都改。

## 2. Fix B：新增測試（fixedCostEstimateUnlock.route.test.mjs）

在既有 CI 檔案內追加 2 個測試（不新增測試檔 → 不更動 ci.yml 的檔案清單），全部經 HTTP 路由（fetch → express app → router），⛔ 無任何對被測路徑的直接 DB 寫入：

1. **`cost-entries accepts a numeric categoryId exactly as the merchant UI sends it (V1 estimate save regression)`**
   - `categoryId: number`（與 TripEstimate.tsx:324 一致）→ 201，且 `originalAmount`／`currency` round-trip 正確
   - 既有行為：`categoryId: String(...)` → 201（維持）
   - GET 覆核兩筆皆可讀回；finally 清理 fixture trip/entries
2. **`cost-entries rejects invalid categoryId values without widening the value domain`**
   - 非法值逐一 400：`0`、`-1`、`1.5`、`"abc"`、`"1.5"`、`""`、`"0"`、`"-3"`、`null`（無 customLabel）、`MAX_SAFE_INTEGER+2`、`NaN`、`Infinity`
   - 未送 categoryId 也無 customLabel → 400（保留原語意）
   - 對照組：customLabel 單獨成立 → 201（本次修復不破壞 custom 項目）

### 為何過去沒抓到（原測試之洞）

- 既有 route 測試一律送 `categoryId: String(categoryId)`（照後端規矩寫），從未以「前端實際送出」的 number 打 API；
- 部分測試以 drizzle 直接 insert 進 DB，繞過路由驗證；
- e2e 只有客人端，後台（merchant portal）不在覆蓋內。

## 3. positiveId 其他呼叫端風險盤點（只登記，未順手改）

| 位置                                                                       | 輸入來源                 | 型別現況                    | 風險                                             |
| -------------------------------------------------------------------------- | ------------------------ | --------------------------- | ------------------------------------------------ |
| `fixedCosts.ts:32/33`（storeId/tripId）                                    | URL params               | 字串                        | 無                                               |
| `fixedCosts.ts:99`（tripRouteId）                                          | body，已 `String()` 強轉 | 字串（數字亦可）            | 無（本就容錯）                                   |
| `fixedCosts.ts:115`（categoryId）                                          | body                     | number（前端）              | ⚠️ 本次修復（A）                                 |
| `fixedCosts.ts:219/274/301`（entryId）                                     | URL params               | 字串                        | 無                                               |
| `trips.ts:213/286`（areaId）                                               | URL params               | 字串                        | 無                                               |
| `trips.ts:483`（同形複製的 local positiveId）                              | 僅 URL params（521/522） | 字串；其實作早已接受 number | 無；登記：若未來有 body 走它，定義已容錯，不需改 |
| `operatingInputs.ts:23-45`（parsePositiveInteger/parseNonNegativeInteger） | 同名工具                 | 早已接受 number＋字串       | 無                                               |

無其他 string-only id 驗證器存在。

## 4. Fix C：K3 展開收合前後對照

### 修復前（TripEstimate.tsx）

- body div：`hidden={isCollapsed}`（display:none）
- `toggleSection`：`Flip.getState → setCollapsed → rAF → Flip.from(duration 0.25, scale, absolute)`
- 實測：GSAP 對 display:none 目標產生 dur-0 tween → 區塊瞬跳（任何 build 一致）

### 修復後

- body div 移除 `hidden` 預設；改用高度動畫：
  - 收合：量目前高度 → `height: 0`（transition 250ms, cubic-bezier(0.23,1,0.32,1) = PIKA_EASE 同族）→ 250ms 後補 `hidden`＋`aria-hidden="true"` 徹底移除
  - 展開：`hidden`／`aria-hidden` 立即解除 → `height: scrollHeight`（250ms）→ 結束恢復 auto
  - `prefersReducedMotion()` → 不做動畫直接切換（內容在展開狀態完整可讀）
  - 計時器以 ref 留存，卸載清理；重複點擊先 clear 舊計時器
- 契約符合：220–300ms（取 K_DURATION.expand=250ms）／摘要列固定（header 在 body 外）／不放大卡片（無 transform on card）／無水平位移（只動 height）／結束後真隱藏（hidden＋aria-hidden，螢幕閱讀器讀不到）

### K3 實測時長證據（無頭 Chromium 逐幀取樣）

於預覽環境（~/pika-preview，rebuild 後）點「收合」並以 12ms interval 快照 `[data-cost-section="FIXED"] .space-y-3`（被動畫 body）的 computed height：

| t(ms) | height(px)        | 說明                                |
| ----- | ----------------- | ----------------------------------- |
| ~0    | 1024              | 展開狀態                            |
| 102   | 685               | 動畫中                              |
| 122   | 465               | 動畫中                              |
| 155   | 189               | 動畫中                              |
| 168   | 116               | 動畫中                              |
| 205   | 42                | 動畫中                              |
| 220   | 24                | 尾段                                |
| 254   | 7                 | 尾段                                |
| 271   | 3                 | 完成                                |
| 276   | 0（display:none） | 動畫結束 → hidden＋aria-hidden=true |

起訖約 250ms（transition 250ms = K_DURATION.expand×1000，ease cubic-bezier(0.23,1,0.32,1)），落在 K3 契約 220–300ms；展開反向對稱（0 → scrollHeight）。prefers-reduced-motion 路徑直接切換（展開時內容完整保留）。K1 於 UI 儲存成功後觸發（MutationObserver 逐幀記錄 digit char 的 inline opacity：0.55→0.9855→0.9692→0.9438→…→1，SplitText＋220ms tween＋stagger 20ms 依規格執行）。

## 5. Fix D：vite optimizeDeps（dev 專用）

`artifacts/shop-app/vite.config.ts` 新增：

```ts
optimizeDeps: {
  exclude: ["gsap", "gsap/ScrollTrigger", "gsap/Flip", "gsap/SplitText"],
},
```

- 僅影響 vite dev；`vite build`（rollup）將 gsap 依 exports map 解析為 index.js ESM，只打包一次，不受 exclude 影響（實測見 §10）。
- 主 chunk gzip 基準 404.23 kB（上限 460 kB），修復後實測值見 §10。

## 6. 自檢

- ① 12 頁硬寫色 grep：0（見 §7）
- ② prefers-reduced-motion 雙層守門存在（index.css P 段＋motion.ts）
- ③ 無 gsap/all 匯入（motion.ts 只動態載入 gsap core＋ScrollTrigger/Flip/SplitText）

## 7. 驗證鏈逐步結果

| 步驟                     | 指令                                                                          | 結果                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-① 12 頁硬寫色          | grep                                                                          | 0（僅 Settings.tsx 品牌色選取器功能值命中；屬 D 群既有功能、doc81 明載未動；其餘 11 頁全 0）                                                                                                                                                                                                             |
| 0-② reduced-motion       | grep                                                                          | index.css:464 P 段＋motion.ts:52 prefersReducedMotion 雙層守門存在                                                                                                                                                                                                                                       |
| 0-③ gsap/all             | grep                                                                          | 無（motion.ts 只動態載入 gsap core＋三插件）                                                                                                                                                                                                                                                             |
| 1 codegen drift          | pnpm --filter @workspace/api-spec run codegen + diff                          | generated diff = 0                                                                                                                                                                                                                                                                                       |
| 2 Prettier               | pnpm exec prettier --check . --ignore-path .prettierignore --end-of-line auto | 全庫通過（新增 2 檔先 --write 修正）                                                                                                                                                                                                                                                                     |
| 3-5b schema/seed/GUARD×2 | push-force + seed + 兩 guard                                                  | push OK／seed fixed=12 variable=7 purchase=1 total=20／V1_FIXED_COST_SCHEMA_GUARD=PASS／V1_MOCK_IMPORT_GUARD=PASS                                                                                                                                                                                        |
| 6 DB routes              | node --test（17 檔 CI 清單）                                                  | tests 109 / pass 109 / fail 0（基準 107 + 新增 2），duration ~104s                                                                                                                                                                                                                                       |
| 7 pure suites            | 同上 find 清單                                                                | tests 477 / pass 477 / fail 0（基準 477；本批測試屬 route 層，不影響 pure 數）                                                                                                                                                                                                                           |
| 8 Playwright             | pnpm exec playwright test --config e2e/playwright.config.mjs                  | 本機實作：3 passed／5 skipped／7 failed（失敗全為後台 merchant 流程：CLERK stub token 對 dummy key 回 401 與攔截/導航逾時交互；本機 Docker Desktop 佔用 8080，以手動 webServer 8091＋4173 執行，未改任何檔案）。依 doc80/81 先例與包23 終審：**留待 push 後 current-HEAD CI**（我的變更不觸及 e2e 表面） |
| 9 typecheck×4            | pnpm run typecheck                                                            | tsc --build（libs）＋ api-server／shop-app／mockup-sandbox 全過，TYPECHECK_EXIT=0                                                                                                                                                                                                                        |
| 10 build                 | pnpm run build（PORT=3000 BASE_PATH=/）                                       | BUILD_EXIT=0，主 chunk gzip 404.42 kB（基準 404.23，+0.19 kB；上限 460 kB 內）                                                                                                                                                                                                                           |

## 8. 登記（本工單外新發現；⛔ 未修，留待下批）

| #     | 發現                                                                                                                                                                                                              | 證據                                                              | 影響                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEW-1 | Dashboard KPI board 抓的 **GET /api/stores/:storeId/trips 不存在**（幽靈端點）：`tripProfitBoard.ts:225` fetch 此路徑；api-server 僅有 `/api/trips?storeId=`；openapi.yaml 亦未宣告；generated client 無對應 hook | 預覽實測 /dashboard 持續 404 重試 → useTripProfitBoard 視為無行程 | KPI 13 卡（K6 交錯）與 A–H 圖表（K5 繪入）在任何部署都無法播放；與 Fix A 同根因（前後端契約漂移、測試皆 mock 掉整合層）。建議：api-server 補 GET /stores/:storeId/trips＋路由測試＋後台 e2e |

## 9. 交付

- Commit 分段：A 契約修復／B 測試／C K3／D vite／docs（審計）。未 push、未開 PR（由審批者 B 推送）。
- HEAD：（待填 git log -1）
