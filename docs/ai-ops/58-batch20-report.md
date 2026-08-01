# BATCH-20 完工總報告

日期：2026-08-01  
Repository：`C:\Users\Lnovo\Desktop\pika-system`  
起點：`335ee7f`  
終點（本報告提交前）：`d4d12c8`  
執行規則：每包獨立 commit、全程未 push、未連 production／既有資料庫；拋棄式 PostgreSQL 容器均已清除。

## 結論

1. BATCH-19 揭露的錯誤日誌 sanitizer、三支直接依賴安全 patch、trips 歸屬設計題卡均已完成；esbuild 因 workspace override 禁區跳過，沒有硬改規則。
2. XLSM/CSV endpoint、Orders/Dashboard component 測試、權限缺口補測、demo seed 與文件同步均已交付；未驗證的 E2E 不進主 testMatch。
3. 回歸證據：純測試 277/277、拋棄式 PostgreSQL route tests 76/76、四套 typecheck 全部 exit 0、全庫 Prettier 全綠；工作樹乾淨。
4. 本批可保留的程式／文件變更均已 commit；全程未 push。Pending E2E 因本機沒有 `gh` 且查不到 run，依規跳過，未冒充完成。

## 逐包狀態

|  包 | 狀態         | Commit               | 驗證／理由                                                                                                     |
| --: | ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------- |
|   1 | done         | `c53783b`            | `sanitizeError` 7 個純測試全綠；遮罩 SQL、params、連線字串、路徑與 stack。                                     |
|   2 | done         | `3709700`            | API logger 接線與 5/5 integration 測試通過；5xx 回應語意未改。                                                 |
|   3 | done         | `cf4348f`            | Playwright 1.55.0→1.55.1；frozen install、四 typecheck、API 79/79 通過。                                       |
|   4 | done         | `684f8a1`            | Multer 2.1.1→2.2.0；frozen install、API typecheck 與 79/79 純測試通過。                                        |
|   5 | done         | `43a2f84`            | http-proxy-middleware 4.0.0→4.1.1；frozen install、四 typecheck、API 79/79 通過。                              |
|   6 | skipped      | —                    | esbuild 被 `pnpm-workspace.yaml` 既有 override 固定；本批禁止改 override，依規跳過，仍列為依賴待辦。           |
|   7 | done         | `b6ff7d4`            | 只產出 trips/trip_routes 歸屬 A/B/C 選項與 Q-TRIP-OWN 題卡；未動 schema、migration、路由。                     |
|   8 | done         | `a60b26d`            | 測試 loader 轉換 `import.meta.env`；Orders 探針 1/1、shop 純測試 100/100。                                     |
|   9 | done         | `4d1d151`、`3a3cc12` | Orders 篩選、PATCH/二段確認、金額 fallback、購物金折抵共 4/4。                                                 |
|  10 | done         | `ecd09df`            | Dashboard 零技能卡、最近訂單金額、技能關閉區塊共 3/3；shop typecheck 0。                                       |
|  11 | done         | `e19367f`            | CSV/XLSM endpoint 與官方欄序、MIME、檔名、權限、格式拒絕測試；拋棄庫 route 13/13。                             |
|  12 | done         | `2ed618b`            | 新增 `UNVERIFIED-PENDING-CI` XLSM E2E 草稿；未進主 testMatch，未宣稱已實跑。                                   |
|  13 | done         | `2a7027a`            | 老闆驗收腳本補 Excel 開檔、B1 版本、欄位對位、賣貨便上傳步驟；明列 AI 不可自證。                               |
|  14 | done         | `f363d4c`            | 權限缺口第二梯拋棄庫 5/5；未登入、跨店、secret、audit 內容防線均覆蓋。                                         |
|  15 | done         | `f064c93`            | 錯誤訊息個資複驗更新；已接 sanitizer 標已解，raw console.error／未知 4xx message 明列仍待辦。                  |
|  16 | done         | `8e93098`            | internal cron secret 2/2；錯誤 secret 401、未設 secret 404，回應與 log 不含 secret。                           |
|  17 | done         | `093400f`            | 安全／個資 TODO 轉正式 backlog；未猜測權益或 audit 語意。                                                      |
|  18 | done / no-op | —                    | 雜項命中均為測試計數、假資料或規格示意；沒有可安全修改的真正死碼。                                             |
|  19 | skipped      | —                    | `47-order-response-decimal-options.md` 明確仍待拍板；金額語意衝突，依規不改 API number／string 契約。          |
|  20 | done / no-op | —                    | demo seed 已有 grant/spend/reversal、payable、picking 與 export fixtures；拋棄庫首跑成功，重跑被冪等守衛拒絕。 |
|  21 | done         | `95a78a3`            | 操作手冊同步 XLSM 老闆驗收流程；只改手冊。                                                                     |
|  22 | done         | `569daf4`            | README 與 docs 索引同步；只補現況與入口。                                                                      |
|  23 | done         | `10ebf3b`            | 15/16/17/21 檔補現況事實；未新增規則。                                                                         |
|  24 | skipped      | —                    | `gh` 不在本機，無法唯讀查 Pending E2E workflow run；未觸發、未搬移、未冒充綠燈。                               |
|  25 | done         | `9fab4cf`            | 金額路徑唯讀掃描；寫入鏈未發現 parseFloat/Number 浮點命中，顯示／回應層技術債列入報告。                        |
|  26 | done         | `dd03ad1`            | 全表 check、unique、FK、index 與「僅程式擋」風險總覽完成。                                                     |
|  27 | done         | `d4d12c8`            | 全回歸、audit 重跑與對應報告狀態同步完成；工作樹乾淨。                                                         |
|  28 | done         | 本報告 commit        | 本檔列逐包狀態、commit、驗證、風險、老闆驗收項與可重算 SHA-256。                                               |

