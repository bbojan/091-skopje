// Flying from map to map, for the F-15 only (docs/IDEAS.md, "Flying from map to map"): which finished map lies
// ahead, its files downloaded in the background before the plane gets there, and the map under a point beyond
// the current map's edge. Not two built maps at once: only the raw files are kept (no parsing while flying), and
// at the edge main.ts switches the map with them.
import { ZONES } from './zones.ts';
import { CITIES, type CityId } from './cities.ts';
import type { MapMeta } from './types.ts';

/** a finished map's raw files, as downloaded */
export interface MapFiles { scene: ArrayBuffer; terrainBin: ArrayBuffer; terrainJson: ArrayBuffer }

const FINISHED = ZONES.filter((z) => z.city);
/** the finished map whose outline holds a point (lat / lon), other than `not` */
export function mapAt(lat: number, lon: number, not?: CityId): CityId | null {
  for (const z of FINISHED) {
    if (z.city === not) continue;
    const r = z.ring;
    let inside = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [xa, ya] = r[a], [xb, yb] = r[b];
      if ((ya > lat) !== (yb > lat) && lon < xa + ((lat - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
    }
    if (inside) return z.city!;
  }
  return null;
}

/** whether a point (lat / lon) lies in a map's own outline (a map that is not a rectangle has its neighbours cut out) */
export function inMap(id: CityId, lat: number, lon: number): boolean {
  const z = FINISHED.find((f) => f.city === id);
  if (!z) return false;
  const r = z.ring;
  let inside = false;
  for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
    const [xa, ya] = r[a], [xb, yb] = r[b];
    if ((ya > lat) !== (yb > lat) && lon < xa + ((lat - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
  }
  return inside;
}

/** what lies ahead of the plane: the map it would enter, and the seconds until it leaves this map */
export interface Ahead { id: CityId; eta: number; dist: number }

/**
 * Looks along a heading from (x, z) on the current map, in steps, for the first point that has left this map's own
 * outline and lies on another finished map (edge to edge, across a gap of a few km, or into a neighbour cut out of
 * this map). `yaw` as in flight.ts (0 = north, -z).
 */
export function lookAhead(meta: MapMeta, here: CityId, x: number, z: number, yaw: number, speed: number): Ahead | null {
  const hw = meta.w / 2, hh = meta.h / 2, dx = Math.sin(yaw), dz = -Math.cos(yaw);
  // the far end: the rectangle's edge along the heading, and a few km beyond it
  let t = 0;
  if (Math.abs(x) < hw && Math.abs(z) < hh) {
    t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (hw - x) / dx); else if (dx < -1e-6) t = Math.min(t, (-hw - x) / dx);
    if (dz > 1e-6) t = Math.min(t, (hh - z) / dz); else if (dz < -1e-6) t = Math.min(t, (-hh - z) / dz);
  }
  const end = t + 4000, step = 400;
  for (let s = 0; s <= end; s += step) {
    const px = x + dx * s, pz = z + dz * s, lat = meta.lat0 - pz / meta.ky, lon = meta.lon0 + px / meta.kx;
    if (inMap(here, lat, lon)) continue;
    const id = mapAt(lat, lon, here);
    if (id) return { id, eta: s / Math.max(speed, 1), dist: s };
  }
  return null;
}

/**
 * Background downloads of the maps ahead: one at a time, low priority, raw bytes only. Keeps at most `maxMaps`
 * maps within `budget` bytes; what is no longer wanted goes first, then the oldest.
 */
export function createPrefetch(o: { maxMaps: number; budget: number }) {
  const ready = new Map<CityId, MapFiles & { bytes: number; at: number }>();
  let current: { id: CityId; got: number; total: number; abort: AbortController } | null = null;
  let wanted: CityId[] = [];
  let paused = false;
  /** measured speed of the downloads, bytes per second (a guess until the first one is done) */
  let rate = 4e6;

  async function grab(url: string, ctl: AbortController, onBytes: (n: number) => void): Promise<ArrayBuffer> {
    const init: RequestInit & { priority?: 'low' } = { signal: ctl.signal, priority: 'low' };
    const res = await fetch(url, init);
    if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onBytes(value.length);
    }
    const all = new Uint8Array(got);
    let k = 0;
    for (const p of parts) { all.set(p, k); k += p.length; }
    return all.buffer;
  }

  async function download(id: CityId): Promise<void> {
    const spec = CITIES[id];
    const abort = new AbortController();
    const job = { id, got: 0, total: spec.sceneBytes + 4e6, abort };
    current = job;
    const t0 = performance.now();
    try {
      const add = (n: number) => { job.got += n; };
      const terrainJson = await grab(spec.files.terrainJson, abort, add);
      const terrainBin = await grab(spec.files.terrainBin, abort, add);
      job.total = job.got + spec.sceneBytes;
      const scene = await grab(spec.files.scene, abort, add);
      const bytes = scene.byteLength + terrainBin.byteLength + terrainJson.byteLength;
      rate = 0.5 * rate + 0.5 * (bytes / Math.max(0.05, (performance.now() - t0) / 1000));
      if (bytes > o.budget) return; // too big to keep on this device: built from the network at the edge
      ready.set(id, { scene, terrainBin, terrainJson, bytes, at: performance.now() });
      trim();
    } catch (e) {
      if (!abort.signal.aborted) console.warn('prefetch', id, e);
    } finally {
      if (current === job) current = null;
      pump();
    }
  }

  function trim(): void {
    const used = () => [...ready.values()].reduce((s, f) => s + f.bytes, 0);
    while (ready.size > o.maxMaps || used() > o.budget) {
      const drop = [...ready.entries()].sort(([a, fa], [b, fb]) => Number(wanted.includes(a)) - Number(wanted.includes(b)) || fa.at - fb.at)[0];
      if (!drop) break;
      ready.delete(drop[0]);
    }
  }

  function pump(): void {
    if (current || paused) return;
    const next = wanted.find((id) => !ready.has(id));
    if (next) void download(next);
  }

  return {
    /** the maps worth having, most urgent first; a download no longer wanted is stopped */
    want(ids: CityId[]): void {
      wanted = ids.slice(0, o.maxMaps);
      if (current && !wanted.includes(current.id)) { current.abort.abort(); current = null; }
      pump();
    },
    /** slow frames: no new download starts meanwhile */
    pause(v: boolean): void { paused = v; if (!v) pump(); },
    has: (id: CityId) => ready.has(id),
    /** the downloaded files, handed over once (they leave the cache) */
    take(id: CityId): MapFiles | null { const f = ready.get(id); ready.delete(id); return f ?? null; },
    /** 0…1 while it downloads, 1 when ready, 0 otherwise */
    progress(id: CityId): number { return ready.has(id) ? 1 : current?.id === id ? Math.min(0.99, current.got / current.total) : 0; },
    /** seconds a download of this map would take at the measured speed */
    seconds(id: CityId): number { return (CITIES[id].sceneBytes + 5e6) / rate; },
    clear(): void { current?.abort.abort(); current = null; ready.clear(); wanted = []; },
  };
}

export type Prefetch = ReturnType<typeof createPrefetch>;
