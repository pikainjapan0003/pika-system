## 五種 GSAP 能力的用途與界線（各自用在哪、為什麼）

### ① Timeline

- **K6 進場交錯**：Dashboard KPI 卡前 5 張，gsap.fromTo＋stagger 35ms 編排（160ms/張，只動 y、opacity 保持 1）。KPI 數字由 React 首幀直接渲染（紅線 1「先出現，再動」），動效只是位置坐定，完全不延遲數字可讀性。契約限定 ≤5 張（13 張全交錯即違反 K6）。
- **K1 結算編排**：TripEstimate 儲存完成後，費用摘要與損益金額用 gsap.timeline 依序編排（每組數字 offset 60ms），總時長落在 K1 契約 450–600ms。
- 未用於路由切換的整頁轉場（紅線 7）。

### ② ScrollTrigger（只當「延後播放」的觸發器）

- **Dashboard**：首屏以下的 8 張圖表卡（data-chart-reveal，全部 ChartCard 共用標記）捲到視口 90% 才播放該區塊的進場（SVG 繪入）。理由：避免載入時 8 張圖同時動、省效能。once:true → 資料更新（切換行程）不重播。
- **PublicCart／PublicOrder**：長頁的區塊（data-reveal-block：購物車明細、結帳表單、商品頁表單）捲到才低調進場（opacity 0.001→1＋y 8→0，240ms，ease-out，一次）。
- 無 parallax／pin／scrub／橫向捲動劫持／捲動說故事；首屏內容未掛 ScrollTrigger。

### ③ Flip

- **K3 展開收合**：TripEstimate 成本 section 收合時 Flip.getState → hidden → Flip.from（250ms，scale:true, absolute:true）。摘要列（標題＋收合鈕）固定、明細從其下展開；不放大整張卡片、不造成水平位移。
- **K7 三態切換**：ProfitKpiBoard「預估／實際／對比」切換時 Flip.getState → Flip.from（240ms，absolute:true, scale:true）——卡組位置連續過渡，文字與符號一起更新；clearProps 收尾避免殘留 transform。
- 未用於純裝飾元素重排。

### ④ SplitText

- **唯一用途**：K1 數字結算時的「每一位數字各自過渡」。new SplitText(el, { type: "chars" }) 後只對 /^[0-9]$/ 的字元做 opacity 0.55→1＋y 3→0（220ms、stagger 20ms），幣別符號、小數點、千分位分隔符不參與動畫；tabular-nums 由父層 class 保持（紅線 5）。
- 首次渲染不得播放（紅線 1）：settleNonce 只在「儲存估算」成功後遞增，首屏初值直接可讀。
- 「待確認」狀態完全不得播放（紅線 4）：文字含 OPERATING_COST_PENDING_LABEL 者被 filter 排除。
- 動畫結束 split.revert() 還原 DOM，避免污染後續渲染。
- 未用於標題、段落、按鈕、狀態徽章或任何非金額文字。

### ⑤ SVG 動畫

- **K5 進度填入**：Dashboard 8 張圖表的長條由底長出（.recharts-rectangle scaleY 0→1，transform-box: fill-box; transform-origin: bottom）、H 歷史趨勢線圖 stroke-dashoffset 繪入；目標線（.recharts-reference-line 與 ReferenceLine）不參與動畫、保持固定（K5 契約「目標線固定、填色移動」）。640ms、ease in-out、僅首次播放。初次渲染不得延遲數字結論：圖表 a11y summary（sr-only）與圖例為文字，不受 SVG 動畫影響。
- **LedgerLockStamp 落印**：K7／K09 專用實例，estimateLocked 掛載時 scale 0.94→1＋opacity 0.001→1（240ms、strong ease-out）；不循環、reduced-motion 不播。
- 未新增任何裝飾性 SVG 圖形。

## 五條動效紅線逐條落實證據

