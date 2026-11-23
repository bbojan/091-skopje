import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { computeCitySteps, assembleCity, PAL, SHARED, type City, type CityDesc, type CityStage } from './city.ts';
import { TIMES, TIME_ORDER, blendTimes, presetOf, createLamps, isTimeName, type TimeName, type TimePreset, type TimeState } from './sky.ts';
import { WEATHER, WEATHER_ORDER, blendWeather, isWeatherName, overcastColor, type Weather, type WeatherName } from './sky.ts';
import { createPrecip, type Precip } from './weather.ts';
import { createTraffic } from './traffic.ts';
import { Terrain } from './terrain.ts';
import { InkRenderer } from './post.ts';
import { createClouds, createBirds, createParagliders } from './atmos.ts';
import { createFlight, type Flight } from './flight.ts';
import { createDrive, type Drive } from './drive.ts';
import { createWalk, type Walk, type WalkAction } from './walk.ts';
import { createGame, fmtTime, type Game } from './game.ts';
import { createFireMode, WATER_FLOOR, type FireMode } from './fire.ts';
import { createRockets, type Rockets } from './rockets.ts';
import { createLandmarks, landmarkFootprints, landmarkGround } from './landmarks.ts';
import { createSound } from './sound.ts';
import { createLabels } from './labels.ts';
import { createMapInput, readPad } from './input.ts';
import { LANGS, lang, t, applyI18n, setLang, onLangChange, type Key } from './i18n.ts';
import { CITIES, CITY_IDS, cityFromUrl, urlForCity, type CityId, type CitySpec } from './cities.ts';
import { loadCountry, createCountryView, type CountryView } from './country.ts';
import { createCountryGround, type CountryGround } from './countryground.ts';
import { createRadar, type Radar, type MapState } from './radar.ts';
import { createPrefetch, lookAhead, mapAt, inMap, type Ahead, type MapFiles } from './hop.ts';
import type { CityData, MapMeta, TerrainMeta, Vec3 } from './types.ts';

/** From package.json, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

declare global {
  interface Window {
    setView: (name: string) => void;
    __dbg: unknown;
  }
}

/** An element from index.html that must exist. */
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
}

applyI18n();

/** The city on the map: from the address (`?city=kavadarci`), Skopje without it. */
let city: CitySpec = CITIES[cityFromUrl()];

const app = $('app');
const status = $('status');
/** On/off options are drawn as switches (CSS `.switch`); the state lives in aria-pressed. */
function setOn(btn: HTMLElement, on: boolean): void { btn.setAttribute('aria-pressed', String(on)); }

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// Render resolution adapts to frame time. 1.5x is the top level: still frames
// are supersampled by temporal accumulation anyway. Phones start lower.
const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports a Mac
  || matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
// resolution levels; the low quality tier adds two more at the bottom
const BASE_Q = [1.5, 1.25, 1.0, 0.8], LOW_Q = [...BASE_Q, 0.6, 0.5];
const qLevels = (list: number[]) => list.map((q) => Math.min(window.devicePixelRatio, q));
let QUALITY = qLevels(BASE_Q);
let qLevel = MOBILE ? 2 : 0;
let dpr = QUALITY[qLevel];
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
app.appendChild(renderer.domElement);
// phones / tablets get two joysticks in every mode (index.html: `body.mobile .stick`); also when a touch
// screen appears later (the browser's device emulation switched on without a reload)
const coarse = matchMedia('(pointer: coarse)');
const markMobile = () => document.body.classList.toggle('mobile', MOBILE || coarse.matches);
markMobile();
coarse.addEventListener('change', markMobile);

const scene = new THREE.Scene();
const sceneBg = new THREE.Color(PAL.paper);
scene.background = sceneBg;
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
/** what stays in the scene from one city to the next; everything else belongs to the loaded city */
const SCENE_BASE = new Set<THREE.Object3D>(scene.children);
const SUN_DIR = new THREE.Vector3(-0.7, 0.9, 0.32).normalize(); // updated by the time of day

const ink = new InkRenderer(renderer);
ink.setSize(innerWidth, innerHeight, dpr);
function setQuality(level: number): void {
  qLevel = Math.max(0, Math.min(QUALITY.length - 1, level));
  if (QUALITY[qLevel] === dpr) return;
  dpr = QUALITY[qLevel];
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  ink.setSize(innerWidth, innerHeight, dpr);
  camDirty = true;
}
// Quality: 'auto' switches to the low tier by itself when the device is too slow;
// 'high' keeps the full tier at the top resolution (no governor); 'low' always uses the low tier. Low tier: no MSAA, no AO, no cloud shadows, 1024 shadow map,
// shorter tree detail distances, two extra resolution steps.
type QualityMode = 'auto' | 'high' | 'low';
const QUALITY_ORDER: QualityMode[] = ['auto', 'high', 'low'];
let qualityMode: QualityMode = 'auto';
try { const v = localStorage.getItem('skopje.quality'); if (v === 'low' || v === 'high') qualityMode = v; } catch { /* storage unavailable */ }
if (qualityMode === 'high') { qLevel = 0; dpr = QUALITY[0]; renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight); }
let lowTier = false;
let shadowRes = 2048; // set from the device in init()
function setLowTier(on: boolean): void {
  if (on === lowTier) return;
  lowTier = on;
  QUALITY = qLevels(on ? LOW_Q : BASE_Q);
  setQuality(qLevel);
  ink.setLow(on);
  const size = on ? 1024 : shadowRes;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  world?.city.setLODScale((MOBILE ? 0.65 : 1) * (on ? 0.6 : 1));
  if (world) applyTime(timeNow, wxNow, world); // cloud shadows follow the tier
  qualityBtn.textContent = qualityLabel();
  camDirty = true;
}
// frame-time governor: only while frames are rendered continuously and visible
const perf = { avg: 1 / 60, sinceChange: 0 };
function governQuality(dt: number): void {
  if (qualityMode === 'high' || document.hidden || dt > 0.25) return;
  perf.avg += (dt - perf.avg) * 0.05;
  perf.sinceChange += dt;
  if (perf.avg > 1 / 40 && perf.sinceChange > 2 && qLevel < QUALITY.length - 1) { setQuality(qLevel + 1); perf.sinceChange = 0; }
  // already at the lowest resolution and still slow: switch to the low tier (stays on for this visit)
  else if (qualityMode === 'auto' && !lowTier && perf.avg > 1 / 40 && perf.sinceChange > 3) { setLowTier(true); perf.sinceChange = 0; }
  else if (perf.avg < 1 / 57 && perf.sinceChange > 8 && qLevel > 0) { setQuality(qLevel - 1); perf.sinceChange = 0; }
}

/** Everything built while loading; null until the city is ready. */
interface World {
  spec: CitySpec;
  /** ends the window listeners of the city's flight, bus and walking */
  abort: AbortController;
  terrain: Terrain;
  meta: MapMeta;
  city: City;
  traffic: ReturnType<typeof createTraffic>;
  clouds: ReturnType<typeof createClouds>;
  birds: ReturnType<typeof createBirds>;
  gliders: ReturnType<typeof createParagliders>;
  lamps: ReturnType<typeof createLamps>;
  precip: Precip;
  landmarks: ReturnType<typeof createLandmarks>;
  labels: ReturnType<typeof createLabels>;
  game: Game;
  fire: FireMode;
  /** the F-15's rockets */
  rockets: Rockets;
  flight: Flight;
  drive: Drive;
  walk: Walk;
  /** where the plane is parked while walking */
  planeSpot: { x: number; z: number; yaw: number };
}
let world: World | null = null;
let live = true;
let camDirty = true;

interface View { t: Vec3; d: number; polar: number; az: number }
const VIEWS: Record<string, View> = {};

// ---------------- loading: the city is built in stages while a progress card shows
const loader = $('loader');
const loadBar = $('load-bar'), loadText = $('load-text');
type StageKey = 'download' | CityStage | 'assemble' | 'bake';
// [progress at start, at end]; the label is i18n key `stage.<name>`
const STAGES: Record<StageKey, [number, number]> = {
  download: [0, 0.35],
  terrain: [0.35, 0.42],
  ground: [0.42, 0.55],
  buildings: [0.55, 0.72],
  cars: [0.72, 0.78],
  trees: [0.78, 0.9],
  pack: [0.9, 0.93],
  assemble: [0.93, 0.97],
  bake: [0.97, 1.0],
};
const STAGE_KEYS = Object.keys(STAGES) as StageKey[];
let lastStage: StageKey = 'download';
/** how far the map being loaded is, 0…1 (the radar shows it for the map the F-15 flies into) */
let buildProgress = 0;
function showProgress(stage: StageKey, f: number): void {
  const st = STAGES[stage];
  // stages report completion; show the next stage's label while it works
  const after = STAGE_KEYS[STAGE_KEYS.indexOf(stage) + 1];
  const next = f >= 1 && after ? after : stage;
  lastStage = next;
  buildProgress = st[0] + (st[1] - st[0]) * f;
  loadBar.style.width = `${Math.round(buildProgress * 100)}%`;
  loadText.textContent = t(`stage.${next}`);
}
async function fetchJSON<T>(url: string, onProgress: (f: number) => void, expected = 7e6, onBytes?: () => void): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || expected;
  if (!res.body) return res.json() as Promise<T>;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
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
  onBytes?.();
  return JSON.parse(new TextDecoder().decode(all)) as T;
}
// Yield between build stages. Visible: wait for a frame so the progress bar
// repaints. Hidden tab: rAF doesn't fire and timers are clamped to 1 s, so use
// a MessageChannel hop (never throttled) — nothing needs painting anyway.
const chan = new MessageChannel();
const chanQueue: (() => void)[] = [];
chan.port1.onmessage = () => chanQueue.shift()?.();
const nextFrame = () => new Promise<void>((resolve) => {
  let done = false;
  const go = () => { if (!done) { done = true; resolve(); } };
  if (document.hidden) { chanQueue.push(go); chan.port2.postMessage(0); return; }
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 100); // rAF may never fire in an occluded or minimised window
});

