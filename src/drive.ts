import * as THREE from 'three';
import { busGeometry } from './traffic.ts';
import type { RoadInfo } from './city.ts';
import type { Terrain } from './terrain.ts';
import type { Bounds } from './types.ts';

// Drive a red ЈСП double-decker through the streets: arcade handling, a chase camera,
// and a soft kerb that keeps the bus on the road (it scrapes along instead of leaving it).

const MAX_SPEED = 19.5, MAX_REVERSE = 5; // m/s (~70 km/h forward)
const ACCEL = 4.5, BRAKE = 9, DRAG = 0.6; // m/s²
const STEER = 0.75; // rad/s at full lock and speed
const BUS_HALF_WIDTH = 1.3;
const CELL = 30;

/** Drivable road segments in a uniform grid, for "nearest point on a road" queries. */
function roadIndex(roads: RoadInfo[]) {
  const seg: number[] = []; // ax, az, bx, bz, half width, 1 = street (not pedestrian/service)
  const grid = new Map<number, number[]>();
  const key = (i: number, j: number) => i * 100003 + j;
  for (const r of roads) {
    if (r.kind !== 'major' && r.kind !== 'minor' && r.kind !== 'service' && r.kind !== 'ped') continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1];
      const id = seg.length / 6;
      seg.push(ax, az, bx, bz, r.w / 2, r.kind === 'major' || r.kind === 'minor' ? 1 : 0);
      for (let i = Math.floor(Math.min(ax, bx) / CELL); i <= Math.floor(Math.max(ax, bx) / CELL); i++)
        for (let j = Math.floor(Math.min(az, bz) / CELL); j <= Math.floor(Math.max(az, bz) / CELL); j++) {
          let list = grid.get(key(i, j));
          if (!list) grid.set(key(i, j), (list = []));
          list.push(id);
        }
    }
  }
  const out = { x: 0, z: 0, dist: Infinity, hw: 0, tx: 1, tz: 0 };
  /** nearest drivable point within maxR metres (out.dist = Infinity when none); streets = skip pedestrian/service ways */
  function nearest(x: number, z: number, maxR: number, streets = false): typeof out {
    out.dist = Infinity;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), reach = Math.ceil(maxR / CELL);
    for (let i = ci - reach; i <= ci + reach; i++)
      for (let j = cj - reach; j <= cj + reach; j++) {
        const list = grid.get(key(i, j));
        if (!list) continue;
        for (const id of list) {
          const o = id * 6;
          if (streets && !seg[o + 5]) continue;
          const ax = seg[o], az = seg[o + 1], dx = seg[o + 2] - ax, dz = seg[o + 3] - az;
          const l2 = dx * dx + dz * dz || 1e-9;
          const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
          const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
          if (d < out.dist) { const l = Math.sqrt(l2); Object.assign(out, { x: px, z: pz, dist: d, hw: seg[o + 4], tx: dx / l, tz: dz / l }); }
        }
      }
    return out;
  }
  return { nearest };
}

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1c1c';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#ffd34d';
  g.font = "bold 40px 'Rubik Mono One', 'Arial Black', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ЈСП  СКОПЈЕ', 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBus(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(busGeometry(true, 5), new THREE.MeshLambertMaterial({ vertexColors: true }));
  body.castShadow = true;
  g.add(body);
  // side mirrors on short arms at the front corners
  const mirrorMat = new THREE.MeshLambertMaterial({ color: '#232323' });
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.45), mirrorMat);
    arm.position.set(5.25, 2.35, side * 1.45);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.22), mirrorMat);
    mirror.position.set(5.3, 2.15, side * 1.68);
    g.add(arm, mirror);
  }
  // destination sign on both sides, on the flat panel between the decks
  const signMat = new THREE.MeshBasicMaterial({ map: signTexture() });
  for (const side of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.6), signMat);
    s.position.set(0.4, 2.6, side * 1.31);
    if (side < 0) s.rotation.y = Math.PI;
    g.add(s);
  }
  return g;
}

export interface DriveOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrain: Terrain;
  bounds: Bounds;
  roads: RoadInfo[];
  /** ends the window key listeners when the city is unloaded */
  signal?: AbortSignal;
}

type DriveKey = 'left' | 'right' | 'up' | 'down';

