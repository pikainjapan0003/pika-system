# Step 7O 7-11 Runtime Tesseract Fix

## 1. 結論

- 狀態：needs-review（code + resolution test PASS，E2E smoke PASS，尚未人工 UI 再驗收）
- spawn tesseract ENOENT 問題已修
- E2E smoke #6/6 SUCCESS（8 events）
- 未寫 DB
- 仍需人工開 browser 確認 UI 顯示正常

## 2. 問題

UI 按「重新查詢」後出現：

```
All 6 attempt(s) failed. Last: solveCaptcha threw:
spawn tesseract ENOENT (OCR_FAILED)
```

代表 7-11 preview handler 已被呼叫，但 runtime 找不到 tesseract binary。

## 3. 根因

`defaultTesseractSolver`（`sevenElevenAdapter.ts`）直接 `spawn("tesseract", ...)`，
完全依賴系統 PATH 有 `tesseract`。

Replit runtime 的 PATH 未包含 nix store 的 tesseract binary，因此：

- `spawn("tesseract")` → `ENOENT`
- 上層 catch → `OCR_FAILED`
- 每次 attempt 都失敗
- 6 attempts 全失敗

先前 E2E 成功是因為 `scripts/step7/test-seven-eleven-adapter.mjs` 注入了自訂
`solveCaptcha`（並在腳本內硬碼 nix 路徑），與 adapter 的 `defaultTesseractSolver` 無關。

## 4. 修復

### adapter (`artifacts/api-server/src/lib/logistics/adapters/sevenElevenAdapter.ts`)

新增 `resolveTesseractBinary()` exported function：

```typescript
const TESSERACT_KNOWN_PATHS = [
  "/nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/bin/tesseract",
  "/nix/store/89jwgijqcyl56r4h3vwv6v5dprd7xnr9-tesseract-3.05.00/bin/tesseract",
];

export function resolveTesseractBinary(): string {
  const envBin = process.env.TESSERACT_BIN;
  if (envBin) return envBin;
  for (const p of TESSERACT_KNOWN_PATHS) {
    if (existsSync(p)) return p;
  }
  return "tesseract";
}
```

優先順序：
1. `process.env.TESSERACT_BIN`
2. 已知 nix store tesseract 5.3.4 路徑
3. 已知 nix store tesseract 3.05.00 路徑
4. `"tesseract"`（fallback，若仍找不到會 ENOENT → OCR_FAILED）

`defaultTesseractSolver` 改為：

```typescript
const tesseractBin = resolveTesseractBinary();
const proc = spawn(tesseractBin, [...]);
```

### 測試 (`scripts/step7/test-711-tesseract-runtime-resolution.mjs`)

新增 6-case resolution test：
- TESSERACT_BIN unset → 找到 5.3.4 nix path
- resolved binary executable
- `--version` 輸出含 "tesseract"
- TESSERACT_BIN env 優先
- 無 ENOENT

## 5. 測試結果

- `node scripts/step7/test-711-tesseract-runtime-resolution.mjs` → **6/6 PASS**
  - resolved: `/nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/bin/tesseract`
  - version: tesseract 5.3.4
- `pnpm --dir artifacts/api-server typecheck` → **PASS**
- `node scripts/step7/test-seven-eleven-adapter.mjs` (unset TESSERACT_BIN) → **#6/6 SUCCESS** 8 events
- `node scripts/step7/test-711-normalization-patterns.mjs` → **18/18 PASS**
- `node scripts/step7/test-manual-provider-route.mjs` → **66/66 PASS**

## 6. 安全邊界

- 未 production write
- 未 DB mutation
- 未改 supportsAutoSync
- 未改 provider formal whitelist
- 未送 /manual-provider/commit
- 未 Publish
- 未 push
- 未顯示完整 tracking code
- 未改 .replit / .env / secrets

## 7. 下一步

E2E smoke PASS，但還沒人工打開 browser 確認 UI 不再出現 OCR_FAILED：

**Step 7O-711-MANUAL-PREVIEW-UI-QA-RETRY**

若 browser 也通過：

**Step 7O-711-PREVIEW-ONLY-CLOSEOUT**
