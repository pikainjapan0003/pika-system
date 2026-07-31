# 依賴健康盤點

盤點日：2026-07-31  
範圍：整個 pnpm workspace  
性質：唯讀盤點；本報告沒有修改任何套件版本或 lockfile

## 結論

- `pnpm audit --json` 回報：critical 0、high 16、moderate 7、low 3。這是受影響的依賴節點數，不等同於 26 個彼此獨立的漏洞；原始資料共有 24 筆 advisory。
- 最優先處理直接依賴的安全修補：Playwright、Multer、`http-proxy-middleware`、esbuild，以及 mockup-sandbox 使用的 Vite。
- Express、ExcelJS 與 Orval 本身未必需要立即做大版本升級，但它們帶入的 `qs`、`body-parser`、`uuid`、`brace-expansion`、`js-yaml`、`markdown-it`、`linkify-it`、`fast-uri` 仍須透過上游升級或受控 override 消除。
- 本輪不自動升級，原因是跨 workspace 的 UI、API、產生器與 E2E 依賴需要分批驗證；安全修補應另開 coding 包並逐組跑完整回歸。

## 安全性必升

| 優先 | 直接依賴／路徑                                   | 現況                     | 最低安全版本或處理方向                                                                            | 理由                                                                                                                               |
| ---- | ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P1   | root `@playwright/test` → `playwright`           | 1.55.0                   | 至少 1.55.1                                                                                       | 高風險；瀏覽器下載時未驗證 SSL 憑證（GHSA-7mvr-c777-76hp）。                                                                       |
| P1   | api-server `multer`                              | 2.1.1                    | 至少 2.2.0                                                                                        | 一高一中風險 DoS；API 有檔案上傳面。                                                                                               |
| P1   | api-server `http-proxy-middleware`               | 4.0.0                    | 至少 4.1.1                                                                                        | 高風險 multipart CRLF 注入及中風險 router 比對繞過。                                                                               |
| P1   | mockup-sandbox `vite`                            | 7.3.3                    | 至少 7.3.5                                                                                        | 一高一中風險 Windows dev-server 路徑／UNC 問題；雖屬開發工具，仍在工作區執行。                                                     |
| P1   | api-server `esbuild`                             | 0.27.3                   | 至少 0.28.1                                                                                       | Windows 開發伺服器可任意讀檔；直接依賴已有安全版本。                                                                               |
| P1   | api-server `express` → `qs`／`body-parser`       | express 5.2.1；qs 6.15.1 | 讓 lockfile 解到 qs ≥6.15.2、body-parser ≥2.3.0；若上游尚未帶入則等 Express 修補版或受控 override | 遠端 DoS；屬伺服器請求解析鏈。不得直接手改 lockfile。                                                                              |
| P1   | api-server `exceljs` → `uuid`／`brace-expansion` | exceljs 4.4.0            | 優先查上游可用修補；必要時另案驗證精準 override                                                   | 中風險 UUID buffer 邊界及高風險 brace expansion DoS；XLSM PoC 已使用 ExcelJS，升級需重跑範本位元完整性測試。                       |
| P1   | api-spec `orval` 工具鏈                          | orval 8.9.1              | 先升同 major 最新 8.x，再重新 audit；剩餘傳遞漏洞才評估精準 override                              | 帶入多筆 high/moderate：js-yaml、linkify-it、brace-expansion、fast-uri、markdown-it。僅開發／產生器面，但 codegen 會解析外部規格。 |

## 建議升級

以下沒有在本次 audit 中形成已知漏洞，但已落後同 major 或有明確 patch/minor 可用。建議拆成低風險更新包，每組都跑 frozen install、四套 typecheck、純測試、DB route tests 與 build：

1. 後端小版本：`@aws-sdk/client-s3` 3.1057.0 → 3.1098.0、`@clerk/express` 2.1.22 → 2.1.48、`express-rate-limit` 8.5.2 → 8.6.1、`pg` 8.20.0 → 8.22.0、`tsx` 4.21.0 → 4.23.1。
2. 前端同 major：`@clerk/react` 6.7.2 → 6.12.9、React 19.1.0 → 19.2.8、React DOM 19.1.0 → 19.2.8、React Hook Form 7.75.0 → 7.83.0、TanStack Query 5.100.9 → 5.101.4、Tailwind 4.3.0 → 4.3.3。
3. 工具同 major：Prettier 3.8.3 → 3.9.6、Orval 8.9.1 → 8.23.0、Radix UI 各套件同 major patch/minor。
4. `@types/*` 可獨立更新，但 Node 25 → 26 與 React types 更新仍應先跑 typecheck，不能視為純 lockfile 變更。

