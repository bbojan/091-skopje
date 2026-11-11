// Downloads OSM data for BBOX from Overpass in tiles and merges them.
// Usage: node scripts/download.mjs data/skopje_raw.json
import fs from 'node:fs';
import { BBOX } from './config.ts';

const out = process.argv[2] || 'data/skopje_raw.json';
const body = fs.readFileSync('data/query.overpassql', 'utf8').replace(/\[bbox:[^\]]*\]/, '');
const NX = 3, NY = 2;
const seen = new Map();
for (let i = 0; i < NX; i++)
  for (let j = 0; j < NY; j++) {
    const w = BBOX.w + ((BBOX.e - BBOX.w) * i) / NX, e = BBOX.w + ((BBOX.e - BBOX.w) * (i + 1)) / NX;
    const s = BBOX.s + ((BBOX.n - BBOX.s) * j) / NY, n = BBOX.s + ((BBOX.n - BBOX.s) * (j + 1)) / NY;
    const q = body.replace('[out:json]', `[out:json][bbox:${s},${w},${n},${e}]`);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'User-Agent': 'room3D-skopje-map/0.1', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j2 = (await res.json()) as { elements: { type: string; id: number }[] };
        for (const el of j2.elements) seen.set(el.type + el.id, el);
        console.log(`tile ${i},${j}: ${j2.elements.length} elements (total ${seen.size})`);
        break;
      } catch (err) {
        console.log(`tile ${i},${j} attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : err}`);
        await new Promise((r) => setTimeout(r, 15000 * (attempt + 1)));
      }
    }
  }
fs.writeFileSync(out, JSON.stringify({ version: 0.6, elements: [...seen.values()] }));
console.log('wrote', out, seen.size, 'elements');
