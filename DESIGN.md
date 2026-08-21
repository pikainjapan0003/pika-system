---
version: "alpha"
name: "Pika V1 合併版"
description: "G1 定案合併版：後台六頁以夜班金線深色為主，客人端六頁以溫暖淺色為主；共用 108 個 token 名稱與資料語意。"
colors:
  background: "hsl(40 25% 98%)"
  foreground: "hsl(216 27% 13%)"
  border: "hsl(212 18% 85%)"
  input: "hsl(212 18% 55%)"
  ring: "hsl(201 70% 34%)"
  card: "hsl(0 0% 100%)"
  card-foreground: "hsl(216 27% 13%)"
  card-border: "hsl(212 18% 85%)"
  popover: "hsl(0 0% 100%)"
  popover-foreground: "hsl(216 27% 13%)"
  popover-border: "hsl(212 18% 85%)"
  primary: "hsl(201 70% 34%)"
  primary-foreground: "hsl(0 0% 100%)"
  secondary: "hsl(207 28% 94%)"
  secondary-foreground: "hsl(216 27% 16%)"
  muted: "hsl(210 23% 94%)"
  muted-foreground: "hsl(215 10% 42%)"
  accent: "hsl(32 88% 42%)"
  accent-foreground: "hsl(216 27% 13%)"
  destructive: "hsl(7 62% 46%)"
  destructive-foreground: "hsl(0 0% 100%)"
  sidebar: "hsl(208 30% 95%)"
  sidebar-foreground: "hsl(216 27% 13%)"
  sidebar-border: "hsl(212 18% 84%)"
  sidebar-primary: "hsl(201 70% 34%)"
  sidebar-primary-foreground: "hsl(0 0% 100%)"
  sidebar-accent: "hsl(207 28% 89%)"
  sidebar-accent-foreground: "hsl(216 27% 13%)"
  sidebar-ring: "hsl(201 70% 34%)"
  chart-1: "hsl(201 70% 34%)"
  chart-2: "hsl(32 88% 42%)"
  chart-3: "hsl(157 46% 35%)"
  chart-4: "hsl(218 54% 48%)"
  chart-5: "hsl(7 62% 46%)"
  chart-sequential-profit-1: "hsl(207 28% 94%)"
  chart-sequential-profit-2: "hsl(204 42% 85%)"
  chart-sequential-profit-3: "hsl(203 49% 74%)"
  chart-sequential-profit-4: "hsl(202 57% 61%)"
  chart-sequential-profit-5: "hsl(201 65% 48%)"
  chart-sequential-profit-6: "hsl(201 70% 34%)"
  chart-sequential-profit-7: "hsl(202 72% 24%)"
  chart-diverging-profit-negative-3: "hsl(7 62% 46%)"
  chart-diverging-profit-negative-2: "hsl(10 52% 60%)"
  chart-diverging-profit-negative-1: "hsl(16 38% 78%)"
  chart-diverging-profit-neutral: "hsl(210 23% 94%)"
  chart-diverging-profit-positive-1: "hsl(157 28% 78%)"
  chart-diverging-profit-positive-2: "hsl(157 37% 56%)"
  chart-diverging-profit-positive-3: "hsl(157 46% 35%)"
  chart-missing: "hsl(212 18% 55%)"
  chart-axis: "hsl(215 10% 42%)"
  chart-gridline: "hsl(212 18% 85%)"
  chart-contour: "hsl(216 27% 13%)"
  chart-target-line: "hsl(32 88% 42%)"
  chart-legend-foreground: "hsl(215 10% 42%)"
  chart-legend-border: "hsl(212 18% 55%)"
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
  night-accent-solid-check:
    backgroundColor: "hsl(35 72% 61%)"
    textColor: "hsl(218 24% 9%)"
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

# Pika V1 合併版設計系統

## Overview

本規格是包 24 G2 的唯一設計真相，適用於凍結的十二個畫面：`Dashboard.tsx`、`Trips.tsx`、`TripEstimate.tsx`、`TripActual.tsx`、`TripComparison.tsx`、`MonthlyProfit.tsx`、`PublicCart.tsx`、`PublicOrder.tsx`、`TrackLookup.tsx`、`TrackOrder.tsx`、`Cvs711Select.tsx`、`Cvs711Return.tsx`。

合併版是一套金額密集、決策優先的響應式 Web 工作台。後台先回答「現在有什麼要處理」與「最後賺多少、是否達標」，再展開原因與可核對明細；客人端與後台共用 token 命名、字型角色、資料語意、表單與狀態元件，但使用溫暖淺色、較寬鬆節奏與手機優先編排。

Dashboard 固定遵守四層順序：

1. 待處理事項。
2. 13 項 KPI：2 項主角、4 項收入與毛利、3 項成本、4 項效率與基準。
3. A–H 圖表摘要。
4. 明細表。

四層順序、A–H 圖型、達標能量條及成本 Bullet Chart 是 G1 已定案骨架。G2 只規範 token、元件、狀態、文案與響應式行為，不重新設計骨架。圖表先服從資料關係，再服從視覺偏好；每張圖都必須說得出為何適合該資料。

### §11.0f 定案風格：夜班金線合併版

G1 已於 2026-08-18 正式關閉。定案物是 `G2\merged-draft-tripestimate.html`，SHA-256 為 `C3B2DDF66790742EA3EB3858FD554A85B654428D35EA759581E39E33A213651F`。本節只定案皮膚層；上述四層版面、A–H 圖型、達標能量條、成本 Bullet Chart 與 13 KPI 均不得更動。

#### 主題範圍

| 範圍                                                                                      | V1 主題      | 使用契約                                                                                   |
| ----------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| 後台 6 頁：Dashboard／Trips／TripEstimate／TripActual／TripComparison／MonthlyProfit      | **深色為主** | 使用「夜班金線」：炭黑表面、暖金主利益與結算線、橘紅注意、具名異常；高密度但不得水平捲動。 |
| 客人端 6 頁：PublicCart／PublicOrder／TrackLookup／TrackOrder／Cvs711Select／Cvs711Return | **淺色為主** | 保持台灣消費者購物情境的溫暖、親切與手機優先；不得套用深色後台值。                         |

V1 暫不為兩邊製作對方的主題變體。兩個範圍仍共用同一套 108 個 production token 名稱；selector／page scope 決定取值，不得再建立第二套命名。Front matter 是客人端 Light 的 lint／export 投影；完整的客人端 Light／後台 Night 取值以 Colors 的 108-token 矩陣為準。

#### 字體混合策略

| 用途                               | 字體與數字特性                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 所有數字、金額、百分比             | `--app-font-sans`（Noto Sans TC 優先）＋ `tabular-nums lining-nums`；不得為了數字對齊改用中文等寬字。 |
| 技術標註：kicker／表頭／單位／代碼 | `--app-font-mono` 的 Latin 等寬字；若內容含中文，中文字符回退至 `--app-font-sans`。                   |
| 中文標題與正文                     | `--app-font-sans`，以字級、字重、行高與區塊面積建立層級。                                             |

不使用中文等寬字：Menlo 沒有 CJK 字形；Sarasa Mono TC 單一字重約 10–20 MB，不納入 V1。mono 只是一個技術標註角色，不是全場字體，也不得套在中文標題或正文。

#### A–L 十二類收斂表

每類只留一個主角；其他作法必須降為表中限定用途。不得把所有探索變體同時做成跨頁元件，否則會重新形成無主次的 AI 卡片集合。

| 類               | 主角                                                                 | 限定用途                                                                      | 砍除／併入                                                   |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A 字體           | 上述混合策略                                                         | —                                                                             | 中文等寬字。                                                 |
| B 數字           | hero 大數字＋正負符號＋語意色                                        | 幣別同行、共同右基線是格式規則                                                | —                                                            |
| C 語意色         | 淡底語意面＋`▲`／`▼`／`◆` 符號雙編碼                                 | 一像素語意框只用於中頻狀態                                                    | —                                                            |
| D 徽章           | 點號＋具名文字＋一像素框線                                           | 刻度式只作進度；條碼式只作識別碼                                              | **膠囊徽章砍除。**                                           |
| E 卡片與層級     | 色面區塊／三段色帶                                                   | 全框網格只用於表格區                                                          | —                                                            |
| F 按鈕           | 幽靈按鈕為多數                                                       | 膠囊只留每頁一個主要按鈕；危險動作面只用於刪除類                              | —                                                            |
| G 輸入           | 直角方框＋default／focus／error 三態；錯誤具名、停用霧面、可清除尾鍵 | `DualCurrencyCalibrationField`（G10 雙幣校準台）只用於 JPY 原幣／NT$ 換算輸入 | —                                                            |
| H 表格           | 單線列＋分組標題                                                     | 斑馬紋只在超過 10 列時使用                                                    | —                                                            |
| I 進度           | `GoalEnergyBar` 能量條，內含目標刻度與超標處理                       | 累計堆疊只用於成本組成                                                        | 里程碑／三態帶／目標線併為能量條細節，不獨立成元件。         |
| J 空／載入／錯誤 | 十種互斥狀態全收，見下表                                             | 同一資料區同一時間只顯示一種主狀態                                            | J08 黑盒診斷帶仍為候選，本次不寫入。                         |
| K 動效           | 八種功能性動效，見下表                                               | 同一畫面同時最多 3 種；首屏 KPI 不得等待動效                                  | 淡入／上滑進場秀砍除；K10 對帳級聯收束仍為候選，本次不寫入。 |
| L 密度           | 數字優先、標籤微級、組距大而行距小                                   | 同一內容提供鬆／中／緊三密度作驗證，production 依頁面任務選一種               | —                                                            |

膠囊是整套直角工業語彙的唯一例外，只保留給每頁一個主要按鈕；狀態 badge 不得再使用膠囊。`G10` 雙幣校準台與 `K09` 總帳落印鎖定正式納入；`J08` 黑盒診斷帶與 `K10` 對帳級聯收束保持候選，不得先進 G3 inventory。

#### J 類十種互斥狀態

|   # | 狀態樣式           | 使用契約                                                                                  |
| --: | ------------------ | ----------------------------------------------------------------------------------------- |
|  J1 | 待確認內聯         | 缺值具名顯示「待確認」或「尚未填寫…」，不補 0、不隱藏欄位。                               |
|  J2 | 骨架屏             | 以真實標籤與最終幾何佔位，不顯示假數字；必須有超時／錯誤兜底。                            |
|  J3 | 內聯錯誤           | 就地顯示原因、保留輸入或上次成功資料，不以 modal 中斷一般操作。                           |
|  J4 | 字排空態           | 以標題、原因與資料範圍說明空值，不使用 AI 插畫或 emoji。                                  |
|  J5 | 文字進度           | 顯示工作名稱與已知筆數／階段；沒有真百分比時不得製造假百分比。                            |
|  J6 | 全頁錯誤＋重試     | 只在整頁不可用時使用；保留可理解原因與至少 44×44px 的重試動作。                           |
|  J7 | 樂觀載入／內容保留 | 保留舊資料並具名標示「更新中」與上次更新時間，不閃白、不跳版。                            |
|  J8 | 空態＋建議動作     | 只有存在明確下一步時才給一個 CTA，例如「新增第一筆」。                                    |
|  J9 | 角落提示           | 只補充非阻斷結果；內容與必要錯誤仍留在原位置，toast 不得成為唯一訊息。                    |
| J10 | 三態並排比較       | 只用於 Foundations／元件驗收，並排檢查 empty／loading／error；production 不同時展示三態。 |

J 類全收是因十種狀態彼此互斥，且每一種都提供 fail-closed 路徑；這不授權同一區塊同時堆疊多種狀態外觀。

上表的 J1–J10 是合併後的十個狀態 family；其中 J8「空態＋建議動作」不是 Codex 探索卡 `J08 黑盒診斷帶`。後者仍是候選，不得因編號相似而誤納入。

#### K 類八種功能性動效

