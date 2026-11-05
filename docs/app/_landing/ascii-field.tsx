'use client';

import { useEffect, useRef } from 'react';

/**
 * Animated ASCII backdrop: a banking horizon over a perspective ground, a
 * radar sweep with range rings and four blips. Drawn on one canvas at ~15 fps,
 * paused when off screen or in a hidden tab, and a single still frame when the
 * visitor prefers reduced motion.
 */
const RAMP = ' .,:;-=+*#%@';
const CW = 9; // cell width in CSS px
const CH = 17; // cell height in CSS px
const FPS = 15;
const BLIPS = [
  { a: 0.9, r: 0.55 },
  { a: 2.5, r: 0.78 },
  { a: 3.9, r: 0.38 },
  { a: 5.3, r: 0.66 },
];

export function AsciiField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let ink = '15,94,102';
    let beacon = '217,115,26';
    let raf = 0;
    let last = 0;
    let visible = true;
    let t0 = performance.now();

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
      ctx.font = `${CH - 5}px ${getComputedStyle(canvas).fontFamily}`;
      ctx.textBaseline = 'top';
      readColors();
      draw(performance.now());
    };

    const draw = (now: number) => {
      const t = reduce.matches ? 7 : (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      const bank = Math.tan(0.09 * Math.sin(t * 0.13));
      const hy = h * 0.66 + 10 * Math.sin(t * 0.21);
      const rx = w * (w < 760 ? 0.5 : 0.74);
      const ry = h * (w < 760 ? 0.3 : 0.42);
      const R = Math.min(w * (w < 760 ? 0.46 : 0.28), h * 0.42);
      const sweep = t * 0.55;
      const TAU = Math.PI * 2;

      // Six intensity buckets so one fillStyle covers many glyphs.
      const buckets: string[][] = [[], [], [], [], [], []];

      for (let j = 0; j < rows; j++) {
        const v = j * CH + CH / 2;
        for (let i = 0; i < cols; i++) {
          const u = i * CW + CW / 2;
          let val = 0;

          // Horizon, ground texture, sky drift.
          const d = v - hy - (u - w / 2) * bank;
          if (Math.abs(d) < CH * 0.55) val = 0.8;
          else if (d > 0) {
            const s = (u - w / 2) / (d + 70);
            const f = Math.abs(((s * 7 + t * 0.04) % 1) - 0.5);
            val = f < 0.04 ? 0.3 : 0.1 + 0.06 * Math.sin(d * 0.07 - t * 0.5);
          } else {
            const n =
              Math.sin(u * 0.031 + t * 0.2) *
              Math.sin(v * 0.047 - t * 0.13) *
              Math.sin((u + v) * 0.013 + t * 0.07);
            val = n > 0.55 ? 0.18 : 0;
            // Pitch ladder ticks above the horizon.
            const k = -d / 54;
            if (k > 0.9 && k < 4.2 && Math.abs(k - Math.round(k)) < 0.05 && Math.abs(u - w * 0.28) < 38)
              val = 0.45;
          }

          // Radar.
          const dx = u - rx;
          const dy = (v - ry) * 1.0;
          const r = Math.hypot(dx, dy);
          if (r < R) {
            const ang = Math.atan2(dy, dx);
            const diff = (((sweep - ang) % TAU) + TAU) % TAU;
            const trail = Math.exp(-diff * 1.5) * (0.35 + 0.65 * (1 - r / R));
            if (trail > val) val = trail * 0.9;
            const ring = (r / R) * 3;
            if (Math.abs(ring - Math.round(ring)) < 0.5 * (CH / R) * 3 && val < 0.4) val = Math.max(val, 0.28);
            if ((Math.abs(dx) < CW * 0.55 || Math.abs(dy) < CH * 0.55) && val < 0.3) val = 0.22;
          }

          if (val < 0.06) continue;
          const idx = Math.min(RAMP.length - 1, Math.floor(val * (RAMP.length - 1) + 0.5));
          if (idx < 1) continue;
          buckets[Math.min(5, Math.floor((idx / (RAMP.length - 1)) * 6))].push(
            RAMP[idx],
            String(i * CW),
            String(j * CH),
          );
        }
      }

      for (let b = 0; b < 6; b++) {
        const list = buckets[b];
        ctx.fillStyle = `rgba(${ink},${0.26 + b * 0.14})`;
        for (let k = 0; k < list.length; k += 3) ctx.fillText(list[k], +list[k + 1], +list[k + 2]);
      }

      // Blips light up as the sweep passes, in beacon orange.
      ctx.fillStyle = `rgb(${beacon})`;
      for (const p of BLIPS) {
        const diff = (((sweep - p.a) % TAU) + TAU) % TAU;
        const glow = Math.exp(-diff * 0.9);
        if (glow < 0.12) continue;
        const bx = Math.round((rx + Math.cos(p.a) * p.r * R) / CW) * CW;
        const by = Math.round((ry + Math.sin(p.a) * p.r * R) / CH) * CH;
        ctx.globalAlpha = Math.min(1, glow + 0.1);
        ctx.fillText(glow > 0.6 ? '@' : '*', bx, by);
      }
      ctx.globalAlpha = 1;
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
