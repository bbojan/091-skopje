import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { buildCity, PAL } from './city.js';
import { createTraffic } from './traffic.js';
import { Terrain } from './terrain.js';
import { InkRenderer } from './post.js';
import { createFlight } from './flight.js';

const app = document.getElementById('app');
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// 1.5x is plenty: still frames are supersampled by temporal accumulation anyway
const dpr = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.paper);
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 10, 40000);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 60;
controls.maxDistance = 26000;
controls.maxPolarAngle = 1.25;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;

// warm afternoon sun from the west, lavender sky fill
const hemi = new THREE.HemisphereLight('#dcdcf4', '#f3e2c8', 2.25);
const sun = new THREE.DirectionalLight('#fff2df', 2.2);
sun.castShadow = true;
scene.add(hemi, sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.7, 0.9, 0.32).normalize();

const ink = new InkRenderer(renderer);
ink.setSize(innerWidth, innerHeight, dpr);

let city, traffic, terrain, meta, flight;
let live = true;
let camDirty = true;
const VIEWS = {};

async function init() {
  status.textContent = 'Се вчитуваат податоците од OpenStreetMap…';
  const [data, tMeta, tBin] = await Promise.all([
    fetch('./skopje.json').then((r) => r.json()),
    fetch('./terrain.json').then((r) => r.json()),
    fetch('./terrain.bin').then((r) => r.arrayBuffer()),
  ]);
  meta = data.meta;
  terrain = new Terrain(tMeta, new Uint16Array(tBin));
  const { w: W, h: H } = meta;
  const m = 0.5;
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), W / 2 + m),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2 + m),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), H / 2 + m),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), H / 2 + m),
  ];
  ink.setClipping(planes);
  status.textContent = 'Се гради градот…';
  await new Promise((r) => setTimeout(r, 30));
  const t0 = performance.now();
  city = buildCity(data, terrain, { clippingPlanes: planes });
  scene.add(city.group);
  city.bakeGround(renderer);
  traffic = createTraffic(city, terrain, { clippingPlanes: planes });
  scene.add(traffic.group);
  flight = createFlight({ scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 } });
  flight.setInvertY(invertBox.checked);
  console.log('city built in', Math.round(performance.now() - t0), 'ms', city.stats, traffic.counts);

  const maxTex = renderer.capabilities.maxTextureSize;
  sun.shadow.mapSize.set(Math.min(8192, maxTex), Math.min(8192, maxTex));
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.5;
  sun.shadow.radius = 2;

  const P = (lat, lon) => [(lon - meta.lon0) * meta.kx, -(lat - meta.lat0) * meta.ky];
  const at = (lat, lon) => { const [x, z] = P(lat, lon); return [x, terrain.at(x, z), z]; };
  Object.assign(VIEWS, {
    center: { t: at(41.9968, 21.4318), d: 620, polar: 0.74, az: 0.08 },
    kale: { t: at(42.0012, 21.4355), d: 640, polar: 0.72, az: 0.3 },
    park: { t: at(42.0045, 21.4160), d: 900, polar: 0.72, az: -0.25 },
    vodno: { t: at(41.9725, 21.4020), d: 3600, polar: 1.02, az: Math.PI - 0.25 },
    overview: { t: [0, 60, 600], d: 19000, polar: 0.7, az: 0 },
  });
  setView(location.hash.slice(1) || 'center');
  status.textContent = '';
}

function setView(name) {
  const v = VIEWS[name] || VIEWS.center;
  controls.target.set(...v.t);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(v.d, v.polar, v.az)));
  controls.update();
  camDirty = true;
}
window.setView = setView;

// Shadow frustum follows the view so close-ups get crisp shadows
function fitShadow(extOverride) {
  const d = camera.position.distanceTo(controls.target);
  const ext = extOverride ?? THREE.MathUtils.clamp(d * 1.1, 260, 7000);
  const sc = sun.shadow.camera;
  const texel = (2 * ext) / sun.shadow.mapSize.x;
  const t = controls.target;
  const cx = Math.round(t.x / texel) * texel, cz = Math.round(t.z / texel) * texel;
  sun.target.position.set(cx, t.y, cz);
  sun.position.copy(SUN_DIR).multiplyScalar(6000).add(sun.target.position);
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
  sc.near = 100; sc.far = 12000;
  sc.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
}

