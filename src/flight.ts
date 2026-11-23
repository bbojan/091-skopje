import * as THREE from 'three';
import type { Terrain } from './terrain.ts';
import type { Bounds, Vec3 } from './types.ts';

// Simple arcade flight: always moving forward, steer left/right, climb/dive, boost.
// Third-person chase camera. Stays inside the map and above the ground.

const SPEED = 55, BOOST = 140; // m/s
const TURN = 0.75; // rad/s at full input
const MIN_AGL = 38, MAX_ALT = 1500;
/** what differs between the usual plane and the F-15 (1325 km/h, 2650 with turbo) */
interface Craft { speed: number; boost: number; turn: number; floor: number; maxAlt: number; start: number; back: number; up: number }
const PROP: Craft = { speed: SPEED, boost: BOOST, turn: TURN, floor: MIN_AGL, maxAlt: MAX_ALT, start: 230, back: 62, up: 20 };
const JET: Craft = { speed: 368, boost: 736, turn: 0.75, floor: 150, maxAlt: 5200, start: 420, back: 58, up: 14 };
/** Ctrl held: this share of the top speed (both planes) */
const SLOW = 0.25;
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

// ---------------------------------------------------------------- F-15 Eagle
// Grey twin-engine fighter at true size (19.4 m long, 13 m span), nose toward -z: radome, bubble canopy,
// boxy intakes beside the cockpit, a swept wing, stabilators and two fins canted outward, two nozzles
// with afterburner flames that show with turbo. The flames are see-through: `flames` goes to the ink's skipNormal.
const F15_GREY = '#9aa5b1', F15_DARK = '#7d8996';
/** a flat plate drawn from the top, (x, z) points, `thick` metres high, its underside at y */
function plate(pts: [number, number][], thick: number, y: number): THREE.ExtrudeGeometry {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape y → world z, extrusion → world -y
  g.translate(0, y + thick, 0);
  return g;
}
function buildF15(): { group: THREE.Group; flames: THREE.Mesh[] } {
  const g = new THREE.Group();
  const M = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color });
  const grey = M(F15_GREY), dark = M(F15_DARK), glass = M('#2c3a4d'), black = M('#3a3836'), steel = M('#c9c4c0');
  const add = (mesh: THREE.Mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };
  const lathe = (pts: [number, number][], mat: THREE.Material, sx: number, sy: number, at: Vec3, seg = 16) => {
    const geo = new THREE.LatheGeometry(pts.map(([r, t]) => new THREE.Vector2(r, t)), seg);
    geo.rotateX(Math.PI / 2);
    geo.scale(sx, sy, 1);
    geo.translate(...at);
    return add(new THREE.Mesh(geo, mat));
  };
  // nose and forward fuselage (radius, distance from the tip)
  lathe([[0.001, 0], [0.22, 0.6], [0.45, 1.6], [0.66, 2.8], [0.8, 3.9], [0.88, 5.0], [0.9, 5.6]], grey, 1, 0.95, [0, 0.35, -9.7]);
  lathe([[0.001, 0], [0.12, 0.25], [0.15, 0.5]], dark, 1, 1, [0, 0.35, -9.75]); // dark radome tip
  // bubble canopy over the cockpit
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.55, 0.62, 2.1);
  canopy.position.set(0, 0.95, -5.3);
  add(canopy);
  // centre body and the spine behind the canopy
  add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.25, 10.6), grey)).position.set(0, 0.25, 1.2);
  add(new THREE.Mesh(sideExtrude(outline([[-4.2, 0.8], [-3.2, 1.25], [3.5, 1.05], [6.4, 0.85], [6.4, 0.7], [-4.2, 0.7]]), 1.2), grey));
  // intakes either side, dark mouths
  for (const side of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.45, 6.6), grey)).position.set(side * 1.55, 0.05, -1.0);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.1), black)).position.set(side * 1.55, 0.05, -4.32);
    // engines and nozzles
    lathe([[0.62, 0], [0.64, 4.5], [0.58, 7.2]], dark, 1, 1, [side * 0.72, 0.1, 2.2]);
    lathe([[0.58, 0], [0.54, 0.5], [0.5, 0.95], [0.001, 0.95]], black, 1, 1, [side * 0.72, 0.1, 9.4], 14);
  }
  // wing: swept leading edge, cropped tip; Macedonian sun roundels on top
  const roundel = new THREE.MeshLambertMaterial({ map: roundelTex() });
  for (const side of [-1, 1]) {
    const wing: [number, number][] = [[1.2, -2.6], [6.55, 3.6], [6.55, 5.3], [1.2, 6.6]];
    add(new THREE.Mesh(plate(wing.map(([x, z]) => [side * x, z]), 0.24, 0.0), grey));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 28), roundel);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(side * 4.3, 0.25, 3.8);
    g.add(disc);
    // stabilator
    add(new THREE.Mesh(plate([[1.1, 6.9], [4.0, 9.1], [4.0, 10.3], [1.1, 10.0]].map(([x, z]) => [side * x, z] as [number, number]), 0.14, 0.05), grey));
    // fin, canted outward, with the flag
    const fin = new THREE.Group();
    fin.add(new THREE.Mesh(sideExtrude(outline([[5.6, 0], [9.7, 0], [10.1, 3.35], [8.7, 3.4]]), 0.16), grey));
    fin.children[0].castShadow = true;
    const flagM = new THREE.MeshLambertMaterial({ map: flagTex() });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), flagM);
    f.position.set(side * 0.09, 2.0, 8.9);
    f.rotation.y = side * Math.PI / 2;
    fin.add(f);
    fin.position.set(side * 1.45, 0.75, 0);
    fin.rotation.z = -side * 0.27;
    g.add(fin);
  }
  // pitot and a small dark belly fairing
  add(between([0, 0.35, -9.7], [0, 0.35, -10.6], 0.03, steel));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 4.5), dark)).position.set(0, -0.45, 0.5);
  // afterburner flames: two cones of glow behind the nozzles, shown with turbo
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: '#fff1c4', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const [r, len, mat] of [[0.56, 6.5, flameMat], [0.34, 3.4, coreMat]] as const) {
      const geo = new THREE.ConeGeometry(r, len, 14, 1, true).translate(0, len / 2, 0).rotateX(Math.PI / 2); // base at the nozzle, tip toward +z
      const m = new THREE.Mesh(geo, mat);
      m.position.set(side * 0.72, 0.1, 10.0);
      m.visible = false;
      g.add(m);
      flames.push(m);
    }
  }
  g.scale.setScalar(1.25);
  return { group: g, flames };
}

