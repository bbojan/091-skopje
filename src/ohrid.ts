// Ohrid and the lake: hand-built monuments on their OSM outlines (`models` in PREP; the generic buildings are
// left out), after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Св. Јован Канео (13th c.): a small cross-in-square church of stone banded with brick (cloisonné), red tiled
//   roofs at two levels, an octagonal drum with blind arches and a tiled cone, the apse toward the lake.
// - Св. Климент и Пантелејмон на Плаошник (rebuilt 2002 on the old foundations): a trefoil plan (side conches),
//   a high drum over the crossing, two small drums at the west corners, the narthex and a tall bell tower at
//   its south-west corner, all in cloisonné with red tiles.
// - Св. Софија (11th c.): a long three-aisled basilica, the nave higher under a tiled gable, a low dome-less
//   east end with the apse; across the west end the 14th-century exonarthex: two storeys, an open gallery of
//   arches on the upper floor between two short corner towers with small domes.
// - Св. Наум (10th c., rebuilt 16th–17th c.): cloisonné, a big drum over the naos and a second over the
//   narthex, an open arcade of round arches round the west and south of the narthex.
// - Залив на коските (Gradište, near Пештани, reconstructed 2008): a timber platform on piles over the bay with
//   thatched huts, a palisade and a footbridge to the shore (a rectangle in the water, `modelRects`).
// - The ancient theatre: built by bitola.ts's theatre code on its outline (key `theatre`).
// Sizes are read off the photos (door ≈ 2.4 m), not measured; outlines from OSM.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch, gable, MU, PV, MV, type Frame } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function ohridFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['kaneo', 12], ['plaosnik', 15], ['sofija', 14], ['naum', 13]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createOhrid(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  const EAST: [number, number] = [1, 0];

  // ---------------- Св. Јован Канео: small, the drum tall for its size
  const kf = M.kaneo ? frame(M.kaneo, terrain, EAST, true) : null;
  if (kf) {
    const p = parts();
    byzChurch(p, kf, { low: 4.6, high: 6.6, drum: { r: Math.min(2.1, kf.W * 0.42), h: 3.4, sides: 8 }, windows: 1 });
    place(p, kf);
  }

  // ---------------- Св. Климент и Пантелејмон (Плаошник)
  const pf = M.plaosnik ? frame(M.plaosnik, terrain, EAST, true) : null;
  if (pf) {
    const p = parts();
    byzChurch(p, pf, { low: 6, high: 8.6, conches: true, minor: 2, narthex: Math.min(5, pf.L * 0.3), drum: { h: 4.2, sides: 8 }, tower: { h: 19, s: 2.1, side: 1 }, windows: 2 });
    place(p, pf);
  }

  // ---------------- Св. Наум: a drum over the naos and one over the narthex, an open arcade round the narthex
  const nf = M.naum ? frame(M.naum, terrain, EAST, true) : null;
  if (nf) {
    const p = parts(), nar = Math.min(6.5, nf.L * 0.45);
    byzChurch(p, nf, { low: 5.2, high: 7.4, narthex: nar, arcade: true, drum: { h: 3.6, sides: 8 }, windows: 1 });
    // the second drum, over the narthex
    const u = -nf.L + nar / 2, r = Math.min(2.2, nf.W * 0.45), y0 = 5.2 + 0.6;
    p.cyl('ashlar', u, 0, 4.4, y0 + 3.2, r, r, 8);
    for (let y = y0 + 0.4; y < y0 + 3; y += 0.7) p.cyl('brick', u, 0, y, y + 0.1, r + 0.03, r + 0.03, 8);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8, ap = r * Math.cos(Math.PI / 8);
      p.put('brick', p.arch(r * 0.62, 2.3, 0.05), u + Math.sin(a) * ap, Math.cos(a) * ap, y0 + 0.4, a);
      p.put('glass', p.arch(r * 0.26, 1.5, 0.08), u + Math.sin(a) * ap, Math.cos(a) * ap, y0 + 0.6, a);
    }
    p.cone('tile', u, 0, y0 + 3.2, r + 0.45, r * 0.55, 8);
    p.cross(u, 0, y0 + 3.2 + r * 0.55, 0.6);
    place(p, nf);
  }

  // ---------------- Св. Софија: the basilica and its two-storey exonarthex at the west end
  const sf = M.sofija ? frame(M.sofija, terrain, EAST, true) : null;
  if (sf) {
    const p = parts(), L = sf.L, W = sf.W, u = sf.under, ex = Math.min(7, L * 0.25), nw = W * 0.42;
    const naveH = 11, aisleH = 7, exH = 9.5, u0 = -L + ex;
    p.box('stoneDark', -L, L, -W, W, u, 0.4);
    // the aisles and the nave
    p.box('ashlar', u0, L - 3, -W, W, 0.4, aisleH);
    p.box('ashlar', u0, L - 3, -nw, nw, aisleH, naveH);
    for (let y = 1.2; y < naveH; y += 0.8) {
      p.box('brick', u0 - 0.03, L - 2.97, -nw - 0.03, nw + 0.03, y, y + 0.1);
      if (y < aisleH) p.box('brick', u0 - 0.03, L - 2.97, -W - 0.03, W + 0.03, y, y + 0.1);
    }
    gable(p, 'tile', 'ashlar', u0, L - 3, -nw, nw, naveH, nw * 0.5);
    for (const sv of [-1, 1]) { // lean-to roofs over the aisles
      p.hip('tile', u0, L - 3, sv > 0 ? nw : -W, sv > 0 ? W : -nw, aisleH, 0.8, 0.3);
      for (let uu = u0 + 3; uu < L - 4; uu += 3.6) {
        p.put('brick', p.arch(1.2, 2.4, 0.05), uu, sv * W, 2.4, sv > 0 ? PV : MV);
        p.put('glass', p.arch(0.8, 2.1, 0.08), uu, sv * W, 2.55, sv > 0 ? PV : MV);
        p.put('glass', p.arch(0.7, 1.5, 0.08), uu, sv * nw, aisleH + 1.1, sv > 0 ? PV : MV); // clerestory
      }
    }
    // the east end: a lower bay and the apse (half cylinder, half cone)
    p.box('ashlar', L - 3, L - 1.2, -W * 0.8, W * 0.8, 0.4, aisleH - 0.8);
    p.hip('tile', L - 3, L - 1.2, -W * 0.8, W * 0.8, aisleH - 0.8, 1, 0.3);
    p.add('ashlar', new THREE.CylinderGeometry(nw, nw, aisleH - 0.4, 12, 1, false, 0, Math.PI).translate(L - 1.2, 0.4 + (aisleH - 0.4) / 2, 0));
    p.add('tile', new THREE.ConeGeometry(nw + 0.3, 1.4, 12, 1, false, 0, Math.PI).translate(L - 1.2, aisleH + 0.7, 0));
    // the exonarthex: ground floor with arched doors, an open upper gallery, two corner towers with domes
    p.box('ashlar', -L, u0, -W, W, 0.4, exH);
    for (let y = 1.2; y < exH; y += 0.8) p.box('brick', -L - 0.03, u0 + 0.03, -W - 0.03, W + 0.03, y, y + 0.1);
    const bays = Math.max(5, Math.round((2 * W) / 2.4)), bw = (2 * W - 4) / bays;
    for (let i = 0; i < bays; i++) {
      const v = -W + 2 + bw * (i + 0.5);
      p.put('dark', p.arch(bw * 0.72, 3.2, 0.08), -L, v, exH - 4.2, MU); // the gallery's arches
      if (i % 2 === 0) { p.put('brick', p.arch(bw * 0.8, 2.9, 0.05), -L, v, 0.4, MU); p.put('door', p.arch(bw * 0.55, 2.6, 0.08), -L, v, 0.4, MU); }
    }
    gable(p, 'tile', 'ashlar', -L, u0, -W + 1.8, W - 1.8, exH, 1.4, true);
    for (const sv of [-1, 1]) {
      const tv = sv * (W - 1.6), tu = -L + ex / 2;
      p.box('ashlar', tu - ex / 2, tu + ex / 2, tv - 1.6, tv + 1.6, exH, exH + 2.6);
      p.cyl('ashlar', tu, tv, exH + 2.6, exH + 3.6, 1.3, 1.3, 8);
      p.dome('lead', tu, tv, exH + 3.6, 1.35, 0.9);
      p.cross(tu, tv, exH + 4.8, 0.45);
    }
    place(p, sf);
  }

  // ---------------- Залив на коските: the pile dwellings on their platform over the bay
  // +u away from the shore (the rectangle's heading in PREP)
  const bf: Frame | null = M.bones ? frame(M.bones, terrain, data.landmarks?.modelAxes?.bones, true) : null;
  if (bf) {
    const p = parts(), L = bf.L, W = bf.W, water = terrain.at(bf.c[0], bf.c[1]);
    // the frame stands on the lake's level; the deck 1.6 m above it on piles
    const deck = water - bf.y + 1.6;
    p.box('wood', -L, L, -W, W, deck - 0.25, deck);
    for (let u = -L + 0.6; u <= L - 0.5; u += 2.2) for (let v = -W + 0.6; v <= W - 0.5; v += 2.2) p.cyl('woodDark', u, v, deck - 3.5, deck - 0.2, 0.13, 0.13, 6);
    // the palisade round it (stakes), open toward the shore (−u)
    for (let t = 0; t < 1; t += 0.012) {
      const per = 4 * (L + W), d = t * per;
      let u: number, v: number;
      if (d < 2 * L) { u = -L + d; v = -W; } else if (d < 2 * L + 2 * W) { u = L; v = -W + d - 2 * L; } else if (d < 4 * L + 2 * W) { u = L - (d - 2 * L - 2 * W); v = W; } else { u = -L; v = W - (d - 4 * L - 2 * W); }
      if (u < -L + 0.1 && Math.abs(v) < 1.8) continue;
      p.cyl('woodDark', u, v, deck, deck + 2.1 + ((t * 977) % 1) * 0.4, 0.09, 0.07, 5);
    }
    // the huts: walls of wattle and daub, steep thatched roofs (gabled), in rows along the deck
    let k = 0;
    for (let u = -L + 4; u < L - 3; u += 7) for (let v = -W + 4; v < W - 3; v += 7) {
      const hu = 2.2 + (k % 3) * 0.3, hv = 1.8;
      p.box('ochre', u - hu, u + hu, v - hv, v + hv, deck, deck + 2.1);
      p.box('woodDark', u - hu - 0.05, u + hu + 0.05, v - hv - 0.05, v + hv + 0.05, deck + 2.05, deck + 2.15);
      gable(p, 'stoneDark', 'ochre', u - hu, u + hu, v - hv, v + hv, deck + 2.1, 2.4, false, 0.5);
      p.put('dark', new THREE.BoxGeometry(0.8, 1.6, 0.06).translate(0, 0.8, 0.03), u - hu, v, deck, MU);
      k++;
    }
    // the footbridge to the shore
    p.box('wood', -L - 40, -L, -0.9, 0.9, deck - 0.2, deck);
    for (let u = -L - 38; u < -L; u += 3) for (const v of [-0.8, 0.8]) p.cyl('woodDark', u, v, deck - 3.5, deck + 0.9, 0.1, 0.1, 5);
    p.box('woodDark', -L - 40, -L, -0.95, -0.85, deck + 0.85, deck + 0.95);
    p.box('woodDark', -L - 40, -L, 0.85, 0.95, deck + 0.85, deck + 0.95);
    place(p, bf);
  }
  return { group, nightLit: [glass] };
}