|   # | 動效               | 使用契約                                                                                                    |
| --: | ------------------ | ----------------------------------------------------------------------------------------------------------- |
|  K1 | 數字結算 450–600ms | 只在一次重要重算完成時使用；幣別、小數點與欄寬固定，首屏初值仍直接可讀。                                    |
|  K2 | hover 抬升 150ms   | 只用於可互動元素且只在支援 hover 的裝置；不得讓資料卡牆全部漂浮。                                           |
|  K3 | 展開收合 220–300ms | 摘要列固定，明細從其下展開；不得放大整張卡片或造成水平位移。                                                |
|  K4 | 單次脈衝約 500ms   | 只提示一次已完成的非關鍵狀態；不得自動循環或以 glow 表現。                                                  |
|  K5 | 進度填入 600–700ms | 目標線固定、填色移動；只在重要更新使用，初次渲染不得延遲數字結論。                                          |
|  K6 | 交錯更新           | 僅對最多 5 列的真實更新順序使用；不得把全頁 fade-up 包裝成「交錯」。                                        |
|  K7 | 狀態轉換           | 保持元素位置連續，文字與符號一起更新；`LedgerLockStamp`（K09 總帳落印鎖定）是 `estimateLocked` 的專用實例。 |
|  K8 | 按下縮放 180ms     | 只作用在實際按鈕／可點控制，文字與底板一起移動，觸控後完整播放一次。                                        |

所有動效尊重 `prefers-reduced-motion`，縮減後仍須保留結果文字、符號與狀態。任一畫面同時啟用的 K 類動效不得超過 3 種。

### 邊界與非目標

- 本批不得改計算核心、schema、migration、API 契約或新增寫回路徑。
- `ReceiptPreview.tsx`、receipt camera prototype、OCR review prototype 均不在本關；後兩者延至 Phase 4。
- `TrackOrder.tsx` 自 G1 起保持零修改；本規格只定義未來套用時的響應式與狀態契約。
- 原型是規格證據，不是可直接搬入產品的程式碼或資料來源。

## Colors

客人端 Light 使用近白主底、白色主卡與低彩度藍灰邊界；後台 Night 使用炭黑背景、暖灰文字、暖金主利益與橘紅異常。層級主要由亮度階、面狀分區、1px 邊界、共同基線與間距建立，不以厚重陰影、玻璃擬態、glow、發光邊框或滿頁漸層建立。後台 Night 禁用 `#0D1117` 與青紫霓虹。

### 品牌色 override 契約

`stores.brand_primary_color` 是既有店家設定功能，不得因套用客人端 Light scope 而靜默移除。V1 的 runtime 品牌色 override 僅適用於 `PublicCart` 與 `PublicOrder`；其餘 10 個凍結畫面維持本文件的 Light／Night 逐字值，不接受品牌色覆寫。

- 品牌色輸入先經既有 `safeHex()` 驗證；非法值或缺值一律回退 `DEFAULT_BRAND_PRIMARY_COLOR`（`#F57572`）。
- 唯一允許直接覆寫的 semantic token 是 `--primary`。唯一允許依 `--primary` 在 runtime 計算的 token 是 `--primary-foreground`；既有 `--color-primary` 與 `--color-primary-foreground` alias 只跟隨引用，不得另寫一份值或新增 token 名稱。
- 不得連帶覆寫全域 `--background`、`--foreground`、card／popover／muted／accent／destructive、border／input／ring、sidebar、`--chart-*` 或本文件的 sequential／diverging／supporting chart token。語意色是資料真值：有利綠、不利紅、待確認橘與缺值樣式絕不得被店家品牌色取代、混色或降低辨識。
- `--primary-foreground` 必須由 `lib/brandColor.ts` 的 `getLuminance()` 依 WCAG 相對亮度與對比公式決定：sRGB channel 先正規化並 linearize，再以 `0.2126R + 0.7152G + 0.0722B` 求相對亮度，最後以 `(Llighter + 0.05) / (Ldarker + 0.05)` 實測黑／白候選。採用對比較高且達 WCAG AA `4.5:1` 的候選；不得以 HSL lightness、未 linearize RGB、固定 `0.6` 門檻或肉眼判斷宣稱通過，也不得降低門檻。
- 所有 filled primary control 必須使用 `--primary-foreground`，禁止硬寫 `text-white`。品牌色若作為一般大小的 `text-primary`，還必須對實際 Light background／card 實測 `4.5:1`；未達標時改用固定 `--foreground`，不得因 filled pair 合格就推定彩色文字也合格。
- override 必須限制在上述兩頁的 Light scope，進入其他 Light、Night 或 legacy route 時立即清除；不得讓寫在 `document.documentElement` 的殘值跨頁繼承。G4 實作須保留店家設定功能，同時證明其他 token 的 computed value 未變。

### 資料與狀態語意

- 預估／主要資料：`--primary`、`--chart-1`。
- 實際：`--chart-4`，且必須再以「實際」文字、排列或圖例區分。
- 目標、待確認與差額焦點：`--accent`、`--chart-2`。
- 有利／達標：`--chart-3`，必須明寫「有利」或「已達標」。
- 不利／錯誤／虧損：`--destructive`、`--chart-5`，必須明寫「不利」「錯誤」或「虧損」。
- 尚未載入、次要背景與空狀態：`--muted`。

有利／不利不得只靠紅綠，預估／實際不得只靠色差。色彩必須與文字、方向、圖例、線型或位置至少再配一種編碼。A–D 為真實資料，禁止示意角標；E–H 每張卡都必須各自完整顯示一次「⚠️ 示意圖・非真實資料」，角標不可關閉。

### 資料視覺化連續色階

`--chart-1`～`--chart-5` 是分類色，只能區分類別或既定語意，禁止拿五個分類色圓點拼成連續高低。熱圖、等高線與具正負中心的差異資料改用下列專用 token。這 21 個 token 是 G2 新增的資料視覺化命名，獨立於下方「既有 108 個 CSS 變數」相容矩陣；因此該矩陣仍須精確維持 108 列。

#### Sequential：低 → 高

| 階                            | 客人端 Light  | 後台 Night    | 使用契約                       |
| ----------------------------- | ------------- | ------------- | ------------------------------ |
| `--chart-sequential-profit-1` | `207 28% 94%` | `217 19% 18%` | 數值域最低端；不是「待確認」。 |
| `--chart-sequential-profit-2` | `204 42% 85%` | `213 23% 25%` | 第二階。                       |
| `--chart-sequential-profit-3` | `203 49% 74%` | `209 31% 32%` | 第三階。                       |
| `--chart-sequential-profit-4` | `202 57% 61%` | `205 41% 40%` | 中段數值。                     |
| `--chart-sequential-profit-5` | `201 65% 48%` | `201 50% 48%` | 第五階。                       |
| `--chart-sequential-profit-6` | `201 70% 34%` | `198 56% 55%` | 第六階。                       |
| `--chart-sequential-profit-7` | `202 72% 24%` | `195 62% 66%` | 數值域最高端。                 |

客人端 Light 由低到高採「亮 → 暗」，後台 Night 獨立採「暗 → 亮」，不可用濾鏡、透明度或反相把 Light 值臨時轉成 Night 值。以 HSL 轉 sRGB 再轉 OKLab 驗證，Light 的感知亮度 `L` 為 `0.9531 → 0.3868`，Night 為 `0.2908 → 0.7760`，兩者皆嚴格單調。protan／deutan／tritan 模擬下，相鄰階最小 OKLab 距離仍為 `0.0646`；正式 G4 視覺回歸須保留此單調性，不得任意插值漂移。

#### Diverging：不利 ← 商業中心 → 有利

| 階                                    | 客人端 Light  | 後台 Night    | 使用契約                             |
| ------------------------------------- | ------------- | ------------- | ------------------------------------ |
| `--chart-diverging-profit-negative-3` | `7 62% 46%`   | `7 58% 63%`   | 最大不利幅度。                       |
| `--chart-diverging-profit-negative-2` | `10 52% 60%`  | `9 48% 53%`   | 中度不利。                           |
| `--chart-diverging-profit-negative-1` | `16 38% 78%`  | `13 33% 39%`  | 輕度不利。                           |
| `--chart-diverging-profit-neutral`    | `210 23% 94%` | `217 19% 18%` | 有商業意義的中心，不是資料範圍中點。 |
| `--chart-diverging-profit-positive-1` | `157 28% 78%` | `157 28% 32%` | 輕度有利。                           |
| `--chart-diverging-profit-positive-2` | `157 37% 56%` | `157 36% 44%` | 中度有利。                           |
| `--chart-diverging-profit-positive-3` | `157 46% 35%` | `157 43% 55%` | 最大有利幅度。                       |

Diverging 中心只准取 `0`、薪資目標或另一個已在商業規則中定義的基準；禁止取資料最大值與最小值的算術中點。客人端 Light 以亮中心向兩端加深，後台 Night 以暗中心向兩端增亮；三種色覺缺陷模擬下相鄰階最小 OKLab 距離為 `0.0692`。色弱模擬不是免除冗餘編碼的理由：每個負值／正值仍須顯示符號、金額與「不利／有利」文字。

#### 支援角色

| Token                       | 客人端 Light  | 後台 Night    | 使用契約                                                 |
| --------------------------- | ------------- | ------------- | -------------------------------------------------------- |
| `--chart-missing`           | `212 18% 55%` | `215 18% 48%` | 只表示缺值；同時使用斜線紋理或虛線邊界與「待確認」文字。 |
| `--chart-axis`              | `215 10% 42%` | `214 12% 66%` | 軸、刻度與必要標籤。                                     |
| `--chart-gridline`          | `212 18% 85%` | `215 18% 24%` | 裝飾性格線，不承載狀態。                                 |
| `--chart-contour`           | `216 27% 13%` | `210 24% 93%` | 一般等高線與邊界。                                       |
| `--chart-target-line`       | `32 88% 42%`  | `35 72% 61%`  | 薪資目標或其他具名商業門檻。                             |
| `--chart-legend-foreground` | `215 10% 42%` | `214 12% 66%` | 圖例文字與數字。                                         |
| `--chart-legend-border`     | `212 18% 55%` | `215 18% 48%` | 圖例 swatch 的必要邊界。                                 |

「待確認」不屬於數值域，禁止落入 sequential 第一階、diverging 中心或任何 `0` 值。色階圖例是圖表的一部分，不可省略：桌機顯示五個由實際 domain 計算的金額刻度，例如 `NT$ 5,000.00／10,000.00／15,000.00／20,000.00／25,000.00`，禁止只寫「低／中／高」；diverging 圖例須把商業中心的實際值與名稱標在中央。手機若不顯示完整熱圖，仍須在文字結論或表格標出 domain、中心與精確金額。

### 108 個既有 CSS 變數

以下名稱是 `pika-v1-phase23/artifacts/shop-app/src/index.css` 的 108 個唯一變數；不得新增第二套 production token 名稱。Front matter 只是 `@google/design.md` 可 export 的客人端 Light 投影，這張矩陣才是客人端 Light／後台 Night 的完整規格。後台 Night 的 34 個語意取值逐字來自 `G2\night-ledger-final-token-overrides.json`；其 scope 是 `existing dark-theme or page scope only`，不得以這些深色值全域覆蓋客人端 Light。別名、字型、圓角、陰影與其他 primitive 沿用既有名稱與引用。

