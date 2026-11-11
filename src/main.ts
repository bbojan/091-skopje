import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { computeCitySteps, assembleCity, PAL, SHARED, type City, type CityDesc, type CityStage } from './city.ts';
import { TIMES, TIME_ORDER, blendTimes, presetOf, createLamps, isTimeName, type TimeName, type TimePreset, type TimeState } from './sky.ts';
import { WEATHER, WEATHER_ORDER, blendWeather, isWeatherName, overcastColor, type Weather, type WeatherName } from './sky.ts';
import { createPrecip, type Precip } from './weather.ts';
import { createTraffic } from './traffic.ts';
import { Terrain } from './terrain.ts';
import { InkRenderer } from './post.ts';
import { createClouds, createBirds } from './atmos.ts';
import { createFlight, type Flight } from './flight.ts';
import { createDrive, type Drive } from './drive.ts';
import { createWalk, type Walk, type WalkAction } from './walk.ts';
import { createGame, fmtTime, type Game } from './game.ts';
import { createLandmarks } from './landmarks.ts';
import { createLabels } from './labels.ts';
import { createMapInput, readPad } from './input.ts';
import { LANGS, lang, t, applyI18n, setLang, onLangChange, type Key } from './i18n.ts';
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

const app = $('app');
const status = $('status');

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
// 'low' always uses it. Low tier: no MSAA, no AO, no cloud shadows, 1024 shadow map,
// shorter tree detail distances, two extra resolution steps.
type QualityMode = 'auto' | 'low';
let qualityMode: QualityMode = 'auto';
try { if (localStorage.getItem('skopje.quality') === 'low') qualityMode = 'low'; } catch { /* storage unavailable */ }
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
  if (document.hidden || dt > 0.25) return;
  perf.avg += (dt - perf.avg) * 0.05;
  perf.sinceChange += dt;
  if (perf.avg > 1 / 40 && perf.sinceChange > 2 && qLevel < QUALITY.length - 1) { setQuality(qLevel + 1); perf.sinceChange = 0; }
  // already at the lowest resolution and still slow: switch to the low tier (stays on for this visit)
  else if (qualityMode === 'auto' && !lowTier && perf.avg > 1 / 40 && perf.sinceChange > 3) { setLowTier(true); perf.sinceChange = 0; }
  else if (perf.avg < 1 / 57 && perf.sinceChange > 8 && qLevel > 0) { setQuality(qLevel - 1); perf.sinceChange = 0; }
}

