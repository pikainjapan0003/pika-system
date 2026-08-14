---
version: "alpha"
name: "Pika V1 Twin Refined"
description: "雙軌精修版：供成本利潤與客人端十二個凍結畫面共用的 Light／深夜雙主題設計系統。圖表先服從資料關係，再服從視覺偏好。"
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
typography:
  sans:
    fontFamily: "Noto Sans TC"
  serif:
    fontFamily: "Georgia"
  mono:
    fontFamily: "Menlo"
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
---

# Pika V1 雙軌精修版設計系統

## Overview

本規格是包 24 G2 的唯一設計真相，適用於凍結的十二個畫面：`Dashboard.tsx`、`Trips.tsx`、`TripEstimate.tsx`、`TripActual.tsx`、`TripComparison.tsx`、`MonthlyProfit.tsx`、`PublicCart.tsx`、`PublicOrder.tsx`、`TrackLookup.tsx`、`TrackOrder.tsx`、`Cvs711Select.tsx`、`Cvs711Return.tsx`。

雙軌精修版是一套金額密集、決策優先的響應式 Web 工作台。後台先回答「現在有什麼要處理」與「最後賺多少、是否達標」，再展開原因與可核對明細；客人端與後台共用字型、色彩語意、表單與狀態元件，但使用更溫暖的文案、更寬鬆的節奏與手機優先編排。

Dashboard 固定遵守四層順序：

1. 待處理事項。
2. 13 項 KPI：2 項主角、4 項收入與毛利、3 項成本、4 項效率與基準。
3. A–H 圖表摘要。
4. 明細表。

四層順序、A–H 圖型、達標能量條及成本 Bullet Chart 是 G1 已定案骨架。G2 只規範 token、元件、狀態、文案與響應式行為，不重新設計骨架。圖表先服從資料關係，再服從視覺偏好；每張圖都必須說得出為何適合該資料。

### 邊界與非目標

- 本批不得改計算核心、schema、migration、API 契約或新增寫回路徑。
- `ReceiptPreview.tsx`、receipt camera prototype、OCR review prototype 均不在本關；後兩者延至 Phase 4。
- `TrackOrder.tsx` 自 G1 起保持零修改；本規格只定義未來套用時的響應式與狀態契約。
- 原型是規格證據，不是可直接搬入產品的程式碼或資料來源。

## Colors

Light 使用近白主底、白色主卡與低彩度藍灰邊界；深夜版使用低彩度深藍灰背景與高一階卡面。層級主要由表面色、1px 邊界與間距建立，不以厚重陰影、玻璃擬態或裝飾性漸層建立。

### 資料與狀態語意

- 預估／主要資料：`--primary`、`--chart-1`。
- 實際：`--chart-4`，且必須再以「實際」文字、排列或圖例區分。
- 目標、待確認與差額焦點：`--accent`、`--chart-2`。
- 有利／達標：`--chart-3`，必須明寫「有利」或「已達標」。
- 不利／錯誤／虧損：`--destructive`、`--chart-5`，必須明寫「不利」「錯誤」或「虧損」。
- 尚未載入、次要背景與空狀態：`--muted`。

有利／不利不得只靠紅綠，預估／實際不得只靠色差。色彩必須與文字、方向、圖例、線型或位置至少再配一種編碼。A–D 為真實資料，禁止示意角標；E–H 每張卡都必須各自完整顯示一次「⚠️ 示意圖・非真實資料」，角標不可關閉。

### 108 個既有 CSS 變數

以下名稱是 `pika-v1-phase23/artifacts/shop-app/src/index.css` 的 108 個唯一變數；不得新增第二套 production token 名稱。Front matter 只是 `@google/design.md` 可 export 的 Light 投影，這張矩陣才是 Light／深夜版的完整規格。以 twin-refined 的 34 個覆寫為基準，再加入本節列明的 G2 WCAG 修正；除此之外的值與引用保持原樣。