| Token                                | 客人端 Light                                                       | 後台 Night                               |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| `--color-background`                 | `hsl(var(--background))`                                           | `hsl(var(--background))`                 |
| `--color-foreground`                 | `hsl(var(--foreground))`                                           | `hsl(var(--foreground))`                 |
| `--color-border`                     | `hsl(var(--border))`                                               | `hsl(var(--border))`                     |
| `--color-input`                      | `hsl(var(--input))`                                                | `hsl(var(--input))`                      |
| `--color-ring`                       | `hsl(var(--ring))`                                                 | `hsl(var(--ring))`                       |
| `--color-card`                       | `hsl(var(--card))`                                                 | `hsl(var(--card))`                       |
| `--color-card-foreground`            | `hsl(var(--card-foreground))`                                      | `hsl(var(--card-foreground))`            |
| `--color-card-border`                | `hsl(var(--card-border))`                                          | `hsl(var(--card-border))`                |
| `--color-popover`                    | `hsl(var(--popover))`                                              | `hsl(var(--popover))`                    |
| `--color-popover-foreground`         | `hsl(var(--popover-foreground))`                                   | `hsl(var(--popover-foreground))`         |
| `--color-popover-border`             | `hsl(var(--popover-border))`                                       | `hsl(var(--popover-border))`             |
| `--color-primary`                    | `hsl(var(--primary))`                                              | `hsl(var(--primary))`                    |
| `--color-primary-foreground`         | `hsl(var(--primary-foreground))`                                   | `hsl(var(--primary-foreground))`         |
| `--color-primary-border`             | `var(--primary-border)`                                            | `var(--primary-border)`                  |
| `--color-secondary`                  | `hsl(var(--secondary))`                                            | `hsl(var(--secondary))`                  |
| `--color-secondary-foreground`       | `hsl(var(--secondary-foreground))`                                 | `hsl(var(--secondary-foreground))`       |
| `--color-secondary-border`           | `var(--secondary-border)`                                          | `var(--secondary-border)`                |
| `--color-muted`                      | `hsl(var(--muted))`                                                | `hsl(var(--muted))`                      |
| `--color-muted-foreground`           | `hsl(var(--muted-foreground))`                                     | `hsl(var(--muted-foreground))`           |
| `--color-muted-border`               | `var(--muted-border)`                                              | `var(--muted-border)`                    |
| `--color-accent`                     | `hsl(var(--accent))`                                               | `hsl(var(--accent))`                     |
| `--color-accent-foreground`          | `hsl(var(--accent-foreground))`                                    | `hsl(var(--accent-foreground))`          |
| `--color-accent-border`              | `var(--accent-border)`                                             | `var(--accent-border)`                   |
| `--color-destructive`                | `hsl(var(--destructive))`                                          | `hsl(var(--destructive))`                |
| `--color-destructive-foreground`     | `hsl(var(--destructive-foreground))`                               | `hsl(var(--destructive-foreground))`     |
| `--color-destructive-border`         | `var(--destructive-border)`                                        | `var(--destructive-border)`              |
| `--color-chart-1`                    | `hsl(var(--chart-1))`                                              | `hsl(var(--chart-1))`                    |
| `--color-chart-2`                    | `hsl(var(--chart-2))`                                              | `hsl(var(--chart-2))`                    |
| `--color-chart-3`                    | `hsl(var(--chart-3))`                                              | `hsl(var(--chart-3))`                    |
| `--color-chart-4`                    | `hsl(var(--chart-4))`                                              | `hsl(var(--chart-4))`                    |
| `--color-chart-5`                    | `hsl(var(--chart-5))`                                              | `hsl(var(--chart-5))`                    |
| `--color-sidebar`                    | `hsl(var(--sidebar))`                                              | `hsl(var(--sidebar))`                    |
| `--color-sidebar-foreground`         | `hsl(var(--sidebar-foreground))`                                   | `hsl(var(--sidebar-foreground))`         |
| `--color-sidebar-border`             | `hsl(var(--sidebar-border))`                                       | `hsl(var(--sidebar-border))`             |
| `--color-sidebar-primary`            | `hsl(var(--sidebar-primary))`                                      | `hsl(var(--sidebar-primary))`            |
| `--color-sidebar-primary-foreground` | `hsl(var(--sidebar-primary-foreground))`                           | `hsl(var(--sidebar-primary-foreground))` |
| `--color-sidebar-primary-border`     | `var(--sidebar-primary-border)`                                    | `var(--sidebar-primary-border)`          |
| `--color-sidebar-accent`             | `hsl(var(--sidebar-accent))`                                       | `hsl(var(--sidebar-accent))`             |
| `--color-sidebar-accent-foreground`  | `hsl(var(--sidebar-accent-foreground))`                            | `hsl(var(--sidebar-accent-foreground))`  |
| `--color-sidebar-accent-border`      | `var(--sidebar-accent-border)`                                     | `var(--sidebar-accent-border)`           |
| `--color-sidebar-ring`               | `hsl(var(--sidebar-ring))`                                         | `hsl(var(--sidebar-ring))`               |
| `--font-sans`                        | `var(--app-font-sans)`                                             | `var(--app-font-sans)`                   |
| `--font-serif`                       | `var(--app-font-serif)`                                            | `var(--app-font-serif)`                  |
| `--font-mono`                        | `var(--app-font-mono)`                                             | `var(--app-font-mono)`                   |
| `--radius-sm`                        | `calc(var(--radius) - 4px)`                                        | `calc(var(--radius) - 4px)`              |
| `--radius-md`                        | `calc(var(--radius) - 2px)`                                        | `calc(var(--radius) - 2px)`              |
| `--radius-lg`                        | `var(--radius)`                                                    | `var(--radius)`                          |
| `--radius-xl`                        | `calc(var(--radius) + 4px)`                                        | `calc(var(--radius) + 4px)`              |
| `--button-outline`                   | `rgba(0, 0, 0, 0.1)`                                               | `rgba(0, 0, 0, 0.1)`                     |
| `--badge-outline`                    | `rgba(0, 0, 0, 0.05)`                                              | `rgba(0, 0, 0, 0.05)`                    |
| `--opaque-button-border-intensity`   | `-8`                                                               | `-8`                                     |
| `--elevate-1`                        | `rgba(0, 0, 0, 0.03)`                                              | `rgba(0, 0, 0, 0.03)`                    |
| `--elevate-2`                        | `rgba(0, 0, 0, 0.08)`                                              | `rgba(0, 0, 0, 0.08)`                    |
| `--background`                       | `40 25% 98%`                                                       | `52 5% 8%`                               |
| `--foreground`                       | `216 27% 13%`                                                      | `43 23% 90%`                             |
| `--border`                           | `212 18% 85%`                                                      | `45 8% 34%`                              |
| `--input`                            | `212 18% 55%`                                                      | `45 8% 34%`                              |
| `--ring`                             | `201 70% 34%`                                                      | `39 67% 60%`                             |
| `--card`                             | `0 0% 100%`                                                        | `50 5% 12%`                              |
| `--card-foreground`                  | `216 27% 13%`                                                      | `43 23% 90%`                             |
| `--card-border`                      | `212 18% 85%`                                                      | `45 8% 34%`                              |
| `--popover`                          | `0 0% 100%`                                                        | `50 5% 12%`                              |
| `--popover-foreground`               | `216 27% 13%`                                                      | `43 23% 90%`                             |
| `--popover-border`                   | `212 18% 85%`                                                      | `45 8% 34%`                              |
| `--primary`                          | `201 70% 34%`                                                      | `39 67% 60%`                             |
| `--primary-foreground`               | `0 0% 100%`                                                        | `52 5% 8%`                               |
| `--secondary`                        | `207 28% 94%`                                                      | `48 6% 18%`                              |
| `--secondary-foreground`             | `216 27% 16%`                                                      | `43 23% 90%`                             |
| `--muted`                            | `210 23% 94%`                                                      | `48 6% 18%`                              |
| `--muted-foreground`                 | `215 10% 42%`                                                      | `43 9% 64%`                              |
| `--accent`                           | `32 88% 42%`                                                       | `21 68% 55%`                             |
| `--accent-foreground`                | `216 27% 13%`                                                      | `52 5% 8%`                               |
| `--destructive`                      | `7 62% 46%`                                                        | `5 61% 61%`                              |
| `--destructive-foreground`           | `0 0% 100%`                                                        | `52 5% 8%`                               |
| `--sidebar`                          | `208 30% 95%`                                                      | `52 5% 8%`                               |
| `--sidebar-foreground`               | `216 27% 13%`                                                      | `43 23% 90%`                             |
| `--sidebar-border`                   | `212 18% 84%`                                                      | `45 8% 34%`                              |
| `--sidebar-primary`                  | `201 70% 34%`                                                      | `39 67% 60%`                             |
| `--sidebar-primary-foreground`       | `0 0% 100%`                                                        | `52 5% 8%`                               |
| `--sidebar-accent`                   | `207 28% 89%`                                                      | `48 6% 18%`                              |
| `--sidebar-accent-foreground`        | `216 27% 13%`                                                      | `43 23% 90%`                             |
| `--sidebar-ring`                     | `201 70% 34%`                                                      | `39 67% 60%`                             |
| `--chart-1`                          | `201 70% 34%`                                                      | `39 67% 60%`                             |
| `--chart-2`                          | `32 88% 42%`                                                       | `21 68% 55%`                             |
| `--chart-3`                          | `157 46% 35%`                                                      | `105 24% 56%`                            |
| `--chart-4`                          | `218 54% 48%`                                                      | `43 9% 64%`                              |
| `--chart-5`                          | `7 62% 46%`                                                        | `5 61% 61%`                              |
| `--app-font-sans`                    | `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`  | same as Light                            |
| `--app-font-serif`                   | `Georgia, serif`                                                   | same as Light                            |
| `--app-font-mono`                    | `Menlo, Consolas, monospace`                                       | same as Light；只用於 Latin 技術標註     |
| `--radius`                           | `0.375rem`                                                         | `0.375rem`                               |
| `--shadow-2xs`                       | `0 1px 2px 0 rgba(0, 0, 0, 0.05)`                                  | same as Light                            |
| `--shadow-xs`                        | `0 1px 3px 0 rgba(0, 0, 0, 0.07)`                                  | same as Light                            |
| `--shadow-sm`                        | `0 2px 4px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.04)`        | same as Light                            |
| `--shadow`                           | `0 4px 6px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05)`        | same as Light                            |
| `--shadow-md`                        | `0 6px 10px rgba(0,0,0,.08), 0 2px 4px -2px rgba(0,0,0,.06)`       | same as Light                            |
| `--shadow-lg`                        | `0 10px 15px rgba(0,0,0,.08), 0 4px 6px -2px rgba(0,0,0,.05)`      | same as Light                            |
| `--shadow-xl`                        | `0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.05)` | same as Light                            |
| `--shadow-2xl`                       | `0 25px 50px -12px rgba(0, 0, 0, 0.15)`                            | same as Light                            |
| `--tracking-normal`                  | `0em`                                                              | `0em`                                    |
| `--spacing`                          | `0.25rem`                                                          | `0.25rem`                                |
| `--primary-border`                   | relative HSL from `--primary` and border intensity                 | same reference                           |
| `--secondary-border`                 | relative HSL from `--secondary` and border intensity               | same reference                           |
| `--muted-border`                     | relative HSL from `--muted` and border intensity                   | same reference                           |
| `--accent-border`                    | relative HSL from `--accent` and border intensity                  | same reference                           |
| `--destructive-border`               | relative HSL from `--destructive` and border intensity             | same reference                           |
| `--sidebar-primary-border`           | relative HSL from `--sidebar-primary` and border intensity         | same reference                           |
| `--sidebar-accent-border`            | relative HSL from `--sidebar-accent` and border intensity          | same reference                           |

### 對比與引用契約

後台 Night 的對比基準以夜班金線覆寫值重新計算；不得沿用舊深藍灰主題的數字或結論。

| Pair                                        |        對比 | 使用契約                                   |
| ------------------------------------------- | ----------: | ------------------------------------------ |
| `--foreground`／`--background`              | `14.9149:1` | 一般正文與頁面底。                         |
| `--primary`／`--primary-foreground`         |  `8.8903:1` | 暖金實心主按鈕、主利益與結算重點。         |
| `--accent`／`--accent-foreground`           |  `5.7323:1` | 橘色實心注意面；不是一般主操作色。         |
| `--destructive`／`--destructive-foreground` |  `5.3106:1` | 錯誤／異常實心面，仍須有文字與符號雙編碼。 |
| `--muted-foreground`／`--card`              |  `6.8058:1` | 次要但必要的標註、時間與單位。             |