/** Everything built while loading; null until the city is ready. */
interface World {
  terrain: Terrain;
  meta: MapMeta;
  city: City;
  traffic: ReturnType<typeof createTraffic>;
  clouds: ReturnType<typeof createClouds>;
  birds: ReturnType<typeof createBirds>;
  lamps: ReturnType<typeof createLamps>;
  precip: Precip;
  landmarks: ReturnType<typeof createLandmarks>;
  labels: ReturnType<typeof createLabels>;
  game: Game;
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
function showProgress(stage: StageKey, f: number): void {
  const st = STAGES[stage];
  // stages report completion; show the next stage's label while it works
  const after = STAGE_KEYS[STAGE_KEYS.indexOf(stage) + 1];
  const next = f >= 1 && after ? after : stage;
  lastStage = next;
  loadBar.style.width = `${Math.round((st[0] + (st[1] - st[0]) * f) * 100)}%`;
  loadText.textContent = t(`stage.${next}`);
}
async function fetchJSON<T>(url: string, onProgress: (f: number) => void): Promise<T> {
  const res = await fetch(url);
  const total = Number(res.headers.get('content-length')) || 7e6;
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

async function init(): Promise<void> {
  const t0 = performance.now();
  showProgress('download', 0);
  const terrainP = Promise.all([
    fetch('./terrain.json').then((r) => r.json() as Promise<TerrainMeta>),
    fetch('./terrain.bin').then((r) => r.arrayBuffer()),
  ]);
  const data = await fetchJSON<CityData>('./skopje.json', (f) => showProgress('download', f * 0.95));
  const [tm, tb] = await terrainP;
  showProgress('download', 1);
  await nextFrame();
  // build on the main thread in stages, letting the progress bar repaint between them
  // (a background worker gets throttled to a fraction of this speed)
  const terrain = new Terrain(tm, new Uint16Array(tb));
  const steps = computeCitySteps(data, terrain, { density: MOBILE ? 0.5 : 1, stream: memorySaver });
  let desc: CityDesc;
  for (;;) {
    const r = steps.next();
    if (r.done) { desc = r.value; break; }
    showProgress(r.value, 1);
    await nextFrame();
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
  showProgress('pack', 1);
  await nextFrame();
  const city = assembleCity(desc, { clippingPlanes: planes, stream: memorySaver });
  scene.add(city.group);
  if (MOBILE) city.setLODScale(0.65);
  showProgress('assemble', 1);
  await nextFrame();
  city.bakeGround(renderer, MOBILE ? 256 : 512);
  const traffic = createTraffic(city, terrain, MOBILE ? { clippingPlanes: planes, cars: 2500, people: 5000 } : { clippingPlanes: planes });
  traffic.setLight(lightTraffic);
  scene.add(traffic.group);
  const clouds = createClouds({ hw: W / 2, hh: H / 2 }, 1080);
  const birds = createBirds(terrain, { hw: W / 2, hh: H / 2 }, planes);
  scene.add(clouds.group, birds.group);
  ink.compMat.uniforms.clouds.value = clouds.uniforms;
  const lamps = createLamps(city.roadList, terrain, { hw: W / 2, hh: H / 2 }, planes);
  scene.add(lamps.group);
  const precip = createPrecip({ hw: W / 2, hh: H / 2 }, MOBILE ? 9000 : 24000);
  scene.add(precip.mesh);
  ink.skipNormal.push(...lamps.glows, ...traffic.glows, clouds.group, precip.mesh); // soft, see-through: no ink lines
  applyTime(timeNow, wxNow, { clouds, lamps, traffic, precip });
  const landmarks = createLandmarks({ data, terrain, clippingPlanes: planes });
  const labels = createLabels({ meta, terrain, crosses: data.crosses || [], places: data.places || {}, container: $('labels') });
  try { labels.enabled = localStorage.getItem('skopje.labels') !== '0'; } catch { /* storage unavailable */ }
  namesBtn.classList.toggle('off', !labels.enabled);
  scene.add(landmarks.group);
  try { await document.fonts.load("46px 'Rubik Mono One'"); } catch { /* font optional */ }
  const game = createGame({ terrain, meta, crosses: data.crosses || [], places: data.places || {}, clippingPlanes: planes });
  scene.add(game.group);
  ink.skipNormal.push(game.beam);
  const flight = createFlight({ scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 } });
  flight.setInvertY(invertBox.checked);
  const drive = createDrive({ scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 }, roads: city.roadList });
  // walking: the plane waits on Macedonia Square
  const sq = data.places?.square ?? [365, 1035];
  const planeSpot = { x: sq[0] + 40, z: sq[1] + 22, yaw: Math.PI / 2 };
  const walk = createWalk({
    scene, camera, terrain, bounds: { hw: W / 2, hh: H / 2 }, meta, places: data.places || {}, buildings: data.buildings,
    areas: data.areas, roads: city.roadList,
    crosses: data.crosses || [], gondola: landmarks.gondola, planeSpot,
    hooks: { nearestBus: traffic.nearestBus, startOro: traffic.startOro, stopOro: traffic.stopOro, scatter: traffic.scatter, startle: birds.startle },
  });
  walk.setInvertY(invertBox.checked);
  world = { terrain, meta, city, traffic, clouds, birds, lamps, precip, landmarks, labels, game, flight, drive, walk, planeSpot };
  console.log('city ready in', Math.round(performance.now() - t0), 'ms', city.stats, traffic.counts);

  const maxTex = renderer.capabilities.maxTextureSize;
  shadowRes = Math.min(MOBILE ? 2048 : 8192, maxTex);
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.5;
  sun.shadow.radius = 2;
  if (qualityMode === 'low') setLowTier(true);

  const P = (lat: number, lon: number) => [(lon - meta.lon0) * meta.kx, -(lat - meta.lat0) * meta.ky] as const;
  const at = (lat: number, lon: number): Vec3 => { const [x, z] = P(lat, lon); return [x, terrain.at(x, z), z]; };
  const park = data.places?.park;
  Object.assign(VIEWS, {
    center: { t: at(41.9968, 21.4318), d: 620, polar: 0.74, az: 0.08 },
    kale: { t: at(42.0012, 21.4355), d: 640, polar: 0.72, az: 0.3 },
    park: { t: park ? [park[0], terrain.at(...park), park[1]] : at(42.0075, 21.4190), d: 1000, polar: 0.72, az: -0.25 },
    vodno: { t: at(41.9725, 21.4020), d: 3600, polar: 1.02, az: Math.PI - 0.25 },
    overview: { t: [0, 60, 600], d: 19000, polar: 0.7, az: 0 },
  } satisfies Record<string, View>);
  applyHash() || setView('center');
  // memory saver: build the detailed ground around the first view before showing it
  for (let i = 0; i < 400; i++) { city.updateLOD(camera); if (!city.streamPending) break; await nextFrame(); }
  showProgress('bake', 1);
  status.textContent = '';
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 700);
}

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
function applyTime(p: TimeState, w: Weather, fx: Pick<World, 'clouds' | 'lamps' | 'traffic' | 'precip'> | null): void {
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
function setWeather(name: WeatherName): void {
  wxTween = { from: wxNow, to: WEATHER[name], t: 0 };
  wxName = name;
  weatherBtn.textContent = t(`weather.${name}`);
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
const qualityLabel = () => t(qualityMode === 'low' ? 'quality.low' : lowTier ? 'quality.autoLow' : 'quality.auto');
qualityBtn.textContent = qualityLabel();
qualityBtn.addEventListener('click', () => {
  qualityMode = qualityMode === 'auto' ? 'low' : 'auto';
  try { localStorage.setItem('skopje.quality', qualityMode); } catch { /* storage unavailable */ }
  perf.sinceChange = 0;
  setLowTier(qualityMode === 'low');
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
    if (MOBILE && navigator.share) { await navigator.share({ title: document.title, url }); return; }
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = t('share.copied');
    setTimeout(() => (shareBtn.textContent = t('share')), 1600);
  } catch { /* share sheet closed or clipboard refused: the link is still in the address bar */ }
});
// memory saver (streaming): detailed ground only near the camera; on by default on phones
let memorySaver = MOBILE;
try { const v = localStorage.getItem('skopje.memorySaver'); if (v) memorySaver = v === '1'; } catch { /* storage unavailable */ }
const streamBtn = $('stream');
streamBtn.classList.toggle('off', !memorySaver);
streamBtn.addEventListener('click', () => {
  memorySaver = !memorySaver;
  streamBtn.classList.toggle('off', !memorySaver);
  world?.city.setStreaming(memorySaver);
  try { localStorage.setItem('skopje.memorySaver', memorySaver ? '1' : '0'); } catch { /* storage unavailable */ }
  camDirty = true;
});
// less traffic: an option only, never switched on automatically
let lightTraffic = false;
try { lightTraffic = localStorage.getItem('skopje.lightTraffic') === '1'; } catch { /* storage unavailable */ }
const trafficBtn = $('traffic');
trafficBtn.classList.toggle('off', !lightTraffic);
trafficBtn.addEventListener('click', () => {
  lightTraffic = !lightTraffic;
  trafficBtn.classList.toggle('off', !lightTraffic);
  world?.traffic.setLight(lightTraffic);
  try { localStorage.setItem('skopje.lightTraffic', lightTraffic ? '1' : '0'); } catch { /* storage unavailable */ }
  ink.reset();
});
const weatherBtn = $('weather');
weatherBtn.textContent = t(`weather.${wxName}`);
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
const closePopups = (except?: Popup) => popups.forEach((p) => { if (p !== except) { p.menu.classList.remove('open'); p.btn.setAttribute('aria-expanded', 'false'); } });
for (const p of popups) {
  p.btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !p.menu.classList.contains('open');
    closePopups(p);
    p.menu.classList.toggle('open', open);
    p.btn.setAttribute('aria-expanded', String(open));
  });
}
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
  inkBtn.classList.toggle('off', !ink.ink);
  ink.reset();
});
const namesBtn = $('names');
namesBtn.addEventListener('click', () => {
  if (!world) return;
  const { labels } = world;
  labels.enabled = !labels.enabled;
  namesBtn.classList.toggle('off', !labels.enabled);
  try { localStorage.setItem('skopje.labels', labels.enabled ? '1' : '0'); } catch { /* storage unavailable */ }
  labels.update(camera, controls.target);
});
const liveBtn = $('live');
liveBtn.addEventListener('click', () => {
  live = !live;
  liveBtn.classList.toggle('off', !live);
  ink.reset();
});
$('shot').addEventListener('click', () => {
  ink.render(scene, camera, false); // draw now so the canvas still holds the frame
  const a = document.createElement('a');
  a.download = 'skopje.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

// ---------------- airplane mode
const flyHud = $('flyhud');
const flyStats = $('fly-stats'), flyWarn = $('fly-warn');
const flyGame = $('fly-game'), flyArrow = $('fly-arrow'), flyDist = $('fly-dist');
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
raceBtn.addEventListener('click', () => {
  race = !race;
  try { localStorage.setItem('skopje.race', race ? '1' : '0'); } catch { /* storage unavailable */ }
  applyRace();
  if (race) startRace();
});
$('fly-again').addEventListener('click', () => { flyResult.hidden = true; startRace(); });
$('fly-free').addEventListener('click', () => { race = false; try { localStorage.setItem('skopje.race', '0'); } catch { /* storage unavailable */ } applyRace(); });
const lastShadowAt = new THREE.Vector3(1e9, 0, 0);
function startFlight(at?: THREE.Vector3, yaw?: number): void {
  if (!world || world.flight.active || world.drive.active || world.walk.active) return;
  controls.enabled = false;
  if (race) startRace();
  else {
    // free flight from where the camera is, facing the way it looked (or from the parked plane)
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    world.flight.start(at ?? controls.target, yaw ?? -az);
  }
  document.body.classList.add('flying');
  flyHud.hidden = false;
  flyResult.hidden = true;
  applyRace();
  if (!live) liveBtn.click();
}
function stopFlight(): void {
  if (!world?.flight.active) return;
  const { flight, terrain, game } = world;
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
  if (resumeWalk) { resumeWalk = false; startWalk(controls.target.clone()); }
}
// ---------------- drive a ЈСП double-decker (shares the flight HUD: speed, exit, arrows)
function startDrive(at?: THREE.Vector3, yaw?: number): boolean {
  if (!world || world.flight.active || world.drive.active || world.walk.active) return false;
  const f = new THREE.Vector3().subVectors(controls.target, camera.position);
  if (!world.drive.start(at ?? controls.target, yaw ?? Math.atan2(f.x, -f.z))) return false; // no street nearby
  closePopups();
  controls.enabled = false;
  document.body.classList.add('flying', 'driving');
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
// touch joystick (bottom left)
const stickEl = $('walk-stick'), knob = stickEl.querySelector<HTMLElement>('.knob')!;
let stickId = -1;
const stickMove = (e: PointerEvent) => {
  if (!world) return;
  const r = stickEl.getBoundingClientRect(), R = r.width / 2;
  let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  world.walk.stick.x = dx; world.walk.stick.y = -dy;
  knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
};
stickEl.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); stickId = e.pointerId; stickEl.setPointerCapture(e.pointerId); stickMove(e); });
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) stickEl.addEventListener(ev, () => {
  stickId = -1; knob.style.transform = '';
  if (world) world.walk.stick.x = world.walk.stick.y = 0;
});
// HUD texts (only touched when they change)
const hudCache = new Map<string, string>();
const setText = (id: string, text: string) => { if (hudCache.get(id) !== text) { hudCache.set(id, text); $(id).textContent = text; } };
const ACT_KEY: Record<WalkAction, Key | null> = { bus: 'act.bus', plane: 'act.plane', gondolaUp: 'act.gondolaUp', gondolaDown: 'act.gondolaDown', oro: 'act.oro', oroStop: 'act.oroStop', bark: 'act.bark', none: null };
const camDir = new THREE.Vector3();
function updateWalkHud(): void {
  if (!world) return;
  const { walk, traffic } = world;
  const a = walk.action(), key = ACT_KEY[a];
  const label = key ? t(key) : '';
  setText('walk-hint', label ? (MOBILE ? label : `E — ${label}`) : '');
  setText('walk-act', label ? label.split(' ')[0] : '·');
  setText('walk-who', t(`char.${walk.character}`));
  setText('walk-view', walk.view === 'third' ? '👁' : '🎥');
  setText('walk-char', walk.character === 'pejo' ? '🐕' : '🧔');
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
}
// on-screen flight buttons: hold to press; on touch screens БРЗО is a toggle (tap on, tap off)
flyHud.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => {
  const k = b.dataset.k as 'left' | 'right' | 'up' | 'down' | 'boost';
  const set = (on: boolean) => {
    if (!world) return;
    const { input } = world.drive.active ? world.drive : world.flight;
    if (k === 'boost') { input.boost = on; b.setAttribute('aria-pressed', String(on)); } else input[k] = on ? 1 : 0;
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

// invert-Y preference (remembered per browser)
const invertBox = $<HTMLInputElement>('opt-invert');
try { invertBox.checked = localStorage.getItem('skopje.invertY') === '1'; } catch { /* storage unavailable */ }
invertBox.addEventListener('change', () => {
  world?.flight.setInvertY(invertBox.checked);
  world?.walk.setInvertY(invertBox.checked);
  try { localStorage.setItem('skopje.invertY', invertBox.checked ? '1' : '0'); } catch { /* storage unavailable */ }
});

// interface language (map names stay Macedonian)
const langSel = $<HTMLSelectElement>('lang');
for (const [code, name] of LANGS) langSel.add(new Option(name, code, false, code === lang));
langSel.addEventListener('change', () => { setLang(langSel.value); closePopups(); });
onLangChange(() => {
  timeBtn.textContent = t(`time.${timeName}`);
  weatherBtn.textContent = t(`weather.${wxName}`);
  seasonBtn.textContent = t(`season.${seasonName}`);
  qualityBtn.textContent = qualityLabel();
  shareBtn.textContent = t('share');
  hudCache.clear();
  raceBtn.textContent = raceLabel();
  if (loader.isConnected) loadText.textContent = t(`stage.${lastStage}`);
});

// help dialog behind the logo
const help = $<HTMLDialogElement>('help');
$('app-version').textContent = `v${__APP_VERSION__}`;
$('logo').addEventListener('click', () => help.showModal());
$('help-close').addEventListener('click', () => help.close());
help.addEventListener('click', (e) => { if (e.target === help) help.close(); });

// keyboard + gamepad navigation on the map (flight has its own controls)
const mapInput = createMapInput({ controls, camera, isActive: () => !!world && !world.flight.active && !world.drive.active && !world.walk.active && !document.querySelector('dialog[open]') });
const padPrev = { a: false, b: false, x: false, y: false, start: false };
let padHintShown = false;
addEventListener('gamepadconnected', (e) => console.log('gamepad:', e.gamepad.id, e.gamepad.mapping || 'non-standard (DirectInput)'));

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  SHARED.uTime.value += dt;
  if (world?.flight.active || world?.drive.active || world?.walk.active || live) governQuality(dt);
  controls.update();
  if (!world) return; // set at the end of loading: everything exists
  const { flight, drive, walk, game, terrain, city, traffic, clouds, birds, precip, landmarks, labels } = world;
  // ---- gamepad
  const pad = readPad();
  if (pad) {
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
      if (pad.b && !padPrev.b) stopFlight();
      if (pad.x && !padPrev.x) raceBtn.click(); // race on/off
      if (pad.start && !padPrev.start && race) { flyResult.hidden = true; startRace(); } // restart race
    } else if (pad.y && !padPrev.y) startFlight();
    Object.assign(padPrev, { a: pad.a, b: pad.b, x: pad.x, y: pad.y, start: pad.start });
    if (!padHintShown) { padHintShown = true; document.body.classList.add('has-pad'); }
  } else if (flight.active) Object.assign(flight.pad, { turn: 0, climb: 0, boost: false });
  else if (drive.active) Object.assign(drive.pad, { turn: 0, throttle: 0 });
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
    fitShadow(flight.active ? 1100 : undefined);
    ink.reset();
  }
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
    landmarks.update(dt);
    precip.update(dt, camera, controls.target);
    ink.render(scene, camera, true);
    return;
  }
  if (flight.active) {
    flight.update(dt);
    controls.target.copy(flight.pos); // drives shadows, LOD and traffic sizing
    updateCameraRange();
    city.updateLOD(camera);
    if (flight.pos.distanceTo(lastShadowAt) > 150) { fitShadow(1100); lastShadowAt.copy(flight.pos); }
    ink.reset();
    const h = flight.hud;
    flyStats.textContent = `${h.kmh} ${t('u.kmh')} · ${h.alt} ${t('u.m')}`;
    const warn = h.warn ? t(`warn.${h.warn}`) : '';
    if (flyWarn.textContent !== warn) flyWarn.textContent = warn;
    // race HUD (only when the race is on)
    if (race) {
      game.update(dt, flight.pos);
      const g = game.state;
      flyGame.textContent = g.finished ? `🏁 ${fmtTime(g.time)} · 🎈 ${g.popped}/${g.balloons}` : `◎ ${g.next}/${g.total} · ⏱ ${fmtTime(g.time)} · 🎈 ${g.popped}/${g.balloons}`;
      if (flyFlash.textContent !== g.flash) flyFlash.textContent = g.flash;
      if (!g.finished) {
        const tp = g.nextRing.p, p = flight.pos;
        const bearing = Math.atan2(tp.x - p.x, -(tp.z - p.z));
        flyArrow.style.transform = `rotate(${bearing - flight.yaw}rad)`;
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
    traffic.update(dt, camera, controls.target);
    clouds.update(dt);
    birds.update(dt);
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
    birds.update(dt, THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / 700, 1, 5));
    landmarks.update(dt);
    precip.update(dt, camera, controls.target);
  }
  labels.update(camera, controls.target);
  if (!live && ink.converged) return; // static & fully supersampled: idle
  ink.render(scene, camera, live);
});

window.__dbg = { scene, renderer, sun, camera, controls, ink, SHARED, setView, fitShadow, updateCameraRange, get world() { return world; }, get city() { return world?.city; }, get flight() { return world?.flight; } };

init().catch((e: unknown) => {
  console.error(e);
  loadText.textContent = t('error') + (e instanceof Error ? e.message : String(e));
});
