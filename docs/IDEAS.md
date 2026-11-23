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
Order of work: (1) measure, (2) the F-15, (3) map-to-map flight for the F-15, (4) only if the measurements ask
for it, more preparing ahead on desktop. With both switched off, Скопје stays pixel-identical.

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
- **The switch at the edge:** a short fade into the sky's haze (~0.3 s), the build with the files already there,
  then back; HUD and engine sound go on. If the build is slow, the loader shows small (city name and bar only).
- **Keep the main thread free:**
  - while flying, only `fetch` → `ArrayBuffer` (network and gzip are off the main thread); **no `JSON.parse` while
    flying** (Тетово's 16 MB would block for hundreds of ms): the JSON is parsed at the switch, under the fade;
  - one download at a time, low priority (`fetch(…, { priority: 'low' })`), paused when the frame-time governor
    sees slow frames; the prediction is a few multiplications a second;
  - the build at the switch stays time-sliced with `nextFrame()`, sky and HUD drawn between slices; **no Web
    Worker** for the build (workers ran ~7× slower, see [CLAUDE.md](../CLAUDE.md));
  - **done means:** with `PerformanceObserver('longtask')` while flying and preparing, no task over 50 ms from the
    preparing, and the governor never lowers quality because of it, measured on desktop and on a phone.
- **Later, only if the measurements ask for it:** building part of the next map ahead (`computeCitySteps` a little
  each frame) on desktop only; or a binary city data format (typed arrays, no `JSON.parse`) written by
  `scripts/prepare.ts`, instead of a Worker.
- **Step 1, measure first:** download and build time and memory of every finished map, desktop and phone; the
  thresholds above come from that.
- Neighbours that can be flown between today: Скопје–Батинци–Брод, Тетово–Ростуше, Охрид–Ресен–Битола, and
  Крушево / Прилеп next to Брод's south edge (gaps between some of them until the planned maps are built: see
  [TOWNS_TODO.md](TOWNS_TODO.md)). Every new map from the towns plan widens the flight.
