// Simulated sample data, built to behave like the playbook's sample files:
// 500 owner-managed companies, 300 managers and 36 months of revenue.
// Nothing here describes a real company or person.

import { rng, gauss, clamp, logistic, ols, mean, sd, sigmoid } from "./ml";

export type Company = {
  id: string;
  industry: string;
  employees: number;
  years: number;
  revenue: number;
  growth: number; // revenue growth this year, %
  margin: number; // profit margin, %
  assess: number; // assessment score 0-100
  hours: number; // owner hours per week
  turnover: number; // team turnover, %
  nextGrowth: number; // label: growth next year, %
  grew: number; // label: 1 = grew next year
  leak: number; // next year's first-quarter growth: a fact we should NOT know yet
};

export type Manager = {
  id: string;
  experience: number;
  team: number;
  coaching: number;
  review: number;
  engagement: number;
  turnover: number;
  success: number;
};

export const INDUSTRIES: { name: string; n: number; margin: number }[] = [
  { name: "Construction", n: 117, margin: 7.7 },
  { name: "Professional services", n: 80, margin: 15.8 },
  { name: "Retail", n: 90, margin: 6.0 },
  { name: "Healthcare", n: 75, margin: 12.5 },
  { name: "Manufacturing", n: 78, margin: 9.5 },
  { name: "Hospitality", n: 60, margin: 8.0 },
];

function makeCompanies(): Company[] {
  const r = rng(20261104);
  const list: Company[] = [];
  const inds: string[] = [];
  INDUSTRIES.forEach((d) => {
    for (let i = 0; i < d.n; i++) inds.push(d.name);
  });
  // shuffle so industries are mixed through the ID range
  for (let i = inds.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [inds[i], inds[j]] = [inds[j], inds[i]];
  }
  for (let i = 0; i < 500; i++) {
    const ind = INDUSTRIES.find((d) => d.name === inds[i])!;
    const assess = clamp(Math.round(62 + 12 * gauss(r)), 25, 96);
    const da = assess - 62;
    const turnover = clamp(17.7 - 0.2 * da + 6.2 * gauss(r), 2, 42);
    const hours = clamp(Math.round(52 - 0.3 * da + 6 * gauss(r)), 32, 80);
    const growth = 2 + 0.1 * da + 7.2 * gauss(r);
    const margin = ind.margin + 0.05 * da + 3.5 * gauss(r);
    const revenue = Math.round((5.75e6 * Math.exp(0.747 * gauss(r))) / 1e4) * 1e4;
    const employees = Math.max(4, Math.round((revenue / 165000) * Math.exp(0.25 * gauss(r))));
    const years = clamp(Math.round(4 + 22 * r() * r() + 6 * r()), 2, 45);
    const nextGrowth = -3.8 + 0.1 * assess + 0.24 * growth + 0.19 * margin - 0.17 * turnover + 4.6 * gauss(r);
    list.push({
      id: "C-" + String(i + 1).padStart(4, "0"),
      industry: ind.name,
      employees,
      years,
      revenue,
      growth: Math.round(growth * 10) / 10,
      margin: Math.round(margin * 10) / 10,
      assess,
      hours,
      turnover: Math.round(turnover * 10) / 10,
      nextGrowth: Math.round(nextGrowth * 10) / 10,
      grew: nextGrowth > 0 ? 1 : 0,
      leak: nextGrowth + 1.2 * gauss(r),
    });
  }
  return list;
}

