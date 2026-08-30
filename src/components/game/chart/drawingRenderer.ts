import {
  DEFAULT_DRAWING_COLOR,
  FIB_LEVELS,
  distanceToLine,
  distanceToPolyline,
  fibPriceAtLevel,
  type Drawing,
  type DrawingPoint,
} from "@/lib/drawings";
import { formatPrice } from "@/lib/format";

export interface ChartMapper {
  xAtTime(time: number): number | null;
  yAtPrice(price: number): number | null;
}

export type HitZone = "point0" | "point1" | "move";

export interface DrawingHit {
  id: string;
  zone: HitZone;
}

const HANDLE_RADIUS = 8;
const BODY_HIT_TOLERANCE = 6;

const SELECTED_COLOR = "#ffffff";
const PANEL_BG = "#0d0f13";
const LABEL_BG = "rgba(13, 15, 19, 0.85)";

export const MONO_FONT_10 = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
export const MONO_FONT_11 = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
const TEXT_FONT = "500 13px ui-sans-serif, system-ui, sans-serif";

const FIB_COLORS = [
  "rgba(255, 255, 255, 0.45)",
  "rgba(239, 83, 80, 0.85)",
  "rgba(255, 152, 0, 0.85)",
  "rgba(242, 183, 5, 0.9)",
  "rgba(38, 166, 154, 0.85)",
  "rgba(91, 155, 213, 0.85)",
  "rgba(255, 255, 255, 0.45)",
] as const;

const FIB_FILLS = [
  "rgba(239, 83, 80, 0.05)",
  "rgba(255, 152, 0, 0.05)",
  "rgba(242, 183, 5, 0.05)",
  "rgba(38, 166, 154, 0.05)",
  "rgba(91, 155, 213, 0.05)",
  "rgba(255, 255, 255, 0.04)",
] as const;

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return hex;
  }
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawingColor(drawing: Drawing, selected: boolean): string {
  if (selected) {
    return SELECTED_COLOR;
  }
  return drawing.color ?? DEFAULT_DRAWING_COLOR;
}

export function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = SELECTED_COLOR;
  ctx.fill();
  ctx.strokeStyle = PANEL_BG;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();
}

interface PixelPoint {
  x: number;
  y: number;
}

function toPixels(mapper: ChartMapper, point: DrawingPoint): PixelPoint | null {
  const x = mapper.xAtTime(point.time);
  const y = mapper.yAtPrice(point.price);
  if (x === null || y === null) {
    return null;
  }
  return { x, y };
}

/** Endpoints for a line extended beyond its anchors far past the canvas. */
function extendEndpoints(
  p0: PixelPoint,
  p1: PixelPoint,
  mode: "ray" | "line",
  width: number,
  height: number,
): [PixelPoint, PixelPoint] {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const length = Math.hypot(dx, dy) || 1;
  const scale = ((width + height) * 4) / length;
  const end = { x: p1.x + dx * scale, y: p1.y + dy * scale };
  const start = mode === "line" ? { x: p0.x - dx * scale, y: p0.y - dy * scale } : p0;
  return [start, end];
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  a: PixelPoint,
  b: PixelPoint,
  color: string,
  lineWidth: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawPriceLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  ctx.font = MONO_FONT_10;
  const labelWidth = ctx.measureText(text).width;
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(x, y - 9, labelWidth + 10, 16);
  ctx.fillStyle = color;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 5, y - 1);
}

export function textBounds(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  anchor: PixelPoint,
): { x: number; y: number; width: number; height: number } {
  ctx.font = TEXT_FONT;
  const text = drawing.text ?? "";
  const metrics = ctx.measureText(text);
  const width = Math.max(24, metrics.width + 12);
  const height = 22;
  return { x: anchor.x, y: anchor.y - height / 2, width, height };
}

