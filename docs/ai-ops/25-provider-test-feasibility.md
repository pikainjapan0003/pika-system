# StoreSkillVisibilityProvider 測試可行性

日期：2026-07-19  
範圍：唯讀盤點現有依賴與測試結構；本包未安裝套件、未修改產品碼。

## BATCH-13 落地狀態

- 測試基建已於 commit `25a3703` 落地：僅在 `@workspace/shop-app` 新增 `@testing-library/react`、`jsdom` 與共用 DOM bootstrap。
- Provider 五態測試已於 commit `d141715` 落地；Gate／BottomNav 五態測試已於 commit `6f8a3f1` 落地，本機合跑結果為 `10 pass / 0 fail`。
- CI 純測試命令同步使用 Node module-mock 旗標與 shop-app tsconfig；現行 45 個純測試檔合跑結果為 `166 pass / 0 fail`。
- 下方內容保留為導入前的可行性紀錄，不再代表目前依賴狀態。

## 導入前結論

現有依賴無法在 `node:test` 中做有判別力的 Provider 狀態測試。repo 沒有 DOM 環境，也沒有 React 元件測試 renderer；目前單元測試只能鎖住抽出的純函式，無法實際觸發 `useEffect`、非同步 `refresh()`、背景刷新與子元件重繪。

建議後續另開一個測試基建包，引入 `@testing-library/react` 與 `jsdom`，再補 Provider 測試；本批不擅自新增依賴。

## 現況證據

| 檢查項              | 結果                   | 證據                                                                                                                           |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| DOM 測試環境        | 無                     | 全 repo 的 package/lockfile 找不到 `jsdom` 或 `happy-dom`                                                                      |
| React 元件測試工具  | 無                     | 找不到 `@testing-library/react`、`react-test-renderer`、Vitest 或 Jest environment                                             |
| 現有 Provider 測試  | 無                     | `dailySkillVisibility.test.mjs` 只 import `dailySkillVisibility.ts` 的純函式                                                   |
| Provider 的必要行為 | 需要真 React lifecycle | `dailySkillVisibilityContext.tsx` 使用 `useEffect`、`useState`、`useRef`、`useCallback`，並依賴 Clerk `useAuth()` 與 `fetch()` |
| 全鏈替代驗證        | 有但不適合本機快速單測 | E2E 可覆蓋真 UI；Windows 工作區因既定 Linux-only Rollup 原生件無法穩定啟動 Vite                                                |

## 不新增依賴能否測

不能完整測。可維持的只有兩層：

1. 抽成純函式的規則，例如初次載入才重設 loading、surface 可見性與技能計數。
2. Linux CI 的 Playwright 全鏈測試。

`react-dom/server` 只能做靜態 render，不能執行 `useEffect`，因此無法驗證「背景 refresh 不閃 spinner」「舊請求不得蓋過新請求」等真正的 Provider 狀態轉換。自行手刻 React renderer 會比新增標準測試依賴更高風險，不建議。

## 可選方案

| 方案                                  | 能驗什麼                                   | 成本／風險                                                       | 裁決                     |
| ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- | ------------------------ |
| A. `@testing-library/react` + `jsdom` | 真 mount、effect、refresh、re-render、競態 | 新增兩個 dev dependencies 與一個 DOM bootstrap                   | **建議**                 |
| B. `react-test-renderer`              | lifecycle 與 state                         | 套件已不在 repo，且 React 官方已弱化此路線；仍需 mock 瀏覽器行為 | 不建議                   |
| C. 只靠 Playwright                    | 最高真實度的整頁行為                       | 慢、需 Linux/Vite/DB/Clerk stub，失敗定位成本高                  | 保留作整合層，不取代單測 |

## 建議的最小後續包

1. 僅在 `@workspace/shop-app` 新增 `@testing-library/react` 與 `jsdom` dev dependencies。
2. 建一個共用 DOM bootstrap，不改 production bundle。
3. mock `useAuth().getToken` 與 `fetch`，以觀察子元件輸出的 probe 測試 Provider。
4. 至少釘住：初次載入顯示 loading、首次完成後顯示 children、背景 refresh 保留 children、不讓較舊 request 覆蓋較新結果、錯誤時進階 surface fail-closed。
5. Playwright 繼續保留一條技能開關端到端測試，形成「Provider 單測＋整頁 E2E」雙層防線。

## 原報告未解問題的後續

- 新增測試依賴已由審查位核准並於 BATCH-13 落地。
- BATCH-12 包 1 的 Windows→Docker E2E command harness 仍需另案整理，不能把「容器啟動」誤當成 Playwright 已執行。
