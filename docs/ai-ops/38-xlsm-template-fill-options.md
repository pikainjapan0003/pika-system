# 賣貨便 XLSM 範本填值方案研究

- 狀態：研究完成，尚未實作
- 抓取／核對日：2026-07-31
- 研究對象：`C:\Users\Lnovo\Desktop\711CSV\賣貨便_訂單匯入_範本.xlsm`
- 目標：以官方 v1.4 範本為底填入「訂單匯入」資料，保留巨集與原範本結構

## 結論

建議先做 **方案 A（SheetJS 範本 round-trip）的小型技術驗證**，通過下方全部驗收門檻後才接到正式匯出功能。若方案 A 無法完整保留範本，改做 **方案 B（只替換目標工作表 XML 的 ZIP 手術）**；方案 C（Windows Excel 自動化）保真度最高，但與目前 Replit/Linux 部署不相容，不建議作為正式後端。

無論採哪個方案，都禁止新建一份普通活頁簿再改名成 `.xlsm`。Microsoft 說明 `.xlsx` 不能儲存 VBA，而 `.xlsm` 才能儲存 VBA；副檔名不是裝飾，檔案封裝內容必須一致。

## 官方範本的唯讀實證

以 ZIP／Open XML 層級唯讀檢查原檔：

| 檢查項                  | 結果                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| 檔案大小                | 36,032 bytes                                                       |
| 工作表                  | `訂單匯入`、`填寫說明`                                             |
| 版本位置                | `填寫說明!B1 = 1.4`                                                |
| VBA 二進位              | `xl/vbaProject.bin` 存在                                           |
| VBA relationship        | `xl/_rels/workbook.xml.rels` 內存在 `vbaProject` 關聯              |
| 巨集活頁簿 content type | `application/vnd.ms-excel.sheet.macroEnabled.main+xml`             |
| VBA content type        | `application/vnd.ms-office.vbaProject`                             |
| 原始 VBA SHA-256        | `4a863928a679fe1e1e639d236fc12c8d5748f6a15d70212e5401d753468dfb08` |

這些結構是後續驗收的基準。產出檔至少要保留相同的 VBA bytes、巨集 relationship、macro-enabled content type、工作表名稱與 `填寫說明!B1 = 1.4`。

## 方案比較

### A. SheetJS：讀入官方 XLSM、保留 `vbaraw`、寫回 XLSM

流程：

1. 以官方範本為輸入，`bookVBA: true` 讀取。
2. 只清除／寫入「訂單匯入」允許的資料列，不新建 workbook。
3. 以 `bookType: "xlsm"`、`bookVBA: true` 寫出。
4. 比對原檔與產出檔的巨集及範本結構。

官方 SheetJS 文件明確說明：讀取時設定 `bookVBA: true` 會取得 `vbaraw`，輸出為支援巨集的格式時可保存該 blob；XLSM 的巨集即存於容器中的 `vbaProject.bin`。

優點：

- Node/Linux 可跑，符合 Replit 後端環境。
- API 直接支援 VBA blob 的讀取與寫回。
- 實作量比 ZIP 手術低，較容易測試與維護。

風險：

- SheetJS 會重建部分 workbook XML；「保留 VBA blob」不等於保證所有格式、驗證、命名、巨集關聯與範本細節都逐位元不變。
- 若巨集依賴工作表 code name、defined names、控制項或特殊 relationship，必須另行逐項驗證。
- repo 目前未安裝 SheetJS；新增依賴前需做供應鏈、授權與 lockfile 審查。

裁決：**首選技術驗證方案，不可未驗證直接上正式功能。**

### B. Open XML ZIP 手術：複製官方範本，只修改目標 sheet XML

流程：

1. byte-for-byte 複製官方 `.xlsm`。
2. 由 `workbook.xml` 與 relationships 找到「訂單匯入」對應的 worksheet part。
3. 只替換該 worksheet 的資料列／cell XML；其餘 ZIP entries 原封不動。
4. 不改 `vbaProject.bin`、content types、workbook relationships、`填寫說明`、B1 或巨集相關 part。

優點：

- 對非目標 parts 的保留最直接；可要求 `vbaProject.bin` SHA-256 完全一致。
- 不需 Excel 桌面程式，Node/Linux 可執行。
- 能以白名單方式限制唯一可變更的 ZIP entry。

風險：

- Open XML 細節複雜：shared strings、style index、dimension、merge cells、data validation、table range、calc chain、relationship 與 ZIP CRC 都可能造成 Excel 修復警告。
- 若直接改 sharedStrings，可能影響其他工作表；較安全的做法是目標資料格使用 inline strings，但仍須確認官方匯入巨集能讀取。
- 自行維護 XML writer 的成本與長期風險最高。

裁決：**方案 A 驗證不過時的備案。** 實作必須採「允許變更 entry 白名單」與封裝 diff 驗收。

