// Гевгелија and Богданци: a hand-built model after descriptions, no photos measured:
// - the Богданци wind farm (ЕЛЕМ, 2014, the first in Macedonia): 16 turbines of 2.3 MW on the ridge north-east of
//   Богданци, at OSM's generator nodes (`modelRects` gvwind1–16 in PREP). Siemens SWT-2.3-93: a white tapered steel
//   tower with the hub about 80 m up, a rotor of 93 m (three blades of ~45 m), the nacelle behind it. The rotors face
//   north, into the вардарец (the valley's north wind), and stand still (a turning rotor would need a per-frame update).
import * as THREE from 'three';
import { frame, parts, modelKit } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

const HUB = 80, BLADE = 45;
const turbineKeys = () => Array.from({ length: 16 }, (_, i) => `gvwind${i + 1}`);

/** Walking collision: each turbine's tower base (a 4 m square in its pad). */
export function gevgelijaFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const k of turbineKeys()) {
    const r = M[k];
    if (!r) continue;
    let cx = 0, cz = 0;
    const n = r.length / 2;
    for (let i = 0; i < r.length; i += 2) { cx += r[i] / n; cz += r[i + 1] / n; }
    out.push([[cx - 2, cz - 2, cx + 2, cz - 2, cx + 2, cz + 2, cx - 2, cz + 2], HUB]);
  }
  return out;
}

export function createGevgelija(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);

  // ---------------- the Богданци wind farm: u along the pad's long side (north), the rotor in the v–y plane on the north side
  turbineKeys().forEach((k, i) => {
    const f = M[k] ? frame(M[k], terrain, [0, -1]) : null; // +u toward the north (scene −z)
    if (!f) return;
    const p = parts(), u = f.under;
    p.cyl('concrete', 0, 0, u, 0.4, 5, 5, 20); // the foundation's collar
    p.cyl('white', 0, 0, u, HUB - 1.6, 2.1, 1.25, 20); // the tapered tower
    p.box('white', -8.2, 1.8, -1.7, 1.7, HUB - 1.6, HUB + 1.8); // the nacelle, behind the rotor
    p.add('white', new THREE.SphereGeometry(1.6, 14, 8).scale(1.5, 1, 1).translate(2.4, HUB, 0)); // the hub's nose
    const spin = 0.35 + i * 0.73; // each rotor stopped at its own angle
    for (let b = 0; b < 3; b++) {
      const g = new THREE.CylinderGeometry(0.35, 1.25, BLADE, 6).scale(0.35, 1, 1).translate(0, BLADE / 2 + 1.2, 0);
      p.add('white', g.rotateX(spin + (b * 2 * Math.PI) / 3).translate(2.6, HUB, 0));
    }
    place(p, f);
  });

  return { group, nightLit: [glass] };
}
