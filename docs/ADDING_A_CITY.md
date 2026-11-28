# Adding a city

How a new town gets onto the map, step by step: the way Kavadarci (`?city=kavadarci`, v2.8.0) and
Bitola (`?city=bitola`, v2.10.0) were added next to Skopje. Commands, conventions and the architecture are in [../CLAUDE.md](../CLAUDE.md);
history and decisions in [NOTES.md](NOTES.md). The examples use a made-up id `ohrid`.

Plan for an afternoon for a small town. Most of the time goes into the Overpass download (busy
servers), tuning building heights, and the monuments.

## 0. What a city is made of

| Piece | Where | Committed |
|---|---|---|
| Map extent, tiles, file names | `CITIES` in `scripts/config.ts` | yes |
| How OSM is read (square, old town, landmarks, places, height zones) | `PREP` in `scripts/prepare.ts` | yes |
| Raw OSM download | `data/<id>_raw.json` | no (`.gitignore`) |
| Extra building outlines (optional) | `data/<id>_overture.json` (`files.overture`) | no (`.gitignore`) |
| Prepared scene | `public/<id>.json` | yes |
| Heightfield | `public/<id>-terrain.bin` + `.json` | yes |
| Views, labels, race, walking spots, labels for snow / refill | `CITIES` in `src/cities.ts` | yes |
| Places menu items, help paragraphs | `data-city="<id>"` in `index.html` | yes |
| UI texts (6 languages) | `src/i18n.ts` | yes |
| Hand-built monuments | `createLandmarks()` in `src/landmarks.ts`, or a file of the city's own called from it (Bitola: `src/bitola.ts`) | yes |

The badge menu, `?city=` in the address, the loading card, unloading the previous city and the
history (back / forward) work for every entry in `CITY_IDS` without further changes.

## 1. Research the area before choosing the box

Look at the town on openstreetmap.org, then ask Overpass what is around it (a wide box):

```bash
curl -s -A 'illustrated-map-research/0.1' --data-urlencode 'data=[out:json][timeout:120][bbox:S,W,N,E];(node["place"~"city|town|village|suburb"];way["natural"="water"]["name"];relation["natural"="water"]["name"];way["waterway"="river"]["name"];nwr["historic"];nwr["tourism"~"museum|artwork|attraction"];);out center tags;' https://maps.mail.ru/osm/tools/overpass/api/interpreter
```

Decide:
- **The box.** The town plus a margin: neighbourhoods, a hill, a river. Kavadarci began as
  41.380–41.462 N, 21.958–22.062 E (≈ 8.7 × 9.1 km) and grew to 41.25–41.462 N, 21.85–22.062 E
  (≈ 17.7 × 23.6 km, the whole Тиквешко Езеро); Skopje is ≈ 16 × 11 km. Memory, download
  and load time grow with the content, not only the area (NOTES.md, "A larger map").
- **Water for firefighting.** The Air Tractor refills by skimming a `water` area. A narrow river
  drawn only as a line is not an area. Check the areas' sizes after step 4: Kavadarci's "lake"
  (Катунишко Езеро) turned out to be a 100 m pond, but the northern arm of Тиквешко Езеро reached
  into the box and became the refill.
- **The badge code.** Old codes first: the plan is the table in "Badge codes" in
  [TOWNS_TODO.md](TOWNS_TODO.md) (every map, built and planned). The town that owned an old (Yugoslav-era) code
  gets it (091 Скопје, 097 Битола, 098 Прилеп); every other map in that old group takes its town's new area code
  (043 Кавадарци, 048 Крушево), shared where it has to be. Confirm the code with the owner when the map is started.

## 2. Extent and files: `scripts/config.ts`

Add an entry to `CITIES`:

```ts
ohrid: {
  bbox: { s: 41.09, w: 20.76, n: 41.14, e: 20.83 },
  tiles: [2, 2] as [number, number], // Overpass queries per axis; smaller tiles fail less
  files: { raw: 'data/ohrid_raw.json', scene: 'public/ohrid.json', terrainBin: 'public/ohrid-terrain.bin', terrainJson: 'public/ohrid-terrain.json' },
},
```