export function renderDrawing(
  ctx: CanvasRenderingContext2D,
  mapper: ChartMapper,
  width: number,
  height: number,
  drawing: Drawing,
  selected: boolean,
) {
  const color = drawingColor(drawing, selected);
  const lineWidth = selected ? 2 : 1.5;

  switch (drawing.tool) {
    case "horizontal": {
      const y = mapper.yAtPrice(drawing.points[0].price);
      if (y === null) return;
      strokeLine(ctx, { x: 0, y }, { x: width, y }, color, lineWidth);
      drawPriceLabel(ctx, 6, y, formatPrice(drawing.points[0].price), color);
      if (selected) {
        drawHandle(ctx, width - 16, y);
      }
      return;
    }
    case "vertical": {
      const x = mapper.xAtTime(drawing.points[0].time);
      if (x === null) return;
      strokeLine(ctx, { x, y: 0 }, { x, y: height }, color, lineWidth);
      if (selected) {
        drawHandle(ctx, x, height / 2);
      }
      return;
    }
    case "trendline":
    case "ray":
    case "extended": {
      const p0 = toPixels(mapper, drawing.points[0]);
      const p1 = toPixels(mapper, drawing.points[1]);
      if (!p0 || !p1) return;
      let a = p0;
      let b = p1;
      if (drawing.tool !== "trendline") {
        [a, b] = extendEndpoints(p0, p1, drawing.tool === "ray" ? "ray" : "line", width, height);
      }
      strokeLine(ctx, a, b, color, lineWidth);
      if (selected) {
        drawHandle(ctx, p0.x, p0.y);
        drawHandle(ctx, p1.x, p1.y);
      }
      return;
    }
    case "rect": {
      const p0 = toPixels(mapper, drawing.points[0]);
      const p1 = toPixels(mapper, drawing.points[1]);
      if (!p0 || !p1) return;
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x);
      const h = Math.abs(p1.y - p0.y);
      const base = drawing.color ?? DEFAULT_DRAWING_COLOR;
      ctx.fillStyle = hexToRgba(base, 0.12);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);
      if (selected) {
        drawHandle(ctx, p0.x, p0.y);
        drawHandle(ctx, p1.x, p1.y);
        drawHandle(ctx, p0.x, p1.y);
        drawHandle(ctx, p1.x, p0.y);
      }
      return;
    }
    case "fib": {
      const [pt0, pt1] = drawing.points;
      const x0 = mapper.xAtTime(pt0.time);
      const x1 = mapper.xAtTime(pt1.time);
      if (x0 === null || x1 === null) return;
      const left = Math.max(0, Math.min(x0, x1));

      for (let index = 1; index < FIB_LEVELS.length; index += 1) {
        const yA = mapper.yAtPrice(fibPriceAtLevel(pt0.price, pt1.price, FIB_LEVELS[index - 1]));
        const yB = mapper.yAtPrice(fibPriceAtLevel(pt0.price, pt1.price, FIB_LEVELS[index]));
        if (yA === null || yB === null) continue;
        ctx.fillStyle = FIB_FILLS[index - 1];
        ctx.fillRect(left, Math.min(yA, yB), width - left, Math.abs(yB - yA));
      }

      FIB_LEVELS.forEach((level, index) => {
        const price = fibPriceAtLevel(pt0.price, pt1.price, level);
        const y = mapper.yAtPrice(price);
        if (y === null) return;
        ctx.strokeStyle = selected ? SELECTED_COLOR : FIB_COLORS[index];
        ctx.lineWidth = level === 0 || level === 1 ? 1 : 1.25;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        const label = `${(level * 100).toFixed(1)}%  ${formatPrice(price)}`;
        ctx.font = MONO_FONT_10;
        ctx.fillStyle = selected ? SELECTED_COLOR : FIB_COLORS[index];
        ctx.textAlign = "start";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, left + 4, y - 2);
      });

      if (selected) {
        const y0 = mapper.yAtPrice(pt0.price);
        const y1 = mapper.yAtPrice(pt1.price);
        if (y0 !== null) drawHandle(ctx, x0, y0);
        if (y1 !== null) drawHandle(ctx, x1, y1);
      }
      return;
    }
    case "brush": {
      const pixels: PixelPoint[] = [];
      for (const point of drawing.points) {
        const pixel = toPixels(mapper, point);
        if (pixel) pixels.push(pixel);
      }
      if (pixels.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 2.5 : 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pixels[0].x, pixels[0].y);
      for (let index = 1; index < pixels.length; index += 1) {
        ctx.lineTo(pixels[index].x, pixels[index].y);
      }
      ctx.stroke();
      if (selected) {
        drawHandle(ctx, pixels[0].x, pixels[0].y);
        drawHandle(ctx, pixels[pixels.length - 1].x, pixels[pixels.length - 1].y);
      }
      return;
    }
    case "text": {
      const anchor = toPixels(mapper, drawing.points[0]);
      if (!anchor) return;
      const bounds = textBounds(ctx, drawing, anchor);
      const base = drawing.color ?? DEFAULT_DRAWING_COLOR;
      ctx.fillStyle = LABEL_BG;
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      if (selected) {
        ctx.strokeStyle = SELECTED_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(bounds.x - 1, bounds.y - 1, bounds.width + 2, bounds.height + 2);
        ctx.setLineDash([]);
      }
      ctx.font = TEXT_FONT;
      ctx.fillStyle = selected ? SELECTED_COLOR : base;
      ctx.textAlign = "start";
      ctx.textBaseline = "middle";
      ctx.fillText(drawing.text ?? "", bounds.x + 6, bounds.y + bounds.height / 2 + 1);
      return;
    }
  }
}

