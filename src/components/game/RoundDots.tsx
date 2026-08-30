import { RESULT_TIER_COLOR, resultTier } from "@/lib/resultTier";
import type { StoredRound } from "@/lib/gameStorage";

export function RoundDots({
  rounds,
  roundCount,
}: {
  rounds: readonly StoredRound[];
  roundCount: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: roundCount }, (_, index) => {
        const entry = rounds[index];
        const color = entry
          ? RESULT_TIER_COLOR[resultTier(entry.trade.returnPercent)]
          : undefined;
        return (
          <span
            key={index}
            className="h-1.5 w-1.5 rounded-full border transition-colors"
            style={{
              background: color ?? "transparent",
              borderColor: color ?? "var(--border-strong)",
            }}
          />
        );
      })}
    </div>
  );
}
