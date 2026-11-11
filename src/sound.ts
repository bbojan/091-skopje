// Optional sound, off by default. Everything is synthesised with Web Audio (no audio
// files): engine and propeller, wind, rain, the water drop, fire, birds by day and
// crickets at night, plus short signals (ring, balloon, new fire, fire out, bark).
// The audio graph is only built the first time sound is switched on, from a click or a
// key press (browsers do not start audio without one).

/** What can be heard right now; main.ts fills it once per frame. */
export interface SoundScene {
  mode: 'map' | 'fly' | 'drive' | 'walk';
  /** how hard the engine works, 0…1 (speed within the vehicle's range) */
  speed: number;
  /** the firefighting plane: a turbine whine on top of the propeller */
  tractor: boolean;
  dropping: boolean;
  scooping: boolean;
  /** the nearest fire: 0 far away … 1 right at it */
  fire: number;
  rain: number;
  night: number;
  /** how close the view is to the ground: 0 the overview … 1 street level */
  near: number;
}
export type SoundEvent = 'ding' | 'pop' | 'finish' | 'alarm' | 'out' | 'bark';

export function createSound() {
  let ctx: AudioContext | null = null;
  let on = false;
  let g: ReturnType<typeof build> | null = null;
  const rnd = Math.random;

  function build(ac: AudioContext) {
    // everything → master → a limiter (so layers adding up never clip) → speakers
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -14; limiter.ratio.value = 8; limiter.attack.value = 0.005; limiter.release.value = 0.2;
    const master = ac.createGain();
    master.gain.value = 0;
    const meter = ac.createAnalyser();
    meter.fftSize = 1024;
    master.connect(limiter).connect(ac.destination);
    master.connect(meter);

    const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
    /** a looping band of noise with its own volume (silent until asked for) */
    const band = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ac.createBufferSource();
      src.buffer = noise; src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(master);
      src.start(0, rnd() * 1.5);
      return { filter, gain };
    };
    const osc = (type: OscillatorType, freq: number, to: AudioNode) => {
      const o = ac.createOscillator();
      o.type = type; o.frequency.value = freq;
      o.connect(to);
      o.start();
      return o;
    };

    // engine: two oscillators through a low-pass, its volume beaten by the propeller
    const engLp = ac.createBiquadFilter();
    engLp.type = 'lowpass'; engLp.frequency.value = 400;
    const engAm = ac.createGain();   // 1 ± the propeller beat
    const engGain = ac.createGain();
    engGain.gain.value = 0;
    engLp.connect(engAm).connect(engGain).connect(master);
    const eng1 = osc('sawtooth', 60, engLp), eng2 = osc('triangle', 30, engLp);
    const beatDepth = ac.createGain();
    beatDepth.gain.value = 0.3;
    const beat = osc('sine', 12, beatDepth);
    beatDepth.connect(engAm.gain);
    // turbine whine of the Air Tractor
    const whineGain = ac.createGain();
    whineGain.gain.value = 0;
    whineGain.connect(master);
    const whine = osc('sine', 1200, whineGain);
    // crickets: a high tone chopped into chirps
    const cricketChop = ac.createGain();
    cricketChop.gain.value = 0;
    const cricketGain = ac.createGain();
    cricketGain.gain.value = 0;
    cricketChop.connect(cricketGain).connect(master);
    osc('sine', 4300, cricketChop);
    const chopDepth = ac.createGain();
    chopDepth.gain.value = 0.5;
    osc('square', 17, chopDepth);
    chopDepth.connect(cricketChop.gain);
    const chopSlow = ac.createGain();
    chopSlow.gain.value = 0.5;
    osc('sine', 0.7, chopSlow);
    chopSlow.connect(cricketChop.gain);

    return {
      master, meter, noise,
      eng1, eng2, engLp, engGain, beat, beatDepth, whine, whineGain, cricketGain,
      wind: band('bandpass', 700, 0.5),
      rain: band('highpass', 2200),
      water: band('bandpass', 1100, 0.6),
      roar: band('lowpass', 320),
    };
  }

  /** a note that dies away; `to` slides the pitch */
  function tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, to?: number): void {
    if (!ctx || !g) return;
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    e.gain.setValueAtTime(0.0001, at);
    e.gain.linearRampToValueAtTime(vol, at + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(e).connect(g.master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  /** a short puff of filtered noise */
  function burst(at: number, dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass'): void {
    if (!ctx || !g) return;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain();
    src.buffer = g.noise;
    f.type = type; f.frequency.value = freq;
    e.gain.setValueAtTime(vol, at);
    e.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(e).connect(g.master);
    src.start(at, rnd() * 1.8, dur + 0.05);
  }
  const melody = (notes: number[], step: number, vol: number, last: number) => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    notes.forEach((f, i) => tone(f, t + i * step, i === notes.length - 1 ? last : step * 1.6, 'triangle', vol));
  };

  /** a short signal */
  function play(ev: SoundEvent): void {
    if (!on || !ctx || !g) return;
    const t = ctx.currentTime + 0.02;
    if (ev === 'ding') { tone(880, t, 0.5, 'sine', 0.34); tone(1320, t + 0.07, 0.6, 'sine', 0.25); }
    else if (ev === 'pop') { burst(t, 0.07, 0.55, 1800); tone(420, t, 0.12, 'sine', 0.36, 110); }
    else if (ev === 'finish') melody([523, 659, 784, 1047, 1319], 0.13, 0.32, 0.9);
    else if (ev === 'out') melody([659, 784, 988, 1319], 0.11, 0.32, 0.7);
    else if (ev === 'alarm') { for (const k of [0, 0.42]) { tone(740, t + k, 0.15, 'square', 0.09); tone(988, t + k + 0.18, 0.15, 'square', 0.09); } }
    else if (ev === 'bark') { for (const k of [0, 0.27]) { tone(380, t + k, 0.11, 'sawtooth', 0.32, 170); burst(t + k, 0.09, 0.3, 900); } }
  }

  /** follow what is on screen: called every frame while sound is on */
  function update(dt: number, s: SoundScene): void {
    if (!on || !ctx || !g || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number, tc = 0.12) => p.setTargetAtTime(v, t, tc);
    const fly = s.mode === 'fly', drive = s.mode === 'drive', outside = s.mode === 'map' || s.mode === 'walk';
    // engine
    const f = fly ? (s.tractor ? 84 + 30 * s.speed : 62 + 26 * s.speed) : 38 + 55 * s.speed;
    set(g.eng1.frequency, f);
    set(g.eng2.frequency, f / 2);
    set(g.engLp.frequency, fly ? 420 + 500 * s.speed : 260 + 300 * s.speed);
    set(g.engGain.gain, fly ? (s.tractor ? 0.085 : 0.105) : drive ? 0.06 + 0.06 * s.speed : 0);
    set(g.beat.frequency, fly ? (s.tractor ? 16 : 11) + 9 * s.speed : 6 + 10 * s.speed);
    set(g.beatDepth.gain, fly ? (s.tractor ? 0.22 : 0.34) : 0.1);
    set(g.whine.frequency, 1150 + 500 * s.speed);
    set(g.whineGain.gain, fly && s.tractor ? 0.016 : 0);
    // air rushing past, rain
    set(g.wind.filter.frequency, 500 + 700 * s.speed);
    set(g.wind.gain.gain, fly ? 0.05 + 0.09 * s.speed : 0);
    set(g.rain.gain.gain, 0.15 * s.rain * (outside ? 0.4 + 0.6 * s.near : 1));
    // water: the drop hisses, scooping rumbles lower
    set(g.water.filter.frequency, s.scooping && !s.dropping ? 650 : 1100);
    set(g.water.gain.gain, s.dropping ? 0.3 : s.scooping ? 0.24 : 0, 0.05);
    // fire: a low roar and crackles, louder the closer it is
    set(g.roar.gain.gain, 0.22 * s.fire * s.fire);
    if (s.fire > 0.05 && rnd() < dt * 16 * s.fire) burst(t + rnd() * 0.05, 0.02 + rnd() * 0.04, 0.22 * s.fire * (0.4 + rnd()), 2500 + rnd() * 3000, 'highpass');
    // the outdoors: birds by day, crickets at night (not in rain, quieter from high up)
    const calm = outside ? s.near * (1 - s.rain) : 0;
    set(g.cricketGain.gain, 0.035 * calm * s.night, 0.6);
    if (rnd() < dt * 0.55 * calm * (1 - s.night)) {
      const base = 2400 + rnd() * 2200, n = 2 + Math.floor(rnd() * 3), v = 0.03 + rnd() * 0.03;
      for (let i = 0; i < n; i++) tone(base * (0.9 + rnd() * 0.3), t + i * (0.09 + rnd() * 0.05), 0.07 + rnd() * 0.05, 'sine', v, base * (1.1 + rnd() * 0.5));
    }
  }

  function setOn(v: boolean): void {
    on = v;
    if (v) {
      if (!ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctx();
        g = build(ctx);
      }
      void ctx.resume();
      g?.master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.08);
    } else if (ctx && g) {
      const ac = ctx;
      g.master.gain.setTargetAtTime(0, ac.currentTime, 0.03);
      setTimeout(() => { if (!on) void ac.suspend(); }, 300);
    }
  }
  // no sound from a tab in the background
  document.addEventListener('visibilitychange', () => { if (ctx && on) void (document.hidden ? ctx.suspend() : ctx.resume()); });

  return {
    setOn, update, play,
    get on(): boolean { return on; },
    /** output level right now, 0…1 (RMS), for checking without ears */
    get level(): number {
      if (!g) return 0;
      const buf = new Float32Array(g.meter.fftSize);
      g.meter.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      return Math.sqrt(sum / buf.length);
    },
  };
}

export type Sound = ReturnType<typeof createSound>;
