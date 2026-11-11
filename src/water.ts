import * as THREE from 'three';
import type { Terrain } from './terrain.ts';

// The firefighting plane's water: a tank, the falling curtain when it is dropped, the
// splash and steam where it lands, the spray while scooping from a river, and a ring on
// the ground showing where a drop released now would land.
// Every particle follows a closed-form path (gravity + air drag) computed in the vertex
// shader from its start position, start velocity and start time; the same formula on the
// CPU tells where and when the water lands, so nothing is simulated per frame.
// See-through and no ink lines, like the rain (weather.ts).

const K = 0.16, G = 11.5;      // air drag (1/s) and gravity (m/s²) of falling water
const DROP_TIME = 2.6;         // seconds to empty a full tank
const FILL_TIME = 2.4;         // seconds to fill it while skimming water
const BLOB_EVERY = 0.04;       // one water packet per this many seconds while dropping

const VERT = /* glsl */ `
  attribute vec3 aP0, aV0;
  attribute vec4 aT;                   // start time, life, kind (0 falling water, 1 puff of mist), size
  uniform float uTime;
  varying vec2 vC;
  varying float vKind, vProg;
  const float K = ${K.toFixed(3)}, G = ${G.toFixed(3)};
  void main() {
    float age = uTime - aT.x, prog = age / max(aT.y, 1e-3);
    vec2 c = vec2(position.x, position.y * 2.0 - 1.0);
    vec3 wp;
    if (aT.z < 0.5) {
      vec3 vt = vec3(0.0, -G / K, 0.0);          // terminal velocity
      float e = exp(-K * age);
      vec3 p = aP0 + vt * age + (aV0 - vt) * (1.0 - e) / K;
      vec3 dir = normalize(vt + (aV0 - vt) * e);
      vec3 side = normalize(cross(dir, cameraPosition - p));
      float d = length(cameraPosition - p);
      // a streak along the fall that breaks into wider spray on the way down
      float w = max(mix(0.3, 1.7, prog) * aT.w, d * 0.0011);
      float len = max(mix(5.5, 2.6, prog) * aT.w, d * 0.006);
      wp = p + side * c.x * w + dir * c.y * len * 0.5;
    } else {
      vec3 p = aP0 + aV0 * (1.0 - exp(-1.6 * age)) / 1.6;
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      wp = p + (right * c.x + up * c.y) * aT.w * (0.45 + 1.7 * sqrt(max(prog, 0.0)));
    }
    vC = c;
    vKind = aT.z;
    vProg = prog;
    gl_Position = age >= 0.0 && prog < 1.0 ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uDrop, uMist;
  uniform float uDim;
  varying vec2 vC;
  varying float vKind, vProg;
  layout(location = 1) out highp vec4 gInk; // normal attachment of the single colour pass (post.ts)
  void main() {
    gInk = vec4(0.0); // blended away: no ink lines
    float a;
    vec3 col;
    if (vKind < 0.5) {
      a = (1.0 - abs(vC.x)) * (1.0 - vC.y * vC.y) * mix(0.9, 0.4, vProg);
      col = mix(uDrop, uMist, 1.0 - abs(vC.x));
    } else {
      a = (1.0 - smoothstep(0.55, 1.0, length(vC))) * pow(1.0 - vProg, 1.3) * 0.62;
      col = uMist;
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * uDim, a);
    #include <colorspace_fragment>
  }`;

/** Something the water can put out: a disc of radius r whose top is at height y. */
export interface WaterTarget { id: number; x: number; y: number; z: number; r: number }

interface Landing { t: number; x: number; y: number; z: number; id: number }

