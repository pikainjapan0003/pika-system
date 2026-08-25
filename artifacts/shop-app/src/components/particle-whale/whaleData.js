/*
 * Volumetric whale-data generator adapted from:
 * https://github.com/zepeng-jin/dsh-particle-whale
 * Upstream license: MIT. See ./THIRD_PARTY_NOTICES.md
 *
 * CHANGE (this handoff): the second argument `spacing` allows a smaller
 * grid to keep roughly the same whale world-size as GRID_SIZE. A smaller
 * grid yields fewer particles (density reduction for 62px containers).
 * Callers should pass spacing = PARTICLE_SPACING * GRID_SIZE / gridSize
 * so the whale keeps its world-scale while dropping particle count.
 */

import * as THREE from "three";
import { GRID_SIZE, PARTICLE_SPACING, WHALE_PATH } from "./whaleConstants.js";

export function generateVolumetricWhaleData(
  gridSize = GRID_SIZE,
  customSpacing = null,
) {
  const spacing = customSpacing || (PARTICLE_SPACING * GRID_SIZE) / gridSize;

  const canvas = document.createElement("canvas");
  canvas.width = gridSize;
  canvas.height = gridSize;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  context.fillStyle = "#000";
  context.fillRect(0, 0, gridSize, gridSize);

  const scale = Math.min(gridSize / 24, gridSize / 18);
  const renderWidth = 24 * scale;
  const renderHeight = 18 * scale;

  context.setTransform(
    scale,
    0,
    0,
    scale,
    (gridSize - renderWidth) / 2,
    (gridSize - renderHeight) / 2,
  );
  context.fillStyle = "#fff";
  context.fill(new Path2D(WHALE_PATH));

  const { data: imageData } = context.getImageData(0, 0, gridSize, gridSize);
  const half = gridSize / 2;
  const mask = new Float32Array(gridSize * gridSize);

  for (let index = 0; index < gridSize * gridSize; index += 1) {
    const rgbaIndex = index * 4;
    mask[index] =
      (imageData[rgbaIndex] * 0.299 +
        imageData[rgbaIndex + 1] * 0.587 +
        imageData[rgbaIndex + 2] * 0.114) /
      255;
  }

  const distanceMap = new Float32Array(gridSize * gridSize);
  let maxDistance = 1;

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (mask[y * gridSize + x] <= 0.2) {
        continue;
      }

      let minDistance = Number.POSITIVE_INFINITY;

      for (let neighborY = 0; neighborY < gridSize; neighborY += 2) {
        for (let neighborX = 0; neighborX < gridSize; neighborX += 2) {
          if (mask[neighborY * gridSize + neighborX] <= 0.2) {
            const distance = Math.hypot(x - neighborX, y - neighborY);
            minDistance = Math.min(minDistance, distance);
          }
        }
      }

      const normalizedDistance = Number.isFinite(minDistance) ? minDistance : 0;
      distanceMap[y * gridSize + x] = normalizedDistance;
      maxDistance = Math.max(maxDistance, normalizedDistance);
    }
  }

  const positions = [];
  const normals = [];
  const scatteredPositions = [];
  const opacities = [];
  const edges = [];
  const jitters = [];

  function addParticle(px, py, pz, nx, ny, nz, opacity, edge) {
    positions.push(px, py, pz);
    normals.push(nx, ny, nz);
    opacities.push(opacity);
    edges.push(edge);

    jitters.push(
      (Math.random() - 0.5) * 0.08,
      (Math.random() - 0.5) * 0.08,
      (Math.random() - 0.5) * 0.08,
    );

    const phi = Math.random() * Math.PI * 2;
    const theta = Math.acos(2 * Math.random() - 1);
    const distance = 6 * (0.3 + 0.7 * Math.random());

    scatteredPositions.push(
      Math.sin(theta) * Math.cos(phi) * distance,
      Math.sin(theta) * Math.sin(phi) * distance,
      Math.cos(theta) * distance * 0.8,
    );
  }

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const value = mask[y * gridSize + x] ?? 0;
      if (value <= 0.2) {
        continue;
      }

      const px = (x - half) * spacing;
      const py = (half - y) * spacing;
      const normalizedDistance = Math.min(
        1,
        (distanceMap[y * gridSize + x] ?? 0) / maxDistance,
      );
      const heightFactor = Math.sqrt(normalizedDistance);

      const spinePosition = (px + 2.2) / 5.2;
      const bodyProfile = Math.sin(
        Math.max(0, Math.min(Math.PI, spinePosition * Math.PI)),
      );
      const localMaxZ = heightFactor * (0.35 + 0.75 * bodyProfile);

      let emptyNeighbors = 0;

      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) {
            continue;
          }

          const neighborX = x + deltaX;
          const neighborY = y + deltaY;
          const outside =
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= gridSize ||
            neighborY >= gridSize;

          if (outside || (mask[neighborY * gridSize + neighborX] ?? 0) <= 0.2) {
            emptyNeighbors += 1;
          }
        }
      }

      const edgeFactor = emptyNeighbors / 8;

      if (localMaxZ > 0.08) {
        const frontZ = localMaxZ * (0.75 + 0.25 * Math.random());
        const frontNormal = new THREE.Vector3(0, py * 0.2, 1).normalize();
        addParticle(
          px,
          py,
          frontZ,
          frontNormal.x,
          frontNormal.y,
          frontNormal.z,
          value,
          edgeFactor,
        );

        const backZ = -localMaxZ * (0.75 + 0.25 * Math.random());
        const backNormal = new THREE.Vector3(0, py * 0.2, -1).normalize();
        addParticle(
          px,
          py,
          backZ,
          backNormal.x,
          backNormal.y,
          backNormal.z,
          value,
          edgeFactor,
        );
      } else {
        const edgeNormal = new THREE.Vector3(
          px * 0.2,
          py * 0.2,
          (Math.random() - 0.5) * 0.4,
        ).normalize();

        addParticle(
          px,
          py,
          (Math.random() - 0.5) * 0.05,
          edgeNormal.x,
          edgeNormal.y,
          edgeNormal.z,
          value,
          edgeFactor,
        );
      }
    }
  }

  return {
    count: positions.length / 3,
    gridSize,
    spacing,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    scatteredPositions: new Float32Array(scatteredPositions),
    opacities: new Float32Array(opacities),
    edges: new Float32Array(edges),
    jitters: new Float32Array(jitters),
  };
}
