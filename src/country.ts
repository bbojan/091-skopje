// The country view: all of Macedonia at 100 m (public/country.png, scripts/country.ts) with the towns plan's zones
// drawn on it (src/zones.ts). A finished map opens with a click; a planned one shows its name and "наскоро".
// Its own scene, camera and controls, drawn through the same ink renderer as the cities (main.ts swaps it in).
// The data is downloaded once, the first time the view opens, and stays in memory for the rest of the visit,
// across city switches (`loadCountry` caches it); the F-15 reuses it (src/countryground.ts).
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { PAL } from './city.ts';
import { ZONES, type Zone } from './zones.ts';
import type { CityId } from './cities.ts';

export interface CountryMeta {
  nx: number; nz: number; cell: number;
  box: { s: number; w: number; n: number; e: number };
  lat0: number; lon0: number; kx: number; ky: number;
  /** heights in the PNG are whole metres above this */
  min: number; max: number;
}
/** The country grid in memory: heights in metres, land cover class and inside-the-border per 100 m cell. */
export interface CountryData {
  meta: CountryMeta;
  height: Float32Array;
  cover: Uint8Array;
  inside: Uint8Array;
}

/** land cover classes, as written by scripts/country.ts */
const COVER = { none: 0, meadow: 1, field: 2, forest: 3, water: 4, town: 5, rock: 6, vine: 7 } as const;

/** the land cover classes' colours, in the cities' palette (index: class); shared with the F-15's ground */
export function coverPalette(): THREE.Color[] {
  const c = (s: string) => new THREE.Color(s);
  const COL: THREE.Color[] = [];
  COL[COVER.none] = c(PAL.hill); COL[COVER.meadow] = c(PAL.area.scrub); COL[COVER.field] = c('#dccf8e');
  COL[COVER.forest] = c(PAL.forest[1]); COL[COVER.water] = c(PAL.area.water); COL[COVER.town] = c('#e9c9b0');
  COL[COVER.rock] = c('#d9cdb8'); COL[COVER.vine] = c('#b9c16a');
  return COL;
}
export const COVER_WATER = COVER.water;

