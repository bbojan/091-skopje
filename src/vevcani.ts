// Вевчани: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Св. Никола, the village's main church: a large basilica of grey ashlar with small square windows under a hipped
//   roof of red tiles, a slim bell tower (stone below, an open belfry of brick with arches, a small tiled pyramid) at
//   the joint with a white two-storey annex (stone ground floor with arched windows, a loggia and arched windows
//   above, a hipped tile roof). OSM draws the whole row as one untagged outline (34 × 13 m; the photos' GPS is 20 m
//   from it). Which end is the church (east here) was not checked against an aerial image.
// - Вевчански извори: the springs, the Вевчанска flowing out of them between wooden railings, crossed by small
//   wooden footbridges (four, where OSM has one path bridge; positions along OSM's river line, `modelRects`).
// Heights are read off the photos (door ≈ 2.2 m), not measured.
import * as THREE from 'three';
import { frame, parts, modelKit, PU, MU, PV, MV } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function vevcaniFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['vvnikola', 10]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createVevcani(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Св. Никола: +u east; the church over the east 60 %, the white annex to the west
  const nf = M.vvnikola ? frame(M.vvnikola, terrain, [1, 0], true) : null;
  if (nf) {
    const p = parts(), L = nf.L, W = nf.W, u = nf.under, j = -L + 2 * L * 0.4; // the joint
    const ce = 8.2, ae = 6.8; // eaves: church, annex
    // the church: ashlar walls, small square windows in two rows, a door on the south, the hipped roof
    p.box('ashlar', j, L, -W, W, u, ce);
    p.bands('stoneDark', [[j, -W], [L, -W], [L, W], [j, W]], [0.6], 0.12, 0.04);
    for (let uu = j + 2.5; uu < L - 1.5; uu += 3.2) for (const sv of [-1, 1]) for (const y of [2.6, 5.8])
      p.box('dark', uu - 0.45, uu + 0.45, sv * W - 0.05, sv * W + 0.05, y, y + 0.9);
    p.put('door', p.arch(1.4, 2.4, 0.1), (j + L) / 2, W, 0, PV);
    p.hip('tile', j, L, -W, W, ce, Math.min(3.2, W * 0.55), 0.5);
    // the annex: stone ground floor with arched windows, white upper floor with a loggia and arched windows
    const a0 = -L, a1 = j - 0.01, w2 = W * 0.92;
    p.box('stone', a0, a1, -w2, w2, u, 3.2);
    p.box('white', a0, a1, -w2, w2, 3.2, ae);
    for (let uu = a0 + 1.6; uu < a1 - 1; uu += 2.2) {
      p.put('glass', p.arch(0.8, 1.5, 0.06), uu, w2, 0.9, PV);
      p.put('glass', p.arch(0.8, 1.6, 0.06), uu, w2, 4.3, PV);
      p.put('glass', p.arch(0.8, 1.5, 0.06), uu, -w2, 0.9, MV);
    }
    p.put('glass', p.arch(0.8, 1.6, 0.06), a0, 0, 4.3, MU);
    p.box('dark', a1 - 2.6, a1 - 0.2, w2 - 0.6, w2 + 0.02, 3.6, 6.0); // the loggia by the tower
    p.hip('tile', a0, a1, -w2, w2, ae, Math.min(2.6, w2 * 0.5), 0.45);
    // the bell tower at the joint, on the south side: stone shaft, brick belfry with an arch each way, a tiled pyramid
    const tu = j, tv = W - 1.4, s = 1.4, t1 = ce + 2.2, t2 = t1 + 3.0;
    p.box('stone', tu - s, tu + s, tv - s, tv + s, u, t1);
    p.box('brick', tu - s, tu + s, tv - s, tv + s, t1, t2);
    for (const [du, dv, ang] of [[s, 0, PU], [-s, 0, MU], [0, s, PV], [0, -s, MV]] as const)
      p.put('dark', p.arch(1.2, 1.9, 0.08), tu + du, tv + dv, t1 + 0.5, ang);
    p.box('stoneDark', tu - s - 0.15, tu + s + 0.15, tv - s - 0.15, tv + s + 0.15, t2, t2 + 0.3);
    p.add('tile', new THREE.ConeGeometry(s * 1.45, 2.2, 4, 1).rotateY(Math.PI / 4).translate(tu, t2 + 0.3 + 1.1, tv));
    p.cross(tu, tv, t2 + 2.6, 0.5);
    place(p, nf);
  }

  // ---------------- the wooden footbridges over the Вевчанска below the springs: +u across the stream
  for (const k of ['vbr1', 'vbr2', 'vbr3', 'vbr4']) {
    const bf = M[k] ? frame(M[k], terrain) : null;
    if (!bf) continue;
    const p = parts(), L = bf.L, W = bf.W, d = 0.25, arch = 0.35;
    // the deck in three planks rising a little to the middle, posts and two handrails
    for (const [u0, u1, y] of [[-L, -L / 3, 0], [-L / 3, L / 3, arch], [L / 3, L, 0]] as const) p.box('wood', u0, u1, -W, W, y - d, y);
    for (const uu of [-L, -L / 3, L / 3, L]) for (const sv of [-1, 1]) {
      const y = Math.abs(uu) < L / 2 ? arch : 0;
      p.box('woodDark', uu - 0.07, uu + 0.07, sv * W - 0.07, sv * W + 0.07, Math.min(y - d, bf.under), y + 1.0);
    }
    for (const sv of [-1, 1]) for (const [u0, u1, y] of [[-L, -L / 3, 0], [-L / 3, L / 3, arch], [L / 3, L, 0]] as const)
      p.box('woodDark', u0, u1, sv * W - 0.05, sv * W + 0.05, y + 0.9, y + 1.0);
    place(p, bf);
  }

  return { group, nightLit: [glass] };
}
