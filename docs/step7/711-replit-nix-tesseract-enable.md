# Step 7O 7-11 Replit Nix Tesseract Enable

## 1. 結論

- replit.nix：已建立（新增）
- package：`pkgs.tesseract4`（tesseract-4.1.1，LSTM OCR）
- `pkgs.tesseract5` 診斷結果：nixpkgs 中不存在此 attribute（nix eval 回傳 "attribute 'tesseract5' missing"，建議改用 tesseract, tesseract3, tesseract4, tesseract_4）
- `pkgs.tesseract`（v3.05.00）：存在但為 2016 年舊版，LSTM OCR 支援不佳
- `pkgs.tesseract4`（v4.1.1）：最接近 v5 的可用版本，採用 LSTM 引擎，適合 CAPTCHA OCR
- 仍需 Re-publish：**是**（本輪不直接 Publish）
- 仍需 UI QA：**是**（Re-publish 後人工操作 browser 確認）

## 2. 問題

Published 正式網站出現：

```
spawn tesseract ENOENT
OCR_FAILED
```

### 根因

Published deployment container 由 `.replit` 的 `modules = ["nodejs-24"]` 建立，
不掛載 workspace nix store，故沒有 tesseract binary。

`resolveTesseractBinary()`（sevenElevenAdapter.ts）的 resolver 優先嘗試：

1. `TESSERACT_BIN` env var → 未設定
2. 已知 nix store 路徑 → workspace 專屬 hash，Published container 不存在
3. `which tesseract` → PATH 沒有 tesseract → 失敗
4. bare `"tesseract"` → ENOENT

結果：所有 attempt 失敗 → `OCR_FAILED`。

## 3. 修復

新增 `replit.nix`（專案根目錄）：

```nix
{ pkgs }: {
  deps = [
    pkgs.tesseract4
  ];
}
```

Replit 在 Published deployment build 時讀取 `replit.nix`，
將 `tesseract4`（tesseract-4.1.1）加入 PATH。

Re-publish 後，resolver step 3（`which tesseract`）將成功找到 binary。

## 4. 驗收方式

1. 使用者在 Replit 按 **Re-publish**
2. 等待 deployment build 完成
3. 打開正式網站（Published URL）
4. 進入 7-11 查詢頁面
5. 輸入貨態查詢，按「重新查詢」
6. 確認不再出現 `OCR_FAILED`
7. 確認貨態結果正常顯示

## 5. 安全邊界

- 未 production write
- 未 DB mutation
- 未改 supportsAutoSync
- 未改 provider formal whitelist
- 未送 /manual-provider/commit
- 未改 .replit
- 未改 env / secrets
- 未 push
- 未直接 Publish
- 未改 UI
- 未改 7-11 adapter 主邏輯（sevenElevenAdapter.ts 未修改）

## 6. 下一步

Step 7O-711-PUBLISH-AND-UI-QA-RETRY

Re-publish 後，人工在正式網站做 7-11 查詢 UI QA。
若查詢成功，此問題視為 closed。
