# Ideas for later ("Skopje GTA", but cozy)

Not GTA: no violence, just a living, playful Skopje. Items marked ✅ are built (see the history
in [NOTES.md](NOTES.md)); everything else is an idea, not planned yet.

## Walking mode — ✅ built in v2.0.0 (`src/walk.ts`)

- ✅ First- and third-person views; "Инвертирај горе/долу" also applies to looking up/down.
- ✅ Characters: **Итар Пејо** and a **Шарпланинец**; the other one follows as a companion.
- ✅ Context action (E / gamepad A / round button): board a ЈСП bus, ride the gondola to Vodno,
  take off in the plane parked on the Square; otherwise Пејо starts an **оро** and the dog
  **barks** (people run off, birds fly up, the tail wags).
- ✅ Info cards near 10 landmarks (text only so far — see "Landmark cards" below).
- ✅ Run, switch first/third person, switch character; touch joystick, gamepad.
- Still open: pigeons on the ground to scatter (the bark startles the flying flocks), a
  vest with real Вез embroidery (today a plain dark vest), a jump.

## Living city

- Optional real Skopje time for day/night, plus a sunrise preset
- Boats and ducks on the Vardar near the Stone Bridge
- Fountains on the Square, the Warrior fountain lit at night
- Church bells and the call to prayer at the right hours (soft, optional)
- Market stalls in the Old Bazaar and Bit Pazar, busy in the mornings
- Cats on the Kale walls; pigeons on the Square that scatter when you pass
- Fireworks over the Square on New Year's Eve and 8 September
- The tram line Skopje never built, as an "alternate reality" toggle

## Sound (optional, off by default)

- City hum that changes with zoom (traffic near, wind high up)
- Rain, birds by day, crickets at night (✅ rain is drawn, with umbrellas; no sound yet)
- A quiet čalgija or folk tune for the menu or help screen

## Exploring and learning

- Landmark cards: photo and year (✅ the two lines of history exist, in 6 languages)
- Then and now: Skopje before the 1963 earthquake (toggle or slider)
- Walking tours: guided camera paths with captions (Old Bazaar, Kale, Square)
- Find-the-spot game: a photo appears, click where it is
- District borders and names toggle

## Small playful things

- ✅ Gondola ride to Vodno (from the walking mode); still open: the view turning as you rise
- Paragliders over Vodno; a kite
- Balloon festival day: hot-air balloons over the city
- Hidden 091 easter eggs (a giant бурек, ajvar jars on balconies)
- Photo mode: hide the UI, filters (old postcard, Вез frame), save
- Postcard export with "Поздрав од Скопје"

## Seasons and events

- Snowmen in parks, kids sledding on Vodno
- Christmas / New Year lights on the Square and Macedonia Street
- Autumn leaves blowing across streets; spring petals drifting

## Sharing

- Pins with a note, shared as a link ("we met here")
- "My Skopje": favourite places saved in the browser
- Embed mode: a small auto-rotating widget for other sites

## Bigger additions

- More cities in the same style: Ohrid, Bitola, Struga
- Lake Ohrid diorama with boats and Samuil's Fortress
- VR / AR view on phones
- Real ЈСП bus routes with line numbers and stops (✅ red ЈСП buses and a drivable
  double-decker exist; no routes or stops yet)

## Planned with the owner (2026-11-23): F-15 Eagle and flying from map to map

Two plans that go together: the F-15 crosses a small map in seconds, so it needs the neighbouring maps ready.
Map-to-map flight is for the F-15 only (decided by the owner on 2026-11-23, after first wanting it in every mode).
Order of work:

1. **Measure** every finished map: download, and time per preparing step (parse / steps / assemble / bake /
   shaders), memory, on desktop and a phone. ✅ desktop (table in [NOTES.md](NOTES.md), "Load times per step"); phone not yet.
2. **The F-15** in free flight. ✅ built (2026-11-23, branch `f15`), with rockets and an exhaust shimmer (asked by the owner while it was built).
3. **A 100 m terrain of the whole country**: the data exists (built for the country view, `public/country.png`, kept in
   memory once loaded); what is left is drawing it around the map while the F-15 flies (below).
4. **Map-to-map flight** for the F-15: prediction, background downloads, indicator, the switch at the edge.
5. **The fast switch:** low detail first, entry chunks first, shaders kept, far-ground textures later.
6. Only if the measurements ask for it: preparing part of the next map ahead (desktop), or a binary data format. With both switched off, Скопје stays pixel-identical.

### F-15 Eagle (free flight only)

- A chip **✈ F-15** on the flight HUD next to 🏁 Трка and 🔥 Пожар, **only in free flight**: Трка and Пожар hide
  it and bring back their own plane (the usual one, the Air Tractor); while the F-15 flies, their chips are hidden.
  So the F-15 never sets a race record.
