# 091 Скопје — project notes

Context for continuing the work (on any machine, in any Claude Code session).
For commands, architecture and conventions see [../CLAUDE.md](../CLAUDE.md); for adding a city,
[ADDING_A_CITY.md](ADDING_A_CITY.md).

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
   Banner texts and the badge are per city (`banners` in `src/cities.ts`, badge = the city's code):
   Kavadarci tows „Митко го спаси градот!“ and „Шо ги ебам нека му а мислат“ with 043.
   🔊 Sound is on by default now (it was off since v2.6.0); switching it off is remembered.
   Checked with synthetic key, wheel and gamepad events and by stepping the flight with
   `fire-harness.js`, not with a real mouse or pad. Seen while testing, not looked into:
   ink lines of what is behind the tow banner show through the cloth (both texts).
22. **v2.7.1** (Nov 2026): stunt keys in the flight: Q / E roll left / right, F a loop up and
   over, R a loop nose down and under; "invert up/down" swaps F and R, the same rule as the
   map's F / R tilt. With Cmd / Ctrl / Alt held the keys stay the browser's (reload, find).
   The key hint in the flight says „Q E F R акробации“, the help dialog has a row for them.
   Checked by stepping the flight with synthetic key presses, both invert states.
23. **v2.8.0** (Nov 2026): ⚙ Опции got two submenus, 🎨 Графика (contours, quality, smooth
   edges, memory saver, less traffic) and 🎮 Управување (invert up/down for the map and walking,
   off by default; in flight, on by default). The flight / fire key hints and the help's ↑ ↓
   line follow the flight switch. Race / fire direction arrow: a bold SVG arrow that turns the
   short way round. The help ? is a round button right after the title badge. The LinkedIn
   button can list the developers (▼), hidden for now with Riste's credit in the help footer
   (`hidden` on `#me-more` and the `.soon` spans; shown on the Kavadarci branch).
24. **After v2.8.0** (Nov 2026, the `kavadarci` branch): a second city, **043 Кавадарци**
   (`?city=kavadarci`, BBOX 41.380–41.462 N,
   21.958–22.062 E ≈ 8.7 × 9.1 km: the town, Ваташа, Глишиќ, the Луда Мара and Катунишко Езеро). The
   badge at the top left is the city picker (a menu in the Вез style; the round `?` right after it keeps the
   help). The city lives in the address; without `?city=` the map opens on Skopje; switching pushes a
   history entry, so back / forward switch the city too. The previous city is unloaded completely before
   the next one builds behind the loading card (`unloadWorld()` in `main.ts`).
   Everything that differs per city is in `src/cities.ts` (views, labels, race route, walking info
   spots, paragliders, labels for snow on the hills and the refill) and `PREP` in `scripts/prepare.ts`;
   the data scripts take the city as their first argument. Kavadarci has its own places menu (Плоштад,
   Спомен-костурница, Ваташа, Тиквешко Езеро, Преглед), a 10-ring race, seven info cards and four
   hand-built monuments (`landmarks.ts`), modelled after photos on Wikimedia Commons and the
   descriptions on mk.wikipedia and spomenikdatabase.org/kavadarci (proportions read off photos):
   - Спомен-костурница (Petar Muličkovski, 1976; replaces the OSM building): a stylised old
     Macedonian house on a fluted concrete shaft, ~13 m: a first storey and a wider open top storey
     with raised ends, both on radial brackets with a band of diamond reliefs; a ~21 m courtyard ringed
     by fluted wall blocks of different heights, steps down (amphitheatre) to the shaft, iron
     grape-vine gates on the north and south sides.
   - Споменик Киро Крстев и Димче Мирчев, where the two People's Heroes died on 7 April 1944
     (north-west corner of the town park; Tome Andreevski, 1959). Rebuilt after two Commons photos of
     June 2019 („Kiro Krstev i Dimce Mircev - spomenik Kavadarci“): a ~7 m concrete slab, its top
     rising to the right and its ends cut on a slant, the names on the left and a dark relief of
     charging fighters on the right, on two piers of white stone blocks (the park path passes between
     them, a low wall runs on to the pillar); a tall pale concrete pillar (~8 m) at the top of the
     steps; 13 steps between rubble-stone walls. Layout from OSM: the steps (way 1275768508) arrive at
     the footway ring round the node and the path into the park leaves behind; the relief faces down
     the steps (`HEROES_TURN`). The elevation data is flat there, so the model raises its own terrace
     ~2 m above the paths (grass bank, a ramp down into the park behind); walking and the city's
     pedestrians stand on it (`landmarkGround()` in `landmarks.ts`). From the description only: the
     marble pylon behind (spomenikdatabase.org), the ramp. The Commons photo GPS is ~150 m off;
     OSM and spomenikdatabase agree within 4 m. OSM names him „Киро Атанасовски-Налбатот“,
     Commons „Киро Крстев“: the same person.
   - Градски стадион (ГФК Тиквеш; first match 19 March 1950), round the OSM pitch (way 1276210010,
     lit grass, no stands in OSM; en.wikipedia's coordinates fall on it). After Commons photos of 2010,
     2013 and Nov 2020, the municipality's photos of the works (16 Oct 2020) and a GFK Tikveš match
     photo of Sept 2024 (stativa.mk): the old covered north stand (10 concrete rows, a dark red roof
     falling toward the pitch on red steel columns, a white block wall behind, yellow huts by its
     west end), the east stand rebuilt in 2020 (9 rows curving round the north-east corner, a brick
     wall behind), the roofed south stand finished in 2023 (8 rows under a white steel canopy), a white
     two-storey clubhouse with a tiled roof behind the west goal and a long low building north of it,
     a 105 × 68 m marked field, goals, a white fence. The 25 m terrain ran ~6 m up across the pitch:
     `flatWays` in scripts/config.ts flattens the pitch and a 12 m pad round it at 282.3 m (the low,
     street side), so the north stand is dug into the hill as in the photos. Not from photos: the stand
     lengths and the south stand's row count (from „1000 covered seats“), the clubhouse sizes, no
     floodlights (OSM says lit, no photo shows masts), seat colours (left as concrete). Capacity is
     given as 4,000 to 9,000 by different sources, so the info card leaves it out.
   - Vataša memorial at Moklište (Jordan Grabul, 1963; 12 youths shot on 16 June 1943): two curved
     white walls on the grass south of the lawn, the paved path between them (`VATASA_WALLS` in
     `landmarks.ts`, from an Esri aerial image and the owner's photos, Nov 2026): the north one ~15 m long,
     3.4–4.4 m high, with the long black inscription facing the lawn and the busts; the south one ~11 m,
     3 m, with the black plaque of names, a round dark emblem and the dark granite altar in front; two small
     thujas on the lawn. Walking collides with both walls.
   - Monument to the Revolution on the square (Petar Palavičini, 1958; not in OSM, position from
     spomenikdatabase.org), after a photo of Dec 2020: a young man, a woman raising one arm, a youth
     sinking forward under her hand, on a tall speckled granite plinth „За слободата на народот свој“,
     facing the square with the town hall behind it.
   - Плоштад Маршал Тито after photos of Dec 2020 and 1 June 2025 (US Army, public domain; an
     „Immediate Response 2025“ open day on the square): Општина Кавадарци (replaces the OSM building;
     three storeys of salmon and cream stone panels, a projecting entrance bay with the lettering,
     steps, trimmed conifers, two Macedonian flags and the EU flag), a round dark-granite fountain on
     each side of the entrance, round granite planters with flowers and curved wooden seats, black
     granite ball bollards along the streets, curved paving bands. The planters' positions are
     approximate; the 2018 layout (boat-shaped planters, a water channel, an amphitheatre) is gone.
   - Дом на културата „Иван Мазов-Климе“: not in OSM at all (only a point). Placed and shaped from
     the site and ground-floor plans of a fire-safety report on the municipality's site (АРХИКОНС,
     Dec 2023): 41.4 m along Илинденска, ground floor + one storey, stage block at the north, the
     260-seat hall, the foyer and main entrance toward ул. 7 Септември, wings to the east, a vestibule
     to the west. No photo of its outside was found: plain rendered walls and window bands.
   Walking collides with both buildings (`landmarkFootprints()` in `landmarks.ts`).
   No red ЈСП buses in Kavadarci (`buses: false` in `src/cities.ts`): none in the traffic, the 🚌
   button is hidden and driving does not start; boarding a bus, the bus pointer and bus fires
   disappear with them. Skopje's traffic is unchanged (same random sequence).
   Terrain (Nov 2026): the Kavadarci heightfield matched EU-DEM 25 m within 0.6 m RMS at 100 points
   (SRTM 30 m differs by 5 m RMS), so the source was right; what looked wrong came from the
   processing. Now per city (`terrain` in `scripts/config.ts`, `terrainExag` in `src/cities.ts`):
   Kavadarci is drawn at true heights (Skopje keeps its 12 % stretch), smoothed once instead of
   three times, its lakes have one water level (Tikveš Lake's surface wandered over 249–266 m, now
   250.0; the shore is at 250.2), Плоштад Маршал Тито is flat (1.4 m → 0.3 m, blended over 15 m)
   and the Луда Мара, its stream and the canal are cut in as channels (the ground 30 m beside the
   river was 0.2 m above the bed, now 2.2 m), not under roads. Known heights can be added as
   `points` ([lat, lon, metres, radius]); none yet. Still 0.67 m RMS from EU-DEM. Skopje's
   terrain and pixels are unchanged (pixel check: 0 except the gondola cabin).
   Their outlines are kept free of trees, sheds and parked cars (`blockGrid` in `city.ts`).
   The firefighting plane refills from Тиквешко Езеро; Катунишко Езеро is only a ~100 m pond.
   No paragliders in Kavadarci. Best race time is kept per city (`skopje.bestRace.kavadarci`).
   **The whole Тиквешко Езеро (Nov 2026).** The box grew from 8.7 × 9.1 km to 17.7 × 23.6 km
   (41.25–41.462 N, 21.85–22.062 E): the lake (11 km², 41.26–41.40 N), the Црна Река from where it
   comes in at the west edge to where it leaves past Возарци at the north edge, 13 villages as far
   labels, a „Брана Тиквеш“ view in 📍 Места, an 11th race ring by the dam and a walking info card on its crest.
   The whole Црна (207 km, from Demir Hisar through Pelagonia and Mariovo) would be ~30× Skopje's
   area: out of reach for this engine. Брана Тиквеш (rockfill, 113.5 m, crest 338 m): the terrain
   raises the dam body along the crest road (`dams` in the terrain spec; OSM's dam line is the
   upstream edge at the full lake, ~25 m out, so the road is the crest), the lake stays flat against
   it; `landmarks.ts` lays a rock mesh over the OSM outline (berms every 20 m of height, riprap on the
   lake side), parapets and lamps on the crest, the round bell-mouth spillway in the lake (OSM: a
   round water area and a culvert to the chute), ХЕЦ Тиквеш (113 MW) at the foot and its switchyard.
   Heights and details are guessed from the shapes, not from photos. Cost: 432 chunks instead of 90,
   the heightfield 1.6 → 8.4 MB, the scene 2.4 MB; most chunks are bare hills, so their far textures
   are baked at half size (`sparseFar` in `src/cities.ts`: under 1500 draped-ground vertices, ~380
   of 432 chunks), ~600 → ~200 MB of far textures on desktop. Skopje pixel-identical (check: 0 on
   centre/Kale, 13–17 px on the overviews = the gondola cabins). The overview looks west from the
   east: the map is longer north–south than the 28° lens shows from the south at 25 km.
   **The block by Дом на културата (Nov 2026):** between Илинденска, ул. 7 Септември and the market lane OSM
   has only the post office, the T-Mobile shop and a few others; 14 buildings were traced off an aerial
   image (Google, 2026) into `extraBuildings` (appended, so the earlier ids and seeds stay): the house with
   the red hipped roof among the trees, the flat-roofed shops north of Sweet Art, „Кино Бавча“, the white
   hall east of the culture house, the shops east of the lane. Traced by drawing the map's outlines and
   streets over the image (georeferenced on Илинденска, 7 Септември and the market's roof). OSM's
   7 Септември runs ~5 m north of the kerb there, so that hall's south side is kept off the street. The post
   office, the T-Mobile shop and the shop row south of the market had no levels and were guessed at 6, 9
   and 4 storeys; `buildingTags` in `PREP` (tags added by way id) makes them low with flat roofs.
   **The Луда Мара through the town (Nov 2026)**, `src/river.ts`, after photos: a stone-lined channel
   ~8.6 m wide at the top between the bridges of Киро Крстев and Северен (1.9 km), shallow water ~5 m
   wide, both banks pitched with light stones (greener at the waterline), white concrete copings, a
   railing on the east one, a promenade on each side (concrete slabs; a red-brick walk on the west),
   benches, lamps, plane trees, steps down to the water, arched steel footbridges at OSM's footway
   bridges, parapets on the road bridges, and a cascade every ~70 m where the steps are worth showing
   (the town falls ~31 m along it). The centre line is set halfway between the two promenade footways
   where OSM has both (the river line is up to 3 m off), smoothed, every 2 m (`canal` in `PREP`).
   A 10 m heightfield cannot hold an 8 m channel, so the terrain is left at street level there
   (`riversKeep` in the terrain spec) and the corridor is cut exactly out of the terrain mesh, the
   draped areas and the paths (`cut`: the polygon minus the corridor's triangles; streets crossing it
   are kept, their draped strip is the bridge deck); the water, banks and promenades are emitted into
   the draped ground, so the far-ground bake and the water glints include them. Outside the town the
   river and the stream above it are a narrow strip of water in the cut channel. Walking: the
   promenades' and footbridges' height, the channel blocks the way except at the bridges. A „Луда
   Мара“ view in 📍 Места. Skopje pixel-identical (check: 0 over 2/255 on all 9 renders).

   **The town churches and the vineyards (Nov 2026).** Св. Петка and Св. Димитриј are modelled after the
   owner's photos (`src/churches.ts`) on their OSM outlines (the generic domed boxes are left out): Св.
   Димитриј as renovated, grey-brown rubble stone with brick courses and brick arches round the windows, a
   cream cornice and tiled lean-to roofs, above them a white nave and transept with gable roofs, a white
   octagonal drum over the crossing, the bell tower in the middle of the west front (stone, then two white
   stages with arched openings and oculi); Св. Петка in pale ashlar banded with brick: the 33 m wide west
   front (tall middle bay with the big porch arch, side bays with doors, domes and rounded ends), the
   cross-in-square naos with crossing gables, the main drum, two small drums and the apse, and its bell tower
   standing apart ~34 m south-east (its red cap on an Esri aerial image; Street View and a drone photo show it
   by the parking). Heights read off the photos, not measured. A „Св. Петка“ label joins „Св. Димитриј“.
   Vineyards: OSM has one vineyard and 46 farmland polygons round the town, the aerial image shows vines
   and fields almost everywhere. `farmMask()` in `city.ts` marks farmland on the terrain's 10 m vertices
   (`vineyards: 520` in `src/cities.ts`: below ~520 m ± 60, slope under ~17°, not painted land cover, not
   within ~15 m of a building or in built-up ground, wild patches from noise) with one marker colour,
   `FARM_MARK` (a little yellower than the bare hills, so the edge barely shows; ≥ 0.075 linear RGB from
   every other ground colour). The ground shader (`VINE_GROUND`, near and baked-far materials alike) paints
   the plots there from the world position: blocks of ~240 m (wobbled Voronoi cells, each with its own
   direction and a dirt track round it) cut into strips and plots with grass verges, about half vineyards
   (rows every 2.5 m, faded to their mean colour once a row is smaller than a pixel), the rest stubble,
   ploughed earth, green crops or fallow. Vines turn yellow or red in autumn, bare in winter. The far bake
   keeps the marker, so near and far agree. Skopje's materials keep their old programs (`vine` is off):
   pixel check 0 except the gondola cabins (5 px on the overviews). GPU: 6–8 ms for a 1800×1345 view over
   the farmland (full tier, M-series). Not done: 3D vine rows close up (they are flat stripes).
   Also: the 12 busts at Vataša a little larger (the shoulders wider than the pedestal, as in the photos),
   the name in black on each pedestal, a tall thuja right behind each bust (was seven between the first
   eight), a golden and two red shrubs on the lawn. An Overture house that stood half inside the ossuary's
   courtyard is gone: Overture buildings are kept 11 m off the ossuary's outline (was 5 m; the OSM outline
   is only the house on the shaft, the modelled courtyard is ~21 m square).
25. **v2.10.0** (Nov 2026, the `bitola` branch): a third city, **047 Битола** (`?city=bitola`), without ЈСП
   buses (`buses: false`: no red buses in the traffic, no drivable double-decker, no bus fires). The box
   40.955–41.085 N, 21.165–21.40 E (≈ 19.7 × 14.5 km): the town, Хераклеа, the villages on Баба and Pelister
   (2601 m) with Големо and Мало Езеро. Downloaded in 6 × 5 tiles (4 × 3 tiles kept timing out on the busy
   mirrors); totals checked against a count query: 5,208 of 5,208 buildings, 3,763 of 3,763 roads. OSM
   leaves most blocks empty, so 20,316 Overture footprints were added (25,515 buildings). Terrain 576–2590 m,
   `terrainExag: 1`. Heights: only 58 buildings have levels in OSM; a `mid` ring of four boxes round the
   centre leaves out the 19th-century core (Широк Сокак, Магнолија, the чаршија), which stays at 2–4 storeys;
   `maxLevels: 10`. The Pelagonia plain uses the Tikveš farmland painter with a new per-city share of
   vineyards (`vineShare`, uniform `uVineShare`; Kavadarci keeps 0.52, Bitola 0.08: mostly fields).
   Firefighting water: no lake near the town, so the Драгор, which OSM has only as a line, is widened into
   a water strip 8–10 m wide along its channel through the town (`waterLines` in `PREP`); Големо Езеро on
   Pelister works too. Checked by stepping the fire mode: `overWater` over the strip.
   Monuments (`src/bitola.ts`, on their OSM outlines via a generic `models` map in `PREP` →
   `landmarks.models`; the generic buildings and Overture duplicates are left out), after Commons photos:
   Саат-кула (OSM height 32 m: rubble shaft, cornice, clock stage with four blue faces, balcony, white
   octagonal belfry, cross), Ајдар-кади џамија (hall, drum and lead dome, three-arched portico with three
   small domes, minaret with one balcony; portico placed at the end facing north-west, away from the qibla),
   Безистен (parallel lead barrel vaults with dormers, arched gates), Св. Димитриј (ashlar with brick courses,
   arched windows, low hipped roof) and its brick bell tower, Хераклеа's theatre (stepped half bowl, stage
   building with brick arches) and the Great Basilica: outer walls, narthex wall, two stylobates with
   column stumps, and its mosaic floors as painted canvas textures (after Commons photos, simplified): the
   narthex's „paradise“ (meander border, a band of medallions, fruit trees, deer, a lion, a kantharos with
   vines in the middle), a geometric carpet down the nave (eight-pointed stars of two squares, small squares
   with knots, crosses and vessels, a braided border, a few lost patches) and a peacock among vines inside a
   wave border before the apse; a 4 px tesserae speckle with grout lines over all of them. The site slopes
   ~2.4 m under the basilica and ~6.6 m under the theatre: both are levelled in the terrain (`flatWays`).
   Плоштад Магнолија is a multipolygon relation the query does not fetch: its three outer ways stitched
   into one ring (~2,300 m²) and drawn as a square (`extraPlazas`). Sizes read off photos, not measured.
   Walking as **Милтон Манаки** (`walker: 'manaki'`): 1900s suit, bowler, moustache, the Bioscope camera on a
   tripod over his shoulder; 🎥 Снимај sets it up in front of him, he turns the crank and the people round
   a point 7 m ahead dance an оро (the traffic's оро hook); walking 3 m away ends it. The companion is the
   Шарпланинец in a dark coat (`darkDog`). Tow banners: „Манаки го сними спасувањето!“ / „Ај на Широк
   Сокак!“. LinkedIn: Bojan's profile. Info cards: 11 short texts in 6 languages (facts kept to the common
   ones: dates by century where sources differ).
   Checked: Skopje pixel check 0 on all 9 views (also after the farmland change); switching
   Bitola → Kavadarci → Bitola: textures 309 = 309, scene children 19 = 19, geometries 621 / 623; no
   console errors on a clean switch; typecheck and build. Not done: the north shore of Големо Езеро shows
   jagged water edges where the flattened lake meets the steep slope; the cathedral's roof is a plain hip
   over its bounding box; phone layout not checked for Bitola.

