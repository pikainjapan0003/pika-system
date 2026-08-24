---
version: "alpha"
name: "Pika V1 深海雷達"
description: "包25 G2 定案：全站 32 個畫面單軌「深海雷達」設計系統（Owner 2026-08-24 定名；Q2 裁決：乙）。撤銷客人端 Light／後台 Night 雙軌與「溫暖親切」淺色定調；108＋21 個既有 token 名稱不變、只換值；本 front matter 是 @google/design.md 的 lint／export 投影，正文 Colors 章節的單軌矩陣才是完整規格。"

colors:
  background: "#020B14"
  foreground: "#EEF7FF"
  border: "rgba(64, 181, 255, 0.30)"
  input: "rgba(64, 181, 255, 0.30)"
  ring: "#3DB8FF"
  card: "#061829"
  card-foreground: "#EEF7FF"
  card-border: "rgba(64, 181, 255, 0.30)"
  popover: "#0A1E33"
  popover-foreground: "#EEF7FF"
  popover-border: "rgba(64, 181, 255, 0.30)"
  primary: "#3DB8FF"
  primary-foreground: "#04111D"
  secondary: "#04111D"
  secondary-foreground: "#9BB2C8"
  muted: "#04111D"
  muted-foreground: "#657F98"
  accent: "#FFD080"
  accent-foreground: "#04111D"
  destructive: "#FF8E96"
  destructive-foreground: "#04111D"
  sidebar: "#04111D"
  sidebar-foreground: "#EEF7FF"
  sidebar-border: "rgba(64, 181, 255, 0.30)"
  sidebar-primary: "#3DB8FF"
  sidebar-primary-foreground: "#04111D"
  sidebar-accent: "#FFD080"
  sidebar-accent-foreground: "#04111D"
  sidebar-ring: "#3DB8FF"
  chart-1: "#3DB8FF"
  chart-2: "#FFD080"
  chart-3: "#49E0A2"
  chart-4: "#88A0B5"
  chart-5: "#FF8E96"
  chart-sequential-profit-1: "#0E1B2B"
  chart-sequential-profit-2: "#16304A"
  chart-sequential-profit-3: "#1F4468"
  chart-sequential-profit-4: "#2A5A88"
  chart-sequential-profit-5: "#3F77AD"
  chart-sequential-profit-6: "#5A95C9"
  chart-sequential-profit-7: "#7FB4DE"
  chart-diverging-profit-negative-3: "#FF6B7A"
  chart-diverging-profit-negative-2: "#A8556A"
  chart-diverging-profit-negative-1: "#6E4252"
  chart-diverging-profit-neutral: "#16303F"
  chart-diverging-profit-positive-1: "#2E6B52"
  chart-diverging-profit-positive-2: "#47A376"
  chart-diverging-profit-positive-3: "#49E0A2"
  chart-missing: "#4C6378"
  chart-axis: "#9BB2C8"
  chart-gridline: "#1B3347"
  chart-contour: "#D6ECFF"
  chart-target-line: "#FFD080"
  chart-legend-foreground: "#9BB2C8"
  chart-legend-border: "#2E5E80"
typography:
  sans:
    fontFamily: "Noto Sans TC"
  serif:
    fontFamily: "Georgia"
  mono:
    fontFamily: "Menlo, Consolas, monospace"
spacing:
  primitive:
    "0": 0rem
    "1": 0.25rem
    "2": 0.5rem
    "3": 0.75rem
    "4": 1rem
    "5": 1.25rem
    "6": 1.5rem
    "8": 2rem
    "10": 2.5rem
    "11": 2.75rem
    "12": 3rem
    "16": 4rem
  semantic:
    inset:
      compact: "{spacing.primitive.2}"
      control-y: "{spacing.primitive.2}"
      control-x: "{spacing.primitive.3}"
      comfortable: "{spacing.primitive.4}"
    stack:
      micro: "{spacing.primitive.1}"
      related: "{spacing.primitive.2}"
      default: "{spacing.primitive.3}"
      relaxed: "{spacing.primitive.4}"
      kpi-group: "{spacing.primitive.6}"
    gap:
      touch-target: "{spacing.primitive.2}"
      inline: "{spacing.primitive.3}"
      grid: "{spacing.primitive.4}"
      major: "{spacing.primitive.6}"
    card-padding:
      phone: "{spacing.primitive.4}"
      tablet: "{spacing.primitive.5}"
      desktop: "{spacing.primitive.6}"
    section-y:
      phone: "{spacing.primitive.8}"
      tablet: "{spacing.primitive.10}"
      desktop: "{spacing.primitive.12}"
    page-gutter:
      phone: "{spacing.primitive.4}"
      tablet: "{spacing.primitive.6}"
      desktop: "{spacing.primitive.8}"
    table-row:
      min-height: "{spacing.primitive.11}"
      default-height: "{spacing.primitive.12}"
      cost-bullet-min-height: "{spacing.primitive.16}"
      cell-y: "{spacing.primitive.3}"
      cell-x: "{spacing.primitive.4}"
rounded:
  sm: 0.125rem
  md: 0.25rem
  lg: 0.375rem
  xl: 0.625rem
components:
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.sans}"
    rounded: "{rounded.lg}"
    padding: 0.75rem
  warning-solid-check:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.sans}"
    rounded: "{rounded.lg}"
    padding: 0.75rem
  canvas:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  border-swatch:
    backgroundColor: "{colors.border}"
  input-boundary-swatch:
    backgroundColor: "{colors.input}"
  focus-ring-swatch:
    backgroundColor: "{colors.ring}"
  card-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
  card-border-swatch:
    backgroundColor: "{colors.card-border}"
  popover-surface:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
  popover-border-swatch:
    backgroundColor: "{colors.popover-border}"
  secondary-surface:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
  muted-surface:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
  accent-solid:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  destructive-solid:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
  sidebar-surface:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
  sidebar-border-swatch:
    backgroundColor: "{colors.sidebar-border}"
  sidebar-primary-item:
    backgroundColor: "{colors.sidebar-primary}"
    textColor: "{colors.sidebar-primary-foreground}"
  sidebar-accent-item:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
  sidebar-ring-swatch:
    backgroundColor: "{colors.sidebar-ring}"
  chart-1-swatch:
    backgroundColor: "{colors.chart-1}"
  chart-2-swatch:
    backgroundColor: "{colors.chart-2}"
  chart-3-swatch:
    backgroundColor: "{colors.chart-3}"
  chart-4-swatch:
    backgroundColor: "{colors.chart-4}"
  chart-5-swatch:
    backgroundColor: "{colors.chart-5}"
  chart-sequential-profit-1-swatch:
    backgroundColor: "{colors.chart-sequential-profit-1}"
  chart-sequential-profit-2-swatch:
    backgroundColor: "{colors.chart-sequential-profit-2}"
  chart-sequential-profit-3-swatch:
    backgroundColor: "{colors.chart-sequential-profit-3}"
  chart-sequential-profit-4-swatch:
    backgroundColor: "{colors.chart-sequential-profit-4}"
  chart-sequential-profit-5-swatch:
    backgroundColor: "{colors.chart-sequential-profit-5}"
  chart-sequential-profit-6-swatch:
    backgroundColor: "{colors.chart-sequential-profit-6}"
  chart-sequential-profit-7-swatch:
    backgroundColor: "{colors.chart-sequential-profit-7}"
  chart-diverging-profit-negative-3-swatch:
    backgroundColor: "{colors.chart-diverging-profit-negative-3}"
  chart-diverging-profit-negative-2-swatch:
    backgroundColor: "{colors.chart-diverging-profit-negative-2}"
  chart-diverging-profit-negative-1-swatch:
    backgroundColor: "{colors.chart-diverging-profit-negative-1}"
  chart-diverging-profit-neutral-swatch:
    backgroundColor: "{colors.chart-diverging-profit-neutral}"
  chart-diverging-profit-positive-1-swatch:
    backgroundColor: "{colors.chart-diverging-profit-positive-1}"
  chart-diverging-profit-positive-2-swatch:
    backgroundColor: "{colors.chart-diverging-profit-positive-2}"
  chart-diverging-profit-positive-3-swatch:
    backgroundColor: "{colors.chart-diverging-profit-positive-3}"
  chart-missing-swatch:
    backgroundColor: "{colors.chart-missing}"
  chart-axis-swatch:
    backgroundColor: "{colors.chart-axis}"
  chart-gridline-swatch:
    backgroundColor: "{colors.chart-gridline}"
  chart-contour-swatch:
    backgroundColor: "{colors.chart-contour}"
  chart-target-line-swatch:
    backgroundColor: "{colors.chart-target-line}"
  chart-legend-foreground-swatch:
    backgroundColor: "{colors.chart-legend-foreground}"
  chart-legend-border-swatch:
    backgroundColor: "{colors.chart-legend-border}"
---

# Pika V1 深海雷達設計系統

## Overview

本規格是包 25 G2 的唯一設計真相（第二期 L0），是 G3（Huashu HTML 高保真原型）與 G4（實作）的共同依據。產品名稱**深海雷達**（Owner 2026-08-24 定名）；規格書原題「DSH 深海 HUD × 聲吶掃描」為技術描述，不再使用。

**本版（v2）改寫範圍**：依 PHASE25_G0_FREEZE.md（正式凍結需求）、PHASE25_G0_RULINGS.md（Owner 六題裁決 Q1–Q6）、PHASE25_DEEPSEA_HUD_SPEC.md（規格書）與 OWNER_UI_FINDINGS_20260823.md（O-1～O-10）撤銷雙軌配色、重定義資訊架構、KPI 層級與動效契約。v1 中未被本版撤銷或改寫的契約（字型、數字格式、間距、z-index、元件處置、狀態矩陣、假資料防護等）繼續有效；本版是取代 v1 的整份文件，不是追加章節。

### 適用範圍：全站 32 個畫面（IA-6，Q2 裁決：乙）

包 25 涵蓋**全站 32 個畫面**，不分後台與客人端，一律套用深海雷達配色。客人端 6 頁（PublicCart／PublicOrder／TrackLookup／TrackOrder／Cvs711Select／Cvs711Return）⛔ **不保留**淺色「溫暖親切」變體（E-11）；PROJECT_PLAN.md 第 1955 行「客人端 6 頁 → ☀️ 淺色為主／2026-08-14 定調溫暖親切」已由 Q2 **撤銷**。

- 後台核心 7 頁：Dashboard.tsx（首頁＝營運工作台）、KPI 頁（新增分析室 Route，IA-2）、Trips.tsx、TripEstimate.tsx、TripActual.tsx、TripComparison.tsx、MonthlyProfit.tsx。
- 商品／訂單／更多三群的 tab 子頁（IA-3）：商品（列表／採購狀態／庫存）、訂單（全部／待付款／待到貨／待出貨／已完成）、更多（行程管理／顧客／報表匯出／設定）。包 25 只改視覺與導覽，⛔ 不改 Route、不改功能。
- 客人端 6 頁（見上）。
- 驗收：G4 完稿時全站 32 畫面無殘留舊配色（以全站 token 換值即可達成為準，配合平行「全站顏色 token 化」派工單）；客人端 6 頁截圖無近白主底殘留。

### 資訊架構（IA-1～IA-5、IA-7）

**首頁＝營運工作台**（IA-1）：只回答「現在需要處理什麼」。內容順序固定為六區塊：

1. 目前行程
2. 暫估淨利與目標達成
3. 待處理事項
4. 訂單／採購進度
5. 最近活動
6. 簡化趨勢

⛔ 首頁不含完整財務分析圖表（瀑布圖、堆疊圖、歷史趨勢圖不得出現在首頁）；首頁與 KPI 頁不得顯示幾乎相同的內容（規格書驗收條件原句）。

**KPI 頁＝分析室**（IA-2）：只回答「為什麼賺或虧」。結構固定為三層：行程選擇器＋更新時間＋預估｜實際｜差異 Segmented Control（KP-8）→ 四張核心 KPI（KP-1～7）→ 概覽／損益／成本／趨勢四分類（AN-1～6）。KPI 頁有獨立 Route，底部導覽可達。

**其他頁面**（IA-3）：商品、訂單、更多三群沿用既有 Route 與功能結構；包 25 只改視覺與導覽。

**底部導覽 5 項**（IA-4）：`首頁｜KPI｜商品｜訂單｜更多`。⛔ 不得改為左側導覽；桌機與手機皆保留底部固定導覽。

| 狀態   | 規格                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 未選取 | 線性圖示、灰藍色（text-muted 級）、無實色背景、無大面積發光                                              |
| 已選取 | **最多兩種視覺訊號**：① 圖示與文字改亮藍（brand-primary／brand-highlight）② 一圈低對比聲吶回波或細線圓環 |

⛔ 不得同時使用：放大／強烈發光／實色膠囊背景／頂部指示線／粗外框（IA-4 驗收）。

**導覽安全距離**（IA-5）：內容底部 `padding-bottom: calc(88px + env(safe-area-inset-bottom))`；最後一張卡片完整露出後，底部仍保留約 16–24px。390px 與 1440px 視口下皆須成立。

**DAILY 每日毛利法**（IA-7，Q1 裁決：甲）：保留 DAILY projection（包 22 D7 凍結成果）；補「每日毛利（NT$）」輸入欄，位置在**行程層**（與資料模型一致，後端 PATCH /operating-inputs 已收 dailyGrossProfitTwd）。⛔ 不改 API 契約。補欄後 O-3 結案。

### 撤銷登記（v2 相對 v1）

| #   | 撤銷標的               | v1 原條文                                                                                                              | 處置（依據）                                                                          |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| R-1 | 雙軌配色               | Colors「客人端 Light 使用近白主底、白色主卡與低彩度藍灰邊界；後台 Night 使用炭黑背景、暖灰文字、暖金主利益與橘紅異常」 | ⛔ **撤銷**（Q2 乙、A.4），改為全站單軌深海雷達                                       |
| R-2 | 主題範圍表             | 「後台 6 頁深色為主／客人端 6 頁淺色為主」雙欄                                                                         | ⛔ **撤銷**（Q2 乙、IA-6），108＋21 token 只換值、不改名                              |
| R-3 | 客人端淺色定調         | PROJECT_PLAN.md 第 1955 行「客人端 6 頁 → ☀️ 淺色為主」                                                                | ⛔ **撤銷**（Q2 明示）                                                                |
| R-4 | 13 KPI 首頁四層        | Overview「Dashboard 固定四層順序：待處理 → 13 項 KPI → A–H 圖表摘要 → 明細表」                                         | ⛔ **撤銷**（Q6 甲＋硬性附註），改為首頁工作台六區塊＋KPI 頁 4 核心＋四分類（KP／AN） |
| R-5 | 8 張圖表 A–H 一律直掛  | 圖表各以 A–H 編號與「A｜損益階梯」式標題呈現                                                                           | 改為分類圖表＋結論式標題（CH-1～CH-5）；A–H 映射見 CH-5 對照表                        |
| R-6 | v1 KPI 數字 clamp 放大 | 「主角 KPI 數字使用 clamp(2rem, 7vw, 3rem)」                                                                           | 改為 24–28px 固定級距（KP-6、LY），不做過高 Hero Banner（KP-8）                       |