- **Speed:** 1325 km/h (368 m/s) normally, 2650 km/h (736 m/s) with turbo; today 198 / 504 km/h (`SPEED`, `BOOST`
  in `src/flight.ts`).
- **Model:** hand-built like the Air Tractor: grey, twin tails, two engines, afterburner flames with turbo.
  **Sound:** a jet engine instead of the propeller (`src/sound.ts`).
- **What the speed asks for:** a higher floor (about 150 m above the ground instead of 38, with a longer look
  ahead over the terrain); a camera further back and a longer view range (`updateCameraRange()`); a check that the
  temporal anti-aliasing (`post.ts`) does not smear at that speed (turn it off for the F-15 if it does); the turn
  rate (0.75 rad/s gives a ~1 km circle at 736 m/s) tried on the small maps; at a map edge with no built neighbour
  the plane turns back in a wide arc. Crossing times with turbo: Крушево ~14 s, Скопје ~22 s, Брод ~34 s.
- Phones: the same chip, same sticks. Strings in 6 languages (`src/i18n.ts`, then `npm run strings`); a row in
  the settings table in [NOTES.md](NOTES.md) if the choice is saved.

### A 100 m terrain of the whole country, for the F-15 (decided with the owner, 2026-11-23)

- **One low-detail terrain for all of Macedonia, for the F-15 only:** downloaded the **first time the F-15 is
  switched on** (not at page load, so the first visit and the map, walking, bus and the usual plane cost nothing
  more), kept for the rest of the visit, and drawn only while the F-15 flies. Beyond the current map's edges the
  mountains of the whole country go on, instead of haze. For the F-15 it is the "low detail first" of the fast switch: at
  the edge the neighbour's relief is already there, only buildings and roads are left to build.
- **Size** (rectangle ~216 × 169 km around the country, 2 bytes per cell as in `terrain.bin`; estimates):

  | Cell | Grid | Raw | gzip / PNG |
  |---|---|---|---|
  | 10 m (as Скопје) | 21600 × 16900 | ~730 MB | far too much |
  | 50 m | 4320 × 3380 | ~29 MB | ~12–16 MB |
  | **100 m (chosen)** | **2160 × 1690** | **~7.3 MB** | **~3–4 MB** |
  | 200 m | 1080 × 845 | ~1.8 MB | ~1 MB |

- **Шуми, ниви, езера** (added by the owner): a land-cover grid at the same 100 m, **1 byte per cell, a class**:
  шума, нива, ливада / пасиште, езеро / вода, населено, гол камен, лозје, so the shader paints them in the map's own
  palette, and the seasons, snow and burnt tints work on it as on the city maps. About 3.6 MB raw, ~0.5–1 MB
  compressed (classes compress well), 3.6 MB on the GPU (an 8-bit texture). Lakes (Охридско, Преспанско,
  Дојранско, the reservoirs) are flat at their water level in the height grid (`waterLevels` as in the city maps),
  so they read as lakes from far. Source: OSM's area tags only (`landuse`, `natural`, `water`, no buildings or
  roads) for the whole country, downloaded once by a script in tiles and rasterised there; only the small grid goes
  to `public/`. If OSM has holes in the countryside, ESA WorldCover (10 m, CC BY 4.0, needs its attribution)
  could fill them.
- **Together:** heights ~3–4 MB + land cover ~0.5–1 MB to download, about 15–25 MB of GPU memory, one draw call.
- **Drawing:** not one big mesh (3.6 M vertices would be ~130 MB): the heights as a **texture** (~7 MB on the GPU)
  read in the vertex shader of a small grid mesh (e.g. 512 × 512), denser near the camera. About 10–20 MB of GPU
  memory and one draw call. Under the current map it is hidden or lowered, so it never fights the detailed terrain.
- **Data:** the same AWS Terrarium tiles as `scripts/terrain.ts`, zoom 10–11 (~57–115 m per pixel here), about
  30–100 tiles; a new step in the scripts writes one file to `public/`.
- **Скопје pixel-identical:** nothing changes outside the F-15, so the reference images stay as they are.

### Country view to pick a city — ✅ built (2026-11-23, the owner moved it ahead of the F-15)

- Opened by Macedonia, first in the city menu (a tile as tall as four cities; at first a round button right of the `?`). `src/country.ts`, data
  `public/country.png` + `.json` (`npm run country`), zones `src/zones.ts`; how it works: "Country view" in
  [NOTES.md](NOTES.md).
- Its data is the 100 m country grid planned for the F-15 below (heights, land cover, border), downloaded the first
  time the view opens and **kept in memory for the rest of the visit** (`loadCountry()` caches it): the F-15 is to
  reuse it, not download it again. Not done for the F-15 yet: drawing it under and around a city map.

### Flying from map to map (F-15 only)

