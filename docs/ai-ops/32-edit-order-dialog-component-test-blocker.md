# EditOrderDialog 元件測試阻礙盤點

日期：2026-07-19  
對應：BATCH-14 包 7  
裁決：`skipped`（依 mock 鏈兩輪未果停止；未留下未驗證測試）

## 目標

以 jsdom 與假 hooks 渲染真實 `EditOrderDialog`，驗證：

1. 單價 `0.1`、數量 `3` 的預覽顯示 `NT$0.3`。
2. 折讓超過商品小計加運費時顯示既有錯誤文案。

## 兩輪失敗軌跡

第一輪已 mock Clerk、React Query、API hooks、地址／物流子元件、Sheet 與四個物流圖片 alias；Node 仍在匯入元件階段停止：

```text
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".png"
.../assets/logistics/seven-eleven-logo-official.png
```

第二輪把圖片 mock 從 alias 改成解析後的 `file:` URL，結果相同。兩輪都未進入 React render 或金額斷言；不能視為元件測試已完成。

## 阻礙原因

`EditOrderDialog.tsx` 在模組頂層靜態匯入四個圖片資產。現行 Node `--import tsx/esm` runner 沒有 Vite 的資產 loader；Node module mock 也未在 tsx 解析圖片副檔名前攔截成功。因此即使所有 hooks 與 context 都已是假資料，模組仍無法載入。

## 後續最小路徑

後續應另案選一條，不在本批擅自改 production：

1. 提供測試專用的非 JS 資產 loader，並先用一條煙霧測試證明 `.png`／`.svg` 可被安全替代。
2. 將純顯示的金額預覽區抽成不匯入物流圖片的子元件，再對該元件做 jsdom 測試。
3. 待可用的 Linux E2E harness 恢復後，以真 Vite loader 驗證整個對話框。

既有 `moneyPreview.test.mjs` 已釘住 `0.1 × 3 = 0.3` 的純函式語意；本報告不把該純測試冒充為本包要求的元件接線測試。
