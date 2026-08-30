export interface IndicatorCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export type IndicatorId = "ema9" | "ema21" | "sma50" | "bb20" | "vwap" | "rsi14";

export interface IndicatorMeta {
  id: IndicatorId;
  label: string;
  color: string;
}

export const INDICATORS: readonly IndicatorMeta[] = [
  { id: "ema9", label: "EMA 9", color: "#42a5f5" },
  { id: "ema21", label: "EMA 21", color: "#f2b705" },
  { id: "sma50", label: "SMA 50", color: "#ef6c00" },
  { id: "bb20", label: "Bollinger (20, 2)", color: "#ab47bc" },
  { id: "vwap", label: "VWAP", color: "#26c6da" },
  { id: "rsi14", label: "RSI 14", color: "#ab47bc" },
];

export function sma(candles: readonly IndicatorCandle[], period: number): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let sum = 0;
  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;
    if (index >= period) {
      sum -= candles[index - period].close;
    }
    if (index >= period - 1) {
      points.push({ time: candles[index].time, value: sum / period });
    }
  }
  return points;
}

export function ema(candles: readonly IndicatorCandle[], period: number): IndicatorPoint[] {
  if (candles.length < period) {
    return [];
  }
  const points: IndicatorPoint[] = [];
  const multiplier = 2 / (period + 1);
  let value = 0;
  for (let index = 0; index < period; index += 1) {
    value += candles[index].close;
  }
  value /= period;
  points.push({ time: candles[period - 1].time, value });
  for (let index = period; index < candles.length; index += 1) {
    value = (candles[index].close - value) * multiplier + value;
    points.push({ time: candles[index].time, value });
  }
  return points;
}

export interface BollingerBands {
  upper: IndicatorPoint[];
  basis: IndicatorPoint[];
  lower: IndicatorPoint[];
}

export function bollinger(
  candles: readonly IndicatorCandle[],
  period = 20,
  multiplier = 2,
): BollingerBands {
  const upper: IndicatorPoint[] = [];
  const basis: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    let sum = 0;
    for (let back = 0; back < period; back += 1) {
      sum += candles[index - back].close;
    }
    const mean = sum / period;
    let variance = 0;
    for (let back = 0; back < period; back += 1) {
      const diff = candles[index - back].close - mean;
      variance += diff * diff;
    }
    const deviation = Math.sqrt(variance / period);
    const time = candles[index].time;
    basis.push({ time, value: mean });
    upper.push({ time, value: mean + multiplier * deviation });
    lower.push({ time, value: mean - multiplier * deviation });
  }
  return { upper, basis, lower };
}

/** Session VWAP over the whole visible history (typical price, volume weighted). */
export function vwap(candles: readonly IndicatorCandle[]): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const candle of candles) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume ?? 0;
    cumulativePV += typical * volume;
    cumulativeVolume += volume;
    points.push({
      time: candle.time,
      value: cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typical,
    });
  }
  return points;
}

/** Wilder-smoothed RSI. */
export function rsi(candles: readonly IndicatorCandle[], period = 14): IndicatorPoint[] {
  if (candles.length <= period) {
    return [];
  }
  const points: IndicatorPoint[] = [];
  let gainSum = 0;
  let lossSum = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (change >= 0) {
      gainSum += change;
    } else {
      lossSum -= change;
    }
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const valueAt = () =>
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  points.push({ time: candles[period].time, value: valueAt() });
  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
    points.push({ time: candles[index].time, value: valueAt() });
  }
  return points;
}
