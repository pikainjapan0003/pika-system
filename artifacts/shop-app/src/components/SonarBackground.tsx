import { useEffect, useRef, useState } from "react";
import type { ParticleWhaleController } from "./particle-whale/createParticleWhale.js";

const RINGS = {
  background:
    "repeating-radial-gradient(circle at 50% 50%, transparent 0 15%, hsl(var(--chart-4) / 0.13) 15.5% 16.5%, transparent 17% 31%, hsl(var(--chart-4) / 0.09) 31.5% 32.5%, transparent 33% 46%, hsl(var(--chart-4) / 0.07) 46.5% 47.5%, transparent 48% 62%, hsl(var(--chart-4) / 0.05) 62.5% 63.5%, transparent 64%)",
};

const SWEEP = {
  background:
    "conic-gradient(from 0deg, hsl(var(--primary) / 0.34), hsl(var(--primary) / 0.05) 21%, transparent 30%)",
};

export function SonarBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let controller: ParticleWhaleController | null = null;

    // Deliberately dynamic: Three.js and the accepted G1 whale stay out of the
    // Vite entry chunk and load only when the KPI radar mounts.
    void import("./particle-whale/createParticleWhale.js")
      .then(({ createParticleWhale }) => {
        if (cancelled) return;
        controller = createParticleWhale({
          container: host,
          state: "active",
          gridSize: 60,
          maxPixelRatio: 1.5,
          brightness: 0.9,
          speed: 0.65,
          scale: 1,
          reducedMotionFallback: true,
          color: getComputedStyle(host).color,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      controller?.destroy();
    };
  }, []);

  return (
    <div className="grid min-h-72 place-items-center">
      <div
        className="relative isolate size-[280px] max-w-full overflow-hidden rounded-full border border-border bg-background opacity-100"
        data-testid="sonar-whale"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 z-[1] rounded-full"
          style={RINGS}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 z-[2] animate-[spin_7s_linear_infinite] rounded-full mix-blend-screen motion-reduce:animate-none"
          style={SWEEP}
          data-testid="radar-sweep"
          aria-hidden="true"
        />
        <div
          ref={hostRef}
          className="pointer-events-none absolute inset-0 z-[3] text-primary opacity-100 [&_.particle-whale-canvas]:block [&_.particle-whale-fallback]:size-full [&_.particle-whale-fallback]:fill-none [&_.particle-whale-fallback]:stroke-primary"
          aria-hidden="true"
        />
      </div>
      {loadFailed ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          雷達視覺暫時無法載入，KPI 資料不受影響。
        </p>
      ) : null}
    </div>
  );
}
