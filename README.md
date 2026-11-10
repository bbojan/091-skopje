# 091 Скопје

An illustrated, living 3D map of Skopje — from Gjorče Petrov to Gazi Baba and from Butel to the top of Vodno — drawn in real time from OpenStreetMap data on real terrain, in a hand-drawn isometric map style.

Илустрирана, жива 3Д мапа на Скопје, нацртана од отворените податоци на OpenStreetMap.

## Features

- ~20,000 buildings with procedural windows, shutters, awnings, cornices, tiled roofs and parapets
- Terrain from elevation tiles: Vardar valley, Kale fortress hill and Vodno with the Millennium Cross
- ~400k cartoon trees, parked cars, sheds — and live traffic: cars, buses and pedestrians
- Ink outlines, soft ambient occlusion, two-tone foliage, temporal supersampling for smooth edges
- ✈ Airplane mode: fly a Macedonian-flag light aircraft in third person (keyboard + touch, boost, invert-Y)
- Macedonian UI with a help dialog (click the 091 logo)

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # static site in dist/ (relative paths, works on GitHub Pages)
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Regenerate the data

The prepared data in `public/` is committed. To rebuild it (extent in `scripts/config.mjs`):

```bash
npm run download   # OpenStreetMap via Overpass → data/skopje_raw.json
npm run terrain    # elevation tiles → public/terrain.bin
npm run data       # → public/skopje.json
```

## Credits

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- Elevation: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on AWS Open Data
- Built with [three.js](https://threejs.org) by [Бојан Божиновски](https://www.linkedin.com/in/bojanb/)