### C. Windows Microsoft Excel 自動化：開啟範本、填值、另存 XLSM

流程：

1. 在已安裝 Microsoft Excel 的 Windows 執行環境開啟官方範本。
2. 透過 COM／PowerShell 或 Excel 自動化填入資料。
3. 由 Excel 本身另存為 macro-enabled workbook。

優點：

- 由 Excel 原生讀寫，對巨集、格式、驗證與物件的相容性最高。
- 可用 Excel 實際開啟、執行巨集與另存完成端到端驗證。

風險：

- Replit/Linux 無法執行；需要另建 Windows worker 或人工桌面流程。
- Office 桌面自動化不適合一般多使用者伺服器：程序殘留、互動視窗、更新版本、權限與授權都會增加維運成本。
- 若改成人工流程，就失去目前後端一鍵匯出的主要價值。

裁決：**只作為離線保真工具或驗收工具，不作正式 Replit 後端。**

## 排除方案

### 現有 ExcelJS 直接讀寫

repo 目前在 `artifacts/api-server/package.json` 使用 `exceljs ^4.4.0`，用途是讀取物流 XLSX。其公開定位與 API 主要是 XLSX workbook reader/writer，沒有 SheetJS 文件中那種 `vbaraw` 保留契約。ExcelJS 專案也有使用者回報複雜含巨集檔案 read→write 後損壞的案例。

因此本線不可因「repo 已有 ExcelJS」就推定它會安全保留官方 XLSM。除非另有可重現的官方能力與完整驗收證據，否則不採用。

### 新建 XLSX／XLSM

排除。新建 workbook 即使副檔名叫 `.xlsm`，也不會自動繼承官方範本的 `vbaProject.bin`、B1 版本、relationships、格式與巨集相依物件，屬於「冒充官方範本」。

## 建議的技術驗證

方案 A 應先開獨立小包，只用假資料且不接 route/UI：

1. 從官方 v1.4 範本複製產出一份測試檔。
2. 在「訂單匯入」寫入至少三列：
   - 中文姓名／一般常溫單；
   - 選填欄空白；
   - 邊界金額與特殊但合法文字。
3. 驗證 ZIP 結構：
   - `xl/vbaProject.bin` 存在且 SHA-256 等於原檔；
   - macro-enabled workbook content type 與 VBA relationship 存在；
   - `填寫說明!B1 = 1.4`；
   - 工作表名稱與順序不變；
   - 不得多出 Excel 修復紀錄。
4. 用 Microsoft Excel 實際開啟：
   - 無「已修復部分內容」警告；
   - 巨集仍存在；
   - 原檢核按鈕／公式／資料驗證可用；
   - 官方賣貨便匯入流程接受檔案。
5. 只有上述全部通過，才可接到現有 CSV preview／owner-only export 流程。

其中「Excel 實際開啟＋官方匯入接受」無法只靠 Node 單元測試替代，應列為 Fable 5／老闆的人工驗收門檻。

## 安全與維運要求

- 官方 XLSM 範本應以受控資產納入 repo 或部署包，並記錄原檔 SHA-256；不得由使用者任意上傳範本供後端執行。
- 後端只填資料，不執行 VBA。
- 匯出仍沿用現有 owner-only、明文個資二次確認、筆數上限與 audit log。
- 產出檔名不得覆蓋官方原檔。
- 每次官方範本版本變更都要重新跑完整驗證；B1 不是 1.4 時 fail-closed，不可偷偷沿用舊解析。
- 不在伺服器保留匯出檔；以 response 串流交付後即釋放。

## 建議決策

1. 核准一個「SheetJS 保留巨集 PoC」小包，只做範本 round-trip 與假資料填值。
2. PoC 驗收必須包含 `vbaProject.bin` hash、B1、Excel 無修復警告與官方匯入測試。
3. PoC 任一門檻失敗，即停止 SheetJS 路線並評估方案 B；不得以「副檔名是 xlsm」視為成功。

## 來源

- Microsoft Learn, XML file name extension reference for Office（`.xlsx` 不能存 VBA、`.xlsm` 可存 VBA），抓取日 2026-07-31：<https://learn.microsoft.com/en-us/office/compatibility/xml-file-name-extension-reference-for-office>
- SheetJS Community Edition, VBA and Macros（`bookVBA`、`vbaraw`、XLSM 輸出條件），頁面更新 2025-09-04，抓取日 2026-07-31：<https://docs.sheetjs.com/docs/csf/features/vba/>
- ExcelJS 官方 GitHub 專案（XLSX workbook manager；repo 現有依賴的上游），抓取日 2026-07-31：<https://github.com/exceljs/exceljs>
- ExcelJS issue #1366（複雜／含巨集 workbook read→write 的損壞回報，屬風險佐證而非正式能力保證），抓取日 2026-07-31：<https://github.com/exceljs/exceljs/issues/1366>
