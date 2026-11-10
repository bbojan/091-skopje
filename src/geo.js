// Small geometry helpers working on 2D points [x, z]

export function mulberry32(seed) {
  let a = (Number(seed) % 4294967296) >>> 0 || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toPts(flat) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  return pts;
}

export function ringArea(r) {
  let s = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function pip(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function pipPoly(x, z, poly) {
  if (!pip(x, z, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pip(x, z, poly[i])) return false;
  return true;
}

export function bbox(ring) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of ring) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return [x0, z0, x1, z1];
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  hi.pop(); lo.pop();
  return lo.concat(hi);
}

// Minimum-area oriented bounding box. Returns centre, long axis (a), short axis (b), half extents.
export function obb(ring) {
  const hull = convexHull(ring);
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    let dx = q[0] - p[0], dz = q[1] - p[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    dx /= len; dz /= len;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of hull) {
      const u = x * dx + z * dz, v = -x * dz + z * dx;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, dx, dz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { dx, dz, u0, u1, v0, v1 } = best;
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const c = [uc * dx - vc * dz, uc * dz + vc * dx];
  let a = [dx, dz], b = [-dz, dx], L = (u1 - u0) / 2, W = (v1 - v0) / 2;
  if (W > L) { [a, b] = [b, a]; [L, W] = [W, L]; }
  return { c, a, b, L, W, area: best.area };
}

// Uniform grid storing polygons, for point-in-polygon queries
export class PolyGrid {
  constructor(cell = 25) { this.cell = cell; this.map = new Map(); }
  _k(i, j) { return i * 100003 + j; }
  add(poly, data = null) {
    const [x0, z0, x1, z1] = bbox(poly[0]);
    const item = { poly, box: [x0, z0, x1, z1], data };
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = this._k(i, j);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(item);
      }
  }
  hit(x, z, pad = 0) {
    const c = this.cell;
    const seen = new Set();
    for (let i = Math.floor((x - pad) / c); i <= Math.floor((x + pad) / c); i++)
      for (let j = Math.floor((z - pad) / c); j <= Math.floor((z + pad) / c); j++) {
        const arr = this.map.get(this._k(i, j));
        if (!arr) continue;
        for (const it of arr) {
          if (seen.has(it)) continue;
          seen.add(it);
          const r = this._test(it, x, z, pad);
          if (r) return r;
        }
      }
    return null;
  }
  _test(it, x, z, pad) {
    const b = it.box;
    if (x < b[0] - pad || x > b[2] + pad || z < b[1] - pad || z > b[3] + pad) return null;
    if (pipPoly(x, z, it.poly)) return it;
    if (pad > 0) {
      const ring = it.poly[0], p2 = pad * pad;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0], az = ring[j][1], dx = ring[i][0] - ax, dz = ring[i][1] - az;
        let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        if (ex * ex + ez * ez < p2) return it;
      }
    }
    return null;
  }
}

// Uniform grid storing thick line segments
export class SegGrid {
  constructor(cell = 20) { this.cell = cell; this.map = new Map(); }
  _k(i, j) { return i * 100003 + j; }
  add(ax, az, bx, bz, hw) {
    const c = this.cell, s = { ax, az, bx, bz, hw };
    const x0 = Math.min(ax, bx) - hw, x1 = Math.max(ax, bx) + hw, z0 = Math.min(az, bz) - hw, z1 = Math.max(az, bz) + hw;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = this._k(i, j);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(s);
      }
  }
  // true if point within (hw + margin) of any segment
  near(x, z, margin = 0) {
    const arr = this.map.get(this._k(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!arr) return false;
    for (const s of arr) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - s.ax) * dx + (z - s.az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + dx * t - x, pz = s.az + dz * t - z;
      const r = s.hw + margin;
      if (px * px + pz * pz < r * r) return true;
    }
    return false;
  }
}

// Point occupancy hash for minimum spacing
export class PointHash {
  constructor(minDist) { this.d = minDist; this.map = new Map(); }
  _k(i, j) { return i * 100003 + j; }
  tryAdd(x, z, d = this.d) {
    const c = this.d, i0 = Math.floor(x / c), j0 = Math.floor(z / c);
    const reach = Math.ceil(d / c);
    for (let i = i0 - reach; i <= i0 + reach; i++)
      for (let j = j0 - reach; j <= j0 + reach; j++) {
        const arr = this.map.get(this._k(i, j));
        if (!arr) continue;
        for (const p of arr) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < Math.min(d, p[2]) ** 2) return false;
      }
    const k = this._k(i0, j0);
    let arr = this.map.get(k);
    if (!arr) this.map.set(k, (arr = []));
    arr.push([x, z, d]);
    return true;
  }
}
