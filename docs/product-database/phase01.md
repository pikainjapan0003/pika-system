# Product database Phase 0/1 checkpoint

## Phase 1 source alignment / DB-BUILD-01-PHASE1/v2, revision 1

This is same-author source alignment revision 1, deadline 2026-09-12
19:53:00 UTC. Phase 0 remains independently PASS. Phase 1 revision 0 author
results were complete: foundation 2, compatibility 135, full typecheck and
all package builds passed. Its late API exit 0 and unchanged old row checksums
were read back after the source-writing deadline; the old pending wording is
corrected below. Neither revision is an independent Phase 1 acceptance.

Only these five files change in revision 1: catalogProducts.ts,
productDatabasePricing.ts, 0041 up SQL, product-database-foundation-check.mjs
and this document. The other eight Phase 1 files and both Phase 0 safety tests
stay frozen against the complete external phase1-checkpoint0 backup.

Source alignment follows the approved original plan:

- §8.1 explicitly specifies catalog_products.storeId -> stores ON DELETE
  CASCADE. Drizzle and SQL now agree. The checker deletes a separate synthetic
  store containing only an unreferenced catalog and verifies its catalog is
  also deleted. Other RESTRICT references and immutable history triggers remain.
- §8.7 profit thresholds are signed numeric values. The three threshold checks
  now reject NaN without imposing >= 0; numeric(30,12) also excludes infinity.
  Strict ordering and defaults 25/50/100 remain. The checker inserts -10/0/50
  in another synthetic store's settings and asserts exact stored decimals,
  then verifies wrong ordering and NaN in each threshold are rejected.
  Cost, fees, loss protection, weight, rates and other checks are unchanged.

Revision 1 runtime:
`C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase1-source-alignment-r1`.
The same container was inspected stopped, restarted with loopback port 55886,
and actual database/user pika_phase0 verified. There were 39 public tables,
the original store id 8, and no new data. The unchanged guarded down exited 0,
checking all 14 new tables before dropping anything. The modified SQL is then
installed and exercised by the complete foundation lifecycle checker; it is
not tested through ad hoc ALTER or Drizzle push.

Commands use the same explicit connection/opt-in guards and file lists below:

```text
pnpm run typecheck
pnpm -r --if-present run build
node --import tsx/esm --test ../../lib/db/src/product-database/foundation.test.mjs
node --experimental-test-module-mocks --import tsx/esm --test <the 11 API files listed below>
node --test <the 11 pure files listed below>
```

Typecheck/build use process-local Git/bin PATH; build also uses PORT=3000 and
BASE_PATH=/. Foundation and API are sequential to avoid dropping schema under
API queries. API uses explicit loopback DATABASE_URL, DATABASE_SSLMODE=disable,
PIKA_PHASE0_DISPOSABLE=DB-BUILD-01 and PIKA_PHASE0_KEEP_FIXTURES=0. JUnit and
spec logs go only to this revision's runtime. No dependencies were reinstalled.

Revision 1 actual results (new runs, not reused revision 0 evidence):

| Gate | Result |
| --- | --- |
| Initial guarded down | exit 0; all new tables checked empty before DDL |
| Foundation | 2 PASS, 0 fail/skip/cancelled, exit 0; includes both source-alignment cases and full real SQL lifecycle |
| Pure compatibility | 81 PASS, 0 fail/skip/cancelled, exit 0 |
| API compatibility | 54 PASS, 0 fail/skip/cancelled, exit 0; all 135 compatibility cases complete |
| Full typecheck | exit 0; libs, API, shop-app, mockup-sandbox and scripts completed |
| Package build | exit 0; mockup-sandbox, API and shop-app all completed |
| Old data | 1 customer, 4 orders, 2 products, 1 store; all four original MD5 values unchanged |
| New data | all 14 new tables empty, schema up; no leftover synthetic fixtures |
| Database cleanup | other connections 0 before stopping; exact same container exited/running=false |

