import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32, type Rng } from './geo.ts';
import { carGeometry, CAR_COLORS, type City } from './city.ts';
import { glowTexture } from './sky.ts';
import type { Terrain } from './terrain.ts';
import type { Ring } from './types.ts';

interface PathData {
  /** share of agents, per metre of path */
  weight: number;
  /** half width of the way */
  hw: number;
  /** 1 = walk on the pavement beside the road */
  side?: number;
}
interface Path extends PathData { pts: Ring; cum: number[]; len: number }

interface Agent {
  p: Path;
  /** distance along the path */
  s: number;
  seg: number;
  dir: 1 | -1;
  /** speed, m/s (0 = standing) */
  v: number;
  /** sideways offset from the centre line */
  lane: number;
  phase: number;
  // standing people keep their first position
  init?: boolean;
  /** running away (bark) until this time */
  flee?: number;
  x?: number; z?: number; tx?: number; tz?: number;
}

interface Located { x: number; z: number; tx: number; tz: number }

// Agents walk/drive back and forth along OSM polylines.
class Paths {
  list: Path[] = [];
  add(pts: Ring, data: PathData): void {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    if (cum[cum.length - 1] < 10) return;
    this.list.push({ pts, cum, len: cum[cum.length - 1], ...data });
  }
}

function makeAgents(paths: Paths, count: number, rnd: Rng, speed: [base: number, span: number], laneFn: (p: Path, rnd: Rng) => number): Agent[] {
  const total = paths.list.reduce((s, p) => s + p.len * p.weight, 0);
  const agents: Agent[] = [];
  for (let k = 0; k < count; k++) {
    // pick a path proportional to weighted length
    let t = rnd() * total, p = paths.list[0];
    for (const q of paths.list) { t -= q.len * q.weight; if (t <= 0) { p = q; break; } }
    agents.push({ p, s: rnd() * p.len, seg: 0, dir: rnd() < 0.5 ? 1 : -1, v: speed[0] + rnd() * speed[1], lane: laneFn(p, rnd), phase: rnd() * 10 });
  }
  return agents;
}

function locate(a: Agent, out: Located): void {
  const { pts, cum } = a.p;
  let i = a.seg;
  while (i < cum.length - 2 && cum[i + 1] < a.s) i++;
  while (i > 0 && cum[i] > a.s) i--;
  a.seg = i;
  const l = cum[i + 1] - cum[i] || 1e-6;
  const t = (a.s - cum[i]) / l;
  const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
  let tx = (bx - ax) / l, tz = (bz - az) / l;
  if (a.dir < 0) { tx = -tx; tz = -tz; }
  // drive on the right
  out.x = ax + (bx - ax) * t - tz * a.lane;
  out.z = az + (bz - az) * t + tx * a.lane;
  out.tx = tx; out.tz = tz;
}

/** ЈСП red, the colour of Skopje's city buses. */
export const JSP_RED = '#d6423a';

/** A ЈСП city bus along +x (front), with its own vertex colours: rounded red body, dark
 *  window bands split into panes, curved windscreen, lights, bumpers, tyres and a
 *  destination sign. Double-deckers have two decks of windows. `smooth` = corner segments. */
