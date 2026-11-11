// Pixel-identity check for rendering changes (see "How to verify" in docs/NOTES.md).
// Paste into the browser console on the dev server (or run it with a browser tool), then:
//   await __px.record()    // BEFORE the change: saves 9 reference renders in IndexedDB 'px-ref'
//   await __px.compare()   // AFTER the change (reload first): diffs the same 9 renders
// Renders day / sunset / night × center / kale / overview at 960×600, with traffic, birds and
// paragliders hidden, clouds parked, the shader clock fixed and 24 accumulated frames, so two runs of
// the same code match exactly. Only the gondola cabins (moving landmark) may differ a little.
// The page must be visible (front tab, pane shown): it waits for the app's own frames, and a
// hidden page gets none. Takes ~12 s for record + compare. Reload afterwards (it hides traffic).
// Clear weather + summer first, otherwise the month default changes the look:
//   localStorage.setItem('skopje.weather', 'clear'); localStorage.setItem('skopje.season', 'summer'); location.reload()
(() => {
  const W = 960, H = 600;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // the app's own loop must run a few frames after a view change (level of detail, shadow fit)
  const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const ready = async () => { for (let i = 0; i < 120 && !window.__dbg?.world?.flight; i++) await sleep(500); if (!__dbg?.world) throw new Error('city not loaded'); };
  const db = () => new Promise((res, rej) => {
    const q = indexedDB.open('px-ref', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('img');
    q.onsuccess = () => res(q.result); q.onerror = rej;
  });
  const put = async (key, url) => { const d = await db(); await new Promise((r, j) => { const tx = d.transaction('img', 'readwrite'); tx.objectStore('img').put(url, key); tx.oncomplete = r; tx.onerror = j; }); };
  const get = async (key) => { const d = await db(); return new Promise((r) => { const q = d.transaction('img').objectStore('img').get(key); q.onsuccess = () => r(q.result); }); };
  const pixels = async (url) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data;
  };
  const diff = async (a, b) => {
    const A = await pixels(a), B = await pixels(b);
    if (A.length !== B.length) return { error: 'size mismatch' };
    let over2 = 0, max = 0;
    for (let i = 0; i < A.length; i += 4) {
      const m = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (m > 2) over2++; if (m > max) max = m;
    }
    return { over2, max };
  };
  const freeze = () => {
    const w = __dbg.world, live = document.getElementById('live');
    if (live.getAttribute('aria-pressed') === 'true') live.click(); // stop traffic and clouds moving
    w.traffic.group.visible = false; w.birds.group.visible = false;
    if (w.gliders) w.gliders.group.visible = false; // paragliders (not in versions before 2.4)
    w.clouds.group.children.forEach((m, i) => m.position.set(-6500 + (i % 6) * 2400, 1100 + i * 6, -4500 + Math.floor(i / 6) * 1600));
    w.clouds.update(0);
  };
  const size = () => {
    const d = __dbg;
    d.renderer.setPixelRatio(1); d.renderer.setSize(W, H, false); d.ink.setSize(W, H, 1);
    d.camera.aspect = W / H; d.camera.updateProjectionMatrix();
  };
  // the ☀ button cycles day → sunset → night; each switch blends for ~1.5 s
  const setTime = async (night) => {
    for (let i = 0; i < 4 && Math.abs(__dbg.SHARED.uNight.value - night) > 1e-6; i++) { document.getElementById('time').click(); await sleep(1700); }
  };
  const shot = async (view) => {
    const d = __dbg;
    d.setView(view); await frames(4);
    size(); d.SHARED.uTime.value = 50; d.ink.reset();
    for (let i = 0; i < 24; i++) d.ink.render(d.scene, d.camera, false);
    return d.renderer.domElement.toDataURL('image/png');
  };
  const TIMES = [['day', 0], ['sunset', 0.18], ['night', 1]], VIEWS = ['center', 'kale', 'overview'];
  const run = async (each) => {
    await ready(); freeze();
    const out = {};
    for (const [time, night] of TIMES) { await setTime(night); for (const view of VIEWS) out[`${time}-${view}`] = await each(`${time}-${view}`, await shot(view)); }
    return out;
  };
  window.__px = {
    record: () => run(async (key, url) => { await put(key, url); return 'saved'; }),
    compare: () => run(async (key, url) => { const ref = await get(key); return ref ? JSON.stringify(await diff(url, ref)) : 'no reference'; }),
    shot, diff,
  };
  return 'ready: await __px.record() before the change, await __px.compare() after';
})();