export function createWater(terrain: Terrain, light = false) {
  const CAP = light ? 1400 : 2600, PER_BLOB = light ? 4 : 8;
  const p0 = new Float32Array(CAP * 3), v0 = new Float32Array(CAP * 3), tt = new Float32Array(CAP * 4);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const attrs = [new THREE.InstancedBufferAttribute(p0, 3), new THREE.InstancedBufferAttribute(v0, 3), new THREE.InstancedBufferAttribute(tt, 4)];
  for (const a of attrs) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aP0', attrs[0]);
  geo.setAttribute('aV0', attrs[1]);
  geo.setAttribute('aT', attrs[2]);
  geo.instanceCount = CAP;
  const uniforms = {
    uTime: { value: 0 },
    uDim: { value: 1 },
    uDrop: { value: new THREE.Color('#a9d6f2') },
    uMist: { value: new THREE.Color('#ffffff') },
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;

  // where a drop released now would land: a ring on the ground (drawn over everything, like a HUD mark)
  const markMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthTest: false, depthWrite: false });
  const marker = new THREE.Mesh(new THREE.RingGeometry(10.5, 12.5, 40).rotateX(-Math.PI / 2), markMat);
  marker.renderOrder = 8;
  marker.visible = false;
  const group = new THREE.Group();
  group.add(mesh, marker);

  let time = 0, tank = 1, acc = 0, sprayAcc = 0;
  let cursor = 0, dirtyFrom = -1, dirtyN = 0, full = false;
  const blobs: Landing[] = [];
  const q = new THREE.Vector3(), a0 = new THREE.Vector3(), b0 = new THREE.Vector3();
  const aim: Landing = { t: 0, x: 0, y: 0, z: 0, id: -1 };
  const rnd = Math.random;

  function emit(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, delay = 0): void {
    const i = cursor;
    cursor = (cursor + 1) % CAP;
    p0[i * 3] = x; p0[i * 3 + 1] = y; p0[i * 3 + 2] = z;
    v0[i * 3] = vx; v0[i * 3 + 1] = vy; v0[i * 3 + 2] = vz;
    tt[i * 4] = time + delay; tt[i * 4 + 1] = life; tt[i * 4 + 2] = kind; tt[i * 4 + 3] = size;
    if (dirtyFrom < 0) dirtyFrom = i;
    dirtyN++;
  }
  /** send the particles written this frame to the GPU (only that part of the buffers) */
  function flush(): void {
    if (dirtyFrom < 0 && !full) return;
    const whole = full || dirtyFrom + dirtyN > CAP;
    for (const a of attrs) {
      if (whole) a.clearUpdateRanges();
      else a.addUpdateRange(dirtyFrom * a.itemSize, dirtyN * a.itemSize);
      a.needsUpdate = true;
    }
    dirtyFrom = -1;
    dirtyN = 0;
    full = false;
  }

  /** position `age` seconds after leaving p with velocity v */
  function path(p: THREE.Vector3, v: THREE.Vector3, age: number, out: THREE.Vector3): THREE.Vector3 {
    const e = (1 - Math.exp(-K * age)) / K, vt = -G / K;
    return out.set(p.x + v.x * e, p.y + vt * age + (v.y - vt) * e, p.z + v.z * e);
  }
  /** where and when water released at p with velocity v lands: on a target or on the ground */
  function land(p: THREE.Vector3, v: THREE.Vector3, targets: WaterTarget[], out: Landing): Landing {
    const STEP = 0.07;
    for (let k = 1; k <= 120; k++) {
      path(p, v, k * STEP, q);
      for (const tg of targets) {
        if (q.y <= tg.y + 1.5 && q.y > tg.y - 14 && (q.x - tg.x) ** 2 + (q.z - tg.z) ** 2 < tg.r * tg.r) {
          out.t = k * STEP; out.x = q.x; out.y = q.y; out.z = q.z; out.id = tg.id;
          return out;
        }
      }
      const g = terrain.at(q.x, q.z);
      if (q.y <= g) { out.t = k * STEP; out.x = q.x; out.y = g; out.z = q.z; out.id = -1; return out; }
    }
    out.t = 120 * STEP; out.x = q.x; out.y = q.y; out.z = q.z; out.id = -1;
    return out;
  }

  /** white puffs: spray, splash or steam */
  function puffs(n: number, x: number, y: number, z: number, spread: number, rise: number, life: number, size: number, wind = 0): void {
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.2832, s = spread * (0.3 + rnd() * 0.7);
      emit(1, x + Math.cos(a) * s * 0.3, y + rnd() * 1.5, z + Math.sin(a) * s * 0.3,
        Math.cos(a) * s + wind, rise * (0.6 + rnd() * 0.8), Math.sin(a) * s, life * (0.7 + rnd() * 0.6), size * (0.7 + rnd() * 0.6), rnd() * 0.15);
    }
  }

  /**
   * One frame. `pos`/`vel` are the plane's; while `dropping` the tank empties into a
   * curtain of water. `onHit(id)` is called for every packet that lands on a target.
   */
  function update(dt: number, pos: THREE.Vector3, vel: THREE.Vector3, dropping: boolean, targets: WaterTarget[], onHit: (id: number) => void): void {
    time += dt;
    uniforms.uTime.value = time;
    a0.copy(pos); a0.y -= 2.4;                    // the hopper doors under the belly
    b0.copy(vel).multiplyScalar(0.94); b0.y -= 5;
    if (dropping && tank > 0) {
      acc += dt;
      while (acc >= BLOB_EVERY && tank > 0) {
        acc -= BLOB_EVERY;
        tank = Math.max(0, tank - BLOB_EVERY / DROP_TIME);
        const hit = land(a0, b0, targets, { t: 0, x: 0, y: 0, z: 0, id: -1 });
        hit.t += time;
        blobs.push(hit);
        for (let i = 0; i < PER_BLOB; i++) {
          emit(0, a0.x + (rnd() - 0.5) * 1.6, a0.y, a0.z + (rnd() - 0.5) * 1.6,
            b0.x + (rnd() - 0.5) * 7, b0.y + (rnd() - 0.5) * 5, b0.z + (rnd() - 0.5) * 7,
            (hit.t - time) * (0.94 + rnd() * 0.1), 0.8 + rnd() * 0.6, rnd() * BLOB_EVERY);
        }
      }
    } else acc = 0;
    // packets reaching the ground or a fire
    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i];
      if (b.t > time) continue;
      blobs.splice(i, 1);
      puffs(2, b.x, b.y, b.z, 6, 4, 0.9, 2.4);
      if (b.id >= 0) { puffs(2, b.x, b.y, b.z, 3, 12, 2.4, 4.6, 3); onHit(b.id); }
    }
    // the ring where water released now would land: shown near a fire and while dropping
    land(a0, b0, targets, aim);
    marker.visible = tank > 0 && (dropping || targets.some((tg) => (tg.x - pos.x) ** 2 + (tg.z - pos.z) ** 2 < 650 * 650));
    if (marker.visible) {
      marker.position.set(aim.x, aim.y + 1, aim.z);
      markMat.color.set(aim.id >= 0 ? '#f7d83c' : '#ffffff');
      marker.scale.setScalar(aim.id >= 0 ? 1.15 + Math.sin(time * 9) * 0.1 : 1);
    }
    flush();
  }

  /** skimming over water: the tank fills and the floats throw up spray */
  function scoop(dt: number, pos: THREE.Vector3, vel: THREE.Vector3): void {
    tank = Math.min(1, tank + dt / FILL_TIME);
    sprayAcc += dt;
    const y = terrain.at(pos.x, pos.z) + 0.6, s = Math.hypot(vel.x, vel.z) || 1;
    while (sprayAcc >= 0.03) {
      sprayAcc -= 0.03;
      for (const side of [-1, 1]) {
        // behind each float, thrown outward and up
        const x = pos.x - (vel.z / s) * side * 2.7, z = pos.z + (vel.x / s) * side * 2.7;
        emit(1, x, y, z, vel.x * 0.25 - (vel.z / s) * side * 5, 6 + rnd() * 5, vel.z * 0.25 + (vel.x / s) * side * 5, 0.9 + rnd() * 0.5, 1.5 + rnd() * 0.9);
      }
    }
  }

  return {
    group, update, scoop,
    /** a burst of steam over a disc of radius r (a fire going out) */
    steam(x: number, y: number, z: number, r: number): void {
      for (let i = 0; i < (light ? 14 : 26); i++) {
        const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * r;
        puffs(1, x + Math.cos(a) * d, y, z + Math.sin(a) * d, 3, 13, 3.4, 4 + r * 0.22, 4);
      }
      flush();
    },
    /** a full tank, nothing in the air */
    reset(): void {
      tank = 1;
      acc = sprayAcc = 0;
      blobs.length = 0;
      tt.fill(0);
      full = true;
      flush();
      marker.visible = false;
    },
    /** dimmer at night */
    setNight(f: number): void { uniforms.uDim.value = 1 - 0.78 * f; },
    /** 0…1 */
    get tank(): number { return tank; },
    /** height of the place where water released now would land */
    get aimY(): number { return aim.y; },
    /** water is in the air (released and not landed yet) */
    get falling(): boolean { return blobs.length > 0; },
  };
}

export type Water = ReturnType<typeof createWater>;