let loading = false;
let shadowReady = false;
// ---------------- the F-15 from map to map (src/hop.ts): the maps ahead downloaded while it flies, switched at the edge
const prefetch = createPrefetch(MOBILE ? { maxMaps: 1, budget: 20e6 } : { maxMaps: 3, budget: 80e6 });
/** the next map's downloaded files, for loadCity */
let hopFiles: { id: CityId; files: MapFiles } | null = null;
/** the flight carried into the next map: where (lat / lon), heading, height above the ground, speed, pitch, keys held */
let hopCarry: { lat: number; lon: number; yaw: number; agl: number; speed: number; pitch: number; input: Record<string, number | boolean> } | null = null;
/** the map straight ahead (the HUD chip), refreshed once a second */
let hopAhead: Ahead | null = null;
/** every map the prediction sees ahead (desktop: also ±45°), downloading or not: the radar marks the waiting ones */
let hopSeen = new Set<CityId>();
let hopCheck = 0;
const BUILD_S = MOBILE ? 15 : 5; // a guess at building a map, s (docs/NOTES.md "Load times per step": 1–5 s desktop)
let hopping = false;
/** the map being built while the F-15 flies into it */
let hopTarget: CityId | null = null;
// ---------------- the F-15's radar (src/radar.ts): desktop only, drawn while the F-15 flies
let radar: Radar | null = null;
function radarState(id: CityId): MapState {
  if (id === hopTarget) return 'loading'; // being built
  if (id === city.id && !hopTarget) return 'current';
  if (prefetch.has(id)) return 'ready';
  if (prefetch.loading(id)) return 'downloading'; // ahead of the plane: quieter than entering
  if (prefetch.queued(id)) return 'queued'; // next in line after the running download
  if (hopSeen.has(id)) return 'waiting'; // ahead, too far to start yet
  return 'open';
}
function drawRadar(f: Flight, meta: MapMeta): void {
  if (!radar || document.body.classList.contains('mobile')) return;
  const p = f.pos;
  radar.draw(meta.lat0 - p.z / meta.ky, meta.lon0 + p.x / meta.kx, f.yaw, radarState, (id) => (id === hopTarget ? buildProgress : prefetch.progress(id)), SHARED.uTime.value);
}
/** the F-15 flying on over the country's ground while the next map builds (the old map's plane and coordinates) */
let transit: { flight: Flight; ground: CountryGround; abort: AbortController; meta: MapMeta } | null = null;
const latLonOf = (w: World, x: number, z: number): [number, number] => [w.meta.lat0 - z / w.meta.ky, w.meta.lon0 + x / w.meta.kx];
/** the F-15 may fly on over the edge here: a finished map lies ahead, or under it already */
function edgeOpen(x: number, z: number): boolean {
  const w = world;
  if (!w || !w.flight.jet) return false;
  const [lat, lon] = latLonOf(w, x, z);
  if (!inMap(w.spec.id, lat, lon)) return !!mapAt(lat, lon, w.spec.id);
  // looked up here, not from the once-a-second prediction: right after a take-off near an edge it is not there yet
  return !!lookAhead(w.meta, w.spec.id, x, z, w.flight.yaw, Math.max(w.flight.speed, 300));
}
/** once a second while the F-15 flies: the maps ahead (desktop: also ±45°), downloaded in time */
function hopPredict(w: World): void {
  const f = w.flight, p = f.pos;
  const yaws = MOBILE ? [f.yaw] : [f.yaw, f.yaw - Math.PI / 4, f.yaw + Math.PI / 4];
  const found: Ahead[] = [];
  yaws.forEach((y, k) => {
    const a = lookAhead(w.meta, w.spec.id, p.x, p.z, y, Math.max(f.speed, 300));
    if (k === 0) hopAhead = a;
    if (a && !found.some((b) => b.id === a.id)) found.push(a);
  });
  hopSeen = new Set(found.map((a) => a.id));
  // a download starts when the edge is closer than twice (download + build)
  const want = found.filter((a) => a.eta < 2 * (prefetch.seconds(a.id) + BUILD_S)).sort((a, b) => a.eta - b.eta).map((a) => a.id);
  prefetch.want(want);
}
/** the HUD chip: the map ahead, its download, ✓ when ready; hidden when nothing lies ahead */
function hopChip(): void {
  const el = $('fly-next');
  const a = hopAhead;
  el.hidden = !a;
  if (!a) return;
  const pr = prefetch.progress(a.id), n = Math.round(pr * 4);
  setText('fly-next', `→ ${CITIES[a.id].name.split(', ')[0]} ${pr >= 1 ? '✓' : '▓'.repeat(n) + '░'.repeat(4 - n)}`);
}
/** the plane has left this map for a finished one whose files are here: switch, the flight carried over */
async function hop(id: CityId): Promise<void> {
  const w = world;
  if (!w || hopping || loading) return;
  const files = prefetch.take(id);
  if (!files) return;
  hopping = true;
  hopTarget = id;
  const f = w.flight, p = f.pos;
  const [lat, lon] = latLonOf(w, p.x, p.z);
  hopCarry = { lat, lon, yaw: f.yaw, agl: p.y - groundAt(p.x, p.z), speed: f.speed, pitch: f.pitch, input: { ...f.input } };
  hopFiles = { id, files };
  const fade = $('hop-fade');
  document.body.classList.add('hop'); // the loader shows small (name and bar only)
  if (cground && cgroundFor === w && cground.visible) {
    // fly on over the country's ground while the next map builds in time slices (no fade)
    const ground = cground;
    transit = { flight: f, ground, abort: w.abort, meta: w.meta };
    f.setGround((x, z) => ground.height(x, z));
    f.setEdgeOpen(() => true);
  } else {
    fade.classList.add('on');
    await new Promise((r) => setTimeout(r, 260));
  }
  try {
    await switchCity(id);
    if (transit && world?.spec.id === id) await warmUp(world, transit);
  } finally {
    const tr = transit;
    if (tr) {
      // where the plane is now, in the old map's coordinates, carried into the new one
      transit = null;
      const tf = tr.flight, tp = tf.pos;
      hopCarry = { lat: tr.meta.lat0 - tp.z / tr.meta.ky, lon: tr.meta.lon0 + tp.x / tr.meta.kx, yaw: tf.yaw, agl: tp.y - tr.ground.height(tp.x, tp.z), speed: tf.speed, pitch: tf.pitch, input: { ...tf.input } };
      for (const o of [tf.plane, tr.ground.mesh]) { scene.remove(o); disposeTree(o); }
      const fl = new Set<THREE.Object3D>(tf.flames);
      for (let i = ink.skipNormal.length - 1; i >= 0; i--) if (fl.has(ink.skipNormal[i])) ink.skipNormal.splice(i, 1);
      tr.abort.abort();
      ink.setClipping(mapPlanes);
    }
    const c = hopCarry;
    hopCarry = null;
    hopping = false;
    hopTarget = null;
    if (c && world && world.spec.id === id) {
      const m = world.meta, x = (c.lon - m.lon0) * m.kx, z = -(c.lat - m.lat0) * m.ky;
      startFlight(new THREE.Vector3(x, 0, z), c.yaw, c);
      Object.assign(world.flight.input, c.input); // keys still held (turbo, a turn)
    }
    fade.classList.remove('on');
    document.body.classList.remove('hop');
  }
}
/**
 * The new map's first frame would upload all of its geometry to the GPU at once (~0.6 s for Скопје): done during
 * the transit instead, a few meshes per frame drawn into a tiny target from where the plane will come in.
 */
async function warmUp(w: World, tr: NonNullable<typeof transit>): Promise<void> {
  const f = tr.flight, p = f.pos, m = w.meta;
  const lat = tr.meta.lat0 - p.z / tr.meta.ky, lon = tr.meta.lon0 + p.x / tr.meta.kx;
  const x = (lon - m.lon0) * m.kx, z = -(lat - m.lat0) * m.ky, dx = Math.sin(f.yaw), dz = -Math.cos(f.yaw);
  const y = w.terrain.at(x, z) + (p.y - tr.ground.height(p.x, p.z));
  const cam = new THREE.PerspectiveCamera(70, camera.aspect, 4, 30000);
  cam.position.set(x - dx * 60, y + 15, z - dz * 60);
  cam.lookAt(x + dx * 900, y - 250, z + dz * 900);
  cam.updateMatrixWorld();
  w.city.updateLOD(cam);
  const keep = new Set<THREE.Object3D>([f.plane, tr.ground.mesh, ...SCENE_BASE]);
  const tops = scene.children.filter((o) => !keep.has(o));
  const items = tops.flatMap((o) => (o === w.city.group ? o.children : [o]));
  const was = new Map<THREE.Object3D, boolean>();
  for (const o of [...tops, ...items]) was.set(o, o.visible);
  const rt = new THREE.WebGLRenderTarget(32, 32);
  const kept = [...keep].filter((o) => o.visible);
  let t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (!was.get(items[i])) continue; // not drawn now (another level of detail): uploaded when it is needed
    for (const o of was.keys()) o.visible = false;
    for (const o of kept) o.visible = false;
    w.city.group.visible = true;
    items[i].visible = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    for (const [o, v] of was) o.visible = v;
    for (const o of kept) o.visible = true;
    if (performance.now() - t0 > 10) { await nextFrame(); t0 = performance.now(); }
  }
  rt.dispose();
}
/** a frame of the transit: the old plane flies on over the country's ground; the new map, still building in the
 *  scene in its own coordinates, is hidden meanwhile */
function transitFrame(dt: number): void {
  const tr = transit!, f = tr.flight;
  f.update(dt);
  tr.ground.update(f.pos.x, f.pos.z);
  controls.target.copy(f.pos);
  camera.near = 4; camera.far = 90000; camera.updateProjectionMatrix();
  heatHaze(f);
  drawRadar(f, tr.meta);
  const h = f.hud;
  flyStats.textContent = `${h.kmh} ${t('u.kmh')} · ${h.alt} ${t('u.m')}`;
  if (soundOn) sound.update(dt, { mode: 'fly', speed: THREE.MathUtils.clamp((h.kmh - 662) / 1988, 0, 1), tractor: false, jet: true, burner: THREE.MathUtils.clamp((h.kmh - 1325) / 1325, 0, 1), dropping: false, scooping: false, fire: 0, rain: wxNow.rain, night: timeNow.night, near: 0 });
  const shown = new Set<THREE.Object3D>([f.plane, tr.ground.mesh, sun.target, ...SCENE_BASE]);
  const hidden = scene.children.filter((o) => !shown.has(o) && o.visible);
  for (const o of hidden) o.visible = false;
  ink.setClipping([]);
  ink.reset();
  ink.render(scene, camera, true);
  for (const o of hidden) o.visible = true;
}
/** every frame while the F-15 flies: predict, and switch once the plane is over the next map */
function hopUpdate(dt: number, w: World): void {
  hopCheck -= dt;
  if (hopCheck <= 0) { hopCheck = 1; hopPredict(w); }
  prefetch.pause(perf.avg > 1 / 45); // slow frames: no new download meanwhile
  hopChip();
  const p = w.flight.pos, [lat, lon] = latLonOf(w, p.x, p.z);
  if (inMap(w.spec.id, lat, lon)) return;
  const id = mapAt(lat, lon, w.spec.id);
  if (!id) return;
  if (prefetch.has(id)) void hop(id);
  else if (prefetch.progress(id) === 0) prefetch.want([id]); // over the next map already: get it now
}
/** the map's clipping planes (the ink's normal pass is clipped to them, except while the country's ground shows) */
let mapPlanes: THREE.Plane[] = [];
// ---------------- the country's 100 m terrain around the map, while the F-15 flies (src/countryground.ts)
let cground: CountryGround | null = null;
let cgroundFor: World | null = null; // the world it was built for (null while loading the data)
let cgroundLoading = false;
/** the ground at a scene point: the map's terrain on the map, the country's beyond its edges (when loaded) */
function groundAt(x: number, z: number): number {
  const w = world;
  if (!w) return 0;
  if (cground && cgroundFor === w && (Math.abs(x) > w.meta.w / 2 || Math.abs(z) > w.meta.h / 2)) return cground.height(x, z);
  return w.terrain.at(x, z);
}
/** show the country's ground around the map (downloaded the first time), or hide it */
function showCountryGround(on: boolean, x = 0, z = 0): void {
  const w = world;
  if (!w) return;
  if (on && (!cground || cgroundFor !== w)) {
    if (!cgroundLoading) {
      cgroundLoading = true;
      loadCountry(() => {}).then((data) => {
        cgroundLoading = false;
        if (world !== w) return; // another map by now: built on the next frame
        cground = createCountryGround({ data, meta: w.meta, exag: w.spec.terrainExag, mobile: MOBILE });
        if (!radar && !MOBILE) radar = createRadar({ data, canvas: $<HTMLCanvasElement>('radar') }); // desktop only: no room on phones
        cgroundFor = w;
        scene.add(cground.mesh);
      }).catch((e) => { cgroundLoading = false; console.warn('country terrain:', e); });
    }
    return;
  }
  if (!cground || cgroundFor !== w) return;
  if (on !== cground.visible) {
    cground.setVisible(on);
    ink.setClipping(on ? [] : mapPlanes); // its depth beyond the map is needed for the haze and the ink lines
    w.flight.setGround(on ? groundAt : null);
    camDirty = true;
  }
  if (on) cground.update(x, z);
}
/** how long each step of the last load took, ms (window.__dbg.loadTimes; docs/NOTES.md "Load times") */
let loadTimes: Record<string, number> = {};
/** how long taking the last map apart took, ms (__dbg.loadUnload) */
let loadUnload = 0;
/** the longest single piece of each step (main-thread work between two frames), ms: __dbg.loadMax */
let loadMax: Record<string, number> = {};
/** Builds the city in stages behind the loading card; `world` is set when everything exists. */
async function loadCity(spec: CitySpec): Promise<void> {
  loading = true;
  showLoader(spec);
  const t0 = performance.now();
  loadTimes = {};
  loadMax = {};
  let tMark = t0;
  const mark = (k: string) => { const n = performance.now(); loadTimes[k] = Math.round((loadTimes[k] ?? 0) + n - tMark); loadMax[k] = Math.max(loadMax[k] ?? 0, Math.round(n - tMark)); tMark = n; };
  showProgress('download', 0);
  // the F-15 flying in: the files were downloaded while it flew (src/hop.ts)
  const pre = hopFiles?.id === spec.id ? hopFiles.files : null;
  hopFiles = null;
  let data: CityData, tm: TerrainMeta, tb: ArrayBuffer;
  if (pre) {
    const dec = new TextDecoder();
    data = JSON.parse(dec.decode(pre.scene)) as CityData;
    tm = JSON.parse(dec.decode(pre.terrainJson)) as TerrainMeta;
    tb = pre.terrainBin;
    mark('parse');
  } else {
    const terrainP = Promise.all([
      fetch(spec.files.terrainJson).then((r) => r.json() as Promise<TerrainMeta>),
      fetch(spec.files.terrainBin).then((r) => r.arrayBuffer()),
    ]);
    data = await fetchJSON<CityData>(spec.files.scene, (f) => showProgress('download', f * 0.95), spec.sceneBytes, () => mark('download'));
    mark('parse');
    [tm, tb] = await terrainP;
    mark('download');
  }
  showProgress('download', 1);
  await nextFrame();
  mark('yield');
  // build on the main thread in stages, letting the progress bar repaint between them
  // (a background worker gets throttled to a fraction of this speed)
  const terrain = new Terrain(tm, new Uint16Array(tb), spec.terrainExag);
  const steps = computeCitySteps(data, terrain, { density: MOBILE ? 0.5 : 1, stream: memorySaver, treeThin: spec.treeThin, vineyards: spec.vineyards, vineShare: spec.vineShare, sliceMs: transit ? 12 : undefined });
  let desc: CityDesc;
  for (;;) {
    const r = steps.next();
    if (r.done) { desc = r.value; mark('pack'); break; }
    mark(r.value);
    showProgress(r.value, 1);
    await nextFrame();
    mark('yield');
  }
  const meta = desc.meta = data.meta;
  const { w: W, h: H } = meta;
  const m = 0.5;
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), W / 2 + m),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2 + m),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), H / 2 + m),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), H / 2 + m),
  ];
  ink.setClipping(planes);
  mapPlanes = planes;
  showProgress('pack', 1);
  await nextFrame();
  mark('yield');
  const city = assembleCity(desc, { clippingPlanes: planes, stream: memorySaver });
  scene.add(city.group);
  if (MOBILE || lowTier) city.setLODScale((MOBILE ? 0.65 : 1) * (lowTier ? 0.6 : 1));
  mark('assemble');
  showProgress('assemble', 1);
  await nextFrame();
  mark('yield');
  city.bakeGround(renderer, MOBILE ? 256 : 512, spec.sparseFar ?? 0);
  mark('bake');
  const platform = landmarkGround(data, terrain); // raised monument terraces: people walk on top
  const traffic = createTraffic(city, terrain, { clippingPlanes: planes, buses: spec.buses, platform, ...(MOBILE ? { cars: 2500, people: 5000 } : {}) });
  traffic.setLight(lightTraffic);
  scene.add(traffic.group);
  const clouds = createClouds({ hw: W / 2, hh: H / 2 }, 1080);
  const birds = createBirds(terrain, { hw: W / 2, hh: H / 2 }, planes);
  // paragliders over Vodno, below the Millennium Cross (Skopje only: elsewhere none)
  const vodnoCross = (data.crosses || []).find((c) => /Millennium|Милениум/.test(c.name)) ?? { x: -2736, z: 4451 };
  const gliders = createParagliders(terrain, vodnoCross, planes, spec.gliders ? (MOBILE ? 5 : 8) : 0);
  scene.add(clouds.group, birds.group, gliders.group);
  ink.compMat.uniforms.clouds.value = clouds.uniforms;
  const lamps = createLamps(city.roadList, terrain, { hw: W / 2, hh: H / 2 }, planes);
  scene.add(lamps.group);
  const precip = createPrecip({ hw: W / 2, hh: H / 2 }, MOBILE ? 9000 : 24000);
  scene.add(precip.mesh);
  ink.skipNormal.push(...lamps.glows, ...traffic.glows, clouds.group, precip.mesh); // soft, see-through: no ink lines
  applyTime(timeNow, wxNow, { clouds, lamps, traffic, precip, gliders });
  const landmarks = createLandmarks({ data, terrain, clippingPlanes: planes });
  const labels = createLabels({ city: spec, meta, terrain, crosses: data.crosses || [], places: data.places || {}, container: $('labels') });
  try { labels.enabled = localStorage.getItem('skopje.labels') !== '0'; } catch { /* storage unavailable */ }
  setOn(namesBtn, labels.enabled);
  scene.add(landmarks.group);
  ink.skipNormal.push(...landmarks.noInk); // the fountains' jets
  try { await document.fonts.load("46px 'Rubik Mono One'"); await document.fonts.load("700 140px 'Lora'", spec.banners.fire + spec.banners.roll); } catch { /* font optional */ }
  const game = createGame({ city: spec, terrain, meta, crosses: data.crosses || [], places: data.places || {}, clippingPlanes: planes });
  scene.add(game.group);
  ink.skipNormal.push(game.beam);
  const abort = new AbortController();
  const flight = createFlight({ scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 }, signal: abort.signal, banner: { ...spec.banners, code: spec.code } });
  flight.setInvertY(invertPlane);
  ink.skipNormal.push(...flight.flames); // the F-15's afterburner: see-through
  const rockets = createRockets({ ground: groundAt, light: MOBILE });
  scene.add(rockets.group);
  ink.skipNormal.push(...rockets.noInk);
  // firefighting: fires, smoke and water are see-through (no ink lines)
  const fire = createFireMode({
    terrain, bounds: { hw: W / 2, hh: H / 2 }, areas: data.areas, buildings: data.buildings, light: MOBILE,
    bus: { hold: traffic.holdBus, release: traffic.releaseBus },
    onOut: () => flight.celebrate(),
  });
  scene.add(fire.group);
  ink.skipNormal.push(fire.group);
  fire.setNight(timeNow.night);
  fire.setRain(wxNow.rain);
  const drive = createDrive({ scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 }, roads: city.roadList, signal: abort.signal });
  // walking: the plane waits on the main square
  const sq = data.places?.square ?? data.meta.square;
  const planeSpot = { x: sq[0] + 40, z: sq[1] + 22, yaw: Math.PI / 2 };
  const walk = createWalk({
    city: spec, signal: abort.signal, scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 }, meta, places: data.places || {}, buildings: [...data.buildings, ...landmarkFootprints(data, terrain)], platform,
    areas: data.areas, roads: city.roadList,
    crosses: data.crosses || [], gondola: landmarks.gondola, planeSpot,
    hooks: { nearestBus: traffic.nearestBus, startOro: traffic.startOro, stopOro: traffic.stopOro, scatter: traffic.scatter, startle: birds.startle },
  });
  walk.setInvertY(invertY);
  world = { spec, abort, terrain, meta, city, traffic, clouds, birds, gliders, lamps, precip, landmarks, labels, game, fire, rockets, flight, drive, walk, planeSpot };
  mark('extras'); // traffic, lamps, landmarks, labels, games, vehicles
  console.log('city ready in', Math.round(performance.now() - t0), 'ms', city.stats, traffic.counts);

  if (!shadowReady) { // once per visit: the shadow map stays from one city to the next
    shadowReady = true;
    const maxTex = renderer.capabilities.maxTextureSize;
    shadowRes = Math.min(MOBILE ? 2048 : 8192, maxTex);
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.5;
    sun.shadow.radius = 2;
    if (qualityMode === 'low') setLowTier(true);
  }

  // camera views of this city: around a lat/lon, at an exact place from the data, or a scene point
  const at = (lat: number, lon: number): Vec3 => { const x = (lon - meta.lon0) * meta.kx, z = -(lat - meta.lat0) * meta.ky; return [x, terrain.at(x, z), z]; };
  for (const k of Object.keys(VIEWS)) delete VIEWS[k];
  for (const [name, v] of Object.entries(spec.views)) {
    const pl = v.place ? data.places?.[v.place] : undefined;
    const tg: Vec3 = v.xyz ?? (pl ? [pl[0], terrain.at(...pl), pl[1]] : at(...v.ll!));
    VIEWS[name] = { t: tg, d: v.d, polar: v.polar, az: v.az };
  }
  applyHash() || setView('center');
  // memory saver: build the detailed ground around the first view before showing it
  for (let i = 0; i < 400; i++) { city.updateLOD(camera); if (!city.streamPending) break; await nextFrame(); }
  mark('stream');
  // the first frame compiles the shaders (the F-15 flying in: compiled without drawing, the camera is the old map's)
  if (transit) renderer.compile(scene, camera);
  else ink.render(scene, camera, false);
  renderer.getContext().finish();
  ink.reset();
  mark('shaders');
  loadTimes.total = Math.round(performance.now() - t0);
  console.log('load times (ms)', JSON.stringify(loadTimes));
  showProgress('bake', 1);
  status.textContent = '';
  hideLoader();
  loading = false;
  if (f15Pending && !queuedCity) setTimeout(takeOffF15, 0);
}

