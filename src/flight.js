import * as THREE from 'three';

// Simple arcade flight: always moving forward, steer left/right, climb/dive, boost.
// Third-person chase camera. Stays inside the map and above the ground.

const SPEED = 55, BOOST = 140; // m/s
const TURN = 0.75; // rad/s at full input
const MIN_AGL = 38, MAX_ALT = 1500;

// ---------------------------------------------------------------- livery
const FLAG_RED = '#d8322a', FLAG_YELLOW = '#f7d83c';
// Macedonian sun: disc with a thin red ring and eight rays broadening outward
function drawSun(ctx, cx, cy, disc, reach) {
  ctx.fillStyle = FLAG_YELLOW;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, h = 0.16;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - h) * reach, cy + Math.sin(a - h) * reach);
    ctx.lineTo(cx + Math.cos(a + h) * reach, cy + Math.sin(a + h) * reach);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = FLAG_RED;
  ctx.beginPath(); ctx.arc(cx, cy, disc * 1.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FLAG_YELLOW;
  ctx.beginPath(); ctx.arc(cx, cy, disc, 0, Math.PI * 2); ctx.fill();
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = FLAG_RED;
  ctx.fillRect(0, 0, w, h);
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const flagTex = () => canvasTex(512, 256, (ctx, w, h) => drawSun(ctx, w / 2, h / 2, h * 0.143, w));
const roundelTex = () => canvasTex(256, 256, (ctx, w, h) => {
  drawSun(ctx, w / 2, h / 2, w * 0.16, w * 0.5);
  ctx.strokeStyle = FLAG_YELLOW; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 5, 0, Math.PI * 2); ctx.stroke();
});

