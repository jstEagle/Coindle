"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type BarData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";

import {
  hitTestDrawing,
  renderDrawing,
  renderMeasure,
  type ChartMapper,
  type HitZone,
} from "@/components/game/chart/drawingRenderer";
import type { ChartSettings, ChartType } from "@/lib/chartSettings";
import {
  TWO_POINT_TOOLS,
  createDrawingId,
  type ChartTool,
  type Drawing,
  type DrawingPoint,
  type DrawingTool,
} from "@/lib/drawings";
import { bollinger, ema, rsi, sma, vwap, type IndicatorId } from "@/lib/indicators";
import { formatPrice } from "@/lib/format";
import type { TradeOrderType, TradeSide } from "@/lib/trading";

const BULL = "#26a69a";
const BEAR = "#ef5350";
const GOLD = "#f2b705";
const GOLD_STRONG = "#ffd23f";
const PANEL_BG = "#0d0f13";
const GRID_COLOR = "rgba(255, 255, 255, 0.05)";
const AXIS_TEXT = "#5a6070";
const FRONTIER_LINE = "rgba(255, 255, 255, 0.22)";
const FUTURE_GUIDE = "rgba(242, 183, 5, 0.08)";
const FUTURE_SHADE = "rgba(242, 183, 5, 0.025)";
const VOLUME_UP = "rgba(38, 166, 154, 0.4)";
const VOLUME_DOWN = "rgba(239, 83, 80, 0.4)";

const CREATE_MIN_PIXEL_DISTANCE = 4;
const LIMIT_LINE_GRAB_TOLERANCE = 8;
const MAGNET_SNAP_PX = 16;
const MIN_VISIBLE_BARS = 8;

const t = (value: number) => value as UTCTimestamp;
const MARKET_PRICE_FORMAT = {
  type: "custom" as const,
  formatter: formatPrice,
  minMove: 1e-12,
};
const UTC_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const UTC_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface RoundMarker {
  round: number;
  side: TradeSide;
  status: "filled" | "unfilled";
  filledAt: number | null;
  fillPrice: number | null;
  exitTime: number;
  exitPrice: number;
  pnl: number;
}

type MainSeries =
  | ISeriesApi<"Candlestick">
  | ISeriesApi<"Bar">
  | ISeriesApi<"Line">
  | ISeriesApi<"Area">;

interface DragState {
  id: string;
  zone: HitZone;
  originalPoints: DrawingPoint[];
  grabTime: number;
  grabPrice: number;
}

interface CreatingState {
  tool: DrawingTool;
  points: [DrawingPoint, DrawingPoint];
  /** True once the pointer went up close to the anchor — finish on next click. */
  clickPhase: boolean;
}

interface TextEditorState {
  id: string | null;
  point: DrawingPoint;
  x: number;
  y: number;
  initialValue: string;
}

interface TradeChartProps {
  candles: readonly ChartCandle[];
  futureTimes: readonly number[];
  orderType: TradeOrderType;
  limitPrice: number | null;
  onLimitPriceChange: (price: number) => void;
  disabled?: boolean;
  candleIntervalSeconds: number;
  roundMarkers: readonly RoundMarker[];
  replayIntervalMs: number;
  activeTool: ChartTool;
  onToolChange: (tool: ChartTool) => void;
  drawings: readonly Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  selectedDrawingId: string | null;
  onSelectedDrawingIdChange: (id: string | null) => void;
  replayFromIndex: number | null;
  onReplayingChange?: (replaying: boolean) => void;
  settings: ChartSettings;
  magnet: boolean;
  drawingsHidden: boolean;
  drawingsLocked: boolean;
  drawingColor: string;
  /** Increment to re-fit the visible range to all data. */
  fitSignal: number;
}

