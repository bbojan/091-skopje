import * as THREE from 'three';
import { pip, pipPoly, toPts } from './geo.ts';
import { isPaintedArea, areaLift, roadLift, CASING_LIFT, CASING_EXTRA, type RoadInfo } from './city.ts';
import type { Terrain } from './terrain.ts';
import type { CitySpec } from './cities.ts';
import type { AreaData, Bounds, BuildingData, CrossData, MapMeta, Places, Poly, Ring } from './types.ts';

// Walk the city as Итар Пејо (folk trickster) or a Шарпланинец (Šar Mountain dog), in first
// or third person. The other one follows as a companion. One context action: board a bus,
// ride the gondola, take off in the parked plane; otherwise an оро (Пејо) or a bark (dog).

export type CharName = 'pejo' | 'dog';
export type ViewName = 'third' | 'first';

const SCALE = 1.3; // matches the slightly oversized city pedestrians
const SPEC = {
  pejo: { walk: 3.2, run: 8, eye: 1.62 * SCALE, head: 1.7 * SCALE, dist: 7 },
  dog: { walk: 4, run: 12, eye: 0.8 * SCALE, head: 0.9 * SCALE, dist: 5 },
} as const;

// Places with an info card: `spots` per city in cities.ts (names are map data, Macedonian;
// texts: i18n `info.<key>`).

// ---------------------------------------------------------------- models (front along +x)
const lambert = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);

interface Rig { group: THREE.Group; legs: THREE.Object3D[]; arms: THREE.Object3D[]; tail?: THREE.Object3D; head: THREE.Object3D }

function limb(geo: THREE.BufferGeometry, mat: THREE.Material, pivot: THREE.Vector3Tuple, drop: number): THREE.Group {
  const p = new THREE.Group();
  p.position.set(...pivot);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -drop;
  m.castShadow = true;
  p.add(m);
  return p;
}

/** Итар Пејо in a male folk costume: white shirt and trousers, dark vest, red sash, šubara. */
function buildPejo(): Rig {
  const g = new THREE.Group();
  const shirt = lambert('#f3efe6'), vest = lambert('#2a2326'), sash = lambert('#b3261e'), skin = lambert('#e3b48c');
  const dark = lambert('#2a1d16'), shoe = lambert('#6b4a2b'), hat = lambert('#1d1b1c');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const legs = [-1, 1].map((s) => {
    const l = limb(capsule(0.085, 0.62), shirt, [0, 0.9, s * 0.1], 0.42);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.11), shoe);
    foot.position.set(0.05, -0.86, 0);
    l.add(foot);
    g.add(l);
    return l;
  });
  add(capsule(0.2, 0.42), shirt, 0, 1.22, 0);
  add(capsule(0.208, 0.32), vest, 0, 1.27, 0).scale.set(1, 1, 0.94); // vest over the shirt
  add(new THREE.CylinderGeometry(0.215, 0.215, 0.12, 16), sash, 0, 0.98, 0);
  const arms = [-1, 1].map((s) => {
    const a = limb(capsule(0.06, 0.48), shirt, [0, 1.46, s * 0.27], 0.3);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skin);
    hand.position.y = -0.62;
    a.add(hand);
    g.add(a);
    return a;
  });
  const head = add(new THREE.SphereGeometry(0.13, 16, 12), skin, 0, 1.66, 0);
  add(new THREE.BoxGeometry(0.035, 0.035, 0.17), dark, 0.12, 1.615, 0); // moustache
  for (const z of [-0.045, 0.045]) add(new THREE.SphereGeometry(0.016, 6, 4), dark, 0.118, 1.69, z);
  add(new THREE.CylinderGeometry(0.115, 0.13, 0.16, 16), hat, 0, 1.8, 0); // šubara
  g.scale.setScalar(SCALE);
  return { group: g, legs, arms, head };
}