// ---------------------------------------------------------------- model
// High-wing light aircraft (Cessna-style), metres, nose toward -z.
function airfoil(chord, thick) {
  const s = new THREE.Shape();
  const pts = [[0, 0], [0.05, 0.6], [0.2, 0.95], [0.45, 0.9], [0.8, 0.4], [1, 0.05], [1, -0.05], [0.6, -0.2], [0.2, -0.25], [0.05, -0.2]];
  pts.forEach(([u, v], i) => (i ? s.lineTo : s.moveTo).call(s, u * chord, v * thick));
  s.closePath();
  return s;
}
// extrude a profile drawn in the (z, y) side plane across x
function sideExtrude(shape, width, x0 = -width / 2) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); // shape x → world z, extrusion → world -x
  g.translate(x0 + width, 0, 0);
  return g;
}
function between(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

function buildPlane() {
  const g = new THREE.Group();
  const M = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const red = M(FLAG_RED), yellow = M(FLAG_YELLOW), glass = M('#2c4561'), dark = M('#2f2622'), steel = M('#c9c4c0');
  const add = (mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };

  // fuselage: lathe profile (radius, distance from nose), oval section
  const prof = [[0.001, 0], [0.46, 0.12], [0.6, 0.5], [0.66, 1.1], [0.68, 1.7], [0.69, 2.4], [0.66, 3.4], [0.53, 4.6], [0.37, 6.0], [0.25, 7.3], [0.16, 7.95], [0.001, 8.05]];
  const lathe = (pts, mat) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, t]) => new THREE.Vector2(r, t)), 18);
    geo.rotateX(Math.PI / 2);
    geo.scale(0.92, 1.15, 1);
    geo.translate(0, 0, -3);
    return add(new THREE.Mesh(geo, mat));
  };
  lathe(prof, red);
  lathe(prof.slice(0, 5).map(([r, t]) => [r * 1.015 + 0.004, t]), yellow); // cowling
  // yellow tail cone
  lathe(prof.slice(-4).map(([r, t]) => [r * 1.02 + 0.004, t]), yellow);

  // cabin greenhouse: windscreen + side windows
  const cab = new THREE.Shape();
  [[-1.25, 0.42], [-0.72, 0.98], [1.05, 0.98], [1.45, 0.42]].forEach(([z, y], i) => (i ? cab.lineTo(z, y) : cab.moveTo(z, y)));
  add(new THREE.Mesh(sideExtrude(cab, 1.3), glass));
  const roof = new THREE.Shape();
  [[-0.72, 0.97], [1.05, 0.97], [1.05, 1.03], [-0.72, 1.03]].forEach(([z, y], i) => (i ? roof.lineTo(z, y) : roof.moveTo(z, y)));
  add(new THREE.Mesh(sideExtrude(roof, 1.32), red));

  // high wing in two halves with dihedral, yellow tips and sun roundels
  const half = 5.6, dih = THREE.MathUtils.degToRad(2.2);
  const roundel = new THREE.MeshLambertMaterial({ map: roundelTex() });
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    const wingShape = airfoil(1.6, 0.17);
    const wing = new THREE.Mesh(sideExtrude(wingShape, half - 0.45, 0), red);
    wing.position.x = side > 0 ? 0 : -(half - 0.45);
    const tip = new THREE.Mesh(sideExtrude(wingShape, 0.45, 0), yellow);
    tip.position.x = side > 0 ? half - 0.45 : -half;
    for (const m of [wing, tip]) { m.position.z = -0.95; m.castShadow = true; w.add(m); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), roundel);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(side * 3.7, 0.168, -0.45);
    w.add(disc);
    w.position.y = 1.02;
    w.rotation.z = side * dih;
    g.add(w);
    // strut from lower fuselage to the wing
    add(between([side * 0.55, -0.45, -0.35], [side * 2.75, 1.0 + 2.75 * Math.tan(dih), -0.4], 0.045, steel));
  }

  // tail: stabiliser + swept fin with the flag
  const stab = new THREE.Mesh(sideExtrude(airfoil(1.05, 0.1), 3.8), red);
  stab.position.set(0, 0.12, 4.0);
  add(stab);
  const fin = new THREE.Shape();
  [[3.85, 0.3], [5.05, 0.22], [5.15, 1.85], [4.6, 1.9]].forEach(([z, y], i) => (i ? fin.lineTo(z, y) : fin.moveTo(z, y)));
  add(new THREE.Mesh(sideExtrude(fin, 0.12), red));
  const flag = new THREE.MeshLambertMaterial({ map: flagTex() });
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.39), flag);
    f.position.set(side * 0.066, 1.12, 4.78);
    f.rotation.y = side * Math.PI / 2;
    g.add(f);
  }

  // fixed tricycle gear with wheel fairings
  for (const [x, z] of [[-1.25, 0.15], [1.25, 0.15], [0, -2.35]]) {
    add(between([x * 0.35, -0.62, z], [x, -1.22, z], 0.05, steel));
    const pant = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), red);
    pant.scale.set(0.2, 0.27, 0.55);
    pant.position.set(x, -1.3, z);
    add(pant);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 14), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -1.42, z);
    add(wheel);
  }

  // spinner + two-blade propeller
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 16), yellow);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -3.25;
  add(spinner);
  const prop = new THREE.Group();
  prop.position.z = -3.12;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.85, 0.04), dark);
  for (const s of [-1, 1]) {
    const b = blade.clone();
    b.position.y = s * 0.95;
    b.rotation.y = s * 0.25;
    prop.add(b);
  }
  g.add(prop);
  g.userData.prop = prop;

  g.scale.setScalar(1.75);
  return g;
}

