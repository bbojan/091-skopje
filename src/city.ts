import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, toPts, ringArea, obb, pipPoly, PolyGrid, SegGrid, PointHash, rowCrossings, bbox, type Box, type OBB } from './geo.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Poly, Pt, Ring, Vec3 } from './types.ts';

const C = (h: THREE.ColorRepresentation) => new THREE.Color(h);
const pick = <T,>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];

// ---------------------------------------------------------------- palette
export const PAL = {
  paper: '#f2e8d8',
  ground: '#eadbc4',
  hill: '#d3d49c',
  slabSide: '#c7a983',
  slabDark: '#a98d6c',
  area: {
    campus: '#ecdcc2', fortress: '#e6d3a0', dirt: '#e3cb9f', cemetery: '#b8d08a',
    grass: '#a8d26a', scrub: '#b4cf72', park: '#a5d167', wood: '#8fc35a', play: '#ead0a4',
    parking: '#dcd2d0', plaza: '#f3e6d6', pitch: '#7fc35a', clay: '#d5764d', court: '#5ea7c9',
    water: '#86c4d4', pool: '#71d3e6',
  } as Record<string, string>,
  road: { casing: '#f5eee7', major: '#c9c0cd', minor: '#d3cbd4', service: '#ddd6da', ped: '#f2e3d2', path: '#eedcb8', rail: '#b6aab0' } as Record<RoadKind | 'casing' | 'rail', string>,
  facade: ['#f4e9d8', '#f6f1e9', '#efdcc0', '#f1d6b9', '#f0e3b5', '#eed2c8', '#e7e1da', '#ead8c4', '#f3e2cc', '#f7efe2', '#e2dde6'],
  facadeOld: ['#f1e3cb', '#f4ead9', '#ead5b6', '#efdcc2', '#f5eee3', '#ecd7bd'],
  facadeTall: ['#e6e3e6', '#dfe6ea', '#ece7e0', '#f0ebe3', '#d8dde6'],
  tile: ['#d8643c', '#cf5a35', '#e0754a', '#c8532f', '#d96a45', '#e27f55'],
  tileOld: ['#c95a36', '#d4693f', '#bf5232', '#d8714a', '#c4603c'],
  flatRoof: ['#ebe4da', '#e0d8cf', '#e7ddd0', '#dbd5cf', '#efe8de', '#e3dbd2'],
  roofBits: ['#f6f3ee', '#d4cfca', '#e5ded4', '#c9c6c6', '#ece6dc'],
  roofGreen: ['#8cc65a', '#7dbb50', '#9ccf66'],
  industrial: ['#ddd8d2', '#d6d2cf', '#e4ded5', '#cfd3d6'],
  industrialRoof: ['#cdc9c6', '#c4c2c2', '#d3cec8'],
  shed: ['#cf6a45', '#bfb7ad', '#d8774f', '#a9a39b'],
  dome: '#a8a6b6', minaret: '#f5f0e8', lead: '#8f8ea3', stone: '#e8d3aa',
  trees: ['#5fae3d', '#6dbb45', '#4f9d38', '#7cc24e', '#589f3c', '#68b443', '#83c656'],
  forest: ['#4f9a39', '#5aa53e', '#468f35', '#62ab42', '#3f8733'],
  cypress: ['#3f8239', '#376f34', '#468a3c'],
};

// ---------------------------------------------------------------- mesh builder
// growable Float32 buffer (4 bytes/value instead of 8+ for JS arrays)
class FBuf {
  a = new Float32Array(1024);
  n = 0;
  reserve(k: number): void {
    if (this.n + k <= this.a.length) return;
    let L = this.a.length * 2;
    while (L < this.n + k) L *= 2;
    const b = new Float32Array(L);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  take(): Float32Array { const r = this.a.slice(0, this.n); this.a = new Float32Array(0); return r; }
}
const ITEM: Record<string, number> = { position: 3, normal: 3, color: 3, aFacade: 4, uv: 2 };
/** Geometry as plain typed arrays (attribute name → array, optional index). */
export interface GeoData { a: Record<string, THREE.TypedArray>; index?: THREE.TypedArray | null }
// geometry <-> plain data (typed arrays only)
function dataFromGeo(g: THREE.BufferGeometry): GeoData {
  const a: Record<string, THREE.TypedArray> = {};
  for (const k in g.attributes) a[k] = g.attributes[k].array;
  return { a, index: g.index ? g.index.array : null };
}
function geoFromData(d: GeoData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const k in d.a) g.setAttribute(k, new THREE.BufferAttribute(d.a[k], ITEM[k]));
  if (d.index) g.setIndex(new THREE.BufferAttribute(d.index, 1));
  g.computeBoundingSphere();
  return freeOnUpload(g);
}
// all ArrayBuffers inside a city description (for zero-copy postMessage)
export function transferables(obj: unknown, out = new Set<ArrayBufferLike>()): Set<ArrayBufferLike> {
  if (!obj || typeof obj !== 'object') return out;
  if (ArrayBuffer.isView(obj)) { out.add(obj.buffer); return out; }
  for (const v of Object.values(obj)) transferables(v, out);
  return out;
}

// drop the CPU copy once the GPU has the data
// (three.js types the array as always present; after upload it is deliberately null)
function dropArray(this: { array: unknown }): void { this.array = null; }
function freeOnUpload(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const attr of Object.values(geo.attributes)) if (attr instanceof THREE.BufferAttribute) attr.onUpload(dropArray);
  if (geo.index) geo.index.onUpload(dropArray);
  return geo;
}

/** Per-vertex facade attribute: [u along wall, v up, wall top, style] (style < 0: none, −2: roof tiles). */
type Fac = readonly [number, number, number, number];

class Builder {
  p = new FBuf(); n = new FBuf(); c = new FBuf();
  f: FBuf | null;
  /** added to every y (buildings sit on the terrain) */
  yOff = 0;
  constructor(facade = false) {
    this.f = facade ? new FBuf() : null;
  }
  // triangle with normal hint; flips winding to face `hint`
  tri(a: Vec3, b: Vec3, c: Vec3, col: THREE.Color, hint: Vec3, fa?: Fac | null, fb?: Fac | null, fc?: Fac | null, normals?: Vec3[] | null): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      [b, c] = [c, b]; [fb, fc] = [fc, fb];
      if (normals) normals = [normals[0], normals[2], normals[1]];
      nx = -nx; ny = -ny; nz = -nz;
    }
    const o = this.yOff;
    const P = this.p, N = this.n, Cb = this.c;
    P.reserve(9); N.reserve(9); Cb.reserve(9);
    let i = P.n;
    const pa = P.a;
    pa[i] = a[0]; pa[i + 1] = a[1] + o; pa[i + 2] = a[2];
    pa[i + 3] = b[0]; pa[i + 4] = b[1] + o; pa[i + 5] = b[2];
    pa[i + 6] = c[0]; pa[i + 7] = c[1] + o; pa[i + 8] = c[2];
    P.n += 9;
    const na = N.a;
    i = N.n;
    if (normals) for (let k = 0; k < 3; k++) { na[i + k * 3] = normals[k][0]; na[i + k * 3 + 1] = normals[k][1]; na[i + k * 3 + 2] = normals[k][2]; }
    else for (let k = 0; k < 3; k++) { na[i + k * 3] = nx; na[i + k * 3 + 1] = ny; na[i + k * 3 + 2] = nz; }
    N.n += 9;
    const ca = Cb.a;
    i = Cb.n;
    for (let k = 0; k < 3; k++) { ca[i + k * 3] = col.r; ca[i + k * 3 + 1] = col.g; ca[i + k * 3 + 2] = col.b; }
    Cb.n += 9;
    if (this.f) {
      const F = this.f;
      F.reserve(12);
      const fa2 = F.a;
      i = F.n;
      const A = fa || NO, B = fb || NO, Cc = fc || NO;
      for (let k = 0; k < 4; k++) { fa2[i + k] = A[k]; fa2[i + 4 + k] = B[k]; fa2[i + 8 + k] = Cc[k]; }
      F.n += 12;
    }
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, col: THREE.Color, hint: Vec3, fa?: Fac | null, fb?: Fac | null, fc?: Fac | null, fd?: Fac | null): void {
    this.tri(a, b, c, col, hint, fa, fb, fc);
    this.tri(a, c, d, col, hint, fa, fc, fd);
  }
  polygon(poly: Poly, y: number, col: THREE.Color, fac: Fac | null = null): void {
    const contour = poly[0].map(([x, z]) => new THREE.Vector2(x, z));
    const holes = poly.slice(1).map((r) => r.map(([x, z]) => new THREE.Vector2(x, z)));
    let faces: number[][];
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { return; }
    const all = [contour, ...holes].flat();
    for (const [i, j, k] of faces) {
      const A = all[i], B = all[j], Cc = all[k];
      this.tri([A.x, y, A.y], [B.x, y, B.y], [Cc.x, y, Cc.y], col, UP, fac, fac, fac);
    }
  }
  box(cx: number, cz: number, y0: number, sx: number, sz: number, sy: number, ang: number, col: THREE.Color, fac: Fac | null = null, topCol: THREE.Color | null = null): void {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u: number, v: number, y: number): Vec3 => [cx + u * ca - v * sa, y, cz + u * sa + v * ca];
    const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const c: Pt[] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = c[i], [u1, v1] = c[(i + 1) % 4];
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
      const hint: Vec3 = [mu * ca - mv * sa, 0, mu * sa + mv * ca];
      this.quad(P(u0, v0, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v0, y1), col, hint, fac, fac, fac, fac);
    }
    this.quad(P(-hx, -hz, y1), P(hx, -hz, y1), P(hx, hz, y1), P(-hx, hz, y1), topCol || col, UP, fac, fac, fac, fac);
  }
  geometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, col: THREE.Color): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 9) {
      const a: Vec3 = [p[i], p[i + 1], p[i + 2]], b: Vec3 = [p[i + 3], p[i + 4], p[i + 5]], c: Vec3 = [p[i + 6], p[i + 7], p[i + 8]];
      const na: Vec3 = [n[i], n[i + 1], n[i + 2]], nb: Vec3 = [n[i + 3], n[i + 4], n[i + 5]], nc: Vec3 = [n[i + 6], n[i + 7], n[i + 8]];
      const hint: Vec3 = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
      this.tri(a, b, c, col, hint, null, null, null, [na, nb, nc]);
    }
  }
  get empty(): boolean { return this.p.n === 0; }
  // plain typed arrays, so the build can run in a worker and transfer them
  build(): GeoData {
    const a: Record<string, Float32Array> = { position: this.p.take(), normal: this.n.take(), color: this.c.take() };
    if (this.f) a.aFacade = this.f.take();
    return { a };
  }
}
const NO: Fac = [0, 0, 0, -1];
const UP: Vec3 = [0, 1, 0];

