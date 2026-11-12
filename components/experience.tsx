"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Spec } from "@/lib/stage";
import { Chapter, Listen, Scene, StageCtx } from "./core";
import { Stage } from "./stage";
import { SceneCorr, SceneData, SceneLine, SceneLogit, SceneMulti, SceneTypes, SceneZ } from "./scenes-a";
import { SceneBayes, SceneCutoff, SceneEV, SceneForecast, SceneOverfit, SceneSplit } from "./scenes-b";
import { SceneDrift, SceneFair, SceneList, SceneMonte, SceneShrink, SceneSmall } from "./scenes-c";

const HERO: Spec = { id: "hero", swarm: true, pts: [] };
const OUTRO: Spec = { id: "outro", swarm: true, pts: [] };

const CHAPTERS = [
  { id: "ch1", n: "01", name: "What machine learning is", scenes: ["ch1", "data", "types"] },
  { id: "ch2", n: "02", name: "The seven formulas", scenes: ["ch2", "z", "corr", "line", "multi", "logit", "bayes", "ev", "forecast"] },
  { id: "ch3", n: "03", name: "Is the model any good?", scenes: ["ch3", "split", "cutoff", "overfit"] },
  { id: "ch4", n: "04", name: "When not to trust a model", scenes: ["ch4", "small", "drift"] },
  { id: "ch5", n: "05", name: "Predicting people responsibly", scenes: ["ch5", "fair"] },
  { id: "ch6", n: "06", name: "Forecasting futures", scenes: ["ch6", "monte", "shrink"] },
  { id: "ch7", n: "07", name: "The call list", scenes: ["ch7", "list"] },
];