**未解凍、繼續有效**（A.3 解凍範圍限制）：既存財務公式與業務邏輯（除明確錯誤）、既有 API 契約（紅線 1）、108＋21 token 名稱體系（只換值）、K1–K8 動效（Q3 沿用）、recharts ^2.15.2／Radix（shadcn 型態）元件庫、示意圖六條防護原則、語意體系（outcome 三態、有利／不利、待確認）。

### 不做清單（E 部節錄）

- 圖表 E–H 接真實資料 → 屬「V1 圖表資料層」另批（E-1）；包 25 若保留示意圖一律全套沿用六條防護（D-8）。
- 客人端 5 處 Number() 精度 → 已登記凍結、另案（E-2）。
- printHelpers.ts／ReceiptPreview.tsx → 另案（E-3）。
- components/ui/ 本體 → 只使用、不改造（E-4）。
- 修改 API 契約／財務公式／業務邏輯 → 紅線 1（E-5）。
- 生產資料庫、Replit、buzz-\* 容器 → 硬性禁區（E-6）。
- 音效／觸覺回饋 → 不做（E-7）。
- 中文等寬字體（全站級）→ 不採用；用 tabular-nums（E-8）。
- 左側導覽、誇張 Hero Banner、全頁背景圖 → 禁用（IA-4、KP-8、SV-3）。
- 「更多」頁內行程管理／顧客／報表匯出／設定 的功能改動 → 不做，僅視覺（E-10）。
- 客人端 6 頁淺色「溫暖親切」變體 → 不做（E-11，Q2 撤銷定調）。

### 邊界與非目標

- 本關（G2）只產文件；⛔ 不改任何 .ts／.tsx／.css／schema／migration／lib/brandColor.ts。
- G3 產出 Huashu HTML 高保真原型（Q5）；G4 依本文件＋原型實作。
- 鯨魚正式資產另由包 25 粒子鯨魚工作線定案（見 Layout「鯨魚識別元素」TBD）；本文件不自行決定鯨魚方案。

### 八條顯示鐵律（RU-1～RU-8）—— 包 25 的 G6 驗收基準（Q4 裁決：乙）

前六條**沿用原文**（§11.0b 四／包 24 六條，一字不改），後兩條**新增**（規格書明訂、Q4 裁決列入）：

| #    | 鐵律                                                                                                     | 標記                               |
| ---- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| RU-1 | 三態結論（SALARY_TARGET_MET／有利潤未達標／虧損）一律取後端 outcome，⛔ 前端不得自行判斷                 | 沿用原文                           |
| RU-2 | 缺匯率、缺輸入一律顯示「待確認」，⛔ 不得顯示 0                                                          | 沿用原文                           |
| RU-3 | 金額一律 tabular numbers，動效不得破壞對齊                                                               | 沿用原文                           |
| RU-4 | 預估與實際必須有清楚視覺區別；差異用「有利／不利」語意，⛔ 不只靠紅綠                                    | 沿用原文                           |
| RU-5 | 空狀態必須設計，不得空白一片                                                                             | 沿用原文                           |
| RU-6 | 桌機與手機同等重要                                                                                       | 沿用原文                           |
| RU-7 | ⛔ 不可只依靠顏色表達狀態，必須同時搭配文字、正負號或圖示                                                | 新增（規格書「色彩使用原則」明訂） |
| RU-8 | 動效規範：模式切換 150–250ms 淡入淡出；必須支援 prefers-reduced-motion，降級後仍保留結果文字、符號與狀態 | 新增（規格書「動畫」明訂）         |

### 動效架構（Q3 裁決：丙）—— K 類沿用 ＋ MO 類聲吶層

#### K 類八種功能性動效（沿用不動，⛔ 時長數字不得更改）

| #   | 動效               | 使用契約                                                                                                |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| K1  | 數字結算 450–600ms | 只在一次重要重算完成時使用；幣別、小數點與欄寬固定，首屏初值仍直接可讀。                                |
| K2  | hover 抬升 150ms   | 只用於可互動元素且只在支援 hover 的裝置；不得讓資料卡牆全部漂浮。                                       |
| K3  | 展開收合 220–300ms | 摘要列固定，明細從其下展開；不得放大整張卡片或造成水平位移。                                            |
| K4  | 單次脈衝約 500ms   | 只提示一次已完成的非關鍵狀態；不得自動循環或以 glow 表現。                                              |
| K5  | 進度填入 600–700ms | 目標線固定、填色移動；只在重要更新使用，初次渲染不得延遲數字結論。                                      |
| K6  | 交錯更新           | 僅對最多 5 列的真實更新順序使用；不得把全頁 fade-up 包裝成「交錯」。                                    |
| K7  | 狀態轉換           | 保持元素位置連續，文字與符號一起更新；LedgerLockStamp（K09 總帳落印鎖定）是 estimateLocked 的專用實例。 |
| K8  | 按下縮放 180ms     | 只作用在實際按鈕／可點控制，文字與底板一起移動，觸控後完整播放一次。                                    |

**硬上限（不變）**：任一畫面同時啟用的 K 類動效不得超過 3 種；首屏 KPI 不得等待動效。

#### MO 類聲吶層（Q3 新增；裝飾層動效，另行歸類，不計入 K 類）

| #    | 動效             | 規格                                                                  |
| ---- | ---------------- | --------------------------------------------------------------------- |
| MO-1 | 聲吶掃描         | 一圈 6–10 秒（緩慢、低干擾）；純 CSS／SVG 實作，不新增大型依賴        |
| MO-2 | 微弱呼吸光       | 頁首聲吶圓環或背景微光的低對比呼吸（透明度變化幅度 ≤ 0.15）           |
| MO-3 | 少量漂浮粒子     | 每畫面同時 ≤ 8 顆、低對比（border-subtle 級）、不得落在文字與圖表之上 |
| MO-4 | 模式切換淡入淡出 | 預估｜實際｜差異切換與分類切換 150–250ms（與 RU-8 一致）              |

**⭐ 聲吶層的歸類與上限處置（MO-3 裁決執行要點，本文件明訂）**：

1. 聲吶掃描／呼吸光／粒子是**裝飾層動效**，歸類為 **MO 類**，與功能性 K 類分帳管理；MO 類**不計入**「每畫面同時啟用的 K 類動效不得超過 3 種」的 K 類計數。
2. ⛔ 若 MO 類與 K 類併發造成干擾（視覺喧鬧、妨礙對齊、遮擋數字），以 DESIGN.md 上限為準——**聲吶層降級**：降低對比、減速（向 10 秒上限靠）、或靜態化（移除掃描，保留靜態同心圓刻度），⛔ 不得降級 K 類。
3. prefers-reduced-motion: reduce 下：MO 類**全部關閉**（掃描、呼吸、粒子），K 類依其原有縮減契約執行；降級後仍保留結果文字、符號與狀態（RU-8、MO-2）。
4. **每畫面動效清單**（MO-3 要求，供 G5 review-animations 複核一次；K 類計數已 ≤3）：

| 畫面                                         | K 類（同時啟用 ≤3）                      | MO 類                                       | 上限檢查                                    |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| 首頁（營運工作台）                           | K1 數字結算、K3 展開收合、K8 按下縮放    | MO-1 掃描＋MO-2 呼吸＋MO-3 粒子（背景裝飾） | K=3 ✓；聲吶為裝飾層不計入；若有干擾聲吶降級 |
| KPI 頁（分析室）                             | K1 數字結算、K4 單次脈衝（狀態完成）、K8 | MO-1＋MO-2＋MO-3＋MO-4 切換                 | K=3 ✓                                       |
| Trips                                        | K3 展開收合、K2 hover（桌機）、K8        | 無（或 MO-2 僅頁首）                        | K=3 ✓                                       |
| TripEstimate                                 | K1 數字結算、K3、K8                      | 無（保持冷靜，數字優先）                    | K=3 ✓                                       |
| TripActual                                   | K4 提交成功脈衝、K8                      | 無                                          | K=2 ✓                                       |
| TripComparison                               | K7 狀態轉換、K8、K2 hover（桌機）        | 無                                          | K=3 ✓                                       |
| MonthlyProfit                                | K5 進度填入、K8                          | MO-2（頁首）                                | K=2 ✓                                       |
| 商品（列表／採購狀態／庫存）                 | K2 hover、K8                             | 無                                          | K=2 ✓                                       |
| 訂單（全部／待付款／待到貨／待出貨／已完成） | K4 脈衝、K8                              | 無                                          | K=2 ✓                                       |
| 更多（行程管理／顧客／報表匯出／設定）       | K8                                       | 無                                          | K=1 ✓                                       |
| 客人端 6 頁（PublicCart 等）                 | K1 小計結算、K3、K8                      | MO-1 弱化（低對比）或無                     | K=3 ✓；客人端聲吶對比再降一級               |

> 清單以畫面家族為單位；商品／訂單／更多各子頁沿用其家族契約，G5 複核時逐 route 對帳。

## Colors

### 單軌定調（Q2 乙）

⛔ v1 第 337 行「客人端 Light 使用近白主底、白色主卡與低彩度藍灰邊界；後台 Night 使用炭黑背景、暖灰文字、暖金主利益與橘紅異常」已**撤銷**。全站 32 個畫面共用一套深海雷達配色，不存在 Light／Night 雙軌，也沒有第二套 token 命名。

層級主要由亮度階（bg-primary → bg-secondary → bg-elevated）、面狀分區、1px hairline 邊界、共同基線與間距建立。半透明玻璃面板（panel-primary／panel-secondary）只承載面板表面，**不得**以厚重陰影、發光邊框或滿頁漸層建立層級；禁用 #0D1117 與青紫霓虹（承 v1 禁令）。

### 深海雷達 15 token（TK-1／TK-3，凍結值原樣）

| Token             | 值                       | 用途（色彩使用原則）                 |
| ----------------- | ------------------------ | ------------------------------------ |
| --bg-primary      | #020B14                  | 深海背景（最底）                     |
| --bg-secondary    | #04111D                  | 次層背景（表單、側欄、深色分區）     |
| --bg-elevated     | #061829                  | 浮起背景（卡面）                     |
| --panel-primary   | rgba(4, 19, 34, 0.82)    | 玻璃面板（主要）                     |
| --panel-secondary | rgba(5, 24, 42, 0.70)    | 玻璃面板（次要）                     |
| --border-primary  | rgba(64, 181, 255, 0.30) | 主要邊界／hairline                   |
| --border-subtle   | rgba(90, 198, 255, 0.14) | 弱邊界（次要分隔）                   |
| --text-primary    | #EEF7FF                  | 主文字                               |
| --text-secondary  | #9BB2C8                  | 次要文字                             |
| --text-muted      | #657F98                  | 弱化文字（僅限深色面上；見對比契約） |
| --brand-primary   | #3DB8FF                  | 藍色＝主要操作、目前選取、正常資料   |
| --brand-highlight | #75DCFF                  | 高亮藍（連結、掃描波、選取強化）     |
| --positive        | #49E0A2                  | 青綠＝正向、已完成、正常連線         |
| --warning         | #FFD080                  | 黃＝提醒、待確認、需要注意           |
| --negative        | #FF8E96                  | 珊瑚紅＝風險、不利差異、錯誤         |

**色彩使用原則**：藍／青綠／黃／珊瑚紅／灰藍五色的用途如上表。⛔ 不可只靠顏色表達狀態——一律併用文字、正負號或圖示（**＝RU-7**）。灰藍語意（text-muted、chart-missing）＝尚未發生、未知、不適用或次要資訊。

**套用方式**（TK-2）：108＋21 個既有 token 名稱**只換值、不改名**；本表 15 個 token 依既有命名規則併入同一體系；元件中不得硬寫 hex（前置條件 O-5 已清，其餘 386 處由平行「全站顏色 token 化」派工單處理）。驗收：全站樣式檔無散落 hex；改 bg-primary 為測試色全站生效。

### 品牌色 override 契約（敘述改寫，機制不變）

stores.brand_primary_color 是既有店家設定功能，不得因單軌化而靜默移除。V1 的 runtime 品牌色 override 仍僅適用於 PublicCart 與 PublicOrder 兩頁；其餘畫面維持本文件的逐字值，不接受品牌色覆寫。**本契約綁定實際程式**（lib/brandColor.ts 的 safeHex()、getLuminance()、WCAG 對比公式）；本關不改任何程式，只改敘述以對應單軌深色：

- 品牌色輸入先經既有 safeHex() 驗證；非法值或缺值一律回退 DEFAULT_BRAND_PRIMARY_COLOR（#F57572，值由程式凍結，本關不改）。
- 唯一允許直接覆寫的 semantic token 是 --primary。唯一允許依 --primary 在 runtime 計算的 token 是 --primary-foreground；既有 --color-primary 與 --color-primary-foreground alias 只跟隨引用，不得另寫一份值或新增 token 名稱。
- 不得連帶覆寫全域 --background、--foreground、card／popover／muted／accent／destructive、border／input／ring、sidebar、--chart-\* 或本文件的 sequential／diverging／supporting chart token。語意色是資料真值：有利青綠、不利珊瑚紅、待確認黃與缺值樣式絕不得被店家品牌色取代、混色或降低辨識。
- --primary-foreground 必須由 lib/brandColor.ts 的 getLuminance() 依 WCAG 相對亮度與對比公式決定：sRGB channel 先正規化並 linearize，再以 0.2126R + 0.7152G + 0.0722B 求相對亮度，最後以 (Llighter + 0.05) / (Ldarker + 0.05) 實測黑／白候選。採用對比較高且達 WCAG AA 4.5:1 的候選；不得以 HSL lightness、未 linearize RGB、固定 0.6 門檻或肉眼判斷宣稱通過，也不得降低門檻。
- 所有 filled primary control 必須使用 --primary-foreground，禁止硬寫 text-white。品牌色若作為一般大小的 text-primary，還必須對實際深海背景／卡面（bg-primary／bg-elevated）實測 4.5:1；未達標時改用固定 --foreground，不得因 filled pair 合格就推定彩色文字也合格。
- override 必須限制在上述兩頁的 scope，進入其他頁面或 legacy route 時立即清除；不得讓寫在 document.documentElement 的殘值跨頁繼承。G4 實作須保留店家設定功能，同時證明其他 token 的 computed value 未變。

### 資料與狀態語意

- 預估／主要資料：brand-primary、chart-1。
- 實際：chart-4（鋼藍灰 #88A0B5），且必須再以「實際」文字、排列或圖例區分（RU-4）。
- 目標、待確認與差額焦點：warning、accent、chart-2。
- 有利／達標：positive、chart-3，必須明寫「有利」或「已達標」。
- 不利／錯誤／虧損：negative、destructive、chart-5，必須明寫「不利」「錯誤」或「虧損」。
- 尚未發生、未知、不適用、缺值：text-muted、chart-missing（灰藍）。

有利／不利不得只靠紅綠，預估／實際不得只靠色差（RU-4／RU-7）。色彩必須與文字、方向、圖例、線型或位置至少再配一種編碼。示意圖（E–H 若保留）每張卡各有一次不可關閉的「⚠️ 示意圖・非真實資料」角標。

