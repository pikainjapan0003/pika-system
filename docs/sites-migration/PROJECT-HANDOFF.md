# pika-system｜單一店主・Sites 私人遷移

2026-09-26 線上化接續：**核心已不依賴本機**。原 PRIVATE Sites 改接 Railway 隔離 Express／持久 PG，雲端合成 store 1、product 2、order 1 的 200 元訂單經直接 SQL、API 重啟及停止本機三容器後查回通過。完整位置、試用額度、58 項本輪測試、限制與回復見 `PHASE2-ONLINE-TEST-REPORT.md`；下文店 8／單 19 是前輪本機歷史成果。人工驗收延後，不再要求使用者逐頁確認。

本輪狀態（2026-09-26）：**B＋Astra 的 PRIVATE POC 第 1 版已可試用，真 Clerk → Sites → 隔離 Express → 獨立 PG 的 HTTP 下單切片通過。** 指定管理帳號已親自登入並精確綁定合成店 8；商品 7、假單 19：100 × 2＋0＝200 元，庫存 3→1，token 查單與後台收單成功，直接 SQL 核對保存。使用者已確認前台商品列表、管理商品與訂單兩頁均可見假商品／200 元假單。CUA 連線逾時，因此證據是 HTTP 全流程＋使用者畫面確認，不能稱為完整自動化瀏覽器 E2E；本輪最小 POC 在此交付，不擴大改造。

本機既有 40 項測試、build 與獨立 Astra 唯讀審查已通過；本輪改 POC 啟動器／compose 使用 API 既有 build 與 Node 原生執行，保留所有 guard，root typecheck 再跑 **exit 0**。沒有重構業務規則。「店主」只是使用者本人唯一的管理帳號，不是賣家註冊／建店／onboarding；其他登入者不因此得到店或管理權。

2026-09-25 已核對官方 Sites Terms 2.5(e)、2.6、3.3 與 Help Center，修正先前對交易限制的過度概括：第三方支付處理的電商有明確例外；詳見 `PHASE1-PLAN.md` 開頭。此 POC 仍不接真金流或新增支付整合。保留 Clerk、資料結構、原業務與 OCR 模型。

## 從這裡接續

1. 完整需求：`USER-REQUEST.md`。
2. 架構、四類功能盤點、相容性、POC 與驗收：`PHASE1-PLAN.md`。
3. 施工／測試／位置／blockers：`PHASE1-PLAN.md` G 節。`PHASE1-EVIDENCE.json`、`LOCAL-CHECKS.txt` 是初次方案調查的歷史證據，不覆寫成新測試結果。

## 已核對的位置與身分