// ---------------- cities: the badge at the top left picks one; the choice lives in the address (?city=)
function showLoader(spec: CitySpec): void {
  clearTimeout(loaderTimer);
  loader.hidden = false;
  loader.classList.remove('done');
  loadBar.style.width = '0%';
  applyCityChrome(spec);
}
let loaderTimer = 0;
function hideLoader(): void {
  loader.classList.add('done');
  loaderTimer = setTimeout(() => { loader.hidden = true; }, 700);
}
/** Badge, title, help and the city's own menu items (`data-city` in index.html). */
function applyCityChrome(spec: CitySpec): void {
  titleBase = `${spec.code} ${spec.name}`;
  document.title = titleBase;
  $<HTMLLinkElement>('favicon').href = spec.icon;
  for (const id of CITY_IDS) document.body.classList.toggle(`city-${id}`, id === spec.id);
  document.body.classList.toggle('no-buses', !spec.buses); // hides 🚌 (the drivable ЈСП bus)
  document.querySelectorAll<HTMLElement>('.city-code').forEach((el) => (el.textContent = spec.code));
  // a map with more towns ("Ростуше, Дебар, Маврово"): the first town, then the others in their own span, which
  // narrow screens put on a smaller second line (CSS: .city-name .more)
  const [first, ...more] = spec.name.split(', ');
  document.querySelectorAll<HTMLElement>('.city-name').forEach((el) => {
    el.textContent = first;
    if (!more.length) return;
    const m = document.createElement('span');
    m.className = 'more';
    m.innerHTML = '<span class="sep">, </span>';
    m.append(more.join(', '));
    el.append(m);
  });
  cityMenu.querySelectorAll<HTMLElement>('[data-city-id]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cityId === spec.id)));
  weatherBtn.textContent = weatherLabel();
}

/** Frees the GPU buffers and textures of everything under `root`. */
function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  for (const mat of mats) {
    for (const v of Object.values(mat)) if (v instanceof THREE.Texture) texs.add(v);
    const u = (mat as THREE.ShaderMaterial).uniforms;
    if (u) for (const { value } of Object.values(u)) if (value instanceof THREE.Texture) texs.add(value);
    mat.dispose();
  }
  for (const g of geos) g.dispose();
  for (const tx of texs) tx.dispose();
}

/** Takes the loaded city apart: back to the map, everything it added to the scene and the page is freed. */
function unloadWorld(): void {
  const w = world;
  if (!w) return;
  // the F-15 flying into the next map: its plane and the country's ground stay and fly on (transit) until it is built
  const keep = transit?.flight === w.flight ? new Set<THREE.Object3D>([w.flight.plane, transit.ground.mesh]) : null;
  if (cground && cgroundFor === w && !keep) { cground.setVisible(false); ink.setClipping(mapPlanes); }
  cground = null; cgroundFor = null; // its mesh goes with the scene below
  resumeWalk = false;
  if (w.flight.active && !keep) stopFlight();
  if (w.drive.active) stopDrive();
  if (w.walk.active) stopWalk();
  w.fire.stop();
  closePopups();
  world = null; // the frame loop draws nothing from here on (but the transit)
  if (!keep) w.abort.abort(); // the transit keeps the flight's keys until it ends
  w.labels.dispose();
  w.city.dispose();
  for (const o of [...scene.children]) if (!SCENE_BASE.has(o) && !keep?.has(o)) { scene.remove(o); disposeTree(o); }
  ink.skipNormal.length = 0;
  if (keep) ink.skipNormal.push(...w.flight.flames);
  renderer.renderLists.dispose();
  clearTimeout(hashTimer);
  hashMoved = false;
  lastShadowAt.set(1e9, 0, 0);
  Object.assign(heard, { ring: 0, popped: 0, finished: false, out: 0, fires: 0, bark: false });
  hudCache.clear();
  flyResult.hidden = true;
}

let queuedCity: CityId | null = null;
/** Unloads the current city and loads another; `push` adds a history entry with its address. */
async function switchCity(id: CityId, push = true): Promise<void> {
  if (push && id !== cityFromUrl()) history.pushState(null, '', urlForCity(id));
  if (loading) { queuedCity = id; return; }
  if (id === city.id && world) return;
  city = CITIES[id];
  const tu = performance.now();
  unloadWorld();
  loadUnload = Math.round(performance.now() - tu);
  try { await loadCity(city); } catch (e) { loadFailed(e); return; }
  if (queuedCity && queuedCity !== city.id) { const next = queuedCity; queuedCity = null; await switchCity(next, false); }
  queuedCity = null;
}
function loadFailed(e: unknown): void {
  console.error(e);
  loading = false;
  loadText.textContent = t('error') + (e instanceof Error ? e.message : String(e));
}
// the browser's back / forward between cities
addEventListener('popstate', () => { const id = cityFromUrl(); if (id !== city.id || loading) void switchCity(id, false); });

// city menu under the badge
const cityBtn = $('city-btn'), cityMenu = $('city-menu');
const cityList = document.createElement('div');
cityList.className = 'city-list';
cityMenu.append(cityList);
for (const id of CITY_IDS) {
  const spec = CITIES[id];
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'menuitemradio');
  b.dataset.cityId = id;
  b.innerHTML = `<span class="code">${spec.code}</span><span>${spec.name}</span>`;
  b.addEventListener('click', () => { setCityMenu(false); void switchCity(id); });
  cityList.append(b);
}
// Macedonia first, as tall as four cities (CSS: .country-tile): the country view; beside it the F-15 (.f15-tile)
cityList.prepend($('country-row'));
function setCityMenu(open: boolean): void {
  cityMenu.hidden = !open;
  cityBtn.setAttribute('aria-expanded', String(open));
  if (open) fitCityMenu();
  if (open) cityMenu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  if (open) cityMenu.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
}
// one column always; the box stops 8 px above the screen's bottom and the list scrolls inside it (CSS: #city-menu)
function fitCityMenu(): void {
  if (cityMenu.hidden) return;
  cityMenu.style.setProperty('--top', `${cityBtn.getBoundingClientRect().bottom + 8}px`);
  const row = cityList.querySelector<HTMLElement>('[data-city-id]')?.offsetHeight;
  if (row) cityList.style.setProperty('--row', `${row}px`);
}
addEventListener('resize', fitCityMenu);
cityBtn.addEventListener('click', (e) => { e.stopPropagation(); setCityMenu(cityMenu.hidden === true); });
addEventListener('pointerdown', (e) => { if (!cityMenu.hidden && !cityMenu.contains(e.target as Node) && !cityBtn.contains(e.target as Node)) setCityMenu(false); });
addEventListener('keydown', (e) => {
  if (cityMenu.hidden) return;
  if (e.code === 'Escape') { setCityMenu(false); cityBtn.focus(); return; }
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const items = [...cityMenu.querySelectorAll<HTMLElement>('button')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.code === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
});

// the ▾ on the LinkedIn button: the developers (Bojan 091, Riste 043)
const meBtn = $('me-more'), meMenu = $('me-menu');
function setMeMenu(open: boolean): void {
  meMenu.hidden = !open;
  meBtn.setAttribute('aria-expanded', String(open));
  if (open) meMenu.querySelector<HTMLElement>('a')?.focus();
}
meBtn.addEventListener('click', (e) => { e.stopPropagation(); setMeMenu(meMenu.hidden === true); });
meMenu.addEventListener('click', () => setMeMenu(false));
addEventListener('pointerdown', (e) => { if (!meMenu.hidden && !meMenu.contains(e.target as Node) && !meBtn.contains(e.target as Node)) setMeMenu(false); });
addEventListener('keydown', (e) => { if (!meMenu.hidden && e.code === 'Escape') { setMeMenu(false); meBtn.focus(); } });

function setView(name: string): void {
  const v = VIEWS[name] || VIEWS.center;
  controls.target.set(...v.t);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(v.d, v.polar, v.az)));
  controls.update();
  camDirty = true;
}
window.setView = setView;

