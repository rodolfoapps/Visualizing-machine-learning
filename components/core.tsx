"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { C, glyph, mix, stageInfo, type Pt, type Spec } from "@/lib/stage";

// ---------- Scene plumbing ----------

type Ctx = {
  active: string;
  rev: number; // bumps when the stage is resized
  publish: (spec: Spec) => void;
  playing: string | null;
  toggleAudio: (src: string) => void;
};

export const StageCtx = createContext<Ctx>({
  active: "hero",
  rev: 0,
  publish: () => {},
  playing: null,
  toggleAudio: () => {},
});

export const useStageCtx = () => useContext(StageCtx);

/** Hand the stage what to draw for this scene. */
export function useScene(spec: Spec) {
  const { publish } = useContext(StageCtx);
  useEffect(() => {
    publish(spec);
  }, [spec, publish]);
}

export function Scene({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const { active } = useContext(StageCtx);
  return (
    <section id={id} data-scene={id} className={`scene ${className} ${active === id ? "is-active" : ""}`}>
      {children}
    </section>
  );
}

// ---------- UI kit ----------

export function Card({
  n,
  q,
  title,
  children,
}: {
  n?: string;
  q?: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      {(n || q) && (
        <div className="eyebrow">
          {n && <span className="eyebrow-n">{n}</span>}
          {q && <span>{q}</span>}
        </div>
      )}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <output>{fmt ? fmt(value) : value}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--p" as string]: pct + "%" }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  wrap,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  return (
    <div className={`seg ${wrap ? "seg-wrap" : ""}`} role="group">
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={o.v === value} className={o.v === value ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="stats">{children}</div>;
}

export function Stat({ label, value, tone = "ice", sub }: { label: string; value: ReactNode; tone?: "ice" | "mint" | "coral" | "amber" | "violet"; sub?: string }) {
  return (
    <div className={`stat tone-${tone}`}>
      <span className="stat-v">{value}</span>
      <span className="stat-l">{label}</span>
      {sub && <span className="stat-s">{sub}</span>}
    </div>
  );
}

export function Formula({ children }: { children: ReactNode }) {
  return <div className="formula">{children}</div>;
}

export function Note({ children, kind = "watch" }: { children: ReactNode; kind?: "watch" | "say" }) {
  return (
    <p className={`note note-${kind}`}>
      <span>{kind === "watch" ? "Watch-out" : "In plain words"}</span>
      {children}
    </p>
  );
}

export function Listen({ src, secs }: { src: string; secs: number }) {
  const { playing, toggleAudio } = useContext(StageCtx);
  const on = playing === src;
  return (
    <button type="button" className={`listen ${on ? "on" : ""}`} onClick={() => toggleAudio(src)} aria-pressed={on}>
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {on ? "Pause narration" : `Listen · 0:${String(secs).padStart(2, "0")}`}
    </button>
  );
}

// ---------- Chapter openers: the particles spell the chapter number ----------

export function Chapter({
  id,
  num,
  kicker,
  title,
  lead,
  audio,
  secs,
  children,
}: {
  id: string;
  num: string;
  kicker: string;
  title: ReactNode;
  lead: string;
  audio: string;
  secs: number;
  children?: ReactNode;
}) {
  const { rev } = useContext(StageCtx);
  const [spec, setSpec] = useState<Spec>({ id, pts: [] });
  useEffect(() => {
    const g = glyph(num, 500);
    const ax = stageInfo.aspect;
    const size = stageInfo.mobile ? 0.92 : 0.86;
    const pts: Pt[] = g.map(([x, y], i) => ({
      x: 0.5 + (x * size) / ax,
      y: 0.5 + y * size,
      c: mix(mix(C.violet, C.ice, Math.min(1, (y + 0.5) * 1.4)), C.mint, Math.max(0, y + 0.1) * 1.3),
      a: 0.55 + 0.4 * ((i * 7919) % 100) / 100,
      s: 1.5 + ((i * 31) % 10) / 6,
    }));
    setSpec({ id, pts });
  }, [id, num, rev]);
  useScene(spec);
  return (
    <Scene id={id} className="scene-chapter">
      <div className="chapter">
        <div className="chapter-k">
          <span>Chapter {num.padStart(2, "0")}</span>
          {kicker}
        </div>
        <h2>{title}</h2>
        <p className="lead">{lead}</p>
        <Listen src={audio} secs={secs} />
        {children}
      </div>
    </Scene>
  );
}

/** Animate a number toward its target, for readouts that should glide. */
export function useGlide(target: number, ms = 500) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      from.current = cur;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