| #   | 紅線                                                               | 落實證據                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 首屏 KPI 數字不得因動效延遲顯示（先出現，再動；不得從 0 跑到目標） | ProfitKpiBoard K6 只動 transform（y 6→0），opacity 恆為 1，React 首幀即渲染最終數字；無任何 count-up；K1 SplitText 只在儲存後（settleNonce>0）播放，首屏初值直接可讀（index.css P 段＋motion.ts 守門見上）                |
| 2   | 手機不卡頓；60fps、GPU 加速                                        | 全部 GSAP 動效只動 transform／opacity（y、scale、scaleY、opacity）；recharts 繪入有 transform-box: fill-box 使 scaleY 走合成；無 width/height/margin/left/top 動畫；ScrollTrigger 只在捲到視口才建立動畫、once 播放後清除 |
| 3   | 尊重 prefers-reduced-motion                                        | P 段兩層守門（CSS media query 全域＋JS matchMedia）；降級後保留文字／符號／狀態（P 段表）                                                                                                                                 |
| 4   | 不得用動效改變數字語意（不得用滾動計數掩蓋「待確認」）             | K1 SplitText filter 排除含「待確認」文字；K7 切換時「待確認」卡照常顯示原文字（不做消失/重新輸入）；K6 只動位置不動數字內容                                                                                               |
| 5   | 金額 tabular numbers，動效不得破壞對齊                             | 所有金額沿用既有 tabular-nums lining-nums class；SplitText 拆字元後字元 span 繼承父層 font-feature（未新增 class）；動畫只動 transform/opacity 不影響 layout 寬度                                                         |
| 6   | 任一畫面同時啟用的 K 類動效不得超過 3 種                           | 逐頁證明見「每畫面同時啟用的 K 類數量」                                                                                                                                                                                   |
| 7   | 不得「PowerPoint 切換」式動效（整頁淡入／fade-up 一路到底）        | 本批沒有整頁淡入；K6 只交錯 5 張卡、無 fade-up 包裝；ScrollTrigger 區塊進場是一次性 240ms 低調進場且每區塊獨立（非全頁串接）；區塊與區塊之間無連續淡入                                                                    |

## review-animations（emilkowalski）閘門評測

> 閘門技能安裝：`npx skills@latest add emilkowalski/skills`（審批者 B 補充 1 指定方式），安裝成功（含 review-animations、find-animation-opportunities、animation-vocabulary、emil-design-eng、apple-design 等九個 skill）；.agents/skills/ 與 skills-lock.json 維持常態未追蹤）。
> 前置（補充 1 建議）：以 find-animation-opportunities 的 Gate（Frequency／Purpose／Speed／Function）檢視本批落點——每次落點都通過四問：K6 交錯為 Group entrance（≤5 張、30–80ms stagger）；K3 展開為 Teleporting state（State indication）；K1 結算為 Rare（一次重要重算完成時）；K5 繪入為 Rare/first-time；K2/K8 為 Feedback；K4 為 Rare（成功頁）。

### 評測輸出（依閘門 Required Output Format）

#### Part 1 — Findings table

| Before | After                                                                     | Why                                                                                                         |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| （無） | K6 交錯只動 y（transform-only）、opacity 恆 1，160ms＋35ms stagger        | 數字先出現再動（紅線 1）；GPU-only；≤5 張符合 K6 契約                                                       |
| （無） | K3 展開收合走 Flip（250ms，scale:true＋absolute:true，ease power2.inOut） | 高度/layout 變化由 transform 補償，不觸發 reflow 動畫；220–300ms 契約內；Interruptibility：Flip 可 retarget |
| （無） | K7 三態切換 Flip.from 240ms＋clearProps                                   | 位置連續（state indication）；切換屬 tens/day → 動效 240ms、ease inOut、即時可中斷（再點即重新取 state）    |
| （無） | SplitText 僅 digit 字元 tween（220ms＋20ms stagger），非數字字元不動      | 幣別/小數點/千分位不參與拆分動畫；tabular 對齊由父層保持                                                    |
| （無） | 區塊進場 240ms ease-out、once                                             | Entering 用 ease-out（非 ease-in）；<300ms；反覆捲動不重播（once）；reduced-motion 下不建立                 |
| （無） | 落印 scale 0.94→1（非 scale(0)）＋opacity 0.001→1，240ms strong ease-out  | Never scale(0)——從 0.94 起符合閘門標準 5；一次完成（Occasional）                                            |
| （無） | recharts 長條 scaleY 0→1（transform-only）＋目標線不動                    | K5 契約「目標線固定、填色移動」；僅首次捲到播放（Rare）；資料更新不重播                                     |
| （無） | K8 :active scale(0.97) 180ms ease-out                                     | Button press feedback 100–160ms 近似（K8 契約定死 180ms）；只作用實際按鈕                                   |
| （無） | K2 hover 位移 150ms，@media (hover:hover) and (pointer:fine) 限定         | Hover gating（閘門標準 8）；150ms 契約                                                                      |

#### Part 2 — Verdict

1. **Feel-breaking regressions**：無。所有動效 ≤300ms（除 K1 520ms／K5 640ms 為 L0 契約時長，屬「一次重要重算完成時」與「僅首次進場」的罕見級別），easing 全為 ease-out／power2.out／strong ease-out／power2.inOut，無 ease-in。
2. **Missed simplifications**：無應刪未刪的動效——每一處都有 K 類契約對應（K1–K8 落點表）。
3. **Performance**：全部 transform/opacity；recharts 繪入設 transform-box；無 CSS variable 帶動 child transform；ScrollTrigger 區塊進場一次即 kill。
4. **Interruptibility & timing**：Flip 跳動可 retarget（再點擊重新 getState）；K8 為 CSS transition 可中斷；SplitText 以 timeline 播放、revert 還原；無 keyframes 用於動態元素。
5. **Origin, physicality & cohesion**：落印從 scale 0.94 起（非 0）；transform-origin bottom 用於長條長出；KPI 卡交錯無 origin 問題；與既有 shadcn/CSS 動效語氣一致（短、快、克制）。
6. **Accessibility**：CSS＋JS 雙層 prefers-reduced-motion；hover 動效限定 hover:fine 裝置；語言/符號/狀態在降級後全部保留。

