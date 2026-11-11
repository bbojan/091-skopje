import * as THREE from 'three';
import { ringArea, rowCrossings, toPts } from './geo.ts';
import { glowTexture } from './sky.ts';
import { SHARED } from './city.ts';
import { createWater, type WaterTarget } from './water.ts';
import type { Terrain } from './terrain.ts';
import type { AreaData, Bounds, BuildingData } from './types.ts';

// Firefighting with the Air Tractor: at most two fires burn at a time — a patch of
// forest, a building's roof or a city bus. Water dropped on a fire shrinks it; when one
// is out, another starts somewhere else. The tank is refilled by skimming the Vardar.
// Flames, smoke and glow are see-through quads animated on the GPU from a few uniforms
// per fire; they draw no ink lines (InkRenderer.skipNormal, gInk = 0 in the single pass).

export type FireKind = 'forest' | 'building' | 'bus';
const MAX_BURNING = 2;
const SCOOP_AGL = 17;        // skim lower than this over water to fill the tank
/** Lowest flying height over water in this mode, so the floats can touch it. */
export const WATER_FLOOR = 5;

/** A city bus from the traffic that stops and burns. */
export interface BusHooks {
  hold(ok: (x: number, z: number) => boolean): { id: number; x: number; z: number; double: boolean } | null;
  release(id: number): void;
}

export interface FireOptions {
  terrain: Terrain;
  bounds: Bounds;
  areas: AreaData[];
  buildings: BuildingData[];
  bus: BusHooks;
  /** fewer particles (phones) */
  light?: boolean;
  /** a fire was put out */
  onOut?: (kind: FireKind) => void;
}

// ---------------------------------------------------------------- shaders
const INK = /* glsl */ `layout(location = 1) out highp vec4 gInk; // normal attachment of the single colour pass (post.ts)`;

