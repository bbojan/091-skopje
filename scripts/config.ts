// Map extents of the cities and the city the scripts work on (keep data/query.overpassql's
// layers in sync; the box itself is added per tile by download.ts).
// The city is the first argument that names one (`npm run data -- kavadarci`), else
// the CITY environment variable, else Skopje.
import type { Pt } from '../src/types.ts';

export interface Box { s: number; w: number; n: number; e: number }

export interface CityFiles {
  /** raw Overpass download (not in git) */
  raw: string;
  /** prepared scene description (public/, committed) */
  scene: string;
  /** heightfield: Uint16 decimetres above the minimum + its JSON header */
  terrainBin: string;
  terrainJson: string;
  /** building outlines OSM lacks, from Overture Maps (scripts/overture.ts; not in git) */
  overture?: string;
}

/** How scripts/terrain.ts shapes a city's heightfield. Everything except `smooth` reads the raw OSM download. */
export interface TerrainSpec {
  /** metres between samples (default 10); 20 for the largest, mostly mountain or lake maps (memory) */
  cell?: number;
  /** 3×3 box-blur passes after sampling (each pass softens features under ~10–15 m more) */
  smooth: number;
  /** lakes and reservoirs get one flat water level (their lowest part) */
  flatWater?: boolean;
  /** water levels given by hand (metres above sea) by OSM id, where the DEM holds an older, lower lake than OSM's
   *  shoreline (Дојранско Езеро: 139 m in the DEM, the ground at OSM's shore ≈ 145 m); the shore is lifted above it */
  waterLevels?: Record<number, number>;
  /** metres round each flat lake (not river surfaces) where higher ground is lowered to just above the water: a lake a few cells wide
   *  (Матка's, in its canyon) otherwise drapes its edge up the walls */
  waterPad?: number;
  /** squares (OSM `name`) made flat at their middle height, blended into the ground around them */
  flatSquares?: string[];
  /** OSM ways (pitches…) made flat the same way, at the given height (metres above sea) or their middle height,
   *  also `pad` metres round them (stands), then blended over 15 m */
  flatWays?: [id: number, level?: number, pad?: number][];
  /** river channels cut along waterways: tag → [half width, depth] in metres; not under roads (bridges, culverts) */
  rivers?: Record<string, [halfWidth: number, depth: number]>;
  /** stretches of a waterway left uncut, between two latitudes: a channel modelled by hand (src/river.ts)
   *  is set into the ground at street level there */
  riversKeep?: [id: number, south: number, north: number][];
  /** embankment dams: OSM crest line (way id), crest height (metres above sea), half the crest width (m),
   *  face slope (vertical / horizontal); the ground is raised to the dam body, water is left flat */
  dams?: [id: number, crest: number, halfWidth: number, slope: number][];
  /** known heights the ground is bent to: [lat, lon, metres above sea, radius m (default 150)] */
  points?: [lat: number, lon: number, metres: number, radius?: number][];
}

