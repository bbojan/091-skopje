// The F-15's radar: a round map of Macedonia around the plane, 4× closer than the country view (~54 km across),
// turning with the plane (its heading up). Built from the country view's grid (land cover, relief) and the towns
// plan's zones: the finished maps in their colours, everything the F-15 cannot fly into yet darker and greyed
// (planned maps, beyond the border), the map being downloaded or built pulsing, the ones ready in green, the
// current one outlined. A map downloading ahead (before the plane gets there) is sky blue: a light tint and a thick
// line tracing its edge as far as the download has come (a bright dot at its tip), its name with ↓ and the %; one
// queued after the running download a faint tint, a firmer dashed blue edge and ⋯; one ahead but still too far to
// start only a thin dashed blue edge; entering a map (being built) pulses orange
// with its %; ready ones say ✓. A 2D canvas in the flight HUD, drawn every frame while the F-15 flies.
import { coverPalette, type CountryData } from './country.ts';
import { ZONES } from './zones.ts';
import type { CityId } from './cities.ts';

/** what the radar shows about a finished map */
export type MapState = 'current' | 'ready' | 'loading' | 'downloading' | 'queued' | 'waiting' | 'open';

const SPAN = 54000;   // metres across the radar
const BASE = 0.5;     // the prerendered country image at half the grid's resolution (200 m per pixel)
const INDIGO = '#1f2a44', ORANGE = '255, 122, 24', YELLOW = '255, 214, 64', GREEN = '64, 190, 90', BLUE = '70, 170, 255';

