// Firefighting mode by hand: stops the app's own loop and steps it frame by frame, so a
// pass over a fire is the same every time and works in a hidden pane too. On `npm run dev`:
//   eval(await (await fetch('/scripts/browser/fire-harness.js')).text())
//   __h.only('forest')            // start over until the first fire is of this kind (forest | building | bus)
//   __h.approach(900, 70)         // 900 m south of fire 0, 70 m above the ground, flying at it
//   __h.until(() => __h.near() < 185); __h.key('keydown'); __h.step(200); __h.key('keyup')
//   __h.info()                    // fires put out, tank, the fires with strength and distance
// Space is the water key; __h.key('keydown', 'ArrowLeft') steers. The flight HUD is not updated.
(() => {
  document.getElementById('fly').click();
  if (!document.body.classList.contains('firefighting')) document.getElementById('fly-fire').click();
  const d = __dbg, w = d.world, V = d.camera.position.constructor;
  d.renderer.setAnimationLoop(null);
  const vel = new V();
  const key = (type, code = 'Space') => dispatchEvent(new KeyboardEvent(type, { code }));
  const render = () => {
    d.controls.target.copy(w.flight.pos); d.updateCameraRange(); w.city.updateLOD(d.camera); d.fitShadow(1100); d.ink.reset();
    d.ink.render(d.scene, d.camera, true);
  };
  const nearest = () => {
    let b = null, bd = 1e9;
    for (const f of w.fire.state.fires) { const dd = Math.hypot(f.x - w.flight.pos.x, f.z - w.flight.pos.z); if (dd < bd) { bd = dd; b = f; } }
    return [b, bd];
  };
  const near = () => nearest()[1];
  // the same per-frame calls as the flight branch of the loop in main.ts
  const step = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      w.flight.update(dt);
      w.fire.update(dt, w.flight.pos, w.flight.velocity(vel), w.flight.yaw, w.flight.dropping);
      w.flight.setFloor(w.fire.state.overWater ? 5 : null);
      const [f, nd] = nearest(), p = w.flight.pos;
      const close = !!f && nd < 480 && (f.x - p.x) * Math.sin(w.flight.yaw) - (f.z - p.z) * Math.cos(w.flight.yaw) > -60;
      w.flight.setAim(close, w.fire.state.falling, close ? f.top : w.fire.state.aimY);
      w.traffic.update(dt, d.camera, d.controls.target);
    }
    render();
  };
  const at = (x, z, agl, yaw = 0) => { w.flight.start(new V(x, 0, z), yaw); w.flight.pos.y = w.terrain.at(x, z) + agl; };
  const approach = (dist = 520, agl = 70, i = 0) => { const f = w.fire.state.fires[i]; at(f.x, f.z + dist, agl); return f; };
  const info = () => {
    const s = w.fire.state;
    return { out: s.out, tank: +s.tank.toFixed(2), flash: s.flash, scoop: s.scooping, water: s.overWater,
      fires: s.fires.map((f) => [f.kind, +f.hp.toFixed(3), Math.round(Math.hypot(f.x - w.flight.pos.x, f.z - w.flight.pos.z))]) };
  };
  const only = (kind) => {
    for (let k = 0; k < 80; k++) { w.fire.start(w.flight.pos, w.flight.yaw); if (w.fire.state.fires[0]?.kind === kind) return true; }
    return false;
  };
  // hold or release the dive key (the other arrow when "invert up/down" is on)
  const dive = (on) => key(on ? 'keydown' : 'keyup', document.getElementById('opt-invert').checked ? 'ArrowUp' : 'ArrowDown');
  // the start [x, z] of a stretch of water at least `len` metres long toward the east (to skim along)
  const river = (len = 280) => {
    for (let z = -900; z < 1500; z += 20) for (let x = -1600; x < 2000; x += 20) {
      let n = 0;
      while (n * 20 < len && w.fire.isWater(x + n * 20, z)) n++;
      if (n * 20 >= len) return [x, z];
    }
    return null;
  };
  const until = (cond, max = 1500) => { let n = 0; while (!cond() && n < max) { step(2); n += 2; } return n; };
  window.__h = { step, render, at, approach, info, key, dive, river, only, until, near, w, d, V };
})();