// ---------------------------------------------------------------- tow banner
// A linen banner towed behind the plane after a fire is out. The cloth is a chain of
// points dragged behind the tail and moved on the CPU: a shader-only wave would not be
// seen by the ink normal pass. The text reads correctly from both sides. The texts and the
// badge at the far end (the town's old telephone code) differ per city: `banners` in src/cities.ts.
/** fire: towed after a fire is out; roll: after a roll or a loop while firefighting (showing off while the town burns) */
export interface BannerTexts { fire: string; roll: string; code: string }
const ROLL_BANNER_TIME = 6, ROLL_SWING = 3; // seconds the stunt banner flies; seconds the camera stays out to the side
const BANNER_LEN = 46, BANNER_H = 6.2, BANNER_SEGS = 30, TOW = 11;

function bannerTexture(text: string, code: string): THREE.CanvasTexture {
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
  // the city's code (091, 043) as a badge at the far end, the text in indigo
  g.fillStyle = '#7a1f1a';
  g.fillRect(W - 250, 70, 200, H - 140);
  g.fillStyle = '#f4ede0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = "76px 'Rubik Mono One', 'Arial Black', sans-serif";
  g.fillText(code, W - 150, H / 2 + 6);
  g.fillStyle = '#1f2a44';
  let size = 150;
  do { g.font = `700 ${size}px 'Lora', Georgia, serif`; size -= 4; } while (g.measureText(text).width > W - 360 && size > 60);
  g.fillText(text, (W - 250) / 2 + 10, H / 2 + 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function createBanner(scene: THREE.Scene, texts: BannerTexts) {
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
  const faces = [texts.fire, texts.roll].map((text) => {
    const tex = bannerTexture(text, texts.code), back = tex.clone();
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
  /** ends the window key listeners when the city is unloaded */
  signal?: AbortSignal;
  /** the tow banner's texts and badge, per city */
  banner: BannerTexts;
}

type FlightKey = 'left' | 'right' | 'up' | 'down' | 'boost' | 'drop' | 'slow' | 'shoot';

export function createFlight({ scene, camera, terrain, bounds, signal, banner: bannerTexts }: FlightOptions) {
  // one group holds both aircraft; the firefighting mode shows the Air Tractor
  const plane = new THREE.Group();
  const cessna = buildPlane(), tractor = buildAirTractor(), eagle = buildF15();
  tractor.group.visible = eagle.group.visible = false;
  plane.add(cessna.group, tractor.group, eagle.group);
  plane.visible = false;
  scene.add(plane);
  const banner = createBanner(scene, bannerTexts);

  let invertY = false;
  let jet = false;           // the F-15 (free flight only)
  let craft = PROP;
  /** set by main.ts while the F-15 may fly on into a neighbouring map: no turning back at that edge */
  let edgeOpen: ((x: number, z: number) => boolean) | null = null;
  let fire = false;          // firefighting: the Air Tractor, Space drops water
  let aim = false;           // a fire is near: show where the water would land
  let falling = false;       // water is in the air: show where it lands
  let aimY = 0;              // height of that fire or landing place
  let floorWant = MIN_AGL;   // lowest height above the ground (lower over water, to scoop)
  const st = { active: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, bank: 0, speed: SPEED, warn: '' as FlightWarning, floor: MIN_AGL, aim: 0, drop: 0, side: 0, swing: 0 };
  // digital input (keys, on-screen buttons): 0/1
  const input = { left: 0, right: 0, up: 0, down: 0, boost: false, drop: false, slow: false, shoot: false };
  const pad = { turn: 0, climb: 0, boost: false, drop: false, slow: false, shoot: false }; // analog gamepad input, set each frame
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const fwd = new THREE.Vector3(), tail = new THREE.Vector3();
  const idle = { left: 0, right: 0, up: 0, down: 0, boost: false, drop: false, slow: false, shoot: false };
  // a stunt in progress: a roll (dir 1 right, -1 left) or a loop (dir 1 pulling up and over
  // backwards, -1 nose down and under); `a` is how far through it is, 0…1
  let stunt: { kind: 'roll' | 'loop'; dir: number; a: number } | null = null;
  let lowT = 0; // seconds the "too low" warning stays after a refused loop
  let clockT = 0;

  const keymap: Record<string, FlightKey> = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'boost',
    ControlLeft: 'slow', ControlRight: 'slow',
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
    if (jet && e.code === 'Space') k = 'shoot'; // the F-15: rockets
    if (k === 'boost' || k === 'drop' || k === 'slow' || k === 'shoot') input[k] = down;
    else input[k] = down ? 1 : 0;
  };
  addEventListener('keydown', onKey(true), { signal });
  addEventListener('keyup', onKey(false), { signal });
  addEventListener('blur', () => Object.assign(input, idle), { signal });

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
    st.speed = craft.speed;
    st.floor = floorWant = craft.floor;
    st.side = st.swing = st.aim = st.drop = 0;
    stunt = null;
    lowT = 0;
    aim = falling = false;
    banner.hide();
    st.pos.set(target.x, Math.max(target.y, terrain.at(target.x, target.z)) + craft.start, target.z);
    plane.visible = true;
    forward(fwd);
    camPos.copy(st.pos).addScaledVector(fwd, -craft.back - 8).add(new THREE.Vector3(0, craft.up + 2, 0));
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

  function setJet(on: boolean): void {
    if (on && fire) return; // one plane at a time: firefighting keeps the Air Tractor
    jet = on;
    craft = on ? JET : PROP;
    eagle.group.visible = on;
    cessna.group.visible = !on && !fire;
    if (!on) for (const f of eagle.flames) f.visible = false;
    floorWant = craft.floor;
    if (st.active) {
      // switched while flying: up to the new floor, and the speed eases toward the new cruise
      st.floor = Math.max(st.floor, Math.min(floorWant, st.pos.y - terrain.at(st.pos.x, st.pos.z)));
    }
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
    const slow = input.slow || pad.slow;
    const boosting = (input.boost || pad.boost) && !slow;
    st.warn = '';

    // keep inside the map: steer back toward the centre near the edges. The F-15 needs room for its
    // wide turn (~1 km radius with turbo), and flies on where main.ts has a neighbouring map ready.
    const { hw, hh } = bounds;
    const m = jet ? Math.min(1.5 * st.speed / craft.turn, 0.35 * Math.min(hw, hh)) : 450;
    const open = !!edgeOpen && edgeOpen(st.pos.x, st.pos.z);
    if (!open && (Math.abs(st.pos.x) > hw - m || Math.abs(st.pos.z) > hh - m)) {
      const want = Math.atan2(-st.pos.x, st.pos.z);
      let diff = want - st.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      turn = THREE.MathUtils.clamp(diff * 2, -1, 1);
      st.warn = 'edge';
    }

    // ground / ceiling; the floor comes down quickly over water and rises gently after it
    st.floor += THREE.MathUtils.clamp(floorWant - st.floor, -40 * dt, 14 * dt);
    const floor = st.floor, soft = jet ? 120 : 8 + 17 * THREE.MathUtils.clamp((floor - 8) / (MIN_AGL - 8), 0, 1); // 25 m at the normal floor
    let ground = terrain.at(st.pos.x, st.pos.z);
    // the F-15 looks ahead over the terrain: at its speed a ridge 1 s away is 0.4–0.7 km off
    if (jet) {
      const sx = Math.sin(st.yaw), sz = -Math.cos(st.yaw);
      for (const s of [0.5, 1, 1.8]) ground = Math.max(ground, terrain.at(st.pos.x + sx * st.speed * s, st.pos.z + sz * st.speed * s) - 25 * s);
    }
    const under = terrain.at(st.pos.x, st.pos.z);
    const agl = st.pos.y - ground;
    if (agl < floor + soft) { climb = Math.max(climb, (floor + soft - agl) / soft); if (st.pos.y - under < floor + 5) st.warn = 'low'; }
    if (st.pos.y > craft.maxAlt) climb = Math.min(climb, -0.5);
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

    st.speed += ((slow ? craft.boost * SLOW : boosting ? craft.boost : craft.speed) - st.speed) * (1 - Math.exp(-dt * 1.6));
    st.yaw += turn * craft.turn * dt * (0.8 + 0.2 * Math.min(2, craft.speed / st.speed));
    st.bank += (-turn * 0.65 - st.bank) * (1 - Math.exp(-dt * 3));
    if (!looping) st.pitch += (climb * 0.32 - st.pitch) * (1 - Math.exp(-dt * 2.2));

    forward(fwd);
    st.pos.addScaledVector(fwd, st.speed * dt);
    if (!open) {
      st.pos.x = THREE.MathUtils.clamp(st.pos.x, -hw + 60, hw - 60);
      st.pos.z = THREE.MathUtils.clamp(st.pos.z, -hh + 60, hh - 60);
    }
    st.pos.y = Math.max(st.pos.y, terrain.at(st.pos.x, st.pos.z) + floor * (jet ? 0.5 : 1));

    plane.position.copy(st.pos);
    plane.rotation.set(st.pitch, -st.yaw, st.bank + roll, 'YXZ');
    const spin = dt * (boosting ? 60 : 35);
    cessna.prop.rotation.z += spin;
    tractor.prop.rotation.z += spin;
    if (jet) {
      // afterburner: grows in with turbo, flickers a little
      const burn = THREE.MathUtils.clamp((st.speed - craft.speed) / (craft.boost - craft.speed), 0, 1);
      eagle.flames.forEach((f, i) => { f.visible = burn > 0.05; f.scale.set(1, 1, burn * (0.85 + 0.15 * Math.sin(clockT * 40 + i))); });
      clockT += dt;
    }
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
    const back = craft.back + Math.max(0, st.speed - craft.speed) * (jet ? 0.03 : 0.12) + 46 * st.side + AIM_BACK * far;
    const camYaw = st.yaw - SWING * st.side;
    const flat = new THREE.Vector3(Math.sin(camYaw), 0, -Math.cos(camYaw));
    // in a loop the camera stays level behind the plane and watches it go round
    const camPitch = looping ? Math.sin(st.pitch) * 0.32 : st.pitch;
    const want = st.pos.clone().addScaledVector(flat, -back).add(new THREE.Vector3(0, craft.up + AIM_UP * far - camPitch * 30, 0));
    const camGround = terrain.at(want.x, want.z) + 12;
    if (want.y < camGround) want.y = camGround;
    camPos.lerp(want, dt === 0 ? 1 : 1 - Math.exp(-dt * 3.5));
    camera.position.copy(camPos);
    look.copy(st.pos).addScaledVector(looping ? flat : fwd, (jet ? 45 : 30) + 100 * Math.max(1, h / 75) * ahead - 12 * below - 72 * st.side); // the banner: toward its middle
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
      if (on) setJet(false);
      cessna.group.visible = !on && !jet;
      tractor.group.visible = on;
      if (!on) { input.drop = false; aim = falling = false; floorWant = craft.floor; banner.hide(); }
    },
    /** the F-15 (free flight only): its own speeds, floor and camera; while flying it changes on the spot */
    setJet,
    get jet(): boolean { return jet; },
    /** the plane flies on over an edge where this says yes (a neighbouring map is ready); null: always turn back */
    setEdgeOpen(fn: ((x: number, z: number) => boolean) | null): void { edgeOpen = fn; },
    /** the F-15's afterburner flames, see-through (for the ink's skipNormal) */
    flames: eagle.flames,
    /** a fire is close ahead, or water is in the air: the camera pulls back to show where it lands */
    setAim(near: boolean, waterFalling: boolean, y: number): void { aim = near; falling = waterFalling; aimY = y; },
    /** lowest height above the ground; null = the normal one (lower lets the plane skim water) */
    setFloor(agl: number | null): void { floorWant = agl ?? craft.floor; },
    /** tow the banner for a while; the camera swings out at first so it can be read */
    celebrate(): void {
      banner.show(9, tail.copy(st.pos).addScaledVector(fwd, -7.5), fwd);
      st.swing = 4.5;
    },
    banner,
    /** velocity, m/s */
    velocity(out: THREE.Vector3): THREE.Vector3 { return forward(out).multiplyScalar(st.speed); },
    get dropping(): boolean { return fire && (input.drop || pad.drop); },
    /** the F-15's trigger is held (rockets) */
    get shooting(): boolean { return jet && (input.shoot || pad.shoot); },
    get speed(): number { return st.speed; },
    /** the plane's nose direction and its right wing, for the rockets */
    axes(fwdOut: THREE.Vector3, rightOut: THREE.Vector3): void { forward(fwdOut); rightOut.set(Math.cos(st.yaw), 0, Math.sin(st.yaw)); },
    get active(): boolean { return st.active; },
    get yaw(): number { return st.yaw; },
    get pos(): THREE.Vector3 { return st.pos; },
    get hud() {
      return { kmh: Math.round(st.speed * 3.6), alt: Math.round(st.pos.y - terrain.at(st.pos.x, st.pos.z)), warn: st.warn, boost: (input.boost || pad.boost) && !(input.slow || pad.slow), slow: input.slow || pad.slow };
    },
  };
}

export type Flight = ReturnType<typeof createFlight>;
