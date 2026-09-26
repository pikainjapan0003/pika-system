# 05 維護協議：規則怎麼長、怎麼瘦、怎麼死

## 1. 檔案權限分級

| 級別        | 檔案                                                                                                          | 規則                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| L0 永不直改 | `CLAUDE.md`（Dev Handoff 協議）、`docs/order-step*.md` 既定 spec、`lib/api-zod` `lib/api-client-react` 生成物 | 要改先問使用者；生成物只能由 codegen 更新 |
| L1 改前先問 | `AGENTS.md` 的最小規則清單、`shippingFee.ts` 費率表、任何商業參數、`data/` 既有資料檔                         | 提案＋理由＋後果，等使用者批准            |
| L2 可自行改 | `docs/ai-ops/*`（含本檔 Lessons Log）、`.agents/memory/*`、程式碼（依 03 檔判準與驗證）、新增文件             | 改完 read-back＋回報路徑                  |

## 2. 踩坑寫回哪裡（兩個 log 的分工）

- **技術坑**（框架、工具、語法、build/test 的坑）→ 沿用既有慣例 `.agents/memory/`：一坑一檔＋更新 `MEMORY.md` 索引。
- **流程／制度坑**（派工失敗、驗證漏洞、規則衝突、模型調度錯誤）→ 本檔下方 Lessons Log。
- 判斷標準：這個坑「換一個 repo 還會踩」→ 技術坑；「換一個流程就不會踩」→ 制度坑。兩邊都像就寫制度坑。

## 3. 教訓格式（Lessons Log 每條照此格式）

```markdown
### YYYY-MM-DD - 事件標題

- 觸發情境：
- 發生錯誤：
- 根因：
- 正確做法：
- 要更新的規則：（沒有就寫「暫不升級，觀察是否再發生」）
- 可刪除或合併的舊規則：（沒有寫「無」）
```

## 4. 精簡規則（防膨脹，數字是硬門檻）

1. Lessons Log 超過 **20 條** → 必須整理：重複模式升級成上方永久規則或 03 檔判準，原始條目刪除。
2. `AGENTS.md` 超過 **150 行** → 把細節移到 `docs/ai-ops/*`，入口只留一行引用。
3. 同一規則出現 **3 次** → 保留 docs/ai-ops 一份，其他改引用。
4. 每次整理要在 Lessons Log 記一條「YYYY-MM-DD 整理紀錄：合併/刪除了什麼」。

## 5. 淘汰過時規則

- 規則引用的檔案／工具／模型已不存在 → 刪規則，Lessons Log 記一行。
- 規則被新規則涵蓋 → 刪舊留新。
- 不確定是否還適用 → 標 `[疑似過時 YYYY-MM-DD]`，兩次 session 後仍沒人需要它就刪。

## 6. 規則衝突處理

優先序（高→低）：**使用者當下指示 > CLAUDE.md 禁止事項 > AGENTS.md 最小規則 > docs/ai-ops 細則 > 歷史 spec**。
發現衝突：1) 按優先序執行；2) Lessons Log 記下衝突內容；3) 低優先序那條改成引用或刪除。不允許「兩條都留著下次再說」。

## 7. 未確認事實標註法

寫任何文件時，查不到的事實一律四件套：

```text
未確認：{事實內容}
原因：{為什麼查不到}
下次怎麼確認：{具體命令/URL/要問誰}
目前安全假設：{在確認前按什麼行動}
```

禁止用「應該」「大概」「通常」偽裝成已確認。

## 8. 一次性經驗 → 長期規則的升級路徑

1. 第一次發生 → Lessons Log（或 .agents/memory）一條。
2. 第二次發生同模式 → 升級：寫進 03 判準或 02 調度規則，附正例反例。
3. 影響每個 session 的開場行為 → 才進 AGENTS.md（一行＋引用）。
4. 反向也成立：AGENTS.md 裡三個月沒被用到的細節規則，降級回 docs/ai-ops。

---

## Lessons Log

### 2026-09-26 - 私人 OCR 的模型結果與工具失敗分開處理

