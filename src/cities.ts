// The cities on the map and everything that differs between them: data files, camera views,
// labels, the race route, walking info spots. Names are map data (Macedonian, untranslated).
// The city comes from the address (`?city=kavadarci`); without it the map opens on Skopje.
import type { Key } from './i18n.ts';
import type { Vec3 } from './types.ts';
import type { TreeThin } from './city.ts';

export const CITY_IDS = ['skopje', 'kavadarci', 'bitola', 'ohrid', 'rostuse', 'prilep', 'krusevo', 'kamenica', 'dojran', 'batinci'] as const;
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
  rostuse: {
    id: 'rostuse', name: 'Ростуше', code: '042', icon: './favicon-rostuse.svg',
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
    id: 'prilep', name: 'Прилеп', code: '048', icon: './favicon-prilep.svg',
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