| Token | Light | 深夜版 |
| --- | --- | --- |
| `--color-background` | `hsl(var(--background))` | `hsl(var(--background))` |
| `--color-foreground` | `hsl(var(--foreground))` | `hsl(var(--foreground))` |
| `--color-border` | `hsl(var(--border))` | `hsl(var(--border))` |
| `--color-input` | `hsl(var(--input))` | `hsl(var(--input))` |
| `--color-ring` | `hsl(var(--ring))` | `hsl(var(--ring))` |
| `--color-card` | `hsl(var(--card))` | `hsl(var(--card))` |
| `--color-card-foreground` | `hsl(var(--card-foreground))` | `hsl(var(--card-foreground))` |
| `--color-card-border` | `hsl(var(--card-border))` | `hsl(var(--card-border))` |
| `--color-popover` | `hsl(var(--popover))` | `hsl(var(--popover))` |
| `--color-popover-foreground` | `hsl(var(--popover-foreground))` | `hsl(var(--popover-foreground))` |
| `--color-popover-border` | `hsl(var(--popover-border))` | `hsl(var(--popover-border))` |
| `--color-primary` | `hsl(var(--primary))` | `hsl(var(--primary))` |
| `--color-primary-foreground` | `hsl(var(--primary-foreground))` | `hsl(var(--primary-foreground))` |
| `--color-primary-border` | `var(--primary-border)` | `var(--primary-border)` |
| `--color-secondary` | `hsl(var(--secondary))` | `hsl(var(--secondary))` |
| `--color-secondary-foreground` | `hsl(var(--secondary-foreground))` | `hsl(var(--secondary-foreground))` |
| `--color-secondary-border` | `var(--secondary-border)` | `var(--secondary-border)` |
| `--color-muted` | `hsl(var(--muted))` | `hsl(var(--muted))` |
| `--color-muted-foreground` | `hsl(var(--muted-foreground))` | `hsl(var(--muted-foreground))` |
| `--color-muted-border` | `var(--muted-border)` | `var(--muted-border)` |
| `--color-accent` | `hsl(var(--accent))` | `hsl(var(--accent))` |
| `--color-accent-foreground` | `hsl(var(--accent-foreground))` | `hsl(var(--accent-foreground))` |
| `--color-accent-border` | `var(--accent-border)` | `var(--accent-border)` |
| `--color-destructive` | `hsl(var(--destructive))` | `hsl(var(--destructive))` |
| `--color-destructive-foreground` | `hsl(var(--destructive-foreground))` | `hsl(var(--destructive-foreground))` |
| `--color-destructive-border` | `var(--destructive-border)` | `var(--destructive-border)` |
| `--color-chart-1` | `hsl(var(--chart-1))` | `hsl(var(--chart-1))` |
| `--color-chart-2` | `hsl(var(--chart-2))` | `hsl(var(--chart-2))` |
| `--color-chart-3` | `hsl(var(--chart-3))` | `hsl(var(--chart-3))` |
| `--color-chart-4` | `hsl(var(--chart-4))` | `hsl(var(--chart-4))` |
| `--color-chart-5` | `hsl(var(--chart-5))` | `hsl(var(--chart-5))` |
| `--color-sidebar` | `hsl(var(--sidebar))` | `hsl(var(--sidebar))` |
| `--color-sidebar-foreground` | `hsl(var(--sidebar-foreground))` | `hsl(var(--sidebar-foreground))` |
| `--color-sidebar-border` | `hsl(var(--sidebar-border))` | `hsl(var(--sidebar-border))` |
| `--color-sidebar-primary` | `hsl(var(--sidebar-primary))` | `hsl(var(--sidebar-primary))` |
| `--color-sidebar-primary-foreground` | `hsl(var(--sidebar-primary-foreground))` | `hsl(var(--sidebar-primary-foreground))` |
| `--color-sidebar-primary-border` | `var(--sidebar-primary-border)` | `var(--sidebar-primary-border)` |
| `--color-sidebar-accent` | `hsl(var(--sidebar-accent))` | `hsl(var(--sidebar-accent))` |
| `--color-sidebar-accent-foreground` | `hsl(var(--sidebar-accent-foreground))` | `hsl(var(--sidebar-accent-foreground))` |
| `--color-sidebar-accent-border` | `var(--sidebar-accent-border)` | `var(--sidebar-accent-border)` |
| `--color-sidebar-ring` | `hsl(var(--sidebar-ring))` | `hsl(var(--sidebar-ring))` |
| `--font-sans` | `var(--app-font-sans)` | `var(--app-font-sans)` |
| `--font-serif` | `var(--app-font-serif)` | `var(--app-font-serif)` |
| `--font-mono` | `var(--app-font-mono)` | `var(--app-font-mono)` |
| `--radius-sm` | `calc(var(--radius) - 4px)` | `calc(var(--radius) - 4px)` |
| `--radius-md` | `calc(var(--radius) - 2px)` | `calc(var(--radius) - 2px)` |
| `--radius-lg` | `var(--radius)` | `var(--radius)` |
| `--radius-xl` | `calc(var(--radius) + 4px)` | `calc(var(--radius) + 4px)` |
| `--button-outline` | `rgba(0, 0, 0, 0.1)` | `rgba(0, 0, 0, 0.1)` |
| `--badge-outline` | `rgba(0, 0, 0, 0.05)` | `rgba(0, 0, 0, 0.05)` |
| `--opaque-button-border-intensity` | `-8` | `-8` |
| `--elevate-1` | `rgba(0, 0, 0, 0.03)` | `rgba(0, 0, 0, 0.03)` |
| `--elevate-2` | `rgba(0, 0, 0, 0.08)` | `rgba(0, 0, 0, 0.08)` |
| `--background` | `40 25% 98%` | `218 24% 9%` |
| `--foreground` | `216 27% 13%` | `210 24% 93%` |
| `--border` | `212 18% 85%` | `215 18% 24%` |
| `--input` | `212 18% 55%` | `215 18% 48%` |
| `--ring` | `201 70% 34%` | `198 58% 60%` |
| `--card` | `0 0% 100%` | `218 21% 13%` |
| `--card-foreground` | `216 27% 13%` | `210 24% 93%` |
| `--card-border` | `212 18% 85%` | `215 18% 24%` |
| `--popover` | `0 0% 100%` | `218 21% 13%` |
| `--popover-foreground` | `216 27% 13%` | `210 24% 93%` |
| `--popover-border` | `212 18% 85%` | `215 18% 24%` |
| `--primary` | `201 70% 34%` | `198 58% 60%` |
| `--primary-foreground` | `0 0% 100%` | `218 24% 9%` |
| `--secondary` | `207 28% 94%` | `217 19% 18%` |
| `--secondary-foreground` | `216 27% 16%` | `210 22% 91%` |
| `--muted` | `210 23% 94%` | `217 19% 18%` |
| `--muted-foreground` | `215 10% 42%` | `214 12% 66%` |
| `--accent` | `32 88% 42%` | `35 72% 61%` |
| `--accent-foreground` | `216 27% 13%` | `218 24% 9%` |
| `--destructive` | `7 62% 46%` | `7 58% 63%` |
| `--destructive-foreground` | `0 0% 100%` | `218 24% 9%` |
| `--sidebar` | `208 30% 95%` | `219 27% 7%` |
| `--sidebar-foreground` | `216 27% 13%` | `210 24% 93%` |
| `--sidebar-border` | `212 18% 84%` | `215 18% 21%` |
| `--sidebar-primary` | `201 70% 34%` | `198 58% 60%` |
| `--sidebar-primary-foreground` | `0 0% 100%` | `218 24% 9%` |
| `--sidebar-accent` | `207 28% 89%` | `217 21% 16%` |
| `--sidebar-accent-foreground` | `216 27% 13%` | `210 22% 92%` |
| `--sidebar-ring` | `201 70% 34%` | `198 58% 60%` |
| `--chart-1` | `201 70% 34%` | `198 58% 60%` |
| `--chart-2` | `32 88% 42%` | `35 72% 61%` |
| `--chart-3` | `157 46% 35%` | `157 43% 55%` |
| `--chart-4` | `218 54% 48%` | `219 52% 67%` |
| `--chart-5` | `7 62% 46%` | `7 58% 63%` |
| `--app-font-sans` | `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif` | same as Light |
| `--app-font-serif` | `Georgia, serif` | same as Light |
| `--app-font-mono` | `Menlo, monospace` | same as Light |
| `--radius` | `0.375rem` | `0.375rem` |
| `--shadow-2xs` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | same as Light |
| `--shadow-xs` | `0 1px 3px 0 rgba(0, 0, 0, 0.07)` | same as Light |
| `--shadow-sm` | `0 2px 4px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.04)` | same as Light |
| `--shadow` | `0 4px 6px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.05)` | same as Light |
| `--shadow-md` | `0 6px 10px rgba(0,0,0,.08), 0 2px 4px -2px rgba(0,0,0,.06)` | same as Light |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,.08), 0 4px 6px -2px rgba(0,0,0,.05)` | same as Light |
| `--shadow-xl` | `0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.05)` | same as Light |
| `--shadow-2xl` | `0 25px 50px -12px rgba(0, 0, 0, 0.15)` | same as Light |
| `--tracking-normal` | `0em` | `0em` |
| `--spacing` | `0.25rem` | `0.25rem` |
| `--primary-border` | relative HSL from `--primary` and border intensity | same reference |
| `--secondary-border` | relative HSL from `--secondary` and border intensity | same reference |
| `--muted-border` | relative HSL from `--muted` and border intensity | same reference |
| `--accent-border` | relative HSL from `--accent` and border intensity | same reference |
| `--destructive-border` | relative HSL from `--destructive` and border intensity | same reference |
| `--sidebar-primary-border` | relative HSL from `--sidebar-primary` and border intensity | same reference |
| `--sidebar-accent-border` | relative HSL from `--sidebar-accent` and border intensity | same reference |

`--sidebar-ring` 是第二個必要的 AA 修正：舊值沒有被 round 3 覆寫，仍是 coral `1 87% 70%`。Light 改為 `201 70% 34%`、深夜改為 `198 58% 60%`，與各模式 `--ring` 同步；這是鍵盤 focus indicator 的非文字對比修正，不是新增 token。

### WCAG AA 修正：深夜 accent

已知問題是深夜版 `--accent: 35 72% 61%` 與舊 `--accent-foreground: 40 26% 92%` 的一般文字對比只有 **1.7975:1**（CLI 顯示 1.80:1），不符合 WCAG AA 4.5:1。

| 項目 | 調整前 | 調整後 | 對比 | 理由 |
| --- | --- | --- | ---: | --- |
| 深夜 `--accent-foreground` | `40 26% 92%`（約 `#f0ece5`） | `218 24% 9%`（約 `#11151c`） | `1.7975:1` → `8.6436:1` | 沿用深夜版既有的 dark-on-bright 前景，保留 accent 亮度與圖形辨識，通過一般文字 AA。 |
| Light `--accent`、`--chart-2` | `32 88% 54%` | `32 88% 42%`（約 `#c9710d`） | 對 muted `2.0792:1` → `3.1317:1`；對 accent foreground `4.6137:1` | 目標刻度、待確認與能量條是必要圖形，需達 3:1；兩個既有 token 同步，避免圖例與元件漂移。 |
| Light `--sidebar-ring` | `1 87% 70%`（約 `#f57270`） | `201 70% 34%`（約 `#1a6993`） | 對 sidebar `2.4971:1` → `5.3893:1` | Focus indicator 必須達非文字 3:1；與 Light `--ring` 同步並去除舊 coral 漂移。 |
| 深夜 `--sidebar-ring` | `1 87% 70%`（約 `#f57270`） | `198 58% 60%`（約 `#5eb1d4`） | 對 sidebar `6.8171:1` → `7.8973:1` | 雖舊值已過 3:1，仍與深夜 `--ring` 同步，確保跨 shell 焦點語意一致。 |
| Light `--input` | `212 18% 85%` | `212 18% 55%`（約 `#788ba1`） | 對 secondary `1.2503:1` → `3.0473:1`；對 card `3.4963:1` | input/select/textarea/switch 的必要邊界不可只靠低對比細線；保留跨表面的 3:1 餘裕。 |
| 深夜 `--input` | `215 18% 24%` | `215 18% 48%`（約 `#647790`） | 對 secondary `1.2414:1` → `3.0676:1`；對 card `3.6073:1` | 同一 input token 會出現在 card、muted、secondary、sidebar；採可跨表面通過的值。 |