export function hitTestDrawing(
  ctx: CanvasRenderingContext2D,
  mapper: ChartMapper,
  width: number,
  height: number,
  drawing: Drawing,
  px: number,
  py: number,
  selected: boolean,
): HitZone | null {
  switch (drawing.tool) {
    case "horizontal": {
      const y = mapper.yAtPrice(drawing.points[0].price);
      if (y !== null && Math.abs(py - y) <= BODY_HIT_TOLERANCE) {
        return "point0";
      }
      return null;
    }
    case "vertical": {
      const x = mapper.xAtTime(drawing.points[0].time);
      if (x !== null && Math.abs(px - x) <= BODY_HIT_TOLERANCE) {
        return "point0";
      }
      return null;
    }
    case "trendline":
    case "ray":
    case "extended": {
      const p0 = toPixels(mapper, drawing.points[0]);
      const p1 = toPixels(mapper, drawing.points[1]);
      if (!p0 || !p1) return null;
      if (Math.hypot(px - p0.x, py - p0.y) <= HANDLE_RADIUS) return "point0";
      if (Math.hypot(px - p1.x, py - p1.y) <= HANDLE_RADIUS) return "point1";
      const extend =
        drawing.tool === "trendline" ? "segment" : drawing.tool === "ray" ? "ray" : "line";
      if (distanceToLine(px, py, p0.x, p0.y, p1.x, p1.y, extend) <= BODY_HIT_TOLERANCE) {
        return "move";
      }
      return null;
    }
    case "rect": {
      const p0 = toPixels(mapper, drawing.points[0]);
      const p1 = toPixels(mapper, drawing.points[1]);
      if (!p0 || !p1) return null;
      if (Math.hypot(px - p0.x, py - p0.y) <= HANDLE_RADIUS) return "point0";
      if (Math.hypot(px - p1.x, py - p1.y) <= HANDLE_RADIUS) return "point1";
      const left = Math.min(p0.x, p1.x);
      const right = Math.max(p0.x, p1.x);
      const top = Math.min(p0.y, p1.y);
      const bottom = Math.max(p0.y, p1.y);
      const nearEdge =
        ((Math.abs(px - left) <= BODY_HIT_TOLERANCE || Math.abs(px - right) <= BODY_HIT_TOLERANCE) &&
          py >= top - BODY_HIT_TOLERANCE &&
          py <= bottom + BODY_HIT_TOLERANCE) ||
        ((Math.abs(py - top) <= BODY_HIT_TOLERANCE || Math.abs(py - bottom) <= BODY_HIT_TOLERANCE) &&
          px >= left - BODY_HIT_TOLERANCE &&
          px <= right + BODY_HIT_TOLERANCE);
      const inside = px > left && px < right && py > top && py < bottom;
      if (nearEdge || (selected && inside)) {
        return "move";
      }
      return null;
    }
    case "fib": {
      const [pt0, pt1] = drawing.points;
      const x0 = mapper.xAtTime(pt0.time);
      const x1 = mapper.xAtTime(pt1.time);
      if (x0 === null || x1 === null) return null;
      const y0 = mapper.yAtPrice(pt0.price);
      const y1 = mapper.yAtPrice(pt1.price);
      if (y0 !== null && Math.hypot(px - x0, py - y0) <= HANDLE_RADIUS) return "point0";
      if (y1 !== null && Math.hypot(px - x1, py - y1) <= HANDLE_RADIUS) return "point1";
      const left = Math.min(x0, x1);
      for (const level of FIB_LEVELS) {
        const levelY = mapper.yAtPrice(fibPriceAtLevel(pt0.price, pt1.price, level));
        if (
          levelY !== null &&
          px >= left - 2 &&
          px <= width + 2 &&
          Math.abs(py - levelY) <= BODY_HIT_TOLERANCE
        ) {
          return "move";
        }
      }
      return null;
    }
    case "brush": {
      const pixels: PixelPoint[] = [];
      for (const point of drawing.points) {
        const pixel = toPixels(mapper, point);
        if (pixel) pixels.push(pixel);
      }
      if (pixels.length < 2) return null;
      if (distanceToPolyline(px, py, pixels) <= BODY_HIT_TOLERANCE) {
        return "move";
      }
      return null;
    }
    case "text": {
      const anchor = toPixels(mapper, drawing.points[0]);
      if (!anchor) return null;
      const bounds = textBounds(ctx, drawing, anchor);
      if (
        px >= bounds.x - 2 &&
        px <= bounds.x + bounds.width + 2 &&
        py >= bounds.y - 2 &&
        py <= bounds.y + bounds.height + 2
      ) {
        return "move";
      }
      return null;
    }
  }
}

