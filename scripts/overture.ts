// Downloads building outlines that OpenStreetMap lacks from Overture Maps (buildings theme, ODbL):
// mostly Microsoft's machine-learned footprints traced from aerial images. prepare.ts adds the
// ones that do not overlap an OSM building.
// Usage: node scripts/overture.ts [city]   (only cities with `files.overture`; output: that file)
//
// Overture's GeoParquet files are read in place with HTTP range requests: the STAC catalog says
// which file covers the box, the row groups' bbox statistics say which parts of it to fetch.
import fs from 'node:fs';
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { BBOX, CITY, FILES } from './config.ts';

const out = FILES.overture;
if (!out) {
  console.error(`${CITY} takes no Overture buildings (no \`files.overture\` in scripts/config.ts)`);
  process.exit(1);
}
const STAC = 'https://stac.overturemaps.org';

const getJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
};
type Box4 = [w: number, s: number, e: number, n: number];
const hits = (b: Box4) => b[0] < BBOX.e && b[2] > BBOX.w && b[1] < BBOX.n && b[3] > BBOX.s;

// RELEASE=2026-10-21.0 pins a release; default: the latest
const root = await getJson<{ latest: string }>(`${STAC}/catalog.json`);
const release = process.env.RELEASE || root.latest;
const coll = await getJson<{ extent: { spatial: { bbox: Box4[] } }; links: { rel: string; href: string }[] }>(
  `${STAC}/${release}/buildings/building/collection.json`,
);
// extent.spatial.bbox: the whole collection first, then one box per item, in the order of the item links
const items = coll.links.filter((l) => l.rel === 'item');
const boxes = coll.extent.spatial.bbox.slice(1);
const urls: string[][] = [];
for (let i = 0; i < items.length; i++) {
  if (!hits(boxes[i])) continue;
  const item = await getJson<{ assets: Record<string, { href: string }> }>(new URL(items[i].href, `${STAC}/${release}/buildings/building/`).href);
  // the same file on AWS and Azure (HTTPS): tried in that order
  urls.push(['aws', 'azure'].map((k) => item.assets[k]?.href).filter((h): h is string => !!h?.startsWith('https://')));
}
console.log(`release ${release}: ${urls.length} file(s) cover the box`);

interface Row {
  id: string;
  sources: { dataset: string }[] | null;
  height: number | null;
  num_floors: number | null;
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const buildings: { id: string; src: string; h?: number; fl?: number; r: number[][] }[] = [];
let osm = 0;
for (const mirrors of urls) {
  let file: Awaited<ReturnType<typeof asyncBufferFromUrl>> | null = null, url = '';
  for (const m of mirrors) {
    try { file = await asyncBufferFromUrl({ url: m }); url = m; break; } catch (err) { console.log(`${new URL(m).host}: ${err instanceof Error ? err.message : err}`); }
  }
  if (!file) { console.error('no mirror answers'); process.exit(1); }
  const metadata = await parquetMetadataAsync(file);
  const col = (g: (typeof metadata.row_groups)[number], name: string) =>
    g.columns.find((c) => c.meta_data?.path_in_schema.join('.') === name)?.meta_data?.statistics;
  let start = 0, groups = 0;
  for (const g of metadata.row_groups) {
    const n = Number(g.num_rows), end = start + n;
    const xmin = col(g, 'bbox.xmin'), xmax = col(g, 'bbox.xmax'), ymin = col(g, 'bbox.ymin'), ymax = col(g, 'bbox.ymax');
    const box: Box4 = [Number(xmin?.min_value ?? -180), Number(ymin?.min_value ?? -90), Number(xmax?.max_value ?? 180), Number(ymax?.max_value ?? 90)];
    if (hits(box)) {
      groups++;
      const rows = (await parquetReadObjects({
        file, metadata, compressors, rowStart: start, rowEnd: end,
        columns: ['id', 'sources', 'height', 'num_floors', 'bbox', 'geometry'],
      })) as unknown as Row[];
      for (const row of rows) {
        const b = row.bbox;
        if (!(b.xmin < BBOX.e && b.xmax > BBOX.w && b.ymin < BBOX.n && b.ymax > BBOX.s)) continue;
        const src = row.sources?.[0]?.dataset ?? '';
        // OSM's own buildings come from our Overpass download (newer than Overture's copy)
        if (src === 'OpenStreetMap') { osm++; continue; }
        const polys = (row.geometry.type === 'Polygon' ? [row.geometry.coordinates] : row.geometry.coordinates) as number[][][][];
        for (const poly of polys) {
          const b2: (typeof buildings)[number] = { id: row.id, src, r: poly.map((ring) => ring.flatMap(([lon, lat]) => [r6(lon), r6(lat)])) };
          if (row.height != null) b2.h = row.height;
          if (row.num_floors != null) b2.fl = row.num_floors;
          buildings.push(b2);
        }
      }
    }
    start = end;
  }
  console.log(`${url.split('/').pop()}: ${groups} of ${metadata.row_groups.length} row groups read`);
}
// a stable order (the same release gives the same file)
buildings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
fs.writeFileSync(out, JSON.stringify({ release, attribution: '© Overture Maps Foundation, Microsoft (ODbL)', buildings }));
const bySrc: Record<string, number> = {};
for (const b of buildings) bySrc[b.src] = (bySrc[b.src] ?? 0) + 1;
console.log('wrote', out, buildings.length, 'outlines', bySrc, `(${osm} OSM outlines skipped)`);