export function busGeometry(double: boolean, smooth = 2): THREE.BufferGeometry {
  const RED = new THREE.Color(JSP_RED), GLASS = new THREE.Color('#1c2530'), BLACK = new THREE.Color('#232323');
  const HUB = new THREE.Color('#a7a9ad'), LIGHT = new THREE.Color('#fff4d6'), TAIL = new THREE.Color('#c81e16'), SIGN = new THREE.Color('#e9b52e');
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, col: THREE.Color) => {
    const n = g.index ? g.toNonIndexed() : g;
    const c = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
    n.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (n.attributes.uv) n.deleteAttribute('uv');
    parts.push(n);
  };
  const rbox = (sx: number, sy: number, sz: number, r: number, x: number, y: number, z: number, col: THREE.Color) =>
    paint(new RoundedBoxGeometry(sx, sy, sz, smooth, Math.min(r, sx / 2, sy / 2, sz / 2) * 0.999).translate(x, y, z), col);
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, col: THREE.Color) =>
    paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), col);

  const L = double ? 11 : 12, W = 2.55, base = 0.45, H = double ? 4.15 : 2.85;
  const front = L / 2, top = base + H;
  rbox(L, H, W, 0.42, 0, base + H / 2, 0, RED); // body: rounded roof edges and corners
  // window bands (slightly proud of the body) with pillars splitting them into panes
  const decks = double ? [[1.75, 0.95], [3.5, 1.05]] : [[2.0, 1.15]];
  for (const [y, h] of decks) {
    rbox(L - 0.9, h, W + 0.04, 0.18, -0.15, y, 0, GLASS);
    const n = Math.round((L - 1.2) / 1.45);
    for (let i = 1; i < n; i++) box(0.12, h + 0.02, W + 0.08, -L / 2 + 0.45 + (i * (L - 1.2)) / n, y, 0, RED);
  }
  // front: curved windscreen (lower deck), upper front window, destination sign, lights, bumper
  const glassH = double ? 1.25 : 1.55;
  rbox(0.4, glassH, W - 0.25, 0.16, front - 0.12, base + 0.75 + glassH / 2, 0, GLASS);
  if (double) rbox(0.4, 1.0, W - 0.3, 0.16, front - 0.12, 3.5, 0, GLASS);
  rbox(0.3, 0.32, W - 0.7, 0.08, front - 0.07, double ? 2.6 : top - 0.28, 0, SIGN);
  for (const z of [-0.85, 0.85]) rbox(0.16, 0.22, 0.42, 0.06, front, base + 0.55, z, LIGHT);
  rbox(0.32, 0.4, W - 0.02, 0.16, front - 0.05, base + 0.2, 0, BLACK);
  // rear: back window(s), tail lights, bumper
  rbox(0.3, double ? 0.95 : 1.1, W - 0.4, 0.14, -front + 0.08, double ? 3.5 : 2.0, 0, GLASS);
  for (const z of [-0.95, 0.95]) rbox(0.14, 0.55, 0.28, 0.06, -front, base + 0.75, z, TAIL);
  rbox(0.32, 0.4, W - 0.02, 0.16, -front + 0.05, base + 0.2, 0, BLACK);
  // tyres with hubs, a little proud of the body sides
  const axles = double ? [front - 2.3, -front + 2.7] : [front - 2.6, -front + 3.0];
  for (const x of axles) for (const z of [-1, 1]) {
    paint(new THREE.CylinderGeometry(0.52, 0.52, 0.32, smooth > 2 ? 18 : 10).rotateX(Math.PI / 2).translate(x, 0.52, z * (W / 2 - 0.08)), BLACK);
    paint(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 8).rotateX(Math.PI / 2).translate(x, 0.52, z * (W / 2 + 0.1)), HUB);
  }
  return mergeGeometries(parts);
}

export interface TrafficOptions {
  clippingPlanes?: THREE.Plane[];
  cars?: number;
  people?: number;
}

