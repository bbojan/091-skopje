// Демир Капија: hand-built models after photos on Wikimedia Commons and the aerial image (references only, nothing
// from them is in the repo):
// - Попова Кула (winery 2004, hotel and restaurant 2009): the 17 m tower in grey rubble stone with small arched windows,
//   its white tasting room on top overhanging on all sides (four arched windows a side) under a low tiled hip; the long
//   wing beside it with a stone arcade on the ground floor toward the lawn, a timber gallery and white walls above and a
//   tiled roof with dormers; the white wing on the other side of the tower (stone plinth, arched windows, tiled hip).
//   On OSM's outline of the hotel; the tower stands where the outline steps between the two wings (the photos from the
//   lawn: the arcade wing on its left, the white wing set back on its right).
// - Хотел Вердисо (14 rooms, restaurant for 350, pool; booking pages): only the aerial image and those descriptions, no
//   photo of the outside was found. The plan is OSM's; two storeys with balconies toward the lawn, dark roofs (as on the
//   aerial image), the glazed restaurant terrace with a white roof on the lawn side, the pool south-south-east of it.
// - Кралска винарија Кралица Марија (King Aleksandar's estate, 1928; the queen's villa, visited 1934): Вила Марија after
//   a photo of 2014 (ochre walls on a rusticated stone plinth, paired arched windows upstairs, an arched loggia, the
//   terracotta caryatids the locals call „момичките“) and its grey hip roof on the aerial image; the peacocks of the park
//   (Винотика, 2016); the yard of steel tanks between the old cellar's two halls and the amphitheatre (stage and the
//   curved rows of seats) as on the aerial image. The halls, the apartments and the restaurant are OSM / Overture
//   buildings.
import * as THREE from 'three';
import { parts, modelKit, toPts, frame, gable, PU, MU, PV, MV, type Frame, type Parts } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

/** Walking collision: the buildings (the amphitheatre stays open). */
export function demirkapijaFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['dkpopova', 17], ['dkverdisso', 9], ['dkvila', 10], ['dkcisterni', 8], ['dkpodrum', 8]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

/** A frame on an outline with its u axis along a given compass heading (radians from north toward east), centred on
 *  the outline's extent in that frame: the models below are laid out in it from the aerial image. */