`--accent-foreground` 只准用於實心 `--accent` 背景上的文字。深夜卡面上的 pending／accent 文字直接使用 `--accent`：`#e3a754` 對 `--card` 約 `#1a1f28` 為 **7.8089:1**；一般文字使用 `--foreground`。不得再把 `--accent-foreground` 當成卡面上的 accent 文字，否則會形成新的低對比。此變更只修正既有 token 取值與引用契約，不新增 token。

`--border`、`--card-border`、`--sidebar-border` 保留低彩度結構線，只可作非必要的分組／裝飾 cue；不得單獨表示可互動元件、focus 或狀態。可互動邊界使用已提高對比的 `--input`，focus 使用 `--ring`／`--sidebar-ring`；若 G4 發現 Card、Item、Resizable handle 或 outline button 仍只靠低對比邊線辨識，必須改用既有高對比 token 或補上填色、圖示與文字，不得宣稱裝飾線已符合 3:1。

### Export 邊界

`@google/design.md@0.3.0 export --format css-tailwind` 只會輸出單一普通 `@theme`、將 HSL 正規化成 hex，且不能表達 repo 的 `@theme inline`＋`hsl(var(--semantic-token))` 雙層引用或條件式 Light／Night selector。因此 G2 分別機械輸出 Light 與 Night 兩份 theme CSS 作 G4 比對輸入；兩份都不是可直接覆蓋 `index.css` 的 patch。Front matter 的 `components` 包含 token 使用／對比探針，用來消除孤兒引用並實測關鍵文字 pair；exporter 不會把這些探針輸出成 production token。

