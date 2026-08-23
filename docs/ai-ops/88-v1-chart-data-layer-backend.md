# 88 · V1 圖表資料層後端半場：E／F／G／H 四個端點

日期：2026 執行批次（包25）
分支：`feat/v1-chart-data-layer`　基底：`b1572fd`（Merge pull request #17）

## 環境

- 工作樹：`C:\Users\Lnovo\Desktop\pika-chart-data`（審批者 B 指定，未使用其他目錄）
- 驗證環境：Docker `node:24-bookworm` 容器（label `pika-chart-data-node`，Node v24.18.0、pnpm 10.34.4、corepack 啟用）＋ PostgreSQL 16-alpine 拋棄式容器（label `pika-chart-data-db`，port 55450，同一 docker network `pika-chart-data-net`）
- 本批起點 HEAD：`b1572fd`；工作樹乾淨；未 push、未開 PR、未觸發 workflow

## 0 · 盤點結論（既有一覽）

| 圖                 | 端點                                                            | 重用的既有函式                                                                                                                                                | 新寫                                                                                            | 說明                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E 路線單件成本排行 | GET /stores/{storeId}/charts/route-cost-ranking                 | `resolveProductTransportCost`（transport-cost 管線：`calculateTransportCost`＋`calculateAreaDomesticCost`，與訂單快照同一條鏈）                               | 僅路由組裝（載入 route/trip/area/areaCost、排序、序列化）                                       | 每條路線的「已計算單件成本」＝既有 finalCostPerItem（TWD，scale 12 序列化）。不重寫任何公式。                                                                                                                                         |
| F 地區商品表現散點 | GET /stores/{storeId}/charts/area-scatter                       | `calculateActualQuantityRollup`、`calculateActualRouteCostRollup`、`calculateActualUnitProfit`、`emptyActualRouteCostGroup`、`INCLUDED_ACTUAL_ORDER_STATUSES` | 僅路由組裝（跨行程大區彙總、加權平均、精確總和）                                                | 按 `trip_areas.name`（大區）跨行程合併；件數＝現有者訂單件數 rollup；單件毛利＝既有 per-product actual unit profit 之件數加權平均；收入＝既有訂單 totalPrice 精確相加。                                                               |
| G 敏感度熱圖       | GET /stores/{storeId}/trips/{tripId}/charts/sensitivity-heatmap | `calculateBreakeven`（接線！生產端消費者 0 → 本批接上）、`calculateFixedCostTotals`                                                                           | `calculateBreakevenSensitivity`（lib/db 純函式，餵入既有 breakeven 後做 sweep；見註）＋路由組裝 | 矩陣格值＝既有 breakeven 恆等式的精確反運算 `profit = qty × unitGP − netCostToRecover`（`breakevenQuantity = ceil(netCostToRecover / unitGP)` 的反向；非新商業公式）。缺損益平衡資料時沿用 `calculateBreakeven` 自己的 pending 結果。 |
| H 歷史趨勢         | GET /stores/{storeId}/charts/history-trend                      | `calculateFixedCostTotals`、`calculateTripProfit`（與 operating-summary ACTUAL 同一組裝）                                                                     | 僅路由組裝（按月分桶、精確相加、fail-closed 單月）                                              | 每月＝該月各行程 ACTUAL unit 投影 finalOperatingProfitTwd 之精確和；月內任一行程缺資料→整月 pending（絕不給部分和）。                                                                                                                 |

> 註（G）：`BreakevenInput` 是既有函式自己的輸入契約（fixed＋variable＋1.5%手續費−回饋−薪資目標），其輸入**不含 PURCHASE 區段**——這是既有函式的既有語意，本批未改；登記為已知限制（見 §6）。

## 1 · 端點契約

### E `GET /stores/{storeId}/charts/route-cost-ranking`

- 回應 200：`{ status: "ready"|"pending_confirmation", items: [{ routeId, tripId, name, tripName, unitCostTwd: string|null, status, reason: string|null }] }`
- ready 項目按 unitCostTwd 精確降冪（bigint 交叉相乘比較，無浮點）；pending 項目列於後（routeId 升冪）
- 任一項目 pending → 頂層 status = pending_confirmation

