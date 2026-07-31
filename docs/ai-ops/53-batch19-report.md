# BATCH-19 完工總報告

日期：2026-07-31  
Repository：`C:\Users\Lnovo\Desktop\pika-system`  
起點：`6a10e405b200c9172118645ac7674ff1e51967c3`  
執行規則：每包獨立 commit、全程未 push、未連 production／既有資料庫。

## 結論

1. 賣貨便 preview 提前送明文、audit 無法區分批次、CSV 公式注入缺測三項已補齊；公開 preview 現在只回資格摘要。
2. 官方 XLSM 範本 PoC 已能在程式層保留 VBA、工作表、B1 版本與非目標 ZIP entries，但產出端點因拋棄庫 harness 連續兩輪失敗而撤回，沒有冒充完成。
3. 購物金與賣貨便 owner 端點新增店鋪級限流；全端點權限矩陣、錯誤個資掃描、TODO 與依賴安全報告均已完成。
4. 最終回歸：純測試 `261/261`、拋棄式 PostgreSQL route tests `71/71`、四套 typecheck 與全庫 Prettier 全綠。
5. 本批 25 包 done（含 2 個 no-op）、6 包 skipped；共 23 個 commit（含本報告），全程未 push。

## 逐包狀態

|  包 | 狀態         | Commit        | 驗證／理由                                                                                                                               |
| --: | ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
|   0 | done         | `e231afe`     | GET preview 改資格摘要 DTO，POST 才保留明文；遞迴測試拒絕姓名／手機／row。                                                               |
|   1 | done         | `a49700d`     | audit target 改 16 hex opaque export ID；兩次匯出 ID 不同且不含個資／token。                                                             |
|   2 | done         | `40da9b0`     | 公式開頭與逗號、換行、雙引號的 CSV 中和／quoting 測試 4/4。                                                                              |
|   3 | skipped      | —             | component harness 兩輪失敗：先缺子元件 `ShippingMethod` mock；補 mock 後 Node 讀取 `import.meta.env.BASE_URL` 為 undefined。變更全撤回。 |
|   4 | skipped      | —             | 依賴包 3 的 Orders harness，前置未成立。                                                                                                 |
|   5 | skipped      | —             | 依賴包 3 的 Dashboard harness，前置未成立。                                                                                              |
|   6 | done / no-op | —             | 需求案例已由既有 monthlyProfitReport 六測完整覆蓋；重跑 6/6，不重複加測。                                                                |
|   7 | done         | `68697ba`     | 完成金額回應 decimal 收斂 A/B/C 設計；建議平行 exact string 欄位過渡，不在本批改 API。                                                   |
|   8 | done         | `3ed57aa`     | 官方 XLSM 範本 PoC 4/4：完整檔 hash、VBA、工作表/B1/欄序及非目標 entry 位元保持。                                                        |
|   9 | skipped      | —             | CSV/XLSM endpoint 曾完成靜態測試 5/5，但拋棄庫 schema harness 兩輪皆回 `No schema files found`；依規撤回全部改動，不留未驗證端點。       |
|  10 | done         | `d94c747`     | 完成客戶軟刪＋遮蔽可實作 spec，保留匿名化與保留期題卡。                                                                                  |
|  11 | done         | `cbd18eb`     | 訂單 DELETE 最終 FK 競態改回既有 409 文案；測試鎖住精確訊息。                                                                            |
|  12 | done         | `d5ba98f`     | 購物金 mutation 與賣貨便 export 新增店鋪級 10 分鐘 60 次限流；超量 body 僅 error。                                                       |
|  13 | done         | `0af5852`     | 只新增確定缺少的客戶帳本索引；5 萬筆假資料 EXPLAIN 使用該索引，容器零殘留。                                                              |
|  14 | done         | `41f66bf`     | 真 endpoint 限流、店鋪隔離與 429 回應防洩漏測試完成。                                                                                    |
|  15 | skipped      | —             | GitHub `Pending E2E` workflow 存在但 runs 為 0；依條件不觸發、不搬 spec。                                                                |
|  16 | done         | `0c20554`     | 新增購物金完整生命週期 pending E2E，保留 `UNVERIFIED-PENDING-CI`，未進主 testMatch。                                                     |
|  17 | skipped      | —             | 依賴包 9 的 XLSM endpoint，前置未成立。                                                                                                  |
|  18 | done         | `80f9dc3`     | demo seed 加賣貨便 3 合格＋3 不合格假單；實庫 preview 為 3/3，重跑被冪等守衛拒絕。                                                       |
|  19 | done         | `1d39cd6`     | 新增購物金、賣貨便、首登問卷的老闆白話驗收腳本。                                                                                         |
|  20 | done         | `d047ecd`     | 操作手冊同步實際按鈕與流程，移除問卷「尚未開放」過期敘述。                                                                               |
|  21 | done         | `0405e11`     | 金額顯示盤點補餘額、流水、折抵、應付現金與 exact string 過渡註記。                                                                       |
|  22 | done / no-op | —             | 15／16／21 檔已含購物金、入口與 44px 事實；不重複寫文件。                                                                                |
|  23 | done         | `5e4ac2c`     | README 同步購物金、賣貨便 CSV、問卷與 XLSM PoC／endpoint 邊界。                                                                          |
|  24 | done         | `4e08f72`     | 全 API endpoint 權限矩陣完成；發現 trips 缺店鋪歸屬的既有 P1 設計缺口。                                                                  |
|  25 | done         | `d4621dd`     | 五個 route 測試覆蓋九個高優先 mutation 授權缺口；拋棄庫 5/5。                                                                            |
|  26 | done         | `c1196e5`     | 錯誤與 log 個資掃描完成；列出 raw error logging 與動態 4xx message 風險。                                                                |
|  27 | done         | `5df2ccf`     | 全 repo TODO/FIXME/XXX/HACK 盤點；19 文字命中中只有 2 個真 TODO。                                                                        |
|  28 | done         | `1f9e376`     | `pnpm outdated`／audit 唯讀報告完成；lockfile SHA-256 前後相同。                                                                         |
|  29 | done         | `0d16188`     | 純測試 261/261、DB route 71/71、四 typecheck、Prettier 全綠；41／45 檔 P3 狀態同步。                                                     |
|  30 | done         | 本報告 commit | 本報告列狀態、驗證、風險、題卡、老闆驗收項、未 push 聲明與可重算 SELF_SHA256。                                                           |

