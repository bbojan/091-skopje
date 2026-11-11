import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './geo.ts';
import type { Terrain } from './terrain.ts';
import type { Bounds } from './types.ts';

export const MAX_CLOUDS = 36;

// Puffy cartoon clouds drifting with the wind. Their shadows are drawn in the
// post pass (see post.ts), so moving clouds never re-render the shadow map.
export function createClouds(bounds: Bounds, baseY: number) {
  const rnd = mulberry32(8080);
  const variants: THREE.BufferGeometry[] = [];
  for (let v = 0; v < 5; v++) {
    const lobes: THREE.BufferGeometry[] = [];
    const n = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), d = 0.35 + rnd() * 0.45;
      const s = 0.35 + rnd() * 0.3;
      lobes.push(new THREE.IcosahedronGeometry(s, 1).scale(1, 0.62, 1).translate(Math.cos(a) * d, rnd() * 0.12, Math.sin(a) * d * 0.7));
    }
    lobes.push(new THREE.IcosahedronGeometry(0.55, 1).scale(1.2, 0.7, 1).translate(0, 0.12, 0));
    const g = mergeGeometries(lobes);
    g.computeBoundingSphere();
    variants.push(g);
  }
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#e9e4f2', emissiveIntensity: 0.25, transparent: true, opacity: 0.68, depthWrite: false });
  const group = new THREE.Group();
  const clouds: { m: THREE.Mesh; r: number; speed: number; base: THREE.Vector3 }[] = [];
  const { hw, hh } = bounds;
  for (let i = 0; i < MAX_CLOUDS; i++) {
    const r = 230 + rnd() * 260;
    const m = new THREE.Mesh(variants[i % variants.length], mat);
    m.scale.set(r, r * (0.8 + rnd() * 0.4), r * (0.8 + rnd() * 0.3));
    m.rotation.y = rnd() * Math.PI * 2;
    m.position.set((rnd() * 2 - 1) * hw, baseY + rnd() * 260, (rnd() * 2 - 1) * hh);
    group.add(m);
    clouds.push({ m, r, speed: 0.7 + rnd() * 0.6, base: m.scale.clone() });
  }
  const wind = new THREE.Vector2(9, 2.5); // m/s, roughly from the west
  // per cloud: x, z, radius, height — read by the cloud-shadow pass
  const uniforms = Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4());
  // weather: cloud cover 0 = as authored; 1 = clouds ~1.7x bigger (overcast)
  let grow = 1;
  function setCover(cover: number): void {
    grow = 1 + 0.7 * cover;
    for (const c of clouds) c.m.scale.copy(c.base).multiplyScalar(grow);
    update(0);
  }
  function update(dt: number): void {
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.m.position.x += wind.x * c.speed * dt;
      c.m.position.z += wind.y * c.speed * dt;
      if (c.m.position.x > hw + 400) c.m.position.x = -hw - 400;
      if (c.m.position.z > hh + 400) c.m.position.z = -hh - 400;
      uniforms[i].set(c.m.position.x, c.m.position.z, c.r * 1.05 * grow, c.m.position.y);
    }
  }
  update(0);
  return { group, update, setCover, uniforms, material: mat };
}

// Small flocks wheeling over the city
export function createBirds(terrain: Terrain, bounds: Bounds, clippingPlanes: THREE.Plane[]) {
  const rnd = mulberry32(4711);
  const geo = new THREE.BufferGeometry();
  // a simple "V": body at the origin, wing tips out to the sides
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.35, -1.6, 0.5, 0.25, 0, 0, 0.35,
    0, 0, -0.35, 0, 0, 0.35, 1.6, 0.5, 0.25,
  ], 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#3b2f2a', side: THREE.DoubleSide, clippingPlanes });
  type Bird = { ox: number; oy: number; oz: number; ph: number };
  const flocks: { cx: number; cz: number; R: number; h: number; w: number; a: number; birds: Bird[] }[] = [];
  const { hw, hh } = bounds;
  for (let f = 0; f < 14; f++) {
    const cx = (rnd() * 2 - 1) * (hw - 1200), cz = (rnd() * 2 - 1) * (hh - 900);
    const birds: Bird[] = [];
    const n = 5 + Math.floor(rnd() * 6);
    for (let b = 0; b < n; b++) birds.push({ ox: (rnd() - 0.5) * 30, oy: (rnd() - 0.5) * 8, oz: (rnd() - 0.5) * 30, ph: rnd() * 6.28 });
    flocks.push({ cx, cz, R: 140 + rnd() * 260, h: 90 + rnd() * 120, w: (0.06 + rnd() * 0.06) * (rnd() < 0.5 ? 1 : -1), a: rnd() * 6.28, birds });
  }
  const total = flocks.reduce((s, f) => s + f.birds.length, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let time = 0;
  function update(dt: number, scale = 1): void {
    time += dt;
    let i = 0;
    for (const f of flocks) {
      f.a += f.w * dt;
      const x = f.cx + Math.cos(f.a) * f.R, z = f.cz + Math.sin(f.a) * f.R;
      const ground = terrain.at(x, z);
      const sg = Math.sign(f.w);
      const heading = Math.atan2(Math.sin(f.a) * sg, -Math.cos(f.a) * sg); // nose (-z) along the circle
      q.setFromAxisAngle(up, heading);
      for (const b of f.birds) {
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(time * 7 + b.ph));
        p.set(x + b.ox, ground + f.h + b.oy + Math.sin(time * 0.8 + b.ph) * 2, z + b.oz);
        mesh.setMatrixAt(i++, m.compose(p, q, s.set(1.6 * scale, 1.6 * scale * (flap * 2 - 1), 1.6 * scale)));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group: mesh, update };
}
