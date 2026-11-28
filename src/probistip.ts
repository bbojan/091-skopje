// Пробиштип and its surroundings: a hand-built model after descriptions (mk / en Wikipedia) and the OSM outline, no
// photos measured:
// - Лесновски манастир, Св. Архангел Михаил (1341, built by the despot Јован Оливер; the narthex added in 1346–1349):
//   a cross-in-square church of stone and brick, one tall drum with arched windows over the crossing, tiled roofs, the
//   narthex at the west end (`byzChurch`). Sizes are guesses from the outline (door ≈ 2.2 m).
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the model's outline and height. */
export function probistipFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['lesnovo', 15]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createProbistip(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Лесново, Св. Архангел Михаил: +u east to the apse
  const lf = M.lesnovo ? frame(M.lesnovo, terrain, [1, 0], true) : null;
  if (lf) {
    const p = parts();
    byzChurch(p, lf, { wall: 'cloisonne', roof: 'tile', low: 5.6, high: 8, narthex: Math.min(5, lf.L * 0.34), drum: { h: 5.5, sides: 8 }, windows: 2 });
    place(p, lf);
  }

  return { group, nightLit: [glass] };
}