### 資料視覺化連續色階（21 token，單軌深色值）

下列 21 個 token 是既有資料視覺化命名（G2 期加入），本版改為單軌深色值；⛔ 不新增第二套名稱。以 HSL 轉 sRGB 再轉 OKLab 驗證（本版 G2 重算，數值見下）：sequential 亮度嚴格單調 0.0105 → 0.4243；diverging 由商業中心 #16303F 向兩端增亮（負向 0.0782 → 0.2876、正向 0.1171 → 0.5734，皆單調）。

#### Sequential：低 → 高

| 階                          | 值      | 使用契約                       |
| --------------------------- | ------- | ------------------------------ |
| --chart-sequential-profit-1 | #0E1B2B | 數值域最低端；不是「待確認」。 |
| --chart-sequential-profit-2 | #16304A | 第二階。                       |
| --chart-sequential-profit-3 | #1F4468 | 第三階。                       |
| --chart-sequential-profit-4 | #2A5A88 | 中段數值。                     |
| --chart-sequential-profit-5 | #3F77AD | 第五階。                       |
| --chart-sequential-profit-6 | #5A95C9 | 第六階。                       |
| --chart-sequential-profit-7 | #7FB4DE | 數值域最高端。                 |

驗證：相鄰階 OKLab 距離最小值 0.0810；protan 0.0844／deutan 0.0796／tritan 0.0757 模擬下皆 ≥ 0.075，保持可辨。G4 視覺回歸須保留單調性，不得任意插值漂移。

#### Diverging：不利 ← 商業中心 → 有利

| 階                                  | 值      | 使用契約                                                                |
| ----------------------------------- | ------- | ----------------------------------------------------------------------- |
| --chart-diverging-profit-negative-3 | #FF6B7A | 最大不利幅度。                                                          |
| --chart-diverging-profit-negative-2 | #A8556A | 中度不利。                                                              |
| --chart-diverging-profit-negative-1 | #6E4252 | 輕度不利。                                                              |
| --chart-diverging-profit-neutral    | #16303F | 有商業意義的中心（0、薪資目標或商業規則定義的基準），不是資料範圍中點。 |
| --chart-diverging-profit-positive-1 | #2E6B52 | 輕度有利。                                                              |
| --chart-diverging-profit-positive-2 | #47A376 | 中度有利。                                                              |
| --chart-diverging-profit-positive-3 | #49E0A2 | 最大有利幅度。                                                          |

驗證：負向分支相鄰階 OKLab 最小 0.1202（protan 0.0956／deutan 0.1202／tritan 0.1230）；正向分支 0.1618（protan 0.1725／deutan 0.1628／tritan 0.1640）；跨分支輕度階（neg-1／pos-1）原始距離 0.0517、deutan 模擬 0.0399——這是全組最接近的一對，故該對**必須**以符號（▼／▲）與「不利／有利」文字雙編碼（RU-7），色弱模擬不是免除冗餘編碼的理由：每個負值／正值仍須顯示符號、金額與「不利／有利」文字。

#### 支援角色

| Token                     | 值      | 使用契約                                                 |
| ------------------------- | ------- | -------------------------------------------------------- |
| --chart-missing           | #4C6378 | 只表示缺值；同時使用斜線紋理或虛線邊界與「待確認」文字。 |
| --chart-axis              | #9BB2C8 | 軸、刻度與必要標籤。                                     |
| --chart-gridline          | #1B3347 | 裝飾性格線，不承載狀態。                                 |
| --chart-contour           | #D6ECFF | 一般等高線與邊界。                                       |
| --chart-target-line       | #FFD080 | 薪資目標或其他具名商業門檻。                             |
| --chart-legend-foreground | #9BB2C8 | 圖例文字與數字。                                         |
| --chart-legend-border     | #2E5E80 | 圖例 swatch 的必要邊界。                                 |

「待確認」不屬於數值域，禁止落入 sequential 第一階、diverging 中心或任何 0 值。色階圖例是圖表的一部分，不可省略：桌機顯示五個由實際 domain 計算的金額刻度（例如 NT$ 5,000／10,000／15,000／20,000／25,000），禁止只寫「低／中／高」；diverging 圖例須把商業中心的實際值與名稱標在中央。手機若不顯示完整熱圖，仍須在文字結論或表格標出 domain、中心與精確金額。

### 既有 108 個 CSS 變數（名稱不變，單軌深色值）

以下名稱沿用既有 108 個 CSS 變數體系（artifacts/shop-app/src/index.css 的變數名）；v1 的客人端 Light／後台 Night 雙欄**撤銷**，改為唯一深色值。別名、字型、圓角、陰影與其他 primitive 沿用既有名稱與引用。G4 換值時：既有 hsl(var(--background)) 形式的間接引用維持，取值與本表必須一致（hex ↔ HSL triplet 可機械互轉，⛔ 不得手動漂移）。

| Token                              | 值                                                               |
| ---------------------------------- | ---------------------------------------------------------------- |
| --color-background                 | hsl(var(--background))                                           |
| --color-foreground                 | hsl(var(--foreground))                                           |
| --color-border                     | hsl(var(--border))                                               |
| --color-input                      | hsl(var(--input))                                                |
| --color-ring                       | hsl(var(--ring))                                                 |
| --color-card                       | hsl(var(--card))                                                 |
| --color-card-foreground            | hsl(var(--card-foreground))                                      |
| --color-card-border                | var(--card-border)                                               |
| --color-popover                    | hsl(var(--popover))                                              |
| --color-popover-foreground         | hsl(var(--popover-foreground))                                   |
| --color-popover-border             | var(--popover-border)                                            |
| --color-primary                    | hsl(var(--primary))                                              |
| --color-primary-foreground         | hsl(var(--primary-foreground))                                   |
| --color-primary-border             | var(--primary-border)                                            |
| --color-secondary                  | hsl(var(--secondary))                                            |
| --color-secondary-foreground       | hsl(var(--secondary-foreground))                                 |
| --color-secondary-border           | var(--secondary-border)                                          |
| --color-muted                      | hsl(var(--muted))                                                |
| --color-muted-foreground           | hsl(var(--muted-foreground))                                     |
| --color-muted-border               | var(--muted-border)                                              |
| --color-accent                     | hsl(var(--accent))                                               |
| --color-accent-foreground          | hsl(var(--accent-foreground))                                    |
| --color-accent-border              | var(--accent-border)                                             |
| --color-destructive                | hsl(var(--destructive))                                          |
| --color-destructive-foreground     | hsl(var(--destructive-foreground))                               |
| --color-destructive-border         | var(--destructive-border)                                        |
| --color-chart-1                    | hsl(var(--chart-1))                                              |
| --color-chart-2                    | hsl(var(--chart-2))                                              |
| --color-chart-3                    | hsl(var(--chart-3))                                              |
| --color-chart-4                    | hsl(var(--chart-4))                                              |
| --color-chart-5                    | hsl(var(--chart-5))                                              |
| --color-sidebar                    | hsl(var(--sidebar))                                              |
| --color-sidebar-foreground         | hsl(var(--sidebar-foreground))                                   |
| --color-sidebar-border             | hsl(var(--sidebar-border))                                       |
| --color-sidebar-primary            | hsl(var(--sidebar-primary))                                      |
| --color-sidebar-primary-foreground | hsl(var(--sidebar-primary-foreground))                           |
| --color-sidebar-primary-border     | var(--sidebar-primary-border)                                    |
| --color-sidebar-accent             | hsl(var(--sidebar-accent))                                       |
| --color-sidebar-accent-foreground  | hsl(var(--sidebar-accent-foreground))                            |
| --color-sidebar-accent-border      | var(--sidebar-accent-border)                                     |
| --color-sidebar-ring               | hsl(var(--sidebar-ring))                                         |
| --font-sans                        | var(--app-font-sans)                                             |
| --font-serif                       | var(--app-font-serif)                                            |
| --font-mono                        | var(--app-font-mono)                                             |
| --radius-sm                        | calc(var(--radius) - 4px)                                        |
| --radius-md                        | calc(var(--radius) - 2px)                                        |
| --radius-lg                        | var(--radius)                                                    |
| --radius-xl                        | calc(var(--radius) + 4px)                                        |
| --button-outline                   | rgba(0, 0, 0, 0.1)                                               |
| --badge-outline                    | rgba(0, 0, 0, 0.05)                                              |
| --opaque-button-border-intensity   | -8                                                               |
| --elevate-1                        | rgba(0, 0, 0, 0.03)                                              |
| --elevate-2                        | rgba(0, 0, 0, 0.08)                                              |
| --background                       | #020B14                                                          |
| --foreground                       | #EEF7FF                                                          |
| --border                           | rgba(64, 181, 255, 0.30)                                         |
| --input                            | rgba(64, 181, 255, 0.30)                                         |
| --ring                             | #3DB8FF                                                          |
| --card                             | #061829                                                          |
| --card-foreground                  | #EEF7FF                                                          |
| --card-border                      | rgba(64, 181, 255, 0.30)                                         |
| --popover                          | #0A1E33                                                          |
| --popover-foreground               | #EEF7FF                                                          |
| --popover-border                   | rgba(64, 181, 255, 0.30)                                         |
| --primary                          | #3DB8FF                                                          |
| --primary-foreground               | #04111D                                                          |
| --secondary                        | #04111D                                                          |
| --secondary-foreground             | #9BB2C8                                                          |
| --muted                            | #04111D                                                          |
| --muted-foreground                 | #657F98                                                          |
| --accent                           | #FFD080                                                          |
| --accent-foreground                | #04111D                                                          |
| --destructive                      | #FF8E96                                                          |
| --destructive-foreground           | #04111D                                                          |
| --sidebar                          | #04111D                                                          |
| --sidebar-foreground               | #EEF7FF                                                          |
| --sidebar-border                   | rgba(64, 181, 255, 0.30)                                         |
| --sidebar-primary                  | #3DB8FF                                                          |
| --sidebar-primary-foreground       | #04111D                                                          |
| --sidebar-accent                   | #FFD080                                                          |
| --sidebar-accent-foreground        | #04111D                                                          |
| --sidebar-ring                     | #3DB8FF                                                          |
| --chart-1                          | #3DB8FF                                                          |
| --chart-2                          | #FFD080                                                          |
| --chart-3                          | #49E0A2                                                          |
| --chart-4                          | #88A0B5                                                          |
| --chart-5                          | #FF8E96                                                          |
| --app-font-sans                    | "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif  |
| --app-font-serif                   | Georgia, serif                                                   |
| --app-font-mono                    | Menlo, Consolas, monospace（只用於 Latin 技術標註）              |
| --radius                           | 0.375rem                                                         |
| --shadow-2xs                       | 0 1px 2px 0 rgba(0, 0, 0, 0.05)                                  |
| --shadow-xs                        | 0 1px 3px 0 rgba(0, 0, 0, 0.07)                                  |
| --shadow-sm                        | 0 2px 4px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.04)        |
| --shadow                           | 0 4px 6px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05)        |
| --shadow-md                        | 0 6px 10px rgba(0,0,0,.08), 0 2px 4px -2px rgba(0,0,0,.06)       |
| --shadow-lg                        | 0 10px 15px rgba(0,0,0,.08), 0 4px 6px -2px rgba(0,0,0,.05)      |
| --shadow-xl                        | 0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.05) |
| --shadow-2xl                       | 0 25px 50px -12px rgba(0, 0, 0, 0.15)                            |
| --tracking-normal                  | 0em                                                              |
| --spacing                          | 0.25rem                                                          |
| --primary-border                   | relative HSL from --primary and border intensity                 |
| --secondary-border                 | relative HSL from --secondary and border intensity               |
| --muted-border                     | relative HSL from --muted and border intensity                   |
| --accent-border                    | relative HSL from --accent and border intensity                  |
| --destructive-border               | relative HSL from --destructive and border intensity             |
| --sidebar-primary-border           | relative HSL from --sidebar-primary and border intensity         |
| --sidebar-accent-border            | relative HSL from --sidebar-accent and border intensity          |

**深海雷達 15 token ↔ 既有名稱對照**（同一套值，兩種引用）：

| 深海 token                         | 既有名稱（同步換值）                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- |
| --bg-primary                       | --background、--color-background                                            |
| --bg-secondary                     | --secondary、--muted、--sidebar（面）                                       |
| --bg-elevated                      | --card、--popover（浮層又高一階，#0A1E33）                                  |
| --panel-primary／--panel-secondary | 新 token（B.5），玻璃面板專用；opaque 投影見「對比與引用契約」              |
| --border-primary                   | --border、--input、--card-border、--popover-border、--sidebar-border        |
| --border-subtle                    | 新 token（B.5），弱 hairline                                                |
| --text-primary                     | --foreground、--card-foreground、--popover-foreground、--sidebar-foreground |
| --text-secondary                   | --secondary-foreground、--chart-axis、--chart-legend-foreground             |
| --text-muted                       | --muted-foreground、--chart-missing（#4C6378 可再降階作圖例缺值）           |
| --brand-primary                    | --primary、--ring（focus）、--sidebar-primary、--chart-1                    |
| --brand-highlight                  | 新 token（B.5），高亮藍                                                     |
| --positive                         | --chart-3                                                                   |
| --warning                          | --accent、--chart-2、--chart-target-line                                    |
| --negative                         | --destructive、--chart-5                                                    |

### 對比與引用契約（G2 重算，GAP-4 結案）

本節數字由 G2 以 WCAG 相對亮度公式（0.2126R + 0.7152G + 0.0722B，sRGB linearize）重算並公告；驗收以本表為準。

| Pair                                           | 對比      | 使用契約                                                                                                                                  |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| text-primary／bg-primary                       | 18.28:1   | 一般正文與頁面底。                                                                                                                        |
| text-secondary／bg-elevated                    | 8.20:1    | 次要文字、時間與單位（卡面）。                                                                                                            |
| text-muted／bg-secondary                       | 4.57:1    | 弱化標註只准放在深色面（bg-secondary 級或更深）。                                                                                         |
| text-muted／bg-elevated                        | ⚠️ 4.31:1 | 低於 AA；卡面上需要次要資訊時改用 text-secondary（8.20:1）。                                                                              |
| brand-primary／primary-foreground              | 8.61:1    | 藍色實心主按鈕、主操作與結算重點。                                                                                                        |
| warning／accent-foreground                     | 13.22:1   | 黃色實心提醒面；不是一般主操作色。                                                                                                        |
| negative／destructive-foreground               | 8.67:1    | 珊瑚紅實心錯誤面，仍須文字＋符號雙編碼。                                                                                                  |
| positive／bg-elevated                          | 10.65:1   | 有利／已完成文字（卡面）。                                                                                                                |
| warning／bg-elevated                           | 12.46:1   | 提醒／待確認文字（卡面）。                                                                                                                |
| negative／bg-elevated                          | 8.17:1    | 不利／錯誤文字（卡面）。                                                                                                                  |
| brand-highlight／bg-elevated                   | 11.48:1   | 高亮藍文字與連結（卡面）。                                                                                                                |
| text-primary／panel-primary（effective）       | 17.44:1   | 玻璃面板（主要）上的主文字。                                                                                                              |
| text-secondary／panel-primary（effective）     | 8.63:1    | 玻璃面板（主要）上的次要文字。                                                                                                            |
| text-muted／panel-primary（effective）         | 4.54:1    | 玻璃面板（主要）上的弱化標註。                                                                                                            |
| text-primary／panel-secondary（effective）     | 17.16:1   | 玻璃面板（次要）上的主文字。                                                                                                              |
| text-secondary／panel-secondary（effective）   | 8.50:1    | 玻璃面板（次要）上的次要文字。                                                                                                            |
| text-muted／panel-secondary（effective）       | ⚠️ 4.46:1 | 低於 AA；panel-secondary 面上改用 text-secondary。                                                                                        |
| border-primary 作用於 bg-elevated（effective） | 約 1.83:1 | 可操作欄位在 default 狀態必須具備永久可見 Label、獨立表面與控制幾何；focus 一律 ring（#3DB8FF），錯誤／待確認再加具名文字、符號與狀態面。 |