export function createTraffic(city: City, terrain: Terrain, opts: TrafficOptions = {}) {
  const rnd = mulberry32(2024);
  const group = new THREE.Group();

  // ---------------- cars
  const roads = new Paths();
  for (const r of city.roadList) {
    if (r.kind === 'major') roads.add(r.pts, { weight: 1.0, hw: r.w / 2 });
    else if (r.kind === 'minor') roads.add(r.pts, { weight: 0.35, hw: r.w / 2 });
    else if (r.kind === 'service') roads.add(r.pts, { weight: 0.06, hw: r.w / 2 });
  }
  const carCount = opts.cars ?? 6500;
  const cars = makeAgents(roads, carCount, rnd, [6, 6], (p) => Math.max(1.2, p.hw * 0.45));

  const carGeo = carGeometry();
  const carMat = new THREE.MeshLambertMaterial({ clippingPlanes: opts.clippingPlanes });
  const carCols = CAR_COLORS;
  const buses = cars.filter((c) => c.p.weight === 1 && rnd() < 0.12); // ~140 ЈСП buses on the main roads
  const busSet = new Set(buses);
  const autos = cars.filter((c) => !busSet.has(c));
  const carMesh = new THREE.InstancedMesh(carGeo, carMat, autos.length);
  // ЈСП city buses: all red (colours are in the geometry), every second one a double-decker
  const singles = buses.filter((_, i) => i % 2 === 1), doubles = buses.filter((_, i) => i % 2 === 0);
  const busMat = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: opts.clippingPlanes });
  const busMesh = new THREE.InstancedMesh(busGeometry(false), busMat, singles.length);
  const ddMesh = new THREE.InstancedMesh(busGeometry(true), busMat, doubles.length);
  const col = new THREE.Color();
  autos.forEach((_, i) => carMesh.setColorAt(i, col.set(carCols[Math.floor(rnd() * carCols.length)])));
  buses.forEach((b) => (b.v = 5));

  // ---------------- people
  const walks = new Paths();
  for (const r of city.roadList) {
    if (r.kind === 'ped') walks.add(r.pts, { weight: 2.5, hw: r.w / 2, side: 0 });
    else if (r.kind === 'path') walks.add(r.pts, { weight: 0.5, hw: r.w / 2, side: 0 });
    else if (r.kind === 'major' || r.kind === 'minor') walks.add(r.pts, { weight: r.kind === 'major' ? 0.5 : 0.25, hw: r.w / 2, side: 1 });
  }
  const peopleCount = opts.people ?? 15000;
  const people = makeAgents(walks, peopleCount, rnd, [1.0, 0.6], (p, r) =>
    p.side ? (p.hw + 0.9) * (r() < 0.5 ? 1 : -1) : (r() - 0.5) * p.hw * 1.4);
  for (const a of people) if (rnd() < 0.18) a.v = 0; // some stand around

  const torso = new THREE.CylinderGeometry(0.28, 0.32, 1.25, 6).translate(0, 0.65, 0);
  const head = new THREE.IcosahedronGeometry(0.24, 0).translate(0, 1.5, 0);
  const torsoMesh = new THREE.InstancedMesh(torso, carMat, people.length);
  const headMesh = new THREE.InstancedMesh(head, carMat, people.length);
  const clothes = ['#e05a47', '#3f6fb3', '#f2c14e', '#2f3540', '#f6f3ee', '#6aa85b', '#c45b8c', '#4aa7b5', '#8a5a3c', '#e98a3a'];
  const skins = ['#f2c9a5', '#e0ad84', '#c68b62', '#8d5b3d'];
  people.forEach((_, i) => {
    torsoMesh.setColorAt(i, col.set(clothes[Math.floor(rnd() * clothes.length)]));
    headMesh.setColorAt(i, col.set(rnd() < 0.3 ? '#3b2a22' : skins[Math.floor(rnd() * skins.length)]));
  });

  // umbrellas (rain): a coloured canopy over the head on a short pole; most people carry one
  const umbrellaGeo = mergeGeometries([
    new THREE.ConeGeometry(0.85, 0.32, 8).translate(0, 2.2, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4).translate(0, 1.75, 0),
  ]);
  const umbrellaMesh = new THREE.InstancedMesh(umbrellaGeo, carMat, people.length);
  const ru = mulberry32(77); // own random stream: the rest of the traffic stays as it was
  const umbrellaCols = ['#1f2430', '#c8322b', '#24407a', '#f2c14e', '#3e7d4f', '#7a2f6b', '#e9e4da'];
  const umbrellaOf = new Float32Array(people.length); // 1 = carries an umbrella
  people.forEach((_, i) => { umbrellaMesh.setColorAt(i, col.set(umbrellaCols[Math.floor(ru() * umbrellaCols.length)])); umbrellaOf[i] = ru() < 0.85 ? 1 : 0; });
  umbrellaMesh.count = 0;

  for (const m of [carMesh, busMesh, ddMesh, torsoMesh, headMesh, umbrellaMesh]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }

  const loc: Located = { x: 0, z: 0, tx: 1, tz: 0 };
  // write a yaw-only transform straight into the instance matrix buffer
  const write = (arr: THREE.TypedArray, i: number, x: number, y: number, z: number, tx: number, tz: number, s = 1) => {
    const o = i * 16;
    arr[o] = tx * s; arr[o + 1] = 0; arr[o + 2] = tz * s; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = -tz * s; arr[o + 9] = 0; arr[o + 10] = tx * s; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  };
  const step = (a: Agent, dt: number) => {
    a.s += a.v * dt * a.dir * (a.flee !== undefined && a.flee > time ? 3 : 1);
    if (a.s > a.p.len) { a.s = a.p.len; a.dir = -1; }
    else if (a.s < 0) { a.s = 0; a.dir = 1; }
    locate(a, loc);
  };

  // "less traffic" option: only the first share of each list moves and is drawn
  // (agents are in random order, so that is a random subset)
  let nAutos = autos.length, nSingles = singles.length, nDoubles = doubles.length, nPeople = people.length;
  // weather: fewer people out in rain and falling snow; umbrellas in the rain
  let rain = 0, snow = 0;
  // last positions, for the walking mode: buses to board, people for the оро and the bark
  const busAt = new Float32Array(buses.length * 4); // x, z, tx, tz (singles first, then doubles)
  const personAt = new Float32Array(people.length * 2);
  let shownPeople = people.length;
  // оро: a circle of people dancing around a centre
  const oroOf = new Int16Array(people.length).fill(-1); // place in the circle, -1 = not dancing
  let oro: { x: number; z: number; n: number } | null = null;
  let time = 0;
  function update(dt: number, camera?: THREE.Camera, target?: THREE.Vector3): void {
    dt = Math.min(dt, 0.1);
    time += dt;
    // grow agents with zoom so they stay readable as lively dots from far away
    const dist = camera && target ? camera.position.distanceTo(target) : 600;
    const carS = THREE.MathUtils.clamp(dist / 1100, 1, 3.2);
    const pplS = THREE.MathUtils.clamp(dist / 520, 1.25, 6);
    const showPeople = dist < 9000;
    torsoMesh.visible = headMesh.visible = umbrellaMesh.visible = showPeople;
    const ca = carMesh.instanceMatrix.array, ba = busMesh.instanceMatrix.array, da = ddMesh.instanceMatrix.array;
    for (let i = 0; i < nAutos; i++) { const a = autos[i]; step(a, dt); write(ca, i, loc.x, terrain.at(loc.x, loc.z) + 1.0, loc.z, loc.tx, loc.tz, carS); }
    // buses grow with zoom like cars, so they can be found from afar
    for (let i = 0; i < nSingles; i++) { const a = singles[i]; step(a, dt); write(ba, i, loc.x, terrain.at(loc.x, loc.z) + 1.0, loc.z, loc.tx, loc.tz, carS); busAt.set([loc.x, loc.z, loc.tx, loc.tz], i * 4); }
    for (let i = 0; i < nDoubles; i++) { const a = doubles[i]; step(a, dt); write(da, i, loc.x, terrain.at(loc.x, loc.z) + 1.0, loc.z, loc.tx, loc.tz, carS); busAt.set([loc.x, loc.z, loc.tx, loc.tz], (singles.length + i) * 4); }
    if (!showPeople) { for (const m of [carMesh, busMesh, ddMesh]) m.instanceMatrix.needsUpdate = true; return; }
    const ta = torsoMesh.instanceMatrix.array, ha = headMesh.instanceMatrix.array, ua = umbrellaMesh.instanceMatrix.array;
    const out = THREE.MathUtils.clamp(1 - 0.6 * rain - 0.4 * snow, 0.3, 1); // share of people still outside
    const nShown = Math.ceil(nPeople * out), umbrellas = rain > 0.02;
    shownPeople = nShown;
    torsoMesh.count = headMesh.count = nShown;
    umbrellaMesh.count = umbrellas ? nShown : 0;
    for (let i = 0; i < nShown; i++) {
      const a = people[i];
      if (a.v > 0) step(a, dt);
      else if (a.seg === 0 && !a.init) { locate(a, loc); a.init = true; a.x = loc.x; a.z = loc.z; a.tx = loc.tx; a.tz = loc.tz; }
      let x = a.v > 0 ? loc.x : a.x ?? loc.x, z = a.v > 0 ? loc.z : a.z ?? loc.z;
      let tx = a.v > 0 ? loc.tx : a.tx ?? 1, tz = a.v > 0 ? loc.tz : a.tz ?? 0;
      let bob = a.v > 0 ? Math.abs(Math.sin(time * 7 + a.phase)) * 0.12 : 0;
      const k = oroOf[i];
      if (oro && k >= 0) {
        // оро: hand in hand on a circle, moving to the right with hopping steps
        const ang = (k / oro.n) * Math.PI * 2 + time * 0.55, R = 3.2 + oro.n * 0.18;
        x = oro.x + Math.cos(ang) * R; z = oro.z + Math.sin(ang) * R;
        tx = -Math.sin(ang); tz = Math.cos(ang);
        bob = Math.abs(Math.sin(time * 7 + k)) * 0.3;
      }
      personAt[i * 2] = x; personAt[i * 2 + 1] = z;
      const y = terrain.at(x, z) + 1.0 + bob;
      // slightly oversized so they read as lively dots from above
      write(ta, i, x, y, z, tx, tz, pplS);
      write(ha, i, x, y, z, tx, tz, pplS);
      if (umbrellas) write(ua, i, x, y, z, tx, tz, pplS * umbrellaOf[i]); // scale 0 = no umbrella
    }
    for (const m of [carMesh, busMesh, ddMesh, torsoMesh, headMesh, umbrellaMesh]) m.instanceMatrix.needsUpdate = true;
  }
  update(0.001);
  // headlights: an additive glow on the road ahead, sharing the car transforms
  const beamGeo = new THREE.PlaneGeometry(11, 5.5).rotateX(-Math.PI / 2).translate(7.5, 0.35, 0);
  const beamMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffe2a8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: opts.clippingPlanes });
  const beams: THREE.InstancedMesh[] = [];
  for (const src of [carMesh, busMesh, ddMesh]) {
    const b = new THREE.InstancedMesh(beamGeo, beamMat, src.count);
    b.instanceMatrix = src.instanceMatrix;
    b.frustumCulled = false;
    b.renderOrder = 2;
    b.visible = false;
    group.add(b);
    beams.push(b);
  }
  /** Less traffic: ~35 % of the cars, buses and people (less CPU work per frame). */
  function setLight(on: boolean): void {
    const k = on ? 0.35 : 1;
    nAutos = Math.ceil(autos.length * k); nSingles = Math.ceil(singles.length * k); nDoubles = Math.ceil(doubles.length * k); nPeople = Math.ceil(people.length * k);
    carMesh.count = beams[0].count = nAutos;
    busMesh.count = beams[1].count = nSingles;
    ddMesh.count = beams[2].count = nDoubles;
    torsoMesh.count = headMesh.count = nPeople;
  }
  /** nearest ЈСП bus within maxD metres: position and heading (yaw: 0 = north) */
  function nearestBus(x: number, z: number, maxD: number): { x: number; z: number; yaw: number; d: number } | null {
    let best: { x: number; z: number; yaw: number; d: number } | null = null;
    const n = buses.length;
    for (let i = 0; i < n; i++) {
      if (i < singles.length ? i >= nSingles : i - singles.length >= nDoubles) continue;
      const o = i * 4, d = Math.hypot(busAt[o] - x, busAt[o + 1] - z);
      if (d < maxD && (!best || d < best.d)) best = { x: busAt[o], z: busAt[o + 1], yaw: Math.atan2(busAt[o + 2], -busAt[o + 3]), d };
    }
    return best;
  }
  /** оро around (x, z) with up to 12 nearby people; returns how many joined */
  function startOro(x: number, z: number): number {
    stopOro();
    const near: [number, number][] = [];
    for (let i = 0; i < shownPeople; i++) {
      const d = Math.hypot(personAt[i * 2] - x, personAt[i * 2 + 1] - z);
      if (d < 120) near.push([d, i]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const ids = near.slice(0, 12).map(([, i]) => i);
    ids.forEach((i, k) => (oroOf[i] = k));
    oro = ids.length ? { x, z, n: ids.length } : null;
    return ids.length;
  }
  function stopOro(): void { oroOf.fill(-1); oro = null; }
  /** a bark: people within r metres run away for a few seconds */
  function scatter(x: number, z: number, r: number): void {
    for (let i = 0; i < shownPeople; i++) {
      const px = personAt[i * 2], pz = personAt[i * 2 + 1];
      if (Math.hypot(px - x, pz - z) > r || oroOf[i] >= 0) continue;
      const a = people[i], { pts } = a.p, s = a.seg;
      const tx = pts[s + 1][0] - pts[s][0], tz = pts[s + 1][1] - pts[s][1];
      a.dir = tx * (px - x) + tz * (pz - z) >= 0 ? 1 : -1; // along the path, away from the dog
      if (a.v === 0) { a.v = 1.2; a.init = false; }
      a.flee = time + 3;
    }
  }
  /** weather amounts 0…1 (rain: umbrellas and fewer people; falling snow: fewer people) */
  function setWeather(r: number, s: number): void { rain = r; snow = s; }
  function setNight(f: number): void {
    beamMat.opacity = 0.7 * THREE.MathUtils.smoothstep(f, 0.15, 0.9);
    for (const b of beams) b.visible = f > 0.1;
  }
  return { group, update, setNight, setLight, setWeather, nearestBus, startOro, stopOro, scatter, glows: beams as THREE.Object3D[], counts: { cars: cars.length, people: people.length } };
}
