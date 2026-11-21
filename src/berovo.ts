// Berovo: hand-built models after photos on Wikimedia Commons and an aerial image (references only, nothing from
// them is in the repo):
// - Св. Архангел Михаил, the church of the women's monastery (1815–1818): built low, of rubble stone with darker
//   courses, under one wide hipped roof of red tiles that also covers a deep wooden porch round its west end and
//   long sides (dark carved posts on a stone plinth, a railing between them); a semicircular apse at the east end.
// - Its bell tower on the konak: a stone base, a white shaft, an open octagonal wooden belfry on a balcony under a
//   low tiled roof.
// - Рождество на Пресвета Богородица on the square: a white basilica under a gable roof, arched windows in light
//   surrounds; at the south-west corner of its west front a tall square tower with corner pilasters, the clock
//   faces in its top stage and a small green dome with a gold cross.
// - The arch dam of Беровско Езеро: a thin concrete wall curving toward the lake, about 33 m high, its downstream
//   face divided into panels by the joints; a railing and lamps along the crest.
// The churches have only OSM nodes: their rectangles (`modelRects`) and sizes are read off the aerial image and the
// photos (door ≈ 2.2 m), not measured; the bell tower's place on the konak is a guess from one photo. The dam
// follows OSM's crest line; its height is read off a photo.
import * as THREE from 'three';
import { frame, parts, modelKit, gable, facing, tris, PU, MU, PV, MV, type Frame, type Parts } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function berovoFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['mihail', 7], ['mtower', 14], ['rozdestvo', 10]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createBerovo(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {}, A = data.landmarks?.modelAxes ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Св. Архангел Михаил: +u south-east to the apse; the porch round the west end and the long sides
  const mf = M.mihail ? frame(M.mihail, terrain, A.mihail) : null;
  if (mf) {
    const p = parts(), L = mf.L, W = mf.W, u = mf.under, eave = 4.3, pd = 3.0; // pd: the porch's depth
    const b0 = -L + pd, b1 = L - 2.6, bw = W - pd; // the stone body
    p.box('stoneDark', -L, b1, -W, W, u, 0.45); // the plinth under the porch and the body
    p.box('stone', b0, b1, -bw, bw, 0.45, eave);
    p.bands('stoneDark', [[b0, -bw], [b1, -bw], [b1, bw], [b0, bw]], [1.6, 3.0], 0.16, 0.03); // darker courses
    // the apse: a half cylinder with its own tiled half cone
    const ar = Math.min(2.8, bw * 0.55);
    p.add('stone', new THREE.CylinderGeometry(ar, ar, eave - 0.6 - u, 12, 1, false, 0, Math.PI).translate(b1, (eave - 0.6 + u) / 2, 0));
    p.add('tile', new THREE.ConeGeometry(ar + 0.35, 1.4, 12, 1, false, 0, Math.PI).translate(b1, eave - 0.6 + 0.7, 0));
    p.put('glass', p.arch(0.4, 1.0, 0.05), b1 + ar, 0, 2.1, PU);
    // the door in the west wall, small arched windows high in the long walls
    p.put('door', p.arch(1.3, 2.3, 0.1), b0, 0, 0.45, MU);
    for (let uu = b0 + 2.5; uu < b1 - 1; uu += 3.2) for (const sv of [-1, 1]) p.put('glass', p.arch(0.5, 1.0, 0.06), uu, sv * bw, 2.6, sv > 0 ? PV : MV);
    // the porch: dark posts on the plinth along its outer edge, a beam over them, a railing between them
    const post = (pu: number, pv: number) => { p.box('woodDark', pu - 0.16, pu + 0.16, pv - 0.16, pv + 0.16, 0.45, eave - 0.3); p.box('woodDark', pu - 0.3, pu + 0.3, pv - 0.3, pv + 0.3, eave - 0.75, eave - 0.3); };
    const pe = -L + 0.35, pw = W - 0.35;
    for (let i = 0; i <= 7; i++) post(pe, -pw + (2 * pw * i) / 7); // the west front: seven bays, the door bay open
    for (const sv of [-1, 1]) for (let uu = pe + 2.6; uu < b1 - 0.5; uu += 2.6) post(uu, sv * pw);
    p.box('woodDark', pe - 0.2, pe + 0.2, -pw, pw, eave - 0.3, eave); // beams
    for (const sv of [-1, 1]) p.box('woodDark', pe, b1, sv * pw - 0.2, sv * pw + 0.2, eave - 0.3, eave);
    for (const [v0, v1] of [[-pw, -0.9], [0.9, pw]]) p.box('wood', pe - 0.05, pe + 0.05, v0, v1, 1.25, 1.35); // railing
    for (const sv of [-1, 1]) p.box('wood', pe, b1 - 0.4, sv * pw - 0.05, sv * pw + 0.05, 1.25, 1.35);
    // one hipped roof over the body and the porch, a cross at its west end
    p.hip('tile', -L, b1, -W, W, eave, 3.0, 0.6);
    const rr = Math.max(0, ((b1 + L + 1.2) - (2 * W + 1.2)) / 2);
    p.cross((-L + b1) / 2 - rr, 0, eave + 3.0, 0.5);
    place(p, mf);
  }

  // ---------------- the bell tower on the konak
  const tf = M.mtower ? frame(M.mtower, terrain, A.mtower) : null;
  if (tf) {
    const p = parts(), u = tf.under, h = 2.0;
    p.box('stone', -h - 0.2, h + 0.2, -h - 0.2, h + 0.2, u, 6.0);
    p.box('white', -h, h, -h, h, 6.0, 10.4);
    p.box('cream', -h - 0.15, h + 0.15, -h - 0.15, h + 0.15, 10.2, 10.5);
    // the open octagonal belfry: a balcony, eight posts, a ring beam, a low tiled roof
    p.add('woodDark', new THREE.CylinderGeometry(2.75, 2.6, 1.0, 8).rotateY(Math.PI / 8).translate(0, 11.0, 0));
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; p.cyl('woodDark', Math.cos(a) * 2.35, Math.sin(a) * 2.35, 11.5, 13.4, 0.12, 0.12, 6); }
    p.cyl('dark', 0, 0, 11.5, 13.2, 1.9, 1.9, 8); // the dark inside, so the belfry reads as open
    p.add('white', new THREE.CylinderGeometry(2.6, 2.6, 0.45, 8).rotateY(Math.PI / 8).translate(0, 13.6, 0));
    p.add('tile', new THREE.ConeGeometry(3.2, 1.5, 8).rotateY(Math.PI / 8).translate(0, 13.8 + 0.75, 0));
    p.cross(0, 0, 15.3, 0.45);
    place(p, tf);
  }

  // ---------------- Рождество на Пресвета Богородица: +u east, +v south; the tower at the west front's south corner
  const rf = M.rozdestvo ? frame(M.rozdestvo, terrain, [1, 0], true) : null;
  if (rf) {
    const p = parts(), L = rf.L, W = rf.W, u = rf.under, eave = 7.2, ts = 2.3; // ts: the tower's half side
    const nv1 = W - 2 * ts; // the nave from −W to nv1 across, the tower beside its west front
    p.box('concrete', -L, L, -W, nv1, u, 0.4);
    p.box('plaster', -L, L, -W, nv1, 0.4, eave);
    p.bands('cream', [[-L, -W], [L, -W], [L, nv1], [-L, nv1]], [eave - 0.4], 0.4, 0.08); // the cornice
    gable(p, 'tile', 'plaster', -L, L, -W, nv1, eave, 2.6, false, 0.5);
    const n = Math.max(4, Math.round(L * 2 / 3.6));
    for (let i = 0; i < n; i++) {
      const uu = -L + ((i + 0.5) * 2 * L) / n;
      for (const [vv, ang] of [[-W, MV], [nv1, PV]] as const) {
        p.put('cream', p.arch(1.3, 2.6, 0.04), uu, vv, 3.2, ang);
        p.put('glass', p.arch(0.9, 2.2, 0.07), uu, vv, 3.35, ang);
      }
    }
    const fm = (-W + nv1) / 2; // the west front: the door and three tall windows over it
    p.put('cream', p.arch(2.0, 3.2, 0.05), -L, fm, 0.4, MU);
    p.put('door', p.arch(1.5, 2.8, 0.1), -L, fm, 0.4, MU);
    for (const dv of [-2.2, 0, 2.2]) { p.put('cream', p.arch(1.1, 2.3, 0.04), -L, fm + dv, 4.2, MU); p.put('glass', p.arch(0.75, 2.0, 0.07), -L, fm + dv, 4.35, MU); }
    p.put('door', p.arch(1.4, 2.6, 0.1), L * 0.2, -W, 0.4, MV);
    // the tower: a shaft with corner pilasters and cornices, the clock stage, a small dome
    const tu = -L + ts, tv = W - ts, top = 22.5;
    p.box('concrete', tu - ts - 0.15, tu + ts + 0.15, tv - ts - 0.15, tv + ts + 0.15, u, 0.6);
    p.box('plaster', tu - ts, tu + ts, tv - ts, tv + ts, 0.6, top);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.box('concrete', tu + a * ts - 0.35, tu + a * ts + 0.35, tv + b * ts - 0.35, tv + b * ts + 0.35, 0.6, top);
    for (const y of [eave - 0.3, 15.2, top]) p.box('cream', tu - ts - 0.3, tu + ts + 0.3, tv - ts - 0.3, tv + ts + 0.3, y, y + 0.45);
    for (const [ang, du, dv] of [[PU, ts, 0], [MU, -ts, 0], [PV, 0, ts], [MV, 0, -ts]] as const) {
      p.put('glass', p.arch(0.6, 1.5, 0.06), tu + du, tv + dv, 10.5, ang);
      p.put('dark', p.arch(1.1, 2.6, 0.07), tu + du, tv + dv, 16.0, ang); // the bell openings
      p.put('white', new THREE.CylinderGeometry(0.85, 0.85, 0.06, 20).rotateX(Math.PI / 2).translate(0, 0, 0.04), tu + du, tv + dv, 20.6, ang);
      p.put('dark', new THREE.BoxGeometry(0.07, 0.62, 0.05).translate(0, 0.26, 0.1), tu + du, tv + dv, 20.6, ang); // hands
      p.put('dark', new THREE.BoxGeometry(0.45, 0.07, 0.05).translate(0.2, 0, 0.1), tu + du, tv + dv, 20.6, ang);
    }
    p.cyl('plaster', tu, tv, top + 0.45, top + 1.1, ts * 0.85, ts * 0.85, 16);
    p.dome('copper', tu, tv, top + 1.1, ts * 0.85, 1.05);
    p.cross(tu, tv, top + 1.1 + ts * 0.9, 0.55);
    place(p, rf);
  }

  // ---------------- the arch dam on OSM's crest line, convex toward the lake; the gorge on the concave side
  const df = M.bdam ? frame(M.bdam, terrain) : null;
  if (df) { const p = parts(); archDam(p, df, M.bdam, terrain, true); place(p, df); }

  return { group, nightLit: [glass] };
}

