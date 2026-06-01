# 揪單

A mobile-first group buying / proxy order management web app for small Taiwanese merchants — create products, share links with buyers, and manage orders end-to-end.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/shop-app run dev` — run the frontend (dynamic port)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — rebuild lib declarations (run after changing lib/db schema)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v4 + wouter + @tanstack/react-query
- Auth: Clerk (Replit-managed) via `@clerk/react` + `@clerk/express`
- API: Express 5, contract-first OpenAPI → Orval codegen
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle for server)

## Where things live

- `lib/db/src/schema/` — DB schema source of truth (stores, products, orders)
- `lib/api-spec/` — OpenAPI spec source of truth
- `lib/api-zod/` — generated Zod schemas (from codegen)
- `lib/api-client-react/` — generated React Query hooks (from codegen)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/shop-app/src/pages/` — React pages
- `artifacts/shop-app/src/index.css` — Tailwind theme (warm terracotta palette)

## Architecture decisions

- **Contract-first API**: OpenAPI spec in `lib/api-spec` drives Zod validation (server) and React Query hooks (client) via Orval codegen. Run codegen after any spec change.
- **Clerk proxy at `/api/__clerk`**: The frontend and backend both route Clerk through this path so auth cookies work seamlessly in the proxied Replit environment.
- **Cookie-based auth**: No Bearer tokens. Clerk session is cookie-based on web; the Express `clerkMiddleware` reads cookies automatically.
- **DB lib is composite**: After editing `lib/db/src/schema/`, run `pnpm run typecheck:libs` to rebuild declarations before typechecking artifacts.
- **Orval UseQueryOptions typing**: Orval-generated query hooks require `queryKey` in the `query` option (react-query v5). Use `{ query: { enabled: ... } as any }` to pass partial options without TS errors.

## Product

- **Landing page**: Signed-out home with CTA to sign up/sign in
- **Merchant auth**: Clerk-powered sign-in/sign-up with Chinese localization
- **Store setup**: First-time store creation wizard (name, slug, description)
- **Dashboard**: Store stats (total orders, pending, revenue), status breakdown, recent orders, quick nav
- **Product management**: List, create, edit, delete products; share token per product; active/inactive toggle
- **Public order page**: Buyer-facing page (no auth) at `/p/:shareToken` — fill name, phone, pickup method, specs, quantity
- **Order management**: Filter by status, expand order details, inline status updates, CSV export
- **6 order statuses**: 待確認 → 待付款 → 備貨中 → 已出貨 → 已完成 / 已取消

## User preferences

- **Dev Handoff Relay**: 每次回覆後必須更新 `dev-handoff/latest.json`（見 `CLAUDE.md` 完整規則）
- **語言**: 與使用者溝通用繁體中文
- **Commit 規範**: commit 前確認 `.claude/` 未被 stage；`dev-handoff/` 保持 gitignored
- **風格偏好**: 手機優先、卡片式 UI（參考樂賣代購連線）；不做桌機表格式後台

## Gotchas

- After changing `lib/db/src/schema/`, always run `pnpm run typecheck:libs` before typechecking artifacts or the DB table exports won't resolve.
- After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks/schemas.
- Tailwind v4 + Clerk requires `tailwindcss({ optimize: false })` in `vite.config.ts` and `@layer theme, base, clerk, components, utilities;` before `@import 'tailwindcss'` in `index.css`.
- The Vite frontend runs on a dynamic port assigned by the workflow env var `PORT`. Do not hardcode a port.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Clerk proxy and appearance configuration details