## 最終驗證原文

### 純測試

```text
PURE_FILES=72
tests 277
pass 277
fail 0
skipped 0
PURE_EXIT=0
```

### 四套 typecheck

```text
TYPECHECK_LIBS_EXIT=0
TYPECHECK_API_EXIT=0
TYPECHECK_SHOP_EXIT=0
TYPECHECK_SCRIPTS_EXIT=0
```

### 拋棄式 PostgreSQL route tests

```text
ROUTE_FILES=13
tests 76
pass 76
fail 0
skipped 0
ROUTE_EXIT=0
LABEL_REMAINS=0
```

資料庫是本批新建的 `postgres:16-alpine`，只綁 `127.0.0.1`，只用假資料；測試後容器與 label 均清零。

### Prettier

```text
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0
```

### 依賴 audit

```text
corepack pnpm audit --json
exit 1（仍有 advisory，非本批測試失敗）
metadata.vulnerabilities={"info":0,"low":3,"moderate":5,"high":13,"critical":0}
advisory records=21
totalDependencies=703
```

## 仍待辦／老闆驗收

- **P1 trips 歸屬**：請在 `54-trip-ownership-options.md` 的 Q-TRIP-OWN-1 選 A（每店獨立）、B（平台共用）或 C（分享模型）；未拍板前不動 schema、migration、路由。
- **P1 raw error logging**：`logisticsSync`、`internalLogisticsSync`、`orders` 等 raw `console.error` 仍需另開安全包；全域 4xx public-safe error 也仍待處理。
- **P1 依賴**：esbuild 因 workspace override 未升，Vite／傳遞依賴仍依 `52-dependency-health.md` 排程；不得為了清 audit 硬改 override。
- **XLSM 人工驗收**：老闆需用桌面 Excel 開檔、確認 B1=1.4、欄位與賣貨便測試／草稿匯入；AI 不可自證。
- **Pending E2E**：需由老闆在 Actions 觸發 Pending E2E，綠了再依 runbook 搬入主 CI；本批未自行觸發。
- **金額 decimal**：`47-order-response-decimal-options.md` 仍待拍板，未改現有 API number 欄位。

## 未 push 與工作樹證明

```text
git status --short
(empty)
git rev-parse --short HEAD
d4d12c8
git rev-parse --short origin/main
290feb6
PUSH=not performed
```

SELF_SHA256: 4537DA72FAEFD74DDFAAA8E49571FA89762A7CEC0202250C581D0DEB4313E829