Every data script takes the city as its first argument (`npm run data -- ohrid`). Without one it works
on Skopje, whose files keep their old names.

## 3. Download OSM and the terrain

```bash
npm run download -- ohrid
npm run terrain -- ohrid      # AWS Terrarium tiles, cached in data/terrarium/
```

The download is the slow part:
- **Busy servers.** `scripts/download.ts` tries overpass-api.de and then the mirrors, with a 4-minute
  timeout per try. If one server answers today, put it first:
  `OVERPASS=https://maps.mail.ru/osm/tools/overpass/api/interpreter npm run download -- ohrid`.
  Probe them with a tiny query first (a few buildings, `out ids;`). On the Kavadarci day only
  maps.mail.ru answered, and only now and then.
- **Partial answers.** A server can return part of a tile without an error. Check the totals
  against a count query and compare with the download:

```bash
curl -s --data-urlencode 'data=[out:json][bbox:S,W,N,E];(way["building"];relation["building"];);out count;way["highway"];out count;' <server>
python3 -c "import json,collections; d=json.load(open('data/ohrid_raw.json')); print(collections.Counter(('building' if 'building' in e.get('tags',{}) else 'highway' if 'highway' in e.get('tags',{}) else 'other') for e in d['elements']))"
```

  Kavadarci: 804 of 804 buildings and 967 of 979 roads. The small gap comes from mirrors with
  different snapshot dates; a large one means a tile came back partial, so download again.
- **A thinly mapped town.** OSM coverage varies. Kavadarci has 804 buildings and almost none with a
  height, which is real, not a broken download. If the streets are mapped but the blocks between
  them are empty, add `overture: 'data/<id>_overture.json'` to the city's `files` and run
  `npm run overture -- <id>` (about 10 s): it fetches Overture Maps' building outlines (mostly
  Microsoft's machine-learned footprints, ODbL) for the box, and `npm run data` then adds the ones
  that do not overlap an OSM building, a hand-built landmark (keep-out pads in `prepare.ts`), water
  or a road. They carry no tags: heights are the plain house guesses (1–5 storeys, height zones
  ignored), because the blocks of flats are usually in OSM already. Kavadarci: 7,802 added to
  804. Credit them in the app (`data-city` span in `.attr`, the help footer) and in the help intro.

`terrain` prints the elevation range. Note it: the snow line of the "snow on the hills" weather is
300 m above the map's lowest point.

Shape the terrain with the city's `terrain` settings in `scripts/config.ts` (needs the raw download):
`smooth` (box passes; 1 for EU-DEM areas, Skopje keeps 3), `flatWater` (one level per lake),
`flatSquares` (OSM names), `rivers` (waterway tag → [half width, depth]; never under roads), `riversKeep` (stretches of a
waterway left uncut, where a hand-built channel is set in at street level: Kavadarci's Луда Мара,
`src/river.ts`), `dams`
(an embankment dam raised along its crest line: [way id, crest height, half width, face slope]) and
`points` (known heights [lat, lon, metres, radius]). In `src/cities.ts`, `terrainExag: 1` draws
true heights. Check the result against an independent DEM before trusting your eyes, e.g. 100 points
from `https://api.opentopodata.org/v1/eudem25m?locations=lat,lon|…` (1 request a second).

## 4. Reading OSM: `PREP` in `scripts/prepare.ts`

Add an entry (the `CityPrep` type documents every field):

- `square`: lat/lon of the main square (`meta.square`, height bonus, where the plane parks while walking).
- `old`: a box of the old town (low, tiled, dense houses), or `null`.
- `placeNames` / `placeIds` / `placeNodes`: named places for views, labels, race rings and info
  cards (largest matching shape by name, a way by id, a node by id). Look the exact names up in the
  raw file: OSM spellings vary ("Спомен парк Ваташа" without a hyphen).
- `nodeLL`: coordinates of those nodes as OSM has them. `data/query.overpassql` fetches only some
  node types (memorials, museums, theatres, town halls, trees, crosses, peaks), so this is the
  fallback when a node is missing from the download.
