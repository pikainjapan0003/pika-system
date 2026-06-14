# Step 7O 7-11 Full Preview E2E Test

**Date**: 2026-06-14
**Branch**: qa/step6f-cvs-store-selection-browser-mobile
**Step**: 7O-711-FULL-PREVIEW-E2E-TEST
**Author**: Claude A（worker = claude-a）

---

## 1. 結論

**PARTIAL — E2E パイプライン PASS、normalization 改善が必要。**

tesseract 5.3.4（nix store）を使用して 7-11 E2E 追跡クエリに成功。
2 回目の attempt で captcha OCR 正解 → POST 成功 → 8 events 取得。
ただし `normalizeSevenElevenStatus` の 7-11 固有パターン未登録により
最新ステータスを含む 6/8 events が `"unknown"` を返す（adapter POC の既知制限）。

- tracking code: `****7678`（last4 表示；完全コード非公開）
- DB 未書き込み / supportsAutoSync 未変更 / provider whitelist 未変更

---

## 2. E2E 結果表

| 項目 | 結果 | 証拠 | 備考 |
|------|------|------|------|
| tracking code available | YES（confirmed safe） | ユーザー確認済み | last4: `****7678` |
| GET search page | PASS | HTTP 200 | tesseract 3.x / 5.x 両方で確認 |
| captcha download | PASS | 2864 bytes JPEG | ValidateImage.aspx |
| OCR（tesseract 3.05） | FAIL（3/6 VERIFY_FAILED、3/6 OCR_FAILED） | 全 6 attempts 失敗 | 4桁出力あるが全て不正解 |
| OCR（tesseract 5.3.4） | PASS（attempt #2 成功） | `query_no match: true` | 5.x の方が精度高い |
| POST query | PASS | 7-11 サーバーが貨態を返却 | attempt #2 でキャプチャ正解 |
| tracking result parse | PASS | 8 events、timestamps 全取得 | latestStatus / pickupStoreName / pickupDeadline 含む |
| normalized preview | PARTIAL | 2/8 correct、6/8 → "unknown" | normalizeSevenElevenStatus パターン不足（既知 POC 制限） |
| DB write | NO | 無 DB 操作 | ✓ |
| supportsAutoSync unchanged | YES | 未変更 | ✓ |
| provider whitelist unchanged | YES | 未変更 | ✓ |

---

## 3. Preview-only result shape

E2E で実際に取得したデータ（tracking code は last4 のみ表示）：

```
trackingCode:      "****7678"
provider:          "711"
latestStatusText:  "已完成包裹成功取件"
normalizedStatus:  "unknown"  ← 要修正（should be "picked_up"）
latestEventAt:     "2026/06/11 17:30"
pickupStoreName:   "鳳來"
pickupDeadline:    "2026-06-17"
paymentInfo:       "取貨付款"
eventCount:        8

events（降順）:
  "2026/06/11 17:30" | 已完成包裹成功取件   → normalized: "unknown"
  "2026/06/10 03:37" | 包裹配達取件門市     → normalized: "unknown"
  "2026/06/09 21:20" | 包裹離開【南區】...  → normalized: "unknown"
  "2026/06/09 15:23" | 包裹已於【南區】...  → normalized: "unknown"
  "2026/06/09 09:28" | 包裹已送達【北區】.. → normalized: "in_transit" ✓
  "2026/06/09 04:50" | 包裹離開寄件門市...  → normalized: "unknown"
  "2026/06/08 20:10" | 寄件門市已收件      → normalized: "pending" ✓
  "2026/06/08 19:54" | 交貨便訂單已成立... → normalized: "unknown"
```

---

## 4. PARTIAL 原因

1. **normalizeSevenElevenStatus パターン不足**：現行パターンは POC 最小規則。実際の 7-11 ステータステキスト（「成功取件」「配達取件門市」「離開...前往」等）が未カバー。修正は `sevenElevenAdapter.ts` に 5〜8 パターン追加で対応可。
2. **tesseract 3.05.00 では captcha 通過不可**：全 6 attempts 失敗。tesseract 5.3.4 への切替が必須。既存 test script の `TESSERACT_BIN` 環境変数で対応済みだが、正式 adapter の `defaultTesseractSolver` は PATH の tesseract を使用（要対応）。
3. **captcha 正解率 1/8 attempts（合算）**：安定した preview には maxAttempts=6 以上が必要な可能性。または tesseract 5.x を正式 adapter に組み込む検討が必要。

---

## 5. 下一步

**→ Step 7O-711-E2E-STABILITY-RETRY**

重点：
- `normalizeSevenElevenStatus` に 7-11 固有パターン追加（5〜8 パターン）
- 正式 adapter の `defaultTesseractSolver` を tesseract 5.3.4 nix パスに対応
- maxAttempts=6 で安定 captcha 通過率を確認
- 完了後 Step 7O-711-MANUAL-PREVIEW-INTEGRATION へ進む

---

## 6. 明確未做

- 未 production write
- 未 DB mutation
- 未改 supportsAutoSync
- 未改 provider whitelist
- 未加入正式自動同步
- 未送 /manual-provider/commit
- 未 Publish
- 未 push