- 觸發情境：既有測試隔離模式接回真 provider，圖片／結果需跨請求保存，Sites 必須能刷新收據頁。
- 發生錯誤：新 R2 結果 schema 混用 Zod v3/v4；舊 multipart 測試繼承 POC 容器旗標；Windows 官方 Sites wrapper 的 npm／Bash 路徑失敗；SPA fallback 請求 `/index.html` 被資產服務轉址回首頁。
- 正確做法：使用既有 schema 的 `zod/v4`，在測試內明確選擇舊／POC 路徑；保留 provider 成功結果，資料庫保存失敗時從私有 R2 恢復同一 run，不再次送辨識。Sites 原生 source workflow 已 push 後，只修復封裝：沿用本站 build.mjs、官方 prepare-site-build.cjs 與 Windows tar，核對 commit、乾淨 checkout 及 archive，不重建專案或改原 remote。SPA 改為內部 fetch `/` 回 HTML，測試模擬資產服務的 canonical redirect。
- 根因界限：未把 browser 逾時、npm／Bash wrapper 路徑問題當成 Clerk、OCR 或 R2 服務失敗。重新登入後的短暫 401 與後續頁面成功分開記錄，不為此放寬授權；其確切時序原因未確認。
- 驗收界限：fixture、雲端 R2／PG、實際 provider 與瀏覽器結果分別記錄。缺 API key／用量授權時保持真呼叫 0 次，不用 ground truth 補辨識結果。
- 要更新的規則：無新增全域規則；本輪狀態集中在 `docs/sites-migration/OCR-TEST-INTEGRATION-REPORT.md`。

### 2026-09-26 - 本機秘密表單須實測瀏覽器的 Origin

- 問題：一次性 OCR key 填入頁使用 `Referrer-Policy: no-referrer`，一般 HTML form POST 的 Origin 因此可為 `null`，被同來源檢查拒絕；Railway 查證尚無新 key。
- 修復：改為 `same-origin`，保留嚴格 Host／Origin、隨機路徑、大小限制、禁止快取及只綁定 loopback。用不連 Railway 的假值 callback 實測 Chrome 表單成功，再核對異來源仍回 403。沿用使用者已建立的 key，不重建憑證、不記錄秘密。依據：[MDN Referrer-Policy 對 Origin 的影響](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header)。
- 本輪紀錄留在 OCR 整合報告，不增加全域規則。

### 2026-09-26 - R2 接線的工具授權與模擬驗證分開

- 觸發情境：私人 POC 接回獨立 R2；瀏覽器控制逾時，改用官方 Wrangler；圖片路由需真 PG 與測試檔限定的 S3 mock。
- 發生錯誤：由 workspace 根目錄啟動 Node 測試找不到 API 的 `tsx`；完整 NTFS 掛載載入慢。Wrangler 非互動 keyring 登入缺 Windows 原生模組；`require()` CLI wrapper 因 main guard 而空白返回，不能算 CLI 成功。
- 根因：workspace 依賴解析、檔案載入及 CLI 入口／安全儲存方式不同；沒有證據把這些歸因為產品或 R2 服務故障。
- 正確做法：明確 API cwd；使用既有 Linux 依賴映像，只掛本輪差異檔，完成 14 項測試；root typecheck 另核對 exit 0。直接執行官方 CLI main，依實際 `--scopes-list` 選權限，不臆造 `r2:write`；Windows keyring 用官方支援模組，缺件時不把秘密改成聊天明文。本機 mock、真 R2、Sites HTTP、瀏覽器畫面各自記錄結果。
- 登入接續：手填 device code 及兩分鐘 localhost callback 曾逾時；改用 Wrangler 原始碼確認的 `verification_uri?user_code=...` 已填碼裝置授權網址，避免手填與本機回呼，最後 CLI exit 0、加密憑證落檔。控制台「授權完成」與 CLI 已收到憑證仍需分開確認。已登入也不代表 R2 已啟用；帳號 API 200 後，R2 明確回覆 10042 要求啟用，依使用者禁止新增付費的範圍停止建立資源，先確認原 R2 是否位於另一帳號。
- 帳號與 UI 接續：換帳號後必須以新 membership／Dashboard ID 組 API 路徑，不能沿用 REPL 舊變數；舊 account ID 的 403 不是新帳號無權限的證據。Chrome 初始化逾時時，用同一 browser 的新 tab 與有界較長讀取恢復；建 bucket 回覆斷線後先讀 URL／bucket 狀態，實際已成功便不重建。密鑰頁用 `emit:false` 並遮蔽，經一次性 loopback 表單與 CLI stdin 傳入指定服務，設定讀回後關閉；不宣稱工具絕對不留痕。非同步 REPL callback 的結果用共享物件保存，不能假設標量重新指派會跨回合更新。
- 最終證據：14 項本機測試、root typecheck、真 R2 Head/Get 雜湊、雲端 PG 商品關聯、受控重啟後讀取與 Chrome 圖片解碼均已分層通過；詳細收據見 R2 報告。未簽署 R2 實測為 400 `InvalidArgument`，如實記錄，不為符合預期改寫成 403。
- 要更新的規則：暫不升級，觀察是否再發生；本輪狀態集中於 `docs/sites-migration/R2-TEST-INTEGRATION-REPORT.md`。
- 可刪除或合併的舊規則：無。