## Typography

主要字型沿用 `--app-font-sans`：`"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`；不複製 Stripe 的字型、品牌識別或商標。Open Design 內建 Stripe 系統只提供兩項結構參考：金融數據使用 tabular numbers，以及「資料區密集、外框留白精準」的分層手法。

- 營運金額、百分比、件數、差額、刻度與表格數字一律使用 `font-variant-numeric: tabular-nums`。
- 貨幣符號與金額不得任意斷行；精確值不得因手機寬度而省略、截斷或縮成不可讀尺寸。
- H1：桌機 32px／1.25，手機 28px／1.25；H2：24px／1.3；H3：18px／1.4；正文：16px／1.5；輔助文字最小 12px／1.5。
- 主角 KPI 數字使用 `clamp(2rem, 7vw, 3rem)`；次級 KPI 不小於 20px。
- 「有利」「不利」「待確認」「虧損」「已達標」「未達標」「持平」必須明寫。
- 缺值正式文案採「尚未填寫〈欄位名稱〉」或「待確認」，不得顯示 `0`、`0%`、空白進度條或零長條。

### 原型註解不等於產品文案

「缺少預估值，不補 0 或空白子彈圖」是寫給審閱者的設計註解，禁止進入正式 UI。產品文案應寫成可行動、可定位的句子，例如「尚未填寫預估燃油金額」；若可修正，動作使用「補填預估」或「前往成本設定」。設計理由只留在規格或開發註解中。

## Layout

桌機與手機同等重要。平台是純瀏覽器 Web，不代表只做桌機。現況十二頁中有十一頁沒有任何 page-level breakpoint；本規格因此以 base 手機樣式為起點，再逐級增強。手機只改排列、揭露方式與局部捲動，不改四層順序、KPI 分組、圖表類型、資料語意或精確值。

### Breakpoints

| 名稱 | 範圍 | 版面契約 |
| --- | --- | --- |
| base／phone | `< 640px` | 單欄、16px 頁邊距、底部主要動作避開 safe area、所有 touch target 至少 44×44px。 |
| `sm` | `640–767px` | 24px 頁邊距；非主角 KPI 可兩欄，但不得壓縮金額；表單仍以單欄為主。 |
| `md` | `768–1023px` | 主角 KPI 兩欄；群組 KPI 兩欄；表單可 2 欄；表格在內容允許時恢復欄模式。 |
| `lg` | `1024–1279px` | 桌機側欄、32px 內容邊距；收入 4 欄、成本 3 欄、效率 4 欄；A 全寬，B–D 三欄，E–H 兩欄。 |
| `xl` | `1280–1535px` | 最大內容寬 1440px；維持 `lg` 資訊架構並放寬圖表與明細。 |
| `2xl` | `≥ 1536px` | 只增加外側留白與 plot width，不增加 KPI 欄數，不把資訊稀釋成海報版。 |

禁止頁面根容器水平捲動。只有明訂的圖表畫布、索引列或明細表容器可以局部橫向捲動；必須有可見提示與鍵盤替代操作。

### Dashboard：13 KPI 的跨斷點排列

13 項依固定分組呈現：

- 2 主角：最終營業利益、達標狀態。
- 4 收入與毛利：銷售總額、調整後收入、營業毛利、毛利率。
- 3 成本：商品進貨成本、固定成本、變動成本。
- 4 效率與基準：薪資目標、商品總件數、平均單件毛利、平均每日毛利。

| Breakpoint | 具體排列 |
| --- | --- |
| base | 待處理置頂；兩個主角各佔全寬且永久展開。收入群預設展開，四項單欄依凍結順序排列；成本群與效率群是彼此獨立 disclosure，預設收合但可同時展開，展開後單欄。收合標題只顯示群組名、項目數與展開狀態，不自行創造彙總值。 |
| `sm` | 兩個主角仍各佔全寬；展開群組內的非主角 KPI 兩欄。數字放不下時回退單欄，不縮小至 20px 以下。 |
| `md` | 兩個主角並列 2 欄；收入、成本、效率各自 2 欄，全部預設展開。 |
| `lg+` | 兩主角 2 欄；收入 4 欄；成本 3 欄；效率 4 欄。禁止把十三張卡做成無分組的 13 等分牆。 |

待處理事項有內容時預設展開；沒有事項時仍保留第一層，縮成一列完整空狀態，不得消失。首屏 KPI 不得等待圖表載入或動效才出現。

達標能量條在任何寬度都保留百分比、目前金額、薪資目標、差額、目標刻度與後端 `outcome` 三態。手機先顯示結論與百分比，兩筆金額在下一行對齊，能量條再下一行全寬；不得只剩一條無數字的 progress。

