// Неготино: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Неготински манастир Св. Ѓорѓи (church 1860–1866, by Андон Китанов; mk Wikipedia), on the right bank of the Вардар
//   above the town: a long white church under a low-pitched grey metal roof, three drums with dark domes and red
//   pilasters (the middle one the largest, the eastern one the smallest), red corner pilasters and cornice, a lower
//   porch with a tiled lean-to roof along the south side (photos of 2013 and 2015). Its free-standing bell tower, north-
//   west of it on OSM's small outline: three stages of stone panels in white frames, red brick arches, a low cap.
// - Св. Атанасиј Велики, the town church (1837; mk Wikipedia): an ochre basilica with brick-framed arched windows and
//   pilasters under a hipped tile roof, a lower narthex and a square bell tower at the west end on the street side
//   (Партизанска, south), arched belfry openings, a low pyramid cap with a ball and cross (photos of 2013 and 2015).
// - ТЕЦ Неготино (1978, 195 MW, oil): the concrete chimney with red and white bands over its top quarter and three
//   galleries, at OSM's chimney node. No published height was found: about 125 m, from two geotagged photos (the
//   apparent height at a known distance: 122 and ~135 m) and its ~10 m foot. The three fuel tanks on OSM's outlines
//   (45 m across; their height read off the photos, ~15 m).
// Heights of the churches read off the photos (door ≈ 2.2 m), not measured.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frame, parts, modelKit, PU, MU, PV, MV, type Frame, type Parts } from './models.ts';
import { strip } from './churches.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

const CHIMNEY = 125, TANK = 15;

/** Walking collision: the models' outlines and heights. */
export function negotinoFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['ngmanastir', 8], ['ngkambanarija', 14], ['ngatanas', 7], ['ngtank1', TANK], ['ngtank2', TANK], ['ngtank3', TANK], ['ngoxak', CHIMNEY]] as const)
    if (M[k]) out.push([M[k], h]);
  return out;
}

