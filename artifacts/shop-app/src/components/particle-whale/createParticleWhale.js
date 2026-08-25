/*
 * Particle-whale container-scoped component — portable package version.
 * The geometry and shader concepts are adapted from dsh-particle-whale (MIT).
 * See ./THIRD_PARTY_NOTICES.md
 *
 * OWNER-FINAL DEFAULTS（Owner 裁決 2026-08-24）:
 *   gridSize 60（粒子 2,640）· scale 1.0 —— 於本檔 options 預設值。
 *   heroSize 280px · opacity 1.0 —— 屬頁面層級（hero 容器尺寸與透明度），
 *   由 whaleConstants.js 的 HERO_SIZE / HERO_OPACITY 提供，hosting 頁掛載時套用。
 *
 * 元件行為：
 *  - 縮放（ResizeObserver）、可見性（IntersectionObserver）、
 *    document 可見性、prefers-reduced-motion 自動暫停／單幀。
 *  - WebGL 不可用時自動改掛內嵌 SVG（WHALE_PATH）fallback。
 *  - controller.getStats(): { gridSize, particleCount, state, isFallback, ... }
 *  - debugSetAssembly(): TEST/DEBUG ONLY —— 產品程式碼不得呼叫（見檔尾）。
 */

import * as THREE from "three";
import { generateVolumetricWhaleData } from "./whaleData.js";
import {
  GRID_SIZE,
  LIGHT_DEFAULTS,
  PARTICLE_SPACING,
  WHALE_PATH,
} from "./whaleConstants.js";
import { WHALE_FRAGMENT_SHADER, WHALE_VERTEX_SHADER } from "./whaleShaders.js";

const VALID_STATES = new Set(["idle", "active", "paused"]);
const MIN_GRID = 16;
const MAX_GRID = 96;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function supportsWebGL() {
  const canvas = document.createElement("canvas");
  return Boolean(
    canvas.getContext("webgl2") ||
    canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl"),
  );
}

function createFallback(container) {
  const fallback = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  fallback.setAttribute("viewBox", "0 0 24 18");
  fallback.setAttribute("aria-hidden", "true");
  fallback.classList.add("particle-whale-fallback");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", WHALE_PATH);
  fallback.appendChild(path);
  container.appendChild(fallback);

  return () => fallback.remove();
}

