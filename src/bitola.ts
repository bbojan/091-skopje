// Bitola: hand-built monuments on their OSM outlines (`models` in PREP; the generic buildings are left out),
// after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Саат-кула (OSM: height 32 m): a square shaft of rubble stone up to a moulded cornice; above it a lighter
//   stone stage with corner pilasters and a clock on each side (dark blue faces, gold numerals and hands);
//   a balcony with an iron railing; a white octagonal belfry with arched louvred openings, a low lead roof
//   and a cross on top.
// - Ајдар-кади џамија (16th c.): a square prayer hall, white walls on a stone base, a big lead dome on an
//   octagonal drum with arched windows; in front a portico of three pointed arches on four columns under three
//   small lead domes; a slender white minaret on a stone base at the hall's corner, one balcony (şerefe) on a
//   corbelled ring, a pointed lead cap.
// - Безистен: a long hall under parallel lead-grey barrel vaults with small dormers; white and pale pink
//   facades with round-arched gates.
// - Св. Димитриј (1830): a large basilica of pale ashlar banded with brick, round-arched windows in brick
//   frames, a low hipped grey roof; the bell tower beside it: stone shaft, red-brick belfry with paired arched
//   openings, a pyramid roof and a cross.
// - Хераклеа Линкестис: the Roman theatre (the cavea's stepped half bowl of grey stone, the orchestra, the
//   brick-arched stage building) and the low walls of the Great Basilica.
// Sizes are read off the photos (door ≈ 2.5 m), not measured; outlines and the tower's height from OSM.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { obb } from './geo.ts';
import { strip } from './churches.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

