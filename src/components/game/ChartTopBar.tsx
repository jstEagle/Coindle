"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart2,
  Check,
  ChevronDown,
  Expand,
  LineChart,
  Scan,
  Shrink,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

import type { ChartSettings, ChartType } from "@/lib/chartSettings";
import { INDICATORS, type IndicatorId } from "@/lib/indicators";

const CHART_TYPES: readonly { id: ChartType; label: string; icon: React.ReactNode }[] = [
  { id: "candles", label: "Candles", icon: <CandlesIcon /> },
  { id: "bars", label: "Bars", icon: <BarChart2 size={14} /> },
  { id: "line", label: "Line", icon: <LineChart size={14} /> },
  { id: "area", label: "Area", icon: <TrendingUp size={14} /> },
];

function CandlesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M4 2v2M4 10v2M10 1v2M10 9v2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="4" width="3" height="6" rx="0.75" fill="currentColor" />
      <rect x="8.5" y="3" width="3" height="6" rx="0.75" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onClose]);
  return ref;
}

function BarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs font-medium transition-colors hover:bg-elevated active:opacity-60"
      style={{
        background: active ? "var(--gold-soft)" : undefined,
        color: active ? "var(--gold)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

export function ChartTopBar({
  settings,
  onSettingsChange,
  onFit,
  fullscreen,
  onFullscreenToggle,
}: {
  settings: ChartSettings;
  onSettingsChange: (settings: ChartSettings) => void;
  onFit: () => void;
  fullscreen: boolean;
  onFullscreenToggle: () => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const typeRef = useClickOutside(typeOpen, () => setTypeOpen(false));
  const indicatorsRef = useClickOutside(indicatorsOpen, () => setIndicatorsOpen(false));

  const currentType = CHART_TYPES.find((entry) => entry.id === settings.chartType) ?? CHART_TYPES[0];
  const activeCount = settings.indicators.length + (settings.showVolume ? 1 : 0);

  const toggleIndicator = (id: IndicatorId) => {
    const active = settings.indicators.includes(id);
    onSettingsChange({
      ...settings,
      indicators: active
        ? settings.indicators.filter((entry) => entry !== id)
        : [...settings.indicators, id],
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <div className="relative" ref={typeRef}>
        <BarButton label="Chart type" onClick={() => setTypeOpen((open) => !open)}>
          {currentType.icon}
          <span className="hidden sm:inline">{currentType.label}</span>
          <ChevronDown size={12} className="opacity-60" />
        </BarButton>
        {typeOpen && (
          <div className="absolute left-0 top-9 z-40 w-36 rounded-lg border border-border-strong bg-elevated p-1 shadow-xl">
            {CHART_TYPES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  onSettingsChange({ ...settings, chartType: entry.id });
                  setTypeOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-elevated-hover"
                style={{
                  color: entry.id === settings.chartType ? "var(--gold)" : "var(--text)",
                }}
              >
                {entry.icon}
                {entry.label}
                {entry.id === settings.chartType && <Check size={12} className="ml-auto" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative" ref={indicatorsRef}>
        <BarButton
          label="Indicators"
          active={activeCount > 0}
          onClick={() => setIndicatorsOpen((open) => !open)}
        >
          <SlidersHorizontal size={13} />
          <span className="hidden sm:inline">Indicators</span>
          {activeCount > 0 && (
            <span className="coindle-tabular rounded-full bg-gold px-1 text-[10px] font-bold text-black">
              {activeCount}
            </span>
          )}
        </BarButton>
        {indicatorsOpen && (
          <div className="absolute left-0 top-9 z-40 w-48 rounded-lg border border-border-strong bg-elevated p-1 shadow-xl">
            <MenuCheckbox
              label="Volume"
              checked={settings.showVolume}
              onToggle={() =>
                onSettingsChange({ ...settings, showVolume: !settings.showVolume })
              }
            />
            <div className="mx-2 my-1 h-px bg-border" />
            {INDICATORS.map((indicator) => (
              <MenuCheckbox
                key={indicator.id}
                label={indicator.label}
                swatch={indicator.color}
                checked={settings.indicators.includes(indicator.id)}
                onToggle={() => toggleIndicator(indicator.id)}
              />
            ))}
          </div>
        )}
      </div>

      <BarButton
        label="Logarithmic price scale"
        active={settings.logScale}
        onClick={() => onSettingsChange({ ...settings, logScale: !settings.logScale })}
      >
        <span className="font-mono text-[11px] font-bold">log</span>
      </BarButton>

      <span className="mx-0.5 h-5 w-px bg-border-strong" aria-hidden />

      <BarButton label="Fit chart to data (double-click chart)" onClick={onFit}>
        <Scan size={13} />
      </BarButton>

      <BarButton
        label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        active={fullscreen}
        onClick={onFullscreenToggle}
      >
        {fullscreen ? <Shrink size={13} /> : <Expand size={13} />}
      </BarButton>
    </div>
  );
}

function MenuCheckbox({
  label,
  checked,
  onToggle,
  swatch,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text transition-colors hover:bg-elevated-hover"
    >
      <span
        className="flex h-3.5 w-3.5 items-center justify-center rounded border"
        style={{
          background: checked ? "var(--gold)" : "transparent",
          borderColor: checked ? "var(--gold)" : "var(--border-strong)",
        }}
      >
        {checked && <Check size={10} className="text-black" strokeWidth={3} />}
      </span>
      {swatch && <span className="h-2 w-2 rounded-full" style={{ background: swatch }} />}
      {label}
    </button>
  );
}