accent-foreground 與 destructive-foreground 只准用於各自的實心背景；卡面上的注意／異常文字直接使用 warning／negative。藍 brand-primary 只標主操作、主利益與每頁唯一主要按鈕；黃 warning 只標提醒／待確認；珊瑚紅 negative 只標錯誤或不利差異。

半透明面板（玻璃）是深色面的透明度疊加：本表「effective」值為該 rgba 疊在 bg-primary 上的合成色實測；⛔ 任何文字不得落在對比不足的合成面上（TK-3 驗收條）。資料與文字區域必須有深色保護層（KP-8），不讓聲吶／粒子干擾閱讀。

### Export 邊界

@google/design.md 的 export --format css-tailwind 只會輸出單一普通 @theme、將色彩正規化成 hex，且不能表達 repo 的 @theme inline＋hsl(var(--semantic-token)) 雙層引用或 page-scope selector。因此 G2 機械輸出的 theme CSS（單軌深色）只作 G4 比對輸入，不是可直接覆蓋 index.css 的 patch。Front matter 的 components 包含 token 使用／對比探針，用來消除孤兒引用並實測關鍵文字 pair；exporter 不會把這些探針輸出成 production token。**本版為單軌，不再需要兩份 theme CSS**；只產出一份，且 panel-\* 的半透明值在 front matter 中以其 opaque 投影（bg-secondary／bg-elevated）表示。

## Typography

### 字型定案（GAP-6）

沿用既有 --app-font-sans：`"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`。中文標題、正文與所有數字都使用此角色；數字另加 tabular-nums lining-nums（E-8：不引入中文等寬字）。--app-font-mono 只用於 Latin 技術標註（kicker／表頭／單位／代碼），遇中文字符必須回退至 --app-font-sans。不複製 Stripe 的字型、品牌識別或商標；其結構參考只限金融數據對齊與密集資料區的精準留白。⛔ 不為深海主題引入新字型依賴（不新增 CDN 字型、不新增字型檔案）。

### 等寬數字實作契約

所有金額、百分比、件數、差額、匯率、KPI 數字、圖表座標／Tooltip，以及表格數字欄都必須實際套用 OpenType tnum；只在說明文件寫「使用等寬數字」不算完成。共用實作如下：

```css
.numeric-value,
[data-numeric="true"],
th[data-numeric="true"],
td[data-numeric="true"] {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings:
    "tnum" 1,
    "lnum" 1;
}
```

Tailwind 元件可使用既有 tabular-nums utility；共用 NumericValue、KPI、金額輸入顯示層、表格 numeric cell 與 Recharts tick／label／tooltip 必須統一套用，不得各頁自行決定。font-feature-settings 是明確的相容宣告，不得拿它取代正常字型 fallback。一般段落與非數字標籤不必套用；訂單碼、查詢碼等 Latin 識別字串可另用既有 mono stack，但不得因 mono 而改變金額格式，也不得把 NumericValue 改成 mono 字體。

### 幣別與數字格式

| 資料                 | 小數位 | 正式顯示      | 規則                                                                                                             |
| -------------------- | -----: | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| JPY 原幣             |      0 | JPY 63,943    | 日圓畫面值不顯示小數；雙幣別、表格、對帳與匯出預覽一律用 JPY 明示幣別。                                          |
| TWD 換算／成本／毛利 |      2 | NT$ 13,108.32 | 成本利潤畫面固定兩位小數；裸 $ 禁止。只有後端明確定義為整數結算欄位時才可顯示 0 位，前端不得自行四捨五入成整數。 |
| 百分比               |      2 | 43.31%        | 毛利率、差異百分比與達標百分比固定兩位；真正的數值 0 顯示 0.00%，缺值則顯示「待確認」。                          |

- 數字部分使用 zh-TW 千分位，每三位以逗號分隔；幣別前綴與數字之間使用不換行空白，避免符號與金額斷行。
- NT$ 用於畫面上的新台幣金額；TWD 用於幣別選項、欄位 schema 名稱或技術說明。JPY 用於原幣、雙幣別並列、表格與對帳。¥ 只可用在單一日圓情境、且欄頭或鄰近標籤已明寫 JPY 的客人端窄版；同一區塊不得混用 JPY 與 ¥。
- 當兩種幣別同時出現，必須成對標記為「原幣 JPY 63,943」與「換算 NT$ 13,108.32」，不得只靠上下位置推測幣別。
- 負數使用真正的負號置於幣別前，例如 −JPY 1,200、−NT$ 245.50；同一畫面不得混用括號負數與前置負號。螢幕閱讀器名稱須包含「負」。
- 顯示層可依上述位數做四捨五入，但計算、比較與提交仍使用後端／domain 原始精度，禁止把格式化字串或顯示後數值寫回計算。
- 真正的零值可顯示 JPY 0、NT$ 0.00、0.00%；null、缺匯率或缺輸入在 numeric cell 直接顯示右對齊的「待確認」，不加幣別、不補小數、不單獨顯示破折號。輸入欄保持空值並在欄位下方顯示「尚未填寫〈欄位〉」，不得用 placeholder 0 冒充資料。

### 字級與必要文案（LY 凍結值；O-6 回應）

| 用途       |           字級 | 使用契約                                                  |
| ---------- | -------------: | --------------------------------------------------------- |
| 頁面標題   |   20–22px／1.4 | KPI 頁首與各頁標題；⛔ 不做成過高的 Hero Banner（KP-8）。 |
| 區塊標題   |   16–18px／1.4 | 工作台區塊、分類區塊與卡標題。                            |
| KPI 主數字 |        24–28px | 四張核心卡與主要卡的大數字；tabular numbers（KP-6）。     |
| KPI 名稱   |        12–14px | 卡內指標名稱。                                            |
| 補充文字   |        11–12px | 比較值、範圍、時間戳、單位。                              |
| 底部導覽   |        10–12px | 導覽標籤。                                                |
| 正文       |      16px／1.5 | 一般段落與說明。                                          |
| 輔助文字   | 最小 12px／1.5 | 不得更小；tabular-nums 不受小字級影響。                   |

- 貨幣符號與金額不得任意斷行；精確值不得因手機寬度而省略、截斷或縮成不可讀尺寸。
- 「有利」「不利」「待確認」「虧損」「已達標」「未達標」「持平」必須明寫（RU-4／RU-7）。
- 缺值正式文案採「尚未填寫〈欄位名稱〉」或「待確認」，不得顯示 0、0%、空白進度條或零長條。
- 主角數字（核心 KPI、目標達成卡）使用 24–28px 級距；⛔ 不採用 v1 的 clamp(2rem, 7vw, 3rem) 放大型（R-6 撤銷），避免手機與桌機數字級距失散。

### 原型註解不等於產品文案

「缺少預估值，不補 0 或空白子彈圖」是寫給審閱者的設計註解，禁止進入正式 UI。產品文案應寫成可行動、可定位的句子，例如「尚未填寫預估燃油金額」；若可修正，動作使用「補填預估」或「前往成本設定」。設計理由只留在規格或開發註解中。

## Layout

桌機與手機同等重要（RU-6）。平台是純瀏覽器 Web，不代表只做桌機。以 base 手機樣式為起點，再逐級增強；手機只改排列、揭露方式與明確定義的窄螢幕替代，不改資訊架構、KPI 分組、資料語意或精確值。任何頁面、圖表、索引列、表格、drawer 或其他容器都不得產生橫向捲動。

### Spacing：4px primitive 與 semantic role

Spacing front matter 是兩層結構：primitive 只表達 4px 錨點級距，semantic 才表達用途。基準是既有 --spacing: 0.25rem 與既有 Tailwind multiplier；不新增第二套 production CSS 變數，也不加入 token 命名矩陣。

#### Primitive 級距

| Token        |     rem |  px | 既有 Tailwind 對應 | 用途邊界                                        |
| ------------ | ------: | --: | ------------------ | ----------------------------------------------- |
| primitive.0  |       0 |   0 | 0                  | 明確無間距；不得用來代表缺資料。                |
| primitive.1  | 0.25rem |   4 | 1                  | 圖示與小標記的 micro rhythm。                   |
| primitive.2  |  0.5rem |   8 | 2                  | 最小相鄰 touch-target 間隔、緊密 stack。        |
| primitive.3  | 0.75rem |  12 | 3                  | 一般欄位垂直 padding、label/value 間隔。        |
| primitive.4  |    1rem |  16 | 4                  | 手機 gutter、一般 grid gap、手機 card padding。 |
| primitive.5  | 1.25rem |  20 | 5                  | 平板 card padding。                             |
| primitive.6  |  1.5rem |  24 | 6                  | KPI 群組間距、平板 gutter、桌機 card padding。  |
| primitive.8  |    2rem |  32 | 8                  | 手機 section rhythm、桌機 gutter。              |
| primitive.10 |  2.5rem |  40 | 10                 | 平板 section rhythm。                           |
| primitive.11 | 2.75rem |  44 | 11                 | 最小 touch target／可編輯列高度。               |
| primitive.12 |    3rem |  48 | 12                 | 一般桌機表格列與桌機 section rhythm。           |
| primitive.16 |    4rem |  64 | 16                 | 含 Bullet Chart 的成本對帳列最低高度。          |

#### Semantic 用途

| Role         | Token 與值                                                                                  | 使用契約                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| inset        | compact 8px；control-y 8px；control-x 12px；comfortable 16px                                | 元件內距。padding 只是內容留白；按鈕、checkbox hit area、表格列內編輯器的最終高度仍不得低於 44px。                                       |
| stack        | micro 4px；related 8px；default 12px；relaxed 16px；kpi-group 24px                          | 垂直堆疊。label/help 用 4–8px；一般欄位 12px；卡內區塊 16px；核心 KPI 與四分類區塊之間固定 24px。                                        |
| gap          | touch-target 8px；inline 12px；grid 16px；major 24px                                        | 並列間隔。相鄰可點控制至少 8px；一般 KPI／表單 grid 16px；跨群組或主次動作 24px。                                                        |
| card-padding | phone 16px；tablet 20px；desktop 24px                                                       | KPI、圖表、空狀態與摘要卡共用；卡片內部不得另猜 18px、22px 等孤立值。                                                                    |
| table-row    | min-height 44px；default-height 48px；cost-bullet-min-height 64px；cell-y 12px；cell-x 16px | 一般 numeric row 至少 48px；緊密可編輯 row 絕不低於 44px；成本對帳列含兩筆金額與 Bullet Chart 時至少 64px，row 內項目以 8px stack 分隔。 |

#### 響應式 semantic 值

| Breakpoint role | phone <640px | tablet 640–1023px | desktop ≥1024px | 依據                                                                                              |
| --------------- | -----------: | ----------------: | --------------: | ------------------------------------------------------------------------------------------------- |
| section-y       |         32px |              40px |            48px | Pika 是高資訊密度工作台，採逐級增加但不照搬行銷頁的 40／64／96；首頁六區塊與 KPI 頁三層以此分段。 |
| page-gutter     |         16px |              24px |            32px | 對齊既有 base／sm／lg 頁邊距契約。                                                                |
| card-padding    |         16px |              20px |            24px | 對齊既有 Tailwind 4／5／6 級距，在密度與 touch 安全間取平衡。                                     |

### Breakpoints

| 名稱        | 範圍        | 版面契約                                                                        |
| ----------- | ----------- | ------------------------------------------------------------------------------- |
| base／phone | < 640px     | 單欄、16px 頁邊距、底部主要動作避開 safe area、所有 touch target 至少 44×44px。 |
| sm          | 640–767px   | 24px 頁邊距；非主角 KPI 可兩欄，但不得壓縮金額；表單仍以單欄為主。              |
| md          | 768–1023px  | 主角 KPI 兩欄；群組 KPI 兩欄；表單可 2 欄；表格在內容允許時恢復欄模式。         |
| lg          | 1024–1279px | 32px 內容邊距；核心 KPI 四欄；四分類並列或 Tab 區塊。                           |
| xl          | 1280–1535px | 最大內容寬 1440px；維持 lg 資訊架構並放寬圖表與明細。                           |
| 2xl         | ≥ 1536px    | 只增加外側留白與 plot width，不增加 KPI 欄數，不把資訊稀釋成海報版。            |

G4 最低響應式驗收視口：390／768／1024／1440px（RS-1），並以既有 320／360／430／640／1280／1536 為延伸驗證。禁止任何層級的水平捲動；overflow-x: auto|scroll、以超寬 min-width 製造局部橫拉，以及把必要資訊藏在橫向 carousel 都不合格。

### 首頁＝營運工作台（IA-1）

六區塊依 Overview 順序排列，逐 block 以 section-y 分隔；⛔ 首頁不含完整財務分析圖表（瀑布圖、堆疊圖、歷史趨勢圖不得出現在首頁）。待處理事項有內容時預設展開；沒有事項時仍保留第一層，縮成一列完整空狀態（RU-5），不得消失。首屏 KPI 不得等待圖表載入或動效才出現。

暫估淨利與目標達成區塊與 KPI 頁共用「目標達成」語義（outcome 三態取後端，RU-1），但呈現為工作台的簡化版（結論＋百分比＋能量條），完整分析留在 KPI 頁。

### KPI 頁＝分析室（IA-2、KP-1～KP-8）

三層結構：

1. **頁首控制區**：行程選擇器（TripSelector，清楚可操作）＋ 更新時間 ＋ 預估｜實際｜差異 Segmented Control（ModeSegment）。切換時 KPI 數字、比較值與圖表**同步更新**（以既有 operating-summary 兩 mode 資料驗證）；⛔ 不做成過高的 Hero Banner；資料與文字區域必須有深色保護層。
2. **四張核心 KPI**（KP-1～KP-7）：手機 **2 × 2**（⛔ 不可三欄；每張卡最小高度 104–120px）；桌機四欄（卡不得過寬或無限制拉伸，單卡最大寬度約 320px）。每張卡只保留三層：① 指標名稱 ② 主要數字（24–28px、tabular）③ 補充比較或範圍。點擊卡片 → Bottom Sheet（KpiDetailSheet）顯示：公式、資料來源、涵蓋範圍、最後更新時間、是否為預估／實際／差異；關閉後回到原狀態。
3. **四分類**（AN-1～AN-6）：概覽｜損益｜成本｜趨勢。手機四分類可水平滑動，⛔ 一開始不得超過四個分類；分類切換與標題同步（MO-4 淡入淡出 150–250ms）。

