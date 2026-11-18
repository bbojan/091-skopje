// The cities on the map and everything that differs between them: data files, camera views,
// labels, the race route, walking info spots. Names are map data (Macedonian, untranslated).
// The city comes from the address (`?city=kavadarci`); without it the map opens on Skopje.
import type { Key } from './i18n.ts';
import type { Vec3 } from './types.ts';
import type { TreeThin } from './city.ts';

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
  /** the browser tab's icon (public/): Skopje's coat of arms, Kavadarci's flag */
  icon: string;
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
  /** far-ground textures at half size for chunks whose draped ground has fewer vertices than this
   *  (bare hills); 0 / unset: every chunk at full size (Skopje) */
  sparseFar?: number;
  /** fewer, larger trees in green areas far from the town (loading time and memory); unset: everywhere alike (Skopje) */
  treeThin?: TreeThin;
  /** vineyards and fields on open, gentle land up to this height (m); unset: none (Skopje) */
  vineyards?: number;
  /** how the walking person looks: Итар Пејо in folk costume, or a man in a dark suit (Kavadarci) */
  walker: 'pejo' | 'suit';
  /** weather preset 'vodno' is called by the local mountain; the firefighting water source */
  snowLabel: Key;
  refillLabel: Key;
  /** the record time is kept per race route */
  bestRaceKey: string;
  /** the firefighting tow banner (map data, not translated): after a fire is out; after a roll or a loop */
  banners: { fire: string; roll: string };
}