export function createFlight({ scene, camera, terrain, bounds }) {
  const plane = buildPlane();
  plane.visible = false;
  scene.add(plane);

  let invertY = false;
  const st = { active: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, speed: SPEED, warn: '' };
  const input = { left: 0, right: 0, up: 0, down: 0, boost: false };
  const pad = { turn: 0, climb: 0, boost: false }; // analog gamepad input, set each frame
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  const keymap = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'boost',
  };
  const onKey = (down) => (e) => {
    if (!st.active) return;
    const k = keymap[e.code];
    if (!k) return;
    e.preventDefault();
    if (k === 'boost') input.boost = down;
    else input[k] = down ? 1 : 0;
  };
  addEventListener('keydown', onKey(true));
  addEventListener('keyup', onKey(false));
  addEventListener('blur', () => Object.assign(input, { left: 0, right: 0, up: 0, down: 0, boost: false }));

  function start(target, yaw) {
    st.active = true;
    st.yaw = yaw;
    st.pitch = 0;
    st.bank = 0;
    st.speed = SPEED;
    st.pos.set(target.x, Math.max(target.y, terrain.at(target.x, target.z)) + 230, target.z);
    plane.visible = true;
    forward(fwd);
    camPos.copy(st.pos).addScaledVector(fwd, -70).add(new THREE.Vector3(0, 22, 0));
    camera.position.copy(camPos);
    update(0);
  }
  function stop() {
    st.active = false;
    plane.visible = false;
    Object.assign(input, { left: 0, right: 0, up: 0, down: 0, boost: false });
  }

  function forward(v) {
    const cp = Math.cos(st.pitch);
    return v.set(Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
  }

  function update(dt) {
    if (!st.active) return;
    dt = Math.min(dt, 0.05);
    let turn = THREE.MathUtils.clamp(input.right - input.left + pad.turn, -1, 1);
    let climb = THREE.MathUtils.clamp(input.up - input.down + pad.climb, -1, 1) * (invertY ? -1 : 1);
    const boosting = input.boost || pad.boost;
    st.warn = '';

    // keep inside the map: steer back toward the centre near the edges
    const { hw, hh } = bounds;
    const m = 450;
    if (Math.abs(st.pos.x) > hw - m || Math.abs(st.pos.z) > hh - m) {
      const want = Math.atan2(-st.pos.x, st.pos.z);
      let diff = want - st.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      turn = THREE.MathUtils.clamp(diff * 2, -1, 1);
      st.warn = 'Крај на мапата — се враќаме назад';
    }

    // ground / ceiling
    const ground = terrain.at(st.pos.x, st.pos.z);
    const agl = st.pos.y - ground;
    if (agl < MIN_AGL + 25) { climb = Math.max(climb, (MIN_AGL + 25 - agl) / 25); if (agl < MIN_AGL + 5) st.warn = 'Премногу ниско!'; }
    if (st.pos.y > MAX_ALT) climb = Math.min(climb, -0.5);

    st.speed += ((boosting ? BOOST : SPEED) - st.speed) * (1 - Math.exp(-dt * 1.6));
    st.yaw += turn * TURN * dt * (0.8 + 0.2 * (SPEED / st.speed));
    st.bank += (-turn * 0.65 - st.bank) * (1 - Math.exp(-dt * 3));
    st.pitch += (climb * 0.32 - st.pitch) * (1 - Math.exp(-dt * 2.2));

    forward(fwd);
    st.pos.addScaledVector(fwd, st.speed * dt);
    st.pos.x = THREE.MathUtils.clamp(st.pos.x, -hw + 60, hw - 60);
    st.pos.z = THREE.MathUtils.clamp(st.pos.z, -hh + 60, hh - 60);
    st.pos.y = Math.max(st.pos.y, ground + MIN_AGL);

    plane.position.copy(st.pos);
    plane.rotation.set(st.pitch, -st.yaw, st.bank, 'YXZ');
    plane.userData.prop.rotation.z += dt * (boosting ? 60 : 35);

    // chase camera: behind and above, looking a little ahead
    const back = 62 + (st.speed - SPEED) * 0.12;
    const flat = new THREE.Vector3(Math.sin(st.yaw), 0, -Math.cos(st.yaw));
    const want = st.pos.clone().addScaledVector(flat, -back).add(new THREE.Vector3(0, 20 - st.pitch * 30, 0));
    const camGround = terrain.at(want.x, want.z) + 12;
    if (want.y < camGround) want.y = camGround;
    camPos.lerp(want, dt === 0 ? 1 : 1 - Math.exp(-dt * 3.5));
    camera.position.copy(camPos);
    look.copy(st.pos).addScaledVector(fwd, 30);
    camera.lookAt(look);
  }

  return {
    plane, start, stop, update, input, pad,
    setInvertY(v) { invertY = !!v; },
    get active() { return st.active; },
    get yaw() { return st.yaw; },
    get pos() { return st.pos; },
    get hud() {
      return { kmh: Math.round(st.speed * 3.6), alt: Math.round(st.pos.y - terrain.at(st.pos.x, st.pos.z)), warn: st.warn, boost: input.boost || pad.boost };
    },
  };
}
