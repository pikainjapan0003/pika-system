# PHASE25 G5｜聲吶層動效（MO-1～MO-4）交付證據

## 結論與範圍

- 分支：`feat/v1-sonar-motion`
- 起點：`HEAD = origin/main = 1f271418b34a94bf57e6c4da8f1fa88a9280cb1d`
- 結果：MO-1～MO-4 完成；`review-animations` 閘門為 **Approve**；41/41 執行期檢查通過。
- 未 push、未開 PR、未 staged；未使用 Docker。
- 未新增套件；package／lock diff 為空；主包 gzip 增加 `1.62 kB`，低於 `5 kB` 說明門檻。
- 未執行審批者 B 已豁免的完整 DB／pure／Playwright 套件；本機執行 typecheck、受影響單元測試、build、執行期逐幀檢查與最終 Prettier。

## 先讀文件

已完整閱讀：

1. `C:\Users\Lnovo\Desktop\V1成本利潤模型計畫書\PHASE25_G4_GATE_REWRITE.md`
2. `C:\Users\Lnovo\Desktop\V1成本利潤模型計畫書\PHASE25_REGISTERED_FROZEN.md`
3. repo `DESIGN.md`「動效架構」（第 329 行起）及每畫面清單（第 360 行起）

實際 Desktop 檔名位於計畫書目錄根層；兩檔均可讀。未搜尋計畫書已註明不存在的三個旋鈕。8 筆凍結項均未處理，特別是 F-1 金額精度鏈。

## 六項工具的執行證據

技能安裝來源位於 `C:\Users\Lnovo\Desktop\pika-v1-phase24\.agents\skills`；崩潰後的工作樹本身未帶入 ignored `.agents` 目錄，因此從已安裝副本完整讀取各 `SKILL.md` 與必要 reference，再對本工作樹最終 source／metrics 實際執行。

### 1. review-animations｜完整輸出

以下為最終 source 與最新執行期證據的原始完整輸出：

| Before                                      | After                    | Why                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No blocking or non-blocking motion findings | No code change requested | Final-source review found no `transition: all`, `ease-in`, `scale(0)`, layout-property animation, uncontrolled keyframe toggle, or missing reduced-motion branch. Runtime gate passed all 41 checks in Chrome 151 (`phase25-g5-concurrent-final-metrics.json:1-42,227`). |

#### 3. Performance

- MO-1 is the existing 7s linear CSS rotation; MO-2 animates only `opacity`; MO-3 animates only `translate3d`, with exactly six 3px particles. The particles are clipped inside an `overflow-hidden` circular, `aria-hidden` layer, away from text and charts (`artifacts/shop-app/src/components/SonarBackground.tsx:11-48,167-205`; `artifacts/shop-app/src/index.css:353-387`).
- MO-4 limits transitions to `opacity` and `transform`; the outgoing layer's `position`, `inset`, and `width` are static layout setup, not animated properties (`artifacts/shop-app/src/index.css:396-425`). Runtime inspection confirmed the only transition properties were `opacity` and `transform` (`phase25-g5-concurrent-final-metrics.json:57-62,160-164,202-206`).
- The brief two-layer overlap is justified to prevent a blank trough and is bounded to 150ms. The outgoing tree is `inert`, `aria-hidden`, and removed on settlement (`artifacts/shop-app/src/components/ProfitKpiBoard.tsx:640-686,705-747`). Frame sampling confirmed combined opacity stayed above 0.95 at 75ms (`phase25-g5-concurrent-final-metrics.json:9,66-119`).

#### 4. Interruptibility & timing