// Inward offset of a ring by d (miter joins); null if it degenerates
function insetRing(ring: Ring, d: number): Ring | null {
  const n = ring.length, sgn = Math.sign(ringArea(ring));
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
    const d1x = p1[0] - p0[0], d1z = p1[1] - p0[1], l1 = Math.hypot(d1x, d1z);
    const d2x = p2[0] - p1[0], d2z = p2[1] - p1[1], l2 = Math.hypot(d2x, d2z);
    if (l1 < 0.05 || l2 < 0.05) return null;
    const n1x = (-d1z / l1) * sgn, n1z = (d1x / l1) * sgn, n2x = (-d2z / l2) * sgn, n2z = (d2x / l2) * sgn;
    const den = 1 + n1x * n2x + n1z * n2z;
    if (den < 0.35) return null;
    const q: Pt = [p1[0] + ((n1x + n2x) * d) / den, p1[1] + ((n1z + n2z) * d) / den];
    out.push(q);
  }
  if (!out.every(([x, z]) => pipPoly(x, z, [ring]))) return null;
  return out;
}

export function carGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(4.2, 1.15, 1.85).translate(0, 0.95, 0);
  const cabin = new THREE.BoxGeometry(2.3, 0.75, 1.65).translate(-0.25, 1.9, 0);
  return mergeGeometries([body, cabin]);
}
export const CAR_COLORS = ['#f6f3ee', '#f6f3ee', '#d9d4cf', '#e04b3c', '#3a6fb5', '#2f3540', '#f2c84b', '#8fb8cf', '#b8bcc4', '#5aa36a'];

// ---------------------------------------------------------------- materials
// shared, animated uniforms (time of day, clock) used by several materials
export const SHARED = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  // weather (all zero in clear weather: the weather code paths are skipped)
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uSnowLine: { value: -1000 },
  uPuddle: { value: new THREE.Vector3(0.6, 0.65, 0.72) },
};

// ---------------------------------------------------------------- weather in the ground shader
// Road colours (linear), to keep roads as dark slush instead of white under snow.
// Draped roads carry their exact palette colour, so a tight match is reliable.
const ROAD_LIN = Object.values(PAL.road).map((h) => { const c = C(h); return new THREE.Vector3(c.r, c.g, c.b); });
const WX_NOISE = /* glsl */ `
  float wxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wxNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wxHash(i), wxHash(i + vec2(1.0, 0.0)), f.x), mix(wxHash(i + vec2(0.0, 1.0)), wxHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;
// expects: raw (colour before weather), wm (water mask), vWPos, vNy
const WX_GROUND = /* glsl */ `
  if (uWet > 0.0 || uSnow > 0.0) {
    float road = 0.0;
    for (int i = 0; i < ${ROAD_LIN.length}; i++) road = max(road, 1.0 - smoothstep(0.004, 0.02, distance(raw, uRoad[i])));
    float dry = 1.0 - wm;
    vec2 q = vWPos.xz;
    float n1 = wxNoise(q * 0.045), n2 = wxNoise(q * 0.21 + 17.0);
    if (uWet > 0.0) {
      float wet = uWet * dry;
      diffuseColor.rgb *= 1.0 - wet * mix(0.16, 0.3, road);
      // puddles mirror the grey sky (mostly on roads and flat ground), with rain rings
      float pud = smoothstep(0.62, 0.78, n1 * 0.7 + n2 * 0.3) * smoothstep(0.9, 0.98, vNy) * mix(0.35, 1.0, road);
      float ring = 0.5 + 0.5 * sin(length(fract(q * 0.35) - 0.5) * 38.0 - uTime * 7.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, uPuddle, pud * wet * (0.55 + 0.15 * ring));
    }
    if (uSnow > 0.0) {
      float alt = smoothstep(uSnowLine - 30.0, uSnowLine + 30.0, vWPos.y + (n1 - 0.5) * 60.0);
      float flatness = smoothstep(0.35, 0.8, vNy);
      float sn = uSnow * dry * alt * mix(0.55, 1.0, flatness) * mix(1.0, 0.3, road);
      vec3 snowCol = mix(vec3(0.80, 0.85, 0.95), vec3(0.97, 0.97, 0.99), flatness);
      diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, sn);
    }
  }`;
// gentle moving glints on water (detected by its palette colour)
const WATER_GLINT = /* glsl */ `
  if (wm > 0.0) {
    vec2 p = vWPos.xz;
    float fw = clamp(length(fwidth(p)) * 0.08, 0.0, 1.0);
    // long streaks along the river's length (the Vardar runs west → east),
    // sliding downstream; narrow across the current
    float along = sin(p.x * 0.034 - uTime * 0.9 + sin(p.y * 0.045) * 1.6);
    float across = sin(p.y * 0.45 + sin(p.x * 0.012) * 2.2);
    float w1 = along * across;
    float w2 = sin(p.x * 0.012 - uTime * 0.25 + p.y * 0.01);
    float glint = smoothstep(0.5, 0.92, w1) * (1.0 - fw);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.95, 1.0), glint * 0.42 * wm);
    diffuseColor.rgb *= 1.0 - wm * 0.06 * w2;
  }`;

/** Ground materials: weather (wet, puddles, snow) and, for the near ground, water glints. */
function groundShader(sh: THREE.WebGLProgramParametersWithUniforms, water: boolean): void {
  sh.uniforms.uTime = SHARED.uTime;
  sh.uniforms.uWet = SHARED.uWet;
  sh.uniforms.uSnow = SHARED.uSnow;
  sh.uniforms.uSnowLine = SHARED.uSnowLine;
  sh.uniforms.uPuddle = SHARED.uPuddle;
  sh.uniforms.uRoad = { value: ROAD_LIN };
  const waterLin = C(PAL.area.water), poolLin = C(PAL.area.pool);
  sh.uniforms.uWater = { value: new THREE.Vector3(waterLin.r, waterLin.g, waterLin.b) };
  sh.uniforms.uPool = { value: new THREE.Vector3(poolLin.r, poolLin.g, poolLin.b) };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying float vNy;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = position;\nvNy = normal.y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vWPos;
      varying float vNy;
      uniform float uTime, uWet, uSnow, uSnowLine;
      uniform vec3 uWater, uPool, uPuddle;
      uniform vec3 uRoad[${ROAD_LIN.length}];
      ${WX_NOISE}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 raw = diffuseColor.rgb;
      float wm = ${water ? '1.0 - smoothstep(0.012, 0.045, min(distance(raw, uWater), distance(raw, uPool)))' : '0.0'};
      ${WX_GROUND}
      ${water ? WATER_GLINT : ''}`);
}