/** A Шарпланинец: big grey-sand sheepdog with a darker saddle and a curled bushy tail. */
function buildDog(): Rig {
  const g = new THREE.Group();
  const coat = lambert('#9c8d76'), saddle = lambert('#6d6152'), dark = lambert('#4c4239'), black = lambert('#1b1714');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  add(capsule(0.2, 0.5).rotateZ(Math.PI / 2), coat, 0, 0.58, 0); // body
  add(capsule(0.17, 0.42).rotateZ(Math.PI / 2), saddle, -0.02, 0.66, 0).scale.set(1, 0.75, 1.05);
  add(new THREE.SphereGeometry(0.2, 14, 10), coat, 0.33, 0.66, 0); // chest
  const head = new THREE.Group();
  head.position.set(0.47, 0.82, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), coat); skull.castShadow = true;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.11), dark); snout.position.set(0.15, -0.04, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), black); nose.position.set(0.24, -0.01, 0);
  head.add(skull, snout, nose);
  for (const z of [-0.08, 0.08]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), dark);
    ear.position.set(-0.02, 0.09, z); ear.rotation.set(z * 4, 0, 0.6);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), black); eye.position.set(0.11, 0.04, z * 0.7);
    head.add(eye);
  }
  g.add(head);
  const legs: THREE.Object3D[] = [];
  for (const x of [0.27, -0.27]) for (const z of [-0.11, 0.11]) {
    const l = limb(capsule(0.055, 0.3), coat, [x, 0.45, z], 0.2);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark); paw.position.y = -0.4; paw.scale.set(1.3, 0.6, 1);
    l.add(paw);
    g.add(l);
    legs.push(l);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.42, 0.68, 0);
  const tailMesh = new THREE.Mesh(capsule(0.075, 0.34), coat);
  tailMesh.position.set(-0.08, 0.17, 0); tailMesh.rotation.z = 0.55; tailMesh.castShadow = true;
  tail.add(tailMesh);
  g.add(tail);
  g.scale.setScalar(SCALE);
  return { group: g, legs, arms: [], tail, head };
}

// ---------------------------------------------------------------- building footprints (collision)
function obstacles(buildings: BuildingData[]) {
  const CELL = 40;
  const rings: Ring[] = [], boxes: number[] = [];
  const grid = new Map<number, number[]>();
  const key = (i: number, j: number) => i * 100003 + j;
  for (const b of buildings) {
    if (b.t === 'roof' || b.t === 'carport' || b.h < 2) continue; // you can walk under these
    const r = toPts(b.r[0]);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const id = rings.push(r) - 1;
    boxes.push(x0, z0, x1, z1);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        let l = grid.get(key(i, j));
        if (!l) grid.set(key(i, j), (l = []));
        l.push(id);
      }
  }
  return {
    blocked(x: number, z: number): boolean {
      for (const id of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
        const o = id * 4;
        if (x < boxes[o] || x > boxes[o + 2] || z < boxes[o + 1] || z > boxes[o + 3]) continue;
        if (pip(x, z, rings[id])) return true;
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------- the drawn surface
// Streets, squares and other areas are draped above the bare terrain; stand on the top one.
function surface(roads: RoadInfo[], areas: AreaData[]) {
  const CELL = 30;
  const key = (i: number, j: number) => i * 100003 + j;
  const seg: number[] = []; // ax, az, bx, bz, half width, lift, casing half width (0 = none)
  const segGrid = new Map<number, number[]>();
  for (const r of roads) {
    const lift = roadLift(r.kind, r.b), cas = r.kind === 'major' || r.kind === 'minor' ? r.w / 2 + CASING_EXTRA : 0;
    const reach = Math.max(r.w / 2, cas);
    for (let k = 0; k < r.pts.length - 1; k++) {
      const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1];
      const id = seg.length / 7;
      seg.push(ax, az, bx, bz, r.w / 2, lift, cas);
      for (let i = Math.floor((Math.min(ax, bx) - reach) / CELL); i <= Math.floor((Math.max(ax, bx) + reach) / CELL); i++)
        for (let j = Math.floor((Math.min(az, bz) - reach) / CELL); j <= Math.floor((Math.max(az, bz) + reach) / CELL); j++) {
          let l = segGrid.get(key(i, j));
          if (!l) segGrid.set(key(i, j), (l = []));
          l.push(id);
        }
    }
  }
  const polys: { poly: Poly; lift: number; box: [number, number, number, number] }[] = [];
  const polyGrid = new Map<number, number[]>();
  for (const a of areas) {
    if (isPaintedArea(a.k, a.a)) continue; // painted into the terrain: no lift
    const poly = a.r.map(toPts);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const id = polys.push({ poly, lift: areaLift(a.z), box: [x0, z0, x1, z1] }) - 1;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        let l = polyGrid.get(key(i, j));
        if (!l) polyGrid.set(key(i, j), (l = []));
        l.push(id);
      }
  }
  /** height of the drawn surface above the bare terrain at (x, z) */
  return (x: number, z: number): number => {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let lift = 0;
    for (const id of segGrid.get(k) ?? []) {
      const o = id * 7, ax = seg[o], az = seg[o + 1], dx = seg[o + 2] - ax, dz = seg[o + 3] - az;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9), 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < seg[o + 4]) lift = Math.max(lift, seg[o + 5]);
      else if (d < seg[o + 6]) lift = Math.max(lift, CASING_LIFT);
    }
    for (const id of polyGrid.get(k) ?? []) {
      const p = polys[id];
      if (p.lift <= lift || x < p.box[0] || x > p.box[2] || z < p.box[1] || z > p.box[3]) continue;
      if (pipPoly(x, z, p.poly)) lift = p.lift;
    }
    return lift;
  };
}

