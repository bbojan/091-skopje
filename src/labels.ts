import * as THREE from 'three';
import type { Terrain } from './terrain.ts';
import type { CitySpec, LabelKind } from './cities.ts';
import type { CrossData, MapMeta, Places, Pt } from './types.ts';

// Hand-lettered place labels: districts when zoomed out, landmarks up close (lists per city in cities.ts).

export interface LabelOptions {
  city: CitySpec;
  meta: MapMeta;
  terrain: Terrain;
  crosses: CrossData[];
  places?: Places;
  container: HTMLElement;
}

export function createLabels({ city, meta, terrain, crosses, places = {}, container }: LabelOptions) {
  const P = (lat: number, lon: number): Pt => [(lon - meta.lon0) * meta.kx, -(lat - meta.lat0) * meta.ky];
  const items: { el: HTMLDivElement; kind: LabelKind; p: THREE.Vector3; shown: boolean }[] = [];
  const mk = (name: string, x: number, z: number, lift: number, kind: LabelKind) => {
    const el = document.createElement('div');
    el.className = `label ${kind}`;
    el.textContent = name;
    container.appendChild(el);
    items.push({ el, kind, p: new THREE.Vector3(x, terrain.at(x, z) + lift, z), shown: false });
  };
  for (const [n, lat, lon, lift = 60] of city.districts) { const [x, z] = P(lat, lon); mk(n, x, z, lift, 'district'); }
  for (const [n, lat, lon, lift, key, kind = 'landmark'] of city.labels) {
    const [x, z] = (key && places[key]) || P(lat, lon);
    mk(n, x, z, lift, kind);
  }
  const mc = crosses.find((c) => /Millennium|Милениум/.test(c.name));
  if (mc) mk('Милениумски крст', mc.x, mc.z, mc.h + 12, 'landmark');

  const v = new THREE.Vector3();
  let enabled = true;
  function update(camera: THREE.Camera, target: THREE.Vector3): void {
    const dist = camera.position.distanceTo(target);
    const w = container.clientWidth, h = container.clientHeight;
    for (const it of items) {
      let show = enabled;
      if (show) {
        if (it.kind === 'district') show = dist > 2200;
        else show = dist < 5200;
      }
      if (show) {
        v.copy(it.p).project(camera);
        show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        if (show) it.el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      }
      if (show !== it.shown) { it.el.classList.toggle('on', show); it.shown = show; }
    }
  }
  return {
    update,
    /** removes the labels from the page (the city is unloaded) */
    dispose(): void { for (const it of items) it.el.remove(); items.length = 0; },
    set enabled(on: boolean) { enabled = on; },
    get enabled(): boolean { return enabled; },
  };
}