### Dashboard：A–H 的跨斷點排列

- base／`sm`：一次只顯示一張圖。頂部使用 A→H 固定順序的可橫滑索引列，預設 A；提供上一張／下一張與「第 n／8 張」文字，swipe 不是唯一導覽。切換只改可見面板，不改資料或圖型。
- `md`：A 全寬；B–D 使用 2 欄流式網格；E–H 仍可使用單面板索引，避免平板同時出現四個不可讀 plot。
- `lg+`：A 全寬；B–D 三欄；E–F 兩欄；G–H 兩欄。明細表維持最後一層。

| 圖 | 手機 plot 尺寸與降級 |
| --- | --- |
| A | 高 360px；九階內層最小寬 720px，僅 plot 局部橫滑；每站累積值常駐。 |
| B | 高 320px；內層最小寬 560px，圖例與文字共同區分預估／實際。 |
| C | 高 240px；兩條並列堆疊橫條在手機仍完整顯示，正常不橫滑。 |
| D | 高度 `max(320px, 項目數 × 44px + 96px)`；零軸固定可見，圖內不得垂直捲動。 |
| E | 高度 `max(288px, 路線數 × 44px + 80px)`；長路線名最多兩行，條尾精確金額常駐。 |
| F | 高 336px；內層最小寬 520px，局部橫滑；點的透明 hit area 至少 44px。 |
| G | 高 360px；內層最小寬 520px，局部橫滑；X／Y 軸、色階與薪資目標等高線不可省略。 |
| H | 高 320px；內層寬至少為每期 72px，超出局部橫滑；每期精確值可由 tap／focus 取得。 |

上述尺寸是 plot area，不含標題、圖例、示意角標與狀態區。局部橫滑容器顯示「左右滑動查看完整圖表」，並保留鍵盤方向鍵與明細表替代。

### 表格與 Bullet Chart 的窄螢幕降級

- `< md` 時，每個成本對帳 row 轉為垂直卡列：項目／類別與狀態 → 預估、實際兩筆精確金額 → 全寬 Bullet Chart → 差額與有利／不利／待確認 → 操作。來源順序與桌機表格一致，不隱藏欄位。
- Bullet Chart 的預估是細刻度、實際是填色；手機不得以兩條普通 progress 取代。缺預估時不畫刻度或零值，顯示「尚未填寫預估〈項目〉金額」；缺實際時顯示「尚無實際〈項目〉金額」。
- `md+` 恢復語意表格；項目欄可 sticky，金額右對齊。若欄數仍超過容器，只允許表格 wrapper 局部橫滑，首欄與欄頭保持可辨。
- 手機明細表預設收合但保留標題、筆數與展開按鈕；展開後不得造成整頁水平捲動。

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

| 頁面 | base／phone | `md` | `lg+` |
| --- | --- | --- | --- |
| Dashboard | 四層單欄；2 主角常駐、其餘分組揭露；A–H 單面板 | 主角 2 欄、群組 2 欄；A 全寬 | Sidebar；2＋4＋3＋4 KPI；A／B–D／E–F／G–H 固定網格 |
| Trips | 行程→大區→路線 progressive disclosure；Drawer 編輯 | master-detail；安全欄位 2 欄 | 左導航／右成本 editor；三個成本入口常駐 |
| TripEstimate | 成本項目先名稱再金額／幣別；UNIT／DAILY 直排 | 成本列恢復三欄，projection 並列 | 輸入約 8 欄、摘要約 4 欄；pending reason 留在欄位旁 |
| TripActual | 類別→名稱→金額／幣別→日期→照片→提交；照片不溢出 | 表單與已記錄費用分區，安全欄位 2 欄 | 表單／照片約 5 欄，費用清單約 7 欄 |
| TripComparison | 每項 comparison card 顯示預估、實際、差額、percent、direction、state | 切回完整 Table，項目 sticky、金額右對齊 | 表格與比較圖可主從配置，表格仍是真相來源 |
| MonthlyProfit | 月份滿寬；定格毛利跨滿，其他指標 2 欄 | 月份移入 header，四指標 2×2 或同列 | 內容約 960px，不把少量數字拉散 |
| PublicCart | 商品→取貨→收件／門市／地址→摘要→sticky CTA | 內容 2 欄，DOM 仍先商品後結帳 | 左商品／右表單與 sticky 摘要；empty／success 保持窄版 |
| PublicOrder | 商品、表單、取貨、金額、CTA 單欄；沿用既有取貨卡 `sm` reflow | 商品約 5 欄、訂購表單約 7 欄 | 摘要可 sticky；選中取貨 detail 留在表單欄 |
| TrackLookup | 320–420px 單一查詢表單，input／CTA 48px | 只增加外圍留白 | 不新增欄位或裝飾面板 |
| TrackOrder | 狀態優先、垂直 timeline、完整 public-safe 明細 | 左狀態／timeline／商品，右訂單／物流／收件／代碼 | 只增加留白；禁止 Owner Sidebar／BottomNav |
| Cvs711Select | sticky 搜尋、單欄結果；搜尋與選擇按鈕 ≥44px | 結果可 2 欄，搜尋／錯誤／筆數跨滿 | 最大內容約 900px，不改 provider 或返回路徑 |
| Cvs711Return | 單一 processing／error transient state；CTA 滿寬 44px | 限制內容寬度 | 不新增導航或多欄 |

所有頁面只 reflow 同一棵 DOM，不為不同 breakpoint 同時 render 兩份 live form。sticky CTA 使用 `env(safe-area-inset-bottom)`，虛擬鍵盤開啟時回到文流，且不得遮住最後欄位或 inline error。G4 最低驗收寬度為 320、360、390、430、640、768、1024、1280、1440px。