- MO-4 uses CSS transitions—not keyframes—with the prescribed strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)` and a 150ms duration, within both the product's 150–250ms contract and the skill's sub-300ms UI limit (`artifacts/shop-app/src/index.css:401-425`).
- Rapid reversals capture the current computed `opacity` and `transform`, reuse the same keyed DOM nodes, and retarget from those presentation values instead of restarting from zero (`artifacts/shop-app/src/components/ProfitKpiBoard.tsx:95-113,349-397,640-745`).
- Forced 40ms reversals passed for both mode and category: the former incoming layer became outgoing, the former outgoing layer became incoming, composite opacity remained continuous, no keyframe/CSS animation appeared, final selection/content settled correctly, and no outgoing layer remained (`phase25-g5-concurrent-final-metrics.json:11-34,127-206`).
- Low measured cadence degrades MO-4 to an immediate state change with zero transitions, preserving responsiveness under load (`artifacts/shop-app/src/components/ProfitKpiBoard.tsx:297-378`; `phase25-g5-concurrent-final-metrics.json:35-37,210-225`).

#### 5. Origin, physicality & cohesion

- The content enters from `translate3d(0, 4px, 0)` and exits toward `-4px`; this avoids a pure-fade entrance while keeping movement restrained for a professional KPI dashboard (`artifacts/shop-app/src/index.css:413-425`).
- MO-1's 7s linear scan, MO-2's 0.18→0.30 opacity pulse, and MO-3's staggered 8.4–11.3s drift satisfy the slow, low-contrast sonar vocabulary without bounce or ornamental UI-scale motion (`artifacts/shop-app/src/components/SonarBackground.tsx:11-48,198-205`; `artifacts/shop-app/src/index.css:353-387`).
- The Dashboard treatment is isolated in a clipped 80px ambient band, while MonthlyProfit can select the quieter `breathe-only` profile (`artifacts/shop-app/src/components/SonarBackground.tsx:143-214`; `artifacts/shop-app/src/pages/Dashboard.tsx:229-231`; `artifacts/shop-app/src/pages/MonthlyProfit.tsx:158`). The inspected full-page frame shows no particle/text or sonar/KPI overlap.

#### 6. Accessibility

- `prefers-reduced-motion: reduce` hides MO-1, MO-2, and MO-3 completely and removes MO-4 movement/transition while forcing the incoming content to its readable final state (`artifacts/shop-app/src/index.css:443-488`; `artifacts/shop-app/src/components/ProfitKpiBoard.tsx:366-378`).
- Runtime reduced-motion evidence found zero MO animations, all three ambient elements at `display:none`, immediate mode/category results, no outgoing layer, zero transitions, and stable visible KPI text (`phase25-g5-concurrent-final-metrics.json:38-42,235-367`).
- Two reduced-motion captures taken one second apart have identical SHA-256 hashes, four KPI values remain rendered, and no KPI rectangles overlap (`phase25-g5-concurrent-final-metrics.json:263-367`).

Confidence: High. The conclusion is supported by source inspection, negative-pattern scanning, controlled 0/75/150ms frames, forced rapid reversals, native degraded-cadence behavior, reduced-motion screenshots, and a 41/41 passing runtime gate.

**Decision: Approve.**

### 2. find-animation-opportunities｜建議清單

執行說明：此工具原應在動手前使用，但補充要求是在實作開始後才加入，因此本次只能做回溯式機會掃描，據實標記。Repo-wide seam sweep 命中：feedback 55 檔、teleporting state 58 檔、surface 24 檔、group entrance 61 檔、gesture 3 檔、empty/success 35 檔；再逐一細查 G5 涉及的 KPI、Tab、圖表、導覽與聲吶層。

#### Part 1 — Opportunities table

通過完整四關 Gate 的新增機會：**0 項**。

| #   | Location | Today                             | Purpose | Frequency | Suggested motion |
| --- | -------- | --------------------------------- | ------- | --------- | ---------------- |
| —   | 無通過項 | G5 必要狀態橋接與環境動效均已涵蓋 | —       | —         | 不新增           |

#### Part 2 — Rejected candidates

- `components/ModeSegment.tsx:22-35`、`components/AnalysisTabs.tsx:67-80` — 新增滑動 pill／clip-path Tab indicator。**Rejected: Frequency。** 這是每日可操作數十次的核心切換，已有 200ms 選取色彩變化及 MO-4 內容 Crossfade；再加指示器位移會重複表達同一狀態並提高視覺負荷。
- `components/KpiSummaryGrid.tsx:14-31` — 金額 Number ticker／逐字跳動。**Rejected: Function。** 這是使用者正在閱讀及比對的金額；額外滾字會妨礙 RU-3 `tabular-nums` 對齊、首屏即讀與跨模式比對。重要重算已有凍結的 K1，不應疊加。
- `pages/Dashboard.tsx:150-180` 及圖表元件 — 再增加圖表線條繪入、重複 Scroll reveal 或全卡 stagger。**Rejected: Function。** 圖表是功能性資料；既有一次性進場已負責狀態橋接，再播會讓資料本身移動，且可能推高 K 類併發數。
- `components/SonarBackground.tsx:170-205` — Mouse tracking、Parallax、更多粒子或光暈。**Rejected: Purpose + Function。** 這些只是裝飾，出現在資訊密集的成本利潤工作台會搶走數字注意力；現有 6 粒子、7 秒掃描、低振幅呼吸已用完合理的 ambient motion 預算。
- `components/BottomNavigation.tsx:55-77` — 全頁 route transition／導覽滑動。**Rejected: Frequency。** 核心導覽是每日高頻操作；保留即時換頁及既有 200ms 色彩回饋，比加 page transition 更直接。

#### Part 3 — Verdict

介面不需要任何新增動效。高槓桿的缺口原本是預估／實際／差異與四分類內容瞬換，目前 MO-4 已填補；繼續增加只會讓高頻財務介面變慢、破壞資訊優先順序。由於沒有 surviving row，不建議再啟動 `improve-animations plan` handoff。

### 3. animation-vocabulary｜本批精準術語

#### MO-1

- **Rotate** — Spin an element around a point.
- **Loop** — An animation that repeats, a set number of times or infinitely.
- **Linear** — Constant speed. Avoid for UI; reserve for spinners or marquees.

對應：聲吶扇形以 `transform: rotate` 做 7s、`linear`、`infinite` 的 **Rotate Loop**；它是恆速掃描指示，不是使用者觸發的 UI entrance。

#### MO-2

- **Pulse** — A gentle repeating scale or opacity change to draw attention.
- **Alternate (yoyo)** — A loop that plays forward then reverses each iteration, instead of jumping back to the start.
- **Cubic-bezier** — A custom easing curve you define for precise control.

對應：只在 `opacity: 0.18 → 0.30` 間變化，以 4.8s `cubic-bezier(0.77, 0, 0.175, 1)` **Pulse**；`alternate` 使來回完整週期為 9.6s，不在端點跳回。

#### MO-3

- **Float** — A gentle, continuous up-and-down drift that makes a static element feel alive and weightless.
- **Translate** — Move an element along the X or Y axis.
- **Delay** — Time before an animation starts.
- **Orchestration** — Deliberately timing multiple animations so they feel like one coordinated motion.

對應：6 粒子以 `translate3d(0, 4px, 0) → translate3d(0, -7px, 0)` **Float**；8.4–11.3s 不同 Duration 加負 Delay 分散相位，構成低密度 **Orchestration**。

#### MO-4

- **Crossfade** — One element fades out as another fades in, in the same spot.
- **Continuity transition** — A change that keeps the user oriented by visually connecting before and after. For example, making the same rectangle bigger and smaller.
- **Ease-out** — Starts fast, ends slow. The default for most UI and anything responding to the user.
- **Interruptible animation** — An animation that can be smoothly redirected mid-flight instead of finishing first.
- **Hardware acceleration** — Animating transform and opacity lets the GPU keep motion smooth.
- **Reduced motion** — Respecting the user's prefers-reduced-motion setting by toning down or removing motion.

對應：舊／新內容同棧並行 **Crossfade**，搭配 outgoing `0 → -4px`、incoming `+4px → 0` 的 Translate；150ms `cubic-bezier(0.23, 1, 0.32, 1)` 強 **Ease-out**。快速反轉從 live presentation value 重定向，是 **Interruptible animation**；只動 opacity／transform，維持 **Hardware acceleration**。

### 4. animate｜實作判準與輸出

#### Gate result

- **MO-4：通過。** Frequency 為每日數十次，因此只允許近乎即時的 150ms／4px。Purpose 明確為 **State indication** 與 **Preventing a jarring change**。
- **MO-1～MO-3：規格強制項，不是此工具自行推薦的機會。** DESIGN.md 明定其為裝飾層；按工具本身，資訊密集介面的持續裝飾通常不會自主通過 Purpose／Function Gate。因此實際套用的是「只做明訂最低限度、互動時暫停、reduce 全關、拒絕所有擴張」。未把它們虛構成必要功能。
- K 類未由本工具「優化」：`src/lib/motion.ts` 對 `origin/main` diff 為空，SHA-256 為 `499240E8C0D6B90C00358024EDC0AFD1BB363B0B0FECDDCBEFC8A352893BABFE`。

#### Ingredients actually applied

| Motion             | Tool                               | Properties                  | Curve / duration                                          | Interruption                                                        |
| ------------------ | ---------------------------------- | --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| MO-1               | 既有 CSS animation                 | `transform: rotate`         | 7s `linear`, infinite                                     | 被動預定動效；MO-4 互動期間 pause                                   |
| MO-2               | CSS keyframes                      | `opacity`                   | 0.18→0.30；4.8s `cubic-bezier(0.77,0,0.175,1)`, alternate | MO-4 互動期間 pause                                                 |
| MO-3               | CSS keyframes                      | `transform: translate3d`    | 8.4–11.3s；同一 strong ease-in-out；6 顆分相位            | MO-4 互動期間 pause                                                 |
| MO-4               | CSS transitions＋`@starting-style` | `opacity`, `transform`      | 150ms `cubic-bezier(0.23,1,0.32,1)`                       | 讀取 computed presentation value 後 retarget；不用 keyframes／timer |
| Tab selected state | CSS color transition               | `color`, `background-color` | 200ms                                                     | reduce 下立即                                                       |

選擇 CSS 是「cheapest tool that works」：MO-1～3 是 predetermined ambient motion；MO-4 是 class/state toggle。沒有新增依賴，package／lock diff 為空；也沒有因現有 GSAP／Framer Motion 已安裝就強行使用。

#### Runtime gate evidence

最終 gate `passed: true`，41/41 checks 為 true：

- MO-4：`cssAnimationCount: 0`，只存在 opacity／transform transitions，Duration 唯一值為 150ms。
- 0ms：incoming `opacity 0, y 4`；outgoing `opacity 1, y 0`。
- 75ms：incoming `0.965983, y 0.13607`；outgoing `0.0340174, y -3.86393`，合成 opacity 約為 1，沒有空白 trough。
- 149.9ms：incoming `1, y ≈ 0`；outgoing `≈ 0, y -4`。
- 40ms 快速反轉時，mode 與 category 都把 before 的 incoming／outgoing presentation 值完整交換後續跑，最後 selected/content/idle 正確，無殘留 outgoing layer。
- 原生 cadence 降級實測：median rAF 約 25ms 時走 `degraded`，`transitionCount: 0`，約 23.7ms 取得最終狀態。
- `prefers-reduced-motion: reduce`：MO-1～3 均 `display:none`、`animationName:none`、animation count 0；MO-4 transition count 0、立即保留最終內容。
- Reduced 兩次截圖 SHA-256 相同，4 個 KPI 值均存在、0 組重疊。

#### Explicitly rejected implementation extras

未加 Spring、Bounce、Blur seam、Scale entrance、滑動 Tab indicator、Mouse tracking、Parallax、Number ticker、更多粒子或額外 stagger。這些不是解決目前狀態切換所需的最便宜工具，部分還會破壞資訊可讀性或 K 類上限。

### 5. apple-design｜MO 層吵鬧程度判斷

#### MO noise judgment

**判定：可接受，屬 calm ambient layer，沒有太吵。**

具體依據：

- 聲吶被限制在獨立圓形／裁切背景帶，不是 full-viewport moving background。
- MO-2 透明度只在 0.18–0.30，振幅 0.12；4.8s alternate 的完整來回週期約 9.6s。
- MO-3 只有 6 顆、3px、`primary / 0.14`，被圓形 `overflow-hidden` 裁切，`pointer-events:none`、`aria-hidden`，沒有落在 KPI 文字或圖表上。
- KPI 實機全頁截圖中，聲吶位於左上獨立區域；數字、控制、Tab、圖表維持主要視覺層級。
- MO-4 啟動時，掃描、呼吸、粒子與既有 whale controller 都會 pause；功能性狀態切換優先。

#### Response and agency

**通過。**

- 使用者選擇會同步 commit，沒有等 150ms 才更新控制狀態，也沒有 transition 期間鎖住輸入。
- outgoing layer 為 `aria-hidden`、`inert`、`pointer-events:none`；新狀態維持可操作。
- 低 cadence 不勉強播放，立即降級；實測約 23.7ms 完成。
- 快速連點後 mode/category 的 final selected、final content、idle state 全部正確，聲吶也恢復未暫停狀態。

#### Interruptibility

**對離散 Tab／Segment 切換通過。**

40ms 反轉實測：

- before incoming `opacity .800477, y .798093`
- after outgoing `opacity .800477, y .798093`
- before outgoing `opacity .199523, y -3.20191`
- after incoming `opacity .199523, y -3.20191`

這證明重定向從目前畫面 presentation value 開始，沒有位置／透明度跳躍；同一 React key 所對應 DOM 也被重用。

限制說明：CSS transition 可證明位置連續，但不會像 Spring 一樣保證 reversal 的 velocity handoff。對 150ms、4px、離散狀態切換，這個取捨合理且 bundle 成本最低；若未來改成可 1:1 拖曳的 pager，才應改用帶 velocity 的 Spring。現況不建議擴張。

#### Spatial consistency and reduced motion

- 舊、新內容維持同一 layout stack；enter／exit 只沿同一垂直 4px 軸移動，0／75／150ms 逐幀沒有 blank frame。
- Reduced-motion 採專案比 Apple 一般建議更嚴格的契約：MO 全關、MO-4 靜態立即切換。
- Reduced 實測保留標題、四個 KPI、金額文字、選取狀態；兩張截圖 hash 完全相同且無 bbox overlap。

#### Apple verdict

**PASS，建議維持現狀，不再增加 motion。** 目前最好的一點是輸入 agency 與 presentation continuity；唯一技術取捨是離散 CSS retarget 不做 velocity handoff，但以此交互頻率、150ms 時長與 4px 位移，改成 Spring 會增加複雜度而沒有可證明的使用者收益。

信心：**高（0.95）**。依據為最終程式碼、41/41 runtime checks、0／75／150ms 逐幀截圖、40ms reversal 數值與 reduced-motion 雙截圖；最終主觀音量仍可由 Owner 在 G6 實機觀看確認。

### 6. Huashu Motion principles｜完整評語

範圍說明：Huashu 明訂 production Web App 不走其原型生成流程；本次僅依使用者要求，套用其 motion principles 做既有產品的唯讀專家評審，不做三方向提案、不產生 prototype，也未修改任何檔案。已完整閱讀指定的 `SKILL.md`、`animation-pitfalls.md`、`animations.md`。

評審基準以最新 `phase25-g5-concurrent-final-metrics.json` 為準；舊 sequential 75+75ms MO-4 證據已排除。

#### Keep

- 動效階層與噪音控制正確：
  - MO-1 是 `7s linear infinite` 順時針掃描，四分之一圈截圖與 7000ms 回圈證明角速度連續，沒有 bounce、scale pulse 或色彩閃爍。
  - MO-2 僅 tween `opacity: 0.18 → 0.30`，delta `0.12`、週期 `4.8s`；沒有動 layout 或 transform。
  - MO-3 固定 6 顆、3px、alpha 0.14，個別週期 8.4–11.3s 且用負 delay 錯峰。量測為 0 次文字重疊，粒子全部被雷達圓形容器 clip。
  - 7s／4.8s／8.4–11.3s 為非同步節奏，避免所有裝飾同時「吸氣／亮起」造成機械噪音。
  - 月報一般入口降為 `breathe-only`；Dashboard ambient 無鯨魚 renderer、限制在 80px clipped text-free band。這是合適的 density ladder。
  - MO-4 互動期間會 pause 掃描、呼吸、粒子及鯨魚，內容切換優先於裝飾層，符合 signal-over-decoration。
- MO-4 已是正確的 concurrent crossfade：
  - 單一 `150ms`，只動 `opacity`、`transform`，曲線 `cubic-bezier(0.23, 1, 0.32, 1)` 是前段快速收斂的 expo-out 類曲線。
  - outgoing 為 `0 → -4px`，incoming 為 `+4px → 0`；方向一致、位移幅度小，不會被誤讀為頁面導航。
  - 0ms：old 1 / new 0；75ms：old `0.0340174` / new `0.965983`；149.9ms：old 約 0 / new 1。每個抽樣點合成 opacity 約等於 1，無純空白 trough。
  - 中點接近完成是曲線設計結果，不是時長縮短；視覺感受是即時回應後短暫 settle，適合 KPI tab。
- 快速反向切換 continuity 已修正：
  - `ProfitKpiBoard.tsx:96` 先讀 computed opacity/transform，再透過 keyed reorder 交換兩層。
  - mode 與 category 在 40ms retarget 前為 incoming `0.800477/+0.798px`、outgoing `0.199523/-3.202px`；retarget 後兩組 presentation value 精確交換，合成亮度仍連續。
  - 最新量測同時確認 `sameReactKeysReuseDom`、`presentationContinuity`、`compositeOpacityContinuity`、最終 selection/content 正確、settle 後 outgoing 清除且 sonar 恢復。
  - 這不是重新從 opacity 0/1 起跑，而是從當前畫面狀態反向續行，符合 Huashu「場景切換要連續」原則。
- 首幀與可讀性：
  - 初始狀態直接使用 `.mo4-layer-live`，KPI 不等待 cadence sampling 或動效才顯示。
  - 0ms 截圖已有完整四張 KPI；reduced layout 量測為 4 個主值、0 對 KPI 卡互相重疊。
  - incoming/outgoing 同時存在時，outgoing 有 `aria-hidden`、`inert`、`pointer-events:none`，不會形成可操作的重複 UI。
  - 金額字寬、卡片欄線及 tabular alignment 在三個 MO-4 frame 中穩定。
- 語意 token：
  - 雷達只使用 `hsl(var(--primary))`、`hsl(var(--chart-4))`、`border-border`、`bg-background`、`text-primary`；沒有新增 hard-coded RGB/hex。
  - MO-4 本身不 tween color，避免數值切換時出現不必要的語意暗示。
- reduced-motion 與 adaptive degradation：
  - reduce 下 MO-1～MO-3 均 `display:none`、animation count 0；MO-4 outgoing 移除、incoming 直接 final state。
  - 兩張 reduced 截圖 SHA-256 完全相同，間隔 1 秒仍無視覺變化；document animation count 0，結果文字、狀態與四個 KPI 均保留。
  - native cadence 在本機被判定 degraded，切換於 `23.7ms` 完成、transition count 0、outgoing count 0；符合低 cadence 時「同步呈現結果」的 content-first 降級。
  - full path 則由實際 final source 加 synthetic stable cadence 驗證，並非舊 simulator。

#### Fix

- Fatal：無。
- Important：無。
- Optimization：
  - `index.css:401` 把 `will-change` 同時放在 live、incoming、outgoing。功能正確，但大型趨勢圖可能讓 live layer 長期保留 compositor 資源；日後若 GPU memory profiling 顯示壓力，可只在 active incoming/outgoing 啟用。這不是 G5 阻擋項。
  - cadence 目前只在 mount 後取樣一次。策略偏保守且安全；若未來需要因背景分頁／裝置熱降頻而動態恢復或再降級，可在 `visibilitychange` 後重新取樣。現有 150ms compositor-only transition 加上互動時 sonar pause，風險低。
  - G6 若要純視覺驗收 rapid retarget，可補 40ms 點擊前／後兩張逐幀圖；目前數值與 DOM identity 證據已足以證明 continuity，但不如逐幀圖直觀。

#### 評分與 Verdict

- 噪音／密度：9.6/10
- 節奏／方向：9.7/10
- crossfade continuity：10/10
- 首幀／資料可讀性：9.8/10
- reduced-motion／adaptive degradation：10/10
- 語意 token／compositor hygiene：9.6/10

總評：**9.8/10 — APPROVE**。

無 Huashu Motion principles 阻擋項，可進 G6。唯一需在回報中說清楚的是：本機 native cadence 走即時降級，因此完整 150ms 動畫證據來自「相同 final source + forced stable cadence」；這是設計好的 adaptive degradation，不應誤報成本機原生播放了完整動畫。

## MO-1～MO-4 實作登記

| 項目                | 結果                                                                                                                                  | 實作位置與數值                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MO-1 聲吶掃描       | **已存在故未重做**；確認 G4 的 `SonarBackground` 已是純 CSS/SVG 7 秒一圈，直接沿用並補登記、測試及 reduced contract，沒有疊第二個掃描 | `src/components/SonarBackground.tsx:198-206`；`animate-[spin_7s_linear_infinite]`、`data-duration-ms="7000"`                                                                                                                                      |
| MO-2 微弱呼吸光     | 完成                                                                                                                                  | `src/components/SonarBackground.tsx:169-174`、`src/index.css:353-370`；只 tween opacity `0.18 → 0.30`，delta `0.12 ≤ 0.15`；4.8s `cubic-bezier(0.77,0,0.175,1)` alternate                                                                         |
| MO-3 少量漂浮粒子   | 完成                                                                                                                                  | `src/components/SonarBackground.tsx:11-48,175-196`、`src/index.css:373-388`；固定 6 顆（≤8）、3px、`primary/0.14`、8.4–11.3s `translate3d`；圓形 clipped、`aria-hidden`、`pointer-events:none`，實測文字重疊 0                                    |
| MO-4 模式／分類切換 | G4 批次 2 只有舊的 sequential 100ms timer，**未滿足 150–250ms 且不可中斷，故沒有視為既有完成**；本批改為 concurrent 150ms crossfade   | `src/components/ProfitKpiBoard.tsx:38,96-113,336-433,630-747`、`src/index.css:396-425`、`src/components/ui/tabs.tsx:30`；opacity＋transform、4px、強 ease-out；40ms reversal 從 computed presentation value retarget；低 cadence／reduce 立即降級 |

補充：MO-4 切換開始時會暫停 MO-1～MO-3 與既有 whale controller，settle 後恢復；優先保護功能性 K／內容切換。初始 KPI 用 live layer 同步顯示，不等待 cadence sampling 或動畫。

## 更新後每畫面動效清單

| 畫面家族                      | K 類       | K 種數 | MO 類                                         | MO 種數 | 處置                                                 |
| ----------------------------- | ---------- | -----: | --------------------------------------------- | ------: | ---------------------------------------------------- |
| 首頁（營運工作台／Dashboard） | K1、K3、K8 |      3 | MO-1、MO-2、MO-3（80px clipped ambient band） |       3 | K 達上限；MO 降為無文字背景帶、互動時 pause          |
| KPI 頁（分析室）              | K1、K4、K8 |      3 | MO-1、MO-2、MO-3、MO-4                        |       4 | K 達上限；MO 與 K 分類，MO-4 期間 ambient pause      |
| Trips                         | K3、K2、K8 |      3 | 無                                            |       0 | 不再加頁首 MO-2，避免 K 滿載時干擾                   |
| TripEstimate                  | K1、K3、K8 |      3 | 無                                            |       0 | 維持既有 K 結構                                      |
| TripActual                    | K4、K8     |      2 | 無                                            |       0 | 維持既有 K 結構                                      |
| TripComparison                | K7、K8、K2 |      3 | 無                                            |       0 | 維持既有 K 結構                                      |
| MonthlyProfit                 | K5、K8     |      2 | MO-2；進入 KPI view 時另有 MO-4               |       2 | 一般入口使用 `breathe-only`；不啟用掃描／粒子        |
| Products                      | K2、K8     |      2 | 無                                            |       0 | 維持既有 K 結構                                      |
| Orders                        | K4、K8     |      2 | 無                                            |       0 | 維持既有 K 結構                                      |
| More                          | K8         |      1 | 無                                            |       0 | 維持既有 K 結構                                      |
| 客人端 6 頁（PublicCart 等）  | K1、K3、K8 |      3 | 無                                            |       0 | DESIGN.md 允許弱化 MO-1 或無；選擇無，避免客人端干擾 |

沒有任何畫面 K 類 >3；沒有更改或降級 K 類。MO 另行計數。

## 最終執行期 gate 與逐幀數值

瀏覽器：Chrome `151.0.7922.174`。最終原始 metrics：`phase25-g5-motion/phase25-g5-concurrent-final-metrics.json`。

```json
{
  "passed": true,
  "checkCount": 41,
  "allChecksTrue": true,
  "consoleErrors": [],
  "pageErrors": [],
  "forcedFullTransitionProperties": ["opacity", "transform"],
  "forcedFullTransitionDurationsMs": [150],
  "cssAnimationCountForMo4": 0,
  "nativeCadence": "degraded",
  "nativeTransitionCount": 0,
  "reducedMoAnimationCount": 0,
  "reducedDocumentAnimationCount": 0
}
```

控制 cadence 的同一份最終 production source 逐幀：

| 時點    | Incoming                 | Outgoing                  | 合成 opacity | 判定            |
| ------- | ------------------------ | ------------------------- | -----------: | --------------- |
| 0ms     | `opacity 0; y +4px`      | `opacity 1; y 0`          |            1 | 初始兩層正確    |
| 75ms    | `0.965983; y +0.13607px` | `0.0340174; y -3.86393px` |    1.0000004 | 無 blank trough |
| 149.9ms | `1; y ≈0`                | `≈0; y -4px`              |           ≈1 | 最終狀態正確    |

40ms 快速反轉（mode 與 category 兩者相同）在 retarget 前後精確交換 presentation value：

```text
before incoming = opacity 0.800477, y +0.798093
after  outgoing = opacity 0.800477, y +0.798093
before outgoing = opacity 0.199523, y -3.20191
after  incoming = opacity 0.199523, y -3.20191
```

最終 selection/content/idle 均正確、same keyed DOM 被重用、settle 後 outgoing count 0、sonar pause 已清除。

本機 native rAF median `25ms`，依設計走 `degraded`；實測 `23.7ms` 完成、transition count 0、outgoing count 0。完整 150ms 動畫證據來自相同最終 source 加 forced stable cadence；未誤報為本機 native 播放完整動畫。

## prefers-reduced-motion 實測

最終 Chrome emulate `prefers-reduced-motion: reduce` 結果：

| 元素／行為             | display / animation                                     | 結果                 |
| ---------------------- | ------------------------------------------------------- | -------------------- |
| MO-1 `radar-sweep`     | `display:none`; `animationName:none`; animation count 0 | 關閉                 |
| MO-2 `sonar-breathe`   | `display:none`; `animationName:none`; animation count 0 | 關閉                 |
| MO-3 `sonar-particles` | `display:none`; `animationName:none`; animation count 0 | 關閉                 |
| MO-4 mode／category    | transition count 0；outgoing layer 0                    | 立即切到最終內容     |
| 結果內容               | 4 個 KPI 值、標題、選取狀態存在；bbox overlap 0         | 保留 RU-8 結果／狀態 |

相隔 1 秒兩張最終 reduced 截圖 SHA-256 均為：

```text
d37989aea1fed2776728b040ae5a1ff5d3ea84dfa6b8f53b969079869170eec2
```

因此靜態畫面逐像素相同；document animation count 0。CSS contract 位於 `src/index.css:443-488`。

## K 類時長完整性

`lib/motion.ts` 未修改：

```text
MOTION_WORKTREE_BLOB=aae8b2cebcfc6042ec98ba49bca366a6a12cd974
MOTION_INDEX_BLOB=aae8b2cebcfc6042ec98ba49bca366a6a12cd974
MOTION_BASE_BLOB=aae8b2cebcfc6042ec98ba49bca366a6a12cd974
MOTION_SHA256=499240E8C0D6B90C00358024EDC0AFD1BB363B0B0FECDDCBEFC8A352893BABFE
MOTION_DIFF_LINES=0
```

`git diff origin/main -- artifacts/shop-app/src/lib/motion.ts` 輸出為空；K1～K8 時長數字與結構均未更改。

## Build 與主包 gzip

最終 production build 通過：

```text
> @workspace/shop-app@0.0.0 build
> vite build --config vite.config.ts

