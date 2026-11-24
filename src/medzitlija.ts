// Меџитлија: hand-built models after photos on Wikimedia Commons and Esri's aerial image (references only, nothing
// from them is in the repo):
// - the mosque of Меџитлија (Commons, 2023): a plastered prayer hall in pale mauve-grey with brown cornices and
//   pilasters, three tall arched windows on each long side, a copper dome on a low drum; a porch of three arches on
//   two columns and corner pilasters with a small copper dome over it; a slim white minaret at the corner between
//   the hall and the porch (fluted shaft, a carved balcony, a band in brown, a tall silver cone). OSM lacks it: the
//   rectangle (`modelRects.mzdzamija`) and its turn (the dome toward the qibla, south-south-east) are read off the
//   aerial image.
// - the border crossing Меџитлија – Негочани (Νίκη) on the road Битола – Лерин (E65): the Macedonian side's wide
//   canopy over the lanes (grey ribbed roof, ridges along the lanes, the offices along its east side) and the Greek
//   side's larger canopy 450 m south (three dark blue bays along the road). Both from the aerial image only
//   (`modelRects.mzgranica` / `mzgrcka`); heights, columns and booths are guesses.
// - Велушки манастир Св. Ѓорѓи above Велушина (1839, rebuilt after the First World War; mk Wikipedia): the church
//   on OSM's outline (white walls on a stone plinth, a hipped tile roof, round-arched windows, a small apse) with the
//   bell tower north-west of it (stone ground storey with an arch, white middle with a round window, the belfry with
//   brick-red bands and a hipped roof, a cross); the konak on OSM's outline south of it (two white storeys under a
//   hipped roof with chimneys, the gate passage on the south, on the court side white piers under a dark wooden
//   gallery). Which way the tower's arch faces was not checked.
// Sizes read off the photos (door ≈ 2.2 m) and the aerial image (0.45 m a pixel), not measured.
import * as THREE from 'three';
import { frame, parts, modelKit, gable, PU, MU, PV, MV, type Frame } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the mosque, the church and the konak (the canopies stand on columns, open to walk under). */
export function medzitlijaFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['mzdzamija', 7], ['mzvcrkva', 7], ['mzvkonak', 8]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createMedzitlija(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {}, A = data.landmarks?.modelAxes ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  /** ground under a frame's (u, v), relative to its floor */
  const ground = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };

  // ---------------- the mosque: +u toward the qibla (the hall, the dome), −u the porch; +v west-south-west
  const df = M.mzdzamija ? frame(M.mzdzamija, terrain, A.mzdzamija, true) : null;
  if (df) {
    const p = parts(), L = df.L, W = df.W, u = df.under;
    const pu = -L + 4.6, hh = 6.4, ph = 4.6; // the porch's back wall, the hall's and the porch's eaves
    p.box('concreteDark', -L - 0.6, L + 0.3, -W - 0.3, W + 0.3, u, 0.25); // the plinth
    p.box('pink', pu, L, -W, W, 0.25, hh); // the hall
    p.box('concreteDark', pu, L, -W, W, 0.25, 0.8);
    p.box('brick', pu - 0.25, L + 0.25, -W - 0.25, W + 0.25, hh - 0.35, hh); // the brown cornice
    p.box('pink', pu - 0.1, L + 0.1, -W - 0.1, W + 0.1, hh, hh + 0.45); // a low parapet over it
    for (const [cu, cv] of [[L, W], [L, -W], [pu, W], [pu, -W]] as const) p.box('ochre', cu - 0.35, cu + 0.35, cv - 0.35, cv + 0.35, 0.25, hh - 0.35); // pilasters
    // three tall arched windows on each long side, two on the qibla wall
    for (const [v, ang] of [[W, PV], [-W, MV]] as const)
      for (const t of [-0.55, 0, 0.55]) {
        const wu = (pu + L) / 2 + t * (L - pu) * 0.6;
        p.put('ochre', p.arch(1.5, 3.6, 0.05), wu, v, 1.6, ang);
        p.put('glass', p.arch(1.1, 3.3, 0.08), wu, v, 1.75, ang);
      }
    for (const t of [-0.5, 0.5]) { p.put('ochre', p.arch(1.3, 3.0, 0.05), L, t * W, 2.0, PU); p.put('glass', p.arch(0.9, 2.7, 0.08), L, t * W, 2.15, PU); }
    // the flat roof and the dome on a low octagonal drum
    p.box('concreteDark', pu, L, -W, W, hh, hh + 0.2);
    const dc = (pu + L) / 2, dr = Math.min(W * 0.72, 4.6);
    p.cyl('pink', dc, 0, hh, hh + 1.3, dr + 0.2, dr + 0.2, 8);
    p.cyl('brick', dc, 0, hh + 1.15, hh + 1.45, dr + 0.4, dr + 0.4, 8);
    p.dome('brick', dc, 0, hh + 1.45, dr, 0.62);
    p.cyl('gold', dc, 0, hh + 1.45 + dr * 0.62, hh + 2.6 + dr * 0.62, 0.07, 0.07, 6);
    p.add('gold', new THREE.SphereGeometry(0.18, 8, 6).translate(dc, hh + 2.1 + dr * 0.62, 0));
    // the porch: three arches on two columns and the corner pilasters, a flat roof, the small dome, the door
    p.box('concreteDark', -L - 0.4, pu, -W, W, 0.25, 0.4);
    p.box('pink', -L, pu, -W, W, ph - 1.0, ph); // the arcade's wall band
    p.box('brick', -L - 0.25, pu, -W - 0.25, W + 0.25, ph - 0.3, ph);
    for (const v of [-W + 0.35, W - 0.35]) p.box('ochre', -L, -L + 0.7, v - 0.35, v + 0.35, 0.4, ph - 0.3);
    for (const v of [-W / 3, W / 3]) p.cyl('white', -L + 0.35, v, 0.4, ph - 1.0, 0.24, 0.24, 10);
    for (const v of [-W * 2 / 3, 0, W * 2 / 3]) p.put('pink', p.arch((2 * W) / 3 - 0.5, 1.05, 0.12), -L, v, ph - 1.0 - 0.01, MU);
    for (const v of [-W, W]) p.box('pink', -L + 0.7, pu, v - 0.12, v + 0.12, ph - 1.0, ph); // the side walls' band
    p.box('pink', -L, pu, -W, W, ph, ph + 0.35);
    p.box('door', pu - 0.06, pu, -0.8, 0.8, 0.4, 2.8);
    p.cyl('pink', (pu - L) / 2, 0, ph + 0.35, ph + 0.9, 1.8, 1.8, 8);
    p.dome('brick', (pu - L) / 2, 0, ph + 0.9, 1.7, 0.7);
    p.cyl('gold', (pu - L) / 2, 0, ph + 0.9 + 1.2, ph + 2.6, 0.05, 0.05, 6);
    // the minaret at the corner of the hall and the porch, on the +v side
    const mu = pu - 0.2, mv = W + 1.6, r = 1.05;
    p.box('pink', mu - 1.3, mu + 1.3, mv - 1.3, mv + 1.3, u, hh + 0.4); // the square base up to the roof
    p.cyl('white', mu, mv, hh + 0.4, 17.5, r, r * 0.92, 16);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; p.box('concrete', mu + Math.cos(a) * r * 0.93 - 0.05, mu + Math.cos(a) * r * 0.93 + 0.05, mv + Math.sin(a) * r * 0.93 - 0.05, mv + Math.sin(a) * r * 0.93 + 0.05, hh + 1, 16.5); }
    p.cyl('concrete', mu, mv, 17.5, 18.6, r * 0.92, r * 1.45, 16); // the carved corbels under the balcony
    p.cyl('white', mu, mv, 18.6, 19.0, r * 1.5, r * 1.5, 16);
    p.cyl('brick', mu, mv, 19.0, 20.4, r * 0.82, r * 0.82, 16); // the brown band of the upper shaft
    p.cyl('white', mu, mv, 20.4, 23.2, r * 0.75, r * 0.72, 16);
    p.cyl('white', mu, mv, 23.2, 23.5, r * 0.85, r * 0.85, 16);
    p.cone('lead', mu, mv, 23.5, r * 0.8, 6.2, 16);
    p.cyl('gold', mu, mv, 29.6, 30.6, 0.06, 0.06, 6);
    p.add('gold', new THREE.SphereGeometry(0.16, 8, 6).translate(mu, 30.0, mv));
    place(p, df);
  }

  // ---------------- the border crossing's canopies: +u east (the Macedonian side) or north (the Greek side)
  const canopy = (f: Frame, roofK: 'lead' | 'face', bays: number, h: number, alongU: boolean, offices: boolean) => {
    const p = parts(), L = f.L, W = f.W;
    // columns on a grid, a deep fascia round the edge
    const nu = Math.max(2, Math.round((2 * L) / 14)), nv = Math.max(2, Math.round((2 * W) / 14));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const cu = -L + 1 + (i * (2 * L - 2)) / nu, cv = -W + 1 + (j * (2 * W - 2)) / nv;
      p.cyl('concrete', cu, cv, ground(f, cu, cv) - 0.5, h, 0.3, 0.3, 8);
    }
    p.box('concrete', -L, L, -W, W, h, h + 1.2);
    // the roof: `bays` shallow gables, ridges along u (alongU) or v
    const n = bays, span = alongU ? 2 * W : 2 * L;
    for (let k = 0; k < n; k++) {
      const s0 = -span / 2 + (k * span) / n, s1 = s0 + span / n;
      if (alongU) gable(p, roofK, 'concreteDark', -L, L, s0, s1, h + 1.2, Math.min(2.4, (s1 - s0) * 0.12), false, 0.25);
      else gable(p, roofK, 'concreteDark', s0, s1, -W, W, h + 1.2, Math.min(2.4, (s1 - s0) * 0.12), true, 0.25);
    }
    // booths between the lanes, under the canopy
    const lanes = alongU ? 2 * W : 2 * L, nb = Math.max(2, Math.floor(lanes / 9));
    for (let k = 1; k < nb; k++) {
      const s = -lanes / 2 + (k * lanes) / nb;
      const [bu, bv] = alongU ? [0, s] : [s, 0];
      const g = ground(f, bu, bv);
      p.box('concreteDark', bu - (alongU ? 8 : 0.9), bu + (alongU ? 8 : 0.9), bv - (alongU ? 0.9 : 8), bv + (alongU ? 0.9 : 8), g - 0.3, g + 0.2); // the island
      p.box('white', bu - 1.3, bu + 1.3, bv - 1.3, bv + 1.3, g + 0.2, g + 2.7);
      p.box('glass', bu - 1.32, bu + 1.32, bv - 1.32, bv + 1.32, g + 1.2, g + 2.3);
      p.box('concreteDark', bu - 1.5, bu + 1.5, bv - 1.5, bv + 1.5, g + 2.7, g + 2.95);
    }
    // the offices: a long white two-storey block along the canopy's east edge (the Macedonian side)
    if (offices) {
      const g = ground(f, L - 5, 0);
      p.box('white', L - 9, L - 1, -W + 2, W - 2, Math.min(g, f.under) - 0.3, g + 6.2);
      p.box('concreteDark', L - 9.2, L - 0.8, -W + 1.8, W - 1.8, g + 6.2, g + 6.6);
      for (let v = -W + 4; v < W - 3; v += 3) for (const y of [1.0, 4.0]) p.put('glass', new THREE.BoxGeometry(1.6, 1.3, 0.1).translate(0, 0.65, 0.03), L - 9, v, g + y, MU);
    }
    place(p, f);
  };
  const mk = M.mzgranica ? frame(M.mzgranica, terrain, A.mzgranica, true) : null;
  if (mk) canopy(mk, 'lead', 6, 6.4, false, true);
  const gr = M.mzgrcka ? frame(M.mzgrcka, terrain, A.mzgrcka, true) : null;
  if (gr) canopy(gr, 'face', 3, 7.2, true, false);

  // ---------------- Велушки манастир, the church Св. Ѓорѓи: +u east (the apse), +v south (the konak)
  const cf = M.mzvcrkva ? frame(M.mzvcrkva, terrain, [1, 0], true) : null;
  if (cf) {
    const p = parts(), L = cf.L, W = cf.W, u = cf.under, eh = 5.4;
    const ua = L - 1.6; // the hall's east wall; the apse beyond it
    p.box('stone', -L, ua, -W, W, u, 0.8);
    p.box('plaster', -L, ua, -W, W, 0.8, eh);
    for (const [v, ang] of [[W, PV], [-W, MV]] as const)
      for (let k = 0; k < 5; k++) {
        const wu = -L + 2.2 + (k * (ua + L - 4.4)) / 4;
        p.put('dark', p.arch(1.1, 2.3, 0.08), wu, v, 1.8, ang);
      }
    for (const v of [-W * 0.45, W * 0.45]) p.put('dark', p.arch(0.8, 1.6, 0.08), -L, v, 2.2, MU);
    p.box('door', -L - 0.06, -L, -0.7, 0.7, 0.8, 3.0);
    p.hip('tile', -L, ua, -W, W, eh, Math.min(3.2, W * 0.5), 0.55);
    // the apse: a half cylinder with a half-cone roof
    const ar = Math.min(W * 0.55, 3.2);
    p.add('stone', new THREE.CylinderGeometry(ar, ar, 0.8 - u, 12, 1, false, 0, Math.PI).translate(ua, (u + 0.8) / 2, 0));
    p.add('plaster', new THREE.CylinderGeometry(ar, ar, eh - 1.4, 12, 1, false, 0, Math.PI).translate(ua, 0.8 + (eh - 1.4) / 2, 0));
    p.add('tile', new THREE.ConeGeometry(ar + 0.35, 1.3, 12, 1, false, 0, Math.PI).translate(ua, eh - 0.6 + 0.65, 0));
    p.cross(0, 0, eh + Math.min(3.2, W * 0.5), 0.45);
    // the bell tower north-west of the church
    const tu = -L * 0.45, tv = -W - 3.2, ts = 1.8, g = ground(cf, tu, tv);
    p.box('stone', tu - ts, tu + ts, tv - ts, tv + ts, g - 0.6, g + 4.2);
    p.put('dark', p.arch(1.4, 2.6, 0.08), tu, tv - ts, g, MV);
    p.box('tile', tu - ts - 0.35, tu + ts + 0.35, tv - ts - 0.35, tv + ts + 0.35, g + 4.2, g + 4.5);
    p.box('plaster', tu - ts + 0.1, tu + ts - 0.1, tv - ts + 0.1, tv + ts - 0.1, g + 4.5, g + 7.6);
    for (const [du, dv, ang] of [[0, -ts + 0.1, MV], [0, ts - 0.1, PV], [-ts + 0.1, 0, MU], [ts - 0.1, 0, PU]] as const) {
      p.put('dark', new THREE.CylinderGeometry(0.45, 0.45, 0.08, 14).rotateX(Math.PI / 2).translate(0, 0, 0.04), tu + du, tv + dv, g + 6.2, ang);
      for (const s of [-0.5, 0.5]) p.put('dark', p.arch(0.7, 1.6, 0.08), tu + du + (dv !== 0 ? s : 0), tv + dv + (du !== 0 ? s : 0), g + 8.0, ang);
    }
    p.box('plaster', tu - ts + 0.1, tu + ts - 0.1, tv - ts + 0.1, tv + ts - 0.1, g + 7.6, g + 10.2);
    for (const y of [7.6, 9.9]) p.box('brick', tu - ts + 0.05, tu + ts - 0.05, tv - ts + 0.05, tv + ts - 0.05, g + y, g + y + 0.18);
    p.box('woodDark', tu - ts - 0.4, tu + ts + 0.4, tv - ts - 0.4, tv + ts + 0.4, g + 10.2, g + 10.35);
    p.hip('tile', tu - ts + 0.1, tu + ts - 0.1, tv - ts + 0.1, tv + ts - 0.1, g + 10.35, 1.3, 0.35);
    p.cross(tu, tv, g + 11.6, 0.5);
    place(p, cf);
  }

  // ---------------- Велушки манастир, the konak south of the church: +u east, +v south (the gate side)
  const kf = M.mzvkonak ? frame(M.mzvkonak, terrain, [1, 0], true) : null;
  if (kf) {
    const p = parts(), L = kf.L, W = kf.W, u = kf.under, eh = 6.6;
    p.box('stoneDark', -L, L, -W, W, u, 0.4);
    p.box('plaster', -L, L, -W, W, 0.4, eh);
    // the gate passage through the south front, windows in two rows round the house
    p.box('dark', -1.6, 1.6, W - 0.05, W + 0.03, 0.4, 3.4);
    p.box('woodDark', -1.8, 1.8, W, W + 0.08, 3.4, 3.6);
    for (let k = 0; k < Math.floor((2 * L) / 3.2); k++) {
      const wu = -L + 1.8 + k * 3.2;
      if (wu > L - 1) break;
      if (Math.abs(wu) > 2.4) p.put('dark', new THREE.BoxGeometry(0.9, 1.2, 0.08).translate(0, 0.6, 0.04), wu, W, 1.6, PV);
      p.put('dark', new THREE.BoxGeometry(0.9, 1.3, 0.08).translate(0, 0.65, 0.04), wu, W, 4.4, PV);
    }
    for (const [uu, ang] of [[L, PU], [-L, MU]] as const) for (const y of [1.6, 4.4]) for (const s of [-0.4, 0.4]) p.put('dark', new THREE.BoxGeometry(0.9, 1.2, 0.08).translate(0, 0.6, 0.04), uu, s * W, y, ang);
    // the court side (−v): white piers under a dark wooden gallery along the upper storey
    const gv = -W - 2.0;
    p.box('concreteDark', -L + 0.5, L - 0.5, gv, -W, 0.2, 0.4);
    for (let uu = -L + 1; uu <= L - 0.9; uu += 3.4) p.box('white', uu - 0.3, uu + 0.3, gv, gv + 0.6, 0.4, 3.2);
    p.box('woodDark', -L + 0.5, L - 0.5, gv, -W, 3.2, 3.45);
    p.box('woodDark', -L + 0.5, L - 0.5, gv, gv + 0.12, 3.45, 4.4); // the gallery's parapet
    for (let uu = -L + 1; uu <= L - 0.9; uu += 3.4) p.box('woodDark', uu - 0.1, uu + 0.1, gv, gv + 0.2, 4.4, eh);
    for (let uu = -L + 2.7; uu < L - 1; uu += 3.4) p.put('dark', new THREE.BoxGeometry(1.0, 1.4, 0.08).translate(0, 0.7, 0.04), uu, -W, 3.8, MV);
    p.hip('tile', -L, L, gv, W, eh, Math.min(3.0, (W + 1) * 0.45), 0.6);
    // chimneys
    for (const cu of [-L * 0.75, -L * 0.25, L * 0.3, L * 0.8]) p.box('plaster', cu - 0.4, cu + 0.4, -0.4, 0.4, eh + 1.4, eh + 3.3);
    for (const cu of [-L * 0.75, -L * 0.25, L * 0.3, L * 0.8]) p.box('brick', cu - 0.5, cu + 0.5, -0.5, 0.5, eh + 3.3, eh + 3.55);
    place(p, kf);
  }

  return { group, nightLit: [glass] };
}
