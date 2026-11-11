# 091 Скопје — project notes

Context for continuing the work (on any machine, in any Claude Code session).
For commands, architecture and conventions see [../CLAUDE.md](../CLAUDE.md).

## Goal

An illustrated 3D map of Skopje in the style of hand-drawn isometric city
illustrations (warm cream facades, terracotta roofs, lavender shadows, lumpy
cartoon trees, ink outlines) — built from OpenStreetMap, alive (traffic, people,
day/night) and fun (airplane, ring race). Tagline: „Го добивме 091 Скопје пред GTA 6!“

## How it evolved (short history)

1. Central Skopje tile from OSM → extruded buildings, draped roads/areas, cartoon
   trees, ink-outline post pass.
2. Terrain from AWS Terrarium tiles; map expanded to the whole urban area
   (BBOX 41.955–42.055 N, 21.33–21.525 E ≈ 16 × 11 km, Vodno included).
3. Chunked scene (1 km) with 3 LOD levels; far ground baked into textures.
4. Temporal supersampling (jittered accumulation) for clean anti-aliasing;
   AO, tinted ink, haze, two-tone foliage.
5. Live traffic, airplane mode, Macedonian UI + help dialog, GitHub Pages deploy.
6. Day/sunset/night, clouds/birds/river glints, staged loading, ring race,
   adaptive quality, landmarks + labels, keyboard/gamepad, mobile popups,
   mobile memory profile, Вез design.

## Key decisions (and why)

- **Static site, no backend** — everything precomputed into `public/` and built
  in the browser; deploys anywhere.
- **Building heights are heuristics** (~7% of OSM buildings have height tags):
  footprint shape (tower vs slab), district boxes (Karpoš/Aerodrom tall, Centar/Čair
  mid, periphery houses), industrial landuse → low halls, Kale towers → 14 m stone.
- **Large natural areas are painted into terrain vertex colours** (scanline raster),
  small/crisp areas are draped geometry — cut build time from ~10 s to <1 s.
- **Main-thread staged build instead of a Web Worker** — the worker was ~7× slower
  (background thread throttling); generator stages + `nextFrame()` keep the
  progress bar moving.
- **Cloud shadows in the post pass** (analytic, per pixel) so moving clouds never
  re-render the shadow map.
