// Makedonska Kamenica: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Успение на Пресвета Богородица, the church on the town square: walls of warm brown stone with brick courses,
//   tiled roofs, polygonal apses at the east end and on both sides (a trefoil plan), a tall octagonal drum with
//   arched windows over the crossing, a small bell tower with a cupola at the south-west corner, gold crosses.
// - The square's fountain south of the church: a wide round basin of grey granite, three stepped round tiers
//   with water running over their rims, a fluted column and a bowl, a white statue of a woman on top.
// Sizes are read off the photos (door ≈ 2.4 m, benches), not measured; positions from OSM.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function kamenicaFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['uspenie', 14]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createKamenica(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Успение на Пресвета Богородица: +u east to the apse, +v south toward the square
  const cf = M.uspenie ? frame(M.uspenie, terrain, [1, 0], true) : null;
  if (cf) {
    const p = parts();
    byzChurch(p, cf, {
      wall: 'stone', low: 6, high: 8.6, conches: true, narthex: Math.min(5, cf.L * 0.3),
      drum: { h: 4.4, sides: 8 }, tower: { h: 15, s: 1.7, side: 1 }, windows: 1,
    });
    place(p, cf);
  }

  // ---------------- the fountain on the square (≈ 12 m across, ≈ 7.5 m to the statue's head)
  const ff = M.kfountain ? frame(M.kfountain, terrain) : null;
  if (ff) {
    const p = parts(), y0 = ff.under + 0.6, R = Math.min(6, ff.L * 0.95);
    p.cyl('slate', 0, 0, ff.under, y0 + 0.55, R, R, 40); // the basin's wall
    p.cyl('water', 0, 0, y0 + 0.35, y0 + 0.42, R - 0.35, R - 0.35, 40);
    // three stepped tiers, water a little below each rim
    const tiers: [number, number][] = [[3.3, 1.0], [2.4, 0.95], [1.5, 0.9]];
    let y = y0 + 0.4;
    for (const [r, h] of tiers) {
      p.cyl('slate', 0, 0, y, y + h, r, r, 32);
      p.cyl('water', 0, 0, y + h - 0.12, y + h - 0.05, r - 0.2, r - 0.2, 32);
      p.cyl('concreteDark', 0, 0, y + h - 0.05, y + h + 0.06, r + 0.06, r + 0.06, 32); // the rim
      y += h;
    }
    // the column, the bowl and the statue
    p.cyl('slate', 0, 0, y, y + 1.6, 0.35, 0.28, 12);
    p.add('slate', new THREE.CylinderGeometry(1.4, 0.35, 0.5, 24, 1, true).translate(0, y + 1.85, 0));
    p.cyl('water', 0, 0, y + 1.95, y + 2.0, 1.3, 1.3, 24);
    const s = y + 2.1;
    p.cyl('white', 0, 0, s, s + 0.25, 0.45, 0.45, 12); // plinth
    p.cyl('white', 0, 0, s + 0.25, s + 1.55, 0.42, 0.24, 12); // the long robe
    p.cyl('white', 0, 0, s + 1.55, s + 1.75, 0.22, 0.14, 10); // shoulders and neck
    p.add('white', new THREE.SphereGeometry(0.15, 10, 8).translate(0, s + 1.88, 0));
    p.add('white', new THREE.BoxGeometry(0.12, 0.55, 0.12).rotateX(-0.5).translate(0, s + 1.35, 0.18)); // arms held forward
    place(p, ff);
  }
  return { group, nightLit: [glass] };
}
