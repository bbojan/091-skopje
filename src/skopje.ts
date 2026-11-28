// Skopje: hand-built models after descriptions, on their OSM outlines (`models` in PREP; the generic buildings left out):
// - the three galleons on the Вардар (Skopje 2014, a hotel, a restaurant and a café on replica 17th–18th century
//   sailing ships; OSM 1321594000, 1213928129, 1213928128): a dark wooden hull lofted along the outline, its bow at the
//   outline's narrower end, an ochre band and gun ports, the deck, a raised stern castle with lit windows and a lantern,
//   three masts with yards and furled sails, the bowsprit.
// - Кула АЕК, the telecommunications tower on Водно east of the Millennium Cross (OSM 1178638147, height 155 m; after
//   a photo of 2023 on Wikimedia Commons, „Vodno Telecommunication Tower 2.jpg“, its crane left out): see below.
import * as THREE from 'three';
import { frame, parts, modelKit, toPts } from './models.ts';
import type { Parts } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

const SHIPS = ['galija1', 'galija2', 'galija3'];
const TOWER_H = 155;

/** Walking collision: the tower's base building. */
export function skopjeFootprints(data: CityData): [Flat, number][] {
  const r = data.landmarks?.models?.aekTower;
  return r ? [[r, TOWER_H]] : [];
}

/** A hull lofted along u from −L/2 (stern) to +L/2 (bow): half width `w(t)`, deck height `deck(t)` (t 0 → 1, stern → bow),
 *  the keel at `keel`; the sides, the bottom and the deck closed, the stern a flat transom. */
function hull(L: number, w: (t: number) => number, deck: (t: number) => number, keel: number): { side: THREE.BufferGeometry; top: THREE.BufferGeometry } {
  const N = 24, prof = [[1, 1], [1.04, 0.7], [0.9, 0.35], [0.55, 0.08], [0, 0]]; // [width share, height share above the keel] from the deck edge down
  const sec = (i: number) => {
    const t = i / N, u = -L / 2 + t * L, hw = w(t), d = deck(t);
    return prof.map(([s, h]) => [u, keel + (d - keel) * h, hw * s] as const);
  };
  const side: number[] = [], top: number[] = [];
  const tri = (out: number[], a: readonly number[], b: readonly number[], c: readonly number[]) => out.push(...a, ...c, ...b); // wound outward
  const flip = (p: readonly number[]) => [p[0], p[1], -p[2]] as const;
  for (let i = 0; i < N; i++) {
    const A = sec(i), B = sec(i + 1);
    for (let j = 0; j < prof.length - 1; j++) {
      // starboard (+v) and port (−v), wound outward
      tri(side, A[j], B[j], B[j + 1]); tri(side, A[j], B[j + 1], A[j + 1]);
      tri(side, flip(A[j]), flip(B[j + 1]), flip(B[j])); tri(side, flip(A[j]), flip(A[j + 1]), flip(B[j + 1]));
    }
    tri(top, A[0], flip(B[0]), B[0]); tri(top, A[0], flip(A[0]), flip(B[0])); // the deck
  }
  const S = sec(0); // the transom
  for (let j = 0; j < prof.length - 1; j++) { tri(side, S[j], S[j + 1], flip(S[j + 1])); tri(side, S[j], flip(S[j + 1]), flip(S[j])); }
  const g = (a: number[]) => { const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); b.computeVertexNormals(); return b; };
  return { side: g(side), top: g(top) };
}

