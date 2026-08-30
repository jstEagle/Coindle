import { BarChart3, CircleHelp, Flame } from "lucide-react";

import { formatCurrency, formatPuzzleNumber, formatSignedPercent } from "@/lib/format";

export function Header({
  puzzleNumber,
  streak,
  balance,
  returnPercent,
  onHelp,
  onStats,
}: {
  puzzleNumber: number;
  streak: number;
  balance: number;
  returnPercent: number;
  onHelp: () => void;
  onStats: () => void;
}) {
  const returnColor =
    Math.abs(returnPercent) < 0.005
      ? "var(--text-faint)"
      : returnPercent > 0
        ? "var(--bull)"
        : "var(--bear)";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-soft font-mono text-sm font-bold text-gold">
            C
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-mono text-sm font-bold tracking-[0.18em] text-text">
              COINDLE
            </span>
            <span className="coindle-tabular text-[11px] text-text-faint">
              {formatPuzzleNumber(puzzleNumber)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-border-strong bg-panel px-2.5 py-1.5 sm:gap-2 sm:px-3">
            <span className="coindle-tabular text-xs font-semibold text-text sm:text-sm">
              {formatCurrency(balance)}
            </span>
            <span
              className="coindle-tabular text-[11px] font-semibold sm:text-xs"
              style={{ color: returnColor }}
            >
              {formatSignedPercent(returnPercent)}
            </span>
          </div>

          {streak > 0 && (
            <span className="hidden items-center gap-1 rounded-full bg-elevated px-2.5 py-1.5 text-xs font-semibold text-gold min-[420px]:flex">
              <Flame size={13} strokeWidth={2.5} />
              {streak}
            </span>
          )}
          <button
            type="button"
            onClick={onStats}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-elevated hover:text-text active:bg-elevated-hover"
            aria-label="Statistics"
          >
            <BarChart3 size={18} />
          </button>
          <button
            type="button"
            onClick={onHelp}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-elevated hover:text-text active:bg-elevated-hover"
            aria-label="How to play"
          >
            <CircleHelp size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
