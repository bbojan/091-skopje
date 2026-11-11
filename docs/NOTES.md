# 091 Скопје — project notes

Context for continuing the work (on any machine, in any Claude Code session).
For commands, architecture and conventions see [../CLAUDE.md](../CLAUDE.md).

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
- GPU frame ≈ 13–16 ms close views, ~22 ms overview (live traffic on).
- JS heap ≈ 1.7 GB desktop, ≈ 0.9 GB mobile profile.
- 20.5k buildings, ~430k trees, ~68k parked cars, 6.5k cars, 15k people (desktop).

## Not verified yet

- Real iPhone/iPad (memory limits ~1–1.5 GB per tab) — only emulated.
- Real gamepads — only a simulated XInput pad; DirectInput axis layout is a heuristic.

## Backlog / ideas

- Stream chunks on demand (build full detail only near the camera) — the real fix
  for iOS memory if the mobile profile is still too heavy.
- Shareable links with camera position in the URL hash.
- More landmarks: Telecom tower, Holy Saviour church, Daut Pasha Hamam, City Mall,
  railway station; better Kale label position (no OSM name match).
- Facade variety by building type (shops, schools, churches), roof-top terraces.
- Seasonal looks (autumn trees, winter snow on Vodno).
- `npm run download` should also fetch `data/aerialway.json`.