26. **v3.0.0** (Nov 2026, on `develop`): the version goes to 3 for the map of three cities (Skopje,
   Kavadarci, Bitola); no change in the app itself since v2.10.0 besides the docs.

27. **v3.1.0** (Nov 2026, on `develop`): **046 Охрид** (`?city=ohrid`), the fourth city: the whole of
   Охридско Езеро, 40.885–41.205 N, 20.615–20.845 E (19.3 × 35.6 km): Ohrid and Struga, Св. Наум at the south
   end, the villages on both shores, Pogradec and Lin on the Albanian side, the western slope of Галичица.
   Downloaded in 4 × 7 tiles (the town's column took four mirrors and ~20 minutes); 13,143 OSM buildings plus
   29,707 Overture footprints. The largest map so far, so the heightfield has **20 m cells** (`cell` in the
   city's `TerrainSpec`; the app reads the cell size from the terrain JSON and needed no change): 3.4 MB
   instead of ~14 MB, 720 chunks of 1 km. The lake (357 km²) is flattened at one level; the Црн Дрим in Struga
   and the canals are cut as channels. **Far-ground textures of open water**: a chunk whose draped ground covers
   it entirely in one colour bakes a 16 px texture instead of 512 px (`oneColour` in `bakeGround`; only when
   `sparseFar` is set, so not for Skopje): 312 of Ohrid's 720 chunks, ~300 MB of GPU memory saved.
   Models (`src/ohrid.ts`, on OSM outlines via `models`; the shared kit moved out of `src/bitola.ts` into
   `src/models.ts`, with a new `gable` roof and `byzChurch`: a cross-in-square church of two gabled arms over
   lower corner bays, a drum with a blind arcade and a tiled cone, apse, side conches, small drums, a narthex
   with an open arcade, a bell tower; cloisonné courses of brick in the stone): Св. Јован Канео, Св. Климент и
   Пантелејмон на Плаошник (trefoil, two small drums, the bell tower), Св. Софија (basilica, clerestory,
   apse, the two-storey exonarthex with its open gallery and two domed corner towers), Св. Наум (a second drum
   over the narthex, an arcade round it), the ancient theatre (Bitola's theatre code on its outline, key
   `theatre`). Залив на коските: the pile dwellings on a timber platform with thatched huts, palisade and
   footbridge, placed by a new `modelRects` entry in `PREP` (a rectangle and a heading, written to
   `landmarks.models` and `landmarks.modelAxes`); OSM buildings whose centre lies in such a rectangle are left
   out (OSM maps the reconstructed huts as buildings). OSM's walls round Канео's terrace are tagged city walls:
   retagged to 1.6 m parapets (`buildingTags` applies to any way). Самоилова тврдина is OSM's walls.
   Strings of the four new towns are in `src/i18n-towns.ts`, spread into `STR`. No ЈСП buses; Итар Пејо and
   the grey Шарпланинец as in Skopje. Tow banners: „Охридската пастрмка го спаси градот!“ / „Ајде на Канео!“.
   Checked: Skopje pixel check 0 on the 9 views except the gondola cabins in the overview (≤ 13 pixels);
   switching Ohrid → Bitola → Ohrid → Kavadarci → Ohrid: textures 727 = 727, scene children 19, geometries
   +2 per round (the same as Bitola's); typecheck, build; views rendered and looked at. Not checked: phones
   (42.8k buildings and 372k trees: the heaviest map; `MOBILE` halves trees and parked cars), firefighting
   played over the lake, walking cards one by one.

28. **v3.2.0** (Nov 2026, on `develop`): **048 Прилеп** (`?city=prilep`): 41.31–41.41 N, 21.49–21.63 E
   (11.7 × 11.1 km): the town, Маркови Кули, Варош and its monasteries, Трескавец under Златоврв (1422 m) at the
   north edge, Прилепско Езеро (the firefighting water) to the north-east. 4,803 OSM buildings plus 17,809
   Overture footprints; 10 m cells; Пелагонија's fields from the farmland painter (`vineyards: 760`,
   `vineShare: 0.1`). Models (`src/prilep.ts`): the clock tower on OSM's outline (Прчикур, height 40: rubble
   shaft with brick roundels, the open clock stage on slender piers, balcony, lantern, octagonal lead spire);
   Могила на непобедените (Bogdan Bogdanović, 1961) as eleven lathe-turned white urns with scrolls round the
   paved plaza, a path in and a wall of names (`modelRects.mogila`); Маркови Кули: ~220 granite boulders
   (noisy dodecahedra on the slope) over the fortress hill (`modelRects.markovi`), the walls are OSM's city
   walls; Трескавец's church as a `byzChurch`. OSM's fortification at Трескавец retagged to 3 m (it drew
   8 m walls up the steep ridge). Tow banners: „Крале Марко го спаси Прилеп!“ / „Ај на Пивофест!“.
   Merged before Rostuše, against the asked order: Rostuše's download (36 tiles of mountains) came last.
   Checked: views rendered and looked at; typecheck, build. Not checked: phones, firefighting over the lake,
   walking cards one by one.

29. **v3.3.0** (Nov 2026, on `develop`): **048 Крушево** (`?city=krusevo`): 41.33–41.405 N, 21.19–21.31 E
   (10.0 × 8.3 km): the town on the slopes of Бушева Планина, Македониум, Мечкин Камен at the south edge,
   Крушевско Езеро (the firefighting water: a pond of ~38,000 m² below the Македониум, small to skim). 1,766
   OSM buildings plus 1,819 Overture footprints; 10 m cells; the town's centre as an old-town box (low, tiled,
   dense), `maxLevels: 5`. Models (`src/krusevo.ts`): the Македониум (Jordan and Iskra Grabul, 1974) on its OSM
   outline: a white sphere on a waist, twelve stubby tubes in every direction, the side ones ending in round
   and oval stained-glass windows with metal bars (a second night-lit material, `stained`), the upper ones in
   small glass domes, the slot door at the end of a ramp between white parapets; Мечкин Камен: the dark giant
   lifting a boulder (≈ 14 m), on slabs of bare rock, three flagpoles, a 40 × 36 m clearing kept free of trees
   (`modelRects.meckin`, at OSM's monument node). Tow banners: „Питу Гули го спаси Крушево!“ / „Да живее
   Крушевската Република!“. Merged before Rostuše (its download came last).
   Checked: views rendered and looked at; typecheck, build. Not checked: phones, firefighting over the small
   lake, walking cards one by one. The giant is a stylised figure, not modelled from measurements.

30. **v3.4.0** (Nov 2026, on `develop`): **042 Ростуше** (`?city=rostuse`): the Mijak country, 41.39–41.725 N,
   20.49–20.815 E (27.1 × 37.3 km, the largest map): Ростуше and Бигорски манастир in the Радика valley, Дебар
   and Дебарско Езеро (9.7 km²) with Брана Шпиље to the south-west, Мавровско Езеро (10.5 km²) and Маврово to
   the north-east, Галичник and Бистра between them. 36 tiles of mountains through busy mirrors took ~1.5 hours:
   a second worker fetched the tiles from the other end into the same `data/tiles/` cache. 2,341 OSM buildings
   plus 17,583 Overture footprints; 20 m cells (5.1 MB); the forest thinned hard away from Ростуше
   (`treeThin` min 0.035 from 7 km: 632k trees instead of 1.02M), 1,064 chunks.
   **Бигорски манастир** (`src/rostuse.ts`, a `modelRects` rectangle of 82 × 58 m over the church and OSM's ten
   plain outlines, which are left out; +u south down the valley, +v west toward the river; the slope rises
   ~25 m across it): konak wings round a terraced court (`konak()`: rubble-stone storeys down the slope, white
   plastered storeys with dark floor beams and rows of dark-framed windows, the top storey jutting out on
   curved brackets, low hipped roofs of grey stone slabs with wide timber eaves, stone chimneys with slab caps,
   red flower boxes, an open arcade gallery on the valley wing); the bell tower (stone shaft with a clock, the
   white belvedere with windows all round cantilevered on brackets, a wide slab roof); the church (stone,
   slab gable roof, apse, open narthex porch, octagonal stone drum with arched windows and a lead dome); the
   gate passage with its marble portico, gilt band and lead dome; the octagonal fountain pavilion; the terrace
   wall, two cypresses, a timber stair. Layout read off photos of the court, not surveyed. **Св. Никола** in
   Маврово on OSM's outline of the ruin: roofless stone walls with a ragged crest, the apse, arched windows,
   the bell tower with a lead pyramid roof. Tow banners: „Бигорски е спасен!“ / „Ајде на Галичка свадба!“.
   Checked: views rendered and looked at (Bigorski from the valley and from above, the two lakes, Debar);
   typecheck, build. Not checked: phones (the largest map: 1,064 chunks), firefighting over the lakes, walking
   cards one by one; the church of Bigorski's interior (the iconostasis) is not modelled.

31. **v7.0.0** (Nov 2026, on `develop`): the version goes to 7 for the map of seven cities (Skopje,
   Kavadarci, Bitola, Ohrid, Prilep, Kruševo, Rostuše), as v3.0.0 did for three; no change in the app itself
   since v3.4.0 besides the docs.

32. **v8.0.0** (Nov 2026, on `develop`): **033 Македонска Каменица** (`?city=kamenica`), the eighth
   city (the version follows the number of cities, as v7.0.0 did): 41.945–42.125 N, 22.495–22.71 E
   (17.8 × 20.0 km): the miners' town in the valley of the Каменичка Река under Осогово, Саса and its lead and
   zinc mine up the valley to the north, and the whole of Езеро Калиманци on the Брегалница to the south (the
   firefighting water: 3.4 km², OSM's relation 18158229, at a low level; published: 14 km long, 4.23 km²). The box
   first ended at 22.665 E and 41.965 N; it was widened so that the dam, the power house below it and the lake's
   tail up the Брегалница valley are inside: EU-DEM puts the water's end at ~22.646 E (512.6 m) and the valley
   floor passes ~535 m, about the full level, near 22.68 E. OSM's outline is kept as it is (no full-level water). Only 241 OSM buildings, so 5,476 Overture footprints; 10 m cells,
   elevation 426–1780 m. No old core; one `mid` box round the square, `maxLevels: 9` (photos of 2010 show a
   handful of towers of about ten storeys among low houses with tiled roofs); the Макпетрол station and the
   Жито shop pinned low with `buildingTags` (the zone made them 12-storey towers). The Калиманци dam (rockfill,
   92 m) is not raised with `dams`: OSM draws it as a closed outline, not a crest line, and the DEM already
   holds its body (≈ 537 m crest, the lake flat at 513 m, as at low water in a photo of September 2026).
   Models (`src/kamenica.ts`, after Commons photos of 2013): Успение на Пресвета Богородица on its OSM outline
   with `byzChurch` (stone with brick courses, trefoil plan, octagonal drum, the small bell tower at the
   south-west corner); the square's fountain (`modelRects.kfountain`, OSM's fountain is not in the download):
   a granite basin, three stepped tiers, a column and bowl, a white statue of a woman on top. Tab icon: the
   miners' hammer and pick. Tow banners: „Калиманци ја спаси Каменица!“ / „Среќно, рудари!“.
   Checked: views rendered and looked at (the square, the church from the square, the dam, the Саса mine, the
   overview, night); typecheck, build; Skopje pixel check (0 except 3 pixels at the gondola in the overview);
   switching away and back (textures and scene objects equal, geometries +2). Not checked: phones, firefighting
   over the lake, the race, walking cards one by one. Not modelled: the Monument to the Miners and Вера Јоциќ
   (Томе Серафимовски), whose place on the square was not found. The church's second, smaller drum and the
   mosaic over the door are left out.

33. **v9.0.0** (Nov 2026, on `develop`): **034 Дојран** (`?city=dojran`), the ninth city:
   41.15–41.27 N, 22.66–22.82 E (13.4 × 13.3 km): the whole of Дојранско Езеро (OSM relation 4557289, 38.7 km²
   drawn; 43.1 km² on Wikidata), Стар Дојран and Нов Дојран on its west shore, Кале Тепе and the Salonica Front
   memorial above them, and the Greek shore with Дојрани (Δοϊράνη), as Ohrid includes the Albanian one. 2,588
   OSM buildings plus 3,318 Overture footprints; 10 m cells, elevation 130–702 m. Стар Дојран as an old-town box
   (low, tiled), `maxLevels: 6`. **The lake level is set by hand**: the DEM holds the lake at its low level of the
   drought years (139 m; EU-DEM agrees), but OSM's shoreline is today's larger lake, and the ground 10 m outside
   it is 145.5 m (median of 294 points). Flattened at 139 m, the beach stood as a 5–7 m cliff over the water. A new
   terrain setting, `waterLevels` (OSM id → metres), puts the lake at 144.5 m and lifts the shore within 20 m to
   just above it; cities without it are unchanged. Models (`src/dojran.ts`, after Commons photos of 2013–2025):
   the clock tower (restored 2021) and Св. Илија (1848, a stone basilica: one hipped tile roof, three polygonal
   apses with half-cones, a small corner tower) on their OSM outlines; a мандра (`modelRects.mandra`, not in OSM;
   the Ramsar sheet puts them on the west and north shores) off the pier north of Стар Дојран: reed fences on
   stakes, the pen split into chambers with a funnel and leading arms (after the Dojran museum's scale model), a
   reed hut on stilts with a deck, and a plank walkway that runs west until the ground rises out of the water.
   Snow label: the shared „Снег на ридовите“ (Беласица is outside the map). Tow banners: „Дојранското Езеро го
   спаси Дојран!“ / „Ајде на дојранска мандра!“.
   Checked: views rendered and looked at (the square and beach, the clock tower, Св. Илија, the мандра from the
   shore and from above, the lake view under the clouds, the overview); typecheck, build; Skopje pixel check (0
   except 11–16 pixels at the gondola cabins in the overview: the count changed with the time since load, and the
   spot lies on the cabin line); switching away and back (textures and scene objects equal, geometries +2). Not
   checked: phones, firefighting over the lake, the race, walking cards one by one. Not modelled: Споменик на
   Дојрана and the Salonica Front memorial (no photos looked at; labels only).

34. **v10.0.0** (Nov 2026, on `develop`): **02 Батинци** (`?city=batinci`), the tenth map: Батинци and its
   surroundings south of Skopje, 41.875–41.955 N, 21.385–21.545 E (13.3 × 8.9 km). Its north edge is Skopje's
   south edge, so nothing is drawn twice: Пинтија at the top, Драчево to the east, Марков манастир by Маркова
   Сушица to the west, Долно Количани to the south, the Маркова Река between them. Badge 02, the area's
   telephone code today (Skopje keeps the old 091). 5,485 OSM buildings plus 12,578 Overture footprints (the
   densest map after Skopje: 18,053 buildings, a 3.9 MB scene); 10 m cells, 224–837 m. One `mid` box over
   Драчево's blocks of flats, `maxLevels: 7`. No lake: the Маркова Река (OSM ways 182532170, 46033085) is widened
   with `waterLines` for refilling. Model (`src/batinci.ts`, after Commons photos of 2006–2014): Св. Димитрија of
   Марков манастир on its OSM outline with `byzChurch` (cloisonné, lead roofs, octagonal drum, open porch); OSM's
   outline of the whole monastery complex (177490047, `building=monastery`) drew a block over the church and is
   left out. The mosque „Султан Мехмед Освојувачот“ in Батинци is not modelled: OSM has no outline or name for it
   and the photo's position is in the street. Tow banners: „Маркова Река го спаси Батинци!“ / „Поздрав од
   Батинци!“.
   Checked: the monastery and the overview rendered and looked at, no console errors; typecheck, build; Skopje
   pixel check (0 except 11–13 pixels at the gondola cabins in the overview, as before). Not checked: phones,
   switching memory, firefighting over the river, the race, walking cards, the Драчево view.

35. **v11.0.0** (Nov 2026, the `city-berovo` branch): **033 Берово** (`?city=berovo`), the eleventh map: the
   Малешево basin, 41.650–41.778 N, 22.82–22.94 E (14.2 × 10 km): Берово, Ратево and Смојмирово, Пехчево and
   Чифлик to the north, the whole of Беровско Езеро (OSM way 37372709, 0.55 km²) with its dam, the Спиковски
   водопади. Badge 033 (like Македонска Каменица). 438 OSM buildings (the count query and Overture's skipped OSM
   outlines agree) plus 7,939 Overture footprints; 10 m cells, 806–1680 m. `mid` boxes round the square of
   Берово and the middle of Пехчево, `maxLevels: 6`. The lake is flat at 990 m (OSM's `ele`); the DEM has no
   gorge under the arch dam, so its foot is bent down to ≈ 958 m with `points` on the concave side, 24 m off
   the crest (radius 22, so the lake stays flat).
   Models (`src/berovo.ts`, after Commons photos and an Esri aerial image): Св. Архангел Михаил of the women's
   monastery (1815–1818: low stone church under one hipped roof over a deep wooden porch on carved posts, an
   apse), its bell tower (stone base, white shaft, open octagonal wooden belfry) at the north-west end of the
   konak, which OSM lacks and is added as an `extraBuildings` wing; Рождество на Пресвета Богородица on the
   square (white basilica, a tall clock tower with a small green dome); the concrete arch dam on OSM's crest
   line (way 606170062), with panel joints, railings, lamps and the keeper's house. The churches are OSM
   nodes only: their rectangles (`modelRects`) are read off the aerial image; the bell tower's place is a
   guess from one photo. The dam's crest is taken from the terrain's water level (`terrain.at()` is not
   metres above sea). Tow banners: „Беровско Езеро го спаси Берово!“ / „Поздрав од Малешево!“.
   Also: the badge codes of Битола, Охрид, Прилеп and Крушево changed to 097, 096, 098 and 098 at the
   owner's request (the entries above keep the codes they were released with); later Прилеп became 048. On
   2026-11-23 the owner chose old codes first ("Badge codes" in TOWNS_TODO.md): Прилеп 098, Крушево 048.
   Checked: the square, both churches, the dam from the gorge and the lake, Пехчево and the overview
   rendered and looked at, no console errors; typecheck, build; Skopje pixel check (0 over 2/255 on all 9
   renders); switching away and back (textures and scene objects equal, geometries +2). Not checked: phones,
   firefighting over the lake, the race, walking cards one by one, night and snow views. Not modelled:
   Пехчево's buildings (no photos looked at), the Спиковски водопади (a label only).

36. **v14.0.0** (Nov 2026, the `city-tetovo-brod-resen` branch): three maps at once, so the version goes from 11 to 14:
   **094 Тетово** (`?city=tetovo`), **045 Македонски Брод** (`?city=brod`) and **047 Ресен** (`?city=resen`),
   the first three of the towns plan (docs/TOWNS_TODO.md). Badge 094 was decided with the owner; 045 and 047 are the
   towns' telephone codes (the plan left them open: change them in `CITIES` if the owner wants others).
   - **The download came from Geofabrik, not Overpass.** On the day every Overpass server answered 502 / 504 or timed
     out (5 of Тетово's 42 tiles in 40 minutes). `scripts/pbf2overpass.py` (pyosmium, outside npm) builds the same
     `out geom` JSON from the Geofabrik extracts (Macedonia, plus Kosovo and Albania for Тетово, Albania and Greece
     for Ресен). Checked for Тетово: 3,538 building ways, 11 building relations and 8,074 roads, exactly the
     Overpass count query; every element of the five tiles Overpass did return is in it, the few differing
     geometries being edits newer than that mirror's snapshot.
   - **Тетово** (41.725–42.075 N, 20.72–21.06 E, 28 × 39 km, 20 m cells, 405–2715 m): Тетово, Гостивар, Вруток and
     the source of the Вардар, Попова Шапка, Титов Врв and the glacial lakes of Шар Планина; edge to edge with
     Ростуше (its north edge, 41.725 N); the plan's north edge 42.06 was moved to 42.075 so that Лешочки манастир
     (42.067 N) is inside. 3,539 OSM buildings plus 71,757 Overture footprints: **75,297 buildings, a 16 MB scene,
     the largest map by far** (Охрид: 42,826, 9.4 MB). It loaded in under 30 s on the desktop (1,131 chunks,
     683k trees); not tried on a phone. `mid` boxes over the middle of Тетово and of Гостивар, `maxLevels: 10`;
     eight churches and mosques and two petrol stations the zones made into towers are pinned low with
     `buildingTags`. No lake near the towns (the glacial lakes are small and 2 km up): the Вардар through Полог
     (way 907645304) is widened with `waterLines` for refilling.
     Models (`src/tetovo.ts`, after Commons photos): **Шарена џамија** on its OSM outline (painted panels and
     rosettes in two rows, grilled and arched windows, the porch on white columns, the wide hipped roof, the stone
     minaret with its balcony and dark pencil cone); **Gostivar's Саат-кула** (`modelRects`, OSM has only a node:
     the square stone base with corner pyramids, the octagonal shaft, the dark timber clock stage, the lantern);
     **Св. Атанасиј Велики** of Лешок (`byzChurch` in grey ashlar; a new `courses: false` option leaves out the brick
     courses, the other cities unchanged); **Тетовско Кале**: broken walls with arched niches and squat round towers
     along OSM's outline of the fortress. Tow banners: „Шар Планина го спаси Тетово!“ / „Поздрав од Полог!“.
   - **Македонски Брод** (41.45–41.926 N, 21.12–21.42 E, 25 × 53 km, 20 m cells, 315–2507 m): Брод and Пешна on the
     Треска, Зрзе monastery, the whole of Езеро Козјак and Акумулација Света Петка, Солунска Глава on Јакупица. The
     north edge stops at 41.926 N, where Езеро Матка begins (it goes on the widened Скопје map); the east edge
     (21.42, for Солунска Глава) overlaps Батинци's south-west corner a little (41.875–41.926 N, 21.385–21.42 E,
     mountains). 3,685 OSM buildings plus 12,394 Overture. Models (`src/brod.ts`): **Св. Преображение of Зрзе**
     (low stone church, hipped tile roof, apse, the small open timber belfry); **Света Петка's arch dam** on OSM's
     crest line with `archDam`, the Берово dam code moved into a function (Берово's geometry is the same, its call
     passes the keeper's house). The DEM has no gorge below that dam: `points` 25 m off the crest bend it ~30 m
     down. Козјак's rockfill dam is already in the DEM (lake 468 m, face down to ~385 m) and is not modelled; its
     view was dropped because a smooth slope does not read as a dam. The hills round Козјак are bare in OSM (few
     wood polygons), so the lake looks barer than in photos. Tow banners: „Козјак го спаси Брод!“ / „Поздрав од
     Порече!“.
   - **Ресен** (40.685–41.13 N, 20.845–21.165 E, 27 × 50 km, 20 m cells, 732–2218 m): Ресен, the whole of
     Преспанско Езеро with its Albanian and Greek shores, Голем Град, Курбиново, Мала Преспа with Свети Ахил; edge
     to edge with Охрид (its east edge) and Битола (its west edge). 3,908 OSM buildings plus 20,120 Overture.
     Like Дојран, **the lake level is set by hand**: flattened at its lowest DEM part (840.8 m) the beach stood a few
     metres over the water; the ground 20 m outside OSM's outline is 843.5 m (median of 452 points), so
     `waterLevels: { 2905510: 842.5 }`. Мала Преспа stays at its own 848 m. Models (`src/resen.ts`): **Ресенски
     сарај** on OSM's outline (two wings round a recess: yellow walls, white cornices and pilasters, tall windows,
     a mansard of dark tiles that follows the outline, the stone porch with its balcony and the tower with a glazed
     belvedere in the recess); **Св. Петар** on Голем Град and **Св. Ѓорѓи** in Курбиново (`byzChurch` without a
     drum). Tow banners: „Преспа го спаси Ресен!“ / „Поздрав од Преспа!“.
   - View azimuths, for the record: `az` turns the camera from south (0) toward east (π/2): `-π/2` puts it west of
     the target, looking east.
   Checked: every view of the three maps rendered and looked at (hidden pane, frames stepped by hand), no console
   errors; typecheck, build (the new files in `dist/`); Skopje pixel check (0 except 11–13 pixels at the gondola
   cabins in the three overviews); Берово's dam code compared line by line with the old block. Not checked:
   phones (Тетово's 75k buildings are the real question), firefighting, the races, walking cards one by one, night
   and snow views. Not modelled: Арабати Баба Теќе, the ski lifts of Попова Шапка (aerialways are not in the
   download), Пешна's cave mouth, Св. Ахил's basilica, Kurbinovo's frescoes (labels and cards only).
37. **v14.0.1** (Nov 2026): with 14 cities the city menu under the badge no longer fit a phone held sideways
   (its lower half was cut off). When it is taller than the space below the badge it now wraps into columns filled
   top to bottom (`fitCityMenu()` in `main.ts`, `.city-menu.cols`): as many as the height needs and the width allows,
   measured, then it scrolls. 3 columns at 844 × 390, 2 scrolling at 640 × 300, desktop unchanged. The picker's order
   follows the map: Берово, Тетово, Ресен, Брод, Каменица, Батинци. The towns map (docs/towns-map.png) is drawn by
   `scripts/towns-map.html` from the zones in `src/zones.ts`.
38. **02 Матка** (Nov 2026, branch `city-matka`, not yet released): the land west of Скопје between Тетово's and Брод's
   maps (docs/TOWNS_TODO.md, 20): the Матка canyon with its lake and dam, Св. Андреја, Св. Никола Шишевски, the
   Матка monastery, Пештера Врело, Сарај's villages, Сува Гора, Езеро Треска. **The first map that is not a rectangle**:
   its bounding rectangle (41.725–42.075 N, 21.06–21.385 E, 27 × 39 km, 20 m cells, 249–2448 m) holds Скопје's west
   edge (and the strip above it, Скопска Црна Гора's) and Брод's north part, so the city has a `cut` list in
   `scripts/config.ts`. `cutOsm()` (`scripts/osm.ts`) takes them out of the raw OSM for both `prepare.ts` and
   `terrain.ts`: nodes and buildings with a corner inside are dropped, lines split at the edge (Liang–Barsky), areas
   and multipolygon rings clipped to the four convex regions round each rectangle (Sutherland–Hodgman; pieces after
   the first get ids + k·1e12); Overture outlines with a corner inside are left out; `download.ts` skips tiles wholly
   inside a cut. The terrain stays the full rectangle, so the corners show bare relief. Checked: no building, area,
   road or rail of the scene inside a cut; Батинци's scene rebuilt byte-identical (no cut, no change). Raw OSM from
   Geofabrik (`pbf2overpass.py`, Macedonia + Kosovo; Overpass answered 502/504): 7,298 features dropped and 356
   clipped; ~1,000 OSM buildings plus 24,683 Overture. **`waterPad`** (new terrain option, 30 m here): Езеро Матка
   is only 100–200 m wide, a few 20 m cells, and its draped edge climbed the canyon walls in blue facets; higher
   ground within 30 m of a flat lake (not river surfaces) is now lowered to just above the water. `relationTags`
   (new in `PREP`): tags for building multipolygons — the hotel „Кањон Матка“ by the dam was guessed at 4 storeys,
   now 2. Models (`src/matka.ts`, after Commons photos): **Св. Андреја** (1388/89, `byzChurch`, cloisonné, grey
   metal roofs, tall octagonal drum), **Св. Никола Шишевски** (`byzChurch` with a long lower part under stone slabs;
   which end carries the drum was not checked), **Брана Матка** (1938, 29.5 m) with `archDam` on OSM's crest line.
   Badge 02 (as Батинци) and the owner's LinkedIn, both asked. Tow banners: „Треска ја спаси Матка!“ / „Поздрав од
   Матка!“. Texts in `src/i18n-towns3.ts`. Checked: typecheck, build, the map loads with no console errors, both
   cut edges and the dam, Св. Андреја, Шишево and the overview looked at, switching away and back (textures and
   scene objects back exactly), Skopje pixel check (0 except 11–13 pixels at the gondola cabins in the three
   overviews). Not checked: phones, firefighting, the race, walking cards one by one, night and snow views.
   Not modelled: the Матка monastery and Св. Ѓорѓија in Кучково (labels and cards only).
39. **046 Вевчани** (Nov 2026, branch `city-vevcani`, not yet released): Дримкол north and west of Охрид's map (docs/
   TOWNS_TODO.md, 12): Вевчани with its springs, Лабуништа, Подгорци, Белица, Требеништа, the Јабланица ridge, Езеро
   Глобочица. The second map on an outline: its bounding rectangle (41.035–41.39 N, 20.47–20.815 E, 29 × 40 km,
   20 m cells, 418–2216 m) with six `cut` rectangles, Охрид's map and the five steps of the west edge that the plan
   draws ~2 km past the OSM border. Raw OSM from Geofabrik (Macedonia + Albania extracts): 16,228 features dropped,
   292 clipped; 19,988 Overture outlines; nothing of the scene inside a cut (checked). Models (`src/vevcani.ts`, after
   Commons photos): **Св. Никола** on OSM's untagged 34 × 13 m outline (the photos' GPS 20 m from it: a grey ashlar
   basilica under a hipped tile roof, the bell tower with an open brick belfry, the white two-storey annex; which
   end is the church was not checked); four **wooden footbridges** over the Вевчанска below the springs
   (`modelRects` along OSM's river line; the river widened into water with `waterLines`). **Model keys are shared
   across cities**: the first key, `nikola`, also drew Ростуше's Св. Никола of Маврово (an apse and windows) on
   Вевчани's outline; renamed `vvnikola` (Матка's keys checked: no clash). In the city menu right after Македонска
   Каменица (the owner). Badge 046 and the owner's LinkedIn, both asked. Tow banners: „Изворите го спасија
   Вевчани!“ / „Поздрав од Вевчани!“. Checked: typecheck, build, the map loads with no console errors, Св. Никола and
   the footbridges looked at, the overview, Skopje pixel check (0 on all nine views). Not checked: phones,
   firefighting, the race, walking cards one by one, night and snow views.
40. **v26.0.0** (2026-11-23, branch `f15`): **the F-15 Eagle and flying from map to map** (the plan in
   [IDEAS.md](IDEAS.md), with the owner's additions while it was built). The version jumps by ten majors at the
   owner's wish. Everything is in "F-15 and flying from map to map" below. In short: load times measured on every
   map; the F-15 in free flight (1325 / 2650 km/h, rockets, heat shimmer, sonic boom, contrails, afterburner kick,
   ejection by parachute into walk mode); Ctrl slows either plane to a quarter of its top speed; the country's 100 m
   terrain drawn round the map while it flies; the next map downloaded ahead and switched at the edge while the jet
   flies on over the country; a radar of Macedonia (desktop); the F-15 tile beside Macedonia in the city menu;
   FPS in the window's title (a switch turns it off). Skopje pixel-identical (checked after every rendering change:
   0 except 1–4 pixels at the gondola cabins in the overviews). Not checked: phones and tablets, the live site's
   download times.
41. **v26.0.1** (2026-11-24): in F-15 mode the coarse country terrain covered the higher maps (Охрид, Ростуше,
   Вевчани, Берово, Прилеп, Крушево, Битола, Ресен …). A map's terrain stores its heights above its own lowest point
   (`min` in `*-terrain.json`), the country grid above the sea, so the country stood `min` too high (Охрид 686 m).
   `countryground.ts` now subtracts the map's `min`; measured on all 16 maps, the two agree (0 m on average, ±22 m at
   worst), and inside the map the country sinks at least 25 m. The firefighting plane never drew it, so it looked
   fine there.
42. **v26.0.2** (2026-11-24): flying from map to map, while the next map builds the old one is gone but its
   country ground still sank 25–425 m where it had been: a pit beside the jet, and under it for the whole build when
   the next map lies inside the old one's rectangle (Матка → Скопје / Брод, Вевчани → Охрид). The transit's ground no
   longer sinks (`setSink(false)` in `countryground.ts`). Checked Брод → Матка → Тетово → Ростуше and Матка → Скопје;
   after every arrival the heights agree (0–1 m). New-town guide: the F-15 steps (`zones.ts`, the F-15 check).
43. **v26.0.3** (2026-11-24): flying from map to map, the next map shows when the loader closes (the warm-up after
   the build took 2.2 s for Ростуше's ~9,600 pieces, now 0.14 s, and the loader stays until the map shows). On phones
   (reported by the owner from a phone): Тетово (21.5 MB, over the 20 MB phone budget) never loaded and was
   downloaded again and again, now it loads from the network at the switch; with the memory saver the ground round
   the entry is built before the map shows. Checked with phone emulation: Брод → Матка → Тетово → Ростуше.
44. **0903 Кочани** (Nov 2026, branch `city-kocani`, released in v32.0.0; first of the build order, smallest first): Кочани
   and Кочанско Поле (docs/TOWNS_TODO.md, 23): box 41.80–41.945 N, 22.32–22.46 E (11.6 × 16.1 km, 20 m cells,
   296–1628 m; Плачковица at the south edge), a plain rectangle edge to edge with the planned Штип, Виница, Радовиш and
   Пробиштип maps. Raw OSM from Geofabrik's Macedonia extract (`scripts/pbf2overpass.py`; Overpass answered 406 to a
   probe): 2,907 buildings and 1,864 roads, exactly the counts of an Overpass count query on maps.mail.ru. Overture adds
   **nothing** here (all 2,906 of its outlines are OSM's own), so no `overture` file and no Overture credit. Scene: 2,902
   buildings, 1.3 MB; a `mid` zone over the centre (78 blocks of 9 storeys; the market, two sports halls, МКЦ, the
   culture centre, the police station and Ловен дом pinned with `buildingTags`). **No lake on the map:** Кочанско Езеро
   (Брана Гратче, 41.959–41.967 N) lies 1.5 km north of the box, on Пробиштип's planned map; the Брегалница is widened
   with `waterLines` (half width 10 m) for refilling. **Rice paddies** (new, `rice` in `CITIES` → `RICE_GROUND` in
   `src/city.ts`): on the farmland (`vineyards: 260`, `vineShare: 0.06`) the plots under 40 m above the map's lowest
   point (the plain along the Брегалница, wobbled by noise) are paddies with a share of 0.8: basins 20–40 m behind thin
   bunds, green in summer, flooded with seedlings in spring, golden in autumn, muddy in winter. The snippet is compiled
   only into a city with rice (its own program cache keys), so Кавадарци's, Битола's and Прилеп's ground shaders are
   unchanged. Models (`src/kocani.ts`, after Commons photos; references only): **Средновековна кула** (west bank,
   18.5 m and restored per Wikipedia: rubble stone with dressed quoins, flat slab cap, round openings, barred window,
   machicolation, the wooden balcony, the stepped stair at the foot; which faces carry the balcony and the stair was
   not checked against an aerial image), **Саат-кула** (east bank, mk Wikipedia: the ruin with the clock's whitewashed
   brick drum and four posts on its slab), **Споменик на слободата** on Локубија (Чемерски / Раѓеновиќ, 1977/1981,
   spomenikdatabase.org: the curved wall round a small amphitheatre with drawn mosaics on both faces and a ragged mosaic
   crest, end posts, two pylons with low walls, steps; OSM has only the whole site's 46 × 43 m outline, so the wall's
   place in it and its turn (convex side south) are guesses). Labels only: Св. Ѓорѓи, Св. Преображение, Џамија Дуди
   Ханум, Манастир Добра Вода, Мородвис. Badge 0903 (the bold one in the Badge codes table) and the owner's LinkedIn as
   for Матка and Вевчани; tow banners „Брегалница го спаси Кочани!“ / „Свири, Кочани оркестар!“; snow label „Снег на
   Плачковица“ (the range inside the map). In the city menu right after Македонска Каменица. Checked: typecheck, build
   (the files in `dist/`), the map loads with no console errors, the views (the two towers, the monument, the rice
   fields in summer, spring and autumn, the overview), labels, a walking info card (the western tower), switching away
   and back (textures 213 → 213, scene objects 21 → 21, geometries ±2), the F-15 over the map (country vs map heights:
   mean 0, max 12 m), Skopje pixel check (0 on six views, 13–14 pixels on the three overviews: the gondola cabins). Not
   checked: flying in from a neighbouring map (none of its neighbours is built yet), phones, firefighting and the race,
   night and snow views, the other walking cards one by one. Seen: on 20 m cells `farmMask` also paints a few open lots
   in the town (one next to the Саат-кула), as on the other 20 m maps.
45. **047 Меџитлија** (Nov 2026, branch `city-medzitlija`, released in v32.0.0; second of the build order): southern Пелагонија
   under Битола's map down past the Greek border (docs/TOWNS_TODO.md, 17): box 40.85–40.955 N, 21.165–21.47 E (11.7 ×
   25.7 km, 20 m cells, 532–2347 m; Баба's southern ridges in the west), a plain rectangle edge to edge with Битола (n),
   Ресен (w) and the planned Новаци (e). **The plan's e edge (21.40) left Меџитлија itself (21.429), its border crossing
   (21.417) and Кременица (21.458) outside**: the box was widened to 21.47, the strip 40.85–40.955 N, 21.40–21.47 E cut out
   of Новаци's planned box (`CUTS` in `src/zones.ts`). Raw OSM from Overpass this time (overpass-api.de answered after a
   few 502s; 18 tiles): 999 buildings and 1,003 roads, exactly the count query; the Greek half comes with it (Geofabrik's
   Macedonia extract has none of it). Overture adds 3,995 outlines (Меџитлија's village is nearly empty in OSM), so the
   Overture credit is on. Scene: 4,966 buildings, 1.3 MB, no height zones (`maxLevels: 4`). Farmland painted like Битола's
   (`vineyards: 300`, `vineShare: 0.08`). Refilling over the fish ponds by Жабени at the north edge (three OSM ponds of
   33–55 ha). Models (`src/medzitlija.ts`, after Commons photos of 2014–2023 and Esri's aerial image; references only):
   **the mosque of Меџитлија** (`modelRects.mzdzamija`, OSM lacks it: hall with three arched windows a side, copper dome
   on a low drum, porch of three arches with a small dome, the white minaret with its balcony and silver cone; rectangle and
   turn read off the aerial image, dome toward the qibla), **the border crossing's canopies** (`mzgranica`: the Macedonian
   side, 84 × 54 m, ribbed grey roof over the lanes, booths, the offices along its east edge; `mzgrcka`: the Greek side 450 m
   south, three dark blue bays; from the aerial image only, heights and columns guessed), **Велушки манастир** on OSM's
   outlines (1839, rebuilt after the First World War, mk Wikipedia: the church Св. Ѓорѓи, white on a stone plinth under a
   hipped tile roof, round-arched windows, an apse; its bell tower north-west of it, not in OSM, placed by a shadow on the
   aerial image; the konak south of it with the gate passage and the white piers and wooden gallery on the court side).
   Labels only: Св. Атанасиј and the railway station in Кременица, Барешански манастир, Остречка џамија, Св. Илија
   (Драгош), Коле Канински's monument in Породин, Вирој. Greek villages are labelled by their Macedonian names from OSM's
   `name:mk` (Негочани, Клабучишта, Света Петка, Опсирино, Раково, Битуша, Горно / Долно Каленик), as Дојран's Дојрани.
   Badge 047 (the Badge codes table) and the owner's LinkedIn; tow banners „Пелагонија е спасена!“ / „Поздрав од
   Пелагонија!“; snow label „Снег на Баба“ (Ресен's). In the city menu right after Кочани. Checked: typecheck, build (the
   files in `dist/`), the map loads with no console errors, the views (the village, the mosque, both canopies, the
   monastery, the plain, the overview), switching away and back (textures 318 → 318, scene objects 21 → 21, geometries
   +2), the F-15 over the map (country vs map heights: mean 0, max 11 m), **flying the F-15 from Битола into Меџитлија
   and back** (switched at the edge both ways; after arriving the heights agree, mean 0, ±12 m; at the Greek edge it
   turns back), Skopje pixel check (0 on six views, 13–14 pixels on the three overviews: the gondola cabins). The pane was
   hidden, so the pixel check ran with a frame pump: `requestAnimationFrame` queued and `performance.now` faked, the
   script's `frames()` and the 1.7 s waits replaced by pumped frames, `img.decode()` by `onload` (with timer frames at 1–2
   FPS the same code compared against itself differed on every pixel; pumped, it matches). Not checked: flying in from
   Ресен, phones, firefighting and the race, night and snow views, the walking cards one by one.
46. **031 Кратово** (Nov 2026, branch `city-kratovo`, released in v32.0.0; built out of order, 16th in the build order; the
   first map by the third developer, **Бранко Славков**, `linkedin.com/in/slavkovbranko`): the town in its volcanic crater and
   its surroundings (docs/TOWNS_TODO.md, 2): box 42.04–42.36 N, 22.045–22.495 E (35.6 × 37.1 km, 20 m cells, 383–2076 m), an
   L: Крива Паланка's planned corner (42.125–42.36 N, 22.25–22.495 E) is `cut`. **Widened west from 22.062 to 22.045** so
   that the Камени Кукли (22.055) are on it; Куманово's planned outline moved with it. Overpass was at capacity all morning
   (no tile in 15 minutes), so the raw file came from Geofabrik's Macedonia + Serbia extracts (`scripts/pbf2overpass.py`):
   5,556 buildings, 2,961 roads before the cut (a count query never got through, so not cross-checked against Overpass).
   **Overture adds nothing** here (0 outlines; 6,428 of its outlines are OSM's own), so no Overture credit. Scene: 2,630
   buildings after the cut, 2.3 MB; the old town as an `old` box, no height zones (a `mid` zone over the centre made the old
   town 6-storey blocks), `maxLevels: 5`, the three churches pinned low. Farmland painted on Славиште's plain (`vineyards: 200`,
   `vineShare: 0.05`). Refilling over Кнежевско Езеро (69 ha). Models (`src/kratovo.ts`, after mk Wikipedia's descriptions,
   no photos looked at): **the six towers** on OSM's outlines (narrowed to the published widths where Wikipedia gives them:
   Симиќева 7.9 m and 22 m with its two chimneys, Златковичева 14.15 m, Крстева 16.1 m; Хаџикостова 14 m and Емин-бегова 13 m
   guessed; the Саат-кула 15.5 m guessed, its чардак placed on the south side by guess), **seven stone bridges** on OSM's
   `man_made=bridge` outlines (one arch, a humped deck kept ~4 m over the river since the 20 m terrain hardly cuts it,
   parapets with copings; Нов Мост, the modern one, left out; Радин мост's towers not modelled), **the earth pyramids of
   Куклица** (15 large up to 10 m, ~80 small up to 5 m with twins at the foot, seeded inside OSM's site outline, not at
   their real places). Badge 031 (shared with Крива Паланка, the Badge codes table); tow banners „Кратово е спасено!“ /
   „Поздрав од кратерот!“; snow label „Снег на Осогово“ (Каменица's). The developers' ▼ menu now lists three (031 Бранко
   Славков), the LinkedIn button on this map names him, and the help footer credits him in all six languages (Slovene
   „Izdelala“ → „Izdelali“ for three). Checked: typecheck, build (the files in `dist/`), the map loads with no console
   errors, the views (towers, bridges, Радин мост, Камени Кукли, the square, the lake, the overview), switching Кратово →
   Скопје → Кратово → Кочани → Кратово (textures 1377 → 1377, scene objects 21 → 21, geometries +2 per return: streamed
   ground), the F-15 over the map (country vs map heights: mean 0, −8…+39 m on Осогово's slopes), Skopje pixel check (0 on
   six views, 12–13 pixels on the three overviews: the gondola cabins), screenshots with `scripts/browser/shot-sink.ts`
   (the pane gave no screenshot frames). Seen: white spikes of draped road along Кнежевско Езеро's steep shore (`waterPad`
   on 20 m cells, as in Матка). Not checked: flying in from Каменица or Кочани, phones, firefighting and the race, night and
   snow views, the walking cards one by one, the towers and bridges against photos.
   Added after the developer tried it: **Хотел Кратис** (OSM's 5-storey outline, label and walking card) and **Ѕингова куќа**
   (label and walking card at the developer's point 42.079194, 22.172667; OSM has no name there, the nearest outline, way
   1069222099, is ~10 m off). Кратово is also called „Ѕинго Land“: in the town's card and the roll banner „Поздрав од Ѕинго
   Land!“ (Latin texts write Dzingo).
   Then, at the developer's request: the map is named **„Кратово – Ѕинго Land“** (badge and tab title; the zone stays
   „Кратово“). **Хотел Кратис** modelled after the hotel's own front photo (hotelkratis.mk, a reference only): tan stone
   podium with white pilasters over OSM's outline, the roof terrace with railing, wooden posts and a white sail awning,
   the three-bay block of a white concrete frame with tan stone panels, a white cornice, a dark mansard with dormers, the
   wine-red board over the entrance; the block's depth and place on the podium are guessed. **Ѕинговата куќа** moved to
   the building the developer pointed at (way 1069089773, next to the point) and modelled as an old Кратово house (stone
   ground floor, white overhanging upper floor on brackets, timber, shutters, wide-eaved tile roof) with a mural drawn on
   a canvas on its west wall (vez border, miner's helmet and lamp for „Силекс“, a football for the federation,
   „ЅИНГО LAND“). Its card gives Љубисав Иванов – Ѕинго's facts from mk Wikipedia (1936–2020, Трновац; „Силекс“ over 40
   years; SPM president; MP to 2011; first president of the Football Federation 1993–1996). **The joke**: „ЅИНГО LAND“
   on **Баба's north face** (first put on the gentler north slope, out of the default view): the terrain round the square
   was sampled for the slope most seen from the town (height above the square, steepness toward it, line of sight, no
   buildings) and Баба won, ~200 m above the square and 770 m south of it, ~27° steep, like Mount Lee over Los Angeles.
   Solid white sheet letters ~14 m tall (rounded Ѕ and О), leaning back 11° on grey steel scaffolding, mirrored along the
   frame so they read from the north (`modelRects.krsign`, 140 × 70 m: a clearing in the forest round them), with its own
   card saying it is not real. New views: Хотел Кратис, Ѕингова куќа, ЅИНГО LAND.
   **The second joke**, from the developer (people say that in 1995 Кратово looked like a country of its own, Ѕинго
   with his own money): **the border crossing into Ѕинго Land** on the R1205 into town, 1.3 km from the square on a
   straight stretch with no houses (`modelRects.krgranica`): a canopy over the road with „ЅИНГО LAND“ on both fascias,
   the customs booth, a red and white barrier, the land's flag (wine field, gold miner's helmet, gold Ѕ; two one-sided
   cloths so it reads from both sides), an exchange office „МЕНУВАЧНИЦА 1 ЅИНГО = 1 ЅИНГО“ and a board „ДОБРЕДОЈДОВТЕ ВО
   ЅИНГО LAND — ПАСОШ НЕ Е ПОТРЕБЕН“; its card says „велат“ and calls it this map's joke. **Rivers**: OSM has Крива Река,
   Злетовица, the Кратовска Река outside the centre and the smaller rivers only as lines (cut into the terrain, no water):
   now `waterLines` (14 ways, 1.5–6 m half width). `waterLines` also takes the pieces of a way split by a cut rectangle
   (id + k·1e12); other cities have no split pieces, so their scenes do not change. **The town's Olympic pool**, which mk
   Wikipedia says belongs to АД РИК „Силекс“ (Ѕинго's mine), on OSM's site outline (`leisure=water_park`, ~120 × 50 m):
   a 50 m eight-lane pool with lane ropes and starting blocks, a children's pool, a tiled deck on a stone terrace where the
   slope falls away, a fence, changing rooms, loungers and umbrellas, and at the gate „БАЗЕН · СОПСТВЕНОСТ НА ЅИНГО LAND“
   between two of the land's flags; the layout is drawn, not surveyed.
   **Walking as Ѕинго** (`walker: 'singo'`, `buildSingo()` in `src/walk.ts`, the Пејо rig), after two portraits the
   developer gave (references only, not in the repo): a heavy-set older man in a dark green suit, light blue shirt and a
   tie striped red, white and black; bald on top with short grey hair over the ears and round the back (the fringe's
   sphere segment leaves the face open: three.js puts phi = π at +x), a broad face with jowls, greying brows, and his
   smile: a grin curving up at the corners with a crescent of teeth, round rosy cheeks, the eyes narrowed. Label
   „🪖 Ѕинго“ (Latin: Dzingo); his action is Пејо's. (A first version wore the yellow helmet of „Силекс“ and glasses.)

47. **043 Неготино** (Nov 2026, branch `negotino` off `develop`, released in v32.0.0; 5th in the build order; developer
   **Ристе Самарџиев**, as for Кавадарци): the town on the Вардар and the middle Повардарие (docs/TOWNS_TODO.md, 5): box
   41.445–41.60 N, 22.062–22.32 E as planned (21.5 × 17.3 km, 20 m cells, 100–1142 m), edge to edge with Кавадарци (w).
   Overpass answered only count queries (504 on the rest), so the raw file came from Geofabrik's Macedonia extract
   (`scripts/pbf2overpass.py`): **204 buildings and 776 roads, the same as an Overpass count query**. OSM is thin here
   (204 buildings for a town of 13,000): **Overture adds 5,072 outlines** (credited in the bar and the help). Terrain checked
   against EU-DEM at 100 points (opentopodata): mean −0.4 m, RMS 0.8 m, max 5.3 m. Scene 1.2 MB, 5,270 buildings; a `mid`
   zone over the centre, `maxLevels: 8`; pinned after photos of 2013–2015: the town hall (a brick block, ground + 5), the
   Дом на култура „Ацо Ѓорчев“ (2 storeys), the post office, school, hospital, the monastery's konaks, farm sheds; the three
   „Negotinki“ blocks of flats stay at the zone's 8 storeys (not checked). Farmland painted up to 420 m (`vineyards`, the
   default vine share). The Вардар is a water area in OSM here (up to 0.6 km² a stretch): refilling over it with the shared
   „Наполни вода од Вардар“. Models (`src/negotino.ts`, after Commons photos, references only): **Неготински манастир Св.
   Ѓорѓи** on its outline (white nave, low grey metal roof, three drums with dark domes and red pilasters, the tiled porch on
   the south, the apse) and **its bell tower** on OSM's small outline (stone panels in white frames, red brick arches);
   **Св. Атанасиј Велики** (ochre basilica, brick-framed arched windows, hipped tile roof, lower narthex, the bell tower at
   the south-west corner on Партизанска, where the photo shows it); **ТЕЦ Неготино's chimney** at OSM's node
   (`modelRects.ngoxak`): no published height was found, **~125 m estimated** from two geotagged Commons photos with EXIF
   focal lengths (122 m from 370 m away, ~135 m from the Вардар bridge 1 km away, measured to the horizon) and its ~10 m
   foot; red and white bands over the top quarter, three galleries; **the three fuel tanks** on OSM's outlines (45 m
   across, 15 m read off the photos). The old Саат-кула (a ruin on Commons) is not in OSM and was not placed. Badge 043
   (shared with Кавадарци); the LinkedIn button names Ристе; the help footer now reads „(Кавадарци, Неготино)“ in all six
   languages; tab icon a grape bunch with a vine leaf over the Вардар's waves (drawn, not the town's arms); tow banners
   „Неготино е спасено!“ / „Поздрав од Повардарие!“; walker Кавадарци's man in a suit (`suit`, the developer's choice). Info cards from mk Wikipedia (Неготино, Неготински
   манастир, ТЕЦ „Неготино“; the plant's year and size also on no Wikipedia). Checked: typecheck, build (the files in
   `dist/`), strings, the map loads with no console errors, the views (square, Св. Атанасиј, the monastery, ТЕЦ, Вардар,
   overview), night, the places menu and the help, switching Неготино → Скопје → Неготино → Кавадарци → Неготино (textures
   403 → 403, scene objects 21 → 21, geometries 54 → 56: streamed ground), the F-15 over the map (country vs map heights:
   mean 0, max 11 m), Skopje pixel check (0 on six views, 13–17 pixels on the three overviews: the gondola cabins). Not
   checked: flying in from Кавадарци, phones, firefighting and the race, rain and snow, the walking cards one by one.

