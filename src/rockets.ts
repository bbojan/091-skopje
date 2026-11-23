// The F-15's rockets: a pair from under the wings while the trigger is held (Space, the pad's X, 🚀 on phones),
// each with a smoke trail and an exhaust glow, bursting where it hits the ground: a flash, a fireball, sparks
// thrown up and a smoke cloud that drifts with the west wind. Effects only: nothing is damaged.
// The puffs are drawn as flat tones with a crisp edge like the fire's smoke (fire.ts); everything see-through
// sits in `noInk` (the ink's skipNormal) and writes gInk = 0, so it draws no ink lines.
import * as THREE from 'three';

const INK = /* glsl */ `layout(location = 1) out highp vec4 gInk; // normal attachment of the single colour pass (post.ts)`;

const RATE = 0.32;      // seconds between pairs while held
const MAX_ROCKETS = 10; // in the air at once
const ADD_SPEED = 420;  // m/s on top of the plane's
const LIFE = 7;         // seconds before a rocket that hit nothing is gone
const TRAIL_STEP = 16;  // metres between trail puffs
const N_PUFF = 1600, N_GLOW = 240;

/** billboards: position, size, colour + alpha, seed per instance */
function billboards(n: number, frag: string, blending: THREE.Blending) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); // xyz, size
  const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); // rgb, alpha
  pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', pos);
  geo.setAttribute('iCol', col);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 iPos, iCol;
      varying vec2 vC;
      varying vec4 vCol;
      varying float vSeed;
      void main() {
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vC = position.xy;
        vCol = iCol;
        vSeed = fract(iPos.x * 0.137 + iPos.z * 0.071);
        gl_Position = projectionMatrix * viewMatrix * vec4(iPos.xyz + (right * position.x + up * position.y) * iPos.w, 1.0);
      }`,
    fragmentShader: frag,
    transparent: true, depthWrite: false, blending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, pos, col, geo };
}

// a bumpy round puff with a crisp, drawn edge, lit from the upper left (the sun is in the west)
const PUFF_FRAG = /* glsl */ `
  varying vec2 vC;
  varying vec4 vCol;
  varying float vSeed;
  ${INK}
  void main() {
    gInk = vec4(0.0);
    float ang = atan(vC.y, vC.x);
    float r = length(vC) + 0.07 * sin(ang * 5.0 + vSeed * 40.0) + 0.04 * sin(ang * 9.0 - vSeed * 26.0);
    float a = (1.0 - smoothstep(0.78, 0.9, r)) * vCol.a;
    if (a < 0.02) discard;
    float lit = step(0.0, dot(vC, vec2(-0.6, 0.8)) + 0.15);
    gl_FragColor = vec4(vCol.rgb * mix(0.82, 1.06, lit), a);
    #include <colorspace_fragment>
  }`;
// a soft glow, added to the colour (flash, exhaust)
const GLOW_FRAG = /* glsl */ `
  varying vec2 vC;
  varying vec4 vCol;
  ${INK}
  void main() {
    gInk = vec4(0.0);
    float r = length(vC);
    float a = pow(max(1.0 - r, 0.0), 1.6) * vCol.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
    #include <colorspace_fragment>
  }`;

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; s0: number; s1: number;
  /** colour over life: from → to; `fall` sparks feel gravity, `rise` smoke floats up and drifts */
  c0: THREE.Color; c1: THREE.Color; a: number; fall: number; rise: number;
}
interface Rocket { p: THREE.Vector3; v: THREE.Vector3; age: number; trail: number }

const C = (s: string) => new THREE.Color(s);
const SMOKE_W = C('#efe9df'), SMOKE_G = C('#b9b2aa'), SMOKE_D = C('#6f6a66'), SOOT = C('#4b4440');
const FIRE_Y = C('#fff1b0'), FIRE_O = C('#ffa53a'), FIRE_R = C('#d8462a');
const GLOW_O = C('#ffb45a'), GLOW_W = C('#fff4d8');

export function createRockets(o: { ground: (x: number, z: number) => number; light?: boolean }) {
  const group = new THREE.Group();
  const puffs = billboards(N_PUFF, PUFF_FRAG, THREE.NormalBlending);
  const glows = billboards(N_GLOW, GLOW_FRAG, THREE.AdditiveBlending);
  puffs.mesh.renderOrder = 5;
  glows.mesh.renderOrder = 6;
  group.add(puffs.mesh, glows.mesh);

  // rocket bodies: white with a red nose and dark fins, 3 m long, nose toward -z
  const body = new THREE.CylinderGeometry(0.16, 0.16, 2.4, 8).rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.16, 0.6, 8).rotateX(-Math.PI / 2).translate(0, 0, -1.5);
  const bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: '#f1ece4' }), MAX_ROCKETS);
  const noses = new THREE.InstancedMesh(nose, new THREE.MeshLambertMaterial({ color: '#d8322a' }), MAX_ROCKETS);
  for (const m of [bodies, noses]) { m.count = 0; m.frustumCulled = false; group.add(m); }

  const parts: Particle[] = [];
  const glowParts: Particle[] = [];
  const rockets: Rocket[] = [];
  let cool = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Z = new THREE.Vector3(0, 0, -1), d = new THREE.Vector3();
  const rnd = Math.random;
  /** what happened this frame, for the sound */
  const events = { launched: 0, booms: [] as THREE.Vector3[] };
  const maxPuff = o.light ? N_PUFF / 2 : N_PUFF;

  function emit(list: Particle[], cap: number, p: Partial<Particle> & { x: number; y: number; z: number; life: number; s0: number; s1: number; c0: THREE.Color }): void {
    if (list.length >= cap) list.splice(0, list.length - cap + 1); // the oldest makes room
    list.push({ vx: 0, vy: 0, vz: 0, age: 0, c1: p.c0, a: 1, fall: 0, rise: 0, ...p });
  }

  /** one pair, from under the wings; `fwd` the plane's direction, `right` its right wing */
  function launch(pos: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3, speed: number): void {
    for (const s of [-1, 1]) {
      if (rockets.length >= MAX_ROCKETS) rockets.shift();
      const p = pos.clone().addScaledVector(right, s * 4.2).add(new THREE.Vector3(0, -1.2, 0)).addScaledVector(fwd, -1);
      rockets.push({ p, v: fwd.clone().multiplyScalar(speed + ADD_SPEED * (0.97 + 0.06 * rnd())), age: 0, trail: 0 });
      // a puff of smoke where it leaves the rail
      emit(parts, maxPuff, { x: p.x, y: p.y, z: p.z, life: 0.9, s0: 2, s1: 7, c0: SMOKE_W, c1: SMOKE_G, a: 0.8 });
    }
    events.launched++;
  }

  function explode(x: number, y: number, z: number): void {
    events.booms.push(new THREE.Vector3(x, y, z));
    const k = o.light ? 0.5 : 1;
    // the flash and a lingering glow
    emit(glowParts, N_GLOW, { x, y: y + 6, z, life: 0.35, s0: 20, s1: 70, c0: GLOW_W, c1: GLOW_O, a: 1 });
    emit(glowParts, N_GLOW, { x, y: y + 8, z, life: 0.6, s0: 26, s1: 34, c0: GLOW_O, c1: FIRE_R, a: 0.4 });
    // the fireball: hot puffs thrown out and up, burning down to soot
    for (let i = 0; i < 18 * k; i++) {
      const a = rnd() * Math.PI * 2, up = 0.3 + rnd() * 0.9, sp = 18 + rnd() * 30;
      emit(parts, maxPuff, { x, y: y + 2, z, vx: Math.cos(a) * sp * (1 - up * 0.5), vy: sp * up, vz: Math.sin(a) * sp * (1 - up * 0.5), life: 0.6 + rnd() * 0.5, s0: 4 + rnd() * 3, s1: 9 + rnd() * 5, c0: rnd() < 0.4 ? FIRE_Y : FIRE_O, c1: FIRE_R, a: 1, rise: 0.6 });
    }
    // sparks and clods thrown high, falling back
    for (let i = 0; i < 16 * k; i++) {
      const a = rnd() * Math.PI * 2, sp = 25 + rnd() * 45;
      emit(parts, maxPuff, { x, y: y + 2, z, vx: Math.cos(a) * sp * 0.5, vy: 40 + rnd() * 50, vz: Math.sin(a) * sp * 0.5, life: 1.4 + rnd() * 0.8, s0: 1.4, s1: 0.8, c0: FIRE_O, c1: SOOT, a: 1, fall: 1 });
    }
    // the smoke cloud: dark at first, rising and paling, drifting east
    for (let i = 0; i < 16 * k; i++) {
      const a = rnd() * Math.PI * 2, r = 5 + rnd() * 16;
      emit(parts, maxPuff, { x: x + Math.cos(a) * r, y: y + 3 + rnd() * 16, z: z + Math.sin(a) * r, vx: Math.cos(a) * 4, vy: 7 + rnd() * 9, vz: Math.sin(a) * 4, life: 4 + rnd() * 3, s0: 5 + rnd() * 4, s1: 15 + rnd() * 10, c0: SMOKE_D, c1: SMOKE_G, a: 1, rise: 1 });
    }
  }

  function update(dt: number, fire: boolean, plane: { pos: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3; speed: number } | null): void {
    events.launched = 0;
    events.booms.length = 0;
    cool -= dt;
    if (fire && plane && cool <= 0) { launch(plane.pos, plane.fwd, plane.right, plane.speed); cool = RATE; }
    // rockets: straight on, a little drop, a trail of puffs every few metres
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.age += dt;
      r.v.y -= 4.9 * dt;
      const step = r.v.length() * dt;
      d.copy(r.v).normalize();
      for (r.trail += step; r.trail > TRAIL_STEP; r.trail -= TRAIL_STEP) {
        const back = r.trail - TRAIL_STEP;
        emit(parts, maxPuff, { x: r.p.x - d.x * back + (rnd() - 0.5), y: r.p.y - d.y * back, z: r.p.z - d.z * back + (rnd() - 0.5), life: 1.1 + rnd() * 0.5, s0: 1.6, s1: 6 + rnd() * 3, c0: SMOKE_W, c1: SMOKE_G, a: 0.75, rise: 0.3 });
      }
      r.p.addScaledVector(r.v, dt);
      const g = o.ground(r.p.x, r.p.z);
      if (r.p.y <= g) { explode(r.p.x, g, r.p.z); rockets.splice(i, 1); continue; }
      if (r.age > LIFE) { rockets.splice(i, 1); continue; }
      emit(glowParts, N_GLOW, { x: r.p.x - d.x * 2, y: r.p.y - d.y * 2, z: r.p.z - d.z * 2, life: 0.05, s0: 3.2, s1: 2.6, c0: GLOW_W, c1: GLOW_O, a: 1 });
    }
    // bodies
    rockets.forEach((r, i) => {
      q.setFromUnitVectors(Z, d.copy(r.v).normalize());
      m4.compose(r.p, q, one);
      bodies.setMatrixAt(i, m4);
      noses.setMatrixAt(i, m4);
    });
    bodies.count = noses.count = rockets.length;
    bodies.instanceMatrix.needsUpdate = noses.instanceMatrix.needsUpdate = true;
    step(parts, puffs, dt);
    step(glowParts, glows, dt);
  }

  const col = new THREE.Color();
  function step(list: Particle[], b: ReturnType<typeof billboards>, dt: number): void {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = Math.exp(-dt * (p.fall ? 0.6 : 2.2));
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag - 30 * p.fall * dt;
      p.x += (p.vx + 4 * p.rise) * dt; p.y += (p.vy + 2 * p.rise) * dt; p.z += p.vz * dt;
      list[n++] = p;
    }
    list.length = n;
    const pos = b.pos.array as Float32Array, cc = b.col.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const p = list[i], t = p.age / p.life;
      const size = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      // a billboard standing on the ground would be cut by it: puffs sit on top of the blast, not in it
      pos[i * 4] = p.x; pos[i * 4 + 1] = p.y + (p.fall ? 0 : size * 0.7 * p.rise); pos[i * 4 + 2] = p.z;
      pos[i * 4 + 3] = size;
      col.copy(p.c0).lerp(p.c1, Math.min(1, t * 1.6));
      cc[i * 4] = col.r; cc[i * 4 + 1] = col.g; cc[i * 4 + 2] = col.b;
      cc[i * 4 + 3] = p.a * (1 - THREE.MathUtils.smoothstep(t, 0.55, 1));
    }
    b.geo.instanceCount = n;
    if (n) { b.pos.needsUpdate = b.col.needsUpdate = true; b.pos.addUpdateRange(0, n * 4); b.col.addUpdateRange(0, n * 4); }
  }

  function clear(): void {
    rockets.length = parts.length = glowParts.length = 0;
    bodies.count = noses.count = 0;
    puffs.geo.instanceCount = glows.geo.instanceCount = 0;
    cool = 0;
  }

  return { group, noInk: [puffs.mesh, glows.mesh], update, clear, events, get busy(): boolean { return rockets.length + parts.length + glowParts.length > 0; } };
}

export type Rockets = ReturnType<typeof createRockets>;
