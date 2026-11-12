import * as THREE from 'three';
import type { Terrain } from './terrain.ts';
import type { Bounds, Vec3 } from './types.ts';

// Simple arcade flight: always moving forward, steer left/right, climb/dive, boost.
// Third-person chase camera. Stays inside the map and above the ground.

const SPEED = 55, BOOST = 140; // m/s
const TURN = 0.75; // rad/s at full input
const MIN_AGL = 38, MAX_ALT = 1500;
const ROLL_TIME = 1.1, LOOP_RATE = 1.7; // stunts: seconds for one roll, rad/s around a loop (3.7 s; 32 m radius at cruise)
const AIM_UP = 90, AIM_BACK = 88; // how much higher and further back the chase camera goes to show where the water lands
const SWING = 0.62;     // how far the camera swings to the side to read the banner, rad

/** HUD warning, shown through i18n key `warn.<name>`. */
export type FlightWarning = '' | 'edge' | 'low';

// ---------------------------------------------------------------- livery
const FLAG_RED = '#d8322a', FLAG_YELLOW = '#f7d83c';
// Macedonian sun: disc with a thin red ring and eight rays broadening outward
function drawSun(ctx: CanvasRenderingContext2D, cx: number, cy: number, disc: number, reach: number): void {
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
function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
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
function airfoil(chord: number, thick: number): THREE.Shape {
  const s = new THREE.Shape();
  const pts = [[0, 0], [0.05, 0.6], [0.2, 0.95], [0.45, 0.9], [0.8, 0.4], [1, 0.05], [1, -0.05], [0.6, -0.2], [0.2, -0.25], [0.05, -0.2]];
  pts.forEach(([u, v], i) => (i ? s.lineTo(u * chord, v * thick) : s.moveTo(u * chord, v * thick)));
  s.closePath();
  return s;
}
// a closed outline through points given in the (z, y) side plane
function outline(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  return s;
}
// extrude a profile drawn in the (z, y) side plane across x
function sideExtrude(shape: THREE.Shape, width: number, x0 = -width / 2): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); // shape x → world z, extrusion → world -x
  g.translate(x0 + width, 0, 0);
  return g;
}
function between(a: Vec3, b: Vec3, r: number, mat: THREE.Material): THREE.Mesh {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

function buildPlane(): { group: THREE.Group; prop: THREE.Group } {
  const g = new THREE.Group();
  const M = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const red = M(FLAG_RED), yellow = M(FLAG_YELLOW), glass = M('#2c4561'), dark = M('#2f2622'), steel = M('#c9c4c0');
  const add = (mesh: THREE.Mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };

  // fuselage: lathe profile (radius, distance from nose), oval section
  const prof: [number, number][] = [[0.001, 0], [0.46, 0.12], [0.6, 0.5], [0.66, 1.1], [0.68, 1.7], [0.69, 2.4], [0.66, 3.4], [0.53, 4.6], [0.37, 6.0], [0.25, 7.3], [0.16, 7.95], [0.001, 8.05]];
  const lathe = (pts: [number, number][], mat: THREE.Material) => {
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
  add(new THREE.Mesh(sideExtrude(outline([[-1.25, 0.42], [-0.72, 0.98], [1.05, 0.98], [1.45, 0.42]]), 1.3), glass));
  add(new THREE.Mesh(sideExtrude(outline([[-0.72, 0.97], [1.05, 0.97], [1.05, 1.03], [-0.72, 1.03]]), 1.32), red));

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
  add(new THREE.Mesh(sideExtrude(outline([[3.85, 0.3], [5.05, 0.22], [5.15, 1.85], [4.6, 1.9]]), 0.12), red));
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

  g.scale.setScalar(1.75);
  return { group: g, prop };
}

// ---------------------------------------------------------------- firefighting plane
// Yellow Air Tractor on floats (the kind that scoops water from a river): long turbine
// nose, hopper hump ahead of a tall cockpit, low straight wing. Same units and scale as
// the plane above, nose toward -z.
const AT_YELLOW = '#f5c518';
function buildAirTractor(): { group: THREE.Group; prop: THREE.Group } {
  const g = new THREE.Group();
  const M = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const yellow = M(AT_YELLOW), red = M(FLAG_RED), glass = M('#2c4561'), dark = M('#2f2622'), steel = M('#c9c4c0'), pale = M('#efe9dc');
  const add = (mesh: THREE.Mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };
  const lathe = (pts: [number, number][], mat: THREE.Material, sx: number, sy: number, at: Vec3) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, t]) => new THREE.Vector2(r, t)), 16);
    geo.rotateX(Math.PI / 2);
    geo.scale(sx, sy, 1);
    geo.translate(...at);
    return add(new THREE.Mesh(geo, mat));
  };

  // fuselage (radius, distance from nose) with a steel nose ring and exhaust stacks
  const prof: [number, number][] = [[0.001, 0], [0.2, 0.04], [0.34, 0.45], [0.4, 1.2], [0.52, 2.0], [0.62, 2.7], [0.64, 3.5], [0.6, 4.3], [0.47, 5.4], [0.31, 6.5], [0.19, 7.3], [0.001, 7.42]];
  lathe(prof, yellow, 0.9, 1.18, [0, 0, -3.3]);
  lathe(prof.slice(0, 3).map(([r, t]) => [r * 1.03 + 0.004, t]), steel, 0.9, 1.18, [0, 0, -3.3]);
  for (const side of [-1, 1]) add(between([side * 0.3, 0.02, -2.75], [side * 0.56, -0.12, -2.3], 0.07, dark));

  // hopper hump, cockpit with a framed canopy, turtle deck
  add(new THREE.Mesh(sideExtrude(outline([[-1.75, 0.45], [-1.35, 0.88], [-0.05, 0.95], [-0.05, 0.45]]), 0.86), yellow));
  add(new THREE.Mesh(sideExtrude(outline([[-0.05, 0.45], [0.12, 1.3], [1.0, 1.34], [1.55, 0.72], [1.55, 0.45]]), 0.74), glass));
  add(new THREE.Mesh(sideExtrude(outline([[0.08, 1.29], [1.02, 1.33], [1.02, 1.4], [0.08, 1.36]]), 0.78), yellow));
  add(new THREE.Mesh(sideExtrude(outline([[1.5, 0.45], [1.5, 0.74], [3.6, 0.4], [3.6, 0.28]]), 0.6), yellow));

  // low wing in two halves, red tips and sun roundels
  const half = 5.9, dih = THREE.MathUtils.degToRad(4);
  const roundel = new THREE.MeshLambertMaterial({ map: roundelTex() });
  const wingShape = airfoil(1.85, 0.2);
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    const wing = new THREE.Mesh(sideExtrude(wingShape, half - 0.5, 0), yellow);
    wing.position.x = side > 0 ? 0 : -(half - 0.5);
    const tip = new THREE.Mesh(sideExtrude(wingShape, 0.5, 0), red);
    tip.position.x = side > 0 ? half - 0.5 : -half;
    for (const m of [wing, tip]) { m.position.z = -1.3; m.castShadow = true; w.add(m); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), roundel);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(side * 3.9, 0.198, -0.72);
    w.add(disc);
    w.position.y = -0.42;
    w.rotation.z = side * dih;
    g.add(w);
  }

  // tail: stabiliser + square fin with the flag
  const stab = new THREE.Mesh(sideExtrude(airfoil(1.15, 0.1), 4.4), yellow);
  stab.position.set(0, 0.3, 2.95);
  add(stab);
  add(new THREE.Mesh(sideExtrude(outline([[2.85, 0.28], [4.0, 0.22], [4.12, 1.95], [3.45, 2.0]]), 0.12), yellow));
  const flag = new THREE.MeshLambertMaterial({ map: flagTex() });
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), flag);
    f.position.set(side * 0.066, 1.3, 3.72);
    f.rotation.y = side * Math.PI / 2;
    g.add(f);
  }

  // two floats on struts with spreader bars
  const float: [number, number][] = [[0.001, 0], [0.24, 0.3], [0.4, 1.2], [0.43, 3.0], [0.37, 4.6], [0.21, 6.0], [0.001, 6.6]];
  for (const side of [-1, 1]) {
    lathe(float, pale, 1, 0.88, [side * 1.55, -1.6, -3.55]);
    for (const z of [-1.25, 0.95]) add(between([side * 0.42, -0.55, z], [side * 1.55, -1.3, z], 0.055, steel));
    add(between([side * 1.55, -1.3, -1.25], [side * 0.9, -0.5, 0.95], 0.035, steel));
  }
  for (const z of [-1.25, 0.95]) add(between([-1.55, -1.32, z], [1.55, -1.32, z], 0.045, steel));

  // spinner + four-blade propeller
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), steel);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -3.5;
  add(spinner);
  const prop = new THREE.Group();
  prop.position.z = -3.4;
  const blade = new THREE.BoxGeometry(0.15, 1.75, 0.04).translate(0, 0.95, 0);
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(blade, dark);
    b.rotation.set(0, 0.25, (k * Math.PI) / 2, 'ZYX');
    prop.add(b);
  }
  g.add(prop);

  g.scale.setScalar(1.75);
  return { group: g, prop };
}

