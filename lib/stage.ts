// Shared types and drawing helpers for the particle stage.
import { rng } from "./ml";

export type RGB = [number, number, number];

export const C: Record<string, RGB> = {
  ice: [156, 176, 255],
  mint: [84, 232, 190],
  coral: [255, 118, 104],
  amber: [255, 201, 92],
  violet: [182, 146, 255],
  sky: [98, 198, 255],
  white: [240, 244, 255],
  dim: [110, 122, 160],
};

export const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** One particle's target: x and y are 0..1 inside the plot area (y points up). */
export type Pt = { x: number; y: number; c: RGB; a?: number; s?: number };

export type View = {
  x0: number;
  y0: number;
  w: number;
  h: number;
  W: number;
  H: number;
  u: number; // size unit
  t: number; // seconds
  mobile: boolean;
  X: (n: number) => number;
  Y: (n: number) => number;
  sans: string;
  mono: string;
  serif: string;
};

export type Tip = { title: string; rows: [string, string][] };

export type Spec = {
  id: string;
  swarm?: boolean;
  pts: Pt[];
  under?: (g: CanvasRenderingContext2D, v: View) => void;
  over?: (g: CanvasRenderingContext2D, v: View) => void;
  tip?: (i: number) => Tip | null;
  pick?: (i: number) => void;
};

/** Updated by the stage on resize, so scenes can lay out round shapes. */
export const stageInfo = { aspect: 1.25, mobile: false };

export type Scale = ((d: number) => number) & { d0: number; d1: number };
export function lin(d0: number, d1: number): Scale {
  const f = ((d: number) => (d - d0) / (d1 - d0)) as Scale;
  f.d0 = d0;
  f.d1 = d1;
  return f;
}

type AxisOpt = {
  xs?: Scale;
  xt?: number[];
  xf?: (d: number) => string;
  xl?: string;
  ys?: Scale;
  yt?: number[];
  yf?: (d: number) => string;
  yl?: string;
  frame?: boolean;
};

export function axes(g: CanvasRenderingContext2D, v: View, o: AxisOpt) {
  g.save();
  g.lineWidth = 1;
  g.font = `${v.mobile ? 10 : 11}px ${v.mono}`;
  g.fillStyle = "rgba(200,210,240,0.5)";
  if (o.xs && o.xt) {
    g.textAlign = "center";
    g.textBaseline = "top";
    for (const d of o.xt) {
      const x = v.X(o.xs(d));
      g.strokeStyle = "rgba(160,180,255,0.07)";
      g.beginPath();
      g.moveTo(x, v.Y(0));
      g.lineTo(x, v.Y(1));
      g.stroke();
      g.fillText(o.xf ? o.xf(d) : String(d), x, v.Y(0) + 8);
    }
  }
  if (o.ys && o.yt) {
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (const d of o.yt) {
      const y = v.Y(o.ys(d));
      g.strokeStyle = "rgba(160,180,255,0.07)";
      g.beginPath();
      g.moveTo(v.X(0), y);
      g.lineTo(v.X(1), y);
      g.stroke();
      g.fillText(o.yf ? o.yf(d) : String(d), v.X(0) - 8, y);
    }
  }
  g.strokeStyle = "rgba(160,180,255,0.22)";
  g.beginPath();
  g.moveTo(v.X(0), v.Y(1));
  g.lineTo(v.X(0), v.Y(0));
  g.lineTo(v.X(1), v.Y(0));
  g.stroke();
  g.fillStyle = "rgba(214,222,250,0.72)";
  g.font = `500 ${v.mobile ? 11 : 12.5}px ${v.sans}`;
  if (o.xl) {
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(o.xl, v.X(0.5), v.Y(0) + (v.mobile ? 22 : 28));
  }
  if (o.yl) {
    g.save();
    g.translate(v.X(0) - (v.mobile ? 34 : 50), v.Y(0.5));
    g.rotate(-Math.PI / 2);
    g.textAlign = "center";
    g.textBaseline = "bottom";
    g.fillText(o.yl, 0, 0);
    g.restore();
  }
  g.restore();
}

type TextOpt = { align?: CanvasTextAlign; base?: CanvasTextBaseline; color?: string; size?: number; weight?: number; font?: "sans" | "mono" | "serif" };

export function text(g: CanvasRenderingContext2D, v: View, s: string, nx: number, ny: number, o: TextOpt = {}) {
  textPx(g, v, s, v.X(nx), v.Y(ny), o);
}

