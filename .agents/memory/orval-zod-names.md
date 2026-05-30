---
name: Orval Zod schema naming convention
description: Orval generates Zod schema names from the OpenAPI operation/schema names, not from custom type aliases.
---

**Rule:** Zod schema names in `@workspace/api-zod` match the OpenAPI spec's schema/body names exactly:
- Request body schemas: `CreateStoreBody`, `UpdateStoreBody`, `CreateProductBody`, `UpdateProductBody`, `UpdateOrderStatusBody`, `SubmitOrderBody`
- Params schemas: `UpdateStoreParams`, `ListProductsParams`, etc.
- Response schemas: `GetMyStoreResponse`, `GetStoreStatsResponse`, etc.

**Why:** Orval derives names from OpenAPI `operationId` or schema `$ref` names. Custom aliases like `StoreInput` or `StoreUpdate` do not exist unless explicitly defined in the spec.

**How to apply:** When importing from `@workspace/api-zod` in route handlers, always verify names with `grep "^export const" lib/api-zod/src/generated/api.ts` rather than guessing.
