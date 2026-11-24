// Кратово: hand-built models after descriptions on mk Wikipedia (Симиќева кула, Златкова кула, Крстева кула,
// Саат-кула, Кули на Радин мост, Радин мост, Архитектура на Кратово, Камени Кукли; references only, nothing from them is
// in the repo), on OSM's outlines:
// - The six towers that remain of the town's twelve defensive towers (14th century): square towers of volcanic stone with
//   dressed corners, small barred windows and loopholes, low hipped roofs of stone slabs. Heights and sizes from Wikipedia
//   where it gives them (Симиќева: 7.9 m wide, the south wall 21.95 m, two stone chimneys of 2.5 and 2.2 m; Златковичева:
//   6.3 × 6.5 m, 14.15 m; Крстева: 16.1 m, four storeys over the ground floor); Хаџикостова and Емин-бегова, without
//   figures, are drawn at 14 and 13 m. The Саат-кула: three storeys, the upper ones with a balcony (drawn as a wooden
//   чардак on the side toward the square), a roof of stone slabs; its clock is long gone. OSM's outlines are a little
//   larger than the published sizes: the towers keep the outline's centre and axis and the published width.
// - The stone bridges over the Кратовска (Табачка) Река and the Манцева Река on OSM's bridge outlines: one main arch of
//   dressed stone, a humped deck, stone parapets with slab copings (Грофчански: 30 × 4 m, 8 m high). Радин мост is the
//   highest; the three towers it stands on are not modelled. Where the outline is wider than the bridge (a road bridge
//   drawn with its approaches) the deck keeps OSM's width.
// - Камени Кукли by Куклица: earth pyramids of tuff under harder cap stones, about 15 large ones up to 10 m in the
//   middle of the site and about 120 small ones up to 5 m on its east side (Wikipedia); placed by a seeded random walk
//   inside OSM's outline of the site, not at their real places.
import * as THREE from 'three';
import { frame, parts, modelKit, toPts, PU, MU, PV, MV, type Frame, type Parts } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

/** tower keys → [height m, published half width m (Infinity: the outline's)] */
const TOWERS: Record<string, [number, number]> = {
  krsimic: [22, 3.95], krsaat: [15.5, 3.6], krzlatko: [14.15, 3.2], krkrste: [16.1, 3.4], krhadzi: [14, 3.3], kremin: [13, 3.2],
};
const BRIDGES = ['krradin', 'krgrof', 'krcarsija', 'krjoksir', 'kramam', 'krargul', 'krsaraj'];

/** Walking collision: the towers (the bridges are walked over, the dolls round). */
export function kratovoFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, [h, half]] of Object.entries(TOWERS)) {
    const r = M[k];
    if (!r) continue;
    // the drawn (narrower) square round the outline's centre, on its axis
    const pts = toPts(r), c: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const e = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], l = Math.hypot(e[0], e[1]) || 1, a = [e[0] / l, e[1] / l], b = [-a[1], a[0]];
    const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]), hw = Math.min(half, l / 2, l2 / 2);
    const ring: number[] = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ring.push(c[0] + (a[0] * su + b[0] * sv) * hw, c[1] + (a[1] * su + b[1] * sv) * hw);
    out.push([ring, h]);
  }
  return out;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
}

function inRing(u: number, v: number, ring: Pt[]): boolean {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ui, vi] = ring[i], [uj, vj] = ring[j];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) ins = !ins;
  }
  return ins;
}

/** A square stone tower of half width L × W from `y0` (below ground) to `top`, with quoins, windows, loopholes and a
 *  low hipped roof of slabs. */
function tower(p: Parts, L: number, W: number, y0: number, top: number, seed: number) {
  const r = rng(seed);
  p.box('stone', -L, L, -W, W, y0, top);
  // dressed corners in a lighter stone, alternating long and short
  for (const [cu, cv] of [[-L, -W], [L, -W], [L, W], [-L, W]] as const)
    for (let y = Math.max(y0, -1.5), k = 0; y < top - 0.3; y += 0.6, k++) {
      const a = k % 2 ? 0.8 : 0.45, b = k % 2 ? 0.45 : 0.8;
      const [ua, ub] = cu > 0 ? [cu - a, cu + 0.04] : [cu - 0.04, cu + a], [va, vb] = cv > 0 ? [cv - b, cv + 0.04] : [cv - 0.04, cv + b];
      p.box('ashlar', ua, ub, va, vb, y, y + 0.55);
    }
  // a string course of dressed stone under the top floor and the eaves slab
  p.box('stoneDark', -L - 0.12, L + 0.12, -W - 0.12, W + 0.12, top - 3.4, top - 3.2);
  p.box('stoneDark', -L - 0.5, L + 0.5, -W - 0.5, W + 0.5, top, top + 0.25);
  p.hip('slate', -L - 0.3, L + 0.3, -W - 0.3, W + 0.3, top + 0.25, Math.min(L, W) * 0.55, 0.25);
  // windows: barred openings on the upper floors, narrow loopholes lower down, on every face
  for (const [ang, du, dv, len] of [[PU, L, 0, W], [MU, -L, 0, W], [PV, 0, W, L], [MV, 0, -W, L]] as const) {
    const along = (t: number): [number, number] => (du !== 0 ? [du, t] : [t, dv]);
    const floors = Math.max(2, Math.floor(top / 3.6));
    for (let f = 1; f < floors; f++) {
      const y = f * 3.6 + 0.6;
      if (y > top - 1.6) break;
      if (f >= floors - 2) {
        const t = (r() - 0.5) * len * 0.6, [a, b] = along(t);
        p.put('ashlar', new THREE.BoxGeometry(1.15, 1.45, 0.1).translate(0, 0.72, 0.02), a, b, y - 0.15, ang);
        p.put('dark', new THREE.BoxGeometry(0.75, 1.1, 0.12).translate(0, 0.55, 0.04), a, b, y, ang);
        for (const s of [-0.18, 0.18]) p.put('iron', new THREE.BoxGeometry(0.05, 1.1, 0.06).translate(s, 0.55, 0.1), a, b, y, ang);
      } else {
        for (const t of [-len * 0.4, len * 0.4]) { const [a, b] = along(t + (r() - 0.5) * 0.6); p.put('dark', new THREE.BoxGeometry(0.16, 0.9, 0.1).translate(0, 0.45, 0.03), a, b, y, ang); }
      }
    }
  }
}

