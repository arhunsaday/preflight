'use client';

import { useEffect, useRef } from 'react';

/**
 * Hero sky. OriginKit "Cloud Sky" (light theme) and "Cloud Sky 3" (dark theme),
 * both on their base preset, ported from the components as shipped
 * (npx originkit@latest add cloud-sky / cloud-sky-03) to one plain canvas that
 * follows the site theme. Light clouds drift on their own; at night the cursor
 * adds the component's parallax and wind. Paused off screen and in hidden tabs;
 * one still frame when the visitor prefers reduced motion.
 */
const OK = { PUFF_UP: 0.34, PUFF_DOWN: 0.19, ERODE: 0.7, SHADOW_STEP: 0.085, NEAR_CELL: 1.05, FAR_CELL: 2.15, FAR_MIX: 0.55,
  NEAR_DRIFT: 0.055, FAR_DRIFT: 0.026, CIRRUS_DRIFT: 0.014, PUFF_WMAX: 2.15, SHADE_BLEND: 12.0, STAR_GRID: 90, MOON_R: 0.045, TWINKLE: 1.2 };
const OK_VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const OK_COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const OK_NOISE = `
vec2 hash22(vec2 p){
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
float hash12(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
vec2 blobs(vec2 uv, float seed){
  vec2 id = floor(uv), f = fract(uv);
  float best = -1e4;
  float wsum = 0.0, ysum = 0.0;
  float wMax = min(${OK.PUFF_WMAX.toFixed(3)}, 0.72 * uSize);
  float reach = min(2.0, ceil(wMax + 0.85) - 1.0);
  for (int j = -2; j <= 2; j++){
    for (int i = -2; i <= 2; i++){
      vec2 o = vec2(float(i), float(j));
      if (max(abs(o.x), abs(o.y)) > reach) continue;
      vec2 h = hash22(id + o + seed);
      if (fract(h.x * 37.1) > uCoverage) continue;
      vec2 c = o + 0.15 + h * 0.7;
      float w = min(${OK.PUFF_WMAX.toFixed(3)}, (0.30 + 0.42 * fract(h.y * 19.7)) * uSize);
      vec2 d = f - c;
      float ry = (d.y > 0.0 ? ${OK.PUFF_UP.toFixed(3)} : ${OK.PUFF_DOWN.toFixed(3)}) * uSize * (0.8 + 0.5 * fract(h.y * 7.3));
      float e = length(vec2(d.x / max(w, 1e-3), d.y / max(ry, 1e-3)));
      float val = 1.0 - e;
      float yN = d.y / max(ry, 1e-3);
      if (val > best){
        float k = exp(${OK.SHADE_BLEND.toFixed(1)} * (best - val));
        wsum = wsum * k + 1.0;
        ysum = ysum * k + yN;
        best = val;
      } else {
        float g = exp(${OK.SHADE_BLEND.toFixed(1)} * (val - best));
        wsum += g;
        ysum += g * yN;
      }
    }
  }
  return vec2(best, ysum / max(wsum, 1e-4));
}
vec2 cloudField(vec2 uv, float seed, float detailScale){
  vec2 b = blobs(uv, seed);
  float n = fbm(uv * detailScale + seed * 3.1) * 0.72
          + fbm(uv * detailScale * 3.3 + seed * 7.7) * 0.28;
  return vec2(b.x - (1.0 - n) * ${OK.ERODE.toFixed(3)}, b.y);
}
`;
const OK_DAY_FS = OK_COMMON + `
uniform vec2 uRes;
uniform float uNearX, uFarX, uCirrusX;
uniform float uCoverage, uSize, uSoftness, uShadow, uCirrus;
uniform vec3 uZenith, uHorizon, uCloud;
uniform vec4 uGlow;
uniform vec2 uSun;
uniform vec2 uParallax;
` + OK_NOISE + `
vec3 shadeCloud(float dyNorm, vec3 sky){
  float t = smoothstep(-0.95, 0.25, dyNorm);
  vec3 base = mix(uCloud * 0.52, sky, 0.34);
  return mix(mix(uCloud, base, uShadow), uCloud, t);
}
void main(){
  vec2 frag = gl_FragCoord.xy / max(uRes.y, 1.0);
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = vec2(frag.x, frag.y);
  vec3 sky = mix(uHorizon, uZenith, smoothstep(-0.15, 1.05, p.y));
  vec2 sunP = vec2(uSun.x * aspect, uSun.y);
  float sd = length(p - sunP);
  sky += uGlow.rgb * uGlow.a * exp(-sd * 3.4) * 0.30;
  vec3 col = sky;
  if (uCirrus > 0.0) {
    vec2 cuv = vec2(p.x * 1.4 + uCirrusX, p.y * 5.5);
    float veil = fbm(cuv) * fbm(cuv * 2.3 + 9.0);
    veil = smoothstep(0.24, 0.55, veil) * smoothstep(0.15, 0.7, p.y);
    col = mix(col, uCloud, veil * uCirrus * 0.5);
  }
  vec2 fuv = vec2(p.x + uFarX, p.y) * ${OK.FAR_CELL.toFixed(3)} + uParallax * 0.4;
  vec2 fd = cloudField(fuv, 17.0, 11.0);
  float fa = clamp(fd.x * uSoftness, 0.0, 1.0);
  if (fa > 0.0) {
    vec3 lit = shadeCloud(fd.y, sky);
    col = mix(col, mix(lit, sky, ${OK.FAR_MIX.toFixed(3)}), fa);
  }
  vec2 nuv = vec2(p.x + uNearX, p.y) * ${OK.NEAR_CELL.toFixed(3)} + uParallax;
  vec2 nd = cloudField(nuv, 3.0, 8.5);
  float na = clamp(nd.x * uSoftness, 0.0, 1.0);
  if (na > 0.0) {
    vec3 lit = shadeCloud(nd.y, sky);
    float above = clamp(cloudField(nuv + vec2(0.0, ${OK.SHADOW_STEP.toFixed(3)}), 3.0, 8.5).x * uSoftness, 0.0, 1.0);
    lit *= 1.0 - 0.18 * uShadow * above;
    lit += uGlow.rgb * uGlow.a * 0.22 * exp(-length(p - sunP) * 1.6);
    col = mix(col, lit, na);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
const OK_NIGHT_FS = OK_COMMON + `
uniform vec2 uRes;
uniform float uNearX, uFarX, uTime;
uniform float uCoverage, uSize, uSoftness, uShadow, uStars;
uniform vec3 uZenith, uHorizon, uCloud;
uniform vec4 uGlow;
uniform vec2 uSun;
uniform vec2 uParallax;
` + OK_NOISE + `
vec3 shadeMoon(float dyNorm, vec3 sky, vec2 p, vec2 moonP, float a){
  float t = smoothstep(-0.95, 0.4, dyNorm);
  vec3 base = mix(uCloud * 0.45, sky, 0.3);
  vec3 body = mix(mix(uCloud, base, uShadow), uCloud, t);
  float d = length(p - moonP);
  vec3 g = uGlow.rgb * uGlow.a;
  body += g * (a * (1.0 - a) * 4.0 * exp(-d * 3.5) * 1.0 + t * exp(-d * 2.2) * 0.12);
  return body;
}
float starField(vec2 p){
  vec2 gp = p * ${OK.STAR_GRID.toFixed(1)};
  vec2 id = floor(gp);
  vec2 f = fract(gp) - 0.5;
  vec2 h = hash22(id + 71.0);
  if (h.x > uStars * 0.5) return 0.0;
  vec2 o = (hash22(id + 13.0) - 0.5) * 0.6;
  float d = length(f - o);
  float s = mix(0.05, 0.16, pow(fract(h.y * 13.1), 3.0));
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + 2.5 * fract(h.x * 91.7)) + h.y * 6.2831);
  return exp(-d * d / (s * s)) * tw * (0.35 + 0.65 * fract(h.y * 5.3));
}
void main(){
  vec2 frag = gl_FragCoord.xy / max(uRes.y, 1.0);
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = vec2(frag.x, frag.y);
  vec3 sky = mix(uHorizon, uZenith, smoothstep(-0.1, 0.9, p.y));
  vec2 moonP = vec2(uSun.x * aspect, uSun.y);
  float md = length(p - moonP);
  vec3 g = uGlow.rgb * uGlow.a;
  float halo = exp(-md * 5.0) * 0.5 + exp(-md * 1.6) * 0.15;
  sky += g * halo;
  vec3 skyBase = sky;
  float st = starField(p + uParallax * 0.08)
           * smoothstep(0.05, 0.45, p.y)
           * (1.0 - clamp(halo * 2.0, 0.0, 1.0));
  sky += vec3(st);
  float disc = 1.0 - smoothstep(${OK.MOON_R.toFixed(4)} - 0.002, ${OK.MOON_R.toFixed(4)} + 0.002, md);
  float maria = 0.82 + 0.18 * fbm((p - moonP) * 40.0 + 3.0);
  sky = mix(sky, mix(uGlow.rgb, vec3(1.0), 0.35) * maria, disc * uGlow.a);
  vec3 col = sky;
  vec2 fuv = vec2(p.x + uFarX, p.y) * ${OK.FAR_CELL.toFixed(3)} + uParallax * 0.4;
  vec2 fd = cloudField(fuv, 17.0, 11.0);
  float fa = clamp(fd.x * uSoftness, 0.0, 1.0);
  if (fa > 0.0) {
    vec3 lit = shadeMoon(fd.y, skyBase, p, moonP, fa);
    col = mix(col, mix(lit, skyBase, ${OK.FAR_MIX.toFixed(3)}), fa);
  }
  vec2 nuv = vec2(p.x + uNearX, p.y) * ${OK.NEAR_CELL.toFixed(3)} + uParallax;
  vec2 nd = cloudField(nuv, 3.0, 8.5);
  float na = clamp(nd.x * uSoftness, 0.0, 1.0);
  if (na > 0.0) {
    vec3 lit = shadeMoon(nd.y, skyBase, p, moonP, na);
    float above = clamp(cloudField(nuv + vec2(0.0, ${OK.SHADOW_STEP.toFixed(3)}), 3.0, 8.5).x * uSoftness, 0.0, 1.0);
    lit *= 1.0 - 0.18 * uShadow * above;
    col = mix(col, lit, na);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

type Preset = {
  zenith: string; horizon: string; cloud: string; glow: string; coverage: number; speed: number; size: number;
  softness: number; shadow: number; sunX: number; sunY: number; parallax: number; wind: number; damping: number;
  cirrus?: number; stars?: number;
};
// The two base presets, resolved the way each component resolves its props.
const DAY: Preset = { zenith: '#0075FF', horizon: '#B4D2F0', cloud: '#FFFFFF', glow: '#FFFFFF', coverage: 1.0, speed: 64 / 50, size: 1.3,
  softness: 4.5 / 2.0, shadow: 0.7, cirrus: 1.0, sunX: 1.0, sunY: 1.0, parallax: 3.0, wind: 3.0, damping: 50 };
const NIGHT: Preset = { zenith: '#050A1A', horizon: '#1C2B4D', cloud: '#2E3850', glow: 'rgba(214, 228, 255, 0.9)', coverage: 0.4, speed: 1.0, size: 1.0,
  stars: 0.4, softness: 4.5, shadow: 1.0, sunX: 0.26, sunY: 0.76, parallax: 1.0, wind: 1.0, damping: 20 };

function rgba(s: string): [number, number, number, number] {
  const t = s.trim();
  if (t[0] === '#') {
    const h = t.slice(1);
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  const m = t.match(/[\d.]+/g) ?? ['255', '255', '255'];
  return [+m[0] / 255, +m[1] / 255, +m[2] / 255, m.length >= 4 ? +m[3] : 1];
}

export function Sky({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!canvas || !gl) return;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('Sky shader:', gl.getShaderInfoLog(s));
      return s;
    };
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const program = (fs: string) => {
      const pr = gl.createProgram()!;
      gl.attachShader(pr, shader(gl.VERTEX_SHADER, OK_VERT));
      gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(pr);
      const locs: Record<string, WebGLUniformLocation | null> = {};
      return {
        pr,
        aPos: gl.getAttribLocation(pr, 'a_pos'),
        u: (n: string) => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(pr, n))),
      };
    };
    const day = program(OK_DAY_FS);
    const night = program(OK_NIGHT_FS);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const host = canvas.parentElement ?? canvas;
    const ptr = { x: 0, y: 0, inside: false };
    let nearX = 0, farX = 0, cirrusX = 0, twinkle = 0, leanX = 0, leanY = 0;
    let raf = 0, last = performance.now(), visible = true;

    const draw = (now: number) => {
      const dark = document.documentElement.classList.contains('dark');
      const v = dark ? NIGHT : DAY;
      const P = dark ? night : day;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // The light sky ignores the cursor; the night sky keeps its parallax and wind.
      const inside = dark && ptr.inside;
      const k = 1 - Math.exp(-v.damping * 0.12 * dt);
      leanX += ((inside ? ptr.x : 0) - leanX) * k;
      leanY += ((inside ? ptr.y : 0) - leanY) * k;
      const rate = v.speed * (1 + leanX * v.wind);
      nearX = (nearX - OK.NEAR_DRIFT * rate * dt) % 1000;
      farX = (farX - OK.FAR_DRIFT * rate * dt) % 1000;
      cirrusX = (cirrusX - OK.CIRRUS_DRIFT * rate * dt) % 1000;
      twinkle = (twinkle + OK.TWINKLE * v.speed * dt) % 6283.185;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(P.pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(P.aPos);
      gl.vertexAttribPointer(P.aPos, 2, gl.FLOAT, false, 0, 0);
      const u = P.u;
      const zen = rgba(v.zenith), hor = rgba(v.horizon), cld = rgba(v.cloud), glow = rgba(v.glow);
      gl.uniform2f(u('uRes'), w, h);
      gl.uniform1f(u('uNearX'), nearX);
      gl.uniform1f(u('uFarX'), farX);
      if (dark) {
        gl.uniform1f(u('uTime'), twinkle);
        gl.uniform1f(u('uStars'), v.stars ?? 0.4);
      } else {
        gl.uniform1f(u('uCirrusX'), cirrusX);
        gl.uniform1f(u('uCirrus'), v.cirrus ?? 0.45);
      }
      gl.uniform1f(u('uCoverage'), v.coverage);
      gl.uniform1f(u('uSize'), v.size);
      gl.uniform1f(u('uSoftness'), v.softness);
      gl.uniform1f(u('uShadow'), v.shadow);
      gl.uniform2f(u('uSun'), v.sunX, v.sunY);
      gl.uniform2f(u('uParallax'), -leanX * v.parallax * 0.07, -leanY * v.parallax * 0.05);
      gl.uniform3f(u('uZenith'), zen[0], zen[1], zen[2]);
      gl.uniform3f(u('uHorizon'), hor[0], hor[1], hor[2]);
      gl.uniform3f(u('uCloud'), cld[0], cld[1], cld[2]);
      gl.uniform4f(u('uGlow'), glow[0], glow[1], glow[2], glow[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (!reduce.matches && !document.hidden && visible) raf = requestAnimationFrame(loop);
      else draw(last);
    };

    const track = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = 1 - ((e.clientY - r.top) / r.height) * 2;
      ptr.inside = true;
    };
    const leave = () => {
      ptr.inside = false;
    };
    host.addEventListener('pointermove', track);
    host.addEventListener('pointerleave', leave);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      start();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => draw(performance.now()));
    ro.observe(canvas);
    const mo = new MutationObserver(() => draw(performance.now()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    reduce.addEventListener('change', start);
    document.addEventListener('visibilitychange', start);
    start();

    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', track);
      host.removeEventListener('pointerleave', leave);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      reduce.removeEventListener('change', start);
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
