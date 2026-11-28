// The cities on the map and everything that differs between them: data files, camera views,
// labels, the race route, walking info spots. Names are map data (Macedonian, untranslated).
// The city comes from the address (`?city=kavadarci`); without it the map opens on Skopje.
import type { Key } from './i18n.ts';
import type { Vec3 } from './types.ts';
import type { TreeThin } from './city.ts';

export const CITY_IDS = ['skopje', 'kavadarci', 'rostuse', 'ohrid', 'bitola', 'krusevo', 'prilep', 'dojran', 'berovo', 'tetovo', 'resen', 'brod', 'kamenica', 'kocani', 'medzitlija', 'golobrdo', 'kratovo', 'negotino', 'stip', 'strumica', 'vevcani', 'batinci', 'matka', 'demirkapija', 'valandovo', 'vinica', 'korab', 'probistip', 'gevgelija', 'krivapalanka'] as const;
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
  /** the browser tab's icon (public/): Skopje's coat of arms, Kavadarci's flag, Bitola's clock tower, Ohrid's Канео… */
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
  /** the tree line, m above the map's lowest point: green areas above it stay bare (high mountains); unset: none */
  treeLine?: number;
  /** vineyards and fields on open, gentle land up to this height (m); unset: none (Skopje) */
  vineyards?: number;
  /** the share of those plots that are vineyards, the rest fields (default 0.52, Tikveš) */
  vineShare?: number;
  /** rice paddies on the low plain (Кочани): [share of the farm plots, up to this height in m above the map's lowest point] */
  rice?: [share: number, top: number];
  /** how the walking person looks: Итар Пејо in folk costume, a man in a dark suit (Kavadarci), or
   *  Милтон Манаки with his film camera (Bitola; his action films an оро instead of dancing it) */
  walker: 'pejo' | 'suit' | 'manaki' | 'singo';
  /** the companion Шарпланинец in the dark coat of the Пелистер sheepdogs (Bitola); unset: grey-sand */
  darkDog?: boolean;
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
  bitola: {
    id: 'bitola', name: 'Битола', code: '097', icon: './favicon-bitola.svg',
    files: { scene: './bitola.json', terrainBin: './bitola-terrain.bin', terrainJson: './bitola-terrain.json' },
    sceneBytes: 5.3e6,
    views: {
      center: { place: 'square', ll: [41.03019, 21.3349], d: 560, polar: 0.74, az: 0.08 },
      shirok: { ll: [41.02700, 21.33610], d: 420, polar: 0.82, az: -0.15 }, // Широк Сокак from the south, Магнолија at its end
      heraclea: { place: 'heraclea', ll: [41.01111, 21.3424], d: 520, polar: 0.8, az: 0.4 },
      pelister: { place: 'pelister', ll: [41.00266, 21.18319], d: 5200, polar: 0.95, az: -Math.PI / 2 }, // the peak from the town, the plain behind the camera
      lakes: { place: 'golemo', ll: [40.96804, 21.20457], d: 1500, polar: 0.9, az: 0.4 }, // Пелистерски очи: Големо and Мало Езеро
      overview: { ll: [41.0200, 21.2830], d: 21000, polar: 0.62, az: 0 },
    },
    districts: [
      ['Битола', 41.0340, 21.3420], ['Баир', 41.03818, 21.33388], ['Ушици', 41.04037, 21.34186], ['Боримечка', 41.02177, 21.34748],
      ['Ново Стрежево', 41.05031, 21.33879], ['Горно Оризари', 41.05037, 21.34596], ['Пелистер', 41.00266, 21.18319, 80],
      // villages in the plain and on the slopes of Баба (OSM place nodes)
      ['Буково', 40.99475, 21.33244], ['Брусник', 41.02337, 21.28552], ['Лавци', 41.01445, 21.30206], ['Дихово', 41.0308, 21.26421],
      ['Нижеполе', 41.00891, 21.24456], ['Магарево', 41.04268, 21.23827], ['Трново', 41.04284, 21.24662], ['Братин Дол', 41.05527, 21.26149],
      ['Ротино', 41.05694, 21.2108], ['Раштани', 41.05271, 21.32543], ['Крклино', 41.07283, 21.33393], ['Кравари', 40.99576, 21.37883],
      ['Крстоар', 40.9917, 21.34701], ['Орехово', 40.98321, 21.31125], ['Бистрица', 40.98019, 21.36771], ['Поешево', 41.01564, 21.39125],
      ['Долно Оризари', 41.05098, 21.37793], ['Карамани', 41.06418, 21.39689],
    ],
    labels: [
      ['Плоштад Магнолија', 41.03019, 21.3349, 24, 'square'],
      ['Саат-кула', 41.03049, 21.33474, 34, 'clock'],
      ['Широк Сокак', 41.02600, 21.33610, 14],
      ['Безистен', 41.03280, 21.33650, 14, 'bezisten'],
      ['Стара чаршија', 41.03350, 21.33720, 20],
      ['Ајдар-кади џамија', 41.03497, 21.33847, 22, 'ajdar'],
      ['Исак џамија', 41.0321, 21.33402, 22, 'isak'],
      ['Св. Димитриј', 41.02999, 21.33392, 20, 'dimitrij'],
      ['Дом на култура', 41.02797, 21.33473, 16, 'culture'],
      ['Музеј на Битола', 41.0238, 21.33565, 16, 'museum'],
      ['Градски парк', 41.0225, 21.3330, 20, 'park'],
      ['Хераклеа Линкестис', 41.01111, 21.3424, 18, 'heraclea'],
      ['Драгор', 41.0323, 21.32275, 6, undefined, 'river'],
      ['Пелистер', 41.00266, 21.18319, 40, 'pelister'],
      ['Големо Езеро', 40.96804, 21.20457, 12, 'golemo'],
      ['Мало Езеро', 40.97743, 21.18625, 10, 'malo'],
    ],
    route: [
      ['Плоштад Магнолија', 41.03019, 21.3349, 70, 'square'],
      ['Широк Сокак', 41.02600, 21.33610, 60],
      ['Градски парк', 41.0225, 21.3330, 75, 'park'],
      ['Хераклеа Линкестис', 41.01111, 21.3424, 70, 'heraclea'],
      ['Буково', 40.99475, 21.33244, 90],
      ['Нижеполе', 41.00891, 21.24456, 110],
      ['Големо Езеро', 40.96804, 21.20457, 80, 'golemo'],
      ['Пелистер', 41.00266, 21.18319, 90, 'pelister'],
      ['Магарево', 41.04268, 21.23827, 110],
      ['Дихово', 41.0308, 21.26421, 95],
      ['Ајдар-кади џамија', 41.03497, 21.33847, 75, 'ajdar'],
      ['Плоштад', 41.03019, 21.3349, 65, 'square'],
    ],
    spots: [
      ['b.square', 'Плоштад Магнолија', 41.03019, 21.3349, 55, 'square'],
      ['b.clock', 'Саат-кула', 41.03049, 21.33474, 25, 'clock'],
      ['b.shirok', 'Широк Сокак', 41.02600, 21.33610, 60],
      ['b.bezisten', 'Безистен', 41.03280, 21.33650, 35, 'bezisten'],
      ['b.ajdar', 'Ајдар-кади џамија', 41.03497, 21.33847, 30, 'ajdar'],
      ['b.isak', 'Исак џамија', 41.0321, 21.33402, 30, 'isak'],
      ['b.dimitrij', 'Св. Димитриј', 41.02999, 21.33392, 30, 'dimitrij'],
      ['b.museum', 'Музеј на Битола', 41.0238, 21.33565, 40, 'museum'],
      ['b.heraclea', 'Хераклеа Линкестис', 41.01111, 21.3424, 120, 'heraclea'],
      ['b.pelister', 'Пелистер', 41.00266, 21.18319, 120, 'pelister'],
      ['b.lakes', 'Пелистерски очи', 40.96804, 21.20457, 200, 'golemo'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses (and no drivable double-decker) in Bitola
    terrainExag: 1, // true heights
    // the national park's forest on Баба: full density round the town, thinner (drawn larger) up the mountain
    treeThin: { ll: [41.03019, 21.3349], near: 4000, far: 9000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // Пелагонија: wheat and other fields on the plain round the town, a few vineyards
    vineyards: 700,
    vineShare: 0.08,
    walker: 'manaki',
    darkDog: true,
    snowLabel: 'weather.pelister',
    refillLabel: 'fire.refill.pelister',
    bestRaceKey: 'skopje.bestRace.bitola',
    banners: { fire: 'Манаки го сними спасувањето!', roll: 'Ај на Широк Сокак!' },
  },
  ohrid: {
    id: 'ohrid', name: 'Охрид, Струга', code: '096', icon: './favicon-ohrid.svg',
    files: { scene: './ohrid.json', terrainBin: './ohrid-terrain.bin', terrainJson: './ohrid-terrain.json' },
    sceneBytes: 9.4e6,
    views: {
      center: { place: 'square', ll: [41.11276, 20.79939], d: 600, polar: 0.74, az: 0.08 },
      kaneo: { place: 'kaneo', ll: [41.11112, 20.78877], d: 330, polar: 0.92, az: 0.9 }, // from the lake, the church on its rock
      samuil: { place: 'samuil', ll: [41.11524, 20.79109], d: 700, polar: 0.8, az: -0.2 },
      plaosnik: { place: 'plaosnik', ll: [41.11242, 20.79098], d: 380, polar: 0.82, az: 0.5 },
      struga: { place: 'struga', ll: [41.17780, 20.67850], d: 1400, polar: 0.78, az: 0.2 },
      naum: { place: 'naum', ll: [40.91395, 20.74064], d: 520, polar: 0.85, az: 2.6 },
      olake: { ll: [41.00000, 20.73500], d: 13000, polar: 1.18, az: Math.PI }, // down the length of the lake from above Ohrid, Св. Наум and Pogradec far off
      // the map is 19 × 35 km, much longer north–south: seen from the north, down the lake (the far end in the haze)
      overview: { ll: [41.05000, 20.73000], d: 24000, polar: 0.95, az: Math.PI },
    },
    districts: [
      ['Охрид', 41.1172, 20.8030], ['Струга', 41.1780, 20.6780], ['Охридско Езеро', 41.0300, 20.7200, 0],
      ['Поградец', 40.9020, 20.6540], ['Пештани', 41.0090, 20.8110], ['Трпејца', 40.9580, 20.7800], ['Љубаништа', 40.9230, 20.7600],
      ['Лагадин', 41.0560, 20.8060], ['Велгошти', 41.1270, 20.8240], ['Калишта', 41.1600, 20.6560], ['Радожда', 41.1050, 20.6380],
      ['Подмоље', 41.1460, 20.7490], ['Шум', 41.1900, 20.7160], ['Лин', 41.0600, 20.6350], ['Галичица', 40.9900, 20.8350, 120],
    ],
    labels: [
      ['Св. Јован Канео', 41.11112, 20.78877, 18, 'kaneo'],
      ['Самоилова тврдина', 41.11524, 20.79109, 30, 'samuil'],
      ['Плаошник', 41.11242, 20.79098, 22, 'plaosnik'],
      ['Св. Софија', 41.11205, 20.79418, 20, 'sofija'],
      ['Антички театар', 41.11465, 20.79380, 12, 'theatre'],
      ['Стара чаршија', 41.11420, 20.79950, 18],
      ['Чинар', 41.11602, 20.80032, 14],
      ['Св. Наум', 40.91395, 20.74064, 22, 'naum'],
      ['Залив на коските', 40.99436, 20.79813, 14, 'bones'],
      ['Црн Дрим', 41.17750, 20.67600, 6, undefined, 'river'],
    ],
    route: [
      ['Плоштад', 41.11276, 20.79939, 70, 'square'],
      ['Св. Софија', 41.11205, 20.79418, 75, 'sofija'],
      ['Св. Јован Канео', 41.11112, 20.78877, 60, 'kaneo'],
      ['Самоилова тврдина', 41.11524, 20.79109, 90, 'samuil'],
      ['Подмоље', 41.1460, 20.7490, 70],
      ['Струга', 41.17780, 20.67850, 70, 'struga'],
      ['Калишта', 41.1600, 20.6560, 60],
      ['Охридско Езеро', 41.0800, 20.7200, 45],
      ['Св. Наум', 40.91395, 20.74064, 70, 'naum'],
      ['Залив на коските', 40.99436, 20.79813, 55, 'bones'],
      ['Плаошник', 41.11242, 20.79098, 75, 'plaosnik'],
      ['Плоштад', 41.11276, 20.79939, 65, 'square'],
    ],
    spots: [
      ['o.square', 'Плоштад', 41.11276, 20.79939, 60, 'square'],
      ['o.kaneo', 'Св. Јован Канео', 41.11112, 20.78877, 40, 'kaneo'],
      ['o.samuil', 'Самоилова тврдина', 41.11524, 20.79109, 120, 'samuil'],
      ['o.plaosnik', 'Плаошник', 41.11242, 20.79098, 50, 'plaosnik'],
      ['o.sofija', 'Св. Софија', 41.11205, 20.79418, 40, 'sofija'],
      ['o.theatre', 'Антички театар', 41.11465, 20.79380, 40, 'theatre'],
      ['o.struga', 'Струга', 41.17780, 20.67850, 120, 'struga'],
      ['o.naum', 'Св. Наум', 40.91395, 20.74064, 80, 'naum'],
      ['o.bones', 'Залив на коските', 40.99436, 20.79813, 80, 'bones'],
      ['o.lake', 'Охридско Езеро', 41.11050, 20.79900, 60],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    // Галичица's forest and the hills round the lake: full density round Ohrid, thinner (drawn larger) far out
    treeThin: { ll: [41.11276, 20.79939], near: 4000, far: 10000, min: 0.1, grow: 1.7 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.galicica',
    refillLabel: 'fire.refill.ohrid',
    bestRaceKey: 'skopje.bestRace.ohrid',
    banners: { fire: 'Охридската пастрмка го спаси градот!', roll: 'Ајде на Канео!' },
  },
  rostuse: {
    id: 'rostuse', name: 'Ростуше, Дебар, Маврово', code: '042', icon: './favicon-rostuse.svg',
    files: { scene: './rostuse.json', terrainBin: './rostuse-terrain.bin', terrainJson: './rostuse-terrain.json' },
    sceneBytes: 5e6,
    views: {
      center: { ll: [41.61050, 20.59950], d: 650, polar: 0.76, az: 0.08 },
      bigorski: { place: 'bigorski', ll: [41.62116, 20.60940], d: 190, polar: 0.98, az: -1.9 }, // from the valley (west), the konaks up the slope
      debar: { ll: [41.52150, 20.52650], d: 1400, polar: 0.8, az: 0.2 },
      mavrovo: { ll: [41.68500, 20.76500], d: 6500, polar: 1.0, az: 0.5 }, // Мавровско Езеро from the south, Бистра behind the camera
      galicnik: { place: 'galicnik', ll: [41.59403, 20.65312], d: 700, polar: 0.86, az: -0.6 },
      // the map is 27 × 37 km of mountains: seen from the south-west, the two lakes at the ends
      overview: { ll: [41.59000, 20.68000], d: 23000, polar: 0.92, az: -0.6 },
    },
    districts: [
      ['Ростуше', 41.6105, 20.5995], ['Дебар', 41.5215, 20.5265], ['Маврово', 41.6500, 20.7370], ['Маврови Анови', 41.7050, 20.7600],
      ['Галичник', 41.5940, 20.6531], ['Жировница', 41.6740, 20.5870], ['Бистра', 41.6300, 20.7000, 80],
      ['Дебарско Езеро', 41.4600, 20.5500, 0], ['Мавровско Езеро', 41.6900, 20.7700, 0],
    ],
    labels: [
      ['Бигорски манастир', 41.62116, 20.60940, 30, 'bigorski'],
      ['Св. Никола', 41.66003, 20.73552, 12, 'nikola'],
      ['Брана Шпиље', 41.49385, 20.50558, 16, 'dam'],
      ['Свети Град', 41.44833, 20.59319, 16, 'svetigrad'],
      ['Дримколски манастир', 41.41366, 20.57021, 14],
      ['Радика', 41.6000, 20.5900, 6, undefined, 'river'],
      ['Црн Дрим', 41.4300, 20.5500, 6, undefined, 'river'],
    ],
    route: [
      ['Ростуше', 41.6105, 20.5995, 80],
      ['Бигорски манастир', 41.62116, 20.60940, 80, 'bigorski'],
      ['Жировница', 41.6740, 20.5870, 90],
      ['Маврово', 41.6500, 20.7370, 90],
      ['Мавровско Езеро', 41.6900, 20.7700, 50],
      ['Маврови Анови', 41.7050, 20.7600, 80],
      ['Галичник', 41.5940, 20.6531, 100, 'galicnik'],
      ['Дебар', 41.5215, 20.5265, 90],
      ['Брана Шпиље', 41.49385, 20.50558, 60, 'dam'],
      ['Дебарско Езеро', 41.4600, 20.5500, 50],
      ['Ростуше', 41.6105, 20.5995, 70],
    ],
    spots: [
      ['r.rostuse', 'Ростуше', 41.6105, 20.5995, 150],
      ['r.bigorski', 'Бигорски манастир', 41.62116, 20.60940, 60, 'bigorski'],
      ['r.debar', 'Дебар', 41.5215, 20.5265, 300],
      ['r.debarlake', 'Дебарско Езеро', 41.49385, 20.50558, 300, 'dam'],
      ['r.mavrovo', 'Мавровско Езеро', 41.6500, 20.7370, 300],
      ['r.nikola', 'Св. Никола', 41.66003, 20.73552, 50, 'nikola'],
      ['r.galicnik', 'Галичник', 41.5940, 20.6531, 200, 'galicnik'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    // the forests of Бистра and the Радика valley: full density round Ростуше and Бигорски, thinner (drawn larger) far out
    treeThin: { ll: [41.61500, 20.60500], near: 2500, far: 7000, min: 0.035, grow: 2.2 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.bistra',
    refillLabel: 'fire.refill.rostuse',
    bestRaceKey: 'skopje.bestRace.rostuse',
    banners: { fire: 'Бигорски е спасен!', roll: 'Ајде на Галичка свадба!' },
  },
  prilep: {
    id: 'prilep', name: 'Прилеп', code: '098', icon: './favicon-prilep.svg',
    files: { scene: './prilep.json', terrainBin: './prilep-terrain.bin', terrainJson: './prilep-terrain.json' },
    sceneBytes: 4.4e6,
    views: {
      center: { place: 'square', ll: [41.34560, 21.55300], d: 560, polar: 0.74, az: 0.08 },
      markovi: { ll: [41.36165, 21.53850], d: 1100, polar: 0.86, az: 0.35 }, // the fortress hill from the town
      mogila: { place: 'mogila', ll: [41.33424, 21.55457], d: 240, polar: 0.92, az: 0.5 },
      treskavec: { place: 'treskavec', ll: [41.40378, 21.53811], d: 520, polar: 0.9, az: 0.5 },
      plake: { ll: [41.38750, 21.60000], d: 1300, polar: 0.98, az: 0.6 }, // under the clouds (about 1 km up)
      overview: { ll: [41.36000, 21.56000], d: 17000, polar: 0.66, az: 0 },
    },
    districts: [
      ['Прилеп', 41.3440, 21.5560], ['Варош', 41.3585, 21.5330], ['Дабница', 41.3725, 21.5605], ['Оревоец', 41.3666, 21.5983],
      ['Лениште', 41.3584, 21.6272], ['Селце', 41.3257, 21.5936], ['Златоврв', 41.40604, 21.54194, 60], ['Маркови Кули', 41.36165, 21.53850, 40],
    ],
    labels: [
      ['Саат-кула', 41.34589, 21.55505, 44, 'pclock'],
      ['Стара чаршија', 41.34560, 21.55500, 18],
      ['Чарши џамија', 41.34553, 21.55530, 16],
      ['Маркови Кули', 41.36165, 21.53850, 40],
      ['Могила на непобедените', 41.33424, 21.55457, 14, 'mogila'],
      ['Трескавец', 41.40378, 21.53811, 24, 'treskavec'],
      ['Прилепско Езеро', 41.38750, 21.60000, 10],
      ['Театар Војдан Чернодрински', 41.34166, 21.55804, 16],
      ['Варошки манастир', 41.36027, 21.53426, 14],
    ],
    route: [
      ['Плоштад', 41.34560, 21.55300, 70, 'square'],
      ['Саат-кула', 41.34589, 21.55505, 80, 'pclock'],
      ['Варош', 41.3585, 21.5330, 80],
      ['Маркови Кули', 41.36165, 21.53850, 110],
      ['Трескавец', 41.40378, 21.53811, 90, 'treskavec'],
      ['Дабница', 41.3725, 21.5605, 80],
      ['Прилепско Езеро', 41.38750, 21.60000, 50],
      ['Оревоец', 41.3666, 21.5983, 80],
      ['Селце', 41.3257, 21.5936, 90],
      ['Могила на непобедените', 41.33424, 21.55457, 60, 'mogila'],
      ['Плоштад', 41.34560, 21.55300, 65, 'square'],
    ],
    spots: [
      ['p.square', 'Плоштад', 41.34560, 21.55300, 60, 'square'],
      ['p.clock', 'Саат-кула', 41.34589, 21.55505, 30, 'pclock'],
      ['p.markovi', 'Маркови Кули', 41.36165, 21.53850, 200],
      ['p.mogila', 'Могила на непобедените', 41.33424, 21.55457, 50, 'mogila'],
      ['p.treskavec', 'Трескавец', 41.40378, 21.53811, 80, 'treskavec'],
      ['p.lake', 'Прилепско Езеро', 41.38750, 21.60000, 250],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.34560, 21.55300], near: 3500, far: 8000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // Пелагонија north of the town: tobacco and wheat fields, a few vineyards
    vineyards: 760,
    vineShare: 0.1,
    walker: 'pejo',
    snowLabel: 'weather.zlatovrv',
    refillLabel: 'fire.refill.prilep',
    bestRaceKey: 'skopje.bestRace.prilep',
    banners: { fire: 'Крале Марко го спаси Прилеп!', roll: 'Ај на Пивофест!' },
  },
  krusevo: {
    id: 'krusevo', name: 'Крушево', code: '048', icon: './favicon-krusevo.svg',
    files: { scene: './krusevo.json', terrainBin: './krusevo-terrain.bin', terrainJson: './krusevo-terrain.json' },
    sceneBytes: 1.5e6,
    views: {
      center: { place: 'square', ll: [41.36858, 21.24895], d: 520, polar: 0.76, az: 0.08 },
      makedonium: { place: 'makedonium', ll: [41.37741, 21.24837], d: 110, polar: 1.08, az: 2.6 },
      meckin: { place: 'meckin', ll: [41.33773, 21.25800], d: 90, polar: 1.1, az: 0.4 },
      overview: { ll: [41.36800, 21.25000], d: 13000, polar: 0.66, az: 0 },
    },
    districts: [
      ['Крушево', 41.3700, 21.2480], ['Бушева Планина', 41.3900, 21.2250, 60], ['Вршник', 41.40254, 21.22326, 40],
    ],
    labels: [
      ['Плоштад Никола Мартиноски', 41.36858, 21.24895, 18, 'square'],
      ['Македониум', 41.37741, 21.24837, 24, 'makedonium'],
      ['Мечкин Камен', 41.33773, 21.25800, 18, 'meckin'],
      ['Спомен-куќа на Тоше Проески', 41.37441, 21.24629, 16, 'toshe'],
      ['Св. Никола', 41.36837, 21.24903, 18, 'nikola'],
      ['Музеј на Илинденското востание', 41.36907, 21.24529, 14, 'museum'],
      ['Споменик на Питу Гули', 41.36497, 21.24973, 10, 'pitu'],
      ['Крушевско Езеро', 41.37900, 21.24250, 8],
    ],
    route: [
      ['Плоштад', 41.36858, 21.24895, 60, 'square'],
      ['Св. Никола', 41.36837, 21.24903, 70, 'nikola'],
      ['Македониум', 41.37741, 21.24837, 70, 'makedonium'],
      ['Крушевско Езеро', 41.37900, 21.24250, 45],
      ['Вршник', 41.40254, 21.22326, 80],
      ['Мечкин Камен', 41.33773, 21.25800, 60, 'meckin'],
      ['Питу Гули', 41.36497, 21.24973, 60, 'pitu'],
      ['Плоштад', 41.36858, 21.24895, 55, 'square'],
    ],
    spots: [
      ['kr.square', 'Плоштад Никола Мартиноски', 41.36858, 21.24895, 50, 'square'],
      ['kr.makedonium', 'Македониум', 41.37741, 21.24837, 60, 'makedonium'],
      ['kr.meckin', 'Мечкин Камен', 41.33773, 21.25800, 50, 'meckin'],
      ['kr.toshe', 'Спомен-куќа на Тоше Проески', 41.37441, 21.24629, 30, 'toshe'],
      ['kr.lake', 'Крушевско Езеро', 41.37900, 21.24250, 120],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.36858, 21.24895], near: 3000, far: 7000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.busheva',
    refillLabel: 'fire.refill.krusevo',
    bestRaceKey: 'skopje.bestRace.krusevo',
    banners: { fire: 'Питу Гули го спаси Крушево!', roll: 'Да живее Крушевската Република!' },
  },
  kamenica: {
    id: 'kamenica', name: 'Македонска Каменица', code: '033', icon: './favicon-kamenica.svg',
    files: { scene: './kamenica.json', terrainBin: './kamenica-terrain.bin', terrainJson: './kamenica-terrain.json' },
    sceneBytes: 1.8e6,
    views: {
      center: { place: 'square', ll: [42.02165, 22.58816], d: 480, polar: 0.78, az: 0.1 },
      uspenie: { place: 'uspenie', ll: [42.02192, 22.58817], d: 95, polar: 1.08, az: 0.5 },
      kalimanci: { place: 'dam', ll: [41.97286, 22.58144], d: 1500, polar: 1.0, az: 2.7 },
      sasa: { place: 'mine', ll: [42.11426, 22.51931], d: 1500, polar: 0.9, az: 2.4 },
      overview: { ll: [42.01000, 22.60000], d: 19500, polar: 0.66, az: 0 },
    },
    districts: [
      ['Македонска Каменица', 42.0230, 22.5880], ['Саса', 42.09592, 22.54309, 30], ['Луковица', 42.02003, 22.61399, 30],
      ['Моштица', 42.07123, 22.57705, 30], ['Осогово', 42.1080, 22.6100, 60],
      ['Калиманци', 41.96531, 22.62984, 30], ['Бигла', 41.95721, 22.67400, 30],
    ],
    labels: [
      ['Плоштад', 42.02165, 22.58816, 14, 'square'],
      ['Успение на Пресвета Богородица', 42.02192, 22.58817, 22, 'uspenie'],
      ['Парк на рударите', 42.02181, 22.58855, 10, 'miners'],
      ['Стадион на ФК Саса', 42.01740, 22.58930, 10, 'stadium'],
      ['Езеро Калиманци', 41.99863, 22.60999, 8],
      ['Брана Калиманци', 41.97286, 22.58144, 20, 'dam'],
      ['Калата', 41.98655, 22.59090, 20, 'kalata'],
      ['Рудник Саса', 42.11426, 22.51931, 30, 'mine'],
      ['Каменичка Река', 42.04280, 22.56134, 6, undefined, 'river'],
      ['Брегалница', 41.98880, 22.66170, 6, undefined, 'river'],
    ],
    route: [
      ['Плоштад', 42.02165, 22.58816, 60, 'square'],
      ['Успение', 42.02192, 22.58817, 70, 'uspenie'],
      ['Каменичка Река', 42.04280, 22.56134, 60],
      ['Саса', 42.09592, 22.54309, 70, 'sasa'],
      ['Рудник Саса', 42.11426, 22.51931, 80, 'mine'],
      ['Осогово', 42.10469, 22.59506, 90],
      ['Езеро Калиманци', 42.00402, 22.58942, 40],
      ['Калата', 41.98655, 22.59090, 60, 'kalata'],
      ['Брана Калиманци', 41.97286, 22.58144, 60, 'dam'],
      ['Езеро Калиманци', 41.99593, 22.60757, 40],
      ['Езеро Калиманци', 41.99144, 22.63781, 40],
      ['Брегалница', 41.98880, 22.66170, 50],
      ['Плоштад', 42.02165, 22.58816, 55, 'square'],
    ],
    spots: [
      ['km.square', 'Плоштад', 42.02165, 22.58816, 50, 'square'],
      ['km.uspenie', 'Успение на Пресвета Богородица', 42.02192, 22.58817, 40, 'uspenie'],
      ['km.miners', 'Парк на рударите', 42.02181, 22.58855, 30, 'miners'],
      ['km.lake', 'Езеро Калиманци', 41.97976, 22.58096, 150],
      ['km.kalata', 'Калата', 41.98655, 22.59090, 60, 'kalata'],
      ['km.sasa', 'Рудник Саса', 42.11426, 22.51931, 150, 'mine'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [42.02165, 22.58816], near: 3000, far: 8000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.osogovo',
    refillLabel: 'fire.refill.kamenica',
    bestRaceKey: 'skopje.bestRace.kamenica',
    banners: { fire: 'Калиманци ја спаси Каменица!', roll: 'Среќно, рудари!' },
  },
  dojran: {
    id: 'dojran', name: 'Дојран', code: '034', icon: './favicon-dojran.svg',
    files: { scene: './dojran.json', terrainBin: './dojran-terrain.bin', terrainJson: './dojran-terrain.json' },
    sceneBytes: 1.4e6,
    views: {
      center: { place: 'square', ll: [41.18694, 22.72239], d: 460, polar: 0.8, az: 1.9 },
      dclock: { place: 'dclock', ll: [41.18503, 22.71975], d: 70, polar: 1.12, az: 1.6 },
      ilija: { place: 'ilija', ll: [41.18881, 22.71922], d: 95, polar: 1.05, az: 2.3 },
      mandra: { place: 'mandra', ll: [41.19628, 22.71722], d: 110, polar: 1.15, az: -1.9 },
      dlake: { ll: [41.19200, 22.71900], d: 2600, polar: 1.3, az: 1.9 }, // from over the lake back to Стар Дојран and its hills, under the clouds
      overview: { ll: [41.20500, 22.74000], d: 14500, polar: 0.66, az: 0 },
    },
    districts: [
      ['Стар Дојран', 41.18273, 22.72160], ['Нов Дојран', 41.21791, 22.70391], ['Дојрани', 41.17859, 22.76106, 40],
      ['Сретеново', 41.17261, 22.73157, 30], ['Николиќ', 41.26369, 22.74751, 30],
    ],
    labels: [
      ['Трите Јавори', 41.18694, 22.72239, 12, 'square'],
      ['Саат-кула', 41.18503, 22.71975, 20, 'dclock'],
      ['Св. Илија', 41.18881, 22.71922, 18, 'ilija'],
      ['Св. Марија Магдалена', 41.18783, 22.71964, 14, 'magdalena'],
      ['Мандра', 41.19628, 22.71722, 8, 'mandra'],
      ['Градска плажа', 41.18659, 22.72290, 8, 'beach'],
      ['Музеј на Дојран', 41.18703, 22.72207, 12, 'museum'],
      ['Споменик „Солунски фронт“', 41.19499, 22.68785, 14, 'front'],
      ['Кале Тепе', 41.19096, 22.68649, 30, 'kale'],
      ['Дојранско Езеро', 41.21152, 22.74612, 8],
    ],
    route: [
      ['Трите Јавори', 41.18694, 22.72239, 55, 'square'],
      ['Саат-кула', 41.18503, 22.71975, 60, 'dclock'],
      ['Мандра', 41.19628, 22.71722, 30, 'mandra'],
      ['Нов Дојран', 41.21791, 22.70391, 60, 'novdojran'],
      ['Дојранско Езеро', 41.24000, 22.73500, 35],
      ['Дојранско Езеро', 41.21152, 22.76500, 35],
      ['Дојрани', 41.17859, 22.76106, 60, 'doirani'],
      ['Дојранско Езеро', 41.19500, 22.74000, 35],
      ['Кале Тепе', 41.19096, 22.68649, 70, 'kale'],
      ['Солунски фронт', 41.19499, 22.68785, 60, 'front'],
      ['Св. Илија', 41.18881, 22.71922, 60, 'ilija'],
      ['Трите Јавори', 41.18694, 22.72239, 50, 'square'],
    ],
    spots: [
      ['dj.square', 'Трите Јавори', 41.18694, 22.72239, 50, 'square'],
      ['dj.clock', 'Саат-кула', 41.18503, 22.71975, 40, 'dclock'],
      ['dj.ilija', 'Св. Илија', 41.18881, 22.71922, 40, 'ilija'],
      ['dj.mandra', 'Мандра', 41.19628, 22.71722, 90, 'mandra'],
      ['dj.lake', 'Дојранско Езеро', 41.18659, 22.72290, 120, 'beach'],
      ['dj.front', 'Споменик „Солунски фронт“', 41.19499, 22.68785, 50, 'front'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.18694, 22.72239], near: 3000, far: 7000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.hills', // the hills round the lake (Беласица is outside the map)
    refillLabel: 'fire.refill.dojran',
    bestRaceKey: 'skopje.bestRace.dojran',
    banners: { fire: 'Дојранското Езеро го спаси Дојран!', roll: 'Ајде на дојранска мандра!' },
  },
  vevcani: {
    id: 'vevcani', name: 'Вевчани', code: '046', icon: './favicon-vevcani.svg',
    files: { scene: './vevcani.json', terrainBin: './vevcani-terrain.bin', terrainJson: './vevcani-terrain.json' },
    sceneBytes: 5e6,
    views: {
      center: { ll: [41.24030, 20.59230], d: 480, polar: 0.8, az: 0.2 },
      vvsprings: { ll: [41.23940, 20.58600], d: 150, polar: 0.55, az: 0.3 }, // the footbridges below the springs, from above (thick wood)
      vvnikola: { place: 'nikola', ll: [41.23963, 20.58969], d: 110, polar: 0.95, az: 0.3 },
      vvglobocica: { place: 'globocica', ll: [41.29500, 20.63700], d: 1800, polar: 1.1, az: 0.3 }, // under the clouds
      vvjablanica: { ll: [41.26000, 20.52500], d: 5000, polar: 0.9, az: 1.2 }, // the ridge from the east, over the villages
      // the map is an L round Охрид's map: its wide north part from the south-east
      overview: { ll: [41.27000, 20.64000], d: 24000, polar: 0.85, az: 0.3 },
    },
    districts: [
      ['Вевчани', 41.24027, 20.59227], ['Лабуништа', 41.26888, 20.59795, 30], ['Подгорци', 41.25930, 20.59717, 30],
      ['Требеништа', 41.20756, 20.75265, 30], ['Октиси', 41.23196, 20.60545, 30], ['Долна Белица', 41.21195, 20.63516, 30],
      ['Горна Белица', 41.22517, 20.55644, 30], ['Велешта', 41.24058, 20.64194, 30], ['Враништа', 41.21127, 20.66507, 30],
      ['Драслајца', 41.21597, 20.69258, 30], ['Делогожди', 41.25767, 20.72171, 30], ['Бороец', 41.28781, 20.59833, 30],
      ['Јабланица', 41.31978, 20.57327, 30], ['Глобочица', 41.31643, 20.64284, 30], ['Ботун', 41.28640, 20.78939, 30],
      ['Мислодежда', 41.30095, 20.69072, 30], ['Луково', 41.35568, 20.60837, 30], ['Вишни', 41.19412, 20.59297, 30],
      ['Јабланица', 41.27000, 20.51000, 150], ['Езеро Глобочица', 41.29500, 20.63700, 0],
    ],
    labels: [
      ['Вевчански извори', 41.23948, 20.58478, 10, 'springs'],
      ['Св. Никола', 41.23963, 20.58969, 18, 'nikola'],
      ['Св. Варвара', 41.24709, 20.59418, 12, 'varvara'],
      ['Св. Петка', 41.22474, 20.55662, 12, 'belica'],
      ['Св. Димитриј', 41.32908, 20.60077, 12, 'dimitrij'],
      ['Стар Локовски манастир', 41.38836, 20.65667, 12, 'lokov'],
      ['Црн Камен', 41.24620, 20.52182, 20, 'crnkamen'],
      ['Стрижак', 41.28461, 20.52955, 20, 'strizak'],
      ['Брана Глобочица', 41.33731, 20.63433, 14],
      ['Црн Дрим', 41.25000, 20.67000, 6, undefined, 'river'],
    ],
    route: [
      ['Вевчани', 41.24030, 20.59230, 60],
      ['Вевчански извори', 41.23948, 20.58478, 40, 'springs'],
      ['Горна Белица', 41.22517, 20.55644, 70],
      ['Црн Камен', 41.24620, 20.52182, 110, 'crnkamen'],
      ['Стрижак', 41.28461, 20.52955, 110, 'strizak'],
      ['Јабланица', 41.31978, 20.57327, 80],
      ['Брана Глобочица', 41.33731, 20.63433, 60],
      ['Езеро Глобочица', 41.29500, 20.63700, 50],
      ['Делогожди', 41.25767, 20.72171, 60],
      ['Требеништа', 41.20756, 20.75265, 60],
      ['Лабуништа', 41.26888, 20.59795, 60],
      ['Вевчани', 41.24030, 20.59230, 55],
    ],
    spots: [
      ['vv.village', 'Вевчани', 41.24030, 20.59230, 80],
      ['vv.springs', 'Вевчански извори', 41.23948, 20.58478, 60, 'springs'],
      ['vv.nikola', 'Св. Никола', 41.23963, 20.58969, 50, 'nikola'],
      ['vv.labunista', 'Лабуништа', 41.26888, 20.59795, 80],
      ['vv.globocica', 'Брана Глобочица', 41.33731, 20.63433, 200],
      ['vv.jablanica', 'Црн Камен', 41.24620, 20.52182, 300, 'crnkamen'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.24030, 20.59230], near: 3000, far: 9000, min: 0.04, grow: 2.2 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.jablanica',
    refillLabel: 'fire.refill.vevcani',
    bestRaceKey: 'skopje.bestRace.vevcani',
    banners: { fire: 'Изворите го спасија Вевчани!', roll: 'Поздрав од Вевчани!' },
  },
  matka: {
    id: 'matka', name: 'Матка', code: '02', icon: './favicon-matka.svg',
    files: { scene: './matka.json', terrainBin: './matka-terrain.bin', terrainJson: './matka-terrain.json' },
    sceneBytes: 5.6e6,
    views: {
      center: { place: 'andrej', ll: [41.95059, 21.29917], d: 420, polar: 0.85, az: 0.2 },
      mtandrej: { place: 'andrej', ll: [41.95059, 21.29917], d: 110, polar: 1.02, az: 0.5 },
      mtsisevo: { place: 'sisevo', ll: [41.95186, 21.30419], d: 170, polar: 0.62, az: 0.9 }, // from above: the church stands in thick wood
      mtlake: { ll: [41.93600, 21.29500], d: 1600, polar: 1.1, az: Math.PI }, // up the canyon from the south, under the clouds
      mtvrelo: { place: 'vrelo', ll: [41.93016, 21.29227], d: 420, polar: 0.98, az: -0.6 },
      mtbogorodica: { place: 'bogorodica', ll: [41.96190, 21.29630], d: 260, polar: 0.92, az: 0.3 },
      mttreska: { place: 'treska', ll: [41.98396, 21.31312], d: 1100, polar: 0.92, az: 0.2 },
      // the map is an L round Скопје and Брод (their maps are cut out): its wide north part from the south-east
      overview: { ll: [41.97500, 21.23000], d: 25000, polar: 0.85, az: 0.3 },
    },
    districts: [
      ['Сарај', 41.99992, 21.32820], ['Кондово', 42.01167, 21.31360, 30], ['Љубин', 42.00144, 21.30892, 30],
      ['Глумово', 41.97973, 21.30445, 30], ['Шишево', 41.97555, 21.31004, 30], ['Долна Матка', 41.96766, 21.30525, 30],
      ['Горна Матка', 41.96919, 21.28650, 30], ['Арнакија', 41.98701, 21.28860, 30], ['Бојане', 42.00000, 21.19244, 30],
      ['Буковиќ', 41.97416, 21.23902, 30], ['Ласкарци', 41.97143, 21.21034, 30], ['Семениште', 41.96702, 21.26101, 30],
      ['Копаница', 42.00699, 21.23849, 30], ['Рашче', 42.02348, 21.25146, 30], ['Горно Свиларе', 42.04360, 21.27920, 30],
      ['Кучково', 42.05751, 21.30619, 30], ['Јегуновце', 42.07348, 21.12019, 30], ['Желино', 41.98156, 21.06197, 30],
      ['Церово', 41.99242, 21.13520, 30], ['Групчин', 41.96766, 21.13134, 30], ['Добарце', 41.95476, 21.08909, 30],
      ['Паничари', 41.95368, 21.21097, 30], ['Мерово', 41.93740, 21.17450, 30], ['Гургурница', 41.84489, 21.10542, 30],
      ['Растеш', 41.74690, 21.10401, 30], ['Сува Гора', 41.94000, 21.22000, 150], ['Езеро Матка', 41.93800, 21.29600, 0],
    ],
    labels: [
      ['Св. Андреја', 41.95059, 21.29917, 16, 'andrej'],
      ['Св. Никола Шишевски', 41.95186, 21.30419, 18, 'sisevo'],
      ['Брана Матка', 41.95235, 21.29882, 12],
      ['Пештера Врело', 41.93016, 21.29227, 10, 'vrelo'],
      ['Манастир Матка', 41.96190, 21.29630, 14, 'bogorodica'],
      ['Езеро Матка', 41.94200, 21.29700, 8],
      ['Езеро Треска', 41.98396, 21.31312, 8, 'treska'],
      ['Св. Ѓорѓија', 42.06909, 21.30018, 14, 'gjorgjija'],
      ['Раса', 41.94068, 21.24636, 20],
      ['Треска', 41.97200, 21.30700, 6, undefined, 'river'],
    ],
    route: [
      ['Св. Андреја', 41.95059, 21.29917, 60, 'andrej'],
      ['Езеро Матка', 41.94200, 21.29700, 40],
      ['Пештера Врело', 41.93016, 21.29227, 50, 'vrelo'],
      ['Св. Никола Шишевски', 41.95186, 21.30419, 70, 'sisevo'],
      ['Манастир Матка', 41.96190, 21.29630, 60, 'bogorodica'],
      ['Езеро Треска', 41.98396, 21.31312, 50, 'treska'],
      ['Сарај', 41.99992, 21.32820, 60],
      ['Кучково', 42.05751, 21.30619, 70],
      ['Бојане', 42.00000, 21.19244, 70],
      ['Ласкарци', 41.97143, 21.21034, 70],
      ['Семениште', 41.96702, 21.26101, 70],
      ['Св. Андреја', 41.95059, 21.29917, 55, 'andrej'],
    ],
    spots: [
      ['ma.andrej', 'Св. Андреја', 41.95059, 21.29917, 50, 'andrej'],
      ['ma.dam', 'Брана Матка', 41.95235, 21.29882, 50],
      ['ma.sisevo', 'Св. Никола Шишевски', 41.95186, 21.30419, 50, 'sisevo'],
      ['ma.vrelo', 'Пештера Врело', 41.93016, 21.29227, 80, 'vrelo'],
      ['ma.bogorodica', 'Манастир Матка', 41.96190, 21.29630, 60, 'bogorodica'],
      ['ma.treska', 'Езеро Треска', 41.98396, 21.31312, 200, 'treska'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.95059, 21.29917], near: 3000, far: 9000, min: 0.04, grow: 2.2 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.matka',
    bestRaceKey: 'skopje.bestRace.matka',
    banners: { fire: 'Треска ја спаси Матка!', roll: 'Поздрав од Матка!' },
  },
  kocani: {
    id: 'kocani', name: 'Кочани', code: '0903', icon: './favicon-kocani.svg',
    files: { scene: './kocani.json', terrainBin: './kocani-terrain.bin', terrainJson: './kocani-terrain.json' },
    sceneBytes: 1.3e6,
    views: {
      center: { ll: [41.91900, 22.41000], d: 700, polar: 0.8, az: 0.15 },
      kkula: { place: 'kkula', ll: [41.92156, 22.40906], d: 100, polar: 1.0, az: 0.4 },
      ksaat: { place: 'ksaat', ll: [41.92341, 22.41207], d: 95, polar: 0.98, az: -0.5 },
      ksloboda: { place: 'ksloboda', ll: [41.91889, 22.40700], d: 75, polar: 0.9, az: 0.5 },
      kpole: { ll: [41.88000, 22.39000], d: 2600, polar: 1.05, az: 0.2 }, // the rice fields of Кочанско Поле toward the town, under the clouds
      overview: { ll: [41.86500, 22.39000], d: 21000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Кочани', 41.92113, 22.41142], ['Облешево', 41.88343, 22.33468, 30], ['Грдовци', 41.88126, 22.42037, 30],
      ['Зрновци', 41.85365, 22.44595, 30], ['Оризари', 41.92020, 22.44547, 30], ['Бели', 41.92805, 22.38023, 30],
      ['Тркање', 41.90494, 22.36159, 30], ['Бања', 41.91157, 22.33335, 30], ['Видовиште', 41.84493, 22.39764, 30],
      ['Мородвис', 41.84773, 22.41695, 30], ['Прибачево', 41.88682, 22.44237, 30],
      ['Долни Подлог', 41.88705, 22.36965, 30], ['Мојанци', 41.87375, 22.38153, 30], ['Теранци', 41.85154, 22.35495, 30],
      ['Кочанско Поле', 41.86500, 22.40500, 0], ['Плачковица', 41.81200, 22.41000, 150],
    ],
    labels: [
      ['Средновековна кула', 41.92156, 22.40906, 24, 'kkula'],
      ['Саат-кула', 41.92341, 22.41207, 20, 'ksaat'],
      ['Споменик на слободата', 41.91889, 22.40700, 16, 'ksloboda'],
      ['Општина Кочани', 41.92151, 22.41127, 16, 'townhall'],
      ['Св. Ѓорѓи', 41.91728, 22.40872, 16, 'gjorgji'],
      ['Св. Преображение', 41.91479, 22.42553, 14, 'preobrazenie'],
      ['Џамија Дуди Ханум', 41.92448, 22.41015, 14, 'dudi'],
      ['Споменик на Никола Карев', 41.91566, 22.41278, 10, 'karev'],
      ['Градски стадион', 41.90876, 22.40612, 14, 'stadium'],
      ['Манастир Добра Вода', 41.93802, 22.45968, 12, 'dobravoda'],
      ['Мородвис', 41.84845, 22.41794, 12, 'morodvis'],
      ['Оризишта', 41.88000, 22.39500, 6],
      ['Брегалница', 41.86600, 22.39400, 6, undefined, 'river'],
      ['Кочанска Река', 41.90358, 22.38287, 6, undefined, 'river'],
    ],
    route: [
      ['Средновековна кула', 41.92156, 22.40906, 60, 'kkula'],
      ['Споменик на слободата', 41.91889, 22.40700, 55, 'ksloboda'],
      ['Оризари', 41.92020, 22.44547, 60],
      ['Манастир Добра Вода', 41.93802, 22.45968, 60, 'dobravoda'],
      ['Прибачево', 41.88682, 22.44237, 50],
      ['Зрновци', 41.85365, 22.44595, 55],
      ['Мородвис', 41.84845, 22.41794, 55, 'morodvis'],
      ['Оризишта', 41.86600, 22.39400, 35],
      ['Облешево', 41.88343, 22.33468, 55],
      ['Бања', 41.91157, 22.33335, 60],
      ['Тркање', 41.90494, 22.36159, 50],
      ['Саат-кула', 41.92341, 22.41207, 55, 'ksaat'],
    ],
    spots: [
      ['ko.town', 'Кочани', 41.92120, 22.41090, 70],
      ['ko.kula', 'Средновековна кула', 41.92156, 22.40906, 40, 'kkula'],
      ['ko.saat', 'Саат-кула', 41.92341, 22.41207, 40, 'ksaat'],
      ['ko.sloboda', 'Споменик на слободата', 41.91889, 22.40700, 60, 'ksloboda'],
      ['ko.gjorgji', 'Св. Ѓорѓи', 41.91728, 22.40872, 50, 'gjorgji'],
      ['ko.rice', 'Оризишта', 41.90200, 22.40000, 150],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.92113, 22.41142], near: 3000, far: 8000, min: 0.06, grow: 2 },
    sparseFar: 1500,
    // Кочанско Поле: rice paddies on the low plain along the Брегалница, wheat and other fields above it, a few vineyards
    vineyards: 260,
    vineShare: 0.06,
    rice: [0.8, 40],
    walker: 'pejo',
    snowLabel: 'weather.plackovica',
    refillLabel: 'fire.refill.kocani',
    bestRaceKey: 'skopje.bestRace.kocani',
    banners: { fire: 'Брегалница го спаси Кочани!', roll: 'Свири, Кочани оркестар!' },
  },
  medzitlija: {
    id: 'medzitlija', name: 'Меџитлија', code: '047', icon: './favicon-medzitlija.svg',
    files: { scene: './medzitlija.json', terrainBin: './medzitlija-terrain.bin', terrainJson: './medzitlija-terrain.json' },
    sceneBytes: 1.3e6,
    views: {
      center: { ll: [40.92700, 21.42900], d: 620, polar: 0.8, az: 0.3 },
      mzdzamija: { ll: [40.92712, 21.42932], d: 95, polar: 1.2, az: 2.3 }, // from the north-east, as the photos
      mzgranica: { ll: [40.91814, 21.41744], d: 520, polar: 0.75, az: 1.9 }, // both canopies, the Greek one on the left
      mzvelusina: { place: 'mzvcrkva', ll: [40.92788, 21.34013], d: 95, polar: 1.05, az: -2.5 }, // the church and its tower, the konak behind
      mzpole: { ll: [40.91000, 21.39000], d: 2600, polar: 1.12, az: -1.75 }, // the fields of the plain from the west toward the border, under the clouds
      overview: { ll: [40.90250, 21.31750], d: 24000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Меџитлија', 40.92798, 21.42909], ['Кременица', 40.92367, 21.45772, 30], ['Лажец', 40.91209, 21.37829, 30],
      ['Породин', 40.93615, 21.37266, 30], ['Велушина', 40.92769, 21.35340, 30], ['Граешница', 40.90095, 21.34326, 30],
      ['Канино', 40.94587, 21.35445, 30], ['Барешани', 40.95299, 21.35550, 30], ['Острец', 40.92977, 21.30100, 30],
      ['Кишава', 40.88761, 21.31288, 30], ['Драгош', 40.88261, 21.35296, 30],
      ['Негочани', 40.90874, 21.42130, 30], ['Клабучишта', 40.87877, 21.40865, 30], ['Света Петка', 40.87974, 21.38103, 30],
      ['Опсирино', 40.87079, 21.35536, 30], ['Раково', 40.85653, 21.31305, 30], ['Битуша', 40.85988, 21.36907, 30],
      ['Горно Каленик', 40.86031, 21.45307, 30], ['Долно Каленик', 40.86478, 21.46684, 30],
      ['Пелагонија', 40.94500, 21.42500, 0], ['Баба', 40.91000, 21.23000, 150],
    ],
    labels: [
      ['Џамија', 40.92709, 21.42932, 26],
      ['Граничен премин Меџитлија', 40.92015, 21.41643, 18],
      ['Граничен премин Негочани', 40.91614, 21.41844, 18],
      ['Велушки манастир', 40.92788, 21.34013, 18, 'mzvcrkva'],
      ['Железничка станица Кременица', 40.91307, 21.46178, 12, 'kstation'],
      ['Св. Атанасиј', 40.92328, 21.45779, 12, 'katanasij'],
      ['Барешански манастир', 40.95221, 21.35054, 12, 'baresani'],
      ['Остречка џамија', 40.92958, 21.29940, 14, 'ostrec'],
      ['Св. Илија', 40.87834, 21.35798, 12, 'ilija'],
      ['Споменик на Коле Канински', 40.93608, 21.37221, 10, 'kaninski'],
      ['Рибници', 40.95198, 21.41083, 6],
      ['Вирој', 40.95195, 21.21137, 6],
      ['Негочанска Река', 40.90020, 21.39570, 6, undefined, 'river'],
      ['Лажечка Река', 40.89930, 21.36520, 6, undefined, 'river'],
    ],
    route: [
      ['Џамија', 40.92709, 21.42932, 60],
      ['Кременица', 40.92367, 21.45772, 55],
      ['Железничка станица', 40.91307, 21.46178, 50, 'kstation'],
      ['Негочани', 40.90874, 21.42130, 55],
      ['Клабучишта', 40.87877, 21.40865, 60],
      ['Света Петка', 40.87974, 21.38103, 60],
      ['Драгош', 40.88261, 21.35296, 60],
      ['Граешница', 40.90095, 21.34326, 60],
      ['Велушки манастир', 40.92788, 21.34013, 60, 'mzvcrkva'],
      ['Барешани', 40.95299, 21.35550, 60],
      ['Породин', 40.93615, 21.37266, 55],
      ['Лажец', 40.91209, 21.37829, 50],
      ['Граничен премин', 40.92015, 21.41643, 55],
    ],
    spots: [
      ['md.village', 'Меџитлија', 40.92740, 21.42975, 80],
      ['md.dzamija', 'Џамија', 40.92709, 21.42932, 40],
      ['md.granica', 'Граничен премин Меџитлија', 40.92015, 21.41643, 70],
      ['md.velusina', 'Велушки манастир', 40.92788, 21.34013, 60, 'mzvcrkva'],
      ['md.kremenica', 'Железничка станица Кременица', 40.91307, 21.46178, 50, 'kstation'],
      ['md.pole', 'Пелагонија', 40.93500, 21.40500, 200],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [40.92798, 21.42909], near: 4000, far: 9000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // Пелагонија: wheat and other fields on the plain on both sides of the border, a few vineyards
    vineyards: 300,
    vineShare: 0.08,
    walker: 'pejo',
    snowLabel: 'weather.baba',
    refillLabel: 'fire.refill.medzitlija',
    bestRaceKey: 'skopje.bestRace.medzitlija',
    banners: { fire: 'Пелагонија е спасена!', roll: 'Поздрав од Пелагонија!' },
  },
  kratovo: {
    id: 'kratovo', name: 'Кратово – Ѕинго Land', code: '031', icon: './favicon-kratovo.svg',
    files: { scene: './kratovo.json', terrainBin: './kratovo-terrain.bin', terrainJson: './kratovo-terrain.json' },
    sceneBytes: 2.3e6,
    views: {
      center: { place: 'krsquare', ll: [42.07800, 22.18172], d: 520, polar: 0.82, az: 0.35 },
      krkuli: { ll: [42.07860, 22.18080], d: 230, polar: 0.95, az: 0.6 }, // Симиќева, Златковичева and the Саат-кула along the river
      krmostovi: { ll: [42.07840, 22.18160], d: 150, polar: 1.0, az: -0.9 }, // Грофчански and Чаршијски мост from upstream
      krradin: { place: 'krradin', ll: [42.07556, 22.18439], d: 110, polar: 0.85, az: -0.9 },
      krkukli: { place: 'krkukli', ll: [42.10558, 22.05483], d: 260, polar: 1.0, az: 0.5 },
      krsingo: { place: 'krsingo', ll: [42.07911, 22.17281], d: 60, polar: 0.78, az: -1.45 }, // the house and its mural on the west wall
      krkratis: { place: 'krkratis', ll: [42.07762, 22.18084], d: 95, polar: 1.05, az: 0.75 }, // the hotel's front and its terrace
      krbazen: { place: 'krbazen', ll: [42.08027, 22.17845], d: 140, polar: 0.9, az: 0.4 }, // the pool from the south
      krgranica: { ll: [42.06880, 22.17208], d: 70, polar: 1.05, az: -0.6 }, // from the south-west: the canopy, the barrier, the flag
      krsign: { ll: [42.07150, 22.18030], d: 480, polar: 1.2, az: 3.0 }, // from over the town toward Баба, the letters on its face
      knezevo: { ll: [42.11100, 22.31000], d: 1700, polar: 1.12, az: 2.6 }, // the lake from the south-east, the dam on the right, under the clouds
      overview: { ll: [42.16000, 22.22000], d: 26000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Кратово', 42.07940, 22.17970], ['Куклица', 42.10500, 22.06900, 30], ['Кетеново', 42.10500, 22.08900, 30],
      ['Туралево', 42.08000, 22.12600, 30], ['Живалево', 42.09200, 22.11700, 30], ['Железница', 42.08400, 22.15300, 30],
      ['Шлегово', 42.06600, 22.16300, 30], ['Приковци', 42.06000, 22.14600, 30], ['Секулица', 42.04600, 22.05300, 30],
      ['Близанци', 42.05200, 22.21700, 30], ['Луково', 42.04700, 22.24500, 30], ['Мушково', 42.09500, 22.24900, 30],
      ['Којково', 42.08300, 22.27100, 30], ['Каврак', 42.12000, 22.27200, 30], ['Нежилово', 42.11400, 22.22900, 30],
      ['Главовица', 42.04700, 22.47700, 30], ['Полаки', 42.04300, 22.42700, 30],
      ['Ранковце', 42.16900, 22.11700, 30], ['Петралица', 42.21200, 22.18300, 30], ['Љубинци', 42.17000, 22.14400, 30],
      ['Гиновци', 42.17200, 22.16000, 30], ['Опила', 42.14300, 22.14800, 30], ['Одрено', 42.16000, 22.17000, 30],
      ['Псача', 42.16700, 22.20200, 30], ['Мождивњак', 42.16100, 22.24700, 30], ['Трновац', 42.12900, 22.07600, 30],
      ['Крилатица', 42.12600, 22.12000, 30], ['Ветуница', 42.15500, 22.09000, 30], ['Отошница', 42.19700, 22.08000, 30],
      ['Радибуш', 42.20000, 22.11000, 30], ['Милутинце', 42.20900, 22.15300, 30], ['Станча', 42.23500, 22.08400, 30],
      ['Криви Камен', 42.23900, 22.13700, 30], ['Баратлија', 42.24200, 22.20300, 30], ['Баштево', 42.22800, 22.24100, 30],
      ['Метежево', 42.27900, 22.22700, 30], ['Огут', 42.29400, 22.22400, 30], ['Нерав', 42.28900, 22.16800, 30],
      ['Герман', 42.27800, 22.10400, 30], ['Длабочица', 42.29300, 22.05000, 30],
      ['Калово', 42.33600, 22.17300, 30], ['Лесница', 42.33300, 22.13800, 30], ['Горњи Козји Дол', 42.32400, 22.10800, 30],
      ['Славиште', 42.19000, 22.14000, 0], ['Осогово', 42.09000, 22.40000, 150],
    ],
    labels: [
      ['Саат-кула', 42.07921, 22.18181, 26, 'krsaat'],
      ['Симиќева кула', 42.07870, 22.17947, 30, 'krsimic'],
      ['Златковичева кула', 42.07883, 22.18098, 22, 'krzlatko'],
      ['Крстева кула', 42.07691, 22.18260, 24, 'krkrste'],
      ['Хаџикостова кула', 42.07686, 22.18226, 20, 'krhadzi'],
      ['Емин-бегова кула', 42.07695, 22.18235, 18, 'kremin'],
      ['Радин мост', 42.07556, 22.18439, 14, 'krradin'],
      ['Грофчански мост', 42.07824, 22.18124, 12, 'krgrof'],
      ['Чаршијски мост', 42.07861, 22.18192, 12, 'krcarsija'],
      ['Јокширски мост', 42.07933, 22.18257, 12, 'krjoksir'],
      ['Св. Ѓорѓи Кратовски', 42.07780, 22.17607, 12, 'krgjorgji'],
      ['Хотел Кратис', 42.07762, 22.18084, 20, 'krkratis'],
      ['Ѕингова куќа', 42.07911, 22.17281, 12, 'krsingo'],
      ['ЅИНГО LAND', 42.07117, 22.18026, 60],
      ['Граница на Ѕинго Land', 42.06880, 22.17208, 12],
      ['Базен', 42.08027, 22.17845, 8, 'krbazen'],
      ['Св. Јован Претеча', 42.07590, 22.18311, 12, 'krjovan'],
      ['Камени Кукли', 42.10558, 22.05483, 14, 'krkukli'],
      ['Кнежевско Езеро', 42.11303, 22.31501, 8, 'knezevo'],
      ['Брана Кнежево', 42.10775, 22.30682, 20, 'krdam'],
      ['Света Троица', 42.27891, 22.10426, 12, 'krtrojca'],
      ['Кратовска Река', 42.07300, 22.18700, 6, undefined, 'river'],
      ['Крива Река', 42.17500, 22.13000, 6, undefined, 'river'],
      ['Злетовица', 42.08800, 22.30000, 6, undefined, 'river'],
    ],
    route: [
      ['Саат-кула', 42.07921, 22.18181, 60, 'krsaat'],
      ['Радин мост', 42.07556, 22.18439, 50, 'krradin'],
      ['Близанци', 42.05200, 22.21700, 60],
      ['Брана Кнежево', 42.10775, 22.30682, 60, 'krdam'],
      ['Кнежевско Езеро', 42.11303, 22.31501, 40, 'knezevo'],
      ['Мушково', 42.09500, 22.24900, 60],
      ['Нежилово', 42.11400, 22.22900, 60],
      ['Петралица', 42.21200, 22.18300, 60],
      ['Ранковце', 42.16900, 22.11700, 55],
      ['Отошница', 42.19700, 22.08000, 55],
      ['Камени Кукли', 42.10558, 22.05483, 45, 'krkukli'],
      ['Туралево', 42.08000, 22.12600, 60],
      ['Симиќева кула', 42.07870, 22.17947, 60, 'krsimic'],
    ],
    spots: [
      ['kr.town', 'Кратово', 42.07800, 22.18172, 70, 'krsquare'],
      ['kr.kuli', 'Симиќева кула', 42.07870, 22.17947, 40, 'krsimic'],
      ['kr.saat', 'Саат-кула', 42.07921, 22.18181, 35, 'krsaat'],
      ['kr.mostovi', 'Грофчански мост', 42.07824, 22.18124, 35, 'krgrof'],
      ['kr.radin', 'Радин мост', 42.07556, 22.18439, 40, 'krradin'],
      ['kr.kratis', 'Хотел Кратис', 42.07762, 22.18084, 35, 'krkratis'],
      ['kr.singo', 'Ѕингова куќа', 42.07911, 22.17281, 30, 'krsingo'],
      ['kr.sign', 'ЅИНГО LAND', 42.07117, 22.18026, 90],
      ['kr.granica', 'Граница на Ѕинго Land', 42.06880, 22.17208, 40],
      ['kr.bazen', 'Базен', 42.08027, 22.17845, 60, 'krbazen'],
      ['kr.kukli', 'Камени Кукли', 42.10558, 22.05483, 120, 'krkukli'],
      ['kr.knezevo', 'Кнежевско Езеро', 42.10775, 22.30682, 200, 'krdam'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [42.07940, 22.17970], near: 4000, far: 9000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // Славиште and the valleys round Кратово: wheat and other fields on the gentle land, a few vineyards
    vineyards: 200,
    vineShare: 0.05,
    walker: 'singo', // Ѕинго in the miner's helmet of „Силекс“ (src/walk.ts)
    snowLabel: 'weather.osogovo',
    refillLabel: 'fire.refill.kratovo',
    bestRaceKey: 'skopje.bestRace.kratovo',
    banners: { fire: 'Кратово е спасено!', roll: 'Поздрав од Ѕинго Land!' },
  },
  stip: {
    id: 'stip', name: 'Штип', code: '092', icon: './favicon-stip.svg',
    files: { scene: './stip.json', terrainBin: './stip-terrain.bin', terrainJson: './stip-terrain.json' },
    sceneBytes: 2.0e6,
    views: {
      center: { place: 'sqstip', ll: [41.73770, 22.19313], d: 620, polar: 0.82, az: 0.3 },
      isar: { place: 'isar', ll: [41.73850, 22.18656], d: 280, polar: 0.95, az: 0.5 }, // the fortress hill over the town and the Отиња
      bezisten: { place: 'bezisten', ll: [41.73754, 22.19263], d: 110, polar: 0.95, az: 0.4 },
      novoselo: { ll: [41.73550, 22.18300], d: 320, polar: 0.9, az: -0.6 }, // Ново Село's churches under Исар, from the west
      bargala: { place: 'bargala', ll: [41.79965, 22.29008], d: 220, polar: 0.95, az: 0.4 },
      bregalnica: { ll: [41.78000, 22.22000], d: 2600, polar: 1.05, az: 2.6 }, // the valley from the north-east toward the town, under the clouds
      overview: { ll: [41.77250, 22.19100], d: 26000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Штип', 41.73747, 22.19359], ['Ново Село', 41.73561, 22.18268], ['Баби', 41.76044, 22.20330], ['Леваци', 41.74069, 22.20829],
      ['Дузлак', 41.74958, 22.21059], ['Кежовица', 41.73346, 22.17732], ['Пребег', 41.74669, 22.17992],
      ['Карбинци', 41.81681, 22.23500, 30], ['Лакавица', 41.63873, 22.23602, 30], ['Три Чешми', 41.77297, 22.13376, 30],
      ['Криви Дол', 41.78648, 22.10472, 30], ['Сарчиево', 41.80992, 22.13486, 30], ['Долни Балван', 41.80457, 22.20237, 30],
      ['Таринци', 41.79871, 22.22943, 30], ['Козјак', 41.80923, 22.27389, 30], ['Радање', 41.77978, 22.27668, 30],
      ['Крупиште', 41.84217, 22.25053, 30], ['Уларци', 41.85834, 22.26483, 30], ['Чешиново', 41.86942, 22.28619, 30],
      ['Соколарци', 41.89705, 22.27944, 30], ['Спанчево', 41.90759, 22.31054, 30], ['Лепопелци', 41.90214, 22.21069, 30],
      ['Гујновци', 41.89194, 22.19920, 30], ['Лезово', 41.91658, 22.18291, 30], ['Бучиште', 41.92910, 22.19735, 30],
      ['Пестришно', 41.90911, 22.13372, 30], ['Мустафино', 41.84000, 22.07645, 30], ['Доброшани', 41.74158, 22.07718, 30],
      ['Софилари', 41.70841, 22.13756, 30], ['Драгоево', 41.67308, 22.13241, 30], ['Селце', 41.64952, 22.17121, 30],
      ['Пухче', 41.62823, 22.19803, 30], ['Горачино', 41.64149, 22.27820, 30], ['Шашаварлија', 41.71681, 22.28809, 30],
      ['Голем Габер', 41.75105, 22.30408, 30], ['Пенуш', 41.71196, 22.10761, 30],
    ],
    labels: [
      ['Исар', 41.73850, 22.18656, 30, 'isar'],
      ['Безистен', 41.73754, 22.19263, 14, 'bezisten'],
      ['Општина Штип', 41.73597, 22.19143, 14, 'townhall'],
      ['Св. Архангел Михаил', 41.73894, 22.18813, 12, 'mihailf'],
      ['Св. Спас', 41.73480, 22.18478, 12, 'spas'],
      ['Св. Јован Крстител', 41.73692, 22.18411, 12, 'jovan'],
      ['Св. Никола', 41.73657, 22.18887, 12, 'nikola'],
      ['Св. Илија', 41.73574, 22.19550, 12, 'ilija'],
      ['Св. Троица', 41.72971, 22.17517, 12, 'trojca'],
      ['Кадин Ана џамија', 41.73786, 22.19792, 12, 'kadin'],
      ['Хусамедин-пашина џамија', 41.73567, 22.19558, 12, 'husamedin'],
      ['Музеј Штип', 41.73665, 22.18975, 12, 'museum'],
      ['Народен театар', 41.73770, 22.19832, 12, 'theatre'],
      ['Спомен-костурница', 41.73831, 22.18752, 12, 'memorial'],
      ['Клисебаир', 41.72029, 22.19334, 20, 'klisebair'],
      ['Кежовица', 41.73341, 22.17737, 10, 'kezovica'],
      ['Градски стадион', 41.74282, 22.19038, 14, 'stadium'],
      ['Железничка станица', 41.75560, 22.17336, 10, 'station'],
      ['Баргала', 41.79965, 22.29008, 16, 'bargala'],
      ['Брегалница', 41.73000, 22.15500, 6, undefined, 'river'],
      ['Отиња', 41.73700, 22.19800, 6, undefined, 'river'],
      ['Злетовица', 41.88000, 22.24500, 6, undefined, 'river'],
      ['Козјачка Река', 41.79500, 22.28500, 6, undefined, 'river'],
    ],
    route: [
      ['Исар', 41.73850, 22.18656, 60, 'isar'],
      ['Безистен', 41.73754, 22.19263, 45, 'bezisten'],
      ['Баби', 41.76044, 22.20330, 55],
      ['Карбинци', 41.81681, 22.23500, 55],
      ['Крупиште', 41.84217, 22.25053, 55],
      ['Соколарци', 41.89705, 22.27944, 60],
      ['Чешиново', 41.86942, 22.28619, 55],
      ['Баргала', 41.79965, 22.29008, 50, 'bargala'],
      ['Радање', 41.77978, 22.27668, 55],
      ['Шашаварлија', 41.71681, 22.28809, 60],
      ['Лакавица', 41.63873, 22.23602, 60],
      ['Софилари', 41.70841, 22.13756, 55],
      ['Три Чешми', 41.77297, 22.13376, 55],
      ['Клисебаир', 41.72029, 22.19334, 60, 'klisebair'],
    ],
    spots: [
      ['st.town', 'Штип', 41.73770, 22.19313, 70, 'sqstip'],
      ['st.isar', 'Исар', 41.73850, 22.18656, 90, 'isar'],
      ['st.bezisten', 'Безистен', 41.73754, 22.19263, 35, 'bezisten'],
      ['st.novoselo', 'Ново Село', 41.73561, 22.18268, 80],
      ['st.kezovica', 'Кежовица', 41.73341, 22.17737, 50, 'kezovica'],
      ['st.bargala', 'Баргала', 41.79965, 22.29008, 120, 'bargala'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.73747, 22.19359], near: 4000, far: 9000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // the Брегалница valley and the plain round Карбинци: wheat and other fields, some vineyards on the slopes
    vineyards: 300, // m above the map's lowest point (195 m): the farmland up to ~500 m
    vineShare: 0.1,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.stip',
    bestRaceKey: 'skopje.bestRace.stip',
    banners: { fire: 'Брегалница го спаси Штип!', roll: 'Поздрав од Штип!' },
  },
  strumica: {
    id: 'strumica', name: 'Струмица', code: '0902', icon: './favicon-strumica.svg',
    files: { scene: './strumica.json', terrainBin: './strumica-terrain.bin', terrainJson: './strumica-terrain.json' },
    sceneBytes: 5.5e6,
    views: {
      center: { place: 'sqstrumica', ll: [41.43902, 22.63710], d: 620, polar: 0.82, az: 0.3 },
      carevi: { place: 'carevi', ll: [41.43243, 22.63007], d: 300, polar: 0.95, az: 0.6 }, // the fortress hill over the town
      leontij: { place: 'leontij', ll: [41.45058, 22.59024], d: 110, polar: 1.0, az: 0.4 },
      eleusa: { ll: [41.47485, 22.56517], d: 110, polar: 1.0, az: 0.5 },
      vodocha: { ll: [41.41715, 22.56158], d: 1800, polar: 1.1, az: 0.4 }, // the lake from the south-east, the dam on the left, under the clouds
      pole: { ll: [41.47000, 22.60000], d: 2600, polar: 1.05, az: -0.6 }, // the Струмица plain toward the town
      overview: { ll: [41.49000, 22.49000], d: 24000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Струмица', 41.43901, 22.63741], ['Водоча', 41.44980, 22.59207, 30], ['Вељуса', 41.47660, 22.56782, 30],
      ['Баница', 41.44624, 22.61007, 30], ['Попчево', 41.41522, 22.59198, 30], ['Раборци', 41.39732, 22.60012, 30],
      ['Три Води', 41.39593, 22.63138, 30], ['Добрејци', 41.46191, 22.65237, 30], ['Василево', 41.47421, 22.64394, 30],
      ['Градошорци', 41.48236, 22.62413, 30], ['Ангелци', 41.47859, 22.61477, 30], ['Седларци', 41.48973, 22.58375, 30],
      ['Едрениково', 41.50600, 22.58752, 30], ['Ново Владевци', 41.51934, 22.61277, 30], ['Сушево', 41.52884, 22.62924, 30],
      ['Требичино', 41.51622, 22.54614, 30], ['Дукатино', 41.54420, 22.54532, 30], ['Радичево', 41.53900, 22.56881, 30],
      ['Злеово', 41.55653, 22.60237, 30], ['Покрајчево', 41.57318, 22.57197, 30], ['Јаргулица', 41.58783, 22.56226, 30],
      ['Калуѓерица', 41.57072, 22.51538, 30], ['Сулдурци', 41.58235, 22.48564, 30], ['Воиславци', 41.58812, 22.47079, 30],
      ['Горни Липовиќ', 41.51066, 22.49285, 30], ['Долни Липовиќ', 41.50413, 22.45804, 30], ['Ракитец', 41.54310, 22.42516, 30],
      ['Дедино', 41.57145, 22.42392, 30], ['Габревци', 41.56440, 22.37896, 30], ['Конче', 41.49565, 22.38547, 30],
      ['Лубница', 41.50211, 22.36638, 30], ['Скоруша', 41.54310, 22.32454, 30], ['Рич', 41.44272, 22.51945, 30],
      ['Белотино', 41.43419, 22.54508, 30], ['Струмичко Поле', 41.47500, 22.59500, 0],
    ],
    labels: [
      ['Цареви Кули', 41.43243, 22.63007, 30, 'carevi'],
      ['Плоштад Гоце Делчев', 41.43902, 22.63710, 12, 'sqstrumica'],
      ['Манастир Св. Леонтиј', 41.45058, 22.59024, 14, 'leontij'],
      ['Св. Богородица Елеуса', 41.47485, 22.56517, 14, 'eleusa'],
      ['Водочко Езеро', 41.41715, 22.56158, 10, 'vodocha'],
      ['Брана Водоча', 41.42091, 22.56663, 20, 'vdam'],
      ['Мантово', 41.57297, 22.33891, 10, 'mantovo'],
      ['Градски парк', 41.44539, 22.63662, 10, 'park'],
      ['Стадион „Младост“', 41.44613, 22.63776, 14, 'stadium'],
      ['Театар „Антон Панов“', 41.44494, 22.64011, 12, 'theatre'],
      ['Дом на културата', 41.43907, 22.63647, 12, 'kultura'],
      ['Орта џамија', 41.43572, 22.63483, 12, 'orta'],
      ['Св. Кирил и Методиј', 41.43440, 22.63578, 12, 'kiril'],
      ['Св. 15 Тивериополски маченици', 41.42998, 22.64112, 12, 'maccenici'],
      ['Св. Григориј Палама', 41.43689, 22.64410, 12, 'palama'],
      ['Музеј Струмица', 41.43541, 22.63643, 10, 'museum'],
      ['Сулдуречки манастир', 41.58107, 22.48270, 12, 'suldurci'],
      ['Струмица', 41.54171, 22.58294, 6, undefined, 'river'],
      ['Водочница', 41.45154, 22.58876, 6, undefined, 'river'],
      ['Тркајна', 41.39656, 22.62234, 6, undefined, 'river'],
    ],
    route: [
      ['Цареви Кули', 41.43243, 22.63007, 60, 'carevi'],
      ['Плоштад Гоце Делчев', 41.43902, 22.63710, 45, 'sqstrumica'],
      ['Василево', 41.47421, 22.64394, 55],
      ['Сушево', 41.52884, 22.62924, 55],
      ['Злеово', 41.55653, 22.60237, 55],
      ['Јаргулица', 41.58783, 22.56226, 60],
      ['Сулдурци', 41.58235, 22.48564, 55],
      ['Мантово', 41.57297, 22.33891, 50, 'mantovo'],
      ['Конче', 41.49565, 22.38547, 55],
      ['Горни Липовиќ', 41.51066, 22.49285, 55],
      ['Вељуса', 41.47485, 22.56517, 45, 'eleusa'],
      ['Водочко Езеро', 41.41715, 22.56158, 40, 'vodocha'],
      ['Водоча', 41.45058, 22.59024, 45, 'leontij'],
      ['Раборци', 41.39732, 22.60012, 55],
    ],
    spots: [
      ['sr.town', 'Струмица', 41.43902, 22.63710, 70, 'sqstrumica'],
      ['sr.carevi', 'Цареви Кули', 41.43243, 22.63007, 120, 'carevi'],
      ['sr.leontij', 'Манастир Св. Леонтиј', 41.45058, 22.59024, 60, 'leontij'],
      ['sr.eleusa', 'Св. Богородица Елеуса', 41.47485, 22.56517, 50],
      ['sr.vodocha', 'Водочко Езеро', 41.42091, 22.56663, 200, 'vdam'],
      ['sr.mantovo', 'Мантово', 41.57297, 22.33891, 300, 'mantovo'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.43901, 22.63741], near: 4000, far: 9000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // Струмичко Поле: vegetable fields and orchards on the plain, a few vineyards on the slopes
    vineyards: 330, // m above the map's lowest point (77 m, the Вардар in the south-west corner): the farmland up to ~400 m
    vineShare: 0.08,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.strumica',
    bestRaceKey: 'skopje.bestRace.strumica',
    banners: { fire: 'Струмица е спасена!', roll: 'Поздрав од Струмица!' },
  },
  valandovo: {
    id: 'valandovo', name: 'Валандово', code: '034', icon: './favicon-valandovo.svg',
    files: { scene: './valandovo.json', terrainBin: './valandovo-terrain.bin', terrainJson: './valandovo-terrain.json' },
    sceneBytes: 2.3e6,
    views: {
      center: { place: 'valandovo', ll: [41.31734, 22.56198], d: 620, polar: 0.82, az: 0.3 },
      vaisar: { place: 'idomenae', ll: [41.27758, 22.49377], d: 320, polar: 0.95, az: 0.5 }, // the hill over Марвинци
      vamirlake: { place: 'mirlake', ll: [41.31321, 22.40443], d: 900, polar: 1.0, az: 0.4 },
      vavardar: { ll: [41.34000, 22.44500], d: 1600, polar: 1.05, az: -0.5 }, // the Вардар at Удово and Давидово
      vaanska: { ll: [41.30500, 22.53000], d: 2600, polar: 1.05, az: 0.6 }, // the Анска Река's orchards toward the town
      overview: { ll: [41.31500, 22.49000], d: 24000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Валандово', 41.31734, 22.56198], ['Раброво', 41.32112, 22.57952, 30], ['Пирава', 41.31982, 22.53270, 30],
      ['Јосифово', 41.33179, 22.47537, 30], ['Удово', 41.34714, 22.43559, 30], ['Давидово', 41.33179, 22.43229, 30],
      ['Миравци', 41.30881, 22.43534, 30], ['Габрово', 41.28582, 22.40155, 30], ['Петрово', 41.29540, 22.38357, 30],
      ['Милетково', 41.28350, 22.46259, 30], ['Смоквица', 41.25887, 22.46977, 30], ['Марвинци', 41.28360, 22.49860, 30],
      ['Грчиште', 41.25683, 22.49814, 30], ['Балинци', 41.28867, 22.51442, 30], ['Брајковци', 41.29228, 22.52309, 30],
      ['Казандол', 41.27486, 22.57297, 30], ['Дедели', 41.28392, 22.60526, 30], ['Собри', 41.29319, 22.63461, 30],
      ['Чалакли', 41.30409, 22.63931, 30], ['Мемешли', 41.33403, 22.64320, 30], ['Орманли', 41.34687, 22.65003, 30],
      ['Костурино', 41.35712, 22.60958, 30], ['Градец', 41.37808, 22.40190, 30],
    ],
    labels: [
      ['Исар (Идомене)', 41.27758, 22.49377, 30, 'idomenae'],
      ['Миравско Езеро', 41.31321, 22.40443, 10, 'mirlake'],
      ['Градски стадион', 41.31218, 22.55823, 14, 'stadium'],
      ['Св. Димитриј', 41.32157, 22.55722, 12, 'vdimitrij'],
      ['Св. Ѓорѓи', 41.32613, 22.54834, 12, 'vgjorgji'],
      ['Св. Илија', 41.31917, 22.57978, 12, 'rabrovo'],
      ['Св. Атанасиј', 41.34283, 22.44158, 12, 'udovo'],
      ['Успение на Пресвета Богородица', 41.33305, 22.47526, 12, 'josifovo'],
      ['Спомен-костурница', 41.34328, 22.44320, 12, 'kostur'],
      ['Висока Чука', 41.27371, 22.32375, 20],
      ['Красица', 41.30055, 22.63443, 20],
      ['Вардар', 41.33068, 22.45355, 6, undefined, 'river'],
      ['Анска Река', 41.29733, 22.54953, 6, undefined, 'river'],
    ],
    route: [
      ['Валандово', 41.31734, 22.56198, 45, 'valandovo'],
      ['Раброво', 41.32112, 22.57952, 50],
      ['Костурино', 41.35712, 22.60958, 55],
      ['Орманли', 41.34687, 22.65003, 55],
      ['Собри', 41.29319, 22.63461, 55],
      ['Казандол', 41.27486, 22.57297, 55],
      ['Исар', 41.27758, 22.49377, 55, 'idomenae'],
      ['Смоквица', 41.25887, 22.46977, 55],
      ['Габрово', 41.28582, 22.40155, 55],
      ['Миравско Езеро', 41.31321, 22.40443, 45, 'mirlake'],
      ['Удово', 41.34714, 22.43559, 50],
      ['Јосифово', 41.33179, 22.47537, 50],
      ['Пирава', 41.31982, 22.53270, 50],
    ],
    spots: [
      ['va.town', 'Валандово', 41.31734, 22.56198, 70, 'valandovo'],
      ['va.isar', 'Исар (Идомене)', 41.27758, 22.49377, 120, 'idomenae'],
      ['va.mirlake', 'Миравско Езеро', 41.31321, 22.40443, 200, 'mirlake'],
      ['va.vardar', 'Вардар', 41.33068, 22.45355, 250],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.31734, 22.56198], near: 4000, far: 9000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // the Валандово valley: orchards (pomegranates, figs) and fields, a few vineyards on the slopes
    vineyards: 250, // m above the map's lowest point (54 m, the Вардар in the south-west): the farmland up to ~300 m
    vineShare: 0.12,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.valandovo',
    bestRaceKey: 'skopje.bestRace.valandovo',
    banners: { fire: 'Валандово е спасено!', roll: 'Поздрав од Валандово!' },
  },
  vinica: {
    id: 'vinica', name: 'Виница', code: '033', icon: './favicon-vinica.svg',
    files: { scene: './vinica.json', terrainBin: './vinica-terrain.bin', terrainJson: './vinica-terrain.json' },
    sceneBytes: 2.24e6,
    views: {
      center: { place: 'vinica', ll: [41.88474, 22.50445], d: 650, polar: 0.8, az: 0.3 },
      vnkale: { place: 'vkale', ll: [41.87694, 22.50266], d: 320, polar: 0.95, az: 0.2 }, // the hill south-west of the town, the town behind it
      vnistibanja: { place: 'istlake', ll: [41.93563, 22.51189], d: 950, polar: 1.0, az: 0.3 },
      vnblatec: { place: 'blatec', ll: [41.83680, 22.57875], d: 1100, polar: 1.15, az: 2.9 }, // from the north, Плачковица behind it
      vnbregalnica: { ll: [41.90500, 22.48200], d: 1400, polar: 1.0, az: -0.4 }, // the river and the rice paddies west of the town
      vnistok: { ll: [41.89000, 22.64000], d: 2300, polar: 1.22, az: -1.6 }, // from the west over Драгобраште: Пекљани, Трсино, the hills toward Делчево
      overview: { ll: [41.87250, 22.58500], d: 23000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Виница', 41.88474, 22.50445], ['Лески', 41.86876, 22.48082, 30], ['Градец', 41.84896, 22.51055, 30],
      ['Блатец', 41.83680, 22.57875, 30], ['Јакимово', 41.90009, 22.51132, 30], ['Истибања', 41.93031, 22.50120, 30],
      ['Липец', 41.84151, 22.55269, 30], ['Пекљани', 41.87525, 22.62869, 30], ['Трсино', 41.91168, 22.64867, 30],
      ['Црн Камен', 41.92266, 22.53683, 30], ['Драгобраште', 41.89541, 22.60326, 30],
      ['Грљани', 41.94064, 22.61067, 30], ['Виничка Кршла', 41.90961, 22.55517, 30], ['Трстија', 41.93494, 22.64513, 30],
      ['Плачковица', 41.81500, 22.60000, 150],
    ],
    labels: [
      ['Виничко Кале', 41.87694, 22.50266, 30, 'vkale'],
      ['Музеј Теракота', 41.88419, 22.50496, 14, 'vmuzej'],
      ['Св. Архангел Михаил', 41.88212, 22.50547, 12, 'vmihail'],
      ['Св. Лука', 41.88468, 22.51299, 12, 'vluka'],
      ['Св. Павле', 41.88454, 22.50502, 10, 'vpavle'],
      ['Свет Крст', 41.87890, 22.51059, 20, 'vkrst'],
      ['Горица', 41.89614, 22.48837, 14, 'vgorica'],
      ['Куќа на Ќазим-бег', 41.88219, 22.50828, 10, 'vkazim'],
      ['Истибањско Езеро', 41.93563, 22.51189, 10, 'istlake'],
      ['Чупино Брдо', 41.80793, 22.56069, 30, 'chupino'],
      ['Киселица', 41.93540, 22.54977, 20],
      ['Брегалница', 41.90831, 22.48015, 6, undefined, 'river'],
      ['Виничка Река', 41.87276, 22.51509, 6, undefined, 'river'],
      ['Пекљанска Река', 41.87599, 22.59351, 6, undefined, 'river'],
    ],
    route: [
      ['Виница', 41.88474, 22.50445, 45, 'vinica'],
      ['Виничко Кале', 41.87694, 22.50266, 50, 'vkale'],
      ['Лески', 41.86876, 22.48082, 50],
      ['Градец', 41.84896, 22.51055, 55],
      ['Липец', 41.84151, 22.55269, 55],
      ['Блатец', 41.83680, 22.57875, 55, 'blatec'],
      ['Пекљани', 41.87525, 22.62869, 55],
      ['Трсино', 41.91168, 22.64867, 60],
      ['Драгобраште', 41.89541, 22.60326, 55],
      ['Виничка Кршла', 41.90961, 22.55517, 55],
      ['Црн Камен', 41.92266, 22.53683, 55],
      ['Истибањско Езеро', 41.93563, 22.51189, 45, 'istlake'],
      ['Истибања', 41.93031, 22.50120, 50, 'istibanja'],
      ['Јакимово', 41.90009, 22.51132, 50],
      ['Свет Крст', 41.87890, 22.51059, 50, 'vkrst'],
    ],
    spots: [
      ['vn.town', 'Виница', 41.88474, 22.50445, 70, 'vinica'],
      ['vn.kale', 'Виничко Кале', 41.87694, 22.50266, 120, 'vkale'],
      ['vn.icons', 'Музеј Теракота', 41.88419, 22.50496, 40, 'vmuzej'],
      ['vn.istibanja', 'Истибањско Езеро', 41.93563, 22.51189, 200, 'istlake'],
      ['vn.blatec', 'Блатец', 41.83680, 22.57875, 200, 'blatec'],
      ['vn.bregalnica', 'Брегалница', 41.90831, 22.48015, 250],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.88474, 22.50445], near: 3500, far: 8500, min: 0.08, grow: 1.8 },
    sparseFar: 1500,
    // the east end of Кочанско Поле: rice paddies on the low plain along the Брегалница west of the town, fields and a few
    // vineyards above it
    vineyards: 260, // m above the map's lowest point (332 m, the Брегалница at the west edge)
    vineShare: 0.08,
    rice: [0.6, 40],
    walker: 'pejo',
    snowLabel: 'weather.plackovica',
    refillLabel: 'fire.refill.vinica',
    bestRaceKey: 'skopje.bestRace.vinica',
    banners: { fire: 'Виница е спасена!', roll: 'Поздрав од Виница!' },
  },
  probistip: {
    id: 'probistip', name: 'Пробиштип', code: '032', icon: './favicon-probistip.svg',
    files: { scene: './probistip.json', terrainBin: './probistip-terrain.bin', terrainJson: './probistip-terrain.json' },
    sceneBytes: 0.92e6,
    views: {
      center: { place: 'probistip', ll: [41.99984, 22.17848], d: 650, polar: 0.8, az: 0.3 },
      pblesnovo: { place: 'pblesnovo', ll: [42.01330, 22.22750], d: 300, polar: 0.95, az: 0.4 }, // the monastery's court, Илин врв behind it
      pbzletovo: { place: 'pbzletovo', ll: [41.98830, 22.23473], d: 750, polar: 1.0, az: 0.3 },
      pbmine: { ll: [41.98300, 22.17800], d: 1100, polar: 1.0, az: -0.5 }, // the mine's works and the tailings pond south of the town
      pblake: { place: 'pblake', ll: [41.96300, 22.41000], d: 1100, polar: 1.05, az: 0.1 }, // from the dam up the lake
      pbosogovo: { place: 'pbponikva', ll: [42.03484, 22.35580], d: 2000, polar: 1.15, az: 0.2 }, // Пониква on Осогово from the south
      overview: { ll: [41.99250, 22.27850], d: 28000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Пробиштип', 41.99984, 22.17848], ['Злетово', 41.98830, 22.23473, 30], ['Лесново', 42.01405, 22.22921, 30],
      ['Добрево', 42.02415, 22.19706, 30], ['Древено', 42.00738, 22.21214, 30], ['Турско Рудари', 41.98135, 22.25753, 30],
      ['Шталковица', 41.99609, 22.28422, 30], ['Ратавица', 41.96783, 22.21742, 30], ['Бунеш', 41.95258, 22.23616, 30],
      ['Пантелеј', 41.96564, 22.31660, 30], ['Нивичани', 41.95515, 22.33822, 30], ['Стрмош', 41.98197, 22.16270, 30],
      ['Плешенци', 41.99822, 22.13502, 30], ['Долни Стубол', 41.99927, 22.12186, 30], ['Горно Барбарево', 41.99348, 22.07077, 30],
      ['Марчино', 42.02486, 22.17704, 30], ['Неокази', 41.96066, 22.19135, 30], ['Дренак', 41.96681, 22.15053, 30],
      ['Јастребник', 42.00456, 22.41801, 30], ['Костин Дол', 42.02059, 22.45387, 30],
      ['Осогово', 42.02000, 22.36000, 150],
    ],
    labels: [
      ['Лесновски манастир', 42.01330, 22.22750, 20, 'pblesnovo'],
      ['Св. Архангел Михаил', 42.01330, 22.22820, 12, 'pbmihail'],
      ['Св. Гаврил Лесновски', 41.99988, 22.17842, 10, 'pbgavril'],
      ['Аквапарк', 42.00590, 22.17550, 10, 'pbaqua'],
      ['Кочанско Езеро', 41.96300, 22.41000, 10, 'pblake'],
      ['Брана Гратче', 41.95940, 22.40830, 10],
      ['Кундиско Езеро', 42.03070, 22.15520, 10, 'pbkundino'],
      ['Св. Пантелејмон', 41.96860, 22.30910, 12, 'pbpantelej'],
      ['Зеленград', 42.03291, 22.30860, 30, 'pbzelengrad'],
      ['Пониква', 42.03484, 22.35580, 30, 'pbponikva'],
      ['Илин врв', 42.01940, 22.22820, 30],
      ['Јастребничка Чука', 42.00500, 22.40680, 30],
      ['Злетовица', 41.99260, 22.24210, 6, undefined, 'river'],
      ['Кочанска Река', 41.95500, 22.41000, 6, undefined, 'river'],
    ],
    route: [
      ['Пробиштип', 41.99984, 22.17848, 45, 'probistip'],
      ['Марчино', 42.02486, 22.17704, 50],
      ['Добрево', 42.02415, 22.19706, 50, 'pbdobrevo'],
      ['Лесновски манастир', 42.01330, 22.22750, 50, 'pblesnovo'],
      ['Злетово', 41.98830, 22.23473, 50, 'pbzletovo'],
      ['Турско Рудари', 41.98135, 22.25753, 50],
      ['Шталковица', 41.99609, 22.28422, 55],
      ['Зеленград', 42.03291, 22.30860, 60, 'pbzelengrad'],
      ['Пониква', 42.03484, 22.35580, 60, 'pbponikva'],
      ['Јастребник', 42.00456, 22.41801, 60, 'pbjastrebnik'],
      ['Кочанско Езеро', 41.96300, 22.41000, 45, 'pblake'],
      ['Св. Пантелејмон', 41.96860, 22.30910, 55, 'pbpantelej'],
      ['Ратавица', 41.96783, 22.21742, 50],
      ['Неокази', 41.96066, 22.19135, 50],
      ['Стрмош', 41.98197, 22.16270, 50],
    ],
    spots: [
      ['pb.town', 'Пробиштип', 41.99984, 22.17848, 70, 'probistip'],
      ['pb.lesnovo', 'Лесновски манастир', 42.01330, 22.22750, 120, 'pblesnovo'],
      ['pb.zletovo', 'Злетово', 41.98830, 22.23473, 150, 'pbzletovo'],
      ['pb.mine', 'Рудник Злетово', 41.98300, 22.17800, 250],
      ['pb.lake', 'Кочанско Езеро', 41.96300, 22.41000, 250, 'pblake'],
      ['pb.osogovo', 'Пониква', 42.03484, 22.35580, 200, 'pbponikva'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.99984, 22.17848], near: 3500, far: 8500, min: 0.1, grow: 1.6 },
    sparseFar: 1500,
    // the Злетовица valley and the low hills round Пробиштип: fields and a few vineyards, the Осогово slopes wooded
    vineyards: 250, // m above the map's lowest point (388 m, the Злетовица at the south edge)
    vineShare: 0.08,
    walker: 'pejo',
    snowLabel: 'weather.osogovo',
    refillLabel: 'fire.refill.probistip',
    bestRaceKey: 'skopje.bestRace.probistip',
    banners: { fire: 'Пробиштип е спасен!', roll: 'Поздрав од Пробиштип!' },
  },
  krivapalanka: {
    id: 'krivapalanka', name: 'Крива Паланка', code: '031', icon: './favicon-krivapalanka.svg',
    files: { scene: './krivapalanka.json', terrainBin: './krivapalanka-terrain.bin', terrainJson: './krivapalanka-terrain.json' },
    sceneBytes: 2.1e6,
    views: {
      center: { place: 'krivapalanka', ll: [42.20381, 22.33367], d: 650, polar: 0.82, az: 0.3 },
      kposogovo: { place: 'kpjoakim', ll: [42.20863, 22.36231], d: 320, polar: 0.95, az: 0.5 }, // the monastery on its hill above the town
      kpbazaar: { ll: [42.20280, 22.33450], d: 330, polar: 0.9, az: -0.3 }, // the old bazaar by the Крива Река and Св. Димитриј
      kpdevebair: { place: 'kpdevebair', ll: [42.22049, 22.45876], d: 600, polar: 0.95, az: -0.4 }, // the crossing, Гюешево past it
      kpreka: { ll: [42.20000, 22.39000], d: 2600, polar: 1.05, az: -1.3 }, // up the Крива Река from the town toward Деве Баир
      kpruen: { place: 'kpruen', ll: [42.15801, 22.51627], d: 2600, polar: 1.1, az: -0.2 }, // Руен, Осогово's top, from the north
      overview: { ll: [42.25000, 22.42000], d: 26000, polar: 0.72, az: 0 }, // 26 km: the controls' limit
    },
    districts: [
      ['Крива Паланка', 42.20381, 22.33367], ['Конопница', 42.18121, 22.28651, 30], ['Т\'лминци', 42.18653, 22.26225, 30],
      ['Градец', 42.21953, 22.30138, 30], ['Осиче', 42.24999, 22.30569, 30], ['Габар', 42.25071, 22.26035, 30],
      ['Добровница', 42.27532, 22.32243, 30], ['Трново', 42.27543, 22.38238, 30], ['Мала Црцорија', 42.28663, 22.34921, 30],
      ['Голема Црцорија', 42.31457, 22.33419, 30], ['Голеш', 42.32891, 22.33131, 30], ['Крстов Дол', 42.30720, 22.29842, 30],
      ['Подржи Коњ', 42.30490, 22.26796, 30], ['Варовиште', 42.21556, 22.36100, 30], ['Жидилово', 42.22483, 22.39826, 30],
      ['Кркља', 42.21482, 22.39623, 30], ['Узем', 42.22212, 22.42440, 30], ['Костур', 42.20571, 22.43700, 30],
      ['Дурачка Река', 42.18163, 22.36078, 30], ['Станци', 42.17687, 22.37648, 30], ['Б\'с', 42.18780, 22.38765, 30],
      ['Осогово', 42.15000, 22.42000, 150],
    ],
    labels: [
      ['Осоговски манастир', 42.20950, 22.36301, 20, 'kpbogorodica'],
      ['Св. Јоаким Осоговски', 42.20863, 22.36231, 12, 'kpjoakim'],
      ['Рождество на Пресвета Богородица', 42.20883, 22.36237, 10, 'kpbogorodica'],
      ['Св. Димитриј', 42.20227, 22.33567, 12, 'kpdimitrij'],
      ['Стара чаршија', 42.20280, 22.33450, 8],
      ['Градски музеј', 42.20201, 22.33490, 8, 'kpmuseum'],
      ['Градски стадион', 42.21108, 22.34294, 8, 'kpstadium'],
      ['Граничен премин Деве Баир', 42.22049, 22.45876, 14, 'kpdevebair'],
      ['Граничен премин Голеш', 42.32646, 22.33151, 14, 'kpgoles'],
      ['Станечки водопади', 42.17633, 22.39643, 10, 'kpvodopadi'],
      ['Руен', 42.15801, 22.51627, 40, 'kpruen'],
      ['Царев Врв', 42.12617, 22.45210, 40, 'kpcarev'],
      ['Трновски Ветер', 42.27035, 22.38196, 10, 'kpveter'],
      ['Крива Река', 42.20150, 22.34500, 6, undefined, 'river'],
      ['Крива Река', 42.19800, 22.42500, 6, undefined, 'river'],
    ],
    route: [
      ['Крива Паланка', 42.20381, 22.33367, 45, 'krivapalanka'],
      ['Осоговски манастир', 42.20950, 22.36301, 50, 'kpbogorodica'],
      ['Варовиште', 42.21556, 22.36100, 50],
      ['Жидилово', 42.22483, 22.39826, 55],
      ['Узем', 42.22212, 22.42440, 55],
      ['Деве Баир', 42.22049, 22.45876, 55, 'kpdevebair'],
      ['Костур', 42.20571, 22.43700, 55],
      ['Руен', 42.15801, 22.51627, 80, 'kpruen'],
      ['Царев Врв', 42.12617, 22.45210, 80, 'kpcarev'],
      ['Станечки водопади', 42.17633, 22.39643, 55, 'kpvodopadi'],
      ['Дурачка Река', 42.18163, 22.36078, 50],
      ['Конопница', 42.18121, 22.28651, 50],
      ['Градец', 42.21953, 22.30138, 50],
      ['Добровница', 42.27532, 22.32243, 55],
      ['Голема Црцорија', 42.31457, 22.33419, 55],
      ['Трново', 42.27543, 22.38238, 55],
      ['Стара чаршија', 42.20280, 22.33450, 45],
    ],
    spots: [
      ['kp.town', 'Крива Паланка', 42.20381, 22.33367, 70, 'krivapalanka'],
      ['kp.osogovo', 'Осоговски манастир', 42.20950, 22.36301, 120, 'kpbogorodica'],
      ['kp.bazaar', 'Стара чаршија', 42.20280, 22.33450, 80],
      ['kp.devebair', 'Деве Баир', 42.22049, 22.45876, 150, 'kpdevebair'],
      ['kp.reka', 'Крива Река', 42.20150, 22.34500, 150],
      ['kp.ruen', 'Руен', 42.15801, 22.51627, 300, 'kpruen'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [42.20381, 22.33367], near: 3500, far: 8500, min: 0.1, grow: 1.6 },
    sparseFar: 1500,
    // the high pastures of Осогово above ~1750 m (Руен 2251 m) stay bare
    treeLine: 1200, // m above the map's lowest point (547 m): ~1750 m
    // the fields and meadows of the Крива Река valley; no vineyards up here
    vineyards: 400,
    vineShare: 0.02,
    walker: 'pejo',
    snowLabel: 'weather.osogovo',
    refillLabel: 'fire.refill.krivapalanka',
    bestRaceKey: 'skopje.bestRace.krivapalanka',
    banners: { fire: 'Крива Паланка е спасена!', roll: 'Поздрав од Крива Паланка!' },
  },
  gevgelija: {
    id: 'gevgelija', name: 'Гевгелија, Богданци', code: '034', icon: './favicon-gevgelija.svg',
    files: { scene: './gevgelija.json', terrainBin: './gevgelija-terrain.bin', terrainJson: './gevgelija-terrain.json' },
    sceneBytes: 4.3e6,
    views: {
      center: { place: 'gevgelija', ll: [41.13887, 22.50332], d: 650, polar: 0.82, az: 0.3 },
      gvbogdanci: { place: 'gvbogdanci', ll: [41.20161, 22.57765], d: 650, polar: 0.85, az: 0.4 },
      gvwind: { ll: [41.22400, 22.55900], d: 1500, polar: 1.12, az: 2.7 }, // the wind farm's ridge from the north-west, the rotors facing the camera
      gvbanji: { place: 'gvbanji', ll: [41.17163, 22.49106], d: 380, polar: 0.92, az: 0.5 },
      gvborder: { place: 'gvborder', ll: [41.12767, 22.55154], d: 520, polar: 0.9, az: -0.6 }, // Богородица – Евзони on the motorway
      gvvardar: { ll: [41.15500, 22.52500], d: 2400, polar: 1.05, az: 0.2 }, // the Вардар past Гевгелија toward the border
      overview: { ll: [41.17000, 22.53500], d: 26000, polar: 0.72, az: 0 }, // 26 km: the controls' limit
    },
    districts: [
      ['Гевгелија', 41.13887, 22.50332], ['Богданци', 41.20161, 22.57765], ['Негорци', 41.18346, 22.47964, 30],
      ['Богородица', 41.14042, 22.54929, 30], ['Мачуково', 41.10470, 22.55756, 30], ['Сехово', 41.12208, 22.51086, 30],
      ['Моин', 41.13372, 22.44960, 30], ['Ново Конско', 41.15537, 22.43829, 30], ['Ума', 41.15045, 22.32781, 30],
      ['Серменин', 41.21921, 22.34533, 30], ['Кованец', 41.22470, 22.41375, 30], ['Прдејци', 41.20764, 22.50131, 30],
      ['Мрзенци', 41.16555, 22.50252, 30], ['Ѓавато', 41.19389, 22.53606, 30], ['Стојаково', 41.15615, 22.57805, 30],
      ['Селемли', 41.15077, 22.61743, 30], ['Фурка', 41.24117, 22.61330, 30], ['Црничани', 41.23580, 22.65452, 30],
    ],
    labels: [
      ['Негорски Бањи', 41.17163, 22.49106, 14, 'gvbanji'],
      ['Вардарски Рид', 41.14857, 22.52179, 20, 'gvrid'],
      ['Ветерен парк Богданци', 41.22600, 22.56000, 110],
      ['Граничен премин Богородица', 41.12767, 22.55154, 14, 'gvborder'],
      ['Св. Спас', 41.13916, 22.51091, 12, 'gvspas'],
      ['Св. Кирил и Методиј', 41.13898, 22.50426, 12, 'gvkiril'],
      ['Св. Петар и Павле', 41.13872, 22.50513, 12, 'gvpetar'],
      ['Централен Парк', 41.13917, 22.50256, 8, 'gvpark'],
      ['Два Коња', 41.14586, 22.50018, 8, 'gvkonji'],
      ['Споменик на слободата', 41.15826, 22.50068, 10, 'gvsloboda'],
      ['Градски парк Богданци', 41.20355, 22.57613, 8, 'gvbpark'],
      ['Св. Атанасиј', 41.20404, 22.57635, 12, 'gvbatanas'],
      ['Св. Атанасиј Велики', 41.18364, 22.47936, 12, 'gvnatanas'],
      ['Селемлиско Езеро', 41.14303, 22.61443, 8, 'gvselemli'],
      ['Вардар', 41.17200, 22.52600, 6, undefined, 'river'],
    ],
    route: [
      ['Гевгелија', 41.13887, 22.50332, 45, 'gevgelija'],
      ['Вардарски Рид', 41.14857, 22.52179, 55, 'gvrid'],
      ['Богородица', 41.14042, 22.54929, 50],
      ['Стојаково', 41.15615, 22.57805, 50],
      ['Селемли', 41.15077, 22.61743, 50],
      ['Богданци', 41.20161, 22.57765, 50, 'gvbogdanci'],
      ['Ветерен парк', 41.23000, 22.56300, 150],
      ['Фурка', 41.24117, 22.61330, 55],
      ['Прдејци', 41.20764, 22.50131, 55],
      ['Негорци', 41.18346, 22.47964, 50],
      ['Негорски Бањи', 41.17163, 22.49106, 45, 'gvbanji'],
      ['Ново Конско', 41.15537, 22.43829, 55],
      ['Моин', 41.13372, 22.44960, 55],
      ['Сехово', 41.12208, 22.51086, 50],
    ],
    spots: [
      ['gv.town', 'Гевгелија', 41.13887, 22.50332, 70, 'gevgelija'],
      ['gv.bogdanci', 'Богданци', 41.20161, 22.57765, 70, 'gvbogdanci'],
      ['gv.banji', 'Негорски Бањи', 41.17163, 22.49106, 120, 'gvbanji'],
      ['gv.rid', 'Вардарски Рид', 41.14857, 22.52179, 120, 'gvrid'],
      ['gv.border', 'Богородица', 41.12767, 22.55154, 150, 'gvborder'],
      ['gv.wind', 'Ветерен парк Богданци', 41.22600, 22.56000, 400],
      ['gv.vardar', 'Вардар', 41.17200, 22.52600, 250],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.13887, 22.50332], near: 4000, far: 9000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    // the Гевгелија plain: fields, orchards and the vineyards of the Гевгелиско-Валандовско wine region
    vineyards: 250, // m above the map's lowest point (the Вардар at the Greek border): the farmland up to ~300 m
    vineShare: 0.3,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.gevgelija',
    bestRaceKey: 'skopje.bestRace.gevgelija',
    banners: { fire: 'Гевгелија е спасена!', roll: 'Поздрав од Гевгелија!' },
  },
  korab: {
    id: 'korab', name: 'Кораб', code: '042', icon: './favicon-korab.svg',
    files: { scene: './korab.json', terrainBin: './korab-terrain.bin', terrainJson: './korab-terrain.json' },
    sceneBytes: 0.44e6,
    views: {
      // Голем Кораб from the east, over the high pastures above Стрезимир
      center: { place: 'kbkorab', ll: [41.79034, 20.54686], d: 3000, polar: 1.15, az: 1.3 },
      kbkorab: { place: 'kbkorab', ll: [41.79034, 20.54686], d: 1500, polar: 1.0, az: 2.3 }, // the summit from the north-east
      kbwaterfall: { place: 'kbwaterfall', ll: [41.76777, 20.54607], d: 2000, polar: 1.05, az: 1.0 }, // the waterfall's valley under Мал Кораб, from the north-east
      kbradika: { ll: [41.80500, 20.64500], d: 3500, polar: 1.15, az: 2.9 }, // the upper Радика from the north, toward Горна Река
      kbshar: { ll: [41.88500, 20.63000], d: 5500, polar: 1.12, az: 0.1 }, // the border ridge of Шар Планина from the south
      kbreka: { place: 'kbzuzne', ll: [41.75303, 20.62636], d: 1600, polar: 0.95, az: 0.2 }, // Жужње, Нистрово and Бибање
      // the map is 19 × 22 km: seen from the south-east, Кораб on the left, the Шар ridge at the back
      overview: { ll: [41.82500, 20.61000], d: 24000, polar: 0.9, az: 0.6 },
    },
    districts: [
      ['Жужње', 41.75303, 20.62636, 30], ['Нистрово', 41.73414, 20.63716, 30], ['Бибање', 41.73196, 20.62794, 30],
      ['Нивиште', 41.73103, 20.59121, 30], ['Ничпур', 41.74362, 20.67330, 30], ['Богдево', 41.74325, 20.70012, 30],
      ['Кракорница', 41.75583, 20.69363, 30], ['Бродец', 41.78854, 20.68696, 30], ['Стрезимир', 41.80522, 20.61963, 30],
      ['Кораб', 41.78500, 20.55500, 150], ['Шар Планина', 41.88000, 20.65000, 150], ['Горна Река', 41.75500, 20.66000, 40],
    ],
    labels: [
      ['Голем Кораб', 41.79034, 20.54686, 30, 'kbkorab'],
      ['Мал Кораб', 41.76935, 20.53554, 25, 'kbmalkorab'],
      ['Корабски водопад', 41.76777, 20.54607, 20, 'kbwaterfall'],
      ['Корабска Врата', 41.81508, 20.56481, 20, 'kbvrata'],
      ['Бело Капче', 41.78737, 20.56966, 20, 'kbbelokapce'],
      ['Црна Чука', 41.79843, 20.57253, 20, 'kbcrnacuka'],
      ['Калабак', 41.91751, 20.57577, 20, 'kbkallabak'],
      ['Шерупа', 41.87720, 20.59438, 20, 'kbsherupa'],
      ['Венец', 41.84834, 20.71860, 20, 'kbvenec'],
      ['Големокорабско Езеро', 41.78700, 20.55250, 10, 'kbgolemlake'],
      ['Малокорабско Езеро', 41.77200, 20.54150, 10, 'kbmallake'],
      ['Св. Петка', 41.78900, 20.68500, 12, 'kbbrodec'],
      ['Караула Стрезимир', 41.80522, 20.61963, 12, 'kbstrezimir'],
      ['Радика', 41.81700, 20.64300, 6, undefined, 'river'],
      ['Радика', 41.76500, 20.65500, 6, undefined, 'river'],
    ],
    route: [
      ['Стрезимир', 41.80522, 20.61963, 60, 'kbstrezimir'],
      ['Корабска Врата', 41.81508, 20.56481, 80, 'kbvrata'],
      ['Голем Кораб', 41.79034, 20.54686, 90, 'kbkorab'],
      ['Мал Кораб', 41.76935, 20.53554, 90, 'kbmalkorab'],
      ['Корабски водопад', 41.76777, 20.54607, 70, 'kbwaterfall'],
      ['Бело Капче', 41.78737, 20.56966, 80, 'kbbelokapce'],
      ['Шерупа', 41.87720, 20.59438, 80, 'kbsherupa'],
      ['Калабак', 41.91751, 20.57577, 80, 'kbkallabak'],
      ['Радика', 41.86000, 20.64000, 60],
      ['Венец', 41.84834, 20.71860, 80, 'kbvenec'],
      ['Бродец', 41.78854, 20.68696, 60, 'kbbrodecv'],
      ['Богдево', 41.74325, 20.70012, 60, 'kbbogdevo'],
      ['Ничпур', 41.74362, 20.67330, 60, 'kbnicpur'],
      ['Нистрово', 41.73414, 20.63716, 60, 'kbnistrovo'],
      ['Жужње', 41.75303, 20.62636, 60, 'kbzuzne'],
    ],
    spots: [
      ['kb.korab', 'Голем Кораб', 41.79034, 20.54686, 250, 'kbkorab'],
      ['kb.waterfall', 'Корабски водопад', 41.76777, 20.54607, 150, 'kbwaterfall'],
      ['kb.pastures', 'Стрезимир', 41.80522, 20.61963, 300, 'kbstrezimir'],
      ['kb.radika', 'Радика', 41.81700, 20.64300, 300],
      ['kb.shar', 'Шар Планина', 41.88500, 20.63000, 600],
      ['kb.reka', 'Горна Река', 41.75303, 20.62636, 300, 'kbzuzne'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    // bare high mountains: the woods of the Радика valley at full density round Горна Река, thinner (drawn larger) far out
    treeThin: { ll: [41.75500, 20.65000], near: 3000, far: 9000, min: 0.05, grow: 2 },
    treeLine: 850, // ~1780 m: the beech woods end there, above them pastures, scree and rock (the map's lowest point 928 m)
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.korab',
    refillLabel: 'fire.refill.korab',
    bestRaceKey: 'skopje.bestRace.korab',
    banners: { fire: 'Радика го спаси Кораб!', roll: 'Поздрав од Кораб!' },
  },
  golobrdo: {
    id: 'golobrdo', name: 'Голо Брдо', code: '046', icon: './favicon-golobrdo.svg',
    files: { scene: './golobrdo.json', terrainBin: './golobrdo-terrain.bin', terrainJson: './golobrdo-terrain.json' },
    sceneBytes: 3.4e6,
    views: {
      center: { place: 'square', ll: [41.68457, 20.43049], d: 650, polar: 0.78, az: 0.1 }, // Пешкопија's centre from the south
      gbxhamija: { place: 'gbxhamija', ll: [41.57824, 20.46576], d: 75, polar: 1.12, az: 0.4 }, // from the south, as the photos
      gbherbel: { place: 'gbherbel', ll: [41.61814, 20.47097], d: 60, polar: 1.1, az: -2.4 }, // the porch and the bell frame
      gbdrim: { ll: [41.52500, 20.46500], d: 2600, polar: 1.25, az: 3.0 }, // down the Црн Дрим's valley from the north, toward Дебар
      gbostren: { ll: [41.43000, 20.46000], d: 2600, polar: 1.08, az: -0.3 }, // Острени and the slopes of Голо Брдо
      // the map is 7.5 × 37 km: seen from the south-west along its length, Пешкопија at the far end
      overview: { ll: [41.53000, 20.44500], d: 26000, polar: 1.15, az: -0.3 },
    },
    districts: [
      ['Пешкопија', 41.68488, 20.42871], ['Макелари', 41.58897, 20.48638, 30], ['Горно Блато', 41.56363, 20.48951, 30],
      ['Долно Блато', 41.56240, 20.47764, 30], ['Ербеле', 41.62002, 20.46981, 30], ['Доволјани', 41.62083, 20.44865, 30],
      ['Граждани', 41.61108, 20.47526, 30], ['Алајбеговци', 41.57953, 20.46415, 30], ['Мајтаре', 41.56874, 20.47155, 30],
      ['Хомеш', 41.55219, 20.42795, 30], ['Горна Горица', 41.52877, 20.44503, 30], ['Шупенци', 41.53089, 20.42327, 30],
      ['Окшатина', 41.56378, 20.42856, 30], ['Тополјани', 41.58592, 20.42498, 30], ['Белово', 41.69700, 20.47504, 30],
      ['Мелани', 41.65492, 20.46459, 30], ['Дешат', 41.71202, 20.41514, 30], ['Спас', 41.55077, 20.48164, 30],
      ['Трбач', 41.48865, 20.47925, 30], ['Стригичани', 41.48851, 20.40757, 30], ['Љуболеш', 41.47555, 20.42700, 30],
      ['Радоешта', 41.44664, 20.47110, 30], ['Големо Острени', 41.43072, 20.45768, 30], ['Мало Острени', 41.43070, 20.49646, 30],
      ['Оржаново', 41.41956, 20.44752, 30], ['Лешничани', 41.42651, 20.41061, 30],
      ['Дибра', 41.64000, 20.43500, 0], ['Голо Брдо', 41.41500, 20.46500, 0],
    ],
    labels: [
      ['Алајбегова џамија', 41.57824, 20.46576, 22, 'gbxhamija'],
      ['Св. Преображение', 41.61814, 20.47097, 16, 'gbherbel'],
      ['Нова џамија', 41.68449, 20.43238, 20, 'gbxhamiare'],
      ['Музеј на Дибра', 41.68569, 20.42890, 14, 'gbmuzej'],
      ['Граничен премин Блато', 41.56315, 20.49231, 14],
      ['Лапидар', 41.52115, 20.43394, 10],
      ['Црн Дрим', 41.52800, 20.46120, 6, undefined, 'river'],
      ['Црн Дрим', 41.61300, 20.43650, 6, undefined, 'river'],
    ],
    route: [
      ['Пешкопија', 41.68457, 20.43049, 80],
      ['Белово', 41.69700, 20.47504, 70],
      ['Мелани', 41.65492, 20.46459, 70],
      ['Ербеле', 41.61814, 20.47097, 60, 'gbherbel'],
      ['Алајбегова џамија', 41.57824, 20.46576, 55, 'gbxhamija'],
      ['Макелари', 41.58897, 20.48638, 60],
      ['Граничен премин Блато', 41.56315, 20.49231, 55],
      ['Црн Дрим', 41.52800, 20.46120, 45],
      ['Трбач', 41.48865, 20.47925, 70],
      ['Големо Острени', 41.43072, 20.45768, 80],
      ['Љуболеш', 41.47555, 20.42700, 80],
      ['Горна Горица', 41.52877, 20.44503, 70],
      ['Окшатина', 41.56378, 20.42856, 70],
      ['Тополјани', 41.58592, 20.42498, 70],
      ['Пешкопија', 41.68457, 20.43049, 70],
    ],
    spots: [
      ['gb.peshkopi', 'Пешкопија', 41.68457, 20.43049, 150],
      ['gb.xhamija', 'Алајбегова џамија', 41.57824, 20.46576, 40, 'gbxhamija'],
      ['gb.herbel', 'Св. Преображение', 41.61814, 20.47097, 40, 'gbherbel'],
      ['gb.blato', 'Граничен премин Блато', 41.56315, 20.49231, 80],
      ['gb.drim', 'Црн Дрим', 41.52800, 20.46120, 200],
      ['gb.golobrdo', 'Голо Брдо', 41.43072, 20.45768, 250],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    // the wooded slopes of Дешат and the hills of Голо Брдо: full density round Пешкопија, thinner (drawn larger) far out
    treeThin: { ll: [41.66000, 20.44500], near: 3000, far: 9000, min: 0.05, grow: 2 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.golobrdo',
    bestRaceKey: 'skopje.bestRace.golobrdo',
    banners: { fire: 'Црн Дрим го спаси Голо Брдо!', roll: 'Поздрав од Голо Брдо!' },
  },
  batinci: {
    id: 'batinci', name: 'Батинци', code: '02', icon: './favicon-batinci.svg',
    files: { scene: './batinci.json', terrainBin: './batinci-terrain.bin', terrainJson: './batinci-terrain.json' },
    sceneBytes: 3.9e6,
    views: {
      center: { ll: [41.91966, 21.48139], d: 520, polar: 0.8, az: 0.3 },
      markov: { place: 'markov', ll: [41.89354, 21.40228], d: 85, polar: 1.08, az: 0.6 },
      dracevo: { place: 'dsquare', ll: [41.93762, 21.51881], d: 520, polar: 0.82, az: 0.2 },
      overview: { ll: [41.90500, 21.46500], d: 15000, polar: 0.66, az: 0 },
    },
    districts: [
      ['Батинци', 41.91966, 21.48139], ['Драчево', 41.93239, 21.52193], ['Пинтија', 41.95100, 21.48579, 30],
      ['Долно Количани', 41.88640, 21.48610, 30], ['Студеничани', 41.92014, 21.53531, 30],
    ],
    labels: [
      ['Марков манастир', 41.89354, 21.40228, 22, 'markov'],
      ['Плоштад на Бранителите', 41.93762, 21.51881, 12, 'dsquare'],
      ['Св. Спас', 41.93500, 21.51779, 14, 'spas'],
      ['Св. Еремија', 41.94534, 21.48383, 12, 'eremija'],
      ['Маркова Река', 41.91647, 21.46279, 6, undefined, 'river'],
    ],
    route: [
      ['Батинци', 41.91966, 21.48139, 60],
      ['Маркова Река', 41.92203, 21.47754, 40],
      ['Пинтија', 41.95100, 21.48579, 60],
      ['Драчево', 41.93762, 21.51881, 60, 'dsquare'],
      ['Студеничани', 41.92014, 21.53531, 60],
      ['Долно Количани', 41.88640, 21.48610, 70],
      ['Маркова Река', 41.91110, 21.44228, 40],
      ['Марков манастир', 41.89354, 21.40228, 60, 'markov'],
      ['Маркова Река', 41.90720, 21.42244, 40],
      ['Батинци', 41.91966, 21.48139, 55],
    ],
    spots: [
      ['bt.batinci', 'Батинци', 41.91966, 21.48139, 80],
      ['bt.markov', 'Марков манастир', 41.89354, 21.40228, 50, 'markov'],
      ['bt.dracevo', 'Драчево', 41.93762, 21.51881, 60, 'dsquare'],
      ['bt.river', 'Маркова Река', 41.92203, 21.47754, 60],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.91966, 21.48139], near: 3000, far: 7000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.batinci',
    bestRaceKey: 'skopje.bestRace.batinci',
    banners: { fire: 'Маркова Река го спаси Батинци!', roll: 'Поздрав од Батинци!' },
  },
  berovo: {
    id: 'berovo', name: 'Берово, Пехчево', code: '033', icon: './favicon-berovo.svg',
    files: { scene: './berovo.json', terrainBin: './berovo-terrain.bin', terrainJson: './berovo-terrain.json' },
    sceneBytes: 1.8e6,
    views: {
      center: { place: 'square', ll: [41.70654, 22.85682], d: 480, polar: 0.8, az: 0.3 },
      mihail: { place: 'mihail', ll: [41.70104, 22.85902], d: 90, polar: 1.08, az: 0.6 },
      blake: { place: 'lake', ll: [41.66800, 22.90300], d: 1600, polar: 1.0, az: 2.4 },
      bdam: { ll: [41.67078, 22.89440], d: 230, polar: 1.12, az: -0.95 },
      pehcevo: { place: 'pehcevo', ll: [41.76357, 22.88730], d: 600, polar: 0.82, az: 0.2 },
      overview: { ll: [41.70500, 22.88000], d: 19500, polar: 0.62, az: 0 },
    },
    districts: [
      ['Берово', 41.70667, 22.85356], ['Пехчево', 41.76357, 22.88730], ['Ратево', 41.67633, 22.85144, 30],
      ['Смојмирово', 41.73678, 22.84107, 30], ['Чифлик', 41.76099, 22.85659, 30], ['Спиково', 41.73952, 22.91755, 30],
      ['Умлена', 41.76830, 22.83679, 30], ['Негрево', 41.77500, 22.89697, 30],
    ],
    labels: [
      ['Плоштад „Димитар Беровски“', 41.70654, 22.85682, 12, 'square'],
      ['Св. Архангел Михаил', 41.70104, 22.85902, 16, 'mihail'],
      ['Рождество на Пресвета Богородица', 41.70676, 22.85707, 30, 'rozdestvo'],
      ['Градски парк', 41.70858, 22.85225, 10, 'park'],
      ['Беровско Езеро', 41.66800, 22.90300, 8, 'lake'],
      ['Брана', 41.67078, 22.89440, 20],
      ['Спиковски водопад', 41.73176, 22.93313, 20, 'spikovo'],
      ['Плоштад „Св. Петар и Павле“', 41.76207, 22.88728, 12],
      ['Ратевска Река', 41.67528, 22.85196, 6, undefined, 'river'],
    ],
    route: [
      ['Плоштад', 41.70654, 22.85682, 60, 'square'],
      ['Св. Архангел Михаил', 41.70104, 22.85902, 60, 'mihail'],
      ['Ратево', 41.67633, 22.85144, 60, 'ratevo'],
      ['Ратевска Река', 41.67117, 22.88225, 50],
      ['Брана', 41.67078, 22.89440, 45],
      ['Беровско Езеро', 41.66800, 22.90300, 40],
      ['Беровско Езеро', 41.66400, 22.91200, 40],
      ['Спиковски водопад', 41.73176, 22.93313, 80, 'spikovo'],
      ['Пехчево', 41.76357, 22.88730, 60, 'pehcevo'],
      ['Смојмирово', 41.73678, 22.84107, 60],
      ['Плоштад', 41.70654, 22.85682, 55, 'square'],
    ],
    spots: [
      ['br.square', 'Плоштад „Димитар Беровски“', 41.70654, 22.85682, 50, 'square'],
      ['br.mihail', 'Св. Архангел Михаил', 41.70104, 22.85902, 45, 'mihail'],
      ['br.rozdestvo', 'Рождество на Пресвета Богородица', 41.70676, 22.85707, 35, 'rozdestvo'],
      ['br.lake', 'Беровско Езеро', 41.67480, 22.89700, 150],
      ['br.dam', 'Брана', 41.67078, 22.89440, 60],
      ['br.pehcevo', 'Пехчево', 41.76207, 22.88728, 80],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.70654, 22.85682], near: 3000, far: 8000, min: 0.12, grow: 1.6 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill.berovo',
    bestRaceKey: 'skopje.bestRace.berovo',
    banners: { fire: 'Беровско Езеро го спаси Берово!', roll: 'Поздрав од Малешево!' },
  },
  tetovo: {
    id: 'tetovo', name: 'Тетово, Гостивар', code: '094', icon: './favicon-tetovo.svg',
    files: { scene: './tetovo.json', terrainBin: './tetovo-terrain.bin', terrainJson: './tetovo-terrain.json' },
    sceneBytes: 16e6,
    views: {
      center: { place: 'square', ll: [42.01008, 20.97057], d: 560, polar: 0.78, az: 0.1 },
      sarena: { place: 'sarena', ll: [42.00573, 20.96676], d: 95, polar: 1.05, az: 2.6 },
      tkale: { place: 'tkale', ll: [42.01938, 20.96008], d: 520, polar: 0.92, az: 0.5 }, // the fortress hill from the town
      lesok: { place: 'lesok', ll: [42.06681, 21.02798], d: 160, polar: 0.98, az: 0.4 },
      gostivar: { place: 'gsaat', ll: [41.79490, 20.91095], d: 240, polar: 0.95, az: 0.2 },
      vrutok: { place: 'vrutok', ll: [41.76403, 20.83696], d: 900, polar: 0.95, az: -0.5 },
      popova: { place: 'popova', ll: [42.01333, 20.88800], d: 1500, polar: 0.96, az: 0.9 }, // Попова Шапка, Титов Врв behind
      // the map is 28 × 39 km: the Полог valley from the south-east, Шар Планина along its west side
      overview: { ll: [41.90000, 20.89000], d: 24000, polar: 0.9, az: 0.55 },
    },
    districts: [
      ['Тетово', 42.00683, 20.97286], ['Гостивар', 41.79202, 20.90817], ['Боговиње', 41.92495, 20.91435, 30],
      ['Камењане', 41.94446, 20.92666, 30], ['Чегране', 41.83722, 20.97438, 30], ['Брвеница', 41.96617, 20.98049, 30],
      ['Шипковица', 42.03500, 20.91555, 30], ['Лешок', 42.06584, 21.03124, 30], ['Врапчиште', 41.83396, 20.88392, 30],
      ['Добри Дол', 41.86584, 20.88749, 30], ['Пирок', 41.91195, 20.91037, 30], ['Мала Речица', 41.99302, 20.94767, 30],
      ['Вруток', 41.76787, 20.83781, 30], ['Попова Шапка', 42.01333, 20.88800, 40], ['Шар Планина', 41.95500, 20.76000, 120],
    ],
    labels: [
      ['Плоштад „Илинден“', 42.01008, 20.97057, 12, 'square'],
      ['Шарена џамија', 42.00573, 20.96676, 22, 'sarena'],
      ['Арабати Баба Теќе', 42.00395, 20.95685, 14, 'teke'],
      ['Тетовско Кале', 42.01938, 20.96008, 20, 'tkale'],
      ['Лешочки манастир', 42.06681, 21.02798, 24, 'lesok'],
      ['Саат-кула', 41.79490, 20.91095, 36, 'gsaat'],
      ['Извор на Вардар', 41.76403, 20.83696, 10, 'vrutok'],
      ['Титов Врв', 41.99201, 20.79824, 20, 'titov'],
      ['Боговињско Езеро', 41.95015, 20.79306, 8, 'bogovinje'],
      ['Црно Езеро', 41.92620, 20.79120, 8],
      ['Бегов амам', 42.00628, 20.96735, 10],
      ['Вардар', 41.86000, 20.95600, 6, undefined, 'river'],
      ['Пена', 42.00900, 20.95500, 6, undefined, 'river'],
    ],
    route: [
      ['Плоштад „Илинден“', 42.01008, 20.97057, 70, 'square'],
      ['Шарена џамија', 42.00573, 20.96676, 60, 'sarena'],
      ['Тетовско Кале', 42.01938, 20.96008, 70, 'tkale'],
      ['Лешочки манастир', 42.06681, 21.02798, 70, 'lesok'],
      ['Попова Шапка', 42.01333, 20.88800, 90],
      ['Титов Врв', 41.99201, 20.79824, 110, 'titov'],
      ['Боговињско Езеро', 41.95015, 20.79306, 70, 'bogovinje'],
      ['Извор на Вардар', 41.76403, 20.83696, 80, 'vrutok'],
      ['Гостивар', 41.79490, 20.91095, 80, 'gsaat'],
      ['Вардар', 41.86000, 20.95600, 50],
      ['Плоштад „Илинден“', 42.01008, 20.97057, 60, 'square'],
    ],
    spots: [
      ['te.square', 'Плоштад „Илинден“', 42.01008, 20.97057, 60, 'square'],
      ['te.sarena', 'Шарена џамија', 42.00573, 20.96676, 45, 'sarena'],
      ['te.teke', 'Арабати Баба Теќе', 42.00395, 20.95685, 90, 'teke'],
      ['te.kale', 'Тетовско Кале', 42.01938, 20.96008, 150, 'tkale'],
      ['te.lesok', 'Лешочки манастир', 42.06681, 21.02798, 70, 'lesok'],
      ['te.gostivar', 'Саат-кула', 41.79490, 20.91095, 50, 'gsaat'],
      ['te.vrutok', 'Извор на Вардар', 41.76403, 20.83696, 120, 'vrutok'],
      ['te.popova', 'Попова Шапка', 42.01333, 20.88800, 250],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    // the forests of Шар Планина: full density round Тетово, thinner (drawn larger) far out
    treeThin: { ll: [42.00683, 20.97286], near: 3000, far: 9000, min: 0.04, grow: 2.2 },
    sparseFar: 1500,
    walker: 'pejo', // with the Шарпланинец, at home here
    snowLabel: 'weather.shar',
    refillLabel: 'fire.refill.tetovo',
    bestRaceKey: 'skopje.bestRace.tetovo',
    banners: { fire: 'Шар Планина го спаси Тетово!', roll: 'Поздрав од Полог!' },
  },
  brod: {
    id: 'brod', name: 'Македонски Брод', code: '045', icon: './favicon-brod.svg',
    files: { scene: './brod.json', terrainBin: './brod-terrain.bin', terrainJson: './brod-terrain.json' },
    sceneBytes: 4.3e6,
    views: {
      center: { place: 'square', ll: [41.50676, 21.21943], d: 480, polar: 0.8, az: 0.1 },
      zrze: { place: 'zrze', ll: [41.52130, 21.34220], d: 170, polar: 0.98, az: 0.5 },
      pesna: { place: 'pesna', ll: [41.54793, 21.25259], d: 600, polar: 0.95, az: -0.4 },
      kozjak: { place: 'kozjak', ll: [41.78000, 21.19900], d: 2000, polar: 1.12, az: 0.4 }, // under the clouds
      spdam: { ll: [41.92477, 21.26415], d: 230, polar: 0.9, az: Math.PI / 2 }, // from below the dam (east)
      solunska: { place: 'solunska', ll: [41.70391, 21.40416], d: 2600, polar: 0.92, az: -0.9 },
      // the map is 25 × 53 km along the Треска: seen from the south, the lakes to the north
      overview: { ll: [41.69000, 21.27000], d: 25000, polar: 0.9, az: 0.25 },
    },
    districts: [
      ['Македонски Брод', 41.50749, 21.21654], ['Самоков', 41.68049, 21.15040, 30], ['Девич', 41.55103, 21.22651, 30],
      ['Зрзе', 41.51583, 21.35244, 30], ['Требино', 41.52771, 21.21116, 30], ['Суводол', 41.52103, 21.23866, 30],
      ['Сланско', 41.48813, 21.22901, 30], ['Дебреште', 41.47899, 21.32710, 30], ['Модриште', 41.63937, 21.24399, 30],
      ['Калуѓерец', 41.66120, 21.24135, 30], ['Брезница', 41.73647, 21.22744, 30], ['Нова Брезница', 41.88677, 21.27839, 30],
      ['Јакупица', 41.72000, 21.37000, 150], ['Езеро Козјак', 41.80000, 21.19500, 0],
    ],
    labels: [
      ['Македонски Брод', 41.50676, 21.21943, 14, 'square'],
      ['Манастир Зрзе', 41.52130, 21.34220, 18, 'zrze'],
      ['Пешна', 41.54793, 21.25259, 14, 'pesna'],
      ['Девини Кули', 41.54175, 21.23741, 14, 'devini'],
      ['Брана Козјак', 41.87870, 21.19250, 20, 'kdam'],
      ['Брана Света Петка', 41.92477, 21.26415, 20],
      ['Акумулација Света Петка', 41.90286, 21.22774, 8, 'svpetka'],
      ['Езеро Козјак', 41.78000, 21.19900, 8, 'kozjak'],
      ['Солунска Глава', 41.70391, 21.40416, 20, 'solunska'],
      ['Треска', 41.52500, 21.21500, 6, undefined, 'river'],
    ],
    route: [
      ['Македонски Брод', 41.50676, 21.21943, 70, 'square'],
      ['Пешна', 41.54793, 21.25259, 80, 'pesna'],
      ['Зрзе', 41.52130, 21.34220, 80, 'zrze'],
      ['Солунска Глава', 41.70391, 21.40416, 120, 'solunska'],
      ['Езеро Козјак', 41.72000, 21.17500, 50],
      ['Езеро Козјак', 41.80000, 21.19500, 50],
      ['Брана Козјак', 41.87870, 21.19250, 70, 'kdam'],
      ['Света Петка', 41.90286, 21.22774, 50, 'svpetka'],
      ['Брана Света Петка', 41.92477, 21.26415, 60],
      ['Самоков', 41.68049, 21.15040, 80],
      ['Македонски Брод', 41.50676, 21.21943, 60, 'square'],
    ],
    spots: [
      ['mb.square', 'Македонски Брод', 41.50676, 21.21943, 80, 'square'],
      ['mb.zrze', 'Манастир Зрзе', 41.52130, 21.34220, 60, 'zrze'],
      ['mb.pesna', 'Пешна', 41.54793, 21.25259, 120, 'pesna'],
      ['mb.kozjak', 'Брана Козјак', 41.87870, 21.19250, 250, 'kdam'],
      ['mb.spetka', 'Брана Света Петка', 41.92477, 21.26415, 120],
      ['mb.solunska', 'Солунска Глава', 41.70391, 21.40416, 300, 'solunska'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.50749, 21.21654], near: 2500, far: 8000, min: 0.04, grow: 2.2 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.jakupica',
    refillLabel: 'fire.refill.brod',
    bestRaceKey: 'skopje.bestRace.brod',
    banners: { fire: 'Козјак го спаси Брод!', roll: 'Поздрав од Порече!' },
  },
  resen: {
    id: 'resen', name: 'Ресен', code: '047', icon: './favicon-resen.svg',
    files: { scene: './resen.json', terrainBin: './resen-terrain.bin', terrainJson: './resen-terrain.json' },
    sceneBytes: 6.8e6,
    views: {
      center: { place: 'square', ll: [41.09001, 21.01292], d: 480, polar: 0.8, az: 0.1 },
      saraj: { place: 'saraj', ll: [41.08813, 21.01590], d: 120, polar: 1.0, az: 0.2 },
      golemgrad: { place: 'gpetar', ll: [40.86950, 20.98900], d: 900, polar: 1.0, az: 0.5 },
      kurbinovo: { place: 'kurbinovo', ll: [40.98603, 21.08516], d: 160, polar: 0.98, az: -0.5 },
      prespa: { ll: [40.97900, 21.04600], d: 2000, polar: 1.12, az: -Math.PI / 2 }, // from over the lake east to Претор and Баба; under the clouds
      mprespa: { ll: [40.76000, 21.07000], d: 2000, polar: 1.12, az: 0.3 },
      // the map is 27 × 50 km: both lakes from the south-east, Галичица along the west
      overview: { ll: [40.91000, 21.00000], d: 25000, polar: 0.9, az: 0.35 },
    },
    districts: [
      ['Ресен', 41.09005, 21.01306], ['Љубојно', 40.89373, 21.13924, 30], ['Брајчино', 40.90741, 21.16000, 30],
      ['Претор', 40.97908, 21.06318, 30], ['Отешево', 40.98960, 20.91521, 30], ['Стење', 40.93982, 20.91170, 30],
      ['Коњско', 40.91093, 20.98735, 30], ['Курбиново', 40.98562, 21.06880, 30], ['Царев Двор', 41.04301, 21.00709, 30],
      ['Езерани', 41.02866, 21.02191, 30], ['Асамати', 40.98628, 21.05107, 30], ['Наколец', 40.89551, 21.11015, 30],
      ['Галичица', 40.97000, 20.86500, 150], ['Баба', 40.98000, 21.13000, 150],
      ['Преспанско Езеро', 40.92000, 21.02000, 0], ['Мала Преспа', 40.76000, 21.07000, 0],
    ],
    labels: [
      ['Плоштад', 41.09001, 21.01292, 12, 'square'],
      ['Ресенски сарај', 41.08813, 21.01590, 24, 'saraj'],
      ['Голем Град', 40.86950, 20.98900, 30, 'gpetar'],
      ['Св. Ѓорѓи, Курбиново', 40.98603, 21.08516, 14, 'kurbinovo'],
      ['Езерани', 41.02866, 21.02191, 10],
      ['Св. Ахил', 40.78815, 21.07934, 14, 'achilleios'],
    ],
    route: [
      ['Ресен', 41.09001, 21.01292, 70, 'square'],
      ['Ресенски сарај', 41.08813, 21.01590, 60, 'saraj'],
      ['Езерани', 41.02866, 21.02191, 50],
      ['Курбиново', 40.98603, 21.08516, 70, 'kurbinovo'],
      ['Претор', 40.97908, 21.06318, 50],
      ['Голем Град', 40.86950, 20.98900, 60, 'gpetar'],
      ['Мала Преспа', 40.78815, 21.07934, 50, 'achilleios'],
      ['Љубојно', 40.89373, 21.13924, 70],
      ['Стење', 40.93982, 20.91170, 60],
      ['Отешево', 40.98960, 20.91521, 60],
      ['Ресен', 41.09001, 21.01292, 60, 'square'],
    ],
    spots: [
      ['rs.square', 'Ресен', 41.09001, 21.01292, 70, 'square'],
      ['rs.saraj', 'Ресенски сарај', 41.08813, 21.01590, 60, 'saraj'],
      ['rs.golemgrad', 'Голем Град', 40.86950, 20.98900, 300, 'gpetar'],
      ['rs.kurbinovo', 'Св. Ѓорѓи, Курбиново', 40.98603, 21.08516, 50, 'kurbinovo'],
      ['rs.lake', 'Преспанско Езеро', 40.97908, 21.06318, 200],
      ['rs.achil', 'Св. Ахил', 40.78815, 21.07934, 120, 'achilleios'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.09005, 21.01306], near: 2500, far: 8000, min: 0.04, grow: 2.2 },
    sparseFar: 1500,
    walker: 'pejo',
    snowLabel: 'weather.baba',
    refillLabel: 'fire.refill.resen',
    bestRaceKey: 'skopje.bestRace.resen',
    banners: { fire: 'Преспа го спаси Ресен!', roll: 'Поздрав од Преспа!' },
  },
  negotino: {
    id: 'negotino', name: 'Неготино', code: '043', icon: './favicon-negotino.svg',
    files: { scene: './negotino.json', terrainBin: './negotino-terrain.bin', terrainJson: './negotino-terrain.json' },
    sceneBytes: 1.2e6,
    views: {
      center: { place: 'ngsquare', ll: [41.48431, 22.09079], d: 520, polar: 0.8, az: 0.1 },
      ngatanas: { place: 'ngatanas', ll: [41.48776, 22.09356], d: 110, polar: 0.98, az: -0.25 }, // from Партизанска, the bell tower on the left
      ngmanastir: { place: 'ngmanastir', ll: [41.49363, 22.10811], d: 150, polar: 0.98, az: 0.35 }, // the porch side, the bell tower behind
      ngtec: { ll: [41.45742, 22.16064], d: 900, polar: 1.22, az: 2.75 }, // the chimney from the Вардар to the north, all of it in view
      ngvardar: { ll: [41.51500, 22.12000], d: 2000, polar: 1.15, az: -2.5 }, // the Вардар's bends by Криволак, under the clouds
      // the map is 21.5 × 17.3 km, wider east–west: from the south
      overview: { ll: [41.51900, 22.19100], d: 27000, polar: 0.72, az: 0 },
    },
    districts: [
      ['Неготино', 41.48442, 22.09059], ['Тимјаник', 41.46835, 22.08219, 30], ['Дуброво', 41.47039, 22.14611, 30],
      ['Војшанци', 41.47562, 22.16525, 30], ['Бистренци', 41.44825, 22.20198, 30], ['Липа', 41.47867, 22.24618, 30],
      ['Брусник', 41.51168, 22.20617, 30], ['Калањево', 41.50540, 22.26466, 30], ['Пепелиште', 41.51894, 22.12836, 30],
      ['Криволак', 41.52728, 22.12140, 30], ['Вардар Чифлик', 41.54195, 22.11237, 30], ['Црвени Брегови', 41.53852, 22.08754, 30],
      ['Загорци', 41.54838, 22.30415, 30], ['Гарван', 41.55930, 22.28985, 30], ['Пиперово', 41.57478, 22.26899, 30],
      ['Лесковица', 41.59597, 22.24551, 30],
    ],
    labels: [
      ['Плоштад', 41.48431, 22.09079, 12, 'ngsquare'],
      ['Општина Неготино', 41.48357, 22.08901, 26, 'ngtownhall'],
      ['Дом на култура', 41.48445, 22.09117, 12, 'ngdom'],
      ['Св. Атанасиј Велики', 41.48776, 22.09356, 20, 'ngatanas'],
      ['Неготински манастир', 41.49363, 22.10811, 20, 'ngmanastir'],
      ['Спомен-костурница', 41.49066, 22.09903, 10, 'ngkosturnica'],
      ['Антигонеја', 41.50341, 22.10039, 8, 'ngantigona'],
      ['ЖС Неготино', 41.49770, 22.10448, 12, 'ngstation'],
      ['ТЕЦ Неготино', 41.45742, 22.16064, 135],
      ['Орлово Брдо', 41.57050, 22.13086, 20, 'orlovo'],
      ['Вардар', 41.50111, 22.12305, 6, undefined, 'river'],
    ],
    route: [
      ['Плоштад', 41.48431, 22.09079, 60, 'ngsquare'],
      ['Св. Атанасиј Велики', 41.48776, 22.09356, 50, 'ngatanas'],
      ['Неготински манастир', 41.49363, 22.10811, 50, 'ngmanastir'],
      ['Антигонеја', 41.50341, 22.10039, 50, 'ngantigona'],
      ['Пепелиште', 41.51894, 22.12836, 55],
      ['Вардар', 41.54035, 22.11734, 40],
      ['Орлово Брдо', 41.57050, 22.13086, 60, 'orlovo'],
      ['Пиперово', 41.57478, 22.26899, 60],
      ['Брусник', 41.51168, 22.20617, 60],
      ['Липа', 41.47867, 22.24618, 60],
      ['ТЕЦ Неготино', 41.46000, 22.16064, 90],
      ['Дуброво', 41.47039, 22.14611, 55],
      ['Тимјаник', 41.46835, 22.08219, 55],
      ['Плоштад', 41.48431, 22.09079, 60, 'ngsquare'],
    ],
    spots: [
      ['ng.town', 'Неготино', 41.48431, 22.09079, 70, 'ngsquare'],
      ['ng.atanas', 'Св. Атанасиј Велики', 41.48776, 22.09356, 40, 'ngatanas'],
      ['ng.manastir', 'Неготински манастир', 41.49363, 22.10811, 50, 'ngmanastir'],
      ['ng.antigona', 'Антигонеја', 41.50341, 22.10039, 120, 'ngantigona'],
      ['ng.tec', 'ТЕЦ Неготино', 41.45742, 22.16064, 250],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.48442, 22.09059], near: 3500, far: 9000, min: 0.1, grow: 1.7 },
    sparseFar: 1500,
    // Повардарие: vineyards and fields on the gentle land round the town and along the Вардар (the Тиквеш share)
    vineyards: 420,
    walker: 'suit', // the developer's walker, as on Кавадарци
    snowLabel: 'weather.hills',
    refillLabel: 'fire.refill',
    bestRaceKey: 'skopje.bestRace.negotino',
    banners: { fire: 'Неготино е спасено!', roll: 'Поздрав од Повардарие!' },
  },
  demirkapija: {
    id: 'demirkapija', name: 'Демир Капија', code: '043', icon: './favicon-demirkapija.svg',
    files: { scene: './demirkapija.json', terrainBin: './demirkapija-terrain.bin', terrainJson: './demirkapija-terrain.json' },
    sceneBytes: 1.9e6,
    views: {
      // the town at the mouth of the gorge with the wineries west of it, from the south
      center: { ll: [41.41000, 22.23700], d: 1500, polar: 0.86, az: 0.25 },
      dkpopova: { place: 'dkpopova', ll: [41.41063, 22.22630], d: 120, polar: 1.02, az: 0.75 }, // the tower and the arcade from the lawn
      dkvila: { place: 'dkvila', ll: [41.41424, 22.23290], d: 110, polar: 0.98, az: 0.35 }, // Вила Марија in its park, the peacocks
      dkmarija: { place: 'dkmarija', ll: [41.41431, 22.23325], d: 330, polar: 0.92, az: 0.6 }, // the royal winery: cellars, tanks, apartments, amphitheatre
      dkverdisso: { place: 'dkverdisso', ll: [41.41549, 22.22856], d: 130, polar: 1.0, az: 1.0 }, // the hotel and its pool from the lawn
      dkklisura: { ll: [41.39900, 22.26900], d: 2100, polar: 1.05, az: 0.75 }, // up the gorge from its south-east end toward the town
      dkkozuf: { place: 'dkski', ll: [41.17829, 22.20021], d: 1700, polar: 1.08, az: 0.2 }, // the ski centre under Зелен Брег
      overview: { ll: [41.29000, 22.19100], d: 27000, polar: 0.85, az: Math.PI }, // from the north: the vineyards, Кожуф behind
    },
    districts: [
      ['Демир Капија', 41.40871, 22.24186], ['Корешница', 41.43476, 22.23762, 30], ['Бесвица', 41.38390, 22.18309, 30],
      ['Чифлик', 41.39094, 22.22202, 30], ['Барово', 41.34462, 22.14040, 30], ['Бохула', 41.28778, 22.16108, 30],
      ['Чемерско', 41.29359, 22.14172, 30], ['Конопиште', 41.24800, 22.07624, 30], ['Радња', 41.27543, 22.21920, 30],
      ['Крњево', 41.30819, 22.12769, 30], ['Долна Бошава', 41.29472, 22.10620, 30], ['Горна Бошава', 41.28316, 22.10801, 30],
      ['Страгово', 41.32438, 22.10456, 30], ['Вешје', 41.38579, 22.13696, 30], ['Дрен', 41.36692, 22.24619, 30],
      ['Драчевица', 41.34998, 22.19655, 30], ['Кошарка', 41.40108, 22.31516, 30], ['Челевец', 41.42410, 22.27777, 30],
      ['Прждево', 41.42028, 22.16641, 30], ['Тремник', 41.43960, 22.15349, 30], ['Долни Дисан', 41.42910, 22.09518, 30],
      ['Горни Дисан', 41.39242, 22.10763, 30], ['Клисура', 41.38418, 22.29324, 30],
      ['Демиркаписка Клисура', 41.39800, 22.27400, 120], ['Кожуф', 41.15500, 22.19500, 200],
    ],
    labels: [
      ['Попова Кула', 41.41063, 22.22630, 26, 'dkpopova'],
      ['Хотел Вердисо', 41.41549, 22.22856, 16, 'dkverdisso'],
      ['Кралска винарија Кралица Марија', 41.41431, 22.23325, 18, 'dkmarija'],
      ['Вила Марија', 41.41424, 22.23290, 16, 'dkvila'],
      ['Амфитеатар', 41.41377, 22.23439, 8, 'dkamfi'],
      ['Винарија Грков', 41.31542, 22.12812, 14, 'dkgrkov'],
      ['Музеј на виното', 41.40865, 22.24467, 12, 'dkmuzej'],
      ['Успение на Пресвета Богородица', 41.40920, 22.23675, 14, 'dkcrkva'],
      ['Железничка станица', 41.40933, 22.24462, 10, 'dkstanica'],
      ['Демиркаписки Прозори', 41.41053, 22.26094, 30, 'dkprozori'],
      ['Ски центар Кожуф', 41.17829, 22.20021, 20, 'dkski'],
      ['Зелен Брег', 41.16198, 22.20555, 12],
      ['Порта', 41.15557, 22.17086, 12, 'dkporta'],
      ['Дудица', 41.12611, 22.14406, 12, 'dkdudica'],
      ['Св. Ѓорѓи', 41.33910, 22.25456, 12],
      ['Моклишко Езеро', 41.36612, 22.06163, 6],
      ['Вардар', 41.41700, 22.21500, 6, undefined, 'river'],
      ['Бошава', 41.31655, 22.16328, 6, undefined, 'river'],
    ],
    // the wine road: from Попова Кула past the hotel and the royal winery, through the town, down the gorge and back
    // over the vineyards of the Бошава valley and Крњево
    route: [
      ['Попова Кула', 41.41063, 22.22630, 60, 'dkpopova'],
      ['Хотел Вердисо', 41.41549, 22.22856, 50, 'dkverdisso'],
      ['Вила Марија', 41.41424, 22.23290, 50, 'dkvila'],
      ['Демир Капија', 41.40890, 22.24450, 60],
      ['Демиркаписки Прозори', 41.41053, 22.26094, 70, 'dkprozori'],
      ['Демиркаписка Клисура', 41.39400, 22.27800, 60],
      ['Клисура', 41.38418, 22.29324, 60],
      ['Дрен', 41.36692, 22.24619, 70],
      ['Драчевица', 41.34998, 22.19655, 70],
      ['Винарија Грков', 41.31542, 22.12812, 60, 'dkgrkov'],
      ['Барово', 41.34462, 22.14040, 70],
      ['Бесвица', 41.38390, 22.18309, 60],
      ['Кралица Марија', 41.41377, 22.23439, 50, 'dkamfi'],
    ],
    spots: [
      ['dk.town', 'Демир Капија', 41.40890, 22.24450, 70],
      ['dk.popova', 'Попова Кула', 41.41063, 22.22630, 60, 'dkpopova'],
      ['dk.marija', 'Кралица Марија', 41.41431, 22.23325, 90, 'dkmarija'],
      ['dk.vila', 'Вила Марија', 41.41424, 22.23290, 40, 'dkvila'],
      ['dk.verdisso', 'Хотел Вердисо', 41.41549, 22.22856, 50, 'dkverdisso'],
      ['dk.muzej', 'Музеј на виното', 41.40865, 22.24467, 30, 'dkmuzej'],
      ['dk.grkov', 'Винарија Грков', 41.31542, 22.12812, 60, 'dkgrkov'],
      ['dk.klisura', 'Демиркаписка Клисура', 41.41023, 22.25282, 120],
      ['dk.kozuf', 'Ски центар Кожуф', 41.17829, 22.20021, 150, 'dkski'],
    ],
    gliders: false,
    buses: false, // no red ЈСП buses: Skopje only
    terrainExag: 1, // true heights
    treeThin: { ll: [41.40871, 22.24186], near: 3000, far: 9000, min: 0.06, grow: 2 },
    sparseFar: 1500, // most of the map is the bare and wooded slopes of Кожуф
    // the Демир Капија vineyards: on the gentle slopes round the town and in the Бошава valley, almost all vines
    vineyards: 650,
    vineShare: 0.8,
    walker: 'pejo',
    snowLabel: 'weather.kozuf',
    refillLabel: 'fire.refill.tetovo', // „Наполни вода од Вардар“
    bestRaceKey: 'skopje.bestRace.demirkapija',
    banners: { fire: 'Вардар ја спаси Демир Капија!', roll: 'На здравје од Демир Капија!' },
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