export default function Experience() {
  const specs = useRef<Record<string, Spec>>({ hero: HERO, outro: OUTRO });
  const specRef = useRef<Spec>(HERO);
  const activeRef = useRef("hero");
  const [active, setActive] = useState("hero");
  const [rev, setRev] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);

  const publish = useCallback((spec: Spec) => {
    specs.current[spec.id] = spec;
    if (activeRef.current === spec.id) specRef.current = spec;
  }, []);

  const onResize = useCallback(() => setRev((r) => r + 1), []);

  useEffect(() => {
    activeRef.current = active;
    specRef.current = specs.current[active] ?? HERO;
  }, [active]);

  useEffect(() => {
    const mobile = window.innerWidth < 900;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.scene!);
      },
      { rootMargin: mobile ? "-74% 0px -26% 0px" : "-50% 0px -50% 0px" },
    );
    document.querySelectorAll("[data-scene]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rev]);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleAudio = useCallback(
    (src: string) => {
      if (!audio.current) {
        audio.current = new Audio();
        audio.current.addEventListener("ended", () => setPlaying(null));
      }
      const a = audio.current;
      if (playing === src) {
        a.pause();
        setPlaying(null);
        return;
      }
      a.src = src;
      a.currentTime = 0;
      a.play().then(
        () => setPlaying(src),
        () => setPlaying(null),
      );
    },
    [playing],
  );

  const ctx = useMemo(() => ({ active, rev, publish, playing, toggleAudio }), [active, rev, publish, playing, toggleAudio]);
  const chapter = CHAPTERS.find((c) => c.scenes.includes(active));
  const swarm = active === "hero" || active === "outro";

  return (
    <StageCtx.Provider value={ctx}>
      <div className={`app ${swarm ? "mode-swarm" : "mode-plot"}`}>
        <div className="bg" aria-hidden="true" />
        <div className="backdrop" aria-hidden="true" />
        <Stage specRef={specRef} onResize={onResize} />

        <header className="topbar">
          <a href="#hero" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            GroundSwell<sup>SM</sup>
            <em>Machine Learning Playbook</em>
          </a>
          <div className={`where ${chapter ? "show" : ""}`}>
            {chapter && (
              <>
                <b>{chapter.n}</b>
                {chapter.name}
              </>
            )}
          </div>
          <i className="progress" style={{ transform: `scaleX(${progress})` }} />
        </header>

        <nav className="rail" aria-label="Chapters">
          {CHAPTERS.map((c) => (
            <a key={c.id} href={"#" + c.id} className={chapter?.id === c.id ? "on" : ""} aria-label={`Chapter ${c.n}: ${c.name}`}>
              <span>{c.name}</span>
              <i />
            </a>
          ))}
        </nav>

        <main>
          <Scene id="hero" className="scene-hero">
            <div className="hero">
              <p className="hero-k">The GroundSwell℠ Machine Learning Playbook · Interactive edition</p>
              <h1>
                See the patterns
                <br />a spreadsheet <em>hides.</em>
              </h1>
              <p className="hero-sub">
                Seven formulas. 500 sample companies. Every prediction on this page is computed live, in your browser, as you touch it.
              </p>
              <div className="hero-cta">
                <a className="btn btn-lg" href="#ch1">
                  Begin
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <Listen src="/audio/ch1.mp3" secs={17} />
              </div>
              <ul className="hero-steps">
                <li>
                  <b>Describe</b>what is normal
                </li>
                <li>
                  <b>Relate</b>what moves together
                </li>
                <li>
                  <b>Predict</b>what is likely
                </li>
                <li>
                  <b>Decide</b>what to do
                </li>
              </ul>
            </div>
            <div className="scroll-hint" aria-hidden="true">
              <span />
            </div>
          </Scene>

          <Chapter
            id="ch1"
            num="1"
            kicker="What machine learning is"
            title={
              <>
                We don&rsquo;t write the rules.
                <br />
                The computer <em>finds</em> them.
              </>
            }
            lead="Machine learning is a way to make predictions by learning patterns from many past examples. It sees patterns people miss, it judges every case the same way, and it gets better with more data. It is not magic, and it is not certain."
            audio="/audio/ch1.mp3"
            secs={17}
          />
          <SceneData />
          <SceneTypes />

          <Chapter
            id="ch2"
            num="2"
            kicker="The seven formulas"
            title={
              <>
                Seven formulas.
                <br />
                One for each <em>question.</em>
              </>
            }
            lead="Together they move from describing what happened to deciding what to do next. Each one is live below: change an input and the same 500 companies rearrange themselves around the answer."
            audio="/audio/ch2.mp3"
            secs={17}
          >
            <ol className="seven">
              {[
                ["z", "How does this compare to normal?"],
                ["corr", "Do these two things move together?"],
                ["line", "How much does a driver matter?"],
                ["logit", "What is the chance of yes or no?"],
                ["bayes", "How should new evidence change our estimate?"],
                ["ev", "Which choice pays best on average?"],
                ["forecast", "Where is this trend heading?"],
              ].map(([id, q]) => (
                <li key={id}>
                  <a href={"#" + id}>{q}</a>
                </li>
              ))}
            </ol>
          </Chapter>
          <SceneZ />
          <SceneCorr />
          <SceneLine />
          <SceneMulti />
          <SceneLogit />
          <SceneBayes />
          <SceneEV />
          <SceneForecast />

          <Chapter
            id="ch3"
            num="3"
            kicker="Is the model any good?"
            title={
              <>
                A model is only as good
                <br />
                as its <em>checks.</em>
              </>
            }
            lead="A model is worth using only if it predicts new cases better than a simple guess, and if its findings are real rather than luck. Test it on data it hasn’t seen. Compare it with the obvious guess. Measure its errors. Watch for memorising."
            audio="/audio/ch3.mp3"
            secs={16}
          />
          <SceneSplit />
          <SceneCutoff />
          <SceneOverfit />

          <Chapter
            id="ch4"
            num="4"
            kicker="When not to trust a model"
            title={
              <>
                Five traps cause
                <br />
                most <em>mistakes.</em>
              </>
            }
            lead="Small samples. Mistaking correlation for cause. Data that leaves out the failures. Facts the model shouldn’t know yet. And a world that changes after the model is built. Each one can be spotted before it does harm."
            audio="/audio/ch4.mp3"
            secs={18}
          />
          <SceneSmall />
          <SceneDrift />

          <Chapter
            id="ch5"
            num="5"
            kicker="Predicting people responsibly"
            title={
              <>
                A spreadsheet is one thing.
                <br />A <em>career</em> is another.
              </>
            }
            lead="Models about people can help, by showing who needs support early. They can also do real harm, by quietly repeating old unfairness at scale. So predictions about people follow firm rules."
            audio="/audio/ch5.mp3"
            secs={17}
          />
          <SceneFair />

          <Chapter
            id="ch6"
            num="6"
            kicker="Forecasting futures"
            title={
              <>
                One starting point.
                <br />A <em>range</em> of futures.
              </>
            }
            lead="Decisions to partner, invest, hire or keep need more than one best estimate. They need the range of what could happen, the chance of a bad outcome, and how much to trust a small amount of data."
            audio="/audio/ch6.mp3"
            secs={15}
          />
          <SceneMonte />
          <SceneShrink />

          <Chapter
            id="ch7"
            num="7"
            kicker="The call list"
            title={
              <>
                Everything, in one
                <br />
                <em>project.</em>
              </>
            }
            lead="Which clients are likely to grow next year, and which ones need help now? Load, explore, train, test, explain, score. The answer is a list an advisor can act on this week."
            audio="/audio/ch7.mp3"
            secs={15}
          />
          <SceneList />

          <Scene id="outro" className="scene-outro">
            <div className="outro">
              <p className="hero-k">Three lessons matter most</p>
              <div className="lessons">
                <article>
                  <span>1</span>
                  <h3>A model is only as good as its checks.</h3>
                  <p>Test it on new data, compare it with a simple guess and confirm that its findings are real. A model that skips these steps can look impressive and still be wrong.</p>
                </article>
                <article>
                  <span>2</span>
                  <h3>Start simple.</h3>
                  <p>A plain regression predicted new companies better than a more complex model did. Add complexity only when it improves results on data the model hasn&rsquo;t seen.</p>
                </article>
                <article>
                  <span>3</span>
                  <h3>Models support people. They don&rsquo;t replace them.</h3>
                  <p>The best uses point an advisor to where help is needed first, with clear reasons. Decisions about people stay with people.</p>
                </article>
              </div>
              <div className="build">
                <div>
                  <h4>A suggested build order for GroundSwellONE</h4>
                  <ol>
                    <li>
                      <b>Measure well first.</b> Confirm that assessments and expert ratings are consistent.
                    </li>
                    <li>
                      <b>Start capturing outcomes now.</b> This history can&rsquo;t be rebuilt later.
                    </li>
                    <li>
                      <b>Build the first simple predictions.</b> Each tested against a simple guess.
                    </li>
                    <li>
                      <b>Add forecasting with ranges.</b> Never a forecast without its range.
                    </li>
                    <li>
                      <b>Test what works.</b> Prediction asks who is likely to struggle. Experiments answer what actually helps them.
                    </li>
                  </ol>
                </div>
                <div>
                  <h4>Also in the written playbook</h4>
                  <ul>
                    <li>Confidence intervals and p-values (3.4)</li>
                    <li>The minimum Python, in six weeks (6)</li>
                    <li>Prediction intervals and time-to-event models (8)</li>
                    <li>Checking that leadership scores can be trusted (9)</li>
                    <li>Calibration, Brier score and regularization (10)</li>
                    <li>Simple experiments that prove what works (11)</li>
                  </ul>
                </div>
              </div>
              <p className="disclaimer">
                All examples use simulated sample data: 500 owner-managed companies, 300 managers and 36 months of revenue for one company. The numbers show how each method works. They
                are not findings about any real client, and because the data is regenerated here, live figures differ slightly from the printed playbook. Section 5 describes good
                practice and is not legal advice.
              </p>
              <a className="btn btn-lg" href="#hero">
                Back to the top
              </a>
              <p className="copyright">© GroundSwell℠ 2026 · Narration generated with ElevenLabs</p>
            </div>
          </Scene>
        </main>
      </div>
    </StageCtx.Provider>
  );
}
