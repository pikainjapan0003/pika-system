import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ParticleWhaleController } from "./particle-whale/createParticleWhale.js";

const SONAR_PARTICLES = [
  {
    left: "17%",
    top: "24%",
    animationDelay: "-1.2s",
    animationDuration: "8.4s",
  },
  {
    left: "78%",
    top: "19%",
    animationDelay: "-5.1s",
    animationDuration: "9.6s",
  },
  {
    left: "12%",
    top: "63%",
    animationDelay: "-3.8s",
    animationDuration: "10.2s",
  },
  {
    left: "84%",
    top: "58%",
    animationDelay: "-7.4s",
    animationDuration: "11.3s",
  },
  {
    left: "31%",
    top: "82%",
    animationDelay: "-6.2s",
    animationDuration: "9.1s",
  },
  {
    left: "69%",
    top: "87%",
    animationDelay: "-2.6s",
    animationDuration: "10.8s",
  },
] as const;

const RINGS = {
  background:
    "repeating-radial-gradient(circle at 50% 50%, transparent 0 15%, hsl(var(--chart-4) / 0.13) 15.5% 16.5%, transparent 17% 31%, hsl(var(--chart-4) / 0.09) 31.5% 32.5%, transparent 33% 46%, hsl(var(--chart-4) / 0.07) 46.5% 47.5%, transparent 48% 62%, hsl(var(--chart-4) / 0.05) 62.5% 63.5%, transparent 64%)",
};

const SWEEP = {
  background:
    "conic-gradient(from 0deg, hsl(var(--primary) / 0.34), hsl(var(--primary) / 0.05) 21%, transparent 30%)",
};

export type SonarMotionProfile = "full" | "breathe-only";
export interface SonarBackgroundHandle {
  pauseForInteraction(): void;
}

export const SonarBackground = forwardRef<
  SonarBackgroundHandle,
  {
    variant?: "feature" | "ambient";
    motionProfile?: SonarMotionProfile;
    interactionPaused?: boolean;
  }
>(function SonarBackground(
  { variant = "feature", motionProfile = "full", interactionPaused = false },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ParticleWhaleController | null>(null);
  const interactionPausedRef = useRef(interactionPaused);
  const [loadFailed, setLoadFailed] = useState(false);
  const isAmbient = variant === "ambient";
  const hasAnimatedWhale = !isAmbient && motionProfile === "full";

  interactionPausedRef.current = interactionPaused;

  useImperativeHandle(
    ref,
    () => ({
      pauseForInteraction() {
        controllerRef.current?.pause();
      },
    }),
    [],
  );

  useEffect(() => {
    if (!hasAnimatedWhale) return;
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
        controllerRef.current = controller;
        if (interactionPausedRef.current) controller.pause();
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      controller?.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [hasAnimatedWhale]);

  useLayoutEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (interactionPaused) {
      controller.pause();
    } else {
      controller.resume();
    }
  }, [interactionPaused]);

  return (
    <div
      className={
        isAmbient
          ? "pointer-events-none relative h-20 overflow-hidden"
          : "grid min-h-72 place-items-center"
      }
    >
      <div
        className={`isolate max-w-full overflow-hidden rounded-full border border-border bg-background ${
          isAmbient
            ? "absolute -right-3 top-1/2 size-36 -translate-y-1/2 opacity-70"
            : "relative size-[280px] opacity-100"
        }`}
        data-testid={
          isAmbient
            ? "sonar-ambient"
            : hasAnimatedWhale
              ? "sonar-whale"
              : "sonar-breathe-only"
        }
        data-sonar-variant={variant}
        data-sonar-motion-profile={motionProfile}
        data-sonar-interaction-paused={interactionPaused ? "true" : "false"}
        aria-hidden="true"
      >
        <div
          className="sonar-breathe pointer-events-none absolute inset-5 z-0 rounded-full motion-reduce:hidden"
          data-testid="sonar-breathe"
          data-motion="MO-2"
          aria-hidden="true"
        />
        {motionProfile === "full" ? (
          <div
            className="sonar-particles pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-full motion-reduce:hidden"
            data-testid="sonar-particles"
            data-motion="MO-3"
            aria-hidden="true"
          >
            {SONAR_PARTICLES.map((particle) => (
              <span
                key={`${particle.left}-${particle.top}`}
                className="sonar-particle absolute size-[3px] rounded-full"
                style={particle}
                data-testid="sonar-particle"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : null}
        <div
          className="absolute inset-0 z-[1] rounded-full"
          style={RINGS}
          aria-hidden="true"
        />
        {motionProfile === "full" ? (
          <div
            className="sonar-sweep absolute inset-0 z-[2] animate-[spin_7s_linear_infinite] rounded-full mix-blend-screen motion-reduce:hidden"
            style={SWEEP}
            data-testid="radar-sweep"
            data-motion="MO-1"
            data-duration-ms="7000"
            aria-hidden="true"
          />
        ) : null}
        {hasAnimatedWhale ? (
          <div
            ref={hostRef}
            className="pointer-events-none absolute inset-0 z-[3] text-primary opacity-100 [&_.particle-whale-canvas]:block [&_.particle-whale-fallback]:size-full [&_.particle-whale-fallback]:fill-none [&_.particle-whale-fallback]:stroke-primary"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {hasAnimatedWhale && loadFailed ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          雷達視覺暫時無法載入，KPI 資料不受影響。
        </p>
      ) : null}
    </div>
  );
});
