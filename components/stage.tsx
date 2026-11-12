"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { C, rgba, stageInfo, type RGB, type Spec, type View } from "@/lib/stage";

const N = 500;
const BASES: RGB[] = [C.ice, C.ice, C.mint, C.violet, C.sky, C.ice];

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  a: number;
  s: number;
  k: number;
  delay: number;
  base: RGB;
  ph: number;
};

export function layoutRect(W: number, H: number) {
  const mobile = W < 900;
  if (mobile) {
    const x0 = 46;
    const y0 = 78;
    return { mobile, x0, y0, w: W - x0 - 20, h: Math.max(120, H * 0.43 - y0 - 40) };
  }
  const left = Math.max(28, W * 0.05);
  const cardW = Math.min(480, Math.max(390, W * 0.34));
  const x0 = left + cardW + 96;
  const x1 = W - Math.max(64, W * 0.06);
  const y0 = Math.max(110, H * 0.17);
  const y1 = H - Math.max(96, H * 0.15);
  return { mobile, x0, y0, w: Math.max(200, x1 - x0), h: Math.max(200, y1 - y0) };
}

export function Stage({ specRef, onResize }: { specRef: MutableRefObject<Spec>; onResize: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext("2d")!;
    const tipEl = tipRef.current!;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let rect = layoutRect(1200, 800);
    const cs = getComputedStyle(document.documentElement);
    const fam = (v: string, fb: string) => (cs.getPropertyValue(v).trim() || fb) + ", " + fb;
    const fonts = {
      sans: fam("--font-geist-sans", "system-ui, sans-serif"),
      mono: fam("--font-geist-mono", "ui-monospace, monospace"),
      serif: "'Instrument Serif', Georgia, serif",
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      rect = layoutRect(W, H);
      const changed = stageInfo.mobile !== rect.mobile || Math.abs(stageInfo.aspect - rect.w / rect.h) > 0.02;
      stageInfo.aspect = rect.w / rect.h;
      stageInfo.mobile = rect.mobile;
      if (changed) onResize();
    };
    resize();
    window.addEventListener("resize", resize);

    const ps: P[] = [];
    for (let i = 0; i < N; i++) {
      const base = BASES[i % BASES.length];
      ps.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0,
        vy: 0,
        r: base[0],
        g: base[1],
        b: base[2],
        a: 0,
        s: 1.6,
        k: 0.05 + Math.random() * 0.06,
        delay: Math.random() * 0.8,
        base,
        ph: Math.random() * 6.28,
      });
    }

    // soft glowing dot sprites, cached by (quantised) colour
    const sprites = new Map<number, HTMLCanvasElement>();
    const sprite = (r: number, gr: number, b: number) => {
      const key = ((r >> 3) << 10) | ((gr >> 3) << 5) | (b >> 3);
      let c = sprites.get(key);
      if (!c) {
        if (sprites.size > 600) sprites.clear();
        c = document.createElement("canvas");
        c.width = c.height = 64;
        const x = c.getContext("2d")!;
        const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        const col = `${r | 0},${gr | 0},${b | 0}`;
        grad.addColorStop(0, `rgba(${col},1)`);
        grad.addColorStop(0.2, `rgba(${col},1)`);
        grad.addColorStop(0.27, `rgba(${col},0.34)`);
        grad.addColorStop(0.55, `rgba(${col},0.1)`);
        grad.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = grad;
        x.fillRect(0, 0, 64, 64);
        sprites.set(key, c);
      }
      return c;
    };

    const mouse = { x: -999, y: -999, inside: false, moved: false };
    let hover = -1;
    const blocked = (e: Event) => !!(e.target as Element)?.closest?.(".card, button, a, input, .topbar, .rail");
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.inside = !blocked(e);
      mouse.moved = true;
    };
    const onLeave = () => {
      mouse.inside = false;
      mouse.moved = true;
    };
    const onClick = (e: MouseEvent) => {
      if (blocked(e)) return;
      const spec = specRef.current;
      if (!spec.pick) return;
      const i = nearest(e.clientX, e.clientY, 22);
      if (i >= 0) spec.pick(i);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("click", onClick);

    const nearest = (mx: number, my: number, maxD: number) => {
      const spec = specRef.current;
      let best = -1;
      let bd = maxD * maxD;
      const n = Math.min(N, spec.pts.length);
      for (let i = 0; i < n; i++) {
        if ((spec.pts[i].a ?? 0.85) < 0.2) continue;
        const dx = ps[i].x - mx;
        const dy = ps[i].y - my;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    };

    let lastId = "";
    let fadeStart = 0;
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const spec = specRef.current;
      if (spec.id !== lastId) {
        lastId = spec.id;
        fadeStart = now;
        hover = -1;
        for (const p of ps) {
          p.delay = reduce ? 0 : Math.random() * 0.38;
          if (spec.swarm && !reduce) {
            // release: the dots burst apart before settling into a drift
            p.vx += (Math.random() - 0.5) * 22;
            p.vy += (Math.random() - 0.5) * 22;
          }
        }
      }
      const fade = Math.max(0, Math.min(1, (now - fadeStart - 260) / 520));
      const u = Math.max(0.62, Math.min(1.2, rect.w / 660));
      const v: View = {
        x0: rect.x0,
        y0: rect.y0,
        w: rect.w,
        h: rect.h,
        W,
        H,
        u,
        t,
        mobile: rect.mobile,
        X: (n) => rect.x0 + n * rect.w,
        Y: (n) => rect.y0 + (1 - n) * rect.h,
        ...fonts,
      };

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);

      if (spec.under && fade > 0) {
        g.save();
        g.globalAlpha = fade;
        spec.under(g, v);
        g.restore();
      }

      const swarm = !!spec.swarm;
      const step = dt * 60;
      const n = spec.pts.length;
      for (let i = 0; i < N; i++) {
        const p = ps[i];
        const pt = i < n ? spec.pts[i] : null;
        if (pt) {
          if (p.delay > 0) {
            p.delay -= dt;
          } else {
            const tx = v.X(pt.x);
            const ty = v.Y(pt.y);
            if (reduce) {
              p.x = tx;
              p.y = ty;
            } else {
              p.vx = (p.vx + (tx - p.x) * p.k * step) * Math.pow(0.74, step);
              p.vy = (p.vy + (ty - p.y) * p.k * step) * Math.pow(0.74, step);
              p.x += p.vx * step;
              p.y += p.vy * step;
            }
          }
          const e = Math.min(1, 0.12 * step);
          p.r += (pt.c[0] - p.r) * e;
          p.g += (pt.c[1] - p.g) * e;
          p.b += (pt.c[2] - p.b) * e;
          p.a += ((pt.a ?? 0.85) - p.a) * e;
          p.s += ((pt.s ?? 2.5) * u - p.s) * e;
        } else {
          // free drift through a slow flow field
          const ang = Math.sin(p.x * 0.0023 + t * 0.13 + p.ph * 0.2) * Math.cos(p.y * 0.0019 - t * 0.11) * 6.2832;
          const sp = swarm ? 0.05 : 0.02;
          p.vx = (p.vx + Math.cos(ang) * sp * step) * Math.pow(0.965, step);
          p.vy = (p.vy + Math.sin(ang) * sp * step) * Math.pow(0.965, step);
          if (swarm && mouse.inside) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 26000 && d2 > 1) {
              const f = (1 - d2 / 26000) * 0.6;
              const d = Math.sqrt(d2);
              p.vx += (dx / d) * f * step;
              p.vy += (dy / d) * f * step;
            }
          }
          if (!reduce) {
            p.x += p.vx * step;
            p.y += p.vy * step;
          }
          if (p.x < -20) p.x = W + 20;
          if (p.x > W + 20) p.x = -20;
          if (p.y < -20) p.y = H + 20;
          if (p.y > H + 20) p.y = -20;
          const e = Math.min(1, 0.05 * step);
          const ta = swarm ? 0.62 + 0.36 * Math.sin(t * 0.9 + p.ph) : 0;
          p.r += (p.base[0] - p.r) * e;
          p.g += (p.base[1] - p.g) * e;
          p.b += (p.base[2] - p.b) * e;
          p.a += (ta - p.a) * e;
          p.s += ((1.5 + (i % 5) * 0.4) * u - p.s) * e;
        }
      }

      // constellation lines in swarm mode
      if (swarm) {
        g.lineWidth = 1;
        const M = rect.mobile ? 110 : 240;
        for (let i = 0; i < M; i++) {
          const a = ps[i];
          for (let j = i + 1; j < M; j++) {
            const b = ps[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 17000) {
              g.strokeStyle = `rgba(150,172,255,${(1 - d2 / 17000) * 0.32 * Math.min(a.a, b.a)})`;
              g.beginPath();
              g.moveTo(a.x, a.y);
              g.lineTo(b.x, b.y);
              g.stroke();
            }
          }
        }
      }

      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < N; i++) {
        const p = ps[i];
        if (p.a < 0.012) continue;
        const R = p.s * 5;
        g.globalAlpha = Math.min(1, p.a);
        g.drawImage(sprite(p.r, p.g, p.b), p.x - R, p.y - R, R * 2, R * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";

      if (spec.over && fade > 0) {
        g.save();
        g.globalAlpha = fade;
        spec.over(g, v);
        g.restore();
      }

      // hover tooltip
      if (mouse.moved) {
        mouse.moved = false;
        hover = mouse.inside && spec.tip && !rect.mobile ? nearest(mouse.x, mouse.y, 16) : -1;
        const tip = hover >= 0 ? spec.tip!(hover) : null;
        if (tip) {
          tipEl.replaceChildren();
          const h = document.createElement("strong");
          h.textContent = tip.title;
          tipEl.appendChild(h);
          for (const [k, val] of tip.rows) {
            const row = document.createElement("div");
            const a = document.createElement("span");
            a.textContent = k;
            const b = document.createElement("b");
            b.textContent = val;
            row.append(a, b);
            tipEl.appendChild(row);
          }
          tipEl.style.opacity = "1";
        } else {
          hover = -1;
          tipEl.style.opacity = "0";
        }
        document.body.style.cursor = hover >= 0 && spec.pick ? "pointer" : "";
      }
      if (hover >= 0) {
        const p = ps[hover];
        g.strokeStyle = rgba(C.white, 0.9);
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(p.x, p.y, p.s + 5, 0, 6.2832);
        g.stroke();
        const tw = 230;
        const left = p.x + 18 + tw > W ? p.x - 18 - tw : p.x + 18;
        tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.min(H - 220, Math.max(70, p.y - 30)))}px)`;
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("click", onClick);
      document.body.style.cursor = "";
    };
  }, [specRef, onResize]);

  return (
    <>
      <canvas ref={canvasRef} className="stage" aria-hidden="true" />
      <div ref={tipRef} className="tip" role="presentation" />
    </>
  );
}
