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
7. **v1.1.0** (Nov 2026): UI in 6 languages (mk, en, sr Cyrillic, hr, sl, sq; map
   names stay Macedonian), whole codebase moved to strict TypeScript 7, version
   shown in the help dialog, CI on Node 24 with a type-check step.
8. **v1.4.0** (Nov 2026): weather — 🌤 clear / 🌧 rain / ❄ snow / 🏔 snow on Vodno,
   blended over 2 s and combined with the time of day; falling rain/snow, wet streets
   with puddles, snow on ground, roofs and trees (roads stay slush). On touch screens the
   БРЗО (boost) button is a toggle.
9. **v1.5.0** (Nov 2026): desktop bar uses the popup menus too (📍 Места, ⚙ Опции), with
   Преглед, weather and language always on the bar; phones unchanged.
10. **v1.6.0** (Nov 2026): seasons 🌳 summer / 🍂 autumn / ☃ winter / 🌸 spring (tree and grass tints;
   cypresses keep `aEvergreen`), automatic low quality tier + ⚡ Quality option, 🚗 less
   traffic option, labels for Telecom centre, Daut Pasha Hamam, Св. Спас, City Mall,
   railway station; Kale label on the fortress.
11. **v1.7.0** (Nov 2026): shareable links (`#@lat,lon,distance,tilt,heading`, 🔗 copy/share), railway
   station model (Kenzo Tange), red ЈСП buses (half double-deckers), drivable ЈСП
   double-decker (🚌, `drive.ts`, rounded model shared with traffic), 💾 memory saver:
   detailed ground streamed per chunk; desktop menu: copy link first; phone menu: weather,
   season, bus, copy link first.
12. **v2.0.0** (Nov 2026): rain: ~60 % fewer pedestrians (snowfall ~40 %), most carry coloured umbrellas;
   default season and weather from the month (Dec–Feb winter + snow on Vodno) unless chosen.
   🚶 Walking as Итар Пејо or a Шарпланинец (`walk.ts`): first/third person, shared invert
   option, companion, context action (bus, parked plane, gondola, оро, bark), info cards,
   nearest-bus pointer, building collision, standing on the drawn surface (draped layers).
13. **v2.0.1** (Nov 2026): documentation: README features rewritten, IDEAS.md marks what is built,
   help dialog rows for walking and bus controls (6 languages), translation review page regenerated.
14. **v2.1.0** (Nov 2026): ⚡ quality cycles auto → high → low; „висок“ forces the full tier at the top
   resolution (no frame-time governor). On/off options in ⚙ are drawn as switches (`aria-pressed`).
15. **v2.2.0** (Nov 2026): performance: the low tier draws the scene once (normals from the colour
   pass, ~25 % less GPU time, same pixels); ✨ Мазни рабови switch (4× MSAA, off = single pass in the
   full tier too); menus that do not fit above the bar wrap into two columns; per-pass GPU timing
   script (`scripts/browser/pass-timing.js`).
16. **v2.2.1** (Nov 2026): documentation: "Settings" section (what is saved, what resets on load,
   what the code decides for desktop and mobile), v2.2.0 pass timings under measured numbers.
17. **v2.4.0** (Nov 2026): 🔥 Пожар, a second optional game in the flight (`fire.ts`, `water.ts`):
   the plane becomes a yellow Air Tractor on floats; at most two fires burn at a time (a patch of
   forest, a building's roof or a ЈСП bus stopped in the traffic), found by their smoke and the
   arrow; Space / 💧 / LT drops water with a ring showing where it lands; the tank is refilled by
   skimming the Vardar; every fire put out unrolls a tow banner „Стојанче го спаси градот“.
   Near a fire and while water falls the chase camera pulls back and up. A forest or bus fire
   leaves a burnt patch: charred trees and sooty ground, a colour-only tint in the tree and
   ground shaders (`SHARED.uBurn`, up to 6 patches, skipped while `uBurnOn` is 0, cleared when
   the mode ends). Stepping harness for it: `scripts/browser/fire-harness.js`.
18. **v2.5.0** (Nov 2026): paragliders soaring over the north slope of Vodno (`createParagliders`
   in `atmos.ts`): 8 (5 on `MOBILE`), each circling in its own thermal, grown with the zoom like
   the birds; they stay down at night and in rain or snow. The pixel check hides them, like the
   birds.
19. **v2.6.0** (Nov 2026): 🔊 Звук, optional sound, off by default (`sound.ts`): everything is
   synthesised with Web Audio, no audio files — engine and propeller (a turbine whine for the
   Air Tractor, a lower engine for the bus), wind, rain, the water drop and scooping, fire roar
   and crackle by distance, birds by day and crickets at night, and short signals (ring, balloon,
   finish, new fire, fire out, bark). A switch in ⚙ and a speaker button in the flight and
   walking HUDs; the choice is saved. The audio graph is built on the first switch-on.
20. **v2.6.1** (Nov 2026): gamepad reads only pads with the browser's standard mapping (Xbox,
   PlayStation, …); the DirectInput axis/hat guesses are gone and unmapped pads are ignored.
   The most recently used pad wins.
