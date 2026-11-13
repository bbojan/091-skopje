# Adding a city

How a new town gets onto the map, step by step: the way Kavadarci (`?city=kavadarci`, v2.8.0) was
added next to Skopje. Commands, conventions and the architecture are in [../CLAUDE.md](../CLAUDE.md);
history and decisions in [NOTES.md](NOTES.md). The examples use a made-up id `ohrid`.

Plan for an afternoon for a small town. Most of the time goes into the Overpass download (busy
servers), tuning building heights, and the monuments.

## 0. What a city is made of

| Piece | Where | Committed |
|---|---|---|
| Map extent, tiles, file names | `CITIES` in `scripts/config.ts` | yes |
| How OSM is read (square, old town, landmarks, places, height zones) | `PREP` in `scripts/prepare.ts` | yes |
| Raw OSM download | `data/<id>_raw.json` | no (`.gitignore`) |
| Prepared scene | `public/<id>.json` | yes |
| Heightfield | `public/<id>-terrain.bin` + `.json` | yes |
| Views, labels, race, walking spots, labels for snow / refill | `CITIES` in `src/cities.ts` | yes |
| Places menu items, help paragraphs | `data-city="<id>"` in `index.html` | yes |
| UI texts (6 languages) | `src/i18n.ts` | yes |
| Hand-built monuments | `createLandmarks()` in `src/landmarks.ts` | yes |

The badge menu, `?city=` in the address, the loading card, unloading the previous city and the
history (back / forward) work for every entry in `CITY_IDS` without further changes.

## 1. Research the area before choosing the box

Look at the town on openstreetmap.org, then ask Overpass what is around it (a wide box):

```bash
curl -s -A 'illustrated-map-research/0.1' --data-urlencode 'data=[out:json][timeout:120][bbox:S,W,N,E];(node["place"~"city|town|village|suburb"];way["natural"="water"]["name"];relation["natural"="water"]["name"];way["waterway"="river"]["name"];nwr["historic"];nwr["tourism"~"museum|artwork|attraction"];);out center tags;' https://maps.mail.ru/osm/tools/overpass/api/interpreter
```

Decide:
- **The box.** The town plus a margin: neighbourhoods, a hill, a river. Kavadarci is
  41.380–41.462 N, 21.958–22.062 E (≈ 8.7 × 9.1 km); Skopje is ≈ 16 × 11 km. Memory, download
  and load time grow with the content, not only the area (NOTES.md, "A larger map").
- **Water for firefighting.** The Air Tractor refills by skimming a `water` area. A narrow river
  drawn only as a line is not an area. Check the areas' sizes after step 4: Kavadarci's "lake"
  (Катунишко Езеро) turned out to be a 100 m pond, but the northern arm of Тиквешко Езеро reached
  into the box and became the refill.
- **The badge code.** The town's old telephone code, like 091 for Skopje and 043 for Kavadarci.

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
  height, which is real, not a broken download.

`terrain` prints the elevation range. Note it: the snow line of the "snow on the hills" weather is
300 m above the map's lowest point.

Shape the terrain with the city's `terrain` settings in `scripts/config.ts` (needs the raw download):
`smooth` (box passes; 1 for EU-DEM areas, Skopje keeps 3), `flatWater` (one level per lake),
`flatSquares` (OSM names), `rivers` (waterway tag → [half width, depth]; never under roads) and
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

Add the id to `CITY_IDS` and an entry to `CITIES` (`CitySpec` documents the fields):

- `name` (Macedonian, map data) and `code` (the badge).
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
- `bestRaceKey`: a storage key of its own (`skopje.bestRace.ohrid`); add it to the Settings table
  in NOTES.md.

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

## 9. Documentation and release

- NOTES.md: a history entry (what was built, what was checked, what not), the Settings table
  (the race record key), the Tuning knobs if new ones appeared.
- README: a line under the features, the data commands.
- `package.json` version (minor for a new city). Commit on a branch; **ask the owner before
  `git push`**, as it deploys the live site.

## Checklist

- [ ] `scripts/config.ts`: `CITIES.<id>` (bbox, tiles, files)
- [ ] `npm run download -- <id>`, totals checked against a count query
- [ ] `npm run terrain -- <id>`
- [ ] `scripts/prepare.ts`: `PREP.<id>`; `npm run data -- <id>`; heights tuned by histogram and eye
- [ ] `src/cities.ts`: `CITY_IDS`, `CITIES.<id>`
- [ ] `index.html`: places buttons, help paragraphs, the `body:not(.city-<id>)` CSS rule
- [ ] `src/i18n.ts`: new keys in 6 languages; `npm run strings`
- [ ] Monuments: references, models, `blockGrid` clearings, `LandmarkData`, labels and info cards
- [ ] Typecheck, build, browser walk-through, switching memory test, Skopje pixel check
- [ ] NOTES.md, README, CLAUDE.md if conventions changed; version; ask before pushing