export function createDrive({ scene, camera, terrain, bounds, roads, signal }: DriveOptions) {
  const bus = buildBus();
  bus.visible = false;
  scene.add(bus);
  const index = roadIndex(roads);

  const st = { active: false, pos: new THREE.Vector3(), yaw: 0, speed: 0 };
  const input = { left: 0, right: 0, up: 0, down: 0, boost: false }; // same shape as the plane's (shared HUD buttons)
  const pad = { turn: 0, throttle: 0 };
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3();

  const keymap: Record<string, DriveKey> = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  };
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (!st.active) return;
    const k = keymap[e.code];
    if (!k) return;
    e.preventDefault();
    input[k] = down ? 1 : 0;
  };
  addEventListener('keydown', onKey(true), { signal });
  addEventListener('keyup', onKey(false), { signal });
  addEventListener('blur', () => Object.assign(input, { left: 0, right: 0, up: 0, down: 0 }), { signal });

  /** Start on the street nearest to `near`, heading along it. False if no street nearby. */
  function start(near: THREE.Vector3, preferYaw: number): boolean {
    const r = index.nearest(near.x, near.z, 900, true);
    if (!Number.isFinite(r.dist)) return false;
    // drive along the road, in the direction closest to where the camera was looking
    let yaw = Math.atan2(r.tx, -r.tz);
    if (Math.cos(yaw - preferYaw) < 0) yaw += Math.PI;
    Object.assign(st, { active: true, yaw, speed: 0 });
    st.pos.set(r.x, terrain.at(r.x, r.z) + 1, r.z);
    bus.visible = true;
    camPos.set(st.pos.x - Math.sin(yaw) * 42, st.pos.y + 16, st.pos.z + Math.cos(yaw) * 42);
    update(0);
    return true;
  }
  function stop(): void {
    st.active = false;
    bus.visible = false;
    Object.assign(input, { left: 0, right: 0, up: 0, down: 0 });
  }

  function update(dt: number): void {
    if (!st.active) return;
    dt = Math.min(dt, 0.05);
    const steer = THREE.MathUtils.clamp(input.right - input.left + pad.turn, -1, 1);
    const throttle = THREE.MathUtils.clamp(input.up - input.down + pad.throttle, -1, 1);
    // accelerate / brake / reverse, with rolling drag
    if (throttle > 0) st.speed += ACCEL * throttle * dt * (st.speed < 0 ? 2 : 1);
    else if (throttle < 0) st.speed += (st.speed > 0.2 ? BRAKE : ACCEL * 0.6) * throttle * dt;
    else st.speed -= Math.sign(st.speed) * Math.min(Math.abs(st.speed), DRAG * dt);
    st.speed = THREE.MathUtils.clamp(st.speed, -MAX_REVERSE, MAX_SPEED);
    // steering needs speed; reversing turns the other way
    st.yaw += steer * STEER * dt * Math.min(1, Math.abs(st.speed) / 4) * Math.sign(st.speed || 1);
    const fx = Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    let x = st.pos.x + fx * st.speed * dt, z = st.pos.z + fz * st.speed * dt;
    // the kerb: keep the bus centre on the road, scraping along it
    const r = index.nearest(x, z, 60);
    if (Number.isFinite(r.dist)) {
      const allowed = Math.max(0.5, r.hw + 0.6 - BUS_HALF_WIDTH);
      if (r.dist > allowed) {
        const k = allowed / r.dist;
        x = r.x + (x - r.x) * k; z = r.z + (z - r.z) * k;
        // turn gently to follow the road (whichever direction is closer to the heading)
        let roadYaw = Math.atan2(r.tx, -r.tz);
        if (Math.cos(roadYaw - st.yaw) < 0) roadYaw += Math.PI;
        const diff = Math.atan2(Math.sin(roadYaw - st.yaw), Math.cos(roadYaw - st.yaw));
        st.yaw += diff * Math.min(1, dt * 2.5);
        // the speed becomes what the kerb lets through (a dead end stops the bus like a wall)
        if (dt > 0) {
          const along = ((x - st.pos.x) * fx + (z - st.pos.z) * fz) / dt;
          st.speed = Math.abs(along) < Math.abs(st.speed) ? along : st.speed;
        }
      }
    }
    x = THREE.MathUtils.clamp(x, -bounds.hw + 20, bounds.hw - 20);
    z = THREE.MathUtils.clamp(z, -bounds.hh + 20, bounds.hh - 20);
    st.pos.set(x, terrain.at(x, z) + 1, z);

    // body follows the slope
    const ahead = terrain.at(x + fx * 4, z + fz * 4), behind = terrain.at(x - fx * 4, z - fz * 4);
    bus.position.copy(st.pos);
    bus.rotation.set(0, -st.yaw + Math.PI / 2, 0);
    bus.rotateZ(Math.atan2(ahead - behind, 8));

    // chase camera: behind and above, looking a little ahead
    want.set(x - fx * 42, st.pos.y + 16, z - fz * 42);
    want.y = Math.max(want.y, terrain.at(want.x, want.z) + 8);
    camPos.lerp(want, dt === 0 ? 1 : 1 - Math.exp(-dt * 3));
    camera.position.copy(camPos);
    look.set(x + fx * 16, st.pos.y + 2, z + fz * 16);
    camera.lookAt(look);
  }

  return {
    bus, start, stop, update, input, pad,
    get active(): boolean { return st.active; },
    get pos(): THREE.Vector3 { return st.pos; },
    get kmh(): number { return Math.round(Math.abs(st.speed) * 3.6); },
  };
}

export type Drive = ReturnType<typeof createDrive>;
