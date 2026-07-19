# T-19 頁面流程盤點

> 行號基準：文中 `file:line` 以 `663c21d`（包 15／16 全域格式化前）的歷史版本為準；格式化後行號已位移。

- 盤點日期：2026-07-18
- 路由權威來源：`artifacts/shop-app/src/App.tsx:448-485`
- 技能顯示規則：`artifacts/shop-app/src/lib/dailySkillVisibility.ts:8-67`
- 步數口徑：從頁面已開啟開始，完成該頁最主要動作所需的明確點擊／送出次數；純閱讀頁為 0，輸入文字本身不另計每個欄位

## 客人與公開頁

| 路由                  | 給誰用     | gate surface             | 核心動作                 | 步數 | 證據／備註                                       |
| --------------------- | ---------- | ------------------------ | ------------------------ | ---: | ------------------------------------------------ |
| `/`                   | 訪客、店家 | 無；登入者自動轉首頁     | 訪客了解服務或前往登入   |    1 | `App.tsx:427-437,449`                            |
| `/sign-in/*?`         | 店家       | Clerk 登入               | 送出登入資料             |    1 | `App.tsx:136-145,450`                            |
| `/sign-up/*?`         | 新店家     | Clerk 註冊               | 送出註冊資料             |    1 | `App.tsx:148-158,451`                            |
| `/p/:shareToken`      | 客人       | 無登入；公開 bearer 連結 | 填資料後送出單品訂單     |    1 | `App.tsx:452-454`；`PublicOrder.tsx:119,431-491` |
| `/cart`               | 客人       | 無登入                   | 確認購物車、填資料並送單 |    1 | `App.tsx:459`；`PublicCart.tsx:229,328,529-550`  |
| `/track`              | 客人       | 無登入                   | 輸入追蹤碼並查詢         |    1 | `App.tsx:455`；`TrackLookup.tsx:4,26-53`         |
| `/track/:publicToken` | 客人       | 無登入；公開 bearer 連結 | 查看訂單與物流狀態       |    0 | `App.tsx:456-458`；`TrackOrder.tsx:109,224-284`  |
| `/cvs/711/select`     | 客人       | 無登入；由下單流程帶參數 | 開啟官方選店並選門市     |    2 | `App.tsx:460`；`Cvs711Select.tsx:35,177`         |
| `/cvs/711/return`     | 客人       | 無登入；選店回呼頁       | 將選店結果帶回下單頁     |    0 | `App.tsx:461`；`Cvs711Return.tsx:6`              |

## 店家日常頁

以下頁面外層都經 `MerchantPortal`，需要登入且必須取得自己的店鋪；證據：`App.tsx:243-310,465-484`。技能 gate 是 UI 顯示／頁面 gate，不取代後端授權。

| 路由                        | 給誰用 | gate surface                          | 核心動作                       | 步數 | 證據／備註                                      |
| --------------------------- | ------ | ------------------------------------- | ------------------------------ | ---: | ----------------------------------------------- |
| `/dashboard`                | 店家   | 無，永遠可見                          | 查看今日／本週摘要並進入工作頁 |  0–1 | `App.tsx:315`；`Dashboard.tsx:60,109-220`       |
| `/products`                 | 店家   | `products` → S-01；無設定列時預設開   | 查看商品或進入新增／編輯       |  0–1 | `App.tsx:330-335`；`dailySkillVisibility.ts:54` |
| `/products/new`             | 店家   | `products` → S-01                     | 填商品後儲存                   |    1 | `App.tsx:316-322`；`ProductForm.tsx:25,583`     |
| `/products/:productId/edit` | 店家   | `products` → S-01                     | 修改商品後儲存                 |    1 | `App.tsx:323-329`；`ProductForm.tsx:25`         |
| `/categories`               | 店家   | `categories` → S-04；無設定列時預設開 | 新增分類                       |    1 | `App.tsx:337-343`；`dailySkillVisibility.ts:56` |
| `/orders`                   | 店家   | `orders` → S-04；無設定列時預設開     | 查看訂單；展開後更新狀態       |  0–2 | `App.tsx:344-350`；`Orders.tsx:252,670`         |
| `/reports/monthly-profit`   | 店家   | `orders` → S-04                       | 選月份查看已定格毛利           |    1 | `App.tsx:351-357`；`MonthlyProfit.tsx:34,82`    |
| `/guide`                    | 店家   | `guide` → S-05；無設定列時預設開      | 閱讀操作說明                   |    0 | `App.tsx:414-420`；`Guide.tsx:43,56`            |

## 店家進階頁