21. **v2.7.0** (Nov 2026): fires are easier to put out (`KIND` in `fire.ts`). Measured with
   scripted level passes at cruise speed (water released when the ring turns yellow): a
   full-grown roof fire needed 30 packets and a dead-centre pass landed 21, 16 m off centre
   landed none; full-grown forest and bus fires were marginal (35 of 33, 13 of 12). Now less
   water is needed (`tough` forest 1 → 0.8, building 0.9 → 0.55, bus 0.35 → 0.3) and water
   counts a little further out for roofs and buses (`pad` 8 / 9 → 12 m): one pass puts out a
   full-grown fire when flown within 12 m of the middle of a roof, 10 m of a bus, 25 m of a
   forest. Growth, the tank and the drop are unchanged.
   Camera height in the map view (`input.ts`): C higher / V lower, a horizontal mouse wheel
   (left higher, right lower, a fifth of the distance per notch) and the pad's bumpers
   (LB higher, RB lower). The camera goes straight up or down, still looking at the same
   place, so the tilt changes; at the steepest or flattest angle it keeps changing height
   along its line of sight (zooming), within the usual distance limits. Tried and taken out
   again: the mouse back / forward buttons (they stay the browser's) and a variant that
   kept the tilt and slid the orbit target along the ground instead.
   Z / X zoom and R / F tilt swapped: X in, Z out; F up, R down; "invert up/down" turns the
   map's tilt round (F / R and the pad's right stick; stick up is the flatter view, with
   invert on it is toward top-down).
   Stunts in the flight on the pad's right stick, flicked (`flight.stunt`): left / right a
   roll (1.1 s, the plane flies straight on), back a loop up and over, forward a loop nose
   down and under (1.7 rad/s: 3.7 s, 32 m radius at cruise; the loop under needs that room
   below, otherwise "too low" shows). One at a time, no steering in a loop, the chase camera
   stays level and watches. With water on board a stunt spills a little (`SPILL` in
   `fire.ts`: a tenth of the drop rate, about 3 % of the tank in a roll and 14 % in a loop,
   plus a thin trail of drops so it shows); spilled water can hit a fire but does not pull
   the camera back. After a roll or a loop in the firefighting mode the tow banner flies for 6 s with
   „Село гори, баба се чешла“, the camera out to the side for 3 s as for a fire put out
   (a second text on the same cloth; the fire-out banner wins if it is flying).
   🔊 Sound is on by default now (it was off since v2.6.0); switching it off is remembered.
   Checked with synthetic key, wheel and gamepad events and by stepping the flight with
   `fire-harness.js`, not with a real mouse or pad. Seen while testing, not looked into:
   ink lines of what is behind the tow banner show through the cloth (both texts).
22. **v2.7.1** (Nov 2026): stunt keys in the flight: Q / E roll left / right, F a loop up and
   over, R a loop nose down and under; "invert up/down" swaps F and R, the same rule as the
   map's F / R tilt. With Cmd / Ctrl / Alt held the keys stay the browser's (reload, find).
   The key hint in the flight says „Q E F R акробации“, the help dialog has a row for them.
   Checked by stepping the flight with synthetic key presses, both invert states.

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
- GPU frame ≈ 13–16 ms close views, ~22 ms overview (live traffic on) — older measurement.
- v2.2.0, M5 Pro, 2400×1500, traffic on (`scripts/browser/pass-timing.js`): full tier 9.9–12.5 ms
  (colour pass with 4× MSAA 8–10, normal pass 1–2, composite ~1.2, accumulation + output ~0.4);
  smooth edges off 6.2–8.2 ms; low tier 3.6–6.8 ms (was 4.8–9.5 with the separate normal pass).
  A shadow map refresh adds 2–6 ms on frames where the camera moved.
