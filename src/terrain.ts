import * as THREE from 'three';
import type { Pt, TerrainMeta } from './types.ts';

/** Fills `out` with the vertex colour for a terrain vertex. */
export type TerrainColorFn = (out: THREE.Color, y: number, normalY: number, i: number, j: number) => void;

// Heightfield with exact mesh-matching interpolation and draping helpers.
// Grid cells are split along the (i+1,j)-(i,j+1) diagonal, matching the mesh.
export class Terrain {
  nx: number;
  nz: number;
  cell: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  min: number;
  max: number;
  h: Float32Array;

  constructor(meta: TerrainMeta, u16: Uint16Array, exag = 1.12) {
    ({ nx: this.nx, nz: this.nz, cell: this.cell, x0: this.x0, z0: this.z0, min: this.min, max: this.max } = meta);
    this.h = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) this.h[i] = (u16[i] / 10) * exag;
    this.x1 = this.x0 + (this.nx - 1) * this.cell;
    this.z1 = this.z0 + (this.nz - 1) * this.cell;
  }
  H(i: number, j: number): number {
    i = i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
    j = j < 0 ? 0 : j >= this.nz ? this.nz - 1 : j;
    return this.h[j * this.nx + i];
  }
  at(x: number, z: number): number {
    const gx = (x - this.x0) / this.cell, gz = (z - this.z0) / this.cell;
    let i = Math.floor(gx), j = Math.floor(gz);
    i = Math.min(Math.max(i, 0), this.nx - 2);
    j = Math.min(Math.max(j, 0), this.nz - 2);
    const fx = Math.min(Math.max(gx - i, 0), 1), fz = Math.min(Math.max(gz - j, 0), 1);
    const a = this.H(i, j), b = this.H(i + 1, j), c = this.H(i, j + 1), d = this.H(i + 1, j + 1);
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  normal(i: number, j: number): THREE.Vector3 {
    const dx = this.H(i + 1, j) - this.H(i - 1, j), dz = this.H(i, j + 1) - this.H(i, j - 1);
    const n = new THREE.Vector3(-dx, 2 * this.cell, -dz);
    return n.normalize();
  }

  // Coarse textured terrain mesh for distant chunks; uv maps the chunk rectangle
  // (v = 0 at the south edge, matching a top-down render with north up)
  lowGeometry(i0: number, j0: number, i1: number, j1: number, step: number): THREE.BufferGeometry {
    const is: number[] = [], js: number[] = [];
    for (let i = i0; i < i1; i += step) is.push(i);
    is.push(i1);
    for (let j = j0; j < j1; j += step) js.push(j);
    js.push(j1);
    const w = is.length, d = js.length;
    const pos = new Float32Array(w * d * 3), nor = new Float32Array(w * d * 3), uv = new Float32Array(w * d * 2);
    for (let b = 0; b < d; b++)
      for (let a = 0; a < w; a++) {
        const k = b * w + a, gi = is[a], gj = js[b];
        pos[k * 3] = this.x0 + gi * this.cell; pos[k * 3 + 1] = this.H(gi, gj); pos[k * 3 + 2] = this.z0 + gj * this.cell;
        const n = this.normal(gi, gj);
        nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
        uv[k * 2] = (gi - i0) / (i1 - i0); uv[k * 2 + 1] = 1 - (gj - j0) / (j1 - j0);
      }
    const idx: number[] = [];
    for (let b = 0; b < d - 1; b++)
      for (let a = 0; a < w - 1; a++) {
        const p = b * w + a, q = p + 1, r = p + w, s = r + 1;
        idx.push(p, r, q, q, r, s);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // Indexed terrain mesh for a block of cells
  // `hole`: cells (j * nx + i) where `cut` may remove parts of the two triangles (Kavadarci: the Луда
  // Мара's channel, river.ts); the pieces left get their own vertices, interpolated in the triangle
  chunkGeometry(i0: number, j0: number, i1: number, j1: number, colorFn: TerrainColorFn, hole?: { cells: Set<number>; cut: (p: Pt[]) => Pt[][] | null }): THREE.BufferGeometry {
    const w = i1 - i0 + 1, d = j1 - j0 + 1;
    const pos = new Float32Array(w * d * 3), nor = new Float32Array(w * d * 3), col = new Float32Array(w * d * 3);
    const c = new THREE.Color();
    for (let j = 0; j < d; j++)
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 3, gi = i0 + i, gj = j0 + j;
        const y = this.H(gi, gj);
        pos[k] = this.x0 + gi * this.cell; pos[k + 1] = y; pos[k + 2] = this.z0 + gj * this.cell;
        const n = this.normal(gi, gj);
        nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z;
        colorFn(c, y, n.y, gi, gj);
        col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      }
    const idx: number[] = [];
    const ex: number[] = []; // extra vertices: x y z, nx ny nz, r g b
    for (let j = 0; j < d - 1; j++)
      for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, cc = a + w, dd = cc + 1;
        if (hole && hole.cells.has((j0 + j) * this.nx + i0 + i)) {
          for (const t of [[a, cc, b], [b, cc, dd]]) {
            const P: Pt[] = t.map((v): Pt => [pos[v * 3], pos[v * 3 + 2]]);
            const pieces = hole.cut(P);
            if (!pieces) { idx.push(...t); continue; }
            const [A, B, C] = P, den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
            for (const piece of pieces) {
              const base = w * d + ex.length / 9;
              for (const [x, z] of piece) {
                const l0 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (z - C[1])) / den;
                const l1 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (z - C[1])) / den, l2 = 1 - l0 - l1;
                for (const arr of [pos, nor, col])
                  for (let q = 0; q < 3; q++) ex.push(arr[t[0] * 3 + q] * l0 + arr[t[1] * 3 + q] * l1 + arr[t[2] * 3 + q] * l2);
              }
              for (let q = 1; q + 1 < piece.length; q++) idx.push(base, base + q, base + q + 1);
            }
          }
          continue;
        }
        idx.push(a, cc, b, b, cc, dd);
      }
    const g = new THREE.BufferGeometry();
    if (ex.length) {
      const n0 = w * d, n1 = n0 + ex.length / 9;
      const P2 = new Float32Array(n1 * 3), N2 = new Float32Array(n1 * 3), C2 = new Float32Array(n1 * 3);
      P2.set(pos); N2.set(nor); C2.set(col);
      for (let v = 0; v < n1 - n0; v++)
        for (let q = 0; q < 3; q++) { P2[(n0 + v) * 3 + q] = ex[v * 9 + q]; N2[(n0 + v) * 3 + q] = ex[v * 9 + 3 + q]; C2[(n0 + v) * 3 + q] = ex[v * 9 + 6 + q]; }
      g.setAttribute('position', new THREE.BufferAttribute(P2, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
      g.setAttribute('color', new THREE.BufferAttribute(C2, 3));
    } else {
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // Clip a 2D triangle to grid cells + diagonals so each piece lies on one
  // terrain triangle; emit(piecePolygon[[x,z]...], i, j). `cells` = [i0, j0, i1, j1]
  // limits the work to those cells (one chunk), in the same order.
  clipTriangle(t: Pt[], emit: (piece: Pt[], i: number, j: number) => void, cells?: [number, number, number, number]): void {
    const cs = this.cell;
    const xs = [t[0][0], t[1][0], t[2][0]], zs = [t[0][1], t[1][1], t[2][1]];
    const ci0 = Math.max(0, Math.floor((Math.min(...xs) - this.x0) / cs));
    const ci1 = Math.min(this.nx - 2, Math.floor((Math.max(...xs) - this.x0) / cs));
    const cj0 = Math.max(0, Math.floor((Math.min(...zs) - this.z0) / cs));
    const cj1 = Math.min(this.nz - 2, Math.floor((Math.max(...zs) - this.z0) / cs));
    const ia = cells ? Math.max(ci0, cells[0]) : ci0, ib = cells ? Math.min(ci1, cells[2]) : ci1;
    const ja = cells ? Math.max(cj0, cells[1]) : cj0, jb = cells ? Math.min(cj1, cells[3]) : cj1;
    for (let j = ja; j <= jb; j++) {
      // clip to row first
      const zA = this.z0 + j * cs, zB = zA + cs;
      let row = clip(t, 0, -1, -zA);
      row = clip(row, 0, 1, zB);
      if (row.length < 3) continue;
      for (let i = ia; i <= ib; i++) {
        const xA = this.x0 + i * cs, xB = xA + cs;
        let p = clip(row, -1, 0, -xA);
        p = clip(p, 1, 0, xB);
        if (p.length < 3) continue;
        // diagonal: (x-xA)+(z-zA) <= cs
        const lo = clip(p, 1, 1, cs + xA + zA);
        const hi = clip(p, -1, -1, -(cs + xA + zA));
        if (lo.length >= 3) emit(lo, i, j);
        if (hi.length >= 3) emit(hi, i, j);
      }
    }
  }
}

// Sutherland–Hodgman: keep points with a*x + b*z <= c
function clip(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const P = poly[k], Q = poly[(k + 1) % n];
    const dp = a * P[0] + b * P[1] - c, dq = a * Q[0] + b * Q[1] - c;
    if (dp <= 0) out.push(P);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
}
