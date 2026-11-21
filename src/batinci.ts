// Batinci and its surroundings: hand-built models after photos on Wikimedia Commons (references only, nothing from
// them is in the repo):
// - Марков манастир, Св. Димитрија (1345–1366, built under King Vukašin and finished by Marko): a cross-in-square
//   church of cloisonné masonry (stone blocks framed by brick), one tall octagonal drum with arched windows and a
//   lead dome, the arms under curved lead roofs, an open arched porch at the west end (`byzChurch`).
// Sizes are read off the photos (door ≈ 2.2 m), not measured; the position and outline from OSM.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function batinciFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['markov', 14]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createBatinci(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Марков манастир, Св. Димитрија: +u east to the apse
  const mf = M.markov ? frame(M.markov, terrain, [1, 0], true) : null;
  if (mf) {
    const p = parts();
    byzChurch(p, mf, { wall: 'cloisonne', roof: 'lead', low: 5.2, high: 7.6, narthex: Math.min(4.5, mf.L * 0.32), arcade: true, drum: { h: 4.6, sides: 8 }, windows: 2 });
    place(p, mf);
  }

  return { group, nightLit: [glass] };
}