- JS heap ≈ 1.7 GB desktop, ≈ 0.9 GB mobile profile (not recorded whether the mobile figure
  was taken with the memory saver on; re-measure before relying on it).
- 20.5k buildings, ~430k trees, ~68k parked cars, 6.5k cars, 15k people (desktop).

## Tuning knobs (where to change things)

| What | Where |
|---|---|
| Colour palette (facades, roofs, areas, roads, trees) | `PAL` in `src/city.ts` |
| Day / sunset / night lighting, ink, haze, grade | `TIMES` in `src/sky.ts` |
| Weather (rain, snow, snow on Vodno, snow line) | `WEATHER` in `src/sky.ts`; drop size/speed in `src/weather.ts`; wet/snow look in `groundShader()`, `src/city.ts` |
| UI colours (Вез) and stitch pattern | `:root` variables in `index.html` |
| Tree LOD distances | `LOD0` in `makeLOD()`, `src/city.ts` |
| Tree density per area kind | `DENS` in `computeCitySteps()`, `src/city.ts` |
| Overall tree / parked-car density | `density` option of `computeCitySteps` (mobile uses 0.5) |
| Render resolution levels | `QUALITY` in `src/main.ts` |
| MSAA / single pass (smooth edges, low tier) | `setMSAA()`, `setLow()`, `_path()` in `src/post.ts` |
| Menu wrapping into two columns | `fitPopup()` in `src/main.ts`, `.places.cols` in `index.html` |
| Mobile profile (shadow size, bake size, agents) | `MOBILE` checks in `init()`, `src/main.ts` |
| Moving cars / people counts | `opts.cars`, `opts.people` in `src/traffic.ts` |
| Clouds count, size, wind | `MAX_CLOUDS`, `createClouds()` in `src/atmos.ts` |
| Plane speed, turn rate, min height | `SPEED`, `BOOST`, `TURN`, `MIN_AGL` in `src/flight.ts` |
| Race route and ring size | `ROUTE`, `RING_R` in `src/game.ts` |
| Labels (districts, landmarks) | `DISTRICTS`, `LANDMARKS` in `src/labels.ts` |
| Camera views (Плоштад, Кале…) | `VIEWS` in `init()`, `src/main.ts` |
| Building height heuristics, district zones | `buildingInfo()`, `ZONES_TALL`, `ZONES_MID` in `scripts/prepare.ts` |
| Road widths, area kinds and draw order | `ROAD_W`, `areaKind()`, `AREA_Z` in `scripts/prepare.ts` |
| Exact named places (labels, rings) | `PLACE_NAMES` in `scripts/prepare.ts` |
| Map extent | `BBOX` in `scripts/config.ts` (+ `data/query.overpassql`) |

## Settings: what is saved, what resets, what the code decides

All saved settings are `localStorage` keys starting with `skopje.`, read once at load
(every read is wrapped in try/catch: with storage blocked everything simply uses the default).

**Saved and loaded on the next visit**

| Setting | Key | Default when nothing is saved |
|---|---|---|
| ☀ Time of day | `skopje.time` | day |
| Weather | `skopje.weather` | from the month: snow on Vodno in Dec–Feb, otherwise clear |
| Season | `skopje.season` | from the month (Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn) |
| ⚡ Quality | `skopje.quality` | auto (only `high` / `low` are read back) |
| ✨ Мазни рабови | `skopje.smooth` | on |
| 💾 Memory saver | `skopje.memorySaver` | on for `MOBILE`, off on desktop |
| 🚗 Less traffic | `skopje.lightTraffic` | off |
| 🔊 Sound | `skopje.sound` | on (audio starts with the first click or key press: browsers do not allow it earlier) |
| Имиња (labels) | `skopje.labels` | on |
| 🌐 Language | `skopje.lang` | the browser's first regional language (never English by itself), else Macedonian; `?lang=` in the link wins over everything |
| 🏁 Race / free flight | `skopje.race` | free flight |
| 🔥 Firefighting | `skopje.fire` | off (race and firefighting exclude each other; if both are saved, the race wins) |
| Invert Y (flight, walking look, the map's tilt: F / R keys and the pad's right stick) | `skopje.invertY` | off |
| Best race time | `skopje.bestRace` | none |
| Most fires put out in one flight | `skopje.bestFire` | 0 |