// Flames: tongues standing on a disc, drawn as flat tones like the rest of the map;
// a fifth of the quads are embers rising above them.
const FLAME_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime, uR, uH;
  uniform vec3 uPos;
  uniform vec2 uSlope;
  varying vec2 vUv;
  varying float vSeed, vEmber, vLife;
  void main() {
    float ang = aSeed.x * 6.2832, rad = sqrt(aSeed.y) * uR;
    vec2 off = vec2(cos(ang), sin(ang)) * rad;
    vec3 base = uPos + vec3(off.x, dot(uSlope, off), off.y);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    float ember = step(0.8, aSeed.w);
    vec3 wp;
    vLife = 0.0;
    if (ember > 0.5) {
      float ph = fract(uTime * (0.22 + 0.3 * aSeed.z) + aSeed.x * 9.0);
      vec3 c = base + vec3(sin(ph * 9.0 + aSeed.y * 30.0) * 0.2 * uH + ph * uH * 1.1, ph * uH * 3.0, cos(ph * 7.0 + aSeed.x * 30.0) * 0.2 * uH);
      vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float s = max((0.3 + 0.4 * aSeed.y) * (1.0 - ph), length(cameraPosition - c) * 0.0014) * step(0.05, uH);
      wp = c + (right * position.x + camUp * (position.y * 2.0 - 1.0)) * s;
      vLife = ph;
    } else {
      // taller in the middle of the fire
      float h = uH * (0.45 + 0.75 * aSeed.z) * (1.0 - 0.5 * aSeed.y);
      wp = base + right * position.x * h * 0.36 + vec3(0.0, position.y * h, 0.0);
    }
    vUv = position.xy;
    vSeed = aSeed.w * 37.0 + aSeed.x * 11.0;
    vEmber = ember;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const FLAME_FRAG = /* glsl */ `
  uniform float uTime, uHot;
  uniform vec3 uCore, uMid, uRim, uTip;
  varying vec2 vUv;
  varying float vSeed, vEmber, vLife;
  ${INK}
  void main() {
    gInk = vec4(0.0);
    vec3 col;
    float a;
    if (vEmber > 0.5) {
      a = (1.0 - smoothstep(0.45, 1.0, length(vec2(vUv.x, vUv.y * 2.0 - 1.0)))) * (1.0 - vLife);
      col = mix(uMid, uRim, vLife);
    } else {
      float y = vUv.y, t = uTime * (2.2 + fract(vSeed) * 1.3);
      // the tongue wriggles more toward its tip and flickers in height
      float x = vUv.x + (sin(y * 5.0 - t * 2.3 + vSeed) * 0.24 + sin(y * 11.0 - t * 3.7 + vSeed * 1.7) * 0.1) * y;
      float yy = y / (0.8 + 0.2 * sin(t * 1.9 + vSeed * 3.0));
      float width = pow(max(1.0 - yy, 0.0), 0.65) * (0.32 + 0.68 * smoothstep(0.0, 0.2, yy)); // teardrop
      float d = abs(x) / max(width, 1e-3);
      a = step(yy, 1.0) * (1.0 - smoothstep(0.84, 1.0, d));
      float heat = (1.0 - d) * (1.0 - yy * 0.85);
      col = heat > 0.5 ? uCore : heat > 0.25 ? uMid : heat > 0.09 ? uRim : uTip;
    }
    if (a < 0.02) discard;
    gl_FragColor = vec4(col * uHot, a);
    #include <colorspace_fragment>
  }`;

// Smoke: puffs that rise from the fire, lean with the west wind (like the rain) and grow.
// A puff exists only if it left the fire between uStart and uStop, so the column grows
// from the ground when a fire starts and lifts away when it is put out.
const SMOKE_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime, uR, uH, uStart, uStop, uScale;
  uniform vec3 uPos;
  uniform vec2 uSlope;
  varying vec2 vC;
  varying float vPh, vSeed, vA;
  void main() {
    float life = 15.0 + 9.0 * aSeed.z;
    float ph = fract(uTime / life + aSeed.w);
    float born = uTime - ph * life;
    float ang = aSeed.x * 6.2832, rad = sqrt(aSeed.y) * uR * 0.7;
    vec2 off = vec2(cos(ang), sin(ang)) * rad;
    float h = (1.0 - pow(1.0 - ph, 1.7)) * uH;      // fast at first, then slower
    vec3 c = uPos + vec3(off.x, dot(uSlope, off) + h, off.y);
    c.x += h * 0.5 + ph * ph * uH * 0.55;           // wind from the west
    c.z += (aSeed.x - 0.5) * h * 0.25;
    c.xz += vec2(sin(uTime * 0.31 + aSeed.w * 40.0), cos(uTime * 0.27 + aSeed.y * 40.0)) * (1.5 + ph * 9.0) * uScale;
    float s = (4.5 + 36.0 * pow(ph, 0.75)) * (0.7 + 0.6 * aSeed.z) * uScale;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vC = vec2(position.x, position.y * 2.0 - 1.0);
    vec3 wp = c + (right * vC.x + up * vC.y) * s;
    float shown = step(uStart, born) * step(born, uStop);
    vPh = ph;
    vSeed = aSeed.w * 23.0 + aSeed.y * 7.0;
    vA = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.62, 1.0, ph));
    gl_Position = shown > 0.5 ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const SMOKE_FRAG = /* glsl */ `
  uniform vec3 uDark, uLight, uFire, uDim;
  uniform float uGlow;
  varying vec2 vC;
  varying float vPh, vSeed, vA;
  ${INK}
  void main() {
    gInk = vec4(0.0);
    // a bumpy round puff with a crisp, drawn edge
    float ang = atan(vC.y, vC.x);
    float r = length(vC) + 0.07 * sin(ang * 5.0 + vSeed * 20.0) + 0.04 * sin(ang * 9.0 - vSeed * 13.0);
    float a = (1.0 - smoothstep(0.76, 0.88, r)) * vA;
    if (a < 0.02) discard;
    // two flat tones: lit from the upper left (the sun is in the west), shaded below
    float lit = step(0.0, dot(vC, vec2(-0.55, 0.83)) + 0.22 * sin(ang * 3.0 + vSeed * 7.0) - 0.1);
    vec3 col = mix(uDark, uLight, smoothstep(0.0, 0.55, vPh)) * mix(0.8, 1.07, lit);
    col = col * uDim + uFire * uGlow * 0.4 * pow(1.0 - vPh, 11.0);   // dark at night, its foot lit by the fire
    gl_FragColor = vec4(col, a * mix(0.9, 0.6, vPh)); // thinner as it rises
    #include <colorspace_fragment>
  }`;