#### 四張核心 KPI

| #    | KPI        | 資料來源（既有端點）                                                                                             | 對應舊 KPI 語意          |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| KP-1 | 最終淨利   | operating-summary mode=ESTIMATE／ACTUAL → finalOperatingProfitTwd                                                | 最終營業利益             |
| KP-2 | 淨利率     | finalOperatingProfitTwd ÷ adjustedRevenueTwd（確切公式依既有計算，⛔ 包 25 不得重算財務公式）                    | 毛利率變體               |
| KP-3 | 調整後收入 | adjustedRevenueTwd                                                                                               | 調整後收入               |
| KP-4 | 總成本     | fixedCostTotalTwd ＋ variableCostTotalTwd ＋ purchaseCostPrincipalTwd 的既有加總（確切範圍待 G4 依現有實作核對） | 固定＋變動＋商品進貨成本 |

### KPI 層級規範（Q6 裁決：甲＋Owner 硬性附註；本節禁止「9 張等大卡搬家」）

> 🔴 Owner 原話（與裁決同等效力）：「選甲**不代表**把 9 張卡原封不動搬到四個 Tab。應重新設計層級，例如主要卡、次要數字、進度條與圖表，否則只是把原本的擁擠分散到不同頁面。」
> ⛔ G3／G4 若只是把 9 張同等大小的卡片搬到分類頁，即為未達成本條裁決。

**六種呈現層級（唯一允許的形態，各附規格）**：

| 層級                | 尺寸與字級                                                                                                                                                            | 使用時機                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ① 主要卡            | 與核心 KPI 同規格：手機 2×2 內一卡、桌機四欄內一卡；卡面 bg-elevated＋card-border；數字 24–28px tabular；最小高度 104–120px；三層內容（名稱／主數字／補充）           | 最重要的單一指標（如損益分類的銷售總額、概覽的目標達成卡）                               |
| ② 次要數字列        | 成排小格，每格含名稱（12px）＋數字（16–20px tabular）＋可選單位；格間 gap.inline 12px、列高約 56px；不包厚重卡框，以 hairline 分隔                                    | 一批同級的次要指標（如營業毛利／毛利率／平均單件毛利、商品總件數）                       |
| ③ 進度條            | 全寬或卡內；標籤＋百分比＋目前值＋目標值＋差額文字＋目標刻度＋後端 outcome 三態；高度 ≥ 8px、填色 brand-primary（超標正向用 positive），reduced-motion 下保留全部文字 | 「目標達成」卡（234%｜超過目標 NT$10,040 大數字＋進度條＋結論）與達標能量條              |
| ④ 橫向排行          | 單軸水平長條，條尾精確金額常駐；條高 ≥ 20px、brand-primary 系單色或漸層（低階灰藍）；排序依數值高到低；手機優先此形態                                                 | 成本分類的排行：商品進貨成本為首項、其他成本拆解與占比、路線單件成本（E）、地區成本（F） |
| ⑤ 圖表              | 卡式容器（圓角 16px、弱外框）、結論式標題、Tooltip tap／鍵盤可開、手機圖例 ≤ 3；趨勢頁預設只顯示一張主要圖表＋下拉切換指標（⛔ 不可一次排四張）                       | 概覽瀑布、損益差異、成本占比、趨勢主圖、行程比較                                         |
| ⑥ Bottom Sheet 明細 | 全高或 70% 高 Sheet；五欄：公式、資料來源、涵蓋範圍、最後更新時間、是否為預估／實際／差異；關閉回到原狀態                                                             | 四張核心卡點擊後；排行與圖表亦可提供同構明細入口                                         |

**四分類承接內容（AN-6，9 張 KPI 的分散與層級）**：

| 分類       | 承接的 KPI                                     | ⛔ 指定呈現（即層級）                                                                                                                   |
| ---------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 概覽       | 薪資目標＋達標狀態＋商品總件數                 | ⭐ 薪資目標＋達標狀態**合併成一張「目標達成」卡**（大數字＋進度條＋文字結論，例：234%｜超過目標 NT$10,040）；商品總件數為**次要數字列** |
| 損益       | 銷售總額、營業毛利、毛利率、平均單件毛利       | **主要卡**（銷售總額）＋**次要數字列**（其餘三項成排、較小）＋預估與實際差異（文字＋符號＋有利／不利）                                  |
| 成本       | 商品進貨成本、其他成本拆解與成本占比           | **占比圖**＋**橫向排行**（含商品進貨成本為排行首項）；手機優先橫向長條（AN-3）                                                          |
| 趨勢／行程 | 平均每日毛利、件數與單件毛利趨勢、不同行程比較 | **趨勢圖**（預設一張主圖＋下拉切換指標）＋**行程比較**；平均每日毛利為次要數字列                                                        |

除上述五種層級＋明細區（⑥）外，不得另創第七種等大卡形態；分類頁不得出現 9 張同等大小的卡並排（AN-6 驗收）。

### 底部導覽契約（IA-4／IA-5）

- 五項 首頁｜KPI｜商品｜訂單｜更多；高 86–88px（含 safe area 則 calc(72px + env(safe-area-inset-bottom)) 以上）；圓角 18–20px 的浮動容器或貼底 bar，二擇一，全站一致。
- 未選取＝線性圖示＋灰藍文字；已選取＝**最多兩種訊號**（亮藍圖示與文字 ＋ 一圈低對比聲吶回波或細線圓環）。
- 內容底部 padding-bottom: calc(88px + env(safe-area-inset-bottom))；最後一張卡完整露出後底部仍保留 16–24px。

### 聲吶與鯨魚（SV-1～SV-3、REG-3）

聲吶與鯨魚**只作為裝飾層**，⛔ 不壓住 KPI、文字或圖表，不影響長時間閱讀（規格書 Primary Goal：鯨魚與深海是品牌元素，不是頁面主角）。

**層級順序（由下而上，SV-1）**：

```text
背景漸層
↓ 低對比水下粒子
↓ 聲吶同心圓與刻度
↓ 掃描扇形
↓ 線框／聲吶成像鯨魚
↓ 深色資訊保護遮罩
↓ KPI 與圖表內容
```

- 聲吶圓環優先用 CSS／SVG；粒子 ≤ 8 顆、低對比（border-subtle 級）；掃描 6–10 秒一圈（MO-1）；prefers-reduced-motion 下全部關閉（MO-2／RU-8）。
- 鯨魚：成熟比例（近座頭鯨）、線框／光點／網格／聲吶成像；⛔ 純色塊狀圓滾輪廓；透明度 15–40%（依位置調整）；建議頁首右側聲吶圓環內；⛔ 不置於圖表與主要文字後方。
- 鯨魚元件的具體尺寸、筆畫與資產規格在本關**未定案**，見下：

### 雷達主視覺

Owner 2026-08-24 裁決（乙案）：

- ⭐ 全站每頁最多一個雷達主視覺，位置在 KPI 頁最上方。
- ⛔ KPI 卡片內不放雷達（否決「每卡一個小雷達」）。
- 理由：13 張 KPI 卡各轉一個雷達會互相搶注意力，KPI 卡的主角是數字；雷達應是該頁門面，不是每個數字的背景。⭐ 同時滿足 Q6 硬性附註「應重新設計層級」——主視覺即層級。
- 尺寸 TBD，須落在下列範圍（審批者 B 依產品實測推算）：
  - 產品實測（ProfitKpiBoard.tsx 第 241、257 行）：grid grid-cols-2 gap-2 sm:grid-cols-3、卡片 rounded-2xl border p-3，⛔ 無固定像素尺寸。
  - 手機 390px：內容區約 358px；塞在 KPI 卡內（2 欄）→ 卡片約 175px，雷達上限約 140px；當整頁主視覺（滿寬）→ 上限約 358px。
  - ⭐ 建議區間 240–320px，最終值待 Owner 於 G3／G6 確認。
- 掃描動效沿用 MO-1（6–10 秒一圈），reduced-motion 下停止旋轉。

### 鯨魚識別元素

TBD — 待包25 粒子鯨魚工作線驗收後回填。

已知約束：fill:none、stroke:currentColor。
⚠️ 尺寸與 opacity TBD — 62px／74px／96px 出自 G1 樣張頁
（Desktop\pika-phase25-g1\index.html）作者自訂，非產品規格、
未經 Owner 裁決，⛔ 不得作為上線尺寸寫入本文件。

> ⛔ 本關不得自行決定鯨魚長相、不得引用 V1–V8 任一版為定案；G3 樣張內建線框鯨魚僅為示範資產（REG-3），正式資產由粒子鯨魚工作線產出後回填本節。其餘章節不因鯨魚未定而留空。

### 圖表契約（CH-1～CH-5）

| #    | 契約               | 規格                                                                                                                                                                                        |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CH-1 | 真正的累積瀑布圖   | 損益瀑布：調整後收入 → 商品成本 ↓ → 固定成本 ↓ → 變動成本 ↓ → 其他費用 ↓ → 最終淨利；中間成本柱從**前一個累積值**開始，不可全部從零開始；總和等於最終淨利。                                 |
| CH-2 | 結論式標題         | 禁用「A｜損益階梯」式；改為例：「本趟暫估淨利為 NT$17,540」「實際成本較預估高 6.2%」「商品採購占總成本 74.8%」「近六趟淨利呈上升趨勢」。全站圖表標題為結論句（掃描標題字首無 A–H 分類碼）。 |
| CH-3 | 圖例               | 手機最多顯示三個；過多改下拉切換；Tooltip 顯示詳細數值；圖例不得自動換行兩三行壓縮圖表。                                                                                                    |
| CH-4 | 空資料 Empty State | 不可顯示 0～4 空白座標；顯示「尚無實際成本資料／新增第一筆實際成本後，即可比較預估與實際差異。／[新增成本]」。                                                                              |
| CH-5 | 舊圖 A–H 映射      | 依下節對照表；示意圖（E–H 若保留）沿用六條防護（D-8）。                                                                                                                                     |

**A–H 映射對照（G1 樣張定案，CH-5 驗收）**：

| 舊圖             | 新落點                                                        | 備註                                                 |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| A 損益瀑布       | 概覽                                                          | 累積式瀑布（CH-1）                                   |
| B 預估與實際差異 | 損益                                                          | 差異列（文字＋符號＋有利／不利）＋差異模式分歧長條圖 |
| C 成本結構       | 成本                                                          | 占比圖＋橫向排行                                     |
| D 差異貢獻       | 損益                                                          | 損益組成＋差異列                                     |
| E 路線單件成本   | 成本                                                          | 橫向排行（層級④）                                    |
| F 地區成本       | 成本                                                          | 橫向排行（層級④）                                    |
| G 敏感度         | 趨勢（保留與否由 Owner 於 G1 檢視後決定；若保留以示意圖形態） | 沿用示意圖六條防護                                   |
| H 歷史趨勢       | 趨勢                                                          | 主圖（預設一張＋下拉切換指標）                       |

### 其他頁面 responsive 契約（沿用 v1，單軌化）

#### Trips 路線與大區成本編輯器

- base：行程摘要、待確認事項、大區清單、路線清單依序單欄。大區與路線次級明細可用 Collapsible，但缺燃油、ETC 手填規則與儲存錯誤不得收起。
- 手機新增／編輯使用 bottom Drawer 或全高 Sheet；欄位單欄、底部 sticky 儲存列、44px 控制。桌機可用 Dialog 或右側 Sheet，表單 2 欄。
- 路線保留 tripAreaId、大區名、起終點、預估件數、train/fuel/parking/ETC 四項交通費。fuelJpy = null 是待確認，與真正的 0 不同；ETC 無費用時仍由使用者手填 0，不得自動估算。
- 大區保留 ESTIMATE | ACTUAL、紙箱單價、運費單價、包裹數及 nullable 預估件數；每個大區可分別新增／編輯預估與實際成本。
- 行程層新增「每日毛利（NT$）」輸入欄（IA-7，Q1 裁決甲），寫入既有 PATCH /operating-inputs 的 dailyGrossProfitTwd，⛔ 不改 API 契約。

#### TripEstimate（UNIT／DAILY）

- base：成本項目先名稱再金額／幣別；UNIT／DAILY 直排；DAILY 方法顯示行程層每日毛利輸入值（IA-7）。
- md+：成本列恢復三欄，projection 並列；lg+：輸入約 8 欄、摘要約 4 欄；pending reason 留在欄位旁。

#### TripComparison

- base：先顯示結論摘要，再以逐項 comparison card 呈現 estimatedTwd、actualTwd、difference、percent、direction 與 state；不得遺漏 API 已有的 percent。
- md+ 使用 Table；有利／不利／持平以文字、方向與數字共同呈現。只有實際顯示「預算外」，只有預估顯示「未發生」，兩側皆有才計差異。

#### PublicCart 與 TrackOrder 手機優先（客人端，深海配色）

- PublicCart base 為單欄：商品列 → 取貨方式 → 收件／門市／地址欄位 → 訂單摘要；底部 sticky CTA 同步顯示總額並避開 safe area。數量步進與刪除皆至少 44×44px。
- PublicCart lg+ 才改為「商品與表單／訂單摘要」雙欄；摘要可 sticky，但不得遮住錯誤或表單欄位。七種取貨方式依所有商品的物流旗標過濾，不新增不存在的方式。
- TrackOrder base 先顯示訂單識別、目前狀態與下一步，再顯示配送時間軸、商品與金額、取貨／配送資訊；關鍵狀態與追蹤碼不可藏在 hover、橫滑或桌機側欄。
- TrackOrder md+ 才允許摘要與時間軸雙欄；時間軸在手機保持垂直，不縮成橫向步驟條。
- 客人端文案使用直接、友善、少術語的句子；同一待確認／錯誤語意仍使用共用 token（深色）與元件。⛔ 客人端 6 頁不得出現近白主底或淺色變體（IA-6、E-11）。

TrackOrder 的手機閱讀順序固定為：店鋪與物流查詢標題 → 大型物流狀態 → 取消提示或垂直訂單 timeline → 商品與總額 → 訂單／取貨／時間 → 物流資訊 → public-safe 的 masked 收件摘要 → 條件式付款末五碼 → 分開標示的物流追蹤碼與訂單查詢碼 copy actions。Public tracking 不公開超商門市名稱或地址。付款末五碼只在 pending／awaiting_payment 顯示，並明寫「僅供人工對帳」。

TrackOrder 必備狀態包括 loading、404、一般 error、cancelled、delivered、picked-up、arrived-store、in-transit、等待物流更新、exception／returned、無物流資料、自取／面交、付款儲存／成功／可行動錯誤，以及兩種代碼各自的 copy feedback。320px 下 label 在上、value 在下；地址與代碼可安全換行但不得截斷。

#### 既存頁面 page-level responsive 契約（沿用，單軌化）

