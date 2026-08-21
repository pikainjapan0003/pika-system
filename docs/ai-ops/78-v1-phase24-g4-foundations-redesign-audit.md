# V1 包24 G4 第一批：基礎層 Scan／Diagnose

日期：2026-08-18  
L0：`DESIGN.md@d97d377964bf24fef645b83bad2f11489ebfda90`  
流程：`redesign-existing-projects` 的 Scan → Diagnose → Fix

> Fix Priority 是該 Skill 的 1–7 實作順序，不是 severity。任何通用設計建議與 `DESIGN.md` 衝突時，一律以 L0 為準。

## Scan

### Repo 與邊界

- 分支：`feat/v1-uiux-design-system`，開始時 ahead 5、tracked worktree clean。
- 既有未追蹤：`.agents/skills/redesign-existing-projects/SKILL.md`、`skills-lock.json`；本批不處理、不 stage。
- 本批允許：token bridge、`index.css`、route theme controller、`App.tsx`／`main.tsx` 接線、三個 business composite、這份 audit。
- 本批禁止：任何 `pages/*.tsx`、DB／schema／migration／API 契約、計算公式、資料寫回、production、Replit、push、PR。

### Framework、styling method、design patterns

- React 19.1、Vite 7.3、Wouter 3.10、TanStack Query。
- Tailwind CSS 4.3 CSS-first：`@theme inline`＋HSL semantic custom properties；CVA／`cn()`；shadcn/Radix primitives。
- `components/ui/*.tsx` 精確 55 個，與 L0 inventory 一一存在：49 reuse、6 extend、0 rebuild。
- 既有模式是全域 `:root` Rose Coral 單主題、`.dark` custom variant、Radix body portals、App-level Toaster；尚無 route theme lifecycle。

### Token 與 exporter

- `DESIGN.md` token 表：108 rows／108 unique；48 aliases＋60 semantic／primitive。
- Light／Night 真正不同為精確 34 個，其餘 74 個 invariant；`index.css` 目前名稱集合正確，但仍是舊值且沒有 Night scope。
- `@google/design.md@0.3.0` 與 `0.4.0` 直接 export 均 fail-closed：
  `Token name "primitive.0" is not a valid CSS identifier for Tailwind v4 export`。
- Fix 只可對 exporter 的臨時投影機械正規化 numeric spacing key，再以 exporter 作 Light oracle；production CSS 仍須從 108-token 矩陣機械生成。不得手抄，也不得直接貼 exporter 的單一 `@theme`。

### Route scope

- Night：`/dashboard`、`/trips`、`/trips/:tripId/estimate`、`/trips/:tripId/actual`、`/trips/:tripId/comparison`、`/reports/monthly-profit`。
- Light：`/cart`、`/p/:shareToken`、`/track`、`/track/:publicToken`、`/cvs/711/select`、`/cvs/711/return`。
- 其他一律 legacy；query、登入狀態、系統主題與 localStorage 不參與推導。
- `MerchantPortal` 還包含 Products／Orders／Settings 等非凍結頁，不能整殼套 Night。Theme 必須掛 body，才能涵蓋 Dialog／Sheet／Drawer／Popover／Tooltip／Toaster portals。

### CI baseline

- Node 24、pnpm 10.34.4、PostgreSQL 16 disposable DB；Windows 不執行 build／Playwright。
- 固定計數：DB routes 107、pure 467、Playwright 15；四套 typecheck、Build 均須 exit 0。
- 驗證依 CI 順序在有 label 的 Docker resources 執行；不得 volume prune 或碰其他專案資源。

## Diagnose

