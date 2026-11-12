"use client";

import { useMemo, useRef, useState } from "react";
import { BOOK_LINEAR, BOOK_LOGIT, DRIVERS, INDUSTRIES, companies, feat, managers, type Company, type Manager } from "@/lib/data";
import { clamp, corr, kmeans, mean, ols, predictLin, sd, sigmoid } from "@/lib/ml";
import { C, axes, band, blob, fmtSigned, lin, line, mix, ring, rgba, stack, stageInfo, text, type Pt, type Spec, type Tip } from "@/lib/stage";
import { Card, Formula, Note, Scene, Seg, Slider, Stat, Stats, useGlide, useScene, useStageCtx } from "./core";

export const tipCompany = (c: Company): Tip => ({
  title: `${c.id} · ${c.industry}`,
  rows: [
    ["Assessment score", String(c.assess)],
    ["Growth this year", fmtSigned(c.growth) + "%"],
    ["Profit margin", c.margin.toFixed(1) + "%"],
    ["Team turnover", c.turnover.toFixed(1) + "%"],
    ["Owner hours / week", String(c.hours)],
    ["Grew next year", c.grew ? "Yes" : "No"],
  ],
});

export const tipManager = (m: Manager): Tip => ({
  title: `${m.id} · manager`,
  rows: [
    ["Coaching hours / month", String(m.coaching)],
    ["Team review score", m.review.toFixed(1)],
    ["Team engagement", String(m.engagement)],
    ["Years of experience", String(m.experience)],
    ["Team turnover", m.turnover.toFixed(1) + "%"],
    ["Met year-one goals", m.success ? "Yes" : "No"],
  ],
});

/** Small repeatable sideways nudge so stacked dots do not hide each other. */
export const jit = (i: number) => (((i * 2654435761) >>> 0) / 4294967296) * 2 - 1;

export function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

// ---------------------------------------------------------------- 1. The data

export function SceneData() {
  const [mode, setMode] = useState<"f" | "l">("f");
  const grewN = useMemo(() => companies.filter((c) => c.grew).length, []);
  const spec = useMemo<Spec>(() => {
    const order = companies.map((_, i) => i);
    if (mode === "l") order.sort((a, b) => companies[b].grew - companies[a].grew || a - b);
    const pts: Pt[] = new Array(500);
    order.forEach((ci, slot) => {
      pts[ci] = {
        x: ((slot % 25) + 0.5) / 25,
        y: 1 - (Math.floor(slot / 25) + 0.5) / 20,
        c: mode === "l" ? (companies[ci].grew ? C.mint : C.coral) : C.ice,
        s: 2.7,
      };
    });
    return {
      id: "data",
      pts,
      tip: (i) => tipCompany(companies[i]),
      over: (g, v) => {
        text(g, v, mode === "l" ? `${grewN} grew next year` : "500 companies · one dot each", 0, 1.045, { color: rgba(mode === "l" ? C.mint : C.ice, 0.95), size: 13 });
        if (mode === "l") text(g, v, `${500 - grewN} didn't`, 1, 1.045, { color: rgba(C.coral, 0.95), size: 13, align: "right" });
        else if (!v.mobile) text(g, v, "Hover any dot to open its record", 1, 1.045, { color: "rgba(200,210,240,.5)", size: 12, align: "right" });
      },
    };
  }, [mode, grewN]);
  useScene(spec);
  return (
    <Scene id="data">
      <Card n="1.1" q="What does a model learn from?" title="Past examples, not rules.">
        <p>
          An experienced advisor can look at a business and say, &ldquo;this one is heading for trouble.&rdquo; Nobody gave them a rulebook. They learned the pattern from hundreds of
          companies. Machine learning does the same thing with data.
        </p>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { v: "f", label: "Features: what we know" },
            { v: "l", label: "Label: what happened" },
          ]}
        />
        <dl className="defs">
          <div>
            <dt>Feature</dt>
            <dd>A fact we know: an input. &ldquo;Profit margin of 12%.&rdquo;</dd>
          </div>
          <div>
            <dt>Label</dt>
            <dd>The result we want to predict. &ldquo;Grew next year: yes.&rdquo;</dd>
          </div>
          <div>
            <dt>Training</dt>
            <dd>Learning from past cases whose answers are known.</dd>
          </div>
          <div>
            <dt>Predicting</dt>
            <dd>Estimating the answer for a case the model has never seen.</dd>
          </div>
        </dl>
        <Stats>
          <Stat label="companies grew the following year" value={`${Math.round((grewN / 500) * 100)}%`} tone="mint" />
          <Stat label="facts known about each one" value="9" />
        </Stats>
        <Note>A feature must be something we would know at the moment we make the prediction. Using next year&rsquo;s sales to predict next year is checking the answer key.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 1. Three types

