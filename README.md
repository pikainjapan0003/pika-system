# pika-system

[![CI](https://github.com/pikainjapan0003/pika-system/actions/workflows/ci.yml/badge.svg)](https://github.com/pikainjapan0003/pika-system/actions/workflows/ci.yml)

畫夢代購的店主後台與買家下單系統。目前包含：

- 商品上架、公開分享、單品／購物車下單與訂單追蹤。
- 行程交通成本分攤、商品日圓成本、店鋪進貨匯率與訂單毛利快照。
- 客戶主檔、四層價格、個資遮罩，以及有二次確認與 audit log 的 CSV 匯出。
- 訂單揀貨／出貨、物流方式開關、付款末五碼人工對帳與物流異常工具。
- 老闆首頁重點、每月定格毛利報表，以及可預覽差異後套用的技能地圖。
- 台銀即期賣出參考匯率（只供手動套用，不會自動儲存）。

金額欄遵守精確十進位運算；成本不足時顯示「待確認」，不以 0 代替。訂單快照建立或補拍後定格，之後修改商品成本或匯率不會改動舊單。

技能開關只調整後台日常入口的顯示；伺服器授權仍是獨立防線。首登推薦問卷尚未開放，請直接到技能地圖檢視前置條件與選擇套餐。

## 開發測試

需要 Node.js 24、Corepack 與 pnpm。先安裝固定 lockfile 依賴：

```bash
corepack pnpm install --frozen-lockfile
```

常用驗證：

```bash
# 純 lib/schema 型別
corepack pnpm run typecheck:libs

# API server 型別
corepack pnpm --filter @workspace/api-server run typecheck

# 後台商店 UI 型別
corepack pnpm --filter @workspace/shop-app run typecheck

# 純函式測試（不連既有資料庫；CI 會自動尋找全部測試檔）
node --test lib/privacy/src/index.test.mjs lib/shipping/src/index.test.mjs
```

完整 CI 會在 Ubuntu runner 執行 typecheck、build 與 PostgreSQL route tests。含資料庫的測試只能使用 workflow 提供的拋棄式服務或另建測試庫；不要把 production `DATABASE_URL` 帶進本機測試。

## 拋棄式示範資料

示範資料腳本的唯一支援入口如下；它只接受命令列明確提供的拋棄式 PostgreSQL URL，並會拒絕含 `replit` 或 `prod` 字樣的目標：

```bash
corepack pnpm --filter ./scripts run demo-seed -- --database-url postgresql://demo:demo@127.0.0.1:55432/pika_demo
```

不要從 repo root 直接執行 `node --import tsx/esm scripts/demo-seed.mjs`，因為 `tsx` 安裝在 `scripts` workspace 套件，root 直呼不保證能解析。若目標庫已有 `demo-` 示範資料，腳本預設拒絕再次寫入；確定要刻意追加時才在命令末尾加上 `--append`。
