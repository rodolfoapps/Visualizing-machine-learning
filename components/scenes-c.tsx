"use client";

import { useMemo, useState } from "react";
import { AVG, BASE_SPLIT, DRIVERS, companies, feat, growthModel, managers } from "@/lib/data";
import { clamp, corr, gauss, logistic, mean, predictProb, rng } from "@/lib/ml";
import { C, axes, band, fmtK, fmtSigned, lin, line, ring, rgba, stack, text, type Pt, type Spec } from "@/lib/stage";
import { Card, Note, Scene, Seg, Slider, Stat, Stats, useGlide, useScene } from "./core";
import { tipCompany } from "./scenes-a";

// ---------------------------------------------------------------- 4.1 Small samples

export function SceneSmall() {
  const [n, setN] = useState(10);
  const [run, setRun] = useState(1);
  const truth = useMemo(() => corr(managers.map((m) => m.coaching), managers.map((m) => m.engagement)), []);
  const rs = useMemo(() => {
    const r = rng(n * 1000 + run);
    const out: number[] = [];
    for (let s = 0; s < 500; s++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let k = 0; k < n; k++) {
        const m = managers[Math.floor(r() * 300)];
        xs.push(m.coaching);
        ys.push(m.engagement);
      }
      out.push(corr(xs, ys));
    }
    return out;
  }, [n, run]);
  const sorted = useMemo(() => [...rs].sort((a, b) => a - b), [rs]);
  const spec = useMemo<Spec>(() => {
    const xs = lin(-0.2, 1.02);
    const st = stack(rs.map((r) => clamp(r, -0.19, 1.0)), 0.02, -0.2);
    const maxL = Math.max(...st.map((s) => s.level)) + 1;
    const dy = Math.min(0.03, 0.9 / maxL);
    return {
      id: "small",
      pts: rs.map((r, i) => ({ x: xs(st[i].x), y: (st[i].level + 0.6) * dy, c: Math.abs(r - truth) > 0.1 ? C.coral : C.violet, s: 2.3, a: 0.9 })),
      tip: (i) => ({ title: `Sample ${i + 1} of 500`, rows: [[`${n} managers drawn at random`, ""], ["Correlation found", fmtSigned(rs[i], 2)], ["True correlation", fmtSigned(truth, 2)]] }),
      under: (g, v) => {
        band(g, v, xs(truth - 0.1), xs(truth + 0.1), 0, 1, "rgba(182,146,255,.06)");
        axes(g, v, { xs, xt: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], xf: (d) => d.toFixed(1), xl: `Correlation found in each of 500 samples of ${n} managers` });
        line(g, v, [[xs(truth), 0], [xs(truth), 1]], rgba(C.amber, 0.9), 2);
        text(g, v, `the truth: r = ${truth.toFixed(2)}`, xs(truth) - 0.015, 1.03, { align: "right", size: 12, color: rgba(C.amber, 1), weight: 600 });
      },
    };
  }, [rs, truth, n]);
  useScene(spec);
  const off = rs.filter((r) => Math.abs(r - truth) > 0.1).length / 5;
  return (
    <Scene id="small">
      <Card n="4.1" q="Trap one" title="Small samples.">
        <p>
          Across all 300 managers, coaching and engagement have a correlation of {truth.toFixed(2)}. Now pretend you only had a handful of managers to study. Each dot is one such
          study, drawn at random.
        </p>
        <Seg
          value={n}
          onChange={setN}
          options={[
            { v: 10, label: "10 managers" },
            { v: 30, label: "30 managers" },
            { v: 100, label: "100 managers" },
          ]}
        />
        <button type="button" className="btn btn-ghost" onClick={() => setRun((r) => r + 1)}>
          Draw 500 new samples
        </button>
        <Stats>
          <Stat label="range of answers" value={`${sorted[0].toFixed(2)} to ${sorted[499].toFixed(2)}`} tone="violet" />
          <Stat label="samples off by more than 0.1 (red)" value={Math.round(off) + "%"} tone={off > 15 ? "coral" : "mint"} />
        </Stats>
        <Note kind="say">Treat any finding from fewer than about 30 cases as a hint, not a fact. The same real relationship can look anywhere from weak to nearly perfect.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 4.4 / 4.5 Leakage and drift

export function SceneDrift() {
  const [mode, setMode] = useState<"base" | "leak" | "down">("base");
  const [down, setDown] = useState(5);
  const models = useMemo(() => {
    const tr = BASE_SPLIT.train;
    const y = tr.map((i) => companies[i].grew);
    return { base: growthModel().w, leak: logistic(tr.map((i) => [...feat(companies[i]), companies[i].leak]), y) };
  }, []);
  const calc = useMemo(() => {
    const te = BASE_SPLIT.test;
    const shift = mode === "down" ? down : 0;
    const pr = te.map((i) => (mode === "leak" ? predictProb(models.leak, [...feat(companies[i]), companies[i].leak]) : predictProb(models.base, feat(companies[i]))));
    const ng = te.map((i) => companies[i].nextGrowth - shift);
    const right = pr.map((p, k) => (p > 0.5 === ng[k] > 0 ? 1 : 0));
    const share = mean(ng.map((x) => (x > 0 ? 1 : 0)));
    return { te, pr, ng, right, acc: mean(right), share, base: Math.max(share, 1 - share), said: mean(pr.map((p) => (p > 0.5 ? 1 : 0))) };
  }, [mode, down, models]);
  const spec = useMemo<Spec>(() => {
    const xs = lin(0, 1);
    const ys = lin(-24, 22);
    const pts: Pt[] = companies.map(() => ({ x: 0.5, y: ys(0), c: C.ice, a: 0, s: 2 }));
    calc.te.forEach((ci, k) => (pts[ci] = { x: xs(calc.pr[k]), y: ys(clamp(calc.ng[k], -24, 22)), c: calc.right[k] ? C.mint : C.coral, a: 0.92, s: 3.2 }));
    return {
      id: "drift",
      pts,
      tip: (i) => {
        const k = calc.te.indexOf(i);
        if (k < 0) return null;
        return { title: companies[i].id + " · " + companies[i].industry, rows: [["Model said", Math.round(calc.pr[k] * 100) + "% chance of growing"], ["What happened", fmtSigned(calc.ng[k]) + "% growth"], ["", calc.right[k] ? "Model was right" : "Model was wrong"]] };
      },
      under: (g, v) => {
        band(g, v, 0.5, 1, ys(0), 1, "rgba(84,232,190,.05)");
        band(g, v, 0, 0.5, 0, ys(0), "rgba(84,232,190,.05)");
        axes(g, v, { xs, xt: [0, 0.25, 0.5, 0.75, 1], xf: (d) => d * 100 + "%", xl: "The model’s chance of growing", ys, yt: [-20, -10, 0, 10, 20], yf: (d) => fmtSigned(d, 0) + "%", yl: "What actually happened next year" });
        line(g, v, [[0.5, 0], [0.5, 1]], "rgba(255,255,255,.3)", 1, [4, 5]);
        line(g, v, [[0, ys(0)], [1, ys(0)]], "rgba(255,255,255,.3)", 1, [4, 5]);
        text(g, v, "said “grows”, and it grew", 0.985, 0.96, { align: "right", size: 11, font: "mono", color: rgba(C.mint, 0.8) });
        text(g, v, "said “stalls”, and it stalled", 0.015, 0.03, { size: 11, font: "mono", color: rgba(C.mint, 0.8) });
        text(g, v, "said “grows”, but it shrank", 0.985, 0.03, { align: "right", size: 11, font: "mono", color: rgba(C.coral, 0.85) });
      },
    };
  }, [calc]);
  useScene(spec);
  const acc = useGlide(calc.acc, 400);
  return (
    <Scene id="drift">
      <Card n="4.4" q="Traps four and five" title="Leakage and drift.">
        <p>The same 125 test companies, three ways. Green dots are calls the model got right. Red dots are calls it got wrong.</p>
        <Seg
          wrap
          value={mode}
          onChange={setMode}
          options={[
            { v: "base", label: "Honest model" },
            { v: "leak", label: "Add a leaked fact" },
            { v: "down", label: "The world changes" },
          ]}
        />
        {mode === "down" && <Slider label="A downturn cuts every company’s growth by" value={down} min={0} max={10} step={0.5} onChange={setDown} fmt={(v) => v + " pts"} />}
        <Stats>
          <Stat label="accuracy" value={Math.round(acc * 100) + "%"} tone={mode === "leak" ? "amber" : calc.acc < calc.base ? "coral" : "mint"} sub={calc.acc < calc.base ? "Worse than a simple guess" : mode === "leak" ? "Too good to be true" : undefined} />
          <Stat label="simple guess" value={Math.round(calc.base * 100) + "%"} sub={`${Math.round(calc.share * 100)}% actually grow · the model expects ${Math.round(calc.said * 100)}%`} />
        </Stats>
        <div className="callout">
          {mode === "base" && (
            <p>
              <strong>The honest model</strong> uses four facts known at the start of the year. It is better than guessing, and far from perfect. That is what a real model looks like.
            </p>
          )}
          {mode === "leak" && (
            <p>
              <strong>Data leakage.</strong> We slipped in revenue from the first quarter of <em>next</em> year. Accuracy jumps, but once that number is known, most of the answer is
              already known too. A sudden jump in accuracy is more often leakage than genius.
            </p>
          )}
          {mode === "down" && (
            <p>
              <strong>Drift.</strong> The world changed after training. The dots sink, but the model, trained on normal years, keeps predicting growth as if nothing happened. Compare
              predictions with results every month, and retrain on a schedule.
            </p>
          )}
        </div>
        <div className="traps">
          <div>
            <b>Trap two · Correlation is not cause</b>
            Owners who work longer hours run companies with higher turnover. Add the assessment score and the effect vanishes: weaker systems drive both.
          </div>
          <div>
            <b>Trap three · Survivorship bias</b>
            Study only the clients who stayed and nearly every approach looks like it works. Keep records of the ones who left.
          </div>
        </div>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 5.2 Four-fifths rule

export function SceneFair() {
  const [a, setA] = useState(48);
  const [b, setB] = useState(18);
  const ra = a / 80;
  const rb = b / 45;
  const hi = Math.max(ra, rb);
  const ratio = hi ? Math.min(ra, rb) / hi : 1;
  const pass = ratio >= 0.8;
  const spec = useMemo<Spec>(() => {
    const pts: Pt[] = [];
    for (let i = 0; i < 80; i++) pts.push({ x: 0.04 + (i % 10) * 0.046, y: 0.84 - Math.floor(i / 10) * 0.075, c: i < a ? C.violet : C.dim, a: i < a ? 0.95 : 0.4, s: i < a ? 4 : 3 });
    for (let i = 0; i < 45; i++) pts.push({ x: 0.58 + (i % 9) * 0.046, y: 0.84 - Math.floor(i / 9) * 0.075, c: i < b ? C.sky : C.dim, a: i < b ? 0.95 : 0.4, s: i < b ? 4 : 3 });
    return {
      id: "fair",
      pts,
      over: (g, v) => {
        text(g, v, "Group A · 80 managers", 0.04, 0.94, { size: 13.5, weight: 600, color: rgba(C.violet, 1) });
        text(g, v, `${a} recommended · ${Math.round(ra * 100)}%`, 0.04, 0.24, { size: 12.5, font: "mono", color: rgba(C.violet, 0.95) });
        text(g, v, "Group B · 45 managers", 0.58, 0.94, { size: 13.5, weight: 600, color: rgba(C.sky, 1) });
        text(g, v, `${b} recommended · ${Math.round(rb * 100)}%`, 0.58, 0.48, { size: 12.5, font: "mono", color: rgba(C.sky, 0.95) });
        // ratio gauge
        const y = 0.1;
        line(g, v, [[0.04, y], [0.96, y]], "rgba(160,180,255,.25)", 6);
        line(g, v, [[0.04, y], [0.04 + 0.92 * ratio, y]], rgba(pass ? C.mint : C.coral, 0.95), 6);
        const tx = 0.04 + 0.92 * 0.8;
        line(g, v, [[tx, y - 0.04], [tx, y + 0.04]], rgba(C.white, 0.9), 2);
        text(g, v, "four-fifths line · 0.80", tx, y + 0.06, { align: "center", size: 11, font: "mono", color: "rgba(226,232,255,.7)" });
        text(g, v, `ratio ${ratio.toFixed(2)}`, 0.04, y - 0.075, { size: 12.5, weight: 600, color: rgba(pass ? C.mint : C.coral, 1) });
      },
    };
  }, [a, b, ra, rb, ratio, pass]);
  useScene(spec);
  return (
    <Scene id="fair">
      <Card n="5.2" q="Is the model fair across groups?" title="The four-fifths rule.">
        <p>
          A model can be unfair even when it never sees a protected trait. So the <em>results</em> are tested, group by group. Divide the lower selection rate by the higher one. Below
          0.80, the model needs a closer look before anyone uses it.
        </p>
        <Slider label="Group A managers the model recommends (of 80)" value={a} min={0} max={80} onChange={setA} />
        <Slider label="Group B managers the model recommends (of 45)" value={b} min={0} max={45} onChange={setB} />
        <Stats>
          <Stat label="ratio of selection rates" value={ratio.toFixed(2)} tone={pass ? "mint" : "coral"} sub={pass ? "Passes the first check" : "Review needed before use"} />
          <Stat label="selection rates" value={`${Math.round(ra * 100)}% · ${Math.round(rb * 100)}%`} />
        </Stats>
        <ol className="rules">
          <li>
            <b>Keep certain facts out.</b> Never use protected traits, or stand-ins such as ZIP code, first name or graduation year.
          </li>
          <li>
            <b>Test for unfair impact.</b> Before launch and after every retrain.
          </li>
          <li>
            <b>Respect privacy and consent.</b> People know what is collected, why and who sees it.
          </li>
          <li>
            <b>A person makes the final call.</b> Models inform decisions about people. They never make them alone.
          </li>
        </ol>
        <Note>The four-fifths rule is a rule of thumb, not a safe harbor, and this is not legal advice. Have an employment lawyer review any model used in decisions about people.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 8.2 Monte Carlo

export function SceneMonte() {
  const [start, setStart] = useState(250);
  const [mu, setMu] = useState(-9);
  const [vol, setVol] = useState(55);
  const [sticky, setSticky] = useState<"no" | "yes">("no");
  const [run, setRun] = useState(1);
  const sim = useMemo(() => {
    const r = rng(9000 + run);
    const phi = sticky === "yes" ? 0.6 : 0;
    const paths: number[][] = [];
    const ruin: number[] = [];
    for (let s = 0; s < 500; s++) {
      let cash = start;
      let e = gauss(r);
      const p = [cash];
      let dead = -1;
      for (let t = 1; t <= 12; t++) {
        e = phi * e + Math.sqrt(1 - phi * phi) * gauss(r);
        cash += mu + vol * e;
        p.push(cash);
        if (cash < 0 && dead < 0) dead = t;
      }
      paths.push(p);
      ruin.push(dead);
    }
    return { paths, ruin, share: ruin.filter((d) => d > 0).length / 500 };
  }, [start, mu, vol, sticky, run]);
  const spec = useMemo<Spec>(() => {
    const xs = lin(0, 12.6);
    const ys = lin(-120, 900);
    return {
      id: "monte",
      pts: sim.paths.map((p, i) => {
        const d = sim.ruin[i];
        return d > 0
          ? { x: xs(d - p[d] / (p[d] - p[d - 1])), y: ys(0), c: C.coral, a: 0.9, s: 2.6 }
          : { x: xs(12) + ((i % 7) - 3) * 0.004, y: ys(clamp(p[12], -120, 900)), c: C.mint, a: 0.8, s: 2.2 };
      }),
      under: (g, v) => {
        band(g, v, 0, 1, 0, ys(0), "rgba(255,118,104,.07)");
        axes(g, v, { xs, xt: [0, 3, 6, 9, 12], xf: (d) => (d ? "month " + d : "today"), ys, yt: [0, 200, 400, 600, 800], yf: (d) => "$" + d + "k", yl: "Cash in the bank", xl: "500 simulated versions of next year" });
        g.lineWidth = 1;
        for (let i = 0; i < 150; i++) {
          const p = sim.paths[i];
          const d = sim.ruin[i];
          g.strokeStyle = d > 0 ? "rgba(255,118,104,.28)" : "rgba(84,232,190,.16)";
          g.beginPath();
          const end = d > 0 ? d : 12;
          for (let t = 0; t <= end; t++) {
            const x = v.X(xs(t));
            const y = v.Y(ys(clamp(p[t], -120, 900)));
            if (t) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        }
        line(g, v, [[0, ys(0)], [1, ys(0)]], rgba(C.coral, 0.8), 1.5);
        text(g, v, "out of cash", 0.012, ys(0) - 0.045, { size: 11, font: "mono", color: rgba(C.coral, 0.9) });
      },
      over: (g, v) => {
        ring(g, v, xs(0), ys(start), C.amber, 6, false);
      },
    };
  }, [sim, start]);
  useScene(spec);
  const share = useGlide(sim.share, 400);
  return (
    <Scene id="monte">
      <Card n="8.2" q="How likely is a bad outcome?" title="Monte Carlo simulation.">
        <p>
          The computer plays out the next twelve months 500 times, each with realistic ups and downs. The chance of the bad outcome is simply the share of runs where it happened.
        </p>
        <Slider label="Cash in the bank today" value={start} min={50} max={500} step={10} onChange={setStart} fmt={(v) => "$" + v + "k"} />
        <Slider label="Typical month: cash in minus cash out" value={mu} min={-40} max={40} step={1} onChange={setMu} fmt={(v) => (v < 0 ? "−$" : "+$") + Math.abs(v) + "k"} />
        <Slider label="How bumpy the months are" value={vol} min={10} max={110} step={5} onChange={setVol} fmt={(v) => "±$" + v + "k"} />
        <div className="rowlabel">Do bad months come in streaks?</div>
        <Seg
          value={sticky}
          onChange={setSticky}
          options={[
            { v: "no", label: "Each month unrelated" },
            { v: "yes", label: "Bad months come together" },
          ]}
        />
        <Stats>
          <Stat label="of every 100 simulated years run out of cash" value={String(Math.round(share * 100))} tone={sim.share > 0.25 ? "coral" : sim.share > 0.1 ? "amber" : "mint"} />
        </Stats>
        <button type="button" className="btn btn-ghost" onClick={() => setRun((r) => r + 1)}>
          Simulate again
        </button>
        <Note>Bad months tend to come together. A simulation that treats every month as unrelated can understate the risk several times over. Flip the switch and watch.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 8.4 Hierarchical models (shrinkage)

export function SceneShrink() {
  const [n, setN] = useState(3);
  const [k, setK] = useState(3);
  const kk = Math.min(k, n);
  const own = kk / n;
  const blended = (kk + 0.71 * 20) / (n + 20);
  const spec = useMemo<Spec>(() => {
    const pts: Pt[] = [];
    const cols = 10;
    for (let i = 0; i < n; i++) pts.push({ x: 0.04 + (i % cols) * 0.046, y: 0.86 - Math.floor(i / cols) * 0.066, c: i < kk ? C.mint : C.coral, a: 0.95, s: 3.8 });
    for (let i = 0; i < 20; i++) pts.push({ x: 0.6 + (i % 5) * 0.06, y: 0.86 - Math.floor(i / 5) * 0.085, c: i < 14 ? C.mint : C.coral, a: 0.3, s: 3.8 });
    return {
      id: "shrink",
      pts,
      over: (g, v) => {
        text(g, v, `Own record · ${kk} of ${n} on time`, 0.04, 0.955, { size: 13.5, weight: 600 });
        text(g, v, "Borrowed from similar clients", 0.6, 0.955, { size: 13.5, weight: 600, color: "rgba(226,232,255,.6)" });
        text(g, v, "the group averages 71% on time", 0.6, 0.47, { size: 11, font: "mono", color: "rgba(226,232,255,.45)" });
        const y = 0.13;
        const X = (p: number) => 0.04 + 0.92 * p;
        line(g, v, [[X(0), y], [X(1), y]], "rgba(160,180,255,.25)", 4);
        for (const t of [0, 0.5, 1]) text(g, v, t * 100 + "%", X(t), y - 0.065, { align: "center", size: 10.5, font: "mono", color: "rgba(200,210,240,.5)" });
        line(g, v, [[X(0.71), y - 0.03], [X(0.71), y + 0.03]], "rgba(226,232,255,.6)", 2);
        text(g, v, "group", X(0.71), y + 0.05, { align: "center", size: 10.5, font: "mono", color: "rgba(226,232,255,.6)" });
        ring(g, v, X(own), y, C.ice, 5, false);
        text(g, v, "own record", X(own), y + 0.085, { align: own > 0.85 ? "right" : "center", size: 10.5, font: "mono", color: rgba(C.ice, 0.9) });
        ring(g, v, X(blended), y, C.amber, 8);
        text(g, v, `fair estimate ${Math.round(blended * 100)}%`, X(blended), y - 0.11, { align: "center", size: 13, weight: 600, color: rgba(C.amber, 1) });
      },
    };
  }, [n, kk, own, blended]);
  useScene(spec);
  return (
    <Scene id="shrink">
      <Card n="8.4" q="How much should we trust a small sample?" title="Lean on the group when data is thin.">
        <p>
          A new client with 3 of 3 projects on time doesn&rsquo;t have a proven 100% record. A fair estimate blends their own record with the average of similar clients. The more history
          they build, the more their own record counts.
        </p>
        <Slider label="Projects completed so far" value={n} min={1} max={80} onChange={(v) => { setN(v); setK(Math.round((kk / n) * v)); }} />
        <Slider label="Finished on time" value={kk} min={0} max={n} onChange={setK} />
        <Stats>
          <Stat label="own record" value={Math.round(own * 100) + "%"} />
          <Stat label={`fair estimate, based on ${n} project${n > 1 ? "s" : ""}`} value={Math.round(blended * 100) + "%"} tone="amber" />
        </Stats>
        <Note kind="say">Always show how much data stands behind a score. &ldquo;75% on time, based on 3 projects&rdquo; is honest. &ldquo;75% on time&rdquo; alone is not.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 7. The call list

const TIERS = [
  { name: "High risk", lo: 0, hi: 0.4, c: C.coral, next: "Advisor call this month, with the top reasons" },
  { name: "Watch", lo: 0.4, hi: 0.65, c: C.amber, next: "Check in at the next scheduled review" },
  { name: "On track", lo: 0.65, hi: 1.01, c: C.mint, next: "Normal service" },
];
const tierOf = (p: number) => (p < 0.4 ? 0 : p < 0.65 ? 1 : 2);

function reason(key: string, c: (typeof companies)[number]) {
  if (key === "assess") return `Assessment score of ${c.assess} is ${c.assess < AVG.assess ? "below" : "above"} the average of ${Math.round(AVG.assess)}`;
  if (key === "growth") return c.growth < 0 ? `Revenue fell ${Math.abs(c.growth)}% this year` : `Revenue grew ${c.growth}% this year`;
  if (key === "turnover") return `Team turnover of ${c.turnover}% against an average of ${AVG.turnover.toFixed(1)}%`;
  return `Profit margin of ${c.margin}% against an average of ${AVG.margin.toFixed(1)}%`;
}

export function SceneList() {
  const model = useMemo(() => {
    const w = growthModel().w;
    const pr = companies.map((c) => predictProb(w, feat(c)));
    const testSet = new Set(BASE_SPLIT.test);
    const top5 = BASE_SPLIT.test.slice().sort((a, b) => pr[a] - pr[b]).slice(0, 5);
    const counts = [0, 1, 2].map((t) => pr.filter((p) => tierOf(p) === t).length);
    const grewBy = [0, 1, 2].map((t) => {
      const ix = BASE_SPLIT.test.filter((i) => tierOf(pr[i]) === t);
      return ix.length ? mean(ix.map((i) => companies[i].grew)) : 0;
    });
    // layout
    const pos: [number, number][] = new Array(500);
    [0, 1, 2].forEach((t) => {
      const ix = companies.map((_, i) => i).filter((i) => tierOf(pr[i]) === t).sort((a, b) => pr[a] - pr[b]);
      ix.forEach((ci, s) => (pos[ci] = [0.17 + t * 0.33 + ((s % 12) - 5.5) * 0.0235, 0.03 + Math.floor(s / 12) * 0.038]));
    });
    return { w, pr, top5, counts, grewBy, pos, testSet };
  }, []);
  const [sel, setSel] = useState(model.top5.find((i) => !companies[i].grew) ?? model.top5[0]);
  const c = companies[sel];
  const p = model.pr[sel];
  const tier = TIERS[tierOf(p)];
  const pushes = DRIVERS.map((d, j) => ({ key: d.key as string, label: d.short, v: model.w[j + 1] * (c[d.key] - AVG[d.key]) }));
  const ranked = [...pushes].sort((a, b) => (p < 0.6 ? a.v - b.v : b.v - a.v));
  const reasons = ranked.slice(0, 2).map((r) => reason(r.key, c));
  const maxPush = Math.max(0.6, ...pushes.map((x) => Math.abs(x.v)));
  const spec = useMemo<Spec>(
    () => ({
      id: "list",
      pts: companies.map((_, i) => ({ x: model.pos[i][0], y: model.pos[i][1], c: i === sel ? C.white : TIERS[tierOf(model.pr[i])].c, a: i === sel ? 1 : 0.82, s: i === sel ? 4.6 : 2.5 })),
      tip: (i) => {
        const t = tipCompany(companies[i]);
        t.rows.pop();
        t.rows.unshift(["Chance of growing", Math.round(model.pr[i] * 100) + "%"]);
        return t;
      },
      pick: (i) => setSel(i),
      over: (g, v) => {
        TIERS.forEach((t, j) => {
          const x = 0.17 + j * 0.33;
          text(g, v, t.name, x, 1.045, { align: "center", size: 15, weight: 600, color: rgba(t.c, 1) });
          text(g, v, `${model.counts[j]} companies`, x, 0.995, { align: "center", size: 11.5, font: "mono", color: "rgba(226,232,255,.6)" });
        });
        ring(g, v, model.pos[sel][0], model.pos[sel][1], C.white, 9);
        if (!v.mobile) text(g, v, "Click any company", 1, -0.075, { align: "right", size: 11.5, font: "mono", color: "rgba(226,232,255,.45)" });
      },
    }),
    [model, sel],
  );
  useScene(spec);
  const json = `{
  "company_id": "${c.id}",
  "chance_of_growth": ${p.toFixed(2)},
  "tier": "${tier.name}",
  "top_reasons": [
    "${reasons[0]}",
    "${reasons[1]}"
  ],
  "model_version": "growth-v1"
}`;
  return (
    <Scene id="list">
      <Card n="7" q="Which clients need help now?" title="From 500 companies to a short call list.">
        <p>
          The trained model scores every company and sorts it into a tier. In the test set, {Math.round(model.grewBy[0] * 100)}% of high-risk companies grew, against{" "}
          {Math.round(model.grewBy[2] * 100)}% of those on track. The tiers line up, and that is what makes the model useful.
        </p>
        <div className="rowlabel">Five highest-risk companies the model had never seen</div>
        <div className="picks">
          {model.top5.map((i) => (
            <button key={i} type="button" className={i === sel ? "on" : ""} onClick={() => setSel(i)}>
              {companies[i].id}
              <span>{Math.round(model.pr[i] * 100)}%</span>
            </button>
          ))}
        </div>
        <div className="dossier">
          <div className="dossier-h">
            <div>
              <b>{c.id}</b>
              <span>{c.industry}</span>
            </div>
            <div className="dossier-p" style={{ color: rgba(tier.c, 1) }}>
              {Math.round(p * 100)}%<span>{tier.name}</span>
            </div>
          </div>
          <div className="why">
            {pushes.map((x) => (
              <div key={x.key}>
                <span>
                  {x.label} <em>{c[x.key as "assess"]}{x.key === "assess" ? "" : "%"}</em>
                </span>
                <div className="why-bar">
                  <i className={x.v >= 0 ? "pos" : "neg"} style={{ width: (Math.abs(x.v) / maxPush) * 50 + "%", [x.v >= 0 ? "left" : "right"]: "50%" }} />
                </div>
              </div>
            ))}
            <div className="why-legend">
              <span>← drags the score down</span>
              <span>lifts it →</span>
            </div>
          </div>
          <p className="dossier-next">
            <b>What happens next:</b> {tier.next}.{model.testSet.has(sel) ? ` What actually happened: it ${c.grew ? "grew" : "did not grow"}.` : ""}
          </p>
        </div>
        <div className="rowlabel">What an agent receives from the model</div>
        <pre className="json">{json}</pre>
        <Note kind="say">The model supplies the numbers. The agent turns them into a clear note for the advisor and drafts the outreach, for a person to approve.</Note>
      </Card>
    </Scene>
  );
}
