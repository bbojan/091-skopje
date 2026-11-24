// Converts raw Overpass JSON (out geom) into a compact, projected scene description.
// Usage: node scripts/prepare.ts [city]   (FILES.raw → FILES.scene; default skopje)
import fs from 'node:fs';

import { CITY, CUT, inCut, FILES, lat0, lon0, kx, ky, proj, W, H, type CityName } from './config.ts';
import { obb, PolyGrid } from '../src/geo.ts';
import { MARKET_OUTLINE } from '../src/market.ts';
import { cutOsm, wayPts, isClosed, area, centroid, pip, dropLast, polygonsOf, isWater, type OsmElement, type OsmJson, type Tags } from './osm.ts';
import type { CityData, Flat, Poly, Pt, Ring } from '../src/types.ts';

const inFile = FILES.raw, outFile = FILES.scene;
if (!fs.existsSync(inFile)) {
  console.error(`${inFile} is missing: run \`npm run download -- ${CITY}\` first`);
  process.exit(1);
}
// a map that is not a rectangle: nothing of OSM inside its neighbours' maps (`cut` in config.ts)
const raw = cutOsm(JSON.parse(fs.readFileSync(inFile, 'utf8')) as OsmJson, CUT);

const r1 = (v: number) => Math.round(v * 10) / 10;
const r1p = (p: Pt): Pt => [r1(p[0]), r1(p[1])];
const flat = (pts: Ring) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);