**Decision：APPROVE** — 無 feel-breaking regression、無應刪動效、時長與 easing 在界線內、中斷性已處理、reduced-motion 全面尊重。

#### find-animation-opportunities 前置掃描（依補充 1 建議；只報告、不動手）

| #   | 位置                      | 今天的樣貌         | Purpose                   | Frequency                    | 建議動效                                         | 採納                 |
| --- | ------------------------- | ------------------ | ------------------------- | ---------------------------- | ------------------------------------------------ | -------------------- |
| 1   | ProfitKpiBoard 卡片       | 13 張一起出現      | Group entrance            | 首次載入／切行程（tens/day） | 30–80ms stagger、位置坐定（無 fade、無批次重排） | ✅ K6（限 5 張）     |
| 2   | TripEstimate 成本 section | 明細瞬間展開／收合 | State indication          | Occasional（使用者主動）     | Flip 220–300ms、摘要列固定                       | ✅ K3                |
| 3   | 費用摘要金額（儲存後）    | 數字直接跳新值     | State indication          | Rare（一次重要重算完成）     | 每位數字各自過渡 450–600ms                       | ✅ K1＋SplitText     |
| 4   | Dashboard 8 圖表          | 載入即全動         | Preventing jarring change | Rare／first-time             | 捲到才播、只播一次、目標線固定                   | ✅ K5＋ScrollTrigger |
| 5   | 下單成功 ✓ 圈             | 靜態               | Delight（Rare）           | Rare                         | 一次 500ms 脈衝、不循環                          | ✅ K4                |

**Rejected candidates（Gate 淘汰）**：

| 候選                            | 被哪一問淘汰                                                              |
| ------------------------------- | ------------------------------------------------------------------------- |
| Dashboard 全 13 卡交錯          | Frequency（tens/day）＋ K6 契約明定 ≤5 列 → 只留前 5                      |
| TripEstimate 輸入框 hover 抬升  | Function（資料輸入區不該移動）＋ K2 契約「可互動元素」                    |
| 切換行程的全卡組重排動畫        | Frequency（切行程為 routine 操作）→ 只做 160ms 位置坐定                   |
| PublicCart 購物車卡逐卡 fade-up | Function（買家要讀金額）＋ 紅線 7（fade-up 一路到底）→ 只做區塊級一次進場 |
| 圖表 Tooltip 動畫               | Frequency（高頻 hover）→ 無動畫（維持原樣）                               |
| BottomNav 切頁轉場              | Function（route 切換不該遮內容）＋ 紅線 7 → 不新增                        |

> ⚠️ 本評測由執行者（dsh）依閘門 SKILL.md 十標準自跑；正式閘門判定仍以審批者 B 覆核為準。

## 打包體積前後對照（gzip，上限 460 kB）

| 項目                                | 數值                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 基準（G4 末）shop-app 主 chunk gzip | 400.67 kB（raw 1,437.04 kB）                                                                                            |
| 本批主 chunk（index-BxfEEq7Z.js）   | **404.23 kB gzip（raw 1,444.96 kB）**                                                                                   |
| 主 chunk 增量                       | **+3.56 kB gzip**（動效實作本身近乎零；既有 bundle 正常浮動）                                                           |
| GSAP 動態 chunk（非首屏載入）       | SplitText 3.35＋Flip 9.43＋ScrollTrigger 18.11＋gsap-core 27.68 ＝ **58.57 kB gzip**                                    |
| 上限                                | 460 kB（主 chunk；增量上限≈60 kB gzip＝工單明示）                                                                       |
| 判定                                | ✅ **主 chunk 404.23 ≤ 460；動態增量 58.57 ≤ 60 kB**                                                                    |
| 導入方式                            | 動態 import（loadMotion）：主 chunk 不含 gsap，gsap 家族為 async chunk，僅在 browser 非 reduced-motion 且實際使用時載入 |

> 導入方式：只 import gsap、gsap/ScrollTrigger、gsap/Flip、gsap/SplitText（無 gsap/all）；@workspace/shop-app 主 chunk 動態包含，未分叉額外 chunk 設定。

## 驗證鏈逐步結果

