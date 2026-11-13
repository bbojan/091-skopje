// Shared shapes: 2D geometry and the public/skopje.json scene description that
// scripts/prepare.ts writes and src/city.ts reads.

/** A point on the map plane: [x east, z south] in metres from the map centre. */
export type Pt = [x: number, z: number];
/** A closed ring (last point not repeated). */
export type Ring = Pt[];
/** Outer ring first, then holes. */
export type Poly = Ring[];
/** Flat coordinate list [x0, z0, x1, z1, …] as stored in skopje.json. */
export type Flat = number[];
/** A 3D point or direction [x, y, z]. */
export type Vec3 = [number, number, number];

export interface MapMeta {
  w: number;
  h: number;
  lat0: number;
  lon0: number;
  kx: number;
  ky: number;
  square: number[];
  attribution: string;
}

export interface BuildingData {
  id: number;
  /** rings as flat coordinate lists, outer first */
  r: Flat[];
  /** height, min height (m) */
  h: number;
  mh: number;
  /** storeys */
  lv: number;
  /** 1 = old town (Čaršija) */
  old: number;
  /** building tag */
  t: string;
  /** roof shape tag */
  rs: string | null;
  /** worship building (mosque, church…) */
  w: string | null;
  /** colour tag */
  c: string | null;
}

export interface AreaData {
  /** area kind (key of PAL.area) */
  k: string;
  /** draw order */
  z: number;
  /** area, m² */
  a: number;
  r: Flat[];
}

export interface RoadData {
  /** OSM highway tag */
  k: string;
  /** width, m */
  w: number;
  /** 1 = bridge */
  b: number;
  p: Flat;
}

export interface RailData { b: number; p: Flat }
export interface WallData { p: Flat; h: number; w: number }
export interface TowerData { x: number; z: number; r: number; h: number; /** 1 = minaret */ m: number }
export interface CrossData { x: number; z: number; h: number; name: string }

export interface LandmarkData {
  warrior?: Pt;
  porta?: Flat;
  stoneBridge?: Flat;
  gondola?: Flat;
  pylons?: Flat;
  /** Kavadarci: the memorial ossuary's outline, the People's Heroes monument, the Vataša memorial,
   *  the Monument to the Revolution on the square */
  ossuary?: Flat;
  heroes?: Pt;
  vatasa?: Pt;
  revolution?: Pt;
  /** Kavadarci: the town hall's outline; Дом на културата as [x, z, heading of its long axis] */
  townhall?: Flat;
  culture?: Flat;
}

/** Exact positions of named places, by key (Skopje: square, porta, park, zoo, arena, bazaar…; Kavadarci: square, ossuary, heroes, vatasa, lake…). */
export type Places = Record<string, Pt>;

export interface CityData {
  meta: MapMeta;
  buildings: BuildingData[];
  areas: AreaData[];
  roads: RoadData[];
  rails: RailData[];
  walls: WallData[];
  /** flat list of tree positions */
  trees: Flat;
  towers: TowerData[];
  crosses: CrossData[];
  landmarks: LandmarkData;
  places: Places;
}

/** public/terrain.json */
export interface TerrainMeta {
  nx: number;
  nz: number;
  cell: number;
  x0: number;
  z0: number;
  min: number;
  max: number;
}

/** Map half extents, used to keep things inside the diorama. */
export interface Bounds { hw: number; hh: number }