let cached: Promise<CountryData> | null = null;
/** Downloads and decodes the country grid once per visit; later calls get the same data. */
export function loadCountry(onProgress: (f: number) => void): Promise<CountryData> {
  cached ??= (async () => {
    const meta = await fetch('./country.json').then((r) => { if (!r.ok) throw new Error(`country.json: HTTP ${r.status}`); return r.json() as Promise<CountryMeta>; });
    const res = await fetch('./country.png');
    if (!res.ok || !res.body) throw new Error(`country.png: HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 4.4e6;
    const reader = res.body.getReader();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onProgress(Math.min(got / total, 1) * 0.9);
    }
    // the PNG's bytes exactly as written: no colour conversion (it holds numbers, not colours)
    const bmp = await createImageBitmap(new Blob(parts, { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    const n = meta.nx * meta.nz;
    const height = new Float32Array(n), cover = new Uint8Array(n), inside = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      height[k] = meta.min + px[k * 4] * 256 + px[k * 4 + 1];
      const b = px[k * 4 + 2];
      cover[k] = b & 127; inside[k] = b >> 7;
    }
    cv.width = cv.height = 0;
    onProgress(1);
    return { meta, height, cover, inside };
  })();
  cached.catch(() => { cached = null; }); // a failed download can be tried again
  return cached;
}

/** scene units per metre (the whole country is ~11 km of scene, about the size of a city map) */
const S = 1 / 20;
/** relief exaggeration: at this scale true heights look flat */
const EXAG = 2.6;

export interface CountryView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  /** true when something moved and the frame must be drawn again */
  dirty: boolean;
  /** the zone under a screen point (client px), if any */
  zoneAt(cx: number, cy: number): Zone | null;
  /** the zone to highlight (hover) */
  setHover(z: Zone | null): void;
  /** places the HTML labels; call every frame while open */
  update(): void;
  resize(): void;
  /** back to the starting view */
  home(): void;
}

export function createCountryView(o: {
  data: CountryData;
  dom: HTMLElement;
  labels: HTMLElement;
  mobile: boolean;
  codeOf: (id: CityId) => string;
  onPick: (z: Zone) => void;
}): CountryView {
  const { meta, height, cover, inside } = o.data;
  const { nx, nz, cell } = meta;
  const UW = (nx - 1) * cell * S, UH = (nz - 1) * cell * S; // scene size
  const X0 = -UW / 2, Z0 = -UH / 2;
  const toScene = (lat: number, lon: number): [number, number] => [X0 + (lon - meta.box.w) * meta.kx * S, Z0 + (meta.box.n - lat) * meta.ky * S];
  const hAt = (i: number, j: number) => height[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  /** terrain height in scene units at a scene point, bilinear */
  const groundY = (x: number, z: number): number => {
    const gx = THREE.MathUtils.clamp((x - X0) / (cell * S), 0, nx - 1.001), gz = THREE.MathUtils.clamp((z - Z0) / (cell * S), 0, nz - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const h = (hAt(i, j) * (1 - fx) + hAt(i + 1, j) * fx) * (1 - fz) + (hAt(i, j + 1) * (1 - fx) + hAt(i + 1, j + 1) * fx) * fz;
    return (h - meta.min) * S * EXAG;
  };

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight('#dcdcf4', '#f3e2c8', 2.25);
  const sun = new THREE.DirectionalLight('#fff2df', 2.2);
  sun.position.set(-0.7, 0.9, 0.32).normalize().multiplyScalar(UW);
  sun.castShadow = true;
  const sr = o.mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(sr, sr);
  Object.assign(sun.shadow.camera, { left: -UW * 0.6, right: UW * 0.6, top: UW * 0.6, bottom: -UW * 0.6, near: 1, far: UW * 3 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 1.5;
  scene.add(hemi, sun, sun.target);

  // ---------------- the relief: one grid mesh, every `st`-th cell; colours from the land cover (in the cities'
  // palette), paler outside the border; the zones and the border are a canvas texture on top
  const st = o.mobile ? 4 : 3;
  const gw = Math.floor((nx - 1) / st) + 1, gh = Math.floor((nz - 1) / st) + 1;
  const pos = new Float32Array(gw * gh * 3), col = new Float32Array(gw * gh * 3);
  const c = (s: string) => new THREE.Color(s);
  const COL = coverPalette();
  const paper = c(PAL.paper), snowy = c('#efe9e0'), tmp = new THREE.Color();
  for (let gj = 0; gj < gh; gj++)
    for (let gi = 0; gi < gw; gi++) {
      const i = Math.min(gi * st, nx - 1), j = Math.min(gj * st, nz - 1), v = gj * gw + gi;
      pos[v * 3] = X0 + i * cell * S; pos[v * 3 + 1] = (hAt(i, j) - meta.min) * S * EXAG; pos[v * 3 + 2] = Z0 + j * cell * S;
      // the block's colour: the average over its cells (forests and lakes keep their shape at any step)
      let r = 0, g = 0, b = 0, n = 0, ins = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di * (st >> 1), jj = j + dj * (st >> 1);
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const k = jj * nx + ii, cl = COL[cover[k]] ?? COL[0];
          r += cl.r; g += cl.g; b += cl.b; n++; ins += inside[k];
        }
      tmp.setRGB(r / n, g / n, b / n);
      const hm = hAt(i, j);
      if (cover[j * nx + i] !== COVER.water) tmp.lerp(snowy, THREE.MathUtils.smoothstep(hm, 1900, 2500) * 0.7); // bare high peaks
      tmp.lerp(paper, 0.62 * (1 - ins / n)); // the neighbours: pale
      col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
    }
  const idx = new Uint32Array((gw - 1) * (gh - 1) * 6);
  let q = 0;
  for (let gj = 0; gj < gh - 1; gj++)
    for (let gi = 0; gi < gw - 1; gi++) {
      const a = gj * gw + gi, b = a + 1, d = a + gw, e = d + 1;
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  // overlay: zone fills and outlines, the border (2D canvas, mapped over the whole box)
  const OW = o.mobile ? 2048 : 3072, OH = Math.round((OW * (nz - 1)) / (nx - 1));
  const ov = document.createElement('canvas');
  ov.width = OW; ov.height = OH;
  const g2 = ov.getContext('2d')!;
  const toOv = (lon: number, lat: number): [number, number] => { const [x, z] = toScene(lat, lon); return [((x - X0) / UW) * OW, ((z - Z0) / UH) * OH]; };
  const lw = OW / 2048;
  const ringPath = (ring: [number, number][]) => { g2.beginPath(); ring.forEach(([lo, la], k) => { const [x, y] = toOv(lo, la); if (k) g2.lineTo(x, y); else g2.moveTo(x, y); }); g2.closePath(); };
  const INDIGO = '#1f2a44', WINE = '#7a1f1a';
  for (const z of ZONES) {
    ringPath(z.ring);
    if (z.city) { g2.fillStyle = 'rgba(31, 42, 68, 0.16)'; g2.fill(); g2.setLineDash([]); g2.strokeStyle = INDIGO; g2.lineWidth = 3 * lw; }
    else { g2.setLineDash([9 * lw, 6 * lw]); g2.strokeStyle = 'rgba(31, 42, 68, 0.5)'; g2.lineWidth = 1.6 * lw; }
    g2.stroke();
  }
  // the border, traced from the land cover grid's inside mask (the same line the colours change at)
  g2.setLineDash([]);
  g2.strokeStyle = WINE; g2.lineWidth = 2.4 * lw; g2.lineCap = 'round';
  g2.beginPath();
  const sx = OW / (nx - 1), sy = OH / (nz - 1);
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = inside[j * nx + i];
      if (a !== inside[j * nx + i + 1]) { g2.moveTo((i + 0.5) * sx, (j - 0.5) * sy); g2.lineTo((i + 0.5) * sx, (j + 0.5) * sy); }
      if (a !== inside[(j + 1) * nx + i]) { g2.moveTo((i - 0.5) * sx, (j + 0.5) * sy); g2.lineTo((i + 0.5) * sx, (j + 0.5) * sy); }
    }
  g2.stroke();
  const overlay = new THREE.CanvasTexture(ov);
  overlay.colorSpace = THREE.SRGBColorSpace;
  overlay.flipY = false; // canvas row 0 is the north edge, as v = 0 in the shader (and in the zone ids)
  overlay.anisotropy = 8;

  // zone ids per texel (exact, by point-in-polygon), for the hover highlight and for picking
  const ZW = 1024, ZH = Math.round((ZW * (nz - 1)) / (nx - 1));
  const zoneId = new Uint8Array(ZW * ZH);
  ZONES.forEach((z, zi) => {
    const pts = z.ring.map(([lo, la]) => { const [x, y] = toOv(lo, la); return [(x / OW) * ZW, (y / OH) * ZH]; });
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(ZH - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5, xs: number[] = [];
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [ax, ay] = pts[b], [bx, by] = pts[a];
        if ((ay > yc) !== (by > yc)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((p, r) => p - r);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(ZW - 1, Math.floor(xs[k + 1] - 0.5)); x++) zoneId[y * ZW + x] = zi + 1;
    }
  });
  const zoneTex = new THREE.DataTexture(zoneId, ZW, ZH, THREE.RedFormat, THREE.UnsignedByteType);
  zoneTex.minFilter = zoneTex.magFilter = THREE.NearestFilter;
  zoneTex.needsUpdate = true;

  const uHover = { value: 0 }, uHoverDone = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tOverlay: { value: overlay }, tZone: { value: zoneTex }, uHover, uHoverDone, uBox: { value: new THREE.Vector4(X0, Z0, UW, UH) } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uBox;\nvarying vec2 vCUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCUv = (position.xz - uBox.xy) / uBox.zw;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tOverlay, tZone;\nuniform float uHover, uHoverDone;\nvarying vec2 vCUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float zid = floor(texture2D(tZone, vCUv).r * 255.0 + 0.5);
        if (uHover > 0.0 && abs(zid - uHover) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uHoverDone > 0.5 ? vec3(1.0, 0.93, 0.75) : vec3(1.0), uHoverDone > 0.5 ? 0.45 : 0.3);
        vec4 ovc = texture2D(tOverlay, vCUv);
        diffuseColor.rgb = mix(diffuseColor.rgb, ovc.rgb / max(ovc.a, 1e-4), ovc.a);`);
  };
  const ground = new THREE.Mesh(geo, mat);
  ground.castShadow = ground.receiveShadow = true;
  scene.add(ground);

  // the sides of the block, down to a base below the lowest point (a diorama, like the cities' skirt)
  {
    const base = -40, sp: number[] = [], sc: number[] = [], side = c(PAL.slabSide), dark = c(PAL.slabDark);
    const edge = (pts: [number, number][], shade: THREE.Color) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1], ay = groundY(ax, az), by = groundY(bx, bz);
        sp.push(ax, ay, az, ax, base, az, bx, by, bz, bx, by, bz, ax, base, az, bx, base, bz);
        for (let m = 0; m < 6; m++) sc.push(shade.r, shade.g, shade.b);
      }
    };
    const line = (fx: (t: number) => [number, number], n: number) => Array.from({ length: n + 1 }, (_, k) => fx(k / n));
    edge(line((t) => [X0 + t * UW, Z0 + UH], gw), side); // south (faces the camera)
    edge(line((t) => [X0 + UW, Z0 + UH - t * UH], gh), dark); // east
    edge(line((t) => [X0 + UW - t * UW, Z0], gw), dark); // north
    edge(line((t) => [X0, Z0 + t * UH], gh), side); // west
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sg.computeVertexNormals();
    scene.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  // ---------------- camera and controls
  const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 20, UW * 8);
  const controls = new MapControls(camera, o.dom);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = false;
  controls.minDistance = 900;
  controls.maxDistance = UW * 2.6;
  controls.maxPolarAngle = 1.05;
  const view = {
    dirty: true,
    zoneAt, setHover, update, resize, home,
  };
  controls.addEventListener('change', () => (view.dirty = true));
  function home(): void {
    controls.target.set(0, 60, UH * 0.02);
    // the whole box in view: its width, or its (tilted) depth on a tall screen
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // a tall screen looks down more steeply (the tilted near edge would spread wider than the screen) and keeps a margin
    const tall = camera.aspect < 1;
    const d = Math.max(UW / camera.aspect, UH * 0.85) / (2 * tan) * (tall ? 1.16 : 1.04);
    controls.maxDistance = Math.max(UW * 2.6, d * 1.25); // a phone held upright needs to stand further back
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(d, tall ? 0.3 : 0.55, 0)));
    controls.update();
    view.dirty = true;
  }
  function resize(): void { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); view.dirty = true; }

  // ---------------- picking: the ray marched over the height grid (no triangle raycast over a million triangles)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), p = new THREE.Vector3();
  function zoneAt(cx: number, cy: number): Zone | null {
    const r = o.dom.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const { origin, direction } = ray.ray;
    const top = (meta.max - meta.min) * S * EXAG;
    if (direction.y >= 0) return null;
    let t = Math.max(0, (top - origin.y) / direction.y);
    const tEnd = (0 - origin.y) / direction.y + 1, dt = cell * S * 0.7;
    let prev = t;
    for (; t <= tEnd; t += dt) {
      p.copy(direction).multiplyScalar(t).add(origin);
      if (p.y <= groundY(p.x, p.z)) {
        let a = prev, b = t; // refine
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; p.copy(direction).multiplyScalar(m).add(origin); if (p.y <= groundY(p.x, p.z)) b = m; else a = m; }
        break;
      }
      prev = t;
    }
    if (t > tEnd) return null;
    const u = (p.x - X0) / UW, v = (p.z - Z0) / UH;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
    const id = zoneId[Math.floor(v * ZH) * ZW + Math.floor(u * ZW)];
    return id ? ZONES[id - 1] : null;
  }
  function setHover(z: Zone | null): void {
    const id = z ? ZONES.indexOf(z) + 1 : 0;
    if (uHover.value === id) return;
    uHover.value = id; uHoverDone.value = z?.city ? 1 : 0;
    o.dom.style.cursor = z?.city ? 'pointer' : '';
    for (const l of labels) l.el.classList.toggle('hover', l.z === z);
    view.dirty = true;
  }

  // ---------------- labels: finished maps as their badge (code + name), planned ones pale and small
  const labels = ZONES.map((z) => {
    const el = document.createElement(z.city ? 'button' : 'span');
    el.className = `cz ${z.city ? 'done' : 'soon'}`;
    if (z.city) {
      (el as HTMLButtonElement).type = 'button';
      el.innerHTML = `<span class="code">${o.codeOf(z.city)}</span><span></span>`;
      el.lastElementChild!.textContent = z.name;
      el.addEventListener('click', () => o.onPick(z));
    } else el.textContent = z.name;
    el.addEventListener('pointerenter', () => setHover(z));
    el.addEventListener('pointerleave', () => setHover(null));
    o.labels.append(el);
    const [x, zz] = toScene(...z.at);
    return { z, el, at: new THREE.Vector3(x, groundY(x, zz) + 30, zz), x: 0, y: 0, w: 0, h: 0 };
  });
  const sp = new THREE.Vector3();
  function update(): void {
    if (controls.enabled) controls.update();
    // keep the target over the country
    const tg = controls.target;
    const cx = THREE.MathUtils.clamp(tg.x, X0, X0 + UW), cz = THREE.MathUtils.clamp(tg.z, Z0, Z0 + UH);
    if (cx !== tg.x || cz !== tg.z) { camera.position.x += cx - tg.x; camera.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }
    const d = camera.position.distanceTo(tg);
    camera.near = THREE.MathUtils.clamp(d / 60, 5, 200);
    camera.far = d * 4 + UW * 2;
    camera.updateProjectionMatrix();
    const W = innerWidth, H = innerHeight;
    const showSoon = d < UW * 1.35; // the planned names only when zoomed in a little
    // a narrow screen seen from far: the finished maps by name only, small (the full badges would cover the map)
    const compact = W < 560 && d > UW * 2;
    if (o.labels.classList.contains('compact') !== compact) { o.labels.classList.toggle('compact', compact); for (const l of labels) l.w = 0; }
    for (const l of labels) {
      sp.copy(l.at).project(camera);
      const vis = sp.z < 1 && Math.abs(sp.x) < 1.05 && Math.abs(sp.y) < 1.05 && (l.z.city !== undefined || showSoon);
      l.el.hidden = !vis;
      l.x = ((sp.x + 1) / 2) * W; l.y = ((1 - sp.y) / 2) * H;
      if (vis && !l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; } // measured once, the first time it shows
    }
    // badges that would cover each other (Скопје, Матка, Батинци side by side): each one goes below the one it
    // overlaps, top to bottom; a planned name under a badge is left out
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const hits = (a: { x: number; y: number; w: number; h: number }) => placed.find((b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 3 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2);
    for (const l of labels.filter((l) => l.z.city && !l.el.hidden).sort((a, b) => a.y - b.y)) {
      for (let k = 0, b = hits(l); b && k < 6; k++, b = hits(l)) l.y = b.y + (b.h + l.h) / 2 + 2;
      placed.push(l);
    }
    for (const l of labels) {
      if (l.el.hidden) continue;
      if (!l.z.city && hits(l)) { l.el.hidden = true; continue; }
      l.el.style.transform = `translate(${l.x}px, ${l.y}px) translate(-50%, -50%)`;
    }
  }
  return Object.assign(view, { scene, camera, controls });
}
