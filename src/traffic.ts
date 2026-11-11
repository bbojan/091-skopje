import * as THREE from 'three';
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
  const busGeo = new THREE.BoxGeometry(11, 2.8, 2.5).translate(0, 1.8, 0);
  const carMat = new THREE.MeshLambertMaterial({ clippingPlanes: opts.clippingPlanes });
  const carCols = CAR_COLORS;
  const buses = cars.filter((c) => c.p.weight === 1 && rnd() < 0.06);
  const busSet = new Set(buses);
  const autos = cars.filter((c) => !busSet.has(c));
  const carMesh = new THREE.InstancedMesh(carGeo, carMat, autos.length);
  const busMesh = new THREE.InstancedMesh(busGeo, carMat, buses.length);
  const col = new THREE.Color();
  autos.forEach((_, i) => carMesh.setColorAt(i, col.set(carCols[Math.floor(rnd() * carCols.length)])));
  buses.forEach((_, i) => busMesh.setColorAt(i, col.set(rnd() < 0.7 ? '#d6423a' : '#3d7fc4')));
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

  for (const m of [carMesh, busMesh, torsoMesh, headMesh]) {
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
    a.s += a.v * dt * a.dir;
    if (a.s > a.p.len) { a.s = a.p.len; a.dir = -1; }
    else if (a.s < 0) { a.s = 0; a.dir = 1; }
    locate(a, loc);
  };

  let time = 0;
  function update(dt: number, camera?: THREE.Camera, target?: THREE.Vector3): void {
    dt = Math.min(dt, 0.1);
    time += dt;
    // grow agents with zoom so they stay readable as lively dots from far away
    const dist = camera && target ? camera.position.distanceTo(target) : 600;
    const carS = THREE.MathUtils.clamp(dist / 1100, 1, 3.2);
    const pplS = THREE.MathUtils.clamp(dist / 520, 1.25, 6);
    const showPeople = dist < 9000;
    torsoMesh.visible = headMesh.visible = showPeople;
    const ca = carMesh.instanceMatrix.array, ba = busMesh.instanceMatrix.array;
    autos.forEach((a, i) => { step(a, dt); write(ca, i, loc.x, terrain.at(loc.x, loc.z) + 1.0, loc.z, loc.tx, loc.tz, carS); });
    buses.forEach((a, i) => { step(a, dt); write(ba, i, loc.x, terrain.at(loc.x, loc.z) + 1.0, loc.z, loc.tx, loc.tz, Math.min(carS, 2)); });
    if (!showPeople) { for (const m of [carMesh, busMesh]) m.instanceMatrix.needsUpdate = true; return; }
    const ta = torsoMesh.instanceMatrix.array, ha = headMesh.instanceMatrix.array;
    people.forEach((a, i) => {
      if (a.v > 0) step(a, dt);
      else if (a.seg === 0 && !a.init) { locate(a, loc); a.init = true; a.x = loc.x; a.z = loc.z; a.tx = loc.tx; a.tz = loc.tz; }
      const x = a.v > 0 ? loc.x : a.x ?? loc.x, z = a.v > 0 ? loc.z : a.z ?? loc.z;
      const tx = a.v > 0 ? loc.tx : a.tx ?? 1, tz = a.v > 0 ? loc.tz : a.tz ?? 0;
      const bob = a.v > 0 ? Math.abs(Math.sin(time * 7 + a.phase)) * 0.12 : 0;
      const y = terrain.at(x, z) + 1.0 + bob;
      // slightly oversized so they read as lively dots from above
      write(ta, i, x, y, z, tx, tz, pplS);
      write(ha, i, x, y, z, tx, tz, pplS);
    });
    for (const m of [carMesh, busMesh, torsoMesh, headMesh]) m.instanceMatrix.needsUpdate = true;
  }
  update(0.001);
  // headlights: an additive glow on the road ahead, sharing the car transforms
  const beamGeo = new THREE.PlaneGeometry(11, 5.5).rotateX(-Math.PI / 2).translate(7.5, 0.35, 0);
  const beamMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffe2a8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: opts.clippingPlanes });
  const beams: THREE.InstancedMesh[] = [];
  for (const src of [carMesh, busMesh]) {
    const b = new THREE.InstancedMesh(beamGeo, beamMat, src.count);
    b.instanceMatrix = src.instanceMatrix;
    b.frustumCulled = false;
    b.renderOrder = 2;
    b.visible = false;
    group.add(b);
    beams.push(b);
  }
  function setNight(f: number): void {
    beamMat.opacity = 0.7 * THREE.MathUtils.smoothstep(f, 0.15, 0.9);
    for (const b of beams) b.visible = f > 0.1;
  }
  return { group, update, setNight, glows: beams as THREE.Object3D[], counts: { cars: cars.length, people: people.length } };
}