## Elevation & Depth

層級以背景表面、1px 細邊界、分組標題與留白建立。主卡高於頁面背景一階，浮層高於主卡一階；沿用既有 `--shadow-*`，不新增 shadow token，不使用玻璃擬態、發光或厚重投影。

- Level 0：頁面背景與表格內列，無陰影。
- Level 1：KPI、圖表、空狀態卡，使用細邊界；只有需要與背景分離時使用 `--shadow-xs`。
- Level 2：sticky 摘要、Sheet、Popover，最多 `--shadow-md`。
- Level 3：Dialog，最多 `--shadow-lg`；不得用陰影代替 modal overlay 與 focus trap。
- Focus 使用 `--ring`；錯誤、待確認與示意資料使用語意邊界與文字，不靠陰影表示。

## Shapes

一般卡片、輸入與按鈕沿用 `--radius: 0.375rem`；派生的 `--radius-sm/md/lg/xl` 名稱保持不變。狀態 badge 可使用膠囊形，但資料卡、圖表卡與主要容器不得堆成過度柔軟的圓角卡片牆。

hexbin 六角只屬圖 G 的資料分箱，不得作為跨頁裝飾，不得用蜂窩造型取代 A、F 或其他圖表的資料編碼。圖表標記的形狀要服務分組、狀態與可辨識度，不模仿品牌圖案。

## Components

既有 `components/ui/` 正好有 55 個 `.tsx`。處置原則是 **49 沿用、6 擴充、0 重建 primitive**；新建只限業務 composite，且必須組合既有 primitive。四個原型來源頁目前多為 raw HTML controls，G4 應逐步收斂到以下 inventory，不得另外建立平行 UI kit。

| # | 既有元件 | 處置 | 本批規格 |
| ---: | --- | --- | --- |
| 1 | `accordion.tsx` | 沿用 | 手機行程／大區可折疊；主要數字不得因折疊消失。 |
| 2 | `alert.tsx` | **擴充** | 由 default/destructive 增加 info/warning/success/pending；圖示＋文字並用。 |
| 3 | `alert-dialog.tsx` | 沿用 | 只用於不可回復確認，不為一般編輯增加阻力。 |
| 4 | `aspect-ratio.tsx` | 沿用 | 商品圖與媒體維持比例；缺圖仍提供替代內容。 |
| 5 | `avatar.tsx` | 沿用（本批不採） | 凍結資料無頭像時不得捏造照片。 |
| 6 | `badge.tsx` | **擴充** | 增 estimate/actual/pending/favorable/unfavorable/neutral 語意。 |
| 7 | `breadcrumb.tsx` | 沿用 | 桌機顯示層級；手機改簡潔返回，不塞完整 breadcrumb。 |
| 8 | `button.tsx` | **擴充** | 增 44px／48px touch size，統一五原型 CTA。 |
| 9 | `button-group.tsx` | 沿用 | 購物車數量步進與相鄰動作；不取代 Tabs。 |
| 10 | `calendar.tsx` | 沿用（本批不採） | 無凍結日期欄時不得憑空新增。 |
| 11 | `card.tsx` | 沿用 | KPI、行程、大區、購物車與摘要共用結構。 |
| 12 | `carousel.tsx` | 沿用（本批不採） | 儀表板 KPI／圖表不得藏進 carousel。 |
| 13 | `chart.tsx` | **擴充** | 補可變高度、文字摘要、空／待確認狀態與 A–H composite，不重建 wrapper。 |
| 14 | `checkbox.tsx` | 沿用（本批不採） | 凍結欄位無多選，不增加假需求。 |
| 15 | `collapsible.tsx` | 沿用 | 手機次級明細；必填與待確認訊息不得預設隱藏。 |
| 16 | `command.tsx` | 沿用（本批不採） | 無凍結全域搜尋需求，不新增假入口。 |
| 17 | `context-menu.tsx` | 沿用（本批不採） | 核心編輯／結帳動作不得只藏在右鍵。 |
| 18 | `dialog.tsx` | 沿用 | 桌機複雜表單可用；手機優先 Sheet／Drawer。 |
| 19 | `drawer.tsx` | 沿用 | 手機行程、大區、路線編輯使用底部 drawer。 |
| 20 | `dropdown-menu.tsx` | 沿用 | 只收納次要／溢出動作，主要 CTA 常駐。 |
| 21 | `empty.tsx` | 沿用 | Slot 已完整；所有空態直接組合，不另建 primitive。 |
| 22 | `field.tsx` | 沿用 | Trips／PublicCart 表單首選；承接 description、error 與方向。 |
| 23 | `form.tsx` | 沿用 | G4 若遷移 react-hook-form 才使用，原型不改資料行為。 |
| 24 | `hover-card.tsx` | 沿用（本批次要） | 可補充公式；必要資訊仍須可點擊及手機可見。 |
| 25 | `input.tsx` | **擴充** | 增 44／48px touch size、invalid/pending；保留 number/inputMode。 |
| 26 | `input-group.tsx` | 沿用 | 金額、幣別、件／箱等單位與前後綴。 |
| 27 | `input-otp.tsx` | 沿用（本批不採） | 付款末五碼是單一選填對帳欄，不拆成 OTP。 |
| 28 | `item.tsx` | 沿用 | 購物車列、最近訂單、低庫存、路線列共用 family。 |
| 29 | `kbd.tsx` | 沿用（本批次要） | 只用桌機快捷提示，不影響手機流程。 |
| 30 | `label.tsx` | 沿用 | 輸入皆有可關聯 Label，必填不只靠顏色。 |
| 31 | `menubar.tsx` | 沿用（本批不採） | Owner 導覽採 Sidebar，不建平行 menubar。 |
| 32 | `navigation-menu.tsx` | 沿用（本批不採） | PublicCart 無凍結多層網站導覽。 |
| 33 | `pagination.tsx` | 沿用（本批不採） | 五原型無分頁契約，不虛構頁碼。 |
| 34 | `popover.tsx` | 沿用 | 桌機篩選／補充資訊；手機要有可點擊替代。 |
| 35 | `progress.tsx` | 沿用 | 只作 GoalEnergyBar 填色 substrate，不可冒充完整能量條。 |
| 36 | `radio-group.tsx` | 沿用 | PublicCart 取貨方式使用可鍵盤操作的 card-radio。 |
| 37 | `resizable.tsx` | 沿用（本批不採） | 無可調面板需求，寬度由 responsive grid 決定。 |
| 38 | `scroll-area.tsx` | 沿用 | 側欄與長清單可用；主頁避免多層隱藏捲動。 |
| 39 | `select.tsx` | **擴充** | 增 touch size，承接大區、模式、縣市與行政區。 |
| 40 | `separator.tsx` | 沿用 | 成本分段、訂單摘要與清單分隔。 |
| 41 | `sheet.tsx` | 沿用 | 手機編輯器與 Sidebar mobile，不另刻 overlay panel。 |
| 42 | `sidebar.tsx` | 沿用 | 已含 desktop/mobile/collapsed/Sheet；新建 shell，不重建 primitive。 |
| 43 | `skeleton.tsx` | 沿用 | Primitive 足夠；另組合各頁真實幾何。 |
| 44 | `slider.tsx` | 沿用（本批不採） | 金額、匯率、件數需精確輸入，不以 slider 取代。 |
| 45 | `sonner.tsx` | 沿用 | 輕量成功／失敗回饋；不取代頁內持續錯誤。 |
| 46 | `spinner.tsx` | 沿用 | 按鈕／局部短載入；頁級使用 Skeleton，中文 aria-label。 |
| 47 | `switch.tsx` | 沿用（本批不採） | 五原型無布林設定，不增加假開關。 |
| 48 | `table.tsx` | 沿用 | Comparison 與明細；sticky 欄、數字對齊在 composite 層。 |
| 49 | `tabs.tsx` | 沿用 | 預估／實際內容分頁，文字標籤常駐。 |
| 50 | `textarea.tsx` | 沿用 | 行程／結帳備註，維持 optional 標示。 |
| 51 | `toast.tsx` | 沿用 | 保留 Radix 相容層；核心待確認／錯誤不可只用短暫 toast。 |
| 52 | `toaster.tsx` | 沿用 | 沿用 `useToast`，不得建立第三套通知。 |
| 53 | `toggle.tsx` | 沿用（本批次要） | 只作非互斥小型視圖控制，預估／實際優先 Tabs。 |
| 54 | `toggle-group.tsx` | 沿用（本批次要） | 圖層／篩選可用；預估／實際不可只靠按下色。 |
| 55 | `tooltip.tsx` | 沿用 | 補充縮寫／公式；精確金額與待確認原因不可 hover-only。 |