原始碼核實：Dashboard、Trips、TripEstimate、TripActual、TripComparison、MonthlyProfit、PublicCart、TrackLookup、TrackOrder、Cvs711Select、Cvs711Return 的 responsive token 數均為 0；PublicOrder 僅有 10 個 sm: token，全部只處理五行取貨卡。max-w-[480px] mx-auto 不是桌機響應式方案（Dashboard 以本版首頁工作台契約取代，KPI 頁為新契約）。

| 頁面                    | base／phone                                                          | md                                               | lg+                                                   |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Dashboard（首頁工作台） | 六區塊單欄；待處理展開、其餘依序                                     | 兩欄區塊化；簡化趨勢跨滿                         | 內容約 1200px；六區塊順序不變                         |
| KPI 頁（分析室）        | 頁首控制區→2×2 核心 KPI→四分類（水平滑動）                           | 核心 KPI 2×2、分類並列                           | 控制區一行、核心 KPI 四欄、四分類並列                 |
| Trips                   | 行程→大區→路線 progressive disclosure；Drawer 編輯                   | master-detail；安全欄位 2 欄                     | 三個成本入口常駐                                      |
| TripEstimate            | 成本項目先名稱再金額／幣別；UNIT／DAILY 直排                         | 成本列恢復三欄，projection 並列                  | 輸入約 8 欄、摘要約 4 欄；pending reason 留在欄位旁   |
| TripActual              | 類別→名稱→金額／幣別→日期→照片→提交；照片不溢出                      | 表單與已記錄費用分區，安全欄位 2 欄              | 表單／照片約 5 欄，費用清單約 7 欄                    |
| TripComparison          | 每項 comparison card 顯示預估、實際、差額、percent、direction、state | 切回完整 Table，項目 sticky、金額右對齊          | 表格與比較圖可主從配置，表格仍是真相來源              |
| MonthlyProfit           | 月份滿寬；定格毛利跨滿，其他指標 2 欄                                | 月份移入 header，四指標 2×2 或同列               | 內容約 960px，不把少量數字拉散                        |
| PublicCart              | 商品→取貨→收件／門市／地址→摘要→sticky CTA                           | 內容 2 欄，DOM 仍先商品後結帳                    | 左商品／右表單與 sticky 摘要；empty／success 保持窄版 |
| PublicOrder             | 商品、表單、取貨、金額、CTA 單欄；沿用既有取貨卡 sm reflow           | 商品約 5 欄、訂購表單約 7 欄                     | 摘要可 sticky；選中取貨 detail 留在表單欄             |
| TrackLookup             | 320–420px 單一查詢表單，input／CTA 48px                              | 只增加外圍留白                                   | 不新增欄位或裝飾面板                                  |
| TrackOrder              | 狀態優先、垂直 timeline、完整 public-safe 明細                       | 左狀態／timeline／商品，右訂單／物流／收件／代碼 | 只增加留白；禁止 Owner Sidebar／BottomNav             |
| Cvs711Select            | sticky 搜尋、單欄結果；搜尋與選擇按鈕 ≥44px                          | 結果可 2 欄，搜尋／錯誤／筆數跨滿                | 最大內容約 900px，不改 provider 或返回路徑            |
| Cvs711Return            | 單一 processing／error transient state；CTA 滿寬 44px                | 限制內容寬度                                     | 不新增導航或多欄                                      |

所有頁面只 reflow 同一棵 DOM，不為不同 breakpoint 同時 render 兩份 live form。sticky CTA 使用 env(safe-area-inset-bottom)，虛擬鍵盤開啟時回到文流，且不得遮住最後欄位或 inline error。G4 最低驗收寬度為 320、360、390、430、640、768、1024、1280、1440px。

## Elevation & Depth

層級以背景表面、1px 細邊界、分組標題與留白建立。主卡高於頁面背景一階（bg-elevated），浮層高於主卡一階（#0A1E33）；沿用既有 --shadow-\*，不新增 shadow token。玻璃面板（panel-primary／panel-secondary）屬於表面階層，不是額外 Elevation；⛔ 不得用玻璃擬態、發光或厚重投影建立層級。

- Level 0：頁面背景（bg-primary）與表格內列，無陰影。
- Level 1：KPI、圖表、空狀態卡（bg-elevated 或 panel-primary），細邊界（card-border／border-subtle）；只有需要與背景分離時使用 --shadow-xs。
- Level 2：sticky 摘要、Sheet、Popover（#0A1E33），最多 --shadow-md。
- Level 3：Dialog，最多 --shadow-lg；不得用陰影代替 modal overlay 與 focus trap。
- Focus 使用 --ring（#3DB8FF）；錯誤、待確認與示意資料使用語意邊界與文字，不靠陰影表示。
- **深色保護層**：聲吶／粒子／鯨魚之上的內容區一律以深色面或半透明保護層承接（KP-8），確保文字對比（對比表見 Colors 節）。

### z-index 與 portal 層級

以下是由低到高的唯一層級尺度；G4 應集中成共用 layer class map，禁止各元件散落 z-[9999]。數值是層級契約，不新增 CSS variable，因此 token 矩陣不變。

| 層級                 |    z-index | 元件指派                                                                               | 規則                                                                                      |
| -------------------- | ---------: | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| base                 |          0 | page、Card、Table、圖表與一般內容                                                      | 不建立不必要 stacking context；transform／opacity 不得意外蓋住浮層。                      |
| sticky               |         10 | sticky page header、表格欄頭、手機 sticky CTA                                          | 只在所屬 scroll container 內生效；不得越過 modal。                                        |
| sidebar              |         20 | desktop Sidebar、固定 owner navigation（本版禁止左側導覽；僅 legacy route 殘留時適用） | 手機 Sidebar 透過 Sheet 開啟時改用 sheet/drawer band，不停留在 20。                       |
| dropdown             |         30 | DropdownMenu、ContextMenu、Command menu                                                | 主要動作不得只存在此層；開 modal 前關閉下層 menu。                                        |
| popover              |         40 | Popover、HoverCard、日期／篩選補充面板                                                 | 必要資訊仍須有手機可點擊替代。                                                            |
| tooltip              |         50 | Tooltip                                                                                | 只補充，不承載唯一的精確值、錯誤或待確認原因。                                            |
| sheet/drawer overlay |         60 | SheetOverlay、DrawerOverlay                                                            | overlay 必須攔截背景 pointer 並配合 focus trap。                                          |
| sheet/drawer content |         61 | SheetContent、DrawerContent                                                            | 位於自身 overlay 之上；內部 sticky 使用該 modal root 的局部層級。                         |
| dialog overlay       |         70 | DialogOverlay、AlertDialogOverlay                                                      | 高於 Sheet／Drawer；同一時間只允許一個 top modal。                                        |
| dialog content       |         71 | DialogContent、AlertDialogContent                                                      | 不靠 shadow 取代 overlay、focus trap 或 inert 背景。                                      |
| modal floating       | 80／81／82 | active modal 內的 dropdown／popover／tooltip                                           | 由 active modal portal root 掛載，依序使用 80／81／82；不得讓背景頁殘留 menu 穿過 modal。 |
| toast                |         90 | Sonner、Toast、Toaster                                                                 | 可高於 modal 顯示結果，但核心錯誤與必要操作仍保留在頁內／modal 內。                       |

任何新 portal 元件必須先歸入此表。開啟 Sheet、Drawer 或 Dialog 時，背景的 dropdown／popover／tooltip 必須關閉；由 modal 觸發的浮層則掛在 active modal portal root，避免被 overlay 截斷。不得以 DOM 順序碰運氣。

## Shapes

派生的 --radius-sm/md/lg/xl 名稱與 --radius: 0.375rem primitive 保持不變。深海雷達單軌圓角（LY 凍結值）：

| 元件                                       | 圓角    |
| ------------------------------------------ | ------- |
| 小型控制項（按鈕、輸入、select、badge 底） | 8–10px  |
| KPI 卡                                     | 12–14px |
| 圖表卡                                     | 16px    |
| 底部導覽                                   | 18–20px |

⛔ 不要讓所有元件都使用過大的圓角（LY 驗收）。狀態 badge 一律採點號＋具名文字＋一像素直角框，不得使用膠囊。膠囊只保留給每頁唯一主要按鈕；同頁其他按鈕以幽靈樣式為主（控制項 8–10px 亦可適用）。

hexbin 六角只屬敏感度圖（若保留）的資料分箱，不得作為跨頁裝飾，不得用蜂窩造型取代其他圖表的資料編碼。圖表標記的形狀要服務分組、狀態與可辨識度，不模仿品牌圖案。

## Components

既有 components/ui/ 正好有 55 個 .tsx。處置原則是 **49 沿用、6 擴充、0 重建 primitive**；新建只限業務 composite，且必須組合既有 primitive。G3 在同一 Drafts 檔建立 local components，元件清單必須涵蓋本節全部 primitive 處置與業務 composite；不得因 Starter 不能發布 Team Library 而省略元件。G4 應逐步收斂到以下 inventory，不得另外建立平行 UI kit。

|   # | 既有元件            | 處置             | 本批規格                                                                                                                                                                         |
| --: | ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | accordion.tsx       | 沿用             | 手機行程／大區可折疊；主要數字不得因折疊消失。                                                                                                                                   |
|   2 | alert.tsx           | **擴充**         | 由 default/destructive 增加 info/warning/success/pending；圖示＋文字並用（deep-sea 語意色）。                                                                                    |
|   3 | alert-dialog.tsx    | 沿用             | 只用於不可回復確認，不為一般編輯增加阻力。                                                                                                                                       |
|   4 | aspect-ratio.tsx    | 沿用             | 商品圖與媒體維持比例；缺圖仍提供替代內容。                                                                                                                                       |
|   5 | avatar.tsx          | 沿用（本批不採） | 凍結資料無頭像時不得捏造照片。                                                                                                                                                   |
|   6 | badge.tsx           | **擴充**         | 增 estimate/actual/pending/favorable/unfavorable/neutral 語意；預設為點號＋具名文字＋直角框，禁止膠囊 badge。                                                                    |
|   7 | breadcrumb.tsx      | 沿用             | 桌機顯示層級；手機改簡潔返回，不塞完整 breadcrumb。                                                                                                                              |
|   8 | button.tsx          | **擴充**         | 增 44px／48px touch size；幽靈為多數，每頁只准一個膠囊主要按鈕，danger surface 只供刪除類；filled primary 使用 --primary-foreground（⛔ 不硬寫 text-white）。                    |
|   9 | button-group.tsx    | 沿用             | 購物車數量步進與相鄰動作；不取代 Tabs。                                                                                                                                          |
|  10 | calendar.tsx        | 沿用（本批不採） | 無凍結日期欄時不得憑空新增。                                                                                                                                                     |
|  11 | card.tsx            | 沿用             | KPI、行程、大區、購物車與摘要共用結構；資料面為深色面（bg-elevated／panel-primary）＋hairline。                                                                                  |
|  12 | carousel.tsx        | 沿用（本批不採） | 儀表板 KPI／圖表不得藏進 carousel。                                                                                                                                              |
|  13 | chart.tsx           | **擴充**         | 補可變高度、結論式標題、文字摘要、空／待確認狀態與分類圖表 composite（CH-1～5），不重建 wrapper。                                                                                |
|  14 | checkbox.tsx        | 沿用（本批不採） | 凍結欄位無多選，不增加假需求。                                                                                                                                                   |
|  15 | collapsible.tsx     | 沿用             | 手機次級明細；必填與待確認訊息不得預設隱藏。                                                                                                                                     |
|  16 | command.tsx         | 沿用（本批不採） | 無凍結全域搜尋需求，不新增假入口。                                                                                                                                               |
|  17 | context-menu.tsx    | 沿用（本批不採） | 核心編輯／結帳動作不得只藏在右鍵。                                                                                                                                               |
|  18 | dialog.tsx          | 沿用             | 桌機複雜表單可用；手機優先 Sheet／Drawer。                                                                                                                                       |
|  19 | drawer.tsx          | 沿用             | 手機行程、大區、路線編輯使用底部 drawer。                                                                                                                                        |
|  20 | dropdown-menu.tsx   | 沿用             | 只收納次要／溢出動作，主要 CTA 常駐。                                                                                                                                            |
|  21 | empty.tsx           | 沿用             | Slot 已完整；所有空態直接組合，不另建 primitive。                                                                                                                                |
|  22 | field.tsx           | 沿用             | Trips／PublicCart 表單首選；承接 description、error 與方向。                                                                                                                     |
|  23 | form.tsx            | 沿用             | G4 若遷移 react-hook-form 才使用，原型不改資料行為。                                                                                                                             |
|  24 | hover-card.tsx      | 沿用（本批次要） | 可補充公式；必要資訊仍須可點擊及手機可見。                                                                                                                                       |
|  25 | input.tsx           | **擴充**         | 增 44／48px touch size、invalid/pending、具名錯誤、停用霧面與 44px 可清除尾鍵；保留 number/inputMode；金額輸入只顯示必要位數，不得顯示無意義小數零（O-1 已修項目，包 25 維持）。 |
|  26 | input-group.tsx     | 沿用             | 金額、幣別、件／箱等單位與前後綴。                                                                                                                                               |
|  27 | input-otp.tsx       | 沿用（本批不採） | 付款末五碼是單一選填對帳欄，不拆成 OTP。                                                                                                                                         |
|  28 | item.tsx            | 沿用             | 購物車列、最近訂單、低庫存、路線列共用 family。                                                                                                                                  |
|  29 | kbd.tsx             | 沿用（本批次要） | 只用桌機快捷提示，不影響手機流程。                                                                                                                                               |
|  30 | label.tsx           | 沿用             | 輸入皆有可關聯 Label，必填不只靠顏色。                                                                                                                                           |
|  31 | menubar.tsx         | 沿用（本批不採） | 底部導覽 5 項為全站唯一導覽；不建平行 menubar。                                                                                                                                  |
|  32 | navigation-menu.tsx | 沿用（本批不採） | PublicCart 無凍結多層網站導覽。                                                                                                                                                  |
|  33 | pagination.tsx      | 沿用（本批不採） | 無分頁契約，不虛構頁碼。                                                                                                                                                         |
|  34 | popover.tsx         | 沿用             | 桌機篩選／補充資訊；手機要有可點擊替代。                                                                                                                                         |
|  35 | progress.tsx        | 沿用             | 只作目標達成進度條與能量條的填色 substrate；里程碑、三態帶、目標線與超標處理都是能量條細節，不另建 progress 元件。                                                               |
|  36 | radio-group.tsx     | 沿用             | PublicCart 取貨方式使用可鍵盤操作的 card-radio。                                                                                                                                 |
|  37 | resizable.tsx       | 沿用（本批不採） | 無可調面板需求，寬度由 responsive grid 決定。                                                                                                                                    |
|  38 | scroll-area.tsx     | 沿用             | 側欄與長清單可用；主頁避免多層隱藏捲動。                                                                                                                                         |
|  39 | select.tsx          | **擴充**         | 增 touch size，承接大區、模式、縣市與行政區。                                                                                                                                    |
|  40 | separator.tsx       | 沿用             | 成本分段、訂單摘要與清單分隔。                                                                                                                                                   |
|  41 | sheet.tsx           | 沿用             | 手機編輯器、Sidebar mobile 與 KpiDetailSheet（KP-7），不另刻 overlay panel。                                                                                                     |
|  42 | sidebar.tsx         | 沿用             | 已含 desktop/mobile/collapsed/Sheet；本版禁止左側導覽作為主導覽，僅 legacy route 需要時沿用既有實作。                                                                            |
|  43 | skeleton.tsx        | 沿用             | Primitive 足夠；另組合各頁真實幾何，對應 J2，並提供超時／錯誤兜底。                                                                                                              |
|  44 | slider.tsx          | 沿用（本批不採） | 金額、匯率、件數需精確輸入，不以 slider 取代。                                                                                                                                   |
|  45 | sonner.tsx          | 沿用             | 輕量成功／失敗回饋；不取代頁內持續錯誤。                                                                                                                                         |
|  46 | spinner.tsx         | 沿用             | 按鈕／局部短載入；頁級使用 Skeleton，中文 aria-label。                                                                                                                           |
|  47 | switch.tsx          | 沿用（本批不採） | 無布林設定假需求。                                                                                                                                                               |
|  48 | table.tsx           | 沿用             | Comparison 與明細；主角為單線列＋分組標題，超過 10 列才可斑馬紋；sticky 欄與數字對齊在 composite 層。                                                                            |
|  49 | tabs.tsx            | 沿用             | 預估／實際內容分頁與四分類切換（AN-5）；文字標籤常駐，手機水平滑動。                                                                                                             |
|  50 | textarea.tsx        | 沿用             | 行程／結帳備註，維持 optional 標示。                                                                                                                                             |
|  51 | toast.tsx           | 沿用             | 保留 Radix 相容層；核心待確認／錯誤不可只用短暫 toast。                                                                                                                          |
|  52 | toaster.tsx         | 沿用             | 沿用 useToast，不得建立第三套通知。                                                                                                                                              |
|  53 | toggle.tsx          | 沿用（本批次要） | 只作非互斥小型視圖控制，預估／實際優先 Segmented（ModeSegment）。                                                                                                                |
|  54 | toggle-group.tsx    | 沿用（本批次要） | 圖層／篩選可用；預估／實際不可只靠按下色。                                                                                                                                       |
|  55 | tooltip.tsx         | 沿用             | 補充縮寫／公式；精確金額與待確認原因不可 hover-only。                                                                                                                            |