export function createRadar(o: { data: CountryData; canvas: HTMLCanvasElement }) {
  const { meta, height, cover, inside } = o.data;
  const { nx, nz, cell } = meta;
  const W = Math.round(nx * BASE), H = Math.round(nz * BASE);

  // grid pixel (at BASE) of a lat / lon
  const gx = (lon: number) => ((lon - meta.box.w) * meta.kx / cell) * BASE;
  const gy = (lat: number) => ((meta.box.n - lat) * meta.ky / cell) * BASE;

  // ---- the country once: land cover colours with a hill shade, then everything not yet flyable darkened
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const g = base.getContext('2d')!;
  const img = g.createImageData(W, H);
  const COL = coverPalette().map((c) => [c.r * 255, c.g * 255, c.b * 255]);
  const hAt = (i: number, j: number) => height[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = Math.min(nx - 1, Math.round(x / BASE)), j = Math.min(nz - 1, Math.round(y / BASE)), k = j * nx + i;
      const c = COL[cover[k]] ?? COL[0];
      // light from the north-west, as on the maps
      const sh = Math.max(-0.35, Math.min(0.35, ((hAt(i - 2, j - 2) - hAt(i + 2, j + 2)) / (4 * cell)) * 2.2));
      const out = inside[k] ? 1 : 0.82;
      const o4 = (y * W + x) * 4;
      img.data[o4] = Math.min(255, c[0] * (1 + sh) * out);
      img.data[o4 + 1] = Math.min(255, c[1] * (1 + sh) * out);
      img.data[o4 + 2] = Math.min(255, c[2] * (1 + sh) * out);
      img.data[o4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const path = (ring: [number, number][], ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ring.forEach(([lo, la], k) => (k ? ctx.lineTo(gx(lo), gy(la)) : ctx.moveTo(gx(lo), gy(la))));
    ctx.closePath();
  };
  // not flyable yet: a grey veil over everything but the finished maps
  const veil = document.createElement('canvas');
  veil.width = W; veil.height = H;
  const v = veil.getContext('2d')!;
  v.fillStyle = 'rgba(70, 72, 80, 0.78)';
  v.fillRect(0, 0, W, H);
  v.globalCompositeOperation = 'destination-out';
  for (const z of ZONES) if (z.city) { path(z.ring, v); v.fill(); }
  g.drawImage(veil, 0, 0);
  // the planned maps' outlines, faint and dashed
  g.setLineDash([4, 3]);
  g.strokeStyle = 'rgba(244, 237, 224, 0.35)';
  g.lineWidth = 1;
  for (const z of ZONES) if (!z.city) { path(z.ring, g); g.stroke(); }
  g.setLineDash([]);
  veil.width = veil.height = 0;

  const finished = ZONES.filter((z) => z.city);
  // each outline's length (base pixels), for the download's progress traced along it
  const perimeter = finished.map((z) => {
    let L = 0;
    for (let i = 0; i < z.ring.length; i++) {
      const [ax, ay] = z.ring[i], [bx, by] = z.ring[(i + 1) % z.ring.length];
      L += Math.hypot(gx(bx) - gx(ax), gy(by) - gy(ay));
    }
    return L;
  });
  const ctx = o.canvas.getContext('2d')!;
  let size = 0;

  /** draws the radar around the plane (lat / lon, heading as in flight.ts: 0 north, clockwise) */
  function draw(lat: number, lon: number, yaw: number, stateOf: (id: CityId) => MapState, progressOf: (id: CityId) => number, time: number): void {
    const css = o.canvas.clientWidth || 180, dpr = Math.min(2, devicePixelRatio || 1), px = Math.round(css * dpr);
    if (px !== size) { size = px; o.canvas.width = o.canvas.height = px; }
    const R = px / 2, k = px / ((SPAN / cell) * BASE); // radar pixels per base pixel
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#3a3e48'; // beyond the country's box
    ctx.fillRect(0, 0, px, px);
    // the map turns so the plane's heading points up
    ctx.translate(R, R);
    ctx.rotate(-yaw);
    ctx.scale(k, k);
    ctx.translate(-gx(lon), -gy(lat));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, 0, 0);
    // the finished maps: loading glows orange and pulses with a running dashed edge, ready is green, the
    // current one has a thick indigo edge, the rest a thin one
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    const states = finished.map((z) => stateOf(z.city!));
    finished.forEach((z, i) => {
      const s = states[i];
      path(z.ring, ctx);
      if (s === 'loading') {
        ctx.fillStyle = `rgba(${ORANGE}, ${0.3 + 0.4 * pulse})`; ctx.fill();
        ctx.setLineDash([7 / k, 5 / k]); ctx.lineDashOffset = (-time * 30) / k;
        ctx.strokeStyle = `rgb(${YELLOW})`; ctx.lineWidth = 3.5 / k; ctx.stroke();
        ctx.setLineDash([]);
      } else if (s === 'downloading') {
        // its own colour (sky blue, not the orange of entering): a light tint, the edge, and a thick line running
        // round it as far as the download has come, a bright dot at its tip
        ctx.fillStyle = `rgba(${BLUE}, ${0.16 + 0.06 * pulse})`; ctx.fill();
        ctx.setLineDash([4 / k, 4 / k]);
        ctx.strokeStyle = `rgba(${BLUE}, 0.55)`; ctx.lineWidth = 2 / k; ctx.stroke();
        const L = perimeter[i], p = Math.max(0.03, progressOf(z.city!));
        ctx.setLineDash([L * p, L]); ctx.lineDashOffset = 0;
        ctx.strokeStyle = `rgb(${BLUE})`; ctx.lineWidth = 4.5 / k; ctx.stroke();
        ctx.setLineDash([]);
        // the tip: walk the outline to the progress point
        let left = L * p;
        for (let e = 0; e < z.ring.length; e++) {
          const [ax, ay] = z.ring[e], [bx, by] = z.ring[(e + 1) % z.ring.length];
          const x0 = gx(ax), y0 = gy(ay), x1 = gx(bx), y1 = gy(by), seg = Math.hypot(x1 - x0, y1 - y0);
          if (left <= seg) {
            const f = seg ? left / seg : 0;
            ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, (4 + 1.5 * pulse) / k, 0, Math.PI * 2);
            ctx.fillStyle = '#eaf6ff'; ctx.fill(); ctx.strokeStyle = `rgb(${BLUE})`; ctx.lineWidth = 2 / k; ctx.stroke();
            break;
          }
          left -= seg;
        }
      } else if (s === 'queued') {
        // next in line after the download running now: a faint tint and a firmer dashed blue edge
        ctx.fillStyle = `rgba(${BLUE}, 0.08)`; ctx.fill();
        ctx.setLineDash([6 / k, 4 / k]);
        ctx.strokeStyle = `rgb(${BLUE})`; ctx.lineWidth = 2.8 / k; ctx.stroke();
        ctx.setLineDash([]);
      } else if (s === 'waiting') {
        // ahead, its download not started yet (too far, or after another one): only a thin dashed blue edge
        ctx.setLineDash([3 / k, 4 / k]);
        ctx.strokeStyle = `rgba(${BLUE}, 0.85)`; ctx.lineWidth = 2 / k; ctx.stroke();
        ctx.setLineDash([]);
      } else if (s === 'ready') { ctx.fillStyle = `rgba(${GREEN}, 0.38)`; ctx.fill(); ctx.strokeStyle = `rgb(${GREEN})`; ctx.lineWidth = 3 / k; ctx.stroke(); }
      else if (s === 'current') { ctx.strokeStyle = INDIGO; ctx.lineWidth = 4 / k; ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(31, 42, 68, 0.6)'; ctx.lineWidth = 1.4 / k; ctx.stroke(); }
    });
    // their names, upright; loading shows how far, ready a tick
    ctx.font = `700 ${11 * dpr / k}px Lora, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    finished.forEach((z, i) => {
      const s = states[i], x = gx(z.at[1]), y = gy(z.at[0]);
      const text = s === 'loading' ? `${z.name} ${Math.round(progressOf(z.city!) * 100)}%` : s === 'downloading' ? `${z.name} ↓${Math.round(progressOf(z.city!) * 100)}%` : s === 'queued' ? `${z.name} ⋯` : s === 'ready' ? `${z.name} ✓` : z.name;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(yaw);
      ctx.lineWidth = 3.5 * dpr / k;
      ctx.strokeStyle = s === 'loading' ? 'rgba(60, 26, 0, 0.9)' : s === 'downloading' ? 'rgba(10, 30, 60, 0.9)' : 'rgba(244, 237, 224, 0.9)';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = s === 'loading' ? `rgb(${YELLOW})` : s === 'ready' ? '#1d5a2a' : s === 'downloading' ? '#8fd0ff' : s === 'waiting' || s === 'queued' ? '#2f5f8f' : INDIGO;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    });
    ctx.restore();
    // range ring, the plane, north on the rim
    ctx.strokeStyle = 'rgba(31, 42, 68, 0.35)';
    ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.arc(R, R, R / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.translate(R, R);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#d8322a';
    ctx.strokeStyle = '#fff8ec';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(2, -4); ctx.lineTo(9, 2); ctx.lineTo(9, 4); ctx.lineTo(2, 2); ctx.lineTo(2, 6); ctx.lineTo(5, 9);
    ctx.lineTo(5, 10); ctx.lineTo(0, 9); ctx.lineTo(-5, 10); ctx.lineTo(-5, 9); ctx.lineTo(-2, 6); ctx.lineTo(-2, 2); ctx.lineTo(-9, 4); ctx.lineTo(-9, 2); ctx.lineTo(-2, -4);
    ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
    const nA = -yaw - Math.PI / 2, nr = R - 11 * dpr;
    ctx.font = `700 ${12 * dpr}px Lora, Georgia, serif`;
    ctx.fillStyle = '#7a1f1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', R + Math.cos(nA) * nr, R + Math.sin(nA) * nr);
  }

  return { draw };
}

export type Radar = ReturnType<typeof createRadar>;
