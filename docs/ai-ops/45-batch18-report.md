# BATCH-18 完工總報告

日期：2026-07-31

Repository：`C:\Users\Lnovo\Desktop\pika-system`

起點：`0aec2b4`
執行規則：每包獨立 commit、全程未 push、未連 production／既有資料庫。

## 結論

1. BATCH-17 唯一 P2 已修：使用過購物金的訂單現在回友善 409，不再掉入 PostgreSQL FK 例外與 500。
2. 購物金 owner 發放／調整 API、後台 UI、audit 與發放→折抵→取消回沖生命週期已完成，所有金額沿用 `ExactDecimal`，未改既有毛利快照語意。
3. 本批共完成 21 個 coding／文件 commit；包 5–7、9、24 依批次規則 skipped，沒有用別的工作冒充原包。
4. 全批最終回歸為純測試 `252/252`、拋棄式 PostgreSQL route tests `64/64`、四套 typecheck 與 Prettier 全綠。
5. 賣貨便 XLSM 正式套版仍須先完成官方範本 PoC 與人工 Excel／官方匯入驗證；pending E2E 尚無 GitHub Actions run，均未越權升入正式流程。

## 逐包狀態

|  包 | 狀態    | Commit    | 驗證／理由                                                                                                                                         |
| --: | ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
|   0 | done    | `e973dcb` | 購物金流水存在時 DELETE 回 409；未使用購物金的 pending 訂單仍可刪。最終 DB route 回歸涵蓋且全綠。                                                  |
|   1 | done    | `b6ce2f6` | owner-only GET/POST、確認 header、精確發放／調整、冪等與分頁完成；`customerStoreCredit.route.test.mjs` 7 案例全綠。                                |
|   2 | done    | `a389855` | CustomerDetail 加購物金餘額、流水、發放／調整與二次確認；component tests 4/4。                                                                     |
|   3 | done    | `2c73544` | grant／adjust／spend／reversal 接 audit；只寫 opaque target 與流水資訊，不記姓名、手機或 token。                                                   |
|   4 | done    | `dbf7e2a` | 發放 5000→折抵 220→取消回沖→餘額回 5000；重複取消不重複回沖，毛利快照保持不變。                                                                    |
|   5 | skipped | —         | 測試 harness 兩輪失敗：第一輪 React 載入失敗；第二輪 Testing Library `screen` 在全域 document 綁定時點失敗。兩輪變更均還原，未改 production code。 |
|   6 | skipped | —         | 依賴包 5 的 Orders component harness，前置未成立，不留下未驗證測試。                                                                               |
|   7 | skipped | —         | 依賴包 5 的 Dashboard component harness，前置未成立，不留下未驗證測試。                                                                            |
|   8 | done    | `5e587bb` | monthlyProfitReport 補 pending-only、missing-only、混合負毛利、Asia/Taipei 閏年跨月；6/6。                                                         |
|   9 | skipped | —         | `38-xlsm-template-fill-options.md` 的正式範本 PoC、Excel 巨集修復人工檢查與官方匯入驗證尚未完成；不以新活頁簿冒充官方 XLSM。                       |
|  10 | done    | `9ede9d3` | 新增賣貨便 pending E2E；保留 `UNVERIFIED-PENDING-CI`，未動主 `testMatch`。                                                                         |
|  11 | done    | `c78e61e` | 完成賣貨便個資複驗；發現 preview GET 在二次確認前回明文列，列為 P2 建議，未越權修改。                                                              |
|  12 | done    | `9c91b40` | 完成全 schema FK 與 DELETE 路徑交叉盤點，逐處列使用者影響與友善錯誤建議。                                                                          |
|  13 | done    | `c029094` | 完成有帳本客戶的軟刪／匿名化選項與保守建議；未自行拍板個資保留政策。                                                                               |
|  14 | done    | `4dd0816` | 新端點未登入、跨店、缺確認、超量等負向測試補齊；當包拋棄庫 19/19，最終 DB 回歸亦全綠。                                                             |
|  15 | done    | `e91affc` | 真 app 組裝驗證新 owner 端點的 Referrer-Policy、X-Content-Type-Options 與拒絕回應；4/4。                                                           |
|  16 | done    | `896e092` | 完成 `store_credit_transactions`、`order_picking_checks` 查詢與索引盤點，只給建議、不改 migration。                                                |
|  17 | done    | `67b9c3f` | demo seed 加 grant 5000、spend 220、reversal 220 與部分包貨勾選；拋棄庫首跑成功、重跑被擋、容器零殘留。                                            |
|  18 | done    | `e0cf113` | 操作手冊新增 owner 發放、折抵、取消回沖與餘額查看流程，使用實際按鈕名稱。                                                                          |
|  19 | done    | `0d2de86` | 操作手冊新增賣貨便日期、資格原因、明文確認與下載後刪檔提醒；明確區分 CSV 與尚未落地的 XLSM。                                                       |
|  20 | done    | `ce02d60` | 金額盤點補購物金餘額、流水、折抵、應付現金與收據；缺值／零值標記規則保留。                                                                         |
|  21 | done    | `d536634` | 狀態、頁面流程與手機驗收文件同步購物金回沖、包貨勾選與新入口。                                                                                     |
|  22 | done    | `804e4c9` | 新增首登問卷 pending E2E；零技能→推薦→preview/apply→問卷消失與入口出現。                                                                           |
|  23 | done    | `22b284f` | 新增包貨勾選 pending E2E；重整後持久化、出貨後唯讀。                                                                                               |
|  24 | skipped | —         | 唯讀查詢 GitHub Actions `Pending E2E` 最近 runs 為 0；依條件包規則不搬、不修、不觸發。                                                             |
|  25 | done    | `190cd19` | 全批回歸全綠；BATCH-16/17 報告標註已解與仍待辦並重算各自 SELF_SHA256。                                                                             |
|  26 | done    | 本 commit | 本報告逐包列狀態、證據、風險、驗收項、未 push 聲明與可重算 SELF_SHA256。                                                                           |