### 2026-09-26 - 私人測試雲端部署須核對實際套用的設定

- 觸發情境：把既有私人 Sites POC 的 API／PG 搬至新 Railway 試用專案；先一次性初始化，再切回正常 API。
- 發生錯誤：Windows pnpm junction 使直接工作樹封裝失敗；Railway `redeploy` 重用舊設定，重播 initializer，被非空庫保護拒絕而部署失敗，未覆寫資料。
- 根因：工作樹不是乾淨 deploy context；設定修改不等於舊部署的 redeploy 會採用新設定。文件見 Railway deployment actions。
- 正確做法：白名單封裝來源並排除 env／node_modules／Git；明確寫 start command／空 preDeployCommand，使用 `railway up` 套用新設定，再讀回 SUCCESS、實際 deploy config、同單 SQL 和 API。停止的僅是本專案三個本機容器，重新查回同單後才宣稱不依賴本機；保留 volume。
- 要更新的規則：暫不升級，觀察是否再發生；資源、去密收據與回復方法集中在 `docs/sites-migration/PHASE2-ONLINE-TEST-REPORT.md`。
- 可刪除或合併的舊規則：無。

### 2026-09-26 - UI／任務列缺失不等於外部操作失敗

- 觸發情境：Clerk 建立 application 時瀏覽器 click 回覆逾時；普通唯讀審查只回 clientThreadId，list_threads 漏列；非同步建置的記憶體進度未更新。
- 發生錯誤：若直接重按建立、重派審查或重送 build，可能產生重複工作；只看記憶體變數也會誤認已完成的建置仍在跑。
- 根因：外部動作與回覆／列表／REPL 變數可見性不同步；具體平台根因未確認。
- 正確做法：先讀回現況。Clerk 沿用同一 browser 的 tab／DOM API 確認已建立的 Development 應用，不重建；審查由本機日誌取回真 ID，再交官方 read/wait 驗證 completed 與正文；build 核對 process exitCode、完整落盤 log 與產物，不盲目重送。密鑰不輸出聊天，僅保存在被忽略的本機測試設定。
- 要更新的規則：暫不升級，觀察是否再發生；本次收據與界限見 `docs/sites-migration/PHASE1-PLAN.md` G 節。
- 可刪除或合併的舊規則：無。

### 2026-09-26 - Windows 私人 POC 的隔離驗證與工具缺口分開記錄

- 觸發情境：在 Sites 遷移工作樹建立 Linux Node24／PostgreSQL16 的合成資料測試，並準備獨立 Clerk Development application。
- 發生錯誤：套件放 NTFS bind mount 時安裝／模組載入很慢；首次 root typecheck 的 nested pnpm 不在 PATH；Clerk CLI 在 Windows／Linux 入口均 exit 1 無診斷，Browser 尚未附著本任務。
- 根因：前兩項是本機建置環境與 Corepack shim 配置；Clerk 失敗原因未知，不能當成 API／授權規則本身失敗，也不能宣稱 app 已建立。
- 正確做法：專用 Linux node_modules／pnpm volumes、compose 入口啟用 pinned Corepack shim；以明確測試 DATABASE_URL 跑真 PG。CLI 換路至官方 Dashboard，待使用者登入；mock Clerk 的 9 項路由測試與真登入驗收分開。慢載入時讀回原程序結果，不盲目重送同一測試或改 production 環境。
- 本輪接續：常駐 API 透過 tsx 載入原始路由長時間未就緒；保留原 guard，改用已驗證的 API build＋Node24 原生執行後 health 與真 Clerk 下單鏈成功。Node24 原生載入 `privatePoc.ts` 已單獨實測；後續原始碼改動須先重建 API。觀測不足以把所有工具逾時都歸因於 tsx 或電腦資源耗盡。
- 驗收界限：CUA 持續逾時、open_in_codex 回 queued，使用者確認電腦與 Docker 正常。改以官方 Clerk／Sites 授權做跨站 HTTP 與直接 PG 驗證，另記使用者看到的畫面；不能把 API 成功或平台部署截圖當成完整瀏覽器 E2E。
- 要更新的規則：暫不升級，觀察是否再發生；本案位置／指令／未完成項記在 `docs/sites-migration/PHASE1-PLAN.md` G 節。
- 可刪除或合併的舊規則：無。

