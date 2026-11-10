import * as THREE from 'three';
import { mulberry32 } from './geo.js';

// ---------------------------------------------------------------- time of day
export const TIMES = {
  day: {
    label: '☀ Ден', sunDir: [-0.7, 0.9, 0.32], sun: '#fff2df', sunI: 2.2, sky: '#dcdcf4', gnd: '#f3e2c8', hemiI: 2.25,
    paper: '#f2e8d8', haze: '#ece4ee', ink: '#3f2a20', grade: [1.03, 1.0, 0.96], night: 0,
  },
  sunset: {
    label: '🌇 Зајдисонце', sunDir: [-0.9, 0.44, 0.18], sun: '#ffb070', sunI: 3.4, sky: '#e2bccb', gnd: '#f6c08f', hemiI: 1.75,
    paper: '#f4d2b6', haze: '#f7c29b', ink: '#4a2420', grade: [1.1, 0.99, 0.86], night: 0.18,
  },
  night: {
    label: '🌙 Ноќ', sunDir: [0.45, 0.8, -0.35], sun: '#a6b5ff', sunI: 0.6, sky: '#4b5389', gnd: '#2c2a3c', hemiI: 1.1,
    paper: '#1d2036', haze: '#262b48', ink: '#12131f', grade: [0.9, 0.97, 1.12], night: 1,
  },
};
export const TIME_ORDER = ['day', 'sunset', 'night'];

const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
export function blendTimes(A, B, t) {
  const mix = (x, y) => x + (y - x) * t;
  return {
    sunDir: new THREE.Vector3(...A.sunDir).normalize().lerp(new THREE.Vector3(...B.sunDir).normalize(), t).normalize(),
    sun: lerpC(A.sun, B.sun, t), sunI: mix(A.sunI, B.sunI),
    sky: lerpC(A.sky, B.sky, t), gnd: lerpC(A.gnd, B.gnd, t), hemiI: mix(A.hemiI, B.hemiI),
    paper: lerpC(A.paper, B.paper, t), haze: lerpC(A.haze, B.haze, t), ink: lerpC(A.ink, B.ink, t),
    grade: new THREE.Vector3(...A.grade).lerp(new THREE.Vector3(...B.grade), t), night: mix(A.night, B.night),
  };
}

// soft radial glow used for lamp light pools and headlights
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- street lamps
export function createLamps(roadList, terrain, bounds, clippingPlanes) {
  const rnd = mulberry32(555);
  const spots = [];
  for (const r of roadList) {
    if (r.kind !== 'major' && r.kind !== 'minor' && r.kind !== 'ped') continue;
    const step = r.kind === 'major' ? 30 : 38;
    const off = r.w / 2 + (r.kind === 'ped' ? 0.5 : 1.4);
    let carry = rnd() * step, side = 1;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const tx = dx / len, tz = dz / len;
      for (let t = carry; t < len; t += step) {
        const x = ax + tx * t - tz * off * side, z = az + tz * t + tx * off * side;
        if (Math.abs(x) < bounds.hw - 5 && Math.abs(z) < bounds.hh - 5) spots.push(x, z);
        if (r.kind === 'major') side = -side;
      }
      carry = (carry - len) % step;
      if (carry < 0) carry += step;
    }
  }
  const n = spots.length / 2;
  const group = new THREE.Group();
  const pool = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffb35c', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes }),
    n
  );
  const head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: '#fff1c4', clippingPlanes }), n);
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 5).translate(0, 3, 0), new THREE.MeshLambertMaterial({ color: '#4a4f5a', clippingPlanes }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = spots[i * 2], z = spots[i * 2 + 1], y = terrain.at(x, z);
    pool.setMatrixAt(i, m.compose(p.set(x, y + 1.25, z), q, s.set(17, 1, 17)));
    head.setMatrixAt(i, m.compose(p.set(x, y + 6.2, z), q, s.set(1, 1, 1)));
    post.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(1, 1, 1)));
  }
  pool.renderOrder = 2;
  for (const o of [pool, head, post]) { o.frustumCulled = false; group.add(o); }
  group.visible = false;
  return {
    group, glows: [pool], count: n,
    setNight(f) {
      group.visible = f > 0.05;
      pool.material.opacity = 0.6 * THREE.MathUtils.smoothstep(f, 0.1, 0.9);
      head.material.color.set('#fff1c4').multiplyScalar(0.4 + 0.6 * f);
    },
  };
}