vite v7.3.3 building client environment for production...
✓ 2639 modules transformed.
dist/public/index.html                              1.10 kB │ gzip:   0.59 kB
dist/public/assets/index-DQOWmVhJ.css              128.58 kB │ gzip:  21.68 kB
dist/public/assets/SplitText-DRANMYtL.js             8.29 kB │ gzip:   3.35 kB
dist/public/assets/Flip-DpRWOvf3.js                 17.57 kB │ gzip:   9.43 kB
dist/public/assets/ScrollTrigger-B0mWTQCV.js        42.48 kB │ gzip:  18.11 kB
dist/public/assets/index-D4u6HSKp.js                88.94 kB │ gzip:  27.68 kB
dist/public/assets/createParticleWhale-DsfcNsvg.js 373.31 kB │ gzip: 133.85 kB
dist/public/assets/index-D8NO4fOv.js             1,509.21 kB │ gzip: 422.51 kB
✓ built in 2m 53s
```

- 基準：`420.89 kB gzip`
- 本批：`422.51 kB gzip`
- 差異：`+1.62 kB gzip`，未超過 `5 kB`
- 無新增 dependency；MO-1～MO-3 為 CSS／SVG／現有 component，package／lock diff 為空。

崩潰後 WSL 的 `LxssManager` 停止且目前權限無法重啟，因此 build 改用 Windows Node 與既有 pnpm cache 中的 platform bindings；曾有一次漏設既有 `PORT`／`BASE_PATH` 的環境設定重試，補齊後即為上述成功輸出。沒有使用 Docker。

## Typecheck

最後一次 production source 編輯後執行 repo 根目錄 `pnpm typecheck`，exit `0`：

```text
> pika-v1-cost-profit@ typecheck
> pnpm run typecheck:libs && pnpm -r --workspace-concurrency=1 run typecheck