### 2026-09-26 - 客戶重複鍵及隔離測試 image 的模式繼承

- 觸發情境：私人 POC 接回既有客戶／行程，使用真隔離 PG 測新增、修改及舊路由回歸。
- 發生錯誤：重複客戶代碼回 500；舊行程測試因 image 預設 POC 模式而缺指定 owner/store，全數回設定錯誤。
- 根因：Drizzle 將 PostgreSQL `23505` 放在 `cause.code`；舊測試沒有主動指定非 POC，而執行 image 已有 `PIKA_PRIVATE_POC=true`。
- 正確做法：沿用已有衝突語意同時辨識直接／封裝錯誤碼，真 PG 驗證重複新增及修改都回 409 且原列不變。混跑舊模式測試時在容器明確指定 false，POC 測試自己設 true；不因此關掉部署中的隔離限制。首輪失敗、修正後結果分開保留。
- 同輪補驗：客戶 API 可用但 UI 仍受原 S-19 開關控制；沿用原開關及前置條件，只放行指定技能，不移除整套功能閘門。前端純函式測試需完整工作區的 `@workspace/db`；API image 不具前端依賴，shop-app 也沒宣告 tsx，改用既有 tools 環境的 Node 24 原生 TS 執行，7/7 通過，沒有安裝額外套件。
- 要更新的規則：暫不升級；本次範圍及結果集中於 `docs/sites-migration/PHASE1-PLAN.md` I 節。
- 可刪除或合併的舊規則：無。

### 2026-09-26 - 私人進階切片的 Windows 驗證與 Sites 打包

- 觸發情境：帳本／客資 CSV／商品交通成本接線，使用既有隔離 DB 與私人 Site。
- 問題與修正：測試 fixture 的路線名稱須符合 `(trip_id, area_title)` 唯一約束；`ExactDecimal` 應從既有 `@workspace/db/transport-cost` 匯入，不能猜 root export。保留失敗收據，不降低金額斷言。Windows bind mount 編譯慢時，把已固定的本次 API source 複製到專用測試容器再跑，不重建資料庫或動其他容器。
- Sites 官方 workflow 的 source/build 成功後，Windows Bash 打包路徑仍失敗；沿用本案已有隱藏 stdin credential 的 `.poc/publish-source.mjs`，核對同一專用來源 HEAD 再以原生 tar 打包，不重新建 Site、不改 GitHub remote 或公開設定。
- 此為本機操作紀錄，不新增全域規則或審查關卡；交付證據集中 PHASE1-PLAN.md J 節。

### 2026-07-07 - 同一本機 clone 被兩個 AI session 同時操作，分支被互相覆蓋

- 觸發情境：Fable 5 主 session 在 `Desktop\pika-system` commit+push 期間，制度庫另一個 session 在同一目錄 `git reset` 回舊 commit，導致本機分支倒退、已 push 的檔案從磁碟消失（remote 未受損，靠 `git merge --ff-only origin/main` 恢復）。
- 發生錯誤：兩條工作線在同一個 working copy 上互踩；若當時尚未 push，工作會直接遺失。
- 根因：CLAUDE.md 的 A/B 協議只隔離了 dev-handoff 檔案，沒有隔離 git 分支與 working tree。
- 正確做法：**動 git 前先 `git status`＋`git log --oneline -3` 確認狀態與自己上一步一致；發現 HEAD 不是自己留下的樣子，先 `git fetch` 比對 origin，用 fast-forward 恢復，不得 force**；重要產出完成就立即 commit（＋授權時 push），不留在工作區過夜。
- 要更新的規則：已含在 06 檔「你不是唯一的手」；再犯就升級成 AGENTS.md 最小規則。
- 可刪除或合併的舊規則：無。

### 2026-07-07 - 初始化

- 觸發情境：Fable 5 制度建立 session。
- 發生錯誤：（非錯誤）記錄基準事實：pika-system 原不在本機，clone 至 `C:\Users\Lnovo\Desktop\pika-system`；成本/毛利模組與 Sheet 整合當時不存在；成本 Sheet 匿名 401 需 SA。
- 根因：—
- 正確做法：後續 session 開場照 AGENTS.md。
- 要更新的規則：無。
- 可刪除或合併的舊規則：無。
