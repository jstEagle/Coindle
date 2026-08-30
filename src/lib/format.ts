const SUBSCRIPT_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

function toSubscript(value: number): string {
  return String(value)
    .split("")
    .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
    .join("");
}

/**
 * Formats a price with compact leading-zero notation for the vanishingly
 * very small token prices, e.g. 0.00000356 -> "$0.0₅356".
 */
export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) {
    return "$0.00";
  }

  if (price >= 1) {
    return `$${price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: price >= 100 ? 2 : 4,
    })}`;
  }

  const exponent = Math.floor(Math.log10(price));
  const leadingZeros = -exponent - 1;

  if (leadingZeros < 4) {
    const decimals = Math.min(10, leadingZeros + 4);
    return `$${price.toFixed(decimals)}`;
  }

  const shifted = price * 10 ** (leadingZeros + 4);
  const digits = Math.round(shifted).toString().slice(0, 4).padEnd(4, "0");
  return `$0.0${toSubscript(leadingZeros)}${digits}`;
}

/** Formats an already-percent-scale return, e.g. 5.2 -> "+5.20%". */
export function formatSignedPercent(percent: number, decimals = 2): string {
  if (!Number.isFinite(percent)) {
    return "—";
  }
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(decimals)}%`;
}

export function formatCurrency(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatSignedCurrency(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value), decimals)}`;
}

const ELAPSED_UNITS: readonly { label: string; seconds: number }[] = [
  { label: "d", seconds: 86_400 },
  { label: "h", seconds: 3_600 },
  { label: "m", seconds: 60 },
];

/** Formats a signed offset in seconds as compact elapsed time, e.g. "-3h35m" / "+10m". */
export function formatElapsedOffset(offsetSeconds: number): string {
  if (offsetSeconds === 0) {
    return "now";
  }

  const sign = offsetSeconds > 0 ? "+" : "-";
  let remaining = Math.abs(Math.round(offsetSeconds));
  const parts: string[] = [];

  for (const unit of ELAPSED_UNITS) {
    if (remaining >= unit.seconds && parts.length < 2) {
      const amount = Math.floor(remaining / unit.seconds);
      remaining -= amount * unit.seconds;
      parts.push(`${amount}${unit.label}`);
    }
  }

  if (parts.length === 0) {
    return `${sign}${remaining}s`;
  }

  return `${sign}${parts.join("")}`;
}

export function formatPuzzleNumber(puzzleNumber: number): string {
  return `#${puzzleNumber.toString().padStart(3, "0")}`;
}

export interface Countdown {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

export function getCountdownToNextUtcDay(now = new Date()): Countdown {
  const nextMidnightUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const totalSeconds = Math.max(
    0,
    Math.floor((nextMidnightUtc - now.getTime()) / 1000),
  );

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  };
}

export function formatCountdown(countdown: Countdown): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`;
}