Evidence is in this revision's `foundation.log`/`.junit.xml`, `pure.log`/`.junit.xml`,
`api.log`/`.junit.xml`, `typecheck.log`, `build.log`, `final-database-state.csv`
and `legacy-checksums-after.csv`. Frozen legacy MD5 values remain the four values
listed in the Phase 0 section below. The final 13-file SHA256/line-count inventory
is `file-manifest.json` in this revision's runtime, with r0 hashes and change
flags. Exactly the five authorized files differ from r0; the other eight Phase 1
files and two Phase 0 tests retain their fixed hashes. The revision diff summary
is `revision-diff.json`; build/typecheck generated only ignored outputs.

All test/build command roots returned terminal exit results. Database work
finished before its container was stopped; no fixture cleanup deletion was
needed. The existing sourcemap/chunk build diagnostics did not prevent exit 0;
no UI or build configuration was changed to suppress them. Independent Phase 1
verification remains NOT RUN; these are author checks only. No remaining author
test or implementation blocker is known for this source-alignment revision.

## Phase 1 revision 0 implementation and historical evidence (2026-09-13)

Phase 0 is now **independently PASS** per completed verifier turn
`01a096db-4cc4-7d11-b5ee-b03d67625f2e` and management report
`reports/DB-BUILD-01_Phase0_獨立驗證_r0_20260913.md`: 135/135 independent
tests, typecheck and composed build gates, unchanged old row checksums.
The incomplete Phase 0 wording below is retained as historical evidence only.

Phase 1 author: `01a09584-681e-7ed2-870a-a51bb919ebb2`, revision 0,
deadline 2026-09-12 19:14:00 UTC. This section is an author checkpoint, not
independent acceptance. Only the approved 13 Phase 1 files may change; the
two Phase 0 safety tests remain frozen. No application endpoint is enabled.

### Schema map and deliberate compatibility decisions

| Module | New tables |
| --- | --- |
| catalogProducts.ts | catalog_products, catalog_product_aliases, product_cost_records, shopee_price_observations, product_relationships |
| productDatabasePricing.ts | pricing_templates, international_shipping_profiles, store_pricing_settings |
| listingPricingSnapshots.ts | listing_pricing_snapshots, listing_current_pricing_snapshots |
| orderItems.ts | order_items, order_completion_events |
| sheetImports.ts | sheet_import_batches, sheet_import_rows |

The 14 tables contain all 219 declared fields from the approved §8 mapping,
including the separate current pointer and completion events. Current is a
pointer keyed by store/listing, not mutable content on an old snapshot.
New parent references use same-store composite FKs; new tables never acquire
another tenant through a nullable owner. Catalog's store FK uses CASCADE per
§8.1; other store and historical references retain RESTRICT and immutable
triggers. Existing products gain
only nullable catalog_product_id and UNIQUE(store_id,id); orders gain only
UNIQUE(store_id,id), retaining NOT NULL product_id and existing items JSONB.

All new numeric inputs reject NaN explicitly. Money uses numeric(30,12), final
unit/listing sale prices numeric(10,2), weight numeric(12,2). Nullable amounts
remain unknown, while profit/rates may be negative. Order subtotal is constrained
to quantity × unit price. Historical customer tier and price source are separate
fields with UNKNOWN defaults; no inference from today's customer is performed.
Completion event source/actor IDs are text, and completed_at is the event's
actual occurred_at only for transitions into completed; reversal events retain
their occurred_at without inventing a completion time.

Template/shipping definitions are exported but existing stores are not seeded.
GENERAL/LIVE use 1/0/GENERAL_AIR; PERFUME uses .915/.0155/TIGERAIR_BAGGAGE.
Shipping is 220/1000g and 1050/20000g. Store SQL defaults are .35, 5, .015,
.015, 180, 25/50/100 and v1. No calculator formula is imported or changed.

### SQL-only defenses and migration authority

`0041_product_database_foundation.sql` is authoritative for installation.
Drizzle push does not install the complete protection and is not a substitute.
SQL adds these defenses beyond the paired Drizzle field/FK declarations:

