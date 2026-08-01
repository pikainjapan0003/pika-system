# Error-path coverage inventory (BATCH-21)

Date: 2026-08-01. Read-only inventory; this package changes no route behavior.

## Coverage sources

The API currently has 21 route-focused `node:test` files under
`artifacts/api-server/src/routes`, plus pure integration tests for the error handler,
health diagnostics, request IDs, and security headers. The route suites exercise the
following error classes:

| Error class                            | Evidence                                                           | Expected public result                                        | Coverage status                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Unauthenticated owner request          | customer, order, skills, export, audit, and logistics route suites | `401` without private data                                    | Covered by route tests.                                                                            |
| Authenticated user from another store  | customer/order/skills/export isolation suites                      | `403` or `404` according to the route contract                | Covered for the owner-only surfaces in the existing DB route collection.                           |
| Invalid identifiers and request shapes | orders, customers, skills, logistics, and export suites            | `400`/`422` fixed client-safe message or explicit route error | Covered by targeted route cases; unknown errors are covered by `publicError.integration.test.mjs`. |
| Missing resource                       | public/order/customer/skill route suites                           | `404`                                                         | Covered, including public token probes.                                                            |
| Explicit business conflict             | order/skill/store-credit suites                                    | `409` with an intentional safe message                        | Covered; explicit `PublicSafeError`/`expose` semantics are separately tested.                      |
| Server/database failure                | `health.route.test.mjs`, `appSecurityHeaders.integration.test.mjs` | `503` for health; generic `500` elsewhere                     | Covered for health and global error-handler behavior.                                              |
| Rate-limit rejection                   | `publicRateLimit.route.test.mjs`                                   | `429` with no internal fields                                 | Covered.                                                                                           |
| Internal-secret and feature gates      | logistics kill-switch, dev-handoff production guard, worker tests  | `401`/`403`/`404`/`NotEnabled` as specified                   | Covered by dedicated route/security suites.                                                        |

## Sanitized logging and response boundary

- `app.ts` sends all uncaught errors through `sendPublicError`; unknown 4xx messages are
  fixed and 5xx messages are `Internal server error`.
- The 13 logistics/order worker `console.error` sites now pass `sanitizeError(err)`;
  no targeted site serializes a raw Drizzle error, SQL parameters, stack path, or token.
- `publicError.integration.test.mjs` covers unknown 400/404, intentional 409/422, and
  unknown 500 responses. The test fixtures include SQL-like text, a private path, and a
  database URL to make accidental echoing fail loudly.

## Gaps and follow-up

This inventory does not claim that every route branch has a unique test. The existing
P1 trips ownership gap remains a design/schema decision, not a test-only gap. The
remaining raw `console.error` calls are sanitized call sites (the identifier is retained
for operational context); a future logging package may migrate them to the shared logger.
The pending E2E workflow has not been triggered, so browser-only error paths remain
unverified until the owner runs that workflow.

Status: inventory only; no error-path implementation or test expectation was changed.
