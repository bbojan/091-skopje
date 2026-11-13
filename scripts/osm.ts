// Reading Overpass JSON ("out geom"): shared by prepare.ts (the scene) and terrain.ts (flattening
// water and squares, cutting river channels). Coordinates are projected with the city's `proj`.
import { proj } from './config.ts';
import type { Poly, Pt, Ring } from '../src/types.ts';

// ways and relation members carry their node coordinates
export interface LatLon { lat: number; lon: number }
export type Tags = Record<string, string | undefined>;
export interface OsmMember { type: string; role: string; geometry?: (LatLon | null)[] }
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  /** nodes only */
  lat?: number;
  lon?: number;
  tags?: Tags;
  geometry?: (LatLon | null)[];
  members?: OsmMember[];
}
export interface OsmJson { elements: OsmElement[] }

export function wayPts(geom: (LatLon | null)[]): Ring {
  return geom.filter((g): g is LatLon => !!g).map((g) => proj(g.lat, g.lon));
}
export function isClosed(pts: Ring): boolean {
  if (pts.length < 4) return false;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
}
export function area(pts: Ring): number {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n];
    s += x1 * z2 - x2 * z1;
  }
  return s / 2;
}
export function centroid(pts: Ring): Pt {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}
export function pip(pt: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export const dropLast = (pts: Ring): Ring => (isClosed(pts) ? pts.slice(0, -1) : pts);

// Join member ways into closed rings
export function assembleRings(ways: Ring[]): Ring[] {
  const segs = ways.map((w) => w.slice());
  const rings: Ring[] = [];
  const key = (p: Pt) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  while (segs.length) {
    let ring = segs.shift()!;
    let guard = 0;
    while (!isClosed(ring) && guard++ < 1000) {
      const endK = key(ring[ring.length - 1]);
      let found = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (key(s[0]) === endK) { ring = ring.concat(s.slice(1)); segs.splice(i, 1); found = true; break; }
        if (key(s[s.length - 1]) === endK) { ring = ring.concat(s.slice().reverse().slice(1)); segs.splice(i, 1); found = true; break; }
      }
      if (!found) break;
    }
    if (isClosed(ring)) rings.push(dropLast(ring));
  }
  return rings;
}

// Returns array of polygons: [outerRing, ...holeRings]
export function polygonsOf(el: OsmElement): Poly[] {
  if (el.type === 'way') {
    const pts = wayPts(el.geometry || []);
    if (!isClosed(pts)) return [];
    return [[dropLast(pts)]];
  }
  if (el.type === 'relation') {
    const members = el.members ?? [];
    const outers = assembleRings(members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => wayPts(m.geometry ?? [])));
    const inners = assembleRings(members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => wayPts(m.geometry ?? [])));
    const polys: Poly[] = outers.map((o) => [o]);
    for (const inn of inners) {
      const c = inn[0];
      const host = polys.find((p) => pip(c, p[0]));
      if (host) host.push(inn);
    }
    return polys;
  }
  return [];
}

/** A standing water area (lake, reservoir, river surface): the `water` area kind of prepare.ts. */
export const isWater = (t: Tags): boolean =>
  t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin';
