> 本目錄＝技術踩坑筆記。AI 作業制度（session 開場、派工、驗證、高風險判準）在 `AGENTS.md` → `docs/ai-ops/`；流程/制度類教訓寫 `docs/ai-ops/05-maintenance-protocol.md` Lessons Log（分工規則見該檔 §2）。

- [Orval query hook typing](orval-query-typing.md) — react-query v5 requires queryKey in UseQueryOptions; use `as any` to pass partial options.
- [DB lib rebuild required](db-lib-rebuild.md) — after editing lib/db schema, must run typecheck:libs before artifact typechecks resolve new exports.
- [Clerk Tailwind v4 fix](clerk-tailwind-fix.md) — Clerk + Tailwind v4 requires optimize:false in vite plugin and @layer order in CSS.
- [Orval Zod schema names](orval-zod-names.md) — generated names follow OpenAPI operationId pattern (CreateStoreBody, UpdateStoreBody), not custom aliases.