`--accent-foreground` 與 `--destructive-foreground` 只准用於各自的實心背景；卡面上的注意／異常文字直接使用 `--accent`／`--destructive`。暖金 `--primary` 只標主利益、目標、結算線與每頁唯一主要按鈕；橘色 `--accent` 只標注意，`--destructive` 只標錯誤或異常。

`--border`、`--card-border`、`--sidebar-border` 與後台 `--input` 是低彩度結構線，不得單獨承載可互動、focus 或狀態語意。後台 `--input` 對 `--card` 為 `2.3830:1`、對 `--secondary` 為 `1.9344:1`，因此可操作欄位在 default 狀態還必須具備永久可見 Label、獨立表面與控制幾何；若邊界是辨認控制的必要 cue，另以既有高對比 `--muted-foreground` 補底線／必要輪廓，不新增 token。focus 一律使用 `--ring`／`--sidebar-ring`；錯誤、待確認與鎖定再加具名文字、符號與狀態面。

### Export 邊界

`@google/design.md@0.3.0 export --format css-tailwind` 只會輸出單一普通 `@theme`、將 HSL 正規化成 hex，且不能表達 repo 的 `@theme inline`＋`hsl(var(--semantic-token))` 雙層引用或 page-scope selector。因此 G2 分別機械輸出客人端 Light 與後台 Night 兩份 theme CSS 作 G4 比對輸入；兩份都不是可直接覆蓋 `index.css` 的 patch。Front matter 的 `components` 包含 token 使用／對比探針，用來消除孤兒引用並實測關鍵文字 pair；exporter 不會把這些探針輸出成 production token。

## Typography

主要字型沿用 `--app-font-sans`：`"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`。中文標題、正文與所有數字都使用此角色；數字另加 `tabular-nums lining-nums`。`--app-font-mono` 只用於 Latin 技術標註（kicker／表頭／單位／代碼），遇中文字符必須回退至 `--app-font-sans`。不複製 Stripe 的字型、品牌識別或商標；其結構參考只限金融數據對齊與密集資料區的精準留白。

### 等寬數字實作契約

所有金額、百分比、件數、差額、匯率、KPI 數字、圖表座標／Tooltip，以及表格數字欄都必須實際套用 OpenType `tnum`；只在說明文件寫「使用等寬數字」不算完成。共用實作如下：

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

Tailwind 元件可使用既有 `tabular-nums` utility；共用 `NumericValue`、KPI、金額輸入顯示層、表格 numeric cell 與 Recharts tick／label／tooltip 必須統一套用，不得各頁自行決定。`font-feature-settings` 是明確的相容宣告，不得拿它取代正常字型 fallback。一般段落與非數字標籤不必套用；訂單碼、查詢碼等 Latin 識別字串可另用既有 mono stack，但不得因 mono 而改變金額格式，也不得把 `NumericValue` 改成 mono 字體。

### 幣別與數字格式

| 資料                 | 小數位 | 正式顯示        | 規則                                                                                                                   |
| -------------------- | -----: | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| JPY 原幣             |      0 | `JPY 63,943`    | 日圓畫面值不顯示小數；雙幣別、表格、對帳與匯出預覽一律用 `JPY` 明示幣別。                                              |
| TWD 換算／成本／毛利 |      2 | `NT$ 13,108.32` | 本批成本利潤畫面固定兩位小數；裸 `$` 禁止。只有後端明確定義為整數結算欄位時才可顯示 0 位，前端不得自行四捨五入成整數。 |
| 百分比               |      2 | `43.31%`        | 毛利率、差異百分比與達標百分比固定兩位；真正的數值 0 顯示 `0.00%`，缺值則顯示「待確認」。                              |

- 數字部分使用 `zh-TW` 千分位，每三位以逗號分隔；幣別前綴與數字之間使用不換行空白，避免符號與金額斷行。
- `NT$` 用於畫面上的新台幣金額；`TWD` 用於幣別選項、欄位 schema 名稱或技術說明。`JPY` 用於原幣、雙幣別並列、表格與對帳。`¥` 只可用在單一日圓情境、且欄頭或鄰近標籤已明寫 JPY 的客人端窄版；同一區塊不得混用 `JPY` 與 `¥`。
- 當兩種幣別同時出現，必須成對標記為「原幣 JPY 63,943」與「換算 NT$ 13,108.32」，不得只靠上下位置推測幣別。
- 負數使用真正的負號置於幣別前，例如 `−JPY 1,200`、`−NT$ 245.50`；同一畫面不得混用括號負數與前置負號。螢幕閱讀器名稱須包含「負」。
- 顯示層可依上述位數做四捨五入，但計算、比較與提交仍使用後端／domain 原始精度，禁止把格式化字串或顯示後數值寫回計算。
- 真正的零值可顯示 `JPY 0`、`NT$ 0.00`、`0.00%`；`null`、缺匯率或缺輸入在 numeric cell 直接顯示右對齊的「待確認」，不加幣別、不補小數、不單獨顯示破折號。輸入欄保持空值並在欄位下方顯示「尚未填寫〈欄位〉」，不得用 placeholder `0` 冒充資料。

### 字級與必要文案

- 貨幣符號與金額不得任意斷行；精確值不得因手機寬度而省略、截斷或縮成不可讀尺寸。
- H1：桌機 32px／1.25，手機 28px／1.25；H2：24px／1.3；H3：18px／1.4；正文：16px／1.5；輔助文字最小 12px／1.5。
- 主角 KPI 數字使用 `clamp(2rem, 7vw, 3rem)`；次級 KPI 不小於 20px。
- 「有利」「不利」「待確認」「虧損」「已達標」「未達標」「持平」必須明寫。
- 缺值正式文案採「尚未填寫〈欄位名稱〉」或「待確認」，不得顯示 `0`、`0%`、空白進度條或零長條。

### 原型註解不等於產品文案

「缺少預估值，不補 0 或空白子彈圖」是寫給審閱者的設計註解，禁止進入正式 UI。產品文案應寫成可行動、可定位的句子，例如「尚未填寫預估燃油金額」；若可修正，動作使用「補填預估」或「前往成本設定」。設計理由只留在規格或開發註解中。

## Layout

桌機與手機同等重要。平台是純瀏覽器 Web，不代表只做桌機。現況十二頁中有十一頁沒有任何 page-level breakpoint；本規格因此以 base 手機樣式為起點，再逐級增強。手機只改排列、揭露方式與明確定義的窄螢幕替代，不改四層順序、KPI 分組、資料語意或精確值。任何頁面、圖表、索引列、表格、drawer 或其他容器都不得產生橫向捲動。

### Spacing：4px primitive 與 semantic role

Spacing front matter 是兩層結構：`primitive` 只表達 4px 錨點級距，`semantic` 才表達用途。基準是 phase23 `index.css` 的 `--spacing: 0.25rem` 與既有 Tailwind multiplier；它們是 G4 對既有 utility 的規格映射，不新增第二套 production CSS 變數，也不加入 108-token 命名矩陣。

#### Primitive 級距

| Token          |     rem |  px | 既有 Tailwind 對應 | 用途邊界                                        |
| -------------- | ------: | --: | ------------------ | ----------------------------------------------- |
| `primitive.0`  |       0 |   0 | `0`                | 明確無間距；不得用來代表缺資料。                |
| `primitive.1`  | 0.25rem |   4 | `1`                | 圖示與小標記的 micro rhythm。                   |
| `primitive.2`  |  0.5rem |   8 | `2`                | 最小相鄰 touch-target 間隔、緊密 stack。        |
| `primitive.3`  | 0.75rem |  12 | `3`                | 一般欄位垂直 padding、label/value 間隔。        |
| `primitive.4`  |    1rem |  16 | `4`                | 手機 gutter、一般 grid gap、手機 card padding。 |
| `primitive.5`  | 1.25rem |  20 | `5`                | 平板 card padding。                             |
| `primitive.6`  |  1.5rem |  24 | `6`                | KPI 群組間距、平板 gutter、桌機 card padding。  |
| `primitive.8`  |    2rem |  32 | `8`                | 手機 section rhythm、桌機 gutter。              |
| `primitive.10` |  2.5rem |  40 | `10`               | 平板 section rhythm。                           |
| `primitive.11` | 2.75rem |  44 | `11`               | 最小 touch target／可編輯列高度。               |
| `primitive.12` |    3rem |  48 | `12`               | 一般桌機表格列與桌機 section rhythm。           |
| `primitive.16` |    4rem |  64 | `16`               | 含 Bullet Chart 的成本對帳列最低高度。          |

#### Semantic 用途

| Role         | Token 與值                                                                                            | 使用契約                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| inset        | `compact` 8px；`control-y` 8px；`control-x` 12px；`comfortable` 16px                                  | 元件內距。padding 只是內容留白；按鈕、checkbox hit area、表格列內編輯器的最終高度仍不得低於 44px。                                       |
| stack        | `micro` 4px；`related` 8px；`default` 12px；`relaxed` 16px；`kpi-group` 24px                          | 垂直堆疊。label/help 用 4–8px；一般欄位 12px；卡內區塊 16px；13 KPI 的四組彼此固定 24px。                                                |
| gap          | `touch-target` 8px；`inline` 12px；`grid` 16px；`major` 24px                                          | 並列間隔。相鄰可點控制至少 8px；一般 KPI／表單 grid 16px；跨群組或主次動作 24px。                                                        |
| card-padding | phone 16px；tablet 20px；desktop 24px                                                                 | KPI、圖表、空狀態與摘要卡共用；卡片內部不得另猜 18px、22px 等孤立值。                                                                    |
| table-row    | `min-height` 44px；`default-height` 48px；`cost-bullet-min-height` 64px；`cell-y` 12px；`cell-x` 16px | 一般 numeric row 至少 48px；緊密可編輯 row 絕不低於 44px；成本對帳列含兩筆金額與 Bullet Chart 時至少 64px，row 內項目以 8px stack 分隔。 |

#### 響應式 semantic 值

| Breakpoint role | phone `<640px` | tablet `640–1023px` | desktop `≥1024px` | 依據                                                                                      |
| --------------- | -------------: | ------------------: | ----------------: | ----------------------------------------------------------------------------------------- |
| `section-y`     |           32px |                40px |              48px | Pika 是高資訊密度工作台，採逐級增加但不照搬行銷頁的 40／64／96；四層 Dashboard 以此分段。 |
| `page-gutter`   |           16px |                24px |              32px | 完全對齊本檔既有 base／sm／lg 頁邊距契約。                                                |
| `card-padding`  |           16px |                20px |              24px | 對齊既有 Tailwind 4／5／6 級距，在密度與 touch 安全間取平衡。                             |

13 KPI 的視覺層級固定為：同一卡 label/value 使用 `stack.related` 8px；同組卡片用 `gap.grid` 16px；「2 主角／4 收入／3 成本／4 效率」四組之間用 `stack.kpi-group` 24px；Dashboard 四大層之間才使用 responsive `section-y`。不得把四種間距壓成同一個 `gap-4`。

成本對帳表格固定為：desktop cell 使用 12px vertical／16px horizontal padding，一般列 min-height 48px；含 Bullet Chart 的 row min-height 64px。手機降級成卡列後使用 16px card padding、8px 內部 stack，操作 target 仍至少 44×44px且彼此至少 8px，不得為塞進一列而縮小 hit area。

### Breakpoints