### 新建業務 composite

| Composite | 組合既有元件 | 為何 55 個裡沒有可直接使用者 |
| --- | --- | --- |
| `ResponsiveOwnerShell` | Sidebar、Sheet、Button、Tooltip | Primitive 不含 Pika 路由、權限可見度、桌機側欄與手機導覽規則。 |
| `KpiCard`／`KpiDeck` | Card、Badge、Tooltip、Skeleton | 需封裝 13 KPI 格式、待確認及 2＋4＋3＋4 分組。 |
| `GoalEnergyBar` | Progress、Badge、Tooltip | 既有 Progress 沒有百分比、兩筆金額、差額、目標刻度與後端三態。 |
| `CostBulletRow` | Chart、Badge、Tooltip | 無既有 Bullet Chart；需預估刻度、實際填色、精確雙值與缺值正式文案。 |
| `AnalyticsChartFrame` ＋ A–H | Chart、Card、Empty、Skeleton、Alert | `chart.tsx` 只是 wrapper，沒有八種資料關係 composite、文字摘要與資料標記契約。 |
| `TripAreaCostEditor`／`RouteCostEditor` | Field、InputGroup、Select、Tabs、Alert、Button | 需封裝 nullable fuel、手填 ETC、ESTIMATE／ACTUAL、分攤與 fail-closed 契約。 |
| `VarianceComparisonTable`／`VarianceCell` | Table、Badge、Tooltip | 需整合 estimated／actual／difference／percent／direction／state。 |
| `CartLineItem`／`QuantityStepper`／`PickupMethodCard`／`CheckoutSummary` | Item、ButtonGroup、RadioGroup、Card、Field | Primitive 不含商品、物流、門市、運費、付款與收件資料契約。 |
| 頁級 Skeleton compositions | Skeleton、Card、Table | 頁級骨架必須反映各頁真實幾何，不能由 generic block 猜測。 |

### `chart.tsx`、`empty.tsx`、`skeleton.tsx` 裁定

- `chart.tsx`：底層足夠、產品圖型不足。沿用 Recharts `ResponsiveContainer`、Light／dark config、Tooltip、Legend；擴充可變高度、標題、a11y 文字摘要與 A–H composite，不另裝圖表庫或重寫 primitive。
- `empty.tsx`：已有 Media／Header／Title／Description／Content，足夠沿用；所有空態直接組合它，不另建 Empty primitive。
- `skeleton.tsx`：單一 pulse block 作為 primitive 足夠；新建 Dashboard、Trips、Comparison、Cart 等頁級 composition，尺寸貼近真實元件並避免 layout shift。

### 達標能量條與成本 Bullet Chart