function facadeMaterial(clippingPlanes?: THREE.Plane[]): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes, shadowSide: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = SHARED.uNight;
    sh.uniforms.uWet = SHARED.uWet;
    sh.uniforms.uSnow = SHARED.uSnow;
    sh.uniforms.uSnowLine = SHARED.uSnowLine;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFacade;\nvarying vec4 vFacade;\nvarying float vSnowY;\nvarying float vSnowN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = aFacade;\nvSnowY = position.y;\nvSnowN = normal.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vFacade;\nvarying float vSnowY;\nvarying float vSnowN;\nuniform float uWet, uSnow, uSnowLine;\nuniform float uNight;\nfloat gWin = 0.0;\nvec3 gWinCol = vec3(0.0);\nfloat h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace('#include <opaque_fragment>', 'outgoingLight += gWinCol * gWin * uNight;\n#include <opaque_fragment>')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        if (vFacade.w >= 1.0) {
          float levels = floor(vFacade.w);
          float rs = fract(vFacade.w);
          float u = vFacade.x, v = vFacade.y, top = vFacade.z;
          float fh = max(top / levels, 2.6);
          float bay = mix(2.7, 4.0, rs);
          float fu = u / bay;
          float fl = v / fh;
          float fi = floor(fl);
          float fv = fract(fl);
          vec2 aa = max(fwidth(vec2(fu, fl)), vec2(1e-4));
          float cu = fract(fu);
          float ww = mix(0.24, 0.36, fract(rs * 7.31));
          bool shop = levels >= 3.0 && fi < 1.0;
          if (shop) ww = 0.44;
          float wx = smoothstep(0.5 - ww - aa.x, 0.5 - ww + aa.x, cu) * (1.0 - smoothstep(0.5 + ww - aa.x, 0.5 + ww + aa.x, cu));
          float y0 = shop ? 0.08 : 0.30, y1 = shop ? 0.78 : 0.82;
          float wy = smoothstep(y0 - aa.y, y0 + aa.y, fv) * (1.0 - smoothstep(y1 - aa.y, y1 + aa.y, fv));
          float inside = step(v, top - 0.45) * step(0.6, v);
          float win = wx * wy * inside;
          float detail = 1.0 - smoothstep(0.25, 0.6, max(aa.x, aa.y));
          // night: a random share of windows glow warm; far away it averages out
          float cellH = h21(vec2(floor(fu) + rs * 91.0, fi + rs * 37.0));
          float lit = step(cellH, shop ? 0.8 : 0.45);
          gWin = mix(0.12 * inside, win * lit, detail) * (shop ? 1.5 : 1.0);
          gWinCol = mix(vec3(1.0, 0.62, 0.26), vec3(1.0, 0.82, 0.5), h21(vec2(cellH, rs))) * 1.15;
          vec3 glass = shop ? vec3(0.22, 0.27, 0.36) : mix(vec3(0.26, 0.32, 0.44), vec3(0.40, 0.36, 0.33), step(0.6, fract(rs * 3.7)));
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.78 * detail);
          diffuseColor.rgb *= 1.0 - win * 0.12 * (1.0 - detail);
          // shutters on older low buildings
          float shut = step(0.5, fract(rs * 5.3)) * step(levels, 4.0) * (1.0 - float(shop));
          float sx = smoothstep(0.5 - ww - 0.13 - aa.x, 0.5 - ww - 0.13 + aa.x, cu) * (1.0 - smoothstep(0.5 - ww - aa.x, 0.5 - ww + aa.x, cu))
                   + smoothstep(0.5 + ww - aa.x, 0.5 + ww + aa.x, cu) * (1.0 - smoothstep(0.5 + ww + 0.13 - aa.x, 0.5 + ww + 0.13 + aa.x, cu));
          vec3 shutCol = mix(vec3(0.20, 0.38, 0.30), vec3(0.45, 0.22, 0.14), step(0.5, fract(rs * 11.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, shutCol, shut * sx * wy * inside * 0.75 * detail);
          // balcony slab lines on some buildings
          float hasBalc = step(0.55, fract(rs * 13.17)) * step(1.0, fi) * inside;
          float bl = smoothstep(0.02 - aa.y, 0.02, fv) * (1.0 - smoothstep(0.09, 0.09 + aa.y, fv));
          diffuseColor.rgb *= 1.0 - hasBalc * bl * 0.22 * detail;
          // cornice band under the roofline
          float cb = smoothstep(top - 0.42 - aa.y * fh, top - 0.42, v) * (1.0 - smoothstep(top - 0.02, top, v));
          float cl = smoothstep(top - 0.50 - aa.y * fh, top - 0.50, v) * (1.0 - smoothstep(top - 0.42, top - 0.42 + aa.y * fh, v));
          diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.08 + 0.03, vec3(1.0)), cb * detail);
          diffuseColor.rgb *= 1.0 - cl * 0.18 * detail;
          // striped shop awnings above ground-floor windows
          float hasAwn = step(0.45, fract(rs * 17.3)) * float(shop);
          float aw = smoothstep(0.80 - aa.y, 0.80, fv) * (1.0 - smoothstep(0.97, 0.97 + aa.y, fv)) * step(fi, 0.5);
          float awx = smoothstep(0.5 - ww - 0.06 - aa.x, 0.5 - ww - 0.06, cu) * (1.0 - smoothstep(0.5 + ww + 0.06, 0.5 + ww + 0.06 + aa.x, cu));
          vec3 awCol = fract(rs * 23.0) < 0.33 ? vec3(0.62, 0.10, 0.07) : fract(rs * 23.0) < 0.66 ? vec3(0.08, 0.33, 0.18) : vec3(0.10, 0.18, 0.42);
          float stripe = step(0.5, fract(u * 1.6));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(awCol, vec3(0.92, 0.88, 0.80), stripe * 0.85), hasAwn * aw * awx * detail);
          // fake ambient occlusion near the ground
          diffuseColor.rgb *= mix(0.80, 1.0, smoothstep(0.0, 3.5, v));
        } else if (vFacade.w < -1.5 && vFacade.w > -2.5) {
          // terracotta roof tiles: courses along the slope + barrel ripples
          vec2 tc = vec2(vFacade.x / 0.26, vFacade.y / 0.40);
          vec2 ta = max(fwidth(tc), vec2(1e-4));
          float tdet = 1.0 - smoothstep(0.3, 0.7, max(ta.x, ta.y));
          float course = fract(tc.y);
          float line = 1.0 - smoothstep(0.0, 0.16 + ta.y, course);
          float barrel = 0.5 + 0.5 * cos(6.2831 * (tc.x + 0.5 * floor(tc.y)));
          diffuseColor.rgb *= 1.0 - tdet * (line * 0.22 + barrel * 0.07);
          diffuseColor.rgb *= 1.0 + tdet * 0.04 * (1.0 - course);
        }
        // weather: snow on roofs and other upward faces, darker wet roofs
        if (uSnow > 0.0) {
          float sAlt = smoothstep(uSnowLine - 30.0, uSnowLine + 30.0, vSnowY);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.96, 0.99), uSnow * sAlt * smoothstep(0.45, 0.8, vSnowN) * 0.92);
        }
        if (uWet > 0.0) diffuseColor.rgb *= 1.0 - uWet * 0.12 * step(0.5, vSnowN);`
      );
  };
  m.customProgramCacheKey = () => 'facade-v5';
  return m;
}

// Lambert with a two-tone cartoon ramp: warm lit side, cool shade side
function toonFoliage(clippingPlanes?: THREE.Plane[]): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ clippingPlanes });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = SHARED.uSnow;
    sh.uniforms.uSnowLine = SHARED.uSnowLine;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSnowY;\nvarying float vSnowN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 sWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          sWp = instanceMatrix * sWp;
        #endif
        vSnowY = (modelMatrix * sWp).y;
        vSnowN = normal.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSnowY;\nvarying float vSnowN;\nuniform float uSnow, uSnowLine;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uSnow > 0.0) {
          float sAlt = smoothstep(uSnowLine - 30.0, uSnowLine + 30.0, vSnowY);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), uSnow * sAlt * smoothstep(0.2, 0.75, vSnowN) * 0.85);
        }`);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      #if NUM_DIR_LIGHTS > 0
        float ndl = dot(normalize(normal), directionalLights[0].direction);
        float ramp = smoothstep(-0.2, 0.55, ndl);
        outgoingLight *= mix(vec3(0.80, 0.92, 1.08), vec3(1.10, 1.08, 0.84), ramp);
      #endif
      #include <opaque_fragment>`
    );
  };
  m.customProgramCacheKey = () => 'toon-foliage-v2';
  return m;
}

// ---------------------------------------------------------------- main
// Convenience: compute + assemble on the main thread (fallback without workers)
export interface CityOptions {
  /** chunk edge, m */
  chunkSize?: number;
  /** < 1 thins out trees and parked cars (phones) */
  density?: number;
  clippingPlanes?: THREE.Plane[];
}
export type RoadKind = 'major' | 'minor' | 'service' | 'ped' | 'path';
export interface RoadInfo { k: string; w: number; b: number; kind: RoadKind; pts: Ring }
/** Build stage names yielded by computeCitySteps (progress labels: i18n `stage.<name>`). */
export type CityStage = 'terrain' | 'ground' | 'buildings' | 'cars' | 'trees' | 'pack';

/** [x, z, radius, variant (negative = forest)] */
type TreeRec = [number, number, number, number];
/** [x, z, angle, colour pick] */
type CarRec = [number, number, number, number];
/** instance matrices, colours, count */
interface Packed { m: Float32Array; c: Float32Array; n: number }
interface PackedSet { hi: Packed; far: Packed }
interface ChunkDesc {
  rect: Box; y: number;
  terrainHi: GeoData; terrainLo: GeoData;
  ground: GeoData | null; build: GeoData | null;
  trees: PackedSet | null; forest: PackedSet | null; cyp: PackedSet | null; cars: Packed | null;
}
export interface CityDesc {
  chunks: ChunkDesc[];
  skirt: GeoData;
  roadList: RoadInfo[];
  stats: { buildings: number; trees: number; parked: number; roads: number; chunks: number };
  meta?: CityData['meta'];
}
interface Chunk { i: number; j: number; cx: number; cz: number; ground: Builder; build: Builder; trees: TreeRec[]; cyp: TreeRec[]; cars: CarRec[] }

export function buildCity(data: CityData, terrain: Terrain, opts: CityOptions = {}) {
  return assembleCity(computeCity(data, terrain, opts), opts);
}

