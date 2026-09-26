# 私人 POC：R2 圖片接線

更新：2026-09-26。B＋Astra；延續原工作樹，沒有重新建案。

## 目前結果

1. **R2 已接通。** 已建立獨立的私有 `pika-sites-poc` bucket；合成 PNG 經原店主上傳 API 真正存入 R2。
2. **現在能上傳並顯示假商品圖片。** 商品「測試用筆記本（合成商品）」已保存圖片關聯，Chrome 在私人商品頁實際載入並解碼為 128×128。可從[私人測試站](https://pika-system-private-poc-20260925.bill831206.chatgpt.site/) 點入該商品。
3. **API 重啟後仍能讀回。** R2 SDK、API 及重啟後 API 讀取均為同一份 417 bytes PNG，SHA-256 完全一致；重新進入商品頁也再次成功顯示。API／PostgreSQL 在 Railway，圖片在 R2，不依賴本機服務或 Docker 常駐。
4. **bucket 私有、Sites PRIVATE 與唯一店主授權均保留。** Cloudflare API 讀回 r2.dev `enabled=false`；Sites 為 mode `custom`、policy revision 1、唯一 owner，0 群組／編輯者／外部訪客。未登入不能上傳或修改圖片，未登入 Sites 不能取得圖片。
5. **使用者不需再做任何設定或人工驗收。** 專用憑證已存入正確 Railway API 並隨新部署套用；展示用圖片保留。未接真 OCR、物流或金流。

## 最小接線與資源

路徑：Sites 同源 `/api` → 原 Railway Express → 專用私有 R2；商品既有 PostgreSQL `imageUrl` 欄位保存固定應用程式網址，不保存會到期的預簽網址。

| 項目 | 本輪核對 |
| --- | --- |
| 私人站 | `https://pika-system-private-poc-20260925.bill831206.chatgpt.site` |
| Sites project | `appgprj_6ab69a6062348191809b743a5635f83e` |
| 改前 Sites deployment | `appgdep_6ab6d89ab18c8191a6d7f1438b4f6939`；環境 revision 2 |
| Railway project | `pika-system-private-poc`／`de13e86c-9d70-4396-85be-79cd73cd412f` |
| Railway environment | `production`／`143266a9-b10c-4dec-9b8f-f4eec9bec86a`；此為獨立合成資料專案，不是 Replit 正式環境 |
| API service | `pika-poc-api`／`1068b8cf-3623-4b85-a702-d7bb7b70080e` |
| 改前 API deployment | `ed470da8-3183-44a1-af3e-daf3daac3291`，SUCCESS；保留作回復依據 |
| 本輪 API deployment | `1de6c71e-7df4-4d08-b8df-71ae9e8ca258`，SUCCESS；2026-09-26 06:19 UTC 建立，06:27 UTC 已完成受控重啟 |
| PostgreSQL | 既有隔離 `Postgres` service `8fefb8b0-4e60-4b2b-b87d-b3cd486388b8`；私網 `postgres.railway.internal`；測試 DB `pika_sites_poc`，沒有新增公開 DB 入口 |
| Cloudflare account | 使用者切換並授權的 `Pikainjapan0002@gmail.com` 帳號；account `2a74cf97534f81a4af48e9ba9fe039f6`，membership 與 Dashboard 一致 |
| R2 bucket | `pika-sites-poc`，本輪新建、只放合成圖片；default jurisdiction、Automatic／Asia Pacific、Standard；Public Access Disabled |
| 實際 S3 endpoint | `https://2a74cf97534f81a4af48e9ba9fe039f6.r2.cloudflarestorage.com`；沿用 SDK region `auto` |
| API 專用憑證 | `pika-sites-poc-api`，Account API Token 的 **Object Read & Write**，僅套用 `pika-sites-poc`；Express 只取得對應的 S3 access key／secret，未取得管理 OAuth token |

沿用 `artifacts/api-server/src/lib/r2.ts` 的五個服務端設定名稱：`CLOUDFLARE_R2_ACCOUNT_ID`、`CLOUDFLARE_R2_ACCESS_KEY_ID`、`CLOUDFLARE_R2_SECRET_ACCESS_KEY`、`CLOUDFLARE_R2_BUCKET_NAME`、`CLOUDFLARE_R2_PUBLIC_URL`。沒有新增前端／`VITE_*` 密鑰。

其中最後一項已設為 `https://pika-system-private-poc-20260925.bill831206.chatgpt.site/api/poc/images`，是固定的應用程式網址。五項變數皆從指定 API service 讀回確認；沒有放在 Sites／`VITE_*`。以 service-scoped 更新加入變數，沒有套用其他服務的 staged changes；API 明確使用正常的 `node src/poc/start.mjs`、空 preDeployCommand，再以 `railway up` 建立新部署，沒有重播初始化程序。[Cloudflare R2 認證與權限](https://developers.cloudflare.com/r2/api/tokens/)

程式差異：

- `artifacts/api-server/src/routes/upload.ts`：原店主 multipart 上傳、5 MiB 與 JPEG／PNG／WebP 檢查保留；加入 POC 專用穩定位址讀圖，限制指定店鋪、程式產生的 object key 格式及固定設定 bucket。回傳圖片 bytes、`private, no-store`、`nosniff`；不接受呼叫者指定 bucket 或任意 URL。
- `artifacts/api-server/src/lib/privatePoc.ts`：只為上述圖片 GET 與既有圖片 POST 增加 POC 路由允許項；原 gateway、唯一店主與其他功能限制保留。
- `artifacts/api-server/src/poc/privatePocImages.integration.test.mjs`：新增 5 項圖片測試，使用真隔離本機 PG、測試檔限定的 Clerk／R2 mock。

讀圖經 Sites PRIVATE 與既有服務間 gateway，供私人站中的商品頁／模擬客人使用；它沒有宣稱每次 `<img>` 請求都驗 Clerk 店主。上傳與商品修改仍由指定 Clerk owner 控制。沒有新增 CORS、直傳流程、schema、資產管理框架或付款／OCR／物流整合。

## 自動驗證

| 驗證層 | 結果 |
| --- | --- |
| 本機圖片路由 | **5/5 通過**：拒絕無 gateway、無 Clerk、非店主、錯店；保留格式與大小限制；上傳後真 PG 保存固定 imageUrl；讀回精確 PNG bytes；任意 key／錯店／缺物件拒絕；HTTP 重啟仍能解析；非 POC 不開放此路由 |
| 最小核心回歸 | **9/9 通過**：既有指定店主管理、商品維護、真 PG 下單、token 查單、庫存及跨店拒絕。手算沿用 100 × 2＋運費 0＝200，庫存 3−2＝1 |
| 合併測試程序 | **14/14、exit 0**；Linux Node 映像＋本專案隔離本機 PG，只有三個 R2 差異檔唯讀掛入。收據：`.poc/checks/r2-image-and-core-tests-image.txt` 與 `.exit.json` |
| root typecheck | **exit 0**；`docker compose -f sites/poc/compose.yaml run --rm tools run typecheck`，libs／API／shop-app／mockup-sandbox／scripts 完成；收據 `.poc/checks/r2-typecheck.txt` |
| 真實店主上傳 | **通過**：現有 Clerk Development 指定店主 session，原 multipart `POST /api/stores/1/products/image` 回 201；沒有使用測試專用上傳後門或直接往 R2 UI 放檔 |
| 雲端 PG 商品關聯 | **通過**：原 `PATCH /api/stores/1/products/1` 回 200；獨立 GET 路由重新查 PG，保存相同固定 imageUrl；售價 100、庫存 30 均未變 |
| 真 R2 SDK 讀取 | **通過**：專用 S3 憑證執行 HeadObject／GetObject 均 200，`image/png`、417 bytes，內容 SHA-256 與合成原圖相同 |
| API 圖片路徑 | **通過**：200、417 bytes、同一 SHA-256、`Cache-Control: private, no-store` |
| API 重啟後讀取 | **通過**：06:27 UTC Railway `deploymentRestart` 接受並回到 SUCCESS；06:28 UTC 再查商品及圖片均 200，PG 固定網址及圖片 hash 不變 |
| 真瀏覽器 Sites 圖片 | **通過**：Chrome 商品詳情的 `<img>` 使用實際 Sites `/api/poc/images/...`，`complete=true`、`naturalWidth=128`、`naturalHeight=128`；重啟後由商品列表重新進入，再次成功 |
| 線上拒絕測試 | **通過**：缺 gateway 上傳／讀圖 403；有 gateway 但缺 Clerk 的上傳／修改圖片 401；未登入 Sites 直接讀圖片 401 |
| R2 未簽署存取／公開設定 | **通過**：S3 endpoint 未簽署 GET 回 400 `InvalidArgument`，沒有圖片；managed domain API 200、`enabled=false`，Dashboard Public Access Disabled。沒有將 400 寫成 403 |
| 最小線上核心回歸 | **通過**：店主商品／訂單 API 200；重啟後既有 order 1 的 token 查單 200，100 × 2＋運費 0＝200。未新增付款、物流或通知 |

展示圖片：store 1／product 1，object key `products/1/1790403772950-12837f1ed270ede5.png`。SHA-256：`5ebf45e7206f8cfc6dab1a35c320bdd9506cf6f754b3ef8e83d791cfca67048c`。保留此物件與商品關聯供繼續試用；沒有刪除任何原有物件。去密收據：`.poc/checks/r2-live-integration.json`、`r2-cloudflare-second-account.json`。

首次本機測試因 cwd／NTFS 依賴載入失敗，改用既有 Linux 映像後完成 14 項；沒有刪失敗斷言。本機測試 PG 已停止、volume 保留。獨立 SDK 驗證只用 `docker run --rm` 作測試客戶端；線上 API、PG、R2 均不在本機。沒有進行壓力測試、正式圖片搬移或完整新一輪人工下單驗收。

## 帳號操作、費用與回復

第一個 Cloudflare 帳號 `ad341465b760c222c570845d64a263dd` 的 R2 回 10042，未替它啟用服務。使用者切換到既有 R2 的正確帳號後，membership、Dashboard 與 R2 bucket metadata 200 已核對一致。曾有一次 metadata 請求仍帶舊 account ID 而回 403，已修正收據，不能把這次錯誤當成新帳號沒有 R2 權限。現有 `pika-image-bed`／`pika-shop` 只在必要清單辨識，未開啟或下載其物件。

Wrangler `4.141.0` 的登入由 Windows keyring 保護；它的 token 管理 API 仍回 403，因此使用同一已登入 Chrome 的 R2 Dashboard 建立專用 token。建 bucket 時控制回覆曾斷線，但先讀回確認已成功，沒有重建。沒有撤銷原本其他服務的 token。

建立 secret 前先準備一次性、僅綁 `127.0.0.1` 的記憶體接收表單，具來源／nonce 檢查；CUA 不回顯地讀取本次 secret，填入該表單，再經 Railway CLI 的 stdin JSON 寫入指定服務。設定讀回相符後關閉接收器與秘密頁面。未把完整 secret 輸出到聊天、截圖、報告、Git、argv 或 debug log；此流程不代表工具系統絕對不留痕。正常專用憑證保留於 Railway。

2026-09-26 04:27 UTC 的 Railway 查詢剩餘約 US$4.9780 試用額度、無付款方式；這是當時數字，非目前餘額保證。正確 Cloudflare 帳號的 R2 已啟用，建立前控制台顯示當期 billable usage `$0.00`。本輪只有少量物件操作與既有 Railway 測試服務部署／重啟；**沒有新付費啟用、綁卡、升級或購額度**，不宣稱永久免費。r2.dev 狀態欄位依[官方 API 定義](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/managed/methods/list/)核對。

分支 `codex/chatgpt-sites-private-poc`；HEAD／歷史起點 `33953b1fa8586110863c76304f5b6d3dc9f1ba92`，沿用全部未提交 POC 成果。本輪目前沒有 stage／commit／push；不是把 HEAD 當作目前所有改動的完整版本。

改前檔案與差異：`C:/Users/Lnovo/Documents/Codex-backups/SITES-R2-20260926/`；API 改前設定收據 `.poc/checks/r2-before-deploy.json`。本輪乾淨部署來源保留於 `.poc/api-source-89oWkM`，不包含密鑰。回復時比對本輪差異與後續修改，只還原圖片接線；恢復前一可用 API 版本與正常啟動設定，停用本輪 R2 變數，必要時把本輪 product 1 的 imageUrl 還原為改前的 null。不刪 bucket／物件／資料庫，不撤銷其他服務憑證；不要重播帶 initializer 的歷史部署。

原正式 R2、Replit production、原 OCR 分支、main、正式網域未被本輪修改。原 OCR／物流仍是 fixture；商品圖片接線不等於這兩者的真整合已完成。
