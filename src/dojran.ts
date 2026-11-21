// Dojran: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Саат-кула of Стар Дојран (restored in 2021): a square shaft of grey rubble stone on a slightly wider plinth, a
//   few slit windows, a moulded cornice, a clock face on each side just below it, and on top a small open
//   timber stage on four posts under a low pyramid roof.
// - Св. Илија: a large basilica of stone with brick courses under one hipped roof of red tiles; three polygonal
//   apses at the east end with their own tiled half-cones, arched windows, the door in the south wall, a small
//   square tower with arched openings at the south-west corner.
// - A мандра, the old way of fishing on Дојранско Езеро (a museum model and photos of 2013): fences of reeds tied
//   to stakes standing in the shallow water, an outer pen split into chambers with leading arms, a reed hut on
//   stilts with a deck and railing, a plank walkway from the shore; not in OSM, placed off the pier north of
//   Стар Дојран (`modelRects.mandra`).
// Sizes are read off the photos (door ≈ 2.2 m, people), not measured; positions from OSM.
import * as THREE from 'three';
import { frame, parts, modelKit, PU, MU, PV, MV } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function dojranFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['dclock', 16], ['ilija', 13]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createDojran(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Саат-кула (≈ 15 m, OSM height 15)
  const cf = M.dclock ? frame(M.dclock, terrain) : null;
  if (cf) {
    const p = parts(), h = Math.max(1.9, Math.min(cf.L, cf.W, 2.6)), u = cf.under, S = 12.6;
    p.box('stoneDark', -h - 0.25, h + 0.25, -h - 0.25, h + 0.25, u, 1.4); // plinth
    p.box('stone', -h, h, -h, h, 1.4, S);
    p.box('cream', -h - 0.2, h + 0.2, -h - 0.2, h + 0.2, S, S + 0.45); // cornice
    for (const [ang, du, dv] of [[PU, h, 0], [MU, -h, 0], [PV, 0, h], [MV, 0, -h]] as const) {
      p.put('white', new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20).rotateX(Math.PI / 2).translate(0, 0, 0.03), du, dv, S - 1.0, ang);
      p.put('dark', new THREE.BoxGeometry(0.06, 0.48, 0.05).translate(0, 0.2, 0.08), du, dv, S - 1.0, ang); // hands
      p.put('dark', new THREE.BoxGeometry(0.34, 0.06, 0.05).translate(0.15, 0, 0.08), du, dv, S - 1.0, ang);
      for (const y of [5, 8.5]) p.put('dark', new THREE.BoxGeometry(0.18, 0.9, 0.06).translate(0, 0.45, 0.03), du, dv, y, ang); // slit windows
    }
    // the open timber stage on four posts under a low pyramid roof
    const t = h - 0.25, top = S + 0.45, ph = 1.7;
    p.box('woodDark', -h, h, -h, h, top, top + 0.15);
    for (const [a, b] of [[-t, -t], [t, -t], [t, t], [-t, t]]) p.box('woodDark', a - 0.12, a + 0.12, b - 0.12, b + 0.12, top, top + ph);
    p.add('woodDark', new THREE.ConeGeometry(h * 1.55, 1.0, 4).rotateY(Math.PI / 4).translate(0, top + ph + 0.5, 0));
    place(p, cf);
  }

  // ---------------- Св. Илија: +u east to the apses, +v south
  const bf = M.ilija ? frame(M.ilija, terrain, [1, 0], true) : null;
  if (bf) {
    const p = parts(), L = bf.L, W = bf.W, eave = Math.min(9, 4 + W * 0.45), u = bf.under;
    const ua = L - Math.min(3.5, L * 0.2); // the apses' wall line
    p.box('stoneDark', -L, ua, -W, W, u, 0.5);
    p.box('stone', -L, ua, -W, W, 0.5, eave);
    for (const y of [2.6, 5.4, eave - 0.6]) p.bands('brick', [[-L, -W], [ua, -W], [ua, W], [-L, W]], [y], 0.22, 0.04); // brick courses
    p.hip('tile', -L, ua, -W, W, eave, Math.min(5, W * 0.55), 0.5);
    // three polygonal apses with tiled half-cones
    for (const [v, r, h] of [[0, Math.min(3.4, W * 0.32), eave - 1.6], [-W * 0.62, Math.min(2.0, W * 0.18), eave - 3.4], [W * 0.62, Math.min(2.0, W * 0.18), eave - 3.4]] as const) {
      p.add('stone', new THREE.CylinderGeometry(r, r, h - u, 7, 1, false, 0, Math.PI).translate(ua, (h + u) / 2, v));
      p.add('tile', new THREE.ConeGeometry(r + 0.3, r * 0.6, 7, 1, false, 0, Math.PI).translate(ua, h + r * 0.3, v));
      p.put('glass', p.arch(0.6, 1.6, 0.06), ua + r, v, h - 2.6, PU);
    }
    // arched windows along both long sides, the door in the south wall
    const n = Math.max(3, Math.round((L + ua) / 5));
    for (let i = 0; i < n; i++) {
      const uu = -L + ((i + 0.5) * (ua + L)) / n;
      for (const sv of [-1, 1]) {
        p.put('brick', p.arch(1.3, 2.4, 0.04), uu, sv * W, eave - 3.6, sv > 0 ? PV : MV);
        p.put('glass', p.arch(0.8, 2.0, 0.07), uu, sv * W, eave - 3.5, sv > 0 ? PV : MV);
      }
    }
    p.put('door', p.arch(1.6, 2.6, 0.1), -L * 0.25, W, 0.5, PV);
    p.put('door', p.arch(1.6, 2.6, 0.1), -L, 0, 0.5, MU);
    // the small tower at the south-west corner
    const s = 2.1, tu = -L + s - 0.6, tv = W + s - 0.3, th = eave + 1.2;
    p.box('stone', tu - s, tu + s, tv - s, tv + s, u, th);
    for (const [ang, du, dv] of [[PU, s, 0], [MU, -s, 0], [PV, 0, s], [MV, 0, -s]] as const) p.put('dark', p.arch(1.0, 1.9, 0.07), tu + du, tv + dv, th - 2.6, ang);
    p.add('slate', new THREE.ConeGeometry(s * 1.5, 1.4, 4).rotateY(Math.PI / 4).translate(tu, th + 0.7, tv));
    p.cross(tu, tv, th + 1.4, 0.5);
    p.cross(-L + 0.5, 0, eave + Math.min(5, W * 0.55), 0.6);
    place(p, bf);
  }

  // ---------------- a мандра off the pier: +u east into the lake, +v south; y 0 is just above the water
  const mf = M.mandra ? frame(M.mandra, terrain, [1, 0]) : null;
  if (mf) {
    const p = parts(), L = mf.L, W = mf.W, d = mf.under - 0.4; // the stakes stand in the lake bed
    const fence = (u0: number, v0: number, u1: number, v1: number) => {
      const len = Math.hypot(u1 - u0, v1 - v0), ang = Math.atan2(v1 - v0, u1 - u0);
      p.add('ochre', new THREE.BoxGeometry(len, 1.25 - d, 0.07).translate(len / 2, (1.25 + d) / 2, 0).rotateY(-ang).translate(u0, 0, v0));
      const k = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= k; i++) {
        const f = i / k;
        p.cyl('woodDark', u0 + (u1 - u0) * f, v0 + (v1 - v0) * f, d, 1.7 + ((i * 7) % 3) * 0.15, 0.05, 0.05, 5);
      }
    };
    const path = (pts: [number, number][]) => { for (let i = 0; i + 1 < pts.length; i++) fence(...pts[i], ...pts[i + 1]); };
    // the outer pen, its chambers and the funnel between them
    const u0 = -L * 0.45, u1 = L * 0.9, v0 = -W * 0.8, v1 = W * 0.8;
    path([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    path([[u0, v0], [u0, -2.5]]); path([[u0, 2.5], [u0, v1]]); // the mouth facing the hut
    const um = (u0 + u1) / 2;
    path([[um, v0], [um, -3]]); path([[um, 3], [um, v1]]);
    path([[um, -3], [um + 6, -0.8]]); path([[um, 3], [um + 6, 0.8]]); // the funnel into the inner chamber
    path([[um, 0], [u1, 0]]);
    // leading arms reaching out from the corners
    path([[u1, v0], [u1 + 10, v0 - 9]]); path([[u1, v1], [u1 + 10, v1 + 9]]);
    path([[u0, v0], [u0 - 4, v0 - 8]]); path([[u0, v1], [u0 - 4, v1 + 8]]);
    // the reed hut on stilts with a deck and railing
    const hu = -L * 0.72, hv = 0, hs = 3, fl = 1.6;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) p.cyl('woodDark', hu + a * (hs + 1.2), hv + b * (hs + 1.2), d, fl, 0.12, 0.12, 6);
    p.box('wood', hu - hs - 1.4, hu + hs + 1.4, hv - hs - 1.4, hv + hs + 1.4, fl - 0.15, fl); // deck
    p.box('ochre', hu - hs, hu + hs, hv - hs, hv + hs, fl, fl + 2.3); // reed walls
    p.put('dark', new THREE.BoxGeometry(1.0, 1.9, 0.06).translate(0, 0.95, 0.03), hu, hv + hs, fl, PV); // door
    p.hip('wood', hu - hs, hu + hs, hv - hs, hv + hs, fl + 2.3, 1.6, 0.6); // the thatch
    for (const [a0, b0, a1, b1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [-1, 1, 1, 1]] as const) {
      const r = hs + 1.35;
      p.box('woodDark', hu + Math.min(a0, a1) * r - 0.05, hu + Math.max(a0, a1) * r + 0.05, hv + Math.min(b0, b1) * r - 0.05, hv + Math.max(b0, b1) * r + 0.05, fl + 0.9, fl + 1.0);
    }
    // the plank walkway from the beach to the deck: west (−u) until the ground rises out of the water
    const wu1 = hu - hs - 1.4;
    let wu0 = wu1 - 10;
    while (wu0 > wu1 - 220) { const [x, z] = mf.world(wu0, 0); if (terrain.at(x, z) - mf.y > -0.1) break; wu0 -= 2; }
    wu0 -= 3;
    p.box('wood', wu0, wu1, -1.0, 1.0, fl - 0.15, fl);
    for (let uu = wu0 + 1; uu < wu1; uu += 3) for (const sv of [-1, 1]) {
      p.cyl('woodDark', uu, sv * 0.9, d, fl + 1.0, 0.09, 0.09, 5);
    }
    for (const sv of [-1, 1]) p.box('woodDark', wu0, wu1, sv * 0.95 - 0.04, sv * 0.95 + 0.04, fl + 0.9, fl + 0.98); // handrails
    // a flat-bottomed boat tied at the walkway
    p.box('lead', wu1 - 9, wu1 - 4.5, 1.3, 2.5, -0.1, 0.45);
    place(p, mf);
  }
  return { group, nightLit: [glass] };
}
