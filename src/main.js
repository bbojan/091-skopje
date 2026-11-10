import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { computeCitySteps, assembleCity, PAL, SHARED } from './city.js';
import { TIMES, TIME_ORDER, blendTimes, createLamps } from './sky.js';
import { createTraffic } from './traffic.js';
import { Terrain } from './terrain.js';
import { InkRenderer } from './post.js';
import { createClouds, createBirds } from './atmos.js';
import { createFlight } from './flight.js';
import { createGame, fmtTime } from './game.js';
import { createLandmarks } from './landmarks.js';
import { createLabels } from './labels.js';
import { createMapInput, readPad } from './input.js';

const app = document.getElementById('app');
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// Render resolution adapts to frame time. 1.5x is the top level: still frames
// are supersampled by temporal accumulation anyway. Phones start lower.
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const QUALITY = [1.5, 1.25, 1.0, 0.8].map((q) => Math.min(window.devicePixelRatio, q));
let qLevel = MOBILE ? 2 : 0;
let dpr = QUALITY[qLevel];
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
const SUN_DIR = new THREE.Vector3(-0.7, 0.9, 0.32).normalize(); // updated by the time of day

const ink = new InkRenderer(renderer);
ink.setSize(innerWidth, innerHeight, dpr);
function setQuality(level) {
  qLevel = Math.max(0, Math.min(QUALITY.length - 1, level));
  if (QUALITY[qLevel] === dpr) return;
  dpr = QUALITY[qLevel];
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  ink.setSize(innerWidth, innerHeight, dpr);
  camDirty = true;
}
// frame-time governor: only while frames are rendered continuously and visible
const perf = { avg: 1 / 60, sinceChange: 0 };
function governQuality(dt) {
  if (document.hidden || dt > 0.25) return;
  perf.avg += (dt - perf.avg) * 0.05;
  perf.sinceChange += dt;
  if (perf.avg > 1 / 40 && perf.sinceChange > 2 && qLevel < QUALITY.length - 1) { setQuality(qLevel + 1); perf.sinceChange = 0; }
  else if (perf.avg < 1 / 57 && perf.sinceChange > 8 && qLevel > 0) { setQuality(qLevel - 1); perf.sinceChange = 0; }
}

let city, traffic, terrain, meta, flight, lamps, clouds, birds, game, landmarks, labels;
let live = true;
let camDirty = true;
const VIEWS = {};

// ---------------- loading: the city is built in a worker while a progress card shows
const loader = document.getElementById('loader');
const loadBar = document.getElementById('load-bar'), loadText = document.getElementById('load-text');
const STAGES = {
  download: [0, 0.35, 'Се вчитуваат податоците од OpenStreetMap…'],
  terrain: [0.35, 0.42, 'Се гради релјефот…'],
  ground: [0.42, 0.55, 'Се цртаат улиците и парковите…'],
  buildings: [0.55, 0.72, 'Се ѕидаат зградите…'],
  cars: [0.72, 0.78, 'Се паркираат автомобилите…'],
  trees: [0.78, 0.9, 'Се садат дрвјата…'],
  pack: [0.9, 0.93, 'Се пакува градот…'],
  assemble: [0.93, 0.97, 'Се составува сцената…'],
  bake: [0.97, 1.0, 'Се подготвуваат далечните предели…'],
};
let lastStage = 'download';
function showProgress(stage, f) {
  const st = STAGES[stage];
  if (!st) return;
  // stages report completion; show the next stage's label while it works
  const keys = Object.keys(STAGES);
  const next = f >= 1 && keys[keys.indexOf(stage) + 1] ? keys[keys.indexOf(stage) + 1] : stage;
  lastStage = next;
  loadBar.style.width = `${Math.round((st[0] + (st[1] - st[0]) * f) * 100)}%`;
  loadText.textContent = STAGES[next][2];
}
async function fetchJSON(url, onProgress) {
  const res = await fetch(url);
  const total = Number(res.headers.get('content-length')) || 7e6;
  if (!res.body) return res.json();
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(Math.min(got / total, 1));
  }
  const all = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return JSON.parse(new TextDecoder().decode(all));
}
// Yield between build stages. Visible: wait for a frame so the progress bar
// repaints. Hidden tab: rAF doesn't fire and timers are clamped to 1 s, so use
// a MessageChannel hop (never throttled) — nothing needs painting anyway.
const chan = new MessageChannel();
const chanQueue = [];
chan.port1.onmessage = () => chanQueue.shift()?.();
const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const go = () => { if (!done) { done = true; resolve(); } };
  if (document.hidden) { chanQueue.push(go); chan.port2.postMessage(0); return; }
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 100); // rAF may never fire in an occluded or minimised window
});