| 名稱        | 範圍          | 版面契約                                                                               |
| ----------- | ------------- | -------------------------------------------------------------------------------------- |
| base／phone | `< 640px`     | 單欄、16px 頁邊距、底部主要動作避開 safe area、所有 touch target 至少 44×44px。        |
| `sm`        | `640–767px`   | 24px 頁邊距；非主角 KPI 可兩欄，但不得壓縮金額；表單仍以單欄為主。                     |
| `md`        | `768–1023px`  | 主角 KPI 兩欄；群組 KPI 兩欄；表單可 2 欄；表格在內容允許時恢復欄模式。                |
| `lg`        | `1024–1279px` | 桌機側欄、32px 內容邊距；收入 4 欄、成本 3 欄、效率 4 欄；A 全寬，B–D 三欄，E–H 兩欄。 |
| `xl`        | `1280–1535px` | 最大內容寬 1440px；維持 `lg` 資訊架構並放寬圖表與明細。                                |
| `2xl`       | `≥ 1536px`    | 只增加外側留白與 plot width，不增加 KPI 欄數，不把資訊稀釋成海報版。                   |

禁止任何層級的水平捲動；`overflow-x: auto|scroll`、以超寬 `min-width` 製造局部橫拉，以及把必要資訊藏在橫向 carousel 都不合格。過寬內容必須改用重排、直向圖型、單軸摘要、文字結論或一列一卡，不得只保證頁面根容器沒有溢出。

### Dashboard：13 KPI 的跨斷點排列

13 項依固定分組呈現：

- 2 主角：最終營業利益、達標狀態。
- 4 收入與毛利：銷售總額、調整後收入、營業毛利、毛利率。
- 3 成本：商品進貨成本、固定成本、變動成本。
- 4 效率與基準：薪資目標、商品總件數、平均單件毛利、平均每日毛利。

| Breakpoint | 具體排列                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| base       | 待處理置頂；兩個主角各佔全寬且永久展開。收入群預設展開，四項單欄依凍結順序排列；成本群與效率群是彼此獨立 disclosure，預設收合但可同時展開，展開後單欄。收合標題只顯示群組名、項目數與展開狀態，不自行創造彙總值。 |
| `sm`       | 兩個主角仍各佔全寬；展開群組內的非主角 KPI 兩欄。數字放不下時回退單欄，不縮小至 20px 以下。                                                                                                                       |
| `md`       | 兩個主角並列 2 欄；收入、成本、效率各自 2 欄，全部預設展開。                                                                                                                                                      |
| `lg+`      | 兩主角 2 欄；收入 4 欄；成本 3 欄；效率 4 欄。禁止把十三張卡做成無分組的 13 等分牆。                                                                                                                              |

待處理事項有內容時預設展開；沒有事項時仍保留第一層，縮成一列完整空狀態，不得消失。首屏 KPI 不得等待圖表載入或動效才出現。

達標能量條在任何寬度都保留百分比、目前金額、薪資目標、差額、目標刻度與後端 `outcome` 三態。手機先顯示結論與百分比，兩筆金額在下一行對齊，能量條再下一行全寬；不得只剩一條無數字的 progress。

### Dashboard：A–H 的跨斷點排列

- base／`sm`：一次只顯示一張圖。頂部使用 A→H 固定順序的 4×2 索引按鈕網格，預設 A；提供上一張／下一張與「第 n／8 張」文字，swipe 不是唯一導覽。索引與面板都必須在容器內完整換行，切換只改可見面板與其窄螢幕替代，不改資料語意。
- `md`：A 全寬；B–D 使用 2 欄流式網格；E–H 仍可使用單面板索引，避免平板同時出現四個不可讀 plot。
- `lg+`：A 全寬；B–D 三欄；E–F 兩欄；G–H 兩欄。明細表維持最後一層。

| 圖  | 手機 plot 尺寸與降級                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | 改為直向浮動瀑布：九階由上往下，名稱置左、累積金額置右、浮動增減段置中；每站標值常駐。仍保留浮動起點、逐段累積與小計／總計本質，只改方向。            |
| B   | 每個類別一列，列內以共用零基線呈現預估／實際雙條；完整文字與精確值換行，不設定畫布最小寬。                                                            |
| C   | 高 240px；兩條並列堆疊橫條在手機仍完整顯示，所有區段按容器百分比縮放。                                                                                |
| D   | 高度 `max(320px, 項目數 × 44px + 96px)`；零軸固定可見，圖內不得垂直捲動。                                                                             |
| E   | 高度 `max(288px, 路線數 × 44px + 80px)`；長路線名最多兩行，條尾精確金額常駐。                                                                         |
| F   | base／`sm` 不縮小氣泡散點：改成地區一列一卡，依平均貢獻毛利單軸排序，並列出件數、平均貢獻毛利與收入三個精確值；`md+` 才顯示完整 X／Y／size 氣泡散點。 |
| G   | base／`sm` 顯示「達標所需件數／平均售價」文字結論與情境表；`md` 仍用表格，`lg+` 才顯示完整 hexbin、五刻度金額色階圖例與薪資目標等高線。               |
| H   | base／`sm` 改為月份直向列表／單軸趨勢摘要，每期顯示精確值與方向；`md+` 才顯示完整點陣趨勢。                                                           |

F／G／H 的手機替代是同一資料的可讀降級，不是另造資料或更換桌機 canonical 圖型。所有替代仍保留 E–H 完整示意角標、精確值、資料來源與明細入口。

### 表格與 Bullet Chart 的窄螢幕降級

- `< md` 時，每個成本對帳 row 轉為垂直卡列：項目／類別與狀態 → 預估、實際兩筆精確金額 → 全寬 Bullet Chart → 差額與有利／不利／待確認 → 操作。來源順序與桌機表格一致，不隱藏欄位。
- Bullet Chart 的預估是細刻度、實際是填色；手機不得以兩條普通 progress 取代。缺預估時不畫刻度或零值，顯示「尚未填寫預估〈項目〉金額」；缺實際時顯示「尚無實際〈項目〉金額」。
- `md+` 可恢復語意表格；項目欄可 sticky，金額右對齊。欄位放不下時，次要欄位移入同列的 details 區或維持卡列，禁止設定超出容器的 `min-width`，也禁止 table wrapper 橫滑。
- 手機明細表預設收合但保留標題、筆數與展開按鈕；展開後一列一卡，所有欄位在卡內垂直排列。

### Trips 路線與大區成本編輯器

- base：行程摘要、待確認事項、大區清單、路線清單依序單欄。大區與路線次級明細可用 `Collapsible`，但缺燃油、ETC 手填規則與儲存錯誤不得收起。
- 手機新增／編輯使用 bottom `Drawer` 或全高 `Sheet`；欄位單欄、底部 sticky 儲存列、44px 控制。桌機可用 `Dialog` 或右側 `Sheet`，表單 2 欄。
- 路線必須保留 `tripAreaId`、大區名、起終點、預估件數、train/fuel/parking/ETC 四項交通費。`fuelJpy = null` 是待確認，與真正的 `0` 不同；ETC 無費用時仍由使用者手填 0，不得自動估算。
- 大區保留 `ESTIMATE | ACTUAL`、紙箱單價、運費單價、包裹數及 nullable 預估件數；每個大區可分別新增／編輯預估與實際成本。

### TripComparison

- base：先顯示結論摘要，再以逐項 comparison card 呈現 `estimatedTwd`、`actualTwd`、`difference`、`percent`、`direction` 與 `state`；不得遺漏 API 已有的 `percent`。
- `md+` 使用 `Table`；有利／不利／持平以文字、方向與數字共同呈現。只有實際顯示「預算外」，只有預估顯示「未發生」，兩側皆有才計差異。

### PublicCart 與 TrackOrder 手機優先

- PublicCart base 為單欄：商品列 → 取貨方式 → 收件／門市／地址欄位 → 訂單摘要；底部 sticky CTA 同步顯示總額並避開 safe area。數量步進與刪除皆至少 44×44px。
- PublicCart `lg+` 才改為「商品與表單／訂單摘要」雙欄；摘要可 sticky，但不得遮住錯誤或表單欄位。七種取貨方式依所有商品的物流旗標過濾，不新增不存在的方式。
- TrackOrder base 先顯示訂單識別、目前狀態與下一步，再顯示配送時間軸、商品與金額、取貨／配送資訊；關鍵狀態與追蹤碼不可藏在 hover、橫滑或桌機側欄。
- TrackOrder `md+` 才允許摘要與時間軸雙欄；時間軸在手機保持垂直，不縮成橫向步驟條。
- 客人端文案使用直接、友善、少術語的句子；同一待確認／錯誤語意仍使用共用 token 與元件。

TrackOrder 的手機閱讀順序固定為：店鋪與物流查詢標題 → 大型物流狀態 → 取消提示或垂直訂單 timeline → 商品與總額 → 訂單／取貨／時間 → 物流資訊 → public-safe 的 masked 收件摘要 → 條件式付款末五碼 → 分開標示的物流追蹤碼與訂單查詢碼 copy actions。Public tracking 不公開超商門市名稱或地址。付款末五碼只在 `pending`／`awaiting_payment` 顯示，並明寫「僅供人工對帳」。

TrackOrder 必備狀態包括 loading、404、一般 error、cancelled、delivered、picked-up、arrived-store、in-transit、等待物流更新、exception／returned、無物流資料、自取／面交、付款儲存／成功／可行動錯誤，以及兩種代碼各自的 copy feedback。320px 下 label 在上、value 在下；地址與代碼可安全換行但不得截斷。

### 十二頁 page-level responsive 契約

原始碼核實：Dashboard、Trips、TripEstimate、TripActual、TripComparison、MonthlyProfit、PublicCart、TrackLookup、TrackOrder、Cvs711Select、Cvs711Return 的 responsive token 數均為 0；PublicOrder 僅有 10 個 `sm:` token，全部只處理五行取貨卡。`max-w-[480px] mx-auto` 不是桌機響應式方案。

| 頁面           | base／phone                                                          | `md`                                             | `lg+`                                                 |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Dashboard      | 四層單欄；2 主角常駐、其餘分組揭露；A–H 單面板                       | 主角 2 欄、群組 2 欄；A 全寬                     | Sidebar；2＋4＋3＋4 KPI；A／B–D／E–F／G–H 固定網格    |
| Trips          | 行程→大區→路線 progressive disclosure；Drawer 編輯                   | master-detail；安全欄位 2 欄                     | 左導航／右成本 editor；三個成本入口常駐               |
| TripEstimate   | 成本項目先名稱再金額／幣別；UNIT／DAILY 直排                         | 成本列恢復三欄，projection 並列                  | 輸入約 8 欄、摘要約 4 欄；pending reason 留在欄位旁   |
| TripActual     | 類別→名稱→金額／幣別→日期→照片→提交；照片不溢出                      | 表單與已記錄費用分區，安全欄位 2 欄              | 表單／照片約 5 欄，費用清單約 7 欄                    |
| TripComparison | 每項 comparison card 顯示預估、實際、差額、percent、direction、state | 切回完整 Table，項目 sticky、金額右對齊          | 表格與比較圖可主從配置，表格仍是真相來源              |
| MonthlyProfit  | 月份滿寬；定格毛利跨滿，其他指標 2 欄                                | 月份移入 header，四指標 2×2 或同列               | 內容約 960px，不把少量數字拉散                        |
| PublicCart     | 商品→取貨→收件／門市／地址→摘要→sticky CTA                           | 內容 2 欄，DOM 仍先商品後結帳                    | 左商品／右表單與 sticky 摘要；empty／success 保持窄版 |
| PublicOrder    | 商品、表單、取貨、金額、CTA 單欄；沿用既有取貨卡 `sm` reflow         | 商品約 5 欄、訂購表單約 7 欄                     | 摘要可 sticky；選中取貨 detail 留在表單欄             |
| TrackLookup    | 320–420px 單一查詢表單，input／CTA 48px                              | 只增加外圍留白                                   | 不新增欄位或裝飾面板                                  |
| TrackOrder     | 狀態優先、垂直 timeline、完整 public-safe 明細                       | 左狀態／timeline／商品，右訂單／物流／收件／代碼 | 只增加留白；禁止 Owner Sidebar／BottomNav             |
| Cvs711Select   | sticky 搜尋、單欄結果；搜尋與選擇按鈕 ≥44px                          | 結果可 2 欄，搜尋／錯誤／筆數跨滿                | 最大內容約 900px，不改 provider 或返回路徑            |
| Cvs711Return   | 單一 processing／error transient state；CTA 滿寬 44px                | 限制內容寬度                                     | 不新增導航或多欄                                      |

