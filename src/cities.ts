// The cities on the map and everything that differs between them: data files, camera views,
// labels, the race route, walking info spots. Names are map data (Macedonian, untranslated).
// The city comes from the address (`?city=kavadarci`); without it the map opens on Skopje.
import type { Key } from './i18n.ts';
import type { Vec3 } from './types.ts';

export const CITY_IDS = ['skopje', 'kavadarci'] as const;
export type CityId = (typeof CITY_IDS)[number];
export const DEFAULT_CITY: CityId = 'skopje';
export const isCityId = (s: string | null | undefined): s is CityId => !!s && (CITY_IDS as readonly string[]).includes(s);

/** A camera view: around a lat/lon, an exact place from the data (with a lat/lon fallback) or a scene point. */
export interface ViewSpec { ll?: [lat: number, lon: number]; place?: string; xyz?: Vec3; d: number; polar: number; az: number }
export type LabelKind = 'district' | 'landmark' | 'river';
/** [name, lat, lon, lift above the ground, key in data.places (exact OSM position, preferred), kind (default landmark)] */
export type LabelSpec = [name: string, lat: number, lon: number, lift: number, key?: string, kind?: LabelKind];
/** Race ring: [name, lat, lon, height above ground, key in data.places]; lat/lon null = next to the Millennium Cross. */
export type RingSpec = [name: string, lat: number | null, lon: number | null, agl: number, key?: string];
/** Walking info card: [key (text: i18n `info.<key>`), name, lat, lon, radius, key in data.places] */
export type SpotSpec = [key: string, name: string, lat: number, lon: number, radius: number, place?: string];

export interface CitySpec {
  id: CityId;
  /** the town's name (map data) and its old telephone code, shown on the badge */
  name: string;
  code: string;
  files: { scene: string; terrainBin: string; terrainJson: string };
  /** expected scene JSON size, for the progress bar when the server sends no length */
  sceneBytes: number;
  /** camera views; `center` is the default, `overview` the whole map */
  views: Record<string, ViewSpec>;
  /** district names, shown when zoomed out */
  districts: [name: string, lat: number, lon: number, lift?: number][];
  labels: LabelSpec[];
  route: RingSpec[];
  spots: SpotSpec[];
  /** paragliders circle over the slope north of the Millennium Cross (Skopje only) */
  gliders: boolean;
  /** red ЈСП city buses in the traffic and the drivable double-decker (🚌): Skopje only */
  buses: boolean;
  /** heights are drawn this many times taller than real (1 = true heights) */
  terrainExag: number;
  /** weather preset 'vodno' is called by the local mountain; the firefighting water source */
  snowLabel: Key;
  refillLabel: Key;
  /** the record time is kept per race route */
  bestRaceKey: string;
}