- Supplemental UNIQUE(store_id,id) on legacy product_categories/trip_routes,
  and catalog composite tenant FKs using PostgreSQL 16 subset SET NULL:
  deletion clears only category_id/last_used_trip_route_id, preserving store_id.
  The ordinary single-ID optional hint FKs are also declared in Drizzle.
- Append-only UPDATE/DELETE triggers on listing_pricing_snapshots and
  order_completion_events; changing the separate current pointer is permitted.
- Cost history trigger rejects DELETE and changes to historical content.
  Only current/status/void metadata can transition; voided content cannot revive
  or change again. VOIDED requires actor/time/reason and OTHER requires text.

TripRoute IDs in listing/order snapshots are trace identifiers, intentionally
not live FKs: deleting or changing a route never rewrites old monetary history.
The catalog's optional last-used route is tenant checked; unknown owner is rejected.
No one-off API is enabled because old orders.product_id is still required.

Up is transactional and deliberately rejects repeat/schema drift. Down locks
all 14 tables and affected legacy parents before checking every new table is
empty and every products.catalog_product_id is NULL. It refuses atomically
with any new data and removes only this migration's named objects. It never
disables triggers to delete history. Baseline dump and checksum SQL stay read-only.

### Execution and remaining verification

Dedicated runtime: `C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase1-runtime`.
Same container ID as Phase 0; inspected restart port **65082**. Explicit DB/user
pika_phase0, loopback URL, SSL disabled. No .env or DATABASE_URL fallback.
The checker validates URL/opt-in, actual Docker ID/labels/published port and
current_database/current_user before mutation.

Commands launched:

```text
pnpm run typecheck
pnpm -r --if-present run build
# cwd artifacts/api-server; explicit PIKA_PHASE1_TEST_URL and PIKA_PHASE1_DISPOSABLE=DB-BUILD-01
node --import tsx/esm --test ../../lib/db/src/product-database/foundation.test.mjs
# Equivalent direct checker (same tsx loader context):
node --import tsx/esm ../../scripts/product-database-foundation-check.mjs --url <explicit-loopback-url> --allow-disposable DB-BUILD-01
```

The test invokes the same real SQL lifecycle checker, with independently fixed
default values and expected SQLSTATE failures. It compares all new SQL column
types/nullability and declared FKs against Drizzle, checks SQL-only constraints,
then exercises up, atomic repeat refusal, tenant/numeric/history constraints,
durable nonempty-down refusal, empty down and up again. All temporary constraint
fixtures rollback; final intended state is schema up, new tables empty, old
fixtures byte-equivalent by full row JSON (excluding the new nullable column).

Author results at the final checkpoint: full typecheck **exit 0**, recursive
package build **exit 0**, pure compatibility **81 PASS / 0 fail / 0 skip**,
foundation **2 PASS / 0 fail / 0 skip**, including all SQL lifecycle/constraint
assertions listed in `foundation-rerun.log`. The first foundation attempt
failed only because PostgreSQL name[] catalog results arrived as strings;
the checker now requests text[], without weakening any schema constraint.
Guarded recovery down exited 0 before the successful rerun. Its final state
was all 14 new tables empty, schema up, complete legacy row JSON unchanged.
Post-migration API compatibility completed **54 PASS, 0 fail/skip/cancelled,
exit 0**. This terminal result arrived after the revision 0 source-writing
deadline. PID 6808 had completed before the stop attempt; cleanup returned
DELETE 0 because test fixtures were already removed. The frozen checksum SQL
returned all four original counts/MD5 values, and the same container was
confirmed exited/running=false with no background Node/esbuild processes.
Phase 1 is **not yet independently verified**. Formal DB,
Sheet writes, pricing v2, UI, scan/parity, deployment and commits remain out of scope.

---

DB-BUILD-01-PHASE0/v2, continuation 1, correction 0. Author task
`01a09584-681e-7ed2-870a-a51bb919ebb2`; controller
`01a0956d-d03f-72e3-bdfb-9ba0800e520a`.
Deadline: 2026-09-12 18:16:30 UTC.

This is an author Phase 0 checkpoint, not independent acceptance or a
completed Phase 0/1 delivery. Phase 1 has not started. No production source,
schema, configuration, lockfile, formal database, or Sheet was changed.

