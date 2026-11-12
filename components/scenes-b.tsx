"use client";

import { useMemo, useState } from "react";
import { BASE_SPLIT, companies, feat, growthModel, monthly, split } from "@/lib/data";
import { auc, buildTree, clamp, logistic, mean, ols, predictLin, predictProb, treePredict, treeRegions } from "@/lib/ml";
import { C, axes, band, blob, fmtK, fmtMoney, lin, line, rgba, stageInfo, text, type Pt, type Spec } from "@/lib/stage";
import { Card, Formula, Note, Scene, Seg, Slider, Stat, Stats, useGlide, useScene, useStageCtx } from "./core";
import { tipCompany } from "./scenes-a";

// ---------------------------------------------------------------- 2.5 Bayes

const BAYES = [
  { name: "Second call", prior: 10, py: 80, pn: 20, who: "prospects", yes: "become clients", ev: "Booked a second call", not: "No second call" },
  { name: "High turnover", prior: 62, py: 10, pn: 23, who: "companies", yes: "grow next year", ev: "Turnover of 25% or more", not: "Turnover under 25%" },
  { name: "Strong review", prior: 64, py: 30, pn: 11, who: "new managers", yes: "succeed in year one", ev: "First review of 4.0+", not: "First review under 4.0" },
];

export function SceneBayes() {
  const [name, setName] = useState(BAYES[0].name);
  const [prior, setPrior] = useState(10);
  const [py, setPy] = useState(80);
  const [pn, setPn] = useState(20);
  const cfg = BAYES.find((b) => b.name === name)!;
  const load = (n: string) => {
    const b = BAYES.find((x) => x.name === n)!;
    setName(n);
    setPrior(b.prior);
    setPy(b.py);
    setPn(b.pn);
  };
  const post = (py * prior) / (py * prior + pn * (100 - prior) || 1);
  const counts = useMemo(() => {
    const yes = Math.round(prior);
    const eY = Math.round((py / 100) * yes);
    const eN = Math.round((pn / 100) * (100 - yes));
    return { yes, eY, eN };
  }, [prior, py, pn]);
  const spec = useMemo<Spec>(() => {
    const { yes, eY, eN } = counts;
    const cols = 8;
    const dx = 0.052;
    const dy = 0.068;
    const pts: Pt[] = [];
    let l = 0;
    let r = 0;
    const put = (side: 0 | 1, slot: number): [number, number] => [(side ? 0.56 : 0.02) + ((slot % cols) + 0.5) * dx, 0.9 - Math.floor(slot / cols) * dy];
    // order: yes+evidence, no+evidence (right box) ; yes without, no without (left box)
    for (let i = 0; i < 100; i++) {
      const isYes = i < yes;
      const hasEv = isYes ? i < eY : i - yes < eN;
      const [x, y] = hasEv ? put(1, r++) : put(0, l++);
      pts.push({ x, y, c: isYes ? C.mint : C.coral, a: hasEv ? 0.95 : 0.36, s: hasEv ? 5.4 : 4 });
    }
    // right box needs yes first then no: i order already gives yes (0..eY) then no.
    const total = eY + eN;
    return {
      id: "bayes",
      pts,
      under: (g, v) => {
        g.strokeStyle = rgba(C.amber, 0.5);
        g.lineWidth = 1.5;
        g.setLineDash([5, 5]);
        g.strokeRect(v.X(0.54), v.Y(0.965), v.X(1) - v.X(0.54), v.Y(0.0) - v.Y(0.965));
        g.setLineDash([]);
      },
      over: (g, v) => {
        text(g, v, `${cfg.not} · ${100 - total}`, 0.02, 1.02, { size: 13, color: "rgba(226,232,255,.6)" });
        text(g, v, `${cfg.ev} · ${total}`, 0.56, 1.02, { size: 13, color: rgba(C.amber, 1), weight: 600 });
        text(g, v, total ? `${eY} of ${total} ${cfg.yes}` : "Nobody shows this evidence", 0.56, 0.05, { size: 13.5, color: rgba(C.mint, 1), weight: 600 });
        text(g, v, `100 ${cfg.who}`, 0.02, 0.05, { size: 12, color: "rgba(226,232,255,.45)", font: "mono" });
      },
    };
  }, [counts, cfg]);
  useScene(spec);
  const shown = useGlide(post, 350);
  const ratio = post / (prior / 100);
  return (
    <Scene id="bayes">
      <Card n="2.5" q="How should new evidence change our estimate?" title="Bayes’ theorem.">
        <p>
          People tend to overreact to new evidence, or ignore it. Bayes gives the right size of the update. Start with how common something is (the <b>prior</b>), then count who shows the
          evidence.
        </p>
        <Seg value={name} onChange={load} options={BAYES.map((b) => ({ v: b.name, label: b.name }))} />
        <Slider label={`Before any evidence: share who ${cfg.yes}`} value={prior} min={1} max={99} onChange={setPrior} fmt={(v) => v + "%"} />
        <Slider label="Evidence shows up when the answer is yes" value={py} min={0} max={100} onChange={setPy} fmt={(v) => v + "%"} />
        <Slider label="Evidence shows up when the answer is no" value={pn} min={0} max={100} onChange={setPn} fmt={(v) => v + "%"} />
        <Stats>
          <Stat label="before the evidence" value={prior + "%"} />
          <Stat label="after the evidence" value={Math.round(shown * 100) + "%"} tone="amber" sub={ratio >= 1.05 ? `${ratio.toFixed(1)}× more likely` : ratio <= 0.95 ? `${Math.round((1 - ratio) * 100)}% less likely` : "Barely moves"} />
        </Stats>
        <Note kind="say">
          Many people guess 80% for the second-call example. Counting the dots inside the dashed box gives the real answer. The evidence is strong, but most prospects who book a second
          call still won&rsquo;t sign.
        </Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 2.6 Expected value

const INIT = [
  { name: "Pricing review", cost: 20000, good: 150000, bad: 0, p: 60 },
  { name: "New sales hire", cost: 90000, good: 300000, bad: 40000, p: 50 },
  { name: "Systems upgrade", cost: 50000, good: 80000, bad: 0, p: 90 },
];

export function SceneEV() {
  const [ps, setPs] = useState(INIT.map((i) => i.p));
  const [absorb, setAbsorb] = useState(30000);
  const rows = INIT.map((it, j) => {
    const p = ps[j] / 100;
    return { ...it, p, ev: p * it.good + (1 - p) * it.bad - it.cost, worst: it.bad - it.cost, best: it.good - it.cost };
  });
  const ok = rows.filter((r) => -r.worst <= absorb);
  const pick = ok.length ? ok.reduce((a, b) => (b.ev > a.ev ? b : a)) : null;
  const top = rows.reduce((a, b) => (b.ev > a.ev ? b : a));
  const spec = useMemo<Spec>(() => {
    const xs = lin(-115000, 245000);
    const bases = [0.69, 0.365, 0.04];
    const pts: Pt[] = [];
    const per = [167, 167, 166];
    rows.forEach((r, j) => {
      const n = per[j];
      const nGood = Math.round(r.p * n);
      const dead = -r.worst > absorb;
      for (let m = 0; m < n; m++) {
        const good = m < nGood;
        const slot = good ? m : m - nGood;
        pts.push({
          x: xs(good ? r.best : r.worst) + ((slot % 10) - 4.5) * 0.0105,
          y: bases[j] + 0.012 + Math.floor(slot / 10) * 0.0155,
          c: good ? C.mint : C.coral,
          a: dead ? 0.3 : 0.85,
          s: 2.1,
        });
      }
    });
    return {
      id: "ev",
      pts,
      under: (g, v) => {
        band(g, v, 0, xs(-absorb), 0, 1, "rgba(255,118,104,.07)");
        axes(g, v, { xs, xt: [-100000, -50000, 0, 50000, 100000, 150000, 200000], xf: (d) => fmtK(d), xl: "Profit after cost, in one simulated year" });
        line(g, v, [[xs(0), 0], [xs(0), 1]], "rgba(255,255,255,.3)", 1);
        bases.forEach((b) => line(g, v, [[0, b], [1, b]], "rgba(160,180,255,.14)", 1));
        if (absorb <= 85000) text(g, v, absorb > 60000 ? "too deep" : "too deep to absorb", 0.008, 0.975, { size: 10.5, color: rgba(C.coral, 0.8), font: "mono" });
      },
      over: (g, v) => {
        rows.forEach((r, j) => {
          const dead = -r.worst > absorb;
          text(g, v, r.name, 0.99, bases[j] + 0.25, { align: "right", size: 14, weight: 600, color: dead ? "rgba(226,232,255,.35)" : "rgba(240,244,255,.95)" });
          text(g, v, dead ? "worst case too deep" : pick?.name === r.name ? "best survivable bet" : "", 0.99, bases[j] + 0.205, { align: "right", size: 11, font: "mono", color: dead ? rgba(C.coral, 0.8) : rgba(C.amber, 0.95) });
          const x = v.X(xs(r.ev));
          const y = v.Y(bases[j]);
          g.fillStyle = rgba(C.amber, dead ? 0.4 : 1);
          g.beginPath();
          g.moveTo(x, y - 9);
          g.lineTo(x + 7, y);
          g.lineTo(x, y + 9);
          g.lineTo(x - 7, y);
          g.closePath();
          g.fill();
          text(g, v, "average " + fmtMoney(r.ev), xs(r.ev), bases[j] - 0.045, { align: "center", size: 11.5, font: "mono", color: rgba(C.amber, dead ? 0.45 : 1) });
        });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ps, absorb]);
  useScene(spec);
  return (
    <Scene id="ev">
      <Card n="2.6" q="Which choice pays best on average?" title="Expected value.">
        <p>
          Weigh each outcome by its chance, add them up, subtract the cost. Here each initiative is played out about 167 times. The <b>amber diamond</b> is the average result.
        </p>
        <Formula>expected value = Σ (chance × value) − cost</Formula>
        {INIT.map((it, j) => (
          <Slider key={it.name} label={`${it.name}: chance of the strong outcome`} value={ps[j]} min={0} max={100} step={5} onChange={(v) => setPs(ps.map((x, k) => (k === j ? v : x)))} fmt={(v) => v + "%"} />
        ))}
        <Slider label="Biggest loss the owner can absorb this year" value={absorb} min={10000} max={100000} step={5000} onChange={setAbsorb} fmt={(v) => fmtMoney(v)} />
        <Stats>
          <Stat label="recommended first move" value={pick ? pick.name : "None"} tone="amber" sub={pick ? `Averages ${fmtMoney(pick.ev)}, risks ${fmtMoney(-pick.worst)}` : "Every worst case is too deep"} />
          <Stat label="highest average" value={top.name} sub={fmtMoney(top.ev)} />
        </Stats>
        <Note kind="say">Compare the average and the worst case together. The math ranks the choices. The owner&rsquo;s ability to absorb a loss decides between close ones.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 2.7 Forecasting

export function SceneForecast() {
  const [alpha, setAlpha] = useState(0.3);
  const [win, setWin] = useState(3);
  const rv = useMemo(() => monthly.map((m) => m.revenue), []);
  const calc = useMemo(() => {
    const sm: number[] = [rv[0]];
    for (let t = 1; t < 30; t++) sm.push(alpha * rv[t] + (1 - alpha) * sm[t - 1]);
    const fc = sm[29];
    const hold = rv.slice(30);
    const miss = mean(hold.map((x) => Math.abs(x - fc)));
    const w = ols(rv.slice(0, 30).map((_, t) => [t]), rv.slice(0, 30));
    const trendMiss = mean(hold.map((x, k) => Math.abs(x - (w[0] + w[1] * (30 + k)))));
    const ma: (number | null)[] = rv.map((_, t) => (t >= win - 1 ? mean(rv.slice(t - win + 1, t + 1)) : null));
    const sum = (a: number, b: number) => rv.slice(a, b).reduce((x, y) => x + y, 0);
    return { sm, fc, miss, trendMiss, ma, actual: mean(hold), yoy: sum(24, 36) / sum(12, 24) - 1, cagr: Math.sqrt(sum(24, 36) / sum(0, 12)) - 1 };
  }, [alpha, win, rv]);
  const spec = useMemo<Spec>(() => {
    const xs = lin(-0.8, 35.8);
    const ys = lin(400000, 720000);
    return {
      id: "forecast",
      pts: monthly.map((m) => ({ x: xs(m.t), y: ys(m.revenue), c: m.t >= 30 ? C.amber : C.ice, s: 3.4, a: 0.95 })),
      tip: (i) => ({ title: monthly[i].label.replace(" ", " 20"), rows: [["Revenue", fmtMoney(monthly[i].revenue)], ["", i >= 30 ? "Held back to test the forecast" : "Used to build the forecast"]] }),
      under: (g, v) => {
        band(g, v, xs(29.5), 1, 0, 1, "rgba(255,201,92,.06)");
        axes(g, v, { xs, xt: [0, 6, 12, 18, 24, 30], xf: (d) => monthly[d].label, ys, yt: [450000, 550000, 650000], yf: (d) => fmtK(d), xl: "36 months of revenue for one company" });
        text(g, v, "held back", xs(32.7), 1.02, { align: "center", size: 11, font: "mono", color: rgba(C.amber, 0.85) });
        line(g, v, monthly.map((m) => [xs(m.t), ys(m.revenue)] as [number, number]), "rgba(156,176,255,.35)", 1.2);
      },
      over: (g, v) => {
        line(g, v, calc.ma.flatMap((m, t) => (m === null ? [] : [[xs(t), ys(m)] as [number, number]])), rgba(C.mint, 0.9), 2);
        line(g, v, calc.sm.map((s, t) => [xs(t), ys(s)] as [number, number]), rgba(C.violet, 0.95), 2.2);
        line(g, v, [[xs(29), ys(calc.fc)], [xs(35.6), ys(calc.fc)]], rgba(C.amber, 1), 2.4, [7, 6]);
        text(g, v, "forecast " + fmtK(calc.fc), xs(28.6), ys(calc.fc) + 0.075, { align: "right", size: 12.5, weight: 600, color: rgba(C.amber, 1) });
        text(g, v, "— moving average", 0.02, 0.95, { size: 11.5, color: rgba(C.mint, 0.95), font: "mono" });
        text(g, v, "— exponential smoothing", 0.02, 0.9, { size: 11.5, color: rgba(C.violet, 1), font: "mono" });
      },
    };
  }, [calc]);
  useScene(spec);
  return (
    <Scene id="forecast">
      <Card n="2.7" q="Where is this trend heading?" title="Growth rates and forecasting.">
        <p>
          Forecasting follows one company over time. To test it honestly, the forecast sees only the first 30 months and must predict the last six, shown in <b>amber</b>.
        </p>
        <Formula>new forecast = α × latest actual + (1 − α) × last forecast</Formula>
        <Slider label="Alpha: weight on the newest month" value={alpha} min={0.05} max={0.95} step={0.05} onChange={setAlpha} fmt={(v) => v.toFixed(2)} />
        <div className="rowlabel">Moving average window</div>
        <Seg
          value={win}
          onChange={setWin}
          options={[
            { v: 3, label: "3 months" },
            { v: 6, label: "6 months" },
            { v: 12, label: "12 months" },
          ]}
        />
        <Stats>
          <Stat label="average monthly miss on the held-back months" value={fmtK(calc.miss)} tone={calc.miss < calc.trendMiss ? "mint" : "coral"} sub={`A straight trend line misses by ${fmtK(calc.trendMiss)}`} />
          <Stat label="growth, last 12 months vs. the 12 before" value={(calc.yoy * 100).toFixed(1) + "%"} sub={`Two-year CAGR ${(calc.cagr * 100).toFixed(1)}%`} />
        </Stats>
        <Note>A higher alpha reacts faster but jumps around more. And every forecast assumes the future looks like the past: shorter forecasts are safer than longer ones.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 3.1 Train / test split

export function SceneSplit() {
  const { rev } = useStageCtx();
  const [seed, setSeed] = useState(42);
  const [hist, setHist] = useState<number[]>([]);
  const calc = useMemo(() => {
    const sp = split(seed);
    const w = logistic(sp.train.map((i) => feat(companies[i])), sp.train.map((i) => companies[i].grew));
    const pr = sp.test.map((i) => predictProb(w, feat(companies[i])));
    const y = sp.test.map((i) => companies[i].grew);
    const right = pr.map((p, k) => ((p > 0.5 ? 1 : 0) === y[k] ? 1 : 0));
    const share = mean(y);
    return { sp, right, acc: mean(right), base: Math.max(share, 1 - share), auc: auc(pr, y) };
  }, [seed]);
  const reshuffle = () => {
    setHist((h) => [...h.slice(-5), calc.acc]);
    setSeed((s) => s + 1);
  };
  const spec = useMemo<Spec>(() => {
    const r1 = Math.min(0.45, 0.285 * stageInfo.aspect);
    const r2 = r1 * 0.58;
    const c1 = r1 / stageInfo.aspect + 0.01;
    const c2 = 1 - r2 / stageInfo.aspect - 0.01;
    const bt = blob(375, c1, 0.5, r1);
    const bs = blob(125, c2, 0.5, r2);
    const pts: Pt[] = new Array(500);
    calc.sp.train.forEach((ci, k) => (pts[ci] = { x: bt[k][0], y: bt[k][1], c: C.ice, a: 0.6, s: 2.3 }));
    calc.sp.test.forEach((ci, k) => (pts[ci] = { x: bs[k][0], y: bs[k][1], c: calc.right[k] ? C.mint : C.coral, a: 0.95, s: 3 }));
    return {
      id: "split",
      pts,
      tip: (i) => tipCompany(companies[i]),
      over: (g, v) => {
        text(g, v, "375 to learn from", c1, 1.03, { align: "center", size: 14, color: rgba(C.ice, 1), weight: 600 });
        text(g, v, "125 locked away", c2, 1.03, { align: "center", size: 14, color: rgba(C.amber, 1), weight: 600 });
        text(g, v, "model was right", c2, 0.06, { align: "center", size: 11.5, font: "mono", color: rgba(C.mint, 0.95) });
        text(g, v, "model was wrong", c2, 0.015, { align: "center", size: 11.5, font: "mono", color: rgba(C.coral, 0.95) });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, rev]);
  useScene(spec);
  const acc = useGlide(calc.acc, 400);
  const all = [...hist, calc.acc];
  return (
    <Scene id="split">
      <Card n="3.1" q="Does it work on cases it never studied?" title="Training data and test data.">
        <p>
          Before training, split the data in two. The model learns from 375 companies. The other 125 are locked away, then used once to grade it. Reshuffle, and a brand-new model is
          trained in front of you.
        </p>
        <button type="button" className="btn" onClick={reshuffle}>
          Reshuffle and retrain
        </button>
        <Stats>
          <Stat label="right on companies it never saw" value={Math.round(acc * 100) + "%"} tone="mint" />
          <Stat label="always guessing the common answer" value={Math.round(calc.base * 100) + "%"} sub="The baseline to beat" />
        </Stats>
        {all.length > 1 && (
          <div className="hist">
            <span>Each split so far</span>
            <div>
              {all.map((a, i) => (
                <b key={i} className={i === all.length - 1 ? "now" : ""}>
                  {Math.round(a * 100)}%
                </b>
              ))}
            </div>
            <em>
              Same data, same method, different luck: {Math.round(Math.min(...all) * 100)}% to {Math.round(Math.max(...all) * 100)}%. Averaging several splits is called cross-validation.
            </em>
          </div>
        )}
        <Note>A score means nothing on its own. If a model can&rsquo;t beat the simplest possible guess, it isn&rsquo;t learning anything useful, however advanced it looks.</Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 3.3 Confusion matrix and the cutoff

export function SceneCutoff() {
  const [cut, setCut] = useState(50);
  const calc = useMemo(() => {
    const w = growthModel().w;
    const te = BASE_SPLIT.test;
    const pr = te.map((i) => predictProb(w, feat(companies[i])));
    return { te, pr };
  }, []);
  const m = useMemo(() => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    calc.te.forEach((ci, k) => {
      const flag = calc.pr[k] < cut / 100;
      const bad = !companies[ci].grew;
      if (flag && bad) tp++;
      else if (flag) fp++;
      else if (bad) fn++;
      else tn++;
    });
    return { tp, fp, fn, tn };
  }, [cut, calc]);
  const spec = useMemo<Spec>(() => {
    const pts: Pt[] = companies.map(() => ({ x: 0.5, y: 0.5, c: C.ice, a: 0, s: 2 }));
    const slots = [0, 0, 0, 0];
    const order = calc.te.map((ci, k) => ({ ci, p: calc.pr[k] })).sort((a, b) => a.p - b.p);
    const cols = 9;
    order.forEach(({ ci, p }) => {
      const flag = p < cut / 100;
      const bad = !companies[ci].grew;
      const q = flag ? (bad ? 0 : 2) : bad ? 1 : 3; // 0 caught, 1 missed, 2 false alarm, 3 cleared
      const s = slots[q]++;
      const bx = q % 2 === 0 ? 0.04 : 0.53;
      const by = q < 2 ? 0.9 : 0.4;
      pts[ci] = { x: bx + 0.03 + (s % cols) * 0.047, y: by - Math.floor(s / cols) * 0.054, c: [C.mint, C.coral, C.amber, C.ice][q], a: q === 3 ? 0.6 : 0.95, s: 3.2 };
    });
    return {
      id: "cutoff",
      pts,
      tip: (i) => {
        const k = calc.te.indexOf(i);
        if (k < 0) return null;
        const t = tipCompany(companies[i]);
        t.rows.unshift(["Model’s chance of growing", Math.round(calc.pr[k] * 100) + "%"]);
        return t;
      },
      under: (g, v) => {
        g.strokeStyle = "rgba(160,180,255,.2)";
        g.lineWidth = 1;
        for (const [x0, y0] of [[0.02, 0.5], [0.51, 0.5], [0.02, 0], [0.51, 0]] as const) g.strokeRect(v.X(x0), v.Y(y0 + 0.48), v.X(0.47) - v.X(0), v.Y(0) - v.Y(0.48));
        text(g, v, "FLAGGED “AT RISK”", 0.255, 1.03, { align: "center", size: 11, font: "mono", color: "rgba(226,232,255,.6)" });
        text(g, v, "NOT FLAGGED", 0.745, 1.03, { align: "center", size: 11, font: "mono", color: "rgba(226,232,255,.6)" });
      },
      over: (g, v) => {
        const lab = (s: string, n: number, x: number, y: number, c: string) => text(g, v, `${s} · ${n}`, x, y, { size: 12.5, weight: 600, color: c });
        lab(v.mobile ? "Caught" : "Caught: really struggled", m.tp, 0.04, 0.525, rgba(C.mint, 1));
        lab(v.mobile ? "Missed" : "Missed: struggled, not flagged", m.fn, 0.53, 0.525, rgba(C.coral, 1));
        lab(v.mobile ? "False alarm" : "False alarm: actually grew", m.fp, 0.04, 0.025, rgba(C.amber, 1));
        lab(v.mobile ? "Left alone" : "Left alone: grew", m.tn, 0.53, 0.025, rgba(C.ice, 1));
      },
    };
  }, [cut, calc, m]);
  useScene(spec);
  const prec = m.tp + m.fp ? m.tp / (m.tp + m.fp) : 0;
  const rec = m.tp / (m.tp + m.fn);
  return (
    <Scene id="cutoff">
      <Card n="3.3" q="How far off is it, and in which direction?" title="Four ways to be right or wrong.">
        <p>
          A yes-or-no model can be right in two ways and wrong in two ways. Where you draw the line between &ldquo;at risk&rdquo; and &ldquo;fine&rdquo; is a business choice. Move it
          and watch 125 test companies change boxes.
        </p>
        <Slider label="Flag a company unless its chance of growing is at least" value={cut} min={25} max={85} step={1} onChange={setCut} fmt={(v) => v + "%"} />
        <Stats>
          <Stat label="Recall: struggling companies caught" value={Math.round(rec * 100) + "%"} tone="mint" sub={`${m.tp} of ${m.tp + m.fn}`} />
          <Stat label="Precision: flags that were right" value={Math.round(prec * 100) + "%"} tone="amber" sub={`${m.tp} of ${m.tp + m.fp}`} />
          <Stat label="Accuracy: right answers overall" value={Math.round(((m.tp + m.tn) / 125) * 100) + "%"} />
        </Stats>
        <Note kind="say">
          If missing a struggling client is expensive and a check-in call is cheap, as is usually true for an advisory firm, favour recall and raise the cutoff. If each flag triggers
          costly work, favour precision.
        </Note>
      </Card>
    </Scene>
  );
}

// ---------------------------------------------------------------- 3.5 Overfitting

export function SceneOverfit() {
  const [depth, setDepth] = useState(2);
  const [show, setShow] = useState<"train" | "test">("train");
  const xy = (i: number) => [companies[i].assess, companies[i].growth];
  const calc = useMemo(() => {
    const tr = BASE_SPLIT.train;
    const te = BASE_SPLIT.test;
    const tree = buildTree(tr.map(xy), tr.map((i) => companies[i].grew), depth);
    const acc = (ix: number[]) => mean(ix.map((i) => ((treePredict(tree, xy(i)) > 0.5 ? 1 : 0) === companies[i].grew ? 1 : 0)));
    const regions = treeRegions(tree, { x0: 20, x1: 100, y0: -20, y1: 24, p: 0 });
    const share = mean(te.map((i) => companies[i].grew));
    const w = growthModel().w;
    const simple = mean(te.map((i) => ((predictProb(w, feat(companies[i])) > 0.5 ? 1 : 0) === companies[i].grew ? 1 : 0)));
    return { train: acc(tr), test: acc(te), regions, base: Math.max(share, 1 - share), simple };
  }, [depth]);
  const spec = useMemo<Spec>(() => {
    const xs = lin(20, 100);
    const ys = lin(-20, 24);
    const inTest = new Set(BASE_SPLIT.test);
    return {
      id: "overfit",
      pts: companies.map((c, i) => {
        const on = (show === "test") === inTest.has(i);
        return { x: xs(c.assess), y: ys(clamp(c.growth, -20, 24)), c: c.grew ? C.mint : C.coral, a: on ? 0.95 : 0.0, s: on ? 2.8 : 1.5 };
      }),
      tip: (i) => tipCompany(companies[i]),
      under: (g, v) => {
        for (const r of calc.regions) {
          const s = Math.abs(r.p - 0.5) * 2;
          g.fillStyle = r.p >= 0.5 ? `rgba(84,232,190,${0.05 + s * 0.2})` : `rgba(255,118,104,${0.05 + s * 0.22})`;
          g.fillRect(v.X(xs(r.x0)), v.Y(ys(r.y1)), v.X(xs(r.x1)) - v.X(xs(r.x0)), v.Y(ys(r.y0)) - v.Y(ys(r.y1)));
          g.strokeStyle = "rgba(7,11,20,.7)";
          g.lineWidth = 1;
          g.strokeRect(v.X(xs(r.x0)), v.Y(ys(r.y1)), v.X(xs(r.x1)) - v.X(xs(r.x0)), v.Y(ys(r.y0)) - v.Y(ys(r.y1)));
        }
        axes(g, v, { xs, xt: [20, 40, 60, 80, 100], xl: "Assessment score", ys, yt: [-10, 0, 10, 20], yf: (d) => d + "%", yl: "Revenue growth this year" });
      },
      over: (g, v) => {
        text(g, v, `${calc.regions.length} region${calc.regions.length > 1 ? "s" : ""} · green = “will grow”`, 0.015, 1.03, { size: 11.5, font: "mono", color: "rgba(226,232,255,.6)" });
      },
    };
  }, [calc, show]);
  useScene(spec);
  const gap = calc.train - calc.test;
  return (
    <Scene id="overfit">
      <Card n="3.5" q="Did it learn patterns, or memorise examples?" title="Overfitting.">
        <p>
          A <b>decision tree</b> splits companies with a series of yes-or-no questions. Let it ask more questions and it carves the map into ever smaller boxes, until it has memorised
          every training company, quirks included.
        </p>
        <Slider label="Questions the tree may ask in a row (depth)" value={depth} min={1} max={14} onChange={setDepth} />
        <Seg
          value={show}
          onChange={setShow}
          options={[
            { v: "train", label: "Companies it studied" },
            { v: "test", label: "Companies it never saw" },
          ]}
        />
        <div className="bars2">
          <div>
            <span>Training score</span>
            <i className="b-ice" style={{ width: calc.train * 100 + "%" }} />
            <b>{Math.round(calc.train * 100)}%</b>
          </div>
          <div>
            <span>Test score</span>
            <i className={gap > 0.15 ? "b-coral" : "b-mint"} style={{ width: calc.test * 100 + "%" }} />
            <b>{Math.round(calc.test * 100)}%</b>
          </div>
          <div>
            <span>Plain logistic regression, test</span>
            <i className="b-amber" style={{ width: calc.simple * 100 + "%" }} />
            <b>{Math.round(calc.simple * 100)}%</b>
          </div>
          <div>
            <span>Simple guess</span>
            <i className="b-dim" style={{ width: calc.base * 100 + "%" }} />
            <b>{Math.round(calc.base * 100)}%</b>
          </div>
        </div>
        <Note kind="say">
          {gap > 0.15
            ? "A big gap between the training score and the test score is the first sign of overfitting. It looks brilliant on the data it studied and fails on anything new."
            : "With only a few questions the tree stays honest: its training score and test score sit close together."}{" "}
          Start simple, and add complexity only when it improves the test score.
        </Note>
      </Card>
    </Scene>
  );
}
