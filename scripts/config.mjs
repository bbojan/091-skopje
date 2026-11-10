// Shared map extent (keep in sync with data/query.overpassql)
export const BBOX = { s: 41.955, w: 21.33, n: 42.055, e: 21.525 };
export const lat0 = (BBOX.s + BBOX.n) / 2;
export const lon0 = (BBOX.w + BBOX.e) / 2;
const R = 6378137;
export const kx = (Math.cos((lat0 * Math.PI) / 180) * R * Math.PI) / 180;
export const ky = (R * Math.PI) / 180;
// x = east, z = south
export const proj = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * ky];
export const unproj = (x, z) => [lat0 - z / ky, lon0 + x / kx];
export const W = (BBOX.e - BBOX.w) * kx;
export const H = (BBOX.n - BBOX.s) * ky;
