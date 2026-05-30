---
name: Orval query hook typing
description: react-query v5 requires queryKey in UseQueryOptions; Orval-generated hooks accept partial options at runtime but TS complains.
---

In react-query v5, `UseQueryOptions` has `queryKey` as a required field. Orval generates hooks that accept `{ query?: UseQueryOptions<...> }`, so passing just `{ enabled: boolean }` causes a TS error.

**Rule:** Cast the query option: `{ query: { enabled: !!foo } as any }`.

**Why:** The hook internally supplies `queryKey` via its own `getXxxQueryOptions()` call. The `queryKey` in the options is redundant at runtime but required by the TypeScript type. Casting avoids ugly boilerplate.

**How to apply:** In every `useXxx({ query: { enabled: ... } })` call in this codebase.