### 新建業務 composite

| Composite                                                        | 組合既有元件                               | 為何 55 個裡沒有可直接使用者                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| BottomNavigation                                                 | Button、Tooltip                            | 底部 5 項導覽（首頁｜KPI｜商品｜訂單｜更多）＋選取雙訊號契約（IA-4）。                                |
| TripSelector                                                     | Select、Button、Badge                      | KPI 頁行程選擇器；顯示行程名、期間與目前 mode。                                                       |
| ModeSegment                                                      | ToggleGroup、Badge                         | 預估｜實際｜差異 Segmented Control；切換同步更新（KP-8）＋150–250ms 淡入淡出（MO-4）。                |
| KpiCard／KpiSummaryGrid                                          | Card、Badge、Tooltip、Skeleton             | 封裝 4 張核心 KPI 格式（三層內容、24–28px tabular、2×2／四欄、Bottom Sheet 觸發）。                   |
| KpiDetailSheet                                                   | Sheet、Badge、Table、Button                | 五欄明細：公式、資料來源、涵蓋範圍、最後更新時間、是否為預估／實際／差異（KP-7）。                    |
| GoalAchievementCard                                              | Card、Progress、Badge、Tooltip             | 「目標達成」合併卡：234%｜超過目標 NT$10,040 的大數字＋進度條＋文字結論＋outcome 三態（AN-6、RU-1）。 |
| AnalysisTabs                                                     | Tabs、Button                               | 概覽｜損益｜成本｜趨勢四分類；手機水平滑動、⛔ 不超過四分類（AN-5）。                                 |
| ProfitWaterfall                                                  | Chart、Card、Empty、Alert                  | 真正累積瀑布（CH-1）：中間成本柱承接前值、結論式標題。                                                |
| CostBreakdown                                                    | Chart、Card、Empty                         | 成本占比＋橫向排行（層級④）；商品進貨成本為排行首項。                                                 |
| TrendChart                                                       | Chart、Card、Select                        | 趨勢主圖＋下拉切換指標；預設只顯示一張（AN-4）。                                                      |
| LiveMonitorCard                                                  | Card、Badge、Progress                      | 訂單／採購進度、目前行程等即時狀態卡；資料完整度與 API／同步狀態（GAP-3 收斂，見「已知缺口」）。      |
| EmptyState                                                       | Empty、Button                              | 全站空狀態統一：標題、原因、下一步與可選 CTA（RU-5、CH-4 文案）。                                     |
| SonarBackground                                                  | （CSS／SVG 裝飾層）                        | 聲吶同心圓＋掃描扇形＋粒子＋鯨魚位（SV-1）；MO 類動效、reduced-motion 全關（MO-2）。                  |
| ResponsiveOwnerShell                                             | Sidebar、Sheet、Button、Tooltip            | Primitive 不含 Pika 路由、權限可見度、底部導覽（手機）與桌面版式規則。                                |
| GoalEnergyBar                                                    | Progress、Badge、Tooltip                   | 達標能量條（沿用 v1）：百分比、目前金額、薪資目標、差額、目標刻度與後端三態。                         |
| CostBulletRow                                                    | Chart、Badge、Tooltip                      | 成本對帳 Bullet Chart：預估細刻度、實際填色、精確雙值與缺值正式文案。                                 |
| DualCurrencyCalibrationField                                     | Field、InputGroup、Input、Badge、Button    | G10 雙幣校準台；JPY 原幣與 NT$ 換算共同約束、匯率鎖定狀態常駐，窄版上下排列。                         |
| SemanticStatePanel                                               | Empty、Skeleton、Alert、Sonner、Button     | 封裝 J1–J10 的互斥狀態契約；同一資料區同時只允許一種主狀態。                                          |
| LedgerLockStamp                                                  | Badge、Button                              | K09 總帳落印鎖定；只對真實 estimateLocked 狀態使用，落定後仍保留可讀文字與鎖定原因。                  |
| VarianceComparisonTable／VarianceCell                            | Table、Badge、Tooltip                      | 需整合 estimated／actual／difference／percent／direction／state。                                     |
| CartLineItem／QuantityStepper／PickupMethodCard／CheckoutSummary | Item、ButtonGroup、RadioGroup、Card、Field | Primitive 不含商品、物流、門市、運費、付款與收件資料契約。                                            |
| 頁級 Skeleton compositions                                       | Skeleton、Card、Table                      | 頁級骨架必須反映各頁真實幾何，不能由 generic block 猜測。                                             |

### chart.tsx、empty.tsx、skeleton.tsx 裁定

- chart.tsx：底層足夠、產品圖型不足。沿用 Recharts ResponsiveContainer、深色 page-scope config、Tooltip、Legend；擴充可變高度、結論式標題（CH-2）、a11y 文字摘要與分類圖表 composite，不另裝圖表庫或重寫 primitive。
- empty.tsx：已有 Media／Header／Title／Description／Content，足夠沿用；所有空態直接組合它，不另建 Empty primitive。
- skeleton.tsx：單一 pulse block 作為 primitive 足夠；新建 Dashboard、KPI、Trips、Comparison、Cart 等頁級 composition，尺寸貼近真實元件並避免 layout shift。

### 互動元件完整狀態矩陣

下列狀態適用於 Button、Input、Select、Checkbox 與表格列內編輯。狀態可組合，例如 focus-visible + error、disabled + estimateLocked；組合時不得移除可見 focus 或把缺值補成 0。

| 狀態          | Button                                                                                             | Input                                                                                     | Select                                                                                   | Checkbox                                                                 | 表格列內編輯                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| default       | 正常前景／背景與明確動詞；44px 或 48px hit area。                                                  | --input 邊界、正常文字；placeholder 不得假裝資料。                                        | Trigger 顯示目前值或「請選擇」，保留展開圖示。                                           | 未選／已選皆有可見框與文字 Label。                                       | 顯示真實值與編輯入口；numeric cell 右對齊。                                                         |
| hover         | 只在可 hover 裝置使用既有 elevate overlay；不可是唯一狀態 cue。                                    | 邊界加強但不冒充 focus。                                                                  | Trigger 表面加強，選項 hover 不取代 selected indicator。                                 | 框與 label 同步回饋。                                                    | row 可用 --elevate-1，編輯按鈕保持可見名稱。                                                        |
| active        | 按下回饋使用既有 pressed overlay；不得改數字或位移布局。                                           | pointer down 不留下永久狀態。                                                             | Trigger／option 顯示 pressed，選定後回 default。                                         | 按下後 checked state 由實際值決定。                                      | 進入 edit mode 後顯示儲存／取消，不以 row hover 代替。                                              |
| focus-visible | 2px --ring＋2px offset，文字仍可讀。                                                               | 同上；error 同時存在時 ring 與錯誤訊息都保留。                                            | Trigger 與 option 各有鍵盤 focus。                                                       | focus ring 包住至少 44×44px hit area。                                   | focus 落在實際 editor／action，不只高亮整列。                                                       |
| **disabled**  | 使用原生 disabled；muted surface＋muted foreground＋正常可辨邊界，無 hover／active，顯示禁用原因。 | 保留已存在值，使用 disabled attribute、鎖定圖示／「預估已鎖定」說明；不得只降低 opacity。 | Radix disabled；保留選定值與鎖定原因，trigger 不展開。                                   | disabled 且保留 checked 真值；Label 顯示不可操作原因。                   | estimateLocked 時所有 editor 與儲存動作 disabled，row 顯示 Lock＋「預估已鎖定」，但金額仍清楚可讀。 |
| loading       | Spinner 與動詞同時保留，aria-busy="true"，暫時 disabled 防重送。                                   | 有上次值就保留並 busy；無值才用近似 skeleton，絕不顯示 0。                                | 保留目前選項並 busy；不可變更。                                                          | 由 field/group 顯示 busy 並暫停切換，不以 unchecked 冒充載入。           | 儲存中保留原值與「儲存中」；只有首次載入且無資料才用 skeleton。                                     |
| error         | 動作失敗後恢復可操作；錯誤放 inline Alert／field message，非 destructive 動作不得永久變紅。        | aria-invalid="true"、destructive 邊界與具體訊息；保留使用者輸入。                         | Trigger aria-invalid，錯誤訊息與可修正下一步常駐。                                       | group 顯示錯誤文字與 icon，不只紅框。                                    | row 內保留未送出值、欄位級錯誤及重試／取消；不得整列消失。                                          |
| read-only     | Button 沒有 read-only；若沒有動作，改用文字、Badge 或靜態值，不用 disabled button 假裝欄位。       | 使用 readOnly，可 focus、選取與複製，正常高對比並標「僅供查看」。                         | 無 native read-only；改渲染 field-shaped 靜態值＋「僅供查看」，不可套 disabled dimming。 | 改渲染 checked／unchecked indicator＋文字「僅供查看」，不保留互動 role。 | 顯示靜態 formatted value 與 read-only badge，不渲染 editor；與鎖定 disabled 分開。                  |

disabled 與「待確認」不得共用同一視覺：

| 比較   | disabled／鎖定                                                                   | 待確認／missing input                                                                   |
| ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 語意   | 已有規則或權限使它現在不能改，例如 estimateLocked。                              | 必要資料不存在、尚未填寫或匯率缺失。                                                    |
| 值     | 保留並顯示現有真值；不能因 disabled 清成空白或 0。                               | 沒有可顯示的 numeric value；必須寫「待確認」或「尚未填寫…」。                           |
| 操作   | control disabled；提供鎖定原因，若有權限才另給解鎖流程。                         | 原則上仍可編輯／前往補填；若同時被鎖定，兩個狀態與原因都要明寫。                        |
| 視覺   | muted surface／foreground、Lock、文字「預估已鎖定」；不得只靠 opacity。          | warning/pending 語意、提示 icon、補填 CTA；不使用 disabled cursor。                     |
| 可及性 | 原生 disabled；只有必須可 focus 解釋時才用 aria-disabled="true" 並實際攔截事件。 | 以 aria-describedby 關聯 pending reason；除非另有 validation error，不標 aria-invalid。 |

### 達標能量條與目標達成卡

- 達標能量條三態：已達標、未達標、虧損。每態同時顯示 outcome 文字、百分比、目前金額、薪資目標、差額與目標刻度；三態一律取後端 outcome，前端不得自行判斷（RU-1）。
- 「目標達成」卡（概覽分類）：大數字（234%）＋進度條＋「超過目標 NT$10,040」結論文字；同卡不可出現第四層資訊（KP-6 同構）。
- Bullet Chart 三態：有利、不利、待確認。預估為細刻度，實際為填色，兩筆精確金額常駐；有利／不利依後端或既有 variance domain 邏輯，不以「綠色＝好」猜測。
- 缺值不是 0。缺預估時不畫零刻度或空白子彈圖；缺實際時不畫零長度實際條。兩者都要顯示正式文案與下一步。

### Empty／loading／error／待確認

| 狀態                   | 規格                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Initial loading        | 按資訊架構順序保留版位；KPI、圖表與表格 skeleton 使用最終元件近似高度。Skeleton 不顯示可被誤認為真值的數字。 |
| Partial loading        | 只替換失敗或載入中的群組／面板；已成功區域持續可讀，首屏 KPI 不等待圖表。                                    |
| Empty                  | 使用既有 empty.tsx，保留區塊標題、原因、下一步與可選 CTA；不得留白（RU-5）。                                 |
| Pending／missing input | 這是待確認，不是 empty。顯示「尚未填寫〈欄位〉」或「待確認」，不得補 0（RU-2）。                             |
| Error                  | 在失敗區塊內顯示圖示、中文原因、保留上次成功資料的說明及至少 44×44px 的重試按鈕；不得把錯誤當 0 或移除整層。 |
| Ready but empty        | 保留標題、資料範圍與 empty action；不得與 request error 混為一談。                                           |

示意圖（E–H 若保留）即使 loading、empty 或 error，卡片標題區仍保留完整「⚠️ 示意圖・非真實資料」。動效尊重 prefers-reduced-motion（RU-8）；載入後不得造成 KPI 群組大幅 layout shift。

### 分類圖表契約與反迎合

