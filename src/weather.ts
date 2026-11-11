import * as THREE from 'three';
import { mulberry32 } from './geo.ts';
import type { Bounds } from './types.ts';

// Falling rain and snow: one set of GPU-animated quads in a box that follows the
// camera. Drops are anchored in world space and wrap around the box, so they
// don't swim when the camera moves. The box grows with zoom and the drops are
// sized in screen terms, so rain reads the same up close and from the overview.
// No ink lines: skipped in the normal pass (InkRenderer.skipNormal), zero in the low tier's normal attachment.

const VERT = /* glsl */ `
  attribute vec3 aCorner;              // quad corner x (-1..1), y (0..1), per-drop random
  uniform float uTime, uBox, uRain, uSnow;
  uniform vec3 uCenter;
  varying vec2 vC;
  varying vec3 vW;
  varying float vSnow;
  void main() {
    float w = aCorner.z;
    float total = uRain + uSnow;
    // each drop is rain or snow; while one fades into the other both fall
    float isSnow = step(fract(w * 7.31), uSnow / max(total, 1e-5));
    float scale = uBox / 120.0;
    float speed = mix(11.0, 1.3, isSnow) * scale;
    float slant = mix(0.12, 0.3, isSnow);  // wind from the west
    vec3 p = position * (2.0 * uBox);
    p.y -= uTime * speed;
    p.x += uTime * speed * slant + isSnow * sin(uTime * 0.9 + w * 40.0) * 1.5 * scale;
    vec3 wp = mod(p - uCenter + uBox, 2.0 * uBox) + uCenter - uBox;
    // keep drops a readable size on screen at any distance
    float d = length(wp - cameraPosition);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 streak = normalize(vec3(-slant, 1.0, 0.0));
    vec3 off = isSnow > 0.5
      ? (right * aCorner.x + camUp * (aCorner.y * 2.0 - 1.0)) * max(0.2 * scale, d * 0.0028)
      : right * aCorner.x * max(0.03 * scale, d * 0.0011) + streak * aCorner.y * max(1.1 * scale, d * 0.022);
    vC = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
    vW = wp;
    vSnow = isSnow;
    // drops beyond the current amount are moved outside the clip volume
    gl_Position = w < total ? projectionMatrix * viewMatrix * vec4(wp + off, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform vec2 uBounds;
  uniform vec3 uRainCol, uSnowCol;
  varying vec2 vC;
  varying vec3 vW;
  varying float vSnow;
  layout(location = 1) out highp vec4 gInk; // normal attachment of the low tier's colour pass (post.ts)
  void main() {
    gInk = vec4(0.0); // blended away: no ink lines
    if (abs(vW.x) > uBounds.x || abs(vW.z) > uBounds.y) discard; // stay over the diorama
    float a = vSnow > 0.5
      ? (1.0 - smoothstep(0.35, 1.0, length(vC))) * 0.95
      : (1.0 - abs(vC.x)) * smoothstep(-1.0, 0.4, vC.y) * 0.45;
    gl_FragColor = vec4(vSnow > 0.5 ? uSnowCol : uRainCol, a);
    #include <colorspace_fragment>
  }`;

export function createPrecip(bounds: Bounds, count: number) {
  const rnd = mulberry32(2611);
  // per vertex: position = the drop's random place in the box (0..1), aCorner = (corner, random)
  const pos = new Float32Array(count * 4 * 3), corner = new Float32Array(count * 4 * 3);
  const index = new Uint32Array(count * 6);
  const C = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  for (let i = 0; i < count; i++) {
    const x = rnd(), y = rnd(), z = rnd(), w = rnd();
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set([x, y, z], v * 3);
      corner.set([C[k][0], C[k][1], w], v * 3);
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));

  const uniforms = {
    uTime: { value: 0 },
    uBox: { value: 100 },
    uRain: { value: 0 },
    uSnow: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBounds: { value: new THREE.Vector2(bounds.hw, bounds.hh) },
    uRainCol: { value: new THREE.Color('#c9d3e2') },
    uSnowCol: { value: new THREE.Color('#ffffff') },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;

  const center = new THREE.Vector3();
  return {
    mesh,
    /** amounts 0…1 */
    set(rain: number, snow: number): void {
      uniforms.uRain.value = rain;
      uniforms.uSnow.value = snow;
      mesh.visible = rain + snow > 0.001;
    },
    /** drop colours follow the light (darker at night) */
    setColors(rain: THREE.Color, snow: THREE.Color): void {
      uniforms.uRainCol.value.copy(rain);
      uniforms.uSnowCol.value.copy(snow);
    },
    /** follow the camera; time only advances while the scene is live */
    update(dt: number, camera: THREE.Camera, target: THREE.Vector3): void {
      if (!mesh.visible) return;
      uniforms.uTime.value += dt;
      const dist = camera.position.distanceTo(target);
      center.copy(camera.position).lerp(target, 0.35);
      uniforms.uCenter.value.copy(center);
      uniforms.uBox.value = THREE.MathUtils.clamp(dist * 0.4, 50, 3000);
    },
  };
}

export type Precip = ReturnType<typeof createPrecip>;
