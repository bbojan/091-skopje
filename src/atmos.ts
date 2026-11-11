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
  // scare: 0…1 after a bark (fly faster and higher), fades out
  const flocks: { cx: number; cz: number; R: number; h: number; w: number; a: number; birds: Bird[]; scare: number; x: number; z: number }[] = [];
  const { hw, hh } = bounds;
  for (let f = 0; f < 14; f++) {
    const cx = (rnd() * 2 - 1) * (hw - 1200), cz = (rnd() * 2 - 1) * (hh - 900);
    const birds: Bird[] = [];
    const n = 5 + Math.floor(rnd() * 6);
    for (let b = 0; b < n; b++) birds.push({ ox: (rnd() - 0.5) * 30, oy: (rnd() - 0.5) * 8, oz: (rnd() - 0.5) * 30, ph: rnd() * 6.28 });
    flocks.push({ cx, cz, R: 140 + rnd() * 260, h: 90 + rnd() * 120, w: (0.06 + rnd() * 0.06) * (rnd() < 0.5 ? 1 : -1), a: rnd() * 6.28, birds, scare: 0, x: cx, z: cz });
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
      f.scare = Math.max(0, f.scare - dt * 0.2);
      f.a += f.w * dt * (1 + 3 * f.scare);
      const x = f.cx + Math.cos(f.a) * f.R, z = f.cz + Math.sin(f.a) * f.R;
      f.x = x; f.z = z;
      const ground = terrain.at(x, z);
      const sg = Math.sign(f.w);
      const heading = Math.atan2(Math.sin(f.a) * sg, -Math.cos(f.a) * sg); // nose (-z) along the circle
      q.setFromAxisAngle(up, heading);
      for (const b of f.birds) {
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(time * 7 + b.ph));
        p.set(x + b.ox, ground + f.h + f.scare * 80 + b.oy + Math.sin(time * 0.8 + b.ph) * 2, z + b.oz);
        mesh.setMatrixAt(i++, m.compose(p, q, s.set(1.6 * scale, 1.6 * scale * (flap * 2 - 1), 1.6 * scale)));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  /** startle the flocks near (x, z): they climb and fly off faster */
  function startle(x: number, z: number): void { for (const f of flocks) if (Math.hypot(f.x - x, f.z - z) < 500) f.scare = 1; }
  return { group: mesh, update, startle };
}

// Paragliders soaring over the north slope of Vodno, below the Millennium Cross: each
// circles in its own thermal, banking into the turn, rising and sinking slowly.
// They stay on the ground at night and in rain or snow.
export function createParagliders(terrain: Terrain, cross: { x: number; z: number }, clippingPlanes: THREE.Plane[], count = 8) {
  const rnd = mulberry32(1963);
  // canopy: a curved wing (an arc band across the span, extruded along the chord), top at y = 0, nose toward -z
  const R = 6.2, T = 0.38, A0 = (38 * Math.PI) / 180, A1 = Math.PI - A0, N = 18, CHORD = 2.6;
  const band = new THREE.Shape();
  for (let i = 0; i <= N; i++) { const a = A0 + ((A1 - A0) * i) / N; if (i) band.lineTo(Math.cos(a) * R, Math.sin(a) * R - R); else band.moveTo(Math.cos(a) * R, Math.sin(a) * R - R); }
  for (let i = N; i >= 0; i--) { const a = A0 + ((A1 - A0) * i) / N; band.lineTo(Math.cos(a) * (R - T), Math.sin(a) * (R - T) - R); }
  band.closePath();
  const canopyGeo = new THREE.ExtrudeGeometry(band, { depth: CHORD, bevelEnabled: false }).translate(0, 0, -CHORD / 2);
  // two tones: the middle panel and the tips are a darker shade of the wing's colour
  const cp = canopyGeo.getAttribute('position'), shade = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++) { const x = Math.abs(cp.getX(i)), v = x < 0.9 || x > 3.9 ? 0.42 : 1; shade.set([v, v, v], i * 3); }
  canopyGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  // rig: the pilot sitting below, and the lines up to the wing
  const HANG = 7.4;
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.3, 0.34, 1.1, 8).rotateX(0.5).translate(0, -HANG, 0.1),
    new THREE.SphereGeometry(0.24, 8, 6).translate(0, -HANG + 0.78, -0.12),
  ];
  const Y = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) for (const [x, z] of [[1.4, -0.7], [3.0, 0.7], [4.4, -0.3]]) {
    const a = new THREE.Vector3(side * 0.28, -HANG + 0.45, 0), b = new THREE.Vector3(side * x, Math.sqrt((R - T) ** 2 - x * x) - R, z);
    const line = new THREE.CylinderGeometry(0.035, 0.035, a.distanceTo(b), 4);
    line.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
    parts.push(line.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
  }
  const rigGeo = mergeGeometries(parts);
  const canopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes }), count);
  const rig = new THREE.InstancedMesh(rigGeo, new THREE.MeshLambertMaterial({ color: '#2f2622', clippingPlanes }), count);
  rig.instanceMatrix = canopy.instanceMatrix; // one set of transforms for both
  const colors = ['#d8322a', '#f2c84b', '#2f6fb5', '#e98a3a', '#3e9b5f', '#8a4fa3', '#f6f3ee', '#e0457b'];
  const col = new THREE.Color();
  const group = new THREE.Group();
  for (const m of [canopy, rig]) { m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); }

  // thermals spread along the slope north of the cross (north is -z)
  const gliders = Array.from({ length: count }, (_, i) => {
    canopy.setColorAt(i, col.set(colors[i % colors.length]));
    const cx = cross.x - 1300 + rnd() * 2700, cz = cross.z - 260 - rnd() * 1150;
    const r = 70 + rnd() * 90;
    return { cx, cz, r, w: (10 / r) * (rnd() < 0.5 ? 1 : -1), a: rnd() * 6.28, h: 110 + rnd() * 210, ph: rnd() * 6.28 };
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), roll = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  let time = 0;
  /** `scale` grows them with the zoom, like the birds, so they can be seen from afar */
  function update(dt: number, scale = 1): void {
    if (!canopy.visible) return;
    time += dt;
    const size = 1.5 * scale;
    gliders.forEach((g, i) => {
      g.a += g.w * dt;
      // the thermal itself wanders a little
      const cx = g.cx + Math.sin(time * 0.021 + g.ph) * 140, cz = g.cz + Math.cos(time * 0.017 + g.ph) * 90;
      const x = cx + Math.cos(g.a) * g.r, z = cz + Math.sin(g.a) * g.r;
      const y = Math.max(terrain.at(cx, cz) + g.h + Math.sin(time * 0.05 + g.ph) * 55, terrain.at(x, z) + 45);
      const sg = Math.sign(g.w);
      q.setFromAxisAngle(Y, Math.atan2(Math.sin(g.a) * sg, -Math.cos(g.a) * sg)); // nose (-z) along the circle
      q.multiply(roll.setFromAxisAngle(Z, -sg * 0.3));                                // banked into the turn
      canopy.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.setScalar(size)));
    });
    canopy.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return {
    group, update,
    /** they fly by day in dry weather only (amounts 0…1) */
    setConditions(night: number, rain: number, snowfall: number): void { canopy.visible = rig.visible = night < 0.5 && rain + snowfall < 0.25; },
  };
}