| 圖表                 | 資料                       | 固定圖型與適配理由                                                                                                                 | Owner 提過但不採用者與理由                                                                 |
| -------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 概覽：損益瀑布       | 真實                       | 真正的浮動瀑布（CH-1）：調整後收入 → 成本逐項 ↓ → 最終淨利；中間成本柱從前一個累積值開始，每站標累積值；保留方向、順序與可驗算性。 | 不採點陣丘形，因會破壞浮動起點、接續終點與累積語意；不採蜂窩，因資料不是二維密度場。       |
| 損益：預估↔實際差異  | 真實                       | 共用零基線的群組長條＋差異列（文字＋符號＋有利／不利）；差異模式用分歧長條（零軸為方向分界）。                                     | 不採能量條，因不是單一目標進度；不採堆疊，因預估與實際不是組成關係；不得只用紅綠（RU-4）。 |
| 成本：成本結構       | 真實                       | 占比圖（donut）＋橫向排行（手機優先橫向長條）；商品進貨成本為排行首項。                                                            | 不採 waffle／蜂窩，part-to-whole 用占比圖更省空間且邊界清楚。                              |
| 成本：路線／地區成本 | 示意（若保留）             | 高到低水平排行；條尾保留精確金額；長路線名最多兩行。                                                                               | 不採蜂窩，序位不是二維密度。                                                               |
| 趨勢：歷史趨勢       | 真實／示意（依資料層進度） | 趨勢主圖（線／點陣）；X 軸保留時間順序，附每期精確值；預設一張主圖＋下拉切換指標（AN-4）。                                         | 不採六角蜂窩，時間序列需一維先後；不採實心面積，避免大色塊壓過密集資訊。                   |
| 趨勢：行程比較       | 真實                       | 行程比較卡或群組長條；每趟顯示結論、淨利與差異朝向。                                                                               | 不分雙軌；情境推演沒有預估／實際二元性。                                                   |
| 敏感度（若保留）     | 示意                       | hexbin 六角熱圖＋薪資目標等高線（chart-target-line）；鄰接格適合辨認可行、未達與虧損區。                                           | 不分雙軌；不混作 waffle，六角是 X／Y 分箱而非固定金額單位。                                |

圖表只是摘要，KPI 與明細才是可核對真相。每張圖都有可由螢幕閱讀器讀取的文字摘要與對應明細入口；Tooltip 必須可由 tap 與鍵盤 focus 開啟，不得 hover-only。圖表標題一律結論式（CH-2）。

## 已知缺口與後續

本節是明確登記的未完成項，不得在 G2 終審或 G4 派工中宣稱已完備。

| 缺口                                       | 現況與理由                                                                                                                                                                                     | 後續處理                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 鯨魚正式資產（GAP-7／REG-3）               | Owner 正在包 25 粒子鯨魚工作線決定方案；本關⛔ 不自行決定。                                                                                                                                    | 粒子鯨魚工作線驗收後回填「鯨魚識別元素」；G3 樣張內建線框鯨魚僅為示範資產。                                                             |
| 資料完整度％／API 連線狀態（GAP-3／REG-1） | 依既有端點可計算者收斂：連線狀態以 fetch 狀態（Loading／Error／正常）呈現；「已填必須欄位／總數」可由既有 operating-inputs 前端計算；不可計算者移至 E 部，不自行擴大。                         | G4 以既有端點實作；若無法取得來源，回報審批者 B。                                                                                       |
| opacity token                              | 既有 108 變數沒有獨立 opacity scale；disabled 以 muted surface、文字、邊界、Lock 與狀態文案區分，避免靠不受控透明度。                                                                          | 下一次正式 token revision 先盤點既有 disabled:／opacity-\* 用量，再決定是否納入既有命名體系；未拍板前不得散造 opacity CSS variables。   |
| icon 規範                                  | 55 個 shadcn primitive 已含 icon slot，但尚未凍結 icon library、尺寸、stroke、對齊、方向性與 aria-label 契約；本次只要求狀態 icon 必須搭配文字（RU-7）。                                       | G4 前另做 icon inventory；需定義 16／20／24px 使用場景、stroke consistency、decorative aria-hidden 與 meaningful icon accessible name。 |
| 完整 alias bridge                          | 既有 font fallback 與七個 derived border alias 已登記；exporter、page scope、@theme inline、:root semantic variables 與全部 token 的一對一機械 bridge 尚未建立。本文件的單軌矩陣仍是規格真相。 | G4 token migration 前產生完整 bridge／diff guard；在此之前匯出 CSS 只作比對輸入，不可整份覆蓋 index.css。                               |
| motion token                               | 已定 K1–K8 時長、MO 類聲吶層、同畫面 K ≤3、prefers-reduced-motion 紅線，但尚未新增 duration／easing production token 名稱。                                                                    | G5 依 animation review 將既定範圍實作成共用 motion scale；未核准前不得散造平行 CSS variables，也不得加入 K10 候選。                     |
| G1 方向選擇                                | G1 三方向樣張（領航燈塔／聲吶指揮艙／深海巡航）已產出並驗證 59/59，Owner 尚未裁示單一方向。                                                                                                    | G2 本版以凍結的共同模型定案（層級、時長、token、鐵律）；三方向在密度與互動上的差異待 Owner 裁示後於 G3 收斂為高保真。                   |

## Do's and Don'ts

### 八條顯示鐵律（RU-1～RU-8；前六條沿用原文，後兩條新增）

1. 三態結論（SALARY_TARGET_MET／有利潤未達標／虧損）一律取後端 outcome，前端不得自行判斷。<sub>沿用</sub>
2. 缺匯率、缺輸入一律顯示「待確認」，不得顯示 0。<sub>沿用</sub>
3. 金額一律 tabular numbers，動效不得破壞對齊。<sub>沿用</sub>
4. 預估與實際必須有清楚視覺區別；差異用有利／不利語意，不只靠紅綠。<sub>沿用</sub>
5. 空狀態必須設計，不得空白一片。<sub>沿用</sub>
6. 桌機與手機同等重要。<sub>沿用</sub>
7. 不可只依靠顏色表達狀態，必須同時搭配文字、正負號或圖示。<sub>新增（RU-7）</sub>
8. 模式切換 150–250ms 淡入淡出；必須支援 prefers-reduced-motion，降級後仍保留結果文字、符號與狀態。<sub>新增（RU-8）</sub>

### 假資料六項硬防護（沿用）

1. 假資料只准放在 artifacts/shop-app/src/mocks/。
2. 只有 PreviewChart 可以 import mocks/；頁面不得直取。
3. PreviewChart 永久渲染「⚠️ 示意圖・非真實資料」，不得提供關閉 prop 或設定。
4. CI guard：除 PreviewChart.tsx 外任何檔案 import mocks/ 即失敗。
5. 假值須一眼可辨為假，例如整數化、刻意極端；不得使用真實行程數字。
6. 上線前必須移除 mocks/ 與 PreviewChart 且 CI 全綠，否則不得上線。

### Anti-AI-Slop：Do

- 有本規格就只使用本規格定義的顏色、字體、圓角、間距、元件與圖表 token；禁止臨場發明新顏色。資料視覺化只能使用本文件新增的 sequential／diverging／supporting chart token。
- 先用資訊層級、留白、對齊、表面層級與真實內容建立辨識度；品牌感（聲吶、深海、鯨魚）必須能說明來源與用途，不能靠裝飾模板代替。
- Icon 使用既有可信元件庫並提供可見名稱；產品照片使用真實商品媒體，並設計 loading、missing 與 error fallback。
- 每一個 KPI、圖表、badge、illustration 或動效都必須回答它提供什麼資訊或操作價值；無法回答就刪除。
- 聲吶與鯨魚是裝飾層，數字與行動永遠在上層；鯨魚透明度 15–40%、粒子低對比、掃描 6–10 秒，全部尊重 prefers-reduced-motion。

### Anti-AI-Slop：Don't

- 禁止無品牌理由的紫色漸層，不得用「科技感」作為萬用理由。
- 禁止用 emoji 當 icon；emoji 只可出現在使用者內容或明確要求的語意文本。
- 禁止「圓角卡片＋左側 border accent」組合；狀態改用具名 badge、整體表面、文字、圖示或資料位置表達。
- 禁止 AI 自繪 SVG 人物／場景，避免五官錯位、比例詭異與無來源的裝飾插圖；⛔ 不得有人物、動漫少女、Q 版鯨魚、水族館兒童風（SV-3）。
- 禁止 CSS 剪影、幾何符號或字母方塊冒充真實產品照片。
- 禁止未經品牌調校的通用系統字體擔任標題字；只使用本規格的字體角色與字重層級。
- 禁止 #0D1117 深藍底搭配通用青紫霓虹 glow；⛔ 不使用發光邊框或滿頁漸層建立層級。
- 禁止 data slop：無資訊價值的裝飾性數字、假統計、無來源百分比或只為填滿卡片的指標。
- 禁止每個條列都配一個裝飾 icon；icon 只在改善辨識或操作時出現。
- 禁止「PowerPoint 切換」式動效，包括整頁 opacity 淡入淡出、每區同款 fade-up 或用轉場掩蓋資訊重排。動效必須維持元素連續性並尊重 prefers-reduced-motion；模式切換淡入淡出只限 150–250ms（RU-8）。
- 禁止把聲吶／粒子／鯨魚放在文字與圖表之上，或讓掃描干擾數字對齊。
- 介面中不得顯示 DeepSeek v4 flash 等模型名、供應商字樣、不必要技術標籤（SV-3）。

### 必須

- 保持「首頁工作台六區塊／KPI 頁三層（控制區→4 核心→四分類）」順序與四張核心 KPI 分組（KP-5）。
- 底部導覽固定 5 項：首頁｜KPI｜商品｜訂單｜更多；未選取灰藍、選取最多兩種訊號（亮藍＋細線圓環）（IA-4）。
- 全站 32 畫面（含客人端 6 頁）一律深海雷達配色；無淺色殘留（IA-6／E-11）。
- 四分類各承接的 9 張 KPI 必須以「主要卡／次要數字列／進度條／橫向排行／圖表／Bottom Sheet 明細」六層級呈現，不得 9 張等大卡搬家（AN-6）。
- A–H 映射依 CH-5 對照表；概覽瀑布為真正累積式（CH-1）；標題為結論式（CH-2）。
- 每張圖保留精確值、資料來源或明細入口，並回答「為什麼這種資料適合這種圖」。
- PublicCart、PublicOrder、TrackLookup、TrackOrder、Cvs711Select、Cvs711Return 以手機優先驗收；後台頁也必須在 phone viewport 完成同等資訊與操作。
- 所有控制具可見名稱、鍵盤焦點與至少 44×44px 的手機 touch target；相鄰 target 至少 8px 間距。
- 模式切換 150–250ms；prefers-reduced-motion 下掃描與持續動畫全部關閉（RU-8／MO-2）。
- 原型註解與產品文案分離。

### 禁止

- 不得用 0、0%、空 progress 或零長條代替缺值（RU-2）。
- 不得只靠紅綠、hover、動畫或視覺位置傳達必要資訊（RU-4／RU-7）。
- 不得把瀑布改成非累積式、不得把分類圖拆成雙軌、不得在趨勢分類一次排四張圖。
- 不得新增第二套 production token 名稱、另建 UI kit 或重刻已有 shadcn primitive。
- 不得讓任何容器水平捲動，或用 carousel 隱藏核心 KPI（AN-4 明訂的預設一張主圖＋下拉切換除外）；overflow-x: auto|scroll 與超寬 min-width 均為驗收失敗。
- 不得讓設計說明文字、真實資料外觀的假數字或 Stripe 品牌識別進入正式產品。
- 不得自行決定鯨魚長相、引用 V1–V8 任一版為定案（待粒子鯨魚工作線回填）。
- 任一畫面同時啟用的 K 類動效不得超過 3 種；與聲吶層衝突時以 K 類上限為準，聲吶層降級（MO-3）。

### G4 前置閘門：Scan → Diagnose → Fix

實作前完成 Scan 與 Diagnose。Scan 記錄 framework、styling method 與既有 design patterns；Diagnose 覆蓋九類稽核。每項適用 finding 必須包含證據位置、現況、對應 DESIGN.md 條款、Preserve／Retire／Modernise／N/A 處置、Fix Priority 與驗證方式。所有 finding 均已處置或具名延後後，才可進入 Fix。因 Skill 未定義 P0／P1，不再宣稱「Taste-Skill P0／P1 清空」。

### G4 實作驗收清單

- 全站 32 畫面逐一驗證深海單軌 scope；確認沒有淺色殘留、沒有互套舊值，並特別驗證 primary／accent／destructive 實心面與卡上語意文字的正確 token 引用。
- PublicCart／PublicOrder 分別以合法深色、合法淺色、非法值與缺值驗證品牌色：--primary-foreground 對 --primary 皆須達 4.5:1，非法值／缺值回退 #F57572，filled primary control 不得殘留 text-white；切換至其餘頁面後 override 必須清除，且 --background、--foreground、border／ring／sidebar、全部 chart 與資料語意 token 的 computed value 不變。
- 以 390、768、1024、1440px 為四主視口（延伸 320／360／430／640／1280／1536px）驗收全站；逐一檢查頁面及全部子容器，任何元素的 scrollWidth 都不得大於 clientWidth，且 production CSS 的 overflow-x: auto|scroll 宣告數必須為 0。
- 首頁在 390px 仍可依六區塊順序取得全部資訊；KPI 頁三層齊備、底部導覽 5 項可達、最後一張卡不被導覽遮住（IA-5）。
- 手機四張核心 KPI 為 2×2（⛔ 非三欄）、每卡高度 ≥104px；桌機四欄、卡寬有上限；每卡只有三層內容、數字 24–28px tabular、動效中對齊不變（KP-5／KP-6）。
- 四張核心卡點擊皆可開 Bottom Sheet，五欄資訊齊備，關閉後回到原狀態（KP-7）。
- 預估｜實際｜差異切換後 KPI 數字、比較值與圖表同步更新，切換時長實測 150–250ms（KP-8／RU-8）。
- 四分類恰為 4 個；概覽有「目標達成」卡（百分比＋文字結論）、損益為主要卡＋次要數字列、成本為占比圖＋橫向排行、趨勢預設一張主圖＋下拉切換；全站無 9 張等大卡（AN-5／AN-6）。
- 損益瀑布中間成本柱從前一個累積值開始；全站圖表標題無 A–H 分類碼、為結論句（CH-1／CH-2）。
- Empty／loading／error／ready-but-empty／pending input 逐頁驗收；無資料行程顯示「尚無實際成本資料…[新增成本]」（CH-4）；示意圖（若保留）每態仍保留角標。
- 驗證 phone／tablet／desktop 的 page-gutter、section-y、card-padding，以及 4 核心卡與四分類區塊的 24px 層級差異；成本 Bullet row 不低於 64px。
- 以 estimateLocked 驗證 Button／Input／Select／Checkbox／表格列內編輯的 disabled；disabled 真值、Lock 與原因常駐，pending 仍顯示待確認與補填動作。
- 抽查 JPY、TWD、負數、真正零值、null 與百分比；所有 numeric cell 實際套用 tnum，null 不得格式化為 0。
- 逐一開啟 Dropdown、Popover、Tooltip、Sheet／Drawer、Dialog 與 Sonner，驗證 portal 層級符合 0–90 尺度且 modal 內浮層不被 overlay 截斷。
- 聲吶掃描實測 6–10 秒一圈；prefers-reduced-motion 模擬下掃描／呼吸／粒子全部關閉，結果文字、符號與狀態仍在（MO-1／MO-2）；每畫面同時啟用的 K 類動效 ≤3（MO-3）。
- 鯨魚顯示以「鯨魚識別元素」小節的已知約束為準（尺寸與 opacity 為 TBD，⛔ 不得引用 G1 樣張自訂值）；正式資產待粒子鯨魚工作線回填（TBD）。