// ---------------------------------------------------------------- tow banner
// A linen banner towed behind the plane after a fire is out. The cloth is a chain of
// points dragged behind the tail and moved on the CPU: a shader-only wave would not be
// seen by the ink normal pass. The text reads correctly from both sides.
export const BANNER_TEXT = 'Стојанче го спаси градот';
/** towed after a roll or a loop while firefighting: showing off while the town burns (the proverb) */
export const ROLL_BANNER_TEXT = 'Село гори, баба се чешла';
const ROLL_BANNER_TIME = 6, ROLL_SWING = 3; // seconds the stunt banner flies; seconds the camera stays out to the side
const BANNER_LEN = 46, BANNER_H = 6.2, BANNER_SEGS = 30, TOW = 11;

function bannerTexture(text: string): THREE.CanvasTexture {
  const W = 2048, H = 276;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4ede0';
  g.fillRect(0, 0, W, H);
  // cross-stitch bands along both edges, wine and indigo
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (const y of [22, H - 22]) {
    for (let x = 20, k = 0; x < W - 10; x += 30, k++) {
      g.strokeStyle = k % 3 === 2 ? '#1f2a44' : '#7a1f1a';
      g.beginPath();
      g.moveTo(x - 8, y - 8); g.lineTo(x + 8, y + 8);
      g.moveTo(x + 8, y - 8); g.lineTo(x - 8, y + 8);
      g.stroke();
    }
  }
  // 091 badge at the far end, the text in indigo
  g.fillStyle = '#7a1f1a';
  g.fillRect(W - 250, 70, 200, H - 140);
  g.fillStyle = '#f4ede0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = "76px 'Rubik Mono One', 'Arial Black', sans-serif";
  g.fillText('091', W - 150, H / 2 + 6);
  g.fillStyle = '#1f2a44';
  let size = 150;
  do { g.font = `700 ${size}px 'Lora', Georgia, serif`; size -= 4; } while (g.measureText(text).width > W - 360 && size > 60);
  g.fillText(text, (W - 250) / 2 + 10, H / 2 + 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function createBanner(scene: THREE.Scene) {
  const n = BANNER_SEGS + 1;
  const pos = new Float32Array(n * 2 * 3), nrm = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    uv.set([i / BANNER_SEGS, 1, i / BANNER_SEGS, 0], i * 4);
    if (i < BANNER_SEGS) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3), nrmAttr = new THREE.BufferAttribute(nrm, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage); nrmAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', nrmAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  // one cloth, two texts: [front, back] textures for each. The other face shows the same
  // texture mirrored, so the words read from both sides.
  const faces = [BANNER_TEXT, ROLL_BANNER_TEXT].map((text) => {
    const tex = bannerTexture(text), back = tex.clone();
    back.wrapS = THREE.RepeatWrapping;
    back.repeat.x = -1;
    back.needsUpdate = true;
    return [tex, back] as const;
  });
  const group = new THREE.Group();
  const cloth = ([THREE.FrontSide, THREE.BackSide] as const).map((side, i) => {
    const mat = new THREE.MeshLambertMaterial({ map: faces[0][i], side });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.castShadow = true;
    group.add(m);
    return mat;
  });
  let shown = 0; // which text is on the cloth
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 5), new THREE.MeshLambertMaterial({ color: '#4b3428' }));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, BANNER_H * 1.06, 6), new THREE.MeshLambertMaterial({ color: '#7a1f1a' }));
  rope.frustumCulled = pole.frustumCulled = false;
  group.add(rope, pole);
  group.visible = false;
  scene.add(group);

  const pts = Array.from({ length: n }, () => new THREE.Vector3());
  const d = new THREE.Vector3(), mid = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let out = 0;        // how far it is unrolled, 0…1
  let left = 0;       // seconds it still flies
  let clock = 0;

  /** unroll it (or keep it out) for `seconds`; `text`: 0 the fire is out, 1 the roll banner */
  function show(seconds: number, tail: THREE.Vector3, fwd: THREE.Vector3, text = 0): void {
    if (text !== shown) {
      shown = text;
      cloth.forEach((mat, i) => { mat.map = faces[text][i]; });
      group.visible = false; // another text: it unrolls anew
    }
    if (!group.visible) {
      out = 0;
      for (let i = 0; i < n; i++) pts[i].copy(tail).addScaledVector(fwd, -TOW - i * 0.2);
      group.visible = true;
    }
    left = seconds;
  }
  function hide(): void { left = 0; out = 0; group.visible = false; }

  function update(dt: number, tail: THREE.Vector3, fwd: THREE.Vector3): void {
    if (!group.visible) return;
    clock += dt;
    left -= dt;
    out = THREE.MathUtils.clamp(out + (left > 0 ? dt / 1.3 : -dt / 1.0), 0, 1);
    if (left <= 0 && out <= 0) { group.visible = false; return; }
    // follow the leader: every point keeps its distance from the one before it
    const seg = Math.max((BANNER_LEN / BANNER_SEGS) * out, 0.05);
    let prev = tail;
    for (let i = 0; i < n; i++) {
      const p = pts[i], want = i === 0 ? TOW : seg;
      d.subVectors(p, prev);
      if (d.lengthSq() < 1e-6) d.copy(fwd).negate();
      p.copy(prev).addScaledVector(d.normalize(), want);
      p.y += (prev.y - 0.4 - p.y) * Math.min(1, dt * 0.8) * (i === 0 ? 1 : 0.3); // hangs a little below the tail
      prev = p;
    }
    // cloth: two rows of vertices, with a flutter that grows toward the free end
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      d.subVectors(b, a).setY(0).normalize();
      const nx = -d.z, nz = d.x; // horizontal normal of the cloth
      const k = i / BANNER_SEGS;
      const wave = Math.sin(i * 0.62 - clock * 9) * 0.75 * k * out + Math.sin(i * 0.23 - clock * 4.1) * 0.5 * k * out;
      const p = pts[i], o = i * 6;
      const x = p.x + nx * wave, z = p.z + nz * wave;
      pos[o] = x; pos[o + 1] = p.y + BANNER_H / 2; pos[o + 2] = z;
      pos[o + 3] = x + nx * wave * 0.25; pos[o + 4] = p.y - BANNER_H / 2; pos[o + 5] = z + nz * wave * 0.25;
      nrm[o] = nrm[o + 3] = nx; nrm[o + 1] = nrm[o + 4] = 0.15; nrm[o + 2] = nrm[o + 5] = nz;
    }
    posAttr.needsUpdate = nrmAttr.needsUpdate = true;
    // tow rope from the tail to the lead pole
    d.subVectors(pts[0], tail);
    const len = d.length();
    rope.position.copy(mid.addVectors(tail, pts[0]).multiplyScalar(0.5));
    rope.quaternion.setFromUnitVectors(Y, d.normalize());
    rope.scale.set(1, len, 1);
    pole.position.copy(pts[0]);
  }

  return { group, show, hide, update, get visible(): boolean { return group.visible; }, /** 0 the fire is out, 1 the roll banner */ get text(): number { return shown; } };
}