// ---------------------------------------------------------------- walking
export interface WalkHooks {
  nearestBus: (x: number, z: number, maxD: number) => { x: number; z: number; yaw: number; d: number } | null;
  startOro: (x: number, z: number) => number;
  stopOro: () => void;
  scatter: (x: number, z: number, r: number) => void;
  startle: (x: number, z: number) => void;
}

export interface WalkOptions {
  city: CitySpec;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrain: Terrain;
  bounds: Bounds;
  meta: MapMeta;
  places: Places;
  buildings: BuildingData[];
  /** draped areas (squares, parking, water…), for the surface height */
  areas: AreaData[];
  roads: RoadInfo[];
  crosses: CrossData[];
  gondola: THREE.CatmullRomCurve3 | null;
  /** where the plane is parked while walking, and its heading */
  planeSpot: { x: number; z: number; yaw: number };
  hooks: WalkHooks;
  /** ends the window key listeners when the city is unloaded */
  signal?: AbortSignal;
}

/** What the action button does right now. */
export type WalkAction = 'bus' | 'plane' | 'gondolaUp' | 'gondolaDown' | 'oro' | 'oroStop' | 'bark' | 'none';

export function createWalk(o: WalkOptions) {
  const { scene, camera, terrain, bounds, hooks, planeSpot, gondola } = o;
  const rigs = { pejo: buildPejo(), dog: buildDog() };
  for (const r of Object.values(rigs)) { r.group.visible = false; scene.add(r.group); }
  const walls = obstacles(o.buildings);
  const lift = surface(o.roads, o.areas);
  const ground = (x: number, z: number) => terrain.at(x, z) + lift(x, z) + 0.02;
  o.buildings = []; o.areas = []; // copied into the grids; don't keep the parsed map data alive

  // info spots in scene coordinates (exact OSM places when known); the Millennium Cross from the data
  const P = (lat: number, lon: number): [number, number] => [(lon - o.meta.lon0) * o.meta.kx, -(lat - o.meta.lat0) * o.meta.ky];
  const spots = o.city.spots.map(([key, name, lat, lon, radius, place]) => {
    const [x, z] = (place && o.places[place]) || P(lat, lon);
    return { key, name, x, z, radius };
  });
  const mc = o.crosses.find((c) => /Millennium|Милениум/.test(c.name));
  if (mc) spots.push({ key: 'cross', name: 'Милениумски крст', x: mc.x, z: mc.z, radius: 70 });

  // gondola stations: the lower end is in the city
  const ends = gondola ? [gondola.getPointAt(0), gondola.getPointAt(1)] : [];
  const bottomIsStart = ends.length === 2 && ends[0].y < ends[1].y;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.6), lambert('#d8322a'));
  cabin.visible = false;
  scene.add(cabin);

  const st = {
    active: false, char: 'pejo' as CharName, view: 'third' as ViewName,
    pos: new THREE.Vector3(), yaw: 0, camYaw: 0, pitch: 0.35, speed: 0, phase: 0,
    run: false, invert: false, wag: 0, bark: 0, oro: null as null | { x: number; z: number },
    ride: null as null | { t: number; dir: 1 | -1 },
    comp: new THREE.Vector3(), compYaw: 0, compPhase: 0,
  };
  const input = { fwd: 0, back: 0, left: 0, right: 0, run: false };
  const stick = { x: 0, y: 0 }; // touch joystick / gamepad, −1…1 (y up = forward)
  const look = new THREE.Vector2(); // accumulated look deltas (pixels or stick·dt)

  const keys: Record<string, keyof typeof input> = {
    KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  };
  addEventListener('keydown', (e) => {
    if (!st.active) return;
    const k = keys[e.code];
    if (k) { e.preventDefault(); (input as Record<string, number | boolean>)[k] = 1; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;
  }, { signal: o.signal });
  addEventListener('keyup', (e) => {
    const k = keys[e.code];
    if (k) (input as Record<string, number | boolean>)[k] = 0;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
  }, { signal: o.signal });
  addEventListener('blur', () => Object.assign(input, { fwd: 0, back: 0, left: 0, right: 0, run: false }), { signal: o.signal });

  const free = (x: number, z: number) => !walls.blocked(x, z);
  function start(at: THREE.Vector3, camYaw: number): void {
    // find a free spot near `at` (spiral out of buildings)
    let x = at.x, z = at.z;
    for (let r = 0; r < 200 && !free(x, z); r += 4) { x = at.x + Math.cos(r) * r; z = at.z + Math.sin(r) * r; }
    st.pos.set(x, ground(x, z), z);
    Object.assign(st, { active: true, yaw: camYaw, camYaw, pitch: 0.35, speed: 0, ride: null, oro: null });
    st.comp.set(x - Math.sin(camYaw) * 2.5, 0, z + Math.cos(camYaw) * 2.5);
    showModels();
    update(0);
  }
  function stop(): void {
    st.active = false;
    if (st.oro) { hooks.stopOro(); st.oro = null; }
    st.ride = null;
    cabin.visible = false;
    for (const r of Object.values(rigs)) r.group.visible = false;
  }
  const other = (): CharName => (st.char === 'pejo' ? 'dog' : 'pejo');
  function showModels(): void {
    rigs[st.char].group.visible = st.active && st.view === 'third';
    rigs[other()].group.visible = st.active; // the companion
  }
  function setCharacter(c: CharName): void {
    if (st.oro) { hooks.stopOro(); st.oro = null; }
    if (st.active && c !== st.char) {
      // swap places with the companion
      const p = st.pos.clone(), y = st.yaw;
      st.pos.set(st.comp.x, ground(st.comp.x, st.comp.z), st.comp.z); st.yaw = st.compYaw;
      st.comp.set(p.x, 0, p.z); st.compYaw = y;
    }
    st.char = c;
    showModels();
  }
  function setView(v: ViewName): void { st.view = v; st.pitch = v === 'first' ? 0 : 0.35; showModels(); }

  /** what the action button does here */
  function action(): WalkAction {
    if (st.ride) return 'none';
    const { x, z } = st.pos;
    if (hooks.nearestBus(x, z, 12)) return 'bus';
    if (Math.hypot(planeSpot.x - x, planeSpot.z - z) < 18) return 'plane';
    if (ends.length === 2) {
      const bottom = bottomIsStart ? ends[0] : ends[1], top = bottomIsStart ? ends[1] : ends[0];
      if (Math.hypot(bottom.x - x, bottom.z - z) < 30) return 'gondolaUp';
      if (Math.hypot(top.x - x, top.z - z) < 30) return 'gondolaDown';
    }
    if (st.char === 'dog') return 'bark';
    return st.oro ? 'oroStop' : 'oro';
  }
  /** do the in-place actions (оро, bark, gondola); vehicles are handled by the caller */
  function act(a: WalkAction): void {
    const { x, z } = st.pos;
    if (a === 'oro') { if (hooks.startOro(x, z)) st.oro = { x, z }; }
    else if (a === 'oroStop') { hooks.stopOro(); st.oro = null; }
    else if (a === 'bark') { hooks.scatter(x, z, 30); hooks.startle(x, z); st.bark = 1.2; st.wag = 2; }
    else if (a === 'gondolaUp' || a === 'gondolaDown') {
      const up = a === 'gondolaUp';
      st.ride = { t: up === bottomIsStart ? 0 : 1, dir: up === bottomIsStart ? 1 : -1 };
      cabin.visible = true;
    }
  }

  /** the nearest info spot within its radius */
  function info(): { key: string; name: string } | null {
    let best: { key: string; name: string; d: number } | null = null;
    for (const s of spots) {
      const d = Math.hypot(s.x - st.pos.x, s.z - st.pos.z);
      if (d < s.radius && (!best || d < best.d)) best = { key: s.key, name: s.name, d };
    }
    return best;
  }

  const fwd = new THREE.Vector3(), cam = new THREE.Vector3(), tgt = new THREE.Vector3();
  // legs swing about z (front is +x): Пејо's two alternate, the dog trots diagonally
  // (front-left with back-right); arms swing against the legs; the tail wags faster after a bark
  const LEG_SIGN = { pejo: [1, -1], dog: [1, -1, -1, 1] };
  function animate(rig: Rig, phase: number, speed: number): void {
    const swing = Math.min(1, speed / 3) * 0.6 * Math.sin(phase);
    const sign = rig === rigs.dog ? LEG_SIGN.dog : LEG_SIGN.pejo;
    rig.legs.forEach((l, i) => (l.rotation.z = sign[i] * swing));
    rig.arms.forEach((a, i) => (a.rotation.z = (i === 0 ? -1 : 1) * swing * 0.8));
    if (rig.tail) rig.tail.rotation.x = Math.sin(performance.now() / (st.wag > 0 ? 45 : 160)) * (st.wag > 0 ? 0.6 : 0.2);
    if (rig === rigs.dog) rig.head.rotation.z = st.bark > 0 ? Math.sin(st.bark * 18) * 0.15 : 0;
  }
  const place = (rig: Rig, x: number, z: number, yaw: number, bob: number) => {
    rig.group.position.set(x, ground(x, z) + bob, z);
    rig.group.rotation.set(0, Math.PI / 2 - yaw, 0);
  };

  function update(dt: number): void {
    if (!st.active) return;
    dt = Math.min(dt, 0.05);
    st.wag = Math.max(0, st.wag - dt); st.bark = Math.max(0, st.bark - dt);
    // look: mouse / touch drag (pixels) and right stick (already scaled by dt)
    st.camYaw += look.x * 0.0028;
    st.pitch = THREE.MathUtils.clamp(st.pitch + look.y * 0.0028 * (st.invert ? -1 : 1), st.view === 'first' ? -1.2 : -0.15, 1.25);
    look.set(0, 0);
    const spec = SPEC[st.char], rig = rigs[st.char];

    if (st.ride && gondola) {
      // riding the gondola: ~30 s end to end; you stand in the cabin under the cable
      st.ride.t = THREE.MathUtils.clamp(st.ride.t + (st.ride.dir * dt) / 30, 0, 1);
      const p = gondola.getPointAt(st.ride.t);
      cabin.position.set(p.x, p.y - 3.4, p.z);
      st.pos.set(p.x, p.y - 4.55, p.z);
      rig.group.position.copy(st.pos); rig.group.rotation.set(0, Math.PI / 2 - st.yaw, 0);
      const done = st.ride.dir > 0 ? st.ride.t >= 1 : st.ride.t <= 0;
      if (done) {
        // step out next to the station
        const out = gondola.getPointAt(st.ride.t), x = out.x + 6, z = out.z + 6;
        st.pos.set(x, ground(x, z), z);
        st.ride = null;
        cabin.visible = false;
      }
    } else {
      // move relative to where the camera looks
      const mvF = input.fwd - input.back + stick.y, mvS = input.right - input.left + stick.x;
      const len = Math.min(1, Math.hypot(mvF, mvS));
      const fx = Math.sin(st.camYaw), fz = -Math.cos(st.camYaw); // forward
      const dx = fx * mvF + -fz * mvS, dz = fz * mvF + fx * mvS;
      const speed = len * ((input.run || st.run) ? spec.run : spec.walk);
      st.speed += (speed - st.speed) * Math.min(1, dt * 8);
      if (len > 0.05) {
        const want = Math.atan2(dx, -dz);
        const diff = Math.atan2(Math.sin(want - st.yaw), Math.cos(want - st.yaw));
        st.yaw += diff * Math.min(1, dt * 10);
        const nl = Math.hypot(dx, dz) || 1, step = st.speed * dt;
        const nx = st.pos.x + (dx / nl) * step, nz = st.pos.z + (dz / nl) * step;
        // slide along walls: try the full step, then each axis
        if (free(nx, nz)) { st.pos.x = nx; st.pos.z = nz; }
        else if (free(nx, st.pos.z)) st.pos.x = nx;
        else if (free(st.pos.x, nz)) st.pos.z = nz;
      }
      if (st.view === 'first') st.yaw = st.camYaw;
      st.pos.x = THREE.MathUtils.clamp(st.pos.x, -bounds.hw + 10, bounds.hw - 10);
      st.pos.z = THREE.MathUtils.clamp(st.pos.z, -bounds.hh + 10, bounds.hh - 10);
      st.pos.y = ground(st.pos.x, st.pos.z);
      st.phase += st.speed * dt * (st.char === 'dog' ? 2.6 : 2.2);
      // a dancing Пејо hops on the spot; walking away ends the оро
      const dancing = st.oro && st.speed < 0.3;
      if (st.oro && Math.hypot(st.oro.x - st.pos.x, st.oro.z - st.pos.z) > 14) { hooks.stopOro(); st.oro = null; }
      place(rig, st.pos.x, st.pos.z, st.yaw + (dancing ? Math.sin(performance.now() / 300) * 0.6 : 0), dancing ? Math.abs(Math.sin(performance.now() / 160)) * 0.15 : 0);
      animate(rig, dancing ? performance.now() / 120 : st.phase, dancing ? 3 : st.speed);
    }

    // the companion follows, a couple of metres behind
    const crig = rigs[other()];
    const bx = st.pos.x - Math.sin(st.yaw) * 2.6, bz = st.pos.z + Math.cos(st.yaw) * 2.6;
    const cdx = bx - st.comp.x, cdz = bz - st.comp.z, cd = Math.hypot(cdx, cdz);
    const cs = cd > 25 ? cd : cd > 0.6 ? Math.min(cd * 2.2, SPEC[other()].run) : 0;
    if (cs > 0) { st.comp.x += (cdx / cd) * cs * dt; st.comp.z += (cdz / cd) * cs * dt; st.compYaw = Math.atan2(cdx, -cdz); }
    st.compPhase += cs * dt * 2.4;
    if (st.ride) { crig.group.visible = false; } else { crig.group.visible = true; place(crig, st.comp.x, st.comp.z, st.compYaw, 0); animate(crig, st.compPhase, cs); }
    rig.group.visible = st.view === 'third';

    // camera
    if (st.view === 'first') {
      cam.set(st.pos.x, st.pos.y + spec.eye, st.pos.z);
      const cp = Math.cos(st.pitch);
      fwd.set(Math.sin(st.camYaw) * cp, -Math.sin(st.pitch), -Math.cos(st.camYaw) * cp);
      camera.position.copy(cam);
      camera.lookAt(tgt.copy(cam).add(fwd));
    } else {
      tgt.set(st.pos.x, st.pos.y + spec.head, st.pos.z);
      const d = spec.dist * (st.ride ? 2.2 : 1), ce = Math.cos(st.pitch);
      cam.set(tgt.x - Math.sin(st.camYaw) * ce * d, tgt.y + Math.sin(st.pitch) * d + 1, tgt.z + Math.cos(st.camYaw) * ce * d);
      cam.y = Math.max(cam.y, terrain.at(cam.x, cam.z) + 0.6);
      camera.position.copy(cam);
      camera.lookAt(tgt);
    }
  }

  return {
    rigs, start, stop, update, input, stick, look, action, act, info, setCharacter, setView,
    setInvertY(v: boolean): void { st.invert = v; },
    setRun(v: boolean): void { st.run = v; },
    get running(): boolean { return st.run; },
    get active(): boolean { return st.active; },
    get pos(): THREE.Vector3 { return st.pos; },
    get yaw(): number { return st.yaw; },
    get character(): CharName { return st.char; },
    get view(): ViewName { return st.view; },
    get riding(): boolean { return !!st.ride; },
    get barking(): boolean { return st.bark > 0; },
  };
}

export type Walk = ReturnType<typeof createWalk>;
