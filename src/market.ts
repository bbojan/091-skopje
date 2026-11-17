// Kavadarci, Градски зелен пазар (the city green market), opened on 8 April 2022 in place of the old
// market (architects: Дизајн центар; builder: Градба промет). After the press photos of the opening
// (KTV and Nova Makedonija, April 2022) and an aerial image of June 2025 (Esri World Imagery):
// - two parking levels under the market (one of them underground, reached by a ramp); the market
//   floor is the deck on top, about 2100 m², with railings along its open edges;
// - over most of it a white steel roof on round white columns: two pitched bays with a glazed lantern
//   along each ridge and a white space frame under the sheets (the aerial image shows the two light
//   bays and the darker glass strips);
// - 170 stalls under the roof: grey counters in green steel frames, in rows along the aisles;
// - a row of small glazed shops (fish, eggs, dairy: refrigerated display cases) along the west side;
// - outside the roof, on the deck's north strip, more green stalls; wooden flower stalls on the
//   west wing; a small white block at its north-west corner (stairs and lifts, from the aerial image).
// The deck is level with the highest ground round it (the lane on the west side).
// No signage text is known, so there is none.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pip } from './geo.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

/** In the market's frame: x across the roof (east +), z along it (south +), from the roof's centre. */
export const MARKET = {
  /** the roof: half width, half length, eave height above the deck, ridge rise of each bay */
  roof: { hw: 14.7, hl: 24, eave: 5.6, rise: 0.9 },
  /** the deck: the main part (under and north of the roof) and the west wing, as [x0, x1, z0, z1] */
  deck: [[-15.4, 15.4, -30.5, 24.6], [-23.5, -15.4, -30.5, -4.5]] as [number, number, number, number][],
  /** the glazed shops along the west side under the roof: x0, x1, z0, z1, height */
  shops: [-14.5, -11.2, -21, 21, 3.3],
  /** the stairs and lifts block at the north-west corner */
  lift: [-23.3, -17.5, -30.3, -25.2, 3.4],
};
/** the deck's outline (both parts as one ring), in the market's frame */
export const MARKET_OUTLINE: [number, number][] = [[-23.5, -30.5], [15.4, -30.5], [15.4, 24.6], [-15.4, 24.6], [-15.4, -4.5], [-23.5, -4.5]];

export interface MarketFrame {
  c: Pt;
  rot: number;
  /** the deck's top (absolute) */
  y: number;
  /** the lowest ground round the deck (absolute) */
  low: number;
  world: (u: number, v: number) => Pt;
}

/** The market's frame, when the city has it (Kavadarci). */
export function marketFrame(data: CityData, terrain: Terrain): MarketFrame | null {
  const m = data.landmarks?.market;
  if (!m) return null;
  const [cx, cz, rot] = m, c = Math.cos(rot), s = Math.sin(rot);
  const world = (u: number, v: number): Pt => [cx + u * c + v * s, cz - u * s + v * c];
  // level with the highest ground round it (the lane on the west side); toward the street on the east,
  // where the ground is lower, the parking level shows
  let y = -Infinity, low = Infinity;
  for (const [x0, x1, z0, z1] of MARKET.deck)
    for (let i = 0; i <= 8; i++) for (const [u, v] of [[x0 + ((x1 - x0) * i) / 8, z0], [x0 + ((x1 - x0) * i) / 8, z1], [x0, z0 + ((z1 - z0) * i) / 8], [x1, z0 + ((z1 - z0) * i) / 8]]) {
      const [x, z] = world(u, v), h = terrain.at(x, z);
      y = Math.max(y, h); low = Math.min(low, h);
    }
  return { c: [cx, cz], rot, y: y + 0.2, low, world };
}

const ring = (f: MarketFrame, x0: number, x1: number, z0: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([u, v]) => f.world(u, v));

