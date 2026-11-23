// The whole country's 100 m terrain around a city map, for the F-15 only (docs/IDEAS.md): beyond the map's edges
// the mountains go on instead of the paper. The data is the country view's grid (`loadCountry`, downloaded once
// per visit). One grid mesh follows the plane, fine near it (about one 100 m cell) and coarse far out
// (~0.7 km at 45 km), rebuilt on the CPU when the plane has moved on: real geometry, so the ink's normal pass
// sees it. Inside the current map the grid sinks below the map's own terrain. Heights use the map's own
// exaggeration (`terrainExag`), so they meet the map's terrain at its edges.
import * as THREE from 'three';
import { coverPalette, COVER_WATER, type CountryData } from './country.ts';
import { PAL } from './city.ts';
import type { MapMeta } from './types.ts';

const R = 45000;   // reach from the plane, m
const SNAP = 600;  // the grid moves in steps this long (no swimming of the near vertices between steps)

export function createCountryGround(o: { data: CountryData; meta: MapMeta; exag: number; mobile: boolean }) {
  const { data, meta, exag } = o;
  const cm = data.meta, { nx, nz, cell } = cm;
  const hw = meta.w / 2, hh = meta.h / 2;
  // city scene metres → country grid cells: both are linear in lon / lat
  const ax = cm.kx / (meta.kx * cell), bx = ((meta.lon0 - cm.box.w) * cm.kx) / cell;
  const az = cm.ky / (meta.ky * cell), bz = ((cm.box.n - meta.lat0) * cm.ky) / cell;
  const H = data.height;
  const hAt = (i: number, j: number) => H[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  /** the country's ground at a scene point of this map, metres (× the map's exaggeration) */
  function height(x: number, z: number): number {
    const gx = ax * x + bx, gz = az * z + bz;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const h = (hAt(i, j) * (1 - fx) + hAt(i + 1, j) * fx) * (1 - fz) + (hAt(i, j + 1) * (1 - fx) + hAt(i + 1, j + 1) * fx) * fz;
    return h * exag;
  }
  function coverAt(x: number, z: number): number {
    const i = Math.round(ax * x + bx), j = Math.round(az * z + bz);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 0;
    return data.cover[j * nx + i];
  }
  function insideAt(x: number, z: number): number {
    const i = Math.round(ax * x + bx), j = Math.round(az * z + bz);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 0;
    return data.inside[j * nx + i];
  }

  const N = o.mobile ? 121 : 161;
  const off = new Float32Array(N);
  for (let k = 0; k < N; k++) { const t = (k / (N - 1)) * 2 - 1; off[k] = R * (0.22 * t + 0.78 * t * Math.abs(t)); }
  const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let q = 0;
  for (let j = 0; j < N - 1; j++)
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, d = a + N, e = d + 1;
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
    }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3), colAttr = new THREE.BufferAttribute(col, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage); colAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.receiveShadow = true;

  const COL = coverPalette(), paper = new THREE.Color(PAL.paper), snowy = new THREE.Color('#efe9e0'), tmp = new THREE.Color();
  let cx = NaN, cz = NaN;
  /** follow the plane: rebuilds the grid when it has moved a step on */
  function update(x: number, z: number): void {
    const sx = Math.round(x / SNAP) * SNAP, sz = Math.round(z / SNAP) * SNAP;
    if (sx === cx && sz === cz) return;
    cx = sx; cz = sz;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const v = j * N + i, X = cx + off[i], Z = cz + off[j];
        let y = height(X, Z);
        // inside the map: below its own terrain (deeper further in), so only the map's ground shows
        const inside = Math.min(hw - Math.abs(X), hh - Math.abs(Z));
        if (inside > 0) y -= 4 + Math.min(400, inside);
        pos[v * 3] = X; pos[v * 3 + 1] = y; pos[v * 3 + 2] = Z;
        const cv = coverAt(X, Z);
        tmp.copy(COL[cv] ?? COL[0]);
        if (cv !== COVER_WATER) tmp.lerp(snowy, THREE.MathUtils.smoothstep(y / exag, 1900, 2500) * 0.7); // bare high peaks
        if (!insideAt(X, Z)) tmp.lerp(paper, 0.45); // beyond the border: pale, as in the country view
        col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
      }
    posAttr.needsUpdate = colAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }

  return {
    mesh, height, update,
    /** show it (the F-15 flies) or not; shown again it is rebuilt where the plane is */
    setVisible(v: boolean): void { if (!v) cx = NaN; mesh.visible = v; },
    get visible(): boolean { return mesh.visible; },
  };
}

export type CountryGround = ReturnType<typeof createCountryGround>;
