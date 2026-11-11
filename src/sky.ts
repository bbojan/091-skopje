import * as THREE from 'three';
import { mulberry32 } from './geo.ts';
import type { RoadInfo } from './city.ts';
import type { Terrain } from './terrain.ts';
import type { Bounds, Vec3 } from './types.ts';

// ---------------------------------------------------------------- time of day
/** A time-of-day preset as authored (plain numbers and colour strings). */
export interface TimePreset {
  sunDir: Vec3;
  sun: THREE.ColorRepresentation;
  sunI: number;
  sky: THREE.ColorRepresentation;
  gnd: THREE.ColorRepresentation;
  hemiI: number;
  paper: THREE.ColorRepresentation;
  haze: THREE.ColorRepresentation;
  ink: THREE.ColorRepresentation;
  grade: Vec3;
  /** 0 = day … 1 = night (window glow, lamps, headlights) */
  night: number;
}
/** A preset or a blend of two, ready to apply to lights and uniforms. */
export interface TimeState {
  sunDir: THREE.Vector3;
  sun: THREE.Color;
  sunI: number;
  sky: THREE.Color;
  gnd: THREE.Color;
  hemiI: number;
  paper: THREE.Color;
  haze: THREE.Color;
  ink: THREE.Color;
  grade: THREE.Vector3;
  night: number;
}

export type TimeName = 'day' | 'sunset' | 'night';

export const TIMES: Record<TimeName, TimePreset> = {
  day: {
    sunDir: [-0.7, 0.9, 0.32], sun: '#fff2df', sunI: 2.2, sky: '#dcdcf4', gnd: '#f3e2c8', hemiI: 2.25,
    paper: '#f2e8d8', haze: '#ece4ee', ink: '#3f2a20', grade: [1.03, 1.0, 0.96], night: 0,
  },
  sunset: {
    sunDir: [-0.9, 0.44, 0.18], sun: '#ffb070', sunI: 3.4, sky: '#e2bccb', gnd: '#f6c08f', hemiI: 1.75,
    paper: '#f4d2b6', haze: '#f7c29b', ink: '#4a2420', grade: [1.1, 0.99, 0.86], night: 0.18,
  },
  night: {
    sunDir: [0.45, 0.8, -0.35], sun: '#a6b5ff', sunI: 0.6, sky: '#4b5389', gnd: '#2c2a3c', hemiI: 1.1,
    paper: '#1d2036', haze: '#262b48', ink: '#12131f', grade: [0.9, 0.97, 1.12], night: 1,
  },
};
export const TIME_ORDER: TimeName[] = ['day', 'sunset', 'night'];
export const isTimeName = (s: string | null): s is TimeName => !!s && s in TIMES;

const lerpC = (a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
export function blendTimes(A: TimePreset, B: TimePreset, t: number): TimeState {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    sunDir: new THREE.Vector3(...A.sunDir).normalize().lerp(new THREE.Vector3(...B.sunDir).normalize(), t).normalize(),
    sun: lerpC(A.sun, B.sun, t), sunI: mix(A.sunI, B.sunI),
    sky: lerpC(A.sky, B.sky, t), gnd: lerpC(A.gnd, B.gnd, t), hemiI: mix(A.hemiI, B.hemiI),
    paper: lerpC(A.paper, B.paper, t), haze: lerpC(A.haze, B.haze, t), ink: lerpC(A.ink, B.ink, t),
    grade: new THREE.Vector3(...A.grade).lerp(new THREE.Vector3(...B.grade), t), night: mix(A.night, B.night),
  };
}
/** Freeze a blended state back into a preset, e.g. as the start of a new blend. */
export const presetOf = (s: TimeState): TimePreset => ({ ...s, sunDir: s.sunDir.toArray(), grade: s.grade.toArray() });