| 項目 | 實際結果 |
| --- | --- |
| 工作目錄 | `C:/Users/Lnovo/Documents/ChatGPT/pika-system-Sites私人遷移` |
| Repo | `pikainjapan0003/pika-system` |
| 來源分支 | `codex/invoice-ocr-integration` |
| 分析基準／目前 HEAD | `33953b1fa8586110863c76304f5b6d3dc9f1ba92` |
| 本地與既存遠端遷移分支 | `codex/chatgpt-sites-private-poc` |
| 原 OCR 工作樹 | `C:/Users/Lnovo/Documents/DSH/OCR產品工作樹/invoice-ocr-integration` |
| 初次準備會話 | 「主控｜Codex 協作維護中心」，`01a0863b-bd9b-76c2-bd35-3e06b52b983e`；目前已交由本案唯一主控直接承接 |
| 本次執行會話／路由 | `01a0d870-7de3-78f2-bb79-3c7a31ac6f05`；B＋Astra 主會話分析、實作與測試；使用者核准的普通 Astra 唯讀審查已通過。無 SWE-2／Devin／其他模型或子代理 |
| 模型證據 | 使用者要求 B＋Astra；本案舊綁定寫 medium，本次本機 runtime 日誌可觀測主會話 `gpt-6-astra`／`max`、審查 `gpt-6-astra`／`high`，沒有自行改模型。這是客戶端路由紀錄，後端內部模型不可獨立觀測 |
| 新 Desktop projectId／主控 ID | `4eb00f1d-b20d-4c77-bbc1-d073eee756fe`／`01a0d870-7de3-78f2-bb79-3c7a31ac6f05`；host 為 `local` |
| 唯一主控名稱 | `主控｜pika-system 單一店主・Sites 私人遷移`；官方建立、改名、讀回及本機 ID 均已核對 |
| Sites site ID／部署狀態 | `appgprj_6ab69a6062348191809b743a5635f83e`；沿用 `.openai/hosting.json`，第 1 版 succeeded。網址 `https://pika-system-private-poc-20260925.bill831206.chatgpt.site`；deployment `appgdep_6ab6baf6d37081919c076cf771aef4bb`、env revision 1 |
| 真實測試庫／API 執行位置 | 本機 Docker Desktop，PG16 專用容器／volume、無 host port；Node24 API 常駐只綁 `127.0.0.1:8087`。專用 Cloudflare Quick Tunnel 提供受 gateway key 保護的 HTTPS 上游，電腦與 Docker 必須持續執行，並非永久遠端主機 |
| Clerk 測試設定 | `pika-system-private-poc` Development；app `app_3JpNmDlXneh874yBRpHj8mHPXya`、instance `ins_3JpNmBzRfWBKoGKa7DpPtlxZBCX`。測試 key、精確 admin userId 與固定 storeId 8 在被忽略的 `.poc/api.env`；API 用真 Clerk 簽章，無部署用 mock 登入 |
| PRIVATE 讀回／實測 | access mode custom，只列目前 owner 一位；各 group／editor 清單皆空，外部訪客 0。網站首頁與 API 匿名 HTTP 均 401，平台授權首頁 200。workspace admin 治理權限仍可能適用；未做另一個已登入 ChatGPT 帳號的拒絕測試 |

初次調查發現遠端遷移分支已存在且正好等於固定基準，當時已取回該 ref 並建立本地 worktree；本次直接沿用，不重新取回或建立。原產品 repo 沒有 reset、commit、push 或合併，原主 repo 工作目錄不變；Sites 專用來源庫的操作另記如下。

## 專案局部規則

全程 B＋Astra；不先試 A、不做 SWE 登入／型錄／preflight，不沿用其他案的 run、grant、receipt。全球 B 的簡單整理角色可能是其他模型，但本案使用者已明確要求全程 Astra，故僅在本案保留這項例外，不修改全域設定。

一般小工作由本案既有普通會話依 B＋Astra 要求直接完成。使用者核准的普通唯讀審查已完成，任務「獨立｜SITES-POC-001：私人下單切片唯讀審查」真 ID `01a0d95e-c03d-7382-8f79-53c701046328`；官方 read/wait 確認 completed、無 blocking findings，可繼續真登入／PRIVATE 驗收。原 setup ID `client-new-thread:eaa39355-022b-4beb-b1d3-20740ec996a3` 僅保留追溯，不另建任務。收據 `.poc/checks/independent-review.txt`；作者在審查期間未改產品程式，沒有用子代理或作者測試代替獨立審查。

方案 G4 已更新：審查及部署缺口已解。原 Sites bundled helper 缺失時，採被忽略的一次性受限封裝器，核對專用來源 commit／產物／remote HEAD，再用原生 PRIVATE 部署成功。來源 commit `62b8e1331ddd969e53c61041bac61d09936756f8` 只在 Sites 專用庫；沒有 GitHub push、外掛重裝或全域設定變更。不要重建 Site 或重派審查。

只在此工作樹施工；同目錄單一寫入者。產品 OCR 模型保持原設定。沒有自動施工、物流排程或通知；POC Docker 容器的當前執行與收尾狀態見 G 節，不操作其他專案的 Docker 服務。