// ---------------- shareable links: #@lat,lon,distance m,tilt °,heading ° (or a view name: #kale)
const deg = THREE.MathUtils.radToDeg, rad = THREE.MathUtils.degToRad;
function cameraHash(): string {
  if (!world) return '';
  const { meta } = world, tg = controls.target;
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(tg));
  const lat = meta.lat0 - tg.z / meta.ky, lon = meta.lon0 + tg.x / meta.kx;
  return `@${lat.toFixed(5)},${lon.toFixed(5)},${Math.round(sph.radius)},${deg(sph.phi).toFixed(1)},${deg(sph.theta).toFixed(1)}`;
}
/** Applies the address-bar hash; false when there is nothing usable in it. */
function applyHash(): boolean {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h || !world) return false;
  if (!h.startsWith('@')) { if (!VIEWS[h]) return false; setView(h); return true; }
  const [lat, lon, d, tilt, heading] = h.slice(1).split(',').map(Number);
  if (![lat, lon, d, tilt, heading].every(Number.isFinite)) return false;
  const { meta, terrain } = world;
  const x = (lon - meta.lon0) * meta.kx, z = -(lat - meta.lat0) * meta.ky;
  if (Math.abs(x) > meta.w / 2 || Math.abs(z) > meta.h / 2) return false;
  controls.target.set(x, terrain.at(x, z), z);
  const dist = THREE.MathUtils.clamp(d, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(dist, THREE.MathUtils.clamp(rad(tilt), 0.05, controls.maxPolarAngle), rad(heading))));
  controls.update();
  camDirty = true;
  return true;
}
// keep the address bar on the current view once the user moves (no history entries)
let hashMoved = false, hashTimer = 0, hashOwn = '';
const scheduleHash = () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => { hashOwn = '#' + cameraHash(); history.replaceState(null, '', hashOwn); }, 600);
};
controls.addEventListener('start', () => (hashMoved = true));
addEventListener('hashchange', () => { if (location.hash !== hashOwn) applyHash(); });

// ---------------- time of day
let timeName: TimeName = 'day';
try { const saved = localStorage.getItem('skopje.time'); if (isTimeName(saved)) timeName = saved; } catch { /* storage unavailable */ }
let tween: { from: TimeState; to: TimePreset; t: number } | null = null;
const stateOf = (name: TimeName) => blendTimes(TIMES[name], TIMES[name], 0);
let timeNow = stateOf(timeName);
// defaults from today's month, for visitors who haven't chosen (a saved choice wins):
// Dec–Feb winter with snow on Vodno, Mar–May spring, Jun–Aug summer, Sep–Nov autumn
const MONTH = new Date().getMonth(); // 0 = January
const WINTER_MONTH = MONTH === 11 || MONTH <= 1;
// weather: a second axis on top of the time of day ('clear' changes nothing)
let wxName: WeatherName = WINTER_MONTH ? 'vodno' : 'clear';
try { const saved = localStorage.getItem('skopje.weather'); if (isWeatherName(saved)) wxName = saved; } catch { /* storage unavailable */ }
let wxNow: Weather = WEATHER[wxName];
let wxTween: { from: Weather; to: Weather; t: number } | null = null;
// seasons: autumn colours / bare winter trees on top of everything ('summer' changes nothing)
type SeasonName = 'summer' | 'autumn' | 'winter' | 'spring';
interface Season { autumn: number; winter: number; spring: number }
const SEASONS: Record<SeasonName, Season> = {
  summer: { autumn: 0, winter: 0, spring: 0 }, autumn: { autumn: 1, winter: 0, spring: 0 },
  winter: { autumn: 0, winter: 1, spring: 0 }, spring: { autumn: 0, winter: 0, spring: 1 },
};
const SEASON_ORDER: SeasonName[] = ['summer', 'autumn', 'winter', 'spring']; // follows the year
let seasonName: SeasonName = WINTER_MONTH ? 'winter' : MONTH <= 4 ? 'spring' : MONTH <= 7 ? 'summer' : 'autumn';
try { const saved = localStorage.getItem('skopje.season'); if (saved && saved in SEASONS) seasonName = saved as SeasonName; } catch { /* storage unavailable */ }
let seasonNow: Season = SEASONS[seasonName];
let seasonTween: { from: Season; to: Season; t: number } | null = null;
/** Lights, colours, night and weather effects; the effects that exist yet are passed in. */
function applyTime(p: TimeState, w: Weather, fx: (Pick<World, 'clouds' | 'lamps' | 'traffic' | 'precip' | 'gliders'> & { fire?: FireMode }) | null): void {
  const paper = overcastColor(p.paper.clone(), w), haze = overcastColor(p.haze.clone(), w);
  SUN_DIR.copy(p.sunDir);
  sun.color.copy(overcastColor(p.sun.clone(), w, w.grey * 0.6)); sun.intensity = p.sunI * w.sun;
  hemi.color.copy(overcastColor(p.sky.clone(), w)); hemi.groundColor.copy(p.gnd); hemi.intensity = p.hemiI * w.sky;
  const u = ink.compMat.uniforms;
  u.paper.value.copy(paper); u.haze.value.copy(haze); u.inkColor.value.copy(p.ink); u.grade.value.copy(p.grade);
  u.sat.value = 1.12 * w.sat;
  u.hazeAmt.value = 0.3 + 0.6 * w.haze;
  u.hazeRange.value.set(4000, 26000).multiplyScalar(1 - 1.2 * w.haze);
  sceneBg.copy(paper);
  document.documentElement.style.background = '#' + paper.getHexString();
  SHARED.uNight.value = p.night;
  SHARED.uWet.value = w.rain;
  SHARED.uSnow.value = w.snow;
  SHARED.uSnowLine.value = w.snowLine;
  SHARED.uPuddle.value.set(haze.r, haze.g, haze.b);
  u.sunDir.value.copy(p.sunDir);
  u.cloudShade.value = lowTier ? 0 : 0.62 * (1 - p.night) * (1 - 0.5 * w.grey);
  SHARED.uAutumn.value = seasonNow.autumn;
  SHARED.uWinter.value = seasonNow.winter;
  SHARED.uSpring.value = seasonNow.spring;
  if (fx) {
    fx.clouds.material.color.set('#ffffff').lerp(new THREE.Color('#59608f'), p.night).lerp(new THREE.Color(w.overcast).multiplyScalar(0.8), w.clouds * w.grey);
    fx.clouds.material.emissive.copy(p.sky).multiplyScalar(0.35);
    fx.clouds.material.opacity = 0.68 + 0.2 * w.clouds;
    fx.clouds.setCover(w.clouds);
    fx.lamps.setNight(p.night);
    fx.traffic.setNight(p.night);
    fx.traffic.setWeather(w.rain, w.snowfall);
    fx.precip.set(w.rain, w.snowfall);
    fx.precip.setColors(haze.clone().lerp(new THREE.Color('#ffffff'), 0.35), new THREE.Color('#ffffff').multiplyScalar(1 - 0.55 * p.night));
    fx.gliders.setConditions(p.night, w.rain, w.snowfall);
    fx.fire?.setNight(p.night);
    fx.fire?.setRain(w.rain);
  }
  document.body.classList.toggle('night', p.night > 0.5);
}
function setTime(name: TimeName): void {
  tween = { from: stateOf(timeName), to: TIMES[name], t: 0 };
  timeName = name;
  timeBtn.textContent = t(`time.${name}`);
  try { localStorage.setItem('skopje.time', name); } catch { /* storage unavailable */ }
}
const timeBtn = $('time');
timeBtn.textContent = t(`time.${timeName}`);
timeBtn.addEventListener('click', () => setTime(TIME_ORDER[(TIME_ORDER.indexOf(timeName) + 1) % TIME_ORDER.length]));
/** 'vodno' (snow only up high) is named after the city's own hills */
const weatherLabel = () => t(wxName === 'vodno' ? city.snowLabel : `weather.${wxName}`);
function setWeather(name: WeatherName): void {
  wxTween = { from: wxNow, to: WEATHER[name], t: 0 };
  wxName = name;
  weatherBtn.textContent = weatherLabel();
  try { localStorage.setItem('skopje.weather', name); } catch { /* storage unavailable */ }
}
function setSeason(name: SeasonName): void {
  seasonTween = { from: seasonNow, to: SEASONS[name], t: 0 };
  seasonName = name;
  seasonBtn.textContent = t(`season.${name}`);
  try { localStorage.setItem('skopje.season', name); } catch { /* storage unavailable */ }
}
const seasonBtn = $('season');
seasonBtn.textContent = t(`season.${seasonName}`);
seasonBtn.addEventListener('click', () => setSeason(SEASON_ORDER[(SEASON_ORDER.indexOf(seasonName) + 1) % SEASON_ORDER.length]));
const qualityBtn = $('quality');
const qualityLabel = () => t(qualityMode !== 'auto' ? `quality.${qualityMode}` : lowTier ? 'quality.autoLow' : 'quality.auto');
qualityBtn.textContent = qualityLabel();
qualityBtn.addEventListener('click', () => {
  qualityMode = QUALITY_ORDER[(QUALITY_ORDER.indexOf(qualityMode) + 1) % QUALITY_ORDER.length];
  try { localStorage.setItem('skopje.quality', qualityMode); } catch { /* storage unavailable */ }
  perf.sinceChange = 0; perf.avg = 1 / 60;
  setLowTier(qualityMode === 'low');
  if (qualityMode === 'high') setQuality(0);
  qualityBtn.textContent = qualityLabel();
});
// copy (or, on phones, share) a link to the current view
const shareBtn = $('share');
shareBtn.textContent = t('share');
shareBtn.addEventListener('click', async () => {
  if (!world) return;
  hashOwn = '#' + cameraHash();
  history.replaceState(null, '', hashOwn);
  const url = location.href;
  try {
    if (MOBILE && navigator.share) { await navigator.share({ title: titleBase, url }); return; }
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = t('share.copied');
    setTimeout(() => (shareBtn.textContent = t('share')), 1600);
  } catch { /* share sheet closed or clipboard refused: the link is still in the address bar */ }
});
// memory saver (streaming): detailed ground only near the camera; on by default on phones
let memorySaver = MOBILE;
try { const v = localStorage.getItem('skopje.memorySaver'); if (v) memorySaver = v === '1'; } catch { /* storage unavailable */ }
const streamBtn = $('stream');
setOn(streamBtn, memorySaver);
streamBtn.addEventListener('click', () => {
  memorySaver = !memorySaver;
  setOn(streamBtn, memorySaver);
  world?.city.setStreaming(memorySaver);
  try { localStorage.setItem('skopje.memorySaver', memorySaver ? '1' : '0'); } catch { /* storage unavailable */ }
  camDirty = true;
});
// smooth edges (4× MSAA): off is faster, and only changes how moving pictures look at the edges
let smoothEdges = true;
try { smoothEdges = localStorage.getItem('skopje.smooth') !== '0'; } catch { /* storage unavailable */ }
ink.setMSAA(smoothEdges);
const smoothBtn = $('smooth');
setOn(smoothBtn, smoothEdges);
smoothBtn.addEventListener('click', () => {
  smoothEdges = !smoothEdges;
  setOn(smoothBtn, smoothEdges);
  ink.setMSAA(smoothEdges);
  try { localStorage.setItem('skopje.smooth', smoothEdges ? '1' : '0'); } catch { /* storage unavailable */ }
});
// 📈 frames per second in the window's title: on unless switched off, and the choice is saved
let titleBase = document.title, fpsOn = true, fpsFrames = 0, fpsT = performance.now();
try { fpsOn = localStorage.getItem('skopje.fps') !== '0'; } catch { /* storage unavailable */ }
const fpsBtn = $('fps');
setOn(fpsBtn, fpsOn);
fpsBtn.addEventListener('click', () => {
  fpsOn = !fpsOn;
  setOn(fpsBtn, fpsOn);
  if (!fpsOn) document.title = titleBase;
  try { localStorage.setItem('skopje.fps', fpsOn ? '1' : '0'); } catch { /* storage unavailable */ }
});
/** counts the frame loop's frames; once a second the title shows them */
function countFps(): void {
  fpsFrames++;
  const now = performance.now();
  if (now - fpsT < 1000) return;
  if (fpsOn && !document.hidden) document.title = `${titleBase} · ${Math.round((fpsFrames * 1000) / (now - fpsT))} FPS`;
  fpsFrames = 0;
  fpsT = now;
}
// less traffic: an option only, never switched on automatically
let lightTraffic = false;
try { lightTraffic = localStorage.getItem('skopje.lightTraffic') === '1'; } catch { /* storage unavailable */ }
// 🔊 sound: on unless switched off, and the choice is saved. The switch is in ⚙; the flight
// and walking HUDs carry a small speaker button for the same thing (the bar is hidden there).
const sound = createSound();
let soundOn = true;
try { soundOn = localStorage.getItem('skopje.sound') !== '0'; } catch { /* storage unavailable */ }
const soundBtn = $('sound'), soundChips = document.querySelectorAll<HTMLElement>('.snd');
function setSound(v: boolean, save = true): void {
  soundOn = v;
  sound.setOn(v);
  setOn(soundBtn, v);
  soundChips.forEach((b) => { b.textContent = v ? '🔊' : '🔇'; b.setAttribute('aria-pressed', String(v)); });
  if (save) try { localStorage.setItem('skopje.sound', v ? '1' : '0'); } catch { /* storage unavailable */ }
}
soundBtn.addEventListener('click', () => setSound(!soundOn));
soundChips.forEach((b) => b.addEventListener('click', () => setSound(!soundOn)));
if (soundOn) {
  // on (the default, or saved): show it, but browsers only let audio start from a click or a key press
  setOn(soundBtn, true);
  soundChips.forEach((b) => { b.textContent = '🔊'; b.setAttribute('aria-pressed', 'true'); });
  const arm = () => { removeEventListener('pointerdown', arm, true); removeEventListener('keydown', arm, true); if (soundOn) sound.setOn(true); };
  addEventListener('pointerdown', arm, true);
  addEventListener('keydown', arm, true);
}
/** what the games tell the sound: set by the firefighting HUD, read once per frame */
const soundFx = { fire: 0, dropping: false, scooping: false };
/** last seen counts, to play a signal when one goes up */
const heard = { ring: 0, popped: 0, finished: false, out: 0, fires: 0, bark: false };
const trafficBtn = $('traffic');
setOn(trafficBtn, lightTraffic);
trafficBtn.addEventListener('click', () => {
  lightTraffic = !lightTraffic;
  setOn(trafficBtn, lightTraffic);
  world?.traffic.setLight(lightTraffic);
  try { localStorage.setItem('skopje.lightTraffic', lightTraffic ? '1' : '0'); } catch { /* storage unavailable */ }
  ink.reset();
});
const weatherBtn = $('weather');
weatherBtn.textContent = weatherLabel();
weatherBtn.addEventListener('click', () => setWeather(WEATHER_ORDER[(WEATHER_ORDER.indexOf(wxName) + 1) % WEATHER_ORDER.length]));