// Deterministic hash → [0,1)
function rnd(id: number, salt = 0): number {
  let h = (Number(id % 2147483647) ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const parseNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// What differs per city: the old town box (low, tiled, dense), the main square, hand-modelled
// landmarks, named places for labels and rings, and district boxes for height guesses.
type Zone = [s: number, n: number, w: number, e: number];
interface CityPrep {
  old: { s: number; n: number; w: number; e: number } | null;
  square: [lat: number, lon: number];
  /** OSM ids of the outlines of hand-modelled landmarks (src/landmarks.ts) */
  landmarks: {
    stoneBridge?: number; fountain?: number; porta?: number; ossuary?: number; heroes?: number; vatasa?: number; townhall?: number; stadium?: number;
    /** Kavadarci, Тиквеш: the dam's crest line, the outline of its downstream face, the power house (a building
     *  replaced by the model), the switchyard, the spillway's intake */
    damCrest?: number; dam?: number; hpp?: number; switchyard?: number; spillway?: number;
    /** Kavadarci: the churches Св. Петка and Св. Димитриј (src/churches.ts), modelled on their outlines */
    petka?: number; dimitrij?: number;
  };
  /** Kavadarci, Луда Мара: the river's ways (drawn as a narrow stream where not regulated) and its
   *  regulated channel through the town (src/river.ts), from the bridge `from` to the bridge `to`,
   *  centred between the promenade footways `banks` where OSM has both */
  canal?: { river: number[]; from: number; to: number; banks: number[] };
  /** names of the places (largest matching shape wins) */
  placeNames: Record<string, string>;
  /** places matched by OSM way id */
  placeIds: Record<string, number>;
  /** places at OSM nodes */
  placeNodes: Record<string, number>;
  /** coordinates of those nodes as OSM has them, used when the download did not include the node */
  nodeLL: Record<number, [lat: number, lon: number]>;
  /** hand-modelled landmarks that are not in OSM, by position */
  landmarkLL?: {
    revolution?: [lat: number, lon: number];
    /** a building OSM lacks: centre and heading (radians, of its long axis from south toward east) */
    culture?: [lat: number, lon: number, heading: number];
    /** the covered city market on its parking deck: centre of the roof and heading, like `culture` */
    market?: [lat: number, lon: number, heading: number];
    /** the free-standing bell tower of Св. Петка (not in OSM) */
    petkaTower?: [lat: number, lon: number];
  };
  tall: Zone[];
  mid: Zone[];
  /** a few extra storeys for blocks close to the main square (a capital's centre) */
  squareBonus: boolean;
  /** highest guessed storey count (tagged buildings keep their tags) */
  maxLevels: number;
  /** colour of the squares' paving (`c` on plaza areas) instead of the shared cream */
  plazaColour?: string;
  /** paved areas OSM lacks, drawn as squares: outlines as [lat, lon] lists */
  extraPlazas?: [lat: number, lon: number][][];
  /** OSM building outlines that do not match the place (left out) */
  dropBuildings?: number[];
  /** buildings OSM lacks: outline as [lat, lon] and tags read like OSM's (they get ids from 9e11 up) */
  extraBuildings?: { tags: Tags; r: [lat: number, lon: number][] }[];
  /** tags added to OSM buildings by way id (e.g. `building:levels` where the guess is wrong) */
  buildingTags?: Record<number, Tags>;
  /** the same for OSM building relations (multipolygons) by relation id */
  relationTags?: Record<number, Tags>;
  /** the Vodno gondola (separate small download) */
  aerialway?: string;
  /** outlines of buildings and sites modelled by hand for this city (Bitola: src/bitola.ts), by key → OSM
   *  way id; the OSM building is left out, the outline goes to `landmarks.models[key]` */
  models?: Record<string, number>;
  /** hand-built models with no usable OSM outline: a rectangle [centre lat, lon, length m, width m, heading of the
   *  length (radians from north toward east)] that goes to `landmarks.models[key]` like an outline */
  modelRects?: Record<string, [lat: number, lon: number, length: number, width: number, heading: number]>;
  /** rivers OSM draws only as lines, widened into water areas (firefighting refill): [way id, half width m] */
  waterLines?: [id: number, halfWidth: number][];
}
const PREP: Record<CityName, CityPrep> = {
  skopje: {
    old: { s: 41.9995, n: 42.0048, w: 21.4342, e: 21.4425 }, // Old Bazaar (Čaršija)
    square: [41.9961, 21.4316], // Macedonia Square
    landmarks: { stoneBridge: 411079115, fountain: 176160189, porta: 239422349 },
    placeNames: {
      square: 'Плоштад Македонија', porta: 'Порта Македонија', park: 'Градски парк', zoo: 'Зоолошка градина Скопје',
      arena: 'Национална арена Тодор Проески', bazaar: 'Стара скопска чаршија', kale: 'Скопско кале',
    },
    // ambiguous or long names (there are two „Св. Спас“)
    placeIds: {
      telecom: 32490009, // Пошта на Македонија — Telecommunications Centre (Janko Konstantinov)
      hamam: 172171547, // Даут пашин амам — National Gallery
      spas: 1137300477, // Св. Спас in the old town
      mall: 189429723, // Skopje City Mall
      station: 144759771, // Железничка станица Скопје
    },
    placeNodes: {},
    nodeLL: {},
    tall: [
      [42.000, 42.013, 21.372, 21.407], // Karpoš 3/4, Taftalidže
      [41.978, 41.996, 21.452, 21.502], // Aerodrom, Novo Lisiče
      [41.984, 41.993, 21.438, 21.455], // Kisela Voda blocks
    ],
    mid: [
      [41.988, 42.001, 21.405, 21.445], // Centar, Kapištec, Debar Maalo
      [42.000, 42.020, 21.428, 21.452], // Čair
      [42.003, 42.016, 21.350, 21.372], // Gjorče Petrov centre
      [41.973, 41.988, 21.425, 21.450], // Kisela Voda
      [42.005, 42.020, 21.452, 21.480], // Gazi Baba centre
    ],
    squareBonus: true,
    maxLevels: Infinity,
    aerialway: 'data/aerialway.json',
  },
  kavadarci: {
    old: null,
    square: [41.43344, 22.01227], // Плоштад Маршал Тито
    landmarks: {
      ossuary: 1275768512, // Спомен-костурница on the hill east of the centre
      heroes: 11845001868, // monument to the People's Heroes Kiro Atanasovski-Nalbatot and Dimče Mirčev (node)
      vatasa: 7626158238, // memorial to the Vataša massacre, in its memorial park (node)
      townhall: 790445885, // Општина Кавадарци, modelled after photos (2020, 2025)
      stadium: 1276210010, // the city stadium's pitch (grass, lit); the stands round it are modelled
      // Брана Тиквеш and ХЕЦ Тиквеш at the north end of Тиквешко Езеро
      damCrest: 713475142, // the road along the crest (OSM's waterway=dam line is the upstream edge at the full lake)
      dam: 1382014927, // Брана Тиквеш: the downstream face (closed waterway=dam way, material=rock)
      hpp: 693424139, // ХЕЦ Тиквеш, the power house at the foot of the dam
      switchyard: 1423984646, // power=switchgear next to it
      spillway: 168761245, // the spillway's intake on the east bank (water, usage=spillway)
      // the two town churches, modelled after photos (src/churches.ts)
      petka: 1104457234, // Св. Петка, the new cross-in-square church north of the centre
      dimitrij: 1111874740, // Св. Димитриј (renovated: stone walls, white dome and bell tower)
    },
    // Луда Мара: the river and the stream above it; the stone-lined channel with its promenades runs
    // from the bridge of Киро Крстев (south) to the bridge of Северен (north)
    canal: { river: [33071714, 1303056267], from: 41452333, to: 33469859, banks: [1517675194, 1517675198, 1517695636, 1517695638] },
    placeNames: { square: 'Плоштад Маршал Тито', vatasa: 'Спомен парк Ваташа', katunisko: 'Катунишко Езеро' },
    placeIds: {
      ossuary: 1275768512,
      dimitrij: 1111874740, // Св. Димитриј
      petka: 1104457234, // Св. Петка
      townhall: 790445885, // Општина Кавадарци
      stadium: 1276210010, // Градски стадион
      dam: 1382014927, // Брана Тиквеш
      hpp: 693424139, // ХЕЦ Тиквеш
    },
    placeNodes: { heroes: 11845001868, museum: 529811458 }, // culture: the building centre (landmarkLL), not the OSM point
    // copied from OSM (Nov 2026); data/query.overpassql fetches these node types from now on
    nodeLL: {
      11845001868: [41.43364, 22.01948], // historic=memorial, the People's Heroes
      7626158238: [41.40143, 22.02843], // historic=memorial, Масакр во Ваташа
      529811458: [41.43437, 22.01652], // tourism=museum, Музеј Галерија Кавадарци
      373135640: [41.43396, 22.0122], // amenity=theatre, Дом на културата
    },
    // not in OSM: Monument to the Revolution (Petar Palavičini, 1958): at the south end of the lawn strip on
    // the square's west side, a little in front of the town hall's steps (aerial image, photo of 2019)
    // Дом на културата „Иван Мазов-Климе“ is not in OSM: placed from the site and floor plans of the
    // fire-safety report (АРХИКОНС, Dec 2023): 41.4 m long, parallel to Илинденска (≈ 14° east of north),
    // its foyer facing ул. 7 Септември at the corner of the two streets
    // Градски зелен пазар (opened 8 April 2022) is not in OSM as a building: the roof's centre and
    // heading read off an aerial image of June 2025 (Esri World Imagery), parallel to Илинденска
    // Св. Петка's bell tower stands apart, ~34 m south-east of the church (its red cap on an aerial image,
    // Esri World Imagery; Street View 2025 and a drone photo show it beside the parking)
    landmarkLL: { revolution: [41.433206, 22.012113], culture: [41.434017, 22.012032, 0.241], market: [41.434509, 22.012778, 0.241], petkaTower: [41.442901, 22.008609] },
    // a small town: blocks of flats around the square, lower everywhere else
    tall: [],
    mid: [[41.4285, 41.4385, 22.003, 22.0225]], // the centre around Плоштад Маршал Тито
    squareBonus: false,
    maxLevels: 9,
    // the squares are paved in light grey stone (photos of Плоштад Маршал Тито)
    plazaColour: '#d9d6d0',
    // the town hall's forecourt (steps, two fountains) between the square's outline and the building
    extraPlazas: [[[41.433091, 22.012057], [41.433125, 22.012391], [41.433069, 22.012412], [41.432976, 22.012384], [41.432910, 22.011996], [41.432952, 22.012004], [41.433015, 22.012034]]],
    // west of the green market (aerial image of June 2025): OSM's 66 m strip there runs over the footpath,
    // the market's deck, a low shop row and a small house; the shop row and the house in its place
    dropBuildings: [1070244790],
    extraBuildings: [
      { tags: { building: 'retail', 'building:levels': '1', 'roof:shape': 'hipped' }, r: [[41.434477, 22.012481], [41.434497, 22.012587], [41.434276, 22.01266], [41.434257, 22.012553]] },
      { tags: { building: 'house', 'building:levels': '2', 'roof:shape': 'hipped' }, r: [[41.434808, 22.012341], [41.434824, 22.012429], [41.434737, 22.012457], [41.434721, 22.01237]] },
      // the block between Илинденска, ул. 7 Септември and the market lane, OSM has few of its buildings
      // (traced off an aerial image, Google 2026; heights guessed: one or two storeys, like the photos round it)
      { tags: { building: 'house', 'building:levels': '2', 'roof:shape': 'hipped' }, r: [[41.434409, 22.012237], [41.434418, 22.012366], [41.434331, 22.012395], [41.434311, 22.012265]] }, // the house with the red hipped roof among the trees by the lane
      { tags: { building: 'retail', 'building:levels': '1', 'roof:shape': 'flat' }, r: [[41.434287, 22.011839], [41.434293, 22.011921], [41.434237, 22.011931], [41.434232, 22.011849]] }, // a shop north of Sweet Art
      { tags: { building: 'retail', 'building:levels': '2', 'roof:shape': 'flat' }, r: [[41.4343, 22.011923], [41.434302, 22.011987], [41.434214, 22.012002], [41.434212, 22.011941]] }, // a shop north of Sweet Art
      { tags: { building: 'retail', 'building:levels': '2', 'roof:shape': 'flat' }, r: [[41.434282, 22.01201], [41.434307, 22.012187], [41.434239, 22.012201], [41.434209, 22.012028]] }, // the flat-roofed block behind them (north part; the south part is under the culture house model)
      { tags: { building: 'yes', 'building:levels': '2', 'roof:shape': 'flat' }, r: [[41.434172, 22.012183], [41.434184, 22.01225], [41.43408, 22.01227], [41.434075, 22.012204]] }, // a white building against the culture house
      { tags: { building: 'yes', 'building:levels': '1', 'roof:shape': 'flat' }, r: [[41.434235, 22.012364], [41.434237, 22.012413], [41.434191, 22.01242], [41.434189, 22.012369]] }, // a shed by the lane
      { tags: { building: 'retail', 'building:levels': '1', 'roof:shape': 'flat' }, r: [[41.434175, 22.012257], [41.434193, 22.012451], [41.434081, 22.012469], [41.43406, 22.012286]] }, // a flat-roofed shop block
      { tags: { building: 'retail', 'building:levels': '1', 'roof:shape': 'flat' }, r: [[41.43406, 22.012286], [41.434085, 22.012507], [41.434047, 22.012513], [41.434018, 22.012293]] }, // a low white roof
      { tags: { building: 'retail', 'building:levels': '1', 'roof:shape': 'flat' }, r: [[41.434018, 22.012293], [41.434047, 22.012513], [41.43397, 22.012533], [41.43394, 22.012257]] }, // „Кино Бавча“ (restaurant)
      { tags: { building: 'yes', 'building:levels': '2', 'roof:shape': 'flat' }, r: [[41.433936, 22.012245], [41.433979, 22.012552], [41.43391, 22.012578], [41.433856, 22.012266]] }, // the white hall east of the culture house (its south side kept off ул. 7 Септември: OSM has the street ~5 m north of the kerb here)
      { tags: { building: 'retail', 'building:levels': '1', 'roof:shape': 'flat' }, r: [[41.434101, 22.012617], [41.434106, 22.012714], [41.433969, 22.012734], [41.433965, 22.012642]] }, // shops east of the lane, south of the market
      { tags: { building: 'retail', 'building:levels': '1', 'roof:shape': 'flat' }, r: [[41.434106, 22.012714], [41.434113, 22.01281], [41.433966, 22.012822], [41.43396, 22.012735]] }, // shops east of the lane, south of the market
      { tags: { building: 'yes', 'building:levels': '2', 'roof:shape': 'flat' }, r: [[41.434764, 22.012148], [41.434769, 22.012242], [41.434728, 22.012255], [41.434721, 22.01216]] }, // a building west of the lane, north end
      { tags: { building: 'yes', 'building:levels': '1', 'roof:shape': 'hipped' }, r: [[41.434561, 22.012287], [41.434563, 22.012313], [41.434494, 22.012327], [41.434491, 22.012301]] }, // a small brown-roofed building by the lane
      // Little America (LA Mall, hotel and three blocks of flats) on the corner of Северен and Бул. Никола Минчев:
      // outlines off an aerial image (Esri World Imagery, under construction; leaning walls traced at the base,
      // shifted ~4 m south-east onto OSM's roads), heights after the developer's renders
      { tags: { building: 'retail', 'building:levels': '2', 'roof:shape': 'flat', 'building:colour': '#d8d2c8' }, r: [[41.444362, 22.00901], [41.44407, 22.00901], [41.44407, 22.009783], [41.443985, 22.009797], [41.443985, 22.010222], [41.444211, 22.010226], [41.444241, 22.009857], [41.444402, 22.009804]] }, // the podium under the hotel and the mall
      { tags: { building: 'hotel', 'building:levels': '8', 'roof:shape': 'flat', 'building:colour': '#2b3139' }, r: [[41.444367, 22.009006], [41.444417, 22.009023], [41.444442, 22.009073], [41.444437, 22.009736], [41.444414, 22.00979], [41.444367, 22.009814], [41.44432, 22.009801], [41.444297, 22.009743], [41.44428, 22.009562], [41.444263, 22.009415], [41.444277, 22.009046], [41.444307, 22.00901]] }, // the hotel, dark glass
      { tags: { building: 'retail', 'building:levels': '4', 'roof:shape': 'flat', 'building:colour': '#ece6dc' }, r: [[41.444236, 22.009848], [41.444274, 22.009871], [41.444287, 22.009931], [41.444274, 22.010005], [41.444253, 22.010085], [41.44428, 22.010145], [41.444274, 22.010203], [41.444236, 22.010233], [41.444091, 22.010226], [41.444091, 22.010005], [41.444141, 22.009978], [41.444151, 22.009871], [41.444191, 22.009846]] }, // the mall's curved front on the corner
      { tags: { building: 'apartments', 'building:levels': '10', 'roof:shape': 'flat', 'building:colour': '#4a4e55' }, r: [[41.44393, 22.009026], [41.44393, 22.009334], [41.443407, 22.009334], [41.443407, 22.009026]] },
      { tags: { building: 'apartments', 'building:levels': '10', 'roof:shape': 'flat', 'building:colour': '#4a4e55' }, r: [[41.44389, 22.009502], [41.44389, 22.009797], [41.443342, 22.009797], [41.443342, 22.009502]] },
      { tags: { building: 'apartments', 'building:levels': '10', 'roof:shape': 'flat', 'building:colour': '#4a4e55' }, r: [[41.44394, 22.009938], [41.44394, 22.010213], [41.443422, 22.010213], [41.443422, 22.009938]] },
    ],
    // OSM buildings without levels whose guess (centre zone, by footprint) is far too tall here: the post
    // office, the T-Mobile shop and the shop row south of the market are low, with flat roofs (aerial image, 2026)
    buildingTags: {
      1070244772: { 'building:levels': '2', 'roof:shape': 'flat' }, // Македонска пошта
      1070244773: { 'building:levels': '3', 'roof:shape': 'flat' }, // Оператор „Т-Мобиле“
      1070244789: { 'building:levels': '1', 'roof:shape': 'flat' }, // the shop row south of the green market
    },
  },
  bitola: {
    old: { s: 41.0312, n: 41.0372, w: 21.3335, e: 21.3425 }, // Стара чаршија, north of the Драгор
    square: [41.03019, 21.3349], // Плоштад Магнолија
    landmarks: {},
    // modelled by hand after photos (src/bitola.ts): Саат-кула, Ајдар-кади џамија, Безистен, the cathedral
    // Св. Димитриј and its bell tower; Хераклеа Линкестис (the site) and its theatre (ruins, not buildings)
    models: {
      clock: 1335734377, ajdar: 192121734, bezisten: 1143767501, dimitrij: 38582552, dimitrijTower: 961554014,
      heraclea: 37956139, theatre: 226160304, basilica: 502848605,
    },
    placeNames: { square: 'Плоштад Магнолија' },
    placeIds: {
      clock: 1335734377, // Саат Кула
      ajdar: 192121734, // Џамија Ајдар Кади
      isak: 38581757, // Исак Џамија
      dimitrij: 38582552, // Св. Димитриј Солунски
      bezisten: 1143767501, // Безистен
      culture: 38065297, // Дом на Култура
      townhall: 789965987, // ЛС Битола
      heraclea: 37956139, // Хераклеа Линкестис
      golemo: 56062992, // Големо Езеро
      malo: 67325264, // Мало Езеро
    },
    placeNodes: { pelister: 26864198 },
    nodeLL: { 26864198: [41.00266, 21.18319] }, // natural=peak, Пелистер (2601 m)
    // blocks of flats in a ring round the centre; the 19th-century core (Широк Сокак, Магнолија, the
    // чаршија) left out of the zone, so its untagged houses stay at 2–4 storeys; houses in the villages
    tall: [],
    mid: [
      [41.0340, 41.0450, 21.3180, 21.3600], // north of the чаршија (Баир, Ушици)
      [41.0180, 41.0245, 21.3180, 21.3600], // south of the park (Боримечка)
      [41.0245, 41.0340, 21.3180, 21.3300], // west
      [41.0245, 41.0340, 21.3400, 21.3600], // east
    ],
    squareBonus: false,
    maxLevels: 10,
    // the Драгор is an area in OSM only in two short pieces: its channel through the town as water
    // (the firefighting refill), 5 m to each side of the line
    waterLines: [[27925320, 5], [1119659502, 4.5], [1119659503, 4]],
    // Плоштад Магнолија is a multipolygon relation (r20052087, three outer ways) that the query does not
    // fetch: its outer ring, stitched (Nov 2026), drawn as a square
    extraPlazas: [[[41.030423, 21.334784], [41.030406, 21.334932], [41.030245, 21.33492], [41.030243, 21.334962], [41.030142, 21.334953], [41.030136, 21.335068], [41.030238, 21.335078], [41.030234, 21.335166], [41.030394, 21.335179], [41.03043, 21.33518], [41.03043, 21.335235], [41.030431, 21.335283], [41.0303, 21.335283], [41.030218, 21.335243], [41.030169, 21.335255], [41.030151, 21.335271], [41.030139, 21.335314], [41.03014, 21.335415], [41.030132, 21.335416], [41.030086, 21.33543], [41.030077, 21.335394], [41.030068, 21.335386], [41.030056, 21.335342], [41.030044, 21.335295], [41.030036, 21.335265], [41.030009, 21.335158], [41.030031, 21.335147], [41.030028, 21.335135], [41.030046, 21.335125], [41.030008, 21.334993], [41.029998, 21.334998], [41.029973, 21.335009], [41.029964, 21.334979], [41.02995, 21.334938], [41.029948, 21.334919], [41.029978, 21.334896], [41.029994, 21.33488], [41.030019, 21.334831], [41.030034, 21.334841], [41.030059, 21.334776], [41.030047, 21.334769], [41.030087, 21.334661], [41.030093, 21.334665], [41.030155, 21.334499], [41.030161, 21.334503], [41.030203, 21.334393], [41.030211, 21.334369], [41.030221, 21.334378], [41.03024, 21.334394], [41.030289, 21.334437], [41.030322, 21.334492], [41.030338, 21.334521], [41.030357, 21.334574], [41.030391, 21.334683]]],
  },
  ohrid: {
    // Стариот град (Варош) on the hill, from Канео to the чаршија: low, tiled, dense houses
    old: { s: 41.1100, n: 41.1170, w: 20.7880, e: 20.8005 },
    square: [41.11276, 20.79939], // Плоштад „Св. Климент Охридски“ by the harbour
    landmarks: {},
    // modelled by hand after photos (src/ohrid.ts): Св. Јован Канео, Св. Климент и Пантелејмон на Плаошник,
    // Св. Софија, the church of Св. Наум (Св. Архангели Михаил и Гаврил); the ancient theatre (bitola.ts's theatre)
    models: { kaneo: 233274330, plaosnik: 34094478, sofija: 194610965, naum: 179291828, theatre: 1497789103 },
    // Залив на коските (Gradište, near Пештани): OSM has the museum as a pier area (way 217931793); the platform and
    // its huts are modelled on a rectangle over it, its length running west from the shore (the footbridge back east)
    modelRects: { bones: [40.99436, 20.79800, 46, 34, -Math.PI / 2] },
    placeNames: {},
    placeIds: {
      kaneo: 233274330, plaosnik: 34094478, sofija: 194610965, naum: 179291828, theatre: 1497789103,
      samuil: 34093752, // Самуилова тврдина (castle)
      bones: 217931793, // Залив на Коските (the museum's pier area)
    },
    placeNodes: { square: 6781576799 },
    nodeLL: { 6781576799: [41.11276, 20.79939] }, // place=square, Плоштад „Св. Климент Охридски“
    // blocks of flats east and north of the old town (Ohrid) and in the middle of Struga
    tall: [],
    mid: [[41.1120, 41.1300, 20.8010, 20.8250], [41.1720, 41.1850, 20.6650, 20.6900]],
    squareBonus: false,
    maxLevels: 9,
    // OSM has the low walls round Канео's terrace as city walls (8 m): a parapet on the rock
    buildingTags: { 305673405: { barrier: 'wall', historic: 'yes', height: '1.6' }, 1529646204: { barrier: 'wall', historic: 'yes', height: '1.6' } },
  },
  rostuse: {
    old: null,
    square: [41.61050, 20.59950], // the middle of Ростуше
    landmarks: {},
    // modelled by hand after photos (src/rostuse.ts): Св. Никола, the church of the village flooded by Мавровско Езеро
    models: { nikola: 1313861245 },
    // Бигорски манастир: the konaks, the bell tower, the court and the church (OSM: the church, 1279192718, and ten
    // plain outlines round it), 82 × 58 m along the slope, +u south down the valley, +v west toward the Радика
    modelRects: { bigorski: [41.62116, 20.60940, 82, 58, Math.PI] },
    placeNames: {},
    placeIds: { bigorski: 1279192718, nikola: 1313861245, galicnik: 132038486, dam: 510972965, svetigrad: 1312594768 },
    placeNodes: {},
    nodeLL: {},
    tall: [],
    mid: [[41.5150, 41.5280, 20.5180, 20.5350]], // the middle of Дебар
    squareBonus: false,
    maxLevels: 6,
  },
  prilep: {
    old: { s: 41.3443, n: 41.3472, w: 21.5515, e: 21.5572 }, // Старата чаршија round the clock tower
    square: [41.34560, 21.55300], // the square by the town hall, its row of monuments
    landmarks: {},
    // modelled by hand after photos (src/prilep.ts): the clock tower (OSM: Прчикур, height 40), Трескавец's church
    models: { pclock: 606054201, treskavec: 198197913 },
    // Могила на непобедените: the urns round the paved plaza (OSM: a pedestrian area 45 × 37 m); Маркови Кули:
    // the granite boulders over the hill of the fortress (OSM's meadow multipolygon, 400 × 230 m)
    modelRects: { mogila: [41.33424, 21.55457, 46, 36, 0], markovi: [41.36165, 21.53850, 420, 230, Math.PI / 2] },
    placeNames: {},
    placeIds: { pclock: 606054201, treskavec: 899200388, mogila: 338675543 },
    placeNodes: { zlatovrv: 2098892075 },
    nodeLL: { 2098892075: [41.40604, 21.54194] }, // natural=peak, Златоврв (1422 m)
    // blocks of flats round the old bazaar; the чаршија and Варош left out
    tall: [],
    mid: [[41.3380, 41.3443, 21.5450, 21.5680], [41.3472, 41.3530, 21.5450, 21.5680], [41.3443, 41.3472, 21.5572, 21.5680]],
    squareBonus: false,
    maxLevels: 10,
    // Трескавец's medieval fortification is a line of low ruined walls on the steep top (OSM: city wall, 8 m)
    buildingTags: { 414261893: { height: '3' } },
  },
  krusevo: {
    // the old town of white houses with red tiled roofs on the slope round Плоштад Никола Мартиноски
    old: { s: 41.3640, n: 41.3720, w: 21.2420, e: 21.2530 },
    square: [41.36858, 21.24895], // Плоштад Никола Мартиноски
    landmarks: {},
    // modelled by hand after photos (src/krusevo.ts): Македониум on its OSM outline
    models: { makedonium: 217568679 },
    // Мечкин Камен: the monument on the bare rock south of the town (OSM: a node), the giant facing north to the town
    modelRects: { meckin: [41.33773, 21.25800, 40, 36, 0] }, // the bare rock round it, kept free of trees
    placeNames: {},
    placeIds: { makedonium: 217568679, toshe: 217563724, square: 1110290669, nikola: 224099193, museum: 224254694 },
    placeNodes: { pitu: 2327281126, meckin: 410115784 },
    nodeLL: { 2327281126: [41.36497, 21.24973], 410115784: [41.33773, 21.25800] }, // historic=monument: Питу Гули, Мечкин Камен
    tall: [],
    mid: [],
    squareBonus: false,
    maxLevels: 5,
  },
  kamenica: {
    old: null, // a miners' town built after 1960: no old core
    square: [42.02165, 22.58816], // the town square by the church and the town hall
    landmarks: {},
    // modelled by hand after photos (src/kamenica.ts): the church Успение на Пресвета Богородица on its OSM outline
    models: { uspenie: 1459871037 },
    // the square's big fountain with the statue on top (OSM: amenity=fountain, not in the download)
    modelRects: { kfountain: [42.02147, 22.58820, 13, 13, 0] },
    placeNames: {},
    placeIds: { square: 1459871035, uspenie: 1459871037, miners: 1459871036, stadium: 202649369, kalata: 1323655403, dam: 1323590645, hpp: 909636475 },
    placeNodes: { sasa: 2021391249, mine: 466248940 },
    nodeLL: { 2021391249: [42.09592, 22.54309], 466248940: [42.11426, 22.51931] }, // place=village Саса; landuse=quarry, the Саса mine
    tall: [],
    mid: [[42.0170, 42.0265, 22.5835, 22.5960]], // the blocks of flats round the square
    squareBonus: false,
    maxLevels: 9, // photos of 2010: a handful of towers of about ten storeys among low houses with tiled roofs
    // OSM outlines without levels that the centre's zone would raise into towers: the Макпетрол station, the Жито shop
    buildingTags: { 1540138912: { 'building:levels': '1' }, 1041185442: { 'building:levels': '2' } },
  },
  dojran: {
    // Стар Дојран: low houses with tiled roofs on the slope above the lake, round the square and the clock tower
    old: { s: 41.1700, n: 41.1960, w: 22.7120, e: 22.7360 },
    square: [41.18694, 22.72239], // Трите Јавори, by the municipality
    landmarks: {},
    // modelled by hand after photos (src/dojran.ts): the clock tower and Св. Илија on their OSM outlines
    models: { dclock: 1554871748, ilija: 1230559149 },
    // a мандра (reed fishing enclosure with a hut on stilts) off the pier north of Стар Дојран; not in OSM.
    // +u east, away from the shore
    modelRects: { mandra: [41.19628, 22.71722, 70, 46, Math.PI / 2] },
    placeNames: {},
    placeIds: { square: 1241503018, dclock: 1554871748, ilija: 1230559149, magdalena: 1546945797, beach: 762181802, townhall: 1107785886 },
    placeNodes: { museum: 1853704787, monument: 7124138432, front: 5055444424, kale: 5475798448, doirani: 146300294, novdojran: 367783087 },
    nodeLL: {
      1853704787: [41.18703, 22.72207], 7124138432: [41.18566, 22.72271], 5055444424: [41.19499, 22.68785], // museum, monuments
      5475798448: [41.19096, 22.68649], 146300294: [41.17859, 22.76106], 367783087: [41.21791, 22.70391], // Кале Тепе, Δοϊράνη, Нов Дојран
    },
    tall: [],
    mid: [],
    squareBonus: false,
    maxLevels: 6,
  },
  batinci: {
    old: null,
    square: [41.91966, 21.48139], // the middle of Батинци
    landmarks: {},
    // modelled by hand after photos (src/batinci.ts): the church Св. Димитрија of Марков манастир on its OSM outline
    models: { markov: 177490048 },
    // OSM draws the whole monastery complex (court and konaks) as one building over the church: left out
    dropBuildings: [177490047],
    placeNames: {},
    placeIds: { markov: 177490048, monastery: 177490047, dsquare: 1418028028, spas: 247817665, eremija: 224671004 },
    placeNodes: {},
    nodeLL: {},
    tall: [],
    mid: [[41.9300, 41.9420, 21.5080, 21.5300]], // the blocks of flats of Драчево round Плоштад на Бранителите
    squareBonus: false,
    maxLevels: 7,
    // no lake on this map: the Маркова Река, from Марков манастир down past Батинци, widened for refilling
    waterLines: [[182532170, 5], [46033085, 5]],
  },
  berovo: {
    old: null,
    square: [41.70654, 22.85682], // Градски плоштад „Димитар Беровски“
    landmarks: {},
    // modelled by hand after photos (src/berovo.ts): the arch dam of Беровско Езеро on its OSM crest line
    models: { bdam: 606170062 },
    // the churches have only OSM nodes: rectangles read off an aerial image. Св. Архангел Михаил (the women's
    // monastery, 1818) under its wide porch, its long axis toward the south-east; its bell tower at the north-west
    // end of the konak beside it (to the left of the porch front in the photos); Рождество на Пресвета Богородица on
    // the square, east–west, its tower at the south-west corner
    modelRects: {
      mihail: [41.70097, 22.85896, 32, 15, 2.3],
      mtower: [41.70129, 22.85876, 5, 5, 2.3],
      rozdestvo: [41.70674, 22.85700, 24, 15, Math.PI / 2],
    },
    // the monastery's konak, a long two-storey wing between the church and the street (aerial image; not in OSM)
    extraBuildings: [
      { tags: { building: 'yes', 'building:levels': '2', 'roof:shape': 'hipped' }, r: [[41.701109, 22.859101], [41.701265, 22.858868], [41.701211, 22.858804], [41.701056, 22.859037]] },
    ],
    placeNames: {},
    placeIds: { square: 239374902, lake: 37372709, bdam: 606170062, psquare: 606145632, park: 1264878902 },
    placeNodes: { mihail: 499973497, rozdestvo: 499973498, pehcevo: 6228439417, ratevo: 456844057, spikovo: 5747845483 },
    nodeLL: {
      499973497: [41.70104, 22.85902], 499973498: [41.70676, 22.85707], // the two churches
      6228439417: [41.76357, 22.88730], 456844057: [41.67633, 22.85144], 5747845483: [41.73176, 22.93313], // Пехчево, Ратево, Спиковски водопад
    },
    tall: [],
    // the blocks of flats round the square of Берово and in the middle of Пехчево
    mid: [[41.7030, 41.7110, 22.8480, 22.8600], [41.7590, 41.7650, 22.8820, 22.8920]],
    squareBonus: false,
    maxLevels: 6,
  },
  tetovo: {
    old: null,
    square: [42.01008, 20.97057], // Плоштад „Илинден“ in Тетово (OSM: a pedestrian square, 110 × 106 m)
    landmarks: {},
    // modelled by hand after photos (src/tetovo.ts): Шарена џамија, Св. Атанасиј Велики of Лешочки манастир,
    // the ruined walls of Тетовско Кале on Балтепе
    models: { sarena: 241085465, lesok: 981839456, tkale: 33100249 },
    // Gostivar's clock tower has only an OSM node (amenity=clock): a square of its base, 5.6 m (photos)
    modelRects: { gsaat: [41.79490, 20.91095, 5.6, 5.6, 0] },
    placeNames: {},
    placeIds: { square: 366654067, sarena: 241085465, lesok: 981839456, tkale: 33100249, teke: 479804854, bogovinje: 196279940 },
    placeNodes: { gsaat: 2026119373, vrutok: 2074390739, titov: 470409541, popova: 2113593788 },
    nodeLL: {
      2026119373: [41.79490, 20.91095], 2074390739: [41.76403, 20.83696], // Gostivar's clock tower, the source of the Вардар
      470409541: [41.99201, 20.79824], 2113593788: [42.01658, 20.88604], // Титов Врв, Попова Шапка
    },
    tall: [],
    // the blocks of flats in the middle of Тетово and of Гостивар
    mid: [[41.9960, 42.0160, 20.9600, 20.9860], [41.7870, 41.8000, 20.8980, 20.9200]],
    squareBonus: false,
    maxLevels: 10,
    // no lake near the towns (the glacial lakes are small and high): the Вардар through Полог, widened for refilling
    waterLines: [[907645304, 6]],
    // churches, mosques and petrol stations the height zones made into towers (Gostivar's Саат-џамија: two storeys
    // under its dome, the photos)
    buildingTags: Object.fromEntries([
      ...[246171790, 265053393, 267650666, 429475632, 476718500, 476718503, 479803132, 1167314615].map((id) => [id, { 'building:levels': '2' }]),
      ...[389055598, 1329461769].map((id) => [id, { 'building:levels': '1' }]),
    ]),
  },
  matka: {
    old: null,
    square: [41.95090, 21.29900], // the terrace by Св. Андреја at the dam (no town on this map)
    landmarks: {},
    // modelled by hand after photos (src/matka.ts): Св. Андреја and Св. Никола Шишевски on their OSM outlines, the arch
    // dam of Матка on its crest line
    models: { andrej: 224495829, sisevo: 1330252487, mdam: 537926854 },
    placeNames: { lake: 'Езеро Матка' },
    placeIds: { andrej: 224495829, sisevo: 1330252487, mdam: 537926854, bogorodica: 1329393428, treska: 32463938 },
    placeNodes: { vrelo: 4236969162, gjorgjija: 470409981 },
    nodeLL: {
      4236969162: [41.93016, 21.29227], 470409981: [42.06909, 21.30018], // Пештера Врело, Св. Ѓорѓија in Кучково
    },
    tall: [],
    mid: [],
    squareBonus: false,
    maxLevels: 5,
    // Хотел и ресторан „Кањон Матка“ by the dam: two storeys (photos), not the four the guess gives
    relationTags: { 19955268: { 'building:levels': '2' } },
  },
  vevcani: {
    old: null,
    square: [41.24030, 20.59230], // the middle of Вевчани
    landmarks: {},
    // modelled by hand after photos (src/vevcani.ts): Св. Никола with its bell tower and the white annex, one OSM outline
    // (no name or tags in OSM; the photos' GPS is 20 m from it)
    models: { vvnikola: 930990174 },
    // wooden footbridges over the Вевчанска below the springs (OSM has one path bridge): [lat, lon, length, width, heading]
    modelRects: {
      vbr1: [41.239379, 20.585318, 7, 1.6, 2.639], vbr2: [41.239512, 20.585789, 7, 1.6, 0.303],
      vbr3: [41.239280, 20.586218, 7, 1.6, 2.788], vbr4: [41.239476, 20.586788, 7, 1.6, 0.320],
    },
    placeNames: { globocica: 'Езеро Глобочица' },
    placeIds: { springs: 228209293, nikola: 930990174, varvara: 930966104, belica: 712122418, lokov: 236587123, dimitrij: 853541376 },
    placeNodes: { crnkamen: 698004658, strizak: 5020442822 },
    nodeLL: { 698004658: [41.2462, 20.52182], 5020442822: [41.28461, 20.52955] }, // Црн Камен, Стрижак
    tall: [],
    mid: [],
    squareBonus: false,
    maxLevels: 5,
    // the Вевчанска from the springs, a line in OSM: widened into a narrow strip of water under the footbridges
    waterLines: [[228209279, 2.5]],
  },
  kocani: {
    old: null,
    square: [41.92120, 22.41090], // in front of Општина Кочани (OSM has no square there)
    landmarks: {},
    // modelled by hand after photos (src/kocani.ts): the two Ottoman towers on either bank of the Кочанска Река (the
    // western one restored, 18.5 m; the eastern one the Саат-кула, a ruin with the clock's brick drum on its roof) and
    // Споменик на слободата on Локубија
    models: { kkula: 184307286, ksaat: 184313963, ksloboda: 1044325422 },
    placeNames: {},
    placeIds: { kkula: 184307286, ksaat: 184313963, ksloboda: 1044325422, lokubija: 37879858, townhall: 184154770, gjorgji: 37866487, preobrazenie: 1212048120, dudi: 851312559, dobravoda: 184298875, morodvis: 603638574, stadium: 37910534 },
    placeNodes: { kocani: 417839656, oblesevo: 418245007, zrnovci: 418349554, orizari: 418350443, grdovci: 418349437, banja: 442904494, karev: 7947878810 },
    nodeLL: {
      417839656: [41.92113, 22.41142], 418245007: [41.88343, 22.33468], 418349554: [41.85365, 22.44595], // Кочани, Облешево, Зрновци
      418350443: [41.92020, 22.44547], 418349437: [41.88126, 22.42037], 442904494: [41.91157, 22.33335], // Оризари, Грдовци, Бања
      7947878810: [41.91566, 22.41278], // Споменик на Никола Карев
    },
    tall: [],
    // the blocks of flats in the middle of Кочани
    mid: [[41.9100, 41.9230, 22.4020, 22.4230]],
    squareBonus: false,
    maxLevels: 9,
    // halls, the market and public buildings the height zone made into towers
    buildingTags: Object.fromEntries([
      ...[37936587, 183984204, 849618315, 863287978, 849619317].map((id) => [id, { 'building:levels': '2' }]), // market, two sports halls, МКЦ, a shop
      ...[37879846, 849618789].map((id) => [id, { 'building:levels': '3' }]), // Центар на културата „Бели мугри“, the police station
      [849621044, { 'building:levels': '1' }], // Ловен дом
    ]),
    // no lake on the map (Гратче lies 1.5 km north of it, on Пробиштип's): the Брегалница, a line in OSM, widened for refilling
    waterLines: [[384225634, 10], [907653405, 10], [907655044, 10]],
  },
  medzitlija: {
    old: null,
    square: [40.92740, 21.42975], // the paved yard in front of the mosque in Меџитлија (OSM has no square there)
    landmarks: {},
    // modelled by hand after photos (src/medzitlija.ts): Велушки манастир's church Св. Ѓорѓи and its konak
    models: { mzvcrkva: 849440102, mzvkonak: 849440101 },
    // OSM lacks them: read off the aerial image. The mosque of Меџитлија (dome toward the qibla), the canopies of the
    // border crossing (the Macedonian side over the lanes, the offices on its east; the Greek side's three bays)
    modelRects: {
      mzdzamija: [40.92709, 21.42932, 18, 12, 2.67],
      mzgranica: [40.92015, 21.41643, 84, 54, Math.PI / 2],
      mzgrcka: [40.91614, 21.41844, 78, 74, 0],
    },
    placeNames: {},
    placeIds: { mzvcrkva: 849440102, mzvkonak: 849440101, crossing: 537846447, kstation: 404975023, katanasij: 404975011, baresani: 412310914, ilija: 219799845, ostrec: 219827428 },
    placeNodes: { kaninski: 14313547332, branitel: 14313555859 },
    nodeLL: { 14313547332: [40.93608, 21.37221], 14313555859: [40.93587, 21.37131] }, // Коле Канински, the defenders of 2001 (Породин)
    tall: [],
    mid: [],
    squareBonus: false,
    maxLevels: 4,
  },
  kratovo: {
    // the old town in the crater: low stone houses with tiled roofs along the river and up the slopes
    old: { s: 42.0735, n: 42.0830, w: 22.1700, e: 22.1880 },
    square: [42.07800, 22.18172], // the small square by Општина Кратово and the Саат-кула (OSM place=square)
    landmarks: {},
    // modelled by hand (src/kratovo.ts): the six medieval towers on their OSM outlines, the stone bridges over the
    // Кратовска Река and the Манцева Река on their OSM bridge outlines, the earth pyramids of Куклица on the site's outline
    models: {
      krsimic: 1041470916, krsaat: 1041470903, krzlatko: 1041470895, krkrste: 1068995475, krhadzi: 1041470976, kremin: 1041469306,
      krradin: 1328812145, krgrof: 1329719000, krcarsija: 1330153314, krjoksir: 1330177797, kramam: 1330177800, krargul: 1330181223,
      krsaraj: 1328852746, krkukli: 1310947327, krkratis: 974485944, krsingo: 1069089773,
      krbazen: 1069081206, // the town's Olympic pool (OSM: water_park), „Силекс“'s
    },
    // the joke: a hillside sign „ЅИНГО LAND“ in the manner of Hollywood's on Баба's north face, the slope seen from the
    // whole town (sampled: ~200 m above the square, 770 m south of it, ~27° steep, no buildings); wide, so no trees in front
    modelRects: {
      krsign: [42.07117, 22.18026, 140, 70, Math.PI / 2],
      // the second joke: the border crossing into Ѕинго Land on the R1205 into town (a straight stretch 1.3 km from the
      // square, no houses near), the road running north–south through it
      krgranica: [42.06880, 22.17208, 30, 30, 0],
    },
    placeNames: {},
    placeIds: {
      krsimic: 1041470916, krsaat: 1041470903, krzlatko: 1041470895, krkrste: 1068995475, krhadzi: 1041470976, kremin: 1041469306,
      krradin: 1328812145, krgrof: 1329719000, krcarsija: 1330153314, krjoksir: 1330177797, krkukli: 1310947327,
      krsquare: 1329402649, knezevo: 182039253, krdam: 1420954858, krgjorgji: 1041472847, krjovan: 1069000600, krmuzej: 974485945,
      krstadium: 1328795532, krtrojca: 1049164095, krkratis: 974485944,
      krbazen: 1069081206,
      krsingo: 1069089773, // Ѕинговата куќа: the building the developer pointed at, next to the point given (42.079194, 22.172667)
    },
    placeNodes: { krkarpos: 12136243295 },
    nodeLL: { 12136243295: [42.07746, 22.18106] }, // the monument to Петар Карпош
    tall: [],
    mid: [],
    squareBonus: false,
    maxLevels: 5,
    // the rivers OSM has only as lines, widened into water (in the channels terrain.ts cuts): Крива Река through
    // Славиште, Злетовица below Кнежево, the Кратовска Река (its middle in town is an OSM water area already) and the
    // smaller ones
    waterLines: [
      [235341361, 6], [1557884350, 5], [860970958, 5], [182007528, 5], [183288179, 5], [793411789, 5], [793411790, 5],
      [242056451, 3], [794803592, 3], [746756170, 1.5], [303758306, 3.5], [860315337, 3.5], [249690906, 3.5], [693358495, 2.5],
    ],
    // the churches the height guess made into blocks
    buildingTags: { 1069000600: { 'building:levels': '1', height: '9' }, 1041472847: { 'building:levels': '1', height: '8' }, 1049164095: { 'building:levels': '1', height: '8' } },
  },
  brod: {
    old: null,
    square: [41.50676, 21.21943], // the paved square by the municipality building in Македонски Брод
    landmarks: {},
    // modelled by hand after photos (src/brod.ts): the church of Зрзе monastery, Света Петка's arch dam on its crest line
    models: { zrze: 875859708, spdam: 229947907 },
    placeNames: { kozjak: 'Езеро Козјак' },
    placeIds: { square: 375660399, zrze: 875859708, kdam: 1382001962, svpetka: 701868141, devini: 1050278253 },
    placeNodes: { pesna: 11881154455, solunska: 26864743 },
    nodeLL: { 11881154455: [41.54793, 21.25259], 26864743: [41.70391, 21.40416] }, // the cave Пешна, Солунска Глава
    tall: [],
    mid: [[41.5030, 41.5110, 21.2120, 21.2230]], // the few blocks of flats in the middle of Брод
    squareBonus: false,
    maxLevels: 6,
  },
  resen: {
    old: null,
    square: [41.09001, 21.01292], // the square in front of the municipality building in Ресен
    landmarks: {},
    // modelled by hand after photos (src/resen.ts): Ресенски сарај, Св. Петар on Голем Град, Св. Ѓорѓи in Курбиново
    models: { saraj: 1218564775, gpetar: 199050953, kurbinovo: 356219819 },
    placeNames: {},
    placeIds: { square: 1218564767, saraj: 1218564775, gpetar: 199050953, kurbinovo: 356219819, achilleios: 257934474 },
    placeNodes: {},
    nodeLL: {},
    tall: [],
    mid: [[41.0850, 41.0950, 21.0060, 21.0200]], // the blocks of flats in the middle of Ресен
    squareBonus: false,
    maxLevels: 6,
  },
};
const CFG = PREP[CITY];
const OLD = CFG.old;
const SQUARE = proj(...CFG.square);

const out: CityData = {
  meta: { w: r1(W), h: r1(H), lat0, lon0, kx, ky, square: SQUARE.map(r1), attribution: '© OpenStreetMap contributors' },
  buildings: [],
  areas: [],
  roads: [],
  rails: [],
  walls: [],
  trees: [],
  towers: [],
  crosses: [],
  landmarks: {},
  places: {},
};
// hand-modelled landmarks (rendered by src/landmarks.ts instead of generic geometry)
const LANDMARK_IDS = CFG.landmarks;
// outlines replaced by a model
const SKIP_BUILDINGS = new Set<number>([LANDMARK_IDS.porta, LANDMARK_IDS.ossuary, LANDMARK_IDS.townhall, LANDMARK_IDS.hpp, LANDMARK_IDS.petka, LANDMARK_IDS.dimitrij, ...Object.values(CFG.models ?? {}), ...(CFG.dropBuildings ?? [])].filter((id): id is number => id != null));
// models placed as rectangles (`modelRects`) replace whatever OSM drew there (Залив на коските: its huts)
const rectRing = ([lat, lon, len, wid, hd]: [number, number, number, number, number]): Ring => {
  const [cx, cz] = proj(lat, lon), a: Pt = [Math.sin(hd), -Math.cos(hd)], b: Pt = [-a[1], a[0]];
  return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([su, sv]): Pt => [cx + a[0] * su * len / 2 + b[0] * sv * wid / 2, cz + a[1] * su * len / 2 + b[1] * sv * wid / 2]);
};
for (const rr of Object.values(CFG.modelRects ?? {})) {
  const ring = rectRing(rr);
  for (const el of raw.elements) if (el.type === 'way' && el.tags?.building && el.geometry?.length && pip(centroid(dropLast(wayPts(el.geometry))), ring)) SKIP_BUILDINGS.add(el.id);
}
// buildings OSM lacks join the download as closed ways, so they are read like any other
for (const el of raw.elements) { const t = CFG.buildingTags?.[el.id]; if (t && el.type === 'way') el.tags = { ...el.tags, ...t }; }
for (const el of raw.elements) { const t = CFG.relationTags?.[el.id]; if (t && el.type === 'relation') el.tags = { ...el.tags, ...t }; }
(CFG.extraBuildings ?? []).forEach(({ tags, r }, i) => {
  raw.elements.push({ type: 'way', id: 9e11 + i, tags, geometry: [...r, r[0]].map(([lat, lon]) => ({ lat, lon })) });
});
/** an OSM node's position: from the download, else from `nodeLL` */
const nodeAt = (id: number): Pt | null => {
  const el = raw.elements.find((e) => e.type === 'node' && e.id === id);
  if (el) return proj(el.lat!, el.lon!);
  const ll = CFG.nodeLL[id];
  return ll ? proj(...ll) : null;
};
for (const [key, id] of [['heroes', LANDMARK_IDS.heroes], ['vatasa', LANDMARK_IDS.vatasa]] as const) {
  const p = id != null ? nodeAt(id) : null;
  if (p) out.landmarks[key] = r1p(p);
}
if (CFG.landmarkLL?.revolution) {
  out.landmarks.revolution = r1p(proj(...CFG.landmarkLL.revolution));
  out.places.revolution = out.landmarks.revolution;
}
if (CFG.landmarkLL?.culture) {
  const [lat, lon, heading] = CFG.landmarkLL.culture;
  const c = r1p(proj(lat, lon));
  out.landmarks.culture = [c[0], c[1], heading];
  out.places.culture = c;
}
if (CFG.landmarkLL?.petkaTower) out.landmarks.petkaTower = r1p(proj(...CFG.landmarkLL.petkaTower));
if (CFG.landmarkLL?.market) {
  const [lat, lon, heading] = CFG.landmarkLL.market;
  const c = r1p(proj(lat, lon));
  out.landmarks.market = [c[0], c[1], heading];
  out.places.market = c;
}
for (const el of raw.elements) {
  if (el.type !== 'way') continue;
  const pts = wayPts(el.geometry || []);
  if (el.id === LANDMARK_IDS.stoneBridge) out.landmarks.stoneBridge = flat(pts);
  if (el.id === LANDMARK_IDS.fountain) { const r = dropLast(pts); out.landmarks.warrior = r1p(centroid(r)); }
  if (el.id === LANDMARK_IDS.porta) out.landmarks.porta = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.ossuary) out.landmarks.ossuary = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.townhall) out.landmarks.townhall = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.stadium) out.landmarks.stadium = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.petka) out.landmarks.petka = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.dimitrij) out.landmarks.dimitrij = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.damCrest) out.landmarks.damCrest = flat(pts);
  if (el.id === LANDMARK_IDS.dam) out.landmarks.dam = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.hpp) out.landmarks.hpp = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.switchyard) out.landmarks.switchyard = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.spillway) out.landmarks.spillway = flat(dropLast(pts));
  for (const [key, id] of Object.entries(CFG.models ?? {})) if (el.id === id) (out.landmarks.models ??= {})[key] = flat(dropLast(pts));
}
for (const [key, rr] of Object.entries(CFG.modelRects ?? {})) {
  const hd = rr[4], a: Pt = [Math.sin(hd), -Math.cos(hd)];
  (out.landmarks.models ??= {})[key] = flat(rectRing(rr));
  (out.landmarks.modelAxes ??= {})[key] = [Math.round(a[0] * 1e4) / 1e4, Math.round(a[1] * 1e4) / 1e4];
}
// Kavadarci, Луда Мара: the regulated channel's centre line (south → north, every 2 m), centred between
// the two promenade footways where OSM has both (the river line is up to 3 m off), smoothed; the rest
// of the river as lines (a narrow stream of water in the channel cut by scripts/terrain.ts)
if (CFG.canal) {
  const C = CFG.canal, ways = new Map<number, Ring>();
  for (const el of raw.elements) if (el.type === 'way' && ([...C.river, C.from, C.to, ...C.banks] as number[]).includes(el.id)) ways.set(el.id, wayPts(el.geometry || []));
  const main = ways.get(C.river[0]), fromW = ways.get(C.from), toW = ways.get(C.to);
  if (main && fromW && toW) {
    // arc length along the river of the point nearest to p
    const cum = [0];
    for (let i = 1; i < main.length; i++) cum.push(cum[i - 1] + Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]));
    const nearest = (p: Pt, line: Ring): { s: number; q: Pt; d: number } => {
      let best = { s: 0, q: line[0], d: Infinity };
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        const t = L2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2)) : 0;
        const q: Pt = [ax + dx * t, az + dz * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < best.d) best = { s: line === main ? cum[i] + Math.sqrt(L2) * t : 0, q, d };
      }
      return best;
    };
    const mid = (r: Ring): Pt => { const a = r[0], b = r[r.length - 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    let s0 = nearest(mid(fromW), main).s, s1 = nearest(mid(toW), main).s;
    if (s0 > s1) [s0, s1] = [s1, s0];
    const at = (s: number): [Pt, Pt] => { // point and unit tangent at arc length s
      let i = 0;
      while (i < cum.length - 2 && cum[i + 1] < s) i++;
      const L = cum[i + 1] - cum[i] || 1, t = (s - cum[i]) / L, a = main[i], b = main[i + 1];
      return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [(b[0] - a[0]) / L, (b[1] - a[1]) / L]];
    };
    const banks = C.banks.map((id) => ways.get(id)).filter((r): r is Ring => !!r);
    const n = Math.floor((s1 - s0) / 2), offs: (Pt | null)[] = [];
    const base: Pt[] = [];
    for (let k = 0; k <= n; k++) {
      const [p, tg] = at(s0 + ((s1 - s0) * k) / n), nrm: Pt = [-tg[1], tg[0]];
      base.push(p);
      // the nearest footway on each side, within 12 m
      let l: Pt | null = null, r: Pt | null = null, dl = 12, dr = 12;
      for (const b of banks) {
        const { q, d } = nearest(p, b), side = (q[0] - p[0]) * nrm[0] + (q[1] - p[1]) * nrm[1];
        if (side > 0 && d < dl) { dl = d; l = q; }
        if (side < 0 && d < dr) { dr = d; r = q; }
      }
      offs.push(l && r ? [(l[0] + r[0]) / 2 - p[0], (l[1] + r[1]) / 2 - p[1]] : null);
    }
    // fill the gaps by interpolating the known offsets (zero at the ends of the section)
    if (!offs[0]) offs[0] = [0, 0];
    if (!offs[n]) offs[n] = [0, 0];
    for (let k = 0; k <= n; k++) if (!offs[k]) {
      let a = k - 1, b = k + 1;
      while (!offs[b]) b++;
      const A = offs[a]!, B = offs[b]!, t = (k - a) / (b - a);
      offs[k] = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    }
    const raw2 = base.map((p, k): Pt => [p[0] + offs[k]![0], p[1] + offs[k]![1]]);
    // smooth twice over ±12 m (keeping the ends, which sit under the bridges)
    let line = raw2;
    for (let pass = 0; pass < 2; pass++)
      line = line.map((p, k) => {
        const w = Math.min(6, k, n - k);
        let x = 0, z = 0;
        for (let q = k - w; q <= k + w; q++) { x += line[q][0]; z += line[q][1]; }
        return [x / (2 * w + 1), z / (2 * w + 1)];
      });
    out.landmarks.canal = flat(line);
    // the river outside the section, and the stream above it, as lines inside the map
    const inMap = (p: Pt) => Math.abs(p[0]) < W / 2 - 20 && Math.abs(p[1]) < H / 2 - 20;
    const streams: Flat[] = [];
    const runs = (pts: Ring) => {
      let run: Ring = [];
      for (const p of pts) {
        if (inMap(p)) run.push(p);
        else { if (run.length > 1) streams.push(flat(run)); run = []; }
      }
      if (run.length > 1) streams.push(flat(run));
    };
    runs(main.filter((_, i) => cum[i] <= s0 + 1));
    runs(main.filter((_, i) => cum[i] >= s1 - 1));
    for (const id of C.river.slice(1)) { const r = ways.get(id); if (r) runs(r); }
    out.landmarks.streams = streams;
    console.log(`Луда Мара: channel ${Math.round(s1 - s0)} m (${offs.filter((o) => o![0] || o![1]).length} of ${n + 1} points recentred), ${streams.length} stream lines`);
  }
}
// exact positions of named places (area-weighted centroid of the largest matching shape)
const PLACE_NAMES = CFG.placeNames;
const PLACE_IDS = CFG.placeIds;
const areaCentroid = (r: Ring): Pt => {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % n], f = x1 * z2 - x2 * z1;
    a += f; cx += (x1 + x2) * f; cz += (z1 + z2) * f;
  }
  return Math.abs(a) < 1e-6 ? centroid(r) : [cx / (3 * a), cz / (3 * a)];
};
for (const [key, name] of Object.entries(PLACE_NAMES)) {
  let best: { a: number; c: Pt } | null = null;
  for (const el of raw.elements) {
    if (el.tags?.name !== name) continue;
    for (const poly of polygonsOf(el)) {
      const a = Math.abs(area(poly[0]));
      if (!best || a > best.a) best = { a, c: areaCentroid(poly[0]) };
    }
  }
  if (best) out.places[key] = r1p(best.c);
}
for (const [key, id] of Object.entries(PLACE_IDS)) {
  const el = raw.elements.find((e) => e.type === 'way' && e.id === id);
  const poly = el ? polygonsOf(el)[0] : undefined;
  if (poly) out.places[key] = r1p(areaCentroid(poly[0]));
}
for (const [key, id] of Object.entries(CFG.placeNodes)) {
  const p = nodeAt(id);
  if (p) out.places[key] = r1p(p);
}
// Vodno gondola (separate small download: data/aerialway.json)
if (CFG.aerialway && fs.existsSync(CFG.aerialway)) {
  const aw = JSON.parse(fs.readFileSync(CFG.aerialway, 'utf8')) as OsmJson;
  for (const el of aw.elements) {
    if (el.type === 'way' && el.tags?.aerialway === 'gondola') out.landmarks.gondola = flat(wayPts(el.geometry || []));
  }
  out.landmarks.pylons = aw.elements.filter((e) => e.type === 'node' && e.tags?.aerialway === 'pylon').flatMap((e) => r1p(proj(e.lat!, e.lon!)));
}