## Desktop 接續與工具修復

原交接時確實缺少官方管理工具。後續本機日誌確認 `codex_app` 啟動握手於 10 秒逾時，導致回合沒有就緒工具。維護中心備份後將已安裝外掛的啟動上限改為 60 秒，並設定初始工具目錄等待各服務的啟動期限；沒有改模型、驗證方式或權限。

使用者已加入此資料夾，不必再加入。請直接沿用上述主控；真實綁定见 `.codex/team-v5/state/BINDING.json`。新主控已實際執行 `list_projects`、`read_thread` 並以 `send_message_to_thread` 回傳收據，維護中心已收到。這是正式工具呼叫，並非以私人資料庫／自製服務繞過。

App 的 `read_thread` 有時只回傳回合終態、正文為空；沿用既有 `COLLAB-LOCAL-DELIVERY-05` 協議保留完整本地收據。工具修復的最後本地交付位於 `controller-recovery-20260925/`，不要將歷史 `PHASE1-EVIDENCE.json` 中「尚未取得 ID」的當時結果改造成先前已驗證。

維護中心完成交接後退出本案產品調度，由此唯一主控直接向使用者確認方案。若官方派送／終態工具再次缺失才回報協作故障，不自行安裝服务或重建主控。

施工批准來自使用者明確訊息；不以歷史建案或主控收件作為授權。管理帳號綁定、seed、常駐 API／通道與 PRIVATE 部署均已完成；不要再要求使用者註冊賣家。最小下一步是在同一私人網址持續用假資料試用；OCR／物流／上傳等保留待後續小切片。本次 HTTP 全流程通過，使用者也確認前台與兩個管理頁可見。CUA 持續逾時、`open_in_codex` 回 queued，完整自動化瀏覽器下單驗收未完成；不將使用者確認改寫成工具直接觀察。

## 回復資料

原 AGENTS 備份：`C:/Users/Lnovo/Documents/Codex-backups/SITES-PHASE1-20260925/AGENTS.md.before`。SHA-256：`a1a4e56b1cf2a6f79b28fc3df8b7c0234e31032d1aaf436b74b9fec62d63829a`。

批准後的產品差異與新增隔離腳本見 `PHASE1-PLAN.md` G1，均留在遷移分支的未提交工作樹，沒有改 schema／migration／套件。撤回前先讀現有 diff 與備份逐段處理，不能直接覆蓋或 `git reset/clean`。保留本地工作樹，不必移除 branch/worktree。此 Git worktree 與原 repo 共用 Git object storage，未來移動或移除原 repo 前需正常處理 worktree 關係。

本次兩份文件增量更新的改前備份、tracked diff 與 status 在 `C:/Users/Lnovo/Documents/Codex-backups/SITES-PLAN-REFRESH-20260925-1436/`；歷史 PHASE1 與工具修復收據不改寫，其 hash 只指當時版本，不能拿來覆蓋本次成果。

批准後施工的原檔、diff／status 備份在 `C:/Users/Lnovo/Documents/Codex-backups/SITES-POC-20260925-implementation/`。不要重複 seed 或 DB push；測試 PG schema、六個保護 triggers、固定合成店與驗收假單均已存在。沒有任何測試 mock 登入可供部署使用。

Clerk／審查狀態增量更新的歷史備份在 `C:/Users/Lnovo/Documents/Codex-backups/SITES-POC-20260926-clerk/`；本輪三份文件、啟動器與 compose 改前備份在 `C:/Users/Lnovo/Documents/Codex-backups/SITES-POC-20260926-private-e2e/`。真 test key build 完整輸出在 `.poc/checks/clerk-development-build.txt`；舊編譯用封裝保留，勿誤部署。API／DB／tunnel 保留執行供驗收；一次性設定寫入服務已關閉，root typecheck 已完成，無背景原始碼 writer。
