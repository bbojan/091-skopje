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
// - Хотел Кратис, after the hotel's own photo of its front (hotelkratis.mk; a reference only): a one-storey podium of
//   tan rubble stone with white pilasters over OSM's whole outline, its flat roof the summer terrace (wooden posts, a
//   white sail awning); on it the hotel block, three bays wide: three floors of a white concrete frame with tan stone
//   panels and one window a bay, a white cornice, a dark grey mansard with dormers; the wine-red „HOTEL KRATIS“ board
//   over the glazed entrance. Its depth and where it stands on the podium are guessed (the front toward the terrace,
//   south-east, as in the photo).
// - Ѕинговата куќа (the house of Љубисав Иванов – Ѕинго, 1936–2020, director of „Силекс“ for over 40 years, the
//   developer's pick of the building): an old Кратово house as Wikipedia describes them — a stone ground floor, a white
//   upper floor overhanging on wooden brackets, timber beams, shuttered windows, a hipped tile roof with wide eaves — and
//   on its west wall a mural drawn here (a canvas: a miner's lamp and helmet for „Силекс“, a football for the
//   federation, „ЅИНГО LAND“ in a vez border).
// - The joke: „ЅИНГО LAND“ in big white letters on posts on the crater's north slope, facing the town, like Hollywood's.
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
  if (M.krkratis) out.push([M.krkratis, 4.2]); // the podium (the block on it is out of reach on foot)
  if (M.krsingo) out.push([M.krsingo, 8]);
  return out;
}