## 金額證據

購物金完整鏈沿用既有純函式與 `ExactDecimal`：

| 步驟       |          人工預期 | route／資料庫結果 |
| ---------- | ----------------: | ----------------: |
| 發放       |              5000 |              5000 |
| 訂單折抵   |               220 |              -220 |
| 折抵後餘額 | 5000 - 220 = 4780 |              4780 |
| 取消回沖   |              +220 |              +220 |
| 回沖後餘額 | 4780 + 220 = 5000 |              5000 |
| 重複取消   |        不得再回沖 |        流水不增加 |

生命週期測試另逐欄確認訂單既有 `profit_snapshot_*` 在折抵與回沖前後不變；購物金是付款工具，未進入商品成本、交通成本或毛利公式。

## 最終驗證原文

### CI 同探索範圍純測試

```text
PURE_TEST_FILES=66
tests 252
pass 252
fail 0
skipped 0
duration_ms 102554.9847
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
PRETTIER_EXIT=0
```

### 拋棄式 PostgreSQL route tests

第一輪使用 repo 的 Windows Drizzle config，於 schema 建立階段失敗並立即刪除容器：

```text
Error  No schema files found for path config ['...\lib\db\src\schema\index.ts']
schema push failed
CONTAINER_RESIDUE=0
```

第二輪改以 CLI 明確傳入同一份 schema 與本次拋棄庫 URL：

```text
[✓] Changes applied
tests 64
pass 64
fail 0
DB_ROUTE_TESTS_EXIT=0
CONTAINER_RESIDUE=0
```

兩輪都只使用本次新建的 `postgres:16-alpine`，隨機綁定 `127.0.0.1` 回環埠，資料全是假資料；未讀取或連線任何 production／既有 `DATABASE_URL`。

## 證據檔案