// Shadow frustum follows the view so close-ups get crisp shadows
function fitShadow(extOverride?: number): void {
  const d = camera.position.distanceTo(controls.target);
  const ext = extOverride ?? THREE.MathUtils.clamp(d * 1.1, 260, 7000);
  const sc = sun.shadow.camera;
  const texel = (2 * ext) / sun.shadow.mapSize.x;
  const tg = controls.target;
  const cx = Math.round(tg.x / texel) * texel, cz = Math.round(tg.z / texel) * texel;
  sun.target.position.set(cx, tg.y, cz);
  sun.position.copy(SUN_DIR).multiplyScalar(6000).add(sun.target.position);
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
  sc.near = 100; sc.far = 12000;
  sc.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
}

function updateCameraRange(): void {
  const d = camera.position.distanceTo(controls.target);
  camera.near = THREE.MathUtils.clamp(d / 45, 4, 400);
  camera.far = d * 6 + (cground?.visible ? 70000 : 20000); // the F-15 sees the country's mountains far out
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

// Вез panel: fades to transparent when the pointer leaves or after a moment of no use
const bar = document.querySelector<HTMLElement>('.bar')!;
let barTimer = 0;
const barWake = (ms: number) => {
  bar.classList.remove('idle');
  clearTimeout(barTimer);
  barTimer = setTimeout(() => { if (!bar.matches(':hover') && !bar.contains(document.activeElement) && !popups.some((p) => p.menu.classList.contains('open'))) bar.classList.add('idle'); }, ms);
};
bar.addEventListener('pointerenter', () => { bar.classList.remove('idle'); clearTimeout(barTimer); });
bar.addEventListener('pointerleave', () => barWake(1200));
bar.addEventListener('pointerdown', () => barWake(3000));
bar.addEventListener('focusin', () => barWake(3000));
bar.addEventListener('focusout', () => barWake(1200));
setTimeout(() => barWake(0), 3500); // show it at first, then fade

// mobile popups (places, options); on desktop the groups are shown inline
interface Popup { btn: HTMLElement; menu: HTMLElement }
const popups: Popup[] = [...document.querySelectorAll<HTMLElement>('.pop-toggle')].map((btn) => ({ btn, menu: $(btn.getAttribute('aria-controls') ?? '') }));
// ⚙ → 🎨 Графика / 🎮 Управување open a submenu in place of the options menu; ‹ Назад returns
for (const id of ['gfx', 'ctl']) {
  popups.push({ btn: $(`${id}-open`), menu: $(id) });
  $(`${id}-back`).addEventListener('click', (e) => { e.stopPropagation(); $('tools-toggle').click(); $(`${id}-open`).focus(); });
}
const closePopups = (except?: Popup) => popups.forEach((p) => { if (p !== except) { p.menu.classList.remove('open'); p.btn.setAttribute('aria-expanded', 'false'); } });
for (const p of popups) {
  p.btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !p.menu.classList.contains('open');
    closePopups(p);
    p.menu.classList.toggle('open', open);
    p.btn.setAttribute('aria-expanded', String(open));
    fitPopup(p.menu);
  });
}
// a menu taller than the space above the bar wraps into two columns (and scrolls if still too tall)
function fitPopup(menu: HTMLElement): void {
  menu.classList.remove('cols');
  if (!menu.classList.contains('open')) return;
  if (menu.getBoundingClientRect().top < 8) menu.classList.add('cols');
}
addEventListener('resize', () => popups.forEach((p) => fitPopup(p.menu)));
// Overview, weather, season, bus and language sit on the bar on desktop and inside the menus on
// phones; on desktop the copy-link item is first in the options menu
// (same breakpoint as the phone styles in index.html)
const PHONE = matchMedia('(max-width: 560px), (orientation: portrait) and (any-pointer: coarse) and (max-width: 1180px)');
const overviewBtn = document.querySelector<HTMLElement>('[data-view="overview"]')!;
const langBox = document.querySelector<HTMLElement>('.bar .lang')!;
function placeBarItems(): void {
  const places = $('places'), tools = $('tools');
  const busBtn = $('bus'), walkBtn = $('walk');
  const shareItem = $('share');
  // phones: weather, season, walk, bus and copy link first in the options menu
  if (PHONE.matches) { places.append(overviewBtn); tools.prepend(weatherBtn, seasonBtn, walkBtn, busBtn, shareItem); tools.append(langBox); }
  else { places.after(overviewBtn); $('fly').after(walkBtn); walkBtn.after(busBtn); timeBtn.after(weatherBtn); weatherBtn.after(seasonBtn); tools.prepend(shareItem); tools.after(langBox); }
}
placeBarItems();
PHONE.addEventListener('change', () => { closePopups(); placeBarItems(); });
addEventListener('pointerdown', (e) => {
  const target = e.target as Node | null;
  if (!popups.some((p) => p.menu.contains(target) || p.btn.contains(target))) closePopups();
});
document.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.view ?? 'center'); closePopups(); }));
const inkBtn = $('ink');
inkBtn.addEventListener('click', () => {
  ink.ink = !ink.ink;
  setOn(inkBtn, ink.ink);
  ink.reset();
});
const namesBtn = $('names');
namesBtn.addEventListener('click', () => {
  if (!world) return;
  const { labels } = world;
  labels.enabled = !labels.enabled;
  setOn(namesBtn, labels.enabled);
  try { localStorage.setItem('skopje.labels', labels.enabled ? '1' : '0'); } catch { /* storage unavailable */ }
  labels.update(camera, controls.target);
});
const liveBtn = $('live');
liveBtn.addEventListener('click', () => {
  live = !live;
  setOn(liveBtn, live);
  ink.reset();
});
$('shot').addEventListener('click', () => {
  ink.render(scene, camera, false); // draw now so the canvas still holds the frame
  const a = document.createElement('a');
  a.download = `${city.id}.png`;
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

// ---------------- airplane mode
const flyHud = $('flyhud');
const flyStats = $('fly-stats'), flyWarn = $('fly-warn');
const flyGame = $('fly-game'), flyArrow = $('fly-arrow'), flyDist = $('fly-dist');
// turn the HUD arrow the short way round (a jump from +180° to -180° would spin it a full turn)
let arrowRot = 0;
function pointArrow(a: number): void {
  arrowRot += ((((a - arrowRot + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  flyArrow.style.transform = `rotate(${arrowRot}rad)`;
}
const flyResult = $('fly-result'), flyFlash = $('fly-flash');
let resultShown = false;
// the ring race is optional: free flight by default
let race = false;
try { race = localStorage.getItem('skopje.race') === '1'; } catch { /* storage unavailable */ }
const raceBtn = $('fly-race');
const raceLabel = () => (race ? `${t('race')} ✓` : t('race'));
function applyRace(): void {
  if (world) world.game.group.visible = race;
  document.body.classList.toggle('racing', race);
  raceBtn.textContent = raceLabel();
  raceBtn.classList.toggle('on', race);
  if (!race) flyResult.hidden = true;
}
function startRace(): void {
  if (!world) return;
  world.game.reset();
  resultShown = false;
  const r0 = world.game.rings[0].p; // approach the first ring from the south
  world.flight.start(new THREE.Vector3(r0.x, r0.y - 230, r0.z + 900), 0);
}
// firefighting is the other optional game: the Air Tractor, at most two fires, water from the Vardar
let fireOn = false;
try { fireOn = !race && localStorage.getItem('skopje.fire') === '1'; } catch { /* storage unavailable */ }
const fireBtn = $('fly-fire'), flyNav = $('fly-nav'), waterBtn = $('fly-water');
const fireLabel = () => (fireOn ? `${t('fire')} ✓` : t('fire'));
// the F-15 (free flight only): Трка and Пожар bring back their own plane, and their chips hide while it flies
let jetOn = false;
try { jetOn = !race && !fireOn && localStorage.getItem('skopje.jet') === '1'; } catch { /* storage unavailable */ }
const jetBtn = $('fly-jet');
const jetLabel = () => (jetOn ? `${t('jet')} ✓` : t('jet'));
const saveGames = () => { try { localStorage.setItem('skopje.race', race ? '1' : '0'); localStorage.setItem('skopje.fire', fireOn ? '1' : '0'); localStorage.setItem('skopje.jet', jetOn ? '1' : '0'); } catch { /* storage unavailable */ } };
/** show the F-15 choice as it is set; while flying it also swaps the plane */
function applyJet(): void {
  if (race || fireOn) jetOn = false;
  document.body.classList.toggle('jet', jetOn);
  jetBtn.textContent = jetLabel();
  jetBtn.classList.toggle('on', jetOn);
  if (world?.flight.active) world.flight.setJet(jetOn);
}
jetBtn.addEventListener('click', () => { jetOn = !jetOn; saveGames(); applyJet(); });
/** show the firefighting mode as it is set; while flying it also swaps the plane and starts or ends the fires */
function applyFire(): void {
  document.body.classList.toggle('firefighting', fireOn);
  fireBtn.textContent = fireLabel();
  fireBtn.classList.toggle('on', fireOn);
  flyNav.hidden = false;
  if (!world?.flight.active) return;
  const { flight, fire } = world;
  flight.setFire(fireOn);
  if (fireOn && !fire.on) fire.start(flight.pos, flight.yaw);
  else if (!fireOn) { fire.stop(); flight.setFloor(null); }
}
raceBtn.addEventListener('click', () => {
  race = !race;
  if (race) fireOn = false; // one game at a time
  if (race) jetOn = false; // the race flies the usual plane
  saveGames();
  applyRace();
  applyFire();
  applyJet();
  if (race) startRace();
});
fireBtn.addEventListener('click', () => {
  fireOn = !fireOn;
  if (fireOn) race = false;
  if (fireOn) jetOn = false; // firefighting flies the Air Tractor
  saveGames();
  applyRace();
  applyFire();
  applyJet();
});
$('fly-again').addEventListener('click', () => { flyResult.hidden = true; startRace(); });
$('fly-free').addEventListener('click', () => { race = false; saveGames(); applyRace(); });
const lastShadowAt = new THREE.Vector3(1e9, 0, 0);
// the F-15's rockets: fired while the trigger is held, blasts heard by distance
const rFwd = new THREE.Vector3(), rRight = new THREE.Vector3(), rTip = new THREE.Vector3();
const rTips: (THREE.Vector3 | null)[] = [null, null]; // last frame's wingtips while leaving contrails
function updateRockets(dt: number, flight: Flight): void {
  if (!world) return;
  const { rockets } = world;
  if (!flight.jet && !rockets.busy) return;
  flight.axes(rFwd, rRight);
  rockets.update(dt, flight.shooting, { pos: flight.pos, fwd: rFwd, right: rRight, speed: flight.speed });
  if (flight.jet) {
    if (flight.takeSonic()) sound.play('sonic'); // Mach 1 or 2 crossed: the boom (the vapour cone is the flight's)
    if (flight.takeKick()) sound.play('kick'); // turbo pressed: the afterburner's roar
    // contrails from the wingtips when flying high above the ground
    const high = flight.hud.alt > 600;
    flight.plane.updateMatrixWorld();
    for (const [i, x] of [[0, -8.2], [1, 8.2]] as const) {
      const tip = flight.plane.localToWorld(rTip.set(x, 0.15, 5.8));
      const prev = rTips[i];
      if (high && prev) rockets.contrail(i, prev, tip);
      if (high) (rTips[i] ??= new THREE.Vector3()).copy(tip); else rTips[i] = null;
    }
  }
  if (rockets.events.launched) sound.play('launch');
  for (const b of rockets.events.booms) sound.play('boom', THREE.MathUtils.clamp(1 - camera.position.distanceTo(b) / 6000, 0.15, 1));
}
// the F-15's exhaust shimmer: the nozzles and the end of the plume on screen, for the output pass
const heatA = new THREE.Vector3(), heatB = new THREE.Vector3();
function heatHaze(flight: Flight): void {
  const u = ink.outMat.uniforms;
  // three levels: slow (Ctrl, 662 km/h) faint, cruise (1325) light, turbo (2650) strong; eased in between
  const kmh = flight.hud.kmh, lerp3 = (a: number, b: number, c: number) => (kmh <= 1325 ? a + (b - a) * THREE.MathUtils.clamp((kmh - 662) / 663, 0, 1) : b + (c - b) * THREE.MathUtils.clamp((kmh - 1325) / 1325, 0, 1));
  flight.plane.updateMatrixWorld();
  flight.plane.localToWorld(heatA.set(0, 0.15, 12.6));
  flight.plane.localToWorld(heatB.set(0, 0.15, 12.6 + lerp3(12, 22, 85)));
  const d = camera.position.distanceTo(heatA);
  camera.updateMatrixWorld(); // moved by the flight this frame
  heatA.project(camera); heatB.project(camera);
  if (heatA.z > 1 || heatB.z > 1) return; // behind the camera
  u.heatOn.value = lerp3(0.3, 0.6, 1.5) * (1 + 1.6 * flight.sonic); // flares just after the sonic boom
  u.heatT.value = SHARED.uTime.value;
  u.heatR.value = lerp3(1.8, 2.4, 4.4) / (d * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  u.heatA.value.set((heatA.x + 1) / 2, (heatA.y + 1) / 2);
  u.heatB.value.set((heatB.x + 1) / 2, (heatB.y + 1) / 2);
  u.heatAsp.value = camera.aspect;
}
const planeVel = new THREE.Vector3();
let waterPct = -1;
function startFlight(at?: THREE.Vector3, yaw?: number, carry?: { agl: number; speed: number; pitch: number }): void {
  if (!world || world.flight.active || world.drive.active || world.walk.active) return;
  controls.enabled = false;
  world.flight.setFire(fireOn); // before the start: the camera begins at the right height
  world.flight.setJet(jetOn && !race && !fireOn);
  world.flight.setEdgeOpen(edgeOpen);
  if (race) startRace();
  else {
    // free flight from where the camera is, facing the way it looked (or from the parked plane)
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    world.flight.start(at ?? controls.target, yaw ?? -az, carry);
  }
  document.body.classList.add('flying');
  resetSticks();
  flyHud.hidden = false;
  flyResult.hidden = true;
  applyRace();
  applyFire();
  applyJet();
  if (!live) liveBtn.click();
}
function stopFlight(): void {
  if (!world?.flight.active) return;
  const { flight, terrain, game, fire } = world;
  const p = flight.pos;
  flight.stop();
  fire.stop();
  flight.setFire(false); // the plane parked on the Square is the usual one
  flight.setJet(false);
  showCountryGround(false);
  hopAhead = null;
  hopSeen = new Set();
  $('fly-next').hidden = true;
  if (!hopping) { prefetch.want([]); if (MOBILE) prefetch.clear(); } // landed: no more downloads (a phone frees the files)
  ink.outMat.uniforms.heatOn.value = 0;
  world.rockets.clear();
  soundFx.fire = 0; soundFx.dropping = soundFx.scooping = false;
  Object.assign(heard, { ring: 0, popped: 0, finished: false, out: 0, fires: 0 });
  controls.target.set(p.x, terrain.at(p.x, p.z), p.z);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, 700);
  controls.enabled = true;
  controls.update();
  document.body.classList.remove('flying');
  flyHud.hidden = true;
  game.group.visible = false;
  camDirty = true;
  if (resumeWalk) { resumeWalk = false; startWalk(controls.target.clone()); }
}
// ---------------- drive a ЈСП double-decker (shares the flight HUD: speed, exit, arrows)
function startDrive(at?: THREE.Vector3, yaw?: number): boolean {
  if (!world || !world.spec.buses || world.flight.active || world.drive.active || world.walk.active) return false;
  const f = new THREE.Vector3().subVectors(controls.target, camera.position);
  if (!world.drive.start(at ?? controls.target, yaw ?? Math.atan2(f.x, -f.z))) return false; // no street nearby
  closePopups();
  controls.enabled = false;
  document.body.classList.add('flying', 'driving');
  resetSticks();
  flyHud.hidden = false;
  flyResult.hidden = true;
  world.game.group.visible = false;
  if (!live) liveBtn.click();
  return true;
}
function stopDrive(): void {
  if (!world?.drive.active) return;
  const { drive, terrain } = world;
  const p = drive.pos;
  drive.stop();
  controls.target.set(p.x, terrain.at(p.x, p.z), p.z);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, 450);
  controls.enabled = true;
  controls.update();
  document.body.classList.remove('flying', 'driving');
  flyHud.hidden = true;
  camDirty = true;
  if (resumeWalk) { resumeWalk = false; startWalk(controls.target.clone()); }
}
const stopVehicle = () => (world?.drive.active ? stopDrive() : stopFlight());
$('fly').addEventListener('click', () => startFlight());
$('bus').addEventListener('click', () => startDrive());
$('fly-exit').addEventListener('click', stopVehicle);
let lastLockChange = 0;
document.addEventListener('pointerlockchange', () => (lastLockChange = performance.now()));
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (world?.flight.active || world?.drive.active) stopVehicle();
  // the first Esc only releases the mouse (pointer lock); the next one leaves walking
  else if (world?.walk.active && !document.pointerLockElement && performance.now() - lastLockChange > 300) stopWalk();
});

// ---------------- walking as Итар Пејо or the Шарпланинец (first / third person)
const walkHud = $('walkhud');
let resumeWalk = false; // return to walking after leaving a vehicle boarded on foot
function showParkedPlane(on: boolean): void {
  if (!world || world.flight.active) return;
  const { plane } = world.flight, s = world.planeSpot;
  plane.visible = on;
  if (on) { plane.position.set(s.x, world.terrain.at(s.x, s.z) + 2.5, s.z); plane.rotation.set(0, -s.yaw, 0, 'YXZ'); }
}
function startWalk(at?: THREE.Vector3): void {
  if (!world || world.flight.active || world.drive.active || world.walk.active) return;
  closePopups();
  controls.enabled = false;
  document.body.classList.add('walking');
  resetSticks();
  walkHud.hidden = false;
  const f = new THREE.Vector3().subVectors(controls.target, camera.position);
  world.walk.start(at ?? controls.target, Math.atan2(f.x, -f.z));
  showParkedPlane(true);
  if (!live) liveBtn.click();
  hudCache.clear();
}
function stopWalk(toMap = true): void {
  if (!world?.walk.active) return;
  const p = world.walk.pos.clone();
  world.walk.stop();
  showParkedPlane(false);
  if (document.pointerLockElement) document.exitPointerLock();
  walkHud.hidden = true;
  document.body.classList.remove('walking');
  controls.target.copy(p);
  if (toMap) {
    camera.position.copy(p).add(new THREE.Vector3(0, 160, 240));
    controls.enabled = true;
    controls.update();
    camDirty = true;
  }
}
function walkAction(): void {
  const w = world;
  if (!w?.walk.active) return;
  const a = w.walk.action();
  if (a === 'bus') {
    const b = w.traffic.nearestBus(w.walk.pos.x, w.walk.pos.z, 12);
    if (!b) return;
    const at = new THREE.Vector3(b.x, 0, b.z);
    stopWalk(false);
    resumeWalk = true;
    if (!startDrive(at, b.yaw)) { resumeWalk = false; startWalk(at); }
  } else if (a === 'plane') {
    const s = w.planeSpot;
    stopWalk(false);
    resumeWalk = true;
    startFlight(new THREE.Vector3(s.x, w.terrain.at(s.x, s.z), s.z), s.yaw);
  } else w.walk.act(a);
}
$('walk').addEventListener('click', () => startWalk());
$('walk-exit').addEventListener('click', () => stopWalk());
$('walk-act').addEventListener('click', walkAction);
$('walk-view').addEventListener('click', () => world?.walk.setView(world.walk.view === 'third' ? 'first' : 'third'));
$('walk-char').addEventListener('click', () => world?.walk.setCharacter(world.walk.character === 'pejo' ? 'dog' : 'pejo'));
$('walk-run').addEventListener('click', () => { if (world) { world.walk.setRun(!world.walk.running); $('walk-run').classList.toggle('on', world.walk.running); } });
addEventListener('keydown', (e) => {
  if (!world?.walk.active || e.repeat || e.metaKey || e.ctrlKey) return;
  if (e.code === 'KeyE') walkAction();
  else if (e.code === 'KeyV') $('walk-view').click();
  else if (e.code === 'KeyC') $('walk-char').click();
});
// look: pointer lock with the mouse (click the map), drag on touch screens
const canvas = renderer.domElement;
let dragId = -1, dragX = 0, dragY = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (!world?.walk.active) return;
  if (e.pointerType === 'mouse' && !document.pointerLockElement) canvas.requestPointerLock()?.catch?.(() => { /* refused: drag to look */ });
  dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY;
});
addEventListener('pointermove', (e) => {
  if (!world?.walk.active) return;
  if (document.pointerLockElement === canvas) { world.walk.look.x += e.movementX; world.walk.look.y += e.movementY; return; }
  if (e.pointerId !== dragId) return;
  world.walk.look.x += (e.clientX - dragX) * 1.4; world.walk.look.y += (e.clientY - dragY) * 1.4;
  dragX = e.clientX; dragY = e.clientY;
});
addEventListener('pointerup', (e) => { if (e.pointerId === dragId) dragId = -1; });
// ---------------- touch joysticks: walking always has the left one (moving); phones and tablets held
// sideways get a right one in every mode too (index.html: `body.mobile .stick`), and the flight / bus a left one
/** x right, y down, −1…1; 0, 0 on release */
function touchStick(el: HTMLElement, onMove: (x: number, y: number) => void): void {
  const knob = el.querySelector<HTMLElement>('.knob')!;
  let id = -1;
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    onMove(dx, dy);
  };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; el.setPointerCapture(e.pointerId); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) el.addEventListener(ev, (e) => {
    if (e.pointerId !== id) return;
    id = -1; knob.style.transform = '';
    onMove(0, 0);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
/** the sticks' current values, read every frame (flight / bus steering, looking around on foot) */
const touch = { lx: 0, ly: 0, rx: 0, ry: 0 };
/** a mode starts with the sticks centred (a stick held while its HUD hid may never have seen its release) */
function resetSticks(): void {
  Object.assign(touch, { lx: 0, ly: 0, rx: 0, ry: 0 });
  document.querySelectorAll<HTMLElement>('.stick .knob, .walk-stick .knob').forEach((k) => (k.style.transform = ''));
  if (world) world.walk.stick.x = world.walk.stick.y = 0;
}
touchStick($('walk-stick'), (x, y) => { if (world) { world.walk.stick.x = x; world.walk.stick.y = -y; } });
touchStick($('walk-look'), (x, y) => { touch.rx = x; touch.ry = y; });
touchStick($('fly-lstick'), (x, y) => { touch.lx = x; touch.ly = y; });
touchStick($('drive-gas'), (_x, y) => { touch.ry = y; });
// the stunt stick works like a gamepad's right stick: a flick to the side rolls that way, forward / back
// loops (forward: nose down and under with "invert up/down in flight" on, the default, like the pad)
let stuntFlick = false;
touchStick($('fly-stunts'), (x, y) => {
  const far = Math.max(Math.abs(x), Math.abs(y));
  if (far < 0.4) stuntFlick = false;
  else if (far > 0.75 && !stuntFlick && world?.flight.active) {
    stuntFlick = true;
    if (Math.abs(x) >= Math.abs(y)) world.flight.stunt('roll', x > 0 ? 1 : -1);
    else world.flight.stunt('loop', (y > 0) === invertPlane ? 1 : -1);
  }
});
// HUD texts (only touched when they change)
const hudCache = new Map<string, string>();
const setText = (id: string, text: string) => { if (hudCache.get(id) !== text) { hudCache.set(id, text); $(id).textContent = text; } };
const ACT_KEY: Record<WalkAction, Key | null> = { bus: 'act.bus', plane: 'act.plane', gondolaUp: 'act.gondolaUp', gondolaDown: 'act.gondolaDown', oro: 'act.oro', oroStop: 'act.oroStop', film: 'act.film', filmStop: 'act.filmStop', bark: 'act.bark', none: null };
const walkerKey = (w: CitySpec['walker']): Key => (w === 'suit' ? 'char.suit' : w === 'manaki' ? 'char.manaki' : 'char.pejo');
const camDir = new THREE.Vector3();
function updateWalkHud(): void {
  if (!world) return;
  const { walk, traffic } = world;
  const a = walk.action(), key = ACT_KEY[a];
  const label = key ? t(key) : '';
  setText('walk-hint', label ? (MOBILE ? label : `E — ${label}`) : '');
  setText('walk-act', label ? label.split(' ')[0] : '·');
  setText('walk-who', t(walk.label));
  setText('walk-view', walk.view === 'third' ? '👁' : '🎥');
  setText('walk-char', walk.character === 'pejo' ? '🐕' : t(walkerKey(world.spec.walker)).split(' ')[0]);
  // the nearest bus, with a direction arrow relative to where the camera looks
  const b = a === 'bus' ? null : traffic.nearestBus(walk.pos.x, walk.pos.z, 2500);
  const busEl = $('walk-bus');
  busEl.hidden = !b;
  if (b) {
    camera.getWorldDirection(camDir);
    const ang = Math.atan2(b.x - walk.pos.x, -(b.z - walk.pos.z)) - Math.atan2(camDir.x, -camDir.z);
    setText('walk-bus-dist', `🚌 ${b.d > 1000 ? (b.d / 1000).toFixed(1) + ' ' + t('u.km') : Math.round(b.d) + ' ' + t('u.m')}`);
    $('walk-bus-arrow').style.transform = `rotate(${ang}rad)`;
  }
  const inf = walk.info();
  $('walk-info').hidden = !inf;
  if (inf) { setText('walk-info-name', inf.name); setText('walk-info-text', t(`info.${inf.key}` as Key)); }
  setText('walk-flash', walk.barking ? t('bark') : '');
  if (walk.barking && !heard.bark) sound.play('bark');
  heard.bark = walk.barking;
}
// on-screen flight buttons: hold to press; on touch screens БРЗО is a toggle (tap on, tap off)
flyHud.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => {
  const k = b.dataset.k as 'left' | 'right' | 'up' | 'down' | 'boost' | 'drop' | 'shoot';
  const set = (on: boolean) => {
    if (!world) return;
    if (k === 'drop') world.flight.input.drop = on; // water: hold, also on touch screens
    else if (k === 'shoot') world.flight.input.shoot = on; // the F-15's rockets: hold
    else {
      const { input } = world.drive.active ? world.drive : world.flight;
      if (k === 'boost') { input.boost = on; b.setAttribute('aria-pressed', String(on)); } else input[k] = on ? 1 : 0;
    }
    b.classList.toggle('on', on);
  };
  const toggles = (e: PointerEvent) => k === 'boost' && e.pointerType !== 'mouse';
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (toggles(e)) { set(!world?.flight.input.boost); return; }
    b.setPointerCapture(e.pointerId);
    set(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, (e) => { if (!toggles(e)) set(false); });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

// invert up/down (⚙ → 🎮 Управување, remembered per browser): one switch for the map and walking
// (off by default), one for the plane (on by default: ↑ lowers the nose, like a real pilot)
const invertBtn = $('invert'), invertPlaneBtn = $('invert-plane');
let invertY = false, invertPlane = true;
try { invertY = localStorage.getItem('skopje.invertY') === '1'; invertPlane = localStorage.getItem('skopje.invertYPlane') !== '0'; } catch { /* storage unavailable */ }
setOn(invertBtn, invertY);
setOn(invertPlaneBtn, invertPlane);
document.body.classList.toggle('plane-inv', invertPlane);
invertBtn.addEventListener('click', () => {
  invertY = !invertY;
  setOn(invertBtn, invertY);
  world?.walk.setInvertY(invertY);
  try { localStorage.setItem('skopje.invertY', invertY ? '1' : '0'); } catch { /* storage unavailable */ }
});
invertPlaneBtn.addEventListener('click', () => {
  invertPlane = !invertPlane;
  setOn(invertPlaneBtn, invertPlane);
document.body.classList.toggle('plane-inv', invertPlane);
  world?.flight.setInvertY(invertPlane);
  try { localStorage.setItem('skopje.invertYPlane', invertPlane ? '1' : '0'); } catch { /* storage unavailable */ }
});

// interface language (map names stay Macedonian)
const langSel = $<HTMLSelectElement>('lang');
for (const [code, name] of LANGS) langSel.add(new Option(name, code, false, code === lang));
langSel.addEventListener('change', () => { setLang(langSel.value); closePopups(); });
onLangChange(() => {
  timeBtn.textContent = t(`time.${timeName}`);
  weatherBtn.textContent = weatherLabel();
  seasonBtn.textContent = t(`season.${seasonName}`);
  qualityBtn.textContent = qualityLabel();
  shareBtn.textContent = t('share');
  hudCache.clear();
  raceBtn.textContent = raceLabel();
  fireBtn.textContent = fireLabel();
  jetBtn.textContent = jetLabel();
  if (loading) loadText.textContent = t(`stage.${lastStage}`);
});

// help dialog behind the logo
const help = $<HTMLDialogElement>('help');
$('app-version').textContent = `v${__APP_VERSION__}`;
$('logo').addEventListener('click', () => help.showModal());
$('help-close').addEventListener('click', () => help.close());
help.addEventListener('click', (e) => { if (e.target === help) help.close(); });

// ---------------- the country view: Macedonia with every map's zone (src/country.ts); the 🇲🇰 button after the ?
// Its data is downloaded the first time and stays in memory (and so does the built view) for the rest of the visit.
// The city stays built underneath; only the scene drawn through the ink renderer changes while it is open.
let country: CountryView | null = null;
let countryOpen = false, countryBusy = false;
const countryUi = $('country-ui'), countryLoad = $('country-load'), countryBar = $('country-load-bar');
async function openCountry(): Promise<void> {
  if (countryOpen || countryBusy || loading) return;
  resumeWalk = false;
  if (world?.flight.active) stopFlight();
  if (world?.drive.active) stopDrive();
  if (world?.walk.active) stopWalk();
  closePopups();
  setCityMenu(false);
  countryOpen = true;
  document.body.classList.add('country');
  countryUi.hidden = false;
  controls.enabled = false;
  if (!country) {
    countryBusy = true;
    countryLoad.hidden = false;
    try {
      const data = await loadCountry((f) => (countryBar.style.width = `${Math.round(f * 100)}%`));
      await nextFrame();
      country = createCountryView({
        data, dom: renderer.domElement, labels: $('country-labels'), mobile: MOBILE,
        codeOf: (id) => CITIES[id].code,
        onPick: (z) => { if (z.city) { closeCountry(); void switchCity(z.city); } },
      });
      country.home();
      markSoon();
    } catch (e) {
      console.error(e);
      countryBusy = false;
      countryLoad.hidden = true;
      closeCountry();
      status.textContent = t('error') + (e instanceof Error ? e.message : String(e));
      return;
    }
    countryBusy = false;
    countryLoad.hidden = true;
    if (!countryOpen) return; // closed while it loaded
  }
  country.resize();
  country.controls.enabled = true;
  country.dirty = true;
  renderer.shadowMap.needsUpdate = true; // the country's sun
}
function closeCountry(): void {
  if (!countryOpen) return;
  countryOpen = false;
  document.body.classList.remove('country');
  countryUi.hidden = true;
  if (country) { country.controls.enabled = false; country.setHover(null); }
  renderer.domElement.style.cursor = '';
  controls.enabled = true;
  fitShadow(); // the city's shadow map again
  camDirty = true;
  ink.reset();
}
/** Draws the country through the ink renderer; the composite's city settings (clouds, haze, clipping) put back after. */
function renderCountry(v: CountryView): void {
  const u = ink.compMat.uniforms;
  const shade = u.cloudShade.value as number, haze = (u.hazeRange.value as THREE.Vector2).clone(), clip = ink.normalMat.clippingPlanes;
  u.cloudShade.value = 0; // the clouds belong to the city's coordinates
  const d = v.camera.position.distanceTo(v.controls.target);
  u.hazeRange.value.set(d * 1.2, d * 4); // a light haze toward the far edge, at any zoom
  ink.normalMat.clippingPlanes = [];
  ink.render(v.scene, v.camera, false);
  u.cloudShade.value = shade;
  u.hazeRange.value.copy(haze);
  ink.normalMat.clippingPlanes = clip;
}
$('country-btn').addEventListener('click', () => { setCityMenu(false); void openCountry(); });
// the F-15 tile: straight into free flight in the F-15 over the current map (once it is built)
let f15Pending = false;
function takeOffF15(): void {
  if (!world || loading) { f15Pending = true; return; }
  f15Pending = false;
  if (countryOpen) closeCountry();
  if (world.drive.active) stopDrive();
  if (world.walk.active) { resumeWalk = false; stopWalk(); }
  race = false; fireOn = false; jetOn = true;
  saveGames(); applyRace(); applyFire();
  if (world.flight.active) applyJet(); else startFlight();
}
$('f15-btn').addEventListener('click', () => { setCityMenu(false); takeOffF15(); });
$('country-close').addEventListener('click', closeCountry);
addEventListener('keydown', (e) => { if (countryOpen && e.code === 'Escape' && !document.querySelector('dialog[open]')) closeCountry(); });
// hover and click on the canvas (a click is a press without dragging)
let czDown: [number, number] | null = null;
renderer.domElement.addEventListener('pointermove', (e) => { if (countryOpen && country && e.pointerType === 'mouse' && !e.buttons) country.setHover(country.zoneAt(e.clientX, e.clientY)); });
renderer.domElement.addEventListener('pointerdown', (e) => { czDown = countryOpen ? [e.clientX, e.clientY] : null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!countryOpen || !country || !czDown || Math.hypot(e.clientX - czDown[0], e.clientY - czDown[1]) > 6) return;
  const z = country.zoneAt(e.clientX, e.clientY);
  if (z?.city) { closeCountry(); void switchCity(z.city); } else country.setHover(z); // a planned map: its name with "наскоро"; a touch shows it too
});
addEventListener('resize', () => country?.resize());
const markSoon = () => document.querySelectorAll<HTMLElement>('.cz.soon').forEach((el) => (el.dataset.soon = t('country.soon')));
onLangChange(markSoon);

// keyboard + gamepad navigation on the map (flight has its own controls)
const mapInput = createMapInput({ controls, camera, invertY: () => invertY, isActive: () => !!world && !countryOpen && !world.flight.active && !world.drive.active && !world.walk.active && !document.querySelector('dialog[open]') });
const padPrev = { a: false, b: false, x: false, y: false, start: false, flick: false };
let padHintShown = false;
addEventListener('gamepadconnected', (e) => console.log('gamepad:', e.gamepad.id, e.gamepad.mapping === 'standard' ? 'standard' : 'not mapped by the browser: ignored'));

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  countFps();
  SHARED.uTime.value += dt;
  if (world?.flight.active || world?.drive.active || world?.walk.active || live) governQuality(dt);
  if (countryOpen) {
    if (country) {
      country.update();
      if (country.dirty) { country.dirty = false; ink.reset(); }
      if (!ink.converged) renderCountry(country);
    }
    return;
  }
  if (transit) { transitFrame(dt); return; } // the F-15 flies on while the next map builds
  controls.update();
  if (!world) return; // set at the end of loading: everything exists
  const { flight, drive, walk, game, terrain, city, traffic, clouds, birds, gliders, precip, landmarks, labels } = world;
  // ---- sound follows what is on screen
  if (soundOn) {
    const fly = flight.active, bus = drive.active;
    sound.update(dt, {
      mode: fly ? 'fly' : bus ? 'drive' : walk.active ? 'walk' : 'map',
      speed: fly ? (flight.jet ? THREE.MathUtils.clamp((flight.hud.kmh - 662) / 1988, 0, 1) : THREE.MathUtils.clamp((flight.hud.kmh - 198) / 306, 0, 1)) : bus ? Math.min(1, drive.kmh / 70) : 0,
      tractor: fireOn,
      jet: fly && flight.jet, burner: fly && flight.jet ? THREE.MathUtils.clamp((flight.hud.kmh - 1325) / 1325, 0, 1) : 0,
      dropping: fly && soundFx.dropping, scooping: fly && soundFx.scooping, fire: fly ? soundFx.fire : 0,
      rain: wxNow.rain, night: timeNow.night,
      near: walk.active ? 1 : THREE.MathUtils.clamp(1 - (camera.position.distanceTo(controls.target) - 300) / 5000, 0, 1),
    });
  }
  // ---- gamepad
  const pad = readPad();
  if (pad) {
    const flick = Math.abs(pad.rx) > 0.7 || Math.abs(pad.ry) > 0.7; // right stick pushed right over (a stunt in the flight)
    if (walk.active) {
      walk.stick.x = pad.lx; walk.stick.y = -pad.ly;
      walk.look.x += pad.rx * 900 * dt; walk.look.y += pad.ry * 650 * dt;
      walk.input.run = pad.x;
      if (pad.a && !padPrev.a) walkAction();
      if (pad.b && !padPrev.b) stopWalk();
      if (pad.y && !padPrev.y) $('walk-view').click();
      if (pad.start && !padPrev.start) $('walk-char').click();
    } else if (drive.active) {
      drive.pad.turn = pad.lx;
      drive.pad.throttle = pad.rt - pad.lt || -pad.ly;
      if (pad.b && !padPrev.b) stopDrive();
    } else if (flight.active) {
      flight.pad.turn = pad.lx;
      flight.pad.climb = -pad.ly;
      flight.pad.boost = pad.a || pad.rt > 0.3;
      flight.pad.drop = fireOn && pad.lt > 0.3; // water (firefighting)
      flight.pad.slow = !fireOn && pad.lt > 0.3; // otherwise LT slows to a quarter of the top speed
      flight.pad.shoot = flight.jet && pad.x; // the F-15: X fires rockets
      // right stick, flicked: a roll to that side, or a loop (forward: nose down and under, back: up and over)
      if (flick && !padPrev.flick) {
        if (Math.abs(pad.rx) >= Math.abs(pad.ry)) flight.stunt('roll', pad.rx > 0 ? 1 : -1);
        else flight.stunt('loop', pad.ry > 0 ? 1 : -1);
      }
      if (pad.b && !padPrev.b) stopFlight();
      if (pad.x && !padPrev.x && !flight.jet) raceBtn.click(); // race on/off (the F-15: X fires rockets)
      if (pad.y && !padPrev.y) fireBtn.click(); // firefighting on/off
      if (pad.start && !padPrev.start && race) { flyResult.hidden = true; startRace(); } // restart race
      else if (pad.start && !padPrev.start && !fireOn) jetBtn.click(); // free flight: the F-15 on/off
    } else if (pad.y && !padPrev.y) startFlight();
    Object.assign(padPrev, { a: pad.a, b: pad.b, x: pad.x, y: pad.y, start: pad.start, flick });
    if (!padHintShown) { padHintShown = true; document.body.classList.add('has-pad'); }
  } else if (flight.active) Object.assign(flight.pad, { turn: 0, climb: 0, boost: false, drop: false, slow: false, shoot: false });
  else if (drive.active) Object.assign(drive.pad, { turn: 0, throttle: 0 });
  // touch joysticks add to the pad (both are set afresh above every frame)
  if (flight.active) { flight.pad.turn += touch.lx; flight.pad.climb -= touch.ly; }
  else if (drive.active) { drive.pad.turn += touch.lx; drive.pad.throttle -= touch.ry; }
  else if (walk.active) { walk.look.x += touch.rx * 900 * dt; walk.look.y += touch.ry * 650 * dt; }
  // ---- keyboard / pad map navigation; keep the orbit target on the ground
  if (mapInput.update(dt, pad)) {
    hashMoved = true;
    const g = terrain.at(controls.target.x, controls.target.z);
    const dy = (g - controls.target.y) * Math.min(1, dt * 4);
    controls.target.y += dy;
    camera.position.y += dy;
    camDirty = true;
  }
  if (tween || wxTween || seasonTween) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.4);
      timeNow = blendTimes(presetOf(tween.from), tween.to, tween.t * tween.t * (3 - 2 * tween.t));
      if (tween.t >= 1) tween = null;
    }
    if (wxTween) {
      wxTween.t = Math.min(1, wxTween.t + dt / 2);
      wxNow = blendWeather(wxTween.from, wxTween.to, wxTween.t * wxTween.t * (3 - 2 * wxTween.t));
      if (wxTween.t >= 1) { wxNow = wxTween.to; wxTween = null; }
    }
    if (seasonTween) {
      seasonTween.t = Math.min(1, seasonTween.t + dt / 2);
      const e = seasonTween.t * seasonTween.t * (3 - 2 * seasonTween.t), { from, to } = seasonTween;
      const mix = (a: number, b: number) => a + (b - a) * e;
      seasonNow = { autumn: mix(from.autumn, to.autumn), winter: mix(from.winter, to.winter), spring: mix(from.spring, to.spring) };
      if (seasonTween.t >= 1) { seasonNow = to; seasonTween = null; }
    }
    applyTime(timeNow, wxNow, world);
    fitShadow(flight.active ? (flight.jet ? 2400 : 1100) : undefined);
    ink.reset();
  }
  ink.outMat.uniforms.heatOn.value = 0; // the F-15's exhaust shimmer: only while it flies (below)
  if (walk.active) {
    walk.update(dt);
    controls.target.copy(walk.pos); // drives shadows, LOD and traffic sizing
    camera.near = 0.2; camera.far = 25000; camera.updateProjectionMatrix();
    city.updateLOD(camera);
    if (walk.pos.distanceTo(lastShadowAt) > 30) { fitShadow(160); lastShadowAt.copy(walk.pos); }
    ink.reset();
    updateWalkHud();
    traffic.update(dt, camera, controls.target);
    clouds.update(dt);
    birds.update(dt);
    gliders.update(dt);
    landmarks.update(dt);
    precip.update(dt, camera, controls.target);
    labels.update(camera, controls.target);
    ink.render(scene, camera, true);
    return;
  }
  if (drive.active) {
    drive.update(dt);
    controls.target.copy(drive.pos); // drives shadows, LOD and traffic sizing
    updateCameraRange();
    city.updateLOD(camera);
    if (drive.pos.distanceTo(lastShadowAt) > 60) { fitShadow(400); lastShadowAt.copy(drive.pos); }
    ink.reset();
    flyStats.textContent = `${drive.kmh} ${t('u.kmh')}`;
    if (flyWarn.textContent) flyWarn.textContent = '';
    traffic.update(dt, camera, controls.target);
    clouds.update(dt);
    birds.update(dt);
    gliders.update(dt);
    landmarks.update(dt);
    precip.update(dt, camera, controls.target);
    ink.render(scene, camera, true);
    return;
  }
  if (flight.active) {
    showCountryGround(flight.jet, flight.pos.x, flight.pos.z);
    flight.update(dt);
    controls.target.copy(flight.pos); // drives shadows, LOD and traffic sizing
    updateCameraRange();
    city.updateLOD(camera);
    // the F-15 covers 150 m in a fifth of a second: a wider shadow box, fitted less often
    if (flight.pos.distanceTo(lastShadowAt) > (flight.jet ? 700 : 150)) { fitShadow(flight.jet ? 2400 : 1100); lastShadowAt.copy(flight.pos); }
    ink.reset();
    const h = flight.hud;
    flyStats.textContent = `${h.kmh} ${t('u.kmh')} · ${h.alt} ${t('u.m')}`;
    let warn = h.warn ? t(`warn.${h.warn}`) : '';
    // firefighting HUD: fires put out, tank, the nearest fire, hints for the water
    if (fireOn) {
      const { fire } = world;
      fire.update(dt, flight.pos, flight.velocity(planeVel), flight.yaw, flight.dropping, flight.stunting);
      const f = fire.state, p = flight.pos;
      flight.setFloor(f.overWater ? WATER_FLOOR : null); // low enough over water to scoop it
      const pct = Math.round(f.tank * 100);
      setText('fly-game', `🔥 ${f.out} · ★ ${f.best} · 💧 ${pct}%`);
      if (waterPct !== pct) { waterPct = pct; waterBtn.style.setProperty('--tank', `${pct}%`); }
      const flash = f.flash === 'out' ? t('fire.out') : f.flash ? t(`fire.new.${f.flash}`) : '';
      if (flyFlash.textContent !== flash) flyFlash.textContent = flash;
      let near: (typeof f.fires)[number] | null = null, nd = Infinity;
      for (const s of f.fires) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < nd) { nd = d; near = s; } }
      flyNav.hidden = !near;
      // a fire close ahead: the camera pulls back to show where the water would land
      const close = !!near && nd < 480 && (near.x - p.x) * Math.sin(flight.yaw) - (near.z - p.z) * Math.cos(flight.yaw) > -60;
      flight.setAim(close, f.falling, close && near ? near.top : f.aimY);
      if (near) {
        pointArrow(Math.atan2(near.x - p.x, -(near.z - p.z)) - flight.yaw);
        setText('fly-dist', `🔥 ${t(`fire.kind.${near.kind}`)} · ${nd > 1000 ? (nd / 1000).toFixed(1) + ' ' + t('u.km') : Math.round(nd) + ' ' + t('u.m')}`);
      }
      if (f.scooping) warn = t('fire.scoop');
      else if (h.warn === 'low' && f.overWater) warn = ''; // skimming the river on purpose
      else if (!warn && f.tank <= 0) warn = t(world.spec.refillLabel);
      // sound: the fire gets louder as it nears; a signal for a fire out and for a new one
      soundFx.fire = near ? THREE.MathUtils.clamp(1 - nd / 520, 0, 1) : 0;
      soundFx.dropping = flight.dropping && f.tank > 0;
      soundFx.scooping = f.scooping;
      if (f.out > heard.out) sound.play('out');
      else if (f.fires.length > heard.fires) sound.play('alarm');
      heard.out = f.out;
      heard.fires = f.fires.length;
    } else { soundFx.fire = 0; soundFx.dropping = soundFx.scooping = false; heard.fires = 0; }
    if (flyWarn.textContent !== warn) flyWarn.textContent = warn;
    // race HUD (only when the race is on)
    if (race) {
      game.update(dt, flight.pos);
      const g = game.state;
      if (g.finished && !heard.finished) sound.play('finish');
      else if (g.next > heard.ring) sound.play('ding');
      if (g.popped > heard.popped) sound.play('pop');
      heard.ring = g.next; heard.popped = g.popped; heard.finished = g.finished;
      flyGame.textContent = g.finished ? `🏁 ${fmtTime(g.time)} · 🎈 ${g.popped}/${g.balloons}` : `◎ ${g.next}/${g.total} · ⏱ ${fmtTime(g.time)} · 🎈 ${g.popped}/${g.balloons}`;
      if (flyFlash.textContent !== g.flash) flyFlash.textContent = g.flash;
      if (!g.finished) {
        const tp = g.nextRing.p, p = flight.pos;
        const bearing = Math.atan2(tp.x - p.x, -(tp.z - p.z));
        pointArrow(bearing - flight.yaw);
        const dm = Math.hypot(tp.x - p.x, tp.z - p.z);
        const name = g.nextRing.final ? `${t('finish')}: ${g.nextRing.name}` : g.nextRing.name;
        flyDist.textContent = `${name} · ${dm > 1000 ? (dm / 1000).toFixed(1) + ' ' + t('u.km') : Math.round(dm) + ' ' + t('u.m')}`;
      } else {
        flyDist.textContent = t('finish!');
      }
      if (g.finished && !resultShown) {
        resultShown = true;
        $('res-time').textContent = fmtTime(g.time);
        $('res-balloons').textContent = `${g.popped}/${g.balloons}`;
        $('res-best').textContent = g.newBest ? t('newBest') : t('best', { t: fmtTime(g.best) });
        flyResult.hidden = false;
      }
    }
    $('fly-boost').classList.toggle('on', h.boost);
    // the radar before hopUpdate: that may start the switch, which takes the world away at once
    if (flight.jet) {
      heatHaze(flight);
      drawRadar(flight, world.meta);
      hopUpdate(dt, world);
      if (!world) return; // the switch has begun: the old map is gone, the transit draws from the next frame
    }
    else if (hopAhead) { hopAhead = null; hopSeen = new Set(); prefetch.want([]); $('fly-next').hidden = true; }
    updateRockets(dt, flight);
    traffic.update(dt, camera, controls.target);
    clouds.update(dt);
    birds.update(dt);
    gliders.update(dt);
    landmarks.update(dt);
    precip.update(dt, camera, controls.target);
    ink.render(scene, camera, true);
    return;
  }
  if (city.streamPending) { city.updateLOD(camera); ink.reset(); } // detailed ground still arriving
  if (camDirty) {
    camDirty = false;
    if (hashMoved) scheduleHash();
    updateCameraRange();
    city.updateLOD(camera);
    fitShadow();
    ink.reset();
  }
  if (live) {
    traffic.update(dt, camera, controls.target);
    clouds.update(dt);
    const far = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / 700, 1, 5); // birds and paragliders grow with the zoom
    birds.update(dt, far);
    gliders.update(dt, far);
    landmarks.update(dt);
    precip.update(dt, camera, controls.target);
  }
  labels.update(camera, controls.target);
  if (!live && ink.converged) return; // static & fully supersampled: idle
  ink.render(scene, camera, live);
});

window.__dbg = { scene, renderer, sun, camera, controls, ink, SHARED, sound, setView, fitShadow, updateCameraRange, switchCity, get cityId() { return city.id; }, get world() { return world; }, get city() { return world?.city; }, get flight() { return world?.flight; }, get country() { return country; }, get loadTimes() { return loadTimes; }, get loadMax() { return loadMax; }, get loadUnload() { return loadUnload; }, get radar() { return radar; } };

loadCity(city).catch(loadFailed);