export function textPx(g: CanvasRenderingContext2D, v: View, s: string, x: number, y: number, o: TextOpt = {}) {
  const size = (o.size ?? 12.5) * (v.mobile ? 0.88 : 1);
  g.font = `${o.weight ?? 500} ${size}px ${v[o.font ?? "sans"]}`;
  g.textAlign = o.align ?? "left";
  g.textBaseline = o.base ?? "alphabetic";
  g.fillStyle = o.color ?? "rgba(226,232,255,0.86)";
  g.fillText(s, x, y);
}

export function line(g: CanvasRenderingContext2D, v: View, pts: [number, number][], color: string, width = 2, dash?: number[]) {
  if (pts.length < 2) return;
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = "round";
  g.lineCap = "round";
  if (dash) g.setLineDash(dash);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(v.X(x), v.Y(y)) : g.moveTo(v.X(x), v.Y(y))));
  g.stroke();
  g.restore();
}

export function band(g: CanvasRenderingContext2D, v: View, x0: number, x1: number, y0: number, y1: number, color: string) {
  g.fillStyle = color;
  const a = v.X(Math.max(0, Math.min(1, x0)));
  const b = v.X(Math.max(0, Math.min(1, x1)));
  const c = v.Y(Math.max(0, Math.min(1, y1)));
  const d = v.Y(Math.max(0, Math.min(1, y0)));
  g.fillRect(a, c, b - a, d - c);
}

export function ring(g: CanvasRenderingContext2D, v: View, nx: number, ny: number, color: RGB, r = 9, pulse = true) {
  const x = v.X(nx);
  const y = v.Y(ny);
  const k = pulse ? 1 + 0.18 * Math.sin(v.t * 3.2) : 1;
  g.save();
  g.fillStyle = rgba(color, 0.16);
  g.beginPath();
  g.arc(x, y, r * 2.1 * k, 0, 6.2832);
  g.fill();
  g.strokeStyle = rgba(color, 0.95);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, r, 0, 6.2832);
  g.stroke();
  g.fillStyle = rgba(color, 1);
  g.beginPath();
  g.arc(x, y, 3, 0, 6.2832);
  g.fill();
  g.restore();
}

/** Positions for n dots packed into a round blob (sunflower spiral). */
export function blob(n: number, cx: number, cy: number, radius: number) {
  const out: [number, number][] = [];
  const ax = stageInfo.aspect;
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt((i + 0.5) / n);
    const a = i * 2.39996323;
    out.push([cx + (r * Math.cos(a)) / ax, cy + r * Math.sin(a)]);
  }
  return out;
}

/** Stack values into a dot histogram. Returns bin centre (data units) and level for each value. */
export function stack(values: number[], binW: number, origin = 0) {
  const counts = new Map<number, number>();
  return values.map((val) => {
    const b = Math.floor((val - origin) / binW);
    const level = counts.get(b) ?? 0;
    counts.set(b, level + 1);
    return { x: origin + (b + 0.5) * binW, level };
  });
}

const glyphCache = new Map<string, [number, number][]>();
/** Sample n points from the filled shape of a piece of text, to make particles spell it. */
export function glyph(str: string, n: number): [number, number][] {
  if (typeof document === "undefined") return [];
  const key = str + n;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const cw = 60 + 150 * str.length;
  const ch = 280;
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#fff";
  g.font = "400 270px Georgia, 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(str, cw / 2, ch / 2 + 14);
  const d = g.getImageData(0, 0, cw, ch).data;
  const filled: [number, number][] = [];
  let minX = cw;
  let maxX = 0;
  let minY = ch;
  let maxY = 0;
  for (let y = 0; y < ch; y += 2)
    for (let x = 0; x < cw; x += 2)
      if (d[(y * cw + x) * 4 + 3] > 128) {
        filled.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const r = rng(str.charCodeAt(0) * 31 + n);
  const out: [number, number][] = [];
  for (let i = 0; i < n && filled.length; i++) {
    const p = filled[Math.floor(r() * filled.length)];
    out.push([(p[0] + r() * 2 - (minX + maxX) / 2) / (maxY - minY), -(p[1] + r() * 2 - (minY + maxY) / 2) / (maxY - minY)]);
  }
  glyphCache.set(key, out);
  return out;
}

export const fmtPct = (x: number, d = 0) => (x * 100).toFixed(d) + "%";
export const fmtSigned = (x: number, d = 1) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? "" : x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);
export const fmtMoney = (x: number) => {
  const a = Math.abs(Math.round(x));
  return (x < 0 ? "−$" : "$") + a.toLocaleString("en-US");
};
export const fmtK = (x: number) => {
  const a = Math.abs(x);
  const s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M" : Math.round(a / 1000) + "k";
  return (x < 0 ? "−$" : "$") + s;
};