### F `GET /stores/{storeId}/charts/area-scatter`

- 回應 200：`{ status, items: [{ areaName, tripCount, itemQuantity: string|null, revenueTwd: string|null, averageUnitProfitTwd: string|null, status, reason: string|null }] }`
- 大區以 `trip_areas.name` 跨行程合併（同一店同名大區併為一點；tripCount＝參與行程數）
- 任一區 pending → 頂層 pending_confirmation

### G `GET /stores/{storeId}/trips/{tripId}/charts/sensitivity-heatmap?quantities=…&unitGrossProfits=…`

- query：`quantities`（逗號分隔正整數，≤20）、`unitGrossProfits`（逗號分隔非負小數，≤20）；缺省／非法 → 400
- 回應 200：`{ status, label, reason, netCostToRecoverTwd: string|null, breakevenQuantity: string|null, salaryTargetQuantity: string|null, rows: string[], columns: string[], cells: string[][] }`
- `cells[row][col]`＝精確 12 位小數字串；負值＝虧損格（合法，非錯誤）
- pending 時 rows/columns/cells 全空、金額字段 null

### H `GET /stores/{storeId}/charts/history-trend`

- 回應 200：`{ status, mode: "ACTUAL", items: [{ month: "YYYY-MM", tripCount, profitTwd: string|null, status, reason: string|null }] }`
- 月份＝行程 startDate（空則回退 createdAt 年-月）；月內任一行程 pending → 該月 pending（profitTwd null）
- 月份升冪排序；任一月份 pending → 頂層 pending_confirmation

## 2 · 權限與 fail-closed

| 端點 | 權限                                                                                 | fail-closed                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E    | requireAuth＋verifyStoreOwner（非法 storeId→400；不存在→404；跨店→403；未登入→401）  | 缺匯率→missing_exchange_rate；缺 ETC→missing_etc_jpy；缺油資→missing_fuel_jpy；缺大區→missing_trip_area；缺 ESTIMATE 大區成本→missing_trip_area_cost；缺 HEP 件數→missing_hep_item_quantity——全部沿用 transport-cost 管線既有 reason，`unitCostTwd: null`，不補 0                                      |
| F    | 同上                                                                                 | 區內無符合狀態訂單→missing_actual_quantity；商品缺 costJpy→missing_product_cost_jpy；行程缺 actual 匯率→missing_actual_exchange_rate；缺路線實際成本→missing_route_actual_cost；缺單價→missing_unit_price_twd——任一產品 pending → 該區 pending（itemQuantity/revenueTwd/averageUnitProfitTwd 全 null） |
| G    | requireAuth＋verifyStoreOwner＋loadTrip（跨店行程→403；行程不存在→404；非法 id→400） | 缺費用區段／匯率→calculateFixedCostTotals 的 pending；缺單件毛利／工作天數／薪資目標→calculateBreakeven 的 pending（「缺少損益平衡資料」）；sweep 參數非法→400；格子絕不補 0                                                                                                                           |
| H    | 同 E                                                                                 | 行程缺費用區段→「缺少營運損益資料」；UNIT 投影缺輸入→「缺少單件毛利或預估件數」；整月 pending、profitTwd null                                                                                                                                                                                          |

所有回應皆不洩漏 `storeId` 等內部欄位（測試以 `JSON.stringify(response).includes("storeId") === false` 驗證）。

## 3 · OpenAPI 與 codegen

