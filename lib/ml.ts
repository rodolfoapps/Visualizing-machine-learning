// Small, dependency-free statistics and machine learning helpers.
// Everything on the site is computed live in the browser with these.

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function mean(a: number[]) {
  let s = 0;
  for (const v of a) s += v;
  return a.length ? s / a.length : 0;
}

export function sd(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return Math.sqrt(s / (a.length - 1));
}

export function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function corr(x: number[], y: number[]) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Solve A x = b for a small dense system (Gaussian elimination with pivoting). */
function solve(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Least-squares regression. Returns [intercept, ...weights]. */
export function ols(X: number[][], y: number[]) {
  const k = X[0].length + 1;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = [1, ...X[i]];
    for (let p = 0; p < k; p++) {
      b[p] += row[p] * y[i];
      for (let q = 0; q < k; q++) A[p][q] += row[p] * row[q];
    }
  }
  return solve(A, b);
}

export const predictLin = (w: number[], x: number[]) => {
  let s = w[0];
  for (let i = 0; i < x.length; i++) s += w[i + 1] * x[i];
  return s;
};

/** Logistic regression fitted with Newton's method. Returns [intercept, ...weights]. */
export function logistic(X: number[][], y: number[], iters = 25) {
  const k = X[0].length + 1;
  let w = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: k }, (_, i) => {
      const r = new Array(k).fill(0);
      r[i] = 1e-6;
      return r;
    });
    const g = new Array(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      const row = [1, ...X[i]];
      let z = 0;
      for (let p = 0; p < k; p++) z += w[p] * row[p];
      const pr = sigmoid(z);
      const s = pr * (1 - pr);
      for (let p = 0; p < k; p++) {
        g[p] += (y[i] - pr) * row[p];
        for (let q = 0; q < k; q++) H[p][q] += s * row[p] * row[q];
      }
    }
    const step = solve(H, g);
    w = w.map((v, i) => v + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  return w;
}

export const predictProb = (w: number[], x: number[]) => sigmoid(predictLin(w, x));

/** Area under the ROC curve: how well scores rank the yes cases above the no cases. */
export function auc(scores: number[], y: number[]) {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0;
  let pos = 0;
  for (let r = 0; r < idx.length; r++) {
    if (y[idx[r]] === 1) {
      rankSum += r + 1;
      pos++;
    }
  }
  const neg = y.length - pos;
  return pos && neg ? (rankSum - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
}

// ---------- Decision tree (for the overfitting demo) ----------

export type TreeNode =
  | { leaf: true; p: number; n: number }
  | { leaf: false; f: number; t: number; l: TreeNode; r: TreeNode };

export function buildTree(X: number[][], y: number[], maxDepth: number, depth = 0): TreeNode {
  const n = y.length;
  let pos = 0;
  for (const v of y) pos += v;
  if (depth >= maxDepth || pos === 0 || pos === n || n < 2) return { leaf: true, p: pos / n, n };
  let best = { g: Infinity, f: -1, t: 0 };
  const nf = X[0].length;
  for (let f = 0; f < nf; f++) {
    const order = y.map((_, i) => i).sort((a, b) => X[a][f] - X[b][f]);
    let lp = 0;
    for (let i = 0; i < n - 1; i++) {
      lp += y[order[i]];
      const a = X[order[i]][f];
      const b = X[order[i + 1]][f];
      if (a === b) continue;
      const ln = i + 1;
      const rn = n - ln;
      const rp = pos - lp;
      const gini = ln * (1 - (lp / ln) ** 2 - (1 - lp / ln) ** 2) + rn * (1 - (rp / rn) ** 2 - (1 - rp / rn) ** 2);
      if (gini < best.g) best = { g: gini, f, t: (a + b) / 2 };
    }
  }
  if (best.f < 0) return { leaf: true, p: pos / n, n };
  const li: number[] = [];
  const ri: number[] = [];
  for (let i = 0; i < n; i++) (X[i][best.f] <= best.t ? li : ri).push(i);
  return {
    leaf: false,
    f: best.f,
    t: best.t,
    l: buildTree(li.map((i) => X[i]), li.map((i) => y[i]), maxDepth, depth + 1),
    r: buildTree(ri.map((i) => X[i]), ri.map((i) => y[i]), maxDepth, depth + 1),
  };
}

export function treePredict(node: TreeNode, x: number[]): number {
  let cur = node;
  while (!cur.leaf) cur = x[cur.f] <= cur.t ? cur.l : cur.r;
  return cur.p;
}

export type Region = { x0: number; x1: number; y0: number; y1: number; p: number };

/** Flatten a two-feature tree into the rectangles it carves the plane into. */
export function treeRegions(node: TreeNode, box: Region, out: Region[] = []) {
  if (node.leaf) {
    out.push({ ...box, p: node.p });
    return out;
  }
  if (node.f === 0) {
    treeRegions(node.l, { ...box, x1: Math.min(box.x1, node.t) }, out);
    treeRegions(node.r, { ...box, x0: Math.max(box.x0, node.t) }, out);
  } else {
    treeRegions(node.l, { ...box, y1: Math.min(box.y1, node.t) }, out);
    treeRegions(node.r, { ...box, y0: Math.max(box.y0, node.t) }, out);
  }
  return out;
}

// ---------- k-means (for the "finding groups" demo) ----------

export function kmeans(P: number[][], k: number, seed = 7) {
  const r = rng(seed);
  let cent = Array.from({ length: k }, () => [...P[Math.floor(r() * P.length)]]);
  let lab = new Array(P.length).fill(0);
  for (let it = 0; it < 30; it++) {
    lab = P.map((p) => {
      let b = 0;
      let bd = Infinity;
      cent.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
        if (d < bd) {
          bd = d;
          b = j;
        }
      });
      return b;
    });
    cent = cent.map((c, j) => {
      const m = P.filter((_, i) => lab[i] === j);
      return m.length ? [mean(m.map((p) => p[0])), mean(m.map((p) => p[1]))] : c;
    });
  }
  return { lab, cent };
}