// ---------------------------------------------------------------- Heraclea's mosaic floors (painted canvases)
// After photos of the Great Basilica (6th century): the narthex's floor of ~100 m² as one field of paradise
// (fruit trees, deer, a lion and a bull, a kantharos with vines in the middle) inside a black and white
// meander border with a band of medallions; geometric carpets (eight-pointed stars of two squares, small
// squares with knots, crosses and vessels, a braided border); a panel of a peacock among vines inside a
// wave border. Drawn by hand, simplified; the tesserae are a speckle over it.
type Paint = (g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;
const TESS = { cream: '#e8dbc0', white: '#f2ebdc', black: '#2e2a28', ochre: '#c49a5a', red: '#a8553a', rose: '#c98b72', green: '#6f8a55', grey: '#8c9aa0', brown: '#7a5235' };
function mosaicTexture(paint: Paint, w: number, h: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  let s = 7;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
  paint(g, w, h, rnd);
  // tesserae: each 4 px cell a little lighter or darker, with dark grout lines between
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
    const k = (rnd() - 0.5) * 26;
    for (let j = 0; j < 4 && y + j < h; j++) for (let i = 0; i < 4 && x + i < w; i++) {
      const o = ((y + j) * w + x + i) * 4, grout = i === 3 || j === 3 ? -22 : 0;
      d[o] += k + grout; d[o + 1] += k + grout; d[o + 2] += k + grout;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** a black and white Greek key band from x0 to x1 at y, `b` high */
function meander(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, b: number): void {
  g.fillStyle = TESS.white; g.fillRect(x0, y, x1 - x0, b);
  g.strokeStyle = TESS.black; g.lineWidth = b * 0.12; g.lineCap = 'square';
  const u = b * 0.8, m = b * 0.1;
  for (let x = x0 + m; x + u <= x1; x += u) {
    g.beginPath();
    g.moveTo(x, y + b - m); g.lineTo(x, y + m); g.lineTo(x + u * 0.75, y + m); g.lineTo(x + u * 0.75, y + b * 0.62);
    g.lineTo(x + u * 0.35, y + b * 0.62); g.lineTo(x + u * 0.35, y + b * 0.38);
    g.moveTo(x, y + b - m); g.lineTo(x + u, y + b - m);
    g.stroke();
  }
}
/** a wave (running dog) band */
function waves(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, b: number, ink: string, ground: string): void {
  g.fillStyle = ground; g.fillRect(x0, y, x1 - x0, b);
  g.strokeStyle = ink; g.lineWidth = b * 0.18;
  g.beginPath();
  for (let x = x0; x < x1; x += b * 1.2) {
    g.moveTo(x, y + b * 0.8);
    g.bezierCurveTo(x + b * 0.4, y + b * 0.8, x + b * 0.5, y + b * 0.15, x + b * 0.85, y + b * 0.3);
    g.arc(x + b * 0.75, y + b * 0.48, b * 0.2, -1.2, 2.4);
  }
  g.stroke();
}
function tree(g: CanvasRenderingContext2D, x: number, y: number, r: number, fruit: string, rnd: () => number): void {
  g.strokeStyle = TESS.brown; g.lineWidth = r * 0.12;
  g.beginPath(); g.moveTo(x, y + r * 1.6); g.lineTo(x, y);
  for (const a of [-0.9, -0.4, 0.3, 0.8]) { g.moveTo(x, y + r * 0.3); g.lineTo(x + Math.sin(a) * r * 0.9, y - Math.cos(a) * r * 0.7); }
  g.stroke();
  for (let i = 0; i < 46; i++) { // leaves and fruit as clusters of tesserae
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
    g.fillStyle = i % 4 === 0 ? fruit : i % 3 ? TESS.green : '#86a065';
    g.beginPath(); g.ellipse(x + Math.cos(a) * d * 1.15, y - r * 0.15 + Math.sin(a) * d * 0.8, r * 0.13, r * 0.08, a, 0, Math.PI * 2); g.fill();
  }
}
/** a deer (or, with `lion`, a tawny lion) facing right, `s` its body length */
function beast(g: CanvasRenderingContext2D, x: number, y: number, s: number, lion = false): void {
  g.fillStyle = lion ? TESS.ochre : TESS.brown; g.strokeStyle = TESS.black; g.lineWidth = s * 0.03;
  g.beginPath(); g.ellipse(x, y, s * 0.5, s * 0.18, 0, 0, Math.PI * 2); g.fill(); g.stroke(); // body
  g.beginPath(); g.ellipse(x + s * 0.55, y - s * 0.22, s * 0.16, s * 0.1, -0.5, 0, Math.PI * 2); g.fill(); g.stroke(); // head
  g.lineWidth = s * 0.06; g.strokeStyle = lion ? '#8a6532' : TESS.brown;
  g.beginPath();
  for (const lx of [-0.35, -0.2, 0.2, 0.35]) { g.moveTo(x + lx * s, y + s * 0.1); g.lineTo(x + lx * s + s * 0.05, y + s * 0.45); }
  g.moveTo(x + s * 0.4, y - s * 0.1); g.lineTo(x + s * 0.5, y - s * 0.2); // neck
  g.stroke();
  g.strokeStyle = TESS.black; g.lineWidth = s * 0.025; g.beginPath();
  if (lion) { g.arc(x + s * 0.5, y - s * 0.2, s * 0.2, 0, Math.PI * 2); g.moveTo(x - s * 0.5, y); g.quadraticCurveTo(x - s * 0.8, y - s * 0.3, x - s * 0.7, y - s * 0.4); }
  else for (const a of [-0.3, 0.3]) { g.moveTo(x + s * 0.55, y - s * 0.3); g.lineTo(x + s * (0.5 + a * 0.4), y - s * 0.6); g.lineTo(x + s * (0.5 + a * 0.8), y - s * 0.7); } // antlers
  g.stroke();
}
function kantharos(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = TESS.grey; g.strokeStyle = TESS.black; g.lineWidth = s * 0.04;
  g.beginPath(); g.moveTo(x - s * 0.45, y - s * 0.4); g.quadraticCurveTo(x - s * 0.45, y + s * 0.25, x, y + s * 0.3);
  g.quadraticCurveTo(x + s * 0.45, y + s * 0.25, x + s * 0.45, y - s * 0.4); g.closePath(); g.fill(); g.stroke();
  g.fillRect(x - s * 0.08, y + s * 0.3, s * 0.16, s * 0.25); g.fillRect(x - s * 0.25, y + s * 0.55, s * 0.5, s * 0.08);
  g.beginPath(); g.arc(x - s * 0.5, y - s * 0.15, s * 0.15, 1.6, 4.7); g.arc(x + s * 0.5, y - s * 0.15, s * 0.15, -1.6, 1.6); g.stroke(); // handles
  g.strokeStyle = TESS.green; g.lineWidth = s * 0.05; // vines out of the cup
  g.beginPath();
  for (const sd of [-1, 1]) { g.moveTo(x + sd * s * 0.2, y - s * 0.4); g.bezierCurveTo(x + sd * s * 0.6, y - s * 1.1, x + sd * s * 1.4, y - s * 0.2, x + sd * s * 1.8, y - s * 0.8); }
  g.stroke();
  g.fillStyle = '#6b3a5a';
  for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(x + sd * s * (1.1 + (i % 3) * 0.1), y - s * (0.5 - Math.floor(i / 3) * 0.12), s * 0.06, 0, Math.PI * 2); g.fill(); }
}
const paintNarthex: Paint = (g, w, h, rnd) => {
  g.fillStyle = TESS.cream; g.fillRect(0, 0, w, h);
  const b = h * 0.11, m = h * 0.1;
  meander(g, 0, w, 0, b); meander(g, 0, w, h - b, b);
  g.fillStyle = TESS.black; g.fillRect(0, b, w, 3); g.fillRect(0, h - b - 3, w, 3);
  for (let x = m; x < w - m * 0.5; x += m * 1.1) { // the medallions with birds and fish
    for (const y of [b + m * 0.55, h - b - m * 0.55]) {
      g.strokeStyle = TESS.red; g.lineWidth = 3; g.beginPath(); g.arc(x, y, m * 0.42, 0, Math.PI * 2); g.stroke();
      g.fillStyle = [TESS.grey, TESS.ochre, TESS.rose][Math.floor(rnd() * 3)];
      g.beginPath(); g.ellipse(x, y, m * 0.24, m * 0.12, rnd() - 0.5, 0, Math.PI * 2); g.fill();
    }
  }
  g.fillStyle = TESS.red; g.fillRect(0, b + m * 1.1, w, 3); g.fillRect(0, h - b - m * 1.1 - 3, w, 3);
  // the field of paradise: trees, beasts, the kantharos in the middle
  const top = b + m * 1.2, bot = h - b - m * 1.2, cy = (top + bot) / 2, r = (bot - top) * 0.28;
  const fruits = [TESS.red, '#d38a3a', '#6b3a5a'];
  for (let i = 0; i < 9; i++) { const x = w * (0.06 + i * 0.11); if (Math.abs(x - w / 2) > r * 2) tree(g, x, cy - r * 0.3, r, fruits[i % 3], rnd); }
  kantharos(g, w / 2, cy + r * 0.3, r * 0.9);
  const beasts: [number, boolean][] = [[0.11, false], [0.33, false], [0.62, true], [0.85, false]];
  for (const [fx, lion] of beasts) beast(g, w * fx, cy + r * 0.75, r * 1.2, lion);
};
const paintCarpet: Paint = (g, w, h, rnd) => {
  g.fillStyle = TESS.cream; g.fillRect(0, 0, w, h);
  const b = h * 0.09;
  // the braided border (two strands)
  for (const [y0, y1] of [[0, b], [h - b, h]]) {
    g.fillStyle = TESS.black; g.fillRect(0, y0, w, y1 - y0);
    for (let x = 0; x < w; x += b) for (const [col, ph] of [[TESS.ochre, 0], [TESS.white, 0.5]] as const) {
      g.fillStyle = col; g.beginPath(); g.ellipse(x + b * ph, (y0 + y1) / 2, b * 0.42, b * 0.26, ph ? -0.6 : 0.6, 0, Math.PI * 2); g.fill();
    }
  }
  for (const [x0, x1] of [[0, b], [w - b, w]]) { g.fillStyle = TESS.black; g.fillRect(x0, b, x1 - x0, h - 2 * b); }
  // eight-pointed stars of two squares on a grid, small squares with motifs between
  const cell = (h - 2 * b) / 3, cols = Math.floor((w - 2 * b) / cell);
  const x0 = (w - cols * cell) / 2;
  for (let j = 0; j < 3; j++) for (let i = 0; i < cols; i++) {
    const cx = x0 + (i + 0.5) * cell, cy = b + (j + 0.5) * cell, s = cell * 0.36;
    g.strokeStyle = TESS.black; g.lineWidth = 3;
    for (const rot of [0, Math.PI / 4]) {
      g.save(); g.translate(cx, cy); g.rotate(rot);
      g.fillStyle = rot ? TESS.ochre : TESS.rose; g.fillRect(-s, -s, 2 * s, 2 * s); g.strokeRect(-s, -s, 2 * s, 2 * s); g.restore();
    }
    g.fillStyle = TESS.white; g.fillRect(cx - s * 0.6, cy - s * 0.6, s * 1.2, s * 1.2); g.strokeRect(cx - s * 0.6, cy - s * 0.6, s * 1.2, s * 1.2);
    const k = (i + j) % 3; // a knot, a cross, a vessel
    g.fillStyle = [TESS.grey, TESS.red, TESS.brown][k];
    if (k === 1) { g.fillRect(cx - s * 0.1, cy - s * 0.45, s * 0.2, s * 0.9); g.fillRect(cx - s * 0.45, cy - s * 0.1, s * 0.9, s * 0.2); }
    else if (k === 0) { g.beginPath(); g.arc(cx, cy, s * 0.35, 0, Math.PI * 2); g.fill(); g.fillStyle = TESS.white; g.beginPath(); g.arc(cx, cy, s * 0.15, 0, Math.PI * 2); g.fill(); }
    else { g.beginPath(); g.ellipse(cx, cy + s * 0.05, s * 0.28, s * 0.32, 0, 0, Math.PI * 2); g.fill(); g.fillRect(cx - s * 0.1, cy - s * 0.42, s * 0.2, s * 0.15); }
    if (rnd() < 0.15) { g.fillStyle = 'rgba(200, 180, 150, 0.85)'; g.beginPath(); g.ellipse(cx + cell * 0.3, cy, cell * 0.35, cell * 0.22, rnd(), 0, Math.PI * 2); g.fill(); } // a lost patch
  }
};
const paintPeacock: Paint = (g, w, h, rnd) => {
  g.fillStyle = TESS.cream; g.fillRect(0, 0, w, h);
  const b = h * 0.1;
  waves(g, 0, w, 0, b, TESS.black, TESS.white); waves(g, 0, w, h - b, b, TESS.black, TESS.white);
  g.fillStyle = TESS.red; g.fillRect(0, b, w, 3); g.fillRect(0, h - b - 3, w, 3);
  g.strokeStyle = TESS.brown; g.lineWidth = 4; // the vine scrolls
  g.beginPath();
  for (let x = 0; x < w; x += 160) { g.moveTo(x, h * 0.75); g.bezierCurveTo(x + 50, h * 0.2, x + 110, h * 0.85, x + 160, h * 0.3); }
  g.stroke();
  for (let i = 0; i < 22; i++) { // vine leaves and grapes
    const x = rnd() * w, y = b + 20 + rnd() * (h - 2 * b - 40);
    g.fillStyle = i % 3 ? TESS.ochre : '#6b3a5a';
    g.beginPath(); g.ellipse(x, y, 16, 12, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  // the peacock: long tail to the left, body, neck and crested head to the right
  const cx = w * 0.55, cy = h * 0.52;
  for (let i = 0; i < 9; i++) { g.strokeStyle = [TESS.green, TESS.grey, TESS.ochre][i % 3]; g.lineWidth = 6; g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx - 330, cy - 60 + i * 15); g.stroke(); }
  g.fillStyle = '#9a6a45'; g.beginPath(); g.ellipse(cx - 170, cy - 5, 150, 26, -0.05, 0, Math.PI * 2); g.fill();
  g.fillStyle = TESS.rose; g.strokeStyle = TESS.black; g.lineWidth = 3;
  g.beginPath(); g.ellipse(cx, cy, 70, 40, -0.15, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx + 50, cy - 20); g.quadraticCurveTo(cx + 100, cy - 60, cx + 95, cy - 120); g.lineWidth = 14; g.strokeStyle = TESS.rose; g.stroke();
  g.fillStyle = TESS.rose; g.beginPath(); g.arc(cx + 98, cy - 125, 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = TESS.black; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + 98, cy - 138); g.lineTo(cx + 92, cy - 156); g.moveTo(cx + 102, cy - 138); g.lineTo(cx + 108, cy - 154); g.stroke();
  g.beginPath(); for (const lx of [-15, 15]) { g.moveTo(cx + lx, cy + 35); g.lineTo(cx + lx + 10, cy + 95); } g.stroke();
};

type Key = 'stone' | 'stoneDark' | 'ashlar' | 'cream' | 'white' | 'pink' | 'brick' | 'lead' | 'tile' | 'glass' | 'dark' | 'door' | 'gold' | 'face' | 'iron';

const toPts = (r: Flat): Pt[] => { const p: Pt[] = []; for (let i = 0; i < r.length; i += 2) p.push([r[i], r[i + 1]]); return p; };

/** A model's frame: u along the outline's long axis, v across it (both m), y up from the floor. */
interface Frame { c: Pt; a: Pt; b: Pt; L: number; W: number; y: number; under: number; m: THREE.Matrix4; local: (x: number, z: number) => Pt; world: (u: number, v: number) => Pt }
function frame(r: Flat, terrain: Terrain, axis?: Pt): Frame | null {
  const pts = toPts(r), o = obb(pts);
  if (!o) return null;
  let a = o.a, b = o.b, L = o.L, W = o.W;
  if (axis && a[0] * axis[0] + a[1] * axis[1] < 0) a = [-a[0], -a[1]];
  if (a[0] * b[1] - b[0] * a[1] < 0) b = [-b[0], -b[1]]; // keep the frame right-handed (no mirrored faces)
  const hs = pts.map(([x, z]) => terrain.at(x, z));
  const y = Math.max(...hs) + 0.2, under = Math.min(...hs) - y - 0.6;
  const c = o.c;
  const m = new THREE.Matrix4().set(a[0], 0, b[0], c[0], 0, 1, 0, y, a[1], 0, b[1], c[1], 0, 0, 0, 1);
  return {
    c, a, b, L, W, y, under, m,
    local: (x, z) => [(x - c[0]) * a[0] + (z - c[1]) * a[1], (x - c[0]) * b[0] + (z - c[1]) * b[1]],
    world: (u, v) => [c[0] + a[0] * u + b[0] * v, c[1] + a[1] * u + b[1] * v],
  };
}

/** Parts by material, built in a frame's local space (x = u, z = v). */
function parts() {
  const map = new Map<Key, THREE.BufferGeometry[]>();
  const add = (k: Key, g: THREE.BufferGeometry) => { let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(g); return g; };
  const box = (k: Key, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number) =>
    add(k, new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0).translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2));
  const cyl = (k: Key, u: number, v: number, y0: number, y1: number, r0: number, r1 = r0, seg = 16) =>
    add(k, new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(u, (y0 + y1) / 2, v));
  const cone = (k: Key, u: number, v: number, y: number, r: number, h: number, seg = 16) =>
    add(k, new THREE.ConeGeometry(r, h, seg).translate(u, y + h / 2, v));
  const dome = (k: Key, u: number, v: number, y: number, r: number, squash = 1) =>
    add(k, new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, squash, 1).translate(u, y, v));
  /** an arched opening w wide and h high (to the top of the arch), d deep, built facing +z */
  const arch = (w: number, h: number, d = 0.08) => {
    const r = w / 2, body = Math.max(0.01, h - r);
    const top = new THREE.CylinderGeometry(r, r, d, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, body, d / 2);
    return mergeGeometries([new THREE.BoxGeometry(w, body, d).translate(0, body / 2, d / 2).toNonIndexed(), top.toNonIndexed()].map(strip))!;
  };
  /** a feature built facing +z put at (u, v, y), turned to face (sin ang, cos ang) in (u, v) */
  const put = (k: Key, g: THREE.BufferGeometry, u: number, v: number, y: number, ang: number) => add(k, g.rotateY(ang).translate(u, y, v));
  /** walls on an outline (local u, v) from y0 to y1 */
  const walls = (k: Key, ring: Pt[], y0: number, y1: number) =>
    add(k, new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([u, v]) => new THREE.Vector2(u, -v))), { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0));
  /** the outline's edges: f(mid u, mid v, length, outward facing angle) */
  const edges = (ring: Pt[], f: (u: number, v: number, len: number, ang: number) => void) => {
    let a2 = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], du = q[0] - p[0], dv = q[1] - p[1], len = Math.hypot(du, dv);
      if (len < 0.4) continue;
      const ou = (a2 > 0 ? dv : -dv) / len, ov = (a2 > 0 ? -du : du) / len; // outward
      f((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, len, Math.atan2(ou, ov));
    }
  };
  /** thin bands round an outline (courses, cornices) */
  const bands = (k: Key, ring: Pt[], ys: number[], t: number, o = 0.06) =>
    edges(ring, (u, v, len, ang) => { for (const y of ys) put(k, new THREE.BoxGeometry(len + 2 * o, t, 2 * o).translate(0, t / 2, 0), u, v, y, ang); });
  /** a hipped roof over a rectangle (u0…u1, v0…v1) from its eaves at y, `o` overhang */
  const hip = (k: Key, u0: number, u1: number, v0: number, v1: number, y: number, rise: number, o = 0.4) => {
    const lu = u1 - u0 + 2 * o, lv = v1 - v0 + 2 * o, r = Math.max(0, (lu - lv) / 2);
    const g = new THREE.BufferGeometry(), U0 = u0 - o, U1 = u1 + o, V0 = v0 - o, V1 = v1 + o, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, T = y + rise;
    const A = [U0, y, V0], B = [U1, y, V0], C = [U1, y, V1], D = [U0, y, V1], R1 = [cu - r, T, cv], R2 = [cu + r, T, cv];
    const tri = [A, R1, R2, A, R2, B, D, R2, R1, D, C, R2, A, D, R1, B, R2, C].flat(); // eaves to ridge, both hips
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    g.computeVertexNormals();
    return add(k, g);
  };
  /** an Orthodox cross on a ball (three bars, the lowest slanted), s ≈ its height in metres / 2 */
  const cross = (u: number, v: number, y: number, s: number) => {
    const g = (w: number, h: number, yy: number, rot = 0) => new THREE.BoxGeometry(w * s, h * s, 0.1 * s).rotateZ(rot).translate(0, yy * s, 0);
    const ps = [new THREE.SphereGeometry(0.16 * s, 8, 6).translate(0, 0.05 * s, 0), g(0.11, 1.8, 0.9), g(1.0, 0.11, 1.25), g(0.55, 0.1, 1.55), g(0.65, 0.1, 0.6, 0.35)];
    add('gold', mergeGeometries(ps.map((p) => strip(p.index ? p.toNonIndexed() : p)))!.translate(u, y, v));
  };
  return { map, add, box, cyl, cone, dome, arch, put, walls, edges, bands, hip, cross };
}
type Parts = ReturnType<typeof parts>;

