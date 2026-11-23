// Матка: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Св. Андреја (1388/89, built by Andrej, son of King Vukašin) by the lake at the dam: a cross-shaped church of
//   cloisonné masonry (stone with brick courses), a tall octagonal drum with arched windows, grey sheet-metal roofs
//   on the arms and the dome (`byzChurch`).
// - Св. Никола Шишевски (14th century) on the cliffs east of the lake: a small domed church of cloisonné masonry
//   with a tall octagonal drum, and a longer, lower part under a stone-slab roof (`byzChurch` with a narthex).
//   Which end carries the drum was not checked against an aerial image: the drum is put over the east part.
// - Брана Матка (1938, 29.5 m, OSM `height`): a thin concrete arch wall in the mouth of the canyon, curved toward the
//   lake, with a walkway on its crest; built like Берово's and Брод's with `archDam` (src/berovo.ts) on OSM's crest line.
// Sizes come from the OSM outlines; heights are read off the photos (door ≈ 2.2 m), not measured.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch } from './models.ts';
import { archDam } from './berovo.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function matkaFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['andrej', 12], ['sisevo', 11]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createMatka(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Св. Андреја: +u east to the apse
  const af = M.andrej ? frame(M.andrej, terrain, [1, 0], true) : null;
  if (af) {
    const p = parts();
    byzChurch(p, af, { wall: 'cloisonne', roof: 'lead', low: 5.0, high: 7.4, drum: { h: 5.2, sides: 8 }, windows: 1 });
    place(p, af);
  }

  // ---------------- Св. Никола Шишевски: the domed church at +u (east), the lower stone-roofed part to the west
  const sf = M.sisevo ? frame(M.sisevo, terrain, [1, 0], true) : null;
  if (sf) {
    const p = parts();
    byzChurch(p, sf, { wall: 'cloisonne', roof: 'slate', low: 4.4, high: 6.4, narthex: Math.min(5.5, sf.L * 0.85), drum: { h: 4.8, sides: 8 }, windows: 1 });
    place(p, sf);
  }

  // ---------------- Брана Матка: the arch dam on OSM's crest line
  const df = M.mdam ? frame(M.mdam, terrain) : null;
  if (df) { const p = parts(); archDam(p, df, M.mdam, terrain); place(p, df); }

  return { group, nightLit: [glass] };
}
