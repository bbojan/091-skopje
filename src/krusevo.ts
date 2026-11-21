// Kruševo: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Македониум (Jordan and Iskra Grabul, 1974): a white concrete body like a seed or a burst shell, a rounded
//   core with stubby tubes reaching out in every direction; the side tubes end in round and oval windows of
//   stained glass in metal frames, the two upper ones in small glass domes; the entrance a tall narrow slot at
//   the end of a straight ramp between low white parapets, on a cobbled forecourt.
// - Мечкин Камен: the bronze-dark giant of the uprising, legs wide apart, lifting a boulder over his head, on
//   the bare rock of the hill, three flagpoles beside him.
// Sizes are read off the photos (door ≈ 2.4 m), not measured; positions from OSM (`modelRects`).
import * as THREE from 'three';
import { frame, parts, modelKit, type Frame } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function krusevoFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['makedonium', 16]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createKrusevo(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {}, A = data.landmarks?.modelAxes ?? {};
  const group = new THREE.Group();
  const { glass, stained, place } = modelKit(group, clippingPlanes);
  const gnd = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };

  // ---------------- Македониум: +u from the entrance out along the ramp
  const mf = M.makedonium ? frame(M.makedonium, terrain, A.makedonium, true) : null;
  if (mf) {
    const p = parts(), R = Math.min(6.5, Math.min(mf.L, mf.W) * 0.55), cy = R * 1.05;
    p.add('white', new THREE.SphereGeometry(R, 28, 18).scale(1, 0.95, 1).translate(0, cy, 0));
    p.cyl('concrete', 0, 0, mf.under, cy - R * 0.6, R * 0.55, R * 0.75, 20); // the waist down to the ground
    // the tubes: [direction (azimuth, elevation), radius, length, end: 'glass' dome / round or oval window]
    const tubes: [number, number, number, number, 'dome' | 'round' | 'oval'][] = [
      [0.0, 0.18, 2.4, 3.0, 'oval'], [Math.PI, 0.1, 2.3, 3.3, 'oval'],
      [0.9, -0.25, 2.0, 3.6, 'round'], [-0.9, -0.25, 2.0, 3.6, 'round'], [2.3, -0.2, 2.0, 3.4, 'round'], [-2.3, -0.2, 2.0, 3.4, 'round'],
      [1.57, 0.35, 2.1, 3.2, 'round'], [-1.57, 0.35, 2.1, 3.2, 'round'],
      [0.6, 1.05, 1.5, 3.0, 'dome'], [-0.6, 1.05, 1.5, 3.0, 'dome'], [2.6, 0.95, 1.6, 2.8, 'dome'], [-2.6, 0.95, 1.6, 2.8, 'dome'],
    ];
    for (const [az, el, r, len, end] of tubes) {
      const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const c = new THREE.Vector3(0, cy, 0).addScaledVector(dir, R * 0.7 + len / 2);
      const tube = new THREE.CylinderGeometry(r * 0.9, r * 1.1, len, 20, 1, true);
      if (end === 'oval') tube.scale(1.35, 1, 0.8);
      p.add('white', tube.applyQuaternion(q).translate(c.x, c.y, c.z));
      const tip = new THREE.Vector3(0, cy, 0).addScaledVector(dir, R * 0.7 + len);
      const ring = new THREE.TorusGeometry(r * 0.9, 0.18, 6, 24).rotateX(Math.PI / 2);
      if (end === 'oval') ring.scale(1.35, 1, 0.8);
      p.add('concrete', ring.applyQuaternion(q).translate(tip.x, tip.y, tip.z));
      if (end === 'dome') p.add('glass', new THREE.SphereGeometry(r * 0.8, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).applyQuaternion(q).translate(tip.x, tip.y, tip.z));
      else {
        const win = new THREE.CircleGeometry(r * 0.86, 24).rotateX(-Math.PI / 2);
        if (end === 'oval') win.scale(1.35, 1, 0.8);
        p.add('stained', win.applyQuaternion(q).translate(tip.x, tip.y, tip.z));
        const bars = [0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.06, 0.06, r * 1.7).rotateY((k * Math.PI) / 4).translate(0, 0.03, 0));
        for (const b of bars) { if (end === 'oval') b.scale(1.35, 1, 0.8); p.add('iron', b.applyQuaternion(q).translate(tip.x, tip.y, tip.z)); }
      }
    }
    // the entrance slot facing +u, the ramp and its parapets, the cobbled forecourt
    p.box('door', R * 0.9, R * 1.02, -0.6, 0.6, 0.6, 4.8);
    p.box('concreteDark', R * 0.95, R * 1.05, -0.9, 0.9, 0.5, 5);
    const rl = 14, ry = gnd(mf, R + rl, 0);
    const ramp = new THREE.BufferGeometry();
    ramp.setAttribute('position', new THREE.Float32BufferAttribute([R, 0.5, -1.8, R, 0.5, 1.8, R + rl, ry, 1.8, R, 0.5, -1.8, R + rl, ry, 1.8, R + rl, ry, -1.8], 3));
    ramp.computeVertexNormals();
    p.add('stoneDark', ramp);
    for (const s of [-1, 1]) {
      const par = new THREE.BufferGeometry();
      const v = s * 2.0;
      par.setAttribute('position', new THREE.Float32BufferAttribute([R, 0.5, v, R + rl, ry, v, R, 1.6, v, R + rl, ry, v, R + rl, ry + 0.4, v, R, 1.6, v], 3));
      par.computeVertexNormals();
      p.add('white', par);
      p.add('white', par.clone().translate(0, 0, s * 0.3).scale(1, 1, 1));
    }
    p.box('stoneDark', -R * 1.6, R * 1.6, -R * 1.6, R * 1.6, mf.under, 0.45); // the forecourt round it
    place(p, mf);
  }

  // ---------------- Мечкин Камен: the giant lifting the boulder
  const kf = M.meckin ? frame(M.meckin, terrain, A.meckin, true) : null;
  if (kf) {
    const p = parts(), s = 1.0;
    // the rock outcrop it stands on
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, d = 1.5 + (i % 3) * 1.4;
      p.add('rock', new THREE.DodecahedronGeometry(1.4 + (i % 4) * 0.4, 0).scale(1, 0.45, 1).translate(Math.cos(a) * d, kf.under * 0.5, Math.sin(a) * d));
    }
    p.box('rockDark', -2.4, 2.4, -1.6, 1.6, kf.under, 0.5);
    const B = 'slate' as const;
    for (const sv of [-1, 1]) { // legs wide apart, knees bent
      p.add(B, new THREE.CylinderGeometry(0.42 * s, 0.32 * s, 3.2 * s, 10).rotateX(sv * 0.38).translate(0, 2.0 * s, sv * 1.15 * s));
      p.add(B, new THREE.CylinderGeometry(0.5 * s, 0.42 * s, 2.4 * s, 10).rotateX(-sv * 0.35).translate(0.15, 4.3 * s, sv * 0.75 * s));
      p.add(B, new THREE.BoxGeometry(1.0 * s, 0.35 * s, 0.6 * s).translate(0.2, 0.7 * s, sv * 1.75 * s)); // feet
    }
    p.add(B, new THREE.CylinderGeometry(0.95 * s, 0.75 * s, 2.8 * s, 12).scale(0.8, 1, 1).translate(0, 6.6 * s, 0)); // torso
    p.add(B, new THREE.SphereGeometry(0.5 * s, 12, 8).translate(0.25, 8.4 * s, 0)); // the head, bowed under the load
    for (const sv of [-1, 1]) p.add(B, new THREE.CylinderGeometry(0.28 * s, 0.34 * s, 2.6 * s, 8).rotateX(-sv * 0.35).translate(0, 8.7 * s, sv * 0.95 * s)); // arms up
    p.add(B, new THREE.DodecahedronGeometry(1.5 * s, 1).scale(1.1, 0.85, 1.3).translate(0, 10.6 * s, 0)); // the boulder
    for (const dv of [-4.2, -5, -5.8]) p.cyl('white', -2, dv, kf.under, 12, 0.07, 0.05, 6); // flagpoles
    place(p, kf);
  }
  return { group, nightLit: [glass, stained] };
}
