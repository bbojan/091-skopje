# 091 Скопје — project guide for Claude Code

An illustrated, living 3D map of Skopje (hand-drawn isometric look, like the
"illustrated Athens" maps) built with three.js from OpenStreetMap data on real
terrain. Static site, deployed to GitHub Pages: https://bbojan.github.io/091-skopje/

History, decisions, numbers and backlog: see [docs/NOTES.md](docs/NOTES.md).

## Commands

```bash
npm install          # once per machine
npm run dev          # Vite dev server on http://localhost:5173
npm run typecheck    # tsc (TypeScript 7, strict): src/ and scripts/ — CI runs it before building
npm run build        # static site → dist/ (relative paths, Pages-ready)
npm run download     # OSM via Overpass → data/skopje_raw.json (not in git, ~25 MB)
npm run terrain      # AWS Terrarium elevation tiles → public/terrain.bin/.json
npm run data         # data/skopje_raw.json (+ data/aerialway.json) → public/skopje.json
npm run strings      # index.html + src/i18n.ts → docs/translations/strings.js (translation review page)
```

- `public/skopje.json`, `public/terrain.*` are committed, so a fresh clone runs
  without downloading anything. Only re-run `download`/`data` when changing the
  extent or `scripts/prepare.ts`.
- `data/aerialway.json` (Vodno gondola) is a separate small Overpass download that
  is committed; `npm run download` does not fetch it.
- Map extent lives in `scripts/config.ts` (BBOX) — keep `data/query.overpassql` in sync.
- Deploy: pushing to `main` runs `.github/workflows/deploy.yml` (build → Pages, ~40 s).
  Check with `gh run list --limit 1`. GitHub auth is per machine (`gh auth login`);
  never commit tokens or credentials.

## Architecture (src/)

