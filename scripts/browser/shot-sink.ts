// Tiny local receiver for screenshots taken inside the page, for when the browser pane is
// hidden and normal screenshots come back blank (see "How to verify" in docs/NOTES.md).
//   node scripts/browser/shot-sink.ts <folder>          (listens on 127.0.0.1:5199)
// From the page: render a frame, then
//   fetch('http://127.0.0.1:5199/walk-pejo', { method: 'POST', body: __dbg.renderer.domElement.toDataURL('image/jpeg', 0.85) })
// writes <folder>/walk-pejo.jpg. Point it at a scratch folder, not the repo.
import http from 'node:http';
import fs from 'node:fs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/browser/shot-sink.ts <folder>'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.end(); return; }
  let body = '';
  req.on('data', (c: Buffer) => (body += c));
  req.on('end', () => {
    const name = (req.url ?? '/shot').slice(1).replace(/[^\w-]/g, '') || 'shot';
    const m = body.match(/^data:image\/(\w+);base64,(.*)$/s);
    if (m) fs.writeFileSync(`${dir}/${name}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64'));
    res.end(m ? 'ok' : 'expected a data:image URL');
  });
}).listen(5199, '127.0.0.1', () => console.log(`shot sink on 127.0.0.1:5199 → ${dir}`));
