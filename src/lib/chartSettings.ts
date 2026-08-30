import type { IndicatorId } from "@/lib/indicators";

export type ChartType = "candles" | "bars" | "line" | "area";

export interface ChartSettings {
  chartType: ChartType;
  logScale: boolean;
  showVolume: boolean;
  indicators: readonly IndicatorId[];
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  chartType: "candles",
  logScale: false,
  showVolume: true,
  indicators: [],
};

const SETTINGS_KEY = "coindle:v2:chart-settings";

export function loadChartSettings(): ChartSettings {
  if (typeof window === "undefined") {
    return DEFAULT_CHART_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_CHART_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<ChartSettings>;
    return {
      ...DEFAULT_CHART_SETTINGS,
      ...parsed,
      indicators: Array.isArray(parsed.indicators)
        ? (parsed.indicators as IndicatorId[])
        : DEFAULT_CHART_SETTINGS.indicators,
    };
  } catch {
    return DEFAULT_CHART_SETTINGS;
  }
}

export function saveChartSettings(settings: ChartSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can fail (quota, private mode); settings just won't persist.
  }
}