// ---------------------------------------------------------------- where fires can start
const CELL = 16;
const WOOD = 1, WATER = 2, OTHER = 3;

/** Coarse land-cover grid from the area polygons (later areas are drawn over earlier ones). */
function landCover(areas: AreaData[], { hw, hh }: Bounds) {
  const nx = Math.ceil((2 * hw) / CELL), nz = Math.ceil((2 * hh) / CELL);
  const cls = new Uint8Array(nx * nz);
  const xs: number[] = [];
  for (const a of [...areas].sort((p, q) => p.z - q.z)) {
    const c = a.k === 'wood' || a.k === 'scrub' ? WOOD : a.k === 'water' ? WATER : OTHER;
    const poly = a.r.map(toPts);
    let z0 = Infinity, z1 = -Infinity;
    for (const [, z] of poly[0]) { if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const j0 = Math.max(0, Math.ceil((z0 + hh) / CELL - 0.5)), j1 = Math.min(nz - 1, Math.floor((z1 + hh) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) {
      rowCrossings(poly, -hh + (j + 0.5) * CELL, xs);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] + hw) / CELL - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] + hw) / CELL - 0.5));
        for (let i = i0; i <= i1; i++) cls[j * nx + i] = c;
      }
    }
  }
  return { cls, nx, nz };
}

interface Slot {
  flames: THREE.Mesh;
  smoke: THREE.Mesh;
  glow: THREE.Mesh;
  fu: Record<string, THREE.IUniform>;
  su: Record<string, THREE.IUniform>;
  state: 'off' | 'burn' | 'out';
  kind: FireKind;
  x: number; y: number; z: number;
  /** height of the top, for the water */
  top: number;
  /** strength 0…1 and its smoothed value that the picture follows */
  hp: number; show: number;
  /** footprint radius (buildings) */
  rad: number;
  /** seconds without growing after being hit */
  wet: number;
  bus: number;
  stopAt: number;
  /** its burnt patch (index into SHARED.uBurn), -1 = none */
  mark: number;
}

// starting strength, growth per second, water needed (1 = a full tank on a full fire)
const KIND: Record<FireKind, { hp0: number; grow: number; tough: number; pad: number; weight: number }> = {
  forest: { hp0: 0.35, grow: 1 / 85, tough: 1, pad: 9, weight: 0.45 },
  building: { hp0: 0.4, grow: 1 / 100, tough: 0.9, pad: 8, weight: 0.35 },
  bus: { hp0: 0.6, grow: 1 / 220, tough: 0.35, pad: 9, weight: 0.2 },
};
const DAMAGE = 0.03; // strength taken by one packet of water (a full tank is 65 packets; a pass lands about a third of them)