function updateCameraRange() {
  const d = camera.position.distanceTo(controls.target);
  camera.near = THREE.MathUtils.clamp(d / 45, 4, 400);
  camera.far = d * 6 + 20000;
  camera.updateProjectionMatrix();
}

controls.addEventListener('change', () => (camDirty = true));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  ink.setSize(innerWidth, innerHeight, dpr);
  camDirty = true;
});

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.getElementById('ink').addEventListener('click', (e) => {
  ink.ink = !ink.ink;
  e.currentTarget.classList.toggle('off', !ink.ink);
  ink.reset();
});
document.getElementById('live').addEventListener('click', (e) => {
  live = !live;
  e.currentTarget.classList.toggle('off', !live);
  ink.reset();
});
document.getElementById('shot').addEventListener('click', () => {
  ink.render(scene, camera, false); // draw now so the canvas still holds the frame
  const a = document.createElement('a');
  a.download = 'skopje.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

// ---------------- airplane mode
const flyHud = document.getElementById('flyhud');
const flyStats = document.getElementById('fly-stats'), flyWarn = document.getElementById('fly-warn');
let lastShadowAt = new THREE.Vector3(1e9, 0, 0);
function startFlight() {
  if (!flight || flight.active) return;
  const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  controls.enabled = false;
  flight.start(controls.target, -az); // face the way the camera was looking
  document.body.classList.add('flying');
  flyHud.hidden = false;
  if (!live) document.getElementById('live').click();
}
function stopFlight() {
  if (!flight?.active) return;
  const p = flight.pos;
  flight.stop();
  controls.target.set(p.x, terrain.at(p.x, p.z), p.z);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, 700);
  controls.enabled = true;
  controls.update();
  document.body.classList.remove('flying');
  flyHud.hidden = true;
  camDirty = true;
}
document.getElementById('fly').addEventListener('click', startFlight);
document.getElementById('fly-exit').addEventListener('click', stopFlight);
addEventListener('keydown', (e) => { if (e.code === 'Escape' && flight?.active) stopFlight(); });
// hold-to-press touch/mouse buttons
flyHud.querySelectorAll('[data-k]').forEach((b) => {
  const k = b.dataset.k;
  const set = (on) => { if (!flight) return; if (k === 'boost') flight.input.boost = on; else flight.input[k] = on ? 1 : 0; b.classList.toggle('on', on); };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

// invert-Y preference (remembered per browser)
const invertBox = document.getElementById('opt-invert');
try { invertBox.checked = localStorage.getItem('skopje.invertY') === '1'; } catch { /* storage unavailable */ }
invertBox.addEventListener('change', () => {
  flight?.setInvertY(invertBox.checked);
  try { localStorage.setItem('skopje.invertY', invertBox.checked ? '1' : '0'); } catch { /* storage unavailable */ }
});

// help dialog behind the logo
const help = document.getElementById('help');
document.getElementById('logo').addEventListener('click', () => help.showModal());
document.getElementById('help-close').addEventListener('click', () => help.close());
help.addEventListener('click', (e) => { if (e.target === help) help.close(); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  controls.update();
  if (!city) return;
  if (flight.active) {
    flight.update(dt);
    controls.target.copy(flight.pos); // drives shadows, LOD and traffic sizing
    updateCameraRange();
    city.updateLOD(camera);
    if (flight.pos.distanceTo(lastShadowAt) > 150) { fitShadow(1100); lastShadowAt.copy(flight.pos); }
    ink.reset();
    const h = flight.hud;
    flyStats.textContent = `${h.kmh} км/ч · ${h.alt} м`;
    if (flyWarn.textContent !== h.warn) flyWarn.textContent = h.warn;
    document.getElementById('fly-boost').classList.toggle('on', h.boost);
    traffic.update(dt, camera, controls.target);
    ink.render(scene, camera, true);
    return;
  }
  if (camDirty) {
    camDirty = false;
    updateCameraRange();
    city.updateLOD(camera);
    fitShadow();
    ink.reset();
  }
  if (live) traffic.update(dt, camera, controls.target);
  else if (ink.converged) return; // static & fully supersampled: idle
  ink.render(scene, camera, live);
});

window.__dbg = { scene, renderer, sun, camera, controls, ink, get city() { return city; }, get flight() { return flight; } };

init().catch((e) => {
  console.error(e);
  status.textContent = 'Грешка: ' + e.message;
});
