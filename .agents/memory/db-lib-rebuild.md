---
name: DB lib rebuild required after schema changes
description: After adding/changing lib/db/src/schema files, artifact typechecks fail until lib declarations are rebuilt.
---

`lib/db` is a composite TypeScript project that emits `.d.ts` declarations. Artifacts import from `@workspace/db` using those declarations.

**Rule:** After any change to `lib/db/src/schema/` (adding tables, changing columns), run `pnpm run typecheck:libs` before running artifact-level typechecks.

**Why:** Without rebuilding, tsc for artifacts sees stale declarations that may not include the new exports, causing "Module has no exported member" errors even though the source is correct.

**How to apply:** Any time you add a new table or change a column type in `lib/db/src/schema/`, immediately run `pnpm run typecheck:libs`.