- **Shadow frustum follows the camera** (crisp close-ups); re-fit only on camera change.
- **Resolution capped at 1.5×** + temporal AA; governor steps down to 0.8× when slow.
- **Free flight by default**, race is opt-in (owner's request).

## Measured numbers (M-series Mac, desktop profile)

- Load ≈ 5.7 s visible tab (download + build + assemble + bake).
- GPU frame ≈ 13–16 ms close views, ~22 ms overview (live traffic on).
- JS heap ≈ 1.7 GB desktop, ≈ 0.9 GB mobile profile.
- 20.5k buildings, ~430k trees, ~68k parked cars, 6.5k cars, 15k people (desktop).

## Tuning knobs (where to change things)

| What | Where |
|---|---|
| Colour palette (facades, roofs, areas, roads, trees) | `PAL` in `src/city.js` |
| Day / sunset / night lighting, ink, haze, grade | `TIMES` in `src/sky.js` |
| UI colours (Вез) and stitch pattern | `:root` variables in `index.html` |
| Tree LOD distances | `LOD0` in `makeLOD()`, `src/city.js` |
| Tree density per area kind | `DENS` in `computeCitySteps()`, `src/city.js` |
| Overall tree / parked-car density | `density` option of `computeCitySteps` (mobile uses 0.5) |
| Render resolution levels | `QUALITY` in `src/main.js` |
| Mobile profile (shadow size, bake size, agents) | `MOBILE` checks in `init()`, `src/main.js` |
| Moving cars / people counts | `opts.cars`, `opts.people` in `src/traffic.js` |
| Clouds count, size, wind | `MAX_CLOUDS`, `createClouds()` in `src/atmos.js` |
| Plane speed, turn rate, min height | `SPEED`, `BOOST`, `TURN`, `MIN_AGL` in `src/flight.js` |
| Race route and ring size | `ROUTE`, `RING_R` in `src/game.js` |
| Labels (districts, landmarks) | `DISTRICTS`, `LANDMARKS` in `src/labels.js` |
| Camera views (Плоштад, Кале…) | `VIEWS` in `init()`, `src/main.js` |
| Building height heuristics, district zones | `buildingInfo()`, `ZONES_TALL`, `ZONES_MID` in `scripts/prepare.mjs` |
| Road widths, area kinds and draw order | `ROAD_W`, `areaKind()`, `AREA_Z` in `scripts/prepare.mjs` |
| Exact named places (labels, rings) | `PLACE_NAMES` in `scripts/prepare.mjs` |
| Map extent | `BBOX` in `scripts/config.mjs` (+ `data/query.overpassql`) |

## Gotchas (learned the hard way)

- **Hidden or occluded browser windows pause `requestAnimationFrame` and clamp
  timers to ~1 s.** Frame timings from such a window are meaningless and the loading
  used to stall there. `nextFrame()` in `main.js` races rAF, a 100 ms timeout and a
  `MessageChannel` hop for exactly this reason — keep it.
- **Web Workers ran the city build ~7× slower** (background-priority thread). The build
  is a generator (`computeCitySteps`) stepped on the main thread instead.
- **Vite hot reload restarts the page** when `index.html` or modules change; a test
  script running at that moment is cut off. Wait for the loader to disappear first.
- **`freeOnUpload` drops the CPU copy** of geometry/instance buffers after their first
  upload — geometry can't be read back or re-merged later. Compute bounding spheres
  before that (done in `geoFromData`/`inst`).
- **Shadow acne on roofs** (whole roofs going grey) was self-shadowing; the facade
  material uses `shadowSide: THREE.DoubleSide`.
- **Ground layers are stacked with tiny height offsets** (areas 0.1–0.7 m, roads
  ~0.9–1.1 m above terrain). This only works because the camera near plane scales with
  distance (`updateCameraRange()`); a fixed small near plane brings back z-fighting.
- **Colours inside render targets are linear**; only the final output pass converts to
  sRGB. Baked far-ground textures use an sRGB render target on purpose.
- **Transparent/additive things must skip the normal pass** (`ink.skipNormal`) or they
  get ink outlines and occlude AO/edges (clouds, lamp pools, headlights, race beam).
- **Mobile detection needs the user agent**: emulated or real phones may report a
  desktop-sized viewport at module load; iPadOS reports itself as a Mac with touch.
- **The canvas has no `preserveDrawingBuffer`**: to save an image, render and call
  `toDataURL()` in the same task (see the Save PNG handler).
- **Overpass sometimes returns partial results without an error** — compare building
  counts in an overlapping area after `npm run download`.
- **OSM names vary** ("Национална арена Тодор Проески", not "Тоше Проески"); look up
  exact names in `data/skopje_raw.json` before adding to `PLACE_NAMES`.

## How to verify a change

1. `npm run build` must succeed (catches syntax errors fast).
2. `npm run dev`, open http://localhost:5173 in a **visible** window.
3. Check the five views: `setView('center' | 'kale' | 'park' | 'vodno' | 'overview')`.
4. Cycle ☀ Ден → 🌇 Зајдисонце → 🌙 Ноќ; toggle Живо, Контури, Имиња.
5. Fly (✈ Авион), turn on 🏁 Трка, pass a ring, press Esc.
6. Mobile: emulate a phone (375×812, touch) — popups 📍 Места / ⚙ Опции, no
   overlap at the top, mobile profile active (`__dbg.city.stats.trees` ≈ 230k).
7. Console must show no errors (stale errors from a previous load can linger — reload).
8. Frame time on the GPU (works even when rAF is throttled):

```js
const gl = __dbg.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
__dbg.ink.render(__dbg.scene, __dbg.camera, false);
gl.endQuery(ext.TIME_ELAPSED_EXT);
setTimeout(() => console.log(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6, 'ms'), 500);
```

9. Clean high-res screenshot without UI: set a 1600×1000 viewport (canvas renders at
   2400×1500), pause Живо, wait for the image to settle, then in one task run
   `__dbg.ink.render(__dbg.scene, __dbg.camera, false)` and
   `__dbg.renderer.domElement.toDataURL('image/jpeg', 0.93)`.

## Data and licensing

- **Map data © OpenStreetMap contributors, ODbL.** `public/skopje.json` is a derived
  database: keep the attribution visible in the app (also on mobile) and, if the data
  is redistributed, it stays under ODbL (share-alike).
- **Elevation: Terrain Tiles on AWS Open Data** (Mapzen Terrarium format; sources
  include SRTM and other public datasets) — credited in the help dialog and README.
- Fonts (Lora, Rubik Mono One) load from Google Fonts under the SIL Open Font License.
- three.js and Vite are MIT licensed.

## Not verified yet

- Real iPhone/iPad (memory limits ~1–1.5 GB per tab) — only emulated.
- Real gamepads — only a simulated XInput pad; DirectInput axis layout is a heuristic.

## Backlog / ideas

- Stream chunks on demand (build full detail only near the camera) — the real fix
  for iOS memory if the mobile profile is still too heavy.
- Shareable links with camera position in the URL hash.
- More landmarks: Telecom tower, Holy Saviour church, Daut Pasha Hamam, City Mall,
  railway station; better Kale label position (no OSM name match).
- Facade variety by building type (shops, schools, churches), roof-top terraces.
- Seasonal looks (autumn trees, winter snow on Vodno).
- `npm run download` should also fetch `data/aerialway.json`.