## 金額與安全證據

- 本批沒有新增或改寫訂單總額、毛利快照或交通成本公式。
- demo 假單的賣貨便分類由正式 `buildMaihuobianExportPreview` 執行：`eligible=3`、`ineligible=3`；三個拒絕原因分別為訂單狀態、物流狀態與取貨方式不合格。
- owner mutation limiter 的 key 在 `requireAuth`＋`verifyStoreOwner` 後才以 storeId 建立，跨店請求不能消耗目標店額度。
- 賣貨便 GET preview 不再序列化 `eligible[].row`；明文只在通過雙確認的 POST export 路徑產生。
- XLSM PoC 使用官方檔案 SHA-256 `1d1b9219780edbe85133cf61818d56eb9f2fa32ba1f59393f105fdb4725fcabb`；VBA hash 與所有非目標 ZIP entry 位元保持。

## 最終驗證原文

### 純測試

```text
PURE_TEST_FILES=68
tests 261
pass 261
fail 0
skipped 0
duration_ms 82703.4663
```

### 四套 typecheck

```text
TYPECHECK_LIBS_EXIT=0
TYPECHECK_API_EXIT=0
TYPECHECK_SHOP_EXIT=0
TYPECHECK_SCRIPTS_EXIT=0
```

### Prettier

```text
Checking formatting...
All matched files use Prettier code style!
```

### 拋棄式 PostgreSQL route tests

```text
DB_ROUTE_FILES=13
tests 71
pass 71
fail 0
skipped 0
duration_ms 54112.6072
CONTAINER_REMOVED=pika-b19-full-37fc4e0a
BATCH19_FULL_LABEL_REMAINS=0
```

資料庫為本次新建的 `postgres:16-alpine`，只綁 `127.0.0.1` 隨機埠，資料全部是假資料；完成後容器與 label 零殘留。

## 失敗／跳過軌跡

### 包 3 component harness

