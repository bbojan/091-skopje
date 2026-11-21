// Makedonski Brod: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in
// the repo):
// - Св. Преображение of Зрзе monastery (on its cliff over the Пелагонија edge): a long, low church of rubble stone
//   under one hipped roof of red tiles, a small open timber belfry on posts under a hipped roof over its west end,
//   a semicircular apse at the east end.
// - The arch dam of Акумулација Света Петка on the Треска (2012): a thin concrete wall in the gorge, curved toward
//   the lake, built like Берово's with `archDam` (src/berovo.ts) on OSM's crest line.
// The church's size comes from its OSM outline; heights are read off the photos (door ≈ 2.2 m), not measured.
// Козјак's rockfill dam is not modelled: the DEM already holds its body (the lake at 468 m, the face down to 385 m).
import * as THREE from 'three';
import { frame, parts, modelKit, PU, MU, PV, MV } from './models.ts';
import { archDam } from './berovo.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function brodFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['zrze', 8]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createBrod(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Св. Преображение, Зрзе: +u east to the apse; the belfry over the west end
  const zf = M.zrze ? frame(M.zrze, terrain, [1, 0], true) : null;
  if (zf) {
    const p = parts(), L = zf.L, W = zf.W, u = zf.under, eave = 4.6, ar = Math.min(2.6, W * 0.5), b1 = L - ar * 0.9;
    p.box('stoneDark', -L, b1, -W, W, u, 0.45);
    p.box('stone', -L, b1, -W, W, 0.45, eave);
    p.bands('stoneDark', [[-L, -W], [b1, -W], [b1, W], [-L, W]], [1.5, 3.1], 0.14, 0.03);
    p.add('stone', new THREE.CylinderGeometry(ar, ar, eave - 0.9 - u, 12, 1, false, 0, Math.PI).translate(b1, (eave - 0.9 + u) / 2, 0));
    p.add('tile', new THREE.ConeGeometry(ar + 0.35, 1.3, 12, 1, false, 0, Math.PI).translate(b1, eave - 0.9 + 0.65, 0));
    p.put('glass', p.arch(0.4, 1.0, 0.06), b1 + ar, 0, 2.2, PU);
    p.put('door', p.arch(1.3, 2.3, 0.1), -L, 0, 0.45, MU);
    for (let uu = -L + 3; uu < b1 - 1.5; uu += 3.6) for (const sv of [-1, 1]) p.put('glass', p.arch(0.55, 1.1, 0.06), uu, sv * W, 2.6, sv > 0 ? PV : MV);
    p.hip('tile', -L, b1, -W, W, eave, Math.min(2.8, W * 0.55), 0.6);
    // the open belfry: four posts on the roof's west end, a railing, a small hipped roof, the cross
    const bu = -L + 2.2, s = 1.5, y0 = eave + 1.2;
    p.box('woodDark', bu - s, bu + s, -s, s, y0 - 0.3, y0);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.box('woodDark', bu + a * (s - 0.15) - 0.12, bu + a * (s - 0.15) + 0.12, b * (s - 0.15) - 0.12, b * (s - 0.15) + 0.12, y0, y0 + 2.2);
    for (const sv of [-1, 1]) p.box('wood', bu - s, bu + s, sv * s - 0.05, sv * s + 0.05, y0 + 0.8, y0 + 0.9);
    p.box('dark', bu - s * 0.7, bu + s * 0.7, -s * 0.7, s * 0.7, y0, y0 + 2.0);
    p.hip('tile', bu - s, bu + s, -s, s, y0 + 2.2, 1.1, 0.35);
    p.cross(bu, 0, y0 + 3.3, 0.4);
    place(p, zf);
  }

  // ---------------- the arch dam of Света Петка on OSM's crest line
  const df = M.spdam ? frame(M.spdam, terrain) : null;
  if (df) { const p = parts(); archDam(p, df, M.spdam, terrain); place(p, df); }

  return { group, nightLit: [glass] };
}
