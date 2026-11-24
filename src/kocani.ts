// Кочани: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Средновековна кула, the western tower on the right bank of the Кочанска Река (probably second half of the 17th
//   century, 18.5 m, restored; Wikipedia): a tall square tower of rubble stone with dressed corners, a flat cap of
//   stone slabs with a small overhang, two round openings and a barred window high up, a stone machicolation box,
//   arrow slits, a wooden balcony (чардак) near the top on one side, and against the foot a stepped stone stair
//   climbing to a door a few metres up. Which face carries the balcony and the stair was not checked against an aerial
//   image (here: the balcony on the east, the stair on the south).
// - Саат-кула, the eastern tower on the left bank (the old clock tower, protected 1957, not restored; mk Wikipedia):
//   lower, of darker rubble, a flat slab on top with the clock's whitewashed brick drum (a window in it, four wooden
//   posts sticking up), a window with stone jambs half way up, small openings under the slab.
// - Споменик на слободата on Локубија (Глигор Чемерски and Радован Раѓеновиќ, built 1977, unveiled 1981; mosaic over
//   330 m², spomenikdatabase.org): a curved concrete wall round a small paved amphitheatre, mosaics on both faces and
//   a ragged mosaic crest on top, square end posts, two free-standing mosaic pylons with low walls either side, steps.
//   OSM has only the whole site's outline (46 × 43 m): the wall is put in its middle, convex side south toward the
//   town (the photos look over the town from the amphitheatre); the mosaics are drawn, not copied.
// Heights of the western tower from Wikipedia, the rest read off the photos (door ≈ 2.2 m), not measured.
import * as THREE from 'three';
import { frame, parts, modelKit, PU, MU, PV, MV, type Frame } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the towers' outlines and heights (the monument stays open to walk round). */
export function kocaniFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['kkula', 18.5], ['ksaat', 13]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

/** A mosaic in the manner of Čemerski's: crowded figures in red, blue and ochre with thick black outlines on a pale
 *  ground, tesserae as a speckle over it (drawn, not copied from the monument). */
