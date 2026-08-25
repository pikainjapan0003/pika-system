/*
 * Whale shaders adapted from:
 * https://github.com/zepeng-jin/dsh-particle-whale
 * Upstream license: MIT. See ./THIRD_PARTY_NOTICES.md
 */

export const WHALE_VERTEX_SHADER = `
  attribute float aOpacity;
  attribute float aIndex;
  attribute float aEdge;
  attribute vec3 aNormal;
  attribute vec3 aScattered;
  attribute vec3 aJitter;

  uniform float uTime;
  uniform float uAssembly;
  uniform float uWorking;
  uniform vec3 uLightPos;
  uniform float uLightRange;
  uniform float uShadeMin;
  uniform float uShadeMax;

  varying float vOpacity;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vAssembly;
  varying float vLight;
  varying float vWorking;

  void main() {
    vOpacity = aOpacity;
    vAssembly = uAssembly;
    vWorking = uWorking;

    vec3 targetCenter =
      (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 localOffset =
      (instanceMatrix * vec4(position, 1.0)).xyz - targetCenter;

    float pulse =
      1.0 + 0.10 * uWorking * sin(uTime * 3.5 + aIndex * 0.4);
    localOffset *= pulse;

    float assembly = smoothstep(0.0, 1.0, uAssembly);
    vec3 center = mix(aScattered, targetCenter, assembly);
    vec3 positionWithMotion = center + localOffset;

    positionWithMotion +=
      aJitter * assembly * (0.65 + 0.55 * uWorking);

    float spineProgress =
      clamp((targetCenter.x + 2.2) / 5.2, 0.0, 1.0);
    float tailFactor = spineProgress * spineProgress;
    float swimFrequency = mix(1.15, 2.25, uWorking);
    float wavePhase =
      uTime * swimFrequency - targetCenter.x * 0.9;

    positionWithMotion.y +=
      sin(wavePhase) * (0.018 + 0.18 * tailFactor) * assembly;
    positionWithMotion.z +=
      cos(wavePhase * 0.85) *
      (0.012 + 0.115 * tailFactor) *
      assembly;

    vec4 worldPosition =
      modelMatrix * vec4(positionWithMotion, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormal =
      normalize((modelMatrix * vec4(aNormal, 0.0)).xyz);

    float lightDistance =
      distance(worldPosition.xyz, uLightPos);
    float lit =
      clamp(1.0 - lightDistance / uLightRange, 0.0, 1.0);
    vLight =
      mix(uShadeMin, uShadeMax, lit * lit);

    gl_Position =
      projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const WHALE_FRAGMENT_SHADER = `
  varying float vOpacity;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vAssembly;
  varying float vLight;
  varying float vWorking;

  uniform float uTime;
  uniform vec3 uColor;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(vec3(0.0, 0.0, 1.0));
    float normalDotView =
      abs(dot(normal, viewDirection));
    float fresnel =
      pow(1.0 - normalDotView, 2.2);

    vec3 lightDirection =
      normalize(vec3(0.3, 0.8, 0.9));
    float diffuse =
      max(0.2, dot(normal, lightDirection));
    vec3 halfway =
      normalize(lightDirection + viewDirection);
    float specular =
      pow(max(0.0, dot(normal, halfway)), 8.0) * 0.5;

    float pulseSpeed =
      mix(1.0, 3.0, vWorking);
    float pulseWave =
      sin(
        uTime * pulseSpeed -
        vWorldPos.x * 2.2 +
        vWorldPos.y * 1.5
      ) * 0.5 + 0.5;
    float activeGlow =
      vWorking * pulseWave * 0.36;

    float alpha =
      vOpacity *
      (
        mix(0.38, 0.82, vAssembly) +
        fresnel * 0.38 +
        activeGlow
      );

    vec3 activeColor =
      mix(
        uColor,
        vec3(0.05, 0.96, 1.0),
        vWorking * 0.55
      );

    vec3 color =
      activeColor * (diffuse * vLight + specular) +
      fresnel * vec3(0.28, 0.66, 1.0) * vLight;

    color +=
      activeGlow * vec3(0.02, 0.55, 0.75);

    gl_FragColor = vec4(color, alpha);
  }
`;
