---
name: Clerk + Tailwind v4 compatibility fix
description: Two config changes required for Clerk components to render correctly with Tailwind v4.
---

**Rule (two changes required):**

1. In `vite.config.ts`: use `tailwindcss({ optimize: false })` instead of `tailwindcss()`.
2. In `index.css`: add `@layer theme, base, clerk, components, utilities;` as the very first line, before `@import 'tailwindcss'`.

**Why:** Tailwind v4's CSS optimizer can strip or reorder Clerk's injected styles. The `optimize: false` flag and explicit layer declaration prevent this.

**How to apply:** Any shop-app or similar Clerk + Tailwind v4 setup. The `cssLayerName: "clerk"` in the Clerk appearance config corresponds to this layer declaration.
