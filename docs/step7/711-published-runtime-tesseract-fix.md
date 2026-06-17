# Step 7O 7-11 Published Runtime Tesseract Fix

## 1. 結論

- 狀態：**needs-review**
- Published 仍 OCR_FAILED（tesseract 未安裝於 deployment container）
- Published commit 已確認：最新 `4fd26ab Published your App` 在 `325a35f` 之後 → code 正確
- Published tesseract path 不存在：deployment container 無 nix store tesseract
- Workspace / Preview：resolver 正常，6/6 tests PASS，E2E smoke PASS
- **需要使用者執行 deployment 層設定，不需要重新 re-publish code**（code 已到位）

## 2. 使用者畫面現象

- Preview 環境（workspace container）：可查到 7-11 貨態 ✓
- Published 正式網站（autoscale deployment）：
  ```
  All 6 attempt(s) failed. Last: solveCaptcha threw:
  spawn tesseract ENOENT ( OCR_FAILED )
  ```

## 3. 診斷結果

### Git 狀態

```
branch: qa/step6f-cvs-store-selection-browser-mobile
HEAD:   4fd26ab  ← Published your App（在 325a35f 之後 ✓）
325a35f fix(step7): resolve 711 runtime tesseract binary
```

Published 已部署最新 code，不是 stale commit 問題。

### Workspace nix store

```
/nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/bin/tesseract
  → 實為 bash wrapper script（設定 TESSDATA_PREFIX 後 exec 真正 ELF binary）
/nix/store/nprhbhaa9j23xm07hvl3fw27mm81nl1z-tesseract-5.3.4/bin/tesseract
  → 真正 ELF binary（54512 bytes）
```

兩者在 workspace 中均存在 ✓。

### Published deployment container

```
.replit: modules = ["nodejs-24"]
replit.nix: 不存在
```

Published deployment 只裝 Node.js 24。tesseract 未在任何 nix/package 設定中指定。
Deployment container 不含 `/nix/store/*-tesseract-*` 路徑。

### Resolver 行為（workspace 對比 Published）

| 步驟 | Workspace | Published |
|------|-----------|-----------|
| TESSERACT_BIN env | 未設定 | 未設定 |
| 已知 nix path 44vcjbc... | EXISTS → return ✓ | MISSING |
| 已知 nix path nprhbha... | EXISTS | MISSING |
| 已知 nix path 89jwgij... | EXISTS | MISSING |
| `which tesseract` | not in PATH | not in PATH |
| fallback `"tesseract"` | N/A（已提前 return） | 走到這裡 → ENOENT |

### Resolver test（workspace）

```
6/6 PASS
resolved: /nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/bin/tesseract
version: tesseract 5.3.4
```

### E2E smoke（workspace, unset TESSERACT_BIN）

```
#6/6 SUCCESS — 8 events
latestStatus: 已完成包裹成功取件
```

### Published runtime evidence

無法直接存取 Published runtime filesystem 或 logs。
根據 `.replit` 的 `modules = ["nodejs-24"]` 和無 `replit.nix`，判定 tesseract 未安裝於 deployment container。

## 4. 修復（本輪執行）

在 `artifacts/api-server/src/lib/logistics/adapters/sevenElevenAdapter.ts` 中：

### 新增 `execSync` import

```typescript
import { execSync } from "node:child_process";
```

### `resolveTesseractBinary()` 加入 PATH-based fallback

```typescript
// PATH-based fallback: covers environments where tesseract is installed but
// not at any known nix store path (e.g. Docker images, apt-installed tesseract).
try {
  const found = execSync("which tesseract", {
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 2000,
  }).toString().trim();
  if (found) return found;
} catch {
  // tesseract not in PATH
}
```

效果：若未來使用者設定 `TESSERACT_BIN` 環境變數，或部署容器內 PATH 含 tesseract，
可自動找到 binary，不需要改 code。

### 新增 `TESSERACT_KNOWN_PATHS` 條目

```typescript
"/nix/store/nprhbhaa9j23xm07hvl3fw27mm81nl1z-tesseract-5.3.4/bin/tesseract",
```

加入 wrapper 指向的真實 ELF binary（以防 wrapper 存在但 exec 路徑失敗）。

### 改善 ENOENT 錯誤訊息

```
Tesseract binary not found at "tesseract". In published deployment,
set TESSERACT_BIN env var or add tesseract to replit.nix. (spawn tesseract ENOENT)
```

使使用者在看到 OCR_FAILED 時能立即知道根因和修法。

## 5. 需要使用者執行的修復（code 本身無法解決）

**選擇一種方式：**

### 選項 A（推薦）：建立 `replit.nix` 加入 tesseract

在專案根目錄建立 `replit.nix`：

```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_24
    pkgs.tesseract5
  ];
}
```

建立後，在 Replit 點擊 Publish（會觸發重新 build deployment container）。

### 選項 B：設定 Replit 部署環境變數

1. 在 Replit → Secrets（或 Deployment ENV）新增：
   ```
   TESSERACT_BIN=/nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/bin/tesseract
   ```
   （但此路徑在 Published deployment 中也不存在，需先確認 deployment container 內的實際 path）

2. 這個選項只在 deployment container 確實有 tesseract 時才有效。

**結論：選項 A 最可靠。**

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
- 未改 replit.nix（因不得修改 Replit deployment settings 未授權）
- 未 stage dev-handoff/ 或 .claude/

## 7. 下一步

若使用者執行選項 A（建立 replit.nix 並 Re-publish）：

**Step 7O-711-PUBLISH-AND-UI-QA-RETRY**

若需要臨時診斷 Published runtime 確切狀態：

**Step 7O-711-RUNTIME-DIAGNOSTIC-ENDPOINT**（需 owner-only protected route）

若 Published UI 確認成功：

**Step 7O-711-PREVIEW-ONLY-CLOSEOUT**
