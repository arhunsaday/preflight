'use client';

import { useEffect, useRef } from 'react';

/**
 * Braille logo flyover over the hero sky: the Preflight airliner from
 * assets/brand/icon.svg, rasterised every frame and set in braille (2x4 dots
 * per character), banking gently over drifting cloud with contrails and the
 * orange wing-tip beacon. Drawn on one canvas at ~24 fps, paused when off
 * screen or in a hidden tab, and a single still frame when the visitor
 * prefers reduced motion.
 */
const CW = 9; // cell width in CSS px
const CH = 17; // cell height in CSS px
const SX = 2; // braille dots across a cell
const SY = 4; // ...and down
const FPS = 24;
const BR = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];
const BAYER = [
  [0, 4],
  [6, 2],
  [1, 5],
  [7, 3],
];
const PLANE =
  'M0 -340 C34 -340 46 -300 46 -255 L46 -80 L340 70 L340 135 L46 55 L46 205 L135 275 L135 318 L0 288 L-135 318 L-135 275 L-46 205 L-46 55 L-340 135 L-340 70 L-46 -80 L-46 -255 C-46 -300 -34 -340 0 -340 Z';

function hash(i: number, j: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x: number, y: number) =>
  0.5 * vnoise(x, y) + 0.3 * vnoise(x * 2.03 + 17, y * 2.03 + 5) + 0.2 * vnoise(x * 4.1 + 3, y * 4.1 + 11);
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function AsciiField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const plane = new Path2D(PLANE);
    const oa = document.createElement('canvas');
    const ob = document.createElement('canvas');
    const a = oa.getContext('2d', { willReadFrequently: true })!;
    const b = ob.getContext('2d', { willReadFrequently: true })!;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0, h = 0, cols = 0, rows = 0, bw = 0, bh = 0;
    let ink = '16,44,84';
    let beacon = '201,98,14';
    let font = '';
    let raf = 0, last = 0, visible = true;
    let t0 = performance.now();
    let val = new Float32Array(0);
    let tag = new Uint8Array(0);

    const readColors = () => {
      const s = getComputedStyle(canvas);
      ink = s.getPropertyValue('--ascii-ink').trim() || ink;
      beacon = s.getPropertyValue('--ascii-beacon').trim() || beacon;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CW);
      rows = Math.ceil(h / CH);
      bw = cols * SX;
      bh = rows * SY;
      oa.width = ob.width = Math.max(1, bw);
      oa.height = ob.height = Math.max(1, bh);
      val = new Float32Array(bw * bh);
      tag = new Uint8Array(bw * bh);
      font = `15px ${getComputedStyle(canvas).fontFamily}`;
      readColors();
      draw(performance.now());
    };

    // Light a round patch of dots in the beacon colour.
    const beaconAt = (x: number, y: number, r: number, v: number) => {
      const sx = CW / SX, sy = CH / SY, rr = Math.max(r, sx * 0.6);
      const i0 = Math.max(0, Math.floor((x - rr) / sx)), i1 = Math.min(bw - 1, Math.floor((x + rr) / sx));
      const j0 = Math.max(0, Math.floor((y - rr) / sy)), j1 = Math.min(bh - 1, Math.floor((y + rr) / sy));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot((i + 0.5) * sx - x, (j + 0.5) * sy - y);
          if (d > rr) continue;
          const k = j * bw + i, m = v * (1 - 0.55 * (d / rr));
          if (m > val[k] * 0.6) {
            val[k] = Math.max(val[k], m);
            tag[k] = 1;
          }
        }
    };

    const field = (t: number, still: boolean) => {
      const sx = CW / SX, sy = CH / SY;
      const narrow = w < 760;
      const S = Math.min(narrow ? w * 0.62 : w * 0.4, h * 0.82) / 700;
      const cx = w * (narrow ? 0.62 : 0.73) + 7 * Math.sin(t * 0.7);
      const cy = h * (narrow ? 0.3 : 0.46) + 5 * Math.sin(t * 0.9);
      const roll = Math.cos(0.22 * Math.sin(t * 0.5)); // wings foreshorten as it rolls
      const rot = Math.PI / 4;
      const place = (g: CanvasRenderingContext2D, ox: number, oy: number) => {
        g.setTransform(1 / sx, 0, 0, 1 / sy, 0, 0);
        g.translate(cx + ox, cy + oy);
        g.rotate(rot);
        g.scale(S * roll, S);
      };
      a.setTransform(1, 0, 0, 1, 0, 0);
      a.clearRect(0, 0, bw, bh);
      place(a, 0, 0);
      const gr = a.createLinearGradient(-340, -200, 340, 200);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.55, '#d0d0d0');
      gr.addColorStop(1, '#808080');
      a.fillStyle = gr;
      a.fill(plane);
      a.strokeStyle = '#6a6a6a';
      a.lineWidth = 10;
      a.beginPath();
      a.moveTo(0, -250);
      a.lineTo(0, 260);
      a.stroke();
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, bw, bh);
      b.filter = `blur(${Math.max(1, 14 / sx)}px)`;
      place(b, 70 * S * 1.4, 95 * S * 1.4);
      b.fillStyle = '#000';
      b.fill(plane);
      b.filter = 'none';
      const A = a.getImageData(0, 0, bw, bh).data;
      const B = b.getImageData(0, 0, bw, bh).data;
      const c = Math.cos(rot), s = Math.sin(rot);
      for (let j = 0; j < bh; j++) {
        const v = (j + 0.5) * sy;
        for (let i = 0; i < bw; i++) {
          const u = (i + 0.5) * sx, k = j * bw + i, p = k * 4;
          // cloud below, streaming opposite to the heading, darkened by the plane's shadow
          const n = fbm((u + t * 34) * 0.0042, (v - t * 34) * 0.0042 * 1.6);
          let cl = sstep(0.5, 0.8, n) * 0.48 + sstep(0.62, 0.9, fbm((u + t * 60) * 0.011, (v - t * 60) * 0.011)) * 0.1;
          cl *= 1 - 0.8 * (B[p + 3] / 255);
          // contrails behind the wing
          const dx = u - cx, dy = v - cy;
          const lx = (dx * c + dy * s) / (S * roll), ly = (-dx * s + dy * c) / S;
          let tr = 0;
          if (ly > 120) {
            const L = ly - 120, wd = 6 + 0.035 * L;
            const wob = 14 * Math.sin(ly * 0.012 - t * 2.2) * Math.min(1, L / 900);
            const e = Math.abs(lx) - 205 - wob;
            tr = Math.exp(-(e * e) / (2 * wd * wd)) * Math.exp(-L / 760) * sstep(0, 80, L) * 0.75;
          }
          const al = A[p + 3] / 255;
          val[k] = Math.max(cl, tr) * (1 - al) + (0.42 + 0.58 * (A[p] / 255)) * al;
          tag[k] = 0;
        }
      }
      // beacon on the right wing tip
      const bx = 340 * S * roll, by = 102 * S;
      const ph = (t % 1.5) / 1.5;
      const flash = still ? 1 : ph < 0.1 ? 1 : ph < 0.2 ? 0.3 : ph < 0.3 ? 0.85 : 0;
      const X = cx + bx * c - by * s, Y = cy + bx * s + by * c;
      beaconAt(X, Y, 6, 0.85);
      if (flash > 0) beaconAt(X, Y, 30 * flash, 0.5 * flash);
    };

    const draw = (now: number) => {
      if (!bw || !bh) return;
      const still = reduce.matches;
      field(still ? 7 : (now - t0) / 1000, still);
      ctx.clearRect(0, 0, w, h);
      ctx.font = font;
      ctx.textBaseline = 'top';
      // Twelve buckets (two colours, six levels) so one fillStyle covers many glyphs.
      const buckets: (string | number)[][] = Array.from({ length: 12 }, () => []);
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          let bits = 0, sum = 0, on = 0, bc = 0;
          for (let yy = 0; yy < SY; yy++)
            for (let xx = 0; xx < SX; xx++) {
              const k = (j * SY + yy) * bw + i * SX + xx;
              const v = val[k];
              if (v > 0.07 + (BAYER[yy][xx] / 8) * 0.55) {
                bits |= BR[yy][xx];
                sum += v;
                on++;
              }
              if (tag[k]) bc = 1;
            }
          if (!bits) continue;
          const lvl = Math.min(5, Math.floor((sum / on) * 6));
          buckets[bc * 6 + lvl].push(String.fromCharCode(0x2800 + bits), i * CW, j * CH);
        }
      for (let q = 0; q < 12; q++) {
        const list = buckets[q];
        if (!list.length) continue;
        ctx.fillStyle = q >= 6 ? `rgb(${beacon})` : `rgba(${ink},${0.24 + (q % 6) * 0.15})`;
        for (let k = 0; k < list.length; k += 3) ctx.fillText(list[k] as string, list[k + 1] as number, list[k + 2] as number);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || now - last < 1000 / FPS) return;
      last = now;
      draw(now);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (!reduce.matches && !document.hidden && visible) raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      start();
    });
    io.observe(canvas);
    const mo = new MutationObserver(() => {
      readColors();
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    const onMotion = () => {
      t0 = performance.now();
      draw(t0);
      start();
    };
    reduce.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', start);
    resize();
    start();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      reduce.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
