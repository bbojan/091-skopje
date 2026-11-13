import * as THREE from 'three';
import { mulberry32 } from './geo.ts';
import type { Terrain } from './terrain.ts';
import type { CitySpec } from './cities.ts';
import type { CrossData, MapMeta, Places, Pt } from './types.ts';

// Ring race over the city's landmarks + "091" balloons to pop. The route is per city
// (`route` in cities.ts): names are map data (Macedonian, like the labels); the last ring is the finish.
const RING_R = 26;

function balloonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8322a';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#f7d83c';
  g.font = "bold 46px 'Rubik Mono One', 'Arial Black', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const x of [64, 192]) g.fillText('091', x, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export interface GameOptions {
  city: CitySpec;
  terrain: Terrain;
  meta: MapMeta;
  crosses: CrossData[];
  places?: Places;
  clippingPlanes: THREE.Plane[];
}

export interface Ring {
  name: string;
  /** the last ring is the finish line */
  final: boolean;
  p: THREE.Vector3;
  m: THREE.Mesh;
  base: THREE.Material;
}

export function createGame({ city, terrain, meta, crosses, places = {}, clippingPlanes }: GameOptions) {
  const ROUTE = city.route;
  const P = (lat: number, lon: number): Pt => [(lon - meta.lon0) * meta.kx, -(lat - meta.lat0) * meta.ky];
  const group = new THREE.Group();
  group.visible = false;

  // ring positions
  const pts = ROUTE.map(([name, lat, lon, agl, key], i) => {
    let x: number, z: number;
    if (key && places[key]) [x, z] = places[key];
    else if (lat == null || lon == null) { const c = crosses.find((k) => /Millennium|Милениум/.test(k.name)) || crosses[0]; x = c.x + 60; z = c.z + 40; }
    else [x, z] = P(lat, lon);
    return { name, final: i === ROUTE.length - 1, p: new THREE.Vector3(x, terrain.at(x, z) + agl, z) };
  });
  const ringGeo = new THREE.TorusGeometry(RING_R, 2.4, 10, 40);
  const red = new THREE.MeshLambertMaterial({ color: '#d8322a', emissive: '#5a0d08', clippingPlanes });
  const yellow = new THREE.MeshLambertMaterial({ color: '#f7d83c', emissive: '#7a5d00', clippingPlanes });
  const done = new THREE.MeshLambertMaterial({ color: '#b9b2a8', transparent: true, opacity: 0.35, clippingPlanes });
  const rings: Ring[] = pts.map((r, i) => {
    const mat = i % 2 ? red : yellow;
    const m = new THREE.Mesh(ringGeo, mat);
    m.position.copy(r.p);
    const next = pts[Math.min(i + 1, pts.length - 1)].p, prev = pts[Math.max(i - 1, 0)].p;
    const dir = next.clone().sub(prev).setY(0).normalize();
    m.lookAt(r.p.clone().add(dir));
    m.castShadow = true;
    group.add(m);
    return { ...r, m, base: mat };
  });
  // light beam over the next ring so it can be found from afar
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(RING_R * 0.55, RING_R * 0.9, 1, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.renderOrder = 3;
  group.add(beam);

  // balloons near the route
  const rnd = mulberry32(91);
  const bTex = balloonTexture();
  const bMat = new THREE.MeshLambertMaterial({ map: bTex, clippingPlanes });
  const bGeo = new THREE.SphereGeometry(6, 20, 14).scale(1, 1.18, 1);
  const knotGeo = new THREE.ConeGeometry(1.2, 2, 8).rotateX(Math.PI);
  const strGeo = new THREE.CylinderGeometry(0.12, 0.12, 9, 4).translate(0, -11.5, 0);
  const strMat = new THREE.MeshBasicMaterial({ color: '#4b3428' });
  const balloons: { g: THREE.Group; home: THREE.Vector3; ph: number; popped: boolean; pop: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const a = pts[i % (pts.length - 1)].p, b = pts[(i % (pts.length - 1)) + 1].p;
    const t = 0.2 + rnd() * 0.6;
    const p = a.clone().lerp(b, t).add(new THREE.Vector3((rnd() - 0.5) * 260, (rnd() - 0.3) * 60, (rnd() - 0.5) * 260));
    p.y = Math.max(p.y, terrain.at(p.x, p.z) + 45);
    const g = new THREE.Group();
    const s = new THREE.Mesh(bGeo, bMat); s.castShadow = true;
    const k = new THREE.Mesh(knotGeo, bMat); k.position.y = -7.6;
    const st = new THREE.Mesh(strGeo, strMat);
    g.add(s, k, st);
    g.position.copy(p);
    g.rotation.y = rnd() * 6.28;
    group.add(g);
    balloons.push({ g, home: p.clone(), ph: rnd() * 6.28, popped: false, pop: 0 });
  }

  const st = { next: 0, time: 0, running: false, finished: false, newBest: false, popped: 0, flash: '' };
  let best: number | null = null;
  try { best = Number(localStorage.getItem(city.bestRaceKey)) || null; } catch { /* storage unavailable */ }

  function reset(): void {
    Object.assign(st, { next: 0, time: 0, running: false, finished: false, newBest: false, popped: 0, flash: '' });
    rings.forEach((r) => { r.m.material = r.base; r.m.visible = true; });
    balloons.forEach((b) => { b.popped = false; b.pop = 0; b.g.visible = true; b.g.scale.setScalar(1); });
  }

  let clock = 0, flashT = 0;
  function update(dt: number, planePos?: THREE.Vector3): void {
    clock += dt;
    if (st.running) st.time += dt;
    if (flashT > 0 && (flashT -= dt) <= 0) st.flash = '';
    // rings
    if (!st.finished) {
      const r = rings[st.next];
      const pulse = 1 + Math.sin(clock * 4) * 0.06;
      r.m.scale.setScalar(pulse);
      const ground = terrain.at(r.p.x, r.p.z);
      beam.position.set(r.p.x, (ground + r.p.y + 900) / 2, r.p.z);
      beam.scale.set(1, r.p.y + 900 - ground, 1);
      beam.visible = true;
      if (planePos && planePos.distanceTo(r.p) < RING_R * 1.15) {
        r.m.scale.setScalar(1);
        r.m.material = done;
        if (st.next === 0) st.running = true;
        st.next++;
        st.flash = st.next >= rings.length ? '' : `✓ ${r.name}`;
        flashT = 2;
        if (st.next >= rings.length) {
          st.finished = true;
          st.running = false;
          beam.visible = false;
          if (!best || st.time < best) {
            best = st.time;
            st.newBest = true;
            try { localStorage.setItem(city.bestRaceKey, String(best)); } catch { /* storage unavailable */ }
          } else st.newBest = false;
        }
      }
    }
    // balloons bob, spin, pop
    for (const b of balloons) {
      if (b.popped) {
        if (b.pop < 1) {
          b.pop = Math.min(1, b.pop + dt * 5);
          b.g.scale.setScalar(1 + b.pop * 0.8);
          if (b.pop >= 1) b.g.visible = false;
        }
        continue;
      }
      b.g.position.y = b.home.y + Math.sin(clock * 1.2 + b.ph) * 2.5;
      b.g.rotation.y += dt * 0.4;
      if (planePos && planePos.distanceTo(b.g.position) < 20) {
        b.popped = true;
        st.popped++;
        st.flash = '🎈 091!';
        flashT = 1.2;
      }
    }
  }

  return {
    group, beam, reset, update, rings, balloons,
    get state() { return { ...st, total: rings.length, balloons: balloons.length, best, nextRing: rings[Math.min(st.next, rings.length - 1)] }; },
  };
}

export type Game = ReturnType<typeof createGame>;

export const fmtTime = (t: number | null): string => {
  if (t == null) return '–';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};