export const CITIES = {
  skopje: {
    bbox: { s: 41.955, w: 21.33, n: 42.055, e: 21.525 },
    tiles: [3, 2] as [number, number],
    files: { raw: 'data/skopje_raw.json', scene: 'public/skopje.json', terrainBin: 'public/terrain.bin', terrainJson: 'public/terrain.json' },
    terrain: { smooth: 3 } as TerrainSpec, // unchanged since v1 (the reference images depend on it)
  },
  // Кавадарци: the town, Ваташа and Глишиќ, the Луда Мара and Катунишко Езеро to the south-east, and to the
  // south-west the whole of Тиквешко Езеро (41.259–41.404 N, 21.860–21.990 E) with the Тиквеш dam and power
  // plant at its north end and the Црна Река below it
  kavadarci: {
    bbox: { s: 41.25, w: 21.85, n: 41.462, e: 22.062 },
    tiles: [4, 5] as [number, number],
    files: { raw: 'data/kavadarci_raw.json', scene: 'public/kavadarci.json', terrainBin: 'public/kavadarci-terrain.bin', terrainJson: 'public/kavadarci-terrain.json', overture: 'data/kavadarci_overture.json' },
    // EU-DEM 25 m underneath (checked: 0.6 m RMS at 100 points): little smoothing, flat water and
    // square, the Луда Мара's regulated channel cut in; add known heights to `points`
    terrain: {
      smooth: 1,
      flatWater: true,
      flatSquares: ['Плоштад Маршал Тито'],
      // the city stadium's pitch and its stands: dug into the slope north of it, level with the street
      // on the south side (photos); the 25 m data runs ~6 m up across it
      flatWays: [[1276210010, 282.3, 12]],
      rivers: { river: [6, 2.5], stream: [3, 1.5], canal: [2, 1] },
      // the Луда Мара's stone-lined channel through the town, between the bridges of Киро Крстев and
      // Северен (src/river.ts; the town lies at street level on both sides)
      riversKeep: [[33071714, 41.42747, 41.44336]],
      // Брана Тиквеш (1968): rockfill, 113.5 m from its foundation, crest 338 m long. The 25 m data
      // rounds the crest down to 252–262 m. The crest follows the road on it (OSM's dam line is the
      // upstream edge at the full lake, ~25 m out), 10 m above the flattened lake (250 m); both
      // faces at ~1 : 1.8, so the upstream one meets the water near that line
      dams: [[713475142, 260, 8, 0.55]],
      points: [],
    } as TerrainSpec,
  },
  // Битола: the town in the Pelagonia plain, Хераклеа Линкестис to the south, and to the west the slopes
  // of Баба with Пелистер (2601 m) and its glacial lakes, Големо and Мало Езеро (the firefighting water)
  bitola: {
    bbox: { s: 40.955, w: 21.165, n: 41.085, e: 21.40 },
    tiles: [6, 5] as [number, number],
    files: { raw: 'data/bitola_raw.json', scene: 'public/bitola.json', terrainBin: 'public/bitola-terrain.bin', terrainJson: 'public/bitola-terrain.json', overture: 'data/bitola_overture.json' },
    terrain: {
      smooth: 1,
      flatWater: true,
      flatSquares: [],
      // Хераклеа: the Great Basilica's excavated floor and the theatre's orchestra lie level on the sloping site
      flatWays: [[502848605, undefined, 3], [226160304, undefined, 2]],
      rivers: { river: [5, 2], stream: [2.5, 1.2], canal: [2, 1] },
      points: [],
    } as TerrainSpec,
  },
  // Охрид: the whole of Охридско Езеро (40.90–41.17 N, incl. the Albanian shore with Pogradec), Охрид on its
  // north-east shore, Струга where the Црн Дрим leaves the lake, Св. Наум at the south end, Галичица to the east
  ohrid: {
    bbox: { s: 40.885, w: 20.615, n: 41.205, e: 20.845 },
    tiles: [4, 7] as [number, number],
    files: { raw: 'data/ohrid_raw.json', scene: 'public/ohrid.json', terrainBin: 'public/ohrid-terrain.bin', terrainJson: 'public/ohrid-terrain.json', overture: 'data/ohrid_overture.json' },
    terrain: { cell: 20, smooth: 1, flatWater: true, rivers: { river: [8, 2], stream: [2.5, 1.2], canal: [3, 1.5] }, points: [] } as TerrainSpec,
  },
  // Ростуше: the village and Бигорски манастир in the Радика valley, Дебар and Дебарско Езеро to the south-west,
  // Мавровско Езеро and Маврово to the north-east, the Бистра and Кораб ranges between them
  rostuse: {
    bbox: { s: 41.39, w: 20.49, n: 41.725, e: 20.815 },
    tiles: [6, 6] as [number, number],
    files: { raw: 'data/rostuse_raw.json', scene: 'public/rostuse.json', terrainBin: 'public/rostuse-terrain.bin', terrainJson: 'public/rostuse-terrain.json', overture: 'data/rostuse_overture.json' },
    terrain: { cell: 20, smooth: 1, flatWater: true, rivers: { river: [6, 2], stream: [2.5, 1.2], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Прилеп: the town under Маркови Кули, Прилепско Езеро to the north-east, Трескавец on Златоврв
  prilep: {
    bbox: { s: 41.31, w: 21.49, n: 41.41, e: 21.63 },
    tiles: [3, 3] as [number, number],
    files: { raw: 'data/prilep_raw.json', scene: 'public/prilep.json', terrainBin: 'public/prilep-terrain.bin', terrainJson: 'public/prilep-terrain.json', overture: 'data/prilep_overture.json' },
    terrain: { smooth: 1, flatWater: true, rivers: { river: [4, 1.5], stream: [2, 1], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Крушево: the town on the slopes of Бушева Планина, Македониум and Мечкин Камен, Крушевско Езеро
  krusevo: {
    bbox: { s: 41.33, w: 21.19, n: 41.405, e: 21.31 },
    tiles: [2, 2] as [number, number],
    files: { raw: 'data/krusevo_raw.json', scene: 'public/krusevo.json', terrainBin: 'public/krusevo-terrain.bin', terrainJson: 'public/krusevo-terrain.json', overture: 'data/krusevo_overture.json' },
    terrain: { smooth: 1, flatWater: true, rivers: { river: [4, 1.5], stream: [2, 1], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Македонска Каменица: the town in the valley of the Каменичка Река under Осогово, Саса and its lead and zinc mine
  // up the valley to the north, and the whole of Езеро Калиманци on the Брегалница to the south-east (the firefighting
  // water): the dam and its power house at the west end, the tail up the Брегалница valley to ~22.68 E at full level
  kamenica: {
    bbox: { s: 41.945, w: 22.495, n: 42.125, e: 22.71 },
    tiles: [4, 4] as [number, number],
    files: { raw: 'data/kamenica_raw.json', scene: 'public/kamenica.json', terrainBin: 'public/kamenica-terrain.bin', terrainJson: 'public/kamenica-terrain.json', overture: 'data/kamenica_overture.json' },
    terrain: { smooth: 1, flatWater: true, rivers: { river: [4, 1.5], stream: [2, 1], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Дојран: the whole of Дојранско Езеро (41.173–41.250 N, 22.708–22.785 E), Стар Дојран and Нов Дојран on its
  // west shore, Кале Тепе and the Salonica Front memorial above them, the Greek shore with Δοϊράνη to the south-east
  dojran: {
    bbox: { s: 41.15, w: 22.66, n: 41.27, e: 22.82 },
    tiles: [3, 3] as [number, number],
    files: { raw: 'data/dojran_raw.json', scene: 'public/dojran.json', terrainBin: 'public/dojran-terrain.bin', terrainJson: 'public/dojran-terrain.json', overture: 'data/dojran_overture.json' },
    // the DEM (≈ 2000) holds the lake at its low level of the drought years, 139 m; OSM's shoreline is today's larger
    // lake, the ground just outside it 145.5 m (median of 294 points, 10 m out): the water at 144.5 m
    terrain: { smooth: 1, flatWater: true, waterLevels: { 4557289: 144.5 }, rivers: { river: [4, 1.5], stream: [2, 1], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Батинци and its surroundings south of Skopje's map (its south edge, 41.955 N, is this map's north edge: nothing
  // overlaps): Пинтија at the top, Драчево to the east, Марков манастир by Маркова Сушица to the west, Долно Количани
  // to the south, the Маркова Река valley between them
  batinci: {
    bbox: { s: 41.875, w: 21.385, n: 41.955, e: 21.545 },
    tiles: [3, 3] as [number, number],
    files: { raw: 'data/batinci_raw.json', scene: 'public/batinci.json', terrainBin: 'public/batinci-terrain.bin', terrainJson: 'public/batinci-terrain.json', overture: 'data/batinci_overture.json' },
    terrain: { smooth: 1, flatWater: true, rivers: { river: [4, 1.5], stream: [2, 1], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Берово in the Малешево basin: the town, Ратево and Смојмирово, Пехчево and Чифлик to the north, the whole of
  // Беровско Езеро (41.659–41.676 N, 22.893–22.917 E) and its dam south-east of the town, the Спиковски водопади
  berovo: {
    bbox: { s: 41.65, w: 22.82, n: 41.778, e: 22.94 },
    tiles: [3, 3] as [number, number],
    files: { raw: 'data/berovo_raw.json', scene: 'public/berovo.json', terrainBin: 'public/berovo-terrain.bin', terrainJson: 'public/berovo-terrain.json', overture: 'data/berovo_overture.json' },
    // the lake flat at 990 m (OSM's ele); the DEM has no gorge under the arch dam (≈ 990 m right below the crest, the
    // stream reaches 971 m only 100 m on): its foot bent down to ≈ 958 m, a wall of about 33 m as in the photos;
    // the crest is convex toward the lake (east), the gorge below it to the north-west
    terrain: {
      smooth: 1, flatWater: true, rivers: { river: [4, 1.5], stream: [2, 1], canal: [2, 1] },
      points: [ // 24 m off the crest on its concave (downstream) side, radius 22: the lake is untouched
        [41.67106, 22.89420, 958, 22], [41.67073, 22.89407, 958, 22], [41.67067, 22.89400, 958, 22], [41.67053, 22.89371, 958, 22],
        [41.67114, 22.89310, 962, 40],
      ],
    } as TerrainSpec,
  },
  // Тетово and the Полог valley: Тетово under Шар Планина with Тетовско Кале and Лешочки манастир to the north,
  // Попова Шапка and Титов Врв (2747 m) with the glacial lakes (Боговињско, Бело, Црно, Шутманско), Гостивар
  // to the south and the source of the Вардар at Вруток (41.764 N); the south edge is Ростуше's north edge
  tetovo: {
    bbox: { s: 41.725, w: 20.72, n: 42.075, e: 21.06 },
    tiles: [6, 7] as [number, number],
    files: { raw: 'data/tetovo_raw.json', scene: 'public/tetovo.json', terrainBin: 'public/tetovo-terrain.bin', terrainJson: 'public/tetovo-terrain.json', overture: 'data/tetovo_overture.json' },
    terrain: { cell: 20, smooth: 1, flatWater: true, rivers: { river: [6, 2], stream: [2.5, 1.2], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Македонски Брод and the Треска: Брод and Пешна on the river, Зрзе monastery on its cliff to the east, the whole of
  // Езеро Козјак (41.679–41.878 N) and Акумулација Света Петка (to 41.925 N) up to their dams, Солунска Глава
  // (Јакупица) to the east; the north edge stops short of Езеро Матка (from 41.926 N, on the Скопје map)
  brod: {
    bbox: { s: 41.45, w: 21.12, n: 41.926, e: 21.42 },
    tiles: [5, 8] as [number, number],
    files: { raw: 'data/brod_raw.json', scene: 'public/brod.json', terrainBin: 'public/brod-terrain.bin', terrainJson: 'public/brod-terrain.json', overture: 'data/brod_overture.json' },
    // the DEM has no gorge under Света Петка's arch dam (the lake flat at ≈ 364 m, the ground right below the crest
    // as high): its foot bent down to ≈ 320 m with points 25 m off the crest on the downstream (east) side, as at
    // Берово. Козјак's rockfill dam is already in the DEM (lake 468 m, the face down to ≈ 385 m)
    terrain: {
      cell: 20, smooth: 1, flatWater: true, rivers: { river: [6, 2], stream: [2.5, 1.2], canal: [2, 1] },
      points: [
        [41.92512, 21.26460, 315, 32], [41.92480, 21.26455, 315, 32], [41.92447, 21.26465, 315, 32],
        [41.92500, 21.26570, 320, 45],
      ],
    } as TerrainSpec,
  },
  // Ресен and Преспа: the town, the whole of Преспанско Езеро with its Albanian and Greek shores, Голем Град, and
  // Мала Преспа (40.691–40.811 N) to the south; edge to edge with Охрид (its e 20.845) and Битола (its w 21.165),
  // Галичица between the two lakes
  resen: {
    bbox: { s: 40.685, w: 20.845, n: 41.13, e: 21.165 },
    tiles: [5, 8] as [number, number],
    files: { raw: 'data/resen_raw.json', scene: 'public/resen.json', terrainBin: 'public/resen-terrain.bin', terrainJson: 'public/resen-terrain.json', overture: 'data/resen_overture.json' },
    // Преспанско Езеро flattened at its lowest DEM part (840.8 m) leaves the beach a few metres over the water; the ground
    // 20 m outside OSM's outline is 843.5 m (median of 452 points): the water at 842.5 m. Мала Преспа stays at 848 m
    terrain: { cell: 20, smooth: 1, flatWater: true, waterLevels: { 2905510: 842.5 }, rivers: { river: [6, 2], stream: [2.5, 1.2], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
  // Матка: the land west of Скопје between Тетово's and Брод's maps (docs/TOWNS_TODO.md, 20): Матка's canyon, lake and
  // dam, Св. Андреј, Св. Никола Шишевски, Водно's west side, Сарај's villages. The first map that is not a rectangle:
  // its outline goes round Скопје (and the strip above it, Скопска Црна Гора's) and Брод, so those corners of the
  // bounding rectangle are `cut` (no OSM features there; the terrain stays the full rectangle)
  matka: {
    bbox: { s: 41.725, w: 21.06, n: 42.075, e: 21.385 },
    tiles: [6, 7] as [number, number],
    files: { raw: 'data/matka_raw.json', scene: 'public/matka.json', terrainBin: 'public/matka-terrain.bin', terrainJson: 'public/matka-terrain.json', overture: 'data/matka_overture.json' },
    cut: [
      { s: 41.955, w: 21.33, n: 42.075, e: 21.385 }, // Скопје (to 42.055) and Скопска Црна Гора's strip above it
      { s: 41.725, w: 21.12, n: 41.926, e: 21.385 }, // Македонски Брод
    ],
    terrain: { cell: 20, smooth: 1, flatWater: true, waterPad: 30, rivers: { river: [6, 2], stream: [2.5, 1.2], canal: [2, 1] }, points: [] } as TerrainSpec,
  },
} satisfies Record<string, { bbox: Box; tiles: [number, number]; files: CityFiles; terrain: TerrainSpec; cut?: Box[] }>;

export type CityName = keyof typeof CITIES;
const isCity = (s: string | undefined): s is CityName => !!s && s in CITIES;

export const CITY: CityName = process.argv.slice(2).find(isCity) ?? (isCity(process.env.CITY) ? process.env.CITY : 'skopje');
export const FILES: CityFiles = CITIES[CITY].files;
export const BBOX = CITIES[CITY].bbox;
/** the rectangles a map leaves out (`cut`): its neighbours' maps inside its bounding rectangle */
export const CUT: Box[] = (CITIES[CITY] as { cut?: Box[] }).cut ?? [];
/** whether a point lies in one of the cut rectangles */
export const inCut = (lat: number, lon: number): boolean => CUT.some((c) => lat > c.s && lat < c.n && lon > c.w && lon < c.e);
export const lat0 = (BBOX.s + BBOX.n) / 2;
export const lon0 = (BBOX.w + BBOX.e) / 2;
const R = 6378137;
export const kx = (Math.cos((lat0 * Math.PI) / 180) * R * Math.PI) / 180;
export const ky = (R * Math.PI) / 180;
// x = east, z = south
export const proj = (lat: number, lon: number): Pt => [(lon - lon0) * kx, -(lat - lat0) * ky];
export const unproj = (x: number, z: number): [lat: number, lon: number] => [lat0 - z / ky, lon0 + x / kx];
export const W = (BBOX.e - BBOX.w) * kx;
export const H = (BBOX.n - BBOX.s) * ky;
