// GPU time of each render pass (see "How to verify" in docs/NOTES.md).
// Paste into the browser console on the dev server (or run it with a browser tool), then:
//   await __passes()          // five views at 1600×1000 (renders 2400×1500), ms per frame
// The page must be visible and in a fixed quality tier: set the ⚡ quality option to "high" or
// "low" first (localStorage skopje.quality, reload), otherwise the frame-time governor sees
// the stalls this script causes and switches to the low tier in the middle of the run.
// Passes are timed as chains that end on the canvas and are then subtracted, because the
// GPU only finishes work the final image depends on; timing one pass alone reads as ~0.
// 'scene' is the colour pass, 'normal' the separate normal/depth pass (0 on the single-pass path, where
// the colour pass writes the normals too), 'shadow' the extra cost of a frame that re-renders
// the shadow map (camera moves only). Expect about ±1 ms of noise between runs.
(() => {
  const N = 8, REPS = 5, W = 1600, H = 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__passes = async (views = ['center', 'kale', 'park', 'vodno', 'overview']) => {
    const d = __dbg, r = d.renderer, gl = r.getContext(), ink = d.ink, scene = d.scene, cam = d.camera;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) throw new Error('no EXT_disjoint_timer_query_webgl2');
    if (document.hidden) throw new Error('page is hidden: timings would be meaningless');
    const px = new Uint8Array(4);
    const sync = () => { r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    const gpu = async (fn) => {
      sync();
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      for (let i = 0; i < N; i++) fn();
      gl.endQuery(ext.TIME_ELAPSED_EXT); sync();
      for (let i = 0; i < 300 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); i++) await sleep(10);
      const v = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 / N; gl.deleteQuery(q); return v;
    };
    // the accumulation pass must not read the target it writes (feedback loop)
    const out_ = () => ink._pass(ink.outMat, null), acc_ = () => { ink.accMat.uniforms.tOld.value = ink.acc[0].texture; ink._pass(ink.accMat, ink.acc[1]); }, comp_ = () => ink._pass(ink.compMat, ink.compRT);
    const V = {
      out: out_, accOut: () => { acc_(); out_(); }, compAccOut: () => { comp_(); acc_(); out_(); },
      noInk: () => { const on = ink.ink; ink.ink = false; ink.render(scene, cam, false); ink.ink = on; },
      full: () => ink.render(scene, cam, false),
      fullShadow: () => { r.shadowMap.needsUpdate = true; ink.render(scene, cam, false); },
    };
    const res = { tier: { low: ink.low, single: ink.single, ao: ink.compMat.uniforms.aoOn.value, shadowMap: d.sun.shadow.mapSize.x } };
    // the app's own loop must not resize the buffers during the run
    const keep = [ink.setSize, r.setSize, r.setPixelRatio];
    try {
      for (const view of views) {
        [ink.setSize, r.setSize, r.setPixelRatio] = keep;
        d.setView(view);
        for (let i = 0; i < 6; i++) { await sleep(400); d.updateCameraRange(); d.world.city.updateLOD(cam); }
        r.setPixelRatio(1); r.setSize(W, H, false); ink.setSize(W, H, 1.5); cam.aspect = W / H; cam.updateProjectionMatrix();
        ink.setSize = () => {}; r.setSize = () => {}; r.setPixelRatio = () => {};
        d.fitShadow(); for (let i = 0; i < 5; i++) ink.render(scene, cam, false);
        const t = {}; for (const k in V) t[k] = [];
        for (let rep = 0; rep < REPS; rep++) for (const k in V) t[k].push(await gpu(V[k]));
        const m = {}; for (const k in V) { t[k].sort((a, b) => a - b); m[k] = t[k][REPS >> 1]; }
        const f = (x) => +x.toFixed(2);
        res[view] = { full: f(m.full), scene: f(m.noInk - m.compAccOut), normal: f(m.full - m.noInk), composite: f(m.compAccOut - m.accOut), accum: f(m.accOut - m.out), output: f(m.out), shadow: f(m.fullShadow - m.full) };
      }
    } finally { [ink.setSize, r.setSize, r.setPixelRatio] = keep; }
    dispatchEvent(new Event('resize'));
    return res;
  };
  return 'ready: await __passes()';
})();