- **Not two built maps at once** (too much memory, iOS Safari): the neighbouring maps' **files are downloaded in
  the background** (`<city>.json` + terrain, 3–25 MB each) and, **at the edge, the map switches quickly** with the
  files already there. The plane flies on: same heading, speed and height above the ground, carried over through
  latitude / longitude (every map has its own origin). Address and back / forward change as today; settings stay.
- **Only while flying the F-15** (so only in free flight): the usual plane, Трка and Пожар stay on one map and
  turn back at the edge as today.
- **Prediction**, once a second: from position, heading and speed, the time to the edge and the map the plane will
  enter (neighbours from the `bbox`es in `scripts/config.ts` and the towns plan). A download starts when the time to
  the edge is under twice (download + build time), so the F-15 starts earlier. A neighbour that is not built yet
  (planned only): nothing to download; at the edge the F-15 turns back.
- **How many maps are kept ready:**

  | | Desktop | Phone (`MOBILE`) |
  |---|---|---|
  | Maps ready | up to **3**: straight ahead, ahead-left and ahead-right (±45°), by time to the edge | 1, straight ahead |
  | What is kept | raw files only (no parsing) | raw files only |
  | Budget | about 80 MB | about 20 MB (a bigger map is downloaded but not kept) |
  | Dropped | the oldest when a fourth comes, or one the heading turns more than ~90° away from | a turn of more than ~45° |

- **Indicator:** one chip next to the speed: `→ Батинци ▓▓▓░` while downloading, `→ Батинци ✓` when ready, hidden
  when no neighbour lies ahead. Strings in 6 languages.
- **The switch at the edge:** a short fade into the sky's haze, then within ~0.5 s the new map's low-res terrain
  and far-ground texture, and the rest built chunk by chunk around the plane (see "Preparing" below); HUD and engine
  sound go on. If even the low-detail step is slow, the loader shows small (city name and bar only).
- **Keep the main thread free:**
  - while flying, only `fetch` → `ArrayBuffer` (network and gzip are off the main thread); **no `JSON.parse` while
    flying** (Тетово's 16 MB would block for hundreds of ms): the JSON is parsed at the switch, under the fade;
  - one download at a time, low priority (`fetch(…, { priority: 'low' })`), paused when the frame-time governor
    sees slow frames; the prediction is a few multiplications a second;
  - the build at the switch stays time-sliced with `nextFrame()`, sky and HUD drawn between slices; **no Web
    Worker** for the build (workers ran ~7× slower, see [CLAUDE.md](../CLAUDE.md));
  - **done means:** with `PerformanceObserver('longtask')` while flying and preparing, no task over 50 ms from the
    preparing, and the governor never lowers quality because of it, measured on desktop and on a phone.
- **Preparing is the hard part, not downloading** (my estimate from the code and [NOTES.md](NOTES.md), not measured):
  a switch means `JSON.parse`, `computeCitySteps` (buildings, roads, trees, parked cars in JS), `assembleCity`
  (meshes, GPU upload: ~744 MB of built geometry for Скопје, far-ground texture bake per chunk) and maybe shader
  recompiles. Guess: desktop ~1–2 s small maps, ~2–5 s Скопје / Охрид, ~4–8 s dense ones (Тетово, Битола); phones
  3–5× that. At 736 m/s, 3 s is 2.2 km of flight, so a 0.3 s fade is not realistic, and the build cannot run ahead
  while flying (two built maps double the memory; seconds of CPU on the main thread). Agreed with the owner:
  1. **Low detail first, then the rest:** at the edge show within ~0.5 s only the low-res terrain (the 100 m country
     terrain, already on screen) and the far-ground texture, then add buildings and roads chunk by chunk around the plane (the F-15 flies at 150 m+ and rarely
     sees close detail). Builds on the memory saver (`stream`), where terrain and draped ground are already built
     per chunk; buildings are not yet (see "A larger map" in [NOTES.md](NOTES.md)).
  2. **Entry chunks first:** build in order from where the plane enters, along its heading.
  3. **Keep the shaders:** the same materials across maps, so no recompiling at a switch.
  4. **Far-ground textures later:** baked a few at a time after entering.
  5. **Measure first:** time per step (parse / steps / assemble / bake / shaders) for every finished map, desktop
     and phone; that shows whether 1–4 are enough.
- **Later, only if the measurements ask for it:** building part of the next map ahead (`computeCitySteps` a little
  each frame) on desktop only; or a binary city data format (typed arrays, no `JSON.parse`) written by
  `scripts/prepare.ts`, instead of a Worker.
- Neighbours that can be flown between today: Скопје–Батинци–Брод, Тетово–Ростуше, Охрид–Ресен–Битола, and
  Крушево / Прилеп next to Брод's south edge (gaps between some of them until the planned maps are built: see
  [TOWNS_TODO.md](TOWNS_TODO.md)). Every new map from the towns plan widens the flight.
