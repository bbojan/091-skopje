// Regenerates docs/translations/strings.js, the data behind the translation review page
// (docs/translations/index.html): every UI string in Macedonian with its translations.
//   npm run strings
// Static HTML strings come from the data-i18n* attributes in index.html (the Macedonian
// is the element text / title / aria-label), the rest from STR.mk in src/i18n.ts.
import fs from 'node:fs';

type Row = { key: string; area: string; mk: string } & Partial<Record<Target, string | null>>;
type Target = 'en' | 'sr' | 'hr' | 'sl' | 'sq';
const TARGETS: Target[] = ['en', 'sr', 'hr', 'sl', 'sq'];

// i18n.ts reads location/localStorage when imported; give it harmless stand-ins
Object.assign(globalThis, { location: { search: '' }, localStorage: { getItem: () => null, setItem() {} } });
// a computed specifier keeps tsc from type-checking the browser module with Node's libs
const i18nUrl = new URL('../src/i18n.ts', import.meta.url).href;
const { STR } = (await import(i18nUrl)) as { STR: Record<'mk' | Target, Record<string, string>> };

const root = new URL('..', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const out = new URL('docs/translations/strings.js', root);

// which part of the page a string sits in, by position in index.html
const marks: [string, number][] = [
  ['help', html.indexOf('<dialog')], ['page', html.indexOf('</dialog>')], ['bar', html.indexOf('<div class="bar">')],
  ['flight', html.indexOf('<div id="flyhud"')], ['loading', html.indexOf('<div id="loader"')], ['page', html.indexOf('<div class="attr"')],
];
const areaOf = (pos: number) => { let a = 'page'; for (const [n, i] of marks) if (pos > i) a = n; return a; };

const rows: Row[] = [];
const seen = new Set<string>();
const re = /<(\w+)([^>]*?)\sdata-i18n(-title|-aria)?="([^"]+)"([^>]*)>/g;
for (let m = re.exec(html); m; m = re.exec(html)) {
  const [whole, tag, before, kind, key, after] = m;
  re.lastIndex = m.index + 1; // the same element may carry a second data-i18n-* attribute
  if (seen.has(key)) continue;
  let mk: string | undefined;
  if (!kind) mk = html.slice(m.index + whole.length, html.indexOf(`</${tag}>`, m.index + whole.length));
  else mk = (before + after).match(kind === '-title' ? /title="([^"]*)"/ : /aria-label="([^"]*)"/)?.[1];
  if (mk === undefined) throw new Error(`no Macedonian text for ${key}`);
  seen.add(key);
  rows.push({ key, area: areaOf(m.index), mk: mk.replace(/\s+/g, ' ').trim() });
}
for (const key of Object.keys(STR.mk)) if (!seen.has(key)) { seen.add(key); rows.push({ key, area: 'js', mk: STR.mk[key] }); }
for (const r of rows) for (const l of TARGETS) r[l] = STR[l][r.key] ?? null;

fs.writeFileSync(out, 'window.STRINGS = ' + JSON.stringify(rows) + ';\n');
const missing = rows.flatMap((r) => TARGETS.filter((l) => !r[l]).map((l) => `${r.key}:${l}`));
console.log(`${rows.length} strings → docs/translations/strings.js; missing: ${missing.join(', ') || 'none'}`);