48. **043 Демир Капија** (Nov 2026, branch `demirkapija`, released in v32.0.0; 20th in the build order, built out of order;
   developer **Ристе Самарџиев**, the LinkedIn button on this map names him): the town at the mouth of the Демиркаписка
   Клисура and its wine country (docs/TOWNS_TODO.md, 31): box 41.10–41.445 N, 22.062–22.32 E (21.6 × 38.4 km, 20 m cells,
   86–2165 m), edge to edge with Кавадарци (w), Неготино (n), Валандово and Гевгелија (e), down past Кожуф's ridge into
   Greece. Overpass gave 502/504 all afternoon, so the raw file came from Geofabrik's Macedonia extract
   (`scripts/pbf2overpass.py`): 602 buildings, 877 roads; **the strip south of the border has no OSM** (Greece's extract,
   ~340 MB, not fetched; one Overpass try for 41.10–41.175 N failed), only Overture's outlines there. Overture adds 5,561
   outlines (Microsoft ML; 726 of its outlines are OSM's own). Scene 1.8 MB, 6,159 buildings; a small `mid` zone over the
   centre, `maxLevels: 5`. Farmland painted as vineyards almost everywhere it is gentle and low (`vineyards: 650`,
   `vineShare: 0.8`). Refilling over the Вардар's riverbank areas (1.2 and 0.6 km²; the Tetovo refill text „Наполни вода од
   Вардар“ reused). Snow label „Снег на Кожуф“; tow banners „Вардар ја спаси Демир Капија!“ / „На здравје од Демир Капија!“.
   **The wineries, researched:** Попова Кула (winery from 2004, hotel and restaurant 2009, 33 rooms, the 17 m tower with the
   tasting room, named after the old Попова Кула on the Roman road, known for Станушина; kajak.mk, panacomp.net,
   popovakula.com.mk), Кралска винарија Кралица Марија (King Aleksandar's estate of ~2,700 ha bought in 1928, first harvest
   1928, the queen's villa, she visited in 1934, four Austrian glass vats and Serbian oak barrels never moved, today private
   with ~7 million litres; wineryqueenmaria.com, vinotika.mk, Tikveš Wine Route; Еленов's „Вила Марија“ / „Шато Демир Капија“
   wines came from the same historic cellar until 2016, the sources do not say clearly how the two names relate, so the
   cards name only Кралица Марија), Грков in Крњево (from 2004, ~550 m, the first organic wine in Macedonia in 2007;
   kajak.mk, travel2macedonia, myguidemacedonia), and the Музеј на виното in town (OSM; label and card only). Imako, often
   listed with them, is by Штип, not here. **Хотел Вердисо** (14 rooms, spa, restaurant for 350, pool; kajak.mk and booking
   pages; verdisso.mk did not resolve). Models (`src/demirkapija.ts`): **Попова Кула** after Commons photos (2010–2015) on
   OSM's hotel outline, laid out from the aerial image in a frame along the wings (the tower where the outline steps between
   the arcade wing and the white wing; the main block behind the arcade wing is a guess), the lawn in front as a
   `modelRect` with cypresses and parasols instead of generated forest; **Хотел Вердисо** on OSM's outline, from the aerial
   image and the booking descriptions only (no outside photo found: walls, balconies and the glazed terrace are guessed, the
   dark roofs and the pool's place are from the aerial image); at Кралица Марија, all `modelRects` read off the aerial image:
   **Вила Марија** after a Commons photo of 2014 (ochre walls, rusticated plinth, paired arched windows, the loggia and the
   terracotta caryatids „момичките“; its grey hip roof from the aerial image; the loggia's place at the south-east end is a
   guess), the park's trees round it, **three peacocks** (one with its tail fanned), the **U of the old royal cellar**, the
   **two tiled halls with three rows of steel tanks** between them, the **amphitheatre**. Badge 043 (Кавадарци's group, the
   Badge codes table). Checked: typecheck, build, the map loads in ~3.5 s with no console errors (headless Chromium driven
   by Playwright, `--use-angle=metal`; the Chrome extension was not connected), the views (centre, Попова Кула, Вила Марија,
   Кралица Марија, Вердисо, the gorge, Кожуф, the overview), switching Демир Капија → Скопје → Демир Капија → Кавадарци →
   Демир Капија (textures 865 → 865, scene objects 21 → 21, geometries +2 per return, the same on Кочани: streamed ground),
   the F-15 over the map (country vs map heights: mean 0, max 11 m), Skopje pixel check (0 on six views, 12–13 pixels on the
   three overviews: the gondola cabins). Not checked: flying in from Кавадарци or Неготино, phones, firefighting and the
   race, night and snow views, walking and the cards one by one, the Kožuf ski runs (not drawn).

49. **v32.0.0** (2026-11-24): the maps built since v26.0.3 released together (23 maps in all): 0903 Кочани, 047 Меџитлија,
   031 Кратово (Бранко Славков), 092 Штип and 0902 Струмица (Калина Јовановска), 043 Неготино and Демир Капија (Ристе
   Самарџиев; both rebased on Штип and Струмица, their texts moved to `i18n-towns8.ts` / `i18n-towns9.ts`).

50. **092 Штип** (Nov 2026, merged into `develop` by its developer, released in v32.0.0; 19th in the build order, built out of
   order; developer **Калина Јовановска**, the LinkedIn button on this map names her): the town on the Брегалница under
   Исар (docs/TOWNS_TODO.md, 3): box 41.60–41.945 N, 22.062–22.32 E, 20 m cells, 195–900 m. Overpass gave only cut-off
   answers, so the raw file came from Geofabrik's extract (`scripts/pbf2overpass.py`): 4,580 buildings, 3,448 roads, no
   Overture. Blocks of flats raised round the centre, the old čaršija under Исар left low; shops, halls, churches and the
   Кадин Ана mosque pinned to their storeys. Scene 2.0 MB. Views Исар, Безистен, Ново Село, Баргала, the Брегалница; a
   14-ring race from Исар to Клисебаир; walking cards; texts in `i18n-towns6.ts`; refilling over the widened Брегалница;
   farmland up to ~500 m painted as fields with some vineyards (`vineyards: 300`). No hand-built models yet. The docs were
   not part of its merge: written up afterwards from its commits.
51. **0902 Струмица** (Nov 2026, merged into `develop` by its developer, released in v32.0.0; 14th in the build order;
   developer **Калина Јовановска**): the town under Царевите кули and Струмичко Поле (docs/TOWNS_TODO.md, 4): box
   41.38–41.60 N, 22.32–22.66 E, 20 m cells, 77–1136 m. Raw file from Geofabrik's extract: OSM has only 605 buildings and
   1,974 roads, Overture adds 21,066 outlines (exactly the 605 OSM ones skipped). Scene 5.5 MB. Blocks of flats raised
   round the centre; public buildings, a cinema, petrol stations, two churches and Орта џамија pinned to their storeys.
   Views Цареви Кули, Водоча, Вељуса, Водочко Езеро, Струмичко Поле; a 14-ring race from Цареви Кули to Раборци; walking
   cards; texts in `i18n-towns7.ts`; refilling over Водочко Езеро and Мантово; `vineyards: 330`. No hand-built models yet
   (Царевите кули, Водоча and Вељуса are views and labels only). Docs written up afterwards from its commits.

## Country view (Nov 2026)

- **What:** Macedonia, first in the city menu (a tile as tall as four cities, `.country-tile`), shows the whole country with every map's zone (`src/zones.ts`,
  the same list as `scripts/towns-map.html`): finished maps solid with their badge (a click opens the city), planned
  ones dashed, their names with "наскоро" when zoomed in. Escape or ✕ goes back to the map.