## Frozen inputs

- Worktree: `C:/Users/Lnovo/Documents/ChatGPT/pika-product-database-v1`.
- Branch: `feat/product-database-v1`.
- HEAD: `30a36a64a78dfee1e5e75924552ff485c3ef0dd2`; initially clean.
- Approved report SHA256:
  `ADEFB3FBC7489F0B3D9266EEE22A9E4946236485E3606D9E5D327F0E1F9F4BE3`.
- Role SHA256:
  `0BC22001165C7E819132746EF25F1DBCCA8E663B77A9F5C50D76699F1B34CF44`.
- Plan: all 1,850 lines read in four batches. DESIGN: all 1,244 lines read in
  batches, with truncated sections re-read. AGENTS, CLAUDE, README, judgment
  rubrics, approved report and relevant source/test files read. No excluded
  work-line implementation or Claude A/B handoff was read or modified.
- Latest Owner approval permits the specific Phase 0/1 batch; this worker
  contract permits only Phase 0. Historical read-only and UI work-line limits
  do not cancel that approval. No commit, push, PR, deployment or formal import.

## Completed author checks

1. Environment task ID, management cwd, BINDING controller and product writer
   lease matched. Desktop title/host/project readback is controller evidence;
   backend model routing remains UNVERIFIED. Requested Astra/medium.
2. `pnpm install --frozen-lockfile`: all 669 locked packages reused. First run
   failed at the root preinstall because `sh` was absent from PATH. Existing
   `C:/Program Files/Git/bin/sh.exe` was verified. A second run with that folder
   prepended to PATH for that command only completed successfully (exit 0).
   No dependency upgrade or build-script approval was performed.
3. Existing pure baseline: **78 passed, 0 failed, 0 skipped**, exit 0. Native
   Node 24 TypeScript support was used for these relative-import pure modules;
   no database was involved. JUnit evidence is in the external runtime folder.
4. Created exactly one disposable PostgreSQL container, using the already
   available `postgres:16-alpine` image, without pulling or mounting any
   existing volume. PostgreSQL reported accepting connections.

## Runtime identity and evidence

External runtime folder:
`C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase0-runtime`.

- Container name: `pika-db-build01-phase0`.
- Container ID:
  `3ed1e52eb60654c2fea2fa81cf40f6a2ead16138037edba860abadebb4f5ea9d`.
- Label: `pika.task=DB-BUILD-01`, `pika.phase=phase0`.
- Image ID:
  `sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`.
- Initial published address: `127.0.0.1:61573`; after the verified restart in
  continuation 1: `127.0.0.1:60150`, internal port 5432. Always inspect the port
  before reusing this stopped container; Docker may allocate a different port.
- Dedicated database and user: `pika_phase0`.
- Every database-related command explicitly set this disposable DATABASE_URL;
  no formal .env was loaded and no ambient database URL was used as fallback.
- Logs: `install.log`, `typecheck.log`, `build.log` if the build stage started,
  `baseline-schema.log`, `baseline-schema-relative.log`.
- Test report: `existing-transport.junit.xml`.

The container and long-running command trees were selected for stopping before
the deadline. Final observed stop/terminal status is recorded in the task reply.
Keep the stopped container for the next authorized continuation; do not remove
other containers or volumes.

## Checkpoint 0 commands (historical; superseded by continuation results)

The successful pure command ran from the worktree root:

```powershell
node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase0-runtime/existing-transport.junit.xml lib/db/src/transport-cost/transport-cost.test.mjs lib/db/src/transport-cost/areaDomesticCost.test.mjs lib/db/src/transport-cost/productTransportCost.test.mjs lib/db/src/transport-cost/productUnitProfit.test.mjs lib/db/src/transport-cost/orderMoney.test.mjs lib/db/src/transport-cost/orderProfitSnapshot.test.mjs lib/db/src/transport-cost/cartOrderProfitSnapshot.test.mjs lib/db/src/pricing/tierPrice.test.mjs lib/shipping/src/index.test.mjs lib/privacy/src/index.test.mjs
```