所有頁面只 reflow 同一棵 DOM，不為不同 breakpoint 同時 render 兩份 live form。sticky CTA 使用 `env(safe-area-inset-bottom)`，虛擬鍵盤開啟時回到文流，且不得遮住最後欄位或 inline error。G4 最低驗收寬度為 320、360、390、430、640、768、1024、1280、1440px。

## Elevation & Depth

層級以背景表面、1px 細邊界、分組標題與留白建立。主卡高於頁面背景一階，浮層高於主卡一階；沿用既有 `--shadow-*`，不新增 shadow token，不使用玻璃擬態、發光或厚重投影。

- Level 0：頁面背景與表格內列，無陰影。
- Level 1：KPI、圖表、空狀態卡，使用細邊界；只有需要與背景分離時使用 `--shadow-xs`。
- Level 2：sticky 摘要、Sheet、Popover，最多 `--shadow-md`。
- Level 3：Dialog，最多 `--shadow-lg`；不得用陰影代替 modal overlay 與 focus trap。
- Focus 使用 `--ring`；錯誤、待確認與示意資料使用語意邊界與文字，不靠陰影表示。

### z-index 與 portal 層級

以下是由低到高的唯一層級尺度；G4 應集中成共用 layer class map，禁止各元件散落 `z-[9999]`。數值是層級契約，不新增 CSS variable，因此 108-token 矩陣不變。

| 層級                 |    z-index | 元件指派                                      | 規則                                                                                      |
| -------------------- | ---------: | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| base                 |          0 | page、Card、Table、圖表與一般內容             | 不建立不必要 stacking context；transform／opacity 不得意外蓋住浮層。                      |
| sticky               |         10 | sticky page header、表格欄頭、手機 sticky CTA | 只在所屬 scroll container 內生效；不得越過 modal。                                        |
| sidebar              |         20 | desktop Sidebar、固定 owner navigation        | 手機 Sidebar 透過 Sheet 開啟時改用 sheet/drawer band，不停留在 20。                       |
| dropdown             |         30 | DropdownMenu、ContextMenu、Command menu       | 主要動作不得只存在此層；開 modal 前關閉下層 menu。                                        |
| popover              |         40 | Popover、HoverCard、日期／篩選補充面板        | 必要資訊仍須有手機可點擊替代。                                                            |
| tooltip              |         50 | Tooltip                                       | 只補充，不承載唯一的精確值、錯誤或待確認原因。                                            |
| sheet/drawer overlay |         60 | SheetOverlay、DrawerOverlay                   | overlay 必須攔截背景 pointer 並配合 focus trap。                                          |
| sheet/drawer content |         61 | SheetContent、DrawerContent                   | 位於自身 overlay 之上；內部 sticky 使用該 modal root 的局部層級。                         |
| dialog overlay       |         70 | DialogOverlay、AlertDialogOverlay             | 高於 Sheet／Drawer；同一時間只允許一個 top modal。                                        |
| dialog content       |         71 | DialogContent、AlertDialogContent             | 不靠 shadow 取代 overlay、focus trap 或 inert 背景。                                      |
| modal floating       | 80／81／82 | active modal 內的 dropdown／popover／tooltip  | 由 active modal portal root 掛載，依序使用 80／81／82；不得讓背景頁殘留 menu 穿過 modal。 |
| toast                |         90 | Sonner、Toast、Toaster                        | 可高於 modal 顯示結果，但核心錯誤與必要操作仍保留在頁內／modal 內。                       |

任何新 portal 元件必須先歸入此表。開啟 Sheet、Drawer 或 Dialog 時，背景的 dropdown／popover／tooltip 必須關閉；由 modal 觸發的浮層則掛在 active modal portal root，避免被 overlay 截斷。不得以 DOM 順序碰運氣。

## Shapes

派生的 `--radius-sm/md/lg/xl` 名稱與 `--radius: 0.375rem` primitive 保持不變。客人端 Light 的一般控制可沿用既有 control radius；後台 Night 的總帳、KPI、圖表、資料面與雙幣校準台使用 `0` radius，以共同基線與色面建立層級。狀態 badge 一律採點號＋具名文字＋一像素直角框，不得使用膠囊。膠囊只保留給每頁唯一主要按鈕；同頁其他按鈕以幽靈樣式為主。

hexbin 六角只屬圖 G 的資料分箱，不得作為跨頁裝飾，不得用蜂窩造型取代 A、F 或其他圖表的資料編碼。圖表標記的形狀要服務分組、狀態與可辨識度，不模仿品牌圖案。

## Components

既有 `components/ui/` 正好有 55 個 `.tsx`。處置原則是 **49 沿用、6 擴充、0 重建 primitive**；新建只限業務 composite，且必須組合既有 primitive。G3 在同一 Drafts 檔建立 local components，元件清單必須涵蓋本節全部 primitive 處置與業務 composite；不得因 Starter 不能發布 Team Library 而省略元件。四個原型來源頁目前多為 raw HTML controls，G4 應逐步收斂到以下 inventory，不得另外建立平行 UI kit。

|   # | 既有元件              | 處置             | 本批規格                                                                                                               |
| --: | --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
|   1 | `accordion.tsx`       | 沿用             | 手機行程／大區可折疊；主要數字不得因折疊消失。                                                                         |
|   2 | `alert.tsx`           | **擴充**         | 由 default/destructive 增加 info/warning/success/pending；圖示＋文字並用。                                             |
|   3 | `alert-dialog.tsx`    | 沿用             | 只用於不可回復確認，不為一般編輯增加阻力。                                                                             |
|   4 | `aspect-ratio.tsx`    | 沿用             | 商品圖與媒體維持比例；缺圖仍提供替代內容。                                                                             |
|   5 | `avatar.tsx`          | 沿用（本批不採） | 凍結資料無頭像時不得捏造照片。                                                                                         |
|   6 | `badge.tsx`           | **擴充**         | 增 estimate/actual/pending/favorable/unfavorable/neutral 語意；預設為點號＋具名文字＋直角框，禁止膠囊 badge。          |
|   7 | `breadcrumb.tsx`      | 沿用             | 桌機顯示層級；手機改簡潔返回，不塞完整 breadcrumb。                                                                    |
|   8 | `button.tsx`          | **擴充**         | 增 44px／48px touch size；幽靈為多數，每頁只准一個膠囊主要按鈕，danger surface 只供刪除類。                            |
|   9 | `button-group.tsx`    | 沿用             | 購物車數量步進與相鄰動作；不取代 Tabs。                                                                                |
|  10 | `calendar.tsx`        | 沿用（本批不採） | 無凍結日期欄時不得憑空新增。                                                                                           |
|  11 | `card.tsx`            | 沿用             | KPI、行程、大區、購物車與摘要共用結構；後台資料面為直角色帶／網格，客人端才沿用 control radius。                       |
|  12 | `carousel.tsx`        | 沿用（本批不採） | 儀表板 KPI／圖表不得藏進 carousel。                                                                                    |
|  13 | `chart.tsx`           | **擴充**         | 補可變高度、文字摘要、空／待確認狀態與 A–H composite，不重建 wrapper。                                                 |
|  14 | `checkbox.tsx`        | 沿用（本批不採） | 凍結欄位無多選，不增加假需求。                                                                                         |
|  15 | `collapsible.tsx`     | 沿用             | 手機次級明細；必填與待確認訊息不得預設隱藏。                                                                           |
|  16 | `command.tsx`         | 沿用（本批不採） | 無凍結全域搜尋需求，不新增假入口。                                                                                     |
|  17 | `context-menu.tsx`    | 沿用（本批不採） | 核心編輯／結帳動作不得只藏在右鍵。                                                                                     |
|  18 | `dialog.tsx`          | 沿用             | 桌機複雜表單可用；手機優先 Sheet／Drawer。                                                                             |
|  19 | `drawer.tsx`          | 沿用             | 手機行程、大區、路線編輯使用底部 drawer。                                                                              |
|  20 | `dropdown-menu.tsx`   | 沿用             | 只收納次要／溢出動作，主要 CTA 常駐。                                                                                  |
|  21 | `empty.tsx`           | 沿用             | Slot 已完整；所有空態直接組合，不另建 primitive。                                                                      |
|  22 | `field.tsx`           | 沿用             | Trips／PublicCart 表單首選；承接 description、error 與方向。                                                           |
|  23 | `form.tsx`            | 沿用             | G4 若遷移 react-hook-form 才使用，原型不改資料行為。                                                                   |
|  24 | `hover-card.tsx`      | 沿用（本批次要） | 可補充公式；必要資訊仍須可點擊及手機可見。                                                                             |
|  25 | `input.tsx`           | **擴充**         | 增 44／48px touch size、invalid/pending、具名錯誤、停用霧面與 44px 可清除尾鍵；後台方框為直角，保留 number/inputMode。 |
|  26 | `input-group.tsx`     | 沿用             | 金額、幣別、件／箱等單位與前後綴。                                                                                     |
|  27 | `input-otp.tsx`       | 沿用（本批不採） | 付款末五碼是單一選填對帳欄，不拆成 OTP。                                                                               |
|  28 | `item.tsx`            | 沿用             | 購物車列、最近訂單、低庫存、路線列共用 family。                                                                        |
|  29 | `kbd.tsx`             | 沿用（本批次要） | 只用桌機快捷提示，不影響手機流程。                                                                                     |
|  30 | `label.tsx`           | 沿用             | 輸入皆有可關聯 Label，必填不只靠顏色。                                                                                 |
|  31 | `menubar.tsx`         | 沿用（本批不採） | Owner 導覽採 Sidebar，不建平行 menubar。                                                                               |
|  32 | `navigation-menu.tsx` | 沿用（本批不採） | PublicCart 無凍結多層網站導覽。                                                                                        |
|  33 | `pagination.tsx`      | 沿用（本批不採） | 五原型無分頁契約，不虛構頁碼。                                                                                         |
|  34 | `popover.tsx`         | 沿用             | 桌機篩選／補充資訊；手機要有可點擊替代。                                                                               |
|  35 | `progress.tsx`        | 沿用             | 只作 GoalEnergyBar 填色 substrate；里程碑、三態帶、目標線與超標處理都是能量條細節，不另建 progress 元件。              |
|  36 | `radio-group.tsx`     | 沿用             | PublicCart 取貨方式使用可鍵盤操作的 card-radio。                                                                       |
|  37 | `resizable.tsx`       | 沿用（本批不採） | 無可調面板需求，寬度由 responsive grid 決定。                                                                          |
|  38 | `scroll-area.tsx`     | 沿用             | 側欄與長清單可用；主頁避免多層隱藏捲動。                                                                               |
|  39 | `select.tsx`          | **擴充**         | 增 touch size，承接大區、模式、縣市與行政區。                                                                          |
|  40 | `separator.tsx`       | 沿用             | 成本分段、訂單摘要與清單分隔。                                                                                         |
|  41 | `sheet.tsx`           | 沿用             | 手機編輯器與 Sidebar mobile，不另刻 overlay panel。                                                                    |
|  42 | `sidebar.tsx`         | 沿用             | 已含 desktop/mobile/collapsed/Sheet；新建 shell，不重建 primitive。                                                    |
|  43 | `skeleton.tsx`        | 沿用             | Primitive 足夠；另組合各頁真實幾何，對應 J2，並提供超時／錯誤兜底。                                                    |
|  44 | `slider.tsx`          | 沿用（本批不採） | 金額、匯率、件數需精確輸入，不以 slider 取代。                                                                         |
|  45 | `sonner.tsx`          | 沿用             | 輕量成功／失敗回饋；不取代頁內持續錯誤。                                                                               |
|  46 | `spinner.tsx`         | 沿用             | 按鈕／局部短載入；頁級使用 Skeleton，中文 aria-label。                                                                 |
|  47 | `switch.tsx`          | 沿用（本批不採） | 五原型無布林設定，不增加假開關。                                                                                       |
|  48 | `table.tsx`           | 沿用             | Comparison 與明細；主角為單線列＋分組標題，超過 10 列才可斑馬紋；sticky 欄與數字對齊在 composite 層。                  |
|  49 | `tabs.tsx`            | 沿用             | 預估／實際內容分頁，文字標籤常駐。                                                                                     |
|  50 | `textarea.tsx`        | 沿用             | 行程／結帳備註，維持 optional 標示。                                                                                   |
|  51 | `toast.tsx`           | 沿用             | 保留 Radix 相容層；核心待確認／錯誤不可只用短暫 toast。                                                                |
|  52 | `toaster.tsx`         | 沿用             | 沿用 `useToast`，不得建立第三套通知。                                                                                  |
|  53 | `toggle.tsx`          | 沿用（本批次要） | 只作非互斥小型視圖控制，預估／實際優先 Tabs。                                                                          |
|  54 | `toggle-group.tsx`    | 沿用（本批次要） | 圖層／篩選可用；預估／實際不可只靠按下色。                                                                             |
|  55 | `tooltip.tsx`         | 沿用             | 補充縮寫／公式；精確金額與待確認原因不可 hover-only。                                                                  |

