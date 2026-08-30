"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brush,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  Minus,
  MousePointer2,
  MoveDiagonal,
  MoveUpRight,
  Redo2,
  Ruler,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
} from "lucide-react";

import { DRAWING_PALETTE, type ChartTool } from "@/lib/drawings";

interface ToolDef {
  id: ChartTool;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
}

const ICON_SIZE = 15;

const TOOLS: readonly ToolDef[] = [
  { id: "cursor", label: "Cursor", shortcut: "Esc", icon: <MousePointer2 size={ICON_SIZE} /> },
  { id: "trendline", label: "Trend line", shortcut: "T", icon: <TrendingUp size={ICON_SIZE} /> },
  { id: "ray", label: "Ray", shortcut: "R", icon: <MoveUpRight size={ICON_SIZE} /> },
  { id: "extended", label: "Extended line", shortcut: "E", icon: <MoveDiagonal size={ICON_SIZE} /> },
  { id: "horizontal", label: "Horizontal line", shortcut: "H", icon: <Minus size={ICON_SIZE} /> },
  {
    id: "vertical",
    label: "Vertical line",
    shortcut: "V",
    icon: <Minus size={ICON_SIZE} className="rotate-90" />,
  },
  { id: "rect", label: "Rectangle", shortcut: "S", icon: <Square size={ICON_SIZE} /> },
  {
    id: "fib",
    label: "Fib retracement",
    shortcut: "F",
    icon: (
      <span className="font-mono text-[9px] font-bold leading-none" aria-hidden>
        Fib
      </span>
    ),
  },
  { id: "brush", label: "Brush", shortcut: "B", icon: <Brush size={ICON_SIZE} /> },
  { id: "text", label: "Text note", shortcut: "N", icon: <Type size={ICON_SIZE} /> },
  { id: "measure", label: "Measure", shortcut: "M", icon: <Ruler size={ICON_SIZE} /> },
];

function RailButton({
  label,
  active,
  disabled,
  onClick,
  children,
  danger,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors active:opacity-60 disabled:cursor-not-allowed disabled:opacity-30 lg:h-8 lg:w-8"
      style={{
        background: active ? "var(--gold-soft)" : "transparent",
        color: active ? "var(--gold)" : danger ? "var(--bear)" : "var(--text-muted)",
      }}
      onMouseEnter={(event) => {
        if (!active && !disabled) {
          (event.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)";
        }
      }}
      onMouseLeave={(event) => {
        if (!active) {
          (event.currentTarget as HTMLButtonElement).style.background = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

export function ChartToolbar({
  activeTool,
  onToolChange,
  magnet,
  onMagnetToggle,
  drawingsHidden,
  onDrawingsHiddenToggle,
  drawingsLocked,
  onDrawingsLockedToggle,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasSelection,
  hasDrawings,
  onDeleteSelected,
  onClearAll,
  color,
  onColorChange,
}: {
  activeTool: ChartTool;
  onToolChange: (tool: ChartTool) => void;
  magnet: boolean;
  onMagnetToggle: () => void;
  drawingsHidden: boolean;
  onDrawingsHiddenToggle: () => void;
  drawingsLocked: boolean;
  onDrawingsLockedToggle: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelection: boolean;
  hasDrawings: boolean;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  color: string;
  onColorChange: (color: string) => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    const close = (event: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [paletteOpen]);

  const divider = (
    <span className="mx-auto my-0.5 hidden h-px w-5 bg-border-strong lg:block" aria-hidden />
  );
  const dividerH = <span className="my-auto mx-0.5 h-5 w-px shrink-0 bg-border-strong lg:hidden" aria-hidden />;

  return (
    <div className="coindle-scrollbar-none flex max-w-full items-center gap-1 overflow-x-auto lg:h-full lg:min-h-0 lg:w-9 lg:flex-col lg:items-stretch lg:justify-start lg:gap-1 lg:overflow-y-auto lg:overflow-x-visible">
      {TOOLS.map(({ id, label, shortcut, icon }) => (
        <RailButton
          key={id}
          label={shortcut ? `${label} (${shortcut})` : label}
          active={activeTool === id}
          onClick={() => onToolChange(activeTool === id ? "cursor" : id)}
        >
          {icon}
        </RailButton>
      ))}

      {divider}
      {dividerH}

      <RailButton label={`Magnet — snap to OHLC (W)`} active={magnet} onClick={onMagnetToggle}>
        <Magnet size={ICON_SIZE} />
      </RailButton>

      <div className="relative" ref={paletteRef}>
        <RailButton label="Drawing color" onClick={() => setPaletteOpen((open) => !open)}>
          <span
            className="h-3.5 w-3.5 rounded-full border border-white/20"
            style={{ background: color }}
            aria-hidden
          />
        </RailButton>
        {paletteOpen && (
          <div className="absolute left-0 top-9 z-40 flex gap-1 rounded-lg border border-border-strong bg-elevated p-1.5 shadow-xl lg:left-9 lg:top-0">
            {DRAWING_PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Color ${swatch}`}
                onClick={() => {
                  onColorChange(swatch);
                  setPaletteOpen(false);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-elevated-hover"
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{
                    background: swatch,
                    outline: swatch === color ? "2px solid white" : "none",
                    outlineOffset: 1,
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {divider}
      {dividerH}

      <RailButton
        label={drawingsHidden ? "Show drawings" : "Hide drawings"}
        active={drawingsHidden}
        onClick={onDrawingsHiddenToggle}
      >
        {drawingsHidden ? <EyeOff size={ICON_SIZE} /> : <Eye size={ICON_SIZE} />}
      </RailButton>
      <RailButton
        label={drawingsLocked ? "Unlock drawings" : "Lock drawings"}
        active={drawingsLocked}
        onClick={onDrawingsLockedToggle}
      >
        {drawingsLocked ? <Lock size={ICON_SIZE} /> : <LockOpen size={ICON_SIZE} />}
      </RailButton>

      {divider}
      {dividerH}

      <RailButton label="Undo (⌘Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={ICON_SIZE} />
      </RailButton>
      <RailButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={ICON_SIZE} />
      </RailButton>
      <RailButton
        label="Delete selected (⌫)"
        disabled={!hasSelection}
        onClick={onDeleteSelected}
        danger
      >
        <Trash2 size={ICON_SIZE} />
      </RailButton>
      <RailButton label="Clear all drawings" disabled={!hasDrawings} onClick={onClearAll} danger>
        <Eraser size={ICON_SIZE} />
      </RailButton>
    </div>
  );
}