export function createFireMode({ terrain, bounds, areas, buildings, bus, light = false, onOut }: FireOptions) {
  const { hw, hh } = bounds;
  const rnd = Math.random;
  const group = new THREE.Group();
  group.visible = false;

  // ---- places: forest cells well inside a wood, roofs of ordinary taller buildings
  const cover = landCover(areas, bounds);
  const { cls, nx, nz } = cover;
  const EDGE = 750; // keep fires where the plane can pass over them (it turns back near the edge)
  const inside = (x: number, z: number) => Math.abs(x) < hw - EDGE && Math.abs(z) < hh - EDGE;
  const woods: number[] = [];
  for (let j = 2; j < nz - 2; j++)
    for (let i = 2; i < nx - 2; i++) {
      const k = j * nx + i;
      if (cls[k] === WOOD && cls[k - 2] === WOOD && cls[k + 2] === WOOD && cls[k - 2 * nx] === WOOD && cls[k + 2 * nx] === WOOD
        && inside(-hw + (i + 0.5) * CELL, -hh + (j + 0.5) * CELL)) woods.push(k);
    }
  const woodCells = Uint32Array.from(woods);
  const roofs: number[] = []; // x, z, top, radius
  for (const b of buildings) {
    if (b.h < 9 || b.h > 70 || b.w || b.old || b.t === 'fortress') continue; // not houses of worship, the bazaar or Kale
    const ring = toPts(b.r[0]), area = Math.abs(ringArea(ring));
    if (area < 220) continue;
    let x = 0, z = 0, g = 0;
    for (const [px, pz] of ring) { x += px; z += pz; g += terrain.at(px, pz); }
    x /= ring.length; z /= ring.length; g /= ring.length;
    if (inside(x, z)) roofs.push(x, z, g + b.h, THREE.MathUtils.clamp(Math.sqrt(area / Math.PI) * 0.8, 6, 16));
  }
  const roofList = Float32Array.from(roofs);
  const isWater = (x: number, z: number): boolean => {
    const i = Math.floor((x + hw) / CELL), j = Math.floor((z + hh) / CELL);
    if (i < 1 || j < 1 || i >= nx - 1 || j >= nz - 1) return false;
    const k = j * nx + i; // the cell or a neighbour: narrow rivers still count
    return cls[k] === WATER || cls[k - 1] === WATER || cls[k + 1] === WATER || cls[k - nx] === WATER || cls[k + nx] === WATER;
  };

  // ---- visuals: a few slots, each with flames, a smoke column and a glow on the ground
  const N_FLAME = light ? 36 : 64, N_SMOKE = light ? 30 : 52;
  const quad = new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3);
  const seeds = (n: number) => {
    const a = new Float32Array(n * 4);
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    return new THREE.InstancedBufferAttribute(a, 4);
  };
  const flameSeeds = seeds(N_FLAME), smokeSeeds = seeds(N_SMOKE);
  const quads = (seed: THREE.InstancedBufferAttribute, n: number) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', quad);
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aSeed', seed);
    g.instanceCount = n;
    return g;
  };
  const uTime = { value: 0 };
  const night = { hot: { value: 1 }, dim: { value: new THREE.Vector3(1, 1, 1) }, glow: { value: 0 } };
  const C = (hex: string) => ({ value: new THREE.Color(hex) });
  const glowTex = glowTexture();
  const slots: Slot[] = [];
  for (let i = 0; i < 5; i++) {
    const fu = {
      uTime, uHot: night.hot, uPos: { value: new THREE.Vector3() }, uSlope: { value: new THREE.Vector2() }, uR: { value: 1 }, uH: { value: 0 },
      uCore: C('#fff0a8'), uMid: C('#fdc030'), uRim: C('#f0701f'), uTip: C('#c8321c'),
    };
    const su = {
      uTime, uDim: night.dim, uGlow: night.glow, uPos: fu.uPos, uSlope: fu.uSlope, uR: fu.uR, uH: { value: 100 }, uScale: { value: 1 },
      uStart: { value: 0 }, uStop: { value: 0 }, uDark: C('#4a403b'), uLight: C('#cfc8c0'), uFire: C('#ff7a1c'),
    };
    const flames = new THREE.Mesh(quads(flameSeeds, N_FLAME), new THREE.ShaderMaterial({ uniforms: fu, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false }));
    const smoke = new THREE.Mesh(quads(smokeSeeds, N_SMOKE), new THREE.ShaderMaterial({ uniforms: su, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false }));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTex, color: '#ff8a2c', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.renderOrder = 2;
    smoke.renderOrder = 5;
    flames.renderOrder = 6;
    for (const m of [flames, smoke, glow]) { m.frustumCulled = false; m.visible = false; group.add(m); }
    slots.push({ flames, smoke, glow, fu, su, state: 'off', kind: 'forest', x: 0, y: 0, z: 0, top: 0, hp: 0, show: 0, rad: 10, wet: 0, bus: -1, stopAt: 0, mark: -1 });
  }
  // burnt patches: the trees and the ground stay charred where a forest or a bus burned
  // (a tint in the tree and ground shaders, city.ts); the oldest patch makes room for a new one
  const marks = SHARED.uBurn.value;
  let markNext = 0;
  function newMark(x: number, z: number): number {
    for (let k = 0; k < marks.length; k++) {
      const i = (markNext + k) % marks.length;
      if (slots.some((s) => s.state === 'burn' && s.mark === i)) continue; // still growing
      markNext = (i + 1) % marks.length;
      marks[i].set(x, z, 1, 0);
      SHARED.uBurnOn.value = 1;
      return i;
    }
    return -1;
  }
  const water = createWater(terrain, light);
  group.add(water.group);

  // ---- the game
  const st = { on: false, out: 0, flash: '' as '' | 'out' | FireKind, flashT: 0, scooping: false, overWater: false, spawnT: 0 };
  let best = 0;
  try { best = Number(localStorage.getItem('skopje.bestFire')) || 0; } catch { /* storage unavailable */ }
  let time = 0, nightF = 0, rain = 0;
  const burning = () => slots.filter((s) => s.state === 'burn');
  const Y = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();

  /** size of a fire from its strength: radius, flame height, smoke column height and puff size */
  function shape(f: Slot, g: number) {
    if (f.kind === 'forest') return { r: 9 + 21 * g, h: 13 + 17 * g, col: 150 + 230 * g, puff: 0.75 + 0.45 * g }; // above the treetops
    if (f.kind === 'building') return { r: f.rad * (0.55 + 0.45 * g), h: 8 + 11 * g, col: 130 + 200 * g, puff: 0.65 + 0.4 * g };
    return { r: 3.4, h: 5 + 3.5 * g, col: 80 + 60 * g, puff: 0.42 };
  }

  function off(f: Slot): void {
    f.state = 'off';
    f.flames.visible = f.smoke.visible = f.glow.visible = false;
    if (f.bus >= 0) { bus.release(f.bus); f.bus = -1; }
  }

  /** start a fire of this kind somewhere suitable; false if no place was found */
  function ignite(kind: FireKind, plane: THREE.Vector3, yaw: number, first: boolean): boolean {
    const others = burning();
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const ok = (x: number, z: number): boolean => {
      if (!inside(x, z)) return false;
      const dx = x - plane.x, dz = z - plane.z, d = Math.hypot(dx, dz);
      // the first one starts ahead of the plane, later ones anywhere not too near
      if (first ? d < 1100 || d > 2600 || (dx * fx + dz * fz) / d < 0.8 : d < 900 || d > 5500) return false;
      return others.every((o) => Math.hypot(o.x - x, o.z - z) > 1000);
    };
    let x = 0, z = 0, top = 0, rad = 10, id = -1, found = false, tall = 0;
    if (kind === 'bus') {
      const b = bus.hold(ok);
      if (b) { x = b.x; z = b.z; id = b.id; tall = b.double ? 5.4 : 4; found = true; }
    } else {
      for (let k = 0; k < 400 && !found; k++) {
        if (kind === 'forest') {
          if (!woodCells.length) break;
          const c = woodCells[Math.floor(rnd() * woodCells.length)];
          x = -hw + ((c % nx) + 0.5) * CELL; z = -hh + (Math.floor(c / nx) + 0.5) * CELL;
        } else {
          if (!roofList.length) break;
          const o = Math.floor(rnd() * (roofList.length / 4)) * 4;
          x = roofList[o]; z = roofList[o + 1]; top = roofList[o + 2]; rad = roofList[o + 3];
        }
        found = ok(x, z);
      }
    }
    if (!found) return false;
    const f = slots.find((s) => s.state === 'off') ?? slots.filter((s) => s.state === 'out').sort((a, b) => a.stopAt - b.stopAt)[0];
    if (!f) { if (id >= 0) bus.release(id); return false; }
    off(f);
    const g = terrain.at(x, z);
    Object.assign(f, { state: 'burn', kind, x, z, rad, bus: id, hp: KIND[kind].hp0, show: 0, wet: 0, mark: -1 });
    f.mark = kind === 'building' ? -1 : newMark(x, z); // a roof fire leaves the ground alone
    // flames start a little inside what burns; the water has to reach its top
    f.y = kind === 'forest' ? g + 4 : kind === 'building' ? top - 0.6 : g + tall - 1.6;
    f.top = kind === 'forest' ? g + 9 : kind === 'building' ? top : g + tall;
    // forest fires lie on the slope
    const e = 12, sx = kind === 'forest' ? (terrain.at(x + e, z) - terrain.at(x - e, z)) / (2 * e) : 0, sz = kind === 'forest' ? (terrain.at(x, z + e) - terrain.at(x, z - e)) / (2 * e) : 0;
    (f.fu.uPos.value as THREE.Vector3).set(x, f.y, z);
    (f.fu.uSlope.value as THREE.Vector2).set(sx, sz);
    f.su.uStart.value = time;
    f.su.uStop.value = 1e9;
    // forest smoke is pale, a burning building or bus smokes black
    (f.su.uDark.value as THREE.Color).set(kind === 'forest' ? '#6b5f57' : '#3a3330');
    (f.su.uLight.value as THREE.Color).set(kind === 'forest' ? '#e4ded6' : kind === 'building' ? '#a39b94' : '#857e78');
    f.glow.position.set(x, f.y + (kind === 'forest' ? 1.5 : 0.9), z);
    f.glow.quaternion.setFromUnitVectors(Y, nrm.set(-sx, 1, -sz).normalize());
    f.flames.visible = f.smoke.visible = f.glow.visible = true;
    st.flash = kind;
    st.flashT = 3;
    return true;
  }
  function spawn(plane: THREE.Vector3, yaw: number, first = false): void {
    // a weighted choice first, then whatever kind has room
    let r = rnd();
    const order = (Object.keys(KIND) as FireKind[]).sort((a, b) => KIND[b].weight - KIND[a].weight);
    const pick = order.find((k) => (r -= KIND[k].weight) <= 0) ?? 'forest';
    for (const kind of [pick, ...order.filter((k) => k !== pick)]) if (ignite(kind, plane, yaw, first)) return;
    if (first) spawn(plane, yaw); // nothing straight ahead: anywhere will do
  }

  function hit(id: number): void {
    const f = slots[id];
    if (f.state !== 'burn') return;
    f.hp -= DAMAGE / KIND[f.kind].tough;
    f.wet = 5;
    if (f.hp > 0.03) return;
    // out: the flames die, the smoke lifts away, steam rises
    f.state = 'out';
    f.hp = 0;
    f.stopAt = time;
    f.su.uStop.value = time;
    water.steam(f.x, f.top, f.z, shape(f, f.show).r);
    st.out++;
    if (st.out > best) { best = st.out; try { localStorage.setItem('skopje.bestFire', String(best)); } catch { /* storage unavailable */ } }
    st.flash = 'out';
    st.flashT = 3;
    st.spawnT = 5 + rnd() * 5;
    onOut?.(f.kind);
  }

  function start(plane: THREE.Vector3, yaw: number): void {
    stop();
    st.on = true;
    st.out = 0;
    group.visible = true;
    water.reset();
    spawn(plane, yaw, true);
    st.spawnT = 16;
  }
  function stop(): void {
    st.on = false;
    st.flash = '';
    st.scooping = st.overWater = false;
    slots.forEach(off);
    for (const m of marks) m.w = 0; // the map is as it was
    SHARED.uBurnOn.value = 0;
    group.visible = false;
  }

  const targets: WaterTarget[] = [];
  function update(dt: number, plane: THREE.Vector3, vel: THREE.Vector3, yaw: number, dropping: boolean): void {
    if (!st.on) return;
    time += dt;
    uTime.value = time;
    if (st.flashT > 0 && (st.flashT -= dt) <= 0) st.flash = '';
    // a new fire when fewer than two burn
    if (burning().length < MAX_BURNING && (st.spawnT -= dt) <= 0) { spawn(plane, yaw); st.spawnT = 6 + rnd() * 5; }

    targets.length = 0;
    slots.forEach((f, id) => {
      if (f.state === 'off') return;
      if (f.state === 'burn') {
        f.wet -= dt;
        if (f.wet <= 0) f.hp = Math.min(1, f.hp + dt * KIND[f.kind].grow * (1 - 0.6 * rain)); // rain slows it
      } else if (time - f.stopAt > 26) { off(f); return; } // the last smoke has gone
      else if (f.bus >= 0 && time - f.stopAt > 6) { bus.release(f.bus); f.bus = -1; } // the bus drives on
      f.show += (f.hp - f.show) * (1 - Math.exp(-dt * 2.5));
      const s = shape(f, f.show), alive = f.state === 'burn' ? 1 : Math.max(0, 1 - (time - f.stopAt) / 0.8);
      f.fu.uR.value = s.r;
      f.fu.uH.value = s.h * alive;
      f.su.uH.value = s.col;
      f.su.uScale.value = s.puff;
      f.flames.visible = alive > 0;
      f.glow.visible = alive > 0;
      f.glow.scale.setScalar(s.r * 5 + 14);
      (f.glow.material as THREE.MeshBasicMaterial).opacity = (0.22 + 0.6 * nightF) * alive * (0.9 + 0.1 * Math.sin(time * 11 + id));
      if (f.state === 'burn') {
        targets.push({ id, x: f.x, y: f.top, z: f.z, r: s.r + KIND[f.kind].pad });
        // the patch chars over a few seconds and is as wide as the fire ever was
        const m = f.mark >= 0 ? marks[f.mark] : null;
        if (m) { m.z = Math.max(m.z, f.kind === 'bus' ? 7 : s.r * 1.1); m.w = Math.min(1, m.w + dt / 10); }
      }
    });

    // tank: skim low over water to fill it
    st.overWater = isWater(plane.x, plane.z);
    st.scooping = st.overWater && water.tank < 1 && plane.y - terrain.at(plane.x, plane.z) < SCOOP_AGL;
    if (st.scooping) water.scoop(dt, plane, vel);
    water.update(dt, plane, vel, dropping, targets, hit);
  }

  return {
    group, start, stop, update, isWater,
    /** start a fire of one kind now (for trying things out from the console) */
    ignite: (kind: FireKind, plane: THREE.Vector3, yaw: number): boolean => ignite(kind, plane, yaw, false),
    /** flames glow and smoke darkens at night */
    setNight(f: number): void {
      nightF = f;
      night.hot.value = 1 + 0.15 * f;
      night.dim.value.set(1 - 0.93 * f, 1 - 0.92 * f, 1 - 0.86 * f); // smoke is a dark blue shape against the night
      night.glow.value = f;
      water.setNight(f);
    },
    /** rain amount 0…1: fires grow more slowly */
    setRain(r: number): void { rain = r; },
    get on(): boolean { return st.on; },
    get state() {
      const n = burning();
      return { out: st.out, best, tank: water.tank, falling: water.falling, aimY: water.aimY, scooping: st.scooping, overWater: st.overWater, flash: st.flash, fires: n };
    },
  };
}

export type FireMode = ReturnType<typeof createFireMode>;