### 互動元件完整狀態矩陣

下列狀態適用於 Button、Input、Select、Checkbox 與表格列內編輯。狀態可組合，例如 `focus-visible + error`、`disabled + estimateLocked`；組合時不得移除可見 focus 或把缺值補成 0。

| 狀態          | Button                                                                                               | Input                                                                                     | Select                                                                                   | Checkbox                                                                 | 表格列內編輯                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| default       | 正常前景／背景與明確動詞；44px 或 48px hit area。                                                    | `--input` 邊界、正常文字；placeholder 不得假裝資料。                                      | Trigger 顯示目前值或「請選擇」，保留展開圖示。                                           | 未選／已選皆有可見框與文字 Label。                                       | 顯示真實值與編輯入口；numeric cell 右對齊。                                                           |
| hover         | 只在可 hover 裝置使用既有 elevate overlay；不可是唯一狀態 cue。                                      | 邊界加強但不冒充 focus。                                                                  | Trigger 表面加強，選項 hover 不取代 selected indicator。                                 | 框與 label 同步回饋。                                                    | row 可用 `--elevate-1`，編輯按鈕保持可見名稱。                                                        |
| active        | 按下回饋使用既有 pressed overlay；不得改數字或位移布局。                                             | pointer down 不留下永久狀態。                                                             | Trigger／option 顯示 pressed，選定後回 default。                                         | 按下後 checked state 由實際值決定。                                      | 進入 edit mode 後顯示儲存／取消，不以 row hover 代替。                                                |
| focus-visible | 2px `--ring`＋2px offset，文字仍可讀。                                                               | 同上；error 同時存在時 ring 與錯誤訊息都保留。                                            | Trigger 與 option 各有鍵盤 focus。                                                       | focus ring 包住至少 44×44px hit area。                                   | focus 落在實際 editor／action，不只高亮整列。                                                         |
| **disabled**  | 使用原生 `disabled`；muted surface＋muted foreground＋正常可辨邊界，無 hover／active，顯示禁用原因。 | 保留已存在值，使用 disabled attribute、鎖定圖示／「預估已鎖定」說明；不得只降低 opacity。 | Radix `disabled`；保留選定值與鎖定原因，trigger 不展開。                                 | `disabled` 且保留 checked 真值；Label 顯示不可操作原因。                 | `estimateLocked` 時所有 editor 與儲存動作 disabled，row 顯示 Lock＋「預估已鎖定」，但金額仍清楚可讀。 |
| loading       | Spinner 與動詞同時保留，`aria-busy="true"`，暫時 disabled 防重送。                                   | 有上次值就保留並 busy；無值才用近似 skeleton，絕不顯示 0。                                | 保留目前選項並 busy；不可變更。                                                          | 由 field/group 顯示 busy 並暫停切換，不以 unchecked 冒充載入。           | 儲存中保留原值與「儲存中」；只有首次載入且無資料才用 skeleton。                                       |
| error         | 動作失敗後恢復可操作；錯誤放 inline Alert／field message，非 destructive 動作不得永久變紅。          | `aria-invalid="true"`、destructive 邊界與具體訊息；保留使用者輸入。                       | Trigger `aria-invalid`，錯誤訊息與可修正下一步常駐。                                     | group 顯示錯誤文字與 icon，不只紅框。                                    | row 內保留未送出值、欄位級錯誤及重試／取消；不得整列消失。                                            |
| read-only     | Button 沒有 read-only；若沒有動作，改用文字、Badge 或靜態值，不用 disabled button 假裝欄位。         | 使用 `readOnly`，可 focus、選取與複製，正常高對比並標「僅供查看」。                       | 無 native read-only；改渲染 field-shaped 靜態值＋「僅供查看」，不可套 disabled dimming。 | 改渲染 checked／unchecked indicator＋文字「僅供查看」，不保留互動 role。 | 顯示靜態 formatted value 與 read-only badge，不渲染 editor；與鎖定 disabled 分開。                    |

`disabled` 與「待確認」不得共用同一視覺：

| 比較   | disabled／鎖定                                                                       | 待確認／missing input                                                                       |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 語意   | 已有規則或權限使它現在不能改，例如 `estimateLocked`。                                | 必要資料不存在、尚未填寫或匯率缺失。                                                        |
| 值     | 保留並顯示現有真值；不能因 disabled 清成空白或 0。                                   | 沒有可顯示的 numeric value；必須寫「待確認」或「尚未填寫…」。                               |
| 操作   | control disabled；提供鎖定原因，若有權限才另給解鎖流程。                             | 原則上仍可編輯／前往補填；若同時被鎖定，兩個狀態與原因都要明寫。                            |
| 視覺   | muted surface／foreground、Lock、文字「預估已鎖定」；不得只靠 opacity。              | accent/pending 語意、提示 icon、補填 CTA；不使用 disabled cursor。                          |
| 可及性 | 原生 `disabled`；只有必須可 focus 解釋時才用 `aria-disabled="true"` 並實際攔截事件。 | 以 `aria-describedby` 關聯 pending reason；除非另有 validation error，不標 `aria-invalid`。 |

### 新建業務 composite