export function SceneTypes() {
  const { rev } = useStageCtx();
  const [mode, setMode] = useState<"num" | "yn" | "grp">("num");
  const spec = useMemo<Spec>(() => {
    if (mode === "num") {
      const xs = lin(20, 100);
      const ys = lin(-16, 22);
      return {
        id: "types",
        pts: companies.map((c) => ({ x: xs(c.assess), y: ys(clamp(c.nextGrowth, -16, 22)), c: mix(C.coral, C.mint, clamp((c.nextGrowth + 7) / 14, 0, 1)), s: 2.4 })),
        tip: (i) => tipCompany(companies[i]),
        under: (g, v) => {
          axes(g, v, { xs, xt: [20, 40, 60, 80, 100], xl: "Assessment score this year", ys, yt: [-10, 0, 10, 20], yf: (d) => fmtSigned(d, 0) + "%", yl: "Revenue growth next year" });
          line(g, v, [[0, ys(0)], [1, ys(0)]], "rgba(255,255,255,.25)", 1, [4, 5]);
        },
      };
    }
    if (mode === "yn") {
      const yes = companies.filter((c) => c.grew).length;
      const no = 500 - yes;
      const ry = Math.min(0.45, 0.27 * stageInfo.aspect);
      const rn = ry * Math.sqrt(no / yes);
      const cn = rn / stageInfo.aspect + 0.01;
      const cy = 1 - ry / stageInfo.aspect - 0.01;
      const bn = blob(no, cn, 0.5, rn);
      const by = blob(yes, cy, 0.5, ry);
      let a = 0;
      let b = 0;
      return {
        id: "types",
        pts: companies.map((c) => {
          const p = c.grew ? by[b++] : bn[a++];
          return { x: p[0], y: p[1], c: c.grew ? C.mint : C.coral, s: 2.5 };
        }),
        tip: (i) => tipCompany(companies[i]),
        over: (g, v) => {
          text(g, v, `Didn't grow · ${no}`, cn, 1.02, { align: "center", color: rgba(C.coral, 0.95), size: 14 });
          text(g, v, `Grew · ${yes}`, cy, 1.02, { align: "center", color: rgba(C.mint, 0.95), size: 14 });
        },
      };
    }
    const lr = companies.map((c) => Math.log10(c.revenue));
    const mg = companies.map((c) => c.margin);
    const z = (a: number[]) => {
      const m = mean(a);
      const s = sd(a);
      return a.map((x) => (x - m) / s);
    };
    const zx = z(lr);
    const zy = z(mg);
    const km = kmeans(zx.map((x, i) => [x, zy[i]]), 3, 11);
    const cols = [C.sky, C.amber, C.violet];
    const xs = lin(5.85, 7.65);
    const ys = lin(-6, 28);
    const mx = mean(lr);
    const sx = sd(lr);
    const my = mean(mg);
    const sy = sd(mg);
    return {
      id: "types",
      pts: companies.map((c, i) => ({ x: xs(clamp(lr[i], 5.85, 7.65)), y: ys(clamp(c.margin, -6, 28)), c: cols[km.lab[i]], s: 2.4 })),
      tip: (i) => tipCompany(companies[i]),
      under: (g, v) => {
        axes(g, v, {
          xs,
          xt: [6, Math.log10(2e6), Math.log10(5e6), 7, Math.log10(2e7), Math.log10(4e7)],
          xf: (d) => "$" + Math.round(Math.pow(10, d) / 1e6) + "M",
          xl: "Revenue",
          ys,
          yt: [0, 10, 20],
          yf: (d) => d + "%",
          yl: "Profit margin",
        });
      },
      over: (g, v) => {
        km.cent.forEach((cn, j) => {
          const nx = xs(cn[0] * sx + mx);
          const ny = ys(cn[1] * sy + my);
          ring(g, v, nx, ny, cols[j], 11, false);
          text(g, v, "Group " + "ABC"[j], nx, ny + 0.07, { align: "center", color: rgba(cols[j], 1), size: 13, weight: 600 });
        });
      },
    };
    // rev: blob shapes depend on the stage's aspect ratio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rev]);
  useScene(spec);
  const info = {
    num: ["Regression", "The answer is an amount. “What will this company’s growth be next year?” Each dot is placed by one feature and coloured by the number we want to predict."],
    yn: ["Classification", "The answer is one of two choices: grow or stall, renew or cancel. The model gives a chance, such as 72%, and we decide where to draw the line."],
    grp: ["Clustering", "There is no answer to predict. The model sorts companies into groups that look alike, so each one can be compared with its true peers. These three groups were found live, just now."],
  }[mode];
  return (
    <Scene id="types">
      <Card n="1.2" q="What kind of answer do you need?" title="Three types of prediction.">
        <p>Almost every business prediction is one of three types. Knowing which one you have tells you which formula to reach for.</p>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { v: "num", label: "A number" },
            { v: "yn", label: "Yes or no" },
            { v: "grp", label: "Groups" },
          ]}
        />
        <div className="callout">
          <strong>{info[0]}</strong>
          <p>{info[1]}</p>
        </div>
        <p className="fine">
          The first two learn from cases with known answers: <em>supervised</em> learning, because the labels act like a teacher checking the work. Clustering has no labels:{" "}
          <em>unsupervised</em>.
        </p>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 2.1 z-score

export function SceneZ() {
  const [ind, setInd] = useState("Construction");
  const [test, setTest] = useState(11);
  const calc = useMemo(() => {
    const vals = companies.filter((c) => c.industry === ind).map((c) => c.margin);
    let out = 0;
    for (const d of INDUSTRIES) {
      const v = companies.filter((c) => c.industry === d.name).map((c) => c.margin);
      const m = mean(v);
      const s = sd(v);
      out += v.filter((x) => Math.abs((x - m) / s) > 2).length;
    }
    return { m: mean(vals), s: sd(vals), n: vals.length, out };
  }, [ind]);
  const z = (test - calc.m) / calc.s;
  const spec = useMemo<Spec>(() => {
    const xs = lin(-6, 28);
    const idx = companies.map((c, i) => (c.industry === ind ? i : -1)).filter((i) => i >= 0);
    const st = stack(idx.map((i) => clamp(companies[i].margin, -5.9, 27.9)), 1, -6);
    const maxL = Math.max(...st.map((s) => s.level)) + 1;
    const dy = Math.min(0.05, 0.9 / maxL);
    const pts: Pt[] = companies.map((c) => ({ x: xs(clamp(c.margin, -6, 28)), y: -0.01, c: C.ice, a: 0, s: 2 }));
    idx.forEach((ci, k) => {
      const zi = (companies[ci].margin - calc.m) / calc.s;
      pts[ci] = { x: xs(st[k].x), y: (st[k].level + 0.6) * dy, c: Math.abs(zi) > 2 ? C.amber : C.ice, s: Math.abs(zi) > 2 ? 3.4 : 2.8, a: 0.9 };
    });
    return {
      id: "z",
      pts,
      tip: (i) => {
        const t = tipCompany(companies[i]);
        t.rows.unshift(["z-score (margin)", fmtSigned((companies[i].margin - calc.m) / calc.s, 2)]);
        return t;
      },
      under: (g, v) => {
        band(g, v, xs(calc.m - 2 * calc.s), xs(calc.m + 2 * calc.s), 0, 1, "rgba(156,176,255,.045)");
        band(g, v, xs(calc.m - calc.s), xs(calc.m + calc.s), 0, 1, "rgba(156,176,255,.06)");
        axes(g, v, { xs, xt: [-5, 0, 5, 10, 15, 20, 25], xf: (d) => d + "%", xl: `Profit margin · ${calc.n} ${ind.toLowerCase()} companies` });
        line(g, v, [[xs(calc.m), 0], [xs(calc.m), 1]], "rgba(255,255,255,.4)", 1, [3, 5]);
        text(g, v, "average " + calc.m.toFixed(1) + "%", xs(calc.m), 1.03, { align: "center", size: 11.5, color: "rgba(226,232,255,.7)", font: "mono" });
        for (const k of [-2, -1, 1, 2]) text(g, v, fmtSigned(k, 0) + " SD", xs(calc.m + k * calc.s), 0.965, { align: "center", size: 10.5, color: "rgba(200,210,240,.42)", font: "mono" });
      },
      over: (g, v) => {
        const x = xs(clamp(test, -6, 28));
        line(g, v, [[x, 0], [x, 0.9]], rgba(C.amber, 0.95), 2);
        ring(g, v, x, 0.9, C.amber, 6);
        const right = x > 0.72;
        text(g, v, `${test}% margin → z = ${fmtSigned(z, 2)}`, x + (right ? -0.025 : 0.025), 0.895, { align: right ? "right" : "left", color: rgba(C.amber, 1), size: 13.5, weight: 600 });
      },
    };
  }, [ind, test, calc, z]);
  useScene(spec);
  const az = Math.abs(z);
  const dir = z >= 0 ? "above" : "below";
  const verdict = az < 0.4 ? "Right around average." : az < 1.2 ? `Solidly ${dir} average, but common.` : az < 2 ? `Well ${dir} the group, but not unusual.` : `Unusual: worth a closer look.`;
  return (
    <Scene id="z">
      <Card n="2.1" q="How does this compare to normal?" title="Mean, standard deviation and z-score.">
        <p>
          The <b>mean</b> is the middle of the group. The <b>standard deviation</b> is how far numbers usually sit from it. The <b>z-score</b> says how many standard deviations one case
          sits above or below.
        </p>
        <Formula>
          z = (value − mean) ÷ standard deviation
        </Formula>
        <Seg wrap value={ind} onChange={setInd} options={INDUSTRIES.map((d) => ({ v: d.name, label: d.name }))} />
        <Slider label="A company’s profit margin" value={test} min={-4} max={26} step={0.5} onChange={setTest} fmt={(v) => v + "%"} />
        <Stats>
          <Stat label="z-score in this peer group" value={fmtSigned(z, 2)} tone={az >= 2 ? "amber" : "ice"} sub={verdict} />
          <Stat label="peer average ± SD" value={`${calc.m.toFixed(1)} ± ${calc.s.toFixed(1)}`} />
        </Stats>
        <Note kind="say">
          The same 11% margin is strong in construction and weak in professional services. Always compare within a fair peer group. Across all six industries, {calc.out} of 500 companies (
          {((calc.out / 500) * 100).toFixed(1)}%) sit more than two standard deviations from their peers, about the 5% a bell shape predicts. They glow amber.
        </Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 2.2 Correlation

type Pair = { k: string; ds: "c" | "m"; label: string; unit: string };
const PAIRS: Pair[] = [
  { k: "assess", ds: "c", label: "Assessment score", unit: "" },
  { k: "growth", ds: "c", label: "Growth this year", unit: "%" },
  { k: "margin", ds: "c", label: "Profit margin", unit: "%" },
  { k: "turnover", ds: "c", label: "Team turnover", unit: "%" },
  { k: "hours", ds: "c", label: "Owner hours", unit: "" },
  { k: "years", ds: "c", label: "Years in business", unit: "" },
  { k: "employees", ds: "c", label: "Employees", unit: "" },
  { k: "coaching", ds: "m", label: "Coaching hours", unit: "" },
  { k: "review", ds: "m", label: "Review score", unit: "" },
  { k: "experience", ds: "m", label: "Years of experience", unit: "" },
];

export function SceneCorr() {
  const [k, setK] = useState("coaching");
  const pair = PAIRS.find((p) => p.k === k)!;
  const calc = useMemo(() => {
    const isC = pair.ds === "c";
    const xv = isC ? companies.map((c) => (c as unknown as Record<string, number>)[pair.k]) : managers.map((m) => (m as unknown as Record<string, number>)[pair.k]);
    const yv = isC ? companies.map((c) => c.nextGrowth) : managers.map((m) => m.engagement);
    const xcap = pair.k === "employees" ? xv.map((x) => Math.min(x, 160)) : xv;
    const w = ols(xcap.map((x) => [x]), yv);
    return { xv: xcap, yv, r: corr(xv, yv), w, isC };
  }, [pair]);
  const r = useGlide(calc.r, 600);
  const spec = useMemo<Spec>(() => {
    const lo = Math.min(...calc.xv);
    const hi = Math.max(...calc.xv);
    const pad = (hi - lo) * 0.05;
    const xs = lin(lo - pad, hi + pad);
    const ys = calc.isC ? lin(-16, 22) : lin(28, 98);
    return {
      id: "corr",
      pts: calc.xv.map((x, i) => ({ x: xs(x) + (calc.isC ? 0 : jit(i) * 0.012), y: ys(clamp(calc.yv[i], ys.d0, ys.d1)), c: calc.isC ? C.ice : C.violet, s: 2.5, a: 0.8 })),
      tip: (i) => (calc.isC ? tipCompany(companies[i]) : tipManager(managers[i])),
      under: (g, v) => {
        axes(g, v, {
          xs,
          xt: niceTicks(lo, hi, 5),
          xf: (d) => d + pair.unit,
          xl: pair.label,
          ys,
          yt: calc.isC ? [-10, 0, 10, 20] : [40, 60, 80],
          yf: (d) => (calc.isC ? fmtSigned(d, 0) + "%" : String(d)),
          yl: calc.isC ? "Revenue growth next year" : "Team engagement",
        });
      },
      over: (g, v) => {
        const y0 = ys(predictLin(calc.w, [xs.d0]));
        const y1 = ys(predictLin(calc.w, [xs.d1]));
        line(g, v, [[0, y0], [1, y1]], rgba(C.amber, 0.9), 2);
        text(g, v, "r = " + fmtSigned(calc.r, 2), 0.03, 0.93, { size: v.mobile ? 22 : 30, font: "serif", weight: 400, color: rgba(C.amber, 1) });
      },
    };
  }, [calc, pair]);
  useScene(spec);
  const ar = Math.abs(calc.r);
  const strength = ar < 0.1 ? "No real link" : ar < 0.3 ? "Weak" : ar < 0.5 ? "Moderate" : "Strong";
  return (
    <Scene id="corr">
      <Card n="2.2" q="Do these two things move together?" title="Correlation.">
        <p>
          Correlation is one number, <b>r</b>, between −1 and +1. Positive means they rise together. Negative means one falls as the other rises. Zero means no straight-line link.
        </p>
        <div className="chipset">
          <span className="chip-h">300 managers · what moves with team engagement?</span>
          <Seg wrap value={k} onChange={setK} options={PAIRS.filter((p) => p.ds === "m").map((p) => ({ v: p.k, label: p.label }))} />
          <span className="chip-h">500 companies · what moves with next year&rsquo;s growth?</span>
          <Seg wrap value={k} onChange={setK} options={PAIRS.filter((p) => p.ds === "c").map((p) => ({ v: p.k, label: p.label }))} />
        </div>
        <Stats>
          <Stat label={strength} value={"r = " + fmtSigned(r, 2)} tone={ar >= 0.3 ? "amber" : "ice"} />
          <Stat label="of the differences explained (r²)" value={Math.round(calc.r * calc.r * 100) + "%"} />
        </Stats>
        <Note kind="say">
          What a manager does each month matters more than how long they have been a manager. Coaching time can be changed. Years of experience can&rsquo;t.
        </Note>
        <Note>Correlation is not cause. Engaged teams may simply be easier to coach. Proving the arrow needs a test (Chapter 4).</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 2.3 Linear regression: fit the line

export function SceneLine() {
  const best = useMemo(() => ols(managers.map((m) => [m.coaching]), managers.map((m) => m.engagement)), []);
  const [slope, setSlope] = useState(0.6);
  const [icpt, setIcpt] = useState(64);
  const raf = useRef(0);
  const miss = (b0: number, b1: number) => mean(managers.map((m) => Math.abs(m.engagement - (b0 + b1 * m.coaching))));
  const mae = miss(icpt, slope);
  const bestMae = useMemo(() => miss(best[0], best[1]), [best]);
  const snap = () => {
    cancelAnimationFrame(raf.current);
    const s0 = slope;
    const i0 = icpt;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      setSlope(Math.round((s0 + (best[1] - s0) * e) * 100) / 100);
      setIcpt(Math.round((i0 + (best[0] - i0) * e) * 10) / 10);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const spec = useMemo<Spec>(() => {
    const xs = lin(-0.5, 14.5);
    const ys = lin(28, 98);
    return {
      id: "line",
      pts: managers.map((m, i) => ({ x: xs(m.coaching) + jit(i) * 0.011, y: ys(m.engagement), c: C.violet, s: 2.5, a: 0.85 })),
      tip: (i) => tipManager(managers[i]),
      under: (g, v) => {
        axes(g, v, { xs, xt: [0, 2, 4, 6, 8, 10, 12, 14], xl: "Coaching hours per month", ys, yt: [40, 60, 80], yl: "Team engagement" });
        g.lineWidth = 1;
        managers.forEach((m, i) => {
          const p = icpt + slope * m.coaching;
          const jx = v.X(xs(m.coaching) + jit(i) * 0.011);
          g.strokeStyle = m.engagement > p ? "rgba(84,232,190,.28)" : "rgba(255,118,104,.3)";
          g.beginPath();
          g.moveTo(jx, v.Y(ys(m.engagement)));
          g.lineTo(jx, v.Y(ys(clamp(p, 28, 98))));
          g.stroke();
        });
      },
      over: (g, v) => {
        const f = (x: number): [number, number] => [xs(x), ys(clamp(icpt + slope * x, 20, 106))];
        line(g, v, [f(-0.5), f(14.5)], rgba(C.amber, 1), 2.5);
        const p8 = icpt + slope * 8;
        ring(g, v, xs(8), ys(clamp(p8, 28, 98)), C.amber, 7);
        text(g, v, `8 hours → ${p8.toFixed(0)}`, xs(8) - 0.02, ys(clamp(p8, 28, 98)) + 0.07, { color: rgba(C.amber, 1), size: 14, weight: 600, align: "right" });
      },
    };
  }, [slope, icpt]);
  useScene(spec);
  const closeness = clamp(1 - (mae - bestMae) / 12, 0, 1);
  return (
    <Scene id="line">
      <Card n="2.3" q="How much does the result change when a driver changes?" title="Linear regression: draw the best line.">
        <p>
          Regression draws the straight line that sits as close as possible to every dot. The thin vertical lines are the <b>misses</b>. Try to shrink them yourself, then let the math
          do it.
        </p>
        <Formula>
          engagement = {icpt.toFixed(1)} + {slope.toFixed(2)} × coaching hours
        </Formula>
        <Slider label="Slope: points gained per coaching hour" value={slope} min={0} max={5} step={0.05} onChange={setSlope} fmt={(v) => v.toFixed(2)} />
        <Slider label="Starting value (intercept)" value={icpt} min={30} max={75} step={0.5} onChange={setIcpt} fmt={(v) => v.toFixed(1)} />
        <div className="meter" aria-hidden="true">
          <i style={{ width: closeness * 100 + "%" }} />
        </div>
        <Stats>
          <Stat label="average miss, in engagement points" value={mae.toFixed(1)} tone={mae - bestMae < 0.15 ? "mint" : "coral"} />
          <Stat label="best possible with a straight line" value={bestMae.toFixed(1)} />
        </Stats>
        <button type="button" className="btn" onClick={snap}>
          Find the best fit
        </button>
        <Note kind="say">Each extra hour of coaching goes with about {best[1].toFixed(1)} more points of engagement. That is a sentence an owner can use.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- shared driver sliders

export type Facts = { assess: number; growth: number; turnover: number; margin: number };
const factArr = (f: Facts) => [f.assess, f.growth, f.turnover, f.margin];

function DriverSliders({ f, set }: { f: Facts; set: (f: Facts) => void }) {
  return (
    <>
      {DRIVERS.map((d) => (
        <Slider key={d.key} label={d.label} value={f[d.key]} min={d.min} max={d.max} step={d.step} onChange={(v) => set({ ...f, [d.key]: v })} fmt={(v) => v + d.unit} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- 2.3 Several drivers at once

export function SceneMulti() {
  const [f, setF] = useState<Facts>({ assess: 70, growth: 5, turnover: 15, margin: 10 });
  const pred = predictLin(BOOK_LINEAR, factArr(f));
  const fit = useMemo(() => {
    const p = companies.map((c) => predictLin(BOOK_LINEAR, feat(c)));
    const y = companies.map((c) => c.nextGrowth);
    return { p, r2: corr(p, y) ** 2 };
  }, []);
  const spec = useMemo<Spec>(() => {
    const xs = lin(-8, 12);
    const ys = lin(-16, 22);
    return {
      id: "multi",
      pts: companies.map((c, i) => ({ x: xs(clamp(fit.p[i], -8, 12)), y: ys(clamp(c.nextGrowth, -16, 22)), c: C.ice, s: 2.3, a: 0.6 })),
      tip: (i) => tipCompany(companies[i]),
      under: (g, v) => {
        axes(g, v, { xs, xt: [-5, 0, 5, 10], xf: (d) => fmtSigned(d, 0) + "%", xl: "What the model predicted", ys, yt: [-10, 0, 10, 20], yf: (d) => fmtSigned(d, 0) + "%", yl: "What actually happened" });
        line(g, v, [[xs(-8), ys(-8)], [xs(12), ys(12)]], "rgba(255,255,255,.35)", 1.5, [5, 6]);
        text(g, v, "perfect prediction", xs(10.6), ys(12.6), { size: 11, color: "rgba(226,232,255,.5)", align: "right", font: "mono" });
      },
      over: (g, v) => {
        const p = clamp(pred, -8, 12);
        line(g, v, [[xs(p), 0], [xs(p), 1]], rgba(C.amber, 0.5), 1.5, [3, 4]);
        ring(g, v, xs(p), ys(p), C.amber, 9);
        text(g, v, `Your company: ${fmtSigned(pred)}%`, xs(p) + (p > 6 ? -0.03 : 0.03), ys(p) - 0.075, { align: p > 6 ? "right" : "left", color: rgba(C.amber, 1), size: 14, weight: 600 });
      },
    };
  }, [fit, pred]);
  useScene(spec);
  const parts = DRIVERS.map((d, i) => ({ label: d.short, v: BOOK_LINEAR[i + 1] * f[d.key] }));
  return (
    <Scene id="multi">
      <Card n="2.3" q="What should we expect for a new case?" title="Several drivers at once.">
        <p>Business results almost never depend on one thing. Regression gives each driver its own weight, then adds them up. Describe a company and watch its forecast move.</p>
        <DriverSliders f={f} set={setF} />
        <div className="sum">
          <div>
            <span>Starting value</span>
            <b>−3.64</b>
          </div>
          {parts.map((p) => (
            <div key={p.label}>
              <span>{p.label}</span>
              <i className={p.v >= 0 ? "pos" : "neg"} style={{ width: Math.min(100, Math.abs(p.v) * 9) * 0.4 + "%" }} />
              <b>{fmtSigned(p.v, 2)}</b>
            </div>
          ))}
        </div>
        <Stats>
          <Stat label="expected revenue growth next year" value={fmtSigned(pred) + "%"} tone="amber" />
          <Stat label="of the differences explained (R²)" value={Math.round(fit.r2 * 100) + "%"} sub="Most of what drives growth isn’t in a spreadsheet." />
        </Stats>
        <Note>A weight is not a promise. Higher assessment scores go with faster growth. That is a reasonable bet to test, not proof that raising the score causes growth.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 2.4 Logistic regression

const PRESETS: { name: string; f: Facts }[] = [
  { name: "Company A", f: { assess: 70, growth: 5, turnover: 15, margin: 10 } },
  { name: "Company B", f: { assess: 50, growth: 5, turnover: 15, margin: 10 } },
  { name: "Company C", f: { assess: 45, growth: -3, turnover: 28, margin: 4 } },
];

export function SceneLogit() {
  const [f, setF] = useState<Facts>(PRESETS[0].f);
  const z = predictLin(BOOK_LOGIT, factArr(f));
  const p = sigmoid(z);
  const spec = useMemo<Spec>(() => {
    const xs = lin(-3.4, 3.8);
    const zs = companies.map((c) => clamp(predictLin(BOOK_LOGIT, feat(c)), -3.3, 3.7));
    const up = stack(zs.filter((_, i) => companies[i].grew), 0.2, -3.4);
    const dn = stack(zs.filter((_, i) => !companies[i].grew), 0.2, -3.4);
    let a = 0;
    let b = 0;
    const dy = 0.0125;
    return {
      id: "logit",
      pts: companies.map((c) => {
        const s = c.grew ? up[a++] : dn[b++];
        return { x: xs(s.x), y: c.grew ? 1 - (s.level + 0.5) * dy : (s.level + 0.5) * dy, c: c.grew ? C.mint : C.coral, s: 2.2, a: 0.75 };
      }),
      tip: (i) => tipCompany(companies[i]),
      under: (g, v) => {
        axes(g, v, { xs, xt: [-3, -2, -1, 0, 1, 2, 3], xl: "Score: starting value + weight × each driver", ys: lin(0, 1), yt: [0, 0.25, 0.5, 0.75, 1], yf: (d) => d * 100 + "%", yl: "Chance of growing" });
        text(g, v, "grew", 0.012, 0.955, { size: 11, color: rgba(C.mint, 0.8), font: "mono" });
        text(g, v, "didn't grow", 0.988, 0.03, { size: 11, color: rgba(C.coral, 0.8), font: "mono", align: "right" });
      },
      over: (g, v) => {
        const curve: [number, number][] = [];
        for (let s = -3.4; s <= 3.81; s += 0.1) curve.push([xs(s), sigmoid(s)]);
        line(g, v, curve, rgba(C.white, 0.9), 2.5);
        const zx = xs(clamp(z, -3.4, 3.8));
        line(g, v, [[zx, 0], [zx, p], [0, p]], rgba(C.amber, 0.6), 1.5, [3, 4]);
        ring(g, v, zx, p, C.amber, 9);
        text(g, v, `${Math.round(p * 100)}%`, zx + (zx > 0.8 ? -0.035 : 0.035), p - 0.085, { align: zx > 0.8 ? "right" : "left", color: rgba(C.amber, 1), size: v.mobile ? 20 : 28, font: "serif", weight: 400 });
      },
    };
  }, [z, p]);
  useScene(spec);
  const shown = useGlide(p, 350);
  const active = PRESETS.find((q) => factArr(q.f).join() === factArr(f).join())?.name ?? "";
  return (
    <Scene id="logit">
      <Card n="2.4" q="What is the chance of yes or no?" title="Logistic regression.">
        <p>
          Build a score the same way linear regression does. Then squeeze it through an <b>S-shaped curve</b> that turns any number into a chance between 0% and 100%.
        </p>
        <Formula>chance = 1 ÷ (1 + e<sup>−score</sup>)</Formula>
        <Seg value={active} onChange={(n) => setF(PRESETS.find((q) => q.name === n)!.f)} options={PRESETS.map((q) => ({ v: q.name, label: q.name }))} />
        <DriverSliders f={f} set={setF} />
        <Stats>
          <Stat label="chance this company grows next year" value={Math.round(shown * 100) + "%"} tone={p < 0.4 ? "coral" : p < 0.65 ? "amber" : "mint"} sub={p < 0.4 ? "The one to call this month." : p < 0.65 ? "Check in at the next review." : "On track."} />
          <Stat label="odds change per 10 assessment points" value="×1.43" />
        </Stats>
        <Note>A probability is not a verdict. A 24% chance still means about one in four companies like C will grow. Treat the number as a signal for attention.</Note>
      </Card>
    </Scene>
  );
}
