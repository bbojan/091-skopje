// Rostuše, Debar and Mavrovo: hand-built models after photos on Wikimedia Commons (references only, nothing
// from them is in the repo):
// - Бигорски манастир (Св. Јован Претеча; by tradition founded 1020, renewed from 1743, the konaks burnt in 2009
//   and rebuilt): a ring of konaks round a sloping courtyard above the Радика. Ground floors of grey rubble
//   stone, the upper floors white plaster with dark timber bands and rows of dark-framed windows, the top floors
//   jutting out on curved timber brackets, low hipped roofs of grey stone slabs with wide eaves. The bell tower:
//   a square stone shaft with a clock, a white belvedere storey with windows all round cantilevered on brackets,
//   and a wide low roof. The church in the middle of the court: stone walls, a slab roof, an octagonal stone drum
//   with arched windows and a grey lead dome. In the courtyard an octagonal fountain pavilion on columns under a
//   lead dome; the entrance through a vaulted gate passage under a wing, with a marble portico. An open arcade
//   gallery on the valley side. Layout in the monastery's frame (`modelRects.bigorski`), not surveyed.
// - Св. Никола in Mavrovo (1850): the church of the village flooded by the lake in the 1950s; its stone walls
//   stand roofless at the water's edge, the bell tower at the west end.
// Sizes are read off the photos (door ≈ 2.2 m, storey ≈ 3 m), not measured.
import * as THREE from 'three';
import { frame, parts, modelKit, gable, MU, PU, PV, MV, type Frame, type Parts, type Key } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function rostuseFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['nikola', 7]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

/** a konak wing along u (u0…u1) at v0…v1: `stone` storeys of rubble, then `white` plastered storeys with timber
 *  bands and windows, the top one jutting out by `jut` on brackets on the side facing `face` (±1 in v), a slab
 *  roof; `y0` its foot (the frame's floor is 0) */
function konak(p: Parts, u0: number, u1: number, v0: number, v1: number, y0: number, stone: number, white: number, face: 1 | -1, jut = 0.8, gallery = false) {
  const st = 3.0, yS = y0 + stone * st, yW = yS + white * st;
  p.box('stone', u0, u1, v0, v1, y0 - 6, yS); // the stone base (down the slope)
  for (let s = 0; s < white; s++) {
    const top = s === white - 1, a = top ? jut : 0;
    const fv0 = face < 0 ? v0 - a : v0, fv1 = face > 0 ? v1 + a : v1, y = yS + s * st;
    p.box('plaster', u0 - (top ? 0.3 : 0), u1 + (top ? 0.3 : 0), fv0, fv1, y, y + st);
    p.box('woodDark', u0 - 0.35, u1 + 0.35, fv0 - 0.05, fv1 + 0.05, y - 0.08, y + 0.14); // the floor beam
    // windows: dark frames, regular rows, on both long sides
    for (let u = u0 + 1.4; u < u1 - 0.8; u += 2.1) for (const [v, ang] of [[fv0, MV], [fv1, PV]] as const) {
      p.put('woodDark', new THREE.BoxGeometry(1.15, 1.45, 0.08).translate(0, 0.72, 0.04), u, v, y + 0.85, ang);
      p.put('glass', new THREE.BoxGeometry(0.85, 1.2, 0.1).translate(0, 0.6, 0.05), u, v, y + 0.97, ang);
    }
    if (top && a > 0) // the curved brackets under the jutty
      for (let u = u0 + 0.8; u < u1; u += 1.6) {
        const vb = face > 0 ? v1 : v0;
        p.put('woodDark', new THREE.BoxGeometry(0.14, 0.14, a * 1.25).rotateX(face > 0 ? 0.75 : -0.75).translate(0, -a * 0.45, face * a * 0.42), u, vb, y, 0);
      }
    if (gallery && top) // an open arcade gallery on the valley side
      for (let u = u0 + 1.5; u < u1 - 1; u += 2.4) p.put('dark', p.arch(1.6, 2.4, 0.1), u, face > 0 ? v1 + a : v0 - a, y + 0.3, face > 0 ? PV : MV);
  }
  // the windows of the stone storeys: small, deep, arched
  for (let s = 0; s < stone; s++) for (let u = u0 + 1.5; u < u1 - 1; u += 3.2) for (const [v, ang] of [[v0, MV], [v1, PV]] as const)
    p.put('dark', p.arch(0.7, 1.3, 0.08), u, v, y0 + s * st + 1, ang);
  // the roof: low hipped stone slabs, wide eaves, a dark timber fascia
  const rv0 = face < 0 ? v0 - jut : v0, rv1 = face > 0 ? v1 + jut : v1, rise = Math.min(2.4, (rv1 - rv0) * 0.28);
  p.box('woodDark', u0 - 0.9, u1 + 0.9, rv0 - 0.9, rv1 + 0.9, yW, yW + 0.22);
  p.hip('slate', u0, u1, rv0, rv1, yW + 0.22, rise, 0.9);
  // stone chimneys with slab caps along the roof, a little off the ridge
  const cv = (rv0 + rv1) / 2 + (rv1 - rv0) * 0.18;
  for (let u = u0 + 2.5; u < u1 - 1.5; u += 5.5) {
    p.box('stone', u - 0.35, u + 0.35, cv - 0.35, cv + 0.35, yW, yW + rise + 1.3);
    p.box('slate', u - 0.55, u + 0.55, cv - 0.55, cv + 0.55, yW + rise + 1.3, yW + rise + 1.45);
    p.box('stone', u - 0.12, u + 0.12, cv - 0.12, cv + 0.12, yW + rise + 1.45, yW + rise + 1.75);
  }
  // flower boxes (red geraniums) under the windows of the first white storey, on the courtyard side
  const fv = face > 0 ? v1 : v0;
  for (let u = u0 + 1.4; u < u1 - 0.8; u += 2.1) p.box('brick', u - 0.5, u + 0.5, fv - 0.22, fv + 0.22, yS + 0.62, yS + 0.85);
}

