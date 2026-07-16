# pika-system

[![CI](https://github.com/pikainjapan0003/pika-system/actions/workflows/ci.yml/badge.svg)](https://github.com/pikainjapan0003/pika-system/actions/workflows/ci.yml)

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

# 純函式測試（不連既有資料庫）
artifacts/api-server/node_modules/.bin/tsx.CMD --test lib/db/src/transport-cost/*.test.mjs artifacts/api-server/src/lib/*.test.mjs
```

完整 CI 會在 Ubuntu runner 執行 typecheck、build 與 PostgreSQL route tests。含資料庫的測試只能使用 workflow 提供的拋棄式服務或另建測試庫；不要把 production `DATABASE_URL` 帶進本機測試。