async function init() {
  const t0 = performance.now();
  showProgress('download', 0);
  const terrainP = Promise.all([fetch('./terrain.json').then((r) => r.json()), fetch('./terrain.bin').then((r) => r.arrayBuffer())]);
  const data = await fetchJSON('./skopje.json', (f) => showProgress('download', f * 0.95));
  const [tm, tb] = await terrainP;
  showProgress('download', 1);
  await nextFrame();
  // build on the main thread in stages, letting the progress bar repaint between them
  // (a background worker gets throttled to a fraction of this speed)
  terrain = new Terrain(tm, new Uint16Array(tb));
  const steps = computeCitySteps(data, terrain);
  let desc;
  for (;;) {
    const r = steps.next();
    if (r.done) { desc = r.value; break; }
    showProgress(r.value, 1);
    await nextFrame();
  }
  meta = desc.meta = data.meta;
  const { w: W, h: H } = meta;
  const m = 0.5;
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), W / 2 + m),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2 + m),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), H / 2 + m),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), H / 2 + m),
  ];
  ink.setClipping(planes);
  showProgress('pack', 1);
  await nextFrame();
  city = assembleCity(desc, { clippingPlanes: planes });
  scene.add(city.group);
  if (MOBILE) city.setLODScale(0.65);
  showProgress('assemble', 1);
  await nextFrame();
  city.bakeGround(renderer);
  traffic = createTraffic(city, terrain, { clippingPlanes: planes });
  scene.add(traffic.group);
  clouds = createClouds({ hw: W / 2, hh: H / 2 }, 1080);
  birds = createBirds(terrain, { hw: W / 2, hh: H / 2 }, planes);
  scene.add(clouds.group, birds.group);
  ink.compMat.uniforms.clouds.value = clouds.uniforms;
  lamps = createLamps(city.roadList, terrain, { hw: W / 2, hh: H / 2 }, planes);
  scene.add(lamps.group);
  ink.skipNormal.push(...lamps.glows, ...traffic.glows, clouds.group); // soft, see-through: no ink lines
  applyTime(TIMES[timeName]);
  landmarks = createLandmarks({ data, terrain, clippingPlanes: planes });
  labels = createLabels({ meta, terrain, crosses: data.crosses || [], places: data.places || {}, container: document.getElementById('labels') });
  try { labels.enabled = localStorage.getItem('skopje.labels') !== '0'; } catch { /* storage unavailable */ }
  namesBtn.classList.toggle('off', !labels.enabled);
  scene.add(landmarks.group);
  try { await document.fonts.load("46px 'Rubik Mono One'"); } catch { /* font optional */ }
  game = createGame({ terrain, meta, crosses: data.crosses || [], places: data.places || {}, clippingPlanes: planes });
  scene.add(game.group);
  ink.skipNormal.push(game.group.children.find((o) => o.geometry?.type === 'CylinderGeometry'));
  flight = createFlight({ scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 } });
  flight.setInvertY(invertBox.checked);
  console.log('city ready in', Math.round(performance.now() - t0), 'ms', city.stats, traffic.counts);

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
    park: { t: data.places?.park ? [data.places.park[0], terrain.at(...data.places.park), data.places.park[1]] : at(42.0075, 21.4190), d: 1000, polar: 0.72, az: -0.25 },
    vodno: { t: at(41.9725, 21.4020), d: 3600, polar: 1.02, az: Math.PI - 0.25 },
    overview: { t: [0, 60, 600], d: 19000, polar: 0.7, az: 0 },
  });
  setView(location.hash.slice(1) || 'center');
  showProgress('bake', 1);
  status.textContent = '';
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 700);
}

function setView(name) {
  const v = VIEWS[name] || VIEWS.center;
  controls.target.set(...v.t);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(v.d, v.polar, v.az)));
  controls.update();
  camDirty = true;
}
window.setView = setView;