- 刪單 P2 修復：`artifacts/api-server/src/routes/orders.ts`
- owner 購物金 API：`artifacts/api-server/src/routes/customers.ts`
- owner 購物金 UI：`artifacts/shop-app/src/pages/CustomerDetail.tsx`
- 金額純函式：`lib/db/src/store-credit/index.ts`
- migration：`lib/db/migrations/0024_store_credit_owner_adjustments.sql`
- 生命週期測試：`artifacts/api-server/src/routes/storeCreditLifecycle.route.test.mjs`
- 賣貨便個資複驗：`docs/ai-ops/41-maihuobian-privacy-audit.md`
- FK 普查：`docs/ai-ops/42-delete-path-fk-audit.md`
- 客戶刪除選項：`docs/ai-ops/43-customer-deletion-options.md`
- 索引複驗：`docs/ai-ops/44-new-tables-index-review.md`

## 風險

1. 賣貨便 preview GET 在二次確認前會回傳明文匯出列；owner-only 與跨店防線仍在，但 `41-maihuobian-privacy-audit.md` 建議改成先回資格摘要、確認後才產明文。
2. 有購物金流水的客戶受 FK restrict 保護，現階段不可硬刪；正式個資刪除需由老闆在軟刪遮蔽與匿名化間拍板。
3. Orders／Dashboard component tests 的 Node/tsx harness 仍未解；既有純函式、route、E2E 防線未因此弱化。
4. `store_credit_transactions` 的客戶餘額查詢索引目前可用；資料量顯著增長後，應依 `44-new-tables-index-review.md` 觀察 query plan。

## 未解問題

1. Pending E2E 尚未在 GitHub Actions 手動執行，因此七條 pending specs 都未升入主 CI。
2. 賣貨便官方 XLSM v1.4 套版尚未落地；缺官方範本 PoC、Excel 可開啟／巨集保留人工驗證與官方匯入驗證。
3. 客戶個資刪除策略尚未拍板；本批只提供 A/B/C 選項，不自行決定。

## 老闆驗收項

### A. 購物金發放實測

1. 用假客戶開「客戶管理」→「詳情」。
2. 在「購物金」輸入發放金額與原因，確認畫面先顯示變動前後餘額。
3. 完成第二次確認後，檢查餘額與流水各增加一次；同一操作不得重複入帳。
4. 建一張假訂單折抵購物金，再取消，確認餘額精確退回且毛利快照不變。

### B. 賣貨便匯出實測

1. 只用假訂單，確認可匯出／不可匯出兩區與原因。
2. 預設先測遮罩版；明文版必須再做第二次確認。
3. 目前正式產物是 CSV；不要把它當成官方 XLSM v1.4 套版。
4. 下載後立即刪除本機測試檔，不留假個資以外的資料。

### C. 問卷推薦確認

1. 使用零技能假店鋪完成四題。
2. 確認先看到推薦與差異 preview，沒有直接套用。
3. 按確認套用後，問卷卡消失且對應入口出現。
4. 這條目前仍是 pending E2E；正式升入 CI 前需先手動跑 `Pending E2E` workflow。

## Git 與未 push 聲明

包 25 提交後、建立本報告前：

```text
HEAD=190cd19b339bda15903728e391907ab17907486b
origin/main=290feb6c9ac1e62c385971af274fb2d2fad8c730
behind=0
ahead=38
git status --short = zero output
```

本報告提交後應為 ahead 39、工作樹乾淨。BATCH-18 全程未執行 `git push`，也未修改 origin。

## 建議下一步

先交 Fable 5 終審，重點複核購物金 owner API/UI、5000→220→回沖的帳本與毛利快照不變、以及賣貨便 preview 明文風險。終審 accepted 後再由老闆決定 push；pending E2E 需另由老闆手動觸發，不得把本報告當成已跑過的證據。

## SHA-256

重算方式：以本檔 UTF-8 bytes 為準，刪除整行 `SELF_SHA256:`（含該行換行）後計算 SHA-256。

SELF_SHA256: de24528464b16cf363304cee17c55db3f5ef904f66f0a35446e8298e3bc65777
