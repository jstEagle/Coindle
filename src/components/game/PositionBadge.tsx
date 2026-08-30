import { TrendingDown, TrendingUp } from "lucide-react";

import type { TradeSide } from "@/lib/trading";

const CONFIG: Record<TradeSide, { label: string; color: string; Icon: typeof TrendingUp }> = {
  long: { label: "Long", color: "var(--bull)", Icon: TrendingUp },
  short: { label: "Short", color: "var(--bear)", Icon: TrendingDown },
};

export function PositionBadge({
  side,
  compact = false,
}: {
  side: TradeSide;
  compact?: boolean;
}) {
  const { label, color, Icon } = CONFIG[side];

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color }}
    >
      <Icon size={compact ? 13 : 15} strokeWidth={2.5} />
      {!compact && <span>{label}</span>}
    </span>
  );
}