| 路由                        | 給誰用 | gate surface                            | 核心動作               | 步數 | 證據／備註                                              |
| --------------------------- | ------ | --------------------------------------- | ---------------------- | ---: | ------------------------------------------------------- |
| `/customers`                | 店家   | `customers` → S-19；無設定列時關閉      | 建客戶／匯出／進詳情   |  1–2 | `App.tsx:358-364`；`Customers.tsx:39,166`               |
| `/customers/:customerId`    | 店家   | `customers` → S-19                      | 查看或編輯客戶         |  0–1 | `App.tsx:365-371`；`CustomerDetail.tsx:39,123`          |
| `/logistics/import`         | 店家   | `logistics` → S-34；無設定列時關閉      | 選檔並匯入物流 Excel   |    2 | `App.tsx:379-385`；`LogisticsImport.tsx:154,240`        |
| `/logistics/import/history` | 店家   | `logistics` → S-34                      | 查看匯入批次與列資料   |  0–1 | `App.tsx:372-378`；`LogisticsImportHistory.tsx:178,271` |
| `/logistics/exceptions`     | 店家   | `logistics` → S-34                      | 選異常並處理           |    2 | `App.tsx:386-392`；`LogisticsExceptions.tsx:222,344`    |
| `/settings/agent`           | 店家   | `agent-settings` → S-21；無設定列時關閉 | 修改 AI 代查設定並儲存 |    1 | `App.tsx:393-399`；`AgentSettings.tsx:71,240,458`       |
| `/audit-logs`               | 店家   | `audit-logs` → S-23；無設定列時關閉     | 查看最近操作紀錄       |    0 | `App.tsx:405-411`；`AuditLogs.tsx:27,61`                |

## 店家設定與永遠可進頁

| 路由                                | 給誰用       | gate surface                      | 核心動作                         |   步數 | 證據／備註                                                         |
| ----------------------------------- | ------------ | --------------------------------- | -------------------------------- | -----: | ------------------------------------------------------------------ |
| `/settings`                         | 店家         | 無，永遠可見                      | 選設定項或修改店家資料後儲存     |    1–2 | `App.tsx:412`；`Settings.tsx:169,408-434`                          |
| `/skill-map`                        | 店家         | 無，永遠可見                      | 選技能／套餐，預覽後確認套用     |      2 | `App.tsx:404`；`SkillMap.tsx:32,201`                               |
| `/settings/exchange-rate-reference` | 店家         | 無頁面 gate                       | 重新整理參考值或套用至輸入框     |      1 | `App.tsx:400-403`；`ExchangeRateReference.tsx:16,102`              |
| `/trips`                            | 店家         | 無頁面 gate；設定頁入口也固定顯示 | 新增／編輯行程，再新增／編輯路線 | 每段 1 | `App.tsx:413`；`Settings.tsx:426-430,846-861`；`Trips.tsx:324,344` |
| `/setup`                            | 已登入新店家 | 登入 gate                         | 建立初始店鋪                     |      1 | `App.tsx:440-444,463`；`Setup.tsx:6,68`                            |

## 輔助與內部頁

| 路由               | 給誰用         | gate surface               | 核心動作           | 步數 | 證據／備註                                        |
| ------------------ | -------------- | -------------------------- | ------------------ | ---: | ------------------------------------------------- |
| `/receipt-preview` | 店家／內部預覽 | 無顯式 MerchantPortal gate | 預覽測試收據       |    0 | `App.tsx:462`；`ReceiptPreview.tsx:12`            |
| `/dev/handoff`     | 開發／內部     | 無顯式 MerchantPortal gate | 查看交接資料       |    0 | `App.tsx:464`；本盤點未讀取或修改 `dev-handoff/*` |
| 其他未命中路由     | 所有人         | 無                         | 顯示 404，返回首頁 |    1 | `App.tsx:421,485`；`not-found.tsx:3-10`           |

## 斷點與觀察

1. `trips` 已在 `DAILY_SKILL_SURFACE_RULES` 定義 S-09（`dailySkillVisibility.ts:57`），但目前路由與設定頁入口都沒有套該 gate（`App.tsx:413`、`Settings.tsx:429`）。這符合近期「行程與路線管理必須有獨立設定入口」的現況，但規則表與實際接線不完全相同；未來不要只看規則表判斷可見性。
2. 銀行匯率參考也是固定設定入口，沒有技能 gate（`Settings.tsx:427`）。
3. `/receipt-preview` 與 `/dev/handoff` 在最外層路由直接公開掛載，沒有 `MerchantPortal` 登入 gate。是否只在開發環境提供需另行確認；本報告只記現況，不改碼。
4. 進階頁隱藏是 UI 導航與頁面體驗，真正資料隔離仍要依賴 API 的 `requireAuth` 與店鋪 owner 驗證。