The camera is not in storage: it is in the address bar (`#@lat,lon,distance,tilt°,heading°` or
a view name), so a reload or a shared link restores it; without a hash the map opens on Плоштад.

**Not saved — back to the default on every load**

- Живо (live) and Контури (ink lines): always on.
- Walking: character (Итар Пејо) and view (third person).
- Flight, walking and bus mode: a visit always starts on the map.

**Changing by themselves**

- Weather and season defaults follow the calendar month until the visitor picks one; from
  then on the saved choice wins.
- Render resolution (`QUALITY` levels) steps down when frames are slow and back up when they
  are fast, on every visit, unless Quality is `high`.
- The low tier under Quality `auto` switches on when the lowest resolution is still slow. It
  stays on for that visit only and is not saved, so a slow device starts every visit in the
  full tier and has to slow down again first. (Idea: remember it.)

**Decided by code at load, no option**

- `MOBILE` (`main.ts`): user agent says Android/iPhone/iPad/Mobile, or an iPad posing as a Mac
  (`MacIntel` with touch points), or a coarse pointer, or the shorter screen side under 600 px.
  It fixes for the whole visit: half the trees and parked cars, 2048 shadow map (8192 on
  desktop), 256 px far-ground textures (512), 2,500 cars and 5,000 people (6,500 and 15,000),
  9,000 rain/snow particles (24,000), LOD scale 0.65, starting resolution 1.0× instead of 1.5×,
  memory saver on by default, share sheet instead of clipboard for 🔗.
  Quality `high` on a phone does not bring these back: they are built at load.
- `PHONE` (a CSS media query, `placeBarItems()`): only the layout — which buttons sit on the
  bar and which move into the 📍 and ⚙ menus. It follows the window live.
- Every option exists on both desktop and mobile; nothing is desktop-only except the amounts above.

## Gotchas (learned the hard way)

- **Hidden or occluded browser windows pause `requestAnimationFrame` and clamp
  timers to ~1 s.** Frame timings from such a window are meaningless and the loading
  used to stall there. `nextFrame()` in `main.ts` races rAF, a 100 ms timeout and a
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
  In the low tier, or with smooth edges off, there is no normal pass: the colour pass writes the normals too, and a
  material writes none when it is `transparent` (so mark see-through things `transparent`
  with `depthWrite: false`). A custom `ShaderMaterial` in the scene must declare and write
  `gInk` itself (`weather.ts` shows how), or the normals under it are undefined.
- **Mobile detection needs the user agent**: emulated or real phones may report a
  desktop-sized viewport at module load; iPadOS reports itself as a Mac with touch.
- **The canvas has no `preserveDrawingBuffer`**: to save an image, render and call
  `toDataURL()` in the same task (see the Save PNG handler).
- **Overpass sometimes returns partial results without an error** — compare building
  counts in an overlapping area after `npm run download`.
- **OSM names vary** ("Национална арена Тодор Проески", not "Тоше Проески"); look up
  exact names in `data/skopje_raw.json` before adding to `PLACE_NAMES`.

## How to verify a change

1. `npm run typecheck` and `npm run build` must succeed.
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

## How to verify

