// Converts raw Overpass JSON (out geom) into a compact, projected scene description.
// Usage: node scripts/prepare.ts [city]   (FILES.raw → FILES.scene; default skopje)
import fs from 'node:fs';

import { CITY, FILES, lat0, lon0, kx, ky, proj, W, H, type CityName } from './config.ts';
import { obb, PolyGrid } from '../src/geo.ts';
import { wayPts, isClosed, area, centroid, pip, dropLast, polygonsOf, isWater, type OsmElement, type OsmJson, type Tags } from './osm.ts';
import type { CityData, Poly, Pt, Ring } from '../src/types.ts';

const inFile = FILES.raw, outFile = FILES.scene;
if (!fs.existsSync(inFile)) {
  console.error(`${inFile} is missing: run \`npm run download -- ${CITY}\` first`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(inFile, 'utf8')) as OsmJson;

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
  landmarks: { stoneBridge?: number; fountain?: number; porta?: number; ossuary?: number; heroes?: number; vatasa?: number; townhall?: number };
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
  };
  tall: Zone[];
  mid: Zone[];
  /** a few extra storeys for blocks close to the main square (a capital's centre) */
  squareBonus: boolean;
  /** highest guessed storey count (tagged buildings keep their tags) */
  maxLevels: number;
  /** the Vodno gondola (separate small download) */
  aerialway?: string;
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
    },
    placeNames: { square: 'Плоштад Маршал Тито', vatasa: 'Спомен парк Ваташа', katunisko: 'Катунишко Езеро' },
    placeIds: {
      ossuary: 1275768512,
      dimitrij: 1111874740, // Св. Димитриј
      townhall: 790445885, // Општина Кавадарци
    },
    placeNodes: { heroes: 11845001868, museum: 529811458 }, // culture: the building centre (landmarkLL), not the OSM point
    // copied from OSM (Nov 2026); data/query.overpassql fetches these node types from now on
    nodeLL: {
      11845001868: [41.43364, 22.01948], // historic=memorial, the People's Heroes
      7626158238: [41.40143, 22.02843], // historic=memorial, Масакр во Ваташа
      529811458: [41.43437, 22.01652], // tourism=museum, Музеј Галерија Кавадарци
      373135640: [41.43396, 22.0122], // amenity=theatre, Дом на културата
    },
    // not in OSM: Monument to the Revolution (Petar Palavičini, 1958), position from spomenikdatabase.org/kavadarci
    // Дом на културата „Иван Мазов-Климе“ is not in OSM: placed from the site and floor plans of the
    // fire-safety report (АРХИКОНС, Dec 2023): 41.4 m long, parallel to Илинденска (≈ 14° east of north),
    // its foyer facing ул. 7 Септември at the corner of the two streets
    landmarkLL: { revolution: [41.43322, 22.01231], culture: [41.434017, 22.012032, 0.241] },
    // a small town: blocks of flats around the square, lower everywhere else
    tall: [],
    mid: [[41.4285, 41.4385, 22.003, 22.0225]], // the centre around Плоштад Маршал Тито
    squareBonus: false,
    maxLevels: 9,
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
const SKIP_BUILDINGS = new Set<number>([LANDMARK_IDS.porta, LANDMARK_IDS.ossuary, LANDMARK_IDS.townhall].filter((id): id is number => id != null));
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
for (const el of raw.elements) {
  if (el.type !== 'way') continue;
  const pts = wayPts(el.geometry || []);
  if (el.id === LANDMARK_IDS.stoneBridge) out.landmarks.stoneBridge = flat(pts);
  if (el.id === LANDMARK_IDS.fountain) { const r = dropLast(pts); out.landmarks.warrior = r1p(centroid(r)); }
  if (el.id === LANDMARK_IDS.porta) out.landmarks.porta = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.ossuary) out.landmarks.ossuary = flat(dropLast(pts));
  if (el.id === LANDMARK_IDS.townhall) out.landmarks.townhall = flat(dropLast(pts));
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
function buildingInfo(el: OsmElement, poly: Poly): BuildingInfo {
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
    const tall = ZONES_TALL.some((z) => inZone(lat, lon, z));
    const mid = !tall && ZONES_MID.some((z) => inZone(lat, lon, z));
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
      out.areas.push({ k: ak, z: AREA_Z[ak], a: r1(Math.abs(area(poly[0]))), r: poly.map(flat) });
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

// River polygon fallback ordering
out.areas.sort((a, b) => a.z - b.z || b.a - a.a);

fs.writeFileSync(outFile, JSON.stringify(out));
console.log(
  `buildings ${out.buildings.length}, areas ${out.areas.length}, roads ${out.roads.length}, rails ${out.rails.length}, walls ${out.walls.length}, trees ${out.trees.length / 2}, towers ${out.towers.length}`,
  `size ${(fs.statSync(outFile).size / 1e6).toFixed(2)}MB  map ${W.toFixed(0)}x${H.toFixed(0)}m`
);