/** Walking collision: the shops, the stairs block and the deck's sides where they stand above the ground. */
export function marketFootprints(f: MarketFrame): [Flat, number][] {
  const [sx0, sx1, sz0, sz1, sh] = MARKET.shops, [lx0, lx1, lz0, lz1, lh] = MARKET.lift;
  return [[ring(f, sx0, sx1, sz0, sz1).flat(), sh], [ring(f, lx0, lx1, lz0, lz1).flat(), lh]];
}

/** The deck for walking: absolute height, −∞ off it. */
export function marketGround(f: MarketFrame): (x: number, z: number) => number {
  const outline = MARKET_OUTLINE.map(([u, v]) => f.world(u, v));
  return (x, z) => (pip(x, z, outline) ? f.y : -Infinity);
}

/** a thin box from a to b (space-frame tubes) */
function tube(a: [number, number, number], b: [number, number, number], t: number): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

export function createMarket(f: MarketFrame, clippingPlanes: THREE.Plane[]) {
  const group = new THREE.Group();
  const M = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, clippingPlanes, ...extra });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const place = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!parts.length) return;
    const m = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    m.castShadow = m.receiveShadow = true;
    m.position.set(f.c[0], f.y, f.c[1]);
    m.rotation.y = f.rot;
    group.add(m);
  };
  const { hw, hl, eave: H, rise } = MARKET.roof;
  const concrete: THREE.BufferGeometry[] = [], floor: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  const white: THREE.BufferGeometry[] = [], sheet: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  const counter: THREE.BufferGeometry[] = [], green: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], shopGlass: THREE.BufferGeometry[] = [];

  // the parking levels under the deck (down to the lowest ground round it) and the deck's floor
  const under = Math.min(-0.6, f.low - f.y - 0.6);
  for (const [x0, x1, z0, z1] of MARKET.deck) {
    concrete.push(box(x1 - x0, -under - 0.35, z1 - z0, (x0 + x1) / 2, under, (z0 + z1) / 2));
    floor.push(box(x1 - x0 + 0.1, 0.35, z1 - z0 + 0.1, (x0 + x1) / 2, -0.35, (z0 + z1) / 2));
  }
  // where the deck stands above the ground: the parking level's openings (two rows on the high sides)
  if (f.y - f.low > 1.3) {
    const oh = Math.min(2.2, f.y - f.low - 0.9), oy = -0.55 - oh;
    for (const [u0, v0, u1, v1] of [[-23.5, -30.5, -23.5, -4.5], [-23.5, -30.5, 15.4, -30.5], [-15.4, -4.5, -15.4, 24.6], [-15.4, 24.6, 15.4, 24.6], [15.4, -30.5, 15.4, 24.6]]) {
      const L = Math.hypot(u1 - u0, v1 - v0), n = Math.floor(L / 5), du = (u1 - u0) / L, dv = (v1 - v0) / L;
      for (let i = 0; i < n; i++) {
        const t = (L - n * 5) / 2 + i * 5 + 2.5, u = u0 + du * t - dv * 0.06, v = v0 + dv * t + du * 0.06;
        dark.push(box(Math.abs(du) * 3.6 + 0.1, oh, Math.abs(dv) * 3.6 + 0.1, u, oy, v));
      }
    }
  }
  // railings along the deck's open edges (the shops close the west side under the roof)
  const rail = (a: [number, number], b: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 1.6));
    white.push(tube([a[0], 1.05, a[1]], [b[0], 1.05, b[1]], 0.07), tube([a[0], 0.5, a[1]], [b[0], 0.5, b[1]], 0.04));
    for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; white.push(box(0.06, 1.05, 0.06, x, 0, z)); }
  };
  rail([-23.3, -30.3], [15.2, -30.3]); rail([-23.3, -30.3], [-23.3, -4.7]); rail([-23.3, -4.7], [-15.2, -4.7]);
  rail([-15.2, 21.5], [-15.2, 24.4]); rail([-15.2, 24.4], [15.2, 24.4]); rail([15.2, -30.3], [15.2, 24.4]);

  // the columns: three lines along the roof (both eaves and the valley)
  const cols: number[] = [];
  for (let v = -hl + 1.5; v <= hl - 1.4; v += (2 * hl - 3) / 6) cols.push(v);
  for (const u of [-hw + 0.6, 0, hw - 0.6]) for (const v of cols) white.push(new THREE.CylinderGeometry(0.26, 0.26, H, 12).translate(u, H / 2, v));

  // the roof: two bays, each pitched up from its eave and the valley to a glazed lantern on the ridge
  const bay = hw / 2, lw = 1.7, lh = 0.8; // half width of each bay, of the lantern; the lantern's height
  const len = 2 * hl + 1.2;
  for (const bc of [-bay, bay]) {
    for (const sd of [-1, 1]) {
      // the sheet from the edge (eave or valley; 0.6 m overhang at the eaves) up to the lantern
      const e = bc + sd * (bay + (Math.abs(bc + sd * bay) > 1 ? 0.6 : 0)), r = bc + sd * lw;
      const slope = new THREE.Shape([new THREE.Vector2(e, H), new THREE.Vector2(r, H + rise), new THREE.Vector2(r, H + rise - 0.22), new THREE.Vector2(e, H - 0.22)]);
      sheet.push(new THREE.ExtrudeGeometry(slope, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2));
      // the lantern's glazed side and its glass roof
      glass.push(box(0.08, lh, len, r, H + rise, 0));
      glass.push(tube([r, H + rise + lh, -len / 2], [r, H + rise + lh, len / 2], 0.1));
      const top = new THREE.Shape([new THREE.Vector2(r, H + rise + lh), new THREE.Vector2(bc, H + rise + lh + 0.45), new THREE.Vector2(bc, H + rise + lh + 0.37), new THREE.Vector2(r, H + rise + lh - 0.08)]);
      glass.push(new THREE.ExtrudeGeometry(top, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2));
      white.push(tube([r, H + rise, -len / 2], [r, H + rise, len / 2], 0.14)); // the lantern's sill
    }
    white.push(tube([bc, H + rise + lh + 0.45, -len / 2], [bc, H + rise + lh + 0.45, len / 2], 0.12)); // ridge
    // under the sheets: a truss across the bay at every column line, chords along it
    for (const v of cols) {
      const y0 = H - 0.9;
      white.push(tube([bc - bay, y0, v], [bc + bay, y0, v], 0.12));
      for (const sd of [-1, 1]) {
        const ex = bc + sd * bay;
        white.push(tube([ex, H - 0.2, v], [bc + sd * lw, H + rise - 0.2, v], 0.12));
        for (let k = 0; k < 4; k++) {
          const t0 = k / 4, t1 = (k + 0.5) / 4;
          const a: [number, number, number] = [ex + (bc + sd * lw - ex) * t0, y0, v];
          const b: [number, number, number] = [ex + (bc + sd * lw - ex) * t1, H - 0.2 + (rise) * t1, v];
          white.push(tube(a, b, 0.07), tube(b, [ex + (bc + sd * lw - ex) * ((k + 1) / 4), y0, v], 0.07));
        }
      }
    }
    for (const u of [bc - bay * 0.55, bc + bay * 0.55]) white.push(tube([u, H - 0.9, -hl], [u, H - 0.9, hl], 0.1));
  }
  // the gutter along the valley and the eaves' fascias
  white.push(box(0.6, 0.35, len, 0, H - 0.3, 0));
  for (const sd of [-1, 1]) white.push(box(0.25, 0.4, len, sd * (hw + 0.6), H - 0.45, 0));

  // the stalls: rows along the aisles, a grey counter in a green steel frame each (≈ 1.4 × 2 m)
  const stall = (u: number, v: number, along: boolean) => {
    const a = along ? 1.3 : 1.9, b = along ? 1.9 : 1.3; // size across (x) and along (z)
    counter.push(box(a, 0.85, b, u, 0, v));
    for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) green.push(box(0.06, 2.3, 0.06, u + (du * a) / 2, 0, v + (dv * b) / 2));
    green.push(box(a, 0.06, 0.06, u, 2.25, v - b / 2), box(a, 0.06, 0.06, u, 2.25, v + b / 2), box(0.06, 0.06, b, u - a / 2, 2.25, v), box(0.06, 0.06, b, u + a / 2, 2.25, v));
    green.push(box(a + 0.08, 0.08, 0.08, u, 0.82, v - b / 2), box(a + 0.08, 0.08, 0.08, u, 0.82, v + b / 2)); // the counter's rim
    green.push(box(0.08, 0.08, b, u - a / 2, 0.82, v), box(0.08, 0.08, b, u + a / 2, 0.82, v));
  };
  // across the roof (west to east): the shops, an aisle, back-to-back rows with aisles between (the valley's
  // columns stand in the middle aisle), a single row along the east side
  const rows = [-8.15, -6.85, -2.95, -1.65, 2.25, 3.55, 7.45, 8.75, 12.65];
  for (const u of rows) for (let v = -hl + 2.2; v <= hl - 2.2; v += 2.05) stall(u, v, true);
  for (let u = -11; u <= 11; u += 2.05) stall(u, -27.6, false); // the open strip north of the roof
  // wooden flower stalls on the west wing
  for (let v = -27; v <= -8; v += 3.2) {
    wood.push(box(2.6, 0.75, 1.4, -19.6, 0, v), box(2.6, 0.12, 1.2, -19.6, 1.15, v - 0.1));
    for (const du of [-1.2, 1.2]) green.push(box(0.05, 1.2, 0.05, -19.6 + du, 0, v + 0.6));
  }

  // the glazed shops along the west side (fish, eggs, dairy, meat products)
  const [sx0, sx1, sz0, sz1, sh] = MARKET.shops;
  white.push(box(sx1 - sx0, 0.25, sz1 - sz0, (sx0 + sx1) / 2, sh - 0.25, (sz0 + sz1) / 2)); // roof
  white.push(box(0.2, sh, sz1 - sz0, sx0 + 0.1, 0, (sz0 + sz1) / 2)); // back wall
  white.push(box(0.12, 0.7, sz1 - sz0, sx1, sh - 0.95, (sz0 + sz1) / 2)); // the panel above the windows
  white.push(box(0.12, 0.5, sz1 - sz0, sx1, 0, (sz0 + sz1) / 2)); // sill
  for (let v = sz0; v <= sz1 + 0.01; v += (sz1 - sz0) / 14) white.push(box(0.14, sh - 0.25, 0.14, sx1, 0, v), box(sx1 - sx0, sh - 0.25, 0.1, (sx0 + sx1) / 2, 0, v));
  shopGlass.push(box(0.06, sh - 1.45, sz1 - sz0, sx1 + 0.02, 0.5, (sz0 + sz1) / 2));

  // the stairs and lifts block at the north-west corner
  const [lx0, lx1, lz0, lz1, lh2] = MARKET.lift;
  white.push(box(lx1 - lx0, lh2, lz1 - lz0, (lx0 + lx1) / 2, 0, (lz0 + lz1) / 2));
  dark.push(box(1.6, 2.3, 0.1, lx1 - 1.4, 0, lz1 + 0.05), box(0.1, 2.3, 1.4, lx1 + 0.05, 0, lz1 - 1.2));

  place(concrete, M('#cfc9be'));
  place(floor, M('#d6d4cf'));
  place(dark, M('#3c3f43'));
  place(white, M('#f1f0ec'));
  place(sheet, M('#e8e7e2', { side: THREE.DoubleSide }));
  place(glass, M('#bfd0d8', { side: THREE.DoubleSide }));
  place(counter, M('#8f9497'));
  place(green, M('#2f7a45'));
  place(wood, M('#9a6a42'));
  const lit = M('#55646e', { emissive: '#ffe2a8', emissiveIntensity: 0 });
  place(shopGlass, lit);
  return { group, nightLit: [lit] };
}
