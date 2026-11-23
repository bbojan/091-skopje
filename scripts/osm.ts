// Reading Overpass JSON ("out geom"): shared by prepare.ts (the scene) and terrain.ts (flattening
// water and squares, cutting river channels). Coordinates are projected with the city's `proj`.
import { proj, unproj, type Box } from './config.ts';
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

// ---- Cut rectangles (`cut` in scripts/config.ts): a map that is not a rectangle leaves its neighbours' maps out.
// Every OSM feature is cut away there: points and buildings inside are dropped, lines are split at the edge,
// areas are clipped to the part outside, so the corner shows bare relief, as outside a map.

interface Rect { x0: number; x1: number; z0: number; z1: number }
/** half-plane: coordinate `axis` (0 x, 1 z) below (`lt`) or above `v` */
type Half = [axis: 0 | 1, v: number, lt: boolean];

const rectOf = (c: Box): Rect => {
  const [x0, z1] = proj(c.s, c.w), [x1, z0] = proj(c.n, c.e);
  return { x0, x1, z0, z1 };
};
/** the outside of a rectangle as four disjoint convex regions: west, east, and north / south of it between them */
const outside = (r: Rect): Half[][] => [
  [[0, r.x0, true]],
  [[0, r.x1, false]],
  [[0, r.x0, false], [0, r.x1, true], [1, r.z0, true]],
  [[0, r.x0, false], [0, r.x1, true], [1, r.z1, false]],
];
const inRect = (p: Pt, r: Rect) => p[0] > r.x0 && p[0] < r.x1 && p[1] > r.z0 && p[1] < r.z1;
const touches = (pts: Ring, r: Rect) => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [x, z] of pts) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); }
  return a < r.x1 && b > r.x0 && c < r.z1 && d > r.z0;
};

/** Sutherland–Hodgman: an (open) ring clipped to one convex region */
function clipRing(ring: Ring, region: Half[]): Ring {
  let pts = ring;
  for (const [ax, v, lt] of region) {
    if (!pts.length) break;
    const inside = (p: Pt) => (lt ? p[ax] <= v : p[ax] >= v);
    const out: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (v - a[ax]) / (b[ax] - a[ax]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    pts = out;
  }
  return pts;
}

/** a polyline split into its pieces outside a rectangle */
function splitLine(line: Ring, r: Rect): Ring[] {
  const pieces: Ring[] = [];
  let cur: Ring = [];
  const flush = () => { if (cur.length >= 2) pieces.push(cur); cur = []; };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    // Liang–Barsky: the part of a→b inside the rectangle, t in [t0, t1]
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - r.x0], [dx, r.x1 - a[0]], [-dz, a[1] - r.z0], [dz, r.z1 - a[1]]]) {
      if (p === 0) { if (q < 0) { t0 = 1; t1 = 0; } continue; }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    }
    const at = (t: number): Pt => [a[0] + dx * t, a[1] + dz * t];
    if (t0 >= t1) { if (!cur.length) cur.push(a); cur.push(b); continue; } // wholly outside
    if (!cur.length && t0 > 0) cur.push(a);
    if (t0 > 0) cur.push(at(t0));
    flush();
    if (t1 < 1) cur.push(at(t1), b);
  }
  flush();
  return pieces;
}

const LINE_KEYS = ['highway', 'railway', 'waterway', 'barrier', 'power', 'aerialway'];

/** OSM features with the cut rectangles taken out (prepare.ts and terrain.ts read the result) */
export function cutOsm(raw: OsmJson, cuts: Box[]): OsmJson {
  if (!cuts.length) return raw;
  const rects = cuts.map(rectOf);
  const toLL = (pts: Ring, close: boolean): LatLon[] => {
    const ll = pts.map(([x, z]) => { const [lat, lon] = unproj(x, z); return { lat, lon }; });
    if (close && ll.length) ll.push(ll[0]);
    return ll;
  };
  const elements: OsmElement[] = [];
  let dropped = 0, clipped = 0;
  // pieces after the first get ids of their own (above any OSM id and the added buildings' 9e11 + i)
  const piece = (el: OsmElement, k: number, geometry: LatLon[]): OsmElement => ({ ...el, id: k ? el.id + k * 1e12 : el.id, geometry });
  for (const el of raw.elements) {
    if (el.type === 'node') {
      if (el.lat != null && rects.some((r) => inRect(proj(el.lat!, el.lon!), r))) dropped++;
      else elements.push(el);
      continue;
    }
    const t = el.tags ?? {};
    if (el.type === 'way') {
      const pts = wayPts(el.geometry ?? []);
      if (!pts.length || !rects.some((r) => touches(pts, r))) { elements.push(el); continue; }
      if (t.building || t['building:part']) { // whole or not at all: none with a corner inside
        if (rects.some((r) => pts.some((q) => inRect(q, r)))) dropped++; else elements.push(el);
        continue;
      }
      const isArea = isClosed(pts) && !LINE_KEYS.some((k) => t[k] != null && t.area !== 'yes');
      let parts: Ring[] = [isArea ? dropLast(pts) : pts];
      for (const r of rects) {
        parts = isArea
          ? parts.flatMap((p) => (touches(p, r) ? outside(r).map((reg) => clipRing(p, reg)) : [p])).filter((p) => p.length >= 3 && Math.abs(area(p)) > 1)
          : parts.flatMap((p) => (touches(p, r) ? splitLine(p, r) : [p]));
      }
      if (!parts.length) { dropped++; continue; }
      clipped++;
      parts.forEach((p, k) => elements.push(piece(el, k, toLL(p, isArea))));
      continue;
    }
    // relations (multipolygons): every ring clipped on its own; (outer ∩ R) − (inner ∩ R) = (outer − inner) ∩ R
    const polys = polygonsOf(el);
    if (!polys.length || !polys.some((poly) => rects.some((r) => touches(poly[0], r)))) { elements.push(el); continue; }
    if (t.building && rects.some((r) => polys.some((poly) => poly[0].some((q) => inRect(q, r))))) { dropped++; continue; }
    let rings: [Ring, string][] = polys.flatMap((poly) => poly.map((ring, i): [Ring, string] => [ring, i ? 'inner' : 'outer']));
    for (const r of rects)
      rings = rings.flatMap(([ring, role]) => (touches(ring, r) ? outside(r).map((reg): [Ring, string] => [clipRing(ring, reg), role]) : [[ring, role] as [Ring, string]]))
        .filter(([ring]) => ring.length >= 3 && Math.abs(area(ring)) > 1);
    if (!rings.some(([, role]) => role === 'outer')) { dropped++; continue; }
    clipped++;
    elements.push({ ...el, members: rings.map(([ring, role]) => ({ type: 'way', role, geometry: toLL(ring, true) })) });
  }
  console.log(`cut: ${dropped} features dropped, ${clipped} clipped at the edge of ${cuts.length} cut rectangle(s)`);
  return { ...raw, elements };
}