/** The mural on Ѕинго's house: a vez border, a miner's helmet with its lamp, a football, „ЅИНГО LAND“ (drawn). */
function muralTexture(): THREE.CanvasTexture {
  const w = 1024, h = 768, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4ede0'; g.fillRect(0, 0, w, h);
  // the vez border: rows of cross-stitched diamonds in wine and indigo
  const stitch = (x: number, y: number, s: number, col: string) => { g.strokeStyle = col; g.lineWidth = s * 0.35; g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); g.stroke(); };
  for (let i = 0; i < 2; i++) for (let x = 24; x < w; x += 48) for (const y of [24, h - 24]) {
    const k = Math.round(x / 48) % 2;
    for (const [dx, dy] of [[0, -12], [12, 0], [0, 12], [-12, 0]]) stitch(x + dx, y + dy, 5, k ? '#7a1f1a' : '#1f2a44');
  }
  for (let y = 72; y < h - 48; y += 48) for (const x of [24, w - 24]) for (const [dx, dy] of [[0, -12], [12, 0], [0, 12], [-12, 0]]) stitch(x + dx, y + dy, 5, Math.round(y / 48) % 2 ? '#7a1f1a' : '#1f2a44');
  // the sky over the crater: a sun and the hills
  g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(800, 210, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9a77a'; g.beginPath(); g.moveTo(60, 470); g.quadraticCurveTo(260, 260, 512, 430); g.quadraticCurveTo(760, 280, 964, 470); g.lineTo(964, 520); g.lineTo(60, 520); g.fill();
  // the miner's helmet with its lamp (Силекс), left
  g.fillStyle = '#f1c232'; g.strokeStyle = '#2a2420'; g.lineWidth = 8;
  g.beginPath(); g.arc(300, 420, 120, Math.PI, 0); g.lineTo(440, 420); g.lineTo(160, 420); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(300, 425, 160, 22, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(300, 345, 30, 0, Math.PI * 2); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255, 240, 160, 0.7)'; g.lineWidth = 6;
  for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) { g.beginPath(); g.moveTo(300 + Math.sin(a) * 40, 345 - Math.cos(a) * 40); g.lineTo(300 + Math.sin(a) * 110, 345 - Math.cos(a) * 110); g.stroke(); }
  // the football, right
  g.fillStyle = '#ffffff'; g.strokeStyle = '#2a2420'; g.lineWidth = 8;
  g.beginPath(); g.arc(720, 400, 95, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#2a2420';
  const pent = (cx: number, cy: number, r: number, rot: number) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = rot + (i * Math.PI * 2) / 5; g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); } g.closePath(); g.fill(); };
  pent(720, 400, 30, 0);
  for (let i = 0; i < 5; i++) { const a = (i * Math.PI * 2) / 5 + Math.PI / 5; pent(720 + Math.sin(a) * 75, 400 - Math.cos(a) * 75, 20, a); }
  // the lettering
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let fs = 150;
  g.font = `bold ${fs}px "Rubik Mono One", "Arial Black", sans-serif`;
  while (g.measureText('ЅИНГО LAND').width > w - 140 && fs > 40) { fs -= 6; g.font = `bold ${fs}px "Rubik Mono One", "Arial Black", sans-serif`; }
  g.lineWidth = 14; g.strokeStyle = '#1f2a44'; g.strokeText('ЅИНГО LAND', w / 2, 680);
  g.fillStyle = '#7a1f1a'; g.fillText('ЅИНГО LAND', w / 2, 680);
  g.font = 'bold 56px "Lora", serif'; g.fillStyle = '#1f2a44'; g.fillText('КРАТОВО', w / 2, 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Stroke letters for the hillside sign, in a 1 × 1.4 box: polylines. */
const LETTERS: Record<string, [number, number][][]> = {
  Ѕ: [[[1, 1.4], [0, 1.4], [0, 0.7], [1, 0.7], [1, 0], [0, 0]]],
  И: [[[0, 1.4], [0, 0], [1, 1.4], [1, 0]]],
  Н: [[[0, 0], [0, 1.4]], [[1, 0], [1, 1.4]], [[0, 0.7], [1, 0.7]]],
  Г: [[[0, 0], [0, 1.4], [1, 1.4]]],
  О: [[[0, 0], [0, 1.4], [1, 1.4], [1, 0], [0, 0]]],
  L: [[[0, 1.4], [0, 0], [1, 0]]],
  A: [[[0, 0], [0.5, 1.4], [1, 0]], [[0.22, 0.6], [0.78, 0.6]]],
  N: [[[0, 0], [0, 1.4], [1, 0], [1, 1.4]]],
  D: [[[0, 0], [0, 1.4], [0.6, 1.4], [1, 1.0], [1, 0.4], [0.6, 0], [0, 0]]],
};

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

  // ---------------- Хотел Кратис: +u along the outline to the north-east, +v to the south-east (the front)
  const hf = M.krkratis ? frame(M.krkratis, terrain, [1, -1]) : null;
  if (hf) {
    const p = parts(), ring = toPts(M.krkratis).map(([x, z]) => hf.local(x, z));
    const G = 4.2, F = 3.15, top = G + 3 * F; // the podium, three framed floors
    p.walls('ochre', ring, hf.under, G - 0.45);
    p.walls('white', ring, G - 0.45, G);
    // the podium's front: white pilasters and dark glazing between them
    p.edges(ring, (u, v, len, ang) => {
      const n = Math.max(1, Math.round(len / 4.2));
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (len * i) / n;
        p.put('white', new THREE.BoxGeometry(0.45, G - 0.45, 0.16).translate(t, (G - 0.45) / 2, 0.04), u, v, 0, ang);
        if (i < n && (i + 1) % 2) p.put('glass', new THREE.BoxGeometry(len / n - 0.9, 2.3, 0.1).translate(t + len / n / 2, 1.85, 0.04), u, v, 0, ang);
      }
    });
    // the terrace railing round the podium's roof
    p.edges(ring, (u, v, len, ang) => {
      p.put('iron', new THREE.BoxGeometry(len, 0.06, 0.06).translate(0, 1.0, -0.1), u, v, G, ang);
      for (let t = -len / 2; t <= len / 2; t += 1.6) p.put('iron', new THREE.BoxGeometry(0.04, 1.0, 0.04).translate(t, 0.5, -0.1), u, v, G, ang);
    });
    // the hotel block: three bays (13 m) on the front, 15 m deep, standing on the front of the podium
    const tu = 6.5, v1 = hf.W - 0.2, v0 = v1 - 15, uc = -hf.L * 0.1, u0 = uc - tu, u1 = uc + tu;
    p.box('ochre', u0 + 0.12, u1 - 0.12, v0 + 0.12, v1 - 0.12, G, top);
    for (let f = 0; f <= 3; f++) p.box('white', u0 - 0.1, u1 + 0.1, v0 - 0.1, v1 + 0.1, G + f * F - (f ? 0.2 : 0), G + f * F + 0.2);
    // the frame's posts and the windows, front and back (3 bays) and the sides (4 bays)
    for (const [vv, ang] of [[v1, PV], [v0, MV]] as const)
      for (let i = 0; i <= 3; i++) {
        const uu = u0 + (2 * tu * i) / 3;
        p.box('white', uu - 0.3, uu + 0.3, vv - 0.3, vv + 0.3, G, top);
        if (i < 3) for (let f = 0; f < 3; f++) {
          const um = uu + tu / 3, y = G + f * F + 0.95;
          p.put('white', new THREE.BoxGeometry(1.5, 1.6, 0.1).translate(0, 0.8, 0.03), um, vv, y - 0.1, ang);
          p.put('glass', new THREE.BoxGeometry(1.2, 1.35, 0.12).translate(0, 0.68, 0.05), um, vv, y, ang);
        }
      }
    for (const [uu, ang] of [[u1, PU], [u0, MU]] as const)
      for (let i = 0; i <= 4; i++) {
        const vv = v0 + (15 * i) / 4;
        p.box('white', uu - 0.3, uu + 0.3, vv - 0.3, vv + 0.3, G, top);
        if (i < 4) for (let f = 0; f < 3; f++) {
          const vm = vv + 15 / 8, y = G + f * F + 0.95;
          p.put('white', new THREE.BoxGeometry(1.5, 1.6, 0.1).translate(0, 0.8, 0.03), uu, vm, y - 0.1, ang);
          p.put('glass', new THREE.BoxGeometry(1.2, 1.35, 0.12).translate(0, 0.68, 0.05), uu, vm, y, ang);
        }
      }
    // the cornice and the dark mansard: a steep frustum, a flat top, dormers on every side
    p.box('white', u0 - 0.45, u1 + 0.45, v0 - 0.45, v1 + 0.45, top, top + 0.45);
    const mh = 3.3, ins = 1.0, mansard = new THREE.CylinderGeometry(Math.SQRT2 * (1 - ins / tu), Math.SQRT2, mh, 4, 1).rotateY(Math.PI / 4).scale(tu + 0.2, 1, 7.5 + 0.2).translate(uc, top + 0.45 + mh / 2, (v0 + v1) / 2);
    p.add('slate', mansard);
    p.box('lead', u0 + ins, u1 - ins, v0 + ins * 0.6, v1 - ins * 0.6, top + 0.45 + mh, top + 0.55 + mh);
    const dormer = (u: number, v: number, ang: number) => {
      const d = new THREE.BoxGeometry(1.3, 1.5, 1.1).translate(0, 0.75, 0.15);
      p.put('white', d, u, v, top + 1.0, ang);
      p.put('glass', new THREE.BoxGeometry(0.9, 1.1, 0.1).translate(0, 0.65, 0.72), u, v, top + 1.0, ang);
      p.put('slate', new THREE.BoxGeometry(1.6, 0.18, 1.4).translate(0, 1.6, 0.15), u, v, top + 1.0, ang);
    };
    for (let i = 0; i < 4; i++) { const uu = u0 + 1.8 + (i * (2 * tu - 3.6)) / 3; dormer(uu, v1 - 0.25, PV); dormer(uu, v0 + 0.25, MV); }
    for (let i = 0; i < 3; i++) { const vv = v0 + 3 + i * 4.5; dormer(u1 - 0.25, vv, PU); dormer(u0 + 0.25, vv, MU); }
    // the entrance: glazed doors in a stone surround and the wine-red board with gold letters over them
    p.put('glass', new THREE.BoxGeometry(2.6, 2.6, 0.12).translate(0, 1.3, 0.05), uc, v1, 0.1, PV);
    p.put('brick', new THREE.BoxGeometry(4.2, 0.75, 0.2).translate(0, 0.37, 0.12), uc, v1, 3.0, PV);
    p.put('gold', new THREE.BoxGeometry(3.4, 0.22, 0.06).translate(0, 0.37, 0.24), uc, v1, 3.0, PV);
    // the summer terrace on the podium north-east of the block: wooden posts and a white sail awning
    const t0 = u1 + 1.5, t1 = Math.min(hf.L - 1, u1 + 12);
    if (t1 > t0 + 3) {
      for (let uu = t0; uu <= t1 + 0.01; uu += (t1 - t0) / 3) for (const vv of [v0 + 2, v1 - 2]) p.box('woodDark', uu - 0.12, uu + 0.12, vv - 0.12, vv + 0.12, G, G + 3.2);
      for (let k = 0; k < 6; k++) {
        const a = t0 + ((t1 - t0) * k) / 6, b = t0 + ((t1 - t0) * (k + 1)) / 6, sag = k % 2 ? -0.25 : 0;
        p.box('white', a, b, v0 + 2, v1 - 2, G + 3.05 + sag, G + 3.1 + sag);
      }
    }
    place(p, hf);
  }

  // ---------------- Ѕинговата куќа: +u east, +v south (toward the street)
  const sf = M.krsingo ? frame(M.krsingo, terrain, [1, 0], true) : null;
  if (sf) {
    const p = parts(), L = sf.L, W = sf.W, g1 = 3.0, g2 = 6.0, ov = 0.45;
    p.box('stone', -L, L, -W, W, sf.under, g1);
    for (const [cu, cv] of [[-L, -W], [L, -W], [L, W], [-L, W]] as const) // dressed corners
      for (let y = Math.max(sf.under, -1), k = 0; y < g1 - 0.2; y += 0.5, k++) {
        const a = k % 2 ? 0.7 : 0.4;
        p.box('ashlar', cu > 0 ? cu - a : cu - 0.03, cu > 0 ? cu + 0.03 : cu + a, cv > 0 ? cv - a : cv - 0.03, cv > 0 ? cv + 0.03 : cv + a, y, y + 0.45);
      }
    // the white upper floor, overhanging the street on wooden brackets, its timber frame showing
    p.box('woodDark', -L, L + 0.05, -W - 0.05, W + ov + 0.05, g1, g1 + 0.25);
    p.box('plaster', -L, L, -W, W + ov, g1 + 0.25, g2);
    p.box('woodDark', -L, L + 0.06, -W - 0.06, W + ov + 0.06, g2 - 0.2, g2);
    for (const uu of [-L, -L / 3, L / 3, L]) p.box('woodDark', uu - 0.1, uu + 0.1, W + ov - 0.02, W + ov + 0.06, g1 + 0.25, g2);
    for (let uu = -L + 0.6; uu <= L - 0.6; uu += (2 * L - 1.2) / 5) { // the brackets
      p.box('woodDark', uu - 0.09, uu + 0.09, W, W + ov, g1 - 0.15, g1);
      p.put('woodDark', new THREE.BoxGeometry(0.14, 0.14, 0.9).rotateX(-0.75).translate(0, 0, 0), uu, W + ov * 0.45, g1 - 0.45, PV);
    }
    // shuttered windows upstairs (south and north), small barred ones and the door below
    for (const [vv, ang] of [[W + ov, PV], [-W, MV]] as const)
      for (let i = 0; i < 4; i++) {
        const uu = -L + (L * 2 * (i + 0.5)) / 4;
        p.put('glass', new THREE.BoxGeometry(0.9, 1.3, 0.1).translate(0, 0.65, 0.04), uu, vv, g1 + 1.0, ang);
        for (const sx of [-0.75, 0.75]) p.put('wood', new THREE.BoxGeometry(0.55, 1.35, 0.08).translate(sx, 0.67, 0.07), uu, vv, g1 + 0.98, ang);
      }
    p.put('door', new THREE.BoxGeometry(1.2, 2.2, 0.12).translate(0, 1.1, 0.04), L * 0.35, W, 0, PV);
    for (const uu of [-L * 0.5, -L * 0.05]) {
      p.put('dark', new THREE.BoxGeometry(0.7, 0.8, 0.1).translate(0, 0.4, 0.04), uu, W, 1.2, PV);
      for (const sx of [-0.2, 0, 0.2]) p.put('iron', new THREE.BoxGeometry(0.04, 0.8, 0.05).translate(sx, 0.4, 0.09), uu, W, 1.2, PV);
    }
    // the hipped tile roof with wide eaves and a chimney
    p.hip('tile', -L, L, -W, W + ov, g2, 2.3, 0.9);
    p.box('stone', L * 0.4 - 0.35, L * 0.4 + 0.35, -W * 0.3 - 0.35, -W * 0.3 + 0.35, g2 + 0.8, g2 + 3.1);
    p.box('slate', L * 0.4 - 0.5, L * 0.4 + 0.5, -W * 0.3 - 0.5, -W * 0.3 + 0.5, g2 + 3.1, g2 + 3.25);
    place(p, sf);
    // the mural on the west wall, both floors, a little proud of it
    const mm = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * W - 0.4, g2 - 0.6).rotateY(-Math.PI / 2).translate(-L - 0.12, (g2 + 0.2) / 2, ov / 2).applyMatrix4(sf.m),
      new THREE.MeshLambertMaterial({ map: muralTexture(), clippingPlanes }),
    );
    mm.castShadow = mm.receiveShadow = true;
    group.add(mm);
  }

  // ---------------- the joke: „ЅИНГО LAND“ on the hillside, letters facing the town (−v, north of the town is +v... the
  // frame's +v points south, toward the town)
  const gf = M.krsign ? frame(M.krsign, terrain, data.landmarks?.modelAxes?.krsign, true) : null;
  if (gf) {
    const p = parts(), text = 'ЅИНГО LAND', H = 11, Wl = H / 1.4 * 0.8, gap = 2.6, st = 1.4;
    const total = [...text].reduce((s, ch) => s + (ch === ' ' ? Wl * 0.8 : Wl + gap), -gap);
    let x = -total / 2;
    for (const ch of text) {
      if (ch === ' ') { x += Wl * 0.8; continue; }
      let gmin = Infinity;
      for (let k = 0; k <= 4; k++) gmin = Math.min(gmin, ground(gf, x + (Wl * k) / 4, 0));
      const y0 = gmin + 2.2;
      for (const line of LETTERS[ch] ?? []) for (let i = 0; i + 1 < line.length; i++) {
        const [ax, ay] = line[i], [bx, by] = line[i + 1];
        const pa = [x + ax * Wl, y0 + (ay * H) / 1.4], pb = [x + bx * Wl, y0 + (by * H) / 1.4];
        const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        p.add('white', new THREE.BoxGeometry(len + st, st, 0.35).rotateZ(ang).translate((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, 0));
      }
      // the posts and braces behind each letter, down to the slope
      for (const k of [0.15, 0.85]) {
        const uu = x + Wl * k, gy = ground(gf, uu, -0.6);
        p.box('woodDark', uu - 0.15, uu + 0.15, -0.75, -0.45, gy - 0.5, y0 + H * 0.8);
        p.put('woodDark', new THREE.BoxGeometry(0.2, 0.2, 4.2).rotateX(0.8), uu, -2.0, gy + 1.2, 0);
      }
      x += Wl + gap;
    }
    place(p, gf);
  }

  return { group, nightLit: [glass] };
}