const ROAD_W: Record<string, number> = {
  motorway: 18, trunk: 16, primary: 14, secondary: 12, tertiary: 10,
  primary_link: 8, secondary_link: 7, tertiary_link: 7,
  residential: 7, unclassified: 7, living_street: 6, service: 4.5,
  pedestrian: 6, footway: 2.4, path: 2.2, cycleway: 2.4, steps: 2.6, track: 3, bridleway: 2.2,
};

function areaKind(t: Tags): string | null {
  if (isWater(t)) return 'water';
  if (t.leisure === 'swimming_pool') return 'pool';
  if (t.leisure === 'pitch' || t.leisure === 'track') {
    const s = t.surface || '';
    if (/clay/.test(s) || t.leisure === 'track') return 'clay';
    if (/asphalt|concrete|acrylic|tartan|paved/.test(s)) return 'court';
    return 'pitch';
  }
  if (t.leisure === 'ice_rink') return 'court';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'recreation_ground' || t.landuse === 'village_green') return 'park';
  if (t.leisure === 'playground') return 'play';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub' || t.natural === 'heath') return 'scrub';
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.natural === 'grassland' || t.landuse === 'flowerbed') return 'grass';
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return 'cemetery';
  if (t.landuse === 'construction' || t.landuse === 'brownfield') return 'dirt';
  if (t.historic === 'castle' || t.historic === 'archaeological_site' || t.historic === 'ruins') return 'fortress';
  if (t.amenity === 'parking') return 'parking';
  if (t.place === 'square' || t['area:highway'] || t.amenity === 'marketplace' || (t.highway === 'pedestrian' && t.area === 'yes')) return 'plaza';
  if (t.leisure === 'sports_centre' || t.amenity === 'school' || t.amenity === 'university' || t.amenity === 'hospital' || t.landuse === 'religious' || t.amenity === 'place_of_worship') return 'campus';
  if (t.railway === 'platform') return 'plaza';
  return null;
}
const AREA_Z: Record<string, number> = { campus: 0, fortress: 1, dirt: 1, cemetery: 2, grass: 3, scrub: 3, park: 3, wood: 4, play: 5, parking: 5, plaza: 5, pitch: 6, clay: 6, court: 6, water: 7, pool: 8 };