| #   | 步驟                              | 結果                                                                                                                                                    |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 0   | 自檢三項                          | ① prefers-reduced-motion 命中：CSS 規則＋motion.ts 守門（src 內 count 6）；② gsap/all 無輸出（0 hits）；③ 12 頁硬寫色 grep 無輸出（0）                  |
| 1   | codegen drift                     | **exit 0；GENERATED_DIFF=0**（orval api-client-react＋zod 產物與 HEAD 一致；最終複跑 exit 0 含 typecheck:libs）                                         |     |
| 2   | Prettier 全庫（pnpm exec、3.8.3） | **exit 0「All matched files use Prettier code style!」**                                                                                                |     |
| 3   | schema push                       | **exit 0（[✓] Changes applied）**                                                                                                                       |     |
| 4   | seed                              | **exit 0：V1_COST_DEFAULTS_SEEDED fixed=12 variable=7 purchase=1 total=20 operating_settings_id_1=1**                                                   |     |
| 5   | V1_FIXED_COST_SCHEMA_GUARD        | **=PASS**（表、欄位、20 種類別、singleton 全數核對）                                                                                                    |     |
| 5b  | V1_MOCK_IMPORT_GUARD              | **=PASS**（mocks/ 僅 PreviewChart.tsx 引用；git ls-files 掃描無違規）                                                                                   |     |
| 6   | DB routes                         | **107 tests / 107 pass / 0 fail / 0 skipped / 0 todo**（duration 97,075 ms，exit 0）                                                                    |     |
| 7   | pure suites（基準 477）           | **477 tests / 477 pass / 0 fail / 0 skipped / 0 todo**（duration 174,616 ms；與基準一致；最終隔離環境複跑 3 次皆 477/0）                                |     |
| 8   | Playwright                        | 本機未驗，留待 CI（延續包 23／包 24 先例：Playwright 不在本機驗證鏈；不謊報）                                                                           |
| 9   | Typecheck ×4                      | **tsc --build＋api-server＋mockup-sandbox＋shop-app＋scripts 全數 exit 0**（容器複驗；本機初檢同）                                                      |     |
| 10  | Build＋gzip                       | **Build 成功**（api-server 56.7s＋mockup-sandbox 39.8s＋shop-app 4m55s）；shop-app 主 chunk 1,444.96 kB raw／**404.23 kB gzip** ≤ 460 ✓（明細見體積表） |     |

## 已知限制

- **SplitText 注意事項**：拆字元動畫只在瀏覽器（matchMedia 存在）播放；jsdom 環境不動畫——因此動畫行為無 jsdom 單元測試覆蓋（F-10 掛鐘保護優先）。
- **ScrollTrigger 區塊進場**：瀏覽器實測未做（本機 Windows 無法 build/run）；視覺驗證留待 CI／審批者 B 實機覆核。
- **recharts 繪入**：長條 scaleY 依賴 transform-box: fill-box（現代瀏覽器均支援）；若 recharts 內部未來改 DOM 結構（如 .recharts-rectangle class 改名），繪入選擇器需同步更新。
- **K6 交錯僅在 estimate 物件變更（切換行程／首次載入）時觸發**：同行程內資料手動刷新（無）不重播。
- **ProfitKpiBoard 三態切換為本批新增的瀏覽能力**（board.actual／comparisonRows 既有資料現在可切換檢視）；F-10 測試 27/27 通過（dashboardPage 13 卡斷言、TripEstimate section 斷言皆保留）。
- **GSAP 動態載入**：motion 模組採 loadMotion() 動態 import（browser 且非 reduced-motion 才載入）——① 體積：Vite async chunk 分割，主 chunk 不增長；② 測試相容：node:test --experimental-test-module-mocks 以 CJS 模式載入 gsap 的 ESM .js 會 SyntaxError（實測 dailySkillGate 失敗特徵），動態載入使測試環境永不觸碰 gsap（jsdom 無 matchMedia → motionEnabled=false → 不載入）。477 全數通過為證。
- **node_modules 環境**：本批容器採用「全 node_modules 隔離 volume」方案（Windows 與容器各自持有獨立 node_modules，避免 symlink 混用）；Windows 本機 node_modules 於驗證期間重建，不影響 repo。

- 本批未動 DESIGN.md、ci.yml、pnpm-workspace.yaml（gsap 安裝僅動 shop-app package.json＋lockfile）、API 契約、schema、migration、printHelpers、ReceiptPreview、Settings。
- .agents/skills/、.claude/skills/、skills-lock.json 維持常態未追蹤（閘門技能安裝所生；未 git add）。

---

回報附：git log -1 → `96e0457 docs(ai-ops): add 82 G5 motion audit`（分支頭；完整鏈 c925a4a → c0bc33a → 57e3e6b → 96e0457）
