# 091 Скопје — project guide for Claude Code

An illustrated, living 3D map of Skopje (hand-drawn isometric look, like the
"illustrated Athens" maps) built with three.js from OpenStreetMap data on real
terrain. Static site, deployed to GitHub Pages: https://bbojan.github.io/091-skopje/

History, decisions, numbers and backlog: see [docs/NOTES.md](docs/NOTES.md).

## Commands

```bash
npm install          # once per machine
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # static site → dist/ (relative paths, Pages-ready)
npm run download     # OSM via Overpass → data/skopje_raw.json (not in git, ~25 MB)
npm run terrain      # AWS Terrarium elevation tiles → public/terrain.bin/.json
npm run data         # data/skopje_raw.json (+ data/aerialway.json) → public/skopje.json
```

- `public/skopje.json`, `public/terrain.*` are committed, so a fresh clone runs
  without downloading anything. Only re-run `download`/`data` when changing the
  extent or `scripts/prepare.mjs`.
- `data/aerialway.json` (Vodno gondola) is a separate small Overpass download that
  is committed; `npm run download` does not fetch it.
- Map extent lives in `scripts/config.mjs` (BBOX) — keep `data/query.overpassql` in sync.
- Deploy: pushing to `main` runs `.github/workflows/deploy.yml` (build → Pages, ~40 s).
  Check with `gh run list --limit 1`. GitHub auth is per machine (`gh auth login`);
  never commit tokens or credentials.

## Architecture (src/)

| File | Role |
|---|---|
| `main.js` | App shell: renderer, controls, loading (staged build + progress card), views, time of day, flight/race wiring, popups, help, gamepad, adaptive quality |
| `city.js` | `computeCitySteps` (generator; OSM+terrain → typed arrays per 1 km chunk) and `assembleCity` (meshes, materials, 3-level LOD, far-ground texture bake). Facade shader (windows, shutters, awnings, cornices, night glow), roof tiles, parapets, trees, parked cars, sheds |
| `terrain.js` | Heightfield with exact mesh-matching interpolation; chunk/low-res meshes; triangle clipping for draping |
| `post.js` | `InkRenderer`: colour + normal/depth passes → composite (ink lines, pairwise AO, cloud shadows, grade, haze) → temporal accumulation of jittered frames (supersampled AA) → output |
| `sky.js` | Day / sunset / night presets + blending, street lamps, glow texture |
| `atmos.js` | Translucent clouds (shadows computed in post), bird flocks |
| `traffic.js` | Animated cars/buses/people on OSM paths, headlights |
| `flight.js` | Arcade plane (Macedonian-flag livery), chase camera, keyboard/pad input, invert-Y |
| `game.js` | Optional ring race over landmarks, 091 balloons, best time |
| `landmarks.js` | Hand-built models: Millennium Cross lattice, Warrior on a Horse, Stone Bridge, Porta Macedonia, Vodno gondola |
| `labels.js` | HTML Cyrillic labels (districts far, landmarks near), positions from `data.places` |
| `input.js` | Keyboard map navigation + gamepad reading (XInput "standard" + DirectInput fallbacks) |
| `geo.js` | 2D helpers: rng, PIP, OBB, spatial grids, scanline `rowCrossings` |

`scripts/prepare.mjs` does all OSM interpretation: building heights (tags →
district/footprint heuristics, industrial halls, Kale fortress towers), area kinds,
roads, landmark shapes (`landmarks`), exact named-place centroids (`places`).

Debug handle in the browser console: `window.__dbg` (scene, renderer, camera,
controls, ink, city, flight); `setView('center'|'kale'|'park'|'vodno'|'overview')`.

## Conventions and preferences (important)

- **UI language is Macedonian (Cyrillic), with correct Macedonian spelling and words.**
  Review every new string (e.g. "Зајдисонце", "Ноќ", "Брзо", "капаци", "соработниците на OpenStreetMap").
- **Visual style "Вез"** (Macedonian folk embroidery): linen `--linen #f4ede0`, indigo
  `--indigo #1f2a44`, wine `--wine #7a1f1a`, cross-stitch band `--stitch` (SVG data URI
  in `index.html`). Bottom bar fades to transparent when idle. Help dialog uses it too.
  The owner rejected a red bus-board style — avoid red-dominated UI.
- Fonts: Lora (Cyrillic) for UI, Rubik Mono One for the 091 badge.
- Mobile: phones and portrait touch tablets get popup menus (📍 Места, ⚙ Опции);
  desktop keeps the full bar. `MOBILE` profile halves trees/parked cars, 2048 shadow
  map, 256 px far textures, fewer agents (iOS Safari memory limits).
- OSM attribution must stay visible (ODbL), also on mobile.
- **Ask the owner before every `git push`** (it deploys the live site). Commits end with
  the Co-Authored-By line given by Claude Code.
- Verify visual changes in the browser before reporting them done; measure GPU time
  with `EXT_disjoint_timer_query_webgl2` (hidden panes throttle rAF/timers).
- Keep load yielding with `nextFrame()` (works in hidden tabs); don't move the build
  into a Web Worker — workers ran ~7× slower (background throttling).