function galleon(p: Parts, L: number, W: number, wl: number): void {
  const hw = W / 2;
  const width = (t: number) => hw * (t < 0.12 ? 0.78 + t * 1.6 : t < 0.6 ? 0.97 : Math.max(0.06, 0.97 - ((t - 0.6) / 0.4) ** 1.6 * 0.91));
  const sheer = (t: number) => wl + 3.1 + 0.9 * (1 - t) ** 3 + 1.1 * t ** 4; // the deck rises toward the stern and the bow
  const h = hull(L, width, sheer, wl - 1.6);
  p.add('woodDark', h.side);
  p.add('wood', h.top.translate(0, 0.02, 0));
  // the ochre band along the side under the rail, gun ports on it
  const band = hull(L * 0.94, (t) => width(0.03 + t * 0.94) + 0.06, (t) => sheer(0.03 + t * 0.94) - 0.7, wl + 1.1);
  p.add('ochre', band.side.translate(L * 0.0, 0, 0));
  for (let i = 0; i < 6; i++) {
    const u = -L * 0.26 + i * L * 0.1;
    for (const s of [1, -1]) p.box('dark', u - 0.35, u + 0.35, s * (hw * 0.97 + 0.04) - 0.06, s * (hw * 0.97 + 0.04) + 0.06, wl + 1.8, wl + 2.4);
  }
  // the rail round the deck
  for (const s of [1, -1]) p.box('woodDark', -L * 0.32, L * 0.36, s * hw * 0.94 - 0.08, s * hw * 0.94 + 0.08, sheer(0.5), sheer(0.5) + 0.9);
  // the stern castle: two decks over the last fifth, windows across its stern and sides, a lantern
  const s0 = -L / 2 + 0.2, s1 = -L / 2 + L * 0.24, sw = hw * 0.85, sy = sheer(0.08);
  p.box('wood', s0, s1, -sw, sw, sy - 0.2, sy + 2.4);
  p.box('woodDark', s0 - 0.1, s1 + 0.1, -sw - 0.1, sw + 0.1, sy + 2.4, sy + 2.7);
  p.box('wood', s0, s0 + L * 0.12, -sw * 0.85, sw * 0.85, sy + 2.7, sy + 4.6);
  p.box('woodDark', s0 - 0.1, s0 + L * 0.12 + 0.1, -sw * 0.85 - 0.1, sw * 0.85 + 0.1, sy + 4.6, sy + 4.9);
  for (let k = 0; k < 4; k++) {
    const v = -sw * 0.75 + (k * sw * 1.5) / 3;
    p.box('glass', s0 - 0.14, s0 - 0.04, v - 0.35, v + 0.35, sy + 0.5, sy + 1.6);
    if (k > 0 && k < 3) p.box('glass', s0 - 0.14, s0 - 0.04, v - 0.35, v + 0.35, sy + 3.1, sy + 4.1);
  }
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    const u = s0 + 1 + k * (s1 - s0 - 2) / 2;
    p.box('glass', u - 0.4, u + 0.4, s * sw - 0.05, s * sw + 0.05, sy + 0.6, sy + 1.6);
  }
  p.cyl('gold', s0 - 0.4, 0, sy + 4.9, sy + 6.0, 0.35, 0.25, 8); // the stern lantern
  // the forecastle, low, behind the bow
  const f1 = L / 2 - L * 0.1, f0 = f1 - L * 0.12, fy = sheer(0.78);
  p.box('wood', f0, f1, -width(0.8) * 0.85, width(0.8) * 0.85, fy - 0.2, fy + 1.4);
  p.box('woodDark', f0 - 0.1, f1 + 0.1, -width(0.8) * 0.85 - 0.1, width(0.8) * 0.85 + 0.1, fy + 1.4, fy + 1.65);
  // masts (main the tallest), yards with furled sails, tops, the bowsprit
  const deckY = sheer(0.5);
  const masts: [number, number][] = [[L * 0.2, L * 0.72], [-L * 0.02, L * 0.9], [-L * 0.22, L * 0.58]]; // [u, height] fore, main, mizzen
  for (const [u, mh] of masts) {
    p.cyl('woodDark', u, 0, deckY - 0.5, deckY + mh, 0.32, 0.14, 8);
    p.cyl('woodDark', u, 0, deckY + mh * 0.6, deckY + mh * 0.6 + 0.35, 0.9, 0.9, 8); // the top
    for (const [f, span] of [[0.38, 1.3], [0.62, 1.05], [0.84, 0.75]] as const) {
      const y = deckY + mh * f, half = hw * span;
      p.add('woodDark', new THREE.CylinderGeometry(0.1, 0.1, half * 2, 6).rotateX(Math.PI / 2).translate(u, y, 0));
      p.add('cream', new THREE.CylinderGeometry(0.32, 0.32, half * 1.8, 8).rotateX(Math.PI / 2).translate(u + 0.12, y - 0.38, 0)); // the furled sail
    }
  }
  const bow = L / 2, by = sheer(0.98);
  p.add('woodDark', new THREE.CylinderGeometry(0.09, 0.2, L * 0.28, 6).rotateZ(-Math.PI / 2 + 0.32).translate(bow + L * 0.11, by + L * 0.045, 0));
}

