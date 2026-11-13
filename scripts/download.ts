// Downloads OSM data for the city's BBOX from Overpass in tiles and merges them.
// Usage: node scripts/download.ts [city]   (default skopje; output: FILES.raw)
import fs from 'node:fs';
import { BBOX, CITIES, CITY, FILES } from './config.ts';

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
for (let i = 0; i < NX; i++)
  for (let j = 0; j < NY; j++) {
    const w = BBOX.w + ((BBOX.e - BBOX.w) * i) / NX, e = BBOX.w + ((BBOX.e - BBOX.w) * (i + 1)) / NX;
    const s = BBOX.s + ((BBOX.n - BBOX.s) * j) / NY, n = BBOX.s + ((BBOX.n - BBOX.s) * (j + 1)) / NY;
    const q = body.replace('[out:json]', `[out:json][bbox:${s},${w},${n},${e}]`);
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
console.log('wrote', out, seen.size, 'elements');
