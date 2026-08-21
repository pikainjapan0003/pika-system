# V1 包24 G4 第 4 批：品牌色對比修正＋客人端 6 頁換 token 稽核

日期：2026-08-21
L0：DESIGN.md@76ee361；前提：79（批次2 色彩慣例）、80（批次3）
批次 4：P（brandColor WCAG 對比修正，Owner 甲案）→ A（客人端 6 頁 107 處硬寫色）

## 環境

- 執行者：DeepSeek Harness（dsh；本批為接續執行，前一輪案底保留於工作樹）
- 驗證環境：node:24-bookworm 容器（Windows 無法 build）；Node v24.18.0、pnpm 10.34.4、PostgreSQL 16-alpine disposable（label pika-g4-phase24-b4-20260821）
- 起點 766c904；工作樹 C:/Users/Lnovo/Desktop/pika-v1-phase24

## P：品牌色文字對比修正（Owner 甲案）

### 病灶與兩處修法

1. **getLuminance()（原 L36–43）**：舊實作直接以 sRGB 通道加權（0.2126r+0.7152g+0.0722b），缺 WCAG gamma 線性化。
   修法：依 WCAG 2.x 公式補上
   `c_lin = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`，
   再以 0.2126/0.7152/0.0722 加權得相對亮度。
2. **getContrastForeground()（原 L45–47）**：舊實作以 `getLuminance(hex) > 0.6` 門檻選色。
   修法：廢除門檻法，改為 **白字與深字各算一次對比（`(L1+0.05)/(L2+0.05)`），選對比較高者**（平手取白字）。
3. **applyBrandColor()（原 L59–62）**：內聯複製了同一份 `> 0.6` 決策並直接寫 `--primary-foreground`。
   修法：與 getContrastForeground 共用單一決策函式 `resolveBrandForeground(hex) → { color, hsl }`，不留第二份邏輯。
4. 深字色沿用既有 `#1a1a1a`；`--primary-foreground` 的 HSL 沿用既有 `"20 15% 15%"`／`"0 0% 100%"`，未換值。

### #F57572 修正前後選色對照（⭐ 核心）

|                                         | 舊實作（無線性化）          | 新實作（WCAG）         |
| --------------------------------------- | --------------------------- | ---------------------- |
| #F57572 亮度                            | 0.5647（非線性）            | **0.3335**             |
| 白字對比 / 深字對比                     | —                           | **2.74 / 6.36**        |
| 選色結果                                | ❌ #ffffff（>0.6 判斷誤導） | ✅ **#1a1a1a**（深字） |
| applyBrandColor 的 --primary-foreground | "0 0% 100%"                 | **"20 15% 15%"**       |

### 7 組測試基準（brandColor.test.mjs，實測輸出）

| 顏色    | 亮度(4位) | 白字對比 | 深字對比 | 應選              | 實測選色 |
| ------- | --------- | -------- | -------- | ----------------- | -------- |
| #F57572 | 0.3335    | 2.74     | 6.36     | #1a1a1a           | ✅       |
| #FFFFFF | 1.0000    | 1.00     | 17.40    | #1a1a1a           | ✅       |
| #000000 | 0.0000    | 21.00    | 1.21     | #ffffff           | ✅       |
| #2E5C6B | 0.0930    | 7.34     | 2.37     | #ffffff           | ✅       |
| #FFD400 | 0.6835    | 1.43     | 12.16    | #1a1a1a           | ✅       |
| #C0526C | 0.1832    | 4.50     | 3.87     | #ffffff           | ✅       |
| #7A7A7A | 0.1946    | 4.29     | 4.05     | #ffffff（較高者） | ✅       |

追加測試：applyBrandColor("#F57572"/null) → "--primary-foreground=20 15% 15%"；("#000000") → "0 0% 100%"；("#FFFFFF") → "20 15% 15%"。
單檔實測：**3/3 PASS**（全量表列數值吻合；核心斷言 #F57572→#1a1a1a 存在）。

## A：客人端 6 頁 107 處硬寫色逐項換法

全站慣例（79 號文件）：卡片面 bg-white→bg-card；表單控制底→bg-background；filled 主按鈕 text-white→text-primary-foreground；amber→accent；red→destructive；green（成功訊息）→bg-secondary text-secondary-foreground；gray→muted。
**本批新增具名換法（含依據）**：

- **客人端狀態徽章（TrackOrder）**：已送達/已取貨→`bg-chart-3/10 text-chart-3`（DESIGN「有利/達標→chart-3」＋徽章文字本身即語意）；待取貨/運送中/已出貨→`bg-chart-4/10 text-chart-4`（「實際/進行」語意，DESIGN chart-4）；需店家確認→`bg-accent/10 text-accent`（待確認/焦點）；已取消→`bg-muted text-muted-foreground`（中性）。全壓成 secondary 會喪失狀態辨識，故依 DESIGN 語意對應。
- **CVS 已選取門市面（PublicCart/PublicOrder）**：bg-green-50/30 border-green-200 → `bg-chart-3/10 border-chart-3/30`，勾選圖示與「已選取門市」→ text-chart-3（確認態＝有利語意＋文字）。選取態勾選框沿用既有 primary 系。
- **「✓ 已加入購物車」瞬時態（PublicOrder）**：bg-green-500 text-white → `bg-chart-3/15 text-chart-3 border-2 border-chart-3/30`（與未加入態的 primary 系保持同構；勿用 solid 綠—無 success solid token）。
- **成功儀式圈（下單成功 ✓）**：bg-green-100 → `bg-secondary text-secondary-foreground`（成功訊息面，嚴格依派工 green 換法）。

