# Build bundle size review (BATCH-21)

Date: 2026-08-01. This is a read-only inventory; no bundle or source files were changed.

## Build probe

The requested shop-app build was attempted with:

```text
corepack pnpm --filter @workspace/shop-app run build
```

It cannot run on this Windows workspace because the repository's installed Rollup tree
does not contain the platform optional package:

```text
Error: Cannot find module @rollup/rollup-win32-x64-msvc
```

`BUILD_EXIT=1`. This is the known Windows optional-dependency limitation; the Linux CI
build remains the authoritative executable build measurement.

## Existing artifact snapshot (not a current rebuild)

The existing ignored `artifacts/shop-app/dist/public` snapshot is dated 2026-07-07 and
was therefore not presented as a current build. Its total size is 8,897,593 bytes. The
largest entries are:

| Artifact                          |     Bytes |
| --------------------------------- | --------: |
| `videos/guga-countdown-loop.mp4`  | 4,535,923 |
| `videos/guga-countdown-loop.webm` | 3,080,860 |
| `assets/index-BzGkkoMZ.js`        |   793,529 |
| `images/gugugaga-countdown.webp`  |   331,358 |
| `assets/index-ks5-wVk4.css`       |   123,671 |

The existing `artifacts/api-server/dist` snapshot contains a 5,523,224-byte `index.mjs`
and a 10,114,752-byte source map. These are also dated/ignored artifacts and are not a
replacement for a fresh CI build.

## Static dependency weight review

The shop app declares the likely browser-weight contributors `@clerk/react`, `react`,
`react-dom`, `recharts`, `framer-motion`, `lucide-react`, `react-icons`, and the Radix UI
component set. The two video files dominate the existing static snapshot; the main JS
chunk is the largest executable browser asset. No dependency was upgraded or removed in
this package, and no tree-shaking conclusion is claimed without a successful build.

## Follow-up

Use the Linux CI build artifact for a fresh size comparison after a source change. If the
video assets are not needed on every route, evaluate route-level or on-demand loading in a
separate product-approved package. This report makes no performance or budget decision.