| File | Role |
|---|---|
| `main.ts` | App shell: renderer, controls, loading (staged build + progress card), views, time of day, flight/race wiring, popups, help, gamepad, adaptive quality |
| `city.ts` | `computeCitySteps` (generator; OSM+terrain → typed arrays per 1 km chunk) and `assembleCity` (meshes, materials, 3-level LOD, far-ground texture bake). Facade shader (windows, shutters, awnings, cornices, night glow), roof tiles, parapets, trees, parked cars, sheds |
| `terrain.ts` | Heightfield with exact mesh-matching interpolation; chunk/low-res meshes; triangle clipping for draping |
| `post.ts` | `InkRenderer`: colour + normal/depth passes (one pass in the low tier or with smooth edges off: normals as a second attachment) → composite (ink lines, pairwise AO, cloud shadows, grade, haze) → temporal accumulation of jittered frames (supersampled AA) → output |
| `sky.ts` | Day / sunset / night presets + blending, weather presets (`WEATHER`: clear, rain, snow, snow on Vodno) + blending, street lamps, glow texture |
| `weather.ts` | Falling rain and snow: GPU-animated quads in a camera-following box (colour pass only) |
| `atmos.ts` | Translucent clouds (shadows computed in post), bird flocks, paragliders over Vodno (by day in dry weather) |
| `traffic.ts` | Animated cars/buses/people on OSM paths, headlights |
| `walk.ts` | Walking as Итар Пејо / Шарпланинец: first/third person, companion, context action, info cards, building collision, surface height from the draped layers |
| `drive.ts` | Drivable ЈСП double-decker: arcade handling, soft kerb on a road-segment grid, chase camera (shares the flight HUD) |
| `flight.ts` | Arcade plane (Macedonian-flag livery) and the yellow Air Tractor on floats for firefighting, chase camera (pulls back and up near a fire and while water falls), tow banner (fire out; after a roll or loop while firefighting), stunts (roll, loop: Q / E, F / R, the pad's right stick), keyboard/pad input, invert-Y |
| `game.ts` | Optional ring race over landmarks, 091 balloons, best time |
| `fire.ts` | Optional firefighting game: at most two fires (forest patch, building roof, ЈСП bus), spawning from a land-cover grid, flames / smoke / glow as GPU-animated quads, water hits, best count |
| `water.ts` | The Air Tractor's water: tank, falling curtain, a little spilled in a roll or loop, splash and steam, spray while scooping, landing ring; closed-form paths shared by the shader and the hit test |
| `landmarks.ts` | Hand-built models: Millennium Cross lattice, Warrior on a Horse, Stone Bridge, Porta Macedonia, Vodno gondola |
| `sound.ts` | Sound, on by default (a switch turns it off): Web Audio synthesis only (engine, wind, rain, water, fire, birds, crickets, short signals), fed a `SoundScene` once per frame from `main.ts` |
| `labels.ts` | HTML Cyrillic labels (districts far, landmarks near), positions from `data.places` |
| `input.ts` | Keyboard map navigation, camera height (C / V, horizontal wheel, LB / RB) + gamepad reading (browser "standard" mapping only; unmapped pads are ignored) |
| `i18n.ts` | UI translations (mk, en, sr Cyrillic, hr, sl, sq): `t(key)`, `data-i18n*` attributes in `index.html`, 🌐 picker, auto-detect, `?lang=` |
| `types.ts` | Shared types: 2D geometry (`Pt`, `Ring`, `Poly`) and the `skopje.json` format (`CityData`) written by `prepare.ts` |
| `geo.ts` | 2D helpers: rng, PIP, OBB, spatial grids, scanline `rowCrossings` |

`scripts/prepare.ts` does all OSM interpretation: building heights (tags →
district/footprint heuristics, industrial halls, Kale fortress towers), area kinds,
roads, landmark shapes (`landmarks`), exact named-place centroids (`places`).

Debug handle in the browser console: `window.__dbg` (scene, renderer, camera,
controls, ink, city, flight); `setView('center'|'kale'|'park'|'vodno'|'overview')`.

## TypeScript

- TypeScript 7 (native `tsc`), `strict`, type-check only (`noEmit`): Vite compiles `src/`,
  Node (≥ 22.18, type stripping) runs `scripts/*.ts` directly. Two configs: `tsconfig.json`
  (browser, `src/`) and `scripts/tsconfig.json` (Node types, scripts + `vite.config.ts`).
- Imports use `.ts` extensions (works in both Vite and Node). Only erasable syntax
  (`erasableSyntaxOnly`): no `enum`, `namespace` or constructor parameter properties.
  Type-only imports use `import type` (`verbatimModuleSyntax`).
- Every translation must have every key English has: a missing one fails `npm run typecheck`.
- After changing UI strings run `npm run strings`, so the review page (`docs/translations/`) stays current.

## Weather

- Weather is a second axis on top of the time of day: `applyTime(time, weather)` in `main.ts`.
  Defaults come from the month (Dec–Feb: winter + snow on Vodno, Mar–May spring, Jun–Aug summer,
  Sep–Nov autumn) unless the visitor has chosen; comparisons against the reference images must
  set `skopje.weather = clear` and `skopje.season = summer` first.
  **Clear must stay neutral** (multipliers 1, amounts 0): clear renders pixel-identical to
  v1.1.0 (checked by rendering fixed views and diffing; only the moving gondola cabins differ).
- Wet streets, puddles and snow are shader code in `city.ts` (`groundShader`, facade, foliage),
  driven by `SHARED.uWet / uSnow / uSnowLine`; each block is skipped when its amount is 0.
  Snow on roads stays as slush: roads are detected by their exact palette colour.
- Rain/snow add ~1 ms GPU per frame at 1600×1000 (desktop); clear costs nothing.
- Seasons (`SHARED.uAutumn / uWinter / uSpring`) are colour-only tints in the tree and ground
  shaders: geometry changes would not match the ink normal pass. Cypresses carry
  `aEvergreen = 1`. Keep one tree material (a second one changes the draw order and pixels).
- Quality: `auto` drops to the low tier (no MSAA/AO/cloud shadows, normals from the colour pass
  instead of a second scene pass, 1024 shadows, two extra resolution steps) when already at the lowest resolution and still slow; `low` forces it;
  `high` keeps the full tier at the top resolution (no frame-time governor). The button cycles auto → high → low.
- On/off options in ⚙ are switches: `class="switch"` + `aria-pressed`, set with `setOn()` in `main.ts`.
  Less traffic is a manual option only. ✨ Мазни рабови (smooth edges, on by default) is 4× MSAA
  in the full tier; off draws the scene in one pass (`ink.setMSAA`), same ink lines, faster.
- A popup menu that does not fit above the bar wraps into two columns (`fitPopup()` in `main.ts`,
  `.places.cols` in `index.html`) and scrolls if it is still too tall.
- Memory saver (`stream`): draped ground and detailed terrain are built per chunk on demand
  (`desc.lazy`, `makeLOD`). The per-chunk builder must emit triangles in the same order as one
  global pass, and meshes must be created in the same order (three.js breaks depth ties by
  object id): desktop output is pixel-identical to the old global build.
- Firefighting (🔥 Пожар, `fire.ts` / `water.ts`): everything it draws is see-through, sits in one
  group in `ink.skipNormal`, and its shaders write `gInk = 0` like the rain; the group is hidden
  when the mode is off, so the plain map stays pixel-identical. The banner cloth is moved on the
  CPU (the ink normal pass would not see a shader wave). Night glow is an additive sprite, not a
  light (a new light recompiles every material). Burnt patches are a colour-only tint in the tree
  and ground shaders (`SHARED.uBurn / uBurnOn`), skipped when `uBurnOn` is 0 and cleared when the
  mode ends. Try it with `scripts/browser/fire-harness.js`.
- Draped ground layers sit above the bare terrain (`areaLift`, `roadLift`, `CASING_LIFT` in
  `city.ts`); anything standing on the ground (walking characters) must use the same heights.
- Which settings are saved (`localStorage` `skopje.*`), which reset on load and what the code
  decides by itself (`MOBILE`, the governor, month defaults): "Settings" in docs/NOTES.md.
  Keep that table current when adding an option.
- Links: `#@lat,lon,distance,tilt°,heading°` kept in the address bar (replaceState), or a view name.
- Version lives in `package.json` (`version`); Vite injects it as `__APP_VERSION__`, shown at
  the bottom of the help dialog. Releases are tagged `vX.Y.Z`.

## Conventions and preferences (important)

- **UI language is Macedonian (Cyrillic), with correct Macedonian spelling and words.**
  Review every new string (e.g. "Зајдисонце", "Ноќ", "Брзо", "капаци", "соработниците на OpenStreetMap").
  Macedonian is the source; every new UI string also needs en/sr/hr/sl/sq in `src/i18n.ts`
  (static HTML: add `data-i18n="key"`, the Macedonian stays in `index.html`). Map data
  (labels, place and ring names) is not translated.
- **Visual style "Вез"** (Macedonian folk embroidery): linen `--linen #f4ede0`, indigo
  `--indigo #1f2a44`, wine `--wine #7a1f1a`, cross-stitch band `--stitch` (SVG data URI
  in `index.html`). Bottom bar fades to transparent when idle. Help dialog uses it too.
  The owner rejected a red bus-board style — avoid red-dominated UI.
- Fonts: Lora (Cyrillic) for UI, Rubik Mono One for the 091 badge.
- Bar: popup menus 📍 Места and ⚙ Опции on every screen. On desktop Преглед, 🚶 walk, 🚌 bus,
  the weather and season buttons and 🌐 language stay on the bar, and 🔗 copy link is first in
  ⚙; on phones and portrait touch tablets they move into the menus, with weather, season,
  walk, bus and copy link first (`placeBarItems()` in `main.ts`). `MOBILE` profile halves trees/parked cars, 2048 shadow
  map, 256 px far textures, fewer agents (iOS Safari memory limits).
- OSM attribution must stay visible (ODbL), also on mobile.
- **Ask the owner before every `git push`** (it deploys the live site). Commits end with
  the Co-Authored-By line given by Claude Code.
- Verify visual changes in the browser before reporting them done (tools and tricks: "How to verify"
  in docs/NOTES.md, `scripts/browser/`); measure GPU time
  with `EXT_disjoint_timer_query_webgl2` (hidden panes throttle rAF/timers).
- Keep load yielding with `nextFrame()` (works in hidden tabs); don't move the build
  into a Web Worker — workers ran ~7× slower (background throttling).
