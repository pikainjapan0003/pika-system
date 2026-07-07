# 01 Session 計劃：每個 session 怎麼開場、讀什麼、不讀什麼

> 目的：弱模型 session 開場只花最少 token 就定位到正確文件與任務。

## 文件層級（誰引用誰）

```text
AGENTS.md                 ← 短入口，所有模型必讀，>150 行就要瘦身
CLAUDE.md                 ← 既有 Dev Handoff Relay A/B 協議（L0，不改；禁止事項優先於一切）
docs/ai-ops/*             ← 長期制度資料庫（本目錄）
docs/order-step*.md       ← 歷史功能 spec（90 份，按需查，不要全讀）
.agents/memory/           ← 技術踩坑筆記（既有慣例，沿用）
dev-handoff/              ← A/B handoff 狀態檔（不 commit，依 CLAUDE.md 操作）
```

規則收斂原則：**弱模型需要明確，強模型需要留白**——本目錄的規則寫給弱模型（具體、有判準、有範例）；強模型可以在不違反最小規則下自行簡化流程，但不可跳過驗證。

## 開場流程（照做，不要發明新流程）

1. 讀 `AGENTS.md`（唯一必讀）。
2. 判斷任務類型，讀對應檔（每類最多再讀 1-2 份）：

| 任務類型 | 讀 | 不要讀 |
|---|---|---|
| 改功能／寫程式 | 03（完成定義＋高風險判準）；要動的檔案本身 | 90 份 step 文件全掃（要查就派 Explore agent） |
| 成本／金額／訂單總額 | 03 全檔＋12（拍板清單，未答的公式禁做）＋10（欄位對照） | — |
| 派工／多 agent | 02＋04 | — |
| 踩坑、規則衝突、改制度檔 | 05 | — |
| 接手上個 session | 06＋dev-handoff/latest-*.md | 整個 docs/ |
| 查歷史決策 | 派 Explore agent 搜 `docs/order-step*` 關鍵字 | 自己逐檔讀 |

3. 動手前如果要動 dev-handoff/，先確認 worker 身份（CLAUDE.md 規定：任務沒指定 A/B 就要問，不可推定）。
4. 收尾：read-back → 更新 handoff（若適用）→ 踩坑寫 05 或 .agents/memory → 回報含路徑與驗證方式。

## 指令速查（2026-07-07 實查，來源 root 與各 workspace package.json）

```text
typecheck 全部： pnpm run typecheck
build 全部：     pnpm run build
API 測試：       node --experimental-test-module-mocks --import tsx/esm --test src/routes/<name>.test.mjs
                 （在 artifacts/api-server 下執行；部分測試 mock @clerk/express，缺
                 --experimental-test-module-mocks 會失敗——正確 runner 以各測試檔頭註解為準。
                 需 DATABASE_URL；測試會建立/清除真實資料，禁止指向 production）
DB schema push： pnpm --filter @workspace/db run push   （lib/db/package.json name=@workspace/db）
codegen：        lib/api-spec 的 orval codegen（改 API spec 後必跑，生成物在 lib/api-zod、lib/api-client-react）
前端 dev：       artifacts/shop-app → pnpm dev
```

## 收斂與去重規則

1. 同一規則出現三次 → 保留 docs/ai-ops 一份，其他改引用。
2. 過時內容（引用不存在的檔案、被新規則取代）→ 直接刪，並在 05 Lessons Log 記一行刪了什麼、為什麼。
3. 長內容不放入口檔：AGENTS.md 每節新增 >10 行時，抽成 docs/ai-ops 檔案＋一行引用。
4. 不要一次載入全部長文件；本表沒列到的檔案，代表預設不讀。
