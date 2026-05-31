# 揪單 — System Skeleton

## Completed phases

| Phase | Commit | Description |
|---|---|---|
| A | `ccf27d0` | Secure API, inventory transaction, product share token |
| B-1 | `258010e` | Order status state machine |
| B-2 | `17f5d56` | DB indexes, check constraints |
| B-3 | `dd3909c` | Public order rate limiting |
| C-1 | `41c854a` | Public order success page |
| C-2a | `4ef3a3d` | Order public tracking token (nullable) + tracking API + tracking page |
| C-2b | `0c99d42` | Backfill + publicToken NOT NULL + remove fallback |
| D-0 | — | System skeleton: TrackLookup, Settings, Guide, shared status lib, 4-tab nav |

## Routes

### Buyer (public, no auth)

| Path | Component | Description |
|---|---|---|
| `/p/:shareToken` | `PublicOrder.tsx` | Product page + order form |
| `/track` | `TrackLookup.tsx` | Enter tracking code to look up order |
| `/track/:publicToken` | `TrackOrder.tsx` | Order status by public token |

### Merchant (requires Clerk auth)

| Path | Component | Description |
|---|---|---|
| `/` | `Home.tsx` (signed-out) | Landing page |
| `/sign-in` | Clerk | Sign in |
| `/sign-up` | Clerk | Sign up |
| `/setup` | `Setup.tsx` | First-time store creation |
| `/dashboard` | `Dashboard.tsx` | Stats, recent orders, quick actions |
| `/products` | `Products.tsx` | Product list with share links |
| `/products/new` | `ProductForm.tsx` | Create product |
| `/products/:id/edit` | `ProductForm.tsx` | Edit product |
| `/orders` | `Orders.tsx` | Order list + status management + CSV export |
| `/settings` | `Settings.tsx` | Edit store name and description |
| `/guide` | `Guide.tsx` | Static usage guide |

## Buyer flow

```
Merchant shares /p/:shareToken
  → Buyer fills form → submit
  → Success page: shows publicToken + copy button + link to /track/:token
  → Buyer can bookmark /track/:token or go to /track to look up later
```

## Merchant flow

```
Sign up → /setup (create store)
  → /dashboard (stats + recent orders)
  → /products (add products, copy share links)
  → /orders (confirm orders, update status)
  → /settings (edit store info)
```

## Order status flow

```
pending → awaiting_payment → preparing → shipped → completed
       ↘                 ↘           ↘         ↘
                        cancelled (from any active state)
```

Labels and colors are centralized in `artifacts/shop-app/src/lib/orderStatus.ts`.

## Key files

| File | Purpose |
|---|---|
| `lib/db/src/schema/` | DB schema (stores, products, orders) — source of truth |
| `lib/api-spec/openapi.yaml` | OpenAPI spec — drives codegen |
| `lib/api-client-react/src/generated/` | Generated React Query hooks (do not edit) |
| `lib/api-zod/src/generated/` | Generated Zod schemas (do not edit) |
| `artifacts/api-server/src/routes/` | Express route handlers |
| `artifacts/api-server/src/lib/orderStatusMachine.ts` | Server-side state machine |
| `artifacts/shop-app/src/pages/` | React pages |
| `artifacts/shop-app/src/lib/orderStatus.ts` | Frontend status labels + colors (shared) |
| `scripts/post-merge.sh` | Runs on merge: `pnpm install && pnpm --filter db push` |

## Skeleton pages (not yet fully implemented)

| Page | Status | Notes |
|---|---|---|
| `Settings.tsx` | Functional skeleton | Updates store name/description only; no logo upload yet |
| `Guide.tsx` | Static skeleton | Content is hardcoded; no dynamic content |
| `TrackLookup.tsx` | Functional | Navigation-only; no API call |
| `TrackOrder.tsx` | Functional | Shows order status; no real-time polling |

## Suggested next phases

| Phase | Description |
|---|---|
| D-1 | Store logo upload (imageUrl field already in schema) |
| D-2 | Product image upload |
| D-3 | Order notes / merchant reply to buyer |
| D-4 | Bulk order status update |
| D-5 | Dashboard charts (orders over time, top products) |
| D-6 | Buyer order history (optional — requires customer identity) |
| E-1 | Notifications (LINE Notify or email on new order) |
| E-2 | Payment status tracking (awaiting_payment flow) |