// Known districts (lat/lon boxes) that shape height guesses where OSM has no tags
const inZone = (lat: number, lon: number, z: Zone) => lat > z[0] && lat < z[1] && lon > z[2] && lon < z[3];
const ZONES_TALL = CFG.tall;
const ZONES_MID = CFG.mid;
const HOUSE = ['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'cabin', 'hut', 'garage', 'garages', 'shed', 'kiosk', 'service', 'toilets'];
const INDUSTRIAL = ['industrial', 'warehouse', 'factory', 'manufacture', 'hangar', 'storage_tank', 'transportation'];
const PUBLIC = ['school', 'university', 'college', 'hospital', 'public', 'civic', 'government', 'office', 'kindergarten', 'train_station'];

// industrial landuse polygons (pre-pass) so untagged halls stay low
const industrialGrid = new PolyGrid<null>(60);
for (const el of raw.elements) {
  const t = el.tags || {};
  if (t.landuse === 'industrial' && el.type === 'way') {
    const pts = wayPts(el.geometry || []);
    if (pts.length > 3) industrialGrid.add([pts.slice(0, -1)], null);
  }
}

// fortress outlines (Kale): buildings inside stay low unless tagged otherwise
const castleGrid = new PolyGrid<null>(60);
for (const el of raw.elements) {
  if (el.tags?.historic === 'castle' && el.type === 'way') {
    const pts = wayPts(el.geometry || []);
    if (pts.length > 3) castleGrid.add([pts.slice(0, -1)], null);
  }
}

interface BuildingInfo { h: number; mh: number; lv: number; old: boolean; a: number; kind: 'ind' | 'fortress' | null }
/** `zones` false: ignore the tall / mid districts (outlines without any tags, mostly houses) */
function buildingInfo(el: OsmElement, poly: Poly, zones = true): BuildingInfo {
  const t = el.tags ?? {};
  const outer = poly[0];
  const a = Math.abs(area(outer));
  const [cx, cz] = centroid(outer);
  const lat = lat0 - cz / ky, lon = lon0 + cx / kx;
  const old = !!OLD && lat > OLD.s && lat < OLD.n && lon > OLD.w && lon < OLD.e;
  const dSq = Math.hypot(cx - SQUARE[0], cz - SQUARE[1]);
  const type = t.building ?? 'yes';
  let levels = parseNum(t['building:levels']);
  let h = parseNum(t.height);
  const minLevel = parseNum(t['building:min_level']);
  const mh = parseNum(t.min_height) ?? (minLevel != null ? minLevel * 3.2 : 0);
  const rv = rnd(el.id, 1), rv2 = rnd(el.id, 2);
  let kind: BuildingInfo['kind'] = null;
  // defensive towers of the fortress: stone, ~14 m, battlements (see src/city.ts)
  if (t.man_made === 'tower' && /defensive|fortification/.test(t['tower:type'] || '')) {
    return { h: Math.max(h ?? 14, 6), mh: 0, lv: 1, old, a, kind: 'fortress' };
  }
  const inCastle = castleGrid.hit(cx, cz);
  if (h == null && levels == null) {
    const ob = obb(outer);
    const aspect = ob ? ob.L / Math.max(ob.W, 0.5) : 1, wid = ob ? ob.W * 2 : 10;
    const tall = zones && ZONES_TALL.some((z) => inZone(lat, lon, z));
    const mid = zones && !tall && ZONES_MID.some((z) => inZone(lat, lon, z));
    const ind = INDUSTRIAL.includes(type) || (a > 400 && ['yes', 'commercial', 'retail'].includes(type) && industrialGrid.hit(cx, cz));
    const between = (lo: number, span: number) => lo + Math.floor(rv * (span + 1));
    if (HOUSE.includes(type)) levels = between(1, 1);
    else if (type === 'roof' || type === 'carport') levels = 1;
    else if (ind) { kind = 'ind'; levels = 1; h = 6 + rv * 5; }
    else if (old) levels = a < 80 ? 1 : between(1, 1);
    else if (PUBLIC.includes(type)) levels = between(2, 3);
    else if ((type === 'retail' || type === 'commercial') && a > 1500) levels = between(1, 2);
    else {
      const apt = type === 'apartments' || type === 'residential';
      const tower = a > 180 && a < 1100 && aspect < 1.6;
      const slab = aspect > 2.3 && wid > 8.5 && wid < 18 && a > 320;
      if (tower && (tall || mid || apt)) levels = tall ? between(10, 8) : mid ? between(7, 6) : between(6, 5);
      else if (slab && (tall || mid || apt)) levels = tall ? between(7, 5) : mid ? between(5, 4) : between(4, 4);
      else if (a < 70) levels = between(1, 1);
      else if (a < 160) levels = tall || mid ? between(2, 2) : between(1, 2);
      else if (a < 420) levels = tall || mid ? between(3, 3) : between(2, 2);
      else levels = tall || mid ? between(4, 4) : between(2, 3);
      if (apt) levels = Math.max(levels, rv2 < 0.5 ? 3 : 4);
      if (CFG.squareBonus && !old && dSq < 900 && a > 150) levels += Math.floor(rv2 * 3);
    }
    levels = Math.min(levels, CFG.maxLevels);
    if (inCastle) levels = Math.min(levels, 2);
  }
  // levels is set whenever h is missing (the block above)
  if (h == null) h = levels! * 3.1 + (type === 'roof' ? 0.5 : 0.6);
  if (type === 'roof') return { h: Math.max(h, 3.5), mh: Math.max(h - 0.6, 3), lv: 1, old, a, kind };
  return { h: Math.max(h, 2.6), mh: Math.min(mh, h - 1), lv: levels ?? Math.max(1, Math.round(h / 3.1)), old, a, kind };
}

const inBox = (pts: Pt[], m = 0) => pts.every(([x, z]) => Math.abs(x) < W / 2 - m && Math.abs(z) < H / 2 - m);
const anyInBox = (pts: Pt[]) => pts.some(([x, z]) => Math.abs(x) < W / 2 + 50 && Math.abs(z) < H / 2 + 50);

for (const el of raw.elements) {
  const t: Tags = el.tags || {};
  const crossH = parseNum(t.height) ?? 0;
  if (t.man_made === 'cross' && crossH >= 20) {
    const pts = el.type === 'node' ? [proj(el.lat!, el.lon!)] : dropLast(wayPts(el.geometry || []));
    const [x, z] = centroid(pts);
    if (inBox([[x, z]], 5)) out.crosses.push({ x: r1(x), z: r1(z), h: crossH, name: t['name:en'] || t.name || '' });
    continue;
  }
  if (el.type === 'node') {
    if (t.natural === 'tree') {
      const [x, z] = proj(el.lat!, el.lon!);
      if (inBox([[x, z]], 3)) out.trees.push(r1(x), r1(z));
    }
    continue;
  }

  // Towers / minarets mapped as ways
  if (t.man_made === 'tower' && el.type === 'way') {
    const pts = dropLast(wayPts(el.geometry || []));
    const minaretTag = t['tower:type'] === 'minaret' || /minaret|минаре/i.test(t.name || '');
    if (pts.length >= 3 && inBox(pts) && (minaretTag || !t.building)) {
      const [cx, cz] = centroid(pts);
      const r = Math.sqrt(Math.abs(area(pts)) / Math.PI);
      const minaret = t['tower:type'] === 'minaret' || /minaret|минаре/i.test(t.name || '');
      out.towers.push({ x: r1(cx), z: r1(cz), r: r1(Math.min(Math.max(r, 1.5), 6)), h: parseNum(t.height) ?? (minaret ? 32 : 18), m: minaret ? 1 : 0 });
    }
    if (!t.building) continue;
  }

  if (t.building && t.building !== 'no' && !t['building:part'] && !SKIP_BUILDINGS.has(el.id)) {
    if (t.location === 'underground' || (t.layer && (parseNum(t.layer) ?? 0) < 0)) continue;
    for (const poly of polygonsOf(el)) {
      if (!inBox(poly[0], 2)) continue;
      const info = buildingInfo(el, poly);
      if (info.a < 6) continue;
      out.buildings.push({
        id: el.id,
        r: poly.map(flat),
        h: r1(info.h), mh: r1(info.mh), lv: info.lv,
        old: info.old ? 1 : 0,
        t: info.kind === 'ind' ? 'industrial' : info.kind === 'fortress' ? 'fortress' : t.building,
        rs: t['roof:shape'] || null,
        w: /mosque|church|cathedral|chapel|religious/.test(t.building) || t.amenity === 'place_of_worship' ? (t.religion === 'muslim' || t.building === 'mosque' ? 'mosque' : 'church') : null,
        c: t['building:colour'] || null,
      });
    }
    continue;
  }

  if (t.barrier === 'city_wall' || (t.barrier === 'wall' && t.historic)) {
    const pts = wayPts(el.geometry || []);
    if (anyInBox(pts)) out.walls.push({ p: flat(pts), h: parseNum(t.height) ?? (t.barrier === 'city_wall' ? 8 : 3), w: t.barrier === 'city_wall' ? 3 : 1 });
    continue;
  }

  if (t.natural === 'tree_row') {
    const pts = wayPts(el.geometry || []);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const L = Math.hypot(x2 - x1, z2 - z1);
      for (let d = 0; d < L; d += 8) {
        const x = x1 + ((x2 - x1) * d) / L, z = z1 + ((z2 - z1) * d) / L;
        if (inBox([[x, z]], 3)) out.trees.push(r1(x), r1(z));
      }
    }
    continue;
  }

  const ak = areaKind(t);
  if (ak && (el.type === 'relation' || isClosed(wayPts(el.geometry || [])))) {
    for (const poly of polygonsOf(el)) {
      if (!anyInBox(poly[0])) continue;
      out.areas.push({ k: ak, z: AREA_Z[ak], a: r1(Math.abs(area(poly[0]))), r: poly.map(flat), ...(ak === 'plaza' && CFG.plazaColour ? { c: CFG.plazaColour } : {}) });
    }
    if (!(t.highway && t.area !== 'yes')) continue;
  }

  if (t.highway && ROAD_W[t.highway] && t.area !== 'yes' && el.type === 'way') {
    if (t.tunnel === 'yes' || t.tunnel === 'building_passage' || t.indoor === 'yes' || (t.level && (parseNum(t.level) ?? 0) < 0)) continue;
    const pts = wayPts(el.geometry || []);
    if (!anyInBox(pts)) continue;
    let w = ROAD_W[t.highway];
    const lanes = parseNum(t.lanes);
    if (lanes && w > 6) w = Math.max(w, lanes * 3.2 + 1);
    const width = parseNum(t.width);
    if (width) w = width;
    out.roads.push({ k: t.highway, w: r1(w), b: t.bridge && t.bridge !== 'no' ? 1 : 0, p: flat(pts) });
    continue;
  }

  if (t.railway && ['rail', 'light_rail', 'tram', 'disused'].includes(t.railway) && el.type === 'way') {
    if (t.tunnel === 'yes') continue;
    const pts = wayPts(el.geometry || []);
    if (anyInBox(pts)) out.rails.push({ b: t.bridge ? 1 : 0, p: flat(pts) });
  }
}

