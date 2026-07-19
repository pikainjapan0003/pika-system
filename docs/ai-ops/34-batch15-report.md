# BATCH-15 完工總報告

- repo：`C:\Users\Lnovo\Desktop\pika-system`
- 日期：2026-07-20
- 開工基準：`c7e354e`（BATCH-14 最終 commit）
- BATCH-14 已推送：`origin/main=c7e354e`
- BATCH-14 current-HEAD CI：success，run `29704876521`  
  <https://github.com/pikainjapan0003/pika-system/actions/runs/29704876521>
- BATCH-15：全批未 push；未碰 generated、migration、production DB、金額公式、`dev-handoff/`、`.claude/`。

## 逐包結果

| 包                               | 狀態         | commit                          | 驗證／說明                                                                                                                                                                                                     |
| -------------------------------- | ------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 測試 asset loader              | done         | `40bd9e4`                       | `.png/.svg/.jpg/.jpeg` 交由穩定 stub，其他 import 委派；真 PNG probe 1/1。                                                                                                                                     |
| 2 EditOrderDialog component test | done         | `a866e72`                       | 真元件 jsdom 2/2：`0.1 × 3 → NT$0.3`、超額折讓錯誤文案。                                                                                                                                                       |
| 3 SkillMap 高風險二段確認        | done         | `cbdc821`＋穩定性修正 `49e1a30` | 3/3：未確認不 enable、勾選後 body 含兩項 confirmation、取消零寫入；全套回歸發現等待條件競態後，改為等 S-19 按鈕可用才點，未弱化斷言。                                                                          |
| 4 匯率參考 Hint component test   | done         | `5338229`                       | 2/2：不可用不顯示 0／無套用鈕；顯示「套用後仍需儲存」。                                                                                                                                                        |
| 5 手動 Pending E2E workflow      | done         | `347d9f4`                       | 新增 `workflow_dispatch` Linux workflow；主 CI 與正式 testMatch 不動；YAML／config 可解析。                                                                                                                    |
| 6 技能入口 pending E2E           | done-pending | `cd127b1`                       | Playwright `--list` 可探索；真 runner 尚未觸發，不能列 pass。                                                                                                                                                  |
| 7 月報 pending E2E               | done-pending | `26beb86`                       | Playwright `--list` 可探索；鎖整數毛利、pending 與尚無快照非 0。                                                                                                                                               |
| 8 客戶匯出 pending E2E           | done-pending | `8bd8021`                       | Playwright `--list` 可探索；鎖遮罩一次確認與明文二次確認 header。                                                                                                                                              |
| 9 訂單編輯 pending E2E           | done-pending | `a499208`                       | Playwright `--list` 可探索；鎖精確預覽與超額折讓。                                                                                                                                                             |
| 10 orders auth 負向補測          | skipped      | —                               | 第一輪只有 PostgreSQL readiness 與 `EXIT=undefined`，無測試結果；第二輪 `drizzle-kit push` 在 Windows 回 `No schema files found for path ...src/schema/index.ts`。依兩輪規則撤回唯一測試改動；拋棄容器零殘留。 |
| 11 安全標頭 500 整合測試         | done         | `0b5c810`                       | 真 app 組裝 3/3：200、JSON 404、global 500 都保留 `Referrer-Policy` 與 `X-Content-Type-Options`。                                                                                                              |
| 12 SkillMap 一般流程             | done         | `d16af30`                       | 2/2：一般技能送標準 body；套餐 apply 後刷新 daily visibility。                                                                                                                                                 |
| 13 Windows build 解鎖選項        | done         | `4e9b0df`                       | A/B/C 比較完成，建議 B：維持 Linux-only，完整 build/E2E 走 Linux runner。                                                                                                                                      |
| 14 文件與總報告                  | done         | 本報告 commit                   | 27 檔補手動 Pending workflow；32 檔 asset loader／EditOrderDialog blocker 改列 closed；附可重算 SELF_SHA256。                                                                                                  |

## 最終驗證原文

```text
PURE_TEST_FILES=52
tests 184
pass 184
fail 0

asset loader probe
tests 1
pass 1
fail 0

typecheck:libs
> tsc --build
exit 0

api-server typecheck
> tsc -p tsconfig.json --noEmit
exit 0

shop-app typecheck
> tsc -p tsconfig.json --noEmit
exit 0

Pending E2E discovery
Total: 4 tests in 4 files
exit 0
```

補充：第一次全套回歸為 `183 pass / 1 fail`，原因是高風險 SkillMap 測試在併行負載下於狀態載入前找按鈕；`49e1a30` 改為等待指定 S-19 按鈕可用，隔離 3/3、最終全套 184/184。另一次 asset probe 指令漏帶專用 loader 而失敗；以正確 `--import registerAssetLoader.mjs` 入口重跑 1/1，屬驗證命令錯誤，不是程式缺陷。

## Package 10 完整停止軌跡

第一輪：

```text
/var/run/postgresql:5432 - accepting connections
EXIT=undefined
```

沒有 route test 或 migration 結果，不採信。

第二輪：

```text
> drizzle-kit push --force --config ./drizzle.config.ts
Error  No schema files found for path config ['C:\Users\Lnovo\Desktop\pika-system\lib\db\src\schema\index.ts']
Exit status 1
BATCH15_DB_CONTAINER_RESIDUE:
```

依同包兩輪失敗規則停止。未連既有或 production DB，label `batch15.rehearsal=true` 查詢零殘留。

## 風險與未解問題

1. 四條 Pending E2E 目前只有 discovery 證據；需推送後手動執行 `Pending E2E` workflow，綠燈才能升為正式驗證。
2. 包 10 的 orders 讀寫未登入／跨店負向 route 補測尚未落地；既有 auth middleware 未被本批修改，但此驗收缺口仍存在。
3. Windows Vite/build 仍受 Linux-only 原生依賴策略限制；建議維持方案 B，不在功能批次改依賴策略。
4. BATCH-15 commits 尚未 push，GitHub current-HEAD CI 尚未涵蓋本批。

## 建議下一步

先交 Fable 5 終審；accepted 後一次推送 BATCH-15 commits，觀察主 `CI/verify` current-HEAD 綠勾，再手動執行 `Pending E2E` workflow。若 Pending E2E 紅燈，依 trace／screenshot 處理，不得把 discovery 當成功。包 10 建議改由 Fable 5 的可用拋棄式 PostgreSQL harness 補跑，或另開 Linux DB route 測試包。

## SHA-256

重算方式：以本檔 UTF-8 bytes 為準，刪除整行 `SELF_SHA256:`（含該行換行）後計算 SHA-256。

SELF_SHA256: c25c8c97b76db76c47a046af0ab55b71d416ae4510ef1bf9217f9bdcb23a0f15