- 達標能量條三態：已達標、未達標、虧損。每態同時顯示 outcome 文字、百分比、目前金額、薪資目標、差額與目標刻度；三態一律取後端 `outcome`，前端不得自行判斷。
- Bullet Chart 三態：有利、不利、待確認。預估為細刻度，實際為填色，兩筆精確金額常駐；有利／不利依後端或既有 variance domain 邏輯，不以「綠色＝好」猜測。
- 缺值不是 0。缺預估時不畫零刻度或空白子彈圖；缺實際時不畫零長度實際條。兩者都要顯示正式文案與下一步。

### A–H 圖表契約與反迎合

| 圖 | 資料 | 固定圖型與適配理由 | Owner 提過但不採用者與理由 |
| --- | --- | --- | --- |
| A 損益瀑布 | 真實；九階從銷售到最終利益 | 真正的浮動瀑布：增減段從前站終點起算，小計／總計落零基線，每站標累積值；同時保留方向、順序與可驗算性。 | 不採點陣丘形，因會破壞浮動起點、接續終點與累積語意；不採蜂窩，因資料不是二維密度場。 |
| B 預估↔實際 | 真實；同類指標雙版本 | 共用零基線的群組長條，適合同類兩值並列與跨類別量級比較。 | 不採能量條，因不是單一目標進度；不採堆疊，因預估與實際不是組成關係；不採蜂窩。 |
| C 成本結構 | 真實；進貨／固定／變動的雙版本組成 | 並列堆疊條保留 part-to-whole，也能比較兩版的組成變化與總長。 | 不採 waffle／蜂窩，三分類堆疊更省空間且邊界清楚；不採散點，因無連續 X／Y。 |
| D 差異貢獻 | 真實；各項有利／不利貢獻 | 以零為中心的發散長條；零軸是方向天然分界，可讀方向、量級與驅動項。 | 不採 progress／能量條，差異不朝單一目標累積；不採蜂窩；不得只用紅綠。 |
| E 路線單件成本排行 | 示意；各路線單件交通成本 | 高到低水平排行長條；適合長路線名與單量值名次，條尾保留精確金額。 | 不採蜂窩，序位不是二維密度；不採散點，只有一個主量值。 |
| F 地區散點 | 示意；件數 X、平均貢獻毛利 Y、收入 size | 氣泡散點完整保留 X／Y／size 三個連續編碼，可看關聯與離群地區。 | 明確拒絕規則蜂窩／waffle，因會同時消滅三個維度；蜂窩偏好放到真正適合的 G。 |
| G 敏感度熱圖 | 示意；件數 × 每件毛利推演利益與薪資邊界 | 單一資料場的 hexbin 六角熱圖＋薪資目標等高線；鄰接格適合辨認可行、未達與虧損區。 | 不分雙軌，情境推演沒有預估／實際二元性；不混作 waffle，六角是 X／Y 分箱而非固定金額單位。 |
| H 歷史趨勢 | 示意；各月營業利益 | 圓點點陣趨勢；X 軸保留時間順序，高度／堆疊量表達數值並附每期精確值。 | 不採六角蜂窩，時間序列需一維先後；不採實心面積，避免大色塊壓過密集資訊。 |

圖表只是摘要，KPI 與明細才是可核對真相。每張圖都有可由螢幕閱讀器讀取的文字摘要與對應明細入口；Tooltip 必須可由 tap 與鍵盤 focus 開啟，不得 hover-only。

### Empty／loading／error／待確認

| 狀態 | 規格 |
| --- | --- |
| Initial loading | 按四層順序保留版位；KPI、圖表與表格 skeleton 使用最終元件近似高度。Skeleton 不顯示可被誤認為真值的數字。 |
| Partial loading | 只替換失敗或載入中的群組／面板；已成功區域持續可讀，首屏 KPI 不等待圖表。 |
| Empty | 使用既有 `empty.tsx`，保留區塊標題、原因、下一步與可選 CTA；不得留白。 |
| Pending／missing input | 這是待確認，不是 empty。顯示「尚未填寫〈欄位〉」或「待確認」，不得補 0。 |
| Error | 在失敗區塊內顯示圖示、中文原因、保留上次成功資料的說明及至少 44×44px 的重試按鈕；不得把錯誤當 0 或移除整層。 |
| Ready but empty | 保留標題、資料範圍與 empty action；不得與 request error 混為一談。 |

E–H 即使 loading、empty 或 error，卡片標題區仍保留完整「⚠️ 示意圖・非真實資料」。動效尊重 `prefers-reduced-motion`；載入後不得造成 KPI 群組大幅 layout shift。

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
- 不得讓整頁水平捲動，或用 carousel 隱藏十三項 KPI。
- 不得讓設計說明文字、真實資料外觀的假數字或 Stripe 品牌識別進入正式產品。

### G4 實作驗收清單

- Light／深夜兩模式逐一做文字與 UI 元件對比檢查；特別驗證 accent solid 與 card-on-accent text 的正確 token 引用。
- 以 360、390、640、768、1024、1280、1536px viewport 驗收十二頁，根頁面 `scrollWidth` 不得大於 viewport。
- Dashboard 在 360px 仍可依四層順序取得全部 13 KPI、A–H 與明細；A、F、G、H 只在 plot wrapper 局部橫滑。
- Bullet Chart 在 360px 保留預估刻度、實際填色、兩筆精確金額、差額與三態文案。
- PublicCart 與 TrackOrder 的主要流程可只用 touch 與螢幕鍵盤完成；sticky CTA 不遮住錯誤、最後一欄或 safe area。
- Empty／loading／error／ready-but-empty／pending input 逐頁驗收；E–H 每態仍保留示意角標。