// Buildings OSM lacks, from Overture Maps (scripts/overture.ts): machine-learned outlines traced from
// aerial images. Kept only where nothing else is: not over an OSM building, a hand-modelled landmark,
// water or a road. No tags, so their heights are guessed like untagged OSM buildings.
if (FILES.overture) {
  if (!fs.existsSync(FILES.overture)) {
    console.error(`${FILES.overture} is missing: run \`npm run overture -- ${CITY}\` first`);
    process.exit(1);
  }
  const ov = JSON.parse(fs.readFileSync(FILES.overture, 'utf8')) as { attribution: string; buildings: { id: string; r: number[][] }[] };
  out.meta.attribution += `, ${ov.attribution}`;
  const toPoly = (r: number[]): Ring => { const pts: Ring = []; for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]); return pts; };
  const osmGrid = new PolyGrid<{ a: number }>(40);
  for (const b of out.buildings) osmGrid.add(b.r.map(toPoly), { a: Math.abs(area(toPoly(b.r[0]))) });
  const blockGrid = new PolyGrid<null>(40); // water, pools
  for (const a of out.areas) if (a.k === 'water' || a.k === 'pool') blockGrid.add(a.r.map(toPoly), null);
  // hand-modelled landmarks: their outlines (padded) and points with a radius (metres)
  const keepOut: [poly: Ring | null, x: number, z: number, pad: number][] = [];
  const L = out.landmarks;
  // (the ossuary: its OSM outline is only the house on the shaft, the modelled courtyard round it is ~21 m square)
  for (const [ring, pad] of [[L.townhall, 3], [L.ossuary, 11], [L.stadium, 30], [L.porta, 3], [L.dam, 5], [L.hpp, 4], [L.switchyard, 3], [L.petka, 3], [L.dimitrij, 3]] as const) if (ring) keepOut.push([toPoly(ring), 0, 0, pad]);
  // Bitola's monuments (src/bitola.ts); the theatre's and the basilica's ruins lie inside Хераклеа's outline
  for (const [k, ring] of Object.entries(L.models ?? {})) keepOut.push([toPoly(ring), 0, 0, k === 'heraclea' ? 0 : 2]);
  // the market's deck (in its frame: x across, z along the roof, south +)
  let marketRing: Ring | null = null;
  if (L.market) {
    const [mx, mz, rot] = L.market, c = Math.cos(rot), sn = Math.sin(rot);
    marketRing = MARKET_OUTLINE.map(([u, v]): Pt => [mx + u * c + v * sn, mz - u * sn + v * c]);
    keepOut.push([marketRing, 0, 0, 1]);
  }
  for (const [p, pad] of [[L.culture, 26], [L.revolution, 12], [L.heroes, 16], [L.vatasa, 14], [L.warrior, 15], [L.petkaTower, 6]] as const) if (p) keepOut.push([null, p[0], p[1], pad]);
  const nearLandmark = (x: number, z: number) => keepOut.some(([ring, lx, lz, pad]) => {
    if (!ring) return Math.hypot(x - lx, z - lz) < pad;
    if (pip([x, z], ring)) return true;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, az] = ring[j], dx = ring[i][0] - ax, dz = ring[i][1] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(x - ax - t * dx, z - az - t * dz) < pad) return true;
    }
    return false;
  });
  // road centrelines every 1.5 m (not paths: they cross yards loosely drawn)
  const roadPts = new Map<number, Pt[]>();
  const RC = 20, rk = (i: number, j: number) => i * 100003 + j;
  for (const rd of out.roads) {
    if (['footway', 'path', 'steps', 'cycleway', 'track', 'bridleway'].includes(rd.k)) continue;
    for (let i = 0; i + 3 < rd.p.length; i += 2) {
      const x1 = rd.p[i], z1 = rd.p[i + 1], x2 = rd.p[i + 2], z2 = rd.p[i + 3], n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.5);
      for (let s = 0; s <= n; s++) {
        const x = x1 + ((x2 - x1) * s) / n, z = z1 + ((z2 - z1) * s) / n, k = rk(Math.floor(x / RC), Math.floor(z / RC));
        let arr = roadPts.get(k);
        if (!arr) roadPts.set(k, (arr = []));
        arr.push([x, z]);
      }
    }
  }
  const usedIds = new Set(out.buildings.map((b) => b.id));
  const dropped = { osm: 0, landmark: 0, water: 0, road: 0, small: 0, outside: 0 };
  let added = 0;
  for (const ob of ov.buildings) {
    const poly: Poly = ob.r.map((ring) => dropLast(toPoly(ring).map(([lon, lat]) => proj(lat, lon))));
    const outer = poly[0];
    if (outer.length < 3 || !inBox(outer, 2)) { dropped.outside++; continue; }
    if (toPoly(ob.r[0]).some(([lon, lat]) => inCut(lat, lon))) { dropped.outside++; continue; } // a neighbour's map (`cut`)
    const a = Math.abs(area(outer));
    if (a < 6) { dropped.small++; continue; }
    const [cx, cz] = areaCentroid(outer);
    // (the market's deck: not even a corner on it, its roof's edge reads as small buildings)
    if (nearLandmark(cx, cz) || (marketRing && outer.some((p) => pip(p, marketRing)))) { dropped.landmark++; continue; }
    if (blockGrid.hit(cx, cz)) { dropped.water++; continue; }
    // overlap with OSM buildings and water: sample the outline on a 1 m grid
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of outer) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const hitArea = new Map<object, number>();
    let inside = 0, wet = 0;
    for (let x = Math.floor(x0) + 0.5; x < x1; x++)
      for (let z = Math.floor(z0) + 0.5; z < z1; z++) {
        if (!pip([x, z], outer)) continue;
        inside++;
        const h = osmGrid.hit(x, z);
        if (h) hitArea.set(h, (hitArea.get(h) ?? 0) + 1);
        if (blockGrid.hit(x, z)) wet++;
      }
    const n = Math.max(inside, 1);
    let overOsm = false;
    for (const [h, k] of hitArea) if (k > 0.2 * n || k > 0.2 * (h as { data: { a: number } }).data.a) overOsm = true;
    if (overOsm) { dropped.osm++; continue; }
    if (wet > 0.2 * n) { dropped.water++; continue; }
    // a road running through it (more than a corner)
    let onRoad = 0;
    for (let i = Math.floor(x0 / RC); i <= Math.floor(x1 / RC); i++)
      for (let j = Math.floor(z0 / RC); j <= Math.floor(z1 / RC); j++)
        for (const p of roadPts.get(rk(i, j)) ?? []) if (pip(p, outer)) onRoad++;
    if (onRoad >= 2) { dropped.road++; continue; }
    // a numeric id from the Overture id (seeds the facade colours, roof and windows)
    let h = 2166136261;
    for (let i = 0; i < ob.id.length; i++) h = Math.imul(h ^ ob.id.charCodeAt(i), 16777619);
    let id = 1e12 + (h >>> 0);
    while (usedIds.has(id)) id++;
    usedIds.add(id);
    const el: OsmElement = { type: 'way', id, tags: { building: 'yes' } };
    // most blocks of flats are in OSM already (with tags): these are mostly family houses
    const info = buildingInfo(el, poly, false);
    out.buildings.push({ id, r: poly.map(flat), h: r1(info.h), mh: r1(info.mh), lv: info.lv, old: info.old ? 1 : 0, t: info.kind === 'ind' ? 'industrial' : 'yes', rs: null, w: null, c: null });
    added++;
  }
  console.log(`Overture: ${added} buildings added of ${ov.buildings.length}; left out:`, dropped);
}