export function createRostuse(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  /** the ground under a point of a frame, relative to its floor */
  const gnd = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };

  // ---------------- Бигорски манастир: +u down the valley (south), +v toward the river (east)
  const bf = M.bigorski ? frame(M.bigorski, terrain, data.landmarks?.modelAxes?.bigorski, true) : null;
  if (bf) {
    const p = parts(), L = bf.L, W = bf.W;
    // the courtyard: a paved terrace at the church's foot, stepping down the slope
    const cy = gnd(bf, 0, 0) + 0.15;
    p.box('stoneDark', -L * 0.62, L * 0.55, -W * 0.5, W * 0.62, Math.min(cy - 3, bf.under), cy);
    p.box('ashlar', -L * 0.6, L * 0.53, -W * 0.48, W * 0.6, cy, cy + 0.06); // the paving
    // konaks: the long wing on the hill side (−v), the north wing (−u) with the tower, the south wing (+u) with the
    // gate, the valley side (+v) an arcaded wing on a high stone base
    const hill = gnd(bf, 0, -W * 0.8), valley = gnd(bf, 0, W * 0.8);
    konak(p, -L, L, -W, -W * 0.56, Math.max(hill, cy), 1, 2, 1, 0.9);
    konak(p, -L, -L * 0.66, -W * 0.5, W * 0.7, cy, 1, 2, 1, 0.8);
    konak(p, L * 0.6, L, -W * 0.5, W * 0.45, Math.min(cy, gnd(bf, L * 0.8, 0)), 2, 1, -1, 0.7);
    konak(p, -L * 0.6, L * 0.3, W * 0.66, W, Math.min(cy, valley) - 1, 2, 1, 1, 0.6, true);
    // the gate passage under the south wing, its marble portico on two pairs of columns, a lead dome over it
    const gu = L * 0.6, gv = 0;
    p.put('dark', p.arch(3, 3.8, 0.4), gu, gv, cy, MU);
    p.box('concreteDark', gu - 2.6, gu, gv - 2.2, gv + 2.2, cy, cy + 0.15);
    for (const dv of [-1.9, -1.4, 1.4, 1.9]) p.cyl('concrete', gu - 2.3, gv + dv, cy, cy + 3.4, 0.17, 0.17, 10);
    p.box('concrete', gu - 2.6, gu, gv - 2.2, gv + 2.2, cy + 3.4, cy + 4.6);
    p.put('gold', p.arch(3.2, 4.4, 0.04), gu - 2.62, gv, cy + 0.2, MU); // the gilt inscription round the arch (a thin band)
    p.put('concreteDark', p.arch(2.9, 4.25, 0.05), gu - 2.64, gv, cy + 0.2, MU);
    p.add('lead', new THREE.SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.6, 0.5, 1).translate(gu - 1.3, cy + 4.6, gv));
    p.cross(gu - 1.3, gv, cy + 5.8, 0.5);

    // the church of St. John the Baptist in the middle of the court, +u east… here along the court
    const cu0 = -L * 0.32, cu1 = L * 0.22, cw = Math.min(5, W * 0.22), ch = 6.2;
    p.box('stoneDark', cu0, cu1, -cw, cw, cy - 1, cy + 0.5);
    p.box('stone', cu0, cu1, -cw, cw, cy + 0.5, cy + ch);
    for (let y = cy + 1.5; y < cy + ch; y += 1.4) p.box('stoneDark', cu0 - 0.02, cu1 + 0.02, -cw - 0.02, cw + 0.02, y, y + 0.1);
    for (let u = cu0 + 2; u < cu1 - 1; u += 3) for (const [v, ang] of [[cw, PV], [-cw, MV]] as const) {
      p.put('ashlar', p.arch(1.1, 2.3, 0.05), u, v, cy + 2.2, ang);
      p.put('glass', p.arch(0.7, 2.0, 0.08), u, v, cy + 2.3, ang);
    }
    // the apse at +u, a semicircle with a slab half cone
    p.add('stone', new THREE.CylinderGeometry(cw * 0.7, cw * 0.7, ch - 1.2, 10, 1, false, 0, Math.PI).translate(cu1, cy + 0.5 + (ch - 1.2) / 2, 0));
    p.add('slate', new THREE.ConeGeometry(cw * 0.7 + 0.3, 1.4, 10, 1, false, 0, Math.PI).translate(cu1, cy + ch - 0.7 + 0.7, 0));
    // a narthex with an open porch at −u
    p.box('stone', cu0 - 4, cu0, -cw, cw, cy + 0.5, cy + ch - 1.4);
    for (let v = -cw + 1.3; v < cw - 0.6; v += 2.4) p.put('dark', p.arch(1.6, 2.8, 0.06), cu0 - 4, v, cy + 0.5, MU);
    p.hip('slate', cu0 - 4, cu0, -cw, cw, cy + ch - 1.4, 1.2, 0.5);
    gable(p, 'slate', 'stone', cu0, cu1, -cw, cw, cy + ch, cw * 0.42, false, 0.5);
    // the drum: octagonal, stone, arched windows, a grey lead dome and a gold cross
    const du = (cu0 + cu1) / 2 + 1, rD = Math.min(2.4, cw * 0.55), dy = cy + ch + cw * 0.3;
    p.cyl('stone', du, 0, cy + ch, dy + 2.6, rD, rD, 8);
    p.cyl('ashlar', du, 0, dy + 2.6, dy + 2.85, rD + 0.15, rD + 0.15, 8);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8, ap = rD * Math.cos(Math.PI / 8);
      p.put('ashlar', p.arch(0.85, 1.8, 0.05), du + Math.sin(a) * ap, Math.cos(a) * ap, dy + 0.4, a);
      p.put('glass', p.arch(0.5, 1.5, 0.08), du + Math.sin(a) * ap, Math.cos(a) * ap, dy + 0.5, a);
    }
    p.dome('lead', du, 0, dy + 2.85, rD + 0.1, 0.75);
    p.cross(du, 0, dy + 2.85 + rD * 0.75, 0.6);

    // the bell tower at the corner of the north and hill wings: stone shaft, clock, the white belvedere
    const tu = -L * 0.56, tv = -W * 0.4, ts = 2.4, ty = Math.max(hill, cy), sh = 15;
    p.box('stone', tu - ts, tu + ts, tv - ts, tv + ts, ty - 6, ty + sh);
    for (let y = ty + 3; y < ty + sh; y += 3) p.box('stoneDark', tu - ts - 0.03, tu + ts + 0.03, tv - ts - 0.03, tv + ts + 0.03, y, y + 0.12);
    for (const [ang, du2, dv] of [[PU, ts, 0], [PV, 0, ts], [MU, -ts, 0], [MV, 0, -ts]] as const) {
      const disc = (k: Key, r: number, d: number) => p.put(k, new THREE.CylinderGeometry(r, r, d, 20).rotateX(Math.PI / 2).translate(0, 0, d / 2), tu + du2, tv + dv, ty + sh - 2.4, ang);
      disc('plaster', 0.75, 0.06); disc('dark', 0.68, 0.08);
      p.put('dark', p.arch(0.6, 1.4, 0.08), tu + du2, tv + dv, ty + sh - 6.5, ang);
    }
    // the belvedere, cantilevered 1 m out on brackets, windows all round
    const bs = ts + 1, by = ty + sh;
    for (const [ang, du2, dv] of [[PU, ts, 0], [PV, 0, ts], [MU, -ts, 0], [MV, 0, -ts]] as const)
      for (const d of [-1.6, 0, 1.6]) {
        const ou = ang === PV || ang === MV ? d : 0, ov = ang === PU || ang === MU ? d : 0;
        p.put('woodDark', new THREE.BoxGeometry(0.16, 0.16, 1.5).rotateX(-0.8).translate(0, -0.5, 0.5), tu + du2 + ou, tv + dv + ov, by, ang);
      }
    p.box('woodDark', tu - bs, tu + bs, tv - bs, tv + bs, by - 0.1, by + 0.2);
    p.box('plaster', tu - bs, tu + bs, tv - bs, tv + bs, by + 0.2, by + 1.0);
    p.box('dark', tu - bs + 0.05, tu + bs - 0.05, tv - bs + 0.05, tv + bs - 0.05, by + 1.0, by + 2.4); // the band of windows
    for (let k = -bs; k <= bs + 0.01; k += (2 * bs) / 5) for (const s of [-1, 1]) { // mullions
      p.box('plaster', tu + k - 0.09, tu + k + 0.09, tv + s * bs - 0.1, tv + s * bs + 0.1, by + 1.0, by + 2.4);
      p.box('plaster', tu + s * bs - 0.1, tu + s * bs + 0.1, tv + k - 0.09, tv + k + 0.09, by + 1.0, by + 2.4);
    }
    p.box('plaster', tu - bs, tu + bs, tv - bs, tv + bs, by + 2.4, by + 2.9);
    p.box('woodDark', tu - bs - 0.9, tu + bs + 0.9, tv - bs - 0.9, tv + bs + 0.9, by + 2.9, by + 3.1);
    p.hip('slate', tu - bs, tu + bs, tv - bs, tv + bs, by + 3.1, 1.6, 0.9);
    p.cross(tu, tv, by + 4.7, 0.45);

    // the fountain pavilion in the court: eight columns, a lead dome, the basin
    const fu = L * 0.3, fv = W * 0.25, fr = 1.9;
    p.cyl('ashlar', fu, fv, cy, cy + 0.35, fr + 0.3, fr + 0.3, 8);
    p.cyl('concrete', fu, fv, cy + 0.35, cy + 0.9, 0.7, 0.9, 12); // the basin in the middle
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.cyl('plaster', fu + Math.cos(a) * fr, fv + Math.sin(a) * fr, cy + 0.35, cy + 2.7, 0.14, 0.14, 8); }
    p.cyl('plaster', fu, fv, cy + 2.7, cy + 3.3, fr + 0.2, fr + 0.2, 8);
    p.dome('lead', fu, fv, cy + 3.3, fr + 0.15, 0.6);
    p.cross(fu, fv, cy + 3.3 + (fr + 0.15) * 0.6, 0.3);
    // the retaining wall of the court's terrace toward the valley, with a stone coping
    p.box('stone', -L * 0.62, L * 0.55, W * 0.6, W * 0.64, Math.min(cy, valley) - 8, cy + 1.0);
    p.box('ashlar', -L * 0.62, L * 0.55, W * 0.59, W * 0.65, cy + 1.0, cy + 1.15);
    // two cypresses by the church
    for (const [u, v] of [[-L * 0.38, W * 0.32], [L * 0.27, -W * 0.3]] as const) { p.cyl('woodDark', u, v, cy, cy + 1.2, 0.15, 0.15, 6); p.add('green', new THREE.ConeGeometry(0.9, 8, 8).translate(u, cy + 5, v)); }
    // a timber stair up to the hill wing's gallery, flowers in pots along the court (red dots)
    for (let i = 0; i < 9; i++) p.box('woodDark', -L * 0.2 + i * 0.35, -L * 0.2 + i * 0.35 + 0.4, -W * 0.56, -W * 0.56 + 1.4, cy + i * 0.33, cy + i * 0.33 + 0.12);
    for (let u = -L * 0.5; u < L * 0.5; u += 3.5) p.cyl('brick', u, W * 0.58, cy, cy + 0.5, 0.25, 0.3, 8);
    place(p, bf);
  }

  // ---------------- Св. Никола, Mavrovo: the roofless nave and the bell tower at the west end
  const nf = M.nikola ? frame(M.nikola, terrain, [1, 0], true) : null;
  if (nf) {
    const p = parts(), L = nf.L, W = nf.W, h = 6.5, t = 0.7, u = nf.under;
    p.box('stone', -L + 3.6, L, -W, -W + t, u, h - 1.2); p.box('stone', -L + 3.6, L, W - t, W, u, h - 1.2); // the broken tops above, stone by stone
    p.box('stone', L - t, L, -W, W, u, h);
    p.add('stone', new THREE.CylinderGeometry(W * 0.65, W * 0.65, h - 1.5 - u, 10, 1, true, 0, Math.PI).translate(L, (u + h - 1.5) / 2, 0)); // the apse
    for (let y = 1.4; y < h - 1.3; y += 1.4) { p.box('stoneDark', -L + 3.6, L, -W - 0.02, -W + t + 0.02, y, y + 0.1); p.box('stoneDark', -L + 3.6, L, W - t - 0.02, W + 0.02, y, y + 0.1); }
    // broken wall tops: a few higher and lower stones along the crests
    for (let k = -L + 3.6; k < L - 0.4; k += 1.1) for (const s of [-1, 1]) { const r = 0.5 + 0.35 * Math.sin(k * 0.45 + s * 2) + 0.15 * Math.sin(k * 2.3); p.box('stone', k, k + 1.1, s * (W - t / 2) - t / 2, s * (W - t / 2) + t / 2, h - 1.25, h - 1.2 + 1.5 * r); } // a ragged crest, higher toward the tower
    for (let k = -L + 6; k < L - 1; k += 3) for (const [v, ang] of [[W, PV], [-W, MV]] as const) p.put('dark', p.arch(1.0, 2.4, 0.75), k, v - Math.sign(v) * 0.72, 2.0, ang); // windows through the walls
    // the bell tower: square stone shaft, arched belfry openings, a pyramid roof (lead) and a cross
    const s = 1.8, th = 13;
    p.box('stone', -L, -L + 3.6, -s, s, u, th);
    for (let y = 2; y < th; y += 2) p.box('stoneDark', -L - 0.02, -L + 3.62, -s - 0.02, s + 0.02, y, y + 0.1);
    for (const [ang, du, dv] of [[MU, -L, 0], [PU, -L + 3.6, 0], [PV, -L + 1.8, s], [MV, -L + 1.8, -s]] as const) p.put('dark', p.arch(1.1, 2.4, 0.06), du, dv, th - 3, ang);
    p.put('dark', p.arch(1.4, 2.6, 0.06), -L, 0, 0.2, MU); // the door
    p.add('lead', new THREE.ConeGeometry(s * 1.5, 2.4, 4).rotateY(Math.PI / 4).translate(-L + 1.8, th + 1.2, 0));
    p.cross(-L + 1.8, 0, th + 2.4, 0.55);
    place(p, nf);
  }
  return { group, nightLit: [glass] };
}