function axisFrame(r: Flat, terrain: Terrain, heading: number): Frame {
  const pts = toPts(r), a: Pt = [Math.sin(heading), -Math.cos(heading)], b: Pt = [-a[1], a[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) {
    const u = x * a[0] + z * a[1], v = x * b[0] + z * b[1];
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, c: Pt = [a[0] * cu + b[0] * cv, a[1] * cu + b[1] * cv];
  const hs = pts.map(([x, z]) => terrain.at(x, z));
  const y = Math.max(...hs) + 0.2, under = Math.min(...hs) - y - 0.6;
  const m = new THREE.Matrix4().set(a[0], 0, b[0], c[0], 0, 1, 0, y, a[1], 0, b[1], c[1], 0, 0, 0, 1);
  return {
    c, a, b, L: (u1 - u0) / 2, W: (v1 - v0) / 2, y, under, m,
    local: (x, z) => [(x - c[0]) * a[0] + (z - c[1]) * a[1], (x - c[0]) * b[0] + (z - c[1]) * b[1]],
    world: (u, v) => [c[0] + a[0] * u + b[0] * v, c[1] + a[1] * u + b[1] * v],
  };
}

/** the faces of a box (u0…u1, v0…v1): [middle u, middle v, length, facing angle, along-u?] */
const faces = (u0: number, u1: number, v0: number, v1: number) => [
  [(u0 + u1) / 2, v1, u1 - u0, PV, true], [(u0 + u1) / 2, v0, u1 - u0, MV, true],
  [u1, (v0 + v1) / 2, v1 - v0, PU, false], [u0, (v0 + v1) / 2, v1 - v0, MU, false],
] as const;

/** a row of features along a face: f(u, v) at n evenly spaced points (margins m) */
function along(u: number, v: number, len: number, alongU: boolean, n: number, m: number, f: (u: number, v: number) => void) {
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + m + ((len - 2 * m) * (i + 0.5)) / n;
    f(alongU ? u + t : u, alongU ? v : v + t);
  }
}

/** a stone wall's rubble: a few slightly darker blocks scattered over a box's faces */
function rubble(p: Parts, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
  for (const [u, v, len, ang, alongU] of faces(u0, u1, v0, v1)) {
    const n = Math.round(((y1 - y0) * len) / 3.5);
    for (let i = 0; i < n; i++) {
      const w = 0.5 + rnd() * 0.6, h = 0.25 + rnd() * 0.25, t = (rnd() - 0.5) * (len - w), y = y0 + 0.2 + rnd() * (y1 - y0 - 0.5);
      p.put('stoneDark', new THREE.BoxGeometry(w, h, 0.06), alongU ? u + t : u, alongU ? v : v + t, y, ang);
    }
  }
}

export function createDemirkapija(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {}, A = data.landmarks?.modelAxes ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  /** ground under a frame's (u, v), relative to its floor */
  const ground = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };

  // ---------------- Попова Кула: +u north-east along the wings, +v south-east toward the lawn
  if (M.dkpopova) {
    const f = axisFrame(M.dkpopova, terrain, 0.871), p = parts(), u = f.under;
    // the main block behind the arcade wing (kitchens, cellar, rooms): stone ground floor, white above, a tiled hip
    p.box('stone', -28.1, 11.6, -14.9, 7.3, u, 3.6);
    rubble(p, -28.1, 11.6, -14.9, 7.3, u, 3.6, 7);
    p.box('plaster', -28.1, 11.6, -14.9, 7.3, 3.6, 6.6);
    p.box('woodDark', -28.4, 11.9, -15.2, 7.6, 6.45, 6.65);
    p.hip('tile', -28.1, 11.6, -14.9, 7.3, 6.6, 2.6, 0.8);
    for (const [fu, fv, len, ang, alU] of faces(-28.1, 11.6, -14.9, 7.3)) {
      if (ang === PV) continue; // behind the arcade wing
      along(fu, fv, len, alU, Math.max(1, Math.round(len / 3.4)), 1.2, (uu, vv) => p.put('glass', p.arch(1.0, 1.6, 0.1), uu, vv, 4.6, ang));
    }
    // the arcade wing toward the lawn: arches in stone on the ground floor, the timber gallery and white walls above
    const a0 = -15.1, a1 = 11.0, b0 = 7.3, b1 = 14.9;
    p.box('stone', a0, a1, b0, b1 - 1.6, u, 3.8);
    const piers = 8;
    for (let i = 0; i <= piers; i++) { const uu = a0 + 0.45 + ((a1 - a0 - 0.9) * i) / piers; p.box('stone', uu - 0.45, uu + 0.45, b1 - 1.6, b1, u, 3.8); }
    p.box('stone', a0, a1, b1 - 1.6, b1, 2.9, 3.8);
    for (let i = 0; i < piers; i++) {
      const uu = a0 + 0.45 + ((a1 - a0 - 0.9) * (i + 0.5)) / piers;
      p.put('dark', p.arch(2.2, 2.9, 0.08), uu, b1, 0.0, PV);
    }
    p.box('ashlar', a0, a1, b1 - 1.6, b1 - 0.4, -0.05, 0.05); // the paved walk under the arches
    rubble(p, a0, a1, b0, b1, 0.2, 3.7, 11);
    p.box('plaster', a0, a1, b0, b1 - 0.9, 3.8, 6.6);
    p.box('woodDark', a0 - 0.2, a1 + 0.2, b0, b1 + 0.2, 3.8, 4.0); // the gallery's floor beam
    p.box('wood', a0, a1, b1 - 0.05, b1 + 0.15, 4.0, 5.0); // its parapet of boards
    for (let uu = a0; uu <= a1 + 0.01; uu += (a1 - a0) / 7) p.box('woodDark', uu - 0.12, uu + 0.12, b1 - 0.05, b1 + 0.15, 4.0, 6.6);
    along((a0 + a1) / 2, b1 - 0.9, a1 - a0, true, 7, 0.8, (uu, vv) => p.put('glass', new THREE.BoxGeometry(2.4, 1.9, 0.1).translate(0, 0.95, 0.04), uu, vv, 4.3, PV));
    p.hip('tile', a0, a1, b0 - 1.5, b1, 6.6, 3.2, 0.9);
    // dormers on the lawn side of the roof
    for (let i = 0; i < 4; i++) {
      const uu = a0 + 3 + (i * (a1 - a0 - 6)) / 3, vv = b1 - 1.2;
      p.box('plaster', uu - 0.9, uu + 0.9, vv - 1.2, vv, 6.6, 8.2);
      p.put('glass', new THREE.BoxGeometry(1.2, 1.0, 0.1).translate(0, 0.5, 0.04), uu, vv, 6.85, PV);
      gable(p, 'tile', 'plaster', uu - 1.1, uu + 1.1, vv - 1.6, vv + 0.25, 8.2, 0.8, true, 0.15);
    }
    // the white wing beyond the tower (north-east): stone plinth, white walls, arched windows, a tiled hip
    const w0 = 11.6, w1 = 28.1, x0 = -8.9, x1 = 7.2;
    p.box('stone', w0, w1, x0, x1, u, 1.0);
    p.box('plaster', w0, w1, x0, x1, 1.0, 9.0);
    p.box('woodDark', w0 - 0.3, w1 + 0.3, x0 - 0.3, x1 + 0.3, 8.8, 9.05);
    p.hip('tile', w0, w1, x0, x1, 9.0, 2.8, 0.8);
    p.box('brick', 20, 20.8, -2, -1.2, 9.5, 13.4); // the chimney (wine red)
    for (const [fu, fv, len, ang, alU] of faces(w0, w1, x0, x1)) {
      if (ang === MU) continue; // against the tower and the main block
      const n = Math.max(1, Math.round(len / 3.2));
      along(fu, fv, len, alU, n, 1.0, (uu, vv) => {
        p.put('glass', new THREE.BoxGeometry(1.0, 1.3, 0.1).translate(0, 0.65, 0.04), uu, vv, 1.9, ang);
        p.put('glass', new THREE.BoxGeometry(1.0, 1.3, 0.1).translate(0, 0.65, 0.04), uu, vv, 4.3, ang);
        p.put('woodDark', new THREE.BoxGeometry(1.25, 2.45, 0.06).translate(0, 1.22, 0.01), uu, vv, 6.3, ang);
        p.put('glass', p.arch(1.0, 2.3, 0.1), uu, vv, 6.35, ang);
      });
    }
    // the tower: grey rubble stone to 13.2 m, the white tasting room overhanging 0.7 m, a low tiled hip to 17 m
    const tu = 13.2, tv = 8.8, ts = 2.8, top = 13.6, room = 16.5;
    p.box('stone', tu - ts, tu + ts, tv - ts, tv + ts, u, top);
    rubble(p, tu - ts, tu + ts, tv - ts, tv + ts, 0.3, top - 0.2, 23);
    for (const [fu, fv, len, ang, alU] of faces(tu - ts, tu + ts, tv - ts, tv + ts)) {
      void len; void alU;
      for (const y of [1.4, 4.6, 7.4, 10.2]) p.put('dark', p.arch(0.6, 1.2, 0.08), fu, fv, y, ang);
    }
    p.put('door', p.arch(1.4, 2.6, 0.12), tu, tv + ts, 0, PV);
    const r = ts + 0.7;
    p.box('plaster', tu - r + 0.2, tu + r - 0.2, tv - r + 0.2, tv + r - 0.2, top - 0.6, top);
    p.box('white', tu - r, tu + r, tv - r, tv + r, top, room);
    p.box('woodDark', tu - r - 0.1, tu + r + 0.1, tv - r - 0.1, tv + r + 0.1, room - 0.15, room + 0.05);
    for (const [fu, fv, , ang, alU] of faces(tu - r, tu + r, tv - r, tv + r))
      along(fu, fv, 2 * r, alU, 4, 0.5, (uu, vv) => {
        p.put('woodDark', p.arch(1.1, 1.9, 0.06), uu, vv, top + 0.6, ang);
        p.put('glass', p.arch(0.9, 1.75, 0.1), uu, vv, top + 0.65, ang);
      });
    p.hip('tile', tu - r, tu + r, tv - r, tv + r, room + 0.05, 0.9, 0.45);
    // the lawn's low hedge of cypresses in front is left to the generated trees; the wine-red benches under the arcade
    for (let i = 0; i < 3; i++) p.box('brick', a0 + 4 + i * 7, a0 + 5.6 + i * 7, b1 + 1.2, b1 + 1.7, ground(f, a0 + 5 + i * 7, b1 + 1.4), ground(f, a0 + 5 + i * 7, b1 + 1.4) + 0.45);
    place(p, f);
  }
  // the lawn in front of the arcade (kept free of generated trees): cypresses along its edges, a few round shrubs
  const lf = M.dkpopovalawn ? frame(M.dkpopovalawn, terrain, A.dkpopovalawn, true) : null;
  if (lf) {
    const p = parts(), L = lf.L, W = lf.W;
    const cypress = (u: number, v: number, h: number) => { const g = ground(lf, u, v); p.cyl('woodDark', u, v, g - 0.2, g + 0.5, 0.12); p.add('green', new THREE.CylinderGeometry(0.15, 0.75, h, 9).translate(u, g + 0.4 + h / 2, v)); };
    for (let i = 0; i <= 8; i++) cypress(-L + 2 + (i * (2 * L - 4)) / 8, -W + 2.5, 3.2 + (i % 3) * 0.5);
    for (let i = 0; i <= 3; i++) cypress(-L + 1.5, -W + 6 + i * 4.5, 3.5);
    for (const [u, v] of [[-8, 2], [6, -1], [14, 5], [-16, 6]] as const) { const g = ground(lf, u, v); p.add('green', new THREE.SphereGeometry(0.9, 10, 8).scale(1, 0.8, 1).translate(u, g + 0.6, v)); }
    // the white sunshade and tables of the summer terrace by the arcade
    for (const [u, v] of [[-12, -W + 6], [-6, -W + 6.5], [0, -W + 6]] as const) {
      const g = ground(lf, u, v);
      p.cyl('woodDark', u, v, g, g + 2.4, 0.05);
      p.cone('white', u, v, g + 2.2, 1.5, 0.6, 8);
      p.cyl('wood', u, v, g, g + 0.75, 0.6, 0.6, 10);
    }
    place(p, lf);
  }

  // ---------------- Хотел Вердисо: +u north-north-west along the long bar, +v east-north-east toward the lawn and the pool
  if (M.dkverdisso) {
    const f = axisFrame(M.dkverdisso, terrain, -0.527), p = parts(), u = f.under;
    const ring = toPts(M.dkverdisso).map(([x, z]) => f.local(x, z));
    const G = 4.0, F = 7.0; // the restaurant's floor, the rooms' floor
    p.walls('stoneDark', ring, u, 0.6);
    p.walls('cream', ring, 0.6, G);
    p.walls('plaster', ring, G, F);
    p.bands('woodDark', ring, [G - 0.15], 0.22, 0.12);
    p.bands('slate', ring, [F - 0.1], 0.25, 0.3);
    // windows round the outline: tall glazing downstairs (the restaurant), windows upstairs
    p.edges(ring, (eu, ev, len, ang) => {
      const n = Math.max(1, Math.round(len / 3.6));
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (len * (i + 0.5)) / n;
        p.put('glass', new THREE.BoxGeometry(Math.min(2.4, len / n - 0.8), 2.4, 0.1).translate(t, 1.2, 0.04), eu, ev, 0.8, ang);
        p.put('glass', new THREE.BoxGeometry(Math.min(1.4, len / n - 0.8), 1.5, 0.1).translate(t, 0.75, 0.04), eu, ev, G + 0.8, ang);
      }
    });
    // the roofs: hips over the long bar and the wings, dark as on the aerial image
    p.hip('slate', -24.4, 24.4, 2.0, 18.0, F, 4.0, 0.7);
    p.hip('slate', 3.1, 16.6, -18.0, 2.0, F, 3.6, 0.7);
    p.hip('slate', -11.2, 3.1, -8.3, 2.0, F, 2.8, 0.6);
    p.hip('slate', 16.6, 24.4, -4.6, 2.0, F, 2.2, 0.5);
    // balconies of the rooms toward the lawn
    for (let i = 0; i < 7; i++) {
      const uu = -20.5 + i * 6.8;
      p.box('concrete', uu - 1.6, uu + 1.6, 18.0, 19.3, G + 0.05, G + 0.3);
      p.box('iron', uu - 1.6, uu + 1.6, 19.25, 19.32, G + 0.3, G + 1.3);
      p.put('door', new THREE.BoxGeometry(1.0, 2.2, 0.1).translate(0, 1.1, 0.05), uu + 0.9, 18.0, G + 0.3, PV);
    }
    // the glazed restaurant terrace on the lawn side under a white roof
    const t0 = -17, t1 = -3, s0 = 18.0, s1 = 23.5;
    p.box('concrete', t0, t1, s0, s1, u, 0.3);
    p.box('white', t0 - 0.3, t1 + 0.3, s0, s1 + 0.4, 3.2, 3.5);
    for (let uu = t0; uu <= t1 + 0.01; uu += (t1 - t0) / 5) p.box('white', uu - 0.12, uu + 0.12, s1 - 0.24, s1, 0.3, 3.2);
    p.box('glass', t0, t1, s1 - 0.14, s1 - 0.1, 0.3, 3.2);
    // the entrance on the north-north-west end: a canopy over the doors
    p.box('woodDark', 21.5, 27.2, 6.5, 13.5, 3.2, 3.45);
    for (const vv of [7, 13]) p.box('woodDark', 26.8, 27.1, vv - 0.15, vv + 0.15, 0, 3.2);
    place(p, f);

    // the pool south-south-east of the hotel, on its own ground: the water, a white coping, a deck, sun loungers
    const pu = -55, pv = 27, pl = 6, pw = 3, gp = ground(f, pu, pv);
    const q = parts();
    q.box('concrete', pu - pl - 2.5, pu + pl + 2.5, pv - pw - 2.5, pv + pw + 2.5, gp - 0.8, gp + 0.12);
    q.box('white', pu - pl - 0.4, pu + pl + 0.4, pv - pw - 0.4, pv + pw + 0.4, gp + 0.12, gp + 0.2);
    q.box('water', pu - pl, pu + pl, pv - pw, pv + pw, gp + 0.15, gp + 0.22);
    for (let i = 0; i < 4; i++) {
      const vv = pv - pw + 0.8 + i * 1.6;
      q.box('white', pu + pl + 0.8, pu + pl + 2.3, vv - 0.35, vv + 0.35, gp + 0.12, gp + 0.42);
    }
    // two parasols
    for (const vv of [pv - 2, pv + 2]) {
      q.cyl('woodDark', pu - pl - 1.4, vv, gp + 0.12, gp + 2.3, 0.05);
      q.cone('white', pu - pl - 1.4, vv, gp + 2.1, 1.2, 0.5, 8);
    }
    place(q, f);
  }

  // ---------------- Вила Марија: +u north-west along the villa, +v north-east; the loggia at the south-east end
  const vf = M.dkvila ? frame(M.dkvila, terrain, A.dkvila, true) : null;
  if (vf) {
    const p = parts(), L = vf.L, W = vf.W, u = vf.under, P = 1.2, g1 = 4.6, g2 = 8.2;
    // rusticated stone plinth, ochre walls, a cornice, the grey hip roof
    p.box('stoneDark', -L, L, -W, W, u, P);
    for (const [fu, fv, len, ang, alU] of faces(-L, L, -W, W)) {
      along(fu, fv, len, alU, Math.round(len / 1.4), 0.1, (uu, vv) => p.put('stone', new THREE.BoxGeometry(1.2, 0.5, 0.08), uu, vv, 0.35, ang));
      along(fu, fv, len, alU, Math.round(len / 1.4), 0.8, (uu, vv) => p.put('stone', new THREE.BoxGeometry(1.2, 0.5, 0.08), uu, vv, -0.25, ang));
    }
    p.box('ochre', -L + 4.2, L, -W, W, P, g2);
    p.box('ochre', -L, -L + 4.2, -W, W, g1, g2); // above the loggia
    p.box('cream', -L - 0.2, L + 0.2, -W - 0.2, W + 0.2, g1 - 0.15, g1 + 0.1); // the string course
    p.box('cream', -L - 0.35, L + 0.35, -W - 0.35, W + 0.35, g2 - 0.3, g2);
    p.hip('slate', -L, L, -W, W, g2, 3.6, 0.7);
    for (const cv of [-W * 0.45, W * 0.45]) p.box('cream', 3 - 0.4, 3 + 0.4, cv - 0.4, cv + 0.4, g2 + 1.5, g2 + 3.4); // chimneys
    // windows: plain below, paired arched ones upstairs in a cream frame
    for (const [fu, fv, len, ang, alU] of faces(-L, L, -W, W)) {
      if (ang === MU) continue; // the loggia's end
      const n = Math.max(1, Math.round(len / 3.6));
      along(fu, fv, len, alU, n, 1.4, (uu, vv) => {
        p.put('woodDark', new THREE.BoxGeometry(1.3, 1.9, 0.06).translate(0, 0.95, 0.01), uu, vv, P + 0.9, ang);
        p.put('glass', new THREE.BoxGeometry(1.1, 1.7, 0.1).translate(0, 0.85, 0.04), uu, vv, P + 1.0, ang);
        p.put('cream', new THREE.BoxGeometry(1.9, 2.3, 0.06).translate(0, 1.15, 0.01), uu, vv, g1 + 0.5, ang);
        for (const s of [-0.45, 0.45]) p.put('glass', p.arch(0.62, 1.9, 0.1).translate(s, 0, 0.02), uu, vv, g1 + 0.65, ang);
      });
    }
    // the loggia at the south-east end: arches on stone piers over the plinth, a terrace above it
    p.box('stone', -L, -L + 4.2, -W, W, P - 0.05, P + 0.05);
    for (const vv of [-W + 0.4, -W / 3, W / 3, W - 0.4]) p.box('ashlar', -L, -L + 0.8, vv - 0.4, vv + 0.4, P, g1 - 0.15);
    for (const vv of [-W + 0.4, W - 0.4]) for (const uu of [-L + 2, -L + 3.8]) p.box('ashlar', uu - 0.4, uu + 0.4, vv - 0.4, vv + 0.4, P, g1 - 0.15);
    p.box('ashlar', -L, -L + 0.8, -W, W, g1 - 0.85, g1 - 0.15); // the lintel over the three openings
    p.box('ashlar', -L, -L + 4.2, -W, -W + 0.8, g1 - 0.85, g1 - 0.15);
    p.box('ashlar', -L, -L + 4.2, W - 0.8, W, g1 - 0.85, g1 - 0.15);
    p.box('ochre', -L + 4.0, -L + 4.2, -W, W, P, g1); // the house wall behind the loggia
    p.put('door', new THREE.BoxGeometry(1.4, 2.6, 0.1).translate(0, 1.3, 0.05), -L + 4.2, 0, P, MU);
    p.box('stone', -L - 0.1, -L + 4.2, -W - 0.1, W + 0.1, g1 + 0.1, g1 + 0.95); // the terrace's parapet
    // steps down to the lawn in front of the loggia
    for (let i = 0; i < 3; i++) p.box('stone', -L - 1.0 - i * 0.4, -L, -1.6 - i * 0.2, 1.6 + i * 0.2, ground(vf, -L - 1.5, 0) - 0.3, P - 0.4 * i);
    // the two terracotta caryatids either side of the steps (a figure in draped robes on a stone block)
    for (const sv of [-1, 1]) {
      const cu = -L - 2.2, cv = sv * 2.4, g = ground(vf, cu, cv);
      p.box('stone', cu - 0.4, cu + 0.4, cv - 0.4, cv + 0.4, g - 0.3, g + 0.9);
      p.cyl('brick', cu, cv, g + 0.9, g + 2.3, 0.32, 0.2, 10);
      p.cyl('brick', cu, cv, g + 2.3, g + 2.55, 0.12, 0.12, 8);
      p.add('brick', new THREE.SphereGeometry(0.17, 10, 8).translate(cu, g + 2.68, cv));
      p.cyl('brick', cu, cv, g + 2.82, g + 2.9, 0.22, 0.22, 10); // the basket on her head
    }
    place(p, vf);

    // the park's old trees round the villa (not on the lawn in front of the loggia)
    const park = parts();
    for (const [tu, tv, r] of [[L + 6, -8, 3.4], [L + 7, 4, 3.8], [L + 2, 13, 3.2], [-2, 14, 3.6], [-9, -14, 3.0], [3, -15, 3.5], [L + 12, -2, 3.0], [-L + 1, 13.5, 2.8], [-L - 14, 12, 3.6], [-L - 16, -10, 3.2]] as const) {
      const g = ground(vf, tu, tv);
      park.cyl('woodDark', tu, tv, g - 0.3, g + r * 1.1, 0.3, 0.22, 7);
      for (const [du, dy, dv, rr] of [[0, 0, 0, 1], [0.45, -0.35, 0.3, 0.7], [-0.4, -0.3, -0.35, 0.72]] as const)
        park.add('green', new THREE.IcosahedronGeometry(r * rr, 1).translate(tu + du * r, g + r * 1.9 + dy * r, tv + dv * r));
    }
    place(park, vf);

    // the peacocks of the park, on the lawn south-east of the villa: one with its tail fanned, two trailing theirs
    const pk = parts();
    const peacock = (cu: number, cv: number, ang: number, fan: boolean) => {
      const g = ground(vf, cu, cv), q = parts(), S = 1.3;
      q.add('face', new THREE.SphereGeometry(0.22, 10, 8).scale(1.4, 1, 1).translate(0, 0.45, 0));
      q.cyl('face', 0.24, 0, 0.5, 0.95, 0.07, 0.05, 6);
      q.add('face', new THREE.SphereGeometry(0.08, 8, 6).translate(0.26, 1.0, 0));
      q.cyl('gold', 0.26, 0, 1.06, 1.16, 0.005, 0.03, 5); // the crest
      for (const s of [-0.06, 0.06]) q.box('iron', -0.02, 0.02, s - 0.01, s + 0.01, 0, 0.3);
      if (fan) {
        q.add('copper', new THREE.CircleGeometry(1.05, 20, 0, Math.PI).rotateY(Math.PI / 2).translate(-0.28, 0.35, 0));
        for (let k = 0; k < 7; k++) {
          const a = 0.25 + (k * (Math.PI - 0.5)) / 6;
          q.add('gold', new THREE.CircleGeometry(0.07, 8).rotateY(-Math.PI / 2).translate(-0.27, 0.35 + Math.sin(a) * 0.85, Math.cos(a) * 0.85));
          q.add('face', new THREE.CircleGeometry(0.04, 8).rotateY(-Math.PI / 2).translate(-0.265, 0.35 + Math.sin(a) * 0.85, Math.cos(a) * 0.85));
        }
      } else q.add('copper', new THREE.BoxGeometry(1.1, 0.05, 0.3).translate(-0.75, 0.32, 0));
      for (const [k, list] of q.map) for (const geo of list) pk.add(k, geo.scale(S, S, S).rotateY(ang).translate(cu, g, cv));
    };
    peacock(-L - 7, 3.5, 0.6, true);
    peacock(-L - 9.5, -2, 2.2, false);
    peacock(-L - 5, -6, -0.9, false);
    place(pk, vf);
  }

  // ---------------- the yard of steel tanks between the two halls of the cellar: +u east-north-east along the rows,
  // the halls along both long sides (tiled hips, cream walls), the tanks in three rows between them
  const cf = M.dkcisterni ? frame(M.dkcisterni, terrain, A.dkcisterni, true) : null;
  if (cf) {
    const p = parts(), u = cf.under;
    for (const sv of [-1, 1]) {
      const h0 = sv > 0 ? 11 : -21, h1 = h0 + 10, hu0 = sv > 0 ? -20 : -21.5, hu1 = sv > 0 ? 20 : 22.5;
      p.box('stoneDark', hu0, hu1, h0, h1, u, 0.8);
      p.box('cream', hu0, hu1, h0, h1, 0.8, 6.2);
      p.box('cream', hu0 - 0.2, hu1 + 0.2, h0 - 0.2, h1 + 0.2, 5.9, 6.2);
      p.hip('tile', hu0, hu1, h0, h1, 6.2, 2.6, 0.6);
      for (const [fu, fv, len, ang, alU] of faces(hu0, hu1, h0, h1))
        along(fu, fv, len, alU, Math.max(1, Math.round(len / 4)), 1.5, (uu, vv) => p.put('glass', p.arch(1.1, 1.8, 0.1), uu, vv, 2.6, ang));
      p.put('door', new THREE.BoxGeometry(3.2, 3.4, 0.1).translate(0, 1.7, 0.05), 0, sv > 0 ? h0 : h1, 0, sv > 0 ? MV : PV);
    }
    p.box('concrete', -19, 19, -11, 11, u, 0.2);
    const rows = 3, cols = 8, r = 1.55;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const tu = -16.5 + (i * 33) / (cols - 1), tv = -6.5 + j * 6.5, h = 6.5 + ((i + j) % 3) * 0.6;
      p.cyl('lead', tu, tv, 0.9, h, r, r, 14);
      p.cone('white', tu, tv, h, r, 0.7, 14);
      for (const a of [0, 2.1, 4.2]) p.box('iron', tu + Math.cos(a) * r * 0.8 - 0.06, tu + Math.cos(a) * r * 0.8 + 0.06, tv + Math.sin(a) * r * 0.8 - 0.06, tv + Math.sin(a) * r * 0.8 + 0.06, 0.2, 0.9);
    }
    // a catwalk along the tops of the middle row, on posts
    p.box('iron', -18, 18, -0.5, 0.5, 7.6, 7.7);
    for (const sv of [-0.5, 0.5]) p.box('iron', -18, 18, sv - 0.03, sv + 0.03, 7.7, 8.7);
    for (const uu of [-18, 0, 18]) p.box('iron', uu - 0.08, uu + 0.08, -0.08, 0.08, 0.2, 7.6);
    place(p, cf);
  }

  // ---------------- the old royal cellar (1928): a U of tiled halls round a gravel yard open to the south-east (+u)
  const pf = M.dkpodrum ? frame(M.dkpodrum, terrain, A.dkpodrum, true) : null;
  if (pf) {
    const p = parts(), L = pf.L, W = pf.W, u = pf.under, D = 10, E = 6.8;
    const bars: [number, number, number, number][] = [[-L, -L + D, -W, W], [-L + D, L, -W, -W + D], [-L + D, L, W - D, W]];
    for (const [u0, u1, v0, v1] of bars) {
      p.box('stoneDark', u0, u1, v0, v1, u, 1.0);
      p.box('cream', u0, u1, v0, v1, 1.0, E);
      p.box('ochre', u0 - 0.15, u1 + 0.15, v0 - 0.15, v1 + 0.15, E - 0.35, E);
      p.hip('tile', u0, u1, v0, v1, E, 3.0, 0.7);
      for (const [fu, fv, len, ang, alU] of faces(u0, u1, v0, v1))
        along(fu, fv, len, alU, Math.max(1, Math.round(len / 4.5)), 1.5, (uu, vv) => {
          p.put('woodDark', new THREE.BoxGeometry(1.3, 2.3, 0.06).translate(0, 1.15, 0.01), uu, vv, 2.4, ang);
          p.put('glass', p.arch(1.1, 2.1, 0.1), uu, vv, 2.5, ang);
        });
    }
    // the big cellar doors on the yard and a few old barrels by them
    p.put('door', p.arch(3.4, 4.2, 0.12), -L + D, 0, 0, PU);
    for (const [bu, bv] of [[-L + D + 2.5, -3.5], [-L + D + 2.5, 3.5], [-L + D + 4.5, -4.2]] as const) {
      const g = ground(pf, bu, bv);
      p.add('wood', new THREE.CylinderGeometry(0.75, 0.75, 1.6, 14).rotateX(Math.PI / 2).translate(bu, g + 0.75, bv));
      for (const s of [-0.55, 0.55]) p.add('iron', new THREE.CylinderGeometry(0.78, 0.78, 0.08, 14).rotateX(Math.PI / 2).translate(bu, g + 0.75, bv + s));
    }
    place(p, pf);
  }

  // ---------------- the amphitheatre: +u north-east from the orchestra toward the stage, the rows of seats behind it (−u)
  const af = M.dkamfi ? frame(M.dkamfi, terrain, A.dkamfi, true) : null;
  if (af) {
    const p = parts(), g0 = ground(af, 0, 0), base = Math.min(g0, ground(af, -12, 0), ground(af, 10, 0)) - 0.6;
    // the orchestra and the paved stage pad
    p.add('ashlar', new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2).translate(0, g0 + 0.32, 0));
    p.box('concrete', 0, 17, -11, 11, base, g0 + 0.3);
    p.box('ashlar', 8, 16, -7, 7, g0 + 0.3, g0 + 1.1); // the stage
    // eight curved rows of seats rising away from the orchestra
    for (let k = 0; k < 8; k++) {
      const r0 = 5.4 + k * 1.35, r1 = r0 + 1.35, top = g0 + 0.45 + k * 0.48;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, r1, Math.PI / 2, (3 * Math.PI) / 2, false);
      shape.absarc(0, 0, r0, (3 * Math.PI) / 2, Math.PI / 2, true);
      const seat = new THREE.ExtrudeGeometry(shape, { depth: top - base, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2).translate(0, base, 0);
      p.add(k % 2 ? 'ashlar' : 'white', seat);
    }
    place(p, af);
  }

  return { group, nightLit: [glass] };
}