| ID     | 類別                     | repo 證據／現況                                                         | DESIGN.md 對照        | 處置                                                    |  Fix Priority | 驗證方式                                          | 狀態                                           |
| ------ | ------------------------ | ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- | ------------: | ------------------------------------------------- | ---------------------------------------------- | -------------------- | ------------------------- |
| TYP-01 | Typography               | `index.css` 的 mono 缺 Consolas、radius 仍 0.75rem                      | 502–503、544          | Modernise                                               |             1 | 108-token exact-value guard                       | approved-for-fix                               |
| TYP-02 | Typography               | Chart tooltip 仍把一般數字套 mono                                       | 267、544、560         | Modernise                                               |             7 | tooltip font／tnum probe                          | 具名延後 Chart 批                              |
| TYP-03 | Typography               | 三 composite 尚無 JPY／NT$／鎖定數字基線                                | 267、560、872–874     | Modernise                                               |             7 | source/render probe 驗 `tabular-nums lining-nums` | approved-for-fix                               |
| COL-01 | Color and Surfaces       | `index.css` 108 名稱正確，但只有舊 Coral root、無 Night                 | 254–261、407–503、929 | Preserve names；Retire old scoped projection；Modernise |             2 | Light/Night exact values、34-name diff            | approved-for-fix                               |
| COL-02 | Color and Surfaces       | `brandColor.ts` 寫 html 且污染 ring/sidebar/chart；頁面仍硬寫白字       | 341–348、998          | Modernise                                               |             2 | WCAG、route cleanup、computed-token isolation     | **具名延後第四批**                             |
| COL-03 | Color and Surfaces       | Taste Skill 的 noise／gradient／單一 accent 建議與 L0 衝突              | 337、349–359、959–970 | N/A                                                     |             2 | production 不新增 texture/glow/滿頁漸層           | N/A                                            |
| LAY-01 | Layout                   | 12 路由存在，沒有 route-level theme lifecycle                           | 254–261、997          | Modernise                                               |             4 | 12 route＋lookalike fail-closed matrix            | approved-for-fix                               |
| LAY-02 | Layout                   | `table.tsx` 有 `overflow-auto`；Night pages 仍有 `bg-white`             | 647、988–1004         | Modernise                                               |             4 | viewport/overflow/computed-style                  | 具名延後 Table／頁面批                         |
| INT-01 | Interactivity and States | `.dark` variant 有宣告、無 route lifecycle；portals 會離開 page wrapper | 749–767、997、1007    | Modernise                                               |             3 | SPA transition、portal body inheritance           | approved-for-fix                               |
| INT-02 | Interactivity and States | 多 primitive 缺 reduced-motion；控制高度／disabled 狀態未全面收斂       | 326、839–862、919     | Modernise                                               |             3 | state matrix／reduced-motion                      | primitive-wide 具名延後；三 composite 當批合規 |
| INT-03 | Interactivity and States | `progress.tsx` 以 `value                                                |                       | 0` 表示缺值                                             | 817、937、984 | Preserve substrate；Modernise consumer guard      | 6                                              | null／true-zero 分流 | 具名延後 GoalEnergyBar 批 |
| CON-01 | Content                  | 本批只新增必要的「待確認／已鎖定／重試」具名文案，不改 page copy        | 298–311、856–862      | Modernise                                               |             7 | accessible-name 與缺值不得為 0                    | approved-for-fix（composites only）            |
| CON-02 | Content                  | Chart 真值 0 可能被 truthy guard 隱藏；pages 狀態文案未在本批處理       | 937、984、1003        | Modernise                                               |             6 | 0/null/undefined/negative matrix                  | 具名延後 Chart／頁面批                         |
| CMP-01 | Component Patterns       | 55 primitives 正好存在，沒有第二套 UI kit                               | 779–837、987          | Preserve                                                |             — | exact inventory                                   | preserve                                       |
| CMP-02 | Component Patterns       | 三個指定 business composites 不存在                                     | 872–874               | Modernise                                               |             5 | file/export/render probe；只組合既有 primitive    | approved-for-fix                               |
| CMP-03 | Component Patterns       | 通用 primitive 有圓角；L0 不允許全域重刻                                | 773、793              | Preserve                                                |             — | composite 局部直角、primitive 不變                | preserve                                       |
| ICO-01 | Iconography              | 既有 Lucide；icon 尺寸／stroke 完整規範尚未凍結                         | 928、956、963         | Preserve library；Modernise usage                       |             7 | decorative `aria-hidden`＋可見文字                | inventory 具名延後；三 composite 當批合規      |
| CQ-01  | Code Quality             | 108 值人工同步易漂移；exporter 又不能直接表達雙 scope                   | 407–540、929          | Modernise                                               |             2 | generator `--check` byte diff＋source guards      | approved-for-fix                               |
| CQ-02  | Code Quality             | 尚無純 route resolver／body cleanup；現有 brand luminance 公式非 WCAG   | 341–348、997          | Modernise                                               |          2／4 | resolver probe；品牌公式第四批驗                  | theme approved；brand **具名延後第四批**       |
| STR-01 | Strategic Omissions      | 缺 exact-route fail-closed scope 與三個狀態 composite                   | 258–261、872–874、997 | Modernise                                               |          4／6 | unknown→legacy；component union guards            | approved-for-fix                               |
| STR-02 | Strategic Omissions      | portal layer、opacity token、motion token 是已知未完缺口                | 749–767、927–930      | N/A                                                     |             — | 本批不新增平行 opacity/motion token               | 具名延後 portal 批／G5                         |