function makeManagers(): Manager[] {
  const r = rng(300087);
  const list: Manager[] = [];
  for (let i = 0; i < 300; i++) {
    const experience = clamp(Math.round(1 + 14 * r() * r() + 3 * r()), 1, 22);
    const team = clamp(Math.round(7 + 2.5 * gauss(r)), 3, 14);
    const coaching = clamp(Math.round((5 + 2.9 * gauss(r)) * 2) / 2, 0, 14);
    const review = clamp(Math.round((3.5 + 0.07 * (coaching - 5) + 0.48 * gauss(r)) * 10) / 10, 1.5, 5);
    const engagement = clamp(Math.round(30.6 + 2.4 * coaching + 5.0 * review + 0.3 * experience + 4.9 * gauss(r)), 20, 98);
    const turnover = clamp(19.1 - 0.28 * (engagement - 62) + 4.8 * gauss(r), 0, 45);
    const z = 0.08 + 0.107 * (engagement - 58) + 0.6 * (review - 3.6) + 0.02 * (experience - 6);
    list.push({
      id: "M-" + String(i + 1).padStart(4, "0"),
      experience,
      team,
      coaching,
      review,
      engagement,
      turnover: Math.round(turnover * 10) / 10,
      success: r() < sigmoid(z) ? 1 : 0,
    });
  }
  return list;
}

function makeMonthly() {
  const r = rng(215);
  const season = [1.0, 1.1, 0.93, 0.98, 1.04, 1.05, 1.0, 0.99, 0.96, 0.97, 0.99, 0.99]; // Nov..Oct
  const raw: number[] = [];
  for (let t = 0; t < 36; t++) raw.push((478 + 3.2 * t + 0.02 * t * t) * season[t % 12] * (1 + 0.022 * gauss(r)));
  const first = raw.slice(0, 12).reduce((a, b) => a + b, 0);
  const k = 6000 / first; // first twelve months sum to $6.00M
  const names = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  return raw.map((v, t) => ({
    t,
    label: names[t % 12] + " " + String(2023 + Math.floor((t + 10) / 12)).slice(2),
    revenue: Math.round(v * k) * 1000,
  }));
}

export const companies = makeCompanies();
export const managers = makeManagers();
export const monthly = makeMonthly();

export const DRIVERS = [
  { key: "assess", label: "Assessment score", short: "Assessment", unit: "", min: 25, max: 96, step: 1 },
  { key: "growth", label: "Revenue growth this year", short: "Growth this year", unit: "%", min: -15, max: 20, step: 0.5 },
  { key: "turnover", label: "Team turnover", short: "Turnover", unit: "%", min: 2, max: 40, step: 0.5 },
  { key: "margin", label: "Profit margin", short: "Margin", unit: "%", min: -5, max: 25, step: 0.5 },
] as const;

export type DriverKey = (typeof DRIVERS)[number]["key"];
export const feat = (c: Company) => [c.assess, c.growth, c.turnover, c.margin];

// The weights printed in the playbook (Sections 2.3 and 2.4).
// Order: intercept, assessment, growth this year, turnover, margin.
export const BOOK_LINEAR = [-3.64, 0.1, 0.24, -0.17, 0.19];
export const BOOK_LOGIT = [-1.28, 0.036, 0.061, -0.053, 0.046];

/** A fixed 375 / 125 train-test split, like the playbook's. */
export function split(seed: number) {
  const r = rng(seed);
  const idx = companies.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { train: idx.slice(0, 375), test: idx.slice(375) };
}

export const BASE_SPLIT = split(42);

let _fit: { w: number[]; lin: number[] } | null = null;
/** The growth model, trained once on the 375 training companies. */
export function growthModel() {
  if (!_fit) {
    const X = BASE_SPLIT.train.map((i) => feat(companies[i]));
    _fit = {
      w: logistic(X, BASE_SPLIT.train.map((i) => companies[i].grew)),
      lin: ols(X, BASE_SPLIT.train.map((i) => companies[i].nextGrowth)),
    };
  }
  return _fit;
}

export const AVG = {
  assess: mean(companies.map((c) => c.assess)),
  growth: mean(companies.map((c) => c.growth)),
  turnover: mean(companies.map((c) => c.turnover)),
  margin: mean(companies.map((c) => c.margin)),
};
export const SD = {
  assess: sd(companies.map((c) => c.assess)),
  growth: sd(companies.map((c) => c.growth)),
  turnover: sd(companies.map((c) => c.turnover)),
  margin: sd(companies.map((c) => c.margin)),
};
