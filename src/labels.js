import * as THREE from 'three';

// Hand-lettered place labels: districts when zoomed out, landmarks up close.
const DISTRICTS = [
  ['Центар', 41.9930, 21.4250], ['Карпош', 42.0040, 21.3920], ['Аеродром', 41.9850, 21.4720],
  ['Кисела Вода', 41.9760, 21.4420], ['Чаир', 42.0110, 21.4420], ['Бутел', 42.0330, 21.4430],
  ['Гази Баба', 42.0130, 21.4800], ['Ѓорче Петров', 42.0090, 21.3560], ['Шуто Оризари', 42.0380, 21.4250],
];
// [name, lat, lon, lift, key in data.places (exact OSM position, preferred)]
const LANDMARKS = [
  ['Плоштад Македонија', 41.9955, 21.4319, 30, 'square'], ['Камен мост', 41.9970, 21.4331, 14], ['Кале', 42.0003, 21.4330, 40],
  ['Стара чаршија', 42.0018, 21.4378, 20, 'bazaar'], ['Порта Македонија', 41.99445, 21.43242, 30, 'porta'], ['Градски парк', 42.0075, 21.4190, 25, 'park'],
  ['Национална арена', 42.00575, 21.42551, 40, 'arena'], ['Зоолошка градина', 42.0064, 21.41767, 20, 'zoo'], ['Вардар', 41.9994, 21.4110, 6],
];

export function createLabels({ meta, terrain, crosses, places = {}, container }) {
  const P = (lat, lon) => [(lon - meta.lon0) * meta.kx, -(lat - meta.lat0) * meta.ky];
  const items = [];
  const mk = (name, x, z, lift, kind) => {
    const el = document.createElement('div');
    el.className = `label ${kind}`;
    el.textContent = name;
    container.appendChild(el);
    items.push({ el, kind, p: new THREE.Vector3(x, terrain.at(x, z) + lift, z), shown: false });
  };
  for (const [n, lat, lon] of DISTRICTS) { const [x, z] = P(lat, lon); mk(n, x, z, 60, 'district'); }
  for (const [n, lat, lon, lift, key] of LANDMARKS) { const [x, z] = places[key] || P(lat, lon); mk(n, x, z, lift, n === 'Вардар' ? 'river' : 'landmark'); }
  const mc = crosses.find((c) => /Millennium|Милениум/.test(c.name));
  if (mc) mk('Милениумски крст', mc.x, mc.z, mc.h + 12, 'landmark');
  const [vx, vz] = P(41.9690, 21.4000);
  mk('Водно', vx, vz, 120, 'district');

  const v = new THREE.Vector3();
  let enabled = true;
  function update(camera, target) {
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
    set enabled(on) { enabled = on; },
    get enabled() { return enabled; },
  };
}
