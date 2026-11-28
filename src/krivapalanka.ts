// Крива Паланка: hand-built models after descriptions and the OSM outlines, no photos measured:
// - Осоговски манастир, Св. Јоаким Осоговски (the large church, mid-19th century): a cross-in-square church of stone
//   with brick courses, a tall drum over the crossing and four small ones at the corners, an open arcade along the
//   narthex, tiled roofs (`byzChurch`). Sizes are guesses from the outline (about 25 × 17 m).
// - its small, older church Рождество на Пресвета Богородица beside it (about 10 × 8 m): one low drum, stone.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function krivapalankaFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['kposogovo', 18], ['kpsmall', 9]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createKrivapalanka(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Осоговски манастир, Св. Јоаким Осоговски: +u east to the apse
  const jf = M.kposogovo ? frame(M.kposogovo, terrain, [1, 0], true) : null;
  if (jf) {
    const p = parts();
    byzChurch(p, jf, { wall: 'cloisonne', roof: 'tile', low: 6.5, high: 9.5, narthex: Math.min(6, jf.L * 0.3), arcade: true, minor: 4, drum: { h: 6.5, sides: 8 }, windows: 2 });
    place(p, jf);
  }
  // ---------------- the small church Рождество на Пресвета Богородица
  const bf = M.kpsmall ? frame(M.kpsmall, terrain, [1, 0], true) : null;
  if (bf) {
    const p = parts();
    byzChurch(p, bf, { wall: 'stone', roof: 'tile', low: 3.8, high: 5, drum: { h: 2.6, sides: 8 }, windows: 1 });
    place(p, bf);
  }

  return { group, nightLit: [glass] };
}