| Composite                                                                | 組合既有元件                                   | 為何 55 個裡沒有可直接使用者                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ResponsiveOwnerShell`                                                   | Sidebar、Sheet、Button、Tooltip                | Primitive 不含 Pika 路由、權限可見度、桌機側欄與手機導覽規則。                         |
| `KpiCard`／`KpiDeck`                                                     | Card、Badge、Tooltip、Skeleton                 | 需封裝 13 KPI 格式、待確認及 2＋4＋3＋4 分組。                                         |
| `GoalEnergyBar`                                                          | Progress、Badge、Tooltip                       | 既有 Progress 沒有百分比、兩筆金額、差額、目標刻度與後端三態。                         |
| `CostBulletRow`                                                          | Chart、Badge、Tooltip                          | 無既有 Bullet Chart；需預估刻度、實際填色、精確雙值與缺值正式文案。                    |
| `DualCurrencyCalibrationField`                                           | Field、InputGroup、Input、Badge、Button        | G10 雙幣校準台；JPY 原幣與 NT$ 換算共同約束、匯率鎖定狀態常駐，窄版上下排列。          |
| `SemanticStatePanel`                                                     | Empty、Skeleton、Alert、Sonner、Button         | 封裝 J1–J10 的互斥狀態契約；同一資料區同時只允許一種主狀態。                           |
| `LedgerLockStamp`                                                        | Badge、Button                                  | K09 總帳落印鎖定；只對真實 `estimateLocked` 狀態使用，落定後仍保留可讀文字與鎖定原因。 |
| `AnalyticsChartFrame` ＋ A–H                                             | Chart、Card、Empty、Skeleton、Alert            | `chart.tsx` 只是 wrapper，沒有八種資料關係 composite、文字摘要與資料標記契約。         |
| `TripAreaCostEditor`／`RouteCostEditor`                                  | Field、InputGroup、Select、Tabs、Alert、Button | 需封裝 nullable fuel、手填 ETC、ESTIMATE／ACTUAL、分攤與 fail-closed 契約。            |
| `VarianceComparisonTable`／`VarianceCell`                                | Table、Badge、Tooltip                          | 需整合 estimated／actual／difference／percent／direction／state。                      |
| `CartLineItem`／`QuantityStepper`／`PickupMethodCard`／`CheckoutSummary` | Item、ButtonGroup、RadioGroup、Card、Field     | Primitive 不含商品、物流、門市、運費、付款與收件資料契約。                             |
| 頁級 Skeleton compositions                                               | Skeleton、Card、Table                          | 頁級骨架必須反映各頁真實幾何，不能由 generic block 猜測。                              |

### `chart.tsx`、`empty.tsx`、`skeleton.tsx` 裁定

- `chart.tsx`：底層足夠、產品圖型不足。沿用 Recharts `ResponsiveContainer`、客人端 Light／後台 Night page-scope config、Tooltip、Legend；擴充可變高度、標題、a11y 文字摘要與 A–H composite，不另裝圖表庫或重寫 primitive。
- `empty.tsx`：已有 Media／Header／Title／Description／Content，足夠沿用；所有空態直接組合它，不另建 Empty primitive。
- `skeleton.tsx`：單一 pulse block 作為 primitive 足夠；新建 Dashboard、Trips、Comparison、Cart 等頁級 composition，尺寸貼近真實元件並避免 layout shift。

### 達標能量條與成本 Bullet Chart

- 達標能量條三態：已達標、未達標、虧損。每態同時顯示 outcome 文字、百分比、目前金額、薪資目標、差額與目標刻度；三態一律取後端 `outcome`，前端不得自行判斷。
- Bullet Chart 三態：有利、不利、待確認。預估為細刻度，實際為填色，兩筆精確金額常駐；有利／不利依後端或既有 variance domain 邏輯，不以「綠色＝好」猜測。
- 缺值不是 0。缺預估時不畫零刻度或空白子彈圖；缺實際時不畫零長度實際條。兩者都要顯示正式文案與下一步。

### A–H 圖表契約與反迎合

| 圖                 | 資料                                    | 固定圖型與適配理由                                                                                     | Owner 提過但不採用者與理由                                                                |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| A 損益瀑布         | 真實；九階從銷售到最終利益              | 真正的浮動瀑布：增減段從前站終點起算，小計／總計落零基線，每站標累積值；同時保留方向、順序與可驗算性。 | 不採點陣丘形，因會破壞浮動起點、接續終點與累積語意；不採蜂窩，因資料不是二維密度場。      |
| B 預估↔實際        | 真實；同類指標雙版本                    | 共用零基線的群組長條，適合同類兩值並列與跨類別量級比較。                                               | 不採能量條，因不是單一目標進度；不採堆疊，因預估與實際不是組成關係；不採蜂窩。            |
| C 成本結構         | 真實；進貨／固定／變動的雙版本組成      | 並列堆疊條保留 part-to-whole，也能比較兩版的組成變化與總長。                                           | 不採 waffle／蜂窩，三分類堆疊更省空間且邊界清楚；不採散點，因無連續 X／Y。                |
| D 差異貢獻         | 真實；各項有利／不利貢獻                | 以零為中心的發散長條；零軸是方向天然分界，可讀方向、量級與驅動項。                                     | 不採 progress／能量條，差異不朝單一目標累積；不採蜂窩；不得只用紅綠。                     |
| E 路線單件成本排行 | 示意；各路線單件交通成本                | 高到低水平排行長條；適合長路線名與單量值名次，條尾保留精確金額。                                       | 不採蜂窩，序位不是二維密度；不採散點，只有一個主量值。                                    |
| F 地區散點         | 示意；件數 X、平均貢獻毛利 Y、收入 size | 氣泡散點完整保留 X／Y／size 三個連續編碼，可看關聯與離群地區。                                         | 明確拒絕規則蜂窩／waffle，因會同時消滅三個維度；蜂窩偏好放到真正適合的 G。                |
| G 敏感度熱圖       | 示意；件數 × 每件毛利推演利益與薪資邊界 | 單一資料場的 hexbin 六角熱圖＋薪資目標等高線；鄰接格適合辨認可行、未達與虧損區。                       | 不分雙軌，情境推演沒有預估／實際二元性；不混作 waffle，六角是 X／Y 分箱而非固定金額單位。 |
| H 歷史趨勢         | 示意；各月營業利益                      | 圓點點陣趨勢；X 軸保留時間順序，高度／堆疊量表達數值並附每期精確值。                                   | 不採六角蜂窩，時間序列需一維先後；不採實心面積，避免大色塊壓過密集資訊。                  |

圖表只是摘要，KPI 與明細才是可核對真相。每張圖都有可由螢幕閱讀器讀取的文字摘要與對應明細入口；Tooltip 必須可由 tap 與鍵盤 focus 開啟，不得 hover-only。

### Empty／loading／error／待確認

| 狀態                   | 規格                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Initial loading        | 按四層順序保留版位；KPI、圖表與表格 skeleton 使用最終元件近似高度。Skeleton 不顯示可被誤認為真值的數字。     |
| Partial loading        | 只替換失敗或載入中的群組／面板；已成功區域持續可讀，首屏 KPI 不等待圖表。                                    |
| Empty                  | 使用既有 `empty.tsx`，保留區塊標題、原因、下一步與可選 CTA；不得留白。                                       |
| Pending／missing input | 這是待確認，不是 empty。顯示「尚未填寫〈欄位〉」或「待確認」，不得補 0。                                     |
| Error                  | 在失敗區塊內顯示圖示、中文原因、保留上次成功資料的說明及至少 44×44px 的重試按鈕；不得把錯誤當 0 或移除整層。 |
| Ready but empty        | 保留標題、資料範圍與 empty action；不得與 request error 混為一談。                                           |

E–H 即使 loading、empty 或 error，卡片標題區仍保留完整「⚠️ 示意圖・非真實資料」。動效尊重 `prefers-reduced-motion`；載入後不得造成 KPI 群組大幅 layout shift。

## 已知缺口與後續

本節是明確登記的未完成項，不得在 G2 終審或 G4 派工中宣稱已完備。

| 缺口              | G2 現況與不在本次補齊的理由                                                                                                                                                                                                             | 後續處理                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| opacity token     | 現有 108 個變數沒有獨立 opacity scale；本次 disabled 以 muted surface、文字、邊界、Lock 與狀態文案區分，避免靠不受控透明度。現在硬加會形成第二套 production token。                                                                     | 下一次正式 token revision 先盤點既有 `disabled:`／`opacity-*` 用量，再決定是否納入既有命名體系；未拍板前不得散造 opacity CSS variables。  |
| icon 規範         | 55 個 shadcn primitive 已含 icon slot，但尚未凍結 icon library、尺寸、stroke、對齊、方向性與 aria-label 契約；本次只要求狀態 icon 必須搭配文字。                                                                                        | G4 前另做 icon inventory；需定義 16／20／24px 使用場景、stroke consistency、decorative `aria-hidden` 與 meaningful icon accessible name。 |
| 完整 alias bridge | G2 已補 font fallback 與七個 derived border alias，但 exporter、客人端 Light／後台 Night page scope、`@theme inline`、`:root` semantic variables 與全部 108 token 的一對一機械 bridge 尚未建立。`DESIGN.md` 的 108 列矩陣仍是規格真相。 | G4 token migration 前產生完整 bridge／diff guard；在此之前匯出 CSS 只作比對輸入，不可整份覆蓋 `index.css`。                               |
| motion token      | G2 已定八種功能性動效、時間範圍、同畫面最多 3 種、K09 專用狀態轉換與 `prefers-reduced-motion` 紅線，但尚未新增 duration／easing production token 名稱。                                                                                 | G5 依 animation review 將既定範圍實作成共用 motion scale；未核准前不得散造平行 CSS variables，也不得加入 K10 候選。                       |

## Do's and Don'ts

### 六條顯示鐵律

1. 三態結論一律取後端 `outcome`，前端不得自行判斷。
2. 缺匯率／缺輸入顯示「待確認」，不得顯示 0。
3. 金額使用 tabular numbers，動效不得破壞對齊。
4. 預估／實際有清楚的文字與視覺區別；差異寫成有利／不利，不能只靠紅綠。
5. 空狀態必須設計，不得留白。
6. 桌機與手機同等重要。

### 假資料六項硬防護

1. 假資料只准放在 `artifacts/shop-app/src/mocks/`。
2. 只有 `<PreviewChart>` 可以 import `mocks/`；頁面不得直取。
3. `<PreviewChart>` 永久渲染「⚠️ 示意圖・非真實資料」，不得提供關閉 prop 或設定。
4. CI guard：除 `PreviewChart.tsx` 外任何檔案 import `mocks/` 即失敗。
5. 假值須一眼可辨為假，例如整數化、刻意極端；不得使用真實行程數字。
6. 上線前必須移除 `mocks/` 與 `<PreviewChart>` 且 CI 全綠，否則不得上線。

### Anti-AI-Slop：Do

- 有本規格就只使用本規格定義的顏色、字體、圓角、間距、元件與圖表 token；禁止臨場發明新顏色。資料視覺化只能使用本文件新增的 sequential／diverging／supporting chart token。
- 先用資訊層級、留白、對齊、表面層級與真實內容建立辨識度；品牌感必須能說明來源與用途，不能靠裝飾模板代替。
- Icon 使用既有可信元件庫並提供可見名稱；產品照片使用真實商品媒體，並設計 loading、missing 與 error fallback。
- 每一個 KPI、圖表、badge、illustration 或動效都必須回答它提供什麼資訊或操作價值；無法回答就刪除。
- Huashu 在 G2 只貢獻本清單，`DESIGN.md` 仍是 L0 規格；不得啟用其風格輪盤或藉 style 名稱改 token。

### Anti-AI-Slop：Don't

- 禁止無品牌理由的紫色漸層，不得用「科技感」作為萬用理由。
- 禁止用 emoji 當 icon；emoji 只可出現在使用者內容或明確要求的語意文本。
- 禁止「圓角卡片＋左側 border accent」組合；狀態改用具名 badge、整體表面、文字、圖示或資料位置表達。
- 禁止 AI 自繪 SVG 人物／場景，避免五官錯位、比例詭異與無來源的裝飾插圖。
- 禁止 CSS 剪影、幾何符號或字母方塊冒充真實產品照片。
- 禁止未經品牌調校的通用系統字體擔任標題字；只使用本規格的字體角色與字重層級。
- 禁止 `#0D1117` 深藍底搭配通用青紫霓虹 glow；後台 Night 只使用本規格 token，且不使用 glow、發光邊框或滿頁漸層建立層級。
- 禁止 data slop：無資訊價值的裝飾性數字、假統計、無來源百分比或只為填滿卡片的指標。
- 禁止每個條列都配一個裝飾 icon；icon 只在改善辨識或操作時出現。
- 禁止「PowerPoint 切換」式動效，包括整頁 opacity 淡入淡出、每區同款 fade-up 或用轉場掩蓋資訊重排。動效必須維持元素連續性並尊重 `prefers-reduced-motion`。

### 必須

- 保持「待處理 → 13 KPI → A–H → 明細」順序，以及 2＋4＋3＋4 KPI 分組。
- A–D 使用真實資料且不加示意角標；E–H 每張各顯示一次不可關閉的完整示意角標。
- 每張圖保留精確值、資料來源或明細入口，並回答「為什麼這種資料適合這種圖」。
- PublicCart、PublicOrder、TrackLookup、TrackOrder、Cvs711Select、Cvs711Return 以手機優先驗收；後台頁也必須在 phone viewport 完成同等資訊與操作。
- 所有控制具可見名稱、鍵盤焦點與至少 44×44px 的手機 touch target；相鄰 target 至少 8px 間距。
- 原型註解與產品文案分離。

### 禁止

- 不得用 `0`、`0%`、空 progress 或零長條代替缺值。
- 不得只靠紅綠、hover、動畫或視覺位置傳達必要資訊。
- 不得把 A 改成點陣丘形、F 改成規則蜂窩、G 拆成雙軌。
- 不得新增第二套 production token 名稱、另建 UI kit 或重刻已有 shadcn primitive。
- 不得讓任何容器水平捲動，或用 carousel 隱藏十三項 KPI；`overflow-x: auto|scroll` 與超寬 `min-width` 均為驗收失敗。
- 不得讓設計說明文字、真實資料外觀的假數字或 Stripe 品牌識別進入正式產品。

### G4 前置閘門：Scan → Diagnose → Fix

實作前完成 Scan 與 Diagnose。Scan 記錄 framework、styling method 與既有 design patterns；Diagnose 覆蓋九類稽核。每項適用 finding 必須包含證據位置、現況、對應 DESIGN.md 條款、Preserve／Retire／Modernise／N/A 處置、Fix Priority 與驗證方式。所有 finding 均已處置或具名延後後，才可進入 Fix。因 Skill 未定義 P0／P1，不再宣稱「Taste-Skill P0／P1 清空」。

### G4 實作驗收清單

- 客人端 6 頁逐一驗證 Light scope、後台 6 頁逐一驗證 Night scope；確認沒有互套對方值，並特別驗證 primary／accent／destructive 實心面與 card 上語意文字的正確 token 引用。
- PublicCart／PublicOrder 分別以合法深色、合法淺色、非法值與缺值驗證品牌色：`--primary-foreground` 對 `--primary` 皆須達 `4.5:1`，非法值／缺值回退 `#F57572`，filled primary control 不得殘留 `text-white`；切換至其餘 10 頁後 override 必須清除，且 `--background`、`--foreground`、border／ring／sidebar、全部 chart 與資料語意 token 的 computed value 不變。
- 以 360、390、640、768、1024、1280、1536px viewport 驗收十二頁；逐一檢查頁面及全部子容器，任何元素的 `scrollWidth` 都不得大於 `clientWidth`，且 production CSS 的 `overflow-x: auto|scroll` 宣告數必須為 0。
- Dashboard 在 360px 仍可依四層順序取得全部 13 KPI、A–H 與明細；A 使用直向九階浮動瀑布，F／G／H 使用本規格的單軸／文字／表格替代，明細一列一卡。
- Bullet Chart 在 360px 保留預估刻度、實際填色、兩筆精確金額、差額與三態文案。
- PublicCart 與 TrackOrder 的主要流程可只用 touch 與螢幕鍵盤完成；sticky CTA 不遮住錯誤、最後一欄或 safe area。
- Empty／loading／error／ready-but-empty／pending input 逐頁驗收；E–H 每態仍保留示意角標。
- 驗證 phone／tablet／desktop 的 `page-gutter`、`section-y`、`card-padding`，以及 KPI 組內 16px／組間 24px 的層級差異；成本 Bullet row 不低於 64px。
- 以 `estimateLocked` 驗證 Button／Input／Select／Checkbox／表格列內編輯的 disabled；disabled 真值、Lock 與原因常駐，pending 仍顯示待確認與補填動作。
- 抽查 JPY、TWD、負數、真正零值、null 與百分比；所有 numeric cell 實際套用 `tnum`，null 不得格式化為 0。
- 逐一開啟 Dropdown、Popover、Tooltip、Sheet／Drawer、Dialog 與 Sonner，驗證 portal 層級符合 0–90 尺度且 modal 內浮層不被 overlay 截斷。
