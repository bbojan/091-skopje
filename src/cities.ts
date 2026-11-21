// The cities on the map and everything that differs between them: data files, camera views,
// labels, the race route, walking info spots. Names are map data (Macedonian, untranslated).
// The city comes from the address (`?city=kavadarci`); without it the map opens on Skopje.
import type { Key } from './i18n.ts';
import type { Vec3 } from './types.ts';
import type { TreeThin } from './city.ts';

export const CITY_IDS = ['skopje', 'kavadarci', 'bitola', 'ohrid'] as const;
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
  /** vineyards and fields on open, gentle land up to this height (m); unset: none (Skopje) */
  vineyards?: number;
  /** the share of those plots that are vineyards, the rest fields (default 0.52, Tikveš) */
  vineShare?: number;
  /** how the walking person looks: Итар Пејо in folk costume, a man in a dark suit (Kavadarci), or
   *  Милтон Манаки with his film camera (Bitola; his action films an оро instead of dancing it) */
  walker: 'pejo' | 'suit' | 'manaki';
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
    id: 'bitola', name: 'Битола', code: '047', icon: './favicon-bitola.svg',
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
    id: 'ohrid', name: 'Охрид', code: '046', icon: './favicon-ohrid.svg',
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