- **Data:** `public/country.png` (4.4 MB) + `country.json`, written by `npm run country` (`scripts/country.ts`):
  a 2251 × 2004 grid at 100 m over 40.62–42.42 N, 20.40–23.10 E. One RGB PNG: R, G the height in whole metres above
  `min` (metres, not decimetres: 4.4 instead of 6.9 MB); B the land cover class + 128 inside the border. Heights from
  Terrarium zoom 11 (224 tiles, the average of four samples per cell), lakes flattened at their 20th-percentile
  height. Land cover and the border from `data/country_cover.json`, made by `scripts/country_cover.py` (pyosmium,
  Geofabrik's Macedonia extract, so no land cover outside the border; the neighbours are drawn pale anyway).
- **Drawing:** its own scene, camera and controls; `renderCountry()` in `main.ts` draws it through the same
  `InkRenderer` with the city's cloud shadows off, its clipping planes off and the haze scaled to the camera
  distance, and puts them back after. Relief exaggerated 2.6×, 1 scene unit = 20 m, a grid mesh of every 3rd cell
  (phones every 4th), vertex colours in the cities' palette; zones and border are a canvas texture (3072 px, phones
  2048), the hover a zone-id texture. Picking marches the ray over the height grid (no triangle raycast).
- **Memory:** the data is loaded once (`loadCountry()` caches it) and stays for the visit, across city switches;
  the F-15 reuses it (the country round the map, the radar); the built view stays too. The city stays built underneath while the view is open.
