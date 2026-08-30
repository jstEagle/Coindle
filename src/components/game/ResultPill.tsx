import { formatSignedPercent } from "@/lib/format";
import {
  RESULT_TIER_COLOR,
  RESULT_TIER_SOFT_COLOR,
  resultTier,
} from "@/lib/resultTier";

export function ResultPill({
  returnPercent,
  size = "md",
}: {
  returnPercent: number;
  size?: "sm" | "md" | "lg";
}) {
  const tier = resultTier(returnPercent);
  const color = RESULT_TIER_COLOR[tier];
  const soft = RESULT_TIER_SOFT_COLOR[tier];

  const sizeClasses =
    size === "lg"
      ? "text-2xl px-4 py-2 gap-1.5"
      : size === "sm"
        ? "text-xs px-2 py-0.5 gap-1"
        : "text-sm px-2.5 py-1 gap-1";

  return (
    <span
      className={`coindle-tabular inline-flex items-center rounded-full font-semibold ${sizeClasses}`}
      style={{ color, background: soft, border: `1px solid ${color}33` }}
    >
      {formatSignedPercent(returnPercent)}
    </span>
  );
}