export interface FlightOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrain: Terrain;
  bounds: Bounds;
}

type FlightKey = 'left' | 'right' | 'up' | 'down' | 'boost' | 'drop';

export function createFlight({ scene, camera, terrain, bounds }: FlightOptions) {
  // one group holds both aircraft; the firefighting mode shows the Air Tractor
  const plane = new THREE.Group();
  const cessna = buildPlane(), tractor = buildAirTractor();
  tractor.group.visible = false;
  plane.add(cessna.group, tractor.group);
  plane.visible = false;
  scene.add(plane);
  const banner = createBanner(scene);

  let invertY = false;
  let fire = false;          // firefighting: the Air Tractor, Space drops water
  let aim = false;           // a fire is near: show where the water would land
  let falling = false;       // water is in the air: show where it lands
  let aimY = 0;              // height of that fire or landing place
  let floorWant = MIN_AGL;   // lowest height above the ground (lower over water, to scoop)
  const st = { active: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, speed: SPEED, warn: '' as FlightWarning, floor: MIN_AGL, aim: 0, drop: 0, side: 0, swing: 0 };
  // digital input (keys, on-screen buttons): 0/1
  const input = { left: 0, right: 0, up: 0, down: 0, boost: false, drop: false };
  const pad = { turn: 0, climb: 0, boost: false, drop: false }; // analog gamepad input, set each frame
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const fwd = new THREE.Vector3(), tail = new THREE.Vector3();
  const idle = { left: 0, right: 0, up: 0, down: 0, boost: false, drop: false };
  // a stunt in progress: a roll (dir 1 right, -1 left) or a loop (dir 1 pulling up and over
  // backwards, -1 nose down and under); `a` is how far through it is, 0…1
  let stunt: { kind: 'roll' | 'loop'; dir: number; a: number } | null = null;
  let lowT = 0; // seconds the "too low" warning stays after a refused loop

  const keymap: Record<string, FlightKey> = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'boost',
  };
  // stunt keys: Q / E roll left / right; F loops up and over, R nose down and under, the
  // other way round with "invert up/down" on (the same rule as the map's F / R tilt)
  const stuntKeys: Record<string, ['roll' | 'loop', 1 | -1]> = { KeyQ: ['roll', -1], KeyE: ['roll', 1], KeyF: ['loop', 1], KeyR: ['loop', -1] };
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (!st.active) return;
    const s = stuntKeys[e.code];
    if (s) {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // Cmd+R, Ctrl+F … stay the browser's
      e.preventDefault();
      if (down && !e.repeat) startStunt(s[0], s[0] === 'loop' && invertY ? (-s[1] as 1 | -1) : s[1]);
      return;
    }
    let k = keymap[e.code];
    if (!k) return;
    e.preventDefault();
    if (fire && e.code === 'Space') k = 'drop';
    if (k === 'boost' || k === 'drop') input[k] = down;
    else input[k] = down ? 1 : 0;
  };
  addEventListener('keydown', onKey(true));
  addEventListener('keyup', onKey(false));
  addEventListener('blur', () => Object.assign(input, idle));

  /** start a roll (dir 1 right, -1 left) or a loop (1 up and over, -1 nose down and under); false if it cannot start now */
  function startStunt(kind: 'roll' | 'loop', dir: 1 | -1): boolean {
    if (!st.active || stunt) return false;
    if (kind === 'loop' && dir < 0) {
      const room = st.pos.y - terrain.at(st.pos.x, st.pos.z) - st.floor - 25;
      if (room < (2 * st.speed) / LOOP_RATE + 10) { lowT = 1.5; return false; }
    }
    stunt = { kind, dir, a: 0 };
    return true;
  }

  function start(target: THREE.Vector3, yaw: number): void {
    st.active = true;
    st.yaw = yaw;
    st.pitch = 0;
    st.bank = 0;
    st.speed = SPEED;
    st.floor = floorWant = MIN_AGL;
    st.side = st.swing = st.aim = st.drop = 0;
    stunt = null;
    lowT = 0;
    aim = falling = false;
    banner.hide();
    st.pos.set(target.x, Math.max(target.y, terrain.at(target.x, target.z)) + 230, target.z);
    plane.visible = true;
    forward(fwd);
    camPos.copy(st.pos).addScaledVector(fwd, -70).add(new THREE.Vector3(0, 22, 0));
    camera.position.copy(camPos);
    update(0);
  }
  function stop(): void {
    st.active = false;
    plane.visible = false;
    stunt = null;
    banner.hide();
    Object.assign(input, idle);
  }

  function forward(v: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(st.pitch);
    return v.set(Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
  }

  function update(dt: number): void {
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
      st.warn = 'edge';
    }

    // ground / ceiling; the floor comes down quickly over water and rises gently after it
    st.floor += THREE.MathUtils.clamp(floorWant - st.floor, -40 * dt, 14 * dt);
    const floor = st.floor, soft = 8 + 17 * THREE.MathUtils.clamp((floor - 8) / (MIN_AGL - 8), 0, 1); // 25 m at the normal floor
    const ground = terrain.at(st.pos.x, st.pos.z);
    const agl = st.pos.y - ground;
    if (agl < floor + soft) { climb = Math.max(climb, (floor + soft - agl) / soft); if (agl < floor + 5) st.warn = 'low'; }
    if (st.pos.y > MAX_ALT) climb = Math.min(climb, -0.5);
    if (lowT > 0) { lowT -= dt; st.warn = st.warn || 'low'; }

    // stunts: a loop flies a full circle in the vertical plane (no steering meanwhile),
    // a roll turns the plane once around its own axis while it flies on
    const looping = stunt?.kind === 'loop';
    let roll = 0, stunted = false;
    if (stunt) {
      const step = dt * (looping ? LOOP_RATE / (2 * Math.PI) : 1 / ROLL_TIME), left = 1 - stunt.a;
      if (looping) st.pitch += stunt.dir * Math.min(step, left) * 2 * Math.PI;
      stunt.a += step;
      if (stunt.a >= 1) {
        if (looping) st.pitch -= stunt.dir * 2 * Math.PI; // once round: the same pitch as before
        stunted = fire; // firefighting: a roll or a loop earns its banner
        stunt = null;
      } else if (!looping) roll = -stunt.dir * 2 * Math.PI * stunt.a * stunt.a * (3 - 2 * stunt.a);
    }
    if (looping) turn = 0;

    st.speed += ((boosting ? BOOST : SPEED) - st.speed) * (1 - Math.exp(-dt * 1.6));
    st.yaw += turn * TURN * dt * (0.8 + 0.2 * (SPEED / st.speed));
    st.bank += (-turn * 0.65 - st.bank) * (1 - Math.exp(-dt * 3));
    if (!looping) st.pitch += (climb * 0.32 - st.pitch) * (1 - Math.exp(-dt * 2.2));

    forward(fwd);
    st.pos.addScaledVector(fwd, st.speed * dt);
    st.pos.x = THREE.MathUtils.clamp(st.pos.x, -hw + 60, hw - 60);
    st.pos.z = THREE.MathUtils.clamp(st.pos.z, -hh + 60, hh - 60);
    st.pos.y = Math.max(st.pos.y, ground + floor);

    plane.position.copy(st.pos);
    plane.rotation.set(st.pitch, -st.yaw, st.bank + roll, 'YXZ');
    const spin = dt * (boosting ? 60 : 35);
    cessna.prop.rotation.z += spin;
    tractor.prop.rotation.z += spin;
    // after a roll or a loop with the Air Tractor: the stunt banner for a few seconds, the camera
    // out to the side as for a fire put out (which keeps its own banner if that one is flying)
    if (stunted && !(banner.visible && banner.text === 0)) {
      banner.show(ROLL_BANNER_TIME, tail.copy(st.pos).addScaledVector(fwd, -7.5), fwd, 1);
      st.swing = ROLL_SWING;
    }
    banner.update(dt, tail.copy(st.pos).addScaledVector(fwd, -7.5), fwd);

    // chase camera: behind and above, looking a little ahead. Firefighting looks from
    // higher, so the ground ahead of the plane (where the water lands) is in view; while
    // the banner is new the camera swings out to the side to read it.
    st.swing = Math.max(0, st.swing - dt);
    const ease = dt === 0 ? 1 : 1 - Math.exp(-dt * 1.7);
    st.side += ((st.swing > 0 && banner.visible ? 1 : 0) - st.side) * ease;
    // Near a fire, and while water falls, the camera pulls far back and up: from the usual
    // place the plane hides the spot where the water lands. On the approach it looks ahead
    // (the ring and the fire); once water is falling it looks down at where it lands, which
    // is behind the plane by then.
    st.aim += ((fire && (aim || falling) && st.side < 0.05 ? 1 : 0) - st.aim) * ease;
    st.drop += ((falling ? 1 : 0) - st.drop) * ease;
    // h: height above the fire or the place where the water lands (not the ground right under the plane: slopes)
    // from higher up the camera has to stand further off to keep the plane and that place in one picture
    const ahead = st.aim * (1 - st.drop), below = st.aim * st.drop, h = THREE.MathUtils.clamp(st.pos.y - aimY, 20, 190);
    const far = st.aim * Math.max(1, h / 75);
    const back = 62 + (st.speed - SPEED) * 0.12 + 46 * st.side + AIM_BACK * far;
    const camYaw = st.yaw - SWING * st.side;
    const flat = new THREE.Vector3(Math.sin(camYaw), 0, -Math.cos(camYaw));
    // in a loop the camera stays level behind the plane and watches it go round
    const camPitch = looping ? Math.sin(st.pitch) * 0.32 : st.pitch;
    const want = st.pos.clone().addScaledVector(flat, -back).add(new THREE.Vector3(0, 20 + AIM_UP * far - camPitch * 30, 0));
    const camGround = terrain.at(want.x, want.z) + 12;
    if (want.y < camGround) want.y = camGround;
    camPos.lerp(want, dt === 0 ? 1 : 1 - Math.exp(-dt * 3.5));
    camera.position.copy(camPos);
    look.copy(st.pos).addScaledVector(looping ? flat : fwd, 30 + 100 * Math.max(1, h / 75) * ahead - 12 * below - 72 * st.side); // the banner: toward its middle
    look.y -= 0.42 * h * ahead + (0.5 * h + 16) * below;
    camera.lookAt(look);
  }

  return {
    plane, start, stop, update, input, pad,
    setInvertY(v: boolean): void { invertY = v; },
    /**
     * Start a stunt (the pad's right stick; the keys Q / E / F / R): a roll to the right
     * (dir 1) or left (-1), or a loop pulling up and over (dir 1) or nose down and under
     * (-1). One at a time; the loop under needs room below, otherwise "too low" shows and
     * nothing happens.
     */
    stunt: startStunt,
    get stunting(): boolean { return !!stunt; },
    /** firefighting mode: the Air Tractor, and Space drops water */
    setFire(on: boolean): void {
      fire = on;
      cessna.group.visible = !on;
      tractor.group.visible = on;
      if (!on) { input.drop = false; aim = falling = false; floorWant = MIN_AGL; banner.hide(); }
    },
    /** a fire is close ahead, or water is in the air: the camera pulls back to show where it lands */
    setAim(near: boolean, waterFalling: boolean, y: number): void { aim = near; falling = waterFalling; aimY = y; },
    /** lowest height above the ground; null = the normal one (lower lets the plane skim water) */
    setFloor(agl: number | null): void { floorWant = agl ?? MIN_AGL; },
    /** tow the banner for a while; the camera swings out at first so it can be read */
    celebrate(): void {
      banner.show(9, tail.copy(st.pos).addScaledVector(fwd, -7.5), fwd);
      st.swing = 4.5;
    },
    banner,
    /** velocity, m/s */
    velocity(out: THREE.Vector3): THREE.Vector3 { return forward(out).multiplyScalar(st.speed); },
    get dropping(): boolean { return fire && (input.drop || pad.drop); },
    get active(): boolean { return st.active; },
    get yaw(): number { return st.yaw; },
    get pos(): THREE.Vector3 { return st.pos; },
    get hud() {
      return { kmh: Math.round(st.speed * 3.6), alt: Math.round(st.pos.y - terrain.at(st.pos.x, st.pos.z)), warn: st.warn, boost: input.boost || pad.boost };
    },
  };
}

export type Flight = ReturnType<typeof createFlight>;