> pika-v1-cost-profit@ typecheck:libs
> tsc --build

Scope: 4 of 5 workspace projects
artifacts/api-server typecheck: Done
artifacts/mockup typecheck: Done
artifacts/shop-app typecheck: Done
scripts typecheck: Done
```

## 受影響單元測試

最後一次 production source 編輯後，兩組成功 invocation 合計 **14/14 pass、0 fail**：

### Sonar／MO contract：8/8

```text
✔ MO-1 exposes the existing seven-second decorative radar sweep
✔ MO-2 keeps the breath layer decorative and within the opacity budget
✔ MO-3 renders six clipped, text-free decorative particles
✔ the dashboard ambient variant reuses MO-1 through MO-3 without a whale
✔ the monthly-profit profile keeps MO-2 without scan or particles
✔ an MO-4 interaction pauses every sonar layer until the timeline finishes
✔ MO-4 uses an interruptible concurrent 150ms transition with a low-cadence fallback
✔ reduced-motion contract removes every MO sonar layer
tests 8
pass 8
fail 0
```

### Dashboard affected behavior：6/6

```text
✔ dashboard no longer renders the finance-heavy KPI board
✔ recent order item renders its total through the decimal money formatter
✔ dashboard quick actions are real links instead of inert buttons
✔ no trips returns the required dashboard empty state without misleading zero money
✔ KPI summary stays compact and preserves backend outcome while adding the ambient sonar band
✔ preview charts preserve signed state semantics and accessible summaries
tests 6
pass 6
fail 0
duration_ms 98468.1759
```

誠實記錄 setup-only 重試：第一個 Windows command 的 loader path 使用 `.\\...`，Node 回報 `ERR_INVALID_MODULE_SPECIFIER`；修正為 `./...` 後 sonar 8/8 通過。合併 invocation 中 Dashboard 因未帶 TSX tsconfig alias 而找不到 `@/components`；設定 `TSX_TSCONFIG_PATH` 後單獨執行即 6/6。這兩次是 Windows runner 參數問題，不是測試 assertion 失敗。

## Prettier

改動文字檔已執行：

```text
artifacts/shop-app/src/components/ProfitKpiBoard.tsx 1365ms (unchanged)
artifacts/shop-app/src/components/SonarBackground.tsx 163ms (unchanged)
artifacts/shop-app/src/components/ui/tabs.tsx 47ms (unchanged)
artifacts/shop-app/src/index.css 1102ms (unchanged)
artifacts/shop-app/src/pages/Dashboard.tsx 642ms (unchanged)
artifacts/shop-app/src/pages/MonthlyProfit.tsx 195ms (unchanged)
artifacts/shop-app/src/test/dashboardPage.test.mjs 317ms (unchanged)
artifacts/shop-app/src/test/sonarBackground.test.mjs 151ms (unchanged)
artifacts/shop-app/qa-screenshots/phase25-g5-concurrent-gate.cjs 819ms (unchanged)
artifacts/shop-app/qa-screenshots/phase25-g5-motion.capture.mjs 717ms (unchanged)
artifacts/shop-app/qa-screenshots/phase25-g5-native-capture.cjs 329ms (unchanged)
artifacts/shop-app/qa-screenshots/phase25-g5-native-server.mjs 76ms (unchanged)
artifacts/shop-app/qa-screenshots/PHASE25_G5_EVIDENCE.md 967ms
artifacts/shop-app/qa-screenshots/phase25-g5-motion/phase25-g5-concurrent-final-metrics.json 114ms
artifacts/shop-app/qa-screenshots/phase25-g5-motion/phase25-g5-final-metrics.json 175ms
artifacts/shop-app/qa-screenshots/phase25-g5-motion/phase25-g5-native-final-metrics.json 49ms (unchanged)
artifacts/shop-app/qa-screenshots/phase25-g5-motion/phase25-g5-pre-transitionend-metrics.json 80ms (unchanged)
```

本報告寫定前第一次全 repo check：

```text
Checking formatting...
All matched files use Prettier code style!
```

本次插入實際輸出後只再以 Prettier 格式化本報告，然後執行同一條全 repo 終局 check；最終回報附該次完整輸出。終局 check 後不再編輯檔案。

## 實機逐幀截圖

最終 Owner 檢視組：

- `phase25-g5-motion/phase25-g5-concurrent-final-board.png` — 最終 KPI 全畫面
- `phase25-g5-motion/phase25-g5-concurrent-final-mo4-mode-000ms.png` — MO-4 0ms
- `phase25-g5-motion/phase25-g5-concurrent-final-mo4-mode-075ms.png` — MO-4 75ms
- `phase25-g5-motion/phase25-g5-concurrent-final-mo4-mode-150ms.png` — MO-4 149.9/150ms
- `phase25-g5-motion/phase25-g5-concurrent-final-reduce-a.png` — reduced A
- `phase25-g5-motion/phase25-g5-concurrent-final-reduce-b.png` — reduced B（與 A hash 相同）
- `phase25-g5-motion/phase25-g5-final-radar-0000ms.png`
- `phase25-g5-motion/phase25-g5-final-radar-1750ms.png`
- `phase25-g5-motion/phase25-g5-final-radar-3500ms.png`
- `phase25-g5-motion/phase25-g5-final-radar-5250ms.png`
- `phase25-g5-motion/phase25-g5-final-radar-7000ms.png` — MO-1 一圈的 0／¼／½／¾／1 圈組
- `phase25-g5-motion/phase25-g5-final-dashboard-ambient.png` — Dashboard 80px ambient band
- `phase25-g5-motion/phase25-g5-final-mobile-390-full.png` — 390px mobile 全頁

`phase25-g5-final-metrics.json` 的 MO-1～MO-3／Dashboard／mobile 段落仍有效；其中舊 sequential MO-4 段落已作廢，**MO-4 僅採最新 `phase25-g5-concurrent-final-metrics.json`**，避免混用舊證據。

## 禁區、精度與完整性稽核

最後唯讀稽核：

```text
FORBIDDEN_CHANGED_HITS=0
FORBIDDEN_STATUS_HITS=0
MANIFEST_CHANGED_HITS=0
TRACKED_BANNED_MONEY_API_HITS=0
UNTRACKED_BANNED_MONEY_API_HITS=0
DOCKER_CONFIG_CHANGED_HITS=0
CHANGED_PATCH_DOCKER_TOKEN_HITS=0
GIT_DIFF_CHECK_EXIT=0
```

涵蓋 `components/particle-whale/**`、`lib/db/migrations/**`、backend、`artifacts/api-server/**`、OpenAPI、generated、所有 package／lockfiles。本批新增的 TS／TSX／JS／MJS 行以 `(Number|parseFloat|parseInt|toFixed)\s*\(` 掃描，命中 0。語意顏色沿用 `primary`／`chart-4`／`border`／`background` token，未新增 hard-coded RGB／hex。

## 本機無法／未執行項目

- 依審批者 B 調整，本批未在本機跑完整 DB routes 113／pure 446／Playwright 15；需由 push 後 CI 負責，但本任務明令不得 push，因此未觸發 CI。
- 本機 native Chrome 因 rAF median 25ms 依產品策略自動走 immediate degradation；完整 150ms 路徑使用同一份最終 production source 加 synthetic stable cadence 驗證。這是實際 final source，不是 mock transition component，但不是 native cadence 播放，已具名揭露。
- 沒有製作影片；任務允許「錄影或逐幀截圖」，本批交付 0／75／150ms MO-4、MO-1 四分之一圈與 reduced 雙圖。
- 崩潰後 WSL 服務不可用；所有最終成功驗證改由 Windows Node／Chrome 完成。沒有請求系統管理員授權，也沒有使用 Docker。
