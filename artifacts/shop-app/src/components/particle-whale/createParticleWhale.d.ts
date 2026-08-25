export interface ParticleWhaleController {
  isFallback: boolean;
  resize(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export function createParticleWhale(options: {
  container: HTMLElement;
  state?: "idle" | "active" | "paused";
  maxPixelRatio?: number;
  brightness?: number;
  speed?: number;
  scale?: number;
  gridSize?: number;
  reducedMotionFallback?: boolean;
  color?: string;
}): ParticleWhaleController;