// Phase 1: OSM data + terrain → typed-array chunk descriptions.
// A generator that yields each finished stage name, so the caller can update a
// progress bar between stages; computeCity() just runs it to the end.
export function computeCity(data: CityData, terrain: Terrain, opts: CityOptions = {}): CityDesc {
  const it = computeCitySteps(data, terrain, opts);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
export function* computeCitySteps(data: CityData, terrain: Terrain, opts: CityOptions = {}): Generator<CityStage, CityDesc, void> {
  // density < 1 thins out trees and parked cars (lighter memory profile for phones)
  const { chunkSize = 1000, density = 1 } = opts;
  const { w: W, h: H } = data.meta;
  const halfW = W / 2, halfH = H / 2;
  const inside = (x: number, z: number, m = 0) => Math.abs(x) < halfW - m && Math.abs(z) < halfH - m;
  const T = (x: number, z: number) => terrain.at(x, z);

  // chunks
  const CX = Math.ceil(W / chunkSize), CZ = Math.ceil(H / chunkSize);
  const chunks = new Map<number, Chunk>();
  const chunkKey = (x: number, z: number) => {
    const i = Math.min(CX - 1, Math.max(0, Math.floor((x + halfW) / chunkSize)));
    const j = Math.min(CZ - 1, Math.max(0, Math.floor((z + halfH) / chunkSize)));
    return j * CX + i;
  };
  const chunk = (x: number, z: number): Chunk => {
    const k = chunkKey(x, z);
    let c = chunks.get(k);
    if (!c) {
      const i = k % CX, j = Math.floor(k / CX);
      c = {
        i, j, cx: -halfW + (i + 0.5) * chunkSize, cz: -halfH + (j + 0.5) * chunkSize,
        ground: new Builder(), build: new Builder(true), trees: [], cyp: [], cars: [],
      };
      chunks.set(k, c);
    }
    return c;
  };

  // spatial indices
  const bGrid = new PolyGrid(25);
  const blockGrid = new PolyGrid(30);
  const roadGrid = new SegGrid(20);
  const buildings = data.buildings.map((b) => ({ ...b, poly: b.r.map(toPts) }));
  for (const b of buildings) bGrid.add(b.poly, b);
  const areas = data.areas.map((a) => ({ ...a, poly: a.r.map(toPts), painted: false }));
  for (const a of areas) if (['water', 'pool', 'pitch', 'clay', 'court', 'parking', 'plaza'].includes(a.k)) blockGrid.add(a.poly, a);

  // ---------------- terrain chunks + skirt
  const cellsPer = Math.round(chunkSize / terrain.cell);
  const cG = C(PAL.ground), cH = C(PAL.hill);
  // Large natural areas are painted into the terrain's vertex colours (scanline
  // raster at the terrain resolution) instead of being clipped into geometry.
  const PAINT = new Set(['wood', 'scrub', 'grass', 'park', 'cemetery', 'fortress', 'dirt', 'campus', 'play']);
  const kindList = Object.keys(PAL.area);
  const kindCol = kindList.map((k) => C(PAL.area[k]));
  const paint = new Uint8Array(terrain.nx * terrain.nz); // 0 = bare ground, else kind index + 1
  const xs: number[] = [];
  for (const a of areas) {
    if (!PAINT.has(a.k) || a.a < 20000) continue;
    a.painted = true;
    const [, bz0, , bz1] = bbox(a.poly[0]);
    const ki = kindList.indexOf(a.k) + 1;
    const j0 = Math.max(0, Math.ceil((bz0 - terrain.z0) / terrain.cell)), j1 = Math.min(terrain.nz - 1, Math.floor((bz1 - terrain.z0) / terrain.cell));
    for (let j = j0; j <= j1; j++) {
      rowCrossings(a.poly, terrain.z0 + j * terrain.cell, xs);
      for (let s2 = 0; s2 + 1 < xs.length; s2 += 2) {
        const i0 = Math.max(0, Math.ceil((xs[s2] - terrain.x0) / terrain.cell)), i1 = Math.min(terrain.nx - 1, Math.floor((xs[s2 + 1] - terrain.x0) / terrain.cell));
        for (let i = i0; i <= i1; i++) paint[j * terrain.nx + i] = ki;
      }
    }
  }
  const terrainMeshes = new Map<number, { hi: GeoData; lo: GeoData; rect: Box }>(); // by chunk index
  for (let j = 0; j < CZ; j++)
    for (let i = 0; i < CX; i++) {
      const i0 = i * cellsPer, j0 = j * cellsPer;
      const i1 = Math.min(terrain.nx - 1, i0 + cellsPer), j1 = Math.min(terrain.nz - 1, j0 + cellsPer);
      if (i1 <= i0 || j1 <= j0) continue;
      const g = terrain.chunkGeometry(i0, j0, i1, j1, (c, y, ny, gi, gj) => {
        const k = paint[gj * terrain.nx + gi];
        if (k) c.copy(kindCol[k - 1]);
        else c.copy(cG).lerp(cH, THREE.MathUtils.smoothstep(y, 70, 220) * 0.85);
        c.multiplyScalar(0.94 + 0.06 * ny);
      });
      const hi = dataFromGeo(g);
      const lo = dataFromGeo(terrain.lowGeometry(i0, j0, i1, j1, 3));
      const rect: Box = [terrain.x0 + i0 * terrain.cell, terrain.z0 + j0 * terrain.cell, terrain.x0 + i1 * terrain.cell, terrain.z0 + j1 * terrain.cell];
      terrainMeshes.set(j * CX + i, { hi, lo, rect });
    }
  // diorama skirt: cut-away sides following the terrain profile
  const skirt = new Builder();
  const base = -90;
  const side = (pts: Pt[], out: Vec3) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1];
      skirt.quad([x0, base, z0], [x1, base, z1], [x1, T(x1, z1), z1], [x0, T(x0, z0), z0], C(PAL.slabSide), out);
    }
  };
  const edge = (fx: (t: number) => Pt, n: number): Pt[] => Array.from({ length: n + 1 }, (_, k) => fx(k / n));
  const nX = terrain.nx - 1, nZ = terrain.nz - 1;
  side(edge((t) => [-halfW + t * W, halfH], nX), [0, 0, 1]);
  side(edge((t) => [-halfW + t * W, -halfH], nX), [0, 0, -1]);
  side(edge((t) => [-halfW, -halfH + t * H], nZ), [-1, 0, 0]);
  side(edge((t) => [halfW, -halfH + t * H], nZ), [1, 0, 0]);
  // darker stratum band
  const bands: [Pt, Pt, Vec3][] = [[[-halfW, halfH], [halfW, halfH], [0, 0, 1]], [[-halfW, -halfH], [halfW, -halfH], [0, 0, -1]], [[-halfW, -halfH], [-halfW, halfH], [-1, 0, 0]], [[halfW, -halfH], [halfW, halfH], [1, 0, 0]]];
  for (const [a, b, out] of bands) {
    const e = 0.6 * Math.sign(out[0] + out[2]);
    const ox = out[0] ? e : 0, oz = out[2] ? e : 0;
    skirt.quad([a[0] + ox, base, a[1] + oz], [b[0] + ox, base, b[1] + oz], [b[0] + ox, base + 22, b[1] + oz], [a[0] + ox, base + 22, a[1] + oz], C(PAL.slabDark), out);
  }

  yield 'terrain';
  // ---------------- draped areas
  const drapeTri = (tri: Pt[], yo: number, col: THREE.Color) => {
    terrain.clipTriangle(tri, (piece, i, j) => {
      const c = chunk(terrain.x0 + (i + 0.5) * terrain.cell, terrain.z0 + (j + 0.5) * terrain.cell);
      const P = piece.map(([x, z]): Vec3 => [x, T(x, z) + yo, z]);
      for (let k = 1; k < P.length - 1; k++) c.ground.tri(P[0], P[k], P[k + 1], col, UP);
    });
  };
  for (const a of areas) {
    if (a.painted) continue;
    const contour = a.poly[0].map(([x, z]) => new THREE.Vector2(x, z));
    const holes = a.poly.slice(1).map((r) => r.map(([x, z]) => new THREE.Vector2(x, z)));
    let faces: number[][];
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { continue; }
    const all = [contour, ...holes].flat();
    const col = C(PAL.area[a.k] || PAL.ground);
    const yo = 0.12 + a.z * 0.07;
    for (const [i, j, k] of faces) drapeTri([[all[i].x, all[i].y], [all[j].x, all[j].y], [all[k].x, all[k].y]], yo, col);
  }

  // ---------------- roads (draped strips)
  const roadKind = (k: string): RoadKind => {
    if (['motorway', 'trunk', 'primary', 'secondary', 'primary_link', 'secondary_link'].includes(k)) return 'major';
    if (['tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street'].includes(k)) return 'minor';
    if (k === 'service') return 'service';
    if (k === 'pedestrian') return 'ped';
    return 'path';
  };
  const STEP = terrain.cell * 0.5;
  const strip = (pts: Ring, hw: number, yo: number, col: THREE.Color) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = (-dz / len) * hw, nz = (dx / len) * hw;
      const n = Math.max(1, Math.ceil(len / STEP));
      const B = chunk((ax + bx) / 2, (az + bz) / 2).ground;
      for (let s = 0; s < n; s++) {
        const t0 = s / n, t1 = (s + 1) / n;
        const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
        const p = (x: number, z: number): Vec3 => [x, T(x, z) + yo, z];
        B.quad(p(x0 + nx, z0 + nz), p(x1 + nx, z1 + nz), p(x1 - nx, z1 - nz), p(x0 - nx, z0 - nz), col, UP);
      }
    }
    const seg = hw > 3 ? 12 : 8;
    for (const [x, z] of pts) {
      const B = chunk(x, z).ground;
      const yc = T(x, z) + yo;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        const x0 = x + Math.cos(a0) * hw, z0 = z + Math.sin(a0) * hw, x1 = x + Math.cos(a1) * hw, z1 = z + Math.sin(a1) * hw;
        B.tri([x, yc, z], [x0, T(x0, z0) + yo, z0], [x1, T(x1, z1) + yo, z1], col, UP);
      }
    }
  };
  const roadList = data.roads.map((r) => ({ ...r, pts: toPts(r.p), kind: roadKind(r.k) }));
  type Building = (typeof buildings)[number];
  for (const r of roadList) if (r.kind === 'major' || r.kind === 'minor') strip(r.pts, r.w / 2 + 1.6, 0.9, C(PAL.road.casing));
  for (const r of roadList) {
    const hw = r.w / 2;
    const yo = r.kind === 'path' ? 1.14 : r.kind === 'ped' ? 1.06 : r.kind === 'service' ? 0.99 : r.kind === 'minor' ? 1.01 : 1.03;
    strip(r.pts, hw, yo + (r.b ? 0.04 : 0), C(PAL.road[r.kind]));
    for (let i = 0; i < r.pts.length - 1; i++) roadGrid.add(r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1], hw + (r.kind === 'major' || r.kind === 'minor' ? 1.0 : 0.3));
  }
  for (const rl of data.rails) {
    const pts = toPts(rl.p);
    strip(pts, 2.6, 1.08, C(PAL.road.rail));
    for (let i = 0; i < pts.length - 1; i++) roadGrid.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3);
  }

  yield 'ground';
  // ---------------- buildings
  const towers = data.towers.slice();
  const domes: { b: Building; ob: OBB; h: number; baseY: number }[] = [];
  for (const b of buildings) {
    const rnd = mulberry32(b.id);
    const outer = b.poly[0];
    const fpArea = Math.abs(ringArea(outer));
    const ob = obb(outer);
    if (!ob) continue;
    const B = chunk(ob.c[0], ob.c[1]).build;
    // sit on the terrain: base at the lowest corner, height from the average
    let gMin = Infinity, gSum = 0;
    for (const [x, z] of outer) { const g = T(x, z); gMin = Math.min(gMin, g); gSum += g; }
    const gAvg = gSum / outer.length;
    const baseY = gMin - 0.4;
    B.yOff = baseY;
    const lift = gAvg - baseY;

    const rect = fpArea / Math.max(ob.area, 1e-6);
    const tall = b.lv >= 8;
    const facade = b.old ? pick(PAL.facadeOld, rnd()) : tall ? pick(PAL.facadeTall, rnd()) : pick(PAL.facade, rnd());
    let fcol = C(facade);
    if (b.c) { try { fcol = C(facade).lerp(C(b.c), 0.35); } catch { /* bad colour tag */ } }
    const h = b.h + lift, y0 = b.mh > 0 ? b.mh + lift : 0;

    let roof = 'flat';
    const r = rnd();
    const rs = b.rs;
    if (b.w) roof = 'dome';
    else if (rs) roof = /hip|pyramid/.test(rs) ? 'hip' : /gable|saltbox|gambrel|mansard/.test(rs) ? (rs === 'mansard' ? 'hip' : 'gable') : /dome|onion/.test(rs) ? 'dome' : 'flat';
    else if (b.t === 'roof' || b.t === 'carport' || b.t === 'industrial') roof = 'flat';
    else if (b.old) roof = rect > 0.6 ? (r < 0.7 ? 'hip' : 'gable') : 'tileflat';
    else if (b.lv <= 3 && rect > 0.78 && fpArea < 900) roof = r < 0.72 ? (r < 0.5 ? 'hip' : 'gable') : 'flat';
    else if (b.lv <= 6 && rect > 0.82 && fpArea < 1600) roof = r < 0.35 ? 'hip' : 'flat';
    if ((roof === 'hip' || roof === 'gable') && ob.W < 1.5) roof = 'tileflat';

    const tileCol = C(b.old ? pick(PAL.tileOld, rnd()) : pick(PAL.tile, rnd()));
    const style = Math.max(1, b.lv) + Math.min(rnd(), 0.999);
    const ind = b.t === 'industrial';
    const fort = b.t === 'fortress';
    if (ind) fcol = C(pick(PAL.industrial, rnd()));
    if (fort) { fcol = C(PAL.stone); roof = 'flat'; }
    const hasWin = b.h >= 2.4 && !ind && !fort && b.t !== 'roof' && b.t !== 'garage' && b.t !== 'carport';
    // parapet on flat roofs: walls rise above the roof, with an inner lip and cap
    let pp = roof === 'flat' && b.t !== 'roof' && (b.lv >= 2 || ind) && fpArea > 60 && outer.length <= 80 ? 0.7 + rnd() * 0.35 : 0;
    const inner = pp ? insetRing(outer, 0.32) : null;
    if (!inner) pp = 0;

    if (b.t !== 'roof' || h - y0 > 0.5) {
      for (let ri = 0; ri < b.poly.length; ri++) {
        const ring = b.poly[ri];
        const s = Math.sign(ringArea(ring)) * (ri > 0 ? -1 : 1);
        let u = rnd() * 3;
        for (let i = 0; i < ring.length; i++) {
          const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
          const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
          if (len < 0.05) continue;
          const hint: Vec3 = [(dz / len) * s, 0, (-dx / len) * s];
          const st = hasWin && len > 2.2 ? style : -1;
          // window coords measured from local ground so buried storeys don't shift the pattern
          const va = lift, top = h - lift;
          B.quad(
            [ax, y0, az], [bx, y0, bz], [bx, h + (ri === 0 ? pp : 0), bz], [ax, h + (ri === 0 ? pp : 0), az], fcol, hint,
            [u, y0 - va, top, st], [u + len, y0 - va, top, st], [u + len, h + pp - va, top, st], [u, h + pp - va, top, st]
          );
          u += len;
        }
      }
    }

    const P = (sa: number, sb: number, L: number, Wd: number, y: number): Vec3 => [ob.c[0] + ob.a[0] * sa * L + ob.b[0] * sb * Wd, y, ob.c[1] + ob.a[1] * sa * L + ob.b[1] * sb * Wd];
    if (roof === 'hip' || roof === 'gable') {
      const ov = b.old ? 0.55 : 0.4;
      const L = ob.L + ov, Wd = ob.W + ov;
      const rh = Math.min(Wd * (b.old ? 0.5 : 0.58), 6);
      const c = [ob.c[0], h, ob.c[1]];
      const hintOf = (...pts: Vec3[]): Vec3 => {
        const m = pts.reduce<Vec3>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
        return [m[0] - c[0], m[1] - c[1] + 0.01, m[2] - c[2]];
      };
      const p00 = P(-1, -1, L, Wd, h), p10 = P(1, -1, L, Wd, h), p11 = P(1, 1, L, Wd, h), p01 = P(-1, 1, L, Wd, h);
      const rl = roof === 'hip' ? Math.max(L - Wd, 0) : L;
      const r0 = P(-1, 0, rl, 0, h + rh), r1 = P(1, 0, rl, 0, h + rh);
      const slope = Math.hypot(Wd, rh) / rh;
      const tf = (p: Vec3, dir: Pt): Fac => [(p[0] - c[0]) * dir[0] + (p[2] - c[2]) * dir[1], (p[1] - h) * slope, 0, -2];
      const A = ob.a, Bv = ob.b;
      B.quad(p01, p11, r1, r0, tileCol, hintOf(p01, p11, r1, r0), tf(p01, A), tf(p11, A), tf(r1, A), tf(r0, A));
      B.quad(p00, p10, r1, r0, tileCol, hintOf(p00, p10, r1, r0), tf(p00, A), tf(p10, A), tf(r1, A), tf(r0, A));
      if (roof === 'hip') {
        B.tri(p10, p11, r1, tileCol, hintOf(p10, p11, r1), tf(p10, Bv), tf(p11, Bv), tf(r1, Bv));
        B.tri(p00, p01, r0, tileCol, hintOf(p00, p01, r0), tf(p00, Bv), tf(p01, Bv), tf(r0, Bv));
      } else {
        B.tri(p10, p11, r1, fcol, hintOf(p10, p11, r1));
        B.tri(p00, p01, r0, fcol, hintOf(p00, p01, r0));
      }
    } else {
      const roofCol = roof === 'tileflat' ? tileCol : ind ? C(pick(PAL.industrialRoof, rnd())) : C(pick(PAL.flatRoof, rnd()));
      B.polygon(b.poly, h, roofCol);
      if (pp && inner) {
        const lip = roofCol.clone().multiplyScalar(0.9), cap = fcol.clone().lerp(C('#ffffff'), 0.25);
        const n = outer.length, sg = Math.sign(ringArea(outer));
        for (let i = 0; i < n; i++) {
          const o0 = outer[i], o1 = outer[(i + 1) % n], q0 = inner[i], q1 = inner[(i + 1) % n];
          const dx = q1[0] - q0[0], dz = q1[1] - q0[1];
          const inward: Vec3 = [-dz * sg, 0, dx * sg];
          B.quad([q0[0], h, q0[1]], [q1[0], h, q1[1]], [q1[0], h + pp, q1[1]], [q0[0], h + pp, q0[1]], lip, inward);
          B.quad([o0[0], h + pp, o0[1]], [o1[0], h + pp, o1[1]], [q1[0], h + pp, q1[1]], [q0[0], h + pp, q0[1]], cap, UP);
        }
      }
      // fortress towers: stone battlements around the top
      if (fort) {
        const ring = outer, n = ring.length;
        for (let i = 0; i < n; i++) {
          const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
          const len = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.floor(len / 2.4));
          for (let k = 0; k < m; k++) {
            const tt = (k + 0.5) / m;
            B.box(ax + (bx - ax) * tt, az + (bz - az) * tt, h, 1.2, 1.2, 1.3, Math.atan2(bz - az, bx - ax), fcol, NO);
          }
        }
      }
      if (ind && fpArea > 500) {
        const ang = Math.atan2(ob.a[1], ob.a[0]);
        for (let off = -ob.W + 4; off < ob.W - 3; off += 7.5) {
          const x = ob.c[0] + ob.b[0] * off, z = ob.c[1] + ob.b[1] * off;
          if (pipPoly(x, z, b.poly)) B.box(x, z, h, ob.L * 1.5, 1.8, 0.55, ang, C('#c3d0dc'), NO);
        }
      }
      if (roof === 'flat' && fpArea > 90 && b.t !== 'roof' && b.lv >= 2) {
        const n = Math.min(6, 1 + Math.floor((fpArea / 220) * rnd() + rnd() * 2));
        const ang = Math.atan2(ob.a[1], ob.a[0]);
        for (let k = 0; k < n; k++) {
          const sx = 1.4 + rnd() * 3, sz = 1.4 + rnd() * 2.6;
          const x = ob.c[0] + ob.a[0] * (rnd() * 2 - 1) * ob.L * 0.75 + ob.b[0] * (rnd() * 2 - 1) * ob.W * 0.7;
          const z = ob.c[1] + ob.a[1] * (rnd() * 2 - 1) * ob.L * 0.75 + ob.b[1] * (rnd() * 2 - 1) * ob.W * 0.7;
          const ok = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, j]) =>
            pipPoly(x + (Math.cos(ang) * i * sx - Math.sin(ang) * j * sz) * 0.6, z + (Math.sin(ang) * i * sx + Math.cos(ang) * j * sz) * 0.6, b.poly));
          if (!ok) continue;
          if (rnd() < 0.12) B.box(x, z, h, sx * 1.5, sz * 1.5, 0.45, ang, C(pick(PAL.roofGreen, rnd())), NO);
          else B.box(x, z, h, sx, sz, 1.0 + rnd() * 1.8, ang, C(pick(PAL.roofBits, rnd())), NO);
        }
        if (b.lv >= 5 && rnd() < 0.7) {
          const sx = Math.min(5, ob.L * 0.5), sz = Math.min(4, ob.W * 0.6);
          if (pipPoly(ob.c[0], ob.c[1], b.poly)) B.box(ob.c[0], ob.c[1], h, sx, sz, 2.6, ang, C(pick(PAL.flatRoof, rnd())).multiplyScalar(0.97), NO);
        }
      }
      if (roof === 'dome') domes.push({ b, ob, h, baseY });
    }
  }

  yield 'buildings';
  // ---------------- backyard sheds & parked cars (fuller blocks)
  const occupied = new PointHash(2.5);
  const rsh = mulberry32(99);
  for (const b of buildings) {
    if (b.old || b.lv > 2 || b.t === 'industrial' || b.r[0].length > 24) continue;
    const fp = Math.abs(ringArea(b.poly[0]));
    if (fp > 220 || fp < 40 || rsh() > 0.38) continue;
    const ob = obb(b.poly[0]);
    if (!ob) continue;
    const side = rsh() < 0.5 ? -1 : 1, dist = ob.W + 2.6 + rsh() * 4;
    const x = ob.c[0] + ob.b[0] * dist * side + ob.a[0] * (rsh() - 0.5) * ob.L;
    const z = ob.c[1] + ob.b[1] * dist * side + ob.a[1] * (rsh() - 0.5) * ob.L;
    const sx = 2.4 + rsh() * 2, sz = 2 + rsh() * 1.2;
    if (!inside(x, z, 5) || bGrid.hit(x, z, Math.max(sx, sz) * 0.6 + 0.5) || roadGrid.near(x, z, Math.max(sx, sz) * 0.6 + 0.8) || blockGrid.hit(x, z)) continue;
    if (!occupied.tryAdd(x, z, 3.5)) continue;
    const B = chunk(x, z).build;
    B.yOff = T(x, z) - 0.3;
    const top = C(pick(PAL.shed, rsh()));
    B.box(x, z, 0, sx, sz, 2.3 + rsh() * 0.6, Math.atan2(ob.a[1], ob.a[0]), C(pick(PAL.facade, rsh())), NO, top);
  }
  const rpk = mulberry32(31337);
  const parkAt = (x: number, z: number, ang: number) => { if (inside(x, z, 4)) chunk(x, z).cars.push([x, z, ang, rpk()]); };
  // kerbside parking on residential streets
  for (const r of roadList) {
    if (!['residential', 'living_street', 'unclassified', 'tertiary'].includes(r.k)) continue;
    const off = r.w / 2 - 1.15;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 20) continue;
      const tx = dx / len, tz = dz / len;
      for (let t = 10; t < len - 10; t += 5.6)
        for (const sd of [-1, 1]) {
          if (rpk() > 0.2 * density) continue;
          const x = ax + tx * t - tz * off * sd, z = az + tz * t + tx * off * sd;
          if (bGrid.hit(x, z, 1)) continue;
          parkAt(x, z, Math.atan2(tz, tx));
        }
    }
  }
  // parking lots: rows of cars along the lot's long axis
  for (const a of areas) {
    if (a.k !== 'parking' || a.a < 150 || a.a > 60000) continue;
    const ob = obb(a.poly[0]);
    if (!ob) continue;
    const ang = Math.atan2(ob.b[1], ob.b[0]);
    for (let v = -ob.W + 2.6; v < ob.W - 2.4; v += 16)
      for (const row of [0, 5.2])
        for (let u = -ob.L + 1.4; u < ob.L - 1.3; u += 2.7) {
          if (rpk() > 0.62 * density) continue;
          const vv = v + row;
          const x = ob.c[0] + ob.a[0] * u + ob.b[0] * vv, z = ob.c[1] + ob.a[1] * u + ob.b[1] * vv;
          if (!pipPoly(x + ob.b[0] * 2.2, z + ob.b[1] * 2.2, a.poly) || !pipPoly(x - ob.b[0] * 2.2, z - ob.b[1] * 2.2, a.poly)) continue;
          if (bGrid.hit(x, z, 1.5)) continue;
          parkAt(x, z, ang);
        }
  }

  // domes, minarets, crosses
  const hemi = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  const cone = new THREE.ConeGeometry(1, 1, 14, 1, true);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const addCyl = (B: Builder, x: number, z: number, y: number, r: number, hgt: number, col: THREE.Color) => B.geometry(cyl, M.compose(V(x, y + hgt / 2, z), Q, V(r, hgt, r)), col);
  for (const { b, ob, h, baseY } of domes) {
    const B = chunk(ob.c[0], ob.c[1]).build;
    B.yOff = baseY;
    const rd = Math.min(Math.max(Math.min(ob.L, ob.W) * 0.62, 2.5), 13);
    addCyl(B, ob.c[0], ob.c[1], h, rd * 0.92, rd * 0.35, C(b.w === 'mosque' ? PAL.minaret : PAL.stone));
    B.geometry(hemi, M.compose(V(ob.c[0], h + rd * 0.35, ob.c[1]), Q, V(rd, rd * 0.85, rd)), C(PAL.dome));
    if (b.w === 'mosque' && !towers.some((t) => Math.hypot(t.x - ob.c[0], t.z - ob.c[1]) < 35)) {
      const p = [ob.c[0] + ob.a[0] * (ob.L + 2) + ob.b[0] * (ob.W - 1), ob.c[1] + ob.a[1] * (ob.L + 2) + ob.b[1] * (ob.W - 1)];
      towers.push({ x: p[0], z: p[1], r: 1.5, h: b.h + 24, m: 1 });
    }
  }
  for (const t of towers) {
    const B = chunk(t.x, t.z).build;
    B.yOff = T(t.x, t.z) - 0.5;
    const body = t.h - 5;
    addCyl(B, t.x, t.z, 0, t.r, body, C(PAL.minaret));
    addCyl(B, t.x, t.z, body * 0.78, t.r * 1.45, 0.7, C(PAL.minaret).multiplyScalar(0.95));
    B.geometry(cone, M.compose(V(t.x, body + 2.5, t.z), Q, V(t.r * 1.05, 5, t.r * 1.05)), C(PAL.lead));
  }
  for (const cr of data.crosses || []) {
    if (/Millennium|Милениум/.test(cr.name)) continue; // lattice model in landmarks.js
    const B = chunk(cr.x, cr.z).build;
    B.yOff = T(cr.x, cr.z) - 0.5;
    const golden = /golden|злат/i.test(cr.name);
    const col = C(golden ? '#e8c35c' : '#f7f4ee');
    const h = cr.h, t = h * 0.09;
    B.box(cr.x, cr.z, 0, 14, 14, 3, 0, C(PAL.stone), NO);
    B.box(cr.x, cr.z, 3, t, t, h, 0, col, NO);
    B.box(cr.x, cr.z, 3 + h * 0.66, h * 0.46, t, t, 0, col, NO);
  }

  // fortress walls (Kale)
  for (const wl of data.walls) {
    const pts = toPts(wl.p);
    const col = C(PAL.stone);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.1) continue;
      const ga = T(ax, az), gb = T(bx, bz);
      const B = chunk((ax + bx) / 2, (az + bz) / 2).build;
      B.yOff = Math.min(ga, gb) - 1;
      const wallH = wl.h + Math.abs(ga - gb) + 1, ang = Math.atan2(bz - az, bx - ax);
      B.box((ax + bx) / 2, (az + bz) / 2, 0, len + wl.w * 0.9, wl.w, wallH, ang, col, NO);
      // battlements: merlons along the wall top
      if (wl.w >= 2) {
        const n = Math.floor(len / 2.6);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          B.box(ax + (bx - ax) * t, az + (bz - az) * t, wallH, 1.3, wl.w + 0.1, 1.3, ang, col, NO);
        }
      }
    }
    for (const [x, z] of pts) {
      if (!inside(x, z)) continue;
      const B = chunk(x, z).build;
      B.yOff = T(x, z) - 1;
      B.box(x, z, 0, wl.w * 1.6, wl.w * 1.6, wl.h + 2.2, 0, col, NO);
    }
  }

  yield 'cars';
  // ---------------- trees
  const addTree = (list: 'trees' | 'cyp', x: number, z: number, r: number, v: number) => chunk(x, z)[list].push([x, z, r, v]);
  const placeOk = (x: number, z: number, d: number) =>
    inside(x, z, 4) && !bGrid.hit(x, z, 1.2) && !blockGrid.hit(x, z) && !roadGrid.near(x, z, 0.4) && occupied.tryAdd(x, z, d);

  const rndT = mulberry32(12345);
  for (let i = 0; i < data.trees.length; i += 2) {
    const x = data.trees[i], z = data.trees[i + 1];
    if (inside(x, z, 3) && !bGrid.hit(x, z) && occupied.tryAdd(x, z, 3)) addTree('trees', x, z, 2.6 + rndT() * 1.6, rndT());
  }
  // [spacing, probability, cypress share, radius min, radius span]
  const DENS: Record<string, [step: number, prob: number, cypress: number, rMin: number, rSpan: number]> = {
    park: [6.5, 0.86, 0.1, 2.8, 2.2], wood: [9.5, 0.92, 0.04, 4.2, 2.6], scrub: [12, 0.45, 0, 1.8, 1.6],
    grass: [10, 0.38, 0.05, 2.8, 2.0], cemetery: [7, 0.7, 0.5, 2.6, 1.5], fortress: [12, 0.28, 0.3, 2.8, 1.8],
    campus: [14, 0.22, 0.08, 2.8, 2.0], play: [12, 0.3, 0, 2.6, 1.6],
  };
  for (const a of areas) {
    const d = DENS[a.k];
    if (!d) continue;
    if (a.k === 'grass' && a.a < 250) continue;
    const [step0, prob, cypressP, rMin, rSpan] = d;
    const step = step0 / Math.sqrt(density);
    const rr = mulberry32(Math.floor(a.a * 13) + a.poly[0].length);
    const xs = a.poly[0].map((p) => p[0]), zs = a.poly[0].map((p) => p[1]);
    const x0 = Math.max(Math.min(...xs), -halfW), x1 = Math.min(Math.max(...xs), halfW);
    const z0 = Math.max(Math.min(...zs), -halfH), z1 = Math.min(Math.max(...zs), halfH);
    const forest = a.k === 'wood';
    // walk scanline spans instead of testing every point against the polygon
    const cross: number[] = [];
    for (let z = z0 + rr() * step * 0.5; z < z1; z += step) {
      rowCrossings(a.poly, z, cross);
      for (let k = 0; k + 1 < cross.length; k += 2) {
        const sx0 = Math.max(cross[k], x0), sx1 = Math.min(cross[k + 1], x1);
        for (let x = sx0 + rr() * step * 0.5; x < sx1; x += step) {
          if (rr() > prob) continue;
          const px = Math.min(Math.max(x + (rr() - 0.5) * step * 0.9, cross[k] + 0.6), cross[k + 1] - 0.6);
          const pz = z + (rr() - 0.5) * step * 0.6;
          const isC = rr() < cypressP;
          const rad = isC ? 1.1 + rr() * 0.7 : rMin + rr() * rSpan;
          if (!placeOk(px, pz, isC ? 2.2 : rad * (forest ? 1.25 : 1.15))) continue;
          addTree(isC ? 'cyp' : 'trees', px, pz, rad, forest ? -rr() - 0.001 : rr());
        }
      }
    }
  }
  // street trees
  const rs = mulberry32(777);
  for (const r of roadList) {
    if (!(r.kind === 'minor' || r.kind === 'major' || r.kind === 'ped')) continue;
    const off = r.w / 2 + (r.kind === 'ped' ? 1.2 : 2.0);
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 4) continue;
      const nx = -dz / len, nz = dx / len;
      for (let t = 4; t < len - 3; t += 8.5) {
        for (const sd of [-1, 1]) {
          if (rs() > (r.kind === 'major' ? 0.6 : 0.42) * density) continue;
          const px = ax + (dx / len) * t + nx * off * sd, pz = az + (dz / len) * t + nz * off * sd;
          const rad = 2.2 + rs() * 1.4;
          if (!inside(px, pz, 4) || bGrid.hit(px, pz, 1.6) || blockGrid.hit(px, pz) || roadGrid.near(px, pz, 0.2) || !occupied.tryAdd(px, pz, 5)) continue;
          addTree('trees', px, pz, rad, rs());
        }
      }
    }
  }
  // courtyard infill near buildings
  const greenGrid = new PolyGrid(40);
  for (const a of areas) if (!a.painted && ['wood', 'park', 'grass', 'scrub', 'cemetery', 'play', 'fortress'].includes(a.k)) greenGrid.add(a.poly, a);
  const paintedAt = (x: number, z: number) => paint[Math.round((z - terrain.z0) / terrain.cell) * terrain.nx + Math.round((x - terrain.x0) / terrain.cell)];
  const ri = mulberry32(4242);
  for (let x = -halfW + 6; x < halfW - 6; x += 7)
    for (let z = -halfH + 6; z < halfH - 6; z += 7) {
      if (ri() > 0.3 * density) continue;
      const px = x + (ri() - 0.5) * 6, pz = z + (ri() - 0.5) * 6;
      if (paintedAt(px, pz) || greenGrid.hit(px, pz) || bGrid.hit(px, pz, 2.2) || blockGrid.hit(px, pz) || roadGrid.near(px, pz, 2.2)) continue;
      if (!bGrid.hit(px, pz, 14)) continue;
      const isC = ri() < 0.06;
      const rad = isC ? 1.1 + ri() * 0.5 : 2.3 + ri() * 1.8;
      if (occupied.tryAdd(px, pz, rad * 1.3)) addTree(isC ? 'cyp' : 'trees', px, pz, rad, ri());
    }

  yield 'trees';
  // ---------------- pack per-chunk instance data
  const blobH = (r: number, sy: number) => sy * 0.95 + 1.6 + r * 0.3;
  const cypH = (_r: number, sy: number) => sy * 2.6 + 0.5;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const packTrees = (list: TreeRec[], cols: readonly string[], forestCols: readonly string[], hScale: (r: number, sy: number) => number): Packed => {
    const m = new Float32Array(list.length * 16), c = new Float32Array(list.length * 3);
    list.forEach(([x, z, r, v0], i) => {
      const forest = v0 < 0, v = Math.abs(v0);
      q.setFromAxisAngle(ax, v * 6.283);
      const sy = r * (0.85 + v * 0.2);
      mtx.compose(pv.set(x, T(x, z) + hScale(r, sy), z), q, sv.set(r, sy, r)).toArray(m, i * 16);
      const pal = forest ? forestCols : cols;
      col.set(pal[Math.floor(v * 97) % pal.length]).offsetHSL((v - 0.5) * 0.02, 0, (((v * 31) % 1) - 0.5) * 0.06).toArray(c, i * 3);
    });
    return { m, c, n: list.length };
  };
  // far trees: a ~30% subset drawn larger so canopies still read as continuous
  const farSubset = (list: TreeRec[]) => list.filter((t) => (Math.abs(t[3]) * 7.77) % 1 < 0.3).map(([x, z, r, v]): TreeRec => [x, z, r * 1.55, v]);
  const packSet = (list: TreeRec[], cols: readonly string[], fcols: readonly string[], hScale: (r: number, sy: number) => number): PackedSet | null => (list.length ? { hi: packTrees(list, cols, fcols, hScale), far: packTrees(farSubset(list), cols, fcols, hScale) } : null);
  const packCars = (list: CarRec[]): Packed | null => {
    if (!list.length) return null;
    const m = new Float32Array(list.length * 16), c = new Float32Array(list.length * 3);
    list.forEach(([x, z, ang, v], i) => {
      q.setFromAxisAngle(ax, -ang);
      mtx.compose(pv.set(x, T(x, z) + 1.0, z), q, sv.set(1, 1, 1)).toArray(m, i * 16);
      col.set(CAR_COLORS[Math.floor(v * CAR_COLORS.length)]).toArray(c, i * 3);
    });
    return { m, c, n: list.length };
  };
  const out: ChunkDesc[] = [];
  let treeCount = 0, carCount = 0;
  for (const [k, tm] of terrainMeshes) {
    const c = chunks.get(k);
    const d: ChunkDesc = { rect: tm.rect, y: T((tm.rect[0] + tm.rect[2]) / 2, (tm.rect[1] + tm.rect[3]) / 2), terrainHi: tm.hi, terrainLo: tm.lo, ground: null, build: null, trees: null, forest: null, cyp: null, cars: null };
    if (c) {
      if (!c.ground.empty) d.ground = c.ground.build();
      if (!c.build.empty) d.build = c.build.build();
      d.trees = packSet(c.trees.filter((t) => t[3] >= 0), PAL.trees, PAL.forest, blobH);
      d.forest = packSet(c.trees.filter((t) => t[3] < 0), PAL.trees, PAL.forest, blobH);
      d.cyp = packSet(c.cyp, PAL.cypress, PAL.cypress, cypH);
      d.cars = packCars(c.cars);
      treeCount += c.trees.length + c.cyp.length;
      carCount += c.cars.length;
    }
    out.push(d);
  }
  yield 'pack';
  return {
    chunks: out,
    skirt: skirt.build(),
    roadList: roadList.map((r) => ({ k: r.k, w: r.w, b: r.b, kind: r.kind, pts: r.pts })),
    stats: { buildings: buildings.length, trees: treeCount, parked: carCount, roads: roadList.length, chunks: chunks.size },
  };
}

