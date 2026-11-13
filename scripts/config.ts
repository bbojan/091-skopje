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
}

export const CITIES = {
  skopje: {
    bbox: { s: 41.955, w: 21.33, n: 42.055, e: 21.525 },
    tiles: [3, 2] as [number, number],
    files: { raw: 'data/skopje_raw.json', scene: 'public/skopje.json', terrainBin: 'public/terrain.bin', terrainJson: 'public/terrain.json' },
  },
  // Кавадарци: the town, Ваташа and Глишиќ, the Луда Мара and Катунишко Езеро to the south-east
  kavadarci: {
    bbox: { s: 41.38, w: 21.958, n: 41.462, e: 22.062 },
    tiles: [2, 2] as [number, number],
    files: { raw: 'data/kavadarci_raw.json', scene: 'public/kavadarci.json', terrainBin: 'public/kavadarci-terrain.bin', terrainJson: 'public/kavadarci-terrain.json' },
  },
} satisfies Record<string, { bbox: { s: number; w: number; n: number; e: number }; tiles: [number, number]; files: CityFiles }>;
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
