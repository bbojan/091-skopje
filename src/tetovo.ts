// Tetovo and Gostivar: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in
// the repo):
// - Шарена џамија in Tetovo (1438, rebuilt 1833): a square prayer hall under one wide hipped roof of old tiles,
//   its walls painted all over in framed panels (cream, ochre, blue-green, pink) with rosettes, small grilled
//   windows low down and a row of arched windows above; at the north-west front a porch under the same roof, open
//   below on white columns and arches, closed and painted above with windows; a slender stone minaret at the west
//   corner with one balcony and a tall dark pencil cone.
// - Саат-кула in Gostivar: a square tower of rubble stone whose corners are cut back by small pyramids into an
//   octagonal stone shaft, a dark timber octagonal stage on top with the clock faces, wide eaves, and a small open
//   timber lantern under a pointed roof.
// - Св. Атанасиј Велики in Лешок (Лешочки манастир; rebuilt after 2001): a large cross-in-square church of grey
//   ashlar with a drum over the crossing and two small drums over the west front, `byzChurch` without brick courses.
// - Тетовско Кале on Балтепе: ruined walls of rubble stone along OSM's outline of the fortress, a ragged crest,
//   gaps, rows of arched niches.
// Sizes are read off the photos (door ≈ 2.2 m, people), not measured; the clock tower has only an OSM node and its
// square (`modelRects.gsaat`) is placed on it.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch, toPts, PU, MU, PV, MV } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function tetovoFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['sarena', 10], ['gsaat', 30], ['lesok', 16]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createTetovo(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- Шарена џамија: +u south-east toward the mihrab, +v south-west; the porch at the −u end,
  // the minaret at its west (−u, +v) corner
  const sf = M.sarena ? frame(M.sarena, terrain, [Math.SQRT1_2, Math.SQRT1_2], true) : null;
  if (sf) {
    const p = parts(), L = sf.L, W = sf.W, u = sf.under, eave = 7.6, pd = Math.min(4.2, L * 0.4), b0 = -L + pd;
    p.box('stoneDark', -L, L, -W, W, u, 0.5);
    p.box('plaster', b0, L, -W, W, 0.5, eave);
    // the painted panels: two rows round the hall, alternating colours, a rosette in each lower panel
    const cols = ['ochre', 'copper', 'pink'] as const;
    const panelRow = (y0: number, y1: number, rosette: boolean) => {
      for (const [cu, cv, ang] of [[L, 0, PU], [(b0 + L) / 2, W, PV], [(b0 + L) / 2, -W, MV]] as const) {
        const span = ang === PU ? 2 * W : L - b0, n = Math.max(3, Math.round(span / 1.7)), pw = span / n;
        for (let i = 0; i < n; i++) {
          const o = -span / 2 + (i + 0.5) * pw, k = cols[(i + (rosette ? 0 : 1)) % 3];
          const g = new THREE.BoxGeometry(pw - 0.35, y1 - y0, 0.05).translate(o, (y0 + y1) / 2, 0.02);
          p.put(k, g, cu, cv, 0, ang);
          if (rosette) p.put('brick', new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12).rotateX(Math.PI / 2).translate(o, (y0 + y1) / 2, 0.06), cu, cv, 0, ang);
        }
      }
    };
    panelRow(1.0, 3.0, true);
    panelRow(5.1, 6.9, false);
    p.bands('cream', [[b0, -W], [L, -W], [L, W], [b0, W]], [3.3, 4.6], 0.25, 0.05); // frames between the rows
    // windows: small grilled ones below, arched ones above
    for (const [cu, cv, ang, span] of [[L, 0, PU, 2 * W], [(b0 + L) / 2, W, PV, L - b0], [(b0 + L) / 2, -W, MV, L - b0]] as const) {
      const n = Math.max(2, Math.round(span / 3.4));
      for (let i = 0; i < n; i++) {
        const o = -span / 2 + ((i + 0.5) * span) / n;
        const along = ang === PU ? [cu, cv + o] : [cu + (ang === PV ? -o : o), cv];
        p.put('dark', new THREE.BoxGeometry(0.9, 1.1, 0.08), along[0], along[1], 3.5, ang);
        p.put('glass', p.arch(0.7, 1.4, 0.08), along[0], along[1], 5.3, ang);
      }
    }
    // the porch: white columns and arches below, a closed painted floor above with windows
    const pc = -L + 0.4, n = Math.max(3, Math.round((2 * W) / 2.6));
    for (let i = 0; i <= n; i++) p.cyl('white', pc, -W + 0.4 + ((2 * W - 0.8) * i) / n, 0.5, 3.4, 0.22, 0.22, 8);
    p.box('dark', b0 - 0.05, b0, -W + 0.5, W - 0.5, 0.5, 3.3); // the shade under the porch
    for (let i = 0; i < n; i++) p.put('cream', p.arch((2 * W - 0.8) / n - 0.4, 0.9, 0.12), pc, -W + 0.4 + ((2 * W - 0.8) * (i + 0.5)) / n, 2.6, MU);
    p.box('plaster', -L, b0, -W, W, 3.4, eave);
    for (let i = 0; i < n; i++) {
      const v = -W + 0.4 + ((2 * W - 0.8) * (i + 0.5)) / n;
      p.put(cols[i % 3], new THREE.BoxGeometry((2 * W - 0.8) / n - 0.4, 2.8, 0.05), -L, v, 3.9 + 1.4, MU);
      p.put('dark', new THREE.BoxGeometry(0.9, 1.3, 0.08), -L, v, 4.6, MU);
    }
    p.box('woodDark', -L - 0.1, L + 0.1, -W - 0.1, W + 0.1, eave - 0.35, eave); // the dark eaves board
    p.hip('tile', -L, L, -W, W, eave, Math.min(3.6, W * 0.45), 1.3);
    // the minaret
    const mu = -L + pd + 1.5, mv = W + 1.5, r = 1.25;
    p.cyl('stoneDark', mu, mv, u, 1.2, r + 0.35, r + 0.35, 12);
    p.cyl('stone', mu, mv, 1.2, 19.5, r, r * 0.9, 12);
    p.cyl('stone', mu, mv, 19.5, 20.4, r * 0.95, r * 1.45, 12); // the balcony's corbel
    p.cyl('stone', mu, mv, 20.4, 21.0, r * 1.5, r * 1.5, 12);
    p.cyl('iron', mu, mv, 21.0, 21.9, r * 1.48, r * 1.48, 12);
    p.cyl('stone', mu, mv, 21.0, 25.5, r * 0.8, r * 0.75, 12);
    p.cone('slate', mu, mv, 25.5, r * 0.85, 6.5, 12);
    p.cyl('gold', mu, mv, 32.0, 33.0, 0.07, 0.07, 6);
    p.add('gold', new THREE.SphereGeometry(0.16, 8, 6).translate(mu, 32.4, mv));
    place(p, sf);
  }

  // ---------------- Саат-кула in Gostivar: the square base, the octagonal stone shaft, the timber stage and lantern
  const gf = M.gsaat ? frame(M.gsaat, terrain) : null;
  if (gf) {
    const p = parts(), u = gf.under, s = Math.min(gf.L, gf.W), oct = (k: THREE.BufferGeometry) => k.rotateY(Math.PI / 8);
    p.box('stone', -s, s, -s, s, u, 9.0);
    // the small pyramids that cut the corners back to the octagon
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.add('stone', new THREE.ConeGeometry(s * 0.42, 1.6, 4).rotateY(Math.PI / 4).translate(a * s * 0.8, 9.8, b * s * 0.8));
    const ro = s / Math.cos(Math.PI / 8); // the octagon round the square's sides
    p.add('stone', oct(new THREE.CylinderGeometry(ro * 0.94, ro * 0.98, 12.5, 8).translate(0, 9.0 + 6.25, 0)));
    p.add('stoneDark', oct(new THREE.CylinderGeometry(ro * 1.02, ro * 1.02, 0.4, 8).translate(0, 21.7, 0)));
    // the timber stage, a little wider, with a clock face on four sides near its top
    p.add('woodDark', oct(new THREE.CylinderGeometry(ro * 1.08, ro * 1.0, 6.2, 8).translate(0, 21.9 + 3.1, 0)));
    const ap = ro * 1.06 * Math.cos(Math.PI / 8);
    for (const [ang, du, dv] of [[PU, ap, 0], [MU, -ap, 0], [PV, 0, ap], [MV, 0, -ap]] as const) {
      p.put('white', new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20).rotateX(Math.PI / 2).translate(0, 0, 0.04), du, dv, 26.4, ang);
      p.put('dark', new THREE.BoxGeometry(0.07, 0.5, 0.05).translate(0, 0.2, 0.1), du, dv, 26.4, ang);
      p.put('dark', new THREE.BoxGeometry(0.38, 0.07, 0.05).translate(0.16, 0, 0.1), du, dv, 26.4, ang);
      p.put('dark', new THREE.BoxGeometry(0.9, 1.4, 0.06), du, dv, 24.0, ang); // the openings below the clocks
    }
    p.add('woodDark', oct(new THREE.ConeGeometry(ro * 1.65, 1.5, 8).translate(0, 28.1 + 0.75, 0))); // wide eaves
    // the lantern: posts, a dark inside, its pointed roof and finial
    p.add('dark', oct(new THREE.CylinderGeometry(ro * 0.5, ro * 0.5, 1.6, 8).translate(0, 29.0 + 0.8, 0)));
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; p.cyl('woodDark', Math.cos(a) * ro * 0.58, Math.sin(a) * ro * 0.58, 29.0, 30.7, 0.09, 0.09, 6); }
    p.add('woodDark', oct(new THREE.ConeGeometry(ro * 0.85, 1.6, 8).translate(0, 30.6 + 0.8, 0)));
    p.cyl('gold', 0, 0, 32.1, 33.0, 0.06, 0.06, 6);
    place(p, gf);
  }

  // ---------------- Св. Атанасиј Велики in Лешок: grey ashlar, a drum over the crossing, two small ones at the west
  const lf = M.lesok ? frame(M.lesok, terrain, [1, 0], true) : null;
  if (lf) {
    const p = parts();
    byzChurch(p, lf, { wall: 'stone', courses: false, roof: 'lead', minor: 2, narthex: Math.min(5, lf.L * 0.3), windows: 2, high: 11, low: 8 });
    place(p, lf);
  }

  // ---------------- Тетовско Кале: ruined walls along the fortress outline, each piece on the ground under it
  const kf = M.tkale ? frame(M.tkale, terrain) : null;
  if (kf) {
    const p = parts(), ring = toPts(M.tkale).map(([x, z]) => kf.local(x, z)), t = 2.2;
    const gnd = (uu: number, vv: number) => { const [x, z] = kf.world(uu, vv); return terrain.at(x, z) - kf.y; };
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.5) continue;
      const du = (b[0] - a[0]) / len, dv = (b[1] - a[1]) / len, ang = Math.atan2(dv, du);
      // a squat round tower at every other corner, its top broken
      if (i % 2 === 0) {
        const g = gnd(a[0], a[1]), h = 8 + 2 * Math.sin(i * 1.9);
        p.cyl('stone', a[0], a[1], g - 2, g + h, 4.2, 4.0, 14);
        for (let k = 0; k < 7; k++) { const q = (k / 7) * Math.PI * 2; p.box('stone', a[0] + Math.cos(q) * 3.4 - 0.7, a[0] + Math.cos(q) * 3.4 + 0.7, a[1] + Math.sin(q) * 3.4 - 0.7, a[1] + Math.sin(q) * 3.4 + 0.7, g + h - 0.2, g + h + 0.6 + 0.8 * Math.sin(k * 2.3 + i)); }
        p.put('dark', p.arch(1.0, 1.8, 0.1), a[0] - du * 4.05, a[1] - dv * 4.05, g + h * 0.5, Math.atan2(-du, -dv));
      }
      for (let s = 0; s < len; s += 3) {
        run += 3;
        const k = Math.sin(run * 0.071) + 0.6 * Math.sin(run * 0.23 + 1.3);
        if (k < -1.0) continue; // gaps where the wall has fallen
        const l = Math.min(3, len - s), cu = a[0] + du * (s + l / 2), cv = a[1] + dv * (s + l / 2), g = gnd(cu, cv);
        const h = 4.5 + 3.0 * (k + 1.6) / 3.2 + 0.7 * Math.sin(run * 1.7);
        const piece = new THREE.BoxGeometry(l + 0.05, h + 2, t).translate(0, (h + 2) / 2 - 2, 0).rotateY(-ang);
        p.add(Math.sin(run * 0.9) > 0.5 ? 'stoneDark' : 'stone', piece.translate(cu, g, cv));
        // rows of arched niches on the taller stretches (the photos)
        if (h > 5.5 && Math.round(run / 3) % 2 === 0) {
          const n2 = p.arch(1.0, 1.8, 0.1);
          for (const side of [-1, 1]) p.add('dark', n2.clone().rotateY(side > 0 ? 0 : Math.PI).translate(0, 2.2, side * (t / 2 + 0.01)).rotateY(-ang).translate(cu, g, cv));
          n2.dispose();
        }
      }
    }
    place(p, kf);
  }

  return { group, nightLit: [glass] };
}