/** Renders the transient measure tool overlay between two anchors. */
export function renderMeasure(
  ctx: CanvasRenderingContext2D,
  mapper: ChartMapper,
  p0: DrawingPoint,
  p1: DrawingPoint,
  candleIntervalSeconds: number,
) {
  const a = toPixels(mapper, p0);
  const b = toPixels(mapper, p1);
  if (!a || !b) return;

  const up = p1.price >= p0.price;
  const stroke = up ? "rgba(38, 166, 154, 0.9)" : "rgba(239, 83, 80, 0.9)";
  const fill = up ? "rgba(38, 166, 154, 0.12)" : "rgba(239, 83, 80, 0.12)";

  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  const deltaPrice = p1.price - p0.price;
  const deltaPercent = p0.price !== 0 ? (deltaPrice / p0.price) * 100 : 0;
  const bars = Math.round(Math.abs(p1.time - p0.time) / candleIntervalSeconds);
  const minutes = Math.round(Math.abs(p1.time - p0.time) / 60);
  const timeLabel = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

  const line1 = `${deltaPrice >= 0 ? "+" : ""}${formatPrice(Math.abs(deltaPrice)).replace("$", "$")}  (${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(2)}%)`;
  const line2 = `${bars} bars · ${timeLabel}`;

  ctx.font = MONO_FONT_11;
  const width1 = ctx.measureText(line1).width;
  ctx.font = MONO_FONT_10;
  const width2 = ctx.measureText(line2).width;
  const boxWidth = Math.max(width1, width2) + 16;
  const boxHeight = 36;
  const boxX = Math.min(Math.max(4, x + w / 2 - boxWidth / 2), ctx.canvas.clientWidth - boxWidth - 4);
  const boxY = up ? y - boxHeight - 8 : y + h + 8;

  ctx.fillStyle = up ? "rgba(15, 42, 39, 0.95)" : "rgba(45, 20, 20, 0.95)";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(boxX, Math.max(4, boxY), boxWidth, boxHeight, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = up ? "#4dd0c5" : "#ff8a80";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = MONO_FONT_11;
  ctx.fillText(line1, boxX + boxWidth / 2, Math.max(4, boxY) + 12);
  ctx.font = MONO_FONT_10;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(line2, boxX + boxWidth / 2, Math.max(4, boxY) + 25);
  ctx.textAlign = "start";
}