- **Measured** (M5 Pro, 1024×768 window, 1536×1152 render): opening from a warm cache 0.19 s including decoding and
  building; ~3 ms GPU per frame once warmed up, and nothing is drawn once the frame has converged. Skopje after
  opening and closing: pixel-identical (0 of 4.76 M values differ, clock frozen). Phone layout checked at an emulated
  375×812: a steeper, further view and the names only, zoomed out.

## F-15 and flying from map to map (Nov 2026, v26.0.0)

Built in phases on branch `f15`, one commit each (the plan: [IDEAS.md](IDEAS.md), "Planned with the owner").

### The F-15 (free flight only) — `src/flight.ts`
- **✈ F-15** chip on the flight HUD, or the drawn F-15 beside Macedonia in the city menu (`takeOffF15()`: straight
  into F-15 mode on the current map, after the map is built if it is loading). Saved as `skopje.jet`. Трка and
  Пожар switch it off and bring back their own plane; while it flies their chips are hidden; pad Start toggles it.
- **Model:** grey, true size ×1.25 (19.4 m long), radome, bubble canopy, boxy intakes, swept wing with sun
  roundels, stabilators, two fins canted outward with the flag, two nozzles; afterburner flames (additive cones,
  `ink.skipNormal`).
- **Flight (`JET` in `flight.ts`):** 368 m/s (1325 km/h), 736 with turbo (2650), turn 0.75 rad/s; floor 150 m
  over the ground, looking 0.5–1.8 s ahead over the terrain (`soft` 120 m); ceiling 5200 m; chase camera 58 m back,
  14 m up. At an edge with no finished map ahead it turns back in a wide arc (margin 1.5 × speed / turn rate).
  Temporal accumulation does not smear: flight resets it every frame (`ink.reset()`).
