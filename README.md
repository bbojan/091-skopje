# 091 Скопје

![Kale fortress and the Old Bazaar in 091 Скопје](docs/kale.jpg)

**Live:** https://bbojan.github.io/091-skopje/ — Го добивме 091 Скопје пред GTA 6!

An illustrated, living 3D map of Skopje — from Gjorče Petrov to Gazi Baba and from Butel to the top of Vodno — drawn in real time from OpenStreetMap data on real terrain, in a hand-drawn isometric map style.

Илустрирана, жива 3Д мапа на Скопје, нацртана од отворените податоци на OpenStreetMap.

A second town, **043 Кавадарци** (Kavadarci, the centre of the Tikveš wine region), is chosen from the badge at the top left or opened directly with `?city=kavadarci`: https://bbojan.github.io/091-skopje/?city=kavadarci

## Features

**The city**
- ~20,000 buildings on real terrain (Vardar valley, Kale, Vodno) with procedural windows, shutters, awnings, cornices, tiled roofs and parapets
- Landmarks: Warrior on a Horse, Stone Bridge, Porta Macedonia, Kale with its towers, the Millennium Cross, the Vodno gondola, the railway station (Kenzo Tange), with labels for the Old Bazaar, Daut Pasha Hamam, Св. Спас, the Telecommunications Centre, City Mall and more
- ~430k cartoon trees, parked cars and live traffic: cars, red ЈСП buses (half double-deckers) and pedestrians
- Ink outlines, soft ambient occlusion and temporal supersampling for smooth edges

**Kavadarci** (`?city=kavadarci`)
- The town with Ваташа, Глишиќ, the Луда Мара and Катунишко Езеро (≈ 8.7 × 9.1 km), on real terrain
- Hand-built monuments modelled after photos and descriptions: the Memorial Ossuary (Petar Muličkovski, 1976), the People's Heroes Kiro Krstev and Dimče Mirčev, the Vataša memorial at Moklište, the Monument to the Revolution on the square
- Плоштад Маршал Тито as it looks in 2020–2025 (the town hall, fountains, planters, bollards) and the Дом на културата, which OSM lacks, placed from its building plans
- Its own places, labels, race route (10 rings), walking info cards; firefighting refills from Тиквешко Езеро

**Time, weather and seasons**
- Day, sunset and night (lit windows, street lamps, headlights), drifting clouds, birds, paragliders over Vodno, flowing river
- Weather: clear, rain (wet streets, puddles, umbrellas), snow, or snow only on Vodno
- Seasons: summer, autumn colours, bare winter trees, spring blossom — the default follows the month

**Things to do**
- 🚶 Walk the city as **Итар Пејо** or a **Шарпланинец** dog, in first or third person: board a bus, ride the gondola to Vodno, take off in the plane, start an оро, or bark; info cards at the landmarks
- 🚌 Drive a red ЈСП double-decker through the streets
- ✈ Fly a Macedonian-flag light aircraft, with an optional ring race and 091 balloons
- 🔥 Fight fires in a yellow Air Tractor: forest, building and bus fires, water drops, refills from the Vardar
- 🔊 Optional sound (off by default): engine, water and fire, rain, birds and crickets, all synthesised in the browser
- Your choices are remembered in the browser (time of day, weather, season, quality, language and the other options)
- 🔗 Shareable links: the city (`?city=`) and the camera position are always in the address bar

**For every screen**
- Interface in Macedonian, English, Serbian, Croatian, Slovenian and Albanian (map names stay Macedonian), in a Вез (folk embroidery) style; help dialog behind the 091 logo
- Mouse, touch, keyboard and gamepad (XInput / DirectInput) controls
- Phone and tablet layout; automatic low-quality mode for slow devices, a smooth-edges switch (off is faster), a less-traffic option, and a memory saver (on by default on phones); long menus wrap into two columns on short screens

More context for development (architecture, conventions, decisions, gotchas):
[CLAUDE.md](CLAUDE.md) and [docs/NOTES.md](docs/NOTES.md); adding another city: [docs/ADDING_A_CITY.md](docs/ADDING_A_CITY.md).

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck   # TypeScript 7, strict
npm run build   # static site in dist/ (relative paths, works on GitHub Pages)
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Regenerate the data

The prepared data in `public/` is committed. To rebuild it (extents in `scripts/config.ts`; the city is
the first argument, Skopje when left out):

```bash
npm run download   # OpenStreetMap via Overpass → data/skopje_raw.json
npm run terrain    # elevation tiles → public/terrain.bin
npm run data       # → public/skopje.json
npm run download -- kavadarci && npm run terrain -- kavadarci && npm run data -- kavadarci
                   # → public/kavadarci.json, public/kavadarci-terrain.bin/.json
```

## Credits

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- Elevation: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on AWS Open Data
- Built with [three.js](https://threejs.org) and TypeScript by [Бојан Божиновски](https://www.linkedin.com/in/bojanb/)
