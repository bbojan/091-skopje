// Downloads OSM data for the city's BBOX from Overpass in tiles and merges them.
// Usage: node scripts/download.ts [city]   (default skopje; output: FILES.raw)
import fs from 'node:fs';
import { BBOX, CITIES, CITY, CUT, FILES } from './config.ts';

const out = FILES.raw;
const body = fs.readFileSync('data/query.overpassql', 'utf8').replace(/\[bbox:[^\]]*\]/, '');
const [NX, NY] = CITIES[CITY].tiles;
// the main server is often at capacity: fall back to the public mirrors
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
// OVERPASS=<url> puts a server first (e.g. the one that answers today)
if (process.env.OVERPASS) SERVERS.unshift(process.env.OVERPASS);
const seen = new Map();
// finished tiles are kept in data/tiles/ until the whole download is written, so a run that gives up
// (busy servers) resumes where it stopped; a changed box or query gives other file names
fs.mkdirSync('data/tiles', { recursive: true });
let hash = 2166136261;
for (const ch of body + JSON.stringify(BBOX) + NX + NY) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
const tileFile = (i: number, j: number) => `data/tiles/${CITY}-${(hash >>> 0).toString(36)}-${i}-${j}.json`;
for (let i = 0; i < NX; i++)
  for (let j = 0; j < NY; j++) {
    const w = BBOX.w + ((BBOX.e - BBOX.w) * i) / NX, e = BBOX.w + ((BBOX.e - BBOX.w) * (i + 1)) / NX;
    const s = BBOX.s + ((BBOX.n - BBOX.s) * j) / NY, n = BBOX.s + ((BBOX.n - BBOX.s) * (j + 1)) / NY;
    // a tile wholly inside a cut rectangle (a neighbour's map) has nothing prepare.ts would keep
    if (CUT.some((c) => s >= c.s && n <= c.n && w >= c.w && e <= c.e)) { console.log(`tile ${i},${j}: in a cut, skipped`); continue; }
    const q = body.replace('[out:json]', `[out:json][bbox:${s},${w},${n},${e}]`);
    if (fs.existsSync(tileFile(i, j))) {
      const els = JSON.parse(fs.readFileSync(tileFile(i, j), 'utf8')) as { type: string; id: number }[];
      for (const el of els) seen.set(el.type + el.id, el);
      console.log(`tile ${i},${j}: ${els.length} elements (total ${seen.size}) from the cache`);
      continue;
    }
    let ok = false;
    for (let attempt = 0; attempt < 8 && !ok; attempt++) {
      const server = SERVERS[attempt % SERVERS.length];
      try {
        const res = await fetch(server, {
          method: 'POST',
          headers: { 'User-Agent': 'room3D-skopje-map/0.1', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(240_000), // a busy server can hold the request without answering
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j2 = (await res.json()) as { elements: { type: string; id: number }[]; remark?: string };
        if (j2.remark && /error|timed out/i.test(j2.remark)) throw new Error(j2.remark);
        for (const el of j2.elements) seen.set(el.type + el.id, el);
        fs.writeFileSync(tileFile(i, j), JSON.stringify(j2.elements));
        console.log(`tile ${i},${j}: ${j2.elements.length} elements (total ${seen.size}) from ${new URL(server).host}`);
        ok = true;
      } catch (err) {
        console.log(`tile ${i},${j} attempt ${attempt + 1} (${new URL(server).host}) failed: ${err instanceof Error ? err.message : err}`);
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      }
    }
    if (!ok) { console.error(`tile ${i},${j}: giving up`); process.exit(1); }
  }
fs.writeFileSync(out, JSON.stringify({ version: 0.6, elements: [...seen.values()] }));
for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) fs.rmSync(tileFile(i, j), { force: true });
console.log('wrote', out, seen.size, 'elements');
