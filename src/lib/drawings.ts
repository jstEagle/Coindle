export type DrawingTool =
  | "trendline"
  | "ray"
  | "extended"
  | "horizontal"
  | "vertical"
  | "rect"
  | "fib"
  | "brush"
  | "text";

export type ChartTool = "cursor" | "measure" | DrawingTool;

export interface DrawingPoint {
  time: number;
  price: number;
}

/**
 * A user-placed chart annotation. Horizontal, vertical and text use a single
 * point; brush uses a free-form list; every other tool uses two anchors.
 */
export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: readonly DrawingPoint[];
  color?: string;
  text?: string;
}

/** Tools that are created by dragging (or click-move-click) between two anchors. */
export const TWO_POINT_TOOLS: readonly DrawingTool[] = [
  "trendline",
  "ray",
  "extended",
  "rect",
  "fib",
];

/** Tools placed with a single click. */
export const SINGLE_POINT_TOOLS: readonly DrawingTool[] = [
  "horizontal",
  "vertical",
  "text",
];

export const DEFAULT_DRAWING_COLOR = "#5b9bd5";

/** Palette offered for drawings (default first). */
export const DRAWING_PALETTE = [
  "#5b9bd5",
  "#f2b705",
  "#26a69a",
  "#ef5350",
  "#ab47bc",
  "#eceff1",
] as const;

/** Standard Fibonacci retracement ratios, 0 at the first anchor and 1 at the second. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export function fibPriceAtLevel(p0: number, p1: number, level: number): number {
  return p0 + (p1 - p0) * level;
}

export function createDrawingId(): string {
  return `drw_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function distanceToSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - x0, py - y0);
  }
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSquared));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * Distance from a pixel to the line through (x0,y0)-(x1,y1), where the line
 * is clamped to a segment, extends forward only (ray) or extends both ways.
 */
export function distanceToLine(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  extend: "segment" | "ray" | "line",
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - x0, py - y0);
  }
  let t = ((px - x0) * dx + (py - y0) * dy) / lengthSquared;
  if (extend === "segment") {
    t = Math.max(0, Math.min(1, t));
  } else if (extend === "ray") {
    t = Math.max(0, t);
  }
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

export function distanceToPolyline(
  px: number,
  py: number,
  points: readonly { x: number; y: number }[],
): number {
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const distance = distanceToSegment(
      px,
      py,
      points[index - 1].x,
      points[index - 1].y,
      points[index].x,
      points[index].y,
    );
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}