// ---------------- time of day
let timeName = 'day';
try { if (TIMES[localStorage.getItem('skopje.time')]) timeName = localStorage.getItem('skopje.time'); } catch { /* storage unavailable */ }
let tween = null; // { from, to, t }
function applyTime(p) {
  if (!p.sunDir.isVector3) p = blendTimes(p, p, 0);
  SUN_DIR.copy(p.sunDir);
  sun.color.copy(p.sun); sun.intensity = p.sunI;
  hemi.color.copy(p.sky); hemi.groundColor.copy(p.gnd); hemi.intensity = p.hemiI;
  const u = ink.compMat.uniforms;
  u.paper.value.copy(p.paper); u.haze.value.copy(p.haze); u.inkColor.value.copy(p.ink); u.grade.value.copy(p.grade);
  scene.background.copy(p.paper);
  document.documentElement.style.background = '#' + p.paper.getHexString();
  SHARED.uNight.value = p.night;
  ink.compMat.uniforms.sunDir.value.copy(p.sunDir);
  ink.compMat.uniforms.cloudShade.value = 0.62 * (1 - p.night);
  clouds?.material.color.set('#ffffff').lerp(new THREE.Color('#59608f'), p.night);
  clouds?.material.emissive.copy(p.sky).multiplyScalar(0.35);
  lamps?.setNight(p.night);
  traffic?.setNight(p.night);
  document.body.classList.toggle('night', p.night > 0.5);
}
function setTime(name) {
  tween = { from: blendTimes(TIMES[timeName], TIMES[timeName], 0), to: TIMES[name], t: 0 };
  timeName = name;
  timeBtn.textContent = TIMES[name].label;
  try { localStorage.setItem('skopje.time', name); } catch { /* storage unavailable */ }
}
const timeBtn = document.getElementById('time');
timeBtn.textContent = TIMES[timeName].label;
timeBtn.addEventListener('click', () => setTime(TIME_ORDER[(TIME_ORDER.indexOf(timeName) + 1) % TIME_ORDER.length]));

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