## Approved Fix 清單

1. 以 exporter 臨時投影＋108-token parser 建立可重現 token bridge，保留 legacy root，新增 body Light／Night scopes。
2. 實作 pure exact-route resolver、首幀 bootstrap、Wouter layout-effect controller；body 設 `data-pika-theme=light|night|legacy`，僅 Night 派生 `.dark`。
3. 建立 `DualCurrencyCalibrationField`、`SemanticStatePanel`、`LedgerLockStamp`，只組合既有 primitives，不新增 runtime dependency 或資料寫回。
4. 使用不落 repo 的 render/source probes；正式 DB 107、pure 467、Playwright 15 計數不得改變。

上述清單已由審批者 B 的「G4 第一批開工」派工核准。任何不在此清單的 finding 只得 Preserve、N/A 或具名延後，不得在 Fix 擴張。

## Fix 後證據

### 已完成實作

- `design-token-bridge.mjs` 以 `DESIGN.md@d97d377` 的 SHA-256、108 列矩陣、既有 108-name set 與精確 34-name Light／Night diff 作 fail-closed guard；因 exporter 不接受巢狀 numeric spacing key，只在 temp 投影機械 flatten spacing，再實跑 `@google/design.md@0.4.0 export` 比對 55 個 Light color oracle。正式 CSS 不採 exporter 的單一 `@theme` 輸出。
- `index.css` 保留 legacy root，新增完整 Light／Night body scope。PublicCart／PublicOrder 另以 `data-pika-brand="enabled"` 只讓 `--primary`／`--primary-foreground` 繼承既有 runtime override；ring／sidebar／chart 等禁止項仍由 Light scope 固定，避免靜默移除品牌功能或污染資料語意。
- `themeScope.ts`、首幀 bootstrap 與 `RouteThemeController` 已實作 exact 12-route classifier；unknown／lookalike 一律 legacy，只有 Night 派生 `.dark`。既有兩個 pure test block 已增加 allowlist、base/query/hash、lookalike、body cleanup 與 brand scope assertions，沒有新增 test case。
- 三個 composite 已建立並只組合既有 primitive：`DualCurrencyCalibrationField` 不計算匯率且缺值具名待確認；`SemanticStatePanel` 以 J1–J9 discriminated union 保證單一主狀態；`LedgerLockStamp` 只依後端 `estimateLocked`，K09 本批保持靜態。未新增 mutation、API、runtime dependency 或頁面引用。

### 容器驗證結果

- Node `24.18.0`、pnpm `10.34.4`、lockfile frozen install：exit 0。
- codegen：exit 0，兩套 generated directory content diff = 0。
- token bridge `--check`：`108 names / 34 scoped differences / 55 exporter color oracles`，exit 0。
- 本批 12 個變更檔 Prettier：exit 0。全 repo Prettier 另發現既有 `DESIGN.md` 格式差異；因 L0 已終審且本批明禁修改，未擅自改寫或加入 ignore。
- schema push：exit 0；seed：fixed 12／variable 7／purchase 1／total 20；`V1_FIXED_COST_SCHEMA_GUARD=PASS`。
- DB routes：107 tests／107 pass／0 fail／0 skipped／0 todo，exit 0。
- pure suite：CI discovery 仍為 101 files，但執行中出現既有 case `saving an actual row uses ACTUAL mode and a decimal string` 失敗。依派工 fail-closed 規則立即終止，未自行重跑、排除或改頁面；因此沒有可宣稱的 467 final summary。
- 四套正式 typecheck、Build、Playwright 15/15：因上述 pure failure 未執行。

本文件狀態：**BLOCKED at validation**。原始 logs 與 DB JUnit 留在 `C:\Users\Lnovo\Documents\Codex\2026-08-18\phase24-g4-foundation-verification`；取得審批者 B 指示前不得把本批標為完成。