export const CITIES: Record<CityId, CitySpec> = {
  skopje: {
    id: 'skopje', name: 'Скопје', code: '091',
    files: { scene: './skopje.json', terrainBin: './terrain.bin', terrainJson: './terrain.json' },
    sceneBytes: 7e6,
    views: {
      center: { ll: [41.9968, 21.4318], d: 620, polar: 0.74, az: 0.08 },
      kale: { ll: [42.0012, 21.4355], d: 640, polar: 0.72, az: 0.3 },
      park: { place: 'park', ll: [42.0075, 21.4190], d: 1000, polar: 0.72, az: -0.25 },
      vodno: { ll: [41.9725, 21.4020], d: 3600, polar: 1.02, az: Math.PI - 0.25 },
      overview: { xyz: [0, 60, 600], d: 19000, polar: 0.7, az: 0 },
    },
    districts: [
      ['Центар', 41.9930, 21.4250], ['Карпош', 42.0040, 21.3920], ['Аеродром', 41.9850, 21.4720],
      ['Кисела Вода', 41.9760, 21.4420], ['Чаир', 42.0110, 21.4420], ['Бутел', 42.0330, 21.4430],
      ['Гази Баба', 42.0130, 21.4800], ['Ѓорче Петров', 42.0090, 21.3560], ['Шуто Оризари', 42.0380, 21.4250],
      ['Водно', 41.9690, 21.4000, 120],
    ],
    labels: [
      ['Плоштад Македонија', 41.9955, 21.4319, 30, 'square'], ['Камен мост', 41.9970, 21.4331, 14], ['Кале', 42.0008, 21.4335, 40, 'kale'],
      ['Стара чаршија', 42.0018, 21.4378, 20, 'bazaar'], ['Порта Македонија', 41.99445, 21.43242, 30, 'porta'], ['Градски парк', 42.0075, 21.4190, 25, 'park'],
      ['Национална арена', 42.00575, 21.42551, 40, 'arena'], ['Зоолошка градина', 42.0064, 21.41767, 20, 'zoo'], ['Вардар', 41.9994, 21.4110, 6, undefined, 'river'],
      ['Телекомуникациски центар', 41.99834, 21.42988, 34, 'telecom'], ['Даут-пашин амам', 41.99872, 21.43572, 14, 'hamam'],
      ['Св. Спас', 42.00082, 21.43572, 10, 'spas'], ['Сити Мол', 42.00468, 21.39177, 24, 'mall'],
      ['Железничка станица', 41.99096, 21.44589, 24, 'station'],
    ],
    route: [
      ['Плоштад Македонија', 41.9955, 21.4319, 85, 'square'],
      ['Камен мост', 41.9970, 21.4331, 65],
      ['Кале', 42.0003, 21.4327, 105],
      ['Стара чаршија', 42.0018, 21.4378, 85, 'bazaar'],
      ['Национална арена', 42.00575, 21.42551, 95, 'arena'],
      ['Градски парк', 42.0075, 21.4190, 85, 'park'],
      ['Зоолошка градина', 42.0064, 21.41767, 95, 'zoo'],
      ['Карпош', 42.0040, 21.3950, 130],
      ['Средно Водно', 41.9800, 21.4070, 120],
      ['Милениумски крст', null, null, 125],
      ['Кисела Вода', 41.9820, 21.4400, 115],
      ['Плоштад', 41.9955, 21.4319, 80, 'square'],
    ],
    spots: [
      ['square', 'Плоштад Македонија', 41.9955, 21.4319, 60, 'square'],
      ['bridge', 'Камен мост', 41.9970, 21.4331, 35],
      ['kale', 'Кале', 42.0008, 21.4335, 110, 'kale'],
      ['bazaar', 'Стара чаршија', 42.0018, 21.4378, 90, 'bazaar'],
      ['hamam', 'Даут-пашин амам', 41.99872, 21.43572, 40, 'hamam'],
      ['spas', 'Св. Спас', 42.00082, 21.43572, 35, 'spas'],
      ['porta', 'Порта Македонија', 41.99445, 21.43242, 40, 'porta'],
      ['station', 'Железничка станица', 41.99096, 21.44589, 80, 'station'],
      ['telecom', 'Телекомуникациски центар', 41.99834, 21.42988, 60, 'telecom'],
    ],
    gliders: true,
    buses: true,
    terrainExag: 1.12, // Skopje's look since v1 (Vodno a little more dramatic)
    snowLabel: 'weather.vodno',
    refillLabel: 'fire.refill',
    bestRaceKey: 'skopje.bestRace',
  },
  kavadarci: {
    id: 'kavadarci', name: 'Кавадарци', code: '043',
    files: { scene: './kavadarci.json', terrainBin: './kavadarci-terrain.bin', terrainJson: './kavadarci-terrain.json' },
    sceneBytes: 1.5e6,
    views: {
      center: { place: 'square', ll: [41.43344, 22.01227], d: 560, polar: 0.74, az: 0.08 },
      ossuary: { place: 'ossuary', ll: [41.43261, 22.02287], d: 520, polar: 0.8, az: 0.6 },
      vatasa: { place: 'vatasa', ll: [41.40188, 22.02834], d: 700, polar: 0.78, az: -0.3 },
      lake: { ll: [41.3952, 21.9690], d: 1500, polar: 1.0, az: 2.4 }, // the arm of Тиквешко Езеро in the map's south-west corner
      overview: { xyz: [0, 60, 300], d: 11500, polar: 0.7, az: 0 },
    },
    districts: [
      ['Кавадарци', 41.4380, 22.0090], ['Ваташа', 41.4164, 22.0191], ['Глишиќ', 41.4528, 22.0247],
      ['Тиквешко Езеро', 41.3952, 21.9690],
    ],
    labels: [
      ['Плоштад Маршал Тито', 41.43344, 22.01227, 24, 'square'],
      ['Споменик на револуцијата', 41.43322, 22.01231, 9, 'revolution'],
      ['Дом на културата', 41.434017, 22.012032, 16, 'culture'],
      ['Општина Кавадарци', 41.43287, 22.01222, 18, 'townhall'],
      ['Народни херои', 41.43364, 22.01948, 16, 'heroes'],
      ['Спомен-костурница', 41.43261, 22.02287, 28, 'ossuary'],
      ['Музеј Галерија', 41.43437, 22.01652, 16, 'museum'],
      ['Св. Димитриј', 41.43459, 22.00856, 20, 'dimitrij'],
      ['Спомен-парк Ваташа', 41.40188, 22.02834, 24, 'vatasa'],
      ['Катунишко Езеро', 41.39186, 22.03766, 12, 'katunisko'],
      ['Луда Мара', 41.43333, 22.01575, 6, undefined, 'river'],
    ],
    route: [
      ['Плоштад Маршал Тито', 41.43344, 22.01227, 70, 'square'],
      ['Св. Димитриј', 41.43459, 22.00856, 75, 'dimitrij'],
      ['Глишиќ', 41.4528, 22.0247, 95],
      ['Спомен-костурница', 41.43261, 22.02287, 85, 'ossuary'],
      ['Народни херои', 41.43364, 22.01948, 70, 'heroes'],
      ['Ваташа', 41.4164, 22.0191, 90],
      ['Спомен-парк Ваташа', 41.40188, 22.02834, 85, 'vatasa'],
      ['Тиквешко Езеро', 41.3952, 21.9690, 55],
      ['Музеј Галерија', 41.43437, 22.01652, 70, 'museum'],
      ['Плоштад', 41.43344, 22.01227, 65, 'square'],
    ],
    spots: [
      ['k.square', 'Плоштад Маршал Тито', 41.43344, 22.01227, 55, 'square'],
      ['k.revolution', 'Споменик на револуцијата', 41.43322, 22.01231, 18, 'revolution'],
      ['k.townhall', 'Општина Кавадарци', 41.43287, 22.01222, 34, 'townhall'],
      ['k.culture', 'Дом на културата „Иван Мазов-Климе“', 41.434017, 22.012032, 30, 'culture'],
      ['k.heroes', 'Народни херои', 41.43364, 22.01948, 30, 'heroes'],
      ['k.ossuary', 'Спомен-костурница', 41.43261, 22.02287, 60, 'ossuary'],
      ['k.museum', 'Музеј Галерија Кавадарци', 41.43437, 22.01652, 35, 'museum'],
      ['k.vatasa', 'Спомен-парк Ваташа', 41.40188, 22.02834, 70, 'vatasa'],
      ['k.lake', 'Катунишко Езеро', 41.39186, 22.03766, 90, 'katunisko'],
    ],
    gliders: false,
    buses: false, // Kavadarci has no red ЈСП buses
    terrainExag: 1, // true heights
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.lake',
    bestRaceKey: 'skopje.bestRace.kavadarci',
  },
};

/** The city named in the address (`?city=`), else Skopje. */
export function cityFromUrl(): CityId {
  const q = new URLSearchParams(location.search).get('city')?.toLowerCase();
  return isCityId(q) ? q : DEFAULT_CITY;
}

/** The address for a city: `?city=` is left out for the default one; other parameters (`?lang=`) stay. */
export function urlForCity(id: CityId): string {
  const u = new URL(location.href);
  if (id === DEFAULT_CITY) u.searchParams.delete('city'); else u.searchParams.set('city', id);
  u.hash = '';
  return u.pathname + u.search;
}