/** A stone bridge in a frame along its span (u): one main arch, a humped deck, parapets with copings. */
function bridge(p: Parts, f: Frame, ground: (u: number, v: number) => number) {
  const L = f.L, W = Math.max(1.3, f.W), N = 24;
  // the banks at the ends (just beyond the outline) and the lowest ground under the deck (the river)
  const gA = ground(-L - 1, 0), gB = ground(L + 1, 0);
  let low = Infinity;
  for (let i = 0; i <= N; i++) low = Math.min(low, ground(-L + (2 * L * i) / N, 0));
  // the Kratovo bridges are steeply humped over their one arch: the deck's middle at least ~4 m over the water
  // (the 20 m terrain hardly cuts the narrow river), the rise kept under a third of the half length
  const hump = Math.min(L * 0.3, Math.max(L * 0.07, low + 4.2 - (gA + gB) / 2 - 0.25));
  const deck = (u: number) => gA + ((gB - gA) * (u + L)) / (2 * L) + 0.25 + hump * Math.cos((Math.PI * u) / (2 * L));
  const foot = low - 2.5;
  // the arch: spanning most of the length, springing just above the water, its crown a little under the deck
  const a = L * 0.72, spring = low + 0.4, crown = Math.max(spring + 0.8, deck(0) - 1.1);
  const rise = crown - spring;
  const R = rise >= a ? a : (a * a + rise * rise) / (2 * rise), yc = crown - R;
  const arc: [number, number][] = [];
  for (let i = 0; i <= 28; i++) { const x = -a + (2 * a * i) / 28; arc.push([x, yc + Math.sqrt(Math.max(0, R * R - x * x))]); }
  const s = new THREE.Shape();
  s.moveTo(-L, foot);
  s.lineTo(-a, foot);
  s.lineTo(-a, spring);
  if (rise >= a) s.lineTo(-a, yc);
  for (const [x, y] of arc) s.lineTo(x, Math.max(y, spring));
  if (rise >= a) s.lineTo(a, spring);
  s.lineTo(a, foot);
  s.lineTo(L, foot);
  for (let i = N; i >= 0; i--) { const u = -L + (2 * L * i) / N; s.lineTo(u, deck(u)); }
  s.closePath();
  p.add('stone', new THREE.ExtrudeGeometry(s, { depth: 2 * W, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -W));
  // the arch ring of dressed voussoirs on both faces
  for (const sv of [-1, 1])
    for (let i = 0; i < 15; i++) {
      const t0 = i / 15, t1 = (i + 1) / 15, x0 = -a + 2 * a * t0, x1 = -a + 2 * a * t1;
      const y0 = Math.max(spring, yc + Math.sqrt(Math.max(0, R * R - x0 * x0))), y1 = Math.max(spring, yc + Math.sqrt(Math.max(0, R * R - x1 * x1)));
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
      const g = new THREE.BoxGeometry(len * 0.92, 0.55, 0.12).translate(0, 0.27, 0).rotateZ(ang).translate(mx, my, sv * (W + 0.03));
      p.add(i % 2 ? 'ashlar' : 'cream', g);
    }
  // parapets following the deck, with slab copings
  for (let i = 0; i < N; i++) {
    const u0 = -L + (2 * L * i) / N, u1 = -L + (2 * L * (i + 1)) / N, d0 = deck(u0), d1 = deck(u1), dm = (d0 + d1) / 2;
    for (const sv of [-1, 1]) {
      p.box('stone', u0, u1 + 0.02, sv * W - (sv > 0 ? 0.35 : 0), sv * W + (sv > 0 ? 0 : 0.35), Math.min(d0, d1) - 0.2, dm + 0.85);
      p.box('ashlar', u0, u1 + 0.02, sv * W - (sv > 0 ? 0.42 : -0.07), sv * W + (sv > 0 ? 0.07 : 0.42), dm + 0.85, dm + 1.0);
    }
  }
}

export function createKratovo(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  /** ground under a frame's (u, v), relative to its floor */
  const ground = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };

  // ---------------- the towers: +u east where the outline allows
  let seed = 7;
  for (const [k, [h, half]] of Object.entries(TOWERS)) {
    const f = M[k] ? frame(M[k], terrain, [1, 0]) : null;
    seed += 13;
    if (!f) continue;
    const p = parts(), L = Math.min(f.L, half), W = Math.min(f.W, half);
    tower(p, L, W, f.under, h, seed);
    if (k === 'krsimic') { // two chimneys of dressed stone on the slab roof (north and east)
      p.box('ashlar', -0.4, 0.4, -W * 0.55 - 0.4, -W * 0.55 + 0.4, h, h + 2.5 + L * 0.3);
      p.box('ashlar', L * 0.5 - 0.35, L * 0.5 + 0.35, -0.35, 0.35, h, h + 2.2 + L * 0.25);
    }
    if (k === 'krsaat') { // the wooden чардак on the top floor, on the south side toward the square
      const b0 = h - 3.3, b1 = h - 0.2, bv = W + 1.1;
      p.box('woodDark', -L * 0.75, L * 0.75, W, bv, b0 - 0.25, b0);
      p.box('plaster', -L * 0.75, L * 0.75, bv - 0.1, bv, b0, b1);
      p.box('wood', -L * 0.75, L * 0.75, bv - 0.14, bv + 0.02, b0, b0 + 1.0);
      for (const t of [-0.5, 0, 0.5]) p.put('glass', new THREE.BoxGeometry(0.8, 1.1, 0.06), t * L * 1.2, bv + 0.01, b0 + 1.75, PV);
      for (const t of [-0.75, 0, 0.75]) p.box('woodDark', t * L - 0.07, t * L + 0.07, bv - 0.15, bv + 0.03, b0, b1);
      p.box('slate', -L * 0.75 - 0.2, L * 0.75 + 0.2, W, bv + 0.35, b1, b1 + 0.18);
      p.put('door', new THREE.BoxGeometry(1.2, 2.2, 0.1).translate(0, 1.1, 0.03), 0, W, 0.2, PV); // the door at street level
    }
    place(p, f);
  }

  // ---------------- the stone bridges: u along the span
  for (const k of BRIDGES) {
    const f = M[k] ? frame(M[k], terrain) : null;
    if (!f) continue;
    const p = parts();
    bridge(p, f, (u, v) => ground(f, u, v));
    place(p, f);
  }

  // ---------------- Камени Кукли: earth pyramids of tuff with cap stones, inside the site's outline
  const kf = M.krkukli ? frame(M.krkukli, terrain, [1, 0]) : null;
  if (kf) {
    const ring = toPts(M.krkukli).map(([x, z]) => kf.local(x, z));
    const p = parts(), r = rng(1052);
    let us = Infinity, ue = -Infinity;
    for (const [u] of ring) { us = Math.min(us, u); ue = Math.max(ue, u); }
    const doll = (u: number, v: number, h: number, w: number) => {
      const g = ground(kf, u, v) - 0.4, seg = 7;
      const neck = 0.55 + r() * 0.2;
      p.cyl('ochre', u, v, g, g + h * 0.55, w, w * 0.62, seg); // the broad foot of tuff
      p.cyl('ochre', u, v, g + h * 0.55, g + h * 0.88, w * 0.62, w * 0.42 * neck, seg); // the slender neck
      // the darker cap stone: a squat, tilted block
      const cap = new THREE.DodecahedronGeometry(w * (0.55 + r() * 0.25), 0).scale(1.1, 0.7, 0.9).rotateY(r() * 6).rotateZ((r() - 0.5) * 0.4);
      p.add('rockDark', cap.translate(u, g + h * 0.92, v));
    };
    // the large ones close together in the middle of the site, the small ones in a looser band east of them, often
    // in twos and threes joined at the foot (as the descriptions have it); kept inside the outline
    const cu = us + (ue - us) * 0.42, cv = 0;
    const cluster = (n: number, u0: number, v0: number, ru: number, rv: number, hmin: number, hmax: number, wmul: number) => {
      for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        const u = u0 + Math.cos(a) * d * ru, v = v0 + Math.sin(a) * d * rv;
        if (!inRing(u, v, ring)) continue;
        const h = hmin + r() * (hmax - hmin);
        doll(u, v, h, h * wmul * (0.8 + r() * 0.4));
        if (r() < 0.45) { const h2 = h * (0.5 + r() * 0.3); doll(u + (r() - 0.5) * h * 0.5, v + (r() - 0.5) * h * 0.5, h2, h2 * wmul); }
        i++;
      }
    };
    cluster(15, cu, cv, 28, 22, 5.5, 10, 0.24);
    cluster(80, cu + (ue - us) * 0.22, cv, 45, 40, 1.8, 5, 0.3);
    place(p, kf);
  }

  return { group, nightLit: [glass] };
}