- **Pixel identity** (clear weather, summer, memory saver off must not change): paste
  `scripts/browser/pixel-check.js` into the console on `npm run dev`, set clear + summer
  (the snippet's header has the one-liner), run `await __px.record()` on the old code, make
  the change, reload, paste again and run `await __px.compare()`. Each of the 9 views reports
  `{over2, max}` (pixels differing by more than 2/255, largest difference); expect 0 except a
  few hundred pixels around the moving gondola cabins. References live in IndexedDB `px-ref`.
  The page must be visible (it waits for the app's frames); two runs of the same code gave 0
  on all 9 views, in ~12 s.
- **Hidden or collapsed browser pane**: requestAnimationFrame and timers are throttled and
  screenshots can come back empty. Drive the app by hand instead: step the systems yourself
  (e.g. `__dbg.world.walk.update(dt)`, then `__dbg.ink.render(__dbg.scene, __dbg.camera, false)`
  a few times) and read pixels from `renderer.domElement.toDataURL()`. To look at such frames,
  run `node scripts/browser/shot-sink.ts <scratch folder>` and POST the data URL to
  `http://127.0.0.1:5199/<name>` (example in the file); then open the saved JPEG.
- **Firefighting** (🔥 Пожар): `scripts/browser/fire-harness.js` stops the app's loop and steps
  the flight, fires and water by hand (usage in its header): pick a fire kind, fly a pass, hold
  Space, read strength / tank / fires put out. Simulated dive keys must respect "invert up/down"
  (`__h.dive`), which is saved per browser.
- **GPU time**: `EXT_disjoint_timer_query_webgl2` around `ink.render`; frame times in a hidden
  pane mean nothing. Per pass: paste `scripts/browser/pass-timing.js`, then `await __passes()`.
  Time whole chains that end on the canvas and subtract: a pass timed alone reads as ~0,
  because the GPU only finishes what the final image depends on.
- **Set ⚡ quality to high (or low) before measuring or recording references.** On `auto` the
  governor sees the stalls a measuring script causes and switches to the low tier for the rest
  of the visit, so the numbers and reference images silently come from the wrong tier.
- **Memory** (memory saver): was measured by building the city in Node with the same code
  (that script was not kept); real phones are still on the "Not verified" list below.
- **Translations**: `npm run typecheck` catches a missing key; `npm run strings` then
  `docs/translations/index.html` (open on the dev server) shows all strings side by side,
  with notes and flagged ones.

## Not verified yet

- Real iPhone/iPad — only emulated. Memory limits there: see "A larger map" at the end.
- Real gamepads — only a simulated standard-mapping pad. Pads the browser does not map
  (`mapping` not `"standard"`, e.g. some generic DirectInput pads) are ignored on purpose.
- The automatic switch to the low quality tier on a really slow device (logic only; the
  low tier itself was measured: 10.9 → 4.7 ms GPU on the Square view at 1600×1000).
- Walking mode live in a visible window and on touch devices (joystick, drag-look), pointer
  lock and real gamepads — tested by stepping the simulation and rendering frames, since
  the browser pane was collapsed.
- Memory saver and bus driving on a real phone (memory measured in Node, driving tested
  with simulated keys on desktop).
- `prepare.ts` place lookup by OSM id (`PLACE_IDS`) and the Kale name fix — they take
  effect on the next `npm run data`; labels use hard-coded positions until then.
- ✨ Мазни рабови off, watched live while the camera moves (edges are then smoothed only by the
  accumulation): toggled and rendered without errors, timed, but not judged by eye. Not timed on
  a phone either; all pass timings are from an M5 Pro.
- Two-column menus on a real phone (checked at emulated 375×560, 375×330 and 1200×380).
- Weather on a real phone (particle count is lowered on `MOBILE`, not measured there), and
  the 2 s weather blend watched live (verified via direct renders; the pane was hidden).
- 🔊 Sound has not been listened to: it was built without ears. Checked: it starts from a real
  click, follows the modes (output level, RMS before the limiter: crickets on the night map
  ≈ 0.007, plane engine ≈ 0.05, signals peak ≈ 0.12), goes silent when switched off, the
  setting survives a reload, no console errors. Not checked: how any of it sounds, the balance
  between layers, phones (iOS Safari audio unlock), the bus engine, rain and the bark in play.
- 🔥 Firefighting: the three fire kinds, the drop, the refill and the banner were checked by
  stepping the game with `fire-harness.js` (day, sunset, night; full tier, smooth edges off,
  low tier) and the HUD at 375×812, not by playing it through by hand. Not checked: touch (the
  💧 button) and LT on a real device, gamepad Y, how hard the aiming feels at boost speed, rain
  slowing the fires, the look of the Air Tractor against a photo of the real aircraft.
  GPU cost with a full fire and a drop in view was within the noise (6.4–6.9 ms either way at
  1083×1368, M5 Pro); flying through the smoke (large quads close to the camera) was not timed.

## Backlog / ideas

- Memory saver (done): draped ground + detailed terrain are built per chunk near the camera
  (`lazy.ground/terrainHi`, `makeLOD`), on by default on phones. At the Square view a phone
  keeps 37 of 204 chunks = 213 MB instead of 568 MB; the overview keeps none.
  Buildings (119 MB) and trees are still built for the whole map.
- 3D models for the hamam (domes) and the Telecom centre; they are ordinary OSM buildings
  for now (the railway station has its model, `MODELLED_BUILDINGS` in `city.ts`).
- Bus mode extras: bus stops, a route to follow, a horn; gamepad button to start the bus.
- Firefighting extras: a burnt mark on a building's roof (forest and bus fires leave one, see
  v2.4.0); burnt patches that stay after leaving the mode (they are cleared, so the plain map
  stays as it was) and that show on the far, baked ground; ink lines of the trees and roofs
  behind dense steam still show through it (the ink is drawn after the particles); on steep
  slopes (Vodno) a fire far below the plane is hard to reach and to frame.
- Facade variety by building type (shops, schools, churches), roof-top terraces.
- `npm run download` should also fetch `data/aerialway.json`.

### Performance on slower machines and weak phones

Today: the frame-time governor lowers resolution (`QUALITY` 1.5 → 0.8 in `main.ts`) and
`MOBILE` halves trees/parked cars, uses 2048 shadows, 256 px far textures, fewer agents
and LOD scale 0.65. Everything else costs the same on every device. Plan, in order:

0. **Measure first**: time each pass with `EXT_disjoint_timer_query_webgl2` (colour,
   normal/depth, composite, accumulation, output, shadow map) on a weak device, so the
   work goes where the time is.
1. ✅ **Automatic low tier** — done (`setLowTier()` in `main.ts`, ⚡ Quality option). Was: when the governor is already at
   the lowest resolution and frames are still slow (or forced by a "Quality: Auto / Low"
   option in ⚙), switch to: no MSAA in `colorRT` (`samples: 4` → 0; the temporal
   accumulation already antialiases), AO off, cloud shadows off or fewer clouds (the
   composite loops over all `MAX_CLOUDS` per pixel), 1024 shadow map with plain PCF, extra
   resolution steps 0.6 / 0.5, fewer moving cars/people, shorter tree LOD distances.
2. ✅ **Drop the normal/depth pass — done for the low tier** (`gRT` in `post.ts`): the colour
   pass writes the normals into a second attachment. Normals and depth are the same as the
   separate pass gave, the low tier is pixel-identical, and a frame costs about 25 % less
   (2400×1500, M5 Pro: 6.4 → 4.8 ms Square, 9.5 → 6.8 Kale, 9.0 → 6.7 overview).
   Not used in the full tier: with 4× MSAA the resolve averages normals and depth, and the ink
   lines come out visibly thinner (it would save 1–3 ms of 10–12).
   Per pass, full tier, same size: colour pass with MSAA ≈ 8–10 ms, normal pass 1–2 ms,
   composite ≈ 1.2 ms, accumulation + output ≈ 0.4 ms; a shadow map refresh adds 4–6 ms on
   frames where the camera moved. **MSAA is the biggest cost**: the same frame without it (single pass)
   is 6.2–8.2 ms instead of 9.9–12.5, with identical ink lines; colour edges would then rely
   on the temporal accumulation alone, also while the camera moves. It is an option:
   ✨ Мазни рабови in ⚙ (on by default; `skopje.smooth`), off = single pass in the full tier too.
   In the low tier the switch changes nothing (already single pass).
3. ✅ **Lighter traffic CPU** — done as a manual option only (🚗, `traffic.setLight`;
   0.52 → 0.11 ms per frame on desktop). Was: 6.5k cars + 15k people are moved in JS every frame
   (`traffic.ts`). Update half per frame, fewer agents, or animate on the GPU.
4. ❌ **Prebuilt city data** — measured, not viable: the built geometry is ~744 MB (ground
   480 MB, buildings 119 MB, detailed terrain 88 MB) vs 1.8 MB gzipped `skopje.json`, so
   phones would download hundreds of MB. The memory saver gets the memory win instead.
   Was — **Faster loading on phones** (bigger): parsing the 7 MB `skopje.json` and building the
   city on the main thread is most of the load time. Prebuild the chunk geometry in Node
   (`computeCitySteps` output → binary files) so phones only download and upload buffers;
   also cuts peak memory (iOS Safari limits).

Already in place: rendering stops when the scene is static and fully supersampled;
"Живо" off makes a still view almost free.

### A larger map: what scales, and memory ideas (Nov 2026)

Read from the code and scaled from the numbers above. **Nothing here was built or measured**;
every saving is an estimate.

What grows with the extent (today ≈ 16 × 11 km, 204 chunks):

- `terrain.bin`: exactly 2 bytes per 10 m cell, so proportional to the area
  (3.6 MB, 1.7 MB gzipped).
- `skopje.json`: grows with buildings and roads, not with the area (6.7 MB, 1.75 MB gzipped;
  buildings are half of it, roads a third).
- Far-ground textures: one per chunk (512 px desktop, 256 px phone).
- Built geometry, load time and the raw Overpass download (25 MB): roughly with the content.
- Frame time in close views does not grow (chunks, LOD, culling); the overview does.
- Also sized for today's extent: `controls.maxDistance` (26 km) and the shadow camera range
  (`sc.far`) in `src/main.ts`.

Vertex layout (`Builder`, `src/city.ts`; `chunkGeometry`, `src/terrain.ts`): everything is a
`Float32Array`, and Builder meshes are not indexed. A ground or terrain vertex is 36 bytes
(position, normal, colour: 12 each); a building vertex is 52 (plus `aFacade`, 16). The CPU copy
is dropped after upload (`freeOnUpload`), so this is GPU memory.

Ideas, in the order I would do them:

1. **Pack normals and colours into bytes** (normal 12 → 4, colour 12 → 4): ground and terrain
   36 → 20 bytes per vertex, buildings 52 → 36. Estimated ~744 → ~420 MB of built geometry
   (ground 480 → ~265, buildings 119 → ~82, detailed terrain 88 → ~55); a phone at the Square
   view 213 → ~120 MB. Works on every device and in every view.
   - Positions must stay floats: road, casing and rail layers are ~2 cm apart (`roadLift`),
     and 16-bit positions inside a 1 km chunk would have 1.5 cm steps.
   - Byte normals round the lighting, so clear weather would no longer be pixel-identical to
     v1.1.0: the reference images would have to be recorded again.
   - Roads and water are detected in the shaders by their exact palette colour: store a
     palette index, not a rounded colour.
2. **Stream the building meshes** like the ground (build near the camera, dispose further out).
   Estimated saving ~100–150 MB on a map twice the size.
   - Buildings have no distance levels today: all 20.5k are drawn in full even in the overview,
     so unbuilt chunks need a far stand-in (plain boxes).
   - Buildings split cleanly: each is seeded by its own id (`mulberry32(b.id)`). Sheds, parked
     cars and trees are placed in global random sequences with a shared `occupied` hash, so
     their positions must still be computed at load; only the geometry can be deferred.
   - Expect buildings arriving late in fast flight, ink lines changing at the swap, and box
     shadows from far chunks. Mesh creation order matters (depth ties by object id).
   - Trees are not worth streaming: 76 bytes per instance (4×4 matrix + colour), ~40 MB for all
     of them on desktop. A custom instanced shader could bring that to ~20 bytes each.
3. **Smaller far-ground textures for distant chunks**: after 1 and 2 they are the largest
   part that still grows with the map.
4. **Map data in tiles, loaded on demand**: the only step that also caps download, JSON
   parsing and load time. The largest change; needed well beyond twice the area.

Rough guide for phones: up to ~1.5× the area the existing memory saver probably carries it
(idea 1 for margin); around 2× ideas 1–3; beyond that also 4. Measure on a real iPhone first.

Browser memory limits (looked up Nov 2026; Apple publishes no figure, these come from WebKit
bug reports):

- iOS (Safari and Chrome, both WebKit): a tab is killed at a soft limit of about 1.5 GB;
  2 GB and ~3 GB are reported on recent Pro iPhones. The kill only happens when the system
  needs the memory, so the same page can survive on one phone and reload on another.
  GPU memory (WebGL buffers, textures) is charged to the tab. The simulator does not
  reproduce these kills.
- Desktop Chrome: JS heap limit 2 or 4 GB depending on the machine; typed arrays and GPU
  buffers are outside it, so the machine's RAM and video memory are the real ceiling.