for (const ll of CFG.extraPlazas ?? []) {
  const r = ll.map(([lat, lon]) => proj(lat, lon));
  out.areas.push({ k: 'plaza', z: AREA_Z.plaza, a: r1(Math.abs(area(r))), r: [flat(r)], ...(CFG.plazaColour ? { c: CFG.plazaColour } : {}) });
}

// rivers OSM has only as lines: a strip of water along the line (one polygon per way, mitred at the bends),
// in the channel scripts/terrain.ts cuts along it
// (a way split by a cut rectangle keeps its id on the first piece, the others get id + k·1e12: all are taken)
for (const [id, hw] of CFG.waterLines ?? []) {
  const els = raw.elements.filter((e) => e.type === 'way' && (e.id === id || (e.id > 1e12 && e.id % 1e12 === id)));
  if (!els.length) { console.warn(`waterLines: way ${id} is not in the download`); continue; }
  for (const el of els) {
  const pts = wayPts(el.geometry || []);
  const off = (sgn: number) => pts.map((p, i): Pt => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / l) * hw * sgn, p[1] + (dx / l) * hw * sgn];
  });
  const r = [...off(1), ...off(-1).reverse()];
  out.areas.push({ k: 'water', z: AREA_Z.water, a: r1(Math.abs(area(r))), r: [flat(r)] });
  }
}

// River polygon fallback ordering
out.areas.sort((a, b) => a.z - b.z || b.a - a.a);

fs.writeFileSync(outFile, JSON.stringify(out));
console.log(
  `buildings ${out.buildings.length}, areas ${out.areas.length}, roads ${out.roads.length}, rails ${out.rails.length}, walls ${out.walls.length}, trees ${out.trees.length / 2}, towers ${out.towers.length}`,
  `size ${(fs.statSync(outFile).size / 1e6).toFixed(2)}MB  map ${W.toFixed(0)}x${H.toFixed(0)}m`
);