function toMainData(candle: ChartCandle, chartType: ChartType): CandlestickData | BarData | LineData {
  if (chartType === "line" || chartType === "area") {
    return { time: t(candle.time), value: candle.close };
  }
  return {
    time: t(candle.time),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function toVolumeData(candle: ChartCandle): HistogramData {
  return {
    time: t(candle.time),
    value: candle.volume ?? 0,
    color: candle.close >= candle.open ? VOLUME_UP : VOLUME_DOWN,
  };
}

export function TradeChart({
  candles,
  futureTimes,
  orderType,
  limitPrice,
  onLimitPriceChange,
  disabled,
  candleIntervalSeconds,
  roundMarkers,
  replayIntervalMs,
  activeTool,
  onToolChange,
  drawings,
  onDrawingsChange,
  selectedDrawingId,
  onSelectedDrawingIdChange,
  replayFromIndex,
  onReplayingChange,
  settings,
  magnet,
  drawingsHidden,
  drawingsLocked,
  drawingColor,
  fitSignal,
}: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<MainSeries | null>(null);
  const boundsSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markerSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());

  const legendRef = useRef<HTMLDivElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const pointerDownHandlerRef = useRef<(event: PointerEvent) => void>(() => {});
  const pointerMoveHandlerRef = useRef<(event: PointerEvent) => void>(() => {});
  const pointerEndHandlerRef = useRef<(event: PointerEvent) => void>(() => {});
  const pointerLeaveHandlerRef = useRef<() => void>(() => {});
  const doubleClickHandlerRef = useRef<(event: MouseEvent) => void>(() => {});

  const candlesRef = useRef(candles);
  const futureTimesRef = useRef(futureTimes);
  const orderTypeRef = useRef(orderType);
  const limitPriceRef = useRef(limitPrice);
  const disabledRef = useRef(Boolean(disabled));
  const onLimitPriceChangeRef = useRef(onLimitPriceChange);
  const chartTypeRef = useRef(settings.chartType);
  const magnetRef = useRef(magnet);
  const hiddenRef = useRef(drawingsHidden);
  const lockedRef = useRef(drawingsLocked);
  const drawingColorRef = useRef(drawingColor);
  const intervalRef = useRef(candleIntervalSeconds);

  const activeToolRef = useRef(activeTool);
  const drawingsRef = useRef(drawings);
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  const onToolChangeRef = useRef(onToolChange);
  const selectedIdRef = useRef(selectedDrawingId);
  const onSelectedIdChangeRef = useRef(onSelectedDrawingIdChange);
  const onReplayingChangeRef = useRef(onReplayingChange);

  const creatingRef = useRef<CreatingState | null>(null);
  const brushRef = useRef<DrawingPoint[] | null>(null);
  const measureRef = useRef<[DrawingPoint, DrawingPoint] | null>(null);
  const measureActiveRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const dragPreviewRef = useRef<Drawing | null>(null);
  const limitDragRef = useRef(false);
  const panRef = useRef<{ startX: number; from: number; to: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; from: number; to: number; center: number } | null>(null);
  const downPositionRef = useRef<{ x: number; y: number } | null>(null);

  const displayedCountRef = useRef(0);
  const replayTimerRef = useRef<number | null>(null);
  const isReplayingRef = useRef(false);
  const [replaying, setReplaying] = useState(false);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const textEditorRef = useRef<HTMLInputElement | null>(null);

  const scheduleRedraw = () => {
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  };

  function timeAtX(x: number): number | null {
    const chart = chartRef.current;
    if (!chart) return null;
    const time = chart.timeScale().coordinateToTime(x);
    if (time !== null) {
      return time as unknown as number;
    }
    // Off the right edge of loaded data: extrapolate from the logical index.
    const logical = chart.timeScale().coordinateToLogical(x);
    const origin = candlesRef.current[0]?.time;
    if (logical === null || origin === undefined) return null;
    return origin + Math.round(logical as unknown as number) * intervalRef.current;
  }

  function priceAtY(y: number): number | null {
    const series = mainSeriesRef.current;
    if (!series) return null;
    return series.coordinateToPrice(y);
  }

  function xAtTime(time: number): number | null {
    const chart = chartRef.current;
    if (!chart) return null;
    const x = chart.timeScale().timeToCoordinate(t(time));
    if (x !== null) return x;
    const origin = candlesRef.current[0]?.time;
    if (origin === undefined) return null;
    const logical = (time - origin) / intervalRef.current;
    return chart.timeScale().logicalToCoordinate(logical as never);
  }

  function yAtPrice(price: number): number | null {
    const series = mainSeriesRef.current;
    if (!series) return null;
    return series.priceToCoordinate(price);
  }

  const mapper: ChartMapper = {
    xAtTime: (time) => xAtTime(time),
    yAtPrice: (price) => yAtPrice(price),
  };

  function pointFromClient(clientX: number, clientY: number): DrawingPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const time = timeAtX(clientX - rect.left);
    const price = priceAtY(clientY - rect.top);
    if (time === null || price === null) return null;
    return { time, price };
  }

  /** Weak-magnet snapping: align time to the bar grid and price to nearby OHLC. */
  function snapPoint(point: DrawingPoint): DrawingPoint {
    if (!magnetRef.current) return point;
    const list = candlesRef.current;
    const origin = list[0]?.time;
    if (origin === undefined) return point;
    const interval = intervalRef.current;
    const maxIndex = list.length + futureTimesRef.current.length - 1;
    const index = Math.max(0, Math.min(maxIndex, Math.round((point.time - origin) / interval)));
    const time = origin + index * interval;

    let price = point.price;
    if (index < list.length) {
      const candle = list[index];
      const pointY = yAtPrice(point.price);
      if (pointY !== null) {
        let bestDistance = MAGNET_SNAP_PX;
        for (const candidate of [candle.open, candle.high, candle.low, candle.close]) {
          const y = yAtPrice(candidate);
          if (y === null) continue;
          const distance = Math.abs(y - pointY);
          if (distance < bestDistance) {
            bestDistance = distance;
            price = candidate;
          }
        }
      }
    }
    return { time, price };
  }

  function hitTestAll(clientX: number, clientY: number): { id: string; zone: HitZone } | null {
    const canvas = canvasRef.current;
    if (!canvas || hiddenRef.current) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const list = drawingsRef.current;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const drawing = list[index];
      const zone = hitTestDrawing(
        ctx,
        mapper,
        canvas.clientWidth,
        canvas.clientHeight,
        drawing,
        px,
        py,
        selectedIdRef.current === drawing.id,
      );
      if (zone) {
        return { id: drawing.id, zone };
      }
    }
    return null;
  }

  function isNearLimitLine(clientY: number): boolean {
    if (orderTypeRef.current !== "limit" || disabledRef.current || limitPriceRef.current === null) {
      return false;
    }
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const lineY = yAtPrice(limitPriceRef.current);
    return lineY !== null && Math.abs(clientY - rect.top - lineY) <= LIMIT_LINE_GRAB_TOLERANCE;
  }

  function draw() {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const mainSeries = mainSeriesRef.current;
    const allCandles = candlesRef.current;
    if (!canvas || !chart || !mainSeries || allCandles.length === 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const displayedCount = Math.min(
      displayedCountRef.current || allCandles.length,
      allCandles.length,
    );
    const frontierTime = allCandles[Math.max(0, displayedCount - 1)].time;
    const x0 = xAtTime(frontierTime);
    const pendingReveal = allCandles.slice(displayedCount).map((candle) => candle.time);
    const future = [...pendingReveal, ...futureTimesRef.current];

    if (x0 !== null) {
      if (future.length > 0) {
        const lastFutureX = xAtTime(future[future.length - 1]);
        if (lastFutureX !== null) {
          ctx.fillStyle = FUTURE_SHADE;
          ctx.fillRect(x0, 0, lastFutureX - x0, height);
        }

        ctx.strokeStyle = FUTURE_GUIDE;
        ctx.setLineDash([]);
        for (const time of future) {
          const x = xAtTime(time);
          if (x !== null) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
          }
        }
      }

      ctx.strokeStyle = FRONTIER_LINE;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (!hiddenRef.current) {
      const items = drawingsRef.current.map((drawing) =>
        dragPreviewRef.current && dragPreviewRef.current.id === drawing.id
          ? dragPreviewRef.current
          : drawing,
      );
      for (const drawing of items) {
        renderDrawing(ctx, mapper, width, height, drawing, selectedIdRef.current === drawing.id);
      }

      const creating = creatingRef.current;
      if (creating) {
        renderDrawing(
          ctx,
          mapper,
          width,
          height,
          { id: "__preview__", tool: creating.tool, points: creating.points, color: drawingColorRef.current },
          false,
        );
      }

      const brush = brushRef.current;
      if (brush && brush.length > 1) {
        renderDrawing(
          ctx,
          mapper,
          width,
          height,
          { id: "__brush__", tool: "brush", points: brush, color: drawingColorRef.current },
          false,
        );
      }
    }

    const measure = measureRef.current;
    if (measure) {
      renderMeasure(ctx, mapper, measure[0], measure[1], intervalRef.current);
    }

    if (orderTypeRef.current === "limit" && limitPriceRef.current !== null) {
      const y = yAtPrice(limitPriceRef.current);
      if (y !== null) {
        ctx.strokeStyle = GOLD_STRONG;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.setLineDash([]);
        const handleX = width - 46;
        ctx.fillStyle = GOLD_STRONG;
        ctx.beginPath();
        ctx.arc(handleX, y, limitDragRef.current ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = PANEL_BG;
        ctx.lineWidth = 2;
        ctx.stroke();

        const label = `Limit ${formatPrice(limitPriceRef.current)}`;
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        const labelWidth = ctx.measureText(label).width;
        const labelY = y > 16 ? y - 12 : y + 18;
        ctx.fillStyle = "rgba(13, 15, 19, 0.85)";
        ctx.fillRect(handleX - labelWidth / 2 - 5, labelY - 9, labelWidth + 10, 16);
        ctx.fillStyle = GOLD_STRONG;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, handleX, labelY - 1);
        ctx.textAlign = "start";
      }
    }

    ctx.restore();
  }

  function updateLegend(index: number | null) {
    const legend = legendRef.current;
    const list = candlesRef.current;
    if (!legend || list.length === 0) {
      return;
    }
    const displayed = Math.min(displayedCountRef.current || list.length, list.length);
    const clamped =
      index === null
        ? displayed - 1
        : Math.max(0, Math.min(displayed - 1, index));
    const candle = list[clamped];
    const previousClose = clamped > 0 ? list[clamped - 1].close : candle.open;
    const changePercent = previousClose !== 0 ? ((candle.close - previousClose) / previousClose) * 100 : 0;
    const up = candle.close >= candle.open;
    const color = up ? BULL : BEAR;
    const changeColor = changePercent >= 0 ? BULL : BEAR;
    const volume = candle.volume;

    legend.innerHTML =
      `<span style="color:${AXIS_TEXT}">O</span> <span style="color:${color}">${formatPrice(candle.open)}</span> ` +
      `<span style="color:${AXIS_TEXT}">H</span> <span style="color:${color}">${formatPrice(candle.high)}</span> ` +
      `<span style="color:${AXIS_TEXT}">L</span> <span style="color:${color}">${formatPrice(candle.low)}</span> ` +
      `<span style="color:${AXIS_TEXT}">C</span> <span style="color:${color}">${formatPrice(candle.close)}</span> ` +
      `<span style="color:${changeColor}">${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%</span>` +
      (volume !== undefined
        ? ` <span style="color:${AXIS_TEXT}">Vol</span> <span style="color:${up ? BULL : BEAR}">${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(volume)}</span>`
        : "");
  }

  function indexAtTime(time: number): number {
    const origin = candlesRef.current[0]?.time;
    if (origin === undefined) return 0;
    return Math.round((time - origin) / intervalRef.current);
  }

  // ----- visible-range management -------------------------------------------------

  function clampLogicalRange(from: number, to: number): { from: number; to: number } {
    const total = candlesRef.current.length + futureTimesRef.current.length;
    let span = to - from;
    const maxSpan = total + 24;
    if (span < MIN_VISIBLE_BARS) {
      const center = (from + to) / 2;
      from = center - MIN_VISIBLE_BARS / 2;
      to = center + MIN_VISIBLE_BARS / 2;
      span = MIN_VISIBLE_BARS;
    } else if (span > maxSpan) {
      const center = (from + to) / 2;
      from = center - maxSpan / 2;
      to = center + maxSpan / 2;
      span = maxSpan;
    }
    if (from < -12) {
      from = -12;
      to = from + span;
    }
    if (to > total + 12) {
      to = total + 12;
      from = to - span;
    }
    return { from, to };
  }

  function setLogicalRange(from: number, to: number) {
    const chart = chartRef.current;
    if (!chart) return;
    const clamped = clampLogicalRange(from, to);
    chart.timeScale().setVisibleLogicalRange(clamped as never);
  }

  function fitToData() {
    const total = candlesRef.current.length + futureTimesRef.current.length;
    const chart = chartRef.current;
    if (!chart || total === 0) return;
    chart.timeScale().setVisibleLogicalRange({ from: -1, to: total + 1 } as never);
    scheduleRedraw();
  }

  // ----- replay -------------------------------------------------------------------

  function syncDerivedSeries(count: number) {
    const list = candlesRef.current.slice(0, count);
    const volumeSeries = volumeSeriesRef.current;
    if (volumeSeries) {
      volumeSeries.setData(list.map(toVolumeData));
    }
    const overlays = overlaySeriesRef.current;
    for (const [key, series] of overlays) {
      series.setData(computeOverlay(key, list).map((point) => ({ time: t(point.time), value: point.value })));
    }
    const rsiSeries = rsiSeriesRef.current;
    if (rsiSeries) {
      rsiSeries.setData(rsi(list, 14).map((point) => ({ time: t(point.time), value: point.value })));
    }
  }

  function stopReplay() {
    if (replayTimerRef.current !== null) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    if (isReplayingRef.current) {
      isReplayingRef.current = false;
      setReplaying(false);
      onReplayingChangeRef.current?.(false);
    }
  }

  function startReplay(full: readonly ChartCandle[], fromIndex: number) {
    const mainSeries = mainSeriesRef.current;
    if (!mainSeries) return;

    isReplayingRef.current = true;
    setReplaying(true);
    onReplayingChangeRef.current?.(true);

    let index = fromIndex;

    const revealNext = () => {
      const series = mainSeriesRef.current;
      if (!series) return;
      if (index >= full.length) {
        displayedCountRef.current = full.length;
        replayTimerRef.current = null;
        isReplayingRef.current = false;
        setReplaying(false);
        onReplayingChangeRef.current?.(false);
        updateLegend(null);
        scheduleRedraw();
        return;
      }
      (series as ISeriesApi<"Candlestick">).update(
        toMainData(full[index], chartTypeRef.current) as CandlestickData,
      );
      displayedCountRef.current = index + 1;
      syncDerivedSeries(index + 1);
      updateLegend(null);
      index += 1;
      scheduleRedraw();
      replayTimerRef.current = window.setTimeout(revealNext, replayIntervalMs);
    };

    revealNext();
  }

  function skipReplay() {
    const full = candlesRef.current;
    const mainSeries = mainSeriesRef.current;
    if (replayTimerRef.current !== null) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    if (mainSeries && full.length > 0) {
      (mainSeries as ISeriesApi<"Candlestick">).setData(
        full.map((candle) => toMainData(candle, chartTypeRef.current) as CandlestickData),
      );
    }
    displayedCountRef.current = full.length;
    syncDerivedSeries(full.length);
    isReplayingRef.current = false;
    setReplaying(false);
    onReplayingChangeRef.current?.(false);
    updateLegend(null);
    scheduleRedraw();
  }

  // ----- prop mirrors --------------------------------------------------------------

  useEffect(() => {
    candlesRef.current = candles;
    futureTimesRef.current = futureTimes;
    orderTypeRef.current = orderType;
    limitPriceRef.current = limitPrice;
    disabledRef.current = Boolean(disabled);
    onLimitPriceChangeRef.current = onLimitPriceChange;
    activeToolRef.current = activeTool;
    drawingsRef.current = drawings;
    onDrawingsChangeRef.current = onDrawingsChange;
    onToolChangeRef.current = onToolChange;
    selectedIdRef.current = selectedDrawingId;
    onSelectedIdChangeRef.current = onSelectedDrawingIdChange;
    onReplayingChangeRef.current = onReplayingChange;
    magnetRef.current = magnet;
    hiddenRef.current = drawingsHidden;
    lockedRef.current = drawingsLocked;
    drawingColorRef.current = drawingColor;
    intervalRef.current = candleIntervalSeconds;
  });

  // Abort in-progress creation when the tool changes (e.g. Escape).
  useEffect(() => {
    if (creatingRef.current && creatingRef.current.tool !== activeTool) {
      creatingRef.current = null;
    }
    if (activeTool !== "measure" && measureRef.current) {
      measureRef.current = null;
      measureActiveRef.current = false;
    }
    if (activeTool !== "brush") {
      brushRef.current = null;
    }
    scheduleRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  // ----- chart creation (once) ------------------------------------------------------

  useLayoutEffect(() => {
    const chartHost = chartHostRef.current;
    if (!chartHost) {
      return;
    }

    const chart = createChart(chartHost, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: PANEL_BG },
        textColor: AXIS_TEXT,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        attributionLogo: false,
        panes: {
          separatorColor: "rgba(255, 255, 255, 0.08)",
          separatorHoverColor: "rgba(255, 255, 255, 0.12)",
          enableResize: false,
        },
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.18)", labelBackgroundColor: "#1b1f28" },
        horzLine: { color: "rgba(255,255,255,0.18)", labelBackgroundColor: "#1b1f28" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.16 },
      },
      localization: {
        timeFormatter: (time: number) => `${UTC_DATE_TIME.format(time * 1_000)} UTC`,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
        rightOffset: 2,
        tickMarkFormatter: (time: number) => UTC_TIME.format(time * 1_000),
      },
      handleScroll: false,
      handleScale: false,
      kineticScroll: { mouse: false, touch: false },
    });

    const boundsSeries = chart.addSeries(LineSeries, {
      color: "rgba(0, 0, 0, 0)",
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: MARKET_PRICE_FORMAT,
    });

    chartRef.current = chart;
    boundsSeriesRef.current = boundsSeries;

    const handleRangeChange = () => scheduleRedraw();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    const resizeObserver = new ResizeObserver(() => {
      scheduleRedraw();
    });
    resizeObserver.observe(chartHost);
    const markerSeriesMap = markerSeriesRef.current;
    const overlayMap = overlaySeriesRef.current;

    return () => {
      if (replayTimerRef.current !== null) {
        window.clearTimeout(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      boundsSeriesRef.current = null;
      volumeSeriesRef.current = null;
      rsiSeriesRef.current = null;
      markerSeriesMap.clear();
      overlayMap.clear();
    };
    // The chart is intentionally created once. Live data is synchronized by
    // the effects below and callbacks read the latest value refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- main series lifecycle (chart type) ----------------------------------------

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chartTypeRef.current = settings.chartType;

    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }

    let series: MainSeries;
    switch (settings.chartType) {
      case "bars":
        series = chart.addSeries(BarSeries, {
          upColor: BULL,
          downColor: BEAR,
          thinBars: false,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: MARKET_PRICE_FORMAT,
        });
        break;
      case "line":
        series = chart.addSeries(LineSeries, {
          color: GOLD,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          priceFormat: MARKET_PRICE_FORMAT,
        });
        break;
      case "area":
        series = chart.addSeries(AreaSeries, {
          lineColor: GOLD,
          topColor: "rgba(242, 183, 5, 0.25)",
          bottomColor: "rgba(242, 183, 5, 0.0)",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: MARKET_PRICE_FORMAT,
        });
        break;
      default:
        series = chart.addSeries(CandlestickSeries, {
          upColor: BULL,
          downColor: BEAR,
          borderVisible: false,
          wickUpColor: BULL,
          wickDownColor: BEAR,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: MARKET_PRICE_FORMAT,
        });
        break;
    }
    mainSeriesRef.current = series;

    const count = Math.min(displayedCountRef.current || candlesRef.current.length, candlesRef.current.length);
    (series as ISeriesApi<"Candlestick">).setData(
      candlesRef.current
        .slice(0, count)
        .map((candle) => toMainData(candle, settings.chartType) as CandlestickData),
    );
    scheduleRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.chartType]);

  // ----- log scale ------------------------------------------------------------------

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({
      mode: settings.logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
    scheduleRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.logScale]);

  // ----- volume + overlay indicators + RSI pane --------------------------------------

  function computeOverlay(key: string, list: readonly ChartCandle[]) {
    switch (key) {
      case "ema9":
        return ema(list, 9);
      case "ema21":
        return ema(list, 21);
      case "sma50":
        return sma(list, 50);
      case "vwap":
        return vwap(list);
      case "bb20:upper":
        return bollinger(list, 20, 2).upper;
      case "bb20:basis":
        return bollinger(list, 20, 2).basis;
      case "bb20:lower":
        return bollinger(list, 20, 2).lower;
      default:
        return [];
    }
  }

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Volume histogram (overlay price scale at the bottom of the main pane).
    if (settings.showVolume && !volumeSeriesRef.current) {
      const series = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        visible: false,
      });
      volumeSeriesRef.current = series;
    } else if (!settings.showVolume && volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }

    // Overlay line indicators.
    const wanted = new Map<string, { color: string; width: number; style?: LineStyle }>();
    const active = new Set<IndicatorId>(settings.indicators);
    if (active.has("ema9")) wanted.set("ema9", { color: "#42a5f5", width: 1 });
    if (active.has("ema21")) wanted.set("ema21", { color: "#f2b705", width: 1 });
    if (active.has("sma50")) wanted.set("sma50", { color: "#ef6c00", width: 1 });
    if (active.has("vwap")) wanted.set("vwap", { color: "#26c6da", width: 1, style: LineStyle.Dashed });
    if (active.has("bb20")) {
      wanted.set("bb20:upper", { color: "rgba(171, 71, 188, 0.7)", width: 1 });
      wanted.set("bb20:basis", { color: "rgba(171, 71, 188, 0.95)", width: 1, style: LineStyle.Dotted });
      wanted.set("bb20:lower", { color: "rgba(171, 71, 188, 0.7)", width: 1 });
    }

    const overlays = overlaySeriesRef.current;
    for (const [key, series] of [...overlays]) {
      if (!wanted.has(key)) {
        chart.removeSeries(series);
        overlays.delete(key);
      }
    }
    for (const [key, config] of wanted) {
      if (!overlays.has(key)) {
        overlays.set(
          key,
          chart.addSeries(LineSeries, {
            color: config.color,
            lineWidth: config.width as never,
            lineStyle: config.style ?? LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: MARKET_PRICE_FORMAT,
          }),
        );
      }
    }

    // RSI in its own pane.
    const wantRsi = active.has("rsi14");
    if (wantRsi && !rsiSeriesRef.current) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: "#ab47bc",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
        },
        1,
      );
      series.createPriceLine({
        price: 70,
        color: "rgba(239, 83, 80, 0.4)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
      series.createPriceLine({
        price: 30,
        color: "rgba(38, 166, 154, 0.4)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
      const panes = chart.panes();
      if (panes.length > 1) {
        panes[1].setHeight(88);
      }
      rsiSeriesRef.current = series;
    } else if (!wantRsi && rsiSeriesRef.current) {
      chart.removeSeries(rsiSeriesRef.current);
      rsiSeriesRef.current = null;
    }

    const count = Math.min(displayedCountRef.current || candlesRef.current.length, candlesRef.current.length);
    syncDerivedSeries(count);
    scheduleRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showVolume, settings.indicators]);

  // ----- candle data sync + replay ---------------------------------------------------

  useEffect(() => {
    const mainSeries = mainSeriesRef.current;
    const boundsSeries = boundsSeriesRef.current;
    const chart = chartRef.current;
    if (!mainSeries || !boundsSeries || !chart || candles.length === 0) {
      return;
    }

    const visibleIndex = Math.max(
      0,
      Math.min(displayedCountRef.current || candles.length, candles.length) - 1,
    );
    const visiblePrice = candles[visibleIndex].close;
    boundsSeries.setData([
      ...candles.map((candle) => ({ time: t(candle.time), value: visiblePrice })),
      ...futureTimes.map((time) => ({ time: t(time), value: visiblePrice })),
    ]);

    stopReplay();
    const shouldReplay =
      replayFromIndex !== null &&
      replayFromIndex >= 0 &&
      replayFromIndex < candles.length;
    const initiallyVisibleCandles = shouldReplay
      ? candles.slice(0, replayFromIndex)
      : candles;
    (mainSeries as ISeriesApi<"Candlestick">).setData(
      initiallyVisibleCandles.map((candle) => toMainData(candle, chartTypeRef.current) as CandlestickData),
    );
    displayedCountRef.current = initiallyVisibleCandles.length;
    syncDerivedSeries(initiallyVisibleCandles.length);
    updateLegend(null);

    fitToData();

    if (shouldReplay) {
      startReplay(candles, replayFromIndex);
    } else {
      scheduleRedraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, futureTimes, candleIntervalSeconds, replayFromIndex, replayIntervalMs]);

  // Redraw when interactive props change.
  useEffect(() => {
    scheduleRedraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, limitPrice, drawings, selectedDrawingId, activeTool, drawingsHidden, drawingsLocked]);

  // Re-fit on demand.
  useEffect(() => {
    if (fitSignal > 0) {
      fitToData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  // ----- past-round trade markers ----------------------------------------------------

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    for (const marker of roundMarkers) {
      if (marker.status !== "filled" || marker.filledAt === null || marker.fillPrice === null) {
        continue;
      }
      if (markerSeriesRef.current.has(marker.round)) {
        continue;
      }
      const color = marker.pnl >= 0 ? BULL : BEAR;
      const series = chart.addSeries(LineSeries, {
        color: `${color}cc`,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 3,
        priceFormat: MARKET_PRICE_FORMAT,
      });
      series.setData([
        { time: t(marker.filledAt), value: marker.fillPrice },
        { time: t(marker.exitTime), value: marker.exitPrice },
      ]);
      markerSeriesRef.current.set(marker.round, series);
    }
  }, [roundMarkers]);

  // ----- pointer interactions ---------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    if (!canvas || !chart) {
      return;
    }

    const updateHoverState = (clientX: number, clientY: number) => {
      const series = mainSeriesRef.current;
      if (!series) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        const time = timeAtX(x);
        const price = priceAtY(y);
        if (time !== null && price !== null) {
          chart.setCrosshairPosition(price, t(time), series);
          updateLegend(indexAtTime(time));
        }
      }

      const tool = activeToolRef.current;
      if (tool !== "cursor") {
        canvas.style.cursor = tool === "text" ? "text" : "crosshair";
        return;
      }

      if (!lockedRef.current) {
        const hit = hitTestAll(clientX, clientY);
        if (hit) {
          canvas.style.cursor = hit.zone === "move" ? "move" : "pointer";
          return;
        }
      }

      if (isNearLimitLine(clientY)) {
        canvas.style.cursor = "ns-resize";
        return;
      }

      canvas.style.cursor = "default";
    };

    const beginPan = (clientX: number) => {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      panRef.current = {
        startX: clientX,
        from: range.from as unknown as number,
        to: range.to as unknown as number,
      };
      canvas.style.cursor = "grabbing";
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (isReplayingRef.current) {
        event.preventDefault();
        skipReplay();
        return;
      }

      // Second finger: switch from pan to pinch.
      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        const range = chart.timeScale().getVisibleLogicalRange();
        if (range) {
          const rect = canvas.getBoundingClientRect();
          const centerX = (a.x + b.x) / 2 - rect.left;
          const logical = chart.timeScale().coordinateToLogical(centerX);
          pinchRef.current = {
            distance: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)),
            from: range.from as unknown as number,
            to: range.to as unknown as number,
            center: logical === null ? ((range.from as unknown as number) + (range.to as unknown as number)) / 2 : (logical as unknown as number),
          };
        }
        panRef.current = null;
        creatingRef.current = null;
        brushRef.current = null;
        return;
      }

      // A previous measure result is cleared by the next interaction.
      if (measureRef.current && !measureActiveRef.current && activeToolRef.current !== "measure") {
        measureRef.current = null;
        scheduleRedraw();
      }

      const tool = activeToolRef.current;

      // Finish a click-move-click creation.
      const creating = creatingRef.current;
      if (creating && creating.clickPhase) {
        event.preventDefault();
        const points = creating.points;
        const x0 = xAtTime(points[0].time);
        const y0 = yAtPrice(points[0].price);
        const x1 = xAtTime(points[1].time);
        const y1 = yAtPrice(points[1].price);
        const farEnough =
          x0 !== null && y0 !== null && x1 !== null && y1 !== null
            ? Math.hypot(x1 - x0, y1 - y0) >= CREATE_MIN_PIXEL_DISTANCE
            : false;
        if (farEnough) {
          const newDrawing: Drawing = {
            id: createDrawingId(),
            tool: creating.tool,
            points: [points[0], points[1]],
            color: drawingColorRef.current,
          };
          onDrawingsChangeRef.current([...drawingsRef.current, newDrawing]);
          onSelectedIdChangeRef.current(newDrawing.id);
        }
        creatingRef.current = null;
        onToolChangeRef.current("cursor");
        scheduleRedraw();
        return;
      }

      if (tool === "measure") {
        const origin = pointFromClient(event.clientX, event.clientY);
        if (!origin) return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        measureRef.current = [origin, origin];
        measureActiveRef.current = true;
        scheduleRedraw();
        return;
      }

      if (tool === "brush") {
        const origin = pointFromClient(event.clientX, event.clientY);
        if (!origin) return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        brushRef.current = [origin];
        scheduleRedraw();
        return;
      }

      if (tool === "text") {
        const origin = pointFromClient(event.clientX, event.clientY);
        if (!origin) return;
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        setTextEditor({
          id: null,
          point: origin,
          x: Math.max(4, Math.min(event.clientX - rect.left, rect.width - 164)),
          y: Math.max(18, event.clientY - rect.top),
          initialValue: "",
        });
        onToolChangeRef.current("cursor");
        return;
      }

      if (tool === "horizontal" || tool === "vertical") {
        const rawOrigin = pointFromClient(event.clientX, event.clientY);
        if (!rawOrigin) return;
        const origin = snapPoint(rawOrigin);
        event.preventDefault();
        const newDrawing: Drawing = {
          id: createDrawingId(),
          tool,
          points: [origin],
          color: drawingColorRef.current,
        };
        onDrawingsChangeRef.current([...drawingsRef.current, newDrawing]);
        onSelectedIdChangeRef.current(newDrawing.id);
        onToolChangeRef.current("cursor");
        return;
      }

      if (tool !== "cursor" && (TWO_POINT_TOOLS as readonly string[]).includes(tool)) {
        const rawOrigin = pointFromClient(event.clientX, event.clientY);
        if (!rawOrigin) return;
        const origin = snapPoint(rawOrigin);
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        creatingRef.current = { tool: tool as DrawingTool, points: [origin, origin], clickPhase: false };
        scheduleRedraw();
        return;
      }

      // Cursor tool interactions.
      downPositionRef.current = { x: event.clientX, y: event.clientY };

      if (!lockedRef.current) {
        const hit = hitTestAll(event.clientX, event.clientY);
        if (hit) {
          const target = drawingsRef.current.find((drawing) => drawing.id === hit.id);
          if (!target) return;
          event.preventDefault();
          canvas.setPointerCapture(event.pointerId);
          const grabPoint = pointFromClient(event.clientX, event.clientY);
          dragRef.current = {
            id: hit.id,
            zone: hit.zone,
            originalPoints: target.points.map((point) => ({ ...point })),
            grabTime: grabPoint?.time ?? target.points[0].time,
            grabPrice: grabPoint?.price ?? target.points[0].price,
          };
          onSelectedIdChangeRef.current(hit.id);
          scheduleRedraw();
          return;
        }
      }

      if (selectedIdRef.current !== null) {
        onSelectedIdChangeRef.current(null);
        scheduleRedraw();
      }

      if (isNearLimitLine(event.clientY)) {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        limitDragRef.current = true;
        scheduleRedraw();
        return;
      }

      // Empty area: pan the chart.
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      beginPan(event.clientX);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      // Pinch zoom.
      const pinch = pinchRef.current;
      if (pinch && pointersRef.current.size === 2) {
        event.preventDefault();
        const [a, b] = [...pointersRef.current.values()];
        const distance = Math.max(12, Math.hypot(a.x - b.x, a.y - b.y));
        const scale = pinch.distance / distance;
        const from = pinch.center - (pinch.center - pinch.from) * scale;
        const to = pinch.center + (pinch.to - pinch.center) * scale;
        setLogicalRange(from, to);
        return;
      }

      if (limitDragRef.current && orderTypeRef.current === "limit" && !disabledRef.current) {
        const rect = canvas.getBoundingClientRect();
        const clampedY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
        const price = priceAtY(clampedY);
        if (price !== null && price > 0) {
          event.preventDefault();
          onLimitPriceChangeRef.current(Number(price.toPrecision(6)));
          scheduleRedraw();
        }
        return;
      }

      const measure = measureRef.current;
      if (measureActiveRef.current && measure) {
        const point = pointFromClient(event.clientX, event.clientY);
        if (point) {
          event.preventDefault();
          measureRef.current = [measure[0], snapPoint(point)];
          scheduleRedraw();
        }
        return;
      }

      const brush = brushRef.current;
      if (brush && activeToolRef.current === "brush") {
        const point = pointFromClient(event.clientX, event.clientY);
        if (point) {
          const last = brush[brush.length - 1];
          const lastX = xAtTime(last.time);
          const lastY = yAtPrice(last.price);
          const x = xAtTime(point.time);
          const y = yAtPrice(point.price);
          if (lastX !== null && lastY !== null && x !== null && y !== null && Math.hypot(x - lastX, y - lastY) >= 3) {
            event.preventDefault();
            brush.push(point);
            scheduleRedraw();
          }
        }
        return;
      }

      const creating = creatingRef.current;
      if (creating) {
        const point = pointFromClient(event.clientX, event.clientY);
        if (point) {
          event.preventDefault();
          creatingRef.current = { ...creating, points: [creating.points[0], snapPoint(point)] };
          scheduleRedraw();
        }
        return;
      }

      const drag = dragRef.current;
      if (drag) {
        const point = pointFromClient(event.clientX, event.clientY);
        if (point) {
          event.preventDefault();
          const { zone, originalPoints, grabTime, grabPrice, id } = drag;
          let nextPoints: DrawingPoint[];
          if (zone === "move") {
            const deltaTime = point.time - grabTime;
            const deltaPrice = point.price - grabPrice;
            nextPoints = originalPoints.map((p) => ({
              time: p.time + deltaTime,
              price: p.price + deltaPrice,
            }));
          } else if (zone === "point0") {
            const snapped = snapPoint(point);
            nextPoints =
              originalPoints.length > 1 ? [snapped, ...originalPoints.slice(1)] : [snapped];
          } else {
            nextPoints = [originalPoints[0], snapPoint(point)];
          }
          const original = drawingsRef.current.find((drawing) => drawing.id === id);
          if (original) {
            dragPreviewRef.current = { ...original, points: nextPoints };
            scheduleRedraw();
          }
        }
        return;
      }

      const pan = panRef.current;
      if (pan) {
        event.preventDefault();
        const width = canvas.clientWidth || 1;
        const barsPerPixel = (pan.to - pan.from) / width;
        const shift = (pan.startX - event.clientX) * barsPerPixel;
        setLogicalRange(pan.from + shift, pan.to + shift);
        return;
      }

      updateHoverState(event.clientX, event.clientY);
    };

    const endInteractions = (event: PointerEvent) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      if (limitDragRef.current) {
        limitDragRef.current = false;
        scheduleRedraw();
      }

      if (measureActiveRef.current) {
        measureActiveRef.current = false;
        // Leave the measurement on screen until the next click / tool change.
        return;
      }

      const brush = brushRef.current;
      if (brush && activeToolRef.current === "brush") {
        if (brush.length >= 2) {
          const newDrawing: Drawing = {
            id: createDrawingId(),
            tool: "brush",
            points: [...brush],
            color: drawingColorRef.current,
          };
          onDrawingsChangeRef.current([...drawingsRef.current, newDrawing]);
          onSelectedIdChangeRef.current(newDrawing.id);
        }
        brushRef.current = null;
        onToolChangeRef.current("cursor");
        scheduleRedraw();
        return;
      }

      const creating = creatingRef.current;
      if (creating && !creating.clickPhase) {
        const { tool, points } = creating;
        const x0 = xAtTime(points[0].time);
        const y0 = yAtPrice(points[0].price);
        const x1 = xAtTime(points[1].time);
        const y1 = yAtPrice(points[1].price);
        const distance =
          x0 !== null && y0 !== null && x1 !== null && y1 !== null
            ? Math.hypot(x1 - x0, y1 - y0)
            : 0;
        if (distance >= CREATE_MIN_PIXEL_DISTANCE) {
          const newDrawing: Drawing = {
            id: createDrawingId(),
            tool,
            points: [points[0], points[1]],
            color: drawingColorRef.current,
          };
          onDrawingsChangeRef.current([...drawingsRef.current, newDrawing]);
          onSelectedIdChangeRef.current(newDrawing.id);
          creatingRef.current = null;
          onToolChangeRef.current("cursor");
        } else {
          // Barely moved: switch to click-move-click placement.
          creatingRef.current = { ...creating, clickPhase: true };
        }
        scheduleRedraw();
      }

      if (dragRef.current && dragPreviewRef.current) {
        const preview = dragPreviewRef.current;
        onDrawingsChangeRef.current(
          drawingsRef.current.map((drawing) => (drawing.id === preview.id ? preview : drawing)),
        );
      }
      dragRef.current = null;
      dragPreviewRef.current = null;

      if (panRef.current) {
        panRef.current = null;
        canvas.style.cursor = "default";
      }
      scheduleRedraw();
    };

    const handlePointerLeave = () => {
      chart.clearCrosshairPosition();
      updateLegend(null);
    };

    const handleDoubleClick = (event: MouseEvent) => {
      // Double-click a text drawing to edit it; otherwise re-fit the view.
      const hit = lockedRef.current || hiddenRef.current ? null : hitTestAll(event.clientX, event.clientY);
      if (hit) {
        const target = drawingsRef.current.find((drawing) => drawing.id === hit.id);
        if (target?.tool === "text") {
          const rect = canvas.getBoundingClientRect();
          const x = xAtTime(target.points[0].time) ?? event.clientX - rect.left;
          const y = yAtPrice(target.points[0].price) ?? event.clientY - rect.top;
          setTextEditor({
            id: target.id,
            point: target.points[0],
            x: Math.max(4, Math.min(x, rect.width - 164)),
            y: Math.max(18, y),
            initialValue: target.text ?? "",
          });
          return;
        }
      }
      fitToData();
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      const from = range.from as unknown as number;
      const to = range.to as unknown as number;
      const rect = canvas.getBoundingClientRect();

      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const barsPerPixel = (to - from) / (canvas.clientWidth || 1);
        const shift = event.deltaX * barsPerPixel;
        setLogicalRange(from + shift, to + shift);
        return;
      }

      const factor = Math.exp(event.deltaY * 0.0016);
      const logical = chart.timeScale().coordinateToLogical(event.clientX - rect.left);
      const position = logical === null ? (from + to) / 2 : (logical as unknown as number);
      setLogicalRange(
        position - (position - from) * factor,
        position + (to - position) * factor,
      );
    };

    const handleDoubleClickEvent = (event: MouseEvent) => doubleClickHandlerRef.current(event);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("dblclick", handleDoubleClickEvent);

    pointerDownHandlerRef.current = handlePointerDown;
    pointerMoveHandlerRef.current = handlePointerMove;
    pointerEndHandlerRef.current = endInteractions;
    pointerLeaveHandlerRef.current = handlePointerLeave;
    doubleClickHandlerRef.current = handleDoubleClick;

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("dblclick", handleDoubleClickEvent);
      pointerDownHandlerRef.current = () => {};
      pointerMoveHandlerRef.current = () => {};
      pointerEndHandlerRef.current = () => {};
      pointerLeaveHandlerRef.current = () => {};
      doubleClickHandlerRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (textEditor && textEditorRef.current) {
      textEditorRef.current.focus();
      textEditorRef.current.select();
    }
  }, [textEditor]);

  const commitTextEditor = (value: string) => {
    const editor = textEditor;
    setTextEditor(null);
    if (!editor) return;
    const trimmed = value.trim();
    if (editor.id) {
      if (trimmed.length === 0) {
        onDrawingsChangeRef.current(drawingsRef.current.filter((drawing) => drawing.id !== editor.id));
        onSelectedIdChangeRef.current(null);
      } else {
        onDrawingsChangeRef.current(
          drawingsRef.current.map((drawing) =>
            drawing.id === editor.id ? { ...drawing, text: trimmed } : drawing,
          ),
        );
      }
      return;
    }
    if (trimmed.length === 0) {
      return;
    }
    const newDrawing: Drawing = {
      id: createDrawingId(),
      tool: "text",
      points: [editor.point],
      text: trimmed,
      color: drawingColorRef.current,
    };
    onDrawingsChangeRef.current([...drawingsRef.current, newDrawing]);
    onSelectedIdChangeRef.current(newDrawing.id);
  };

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div ref={chartHostRef} className="absolute inset-0" />
      <canvas
        ref={canvasRef}
        onPointerDown={(event) => pointerDownHandlerRef.current(event.nativeEvent)}
        onPointerMove={(event) => pointerMoveHandlerRef.current(event.nativeEvent)}
        onPointerUp={(event) => pointerEndHandlerRef.current(event.nativeEvent)}
        onPointerCancel={(event) => pointerEndHandlerRef.current(event.nativeEvent)}
        onPointerLeave={() => pointerLeaveHandlerRef.current()}
        className="absolute inset-0 z-10 h-full w-full touch-none"
        style={{ pointerEvents: "auto" }}
      />

      <div className="pointer-events-none absolute left-3 top-2 z-20 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-text-muted">
          <span className="font-mono font-bold tracking-wide text-text">??? / USD</span>
          <span className="text-text-faint">
            {Math.round(candleIntervalSeconds / 60)}m · Solana
          </span>
        </div>
        <div
          ref={legendRef}
          className="coindle-tabular font-mono text-[10px] leading-4 text-text-muted"
        />
      </div>

      {replaying && (
        <button
          type="button"
          onClick={skipReplay}
          className="absolute right-3 top-3 z-20 rounded-full border border-border-strong bg-panel/90 px-2.5 py-1 text-[11px] font-medium text-text-muted backdrop-blur transition-colors hover:text-text"
        >
          Skip ▸▸
        </button>
      )}

      {textEditor && (
        <input
          ref={textEditorRef}
          type="text"
          defaultValue={textEditor.initialValue}
          placeholder="Note…"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitTextEditor((event.target as HTMLInputElement).value);
            } else if (event.key === "Escape") {
              setTextEditor(null);
            }
            event.stopPropagation();
          }}
          onBlur={(event) => commitTextEditor(event.target.value)}
          className="absolute z-30 w-40 rounded-md border border-gold bg-panel px-2 py-1 text-[13px] text-text outline-none"
          style={{ left: textEditor.x, top: textEditor.y - 14 }}
        />
      )}
    </div>
  );
}