export const CITIES: Record<CityId, CitySpec> = {
  skopje: {
    id: 'skopje', name: 'Скопје', code: '091', icon: './favicon-skopje.svg',
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
    walker: 'pejo',
    snowLabel: 'weather.vodno',
    refillLabel: 'fire.refill',
    bestRaceKey: 'skopje.bestRace',
    banners: { fire: 'Стојанче го спаси градот', roll: 'Село гори, баба се чешла' },
  },
  kavadarci: {
    id: 'kavadarci', name: 'Кавадарци', code: '043', icon: './favicon-kavadarci.svg',
    files: { scene: './kavadarci.json', terrainBin: './kavadarci-terrain.bin', terrainJson: './kavadarci-terrain.json' },
    sceneBytes: 2.4e6,
    views: {
      center: { place: 'square', ll: [41.43344, 22.01227], d: 560, polar: 0.74, az: 0.08 },
      ossuary: { place: 'ossuary', ll: [41.43261, 22.02287], d: 520, polar: 0.8, az: 0.6 },
      vatasa: { place: 'vatasa', ll: [41.40188, 22.02834], d: 700, polar: 0.78, az: -0.3 },
      lake: { ll: [41.3380, 21.9620], d: 19500, polar: 0.73, az: 1.66 }, // the whole of Тиквешко Езеро from the east: the dam on the right
      dam: { place: 'dam', ll: [41.4031, 21.9378], d: 650, polar: 1.05, az: 2.3 }, // Брана Тиквеш from downstream, the lake behind
      ludamara: { ll: [41.43900, 22.01585], d: 120, polar: 1.0, az: -0.3 }, // the Луда Мара's channel from upstream, a bridge and a cascade
      // the map is 17.7 × 23.6 km, longer north–south than the narrow lens (28°) shows from the south:
      // seen from the east, the length runs across the screen
      overview: { ll: [41.3620, 21.9700], d: 25000, polar: 0.6, az: Math.PI / 2 },
    },
    districts: [
      ['Кавадарци', 41.4380, 22.0090], ['Ваташа', 41.4164, 22.0191], ['Глишиќ', 41.4528, 22.0247],
      ['Тиквешко Езеро', 41.3093, 21.9728], // its widest part, half way along
      // villages round the lake and along the Црна Река (OSM place nodes)
      ['Возарци', 41.4286, 21.9242], ['Шивец', 41.4480, 21.9309], ['Дреново', 41.4191, 21.8897],
      ['Брушани', 41.4007, 21.9544], ['Ресава', 41.3883, 21.9776], ['Драдња', 41.3958, 21.9062],
      ['Добротино', 41.3742, 21.9345], ['Шешково', 41.3698, 21.9095], ['Праведник', 41.3422, 21.9337],
      ['Галиште', 41.3201, 21.8645], ['Бегниште', 41.3678, 21.9975], ['Кошани', 41.3562, 22.0149],
      ['Драгожел', 41.3227, 22.0174],
    ],
    labels: [
      ['Плоштад Маршал Тито', 41.43344, 22.01227, 24, 'square'],
      ['Споменик на револуцијата', 41.43322, 22.01231, 9, 'revolution'],
      ['Дом на културата', 41.434017, 22.012032, 16, 'culture'],
      ['Зелен пазар', 41.434509, 22.012778, 14, 'market'],
      ['Општина Кавадарци', 41.43287, 22.01222, 18, 'townhall'],
      ['Споменик Киро Крстев и Димче Мирчев', 41.43364, 22.01948, 13, 'heroes'],
      ['Спомен-костурница', 41.43261, 22.02287, 28, 'ossuary'],
      ['Музеј Галерија', 41.43437, 22.01652, 16, 'museum'],
      ['Градски стадион', 41.43511, 22.02336, 14, 'stadium'],
      ['Св. Димитриј', 41.43459, 22.00856, 20, 'dimitrij'],
      ['Св. Петка', 41.44312, 22.00832, 25, 'petka'],
      ['Спомен-парк Ваташа', 41.40188, 22.02834, 24, 'vatasa'],
      ['Катунишко Езеро', 41.39186, 22.03766, 12, 'katunisko'],
      ['Луда Мара', 41.43333, 22.01575, 6, undefined, 'river'],
      ['Брана Тиквеш', 41.40300, 21.93780, 22, 'dam'],
      ['Црна Река', 41.4336, 21.9204, 6, undefined, 'river'], // below the dam, past Возарци
      ['Црна Река', 41.2824, 21.8929, 6, undefined, 'river'], // where it flows into the lake
      ['ХЕЦ Тиквеш', 41.40473, 21.93636, 24, 'hpp'],
    ],
    route: [
      ['Плоштад Маршал Тито', 41.43344, 22.01227, 70, 'square'],
      ['Св. Димитриј', 41.43459, 22.00856, 75, 'dimitrij'],
      ['Глишиќ', 41.4528, 22.0247, 95],
      ['Спомен-костурница', 41.43261, 22.02287, 85, 'ossuary'],
      ['Споменик Киро Крстев и Димче Мирчев', 41.43364, 22.01948, 70, 'heroes'],
      ['Ваташа', 41.4164, 22.0191, 90],
      ['Спомен-парк Ваташа', 41.40188, 22.02834, 85, 'vatasa'],
      ['Тиквешко Езеро', 41.3952, 21.9690, 55],
      ['Брана Тиквеш', 41.4012, 21.9372, 45], // over the water just in front of the crest
      ['Музеј Галерија', 41.43437, 22.01652, 70, 'museum'],
      ['Плоштад', 41.43344, 22.01227, 65, 'square'],
    ],
    spots: [
      ['k.square', 'Плоштад Маршал Тито', 41.43344, 22.01227, 55, 'square'],
      ['k.revolution', 'Споменик на револуцијата', 41.43322, 22.01231, 18, 'revolution'],
      ['k.townhall', 'Општина Кавадарци', 41.43287, 22.01222, 34, 'townhall'],
      ['k.culture', 'Дом на културата „Иван Мазов-Климе“', 41.434017, 22.012032, 30, 'culture'],
      ['k.market', 'Градски зелен пазар', 41.434509, 22.012778, 32, 'market'],
      ['k.heroes', 'Споменик Киро Крстев и Димче Мирчев', 41.43364, 22.01948, 30, 'heroes'],
      ['k.stadium', 'Градски стадион', 41.43511, 22.02336, 75, 'stadium'],
      ['k.ossuary', 'Спомен-костурница', 41.43261, 22.02287, 60, 'ossuary'],
      ['k.museum', 'Музеј Галерија Кавадарци', 41.43437, 22.01652, 35, 'museum'],
      ['k.vatasa', 'Спомен-парк Ваташа', 41.40188, 22.02834, 70, 'vatasa'],
      ['k.lake', 'Катунишко Езеро', 41.39186, 22.03766, 90, 'katunisko'],
      ['k.dam', 'Брана Тиквеш', 41.40300, 21.93780, 90, 'dam'],
    ],
    gliders: false,
    buses: false, // Kavadarci has no red ЈСП buses
    terrainExag: 1, // true heights
    // ~1.1 million forest trees on the hills round Тиквешко Езеро took most of the loading time:
    // full density round the town, a tenth (drawn larger) from ~9 km out
    treeThin: { ll: [41.43344, 22.01227], near: 3500, far: 9000, min: 0.1, grow: 1.7 },
    sparseFar: 1500, // most of the 432 chunks are bare hills round the lake: their far textures at half size
    vineyards: 520, // Тиквеш: vineyards and fields on the gentle hills round the town (aerial image)
    walker: 'suit',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.lake',
    bestRaceKey: 'skopje.bestRace.kavadarci',
    banners: { fire: 'Митко го спаси градот!', roll: 'Шо ги ебам нека му а мислат' },
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