// Phase 2 (main thread): typed arrays → meshes, materials and LOD switching
export function assembleCity(desc: CityDesc, opts: CityOptions) {
  const { clippingPlanes } = opts;
  const group = new THREE.Group();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes });
  groundMat.onBeforeCompile = (sh) => groundShader(sh, true);
  groundMat.customProgramCacheKey = () => 'ground-water-v4';

  const facadeMat = facadeMaterial(clippingPlanes);
  const treeMat = toonFoliage(clippingPlanes);
  const carMat = new THREE.MeshLambertMaterial({ clippingPlanes });
  // tree geometry per detail level
  const lobes = [[0, 0, 0, 1], [0.55, -0.1, 0.25, 0.68], [-0.5, -0.05, -0.3, 0.7], [0.05, 0.45, -0.15, 0.66], [-0.2, -0.15, 0.55, 0.6]];
  const blobHi = mergeGeometries(lobes.map(([x, y, z, s]) => new THREE.IcosahedronGeometry(s, 1).translate(x, y, z)));
  const blobMid = mergeGeometries(lobes.slice(0, 3).map(([x, y, z, s]) => new THREE.IcosahedronGeometry(s * 1.08, 1).translate(x, y, z)));
  const blobLo = mergeGeometries([new THREE.IcosahedronGeometry(1.12, 0), new THREE.IcosahedronGeometry(0.7, 0).translate(0.1, 0.5, 0)]);
  const blobFar = new THREE.IcosahedronGeometry(1.15, 0);
  const cypHi = mergeGeometries([new THREE.IcosahedronGeometry(1, 1).scale(1, 2.6, 1), new THREE.IcosahedronGeometry(0.7, 1).scale(1, 2.0, 1).translate(0, 1.9, 0)]);
  const cypLo = new THREE.IcosahedronGeometry(1, 0).scale(1, 3.0, 1);
  const carGeo = carGeometry();

  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, pk: Packed) => {
    const mesh = new THREE.InstancedMesh(geo, mat, 0);
    mesh.count = pk.n;
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(pk.m, 16);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(pk.c, 3);
    mesh.computeBoundingSphere();
    mesh.instanceMatrix.onUpload(dropArray);
    mesh.instanceColor.onUpload(dropArray);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
  // another detail level reusing the same per-instance GPU buffers
  const share = (src: THREE.InstancedMesh, geo: THREE.BufferGeometry) => {
    const m = new THREE.InstancedMesh(geo, treeMat, 0);
    m.count = src.count;
    m.instanceMatrix = src.instanceMatrix;
    m.instanceColor = src.instanceColor;
    m.boundingSphere = src.boundingSphere;
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  const lodChunks: LodChunk[] = [];
  for (const d of desc.chunks) {
    const L: LodChunk = { rect: d.rect, y: d.y, terrainHi: new THREE.Mesh(geoFromData(d.terrainHi), groundMat), terrainLo: new THREE.Mesh(geoFromData(d.terrainLo), groundMat), ground: null, tex: null, hi: [], lo: [], far: [] };
    L.terrainHi.receiveShadow = L.terrainLo.receiveShadow = true;
    L.terrainLo.visible = false;
    group.add(L.terrainHi, L.terrainLo);
    if (d.ground) {
      L.ground = new THREE.Mesh(geoFromData(d.ground), groundMat);
      L.ground.receiveShadow = true;
      group.add(L.ground);
    }
    if (d.build) {
      const m = new THREE.Mesh(geoFromData(d.build), facadeMat);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    const sets: [PackedSet | null, THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry][] = [[d.trees, blobHi, blobLo, blobFar], [d.forest, blobMid, blobLo, blobFar], [d.cyp, cypHi, cypLo, cypLo]];
    for (const [set, hiGeo, loGeo, farGeo] of sets) {
      if (!set) continue;
      const hi = inst(hiGeo, treeMat, set.hi);
      L.hi.push(hi);
      L.lo.push(share(hi, loGeo));
      if (set.far.n) L.far.push(inst(farGeo, treeMat, set.far));
    }
    if (d.cars) {
      const m = inst(carGeo, carMat, d.cars);
      m.castShadow = false;
      L.hi.push(m);
    }
    for (const m of [...L.hi, ...L.lo, ...L.far]) group.add(m);
    lodChunks.push(L);
  }
  group.add(new THREE.Mesh(geoFromData(desc.skirt), new THREE.MeshLambertMaterial({ vertexColors: true })));

  const { updateLOD, bakeGround, setLODScale } = makeLOD(lodChunks, group, clippingPlanes);
  return { group, updateLOD, bakeGround, setLODScale, roadList: desc.roadList, stats: desc.stats };
}

// LOD switching + far-ground baking. Kept outside buildCity so its closures
// don't pin the build-time data (grids, builders, raw OSM) in memory.
interface LodChunk {
  rect: Box;
  /** ground height at the chunk centre */
  y: number;
  terrainHi: THREE.Mesh;
  terrainLo: THREE.Mesh;
  ground: THREE.Mesh | null;
  /** baked far-ground texture */
  tex: THREE.WebGLRenderTarget | null;
  hi: THREE.InstancedMesh[];
  lo: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
}

export type City = ReturnType<typeof assembleCity>;

function makeLOD(lodChunks: LodChunk[], group: THREE.Group, clippingPlanes?: THREE.Plane[]) {
  // Bake each chunk's draped ground (land use + roads) into a texture for the
  // coarse far-away terrain, so distant chunks cost a few thousand triangles.
  function bakeGround(renderer: THREE.WebGLRenderer, res = 512): void {
    const bakeScene = new THREE.Scene();
    bakeScene.overrideMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    cam.up.set(0, 0, -1);
    const prevTarget = renderer.getRenderTarget();
    // one shared multisampled 2x target, box-downsampled into each chunk texture
    const big = new THREE.WebGLRenderTarget(res * 2, res * 2, { samples: 4 });
    big.texture.colorSpace = THREE.SRGBColorSpace;
    const copyMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: big.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv);\n#include <colorspace_fragment>\n}',
      depthTest: false, depthWrite: false,
    });
    const qScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat);
    quad.frustumCulled = false;
    qScene.add(quad);
    const qCam = new THREE.Camera();
    for (const L of lodChunks) {
      const [x0, z0, x1, z1] = L.rect;
      const rt = new THREE.WebGLRenderTarget(res, res, { depthBuffer: false });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.texture.generateMipmaps = true;
      rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
      rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      cam.left = -(x1 - x0) / 2; cam.right = (x1 - x0) / 2; cam.top = (z1 - z0) / 2; cam.bottom = -(z1 - z0) / 2;
      cam.position.set(cx, 3000, cz);
      cam.lookAt(cx, 0, cz);
      cam.updateProjectionMatrix();
      bakeScene.add(L.terrainHi);
      if (L.ground) bakeScene.add(L.ground);
      const hv = L.terrainHi.visible, gv = L.ground ? L.ground.visible : false;
      L.terrainHi.visible = true;
      if (L.ground) L.ground.visible = true;
      renderer.setRenderTarget(big);
      renderer.setClearColor(PAL.ground, 1);
      renderer.clear();
      renderer.render(bakeScene, cam);
      renderer.setRenderTarget(rt);
      renderer.render(qScene, qCam);
      L.terrainHi.visible = hv;
      if (L.ground) L.ground.visible = gv;
      group.add(L.terrainHi);
      if (L.ground) group.add(L.ground);
      L.tex = rt;
      const far = new THREE.MeshLambertMaterial({ map: rt.texture, clippingPlanes });
      far.onBeforeCompile = (sh) => groundShader(sh, false);
      far.customProgramCacheKey = () => 'ground-far-v1';
      L.terrainLo.material = far;
    }
    big.dispose();
    copyMat.dispose();
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(0x000000, 0);
  }

  const tmp = new THREE.Vector3();
  const LOD0 = { treesHi: 1250, treesLo: 3600, ground: 4300 };
  const LOD = { ...LOD0 };
  function setLODScale(k: number): void { for (const key of Object.keys(LOD0) as (keyof typeof LOD0)[]) LOD[key] = LOD0[key] * k; }
  function updateLOD(camera: THREE.Camera): void {
    const p = camera.position;
    for (const L of lodChunks) {
      const [x0, z0, x1, z1] = L.rect;
      tmp.set(Math.min(Math.max(p.x, x0), x1), L.y, Math.min(Math.max(p.z, z0), z1));
      const d = p.distanceTo(tmp);
      const lvl = d < LOD.treesHi ? 0 : d < LOD.treesLo ? 1 : 2;
      for (const m of L.hi) m.visible = lvl === 0;
      for (const m of L.lo) m.visible = lvl === 1;
      for (const m of L.far) m.visible = lvl === 2;
      const farGround = L.tex && d > LOD.ground;
      L.terrainHi.visible = !farGround;
      if (L.ground) L.ground.visible = !farGround;
      L.terrainLo.visible = !!farGround;
    }
  }
  return { updateLOD, bakeGround, setLODScale };
}