// mobile popups (places, options); on desktop the groups are shown inline
const popups = [...document.querySelectorAll('.pop-toggle')].map((btn) => ({ btn, menu: document.getElementById(btn.getAttribute('aria-controls')) }));
const closePopups = (except) => popups.forEach((p) => { if (p !== except) { p.menu.classList.remove('open'); p.btn.setAttribute('aria-expanded', 'false'); } });
for (const p of popups) {
  p.btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !p.menu.classList.contains('open');
    closePopups(p);
    p.menu.classList.toggle('open', open);
    p.btn.setAttribute('aria-expanded', String(open));
  });
}
addEventListener('pointerdown', (e) => { if (!popups.some((p) => p.menu.contains(e.target) || p.btn.contains(e.target))) closePopups(); });
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.view); closePopups(); }));
document.getElementById('ink').addEventListener('click', (e) => {
  ink.ink = !ink.ink;
  e.currentTarget.classList.toggle('off', !ink.ink);
  ink.reset();
});
const namesBtn = document.getElementById('names');
namesBtn.addEventListener('click', () => {
  labels.enabled = !labels.enabled;
  namesBtn.classList.toggle('off', !labels.enabled);
  try { localStorage.setItem('skopje.labels', labels.enabled ? '1' : '0'); } catch { /* storage unavailable */ }
  labels.update(camera, controls.target);
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
const flyGame = document.getElementById('fly-game'), flyArrow = document.getElementById('fly-arrow'), flyDist = document.getElementById('fly-dist');
const flyResult = document.getElementById('fly-result'), flyFlash = document.getElementById('fly-flash');
let resultShown = false;
// the ring race is optional: free flight by default
let race = false;
try { race = localStorage.getItem('skopje.race') === '1'; } catch { /* storage unavailable */ }
const raceBtn = document.getElementById('fly-race');
function applyRace() {
  game.group.visible = race;
  document.body.classList.toggle('racing', race);
  raceBtn.textContent = race ? '🏁 Трка ✓' : '🏁 Трка';
  raceBtn.classList.toggle('on', race);
  if (!race) flyResult.hidden = true;
}
function startRace() {
  game.reset();
  resultShown = false;
  const r0 = game.rings[0].p; // approach the first ring from the south
  flight.start(new THREE.Vector3(r0.x, r0.y - 230, r0.z + 900), 0);
}
raceBtn.addEventListener('click', () => {
  race = !race;
  try { localStorage.setItem('skopje.race', race ? '1' : '0'); } catch { /* storage unavailable */ }
  applyRace();
  if (race) startRace();
});
document.getElementById('fly-again').addEventListener('click', () => { flyResult.hidden = true; startRace(); });
document.getElementById('fly-free').addEventListener('click', () => { race = false; try { localStorage.setItem('skopje.race', '0'); } catch { /* storage unavailable */ } applyRace(); });
let lastShadowAt = new THREE.Vector3(1e9, 0, 0);
function startFlight() {
  if (!flight || flight.active) return;
  controls.enabled = false;
  if (race) startRace();
  else {
    // free flight from where the camera is, facing the way it looked
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    flight.start(controls.target, -az);
  }
  document.body.classList.add('flying');
  flyHud.hidden = false;
  flyResult.hidden = true;
  applyRace();
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
  game.group.visible = false;
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

// keyboard + gamepad navigation on the map (flight has its own controls)
const mapInput = createMapInput({ controls, camera, isActive: () => !!flight && !flight.active && !document.querySelector('dialog[open]') });
const padPrev = { a: false, b: false, x: false, y: false, start: false };
let padHintShown = false;
addEventListener('gamepadconnected', (e) => console.log('gamepad:', e.gamepad.id, e.gamepad.mapping || 'non-standard (DirectInput)'));

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  SHARED.uTime.value += dt;
  if (flight?.active || live) governQuality(dt);
  controls.update();
  if (!flight) return; // created last in init(): everything else exists
  // ---- gamepad
  const pad = readPad();
  if (pad) {
    if (flight.active) {
      flight.pad.turn = pad.lx;
      flight.pad.climb = -pad.ly;
      flight.pad.boost = pad.a || pad.rt > 0.3;
      if (pad.b && !padPrev.b) stopFlight();
      if (pad.x && !padPrev.x) raceBtn.click(); // race on/off
      if (pad.start && !padPrev.start && race) { flyResult.hidden = true; startRace(); } // restart race
    } else if (pad.y && !padPrev.y) startFlight();
    Object.assign(padPrev, { a: pad.a, b: pad.b, x: pad.x, y: pad.y, start: pad.start });
    if (!padHintShown) { padHintShown = true; document.body.classList.add('has-pad'); }
  } else if (flight.active) Object.assign(flight.pad, { turn: 0, climb: 0, boost: false });
  // ---- keyboard / pad map navigation; keep the orbit target on the ground
  if (mapInput.update(dt, pad)) {
    const g = terrain.at(controls.target.x, controls.target.z);
    const dy = (g - controls.target.y) * Math.min(1, dt * 4);
    controls.target.y += dy;
    camera.position.y += dy;
    camDirty = true;
  }
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.4);
    const e = tween.t * tween.t * (3 - 2 * tween.t);
    applyTime(blendTimes({ ...tween.from, sunDir: tween.from.sunDir.toArray(), sun: tween.from.sun, sky: tween.from.sky, gnd: tween.from.gnd, paper: tween.from.paper, haze: tween.from.haze, ink: tween.from.ink, grade: tween.from.grade.toArray() }, tween.to, e));
    if (tween.t >= 1) tween = null;
    fitShadow(flight?.active ? 1100 : undefined);
    ink.reset();
  }
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
    // race HUD (only when the race is on)
    if (race) {
    game.update(dt, flight.pos);
    const g = game.state;
    flyGame.textContent = g.finished ? `🏁 ${fmtTime(g.time)} · 🎈 ${g.popped}/${g.balloons}` : `◎ ${g.next}/${g.total} · ⏱ ${fmtTime(g.time)} · 🎈 ${g.popped}/${g.balloons}`;
    if (flyFlash.textContent !== g.flash) flyFlash.textContent = g.flash;
    if (!g.finished) {
      const t = g.nextRing.p, p = flight.pos;
      const bearing = Math.atan2(t.x - p.x, -(t.z - p.z));
      flyArrow.style.transform = `rotate(${bearing - flight.yaw}rad)`;
      const dm = Math.hypot(t.x - p.x, t.z - p.z);
      flyDist.textContent = `${g.nextRing.name} · ${dm > 1000 ? (dm / 1000).toFixed(1) + ' км' : Math.round(dm) + ' м'}`;
    } else {
      flyDist.textContent = 'Финиш!';
    }
    if (g.finished && !resultShown) {
      resultShown = true;
      document.getElementById('res-time').textContent = fmtTime(g.time);
      document.getElementById('res-balloons').textContent = `${g.popped}/${g.balloons}`;
      document.getElementById('res-best').textContent = g.newBest ? 'Нов рекорд! 🎉' : `Рекорд: ${fmtTime(g.best)}`;
      flyResult.hidden = false;
    }
    }
    document.getElementById('fly-boost').classList.toggle('on', h.boost);
    traffic.update(dt, camera, controls.target);
    clouds.update(dt);
    birds.update(dt);
    landmarks.update(dt);
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
  if (live) {
    traffic.update(dt, camera, controls.target);
    clouds.update(dt);
    birds.update(dt, THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / 700, 1, 5));
    landmarks.update(dt);
  }
  labels.update(camera, controls.target);
  if (!live && ink.converged) return; // static & fully supersampled: idle
  ink.render(scene, camera, live);
});

window.__dbg = { scene, renderer, sun, camera, controls, ink, get city() { return city; }, get flight() { return flight; } };

init().catch((e) => {
  console.error(e);
  loadText.textContent = 'Грешка: ' + e.message;
});
