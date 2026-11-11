import * as THREE from 'three';
import type { MapControls } from 'three/addons/controls/MapControls.js';

// Keyboard + gamepad (XInput "standard" mapping and DirectInput fallbacks)
// for moving around the map. Flight uses the same pad through readPad().

type MapAction = 'fwd' | 'back' | 'left' | 'right' | 'rotL' | 'rotR' | 'tiltUp' | 'tiltDown' | 'zoomIn' | 'zoomOut';

const KEYS: Record<string, MapAction> = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyQ: 'rotL', KeyE: 'rotR', KeyR: 'tiltUp', KeyF: 'tiltDown',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', KeyZ: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', KeyX: 'zoomOut',
};

const dz = (v: number, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

/** Normalised gamepad state: sticks in −1…1, triggers 0…1, buttons as booleans. */
export interface PadState {
  id: string;
  standard: boolean;
  lx: number; ly: number; rx: number; ry: number;
  lt: number; rt: number;
  a: boolean; b: boolean; x: boolean; y: boolean; start: boolean;
}

// Normalised pad state; works for "standard" (XInput, most modern pads) and
// common DirectInput layouts where the right stick sits on axes 2/5 or 2/3.
export function readPad(): PadState | null {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p): p is Gamepad => !!p) : [];
  const gp = pads.find((p) => p.connected);
  if (!gp) return null;
  const a = gp.axes, b = gp.buttons;
  const btn = (i: number) => (b[i] ? b[i].value || (b[i].pressed ? 1 : 0) : 0);
  const std = gp.mapping === 'standard';
  const rx = a[2] ?? 0;
  const ry = std ? (a[3] ?? 0) : a.length > 5 ? a[5] : (a[3] ?? 0);
  // D-pad: standard buttons 12-15; DirectInput often reports a POV hat on axis 9
  let dx = btn(15) - btn(14), dy = btn(13) - btn(12);
  if (!std && a.length > 9 && Math.abs(a[9]) <= 1.01 && a[9] !== 0) {
    const hat = Math.round((a[9] + 1) * 3.5); // 0..7 clockwise from up
    const dirs: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    if (dirs[hat]) [dx, dy] = dirs[hat];
  }
  return {
    id: gp.id, standard: std,
    lx: dz(a[0] ?? 0) + dx, ly: dz(a[1] ?? 0) + dy, rx: dz(rx), ry: dz(ry),
    lt: btn(6), rt: btn(7), a: btn(0) > 0.5, b: btn(1) > 0.5, x: btn(2) > 0.5, y: btn(3) > 0.5, start: btn(9) > 0.5,
  };
}

export interface MapInputOptions {
  controls: MapControls;
  camera: THREE.PerspectiveCamera;
  isActive: () => boolean;
}

export function createMapInput({ controls, camera, isActive }: MapInputOptions) {
  const held = new Set<MapAction>();
  const typing = (e: KeyboardEvent) => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    return !!t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable);
  };
  addEventListener('keydown', (e) => {
    if (!isActive() || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    held.add(k);
  });
  addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) held.delete(k); });
  addEventListener('blur', () => held.clear());

  const off = new THREE.Vector3(), sph = new THREE.Spherical(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  // returns true when it moved the camera
  function update(dt: number, pad: PadState | null): boolean {
    if (!isActive()) return false;
    const h = (k: MapAction) => (held.has(k) ? 1 : 0);
    let px = h('right') - h('left'), pz = h('fwd') - h('back');
    let rot = h('rotR') - h('rotL'), tilt = h('tiltDown') - h('tiltUp'), zoom = h('zoomOut') - h('zoomIn');
    if (pad) {
      px += pad.lx; pz += -pad.ly;
      rot += pad.rx; tilt += pad.ry;
      zoom += pad.lt - pad.rt;
    }
    if (!px && !pz && !rot && !tilt && !zoom) return false;
    off.subVectors(camera.position, controls.target);
    sph.setFromVector3(off);
    const dist = sph.radius;
    // pan on the ground plane, relative to where the camera looks
    fwd.set(-off.x, 0, -off.z).normalize();
    right.set(-fwd.z, 0, fwd.x);
    const speed = dist * 0.6 * dt;
    move.set(0, 0, 0).addScaledVector(right, px * speed).addScaledVector(fwd, pz * speed);
    controls.target.add(move);
    sph.theta -= rot * 1.6 * dt;
    sph.phi = THREE.MathUtils.clamp(sph.phi + tilt * 1.1 * dt, 0.12, controls.maxPolarAngle);
    sph.radius = THREE.MathUtils.clamp(dist * Math.exp(zoom * 1.4 * dt), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(off.setFromSpherical(sph));
    camera.lookAt(controls.target);
    return true;
  }
  return { update };
}