## 可等待／需專案升級

以下最新版跨 major，沒有本次 audit 指向必須立刻升級。待功能批次穩定後另案處理：

- TypeScript 5 → 7、Vite 7 → 8、`@vitejs/plugin-react` 5 → 6。
- Zod 3 → 4、date-fns 3 → 4、jsdom 26 → 30、Chokidar 4 → 5。
- Pino 9 → 10、pino-http 10 → 11、thread-stream 3 → 4。
- Recharts 2 → 3、react-resizable-panels 2 → 4、lucide-react 0.x → 1.x、React Day Picker 9 → 10。
- `@hookform/resolvers` 3 → 5、Testing Library React 15 → 16。

跨 major 更新不得和安全 patch 混成同一 commit，以免安全修補被相容性回歸拖延。

## Advisory 摘要

| 嚴重度          | 模組                    | 修補版本                               | 路徑／備註                         |
| --------------- | ----------------------- | -------------------------------------- | ---------------------------------- |
| high            | playwright              | ≥1.55.1                                | root E2E                           |
| high / moderate | multer                  | ≥2.2.0                                 | api-server 直接依賴                |
| high / moderate | http-proxy-middleware   | ≥4.1.1                                 | api-server 直接依賴                |
| high / moderate | vite                    | ≥7.3.5                                 | mockup-sandbox                     |
| low             | esbuild                 | ≥0.28.1                                | api-server 直接依賴                |
| moderate / low  | qs、body-parser         | qs ≥6.15.2；body-parser ≥2.3.0         | Express 傳遞依賴                   |
| moderate        | uuid                    | ≥11.1.1                                | ExcelJS 傳遞依賴                   |
| high            | brace-expansion         | 依 major 至少 1.1.16／2.1.2／5.0.8     | ExcelJS 與 Orval 工具鏈            |
| high / moderate | js-yaml                 | ≥4.3.0                                 | Orval 工具鏈                       |
| high / moderate | linkify-it、markdown-it | linkify-it ≥5.0.2；markdown-it ≥14.2.0 | Orval → TypeDoc 工具鏈             |
| high            | fast-uri                | ≥3.1.4                                 | Orval → OpenAPI parser → AJV       |
| high            | postcss                 | ≥8.5.18                                | mockup-sandbox → Vite              |
| low             | @babel/core             | ≥7.29.6                                | mockup-sandbox → Vite React plugin |

完整 advisory URL 以 `pnpm audit --json` 當日輸出為準；其中 Playwright 為 GHSA-7mvr-c777-76hp，其他項目皆保留在 audit JSON 的 `url` 欄。

## 執行證據

```text
corepack pnpm outdated -r --format json
exit 1（存在過期依賴，屬預期結果）

corepack pnpm audit --json
exit 1（存在 vulnerability，屬預期結果）
metadata.vulnerabilities={"info":0,"low":3,"moderate":7,"high":16,"critical":0}
advisory records=24
```

掃描前後 `pnpm-lock.yaml` SHA-256 均為：

```text
DA870376C505685A497ECC6F7081FEFCD339F3AE73E43E51840EC45CB4C05147
```

因此本包只讀，未改 package manifest 或 lockfile。

## 建議施工順序

1. 先做直接依賴安全 patch：Playwright、Multer、http-proxy-middleware、esbuild、Vite。
2. 再做 Express 傳遞鏈與 ExcelJS 傳遞鏈；ExcelJS 包必跑 XLSM 範本 hash、VBA 與非目標 ZIP entry 位元不變測試。
3. 最後處理 Orval/codegen 工具鏈，重生 generated 後只能由專門 codegen 包驗證，不得在一般修補包手改 generated。
4. 每組更新後重新執行 `pnpm audit --json`，以 vulnerability 實際歸零或明確留下受控風險為驗收。