// ---------------------------------------------------------------- weather
// A second axis on top of the time of day. Every value is neutral for 'clear'
// (multipliers 1, amounts 0), so clear weather renders exactly as before.
export interface Weather {
  /** sun intensity multiplier (overcast: weaker sun, softer shadows) */
  sun: number;
  /** sky (hemisphere) light multiplier */
  sky: number;
  /** 0…1: paper, haze and light colours pulled toward the overcast grey */
  grey: number;
  /** overcast tint; its hue is used, the brightness follows the time of day */
  overcast: THREE.ColorRepresentation;
  /** saturation multiplier in the grade */
  sat: number;
  /** extra haze: nearer and denser (0 = as authored) */
  haze: number;
  /** 0…1 cloud cover: bigger, greyer, more opaque clouds */
  clouds: number;
  /** 0…1 falling rain and wet streets */
  rain: number;
  /** 0…1 falling snow */
  snowfall: number;
  /** 0…1 snow lying on the ground, roofs and trees */
  snow: number;
  /** scene height (terrain y, m) above which snow lies */
  snowLine: number;
}

export type WeatherName = 'clear' | 'rain' | 'snow' | 'vodno';

export const WEATHER: Record<WeatherName, Weather> = {
  clear: { sun: 1, sky: 1, grey: 0, overcast: '#9aa3b5', sat: 1, haze: 0, clouds: 0, rain: 0, snowfall: 0, snow: 0, snowLine: -1000 },
  rain: { sun: 0.32, sky: 0.92, grey: 0.55, overcast: '#8e97aa', sat: 0.8, haze: 0.22, clouds: 1, rain: 1, snowfall: 0, snow: 0, snowLine: -1000 },
  snow: { sun: 0.55, sky: 1.1, grey: 0.42, overcast: '#cdd4e0', sat: 0.82, haze: 0.16, clouds: 0.7, rain: 0, snowfall: 1, snow: 1, snowLine: -1000 },
  // Skopje's usual winter: snow on Vodno and the hills, the city only wet and grey
  vodno: { sun: 0.75, sky: 1.0, grey: 0.28, overcast: '#c3cad8', sat: 0.9, haze: 0.08, clouds: 0.45, rain: 0, snowfall: 0, snow: 1, snowLine: 300 },
};
export const WEATHER_ORDER: WeatherName[] = ['clear', 'rain', 'snow', 'vodno'];
export const isWeatherName = (s: string | null): s is WeatherName => !!s && s in WEATHER;

export function blendWeather(A: Weather, B: Weather, t: number): Weather {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    sun: mix(A.sun, B.sun), sky: mix(A.sky, B.sky), grey: mix(A.grey, B.grey),
    overcast: new THREE.Color(A.overcast).lerp(new THREE.Color(B.overcast), t),
    sat: mix(A.sat, B.sat), haze: mix(A.haze, B.haze), clouds: mix(A.clouds, B.clouds),
    rain: mix(A.rain, B.rain), snowfall: mix(A.snowfall, B.snowfall), snow: mix(A.snow, B.snow),
    // snow line: blend toward the preset that has snow, so the snow doesn't slide up or down while fading
    snowLine: A.snow === 0 ? B.snowLine : B.snow === 0 ? A.snowLine : mix(A.snowLine, B.snowLine),
  };
}

/** Pull a colour toward the overcast hue at the same brightness (amount 0 = unchanged). */
export function overcastColor(c: THREE.Color, w: Weather, amount = w.grey): THREE.Color {
  if (amount === 0) return c;
  const tint = new THREE.Color(w.overcast);
  const lum = (x: THREE.Color) => 0.2126 * x.r + 0.7152 * x.g + 0.0722 * x.b;
  tint.multiplyScalar(lum(c) / Math.max(lum(tint), 1e-6));
  return c.lerp(tint, amount);
}

// soft radial glow used for lamp light pools and headlights
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
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
export function createLamps(roadList: RoadInfo[], terrain: Terrain, bounds: Bounds, clippingPlanes: THREE.Plane[]) {
  const rnd = mulberry32(555);
  const spots: number[] = [];
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
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffb35c', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes });
  const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, n);
  const headMat = new THREE.MeshBasicMaterial({ color: '#fff1c4', clippingPlanes });
  const head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), headMat, n);
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
    group, glows: [pool] as THREE.Object3D[], count: n,
    setNight(f: number): void {
      group.visible = f > 0.05;
      poolMat.opacity = 0.6 * THREE.MathUtils.smoothstep(f, 0.1, 0.9);
      headMat.color.set('#fff1c4').multiplyScalar(0.4 + 0.6 * f);
    },
  };
}
