// Resen and Prespa: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in
// the repo):
// - Ресенски сарај (Нијази-бег's palace, 1909): pale yellow walls over a stone plinth, white cornices and pilasters,
//   tall windows on two floors and an attic, steep roofs of dark tiles; in the recess of its south front a stone porch
//   on two columns that carries a balcony, and over it a tower with a dark pyramid roof and a glazed belvedere.
//   Built on OSM's outline (two wings round a recess) with a mansard roof following it.
// - Св. Петар on Голем Град and Св. Ѓорѓи in Курбиново: small churches of stone with brick courses under gable roofs,
//   `byzChurch` without a drum, on their OSM outlines.
// Heights are read off the photos (door ≈ 2.2 m, people), not measured.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch, facing, tris, toPts } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function resenFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['saraj', 14], ['gpetar', 7], ['kurbinovo', 7]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

/** A ring offset by `d` (positive: outward), each vertex along its corner's bisector (mitred). */
function offset(ring: Pt[], d: number): Pt[] {
  let a2 = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
  const s = a2 > 0 ? 1 : -1, n = ring.length;
  const nrm = (p: Pt, q: Pt): Pt => { const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1; return [s * dz / l, -s * dx / l]; };
  return ring.map((p, i) => {
    const a = nrm(ring[(i + n - 1) % n], p), b = nrm(p, ring[(i + 1) % n]), m: Pt = [a[0] + b[0], a[1] + b[1]], k = (m[0] * a[0] + m[1] * a[1]) || 1;
    return [p[0] + (m[0] * d) / k, p[1] + (m[1] * d) / k];
  });
}