export function createParticleWhale(userOptions) {
  const options = {
    container: null,
    state: "idle",
    maxPixelRatio: 1.5,
    brightness: 0.9,
    speed: 0.65,
    scale: 1, // 定案值 1.0（Owner 裁決 2026-08-24）
    gridSize: GRID_SIZE, // 定案值 60 → 粒子 2,640（Owner 裁決 2026-08-24）
    reducedMotionFallback: true,
    color: null,
    ...userOptions,
  };

  const container = options.container;

  if (!(container instanceof HTMLElement)) {
    throw new TypeError(
      "createParticleWhale requires options.container to be an HTMLElement.",
    );
  }

  if (!VALID_STATES.has(options.state)) {
    throw new TypeError(
      `Unknown initial whale state: ${String(options.state)}`,
    );
  }

  const gridSize = Math.round(
    clamp(Number(options.gridSize) || GRID_SIZE, MIN_GRID, MAX_GRID),
  );
  const customSpacing = (PARTICLE_SPACING * GRID_SIZE) / gridSize;

  container.setAttribute("aria-hidden", "true");

  if (!supportsWebGL()) {
    const removeFallback = createFallback(container);
    return {
      isFallback: true,
      gridSize,
      particleCount: 0,
      getStats() {
        return { gridSize, particleCount: 0, isFallback: true };
      },
      setState() {},
      setBrightness() {},
      setSpeed() {},
      setScale() {},
      resize() {},
      pause() {},
      resume() {},
      destroy: removeFallback,
    };
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, clamp(options.maxPixelRatio, 1, 2)),
  );
  if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.classList.add("particle-whale-canvas");
  container.appendChild(renderer.domElement);

  const particleData = generateVolumetricWhaleData(gridSize, customSpacing);
  const particleCount = particleData.count;
  const instanceIndices = new Float32Array(particleCount);

  for (let index = 0; index < particleCount; index += 1) {
    instanceIndices[index] = index;
  }

  const geometry = new THREE.BoxGeometry(0.06, 0.06, 0.018);
  geometry.setAttribute(
    "aOpacity",
    new THREE.InstancedBufferAttribute(particleData.opacities, 1),
  );
  geometry.setAttribute(
    "aIndex",
    new THREE.InstancedBufferAttribute(instanceIndices, 1),
  );
  geometry.setAttribute(
    "aNormal",
    new THREE.InstancedBufferAttribute(particleData.normals, 3),
  );
  geometry.setAttribute(
    "aScattered",
    new THREE.InstancedBufferAttribute(particleData.scatteredPositions, 3),
  );
  geometry.setAttribute(
    "aEdge",
    new THREE.InstancedBufferAttribute(particleData.edges, 1),
  );
  geometry.setAttribute(
    "aJitter",
    new THREE.InstancedBufferAttribute(particleData.jitters, 3),
  );

  const material = new THREE.ShaderMaterial({
    vertexShader: WHALE_VERTEX_SHADER,
    fragmentShader: WHALE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uAssembly: { value: 0 },
      uWorking: { value: 0 },
      uLightPos: {
        value: new THREE.Vector3(
          LIGHT_DEFAULTS.x,
          LIGHT_DEFAULTS.y,
          LIGHT_DEFAULTS.z,
        ),
      },
      uLightRange: {
        value: LIGHT_DEFAULTS.range,
      },
      uShadeMin: {
        value: LIGHT_DEFAULTS.shadeMin,
      },
      uShadeMax: {
        value: LIGHT_DEFAULTS.shadeMax * clamp(options.brightness, 0.2, 2),
      },
      uColor: {
        value: new THREE.Color(
          options.color || getComputedStyle(container).color,
        ),
      },
    },
  });

  const instancedMesh = new THREE.InstancedMesh(
    geometry,
    material,
    particleCount,
  );
  instancedMesh.frustumCulled = false;

  const dummy = new THREE.Object3D();

  for (let index = 0; index < particleCount; index += 1) {
    dummy.position.set(
      particleData.positions[index * 3],
      particleData.positions[index * 3 + 1],
      particleData.positions[index * 3 + 2],
    );

    const randomScale = 0.65 + 0.7 * Math.random();
    dummy.scale.setScalar(randomScale);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(index, dummy.matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;

  const whaleGroup = new THREE.Group();
  whaleGroup.add(instancedMesh);
  scene.add(whaleGroup);

  let state = options.state;
  let manualPaused = state === "paused";
  let viewportVisible = true;
  let documentVisible = !document.hidden;
  let destroyed = false;
  let frameId = 0;
  let lastTimestamp = 0;
  let elapsed = 0;
  let assembly = 0;
  let working = state === "active" ? 1 : 0;
  let currentSpeed = clamp(options.speed, 0.1, 3);
  let currentScale = clamp(options.scale, 0.5, 1.5);
  let reducedMotion =
    options.reducedMotionFallback &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function applyStaticPose() {
    whaleGroup.position.set(0.25, -0.08, 0);
    whaleGroup.rotation.set(-0.02, -0.04, -0.035);
    whaleGroup.scale.setScalar(currentScale);
  }

  function resize() {
    if (destroyed) {
      return;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        clamp(options.maxPixelRatio, 1, 2),
      ),
    );
    renderer.setSize(width, height, false);

    camera.aspect = aspect;
    camera.fov = 42;

    const baseWhaleWidth = 11;
    const baseWhaleHeight = 8.2;
    const desiredVisibleHeight = Math.max(
      baseWhaleHeight / 0.76,
      baseWhaleWidth / (Math.max(aspect, 0.5) * 0.68),
    );
    camera.position.z =
      desiredVisibleHeight /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();

    renderOnce();
  }

  function renderOnce() {
    if (destroyed) {
      return;
    }

    renderer.render(scene, camera);
  }

  function shouldAnimate() {
    return (
      !destroyed &&
      !manualPaused &&
      state !== "paused" &&
      viewportVisible &&
      documentVisible &&
      !reducedMotion
    );
  }

  function update(timestamp) {
    frameId = 0;

    if (!shouldAnimate()) {
      return;
    }

    const delta = Math.min(
      lastTimestamp === 0 ? 1 / 60 : (timestamp - lastTimestamp) / 1000,
      0.05,
    );
    lastTimestamp = timestamp;

    const targetWorking = state === "active" ? 1 : 0;
    const workingLerp = targetWorking > working ? 0.08 : 0.045;
    working += (targetWorking - working) * workingLerp * 60 * delta;

    assembly = Math.min(1, assembly + delta * 0.72);
    elapsed += delta * currentSpeed * THREE.MathUtils.lerp(1, 1.55, working);

    material.uniforms.uTime.value = elapsed;
    material.uniforms.uAssembly.value = assembly;
    material.uniforms.uWorking.value = working;

    const driftX = Math.sin(elapsed * 0.25) * 0.16;
    const driftY = Math.sin(elapsed * 0.38 + 0.8) * 0.1;
    const driftZ = Math.cos(elapsed * 0.19) * 0.06;

    whaleGroup.position.set(0.25 + driftX, -0.08 + driftY, driftZ);

    whaleGroup.rotation.set(
      -0.02 + Math.sin(elapsed * 0.21) * 0.025,
      -0.04 + Math.sin(elapsed * 0.16) * 0.07,
      -0.035 + Math.cos(elapsed * 0.18) * 0.035,
      "ZYX",
    );
    whaleGroup.scale.setScalar(currentScale);

    renderer.render(scene, camera);
    schedule();
  }

  function schedule() {
    if (frameId || !shouldAnimate()) {
      return;
    }

    frameId = requestAnimationFrame(update);
  }

  function pause() {
    manualPaused = true;
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function resume() {
    if (destroyed) {
      return;
    }

    manualPaused = false;
    lastTimestamp = 0;
    schedule();
  }

  function setState(nextState) {
    if (!VALID_STATES.has(nextState)) {
      throw new TypeError(`Unknown whale state: ${String(nextState)}`);
    }

    state = nextState;

    if (nextState === "paused") {
      pause();
      return;
    }

    manualPaused = false;

    if (reducedMotion) {
      working = nextState === "active" ? 1 : 0;
      assembly = 1;
      material.uniforms.uWorking.value = working;
      material.uniforms.uAssembly.value = assembly;
      applyStaticPose();
      renderOnce();
      return;
    }

    resume();
  }

  function setBrightness(value) {
    const brightness = clamp(Number(value), 0.2, 2);
    material.uniforms.uShadeMax.value = LIGHT_DEFAULTS.shadeMax * brightness;
    renderOnce();
  }

  function setSpeed(value) {
    currentSpeed = clamp(Number(value), 0.1, 3);
  }

  function setScale(value) {
    currentScale = clamp(Number(value), 0.5, 1.5);
    whaleGroup.scale.setScalar(currentScale);
    renderOnce();
  }

  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);

  const intersectionObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          ([entry]) => {
            viewportVisible = entry?.isIntersecting ?? true;
            if (viewportVisible) {
              schedule();
            } else if (frameId) {
              cancelAnimationFrame(frameId);
              frameId = 0;
            }
          },
          { threshold: 0.05 },
        )
      : null;
  intersectionObserver?.observe(container);

  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  function onMotionPreferenceChange(event) {
    reducedMotion = options.reducedMotionFallback && event.matches;

    if (reducedMotion) {
      pause();
      assembly = 1;
      material.uniforms.uAssembly.value = 1;
      applyStaticPose();
      renderOnce();
    } else if (state !== "paused") {
      manualPaused = false;
      resume();
    }
  }

  motionQuery?.addEventListener?.("change", onMotionPreferenceChange);

  function onVisibilityChange() {
    documentVisible = !document.hidden;
    if (documentVisible) {
      schedule();
    } else if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;

    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    motionQuery?.removeEventListener?.("change", onMotionPreferenceChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);

    whaleGroup.clear();
    scene.clear();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  resize();

  if (reducedMotion) {
    assembly = 1;
    material.uniforms.uAssembly.value = 1;
    working = state === "active" ? 1 : 0;
    material.uniforms.uWorking.value = working;
    applyStaticPose();
    renderOnce();
  } else if (state !== "paused") {
    schedule();
  }

  // =====================================================================
  // TEST/DEBUG ONLY — 產品程式碼不得呼叫（G3／G4 禁止引用本函式）。
  // 強制 assembly 值並繪出單一凍結幀，供自動化截圖／流程驗證使用；
  // 呼叫後請以 pause() 保持定格。測試流程之外請勿使用。
  // =====================================================================
  function debugSetAssembly(value) {
    if (destroyed) {
      return 0;
    }
    assembly = clamp(Number(value) || 0, 0, 1);
    material.uniforms.uAssembly.value = assembly;
    renderOnce();
    return assembly;
  }

  return {
    isFallback: false,
    gridSize,
    particleCount,
    getStats() {
      return {
        gridSize,
        particleCount,
        state,
        assembly,
        isFallback: false,
        width: container.clientWidth,
        height: container.clientHeight,
      };
    },
    debugSetAssembly,
    setState,
    setBrightness,
    setSpeed,
    setScale,
    resize,
    pause,
    resume,
    destroy,
  };
}
