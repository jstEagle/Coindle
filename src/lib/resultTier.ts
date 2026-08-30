export type ResultTier = "profit" | "flat" | "loss";

const FLAT_EPSILON_PERCENT = 0.01;

/** Classifies a trade or run outcome from its return percent (already percent-scale, not log). */
export function resultTier(returnPercent: number): ResultTier {
  if (Math.abs(returnPercent) < FLAT_EPSILON_PERCENT) {
    return "flat";
  }
  return returnPercent > 0 ? "profit" : "loss";
}

export const RESULT_TIER_COLOR: Record<ResultTier, string> = {
  profit: "var(--score-solved)",
  flat: "var(--score-close)",
  loss: "var(--score-low)",
};

export const RESULT_TIER_SOFT_COLOR: Record<ResultTier, string> = {
  profit: "var(--score-solved-soft)",
  flat: "var(--score-close-soft)",
  loss: "var(--score-low-soft)",
};

export const RESULT_TIER_LABEL: Record<ResultTier, string> = {
  profit: "Profit",
  flat: "Flat",
  loss: "Loss",
};