// facing angles in a frame: toward +u, −u, +v, −v
const PU = Math.PI / 2, MU = -Math.PI / 2, PV = 0, MV = Math.PI;

/** Саат-кула: half the shaft's side when OSM's outline is missing (m) */
const CLOCK_H = 32;

/** Walking collision: the models' outlines and heights. */
export function bitolaFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['clock', CLOCK_H], ['ajdar', 12], ['bezisten', 7], ['dimitrij', 12], ['dimitrijTower', 20]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createBitola(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const mat = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, clippingPlanes, ...extra });
  const glass = mat('#3a3b40', { emissive: '#ffd08a', emissiveIntensity: 0 });
  const MATS: Record<Key, THREE.Material> = {
    stone: mat('#b9aa92'), stoneDark: mat('#9d8f7a'), ashlar: mat('#e2d6c0'), cream: mat('#ece2cf'), white: mat('#f4f0e8'),
    pink: mat('#efd9cf'), brick: mat('#b96a4c'), lead: mat('#8e959b'), tile: mat('#c9653f'), glass, dark: mat('#2e2b2b'),
    door: mat('#7a4a2a'), gold: mat('#e3b84c', { emissive: '#6a4a10', emissiveIntensity: 0.25 }), face: mat('#26386a'), iron: mat('#2b2b2e'),
  };
  const place = (p: Parts, f: Frame) => {
    for (const [k, list] of p.map) {
      const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => strip(g.index ? g.toNonIndexed() : g)))!.applyMatrix4(f.m), MATS[k]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  };

  // ---------------- Саат-кула (32 m with the cross)
  const ct = M.clock ? frame(M.clock, terrain) : null;
  if (ct) {
    const p = parts(), u = ct.under, h = Math.max(1.9, Math.min(ct.L, ct.W, 3)); // half side
    const { box, cyl, cone, put, arch, cross } = p;
    box('stone', -h, h, -h, h, u, 19.6);
    for (const y of [6.5, 13]) box('stoneDark', -h - 0.03, h + 0.03, -h - 0.03, h + 0.03, y, y + 0.18); // putlog lines
    box('cream', -h - 0.25, h + 0.25, -h - 0.25, h + 0.25, 19.6, 20.2); // the moulded cornice
    box('ashlar', -h + 0.1, h - 0.1, -h + 0.1, h - 0.1, 20.2, 26.2); // the clock stage
    for (const su of [-1, 1]) for (const sv of [-1, 1]) box('cream', su * (h - 0.1) - 0.35, su * (h - 0.1) + 0.35, sv * (h - 0.1) - 0.35, sv * (h - 0.1) + 0.35, 20.2, 26.2); // pilasters
    for (const [ang, du, dv] of [[PU, h - 0.1, 0], [MU, -h + 0.1, 0], [PV, 0, h - 0.1], [MV, 0, -h + 0.1]] as const) {
      const disc = (k: Key, r: number, d: number) => put(k, new THREE.CylinderGeometry(r, r, d, 24).rotateX(Math.PI / 2).translate(0, 0, d / 2), du, dv, 23.4, ang);
      disc('gold', 1.08, 0.08);
      disc('face', 0.98, 0.12);
      put('gold', new THREE.BoxGeometry(0.09, 0.62, 0.06).translate(0, 0.28, 0.16), du, dv, 23.4, ang); // hands at ten to two
      put('gold', new THREE.BoxGeometry(0.07, 0.8, 0.06).translate(0, 0.38, 0.16).rotateZ(-1.1).rotateY(0), du, dv, 23.4, ang);
      put('glass', arch(0.7, 1.5, 0.06), du, dv, 20.9, ang); // a small window under the clock
    }
    box('cream', -h - 0.55, h + 0.55, -h - 0.55, h + 0.55, 26.2, 26.55); // the balcony slab
    for (let i = 0; i < 4; i++) { // its railing
      const ang = [PU, MU, PV, MV][i], o = h + 0.5;
      const du = i === 0 ? o : i === 1 ? -o : 0, dv = i === 2 ? o : i === 3 ? -o : 0;
      put('iron', new THREE.BoxGeometry(2 * o, 0.06, 0.05).translate(0, 1.0, 0), du, dv, 26.55, ang);
      for (let k = -o; k <= o; k += 0.5) put('iron', new THREE.BoxGeometry(0.035, 1.0, 0.035).translate(k, 0.5, 0), du, dv, 26.55, ang);
    }
    const r8 = h * 0.82;
    cyl('white', 0, 0, 26.55, 29.6, r8, r8, 8);
    cyl('cream', 0, 0, 29.4, 29.75, r8 + 0.15, r8 + 0.15, 8);
    for (let k = 0; k < 8; k++) { // arched louvred openings on the eight faces
      const ang = (k * Math.PI) / 4 + Math.PI / 8, ap = r8 * Math.cos(Math.PI / 8);
      put('dark', arch(0.75, 1.9, 0.06), Math.sin(ang) * ap, Math.cos(ang) * ap, 27.2, ang);
    }
    cone('lead', 0, 0, 29.75, r8 + 0.35, 0.9, 8);
    cyl('lead', 0, 0, 30.6, 30.75, 0.2, 0.12, 8);
    cross(0, 0, 30.75, 0.65);
    place(p, ct);
  }

  // ---------------- Ајдар-кади џамија: the portico at the end facing north-west, away from the qibla (south-east)
  const aj = M.ajdar ? frame(M.ajdar, terrain, [0.64, 0.77]) : null; // +u toward the qibla (south-east: x east, z south)
  if (aj) {
    const p = parts(), u = aj.under, L = aj.L, W = aj.W;
    const { box, cyl, cone, dome, put, arch } = p;
    const side = Math.min(2 * W, 2 * L * 0.72), h0 = L - side; // the hall: a square at the qibla end
    const hu0 = h0, hu1 = L, cu = (hu0 + hu1) / 2, hw = W, wallH = 8.2;
    box('stone', hu0, hu1, -hw, hw, u, 1.3);
    box('white', hu0 + 0.05, hu1 - 0.05, -hw + 0.05, hw - 0.05, 1.3, wallH);
    box('stone', hu0 - 0.08, hu1 + 0.08, -hw - 0.08, hw + 0.08, wallH, wallH + 0.4); // the cornice
    for (const [ang, uu, vv, len] of [[PV, cu, hw, side], [MV, cu, -hw, side], [PU, hu1, 0, 2 * hw]] as const) {
      for (const t of [-0.28, 0, 0.28]) {
        const along = t * len, wu = ang === PU ? uu : uu + along, wv = ang === PU ? along : vv;
        put('stone', arch(1.3, 2.3, 0.05), wu, wv, 1.6, ang);
        put('glass', arch(1.0, 2.1, 0.08), wu, wv, 1.7, ang);
        put('glass', arch(0.7, 1.2, 0.08), wu, wv, 5.4, ang);
      }
    }
    // the drum and the dome
    const rd = hw * 0.78;
    cyl('lead', cu, 0, wallH + 0.4, wallH + 1.0, rd + 0.6, rd + 0.2, 8); // lead skirt over the squinches
    cyl('white', cu, 0, wallH + 1.0, wallH + 2.6, rd, rd, 8);
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4 + Math.PI / 8, ap = rd * Math.cos(Math.PI / 8);
      put('glass', arch(0.55, 1.1, 0.06), cu + Math.sin(ang) * ap, Math.cos(ang) * ap, wallH + 1.2, ang);
    }
    dome('lead', cu, 0, wallH + 2.6, rd * 0.98, 0.85);
    cyl('gold', cu, 0, wallH + 2.6 + rd * 0.83, wallH + 3.6 + rd * 0.83, 0.07, 0.05, 6); // the finial
    p.add('gold', new THREE.SphereGeometry(0.16, 8, 6).translate(cu, wallH + 3.0 + rd * 0.83, 0));
    // the portico: three arches across the front, four columns, three small domes
    const pu0 = -L + 0.2, pu1 = hu0, ph = 5.6;
    box('stone', pu0, pu1, -hw, hw, u, 0.45); // its platform
    for (let i = 0; i < 4; i++) {
      const v = -hw + 0.3 + (i * (2 * hw - 0.6)) / 3;
      cyl('ashlar', pu0 + 0.4, v, 0.45, ph - 1.2, 0.28, 0.28, 10);
      box('cream', pu0 + 0.1, pu0 + 0.7, v - 0.35, v + 0.35, ph - 1.2, ph - 0.9);
    }
    const bay = (2 * hw - 0.6) / 3;
    box('ashlar', pu0, pu1, -hw, hw, ph - 0.9, ph); // the arcade's wall and roof slab
    for (let i = 0; i < 3; i++) {
      const v = -hw + 0.3 + bay * (i + 0.5);
      put('dark', arch(bay - 0.75, 3.6, 0.6), pu0 - 0.05, v, 0.45, MU); // the open arch (shadowed inside)
      put('brick', arch(bay - 0.45, 3.85, 0.04), pu0 - 0.12, v, 0.42, MU); // its voussoirs
      cyl('lead', (pu0 + pu1) / 2, v, ph, ph + 0.35, bay * 0.42, bay * 0.38, 8);
      dome('lead', (pu0 + pu1) / 2, v, ph + 0.35, bay * 0.38, 0.8);
    }
    put('door', arch(1.3, 2.5, 0.1), hu0, 0, 0.45, MU); // the main door, under the middle arch
    // the minaret at the hall's north corner
    const mu = hu0 + 1.4, mv = -hw - 1.5;
    box('stone', mu - 1.4, mu + 1.4, mv - 1.4, mv + 1.4, u, 7.5); // its base
    cyl('stone', mu, mv, 7.5, 8.6, 1.4, 1.05, 12);
    cyl('white', mu, mv, 8.6, 27.5, 1.05, 0.95, 12);
    cyl('ashlar', mu, mv, 25.9, 27.4, 1.0, 1.5, 12); // the corbelled ring under the balcony
    cyl('white', mu, mv, 27.4, 27.7, 1.6, 1.6, 12);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; cyl('iron', mu + Math.cos(a) * 1.55, mv + Math.sin(a) * 1.55, 27.7, 28.6, 0.04, 0.04, 4); }
    cyl('white', mu, mv, 27.7, 31.5, 0.8, 0.75, 12);
    cone('lead', mu, mv, 31.5, 0.9, 4.2, 12);
    cyl('gold', mu, mv, 35.7, 36.6, 0.05, 0.04, 6);
    p.add('gold', new THREE.SphereGeometry(0.14, 8, 6).translate(mu, 36.1, mv));
    place(p, aj);
  }

  // ---------------- Безистен: walls on the outline, parallel barrel vaults across the long axis
  const bz = M.bezisten ? frame(M.bezisten, terrain) : null;
  if (bz) {
    const p = parts(), ring = toPts(M.bezisten!).map(([x, z]) => bz.local(x, z)), wallH = 5.2;
    p.walls('white', ring, bz.under, wallH);
    p.bands('pink', ring, [0.0], 2.6, 0.04); // the pale pink lower band of the facades
    p.bands('cream', ring, [wallH - 0.35], 0.4, 0.12);
    p.edges(ring, (u, v, len, ang) => { // arched gates and windows
      const n = Math.max(1, Math.floor(len / 6.5));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5, cu = u + Math.cos(ang) * t * len, cv = v - Math.sin(ang) * t * len;
        p.put(i % 3 === 1 ? 'dark' : 'glass', p.arch(2.2, 3.3, 0.08), cu, cv, 0.1, ang);
        p.put('brick', p.arch(2.6, 3.55, 0.04), cu, cv, 0.05, ang);
      }
    });
    const n = Math.max(2, Math.round((2 * bz.L) / 6.8)), bw = (2 * bz.L) / n;
    for (let i = 0; i < n; i++) {
      const cu = -bz.L + bw * (i + 0.5);
      // a barrel vault along v, its springing on the walls
      p.add('lead', new THREE.CylinderGeometry(bw / 2, bw / 2, 2 * bz.W + 0.4, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.55, 1).translate(cu, wallH, 0));
      for (let d = -bz.W + 3; d < bz.W - 2; d += 5) p.box('lead', cu - 0.35, cu + 0.35, d - 0.4, d + 0.4, wallH + bw * 0.27, wallH + bw * 0.27 + 0.55); // dormers
    }
    place(p, bz);
  }

  // ---------------- Св. Димитриј and its bell tower
  const dm = M.dimitrij ? frame(M.dimitrij, terrain) : null;
  if (dm) {
    const p = parts(), ring = toPts(M.dimitrij!).map(([x, z]) => dm.local(x, z)), H1 = 11.5;
    p.walls('ashlar', ring, dm.under, H1);
    p.bands('brick', ring, [1.6, 3.2, 4.8, 6.4, 8.0, 9.6], 0.12, 0.03); // brick courses in the ashlar
    p.bands('stone', ring, [H1 - 0.35], 0.45, 0.18);
    p.edges(ring, (u, v, len, ang) => {
      const n = Math.floor(len / 4.2);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5, cu = u + Math.cos(ang) * t * len, cv = v - Math.sin(ang) * t * len;
        for (const y of [2.0, 7.0]) { p.put('brick', p.arch(1.6, 2.9, 0.04), cu, cv, y - 0.15, ang); p.put('glass', p.arch(1.2, 2.6, 0.08), cu, cv, y, ang); }
      }
    });
    p.hip('lead', -dm.L, dm.L, -dm.W, dm.W, H1 + 0.1, Math.min(3.2, dm.W * 0.4), 0.5);
    place(p, dm);
  }
  const tw = M.dimitrijTower ? frame(M.dimitrijTower, terrain) : null;
  if (tw) {
    const p = parts(), h = Math.max(1.8, Math.min(tw.L, tw.W, 2.8)), u = tw.under;
    p.box('ashlar', -h, h, -h, h, u, 12.5);
    for (let y = 1.5; y < 12; y += 1.5) p.box('brick', -h - 0.02, h + 0.02, -h - 0.02, h + 0.02, y, y + 0.12);
    p.box('brick', -h, h, -h, h, 12.5, 19.5); // the red-brick belfry
    p.box('stone', -h - 0.2, h + 0.2, -h - 0.2, h + 0.2, 12.4, 12.7);
    p.box('stone', -h - 0.25, h + 0.25, -h - 0.25, h + 0.25, 19.5, 19.85);
    for (const [ang, du, dv] of [[PU, h, 0], [MU, -h, 0], [PV, 0, h], [MV, 0, -h]] as const)
      for (const d of [-0.55, 0.55]) {
        const ou = ang === PV || ang === MV ? d : 0, ov = ang === PU || ang === MU ? d : 0;
        p.put('dark', p.arch(0.8, 3.0, 0.06), du + ou, dv + ov, 15.2, ang);
      }
    p.hip('tile', -h, h, -h, h, 19.85, 2.4, 0.45);
    p.cross(0, 0, 22.2, 0.8);
    place(p, tw);
  }

  // ---------------- Хераклеа: the theatre (its outline: the stage's straight side and the cavea's arc)
  const th = M.theatre ? toPts(M.theatre) : null;
  if (th && th.length > 4) {
    // the straight side: the longest edge; the cavea rises away from it
    let best = 0, bi = 0;
    for (let i = 0; i < th.length; i++) { const p = th[i], q = th[(i + 1) % th.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > best) { best = l; bi = i; } }
    const A = th[bi], B = th[(bi + 1) % th.length], mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
    let au = [(B[0] - A[0]) / best, (B[1] - A[1]) / best] as Pt, bv: Pt = [-au[1], au[0]];
    const cen = th.reduce((s, q) => [s[0] + q[0] / th.length, s[1] + q[1] / th.length], [0, 0] as Pt);
    if ((cen[0] - mx) * bv[0] + (cen[1] - mz) * bv[1] < 0) bv = [-bv[0], -bv[1]];
    if (au[0] * bv[1] - bv[0] * au[1] < 0) au = [-au[0], -au[1]];
    const R = best / 2, y = terrain.at(mx, mz) + 0.15;
    const m = new THREE.Matrix4().set(au[0], 0, bv[0], mx, 0, 1, 0, y, au[1], 0, bv[1], mz, 0, 0, 0, 1);
    const f = { m } as Frame;
    const p = parts();
    const ro = R * 0.32, rows = 16, step = (R - ro) / rows, rise = 0.42;
    // the orchestra and the cavea: half annuli rising outward on the +v side (shape y < 0 ends up at +v)
    const half = (r0: number, r1: number, y0: number, y1: number, k: Key) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, r1, Math.PI, 2 * Math.PI, false);
      if (r0 > 0) s.absarc(0, 0, r0, 2 * Math.PI, Math.PI, true); else s.lineTo(0, 0);
      p.add(k, new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2).translate(0, y0, 0));
    };
    half(0, ro, -0.6, 0.05, 'ashlar');
    for (let i = 0; i < rows; i++) half(ro + 1.2 + i * step, ro + 1.2 + (i + 1) * step, -0.6, (i + 1) * rise, i % 2 ? 'stone' : 'stoneDark');
    half(ro, ro + 1.2, -0.6, 0.9, 'ashlar'); // the parapet round the orchestra
    // the stage building along the straight side, its brick arches toward the orchestra
    p.box('stone', -R * 0.85, R * 0.85, -4.6, -0.6, -0.6, 2.2);
    for (let i = -3; i <= 3; i++) { p.put('brick', p.arch(2.0, 2.0, 0.06), i * R * 0.22, -0.6, 0, PV); p.put('dark', p.arch(1.5, 1.7, 0.08), i * R * 0.22, -0.55, 0.05, PV); }
    place(p, f);
  }
  // the Great Basilica: its low walls, the narthex wall and the two stylobates, and the mosaic floors (+u east)
  const ba = M.basilica ? frame(M.basilica, terrain, [1, 0]) : null;
  if (ba) {
    const p = parts(), ring = toPts(M.basilica!).map(([x, z]) => ba.local(x, z)), L = ba.L, W = ba.W, NX = -L + 5.6;
    // the outer walls from the lowest ground up to ~1 m above the excavated floor
    p.edges(ring, (u, v, len, ang) => p.put('stone', new THREE.BoxGeometry(len, 1.0 - ba.under, 0.8).translate(0, (1.0 - ba.under) / 2, -0.4), u, v, ba.under, ang));
    p.box('stone', NX - 0.4, NX + 0.4, -W + 0.8, -1.4, ba.under, 0.8); // the wall between narthex and nave, its door in the middle
    p.box('stone', NX - 0.4, NX + 0.4, 1.4, W - 0.8, ba.under, 0.8);
    for (const sv of [-1, 1]) {
      p.box('stoneDark', NX + 1, L - 4, sv * 5.4 - 0.35, sv * 5.4 + 0.35, ba.under, 0.35); // stylobate
      for (let u = NX + 2.5; u < L - 5; u += 3.6) p.cyl('ashlar', u, sv * 5.4, 0.35, 1.0 + ((u * 7) % 3) * 0.35, 0.3, 0.3, 10); // column stumps
    }
    place(p, ba);
    // the mosaics: the narthex's „paradise“ across the west end, a geometric carpet down the nave, the
    // peacock and vine panel before the apse
    const floor = (tex: THREE.Texture, u0: number, u1: number, v0: number, v1: number, rotate: boolean) => {
      const g = new THREE.PlaneGeometry(rotate ? v1 - v0 : u1 - u0, rotate ? u1 - u0 : v1 - v0).rotateX(-Math.PI / 2);
      if (rotate) g.rotateY(Math.PI / 2);
      g.translate((u0 + u1) / 2, 0.06, (v0 + v1) / 2).applyMatrix4(ba.m);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, clippingPlanes }));
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    floor(mosaicTexture(paintNarthex, 2048, 420), -L + 0.9, NX - 0.4, -W + 0.9, W - 0.9, true);
    floor(mosaicTexture(paintCarpet, 2048, 470), NX + 0.6, L - 9.5, -4.8, 4.8, false);
    floor(mosaicTexture(paintPeacock, 1024, 470), L - 9.3, L - 4.6, -4.8, 4.8, false);
  }

  return { group, nightLit: [glass] };
}