`pnpm run typecheck` was launched against the unchanged baseline, with output
redirected to typecheck.log. Last observed stage was `tsc --build`, without a
terminal result. `pnpm run build` was queued sequentially in the same shell;
it must not be counted as executed or passed without a build log and exit result.
The process tree was selected for termination before the deadline. These checks
are **INCOMPLETE**, not PASS and not a demonstrated production-code regression.

`pnpm --filter @workspace/db run push-force` failed (exit 1): drizzle-kit could
not match the Windows absolute schema path containing backslashes. The unchanged
schema file exists. A command-only retry used:

```powershell
pnpm --filter @workspace/db exec drizzle-kit push --dialect postgresql --schema ./src/schema/index.ts --url $env:DATABASE_URL --force
```

That retry was still running at the last observation and was selected for
termination. **Do not assume the disposable schema is complete or empty.**
Inspect its catalog on continuation. No new migration was executed.

## Continuation 1 results

The same container ID and label were inspected before restart. The public
schema contained zero tables. The config-free direct CLI invocation from
`lib/db` succeeded (exit 0), without changing drizzle.config.ts:

```powershell
$env:DATABASE_URL='postgresql://pika_phase0:phase0_synthetic_20260913@127.0.0.1:60150/pika_phase0'
$env:DATABASE_SSLMODE='disable'
node node_modules/drizzle-kit/bin.cjs push --dialect postgresql --schema ./src/schema/index.ts --url $env:DATABASE_URL --force
```

The old schema now has 25 public tables. `schema-direct-60150.log` records
`Changes applied`. An initial direct invocation still used the previous port
and exited 1; it is preserved in `schema-direct.log`. No new schema or migration
was introduced.

Both authorized characterization files now exist:

- `lib/db/src/transport-cost/productDatabaseRouteBaseline.test.mjs`: **3 PASS,
  0 fail/skip** with native Node 24 `node --test`; exact independent arithmetic
  for area TWD 2.03, Route + area + HEP TWD 13.18, purchase cost TWD 210 using
  store FX 0.21 separately from trip FX 0.2, and profit TWD 76.82. Missing
  fuel/rate/HEP quantity remains pending; exemption requires purchase cost.
- `artifacts/api-server/src/routes/productDatabaseCompatibility.test.mjs`:
  one continuous synthetic API scenario covering product POST, VIP fallback,
  merchant and public single orders, cart JSONB, pending cart, frozen snapshots,
  and public DTO allowlists. Explicit `PIKA_PHASE0_DISPOSABLE=DB-BUILD-01`,
  localhost, database and username checks fail closed before importing the DB.
  Default cleanup removes only its own store. `PIKA_PHASE0_KEEP_FIXTURES=1`
  explicitly retains this scenario for the approved synthetic legacy dump.

API hand oracle: A price 100.25, cost JPY 200 × 0.2 = TWD 40; B price 50.10,
cost JPY 100 × 0.2 = TWD 20. Both exempt. A×2+B×3 gives sale 350.80 and
frozen cart profit 210.80. Removing B cost makes the next cart pending with
null total. Later changes to A price/cost and store rate must leave old rows
byte-equivalent under the ORM representation.

Existing API baseline command completed exit 0: **53 PASS, 0 fail/skip**.
The new API scenario also completed exit 0: **1 PASS, 0 fail/skip**. It used
`node --experimental-test-module-mocks --import tsx/esm --test` from
`artifacts/api-server`, with the explicit disposable URL above, for these ten
files (the previously passing 78 pure tests were not rerun):

```text
src/routes/orderProfitSnapshot.route.test.mjs
src/routes/public.route.test.mjs
src/routes/customersAndProfitIsolation.route.test.mjs
src/routes/coreMutationAuthorization.route.test.mjs
src/routes/tripRouteFuelNullable.route.test.mjs
src/lib/publicCartItems.test.mjs
src/lib/publicOrderResponse.test.mjs
src/lib/publicResponseAllowlist.snapshot.test.mjs
src/lib/orderProfitSnapshot.batch.test.mjs
src/lib/productEstimatedProfit.test.mjs
```

