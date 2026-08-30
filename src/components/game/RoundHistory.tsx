import { PositionBadge } from "@/components/game/PositionBadge";
import { ResultPill } from "@/components/game/ResultPill";
import { formatPrice, formatSignedCurrency } from "@/lib/format";
import { RESULT_TIER_COLOR, resultTier } from "@/lib/resultTier";
import type { StoredRound } from "@/lib/gameStorage";

export function RoundHistory({
  rounds,
  roundCount,
}: {
  rounds: readonly StoredRound[];
  roundCount: number;
}) {
  const slots = Array.from({ length: roundCount }, (_, index) => {
    const roundNumber = index + 1;
    return rounds.find((entry) => entry.round === roundNumber) ?? null;
  });

  return (
    <div className="flex flex-col gap-2">
      {slots.map((entry, index) => {
        const roundNumber = index + 1;

        if (!entry) {
          return (
            <div
              key={roundNumber}
              className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2 text-text-faint"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs">
                {roundNumber}
              </span>
              <span className="text-xs">Round not played yet</span>
            </div>
          );
        }

        const { trade } = entry;
        const unfilled = trade.status === "unfilled";
        const color = unfilled ? "var(--text-faint)" : RESULT_TIER_COLOR[resultTier(trade.returnPercent)];

        return (
          <div
            key={roundNumber}
            className="coindle-fade-in flex flex-col gap-2 rounded-xl border border-border-strong bg-elevated px-3 py-2.5"
            style={{ boxShadow: `inset 3px 0 0 ${color}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel text-xs text-text-muted">
                  {roundNumber}
                </span>
                <PositionBadge side={trade.order.side} compact />
                <span className="text-[10px] uppercase tracking-wide text-text-faint">
                  {trade.order.leverage ?? 1}× {trade.order.orderType}
                </span>
              </div>
              {unfilled ? (
                <span className="text-xs font-medium text-text-faint">Unfilled</span>
              ) : (
                <ResultPill returnPercent={trade.returnPercent} size="sm" />
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>
                {unfilled
                  ? "Order never filled"
                  : trade.liquidated
                    ? `Liquidated at ${formatPrice(trade.exitPrice)}`
                    : `${formatPrice(trade.fillPrice ?? 0)} → ${formatPrice(trade.exitPrice)}`}
              </span>
              <span className="coindle-tabular font-medium" style={{ color: unfilled ? "var(--text-faint)" : color }}>
                {unfilled ? "$0.00" : formatSignedCurrency(trade.pnl)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
