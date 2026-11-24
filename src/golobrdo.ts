// Голо Брдо: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Xhamia e Allajbegisë in Бурим (Алајбеговци) by Макелари, built before 1578 (en / de / sq / bg Wikipedia; a cultural
//   monument since 1970): a small single-dome mosque, a cube of cloisonné masonry (stone with brick courses, Commons
//   photos of 2022) with an inside a little over 6 m square, two rectangular windows under brick relieving arches and
//   an arched window over them on the west, south and east walls (three in two rows), the door and one window on the
//   north; an octagonal drum with a sawtooth brick cornice under a low dome covered in tiles; the minaret (grey render,
//   a balcony at about two thirds, a tall silver cone) at its corner with the white front building of the 1990s (a room
//   either side of a corridor, arched windows, a red tiled roof). OSM's outline holds both: the mosque is its narrower
//   south-south-east end, the front building the wider north-north-west part. Heights read off the photos.
// - the church of the Преображение (Kisha e Shpërfytyrimit) in Ербеле (Commons, 2022): a small single-nave church of
//   rough stone under a low tiled gable roof with a plastered gable, an open concrete porch with a red roof before
//   its west door, a bell frame of two concrete storeys under a small tiled roof beside the porch. Which side of the
//   porch the bell frame stands on was not checked (put on the south).
import * as THREE from 'three';
import { frame, parts, modelKit, gable, PU, MU, PV, MV, type Frame } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the mosque with its front building, the church with its porch. */
export function golobrdoFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['gbxhamija', 7], ['gbherbel', 5]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createGolobrdo(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  /** ground under a frame's (u, v), relative to its floor */
  const ground = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };
  const win = (w: number, h: number, d = 0.08) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, d / 2);

  // ---------------- Xhamia e Allajbegisë: +u south-south-east (the mosque, the qibla), +v west-south-west
  const xf = M.gbxhamija ? frame(M.gbxhamija, terrain, [0.515, 0.857], true) : null;
  if (xf) {
    const p = parts(), L = xf.L, W = xf.W, u = xf.under;
    // the mosque: an 8 m cube at the +u end, on the −v (north-east) side where OSM's outline runs its full length
    const s = 8, u0 = L - s, u1 = L, v0 = -W + 0.7, v1 = v0 + s, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, eh = 6.2;
    p.box('stoneDark', u0, u1, v0, v1, u, 0.3);
    p.box('stone', u0, u1, v0, v1, 0.3, eh);
    for (let y = 0.9; y < eh - 0.3; y += 0.62) p.box('brick', u0 - 0.03, u1 + 0.03, v0 - 0.03, v1 + 0.03, y, y + 0.12); // the brick courses
    // three windows in two rows on the qibla (+u), west-south-west (+v) and east-north-east (−v) walls
    const sideWins = (put: (g: THREE.BufferGeometry, t: number, y: number, k: 'dark' | 'brick') => void) => {
      for (const t of [-1.9, 1.9]) { put(p.arch(1.5, 2.5, 0.1), t, 1.0, 'brick'); put(win(0.9, 1.4, 0.14), t, 1.1, 'dark'); }
      put(p.arch(1.2, 2.0, 0.1), 0, 3.7, 'brick'); put(p.arch(0.8, 1.7, 0.14), 0, 3.85, 'dark');
    };
    sideWins((g, t, y, k) => p.put(k, g, u1, cv + t, y, PU));
    sideWins((g, t, y, k) => p.put(k, g, cu + t, v0, y, MV));
    // the +v wall faces the yard (the notch in OSM's outline)
    sideWins((g, t, y, k) => p.put(k, g, cu + t, v1, y, PV));
    // the door and one window on the north-north-west wall (inside the front building's corridor)
    p.put('door', win(1.2, 2.3), u0, cv - 1.2, 0.3, MU);
    p.put('dark', win(0.8, 1.2), u0, cv + 2.0, 1.4, MU);
    // the sawtooth brick cornice, the octagonal drum and the low tiled dome
    p.box('brick', u0 - 0.25, u1 + 0.25, v0 - 0.25, v1 + 0.25, eh, eh + 0.35);
    p.box('tile', u0 - 0.3, u1 + 0.3, v0 - 0.3, v1 + 0.3, eh + 0.35, eh + 0.5);
    p.hip('tile', u0, u1, v0, v1, eh + 0.5, 0.6, 0.2); // the squinches' corners under the drum
    const dr = 3.4;
    p.cyl('stone', cu, cv, eh + 0.5, eh + 1.9, dr, dr, 8);
    for (const y of [eh + 0.95, eh + 1.45]) p.cyl('brick', cu, cv, y, y + 0.1, dr + 0.03, dr + 0.03, 8);
    p.cyl('brick', cu, cv, eh + 1.9, eh + 2.25, dr + 0.3, dr + 0.3, 8);
    p.cone('tile', cu, cv, eh + 2.25, dr + 0.45, 2.1, 8);
    p.cyl('gold', cu, cv, eh + 4.3, eh + 5.0, 0.05, 0.05, 6);
    p.add('gold', new THREE.SphereGeometry(0.14, 8, 6).translate(cu, eh + 4.7, cv));

    // the front building of the 1990s: white, one storey, arched windows, a hipped red roof
    const fh = 3.8, fu1 = u0;
    p.box('concreteDark', -L, fu1, -W, W, u, 0.3);
    p.box('white', -L, fu1, -W, W, 0.3, fh);
    for (const t of [-0.6, 0, 0.6]) p.put('dark', p.arch(1.0, 1.9, 0.08), (-L + fu1) / 2 + t * (fu1 + L) * 0.55, W, 1.1, PV);
    for (const t of [-0.6, 0, 0.6]) p.put('dark', p.arch(1.0, 1.9, 0.08), -L, t * W, 1.1, MU);
    p.put('door', win(1.4, 2.3), -L, -W * 0.6, 0.3, MU);
    p.hip('brick', -L, fu1, -W, W, fh, 2.0, 0.45);

    // the minaret at the mosque's corner with the front building, on the −v (north-east) side
    const mu = u0 - 0.2, mv = v0 - 0.2, r = 0.95, g = Math.min(u, ground(xf, mu, mv));
    p.box('concrete', mu - 1.2, mu + 1.2, mv - 1.2, mv + 1.2, g - 0.4, eh); // the square base up to the cornice
    p.cyl('concrete', mu, mv, eh, 15.0, r, r * 0.9, 12);
    p.cyl('concreteDark', mu, mv, 15.0, 15.6, r * 0.9, r * 1.4, 12); // the balcony's corbels
    p.cyl('concrete', mu, mv, 15.6, 16.3, r * 1.45, r * 1.45, 12);
    p.cyl('concrete', mu, mv, 16.3, 19.4, r * 0.72, r * 0.7, 12);
    p.cyl('concreteDark', mu, mv, 19.4, 19.7, r * 0.8, r * 0.8, 12);
    p.cone('lead', mu, mv, 19.7, r * 0.78, 4.8, 12);
    p.cyl('gold', mu, mv, 24.4, 25.3, 0.05, 0.05, 6);
    p.add('gold', new THREE.SphereGeometry(0.14, 8, 6).translate(mu, 24.8, mv));
    place(p, xf);
  }

  // ---------------- the church in Ербеле: +u east (the altar end), −u the porch and the bell frame, +v south
  const cf = M.gbherbel ? frame(M.gbherbel, terrain, [1, 0], true) : null;
  if (cf) {
    const p = parts(), L = cf.L, W = cf.W, u = cf.under, eh = 3.6, pu = -L + 3.6; // the nave's west wall
    p.box('stoneDark', pu, L, -W, W, u, 0.3);
    p.box('stone', pu, L, -W, W, 0.3, eh);
    // narrow slit windows on the long walls, the plastered west gable over the door
    for (const [v, ang] of [[W, PV], [-W, MV]] as const) for (const t of [0.3, 0.7]) p.put('dark', win(0.35, 0.9), pu + t * (L - pu), v, 1.7, ang);
    p.put('dark', win(0.35, 0.8), L, 0, 1.8, PU);
    gable(p, 'tile', 'plaster', pu, L, -W, W, eh, 1.5, false, 0.45);
    p.box('plaster', pu - 0.02, pu + 0.3, -W + 0.3, W - 0.3, 0.3, eh); // the plastered front under the porch
    p.put('door', win(1.0, 2.1), pu - 0.03, 0, 0.3, MU);
    p.cross(0, 0, eh + 1.55, 0.4);
    // the porch: a concrete floor on a stone base, four posts, a lower red roof
    const ph = 2.7, g = ground(cf, -L + 0.5, 0);
    p.box('stoneDark', -L, pu, -W, W, Math.min(u, g) - 0.2, 0.3);
    p.box('concrete', -L, pu, -W, W, 0.3, 0.45);
    for (const v of [-W + 0.25, W - 0.25]) {
      p.box('concrete', -L, -L + 0.45, v - 0.22, v + 0.22, 0.45, ph);
      p.box('concrete', pu - 0.45, pu, v - 0.22, v + 0.22, 0.45, ph);
    }
    p.box('plaster', -L + 0.45, pu, W - 0.2, W, 0.45, ph); // the porch's white side wall
    p.box('concrete', -L, pu, -W, W, ph, ph + 0.3);
    gable(p, 'brick', 'concrete', -L, pu, -W, W, ph + 0.3, 1.0, false, 0.45);
    // the bell frame: two storeys of a concrete frame beside the porch's outer corner, a tiled cap
    const tu = -L - 0.2, tv = W + 0.4, ts = 0.9, tg = ground(cf, tu, tv);
    for (const [du, dv] of [[-ts, -ts], [ts, -ts], [-ts, ts], [ts, ts]] as const) p.box('concrete', tu + du - 0.18, tu + du + 0.18, tv + dv - 0.18, tv + dv + 0.18, tg - 0.3, tg + 8.4);
    for (const y of [3.8, 6.0, 8.2]) p.box('concrete', tu - ts - 0.2, tu + ts + 0.2, tv - ts - 0.2, tv + ts + 0.2, tg + y, tg + y + 0.3);
    p.cyl('lead', tu, tv, tg + 6.9, tg + 7.6, 0.25, 0.4, 10); // the bell
    p.hip('tile', tu - ts - 0.2, tu + ts + 0.2, tv - ts - 0.2, tv + ts + 0.2, tg + 8.5, 0.6, 0.25);
    p.cross(tu, tv, tg + 9.1, 0.35);
    place(p, cf);
  }

  return { group, nightLit: [glass] };
}
