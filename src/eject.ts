// The F-15's pilot ejecting (the jet's action: 🪂 on the HUD, X, the pad's Y): the seat fires the pilot up out of
// the jet, falls away after a second, and the parachute (the flag's red and yellow gores) opens; the arrows steer
// it. The fall is quick high up and slows to ~7 m/s near the ground (~13 s from 300 m); on landing main.ts goes on in walk mode
// there. The empty jet is flown into the ground by main.ts (a blast from src/rockets.ts).
import * as THREE from 'three';

const SEAT_T = 1.1;   // seconds on the seat before the parachute opens
const OPEN_T = 0.9;   // seconds for the canopy to open

export function createEject(o: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; ground: (x: number, z: number) => number }) {
  const M = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const group = new THREE.Group();
  group.visible = false;
  o.scene.add(group);

  // the pilot (feet at the origin, ~1.8 m, facing -z): olive flight suit, dark harness with chest and leg straps,
  // white helmet with a dark visor and a red stripe, boots; the knees a little bent, the hands up on the risers
  const pilot = new THREE.Group();
  const suit = M('#5d6643'), suitDark = M('#4a5236'), strap = M('#2b2622'), helmet = M('#f1ece4'), visor = M('#1f2a44'), stripe = M('#d8322a'), boot = M('#2f2622'), metal = M('#c9c4c0');
  const add = (g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  /** a limb: a capsule of radius r from a to b */
  const limb = (a: [number, number, number], b: [number, number, number], r: number, mat: THREE.Material) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
    m.castShadow = true;
    pilot.add(m);
    return m;
  };
  // the risers come down to the shoulder rings (RING), the hands hold them a little higher (HAND)
  const RING: [number, number, number] = [0.2, 1.43, -0.02], HAND: [number, number, number] = [0.27, 1.9, -0.06];
  for (const s of [-1, 1]) {
    add(pilot, new THREE.BoxGeometry(0.12, 0.09, 0.27), boot, s * 0.11, 0.045, -0.05);           // boot
    limb([s * 0.11, 0.1, -0.02], [s * 0.11, 0.5, 0.06], 0.065, suit);                           // shin
    limb([s * 0.11, 0.5, 0.06], [s * 0.12, 0.9, -0.06], 0.085, suit);                           // thigh, knee a little forward
    const loop = add(pilot, new THREE.TorusGeometry(0.095, 0.018, 6, 14), strap, s * 0.12, 0.78, -0.02); // leg loop
    loop.rotation.x = Math.PI / 2;
    limb([s * 0.2, 1.42, 0], [s * 0.25, 1.66, -0.04], 0.052, suit);                              // upper arm
    limb([s * 0.25, 1.66, -0.04], [HAND[0] * s, HAND[1], HAND[2]], 0.045, suit);                 // forearm
    add(pilot, new THREE.SphereGeometry(0.05, 8, 6), boot, HAND[0] * s, HAND[1], HAND[2]);       // glove
    add(pilot, new THREE.BoxGeometry(0.05, 0.42, 0.04), strap, s * 0.1, 1.24, -0.15);            // shoulder strap, front
    add(pilot, new THREE.TorusGeometry(0.03, 0.01, 5, 10), metal, RING[0] * s, RING[1], RING[2]); // the riser ring
  }
  add(pilot, new THREE.BoxGeometry(0.34, 0.2, 0.22), suitDark, 0, 0.98, 0);                     // pelvis
  const torso = add(pilot, new THREE.CapsuleGeometry(0.15, 0.3, 4, 12), suit, 0, 1.24, 0);      // torso
  torso.scale.set(1.25, 1, 0.9);
  add(pilot, new THREE.BoxGeometry(0.38, 0.05, 0.3), strap, 0, 1.2, 0);                         // chest strap
  add(pilot, new THREE.BoxGeometry(0.36, 0.06, 0.28), strap, 0, 0.92, 0);                       // waist strap
  add(pilot, new THREE.BoxGeometry(0.1, 0.08, 0.04), metal, 0, 1.2, -0.15);                     // the buckle
  add(pilot, new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), suit, 0, 1.47, 0);               // neck
  add(pilot, new THREE.SphereGeometry(0.135, 14, 10), helmet, 0, 1.6, 0);                       // helmet
  add(pilot, new THREE.BoxGeometry(0.2, 0.08, 0.06), visor, 0, 1.6, -0.115);                   // visor
  add(pilot, new THREE.BoxGeometry(0.03, 0.02, 0.24), stripe, 0, 1.735, 0);                    // red stripe over the top
  group.add(pilot);
  // the seat, under the pilot until it falls away
  const seat = new THREE.Group();
  add(seat, new THREE.BoxGeometry(0.7, 0.16, 0.7), strap, 0, 0.55, 0.05);
  add(seat, new THREE.BoxGeometry(0.7, 1.15, 0.16), strap, 0, 1.1, 0.38);
  const burner = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 10, 1, true).translate(0, -0.8, 0), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  burner.rotation.x = Math.PI; // pointing down
  burner.position.set(0, 0.35, 0.05);
  seat.add(burner);
  group.add(seat);
  // the parachute: a shallow dome of alternating red and yellow gores, lines down to the pilot
  const GORES = 14, R = 5.2;
  // one colour per gore, flat (per triangle: the gores' edges stay sharp)
  const domeGeo = new THREE.SphereGeometry(R, GORES * 2, 6, 0, Math.PI * 2, 0, Math.PI / 2.7).toNonIndexed();
  const cols: number[] = [], posA = domeGeo.attributes.position, red = new THREE.Color('#d8322a'), yellow = new THREE.Color('#f7d83c');
  for (let i = 0; i < posA.count; i += 3) {
    const x = (posA.getX(i) + posA.getX(i + 1) + posA.getX(i + 2)) / 3, z = (posA.getZ(i) + posA.getZ(i + 1) + posA.getZ(i + 2)) / 3;
    const a = Math.atan2(z, x) + Math.PI;
    const c = Math.floor((a / (Math.PI * 2)) * GORES) % 2 ? yellow : red;
    for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
  }
  domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  domeGeo.scale(1, 0.75, 1);
  const chute = new THREE.Group();
  // a little see-through (the city shows faintly through the canopy); it keeps its ink outline
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }));
  dome.renderOrder = 4;
  dome.castShadow = true;
  const rimY = R * 0.75 * Math.cos(Math.PI / 2.7), rimR = R * Math.sin(Math.PI / 2.7);
  dome.position.y = 6.2 - rimY;
  // rigging: on each side the lines from half the canopy's rim gather at a confluence link, and one riser goes
  // from there down to the ring on that shoulder
  const lines: number[] = [], LINES = 16;
  for (const sd of [-1, 1]) {
    const cx = sd * 0.34, cy = 2.75;
    lines.push(sd * RING[0], RING[1], RING[2], cx, cy, 0); // the riser
    for (let k = 0; k < LINES; k++) {
      const a = (k / LINES) * Math.PI * 2, x = Math.cos(a) * rimR, z = Math.sin(a) * rimR;
      if ((x >= 0 ? 1 : -1) !== sd) continue;
      lines.push(cx, cy, 0, x, 6.2, z);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  chute.add(dome, new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#4b3428' })));
  chute.visible = false;
  group.add(chute);

  const st = { active: false, t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, seatPos: new THREE.Vector3(), seatVel: new THREE.Vector3(), swing: 0 };
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();

  /** fire the seat out of the jet at `pos`, flying at `vel`, heading `yaw` (as flight.ts) */
  function start(pos: THREE.Vector3, vel: THREE.Vector3, yaw: number): void {
    st.active = true;
    st.t = 0;
    st.pos.copy(pos).add(new THREE.Vector3(0, 2, 0));
    st.vel.copy(vel).multiplyScalar(0.12).add(new THREE.Vector3(0, 48, 0)); // the air stops the seat quickly
    st.yaw = yaw;
    st.seatPos.copy(st.pos);
    group.visible = true;
    seat.visible = true;
    chute.visible = false;
    burner.visible = true;
    camPos.copy(o.camera.position);
  }
  function stop(): void { st.active = false; group.visible = false; }

  /** one step; `steer`: x turns, y pushes on (forward) */
  function update(dt: number, steer: { x: number; y: number }): 'air' | 'landed' {
    if (!st.active) return 'landed';
    dt = Math.min(dt, 0.05);
    st.t += dt;
    const g = o.ground(st.pos.x, st.pos.z), agl = st.pos.y - g;
    const open = st.t > SEAT_T;
    if (!open) {
      st.vel.y -= 9.8 * dt;
      st.vel.multiplyScalar(Math.exp(-dt * 0.6));
      burner.visible = st.t < 0.45;
      st.seatPos.copy(st.pos);
    } else {
      // under the canopy: the fall eases toward a speed that is quick high up and gentle near the ground
      const fall = THREE.MathUtils.clamp(agl / 6, 7, 60);
      st.vel.y += (-fall - st.vel.y) * (1 - Math.exp(-dt * 1.8));
      st.yaw += THREE.MathUtils.clamp(steer.x, -1, 1) * 0.7 * dt;
      const fx = Math.sin(st.yaw), fz = -Math.cos(st.yaw), drift = 4 + 6 * THREE.MathUtils.clamp(steer.y, 0, 1);
      st.vel.x += (fx * drift - st.vel.x) * (1 - Math.exp(-dt * 0.8));
      st.vel.z += (fz * drift - st.vel.z) * (1 - Math.exp(-dt * 0.8));
      // the seat falls away on its own
      if (seat.visible) {
        if (st.t - SEAT_T < dt * 1.5) st.seatVel.copy(st.vel).add(new THREE.Vector3(1.5, 0, 0.5));
        st.seatVel.y -= 9.8 * dt;
        st.seatPos.addScaledVector(st.seatVel, dt);
        if (st.seatPos.y < o.ground(st.seatPos.x, st.seatPos.z)) seat.visible = false;
      }
      chute.visible = true;
      const k = Math.min(1, (st.t - SEAT_T) / OPEN_T), e = 1 - (1 - k) ** 3;
      chute.scale.set(0.15 + 0.85 * e, 0.3 + 0.7 * e, 0.15 + 0.85 * e);
      st.swing += dt;
    }
    st.pos.addScaledVector(st.vel, dt);
    const ground = o.ground(st.pos.x, st.pos.z);
    const landed = open && st.pos.y <= ground + 0.05;
    if (landed) st.pos.y = ground;
    // the figure: turned to the heading, swinging a little under the canopy
    const sway = open ? Math.sin(st.swing * 1.7) * 0.12 * Math.min(1, agl / 20) : 0;
    pilot.position.copy(st.pos);
    pilot.rotation.set(sway, -st.yaw, open ? 0 : Math.sin(st.t * 9) * 0.3, 'YXZ');
    chute.position.copy(st.pos);
    chute.rotation.set(sway, -st.yaw, 0, 'YXZ'); // the same swing as the pilot: the risers stay on the rings
    seat.position.copy(st.seatPos);
    seat.rotation.set(open ? st.t * 2 : 0, -st.yaw, 0, 'YXZ');
    // camera: behind and a little above the pilot, the canopy in the picture
    const fx = Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    const want = new THREE.Vector3(st.pos.x - fx * 26, st.pos.y + (open ? 8 : 4), st.pos.z - fz * 26);
    const cg = o.ground(want.x, want.z) + 3;
    if (want.y < cg) want.y = cg;
    camPos.lerp(want, 1 - Math.exp(-dt * (open ? 2.5 : 5)));
    o.camera.position.copy(camPos);
    look.copy(st.pos).add(new THREE.Vector3(fx * 6, open ? 3 : 1, fz * 6));
    o.camera.lookAt(look);
    return landed ? 'landed' : 'air';
  }

  return {
    group, start, stop, update,
    get active(): boolean { return st.active; },
    get pos(): THREE.Vector3 { return st.pos; },
    get yaw(): number { return st.yaw; },
    /** height above the ground, m */
    get agl(): number { return Math.round(st.pos.y - o.ground(st.pos.x, st.pos.z)); },
    /** the seat's rocket: see-through (for the ink's skipNormal) */
    noInk: [burner] as THREE.Object3D[],
  };
}

export type Eject = ReturnType<typeof createEject>;