export function createResen(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Ресенски сарај on its outline
  const sf = M.saraj ? frame(M.saraj, terrain) : null;
  if (sf) {
    const p = parts(), u = sf.under, eave = 11.2;
    let ring = toPts(M.saraj).map(([x, z]) => sf.local(x, z));
    if (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 0.1) ring = ring.slice(0, -1);
    p.walls('stone', ring, u, 1.0);
    p.walls('ochre', ring, 1.0, eave);
    p.bands('white', ring, [1.0, 4.4, 8.3], 0.3, 0.08); // the plinth's top, the cornices between the floors
    p.bands('white', ring, [eave - 0.5], 0.5, 0.18); // the main cornice
    // tall windows on two floors and small attic ones, white pilasters between them
    p.edges(ring, (cu, cv, len, ang) => {
      const n = Math.max(1, Math.floor(len / 3.3)), su = Math.sin(ang + Math.PI / 2), sv = Math.cos(ang + Math.PI / 2);
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + ((i + 0.5) * len) / n, wu = cu + su * o, wv = cv + sv * o;
        for (const [y, h] of [[1.7, 2.3], [5.3, 2.3], [9.0, 1.0]] as const) {
          p.put('white', new THREE.BoxGeometry(1.35, h + 0.3, 0.06), wu, wv, y + h / 2, ang);
          p.put('glass', new THREE.BoxGeometry(1.0, h, 0.1), wu, wv, y + h / 2, ang);
        }
        if (i > 0) p.put('white', new THREE.BoxGeometry(0.45, eave - 1.6, 0.1), cu + su * (o - len / (2 * n)), cv + sv * (o - len / (2 * n)), 1.0 + (eave - 1.6) / 2, ang);
      }
    });
    // the mansard: steep dark slopes from the eaves (0.5 m out) to a flat top 2.6 m in
    const outer = offset(ring, 0.5), inner = offset(ring, -2.6), top = eave + 3.0, t: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length, a = outer[i], b = outer[j], c = inner[j], d = inner[i];
      const ou = (a[0] + b[0]) / 2 - (c[0] + d[0]) / 2, ov = (a[1] + b[1]) / 2 - (c[1] + d[1]) / 2;
      t.push(...facing([a[0], eave, a[1], b[0], eave, b[1], c[0], top, c[1], a[0], eave, a[1], c[0], top, c[1], d[0], top, d[1]], [ou, 1, ov]));
    }
    p.add('slate', tris(t));
    p.walls('slate', inner, top - 0.05, top);
    // the porch and the tower at the middle of the recess: the outline's edge nearest its centre, facing out
    let best = { d: Infinity, u: 0, v: 0, ang: 0, len: 0 };
    p.edges(ring, (cu, cv, len, ang) => { const d = Math.hypot(cu, cv); if (len > 6 && d < best.d) best = { d, u: cu, v: cv, ang, len }; });
    const fu = Math.sin(best.ang), fv = Math.cos(best.ang); // outward
    const ru = Math.cos(best.ang), rv = -Math.sin(best.ang); // along the front
    const at = (out: number, side: number): [number, number] => [best.u + fu * out + ru * side, best.v + fv * out + rv * side];
    // the stone porch: two columns 3.6 m out carrying the balcony, the arched door behind
    for (const sd of [-2.2, 2.2]) { const [cu, cv] = at(3.6, sd); p.cyl('ashlar', cu, cv, 1.0, 4.3, 0.32, 0.28, 10); p.box('ashlar', cu - 0.5, cu + 0.5, cv - 0.5, cv + 0.5, u, 1.0); }
    { const [cu, cv] = at(1.9, 0); p.put('ashlar', new THREE.BoxGeometry(5.4, 0.45, 4.0), cu, cv, 4.3, best.ang); }
    { const [cu, cv] = at(3.75, 0); p.put('iron', new THREE.BoxGeometry(5.2, 0.9, 0.08).translate(0, 0.45, 0), cu, cv, 4.75, best.ang); }
    { const [cu, cv] = at(0.02, 0); p.put('ashlar', p.arch(3.0, 3.6, 0.1), cu, cv, 1.0, best.ang); p.put('door', p.arch(1.8, 3.0, 0.14), cu, cv, 1.0, best.ang); }
    // the tower: a square shaft from the roof, a round window, the dark pyramid and the glazed belvedere
    const [tu, tv] = at(-2.4, 0), ts = 2.4;
    p.box('ochre', tu - ts, tu + ts, tv - ts, tv + ts, eave - 1, eave + 4.2);
    p.box('white', tu - ts - 0.15, tu + ts + 0.15, tv - ts - 0.15, tv + ts + 0.15, eave + 4.0, eave + 4.4);
    p.put('glass', new THREE.CylinderGeometry(0.45, 0.45, 0.08, 14).rotateX(Math.PI / 2), tu + fu * ts, tv + fv * ts, eave + 2.6, best.ang);
    p.add('slate', new THREE.ConeGeometry(ts * 1.4, 3.0, 4).rotateY(Math.PI / 4 + best.ang).translate(tu, eave + 4.4 + 1.5, tv));
    p.box('white', tu - 1.3, tu + 1.3, tv - 1.3, tv + 1.3, eave + 6.6, eave + 6.8);
    p.box('glass', tu - 1.15, tu + 1.15, tv - 1.15, tv + 1.15, eave + 6.8, eave + 8.2);
    p.box('white', tu - 1.4, tu + 1.4, tv - 1.4, tv + 1.4, eave + 8.2, eave + 8.45);
    p.add('slate', new THREE.ConeGeometry(1.9, 1.1, 4).rotateY(Math.PI / 4 + best.ang).translate(tu, eave + 8.45 + 0.55, tv));
    p.cyl('iron', tu, tv, eave + 9.5, eave + 10.4, 0.05, 0.05, 6);
    place(p, sf);
  }

  // ---------------- Св. Петар on Голем Град, Св. Ѓорѓи in Курбиново: small gabled churches, the apse east
  for (const key of ['gpetar', 'kurbinovo'] as const) {
    const f = M[key] ? frame(M[key], terrain, [1, 0], true) : null;
    if (!f) continue;
    const p = parts();
    byzChurch(p, f, { wall: 'cloisonne', drum: false, low: key === 'gpetar' ? 3.6 : 4.4 });
    place(p, f);
  }

  return { group, nightLit: [glass] };
}