export function createNegotino(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  // the red paint of the monastery's trim and the chimney's bands (brighter than the kit's brick)
  const red = new THREE.MeshLambertMaterial({ color: '#b8362c', clippingPlanes });
  const placeRed = (p: Parts, f: Frame) => {
    const list = [...p.map.values()].flat();
    if (!list.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => strip(g.index ? g.toNonIndexed() : g)))!.applyMatrix4(f.m), red);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };

  // ---------------- Неготински манастир Св. Ѓорѓи: +u east (the apse), +v south (the porch)
  const mf = M.ngmanastir ? frame(M.ngmanastir, terrain, [1, 0], true) : null;
  if (mf) {
    const p = parts(), r = parts(), L = mf.L, W = mf.W, u = mf.under;
    const pv = W - 3.2, eaves = 7.2, rA = 2.8, ue = L - rA; // the porch's inner edge; the nave's east wall
    p.box('stoneDark', -L, ue, -W, pv, u, 0.5);
    p.box('plaster', -L, ue, -W, pv, 0.5, eaves);
    // red pilasters at the corners and in the middle of the long sides, a red cornice
    for (const uu of [-L, 0, ue]) for (const vv of [-W, pv]) r.box('brick', uu - 0.35, uu + 0.35, vv - 0.06, vv + 0.06, 0.5, eaves);
    r.box('brick', -L - 0.1, ue + 0.1, -W - 0.1, pv + 0.1, eaves - 0.35, eaves);
    // windows: two rows on the north, the upper row over the porch
    for (let uu = -L + 2; uu < ue - 1; uu += 3.4) {
      p.box('dark', uu - 0.45, uu + 0.45, -W - 0.06, -W + 0.06, 2.0, 3.4);
      p.box('dark', uu - 0.35, uu + 0.35, -W - 0.06, -W + 0.06, 5.0, 6.1);
      p.box('dark', uu - 0.35, uu + 0.35, pv - 0.06, pv + 0.06, 5.0, 6.1);
    }
    p.put('door', p.arch(1.4, 2.5, 0.1), -L, (pv - W) / 2, 0.5, MU);
    // the low-pitched metal roof along u
    const ridge = 1.9;
    p.hip('lead', -L, ue, -W, pv, eaves, ridge, 0.45);
    // the apse
    p.add('plaster', new THREE.CylinderGeometry(rA, rA, eaves - 1.3, 12, 1, false, 0, Math.PI).translate(ue, 0.5 + (eaves - 1.3) / 2, (pv - W) / 2));
    p.add('lead', new THREE.ConeGeometry(rA + 0.35, 1.4, 12, 1, false, 0, Math.PI).translate(ue, eaves - 0.8 + 0.7, (pv - W) / 2));
    p.put('dark', p.arch(0.6, 1.6, 0.08), ue + rA * 0.98, (pv - W) / 2, 2.4, PU);
    // three drums on the ridge: west, middle (the largest), east (the smallest)
    const vc = (pv - W) / 2;
    for (const [du, rd, hd] of [[-L * 0.45, 1.75, 3.0], [L * 0.1, 2.2, 3.8], [L * 0.62, 1.45, 2.4]] as const) {
      const y0 = eaves + ridge * 0.7, y1 = y0 + hd;
      p.cyl('plaster', du, vc, eaves, y1, rd, rd, 8);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, ap = rd * Math.cos(Math.PI / 8);
        r.box('brick', -0.13, 0.13, -0.05, 0.05, 0, hd).rotateY(a + Math.PI / 8).translate(du + Math.sin(a + Math.PI / 8) * rd * 0.99, y0, vc + Math.cos(a + Math.PI / 8) * rd * 0.99);
        if (k % 2 === 0) p.put('glass', p.arch(rd * 0.32, hd * 0.55, 0.08), du + Math.sin(a) * ap, vc + Math.cos(a) * ap, y0 + hd * 0.2, a);
      }
      r.cyl('brick', du, vc, y1 - 0.3, y1, rd + 0.12, rd + 0.12, 8);
      p.dome('slate', du, vc, y1, rd + 0.1, 0.9);
      p.cross(du, vc, y1 + (rd + 0.1) * 0.9, rd * 0.32);
    }
    // the porch: posts, a tiled lean-to roof (as a low hip), its back wall in the shade
    const ph = 3.4;
    for (let uu = -L + 0.3; uu <= ue + 0.01; uu += (ue + L - 0.3) / 6) p.box('wood', uu - 0.14, uu + 0.14, W - 0.4, W - 0.12, 0.5, ph);
    p.box('stoneDark', -L, ue, pv, W, u, 0.5);
    p.hip('tile', -L, ue, pv - 0.3, W, ph, 1.2, 0.4);
    place(p, mf);
    placeRed(r, mf);
  }

  // ---------------- the monastery's bell tower: three stages, stone panels in white frames, red brick arches, a low cap
  const bf = M.ngkambanarija ? frame(M.ngkambanarija, terrain) : null;
  if (bf) {
    const p = parts(), r = parts(), s = Math.min(bf.L, bf.W, 2.3), u = bf.under;
    const st = [0, 5.2, 9.4, 13.0]; // stage floors and the top of the belfry
    p.box('plaster', -s - 0.6, s + 0.6, -s - 0.6, s + 0.6, u, 0.8); // the terrace it stands on
    p.box('stone', -s + 0.12, s - 0.12, -s + 0.12, s - 0.12, 0.8, st[3]);
    for (const cu of [-s, s]) for (const cv of [-s, s]) p.box('plaster', cu - 0.32, cu + 0.32, cv - 0.32, cv + 0.32, 0.8, st[3]); // corner pilasters
    for (let i = 1; i < 4; i++) p.box('plaster', -s - 0.25, s + 0.25, -s - 0.25, s + 0.25, st[i] - 0.3, st[i]); // cornices
    for (const [du, dv, ang] of [[s - 0.1, 0, PU], [-s + 0.1, 0, MU], [0, s - 0.1, PV], [0, -s + 0.1, MV]] as const) {
      const along = ang === PU || ang === MU ? [0, 1] : [1, 0];
      for (const [i, n, open] of [[0, 1, false], [1, 2, false], [2, 2, true]] as const) for (let k = 0; k < n; k++) {
        const off = n === 1 ? 0 : (k - 0.5) * s * 0.95, y = 0.8 + st[i] + 0.9;
        r.put('brick', r.arch(1.05, 2.3, 0.06), du + along[0] * off, dv + along[1] * off, y, ang);
        p.put(open ? 'dark' : 'stoneDark', p.arch(0.6, 1.9, 0.09), du + along[0] * off, dv + along[1] * off, y + 0.15, ang);
      }
    }
    p.add('slate', new THREE.ConeGeometry((s + 0.5) * Math.SQRT2, 1.5, 4, 1).rotateY(Math.PI / 4).translate(0, st[3] + 0.75, 0));
    p.cross(0, 0, st[3] + 1.5, 0.55);
    place(p, bf);
    placeRed(r, bf);
  }

  // ---------------- Св. Атанасиј Велики: +u east, +v south (the street); the bell tower at the west end, south side
  const af = M.ngatanas ? frame(M.ngatanas, terrain, [1, 0], true) : null;
  if (af) {
    const p = parts(), L = af.L, W = af.W, u = af.under;
    const rA = Math.min(3.2, W * 0.45), ue = L - rA, nar = 4.2, eaves = 6.0, ne = 4.6, ts = 2.0;
    p.box('stoneDark', -L, ue, -W, W, u, 0.4);
    // the nave: ochre walls, brick pilasters and brick-framed arched windows, the hipped tile roof
    p.box('ochre', -L + nar, ue, -W, W, 0.4, eaves);
    for (let uu = -L + nar; uu <= ue + 0.01; uu += (ue + L - nar) / 5) for (const sv of [-1, 1]) p.box('brick', uu - 0.3, uu + 0.3, sv * W - 0.05, sv * W + 0.05, 0.4, eaves);
    for (let uu = -L + nar + (ue + L - nar) / 10; uu < ue; uu += (ue + L - nar) / 5) for (const sv of [-1, 1]) {
      p.put('brick', p.arch(1.3, 2.6, 0.05), uu, sv * W, 1.9, sv > 0 ? PV : MV);
      p.put('glass', p.arch(0.85, 2.25, 0.08), uu, sv * W, 2.05, sv > 0 ? PV : MV);
    }
    p.box('brick', -L + nar - 0.1, ue + 0.1, -W - 0.1, W + 0.1, eaves - 0.25, eaves);
    p.hip('tile', -L + nar, ue, -W, W, eaves, Math.min(3.0, W * 0.5), 0.5);
    // the apse
    p.add('ochre', new THREE.CylinderGeometry(rA, rA, eaves - 1.0, 12, 1, false, 0, Math.PI).translate(ue, 0.4 + (eaves - 1.0) / 2, 0));
    p.add('tile', new THREE.ConeGeometry(rA + 0.35, 1.5, 12, 1, false, 0, Math.PI).translate(ue, eaves - 0.6 + 0.75, 0));
    p.put('brick', p.arch(0.9, 2.1, 0.06), ue + rA * 0.98, 0, 2.0, PU);
    // the narthex: lower, its own hipped roof, the west door
    p.box('ochre', -L, -L + nar, -W, W - 2 * ts, 0.4, ne);
    p.hip('tile', -L, -L + nar, -W, W - 2 * ts, ne, 1.6, 0.4);
    p.put('door', p.arch(1.4, 2.5, 0.1), -L, -ts, 0.4, MU);
    // the bell tower at the south-west corner: ochre shaft with brick edges, two arched windows, the belfry with two
    // louvred arches a side, a cornice, a low pyramid with a ball and a cross
    const tu = -L + ts, tv = W - ts, th = 13.5;
    p.box('ochre', tu - ts, tu + ts, tv - ts, tv + ts, u, th);
    for (const cu of [-ts, ts]) for (const cv of [-ts, ts]) p.box('brick', tu + cu - 0.18, tu + cu + 0.18, tv + cv - 0.18, tv + cv + 0.18, 0.4, th);
    for (const [du, dv, ang] of [[ts, 0, PU], [-ts, 0, MU], [0, ts, PV], [0, -ts, MV]] as const) {
      const along = ang === PU || ang === MU ? [0, 1] : [1, 0];
      for (const y of [2.0, 6.0]) {
        p.put('brick', p.arch(1.1, 2.3, 0.05), tu + du, tv + dv, y, ang);
        p.put('glass', p.arch(0.7, 1.95, 0.08), tu + du, tv + dv, y + 0.15, ang);
      }
      for (const off of [-0.7, 0.7]) {
        p.put('brick', p.arch(1.05, 2.4, 0.05), tu + du + along[0] * off, tv + dv + along[1] * off, th - 3.4, ang);
        p.put('lead', p.arch(0.75, 2.15, 0.08), tu + du + along[0] * off, tv + dv + along[1] * off, th - 3.3, ang);
      }
    }
    p.box('cream', tu - ts - 0.2, tu + ts + 0.2, tv - ts - 0.2, tv + ts + 0.2, th - 0.3, th);
    p.add('lead', new THREE.ConeGeometry((ts + 0.3) * Math.SQRT2, 1.2, 4, 1).rotateY(Math.PI / 4).translate(tu, th + 0.6, tv));
    p.cross(tu, tv, th + 1.2, 0.6);
    place(p, af);
  }

  // ---------------- ТЕЦ Неготино: the chimney (a tapered concrete shaft, red and white bands over the top quarter,
  // three galleries) and the three fuel tanks
  const cf = M.ngoxak ? frame(M.ngoxak, terrain) : null;
  if (cf) {
    const p = parts(), r = parts(), u = cf.under, r0 = 5.1, r1 = 3.5, H = CHIMNEY;
    const rad = (y: number) => r0 + (r1 - r0) * (y / H);
    const band = H * 0.24, n = 9, bh = band / n; // red at the top and bottom of the banded part
    p.cyl('concrete', 0, 0, u, H - band, r0 + 0.05, rad(H - band), 24);
    for (let i = 0; i < n; i++) {
      const y0 = H - band + i * bh, y1 = y0 + bh;
      (i % 2 === 0 ? r : p).cyl(i % 2 === 0 ? 'brick' : 'white', 0, 0, y0, y1, rad(y0), rad(y1), 24);
    }
    for (const y of [H * 0.36, H * 0.7, H - 1.2]) p.cyl('iron', 0, 0, y, y + 0.5, rad(y) + 0.9, rad(y) + 0.9, 24); // galleries
    p.cyl('dark', 0, 0, H, H + 0.05, r1 - 0.3, r1 - 0.3, 24); // the open top
    place(p, cf);
    placeRed(r, cf);
  }
  for (const k of ['ngtank1', 'ngtank2', 'ngtank3']) {
    const tf = M[k] ? frame(M[k], terrain) : null;
    if (!tf) continue;
    const p = parts(), rr = (tf.L + tf.W) / 2, u = tf.under;
    p.box('concreteDark', -rr - 1, rr + 1, -rr - 1, rr + 1, u, 0.3); // the bund's floor
    p.cyl('white', 0, 0, u, TANK, rr, rr, 32);
    p.cyl('concreteDark', 0, 0, TANK - 1.1, TANK - 0.8, rr + 0.03, rr + 0.03, 32);
    p.cone('concrete', 0, 0, TANK, rr + 0.2, 1.6, 32);
    place(p, tf);
  }

  return { group, nightLit: [glass] };
}
