# Step 7O 7-11 OCR Or Source Validation

**Date**: 2026-06-14
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7O-711-OCR-OR-SOURCE-VALIDATION
**Author**: Claude A（worker = claude-a）

---

## 1. 結論

本輪 OCR 環境驗證結果：**PARTIAL PASS**。

- tesseract 3.05.00 可在此環境執行（nix store 路徑）
- 7-11 eservice 伺服器可從此環境連線（HTTP 200）
- captcha 圖片可下載（2864 bytes）
- OCR 4 位數字輸出：**2/5 前處理變體成功**（threshold 55% / threshold 65%）
- 免 captcha 替代 API：**未找到**
- 未送 tracking code、未查詢貨態、未寫 DB
- 結論：OCR 路線**可行**，可進行下一步完整端對端驗證。

---

## 2. 驗證結果

### 2-1 環境狀態

| 項目 | 結果 | 細節 |
|------|------|------|
| tesseract 可執行 | YES | `/nix/store/89jwgijqcyl56r4h3vwv6v5dprd7xnr9-tesseract-3.05.00/bin/tesseract` 3.05.00 |
| tesseract in PATH | NO | `which tesseract` → NOT_FOUND（需用 nix 絕對路徑） |
| tesseract 5.x | AVAILABLE | `/nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/bin/tesseract` 5.3.4 |
| eng.traineddata | YES | 包含於 3.05.00 及 5.3.4 套件中 |
| ImageMagick (magick) | YES | `/nix/store/.../bin/magick`（Replit runtime PATH） |
| ImageMagick (convert) | YES | 同上 |

### 2-2 網路與 captcha 取得

| 項目 | 結果 | 細節 |
|------|------|------|
| 7-11 eservice 連線 | YES | `GET search.aspx` → HTTP 200 |
| ValidateImage URL 抽取 | YES | HTML 中 `ValidateImage.aspx?ts=XXXXX` 存在 |
| captcha 圖片下載 | YES | 2864 bytes JPEG |

### 2-3 OCR 前處理 × tesseract 結果

| 變體 | 前處理 | OCR 輸出 | 4 位數？ |
|------|--------|----------|---------|
| raw（無前處理） | なし | "" | NO |
| threshold 45% | Gray+400%+45% | "37257775575217" | NO（過多） |
| threshold 55% | Gray+400%+55% | "8851" | **YES** |
| threshold 65% | Gray+400%+65% | "8358" | **YES** |
| normalize+50% | Gray+400%+normalize+50% | "" | NO |

**合計：2/5 変体 → 4位数出力 PASS**

注意：4 桁が出力されても正解である保証はない（未送信）。
正解確認は次のステップで端対端テストにより実施。

### 2-4 代替 API 調査

| 調査先 | 結果 |
|--------|------|
| codebase / docs 全文検索 | 代替 API 言及なし |
| emap.pcsc.com.tw | 門市選択用（tracking 無関係） |
| idelivery / 交貨便 app API | 公開文件なし、codebase に記載なし |
| 7-11 JSON endpoint | **未確認**（非公開の可能性、要追加調査） |

---

## 3. 既存テストスクリプト状態

`scripts/step7/test-seven-eleven-adapter.mjs` は：
- tesseract nix パス（`89jwgijqcyl56r4h3vwv6v5dprd7xnr9-tesseract-3.05.00`）が既に設定済み
- ImageMagick 前処理 5 変体が実装済み
- DB write なし、production write なし
- 実行コマンド例：

```
node scripts/step7/test-seven-eleven-adapter.mjs <tracking_code> 6
```

次のステップでこれを実行し、captcha 正解率と貨態取得成否を確認する。

---

## 4. 缺口

1. **OCR 正解率未確認**：4 桁出力は確認できたが、captcha の正解かどうかは端対端テスト（POST 送信）なしには確認できない。
2. **安全な test tracking code が未特定**：`C44951447678`（既存 script 内）が有効か不明。安全に利用できる test code が必要。
3. **免 captcha 代替 API 未調査**：7-11 app の internal API 等、非公開のものが存在する可能性は残る。

---

## 5. 下一步

**→ Step 7O-711-FULL-PREVIEW-E2E-TEST**

理由：
- OCR 環境は動作確認済み
- 7-11 サーバーに到達可能
- captcha 取得・4 桁 OCR 出力まで PASS
- 残りは端対端テスト（captcha 送信 → 貨態取得）のみ
- 安全な test tracking code（期限切れまたは test 用）を用意して `test-seven-eleven-adapter.mjs` を実行

代替ルートとして：7-11 app の non-captcha API が確認できれば OCR 不要のルートも検討余地あり。

---

## 6. 明確未做

- 未 production write
- 未 DB mutation
- 未改 supportsAutoSync
- 未改 provider whitelist
- 未把 7-11 加入正式自動同步 / MANUAL_SYNC_PROVIDERS
- 未送 /manual-provider/commit
- 未送 tracking code 查詢（captcha 取得のみ）
- 未 Publish
- 未 push