- **Ctrl** (pad LT outside firefighting) holds either plane at a quarter of its top speed (F-15 662 km/h, the usual
  plane 126 km/h).
- **Sound (`sound.ts`):** the jet's roar, rumble, whine and afterburner hiss instead of the propeller; `launch`,
  `boom`, `sonic`, `kick` signals.
- **Rockets (`src/rockets.ts`; Space, pad X, 🚀):** a pair from under the wings every 0.32 s while held, at plane
  speed + 420 m/s, 10 in the air at most; smoke trails, an exhaust glow; on the ground a flash, a fireball, sparks
  and a smoke cloud (billboards in the fire's drawn style, lifted so the ground does not cut them). Effects only.
  Known: ink lines of things behind the smoke draw over it (the normal pass leaves the see-through effects out; the
  fire's smoke does the same).
- **Heat shimmer (`post.ts`, output pass `heat*` uniforms):** a ripple along the exhaust plume on screen; 0 = the
  picture untouched. Three levels: slow ~1.5 px, cruise ~4 px, turbo ~16 px (at 1319 px tall), flaring after a
  sonic boom.
- **Sonic boom:** crossing Mach 1 (343 m/s) or Mach 2 while speeding up (out of Ctrl-slow, or into turbo; cruise
  is already supersonic): a translucent vapour cone for ~0.9 s, a double boom.
- **Contrails:** from both wingtips above 600 m over the ground, soft white billboards every 7 m.
- **Afterburner kick:** pressing turbo widens and lengthens the flames for ~1 s, shakes the camera, plays a roar.
- **Ejection — the jet's action (`src/eject.ts`; the 🪂 Катапулт chip, X, pad Y):** the seat fires the pilot up,
  falls away after 1.1 s, the parachute opens (flat red and yellow gores, 80 % opaque, the lines gathered at two
  links and risers down to rings on the pilot's shoulders); ← → turn, ↑ glides faster; quick high up, ~7 m/s near
  the ground (~19 s from 300 m). The empty jet noses into the ground and blows up. On landing walk mode starts
  there (just inside the map if beyond it). Esc ends it as a normal exit. The pilot: olive suit, harness, white
  helmet with a visor and a red stripe.

### The country around the map — `src/countryground.ts`
- While the F-15 flies, the country view's 100 m grid (`loadCountry()`, downloaded once per visit) is drawn round
  the map: one grid mesh of 161² vertices (phones 121²) following the plane, ~100 m cells near it and ~0.7 km at
  45 km, rebuilt on the CPU when the plane has moved 600 m (2.4 ms for the normals; a few ms in all). Inside the map
  it sinks 25–425 m below the map's terrain. Heights: (country height − the map's `min`) × the map's `terrainExag`,
  because a map's terrain stores its heights above its own lowest point (`min` in `*-terrain.json`). Without the
  `min` the country stood that much too high (Охрид 686 m, Ростуше 486 m) and covered the map; fixed after v26.0.0.
  Measured on all 16 maps: the two agree on average (0 m), at worst ±22 m (the 100 m grid against 10–20 m cells).
  During a switch (the transit) the old map is gone, so its country ground stops sinking (`setSink(false)`):
  before, the plane flew past a pit 25–425 m deep where the old map had been, and over it the whole time when the
  next map is cut out of the old one's rectangle (Матка → Скопје / Брод, Вевчани → Охрид). Checked: Брод → Матка →
  Тетово → Ростуше and Матка → Скопје; after every arrival the heights agree (0–1 m on average).
  The warm-up after the build used to hide and show every piece of the new map once per piece uploaded: Ростуше's
  ~9,600 took 2.2 s on desktop after the loader had closed, so the plane flew over only the coarse country terrain
  although "loading" looked finished. Now it uploads in growing batches (one draw per batch, everything hidden once
  per ~10 ms slice): 0.14 s, and the small loader stays until the map shows. Тетово → Ростуше: ~4.2 s in all.
  **Phones** (seen by the owner on a phone, then checked with phone emulation): a map bigger than the 20 MB phone
  budget (Тетово, 21.5 MB) was downloaded, thrown away and never ready, so the switch never came and it was
  downloaded again and again; now it is marked too big (`prefetch.tooBig`) and the switch loads it from the network.
  And with the memory saver (on by default on phones) the detailed ground round the entry was built only after the
  map showed (loadCity's first round used the old map's camera): `warmUp()` now streams it at the entry first.
  Checked on the phone profile: Брод → Матка → Тетово → Ростуше, the ground built on every arrival. The flight's floor and the rockets use it
  beyond the edges (`groundAt()` in `main.ts`). The camera sees 70 km. While it shows, the ink's normal pass is not
  clipped to the map (otherwise its depth is missing and everything beyond the map is hazed).

### From map to map — `src/hop.ts`, `hop()` / `transit` in `main.ts`
- **Prediction, once a second:** `lookAhead()` walks along the heading in 400 m steps to 4 km past the edge and
  names the first point that has left this map's own outline and lies on another finished one (`mapAt` / `inMap`
  over the zones of `src/zones.ts`, so maps cut out of another one count). Desktop also looks ±45°. The edge check
  in the flight (`edgeOpen()`) does the same on the spot, so a take-off near an edge does not turn back.
- **Downloads:** `createPrefetch()`: one at a time, `fetch(…, { priority: 'low' })`, raw bytes only (no
  `JSON.parse` while flying), paused while frames average over 22 ms; started when the time to the edge is under
  2 × (estimated download + build time, 5 s desktop / 15 s phones); up to 3 maps / 80 MB kept (phones 1 / 20 MB),
  the unwanted and the oldest dropped first.
- **HUD chip:** `→ Батинци ░░░░` (ahead, not downloading yet), `▓▓░░` while downloading, `✓` ready.
- **The switch:** over the next map (and out of this one's outline) with its files ready: the map is taken apart
  but the plane and the country's ground stay and fly on (the *transit*: keys, sound, HUD, radar go on); the next
  map builds hidden, with `computeCitySteps(…, { sliceMs: 12 })` (the trees and pack stages yield every ~12 ms, the
  same result), shaders compiled without drawing, then its meshes uploaded to the GPU a few per frame from where
  the plane will come in (`warmUp()`); then the flight is carried over by lat / lon (height above the ground, speed,
  pitch, keys held). Address and back / forward change as for any switch. Without the country data loaded it falls
  back to a short fade and the small loader.
- **Measured (desktop, dev server):** Скопје → Батинци builds in ~1.4 s with frames going on; every step's longest
  slice ≤ 90 ms (`__dbg.loadMax`); unloading 4 ms (`__dbg.loadUnload`); one ~270 ms pause left at the end of the
  warm-up (one large mesh uploaded at once). Before the warm-up the first frame of the new map froze ~0.6 s.
- Not done from the plan: building the chunks round the plane first; a binary data format.

### Radar — `src/radar.ts` (desktop only)
- Top left of the flight HUD in F-15 mode, 200 px; hidden on phones and tablets (`body.mobile`) and in windows
  under 860 × 560. Macedonia at 4× the country view's zoom (~54 km across), heading up, N on the rim; prerendered
  once from the country grid (land cover, hill shade) with a grey veil over everything that cannot be flown into yet
  (planned maps, beyond the border) and the planned outlines dashed.
- The finished maps' states, no legend (the names say it): current — thick indigo edge; **waiting** (ahead, too far
  to start) — thin dashed blue edge; **queued** (after the running download) — firmer dashed blue edge, faint tint,
  `⋯`; **downloading** — sky blue tint, a thick blue line tracing the edge as far as the download has come with a
  dot at its tip, `↓40%`; **entering** (being built) — orange, pulsing, a running yellow dashed edge, `90%`;
  **ready** — green, `✓`.

### Also in v26.0.0
- **Load times** (`__dbg.loadTimes`, `loadMax`, `loadUnload`): every map measured, the table above in "Measured
  numbers". Trees are half to three quarters of every load.
- **📈 FPS in the window's title** (⚙ → 🎨 Графика, on by default, `skopje.fps`); sharing a link uses the plain title.
- **City menu:** Macedonia takes 70 % of its row, the drawn F-15 the right 30 %.
- Strings for all of it in 6 languages (`npm run strings`: 487, none missing).

### Not verified yet
- Phones and tablets: the sticks with the F-15, 🚀 and 🪂 placement, the 20 MB budget, build times (guessed 3–5×).
- The live site: real download times, so how early the waiting / downloading states show.
- The shimmer strengths only measured from the shader; the vapour cone and contrails only looked at by night and day
  over Скопје.

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

### Load times per step, every map (2026-11-23, v16.0.0, M-series Mac, desktop profile, dev server)

For the F-15's map-to-map flight ([IDEAS.md](IDEAS.md)). `loadCity()` times every step; the last load's
numbers are `__dbg.loadTimes` (and logged as `load times (ms)`). Files come from the local dev server, so
`download` here is almost nothing; on the live site it is the network. ms:

| Map | parse | terrain | ground | buildings | cars | trees | pack | assemble | bake | extras | shaders | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Скопје | 17 | 38 | 64 | 139 | 48 | 843 | 824 | 170 | 271 | 270 | 65 | 2775 |
| Батинци | 10 | 33 | 17 | 93 | 17 | 588 | 340 | 52 | 66 | 92 | 90 | 1444 |
| Матка | 10 | 38 | 22 | 124 | 20 | 1709 | 349 | 81 | 152 | 108 | 39 | 2678 |
| Брод | 9 | 76 | 27 | 60 | 20 | 3281 | 530 | 105 | 213 | 118 | 34 | 4511 |
| Крушево | 3 | 13 | 19 | 13 | 3 | 407 | 236 | 43 | 54 | 48 | 33 | 885 |
| Прилеп | 8 | 55 | 11 | 102 | 17 | 234 | 203 | 58 | 41 | 85 | 36 | 869 |
| Кавадарци | 5 | 837 | 9 | 46 | 10 | 1432 | 458 | 92 | 100 | 194 | 63 | 3273 |
| Битола | 10 | 109 | 14 | 114 | 19 | 726 | 328 | 87 | 80 | 112 | 42 | 1670 |
| Охрид | 17 | 65 | 34 | 188 | 45 | 2547 | 809 | 173 | 136 | 178 | 40 | 4251 |
| Ресен | 12 | 93 | 35 | 95 | 26 | 2577 | 848 | 178 | 244 | 177 | 42 | 4363 |
| Вевчани | 9 | 45 | 20 | 88 | 19 | 1877 | 389 | 100 | 196 | 98 | 34 | 2907 |
| Ростуше | 9 | 44 | 20 | 77 | 19 | 2219 | 458 | 111 | 174 | 106 | 36 | 3297 |
| Тетово | 32 | 99 | 65 | 358 | 105 | 3156 | 676 | 200 | 235 | 206 | 44 | 5219 |
| Каменица | 3 | 45 | 8 | 27 | 5 | 1462 | 368 | 84 | 109 | 56 | 36 | 2225 |
| Дојран | 3 | 21 | 6 | 23 | 5 | 515 | 308 | 66 | 57 | 46 | 31 | 1097 |
| Берово | 4 | 18 | 5 | 33 | 5 | 450 | 158 | 40 | 39 | 50 | 33 | 862 |

- **Trees are the big step** (half to three quarters of every load: forested maps like Брод, Ресен,
  Тетово, Охрид 2.2–3.3 s), then `pack` (0.2–0.85 s). `JSON.parse` is small (≤ 32 ms, Тетово); shaders
  (the first frame) 30–90 ms. Кавадарци's `terrain` is the Луда Мара's channel cut.
- `extras`: traffic, lamps, landmarks, labels, games and vehicles; `yield` (not shown): waiting for frames, 3–25 ms.
- Not measured yet: a phone (the plan guesses 3–5× these), the live site's download.

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
| Map extents per city | `CITIES` in `scripts/config.ts` (+ layers in `data/query.overpassql`) |
| Per-city OSM interpretation (square, old town, landmark ids, places, height zones) | `PREP` in `scripts/prepare.ts` |
| Per-city views, labels, race route, info spots | `CITIES` in `src/cities.ts` |
| Kavadarci monuments | `createLandmarks()` in `src/landmarks.ts` (after the Skopje ones) |
| Kavadarci churches | `createChurches()` in `src/churches.ts` |
| Bitola monuments and Heraclea's mosaics (sizes, colours, the painted floors) | `createBitola()`, `paint*` / `mosaicTexture()` in `src/bitola.ts`; outlines: `models` in `PREP` |
| Share of farm plots that are vineyards | `vineShare` in `CITIES` (Kavadarci 0.52, Bitola 0.08) |
| Rivers widened into refill water (half width) | `waterLines` in `PREP` |
| Vineyards and fields: where (height, slope, distance from buildings) / how they look | `farmMask()` and `vineyards` in `CITIES` (`src/cities.ts`) / `VINE_GROUND` in `src/city.ts` |

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
| 📈 FPS во насловот | `skopje.fps` | on (the frame loop's frames per second after the map's name in the window's title) |
| 💾 Memory saver | `skopje.memorySaver` | on for `MOBILE`, off on desktop |
| 🚗 Less traffic | `skopje.lightTraffic` | off |
| 🔊 Sound | `skopje.sound` | on (audio starts with the first click or key press: browsers do not allow it earlier) |
| Имиња (labels) | `skopje.labels` | on |
| 🌐 Language | `skopje.lang` | the browser's first regional language (never English by itself), else Macedonian; `?lang=` in the link wins over everything |
| 🏁 Race / free flight | `skopje.race` | free flight |
| 🔥 Firefighting | `skopje.fire` | off (race and firefighting exclude each other; if both are saved, the race wins) |
| ✈ F-15 (free flight) | `skopje.jet` | off (the race and firefighting switch it off; saved with either of them on, they win) |
| Invert Y (walking look, the map's tilt: F / R keys and the pad's right stick; ⚙ → 🎮 Управување) | `skopje.invertY` | off |
| Invert Y in flight (climb / dive and the F / R loops; ⚙ → 🎮 Управување) | `skopje.invertYPlane` | on |
| Best race time | `skopje.bestRace` | none |
| Most fires put out in one flight | `skopje.bestFire` | 0 |
| Best race time in Kavadarci | `skopje.bestRace.kavadarci` | none |
| Best race time in Bitola | `skopje.bestRace.bitola` | none |
| Best race time in Ohrid | `skopje.bestRace.ohrid` | none |
| Best race time in Rostuše | `skopje.bestRace.rostuse` | none |
| Best race time in Prilep | `skopje.bestRace.prilep` | none |
| Best race time in Kruševo | `skopje.bestRace.krusevo` | none |
| Best race time in Makedonska Kamenica | `skopje.bestRace.kamenica` | none |
| Best race time in Dojran | `skopje.bestRace.dojran` | none |
| Best race time in Batinci | `skopje.bestRace.batinci` | none |
| Best race time in Berovo | `skopje.bestRace.berovo` | none |
| Best race time in Tetovo | `skopje.bestRace.tetovo` | none |
| Best race time in Makedonski Brod | `skopje.bestRace.brod` | none |
| Best race time in Resen | `skopje.bestRace.resen` | none |
| Best race time in Матка | `skopje.bestRace.matka` | none |
| Best race time in Вевчани | `skopje.bestRace.vevcani` | none |
| Best race time in Кочани | `skopje.bestRace.kocani` | none |
| Best race time in Меџитлија | `skopje.bestRace.medzitlija` | none |
| Best race time in Кратово | `skopje.bestRace.kratovo` | none |
| Best race time in Штип | `skopje.bestRace.stip` | none |
| Best race time in Струмица | `skopje.bestRace.strumica` | none |
| Best race time in Неготино | `skopje.bestRace.negotino` | none |
| Best race time in Демир Капија | `skopje.bestRace.demirkapija` | none |

The camera is not in storage: it is in the address bar (`#@lat,lon,distance,tilt°,heading°` or
a view name), so a reload or a shared link restores it; without a hash the map opens on Плоштад.
The city is not in storage either: it is `?city=` in the address (no parameter = Skopje), so a link
always opens the city it was copied in.

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
- **Overpass at capacity for hours** (Nov 2026: 502/504 from overpass-api.de and maps.mail.ru,
  timeouts on the others). `download.ts` keeps each finished tile in `data/tiles/` until the whole
  download is written, so a run that gives up resumes; just run it again. For a grown box, fetching
  only the new strips with the same query and merging them into the old raw file is far quicker.
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
- **Kavadarci's and Bitola's extra buildings: Overture Maps Foundation** (buildings theme, ODbL; the outlines
  are Microsoft's ML building footprints). `scripts/overture.ts` reads the GeoParquet file(s) that
  cover the box over HTTP ranges (STAC catalog → file, row-group bbox statistics → parts), AWS
  first, then the Azure mirror. Credited next to OSM at the bottom right and in the help footer,
  only in Kavadarci and Bitola (`data-city`).
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

- The country view on a real phone (memory with the city built underneath, touch picking and pinch) and on a slow
  connection (4.4 MB on the first open; the progress card was only seen from a local server).
- Bitola on a phone (layout, memory with 25,515 buildings) and its load time next to the other
  cities; Манаки's walking and filming only by stepping the simulation in a hidden pane.
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

- Towns still to build (planned 2026-11-21, redrawn 2026-11-23 so the whole country is covered, no overlaps):
  [TOWNS_TODO.md](TOWNS_TODO.md).
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
