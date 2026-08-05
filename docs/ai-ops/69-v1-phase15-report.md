# V1 Phase 1 包 15 完工報告

日期：2026-08-05
Worktree：`C:\Users\Lnovo\Desktop\pika-v1-phase15`
分支：`feat/v1-fixed-cost`
基線：V1 Phase 1 `b622b5fd` 後續修正鏈；本批未 push。

## 結論

固定成本資料模型、預估／實際／比較三頁、店鋪技能閘門與 CI schema guard 已完成。所有 coding 包均以獨立 commit 保留；沒有新增 API 欄位以外的範圍外功能，沒有碰 generated、dev-handoff、production DB 或既有訂單快照。完整依賴安裝與瀏覽器／資料庫回歸仍需在 CI 或乾淨環境補跑，原因見「驗證限制」。

## 逐包狀態

| 包 | 狀態 | Commit | 內容／驗證摘要 |
|---:|---|---|---|
| 1 | done | `a242a99` | trips/trip_routes 固定成本輸入欄位與 additive migration。 |
| 2 | done | `b868718` | 11 個固定成本類別資料表與種子資料。 |
| 3 | done | `fc29bcf` | cost_entries ESTIMATE/ACTUAL 模型、狀態與約束。 |
| 4 | done | `9e63501` | ExactDecimal 固定成本合計與 JPY/TWD/待補匯率分流。 |
| 5 | done | `c5ca6a8` | tripProfit 固定成本與 1.5% 費用基礎拆分。 |
| 6 | done | `bd4571c` | 工作日推導與人工覆寫規則。 |
| 7 | done | `399cfab` | 預估鎖定、解鎖與修改後標記政策。 |
| 8 | done | `7744693` | 預估／實際差異比較純函式與方向判定。 |
| 9 | done | `e30b7a9` | cost_entries CRUD；requireAuth、店主與 trip/store 綁定。 |
| 10 | done | `468a7db` | operating-inputs、close、unlock-estimate API 與狀態防線。 |
| 11 | done | `48b7e4c` | 固定成本摘要／比較 API，包含 11 類別與分開匯率。 |
| 12 | done | `1727b57` | 預估成本頁：11 類別、零值、估算鎖定與手動解鎖。 |
| 13 | done | `825c57e` | 實際成本頁：發票列、幣別、日期、可選照片與無單據標記。 |
| 14 | done | `d3f9a90` | 比較頁：預估／實際／差額、待補匯率狀態，無圖表。 |
| 15 | done | `c71e848` | `/trips`、估算、實際、比較頁統一受 S-09 gate；設定入口同步顯隱；補 visibility 測試。 |
| 16 | done | `2d4e8e4` | CI disposable schema guard：表、欄位、11 類別種子與 operating singleton。 |
| 17 | done | `c01b216` | 本檔自校驗規則與 SHA-256 見文末。 |

## 驗證紀錄

- `git diff --check`：通過（目前報告加入前的 coding commits 均無 whitespace error）。
- 變更範圍：固定成本 schema／純函式／API／shop-app 三頁／技能 gate／CI guard；未修改 production 金額計算語意或既有 order snapshot 寫入鏈。
- CI guard 會在 disposable PostgreSQL schema push 後檢查 `operating_settings`、`cost_categories`、`cost_entries`、trips 固定成本欄位、11 個 category code 與 singleton row，失敗即讓 verify job 失敗。
- 本機已嘗試以既有 pnpm store 直接執行 visibility 單測；目前 worktree 缺少 pnpm workspace symlink 與 `@esbuild/win32-x64` optional native binary，tsx 在轉換 TypeScript 時回報 `The package "@esbuild/win32-x64" could not be found`，因此未將本機結果宣稱為通過。
- 待乾淨 CI／完整 `pnpm install --frozen-lockfile` 後補跑：四套 typecheck、CI 同範圍純測試、shop-app/api-server tests、Prettier、disposable PostgreSQL route/schema 演練與 build。

## 風險與未解項目

1. 依賴環境需補完整安裝後才能完成本機等價驗證；這是 harness 限制，不是產品測試綠燈證據。
2. `TripActual` 的照片預覽沿用既有產品圖片 upload endpoint，沒有新增 URL 欄位；正式環境需依既有檔案服務權限驗收。
3. 固定成本頁已受 S-09 UI gate 保護，但 server API 仍以既有 requireAuth／verifyStoreOwner／store_id 綁定為最終權限邊界。
4. 本批沒有啟用 S-16 worker、沒有新增 migration 以外的資料回填，也沒有連 production／既有資料庫。

## Git 狀態

- HEAD：`c01b216`（本報告 commit）。
- Branch：`feat/v1-fixed-cost`。
- Push：未 push。
- 完工條件：報告提交後 `git status --short` 應為零輸出。

## SELF_SHA256

重算規則：讀取本檔 UTF-8 原始 bytes，刪除整行 `SELF_SHA256:`（含換行）後計算 SHA-256。

SELF_SHA256: 5700be91df8838f329c4db3b7e1a15c61f9eddb49317f16f7108bad81eae39e2