export function createSkopje(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- the galleons: u from the stern (the outline's wider end) to the bow
  for (const k of SHIPS) {
    const r = M[k];
    let f = r ? frame(r, terrain) : null;
    if (!r || !f) continue;
    // the bow is the narrower end: compare the outline's width near each end
    const pts = toPts(r).map(([x, z]) => f!.local(x, z));
    const spread = (s: number) => { const v = pts.filter(([u]) => u * s > f!.L * 0.2).map(([, v]) => v); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
    if (spread(1) > spread(-1)) { const [a0, a1] = f.a; f = frame(r, terrain, [-a0, -a1])!; }
    const p = parts();
    galleon(p, f.L, Math.max(5.5, Math.min(f.W, 9)), f.under + 0.6); // the waterline at the river's surface (the outline's lowest ground)
    place(p, f);
  }

  // ---------------- Кула АЕК (after a photo of 2023, the crane left out): a square shaft with grooved corners, three
  // curved blade legs sweeping out from ~90 m to the ground, round platforms cantilevered to the sides (a three-deck
  // one on the west, a two-deck one on the east, a balcony ring above), the narrower top with ring fins
  const tr = M.aekTower;
  const tf = tr ? frame(tr, terrain, [0, -1]) : null; // +u toward the north
  if (tr && tf) {
    const p = parts(), R = Math.min(tf.L, tf.W) / 2, u = tf.under;
    p.cyl('concrete', 0, 0, u, 0.5, R + 0.3, R + 0.3, 32); // the base slab on the outline
    p.box('concreteDark', -9, -3, 5, 12, 0, 4.5); p.box('concreteDark', 4, 12, -11, -5, 0, 3.5); // low buildings at the foot
    // the shaft: a 10 m square with the corners notched (the grooves), the narrower top
    p.box('white', -5, 5, -3.6, 3.6, u, 118); p.box('white', -3.6, 3.6, -5, 5, u, 118);
    p.box('white', -4, 4, -2.9, 2.9, 118, 149); p.box('white', -2.9, 2.9, -4, 4, 118, 149);
    p.box('concrete', -4.3, 4.3, -4.3, 4.3, 149, 150.5); // the head
    for (const y of [125, 129, 133, 137, 141]) p.cyl('white', 0, 0, y, y + 0.5, 6.2, 6.2, 24); // the ring fins
    p.cyl('iron', 0, 0, 150.5, TOWER_H, 0.35, 0.12, 6); // the lightning rod
    // three legs: curved blades from the foot (~21 m out) up into the shaft's corners
    for (let k = 0; k < 3; k++) {
      const th = Math.PI / 2 + (k * 2 * Math.PI) / 3, d = [Math.cos(th), Math.sin(th)], sd = [-d[1], d[0]];
      const P0 = [22, u], P1 = [4.5, 34], P2 = [4.2, 95]; // quadratic Bézier in (r, y): concave, steepening upward
      const N = 16, ring: number[][][] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, mt = 1 - t;
        const r = mt * mt * P0[0] + 2 * mt * t * P1[0] + t * t * P2[0], y = mt * mt * P0[1] + 2 * mt * t * P1[1] + t * t * P2[1];
        const tr_ = 2 * mt * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), ty = 2 * mt * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
        const l = Math.hypot(tr_, ty), nr = ty / l, ny = -tr_ / l; // the normal in the (r, y) plane, outward
        const a = 1.2 + 0.6 * mt, bw = 2.6 * (1 - 0.35 * t); // half thickness (radial), half width (sideways)
        ring.push([[-a, -bw], [a, -bw], [a, bw], [-a, bw]].map(([na, sb]) => {
          const rr = r + nr * na, yy = y + ny * na;
          return [d[0] * rr + sd[0] * sb, yy, d[1] * rr + sd[1] * sb];
        }));
      }
      const pos: number[] = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++) {
        const A = ring[i][j], B = ring[i][(j + 1) % 4], C = ring[i + 1][(j + 1) % 4], D = ring[i + 1][j];
        pos.push(...A, ...B, ...C, ...A, ...C, ...D);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      p.add('white', g);
    }
    // the platforms: [centre u, v, bottom y, radius, decks, deck height]; soffit, slabs, glazed bands
    const deck = (cu: number, cv: number, y0: number, r: number, n: number, h: number) => {
      p.add('white', new THREE.CylinderGeometry(r * 0.8, r * 0.45, 2, 32).translate(cu, y0 - 1, cv)); // the soffit
      for (let i = 0; i < n; i++) {
        const y = y0 + i * h;
        p.cyl('white', cu, cv, y, y + 0.7, r, r, 32);
        p.cyl('glass', cu, cv, y + 0.7, y + h, r - 0.5, r - 0.5, 32);
      }
      p.cyl('white', cu, cv, y0 + n * h, y0 + n * h + 0.8, r + 0.15, r + 0.15, 32);
    };
    deck(0, -8, 78, 11, 3, 5); // west: the large one, three decks
    deck(0, 9, 97, 8, 2, 4); // east
    deck(0, -0.5, 108, 10.5, 1, 5.5); // the balcony ring
    p.cyl('iron', 0, -0.5, 114.3, 115.5, 10.6, 10.6, 32); // its railing
    place(p, tf);
  }

  return { group, nightLit: [glass] };
}