/** A concrete arch dam on OSM's crest line (`ring` in world x, z; Берово, Света Петка): the crest 1.4 m over the lake's
 *  flat level, read 20 m upstream; the downstream face leans out to the gorge on the concave side, panel joints,
 *  railings and lamps; `keeper`: a small house on the left bank. Parts go into `p` in the frame `df`. */
export function archDam(p: Parts, df: Frame, ring: Flat, terrain: Terrain, keeper = false) {
  const P: Pt[] = [];
  for (let i = 0; i < ring.length; i += 2) P.push(df.local(ring[i], ring[i + 1]));
  const n = P.length, chord: Pt = [(P[0][0] + P[n - 1][0]) / 2, (P[0][1] + P[n - 1][1]) / 2];
  // each crest point's normal toward the downstream (concave) side
  const N: Pt[] = P.map((q, k) => {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)], tu = b[0] - a[0], tv = b[1] - a[1], l = Math.hypot(tu, tv) || 1;
    let nu = -tv / l, nv = tu / l;
    if (nu * (chord[0] - q[0]) + nv * (chord[1] - q[1]) < 0) { nu = -nu; nv = -nv; }
    return [nu, nv];
  });
  const gnd = (u: number, v: number) => { const [x, z] = df.world(u, v); return terrain.at(x, z) - df.y; };
  // the lake's flat level, read 20 m upstream of the middle of the crest; the crest 1.4 m above it
  const mid = Math.floor(n / 2), water = gnd(P[mid][0] - N[mid][0] * 20, P[mid][1] - N[mid][1] * 20);
  const crest = water + 1.4, wet = water - 6;
  const T = 3.0; // crest thickness; the downstream face leans out a quarter of the height below it
  const top: number[][] = [], foot: number[][] = [], up: number[][] = [], wetTop: number[][] = [];
  P.forEach((q, k) => {
    const [nu, nv] = N[k];
    let g = crest;
    for (const d of [T + 2, T + 5, T + 9]) g = Math.min(g, gnd(q[0] + nu * d, q[1] + nv * d));
    const hgt = Math.max(0, crest - g), o = T + hgt * 0.25, bot = Math.min(gnd(q[0] + nu * o, q[1] + nv * o), g) - 1.5;
    top.push([q[0] + nu * T, crest, q[1] + nv * T]);
    foot.push([q[0] + nu * o, bot, q[1] + nv * o]);
    up.push([q[0], crest, q[1]]);
    wetTop.push([q[0], Math.min(wet, bot), q[1]]);
  });
  const strip = (A: number[][], B: number[][], toward: (k: number) => [number, number, number]) => {
    const t: number[] = [];
    for (let k = 0; k + 1 < n; k++) t.push(...facing([...A[k], ...A[k + 1], ...B[k + 1], ...A[k], ...B[k + 1], ...B[k]], toward(k)));
    return tris(t);
  };
  p.add('concrete', strip(up, top, () => [0, 1, 0])); // the crest
  p.add('concrete', strip(top, foot, (k) => [N[k][0], 0, N[k][1]])); // the downstream face
  p.add('concrete', strip(up, wetTop, (k) => [-N[k][0], 0, -N[k][1]])); // the upstream face, into the water
  // the joints dividing the downstream face into panels, a few metres apart
  for (let k = 0; k + 1 < n; k++) {
    const len = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]), m = Math.max(1, Math.round(len / 9));
    for (let j = k === 0 ? 0 : 1; j <= m; j++) {
      const f = j / m, a = top[k].map((c, i) => c + (top[k + 1][i] - c) * f), b = foot[k].map((c, i) => c + (foot[k + 1][i] - c) * f);
      const nu = N[k][0] + (N[k + 1][0] - N[k][0]) * f, nv = N[k][1] + (N[k + 1][1] - N[k][1]) * f, e = 0.08;
      const du = -nv * 0.18, dv = nu * 0.18; // across the joint
      const q = [a[0] + du + nu * e, a[1], a[2] + dv + nv * e, a[0] - du + nu * e, a[1], a[2] - dv + nv * e, b[0] - du + nu * e, b[1], b[2] - dv + nv * e,
        a[0] + du + nu * e, a[1], a[2] + dv + nv * e, b[0] - du + nu * e, b[1], b[2] - dv + nv * e, b[0] + du + nu * e, b[1], b[2] + dv + nv * e];
      p.add('concreteDark', tris(facing(q, [nu, 0, nv])));
    }
  }
  // the railings on both sides of the crest and its lamps
  const rail = (A: number[][], dn: number) => {
    const R = A.map((c, k) => [c[0] + N[k][0] * dn, c[1] + 1.0, c[2] + N[k][1] * dn]), B = A.map((c, k) => [c[0] + N[k][0] * dn, c[1] + 0.9, c[2] + N[k][1] * dn]);
    p.add('iron', strip(R, B, (k) => [N[k][0], 0, N[k][1]]));
    p.add('iron', strip(B, R, (k) => [-N[k][0], 0, -N[k][1]]));
  };
  rail(up, 0.15); rail(top, -0.15);
  let run = 0;
  for (let k = 0; k < n; k++) {
    if (k) run += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    if (k && run < 14 && k < n - 1) continue;
    run = 0;
    const [nu, nv] = N[k], lu = P[k][0] + nu * 0.3, lv = P[k][1] + nv * 0.3;
    p.cyl('iron', lu, lv, crest, crest + 4.0, 0.06, 0.06, 6);
    p.add('glass', new THREE.SphereGeometry(0.22, 10, 6).translate(lu, crest + 4.1, lv));
  }
  if (keeper) {
  // a small house of the dam's keepers on the left bank (the photos), downstream of the north end
  const [hu, hv] = [P[0][0] + N[0][0] * 12, P[0][1] + N[0][1] * 12], hy = gnd(hu, hv);
  p.box('plaster', hu - 3, hu + 3, hv - 2.5, hv + 2.5, hy - 1, hy + 3.0);
  p.hip('tile', hu - 3, hu + 3, hv - 2.5, hv + 2.5, hy + 3.0, 1.4, 0.4);
  }
}