- `lib/api-spec/openapi.yaml`：新增 4 條路徑（tags: [charts]）＋ 9 個 schema（RouteCostRankingItem/Response、AreaScatterItem/Response、SensitivityHeatmapResponse、HistoryTrendItem/Response），並引用既有 `StoreId`／`TripId` parameter components。
- codegen（`pnpm --filter @workspace/api-spec run codegen`，Linux 官方工具）產物逐一列出：

  **api-client-react（2 檔更新）**
  - `lib/api-client-react/src/generated/api.ts`（新增 `useListRouteCostRanking`／`useListAreaScatter`／`useGetSensitivityHeatmap`／`useListHistoryTrend` 等 hooks 與 URL/queryKey 建構）
  - `lib/api-client-react/src/generated/api.schemas.ts`（新增 `RouteCostRankingResponse`、`AreaScatterResponse`、`SensitivityHeatmapResponse`、`HistoryTrendResponse` 等型別）

  **api-zod（3 檔更新＋15 檔新增）**
  - `lib/api-zod/src/generated/api.ts`
  - `lib/api-zod/src/generated/types/index.ts`
  - 新增：`routeCostRankingItem.ts`、`routeCostRankingItemStatus.ts`、`routeCostRankingResponse.ts`、`routeCostRankingResponseStatus.ts`、`areaScatterItem.ts`、`areaScatterItemStatus.ts`、`areaScatterResponse.ts`、`areaScatterResponseStatus.ts`、`sensitivityHeatmapResponse.ts`、`sensitivityHeatmapResponseStatus.ts`、`historyTrendItem.ts`、`historyTrendItemStatus.ts`、`historyTrendResponse.ts`、`historyTrendResponseMode.ts`、`historyTrendResponseStatus.ts`

  **⚠️ orval 8.9.1 已知衝突與規格層解決**：當一個 operation 同時有 path 參數（$ref StoreId/TripId）與 query 參數時，orval zod 產出會同時以 `GetSensitivityHeatmapParams` 命名「path 參數 zod const」（api.ts）與「query 參數 TS type」（types/…Params.ts），兩者在 `@workspace/api-zod` 的 `export *` 下撞名（isolatedModules 下 TS2308）。多方嘗試（`zod.generate.query: false` 只移除 QueryParams const、不影響 type 檔）無效；**最終在規格層解決**：G 端點的必要 query 輸入（quantities／unitGrossProfits）改為在 operation description 中完整記載（路由照常驗證、400 處理），不宣告為 OpenAPI query parameters。未手改任何 generated 檔案；兩次連續 codegen 逐位元一致，git status 對 generated 目錄為乾淨（drift=0）。

## 4 · 測試涵蓋（全部走 HTTP 路由，無 drizzle 直寫繞驗證）

追加於 CI 已硬編碼執行的兩個 route 測試檔（未新增 CI 看不到的測試檔）：

- `tripsStoreIsolation.route.test.mjs`（E＋F，+4 tests）
  - E 正常回應且單件成本精確（5.887000000000＝境內 1.827＋路線 4.06，手算對照）
  - E 缺油資→missing_fuel_jpy；缺大區→missing_trip_area；缺匯率→missing_exchange_rate（fail-closed、unitCostTwd null）
  - E ready 優先於 pending 的排序；不洩漏 storeId
  - E 跨店 403／商店不存在 404／非法 id 400／未登入 401
  - F 北區 ready（件數 4、收入 400、加權單件毛利 18.75）；中區 missing_product_cost_jpy；東區 missing_actual_exchange_rate（皆 null 化、不補 0）
  - F 同 403/404/400/401 矩陣
- `fixedCostSummary.route.test.mjs`（G＋H，+6 tests）
  - G 5×5 sweep 網格精確（netCost 30.45、break-even qty 1、salary qty 116、cell(90,40)=3569.55、cell(210,120)=25169.55）
  - G 虧損格為精確負值（-10.45）；缺損益資料→pending；sweep 缺省／非法／超 20→400；跨店 403；行程不存在 404；未登入 401
  - H 按月彙總 7298.5（4859.4＋2439.1 精確相加）；含 pending 行程的月份整月 pending、profitTwd null；月份升冪；403/404/400/401
- 純函式 `lib/db/src/operating-cost/breakevenSensitivity.test.mjs`（+6 tests）：矩陣反運算、split fixed 型、分數欄、缺資料 fail-closed、空洞／超界 sweep、非法值拒絕

## 5 · 驗證鏈逐步結果