Reports use Node's simultaneous `spec` and `junit` reporters:
`api-baseline.log`, `api-baseline.junit.xml`, `new-api.log`,
`new-api.junit.xml`, and `new-route.junit.xml`. New API uses the same Node
flags and its single file path. Typecheck/build continuation logs are
`typecheck-v2.log` and `build-v2.log`.

External `legacy-checksums.sql` fixes the old products/orders/stores/customers
column projections; rerun exactly it after the separately approved migration.
It includes prices, cost/rate, legacy product_id, JSONB items and every monetary
profit snapshot plus its timestamps/status. MD5 is a change detector, not a
security hash; the dump is independently SHA256 hashed. It does not claim every
possible old column is covered by the projection; the full dump preserves them.

The test fixtures were retained only after the successful new API run. They
contain 1 store, 1 customer, 2 products and 4 orders (merchant single, public
single, captured cart and pending cart). Product A and store rate have later
values, while the old order snapshots retain the original values. No real
customer or merchant data was copied.

`docker exec pika-db-build01-phase0 pg_dump -U pika_phase0 -d pika_phase0 -Fc
-f /tmp/phase0-legacy.dump` succeeded, then `docker cp` copied the binary to
the external runtime folder. `pg_restore --list` succeeded and its output is
`phase0-legacy.toc`. This verifies archive readability, not a restore drill;
restore/migration execution is NOT RUN.

Frozen projection results (`legacy-checksums-before.csv`):

| Entity | Rows | MD5 of ordered legacy projection |
| --- | ---: | --- |
| customers | 1 | f303907068734ad73e1d2669fecc74f4 |
| orders | 4 | 37cb1529030b349a36732fc810b6c290 |
| products | 2 | d15086194307f3f19274b5eb14c2e51b |
| stores | 1 | ea69c7d877ded491bf1d5f903a285212 |

SHA256 evidence, all in the external runtime folder:

| File | SHA256 |
| --- | --- |
| phase0-legacy.dump | 19135A07E2D468AC2A764D1C99F9F4305EF167D4E9E4B7B73CBA76AEF98EACE2 |
| legacy-checksums.sql | 8B65B071FEE4A1F9691FE0694F462275509B27DE4DC762E2EE4608BDB0E09581 |
| legacy-checksums-before.csv | 8484471ABF1945A0494C2844365CCF27F2A14EC935748DC88BA5DDD88FB0BC56 |
| existing-transport.junit.xml | 02334142D12185317F8AD332B23940030442BA68D8A65DBC7E2EAEB6F505F7E0 |
| api-baseline.junit.xml | F9CBBDF1A0C5E238E5EC6B038946B4D9398741B148BB53728895DFCFF86BE926 |
| new-api.junit.xml | 4B496F49AA37EEBC45500BAECFF758239325B219AF787BEE4384ED9EDDF64BFE |
| new-route.junit.xml | B344A8BDDFFBC891ADB464136A5AAF24E49056C0B0A8DE08B138392E3F4C036D |

All 135 author test results pass without skips (78 reused, 57 continuation).
This count is not independent acceptance. Build/typecheck final status is
recorded in the final continuation section. The following list describes
checkpoint 0 history only.

## Checkpoint 0 remaining work (historical)

- Finish unchanged-baseline typecheck/build and disposable schema setup.
- Run selected existing route suites with CI flags from `artifacts/api-server`:
  `node --experimental-test-module-mocks --import tsx/esm --test`, specifying
  `orderProfitSnapshot.route.test.mjs`, `public.route.test.mjs`,
  `customersAndProfitIsolation.route.test.mjs` and necessary product
  authorization coverage. Explicit disposable DATABASE_URL is required.
- The two authorized new test files have **not been created**:
  `artifacts/api-server/src/routes/productDatabaseCompatibility.test.mjs` and
  `lib/db/src/transport-cost/productDatabaseRouteBaseline.test.mjs`.