- `landmarks`: OSM ids of the outlines or nodes that `landmarks.ts` replaces with a model. A building
  replaced by a model goes into `SKIP_BUILDINGS`. `landmarkLL` holds positions of monuments that are
  not in OSM.
- `dropBuildings` / `extraBuildings`: OSM outlines that do not match the place (checked against an
  aerial image) are left out; buildings OSM lacks are added as lat/lon outlines with OSM-style tags.
  Append new `extraBuildings` (their ids, 9e11 + index, seed the facade and roof). `buildingTags` adds
  tags to OSM buildings by way id, e.g. `building:levels` / `roof:shape` where the guess is wrong.
- `tall` / `mid`: lat/lon boxes where untagged blocks of flats become towers. `squareBonus` adds
  storeys near the square (a capital's centre); `maxLevels` caps guessed storeys.

Then:

```bash
npm run data -- ohrid
python3 -c "
import json,collections; d=json.load(open('public/ohrid.json'))
print(d['places']); print(d['landmarks'].keys())
print(sorted(collections.Counter(b['lv'] for b in d['buildings']).items()))
print('water m²', sorted(round(a['a']) for a in d['areas'] if a['k']=='water'))"
```

**Tune the heights by the storey histogram and by looking.** Kavadarci went from too many 10–15
storey towers (Skopje's zones and square bonus) to almost nothing above 5 storeys (no zones) to
`mid` = the centre only, `squareBonus: false`, `maxLevels: 9`: about 60 buildings of 6–9 storeys
in the centre, the rest low. Skopje's output must not change: every new field needs a default
that reproduces the old behaviour for Skopje.

## 5. The city in the app: `src/cities.ts`

Add the id to `CITY_IDS`, its people to `POPULATION` (the towns in the map's name, 2021 census; it places the map in the city menu, largest first) and an entry to `CITIES` (`CitySpec` documents the fields):

- `name` (Macedonian, map data) and `code` (the badge); `icon`: the browser tab's icon, an SVG in
  `public/` (`./favicon-<id>.svg`: the town's coat of arms or flag), switched with the city.
- `files`: paths relative to the page (`./ohrid.json`…); `sceneBytes`: the scene file's size, for
  the progress bar.
- `views`: `center` is the default view, `overview` the whole map. Each view is a lat/lon (`ll`), an
  exact place (`place`, with `ll` as fallback) or a scene point (`xyz`), plus distance, tilt and
  heading. Keep the camera under the clouds (they float about 1 km up): Kavadarci's lake view
  first sat in them.
- `districts` (far labels), `labels` (near labels; kind `'river'` for a river), `route` (race rings,
  last = finish), `spots` (walking info cards: key → i18n `info.<key>`).
- `gliders`: paragliders, only where there is a Millennium Cross (Skopje). `snowLabel` /
  `refillLabel`: i18n keys for the "snow up high" weather button and the empty-tank hint.
- `sparseFar`: for a map that is mostly bare hills, chunks with fewer draped-ground vertices than this
  get far textures at half size (Kavadarci: 1500).
- `bestRaceKey`: a storage key of its own (`skopje.bestRace.ohrid`); add it to the Settings table
  in NOTES.md.

### The country view and the F-15 (`src/zones.ts`)

Move the map's zone from `PLANNED` to `EXISTING` (its box as in `scripts/config.ts`) and give it its city id in
`CITY_OF`; a map that is not a rectangle keeps its outline in `SHAPES` / `CUTS`. That one entry makes the map:
- a badge that opens it in the country view (Macedonia in the city menu);
- flyable for the F-15: the jet flies into it from a neighbouring map and out of it (`src/hop.ts` finds the
  neighbours from the outlines; nothing else to add), and its radar shows it in colour instead of greyed.

Nothing else is needed for the F-15. The country's 100 m terrain drawn round the map and the map's own terrain
meet by themselves: a map's terrain stores its heights above its own lowest point (`min` in `<id>-terrain.json`)
and `countryground.ts` subtracts that `min` when the map loads (the v26.0.1 fix; before it the country covered
every map that does not lie low). `sceneBytes` in `CITIES` also feeds the download-time guess for the F-15.

## 6. Page and texts

`index.html`:
- Places menu: `<button data-view="<view>" data-city="ohrid" data-i18n="v.<key>">…</button>` for
  every view except `center` and `overview` (shared).
- Help: paragraphs that name places carry `data-city`. Each city has its own `help.lead`, `f.race`
  (number of rings, the route) and `f.fire` (where to refill).
- **Add the city to the CSS rule** that hides other cities' items (it lists every city):
  `body:not(.city-ohrid) [data-city="ohrid"]`.

`src/i18n.ts`: every new key in mk (JavaScript-set strings only; static ones keep their Macedonian
in `index.html`), en, sr, hr, sl, sq. `npm run typecheck` fails on a missing key. Then run
`npm run strings` for the review page. Map names stay Macedonian.

## 7. Monuments

What made the difference between "stylised guesses" and models people recognise:

1. **Find references first.**
   - The OSM tags of the object often link `wikidata`, `wikipedia` or `wikimedia_commons` (Overpass
     `out tags`).
   - The Wikipedia article (mk) via the API: `?action=query&prop=extracts|pageimages&explaintext=1`.
   - Commons category members and file search (`list=categorymembers`, `list=search&srnamespace=6`).
     `prop=imageinfo&iiurlwidth=900&iiprop=url|extmetadata` gives a thumbnail, description, GPS and
     licence.
   - spomenikdatabase.org: Yugoslav-era memorials, with designer, year, sizes and coordinates.
   - For recent photos (the town changes): Commons files from a given year (`srsearch=<town> 2025`);
     US military open days are on Commons as public-domain photos of town squares; local news of
     festivals held on the square; the municipality's own pages.
   - Buildings OSM lacks: municipal tender and permit documents (fire-safety reports, designs) often
     carry site and floor plans with dimensions. Render PDF pages without extra tools via macOS
     PDFKit (a few lines of Swift: `PDFDocument`, `page.thumbnail(of:for:)`) and read the dimension
     lines; trust the surveyed site plan over the text.
   - Street-level services (KartaView, Mapillary) may have nothing, or need an account.
   - Save thumbnails to a scratch folder and look at them. They are references, not assets: nothing
     from them goes into the repo.
2. **Check that the sources agree.** Coordinates should match the OSM point. Names can differ
   (Kiro Atanasovski = Kiro Krstev), and a photo may show a different memorial (the busts in Vataša
   village vs the walls at Moklište).
3. **Model** in `createLandmarks()`, guarded by its data key (`if (L.ossuary)`), after the existing
   ones so Skopje's mesh order stays the same. The helpers there: `box`, `slab` (rounded block,
   optionally open on top), `ribs` (board-marked concrete), `diamonds` (relief band), `brackets`,
   `beam`, `place` (merge, position, turn). Read proportions off the photos. Use details in a slightly
   different shade, or they vanish under the ink lines (the diamonds first read as chevrons).
4. **Clear the ground**: add the outline to `blockGrid` in `computeCitySteps` (`src/city.ts`), or
   generated trees grow through the model. A model that replaces or adds a building also needs its
   outline in `landmarkFootprints()` (`src/landmarks.ts`), or walking passes through it. Anything
   standing on a square sits `areaLift(5)` above the bare terrain (the draped plaza).
5. **Add the type** to `LandmarkData` (`src/types.ts`), and the label, info spot and info text with
   facts that two sources confirm.
6. Say in NOTES.md what each model is based on, and which parts come from a description only.

## 8. Verify

1. `npm run typecheck` and `npm run build` (the new `public/` files must be in `dist/`).
2. `npm run dev`, open `http://localhost:5173/?city=ohrid`: every view, labels, day / sunset / night,
   rain and snow on the hills, walking (info cards), the bus, flight, the race, firefighting (a fire
   starts, refilling over the water works).
3. **Switching frees the old city.** In the console, note the counts, switch away and back a few times,
   and compare:

```js
const mem = () => ({ city: __dbg.cityId, geo: __dbg.renderer.info.memory.geometries, tex: __dbg.renderer.info.memory.textures, kids: __dbg.scene.children.length });
mem(); await __dbg.switchCity('skopje'); /* wait for the loader */ await __dbg.switchCity('ohrid'); mem();
```

   Textures and scene objects must come back exactly (geometries ±2 for streamed ground). For the
   JavaScript side, hold `WeakRef`s to the parts of `__dbg.world` **inside a function**, switch, make
   some garbage, and check that `deref()` is `undefined` for all of them. A `const w = __dbg.world`
   typed at the console top level keeps the old world alive by itself and makes it look leaked.
4. **Skopje stays pixel-identical**: `scripts/browser/pixel-check.js` (NOTES.md, "How to verify").
   Record on the old code (`git stash`), compare on the new one. Expect 0 except a few pixels at the
   gondola cabins in the overview. Do not stash while a data script runs in the background: the old
   scripts would write Skopje's files.
5. Back / forward between cities, a shared link with `#@…`, no console errors. Put back any
   `skopje.*` settings your testing changed in the browser.
6. **The F-15** (✈ F-15 beside Macedonia in the city menu): fly over the new map and out past its edges. The map's
   own terrain and buildings show, the coarse country terrain only beyond the edges. To measure it, in the console
   after taking off in the F-15 (the two should agree within a few tens of metres; a large mean means the heights
   are on different bases):

```js
const w = __dbg.world, cg = __dbg.cground, m = w.meta; let sum = 0, n = 0, max = -1e9;
for (let fx = -0.46; fx <= 0.46; fx += 0.04) for (let fz = -0.46; fz <= 0.46; fz += 0.04) { const d = cg.height(fx * m.w, fz * m.h) - w.terrain.at(fx * m.w, fz * m.h); sum += d; n++; max = Math.max(max, d); }
({ mean: Math.round(sum / n), max: Math.round(max) }); // v26.0.1, all 16 maps: mean 0, max ≤ 22
```

   Then fly from a neighbouring map into the new one (the radar shows it ahead, downloading, entering) and back.

## 9. Documentation and release

- NOTES.md: a history entry (what was built, what was checked, what not), the Settings table
  (the race record key), the Tuning knobs if new ones appeared.
- README: a line under the features, the data commands.
- `package.json` version (minor for a new city). Commit on a branch; **ask the owner before
  `git push`**, as it deploys the live site.

## What Bitola added (v2.10.0)

Shortcuts and fixes that came out of the third city; reuse them before writing new code:

- **Download:** 4 × 3 tiles for a 20 × 15 km box kept timing out on the busy mirrors; 6 × 5 smaller tiles
  went through (a run that gives up resumes from `data/tiles/`, so rerun it in a loop).
- **Monuments on OSM outlines without new data keys:** put the way ids in `models` in `PREP`
  (`{ clock: 1335734377, … }`). The outlines arrive as `landmarks.models[key]`, the generic OSM buildings and
  any Overture duplicates are left out, and trees are kept off them. `src/bitola.ts` builds each model in a
  frame along the outline's long axis (`frame()`, optional axis hint toward a compass direction) with
  `parts()` (boxes, cylinders, domes, arches, walls and bands on the outline, hipped roofs, crosses).
- **Flat floors and textures:** a floor painted on a canvas (`mosaicTexture()`: the Heraclea mosaics) is a
  `CanvasTexture` on a plane; unloading the city frees it. Ruins on a slope need the ground levelled under
  them (`flatWays` in the terrain spec), or walls get buried on the high side.
- **No lake near the town:** `waterLines` widens a river OSM has only as a line into a strip of water in
  its cut channel; the Air Tractor refills over it like over any water area.
- **A square OSM has as a multipolygon relation:** the query fetches no relations of that kind; stitch its
  outer ways and add the ring to `extraPlazas`.
- **Height zones:** with few `building:levels` in OSM, a `mid` zone over the whole centre turns a
  19th-century core into towers. Leave the old core out (several `mid` boxes round it) and tune by eye.
- **Farmland that is not vineyards:** `vineyards` with a low `vineShare` (Bitola 0.08) paints mostly fields.
- **A walker of the town's own:** `walker` and its rig in `walk.ts` (Bitola: Милтон Манаки, the action
  films an оро instead of dancing it); `darkDog` for a different coat on the dog.
- **Checking with a hidden browser pane:** the pixel check waits for the app's frames; in a hidden pane
  replace `requestAnimationFrame` with a timer first (`window.requestAnimationFrame = (cb) =>
  setTimeout(() => cb(performance.now()), 4)`), then `__px.compare()` runs.

## What Makedonska Kamenica added (v8.0.0)

- **A reservoir mapped at low water:** OSM's Езеро Калиманци is 3.4 km², the published lake 4.23 km² and 14 km
  long. Sample the DEM along the river that feeds it (EU-DEM via opentopodata): where the flat water ends and
  where the valley floor passes the full level shows how far the lake reaches. Keep the whole of it in the box,
  with margin for the dam and the power house below it; widening later means downloading everything again.
- **A dam drawn as a closed outline** (OSM `waterway=dam` as an area, not a crest line) does not fit `dams`;
  check first whether the DEM already holds the dam body (sample heights along the outline).
- **The storey histogram is not enough:** after `npm run data`, list the buildings of 7+ storeys with their
  coordinates. A `mid` zone also raises a petrol station or a shop into a tower; pin those with `buildingTags`.
- **Cross-check of the download:** `npm run overture` prints how many OSM outlines it skipped (Overture's own
  copy of OSM); it should match the building count in the raw file when the count servers are busy.
- **Churches with `byzChurch`:** `frame(outline, terrain, [1, 0], true)` puts +u east (the apse) and +v south,
  so `tower.side: 1` is the south side.
- **Commons thumbnails:** send a User-Agent and wait ~3 s between files, or Commons answers 403 / 429.
- **Port 5173 held by another session:** a launch entry `npx vite --port 5174 --strictPort` (not committed).
- **Scripts with Cyrillic text:** a Python heredoc on the command line failed with a non-UTF-8 error; write the
  script to a file with `# -*- coding: utf-8 -*-`.

## What Dojran added (v9.0.0)

- **A lake lower in the DEM than in OSM:** the DEM may hold a lake at an old, low level (Дојранско Езеро: 139 m
  from the drought years) while OSM draws today's shoreline. `flatWater` then flattens it at the low level and the
  beach stands as a cliff all round. Sample the ground just outside OSM's outline (10–50 m out, every few
  vertices) and set `waterLevels: { <OSM id>: <metres> }` a metre below its median; the shore within 20 m is
  lifted to just above the water. Look at a beach close up after `npm run terrain`.
- **Something OSM lacks, on the water:** a model in `modelRects` over a lake stands on the flat water level
  (`frame().y`); run a walkway or a jetty to the shore by stepping along it until `terrain.at()` rises above
  the water, rather than trusting a pier drawn only as a line.
- **Views over a big lake:** keep the camera under the clouds (~1 km): distance × cos(polar) under ~900 m.
- **Snow label:** name a range only if it is inside the map; otherwise the shared `weather.hills`.
- **Is a pixel difference the gondola?** If the count changes with the time since load and the spot lies on the
  line of the cabins (project the meshes that share one geometry), it is.

## What Berovo added (v11.0.0)

- **Models in metres above sea do not work:** `terrain.at()` is relative to the heightfield, not metres above sea.
  Read levels off the terrain (the dam's crest: the lake 20 m upstream, plus 1.4 m).
- **A gorge the DEM lacks:** under a tall dam the DEM may stay level with the lake. `points` on the downstream side,
  closer to the crest than their radius only on the dry side, cut it without touching the flat water.
- **An arch dam on OSM's crest line** (`waterway=dam` as a line): put the way in `models`; the downstream side is the
  concave one (the arch bulges toward the lake).
- **Churches that are OSM nodes only:** read the rectangle off an aerial image (Esri World Imagery tiles; zoom 18
  where 19 is "not yet available"), and add a neighbouring building OSM lacks (a konak) with `extraBuildings`.
- **A stale scene in the browser:** after `npm run data` the open tab may keep the old JSON; reload the page
  (a new tab or the pane restarted) before judging a change.

## What Tetovo, Brod and Resen added (v14.0.0)

- **Overpass down for hours:** `scripts/pbf2overpass.py` writes the same raw JSON from Geofabrik extracts (usage
  in its header; pyosmium in a virtualenv). Add the neighbouring countries' extracts when the box crosses a border.
  Check it as for a download: the building and road counts against a count query when a server answers.
- **A very dense valley:** Overture can add far more than OSM (Тетово: 71,757 footprints to 3,539 OSM buildings).
  Look at the total before modelling; the scene's size grows with it (16 MB).
- **Towers out of zones:** list the buildings of 6+ storeys that are churches, mosques, petrol stations or shops and
  pin them with `buildingTags` (Гостивар's Саат-џамија became a domed tower block).
- **An arch dam the DEM lacks:** `archDam` (src/berovo.ts) on the crest line, `points` on the downstream side to
  cut the gorge; with 20 m cells the cut is shallow and the dam reads as a block at the lake's end.
- **A model on an irregular outline:** `p.walls` extrudes any outline; a mansard that follows it is an offset ring
  (Ресенски сарај, `offset()` in src/resen.ts).
- **View azimuth:** `az` 0 puts the camera south of the target, π/2 east, −π/2 west. A view from the shore across a
  15 km lake shows only water: look from the water toward the shore instead.

## What Матка added

- **A map that is not a rectangle:** the plan's outline goes round finished maps. Download, terrain and chunks stay the
  bounding rectangle; list the neighbours' parts of it as `cut` rectangles in the city's entry in `scripts/config.ts`.
  `cutOsm()` (`scripts/osm.ts`) then drops points and buildings with a corner inside, splits lines and clips areas at
  the edge, for both `prepare.ts` and `terrain.ts`; Overture outlines inside are left out and `download.ts` skips tiles
  wholly inside. Check the scene afterwards: nothing of `buildings`, `areas`, `roads`, `rails` inside a cut.
- **A lake a few cells wide** (a reservoir in a canyon on 20 m cells): its draped edge climbs the walls. `waterPad`
  (metres) in the terrain spec lowers the ground round flat lakes to just above the water.
- **A building that is an OSM multipolygon:** `buildingTags` applies to ways only; use `relationTags`.
- **Model keys are global:** every city's model file builds whatever keys it knows from `landmarks.models`, on any
  map. A key another city already uses (Вевчани's first `nikola` drew Ростуше's Маврово church on its outline) needs a
  prefix of the city's own: `grep -n "M\.<key>" src/*.ts` before choosing one.
- **A second worktree for the pixel check:** the references live in the page's IndexedDB, so serve the old code and
  the new one one after the other on the same port (one launch entry per worktree), not on two ports.

## Checklist

- [ ] `scripts/config.ts`: `CITIES.<id>` (bbox, tiles, files)
- [ ] `npm run download -- <id>`, totals checked against a count query
- [ ] `npm run terrain -- <id>`
- [ ] `scripts/prepare.ts`: `PREP.<id>`; `npm run data -- <id>`; heights tuned by histogram and eye
- [ ] `src/cities.ts`: `CITY_IDS`, `POPULATION`, `CITIES.<id>`
- [ ] `index.html`: places buttons, help paragraphs, the `body:not(.city-<id>)` CSS rule, a
      `.me-main` LinkedIn link with `data-city="<id>"` (the developer shown for the city)
- [ ] `public/favicon-<id>.svg` and `icon` in `CITIES.<id>`
- [ ] `src/i18n.ts`: new keys in 6 languages; `npm run strings`
- [ ] `src/zones.ts`: the zone moved from `PLANNED` to `EXISTING`, its id in `CITY_OF` (country view badge, F-15)
- [ ] Monuments: references, models, `blockGrid` clearings, `LandmarkData`, labels and info cards
- [ ] Typecheck, build, browser walk-through, switching memory test, Skopje pixel check
- [ ] The F-15 over the new map (its own terrain shows, the country's only outside) and flying in from a neighbour
- [ ] NOTES.md, README, CLAUDE.md if conventions changed; version; ask before pushing
