// Map extents of the cities and the city the scripts work on (keep data/query.overpassql's
// layers in sync; the box itself is added per tile by download.ts).
// The city is the first argument that names one (`npm run data -- kavadarci`), else
// the CITY environment variable, else Skopje.
import type { Pt } from '../src/types.ts';

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
  /** 3×3 box-blur passes after sampling (each pass softens features under ~10–15 m more) */
  smooth: number;
  /** lakes and reservoirs get one flat water level (their lowest part) */
  flatWater?: boolean;
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
} satisfies Record<string, { bbox: { s: number; w: number; n: number; e: number }; tiles: [number, number]; files: CityFiles; terrain: TerrainSpec }>;
export type CityName = keyof typeof CITIES;
const isCity = (s: string | undefined): s is CityName => !!s && s in CITIES;

export const CITY: CityName = process.argv.slice(2).find(isCity) ?? (isCity(process.env.CITY) ? process.env.CITY : 'skopje');
export const FILES: CityFiles = CITIES[CITY].files;
export const BBOX = CITIES[CITY].bbox;
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