| 步驟                                                      | 結果                                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 codegen drift                                           | generated diff = 0（Windows git status 乾淨＋連續兩次 codegen 逐位元一致 CLIENT_DIFF=0／ZOD_DIFF=0；WSL git 因 worktree 指向 Windows path 無法運作，此為環境限制非 drift）      |
| 2 Prettier 全庫（pnpm exec 釘 3.8.3、--end-of-line auto） | 最後一次編輯後執行 → **PASS**（All matched files use Prettier code style!）                                                                                                     |
| 3 schema push                                             | drizzle-kit push --force → Changes applied ✓                                                                                                                                    |
| 4 seed                                                    | fixed=12 variable=7 purchase=1 total=20 operating_settings_id_1=1 ✓                                                                                                             |
| 5 V1_FIXED_COST_SCHEMA_GUARD                              | **PASS**                                                                                                                                                                        |
| 5b V1_MOCK_IMPORT_GUARD                                   | **PASS**（以相同掃描邏輯於 repo root 執行）                                                                                                                                     |
| 6 DB routes                                               | **120 / 120**（基準 110，新增 10：trips 檔 +4、fixedCostSummary 檔 +6），fail 0，duration 249,943 ms                                                                            |
| 7 pure suites                                             | **485 / 485**（基準 479，新增 6），fail 0，PURE_EXIT=0，duration 914,969 ms（含 shop-app jsdom 頁面測試，比照 CI 設定 TSX_TSCONFIG_PATH）                                       |
| 8 Playwright                                              | **本機未驗，留待 push 後 current-HEAD CI**（沿用包23/包24 先例：需完整 stack＋chromium，本機環境 Docker Desktop 佔用與 Clerk 替身限制；不謊報）                                 |
| 9 Typecheck ×4                                            | 全過（typecheck:libs＋api-server＋mockup-sandbox＋shop-app＋scripts，TYPECHECK_EXIT=0）                                                                                         |
| 10 Build                                                  | **BUILD_EXIT=0**（api-server esbuild 140s＋mockup-sandbox 10s＋shop-app vite 完成）；主 chunk gzip **406.09 kB（406,094 bytes）＝基準完全一致**（本批未動前端），上限 460 kB 內 |

## 6 · 已知限制／登記

- **G 的 breakeven 輸入契約不含 PURCHASE 區段**：`calculateBreakeven`（既有函式）本身的輸入口只吃 fixed＋variable＋手續費−回饋−薪資目標；本批「接線」依原函式語意餵入，未擴充輸入。若產品方要求 purchase 納入損益兩平基數，屬於「改既有計算」範圍，須另批審批。
- **G 的 sweep 參數未宣告為 OpenAPI query parameters**（見 §3 orval 衝突註）；endpoint 行為不變（缺省／非法→400），前端批次可依 description 直接 fetch 或自行擴充 client。
- **H 月份分桶**：以 `startDate` 之 YYYY-MM 為準，缺 startDate 才回退 `createdAt`（UTC）年-月——兩個來源混用可能造成跨時區月界偏移（唯 startDate 全缺的早期行程才受影響），已於程式註解與本文件記載。
- **F 大區合併**：跨行程以 `trip_areas.name` 字面合併；同名不同意的地區（理論上）會被併成單點，tripCount 欄位讓前端可辨識合併寬度。
- **H 依賴行程完整的 ACTUAL 費用區段**：新行程（無 ACTUAL 費用）會使當月 pending（fail-closed），這是預期行為而非缺失。
- **E 的「已計算單件成本」僅 ESTIMATE 語意**：`resolveProductTransportCost` 的 ESTIMATE 大區成本鏈；ACTUAL 語意的路線單件成本由既有 operating-summary 的 actualRollup 提供，本批未複製。
- Playwright 未於本機驗證（見 §5）。

## 7 · Git 拓樸（本批，未 push）

| 順序 | Commit     | Subject                                                                              |
| ---- | ---------- | ------------------------------------------------------------------------------------ |
| C1   | `fa8b306`  | contract(api-spec): declare E/F/G/H chart-data endpoints and sync generated clients  |
| C2   | `e621f7f`  | feat(lib): expose transport-cost pipeline and add breakeven sensitivity matrix       |
| C3   | `8344647`  | feat(api-server): add E route cost ranking and F area scatter chart endpoints        |
| C4   | `4ecf285`  | feat(api-server): wire G breakeven sensitivity heatmap and H history trend endpoints |
| C5   | `27ef81d`  | style(test): prettier formatting for chart route tests                               |
| C6   | `5d0734b`  | docs(ai-ops): add 88 v1 chart data layer backend audit                               |
| C7   | 本文件收尾 | docs(ai-ops): fill build result in 88 audit                                          |
