import * as THREE from 'three';

const FS_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Halton sequence for sub-pixel jitter
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const JITTER = Array.from({ length: 32 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

// Illustrated renderer:
//   colour pass + normal/depth pass → composite (ink lines, AO, grade, haze)
//   → temporal accumulation of jittered frames (supersampled antialiasing)
//   → display (paper grain, sRGB)
export class InkRenderer {
  constructor(renderer) {
    this.r = renderer;
    const hf = { type: THREE.HalfFloatType };
    this.colorRT = new THREE.WebGLRenderTarget(1, 1, { ...hf, samples: 4 });
    this.normalRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
    this.normalRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.compRT = new THREE.WebGLRenderTarget(1, 1, hf);
    this.acc = [new THREE.WebGLRenderTarget(1, 1, hf), new THREE.WebGLRenderTarget(1, 1, hf)];
    this.normalMat = new THREE.MeshNormalMaterial();
    this.ink = true;
    this.frame = 0;
    this.maxSamples = 24;
    this.liveBlend = 0.22;

    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tNormal: { value: this.normalRT.texture },
        tDepth: { value: this.normalRT.depthTexture },
        texel: { value: new THREE.Vector2() },
        px: { value: 1 },
        near: { value: 1 }, far: { value: 1000 }, focal: { value: 1000 },
        inkOn: { value: 1 },
        inkColor: { value: new THREE.Color('#3f2a20') },
        paper: { value: new THREE.Color('#f2e8d8') },
        haze: { value: new THREE.Color('#ece4ee') },
        seed: { value: 0 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tNormal, tDepth;
        uniform vec2 texel; uniform float px, near, far, focal, inkOn, seed;
        uniform vec3 inkColor, paper, haze;
        varying vec2 vUv;
        float linZ(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          if (d >= 1.0) return 1e7;
          float z = d * 2.0 - 1.0;
          return 2.0 * near * far / (far + near - z * (far - near));
        }
        float inv(vec2 uv) { float z = linZ(uv); return z >= 1e7 ? 0.0 : 1.0 / z; }
        vec3 nrm(vec2 uv) { return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float depthEdge(vec2 o, float c) {
          float l = inv(vUv - vec2(o.x, 0.0)), r = inv(vUv + vec2(o.x, 0.0));
          float d = inv(vUv - vec2(0.0, o.y)), u = inv(vUv + vec2(0.0, o.y));
          float zmax = max(max(max(c, l), max(r, d)), u);
          float lap = (abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c)) / max(zmax, 1e-7);
          return smoothstep(0.012, 0.03, lap);
        }
        void main() {
          vec4 base = texture2D(tColor, vUv);
          if (base.a < 0.01) { gl_FragColor = vec4(paper, 1.0); return; }
          vec3 col = base.rgb;
          float c = inv(vUv);
          float dist = 1.0 / max(c, 1e-7);

          // --- ambient occlusion: pairwise 1/z test (planes give exactly zero)
          float ao = 0.0;
          float rpx = clamp(3.2 * focal / dist, 2.0, 28.0);
          float rot = hash(gl_FragCoord.xy + seed) * 6.2831;
          for (int k = 0; k < 4; k++) {
            float a = rot + float(k) * 0.7854;
            float rr = rpx * (0.45 + 0.55 * fract(float(k) * 0.618 + rot));
            vec2 o = vec2(cos(a), sin(a)) * rr * texel;
            float ia = inv(vUv + o), ib = inv(vUv - o);
            if (ia <= 0.0 || ib <= 0.0) continue;
            float zm = 2.0 / (ia + ib);
            float dz = dist - zm;            // >0 when the pair is in front → concave crease
            ao += smoothstep(0.15, 1.6, dz) * (1.0 - smoothstep(10.0, 35.0, dz));
          }
          ao = ao / 4.0;
          col = mix(col, col * vec3(0.70, 0.70, 0.86), ao * 0.75);

          // --- ink lines: thicker silhouettes from depth, finer creases from normals
          vec2 o1 = texel * px;
          float de = depthEdge(o1 * 1.3, c);
          vec3 nc = nrm(vUv);
          float nd = 0.0;
          nd = max(nd, 1.0 - dot(nc, nrm(vUv - vec2(o1.x, 0.0))));
          nd = max(nd, 1.0 - dot(nc, nrm(vUv + vec2(o1.x, 0.0))));
          nd = max(nd, 1.0 - dot(nc, nrm(vUv - vec2(0.0, o1.y))));
          nd = max(nd, 1.0 - dot(nc, nrm(vUv + vec2(0.0, o1.y))));
          float ne = smoothstep(0.16, 0.42, nd) * 0.8;
          float fade = mix(0.9, 0.35, smoothstep(1200.0, 7000.0, dist));
          float edge = max(de, ne) * fade * inkOn;

          // --- grade: gentle warmth + saturation
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(lum), col, 1.12);
          col = col * vec3(1.03, 1.0, 0.96) + vec3(0.012, 0.008, 0.02);
          // ink takes on a darker version of the local colour
          vec3 ink = mix(inkColor * 0.5, col * 0.28, 0.45);
          col = mix(col, ink, edge);
          // --- atmospheric haze
          col = mix(col, haze, smoothstep(4000.0, 26000.0, dist) * 0.3);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.accMat = new THREE.ShaderMaterial({
      uniforms: { tNew: { value: null }, tOld: { value: null }, w: { value: 1 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNew, tOld; uniform float w; varying vec2 vUv;
        void main() { gl_FragColor = mix(texture2D(tOld, vUv), texture2D(tNew, vUv), w); }`,
      depthTest: false, depthWrite: false,
    });

    this.outMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 col = texture2D(tSrc, vUv).rgb;
          col += (hash(floor(gl_FragCoord.xy * 0.5)) - 0.5) * 0.014;
          gl_FragColor = vec4(max(col, 0.0), 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene();
    this.qScene.add(this.quad);
    this.qCam = new THREE.Camera();
  }

  setClipping(planes) { this.normalMat.clippingPlanes = planes; }

  setSize(w, h, dpr) {
    const W = Math.floor(w * dpr), H = Math.floor(h * dpr);
    this.size = [W, H];
    for (const rt of [this.colorRT, this.normalRT, this.compRT, ...this.acc]) rt.setSize(W, H);
    this.compMat.uniforms.texel.value.set(1 / W, 1 / H);
    this.compMat.uniforms.px.value = Math.max(1, dpr * 0.85);
    this.reset();
  }

  reset() { this.frame = 0; }
  get converged() { return this.frame >= this.maxSamples; }

  _pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.qScene, this.qCam);
  }

  // live: scene is animating → exponential blend instead of converging average
  render(scene, camera, live = false) {
    const r = this.r;
    const [W, H] = this.size;
    const n = this.frame;
    const u = this.compMat.uniforms;
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.focal.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    u.inkOn.value = this.ink ? 1 : 0;
    u.seed.value = (n * 7.13) % 97;

    // sub-pixel jitter (none on the first frame after a camera move)
    if (n > 0) {
      const [jx, jy] = JITTER[n % JITTER.length];
      camera.setViewOffset(W, H, jx, jy, W, H);
    }

    const bg = scene.background;
    scene.background = null;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.colorRT);
    r.clear();
    r.render(scene, camera);
    if (this.ink) {
      scene.overrideMaterial = this.normalMat;
      r.setRenderTarget(this.normalRT);
      r.clear();
      r.render(scene, camera);
      scene.overrideMaterial = null;
    }
    scene.background = bg;
    if (n > 0) camera.clearViewOffset();

    this._pass(this.compMat, this.compRT);

    const w = n === 0 ? 1 : live ? Math.max(1 / (n + 1), this.liveBlend) : 1 / (n + 1);
    const [src, dst] = this.acc;
    this.accMat.uniforms.tNew.value = this.compRT.texture;
    this.accMat.uniforms.tOld.value = src.texture;
    this.accMat.uniforms.w.value = w;
    this._pass(this.accMat, dst);
    this.acc = [dst, src];

    this.outMat.uniforms.tSrc.value = dst.texture;
    this._pass(this.outMat, null);
    this.frame++;
  }
}