1. 第一輪：依既有 domBootstrap／asset loader 並禁止 `screen`，探針載入 Orders；子元件匯入鏈缺 `ShippingMethod` export，測試在 render 前失敗。
2. 第二輪：補子元件 mock 後繼續載入；Node 測試環境執行 `import.meta.env.BASE_URL` 時 `env` 為 undefined。
3. 依兩輪規則刪除探針與 mock，包 4／5 隨前置失敗跳過；未改 production code。

### 包 9 XLSM endpoint

1. endpoint 與 component 測試曾達 5/5、API／shop typecheck 通過。
2. 拋棄式 DB 第 1、2 輪皆在 Windows Drizzle schema harness 回 `No schema files found for path ...src/schema/index.ts`，未取得 route 實跑證據。
3. 依規撤回 package 9 全部程式與測試；package 17 亦跳過。package 8 的純 PoC 保留且不宣稱 endpoint 完成。

## 風險

1. **P1：trip ownership。** `trips`／`trip_routes` 沒有 store 或 merchant 歸屬欄，現行 `/trips*` 只有登入防線；任何已登入 merchant 理論上可管理共用 trips。修正需要 schema／產品歸屬拍板，不能只補測試假裝解決。
2. **P1：raw error logs。** 多處 logger 直接記錄 `err`，Drizzle error 可能包含 SQL、params 與本機路徑；全球 5xx 回應是 generic，但 log 端仍需集中 sanitizer。
3. **P1：依賴安全。** audit 為 critical 0、high 16、moderate 7、low 3；直接安全 patch 優先包含 Playwright、Multer、http-proxy-middleware、Vite、esbuild。
4. Orders／Dashboard component Node harness 仍待解；現有純函式、route 與 E2E 防線未因此弱化。
5. XLSM endpoint 未交付；只有官方範本純函式 PoC，且仍缺人工 Excel／賣貨便官方匯入驗證。

## 待拍板題卡

1. **客戶軟刪：** 軟刪後是否立刻匿名化姓名／手機？建議：立即遮蔽對外顯示，保留帳本外鍵；個資不可逆匿名化需另訂保留期。
2. **個資保留期：** 刪除請求後保留 30／90／法定必要天數？建議先由會計／法遵需求定義，不由程式猜。
3. **owner 限流值：** 現行保守值為每店 10 分鐘 60 次。若實際批次操作會超過，再以真實使用量調整；不得直接取消限流。
4. **訂單金額 response：** 是否採平行 exact decimal string 欄位過渡，最後淘汰 number？建議採 `47-order-response-decimal-options.md` 的 B→A 路徑。
5. **trip 歸屬：** trips 是全平台共用、每店獨立，或明確分享？這會決定 schema、migration 與授權規則。
6. **錯誤 log：** 是否授權建立集中 sanitizer，預設移除 SQL、params、token、個資與絕對路徑？建議授權。

## 老闆驗收項

1. 依 `48-owner-acceptance-script.md` 用假客戶親手跑：購物金發放 5000 → 下單折抵 220 → 取消 → 餘額回 5000。
2. 賣貨便 CSV：選日期、確認 3 合格／3 不合格兩區、完成雙確認、下載並以試算表開啟。
3. XLSM PoC：由老闆在隔離副本用 Excel 開檔，確認無修復警告、巨集仍在；再用全假資料送賣貨便官方匯入驗證。未完成前不得把 XLSM endpoint 標為可用。
4. 到 GitHub Actions 手動執行一次 `Pending E2E`；全綠後才能依仲裁流程搬入主 CI。
5. 首登問卷：用零技能假店走答題→推薦→preview/apply，確認問卷消失、入口出現。

## Git 與發布聲明

- 起跑時工作樹乾淨，HEAD 符合 `6a10e405`。
- 本批只 commit 到本機 `main`，**沒有 push**。
- 未連 production 或任何既有資料庫；所有 DB 驗證使用全新拋棄式 PostgreSQL。
- 報告提交後再次執行 `git status --short`，預期零輸出；實際結果會在文字回報附上。
- `origin/main` 在起跑時已落後本機起點；本批沒有嘗試整合或推送遠端。

## SELF_SHA256

重算方式：以本檔 UTF-8 bytes 為準，刪除整行 `SELF_SHA256:`（含該行換行）後計算 SHA-256。

SELF_SHA256: 40e47917faef5117ed8021696138aca9a0dc954736265a180b9d5d6752f325cb
