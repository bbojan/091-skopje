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
npm run overture -- kavadarci   # Overture Maps building outlines OSM lacks → data/kavadarci_overture.json
                     # (not in git; only cities with `files.overture`; `data` needs it for those)
npm run data         # data/skopje_raw.json (+ data/aerialway.json) → public/skopje.json
npm run download -- kavadarci   # the same three for another city (first argument; default skopje)
                                # → data/kavadarci_raw.json, public/kavadarci.json, public/kavadarci-terrain.*
npm run strings      # index.html + src/i18n.ts → docs/translations/strings.js (translation review page)
npm run country      # the whole country at 100 m → public/country.png/.json (needs data/country_cover.json:
                     # .venv/bin/python scripts/country_cover.py data/macedonia.osm.pbf data/country_cover.json)
```

- `public/skopje.json`, `public/terrain.*` are committed, so a fresh clone runs
  without downloading anything. Only re-run `download`/`data` when changing the
  extent or `scripts/prepare.ts`.
- `data/aerialway.json` (Vodno gondola) is a separate small Overpass download that
  is committed; `npm run download` does not fetch it.
- Map extents live in `scripts/config.ts` (`CITIES`: bbox, tiles, file names); `data/query.overpassql`
  holds the layers (the box is added per tile). Per-city OSM interpretation (old town box, square,
  landmark ids, named places, height zones) is `PREP` in `scripts/prepare.ts`.
- Deploy: pushing to `main` runs `.github/workflows/deploy.yml` (build → Pages, ~40 s).
  Check with `gh run list --limit 1`. GitHub auth is per machine (`gh auth login`);
  never commit tokens or credentials.

## Architecture (src/)

| File | Role |
|---|---|
| `main.ts` | App shell: renderer, controls, loading (staged build + progress card), city switching (`loadCity` / `unloadWorld` / `switchCity`), views, time of day, flight/race wiring, popups, help, gamepad, adaptive quality |
| `cities.ts` | The cities (Skopje, Kavadarci, Bitola, Ohrid, Rostuše, Prilep, Kruševo, Makedonska Kamenica, Dojran, Batinci, Berovo, Tetovo, Makedonski Brod, Resen, Матка, Вевчани, Кочани, Меџитлија, Кратово, Штип, Струмица, Неготино, Демир Капија, Голо Брдо, Виница, Кораб, Пробиштип, Гевгелија) and what differs per city: data files, camera views, district and landmark labels, race route, walking info spots, paragliders, weather / refill labels; `?city=` in the address |
| `city.ts` | `computeCitySteps` (generator; OSM+terrain → typed arrays per 1 km chunk) and `assembleCity` (meshes, materials, 3-level LOD, far-ground texture bake). Facade shader (windows, shutters, awnings, cornices, night glow), roof tiles, parapets, trees, parked cars, sheds; Kavadarci's vineyards and Bitola's fields, Кочани's rice paddies (`rice`) (`farmMask`, `VINE_GROUND`: farmland marked by one terrain colour, plots painted by the ground shader; `vineShare` per city: the share of plots that are vineyards) |
| `terrain.ts` | Heightfield with exact mesh-matching interpolation; chunk/low-res meshes; triangle clipping for draping |
| `post.ts` | `InkRenderer`: colour + normal/depth passes (one pass in the low tier or with smooth edges off: normals as a second attachment) → composite (ink lines, pairwise AO, cloud shadows, grade, haze) → temporal accumulation of jittered frames (supersampled AA) → output |
| `sky.ts` | Day / sunset / night presets + blending, weather presets (`WEATHER`: clear, rain, snow, snow on Vodno) + blending, street lamps, glow texture |
| `weather.ts` | Falling rain and snow: GPU-animated quads in a camera-following box (colour pass only) |
| `atmos.ts` | Translucent clouds (shadows computed in post), bird flocks, paragliders over Vodno (by day in dry weather) |
| `traffic.ts` | Animated cars/buses/people on OSM paths, headlights |
| `walk.ts` | Walking as Итар Пејо (Kavadarci: a man in a suit; Bitola: Милтон Манаки, whose action films an оро) / Шарпланинец: first/third person, companion, context action, info cards, building collision, surface height from the draped layers |
| `drive.ts` | Drivable ЈСП double-decker: arcade handling, soft kerb on a road-segment grid, chase camera (shares the flight HUD) |
| `flight.ts` | Arcade plane (Macedonian-flag livery), the F-15 Eagle (free flight only: `JET` speeds 1325 / 2650 km/h, 150 m floor looking ahead over the terrain, a wide turn back at the edge, afterburner flames; Ctrl slows either plane to a quarter of its top speed) and the yellow Air Tractor on floats for firefighting, chase camera (pulls back and up near a fire and while water falls), tow banner (fire out; after a roll or loop while firefighting), stunts (roll, loop: Q / E, F / R, the pad's right stick), keyboard/pad input, invert-Y |
| `game.ts` | Optional ring race over landmarks, 091 balloons, best time |
| `rockets.ts` | The F-15's rockets (Space, pad X, 🚀): a pair under the wings while held, smoke trails, blasts on the ground (flash, fireball, sparks, smoke) as billboards in the fire's drawn style; effects only. The exhaust shimmer is the output pass's `heat*` uniforms in `post.ts` (0 = untouched) |
| `fire.ts` | Optional firefighting game: at most two fires (forest patch, building roof, ЈСП bus), spawning from a land-cover grid, flames / smoke / glow as GPU-animated quads, water hits, best count |
| `water.ts` | The Air Tractor's water: tank, falling curtain, a little spilled in a roll or loop, splash and steam, spray while scooping, landing ring; closed-form paths shared by the shader and the hit test |
| `landmarks.ts` | Hand-built models: Millennium Cross lattice, Warrior on a Horse, Stone Bridge, Porta Macedonia, Vodno gondola; Kavadarci (after photos): Memorial Ossuary, People's Heroes, Vataša memorial and the 12 busts of the Vataša youths (2023), Monument to the Revolution |
| `square.ts` | Kavadarci, Плоштад Маршал Тито (after an aerial image and photos): the town hall's terrace with curved steps and two fountains, ball bollards, S-shaped and oval planters, lawn strip, clock, the darker bands in the grey paving; its layout also gives walking collision and the terrace height. The grey paving and the forecourt are `plazaColour` / `extraPlazas` in `PREP` |
| `churches.ts` | Kavadarci, Св. Петка and Св. Димитриј (after photos of 2026 and an aerial image): built from parts on their OSM outlines (`petka` / `dimitrij` in `PREP`, the generic buildings left out): stone walls with brick courses, hip and gable tile roofs, octagonal drums, arched windows, gold crosses; Св. Петка's free-standing bell tower (`landmarkLL.petkaTower`); walking collision |
| `market.ts` | Kavadarci, Градски зелен пазар (2022, after the opening's press photos and an aerial image of 2025): the deck over two parking levels, the white steel roof (two pitched bays, glazed lanterns, space frame) on round columns, green-framed stalls, glazed shops, flower stalls, railings; also walking height and collision. Its position is `landmarkLL.market` in `PREP`; next to it OSM's wrong outline is left out and two low buildings added (`dropBuildings` / `extraBuildings`) |
| `models.ts` | The shared kit for hand-built models on OSM outlines: `frame` (along an outline's axis), `parts` (boxes, cylinders, domes, arches, walls on an outline, hipped roofs, crosses), `gable`, `byzChurch` (a parameterised Byzantine church: arms, drum, apse, conches, narthex, bell tower, cloisonné), `modelKit` (materials, `place`) |
| `ohrid.ts` | Ohrid (after photos): Св. Јован Канео, Плаошник with its bell tower, Св. Софија, Св. Наум, Залив на коските (pile dwellings on the water, `modelRects`); the ancient theatre uses `bitola.ts`'s theatre |
| `rostuse.ts` | Rostuše (after photos): Бигорски манастир in detail (`konak()` wings, bell tower, church, portico, fountain), Св. Никола in Мавровско Езеро |
| `prilep.ts` | Prilep (after photos): the clock tower, Могила на непобедените (urns), Маркови Кули's boulders, Трескавец |
| `krusevo.ts` | Kruševo (after photos): Македониум (stained glass, night-lit), the giant of Мечкин Камен |
| `kamenica.ts` | Makedonska Kamenica (after photos): Успение на Пресвета Богородица (`byzChurch`), the square's fountain with its statue |
| `batinci.ts` | Batinci (after photos): Св. Димитрија of Марков манастир (`byzChurch`) |
| `berovo.ts` | Berovo (after photos and an aerial image): Св. Архангел Михаил (porch, bell tower), Рождество на Пресвета Богородица (clock tower), the arch dam of Беровско Езеро on its OSM crest line (`archDam`, shared with Brod) |
| `tetovo.ts` | Tetovo (after photos): Шарена џамија, Gostivar's Саат-кула, Св. Атанасиј of Лешок (`byzChurch`), the walls of Тетовско Кале |
| `brod.ts` | Makedonski Brod (after photos): the church of Зрзе monastery, Света Петка's arch dam (`archDam`) |
| `resen.ts` | Resen (after photos): Ресенски сарај on its outline (mansard following it), Св. Петар on Голем Град and Св. Ѓорѓи in Курбиново (`byzChurch`) |
| `matka.ts` | Матка (after photos): Св. Андреја, Св. Никола Шишевски (`byzChurch`), the Матка arch dam (`archDam`) |
| `vevcani.ts` | Вевчани (after photos): Св. Никола (basilica, bell tower, annex), wooden footbridges below the springs |
| `kocani.ts` | Кочани (after photos): the two Ottoman towers (Средновековна кула with its balcony and stair, the ruined Саат-кула with the clock's brick drum), Споменик на слободата (curved wall, drawn mosaics on a `CanvasTexture`, pylons) |
| `medzitlija.ts` | Меџитлија (after photos and the aerial image): the village mosque (copper domes, porch, minaret), the border crossing's two canopies (Macedonian and Greek side, `modelRects`), Велушки манастир (church Св. Ѓорѓи with its bell tower, the konak with the gate and the court gallery) |
| `kratovo.ts` | Кратово (after descriptions on mk Wikipedia): the six medieval towers on their OSM outlines (stone, quoins, slab hip roofs; the Саат-кула's чардак), the stone bridges on OSM's `man_made=bridge` outlines (one arch, humped deck, parapets), the earth pyramids of Куклица (seeded inside the site's outline) |
| `negotino.ts` | Неготино (after photos): Неготински манастир Св. Ѓорѓи (three drums, the tiled porch) and its bell tower, Св. Атанасиј Велики (basilica, the bell tower at the south-west corner), ТЕЦ Неготино's chimney (~125 m, banded top, `modelRects`) and its three fuel tanks |
| `demirkapija.ts` | Демир Капија (after photos and the aerial image): Попова Кула (the stone tower with the tasting room, the arcade wing, the white wing, its lawn), Хотел Вердисо and its pool (OSM outlines in `axisFrame`, a frame along a given heading), Кралица Марија's Вила Марија (caryatids, park, peacocks), the U of the royal cellar, the tank yard between two halls, the amphitheatre (`modelRects`) |
| `golobrdo.ts` | Голо Брдо (after photos): Xhamia e Allajbegisë in Бурим (cloisonné cube, octagonal drum, tiled dome, minaret, the white front building of the 1990s) and the church of the Преображение in Ербеле (stone nave, concrete porch and bell frame), on their OSM outlines (`models` in `PREP`) |
| `probistip.ts` | Пробиштип (after the Wikipedia descriptions, no photos): Лесново's church Св. Архангел Михаил (`byzChurch`) on its OSM outline (`lesnovo` in `models`) |
| `gevgelija.ts` | Гевгелија (after the published turbine type, no photos): the 16 turbines of the Богданци wind farm at OSM's generator nodes (`modelRects` gvwind1–16), rotors facing north, standing still |
| `vinica.ts` | Виница (after the mk Wikipedia description, no photos): the ruins of Виничко Кале on OSM's outline (`vnkale` in `models`): the 3 m defensive wall following the ground with gaps (seeded), a semicircular tower, rooms along the inside, the small church's low walls and apse, column bases |
| `dojran.ts` | Dojran (after photos): the clock tower, Св. Илија (a basilica), a мандра (reed fishing enclosure, hut on stilts, walkway to the beach) |
| `bitola.ts` | Bitola (after photos): Саат-кула, Ајдар-кади џамија, Безистен, Св. Димитриј and its bell tower, Хераклеа's theatre and Great Basilica with its mosaic floors (painted canvases), built on their OSM outlines (`models` in `PREP`, `landmarks.models` in the data; the generic buildings left out); walking collision |
| `river.ts` | Kavadarci, the Луда Мара (after photos): the stone-lined channel through the town between two promenades, cut exactly out of the terrain and draped ground (`cut`), its water, banks and promenades emitted into the draped ground; copings, railing, arched footbridges, road-bridge parapets, cascades, steps, benches, lamps, promenade trees; walking height and collision |
| `sound.ts` | Sound, on by default (a switch turns it off): Web Audio synthesis only (engine, wind, rain, water, fire, birds, crickets, short signals), fed a `SoundScene` once per frame from `main.ts` |
| `labels.ts` | HTML Cyrillic labels (districts far, landmarks near), positions from `data.places` |
| `input.ts` | Keyboard map navigation, camera height (C / V, horizontal wheel, LB / RB) + gamepad reading (browser "standard" mapping only; unmapped pads are ignored) |
| `i18n-towns.ts` | UI texts of the towns added after Bitola, spread into `STR` |
| `i18n-towns2.ts` | UI texts of Tetovo, Makedonski Brod and Resen, spread into `STR` after `TOWNS` |
| `i18n-towns3.ts` | UI texts of Матка and Вевчани, spread into `STR` after `TOWNS2` |
| `i18n-towns4.ts` | UI texts of Кочани and Меџитлија, spread into `STR` after `TOWNS3` |
| `i18n-towns5.ts` | UI texts of Кратово, spread into `STR` after `TOWNS4` |
| `i18n-towns6.ts` | UI texts of Штип, spread into `STR` after `TOWNS5` |
| `i18n-towns7.ts` | UI texts of Струмица, spread into `STR` after `TOWNS6` |
| `i18n-towns8.ts` | UI texts of Неготино, spread into `STR` after `TOWNS7` |
| `i18n-towns9.ts` | UI texts of Демир Капија, spread into `STR` after `TOWNS8` |
| `i18n-towns10.ts` | UI texts of Голо Брдо, spread into `STR` after `TOWNS9` |
| `i18n-towns12.ts` | UI texts of Виница, spread into `STR` after `TOWNS11` |
| `i18n-towns13.ts` | UI texts of Кораб, spread into `STR` after `TOWNS12` |
| `i18n-towns14.ts` | UI texts of Пробиштип, spread into `STR` after `TOWNS13` |
| `i18n-towns15.ts` | UI texts of Гевгелија, spread into `STR` after `TOWNS14` |
| `i18n-country.ts` | UI texts of the country view, spread into `STR` after `TOWNS10` |
| `country.ts` | Country view (Macedonia, first in the city menu): all of Macedonia at 100 m from `public/country.png` (heights, land cover, border), its own scene / camera / controls drawn through the same ink renderer (`renderCountry()` in `main.ts`), zones as a canvas overlay, hover, picking by marching the height grid, badges that open a city; the data is loaded once and kept for the visit (`loadCountry`, meant for the F-15 too) |
| `countryground.ts` | The country's 100 m terrain around a city map while the F-15 flies: one CPU-built grid following the plane (fine near, ~0.7 km cells at 45 km), sunk below the map inside it, the map's own exaggeration; the flight and the rockets use its height beyond the map's edges. While it shows, the ink's normal pass is not clipped to the map (`ink.setClipping`) |
| `hop.ts` | The F-15 from map to map: `mapAt` / `inMap` (the finished maps' outlines from `zones.ts`), `lookAhead` (the map the plane would enter along a heading), `createPrefetch` (raw files of up to 3 maps ahead, 80 MB; phones 1, 20 MB; one low-priority download at a time). `main.ts` predicts once a second, opens the edge where a map lies ahead (`flight.setEdgeOpen`), shows `→ Батинци ▓▓░░` and switches at the edge (`hop()`: fade, small loader, `switchCity`, the flight carried over by lat / lon) |
| `eject.ts` | The F-15's action (🪂 chip, X, pad Y): the seat fires the pilot up, the parachute in the flag's gores opens (arrows steer), quick high up and ~7 m/s near the ground; `ejectFrame()` in `main.ts` flies the empty jet into the ground (a blast) and starts walking where the pilot lands (just inside the map if beyond it) |
| `radar.ts` | The F-15's radar (desktop only, top left of the flight HUD): Macedonia around the plane at 4× the country view's zoom (~54 km), heading up; the finished maps in colour, the rest greyed (not flyable yet), a map downloading ahead in sky blue (a tint, a thick line tracing its edge as far as the download has come with a dot at its tip, ↓ and the %), queued after it a firmer dashed blue edge and ⋯, ahead but still too far a thin dashed blue edge, the map being entered orange and pulsing with its %, ready ones green with ✓, the current one outlined in indigo. From the country grid, prerendered once |
| `zones.ts` | The towns plan's zones (finished and planned maps' outlines): one list for the country view and `scripts/towns-map.html` |
| `i18n.ts` | UI translations (mk, en, sr Cyrillic, hr, sl, sq): `t(key)`, `data-i18n*` attributes in `index.html`, 🌐 picker, auto-detect, `?lang=` |
| `types.ts` | Shared types: 2D geometry (`Pt`, `Ring`, `Poly`) and the `skopje.json` format (`CityData`) written by `prepare.ts` |
| `geo.ts` | 2D helpers: rng, PIP, OBB, spatial grids, scanline `rowCrossings` |

`scripts/prepare.ts` does all OSM interpretation: building heights (tags →
district/footprint heuristics, industrial halls, Kale fortress towers), area kinds,
roads, landmark shapes (`landmarks`), exact named-place centroids (`places`).

Debug handle in the browser console: `window.__dbg` (scene, renderer, camera,
controls, ink, city, flight); `setView('center'|'kale'|'park'|'vodno'|'overview')`.

## Cities

- Macedonia, the first item of the city menu (a tile as tall as four cities, 70 % of the row; the drawn ✈ F-15 beside it takes off on the current map in F-15 mode, `takeOffF15()` in `main.ts`), opens the country view (`src/country.ts`): every map's zone on the whole
  country; a finished map's badge opens it. A new map: move it from `PLANNED` to `EXISTING` in `src/zones.ts`.
  The city stays built underneath, so Skopje is pixel-identical after closing it (checked).
- The badge at the top left (`091 Скопје ▾`) is the city picker (the tab icon follows: `icon` in `CITIES`,
  `public/favicon-<id>.svg`). The LinkedIn button at the top right names the city's developer (one `.me-main`
  per city, `data-city`; the ▼ menu lists the five developers: Бојан 091, Ристе 043, Бранко 031, Калина 092, Филип 034) and shows only on the map itself, not while flying, driving or walking.
  The round `?` right after the badge opens the help
  (shared by every city; per-city paragraphs carry `data-city="…"`, hidden by the `city-<id>` body class).
- Cities: 091 Скопје, 043 Кавадарци (`?city=kavadarci`), 097 Битола (`?city=bitola`, v2.10.0), 096 Охрид
  (`?city=ohrid`, v3.1.0: the whole lake, 20 m terrain cells), 098 Прилеп (`?city=prilep`, v3.2.0), 048 Крушево (`?city=krusevo`, v3.3.0), 042 Ростуше (`?city=rostuse`,
  v3.4.0: Бигорски, Дебар, Маврово; 20 m cells), 033 Македонска Каменица (`?city=kamenica`, v8.0.0: Саса, Калиманци), 034 Дојран
  (`?city=dojran`, v9.0.0: the whole lake, its level set by hand with `waterLevels`),
  02 Батинци (`?city=batinci`, v10.0.0: south of Skopje's map, edge to edge with it), 033 Берово (`?city=berovo`,
  v11.0.0: Пехчево and the whole of Беровско Езеро), 094 Тетово (`?city=tetovo`, v14.0.0: Гостивар, Шар Планина;
  75k buildings, the largest scene), 045 Македонски Брод (`?city=brod`, v14.0.0: Козјак, Света Петка, Зрзе),
  047 Ресен (`?city=resen`, v14.0.0: the whole of Преспа, its level set by hand), 02 Матка (`?city=matka`, v16.0.0: the
  first map that is not a rectangle, Скопје's and Брод's maps cut out of it), 046 Вевчани (`?city=vevcani`, v16.0.0: Охрид's map
  cut out of it), 0903 Кочани (`?city=kocani`, v32.0.0: Кочанско Поле's rice paddies, `rice` in
  `CITIES` → `RICE_GROUND` in `city.ts`, compiled only into a city with rice), 047 Меџитлија (`?city=medzitlija`,
  v32.0.0: southern Пелагонија to the Greek border, widened east to 21.47 so that Меџитлија is on it;
  Новаци's planned box cut there), 031 Кратово (`?city=kratovo`, v32.0.0, developer Бранко Славков:
  an L, Крива Паланка's planned corner cut; widened west to 22.045 for the Камени Кукли, Куманово's planned outline moved there; named „Кратово – Ѕинго Land“, with Хотел Кратис, Ѕинго's house and its
  mural, and the „ЅИНГО LAND“ hillside sign as a joke), 043 Демир Капија (`?city=demirkapija`, v32.0.0,
  developer Ристе Самарџиев: the gorge, the wineries Попова Кула, Кралица Марија and Грков, Хотел Вердисо, Кожуф), 043 Неготино (`?city=negotino`, v32.0.0,
  developer Ристе Самарџиев: the middle Повардарие, Overture's outlines for most buildings, refilling over the Вардар),
  092 Штип (`?city=stip`, v32.0.0, developer Калина Јовановска: Исар, Безистен, Баргала, the Брегалница; no hand-built
  models yet), 0902 Струмица (`?city=strumica`, v32.0.0, developer Калина Јовановска: Царевите кули, Водоча, Вељуса,
  Струмичко Поле; Overture's outlines for most buildings; no hand-built models yet), 046 Голо Брдо (`?city=golobrdo`,
  built 2026-11-25, not released: the Црн Дрим valley west of Дебар with Пешкопија, almost all Albania, raw file from the
  Albanian extract; badge and name unconfirmed), 033 Виница (`?city=vinica`, built 2026-11-28, not released: the east end
  of Кочанска Котлина with Блатец, Истибања and the hills toward Делчево; Overture's outlines for most buildings; Виничко
  Кале's ruins modelled after its description), 042 Кораб (`?city=korab`, built 2026-11-28, not released: Голем Кораб,
  Корабски водопад, Горна Река and the Шар ridge, the steps past the border cut; raw file from the Macedonian, Albanian and
  Kosovo extracts; `treeLine` keeps the alpine meadows bare; badge and name unconfirmed), 032 Пробиштип (`?city=probistip`,
  built 2026-11-28, not released: Злетово and its mine, Лесновски манастир (its church hand-built), Кочанско Езеро, Пониква;
  OSM only, Overture has no footprints there), 034 Гевгелија, Богданци (`?city=gevgelija`, built 2026-11-28, not released:
  the Вардар to the Greek border at Богородица, Негорски Бањи, the Богданци wind farm (its 16 turbines hand-built);
  Дојран's map cut out of the south-east corner; Overture's outlines for most buildings).
- The F-15 (v26.0.0) flies from map to map: the next map downloaded ahead, switched at the edge while the jet flies on
  over the country's terrain (`src/hop.ts`, `src/countryground.ts`, `transit` in `main.ts`); every new finished map
  in `src/zones.ts` widens the flight. All of it: "F-15 and flying from map to map" in docs/NOTES.md.
- A map that is not a rectangle: `cut` rectangles in its `CITIES` entry in `scripts/config.ts` (the neighbours'
  maps); `cutOsm()` in `scripts/osm.ts` removes OSM there for `prepare.ts` and `terrain.ts`, the terrain stays the
  full rectangle (bare relief in the corners).
- Overpass overloaded: `scripts/pbf2overpass.py` builds the raw download from Geofabrik extracts (pyosmium).
- The city is in the address: `?city=kavadarci`; no parameter = Skopje. Switching pushes a history entry
  (back / forward switch too) and drops the camera hash. Per-city menu items in `index.html` use `data-city`.
- Switching unloads the city completely (`unloadWorld()` in `main.ts`): modes stopped, everything the
  city added to the scene removed and its geometries, materials and textures disposed, the baked
  far-ground targets freed (`city.dispose()`), labels removed, the flight / bus / walking key listeners
  ended (`AbortSignal`). The loader shows while the next city builds. Only the lights, the renderer, the
  ink passes and the settings stay.
- Terrain per city: `terrain` in `scripts/config.ts` (smoothing, flat water, flat squares, river
  channels, known heights, water levels by hand; applied by `scripts/terrain.ts` from the raw OSM) and `terrainExag` in
  `src/cities.ts` (Skopje 1.12, Kavadarci and Bitola 1 = true heights). OSM reading helpers: `scripts/osm.ts`.
- What else differs per city in `CITIES` (`src/cities.ts`): `buses` (red ЈСП buses and the drivable
  double-decker: Skopje only), `walker` (`pejo`, Kavadarci's `suit`, Bitola's `manaki` whose action films an
  оро), `darkDog` (Bitola's Пелистер coat), `vineyards` / `vineShare`, `treeThin`, `sparseFar`, `snowLabel` /
  `refillLabel`, `banners`, `bestRaceKey`. In `PREP` (`scripts/prepare.ts`): `models` (OSM way ids of
  outlines a city's own hand-built models replace: Bitola → `landmarks.models`, `src/bitola.ts`),
  `waterLines` (rivers OSM has only as lines, widened into water areas for refilling: Bitola's Драгор),
  `extraPlazas` (squares OSM has only as relations the query does not fetch: Плоштад Магнолија).
- Badge codes: old codes first (the town that owned an old Yugoslav-era code gets it, the other maps of its group
  their new area code); every map's code, built and planned, is the table "Badge codes" in docs/TOWNS_TODO.md.
- A new city: step by step in [docs/ADDING_A_CITY.md](docs/ADDING_A_CITY.md) (bbox in `scripts/config.ts`,
  `PREP` in `scripts/prepare.ts`, `CITIES` in `src/cities.ts`, `data-city` items and the CSS rule in
  `index.html`, strings in 6 languages, monuments from references, the checks).
- Skopje must stay pixel-identical when another city is added (run the pixel check).

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
  walk, bus and copy link first (`placeBarItems()` in `main.ts`). The graphics options (contours,
  quality, smooth edges, memory saver, less traffic) sit in a submenu: ⚙ → 🎨 Графика › opens `#gfx` in
  place of ⚙, ‹ Назад returns; 🎮 Управување (`#ctl`) the same way holds the two invert up/down switches
  (map and walking, off by default; flight, on by default). Phones and tablets (`body.mobile`, upright or
  sideways) get two joysticks in every mode (`touchStick()` in `main.ts`, values added to the gamepad's
  `flight.pad` / `drive.pad` each frame): flight — left steers and climbs, right flicks the stunts like
  a pad's right stick; bus — left steers, right is the throttle; walking — left moves, right looks.
  The buttons sit beside the right stick when sideways, above it when upright. `MOBILE` profile halves trees/parked cars, 2048 shadow
  map, 256 px far textures, fewer agents (iOS Safari memory limits).
- OSM attribution must stay visible (ODbL), also on mobile.
- **Ask the owner before every `git push`** (it deploys the live site). Commits end with
  the Co-Authored-By line given by Claude Code.
- Verify visual changes in the browser before reporting them done (tools and tricks: "How to verify"
  in docs/NOTES.md, `scripts/browser/`); measure GPU time
  with `EXT_disjoint_timer_query_webgl2` (hidden panes throttle rAF/timers).
- Keep load yielding with `nextFrame()` (works in hidden tabs); don't move the build
  into a Web Worker — workers ran ~7× slower (background throttling). The F-15 flying into a map builds it with
  `sliceMs` (the long stages yield every ~12 ms, same result) while the old plane flies on (`transit` in `main.ts`).
  `__dbg.loadTimes` / `loadMax` / `loadUnload`: per step total, longest slice, unloading.
