// Виница: Виничко Кале, after its description on mk Wikipedia („Виничко Кале“; no photo was used, nothing from the
// article is in the repo), on OSM's outline of the ruins (way 1109661815, about 90 × 140 m: the article gives
// 250 × 150 m for the whole site with its slopes):
// - the defensive wall of the 4th–6th centuries round the hilltop: rubble stone in lime mortar, 3 m thick, standing
//   up to 4 m in places, broken elsewhere; drawn a little inside OSM's outline, following the ground, with gaps and
//   heights from a fixed seed (where it stands high and where it is broken is not from the site).
// - the one semicircular tower found along it, put on the south-east side (the side the deep ditch cuts off from the
//   next hill); its real place on the wall was not checked.
// - the buildings along the inside of the wall (rooms of stone, porticoes, store rooms), drawn as low room walls on
//   the two longest sides; their number and sizes are drawn, not surveyed.
// - the small medieval church near the middle, badly preserved: low walls of a nave and an apse to the east, and
//   column bases and capitals of the architectural stone found round it.
import * as THREE from 'three';
import { frame, parts, modelKit, toPts } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Pt } from './types.ts';

/** a small seeded generator (the same walls every load) */
const seeded = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

export function createVinica(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { place } = modelKit(group, clippingPlanes);
  const f = M.vnkale ? frame(M.vnkale, terrain) : null;
  if (!f) return { group, nightLit: [] as THREE.MeshLambertMaterial[] };
  const p = parts(), rnd = seeded(1985);
  /** ground under (u, v), relative to the frame's floor */
  const ground = (u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };
  /** a box w along local x, d along local z (the facing), from y0 to y1, put at (u, v) turned by ang */
  const slab = (k: 'stone' | 'stoneDark' | 'ashlar', u: number, v: number, ang: number, w: number, d: number, y0: number, y1: number, dx = 0, dz = 0) =>
    p.put(k, new THREE.BoxGeometry(w, y1 - y0, d).translate(dx, (y0 + y1) / 2, dz), u, v, 0, ang);

  // the outline in the frame, without the closing point, pulled 1.6 m toward its centre
  let ring: Pt[] = toPts(M.vnkale).map(([x, z]) => f.local(x, z));
  const [a, b] = [ring[0], ring[ring.length - 1]];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.1) ring = ring.slice(0, -1);
  const cu = ring.reduce((s, q) => s + q[0], 0) / ring.length, cv = ring.reduce((s, q) => s + q[1], 0) / ring.length;
  ring = ring.map(([u, v]) => { const d = Math.hypot(u - cu, v - cv) || 1, k = Math.max(0, d - 1.6) / d; return [cu + (u - cu) * k, cv + (v - cv) * k]; });

  // ---------------- the wall: ~5 m pieces along every edge, each on its own ground
  const sides: { u: number; v: number; len: number; ang: number }[] = [];
  p.edges(ring, (u, v, len, ang) => {
    sides.push({ u, v, len, ang });
    const n = Math.max(1, Math.round(len / 5)), seg = len / n, du = Math.cos(ang), dv = -Math.sin(ang); // along the edge
    for (let i = 0; i < n; i++) {
      const s = -len / 2 + seg * (i + 0.5), mu = u + du * s, mv = v + dv * s, r = rnd();
      if (r < 0.12) continue; // a gap
      const g = ground(mu, mv), h = 0.9 + 3.1 * Math.pow(rnd(), 1.6);
      slab('stoneDark', mu, mv, ang, seg + 0.5, 3, g - 1.2, g + 0.5);
      slab('stone', mu, mv, ang, seg + 0.5, 2.8, g + 0.5, g + h);
    }
  });

  // ---------------- the semicircular tower: on the side facing south-east the most
  const se = (() => { const [x0, z0] = f.world(0, 0), [x1, z1] = f.world(1, 0), [x2, z2] = f.world(0, 1); // world east / south in (u, v)
    const eu: Pt = [x1 - x0, x2 - x0], ev: Pt = [z1 - z0, z2 - z0]; return [eu[0] + ev[0], eu[1] + ev[1]] as Pt; })();
  const tower = sides.filter((s) => s.len > 12).sort((x, y) => (Math.sin(y.ang) * se[0] + Math.cos(y.ang) * se[1]) - (Math.sin(x.ang) * se[0] + Math.cos(x.ang) * se[1]))[0];
  if (tower) {
    const tu = tower.u + Math.sin(tower.ang) * 1.4, tv = tower.v + Math.cos(tower.ang) * 1.4, g = ground(tu, tv);
    p.cyl('stoneDark', tu, tv, g - 1.2, g + 0.5, 4.7, 4.7, 18);
    p.cyl('stone', tu, tv, g + 0.5, g + 3.6, 4.5, 4.5, 18);
  }

  // ---------------- rooms along the inside of the wall on the two longest sides
  for (const s of [...sides].sort((x, y) => y.len - x.len).slice(0, 2)) {
    const n = Math.max(1, Math.floor(s.len / 10)), du = Math.cos(s.ang), dv = -Math.sin(s.ang), ou = Math.sin(s.ang), ov = Math.cos(s.ang);
    for (let i = 0; i < n; i++) {
      const w = 6 + rnd() * 3, d = 5 + rnd() * 2, t = -s.len / 2 + (s.len / n) * (i + 0.5);
      const ru = s.u + du * t - ou * (1.5 + d / 2), rv = s.v + dv * t - ov * (1.5 + d / 2), g = ground(ru, rv), h = 0.8 + rnd() * 1.8;
      slab('stone', ru, rv, s.ang, w, 0.6, g - 0.6, g + h, 0, -d / 2 + 0.3); // the inner wall (the outer is the defence wall)
      for (const sx of [-1, 1]) slab('stone', ru, rv, s.ang, 0.6, d, g - 0.6, g + h * (0.7 + 0.3 * rnd()), sx * (w / 2 - 0.3), 0);
      if (rnd() < 0.5) slab('stoneDark', ru, rv, s.ang, w - 1.2, d - 1.2, g - 0.3, g + 0.12); // a floor of slabs
    }
  }

  // ---------------- the small church near the middle: nave and apse to the east, low walls
  {
    const [x0, z0] = f.world(0, 0), [xe, ze] = [x0 + 1, z0], e = f.local(xe, ze), o = f.local(x0, z0);
    const ang = Math.atan2(e[0] - o[0], e[1] - o[1]); // local +z toward the east
    const g = ground(cu, cv), h = 1.1, L = 11, W = 6.4;
    for (const sx of [-1, 1]) slab('stone', cu, cv, ang, 0.7, L, g - 0.6, g + h * (sx > 0 ? 1 : 0.7), sx * (W / 2 - 0.35), 0);
    slab('stone', cu, cv, ang, W, 0.7, g - 0.6, g + h * 0.6, 0, -L / 2 + 0.35); // the west wall, the door gap left as a lower piece
    slab('stone', cu, cv, ang, W, 0.7, g - 0.6, g + h, 0, L / 2 - 0.35); // the east wall with the apse's opening
    for (let i = 0; i <= 6; i++) { // the apse: a half ring of short pieces
      const th = -Math.PI / 2 + (Math.PI * i) / 6, r = 2.5;
      const lx = Math.sin(th) * r, lz = L / 2 + Math.cos(th) * r * 0.9;
      p.put('stone', new THREE.BoxGeometry(1.5, h * 0.9 + 0.6, 0.7).rotateY(th).translate(lx, (h * 0.9 - 0.6) / 2, lz), cu, cv, g, ang);
    }
    p.put('stoneDark', new THREE.BoxGeometry(W - 1.4, 0.25, L - 1.4).translate(0, 0.02, 0), cu, cv, g - 0.1, ang); // the floor
    // column bases, drums and capitals of the architectural stone round the church
    for (let i = 0; i < 9; i++) {
      const th = rnd() * Math.PI * 2, r = 7 + rnd() * 5, u = cu + Math.cos(th) * r, v = cv + Math.sin(th) * r, gg = ground(u, v);
      if (i % 3 === 2) p.box('ashlar', u - 0.4, u + 0.4, v - 0.4, v + 0.4, gg - 0.2, gg + 0.45); // a capital lying on the ground
      else p.cyl('ashlar', u, v, gg - 0.2, gg + 0.4 + rnd() * 1.2, 0.28, 0.26, 10);
    }
  }

  place(p, f);
  return { group, nightLit: [] as THREE.MeshLambertMaterial[] };
}