function mosaicTexture(w: number, h: number, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
  g.fillStyle = '#e6e1d6';
  g.fillRect(0, 0, w, h);
  const cols = ['#b8322a', '#2d4f9e', '#d9a53a', '#c8553d', '#3d6fb4', '#e8d9b8', '#6a2f2a', '#2a2a30'];
  // figures: a body (rounded quad), a head, raised arms, banners
  for (let i = 0; i < Math.round(w / 34); i++) {
    const x = rnd() * w, y = h * (0.35 + rnd() * 0.4), sx = h * (0.12 + rnd() * 0.12), sy = h * (0.3 + rnd() * 0.25);
    g.fillStyle = cols[Math.floor(rnd() * cols.length)];
    g.strokeStyle = '#1c1a1c'; g.lineWidth = Math.max(2, h * 0.025); g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x - sx, y + sy * 0.6); g.quadraticCurveTo(x - sx * 1.3, y - sy * 0.2, x - sx * 0.3, y - sy * 0.5);
    g.lineTo(x + sx * 0.4, y - sy * 0.5); g.quadraticCurveTo(x + sx * 1.3, y, x + sx, y + sy * 0.6); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = rnd() < 0.5 ? '#e8c9a6' : cols[Math.floor(rnd() * cols.length)];
    g.beginPath(); g.ellipse(x, y - sy * 0.72, sx * 0.55, sx * 0.62, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - sx * 0.4, y - sy * 0.3); g.lineTo(x - sx * (1.2 + rnd()), y - sy * (0.9 + rnd() * 0.5));
    g.moveTo(x + sx * 0.4, y - sy * 0.3); g.lineTo(x + sx * (1.2 + rnd()), y - sy * (0.6 + rnd() * 0.6)); g.stroke();
    if (rnd() < 0.3) { // a ribbon in red or blue
      g.strokeStyle = rnd() < 0.5 ? '#b8322a' : '#2d4f9e'; g.lineWidth = h * 0.04;
      g.beginPath(); g.moveTo(x, y - sy); g.bezierCurveTo(x + sx * 2, y - sy * 1.4, x + sx * 3, y, x + sx * 4, y - sy * 0.6); g.stroke();
    }
  }
  // a dark frame round the panel
  g.strokeStyle = '#2a2a30'; g.lineWidth = h * 0.05; g.strokeRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
    const k = (rnd() - 0.5) * 30;
    for (let j = 0; j < 4 && y + j < h; j++) for (let i = 0; i < 4 && x + i < w; i++) {
      const o = ((y + j) * w + x + i) * 4, grout = i === 3 || j === 3 ? -18 : 0;
      d[o] += k + grout; d[o + 1] += k + grout; d[o + 2] += k + grout;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A curved strip (part of a vertical cylinder of radius r round (cu, cv)) from angle a0 to a1, y0 to y1, facing
 *  outward (`out`) or inward, with u running 0…1 along it: for the mosaics on the wall's faces. */
function arcStrip(cu: number, cv: number, r: number, a0: number, a1: number, y0: number, y1: number, out: boolean, n = 24): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, u = cu + Math.cos(a) * r, v = cv + Math.sin(a) * r, t = out ? 1 - i / n : i / n; // left to right as seen
    pos.push(u, y0, v, u, y1, v);
    uv.push(t, 0, t, 1);
  }
  for (let i = 0; i < n; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    if (out) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createKocani(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  /** ground under a frame's (u, v), relative to its floor */
  const ground = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };

  // ---------------- Средновековна кула (west): +u east, +v south
  const kf = M.kkula ? frame(M.kkula, terrain, [1, 0], true) : null;
  if (kf) {
    const p = parts(), L = kf.L, W = kf.W, u = kf.under, top = 18.0;
    p.box('stone', -L, L, -W, W, u, top);
    // dressed corners (quoins) in a lighter stone, alternating long and short
    for (const [cu, cv] of [[-L, -W], [L, -W], [L, W], [-L, W]] as const)
      for (let y = u, k = 0; y < top - 0.3; y += 0.55, k++) {
        const a = k % 2 ? 0.9 : 0.5, b = k % 2 ? 0.5 : 0.9;
        const [ua, ub] = cu > 0 ? [cu - a, cu + 0.04] : [cu - 0.04, cu + a], [va, vb] = cv > 0 ? [cv - b, cv + 0.04] : [cv - 0.04, cv + b];
        p.box('ashlar', ua, ub, va, vb, y, y + 0.5);
      }
    // the cap: a slab of stone with a little overhang and a low hip of slabs over it
    p.box('stoneDark', -L - 0.45, L + 0.45, -W - 0.45, W + 0.45, top, top + 0.3);
    p.hip('slate', -L - 0.2, L + 0.2, -W - 0.2, W + 0.2, top + 0.3, 0.9, 0.25);
    // round openings and a barred window high up on every face, slits lower down
    for (const [ang, du, dv, len] of [[PU, L, 0, W], [MU, -L, 0, W], [PV, 0, W, L], [MV, 0, -W, L]] as const) {
      const along = (t: number): [number, number] => (du !== 0 ? [du, t] : [t, dv]);
      for (const t of [-len * 0.55, len * 0.55]) { const [a, b] = along(t); p.put('dark', new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.03), a, b, top - 0.9, ang); }
      for (const [t, y] of [[-len * 0.45, 10.5], [len * 0.45, 10.5], [0, 7.2]] as const) { const [a, b] = along(t); p.put('dark', new THREE.BoxGeometry(0.18, 1.0, 0.1).translate(0, 0.5, 0.03), a, b, y, ang); }
    }
    // the north face: a barred window with a brick relieving arch over it and the stone machicolation box
    p.put('dark', new THREE.BoxGeometry(1.0, 1.0, 0.1).translate(0, 0.5, 0.03), -L * 0.4, -W, 14.6, MV);
    p.put('brick', new THREE.CylinderGeometry(0.9, 0.9, 0.08, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(0, 0, 0.05), -L * 0.4, -W, 15.75, MV);
    p.box('ashlar', L * 0.25, L * 0.75, -W - 0.75, -W, 14.2, 15.6);
    p.box('stoneDark', L * 0.2, L * 0.8, -W - 0.8, -W, 14.0, 14.25);
    // the wooden balcony near the top on the east face: floor, posts, plank parapet and a small roof
    const bv = W * 0.7, bu = L + 1.2, b0 = 12.6, b1 = 15.4;
    p.box('woodDark', L, bu, -bv, bv, b0 - 0.25, b0);
    p.box('wood', bu - 0.08, bu, -bv, bv, b0, b0 + 1.1);
    for (const sv of [-1, 1]) p.box('wood', L, bu, sv * bv - 0.04, sv * bv + 0.04, b0, b0 + 1.1);
    for (const vv of [-bv, 0, bv]) p.box('woodDark', bu - 0.12, bu, vv - 0.06, vv + 0.06, b0, b1);
    p.box('woodDark', L - 0.05, bu + 0.3, -bv - 0.3, bv + 0.3, b1, b1 + 0.15);
    p.box('dark', L - 0.02, L + 0.02, -0.6, 0.6, b0, b0 + 2.0); // the door onto it
    p.put('door', new THREE.BoxGeometry(1.1, 2.0, 0.1).translate(0, 1.0, 0.03), -L * 0.3, W, 5.6, PV); // the raised door on the south
    // the stair against the south face, climbing west to east to that door, its side stepped
    const steps = 10, sd = 1.6;
    for (let i = 0; i < steps; i++) {
      const u0 = -L - 0.6 + (i * (L * 0.7 + 0.6)) / steps;
      p.box('ashlar', u0, L * 0.1, W, W + sd, u, 0.56 * (i + 1));
    }
    p.box('ashlar', -L * 0.8, L * 0.1, W, W + sd, 5.0, 5.6);
    place(p, kf);
  }

  // ---------------- Саат-кула (east): +u east, +v south
  const sf = M.ksaat ? frame(M.ksaat, terrain, [1, 0], true) : null;
  if (sf) {
    const p = parts(), L = sf.L, W = sf.W, u = sf.under, top = 12.2;
    p.box('rock', -L, L, -W, W, u, top);
    p.box('stone', -L - 0.02, L + 0.02, -W - 0.02, W + 0.02, top - 1.6, top - 1.45); // a timber-and-stone course under the slab
    p.box('concreteDark', -L - 0.4, L + 0.4, -W - 0.4, W + 0.4, top, top + 0.35);
    for (const [ang, du, dv, len] of [[PU, L, 0, W], [MU, -L, 0, W], [PV, 0, W, L], [MV, 0, -W, L]] as const) {
      const along = (t: number): [number, number] => (du !== 0 ? [du, t] : [t, dv]);
      let [a, b] = along(0);
      p.put('ashlar', new THREE.BoxGeometry(1.7, 1.9, 0.12).translate(0, 0.95, 0.02), a, b, 6.4, ang); // stone jambs
      p.put('dark', new THREE.BoxGeometry(1.0, 1.4, 0.14).translate(0, 0.7, 0.04), a, b, 6.6, ang);
      for (const t of [-len * 0.5, len * 0.5]) { [a, b] = along(t); p.put('dark', new THREE.BoxGeometry(0.6, 0.7, 0.1).translate(0, 0.35, 0.03), a, b, top - 1.3, ang); }
      [a, b] = along(len * 0.3); p.put('dark', new THREE.BoxGeometry(0.15, 0.9, 0.1).translate(0, 0.45, 0.03), a, b, 3.6, ang);
    }
    // the clock's drum: whitewashed brick, brick showing at its foot and lip, a window, four posts
    const r = Math.min(1.7, Math.min(L, W) * 0.36), d0 = top + 0.35, d1 = d0 + 3.6;
    p.cyl('plaster', 0, 0, d0, d1, r, r, 16);
    p.cyl('brick', 0, 0, d0, d0 + 0.35, r + 0.03, r + 0.03, 16);
    p.cyl('brick', 0, 0, d1 - 0.25, d1, r + 0.03, r + 0.03, 16);
    p.put('brick', new THREE.BoxGeometry(1.0, 1.9, 0.1).translate(0, 0.95, 0), 0, r - 0.02, d0 + 0.6, PV);
    p.put('dark', new THREE.BoxGeometry(0.7, 1.6, 0.12).translate(0, 0.8, 0.02), 0, r - 0.02, d0 + 0.7, PV);
    for (const [pu, pv, h] of [[-0.8, -0.7, 1.6], [-0.5, 0.8, 1.1], [0.6, 0.75, 1.5], [0.85, -0.6, 0.9]] as const)
      p.box('woodDark', pu * r - 0.09, pu * r + 0.09, pv * r - 0.09, pv * r + 0.09, d1, d1 + h);
    place(p, sf);
  }

  // ---------------- Споменик на слободата: +u east, +v south; the wall's convex face toward the town (south)
  const mf = M.ksloboda ? frame(M.ksloboda, terrain, [1, 0], true) : null;
  if (mf) {
    const p = parts(), R = 7.2, T = 0.7, a0 = -0.06, a1 = Math.PI + 0.06; // the arc round its centre, bulging south (+v)
    // the wall stands on the lowest ground along it, buried a little
    let g0 = Infinity;
    for (let i = 0; i <= 12; i++) { const a = a0 + ((a1 - a0) * i) / 12; g0 = Math.min(g0, ground(mf, Math.cos(a) * R, Math.sin(a) * R)); }
    const gc = ground(mf, 0, 0), y0 = g0 - 0.5, wy = gc + 4.6;
    // the wall: a thick curved shell, its top level
    const shell = new THREE.CylinderGeometry(R + T / 2, R + T / 2, wy - y0, 32, 1, true, Math.PI / 2 - a1, a1 - a0);
    p.add('concrete', shell.translate(0, (y0 + wy) / 2, 0));
    p.add('concrete', arcStrip(0, 0, R - T / 2, a0, a1, y0, wy, false, 32));
    p.add('concrete', new THREE.RingGeometry(R - T / 2, R + T / 2, 32, 1, -a1, a1 - a0).rotateX(-Math.PI / 2).translate(0, wy, 0));
    // square end posts, a little taller
    for (const a of [a0, a1]) { const u = Math.cos(a) * R, v = Math.sin(a) * R; p.box('concrete', u - 0.95, u + 0.95, v - 0.95, v + 0.95, y0, wy + 0.6); }
    // the paved floor of the amphitheatre (north, inside the curve) and steps down to the south
    p.add('concreteDark', new THREE.CircleGeometry(R - T / 2, 32, Math.PI, Math.PI).rotateX(-Math.PI / 2).translate(0, gc + 0.12, 0));
    p.add('concreteDark', new THREE.CylinderGeometry(R - T / 2, R - T / 2, 0.5, 32, 1, false, -Math.PI / 2, Math.PI).translate(0, gc - 0.13, 0));
    for (let i = 0; i < 4; i++) { const v = R + 1.6 + i * 0.9; p.box('concrete', -6 + i * 0.4, 6 - i * 0.4, v, v + 0.9, ground(mf, 0, v) - 0.6, ground(mf, 0, v) + 0.2 - i * 0.12); }
    // two free-standing pylons with low walls toward the middle, either side of the wall
    for (const sv of [-1, 1]) {
      const pu = sv * 15, pv = 3, gp = ground(mf, pu, pv);
      p.box('concrete', pu - 1.5, pu + 1.5, pv - 1.5, pv + 1.5, gp - 0.6, gp + 5.6);
      p.box('concrete', sv > 0 ? pu - 6.5 : pu + 1.5, sv > 0 ? pu - 1.5 : pu + 6.5, pv - 0.35, pv + 0.35, gp - 0.6, gp + 2.6);
    }
    place(p, mf);
    // the mosaics (their own textured material): the long band round both faces of the wall, the ragged crest on
    // top, a panel on each pylon's south face
    const front = mosaicTexture(2048, 320, 11), back = mosaicTexture(1536, 320, 23), crest = mosaicTexture(768, 320, 37), pyl = mosaicTexture(256, 512, 41);
    const mat = (t: THREE.Texture) => new THREE.MeshLambertMaterial({ map: t, clippingPlanes, side: THREE.DoubleSide });
    const add = (g: THREE.BufferGeometry, m: THREE.Material) => { const mesh = new THREE.Mesh(g.applyMatrix4(mf.m), m); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); };
    add(arcStrip(0, 0, R + T / 2 + 0.03, 0.35, Math.PI - 0.35, gc + 0.9, gc + 3.6, true), mat(front));
    add(arcStrip(0, 0, R - T / 2 - 0.03, 0.55, Math.PI - 0.55, gc + 1.1, gc + 3.5, false), mat(back));
    // the crest: a ragged panel standing on the middle of the wall
    const cs = new THREE.Shape();
    const pts: [number, number][] = [[-3.4, 0], [3.4, 0], [3.6, 1.6], [2.6, 2.4], [3.1, 2.9], [1.2, 3.1], [0.4, 2.6], [-0.6, 3.2], [-2.2, 2.7], [-3.0, 3.1], [-3.7, 1.8]];
    cs.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) cs.lineTo(x, y);
    const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.45, bevelEnabled: false });
    const uvs = cg.getAttribute('uv') as THREE.BufferAttribute, ps = cg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, (ps.getX(i) + 3.7) / 7.4, ps.getY(i) / 3.2);
    add(cg.translate(0, 0, -0.225).rotateY(Math.PI).translate(0, wy - 0.2, R), mat(crest));
    for (const sv of [-1, 1]) {
      const pu = sv * 15, pv = 3, gp = ground(mf, pu, pv);
      add(new THREE.PlaneGeometry(2.4, 4.4).translate(pu, gp + 3.0, pv + 1.53), mat(pyl));
    }
  }

  return { group, nightLit: [glass] };
}