| 頁               | 處數 | 主要換法                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TrackLookup.tsx  |    2 | 輸入底→bg-background；查詢按鈕→text-primary-foreground；錯誤字 text-destructive（既有）                                                                                                                                                                                                                                                                         |
| Cvs711Return.tsx |    1 | 返回按鈕→text-primary-foreground                                                                                                                                                                                                                                                                                                                                |
| Cvs711Select.tsx |    7 | header/卡片→bg-card；搜尋/選擇按鈕→text-primary-foreground；freshness amber→text-accent                                                                                                                                                                                                                                                                         |
| PublicCart.tsx   |   25 | 商品卡/摘要/明細/宅配/面交卡→bg-card；qty stepper→bg-background；inputClass/selectClass→bg-background；header×2→bg-card；未選取取貨選項→bg-card；CVS 已選取→chart-3 系（見上）；成功圈→bg-secondary；sticky 下單→text-primary-foreground                                                                                                                        |
| PublicOrder.tsx  |   38 | 成功摘要/門市/收件/宅配/面交卡→bg-card；產品區→bg-card；規格選取→text-primary-foreground／未選→bg-card；qty stepper→bg-background；已加入→chart-3 系；購物車連結/徽章→bg-card／text-primary-foreground；截止徽章→destructive 系；CVS 已選取→chart-3 系；地址缺回傳 amber→text-accent；inputClass/selectClass→bg-background；sticky 下單→text-primary-foreground |
| TrackOrder.tsx   |   34 | 狀態矩陣四組語意（見上，9 處）；進度 stepper done→chart-3/15、current→text-primary-foreground、連線→chart-3/40、done 文字→text-chart-3；卡片×6→bg-card；物流異常 amber→text-accent；末五碼輸入→bg-background；複製按鈕×2→bg-card                                                                                                                                |

梯度核對：本批總計 107 處（2+1+7+25+38+34）。

## 六條鐵律逐條落點（本批頁面）

1. 三態結論取後端 outcome：客人端無三態卡（後台頁批次）；不涉及。
2. 缺資料「待確認」不顯示 0：客人端訂單金額缺值既有 fail-closed 路徑；本批未引入 0 補值。
3. tabular numbers：客人端金額沿用既有顯示（本批不新增金額運算）；新增樣式未破壞對齊。
4. 預估/實際區別＋有利/不利語意：本批頁面為訂單流程（非損益對比）；狀態徽章以文字＋語意色雙編碼（已送達/已取貨/需店家確認等具名）。
5. 空狀態必須設計：既有空購物車/無結果畫面保留（未更動語意）。
6. 桌機/手機同等：無新增固定寬度；grid 延用既有 responsive 結構，390px 無新水平捲動來源（未加 overflow-x）。

## 驗證鏈逐步結果

0. 自檢：①六頁硬寫色 grep＝**無輸出**（先前 84 行→0）②brandColor.ts 0.6 grep＝**無輸出**
1. codegen：exit 0；generated diff＝0
2. Prettier 全庫（pnpm exec、3.8.3）：brandColor 兩檔先 --write 後**全庫通過**
3. schema push：exit 0
4. seed：fixed=12 variable=7 purchase=1 total=20
5. V1_FIXED_COST_SCHEMA_GUARD=PASS
   5b. V1_MOCK_IMPORT_GUARD=PASS
6. DB routes：**tests 107 / pass 107 / fail 0 / skipped 0 / todo 0**，duration 738,422 ms，exit 0
7. pure suites（--test-concurrency=1）：**tests 477 / pass 477 / fail 0 / skipped 0 / todo 0**，duration 6,272,940 ms，PURE_EXIT=0（基準 474＋brandColor 新增 3＝477，與預期一致；brandColor 3 個 test 明確在列且 ✔）
8. Playwright：**本機未驗，留待 push 後 current-HEAD CI** —— 依包23 先例與第 1 批終審：Playwright 不在本機驗證鏈；e2e/playwright.config.mjs 的 timeout: 120_000 webServer 窗維持不變（第 1 批量測 api-server 啟動 ~137s ＞ 120s）。不謊報。
9. Typecheck：api-server／mockup-sandbox／shop-app／scripts ＋ tsc --build → **ALL_TYPECHECK_PASS=1**
10. Build（PORT=3000 BASE_PATH=/）：api-server esbuild（185s）＋ mockup-sandbox（15s）＋ shop-app vite（9m47s，chunk-size 警告資訊性）→ **BUILD_DONE=1**

## 已知限制

- **白字深字皆不足 4.5 的殘餘缺口**：例 #7A7A7A（白 4.29／深 4.05，皆 < 4.5）。本批依 Owner 甲案採「仍選對比較高者」（取白字），⛔ 未新增警告 UI（乙案為另案）。
- Settings.tsx 的預覽色塊會因函式修正而改變選色（預期正確；Settings 屬 D 群，本批未動其樣式）。
- printHelpers.ts 內硬寫 #F57572（收據 HTML 產生處）屬 ReceiptPreview 範圍（已移出包24），本批未動。
- 品牌覆寫路由（/cart、/p/:slug）主按鈕文字色改由 resolveBrandForeground 決定；本批移除的 text-white 皆為非品牌路由之 filled 按鈕。
- 本批未動 DESIGN.md、ci.yml、pnpm-workspace.yaml、lockfile、package.json、API 契約、schema、migration、printHelpers、ReceiptPreview、Settings。