- Add the continuous API product-create / merchant single / public cart
  characterization, including legacy JSONB item snapshots, missing-cost
  pending, tier fallback, public DTO privacy, and old snapshot immutability.
- Route oracle (independent arithmetic): transport base JPY 1,000, fee 15,
  divided by 20 items and multiplied by FX 0.2 gives TWD 10.15. Area:
  (cardboard 100 + shipping 400) × 1.015 × 2 parcels × 0.2 / 100 items
  = TWD 2.03. HEP: JPY 500 / 100 × 0.2 = TWD 1. Total = **TWD 13.18**.
  This is a synthetic system-resolver oracle, not a Sheet parity claim.
  Also test missing fuel/rate, present HEP without quantity, and explicit
  exemption without silently treating missing product cost as zero.
- Run the new tests on the old schema. Then seed and dump only synthetic old
  records, record row checksums and dump hash for Phase 1 comparison.
- **No synthetic legacy-data dump or row-checksum baseline exists yet.**
- Independent Phase 0 verification, migration lifecycle, new schema, pricing
  v2, UI, browser/phone tests and full v1 acceptance are NOT RUN.

## Final continuation status

- Full `pnpm run typecheck` completed **exit 0**, including libs, API, shop-app,
  mockup-sandbox and scripts. Log SHA256:
  `6D2BF4A8221A0808E0906FF6D839FABC8D5BCE94946ACCA05972D1E471A1F6BA`.
- Root `pnpm run build` would repeat this expensive typecheck. That queued
  duplicate was stopped while still in its typecheck stage. Its log is
  `build-v2.log` and is not a build PASS. The actual existing package build
  scripts ran separately as `pnpm -r --if-present run build` with process-local
  `PORT=3000`, `BASE_PATH=/`, and Git/bin prepended to PATH. Its final status is
  **INCOMPLETE**: at the 18:14 UTC cleanup cutoff, mockup-sandbox had passed,
  API subsequently reported Done (176594ms); shop-app was transforming. It
  emitted sourcemap diagnostics for tooltip.tsx and select.tsx; these require
  assessment on the next build run. The command tree rooted
  at PID 7416 was selected for termination to respect the 18:16:30 UTC lease.
  Termination succeeded for PID 7416 and descendants 25652/19708/28796/24376.
  The build log ends with shop-app Failed after termination; no complete build
  PASS was obtained. This is a time-budget
  checkpoint. The next authorized continuation need only finish the package
  build, then request independent Phase 0 verification. Do not reinstall or
  rerun the 135 passing tests unless sources/evidence change or verification
  finds a specific need.
- Container ID `3ed1e52eb60654c2fea2fa81cf40f6a2ead16138037edba860abadebb4f5ea9d`
  was stopped and inspected: **exited, running=false, label DB-BUILD-01**.
  Prior to stopping, the DB had zero other connections. The stopped container,
  synthetic fixtures and external dump are preserved.
- The stopped duplicate command PID 16588 and its reported possible children
  20380/23372/28176 were checked afterward and were absent. Test processes and
  dump command returned terminal exit results.
- Existing tracked files remain unchanged (`git diff --quiet` exit 0), and
  HEAD/branch still match the frozen baseline. Only the two approved test files
  and this document are untracked additions. No Phase 1 source was written.
- Stable test source SHA256:
  API `F671B9FA9003E742A96B86CBF319476BDEB22425FA23A4223DC6A596E706B80D`;
  Route `93DB34AADDD44A6847D8E4A9067B2F9911E01C1191B3A9FE2EE2FDF70ED63ACC`.

Independent verification and all Phase 1 work remain NOT RUN. No author result
is an independent PASS, and no migration/restore/Sheet parity claim is made.

## Recovery and continuation

Keep existing code and lockfile intact. Reuse the same task and frozen worktree
under a renewed, explicit continuation contract; do not silently extend this
lease. Verify the exact stopped container ID/label before restarting it and
inspect schema state before any further push. Do not use reset/clean/stash or
fall back to another database. Only after a completed Phase 0 readback and
independent verification may the controller issue the Phase 1 schema contract.
