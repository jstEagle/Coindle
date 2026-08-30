"use client";

import { Loader2, TrendingDown, TrendingUp } from "lucide-react";

import { formatCurrency, formatPrice, formatSignedPercent } from "@/lib/format";
import type { TradeOrderType, TradeSide } from "@/lib/trading";

const AMOUNT_PRESETS = [0.25, 0.5, 1] as const;
const LEVERAGE_PRESETS = [1, 2, 5, 10] as const;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function OrderTicket({
  roundNumber,
  roundCount,
  balance,
  initialBalance,
  minOrderAmount,
  side,
  onSideChange,
  orderType,
  onOrderTypeChange,
  leverage,
  maxLeverage,
  onLeverageChange,
  amount,
  onAmountChange,
  limitPrice,
  onLimitPriceChange,
  frontierClose,
  disabled,
  submitting,
  error,
  onSubmit,
  tradingFeeRate,
}: {
  roundNumber: number;
  roundCount: number;
  balance: number;
  initialBalance: number;
  minOrderAmount: number;
  side: TradeSide;
  onSideChange: (side: TradeSide) => void;
  orderType: TradeOrderType;
  onOrderTypeChange: (orderType: TradeOrderType) => void;
  leverage: number;
  maxLeverage: number;
  onLeverageChange: (leverage: number) => void;
  amount: number;
  onAmountChange: (amount: number) => void;
  limitPrice: number | null;
  onLimitPriceChange: (price: number) => void;
  frontierClose: number;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  tradingFeeRate: number;
}) {
  const canAfford = balance >= minOrderAmount;
  const clampedAmount = Number.isFinite(amount) ? amount : 0;
  const runReturn = (balance / initialBalance - 1) * 100;
  const positionPercent =
    balance > 0 ? Math.max(0, Math.min(100, Math.round((clampedAmount / balance) * 100))) : 0;
  const fees = clampedAmount * leverage * tradingFeeRate * 2;
  const exposure = clampedAmount * leverage;
  const isLong = side === "long";
  const sideColor = isLong ? "var(--bull)" : "var(--bear)";

  return (
    <div
      className="flex flex-col gap-3.5 rounded-2xl border border-border-strong bg-panel p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
          Round {roundNumber} of {roundCount}
        </p>
        <div className="flex items-baseline gap-1.5">
          <p className="coindle-tabular text-sm font-semibold text-text">
            {formatCurrency(balance)}
          </p>
          <p
            className="coindle-tabular text-[11px] font-medium"
            style={{
              color:
                Math.abs(runReturn) < 0.005
                  ? "var(--text-faint)"
                  : runReturn > 0
                    ? "var(--bull)"
                    : "var(--bear)",
            }}
          >
            {formatSignedPercent(runReturn)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSideChange("long")}
          disabled={disabled}
          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: isLong ? "var(--bull-soft)" : "var(--bg-elevated)",
            color: isLong ? "var(--bull)" : "var(--text-muted)",
            border: `1px solid ${isLong ? "var(--bull)" : "var(--border-strong)"}`,
          }}
        >
          <TrendingUp size={15} strokeWidth={2.5} />
          Long
        </button>
        <button
          type="button"
          onClick={() => onSideChange("short")}
          disabled={disabled}
          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: !isLong ? "var(--bear-soft)" : "var(--bg-elevated)",
            color: !isLong ? "var(--bear)" : "var(--text-muted)",
            border: `1px solid ${!isLong ? "var(--bear)" : "var(--border-strong)"}`,
          }}
        >
          <TrendingDown size={15} strokeWidth={2.5} />
          Short
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-elevated p-1">
        {(["market", "limit"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onOrderTypeChange(option)}
            disabled={disabled}
            className="flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: orderType === option ? "var(--bg-elevated-hover)" : "transparent",
              color: orderType === option ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-faint">
            Leverage
          </span>
          <span className="coindle-tabular text-[11px] text-text-faint">
            {formatCurrency(exposure)} exposure
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-elevated p-1">
          {LEVERAGE_PRESETS.filter((value) => value <= maxLeverage).map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={leverage === value}
              onClick={() => onLeverageChange(value)}
              className="rounded-lg py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: leverage === value ? "var(--gold-soft)" : "transparent",
                color: leverage === value ? "var(--gold)" : "var(--text-muted)",
              }}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="order-amount"
            className="text-[10px] font-medium uppercase tracking-wide text-text-faint"
          >
            Amount
          </label>
          <span className="coindle-tabular text-[11px] text-text-faint">
            {positionPercent}% of balance
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 items-center gap-1 rounded-xl border border-border-strong bg-elevated px-2.5 py-1.5">
            <span className="text-sm text-text-faint">$</span>
            <input
              id="order-amount"
              type="number"
              min={minOrderAmount}
              max={balance}
              step="0.01"
              value={amount}
              disabled={disabled}
              onChange={(event) => onAmountChange(Number(event.target.value))}
              className="coindle-tabular w-full bg-transparent text-sm font-medium text-text outline-none"
            />
          </div>
          {AMOUNT_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              disabled={disabled}
              onClick={() => onAmountChange(Math.max(minOrderAmount, round2(balance * pct)))}
              className="rounded-lg border border-border-strong px-2 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pct === 1 ? "Max" : `${pct * 100}%`}
            </button>
          ))}
        </div>
        <input
          type="range"
          aria-label="Amount as percentage of balance"
          min={Math.min(minOrderAmount, balance)}
          max={Math.max(minOrderAmount, balance)}
          step="0.01"
          value={Math.max(Math.min(clampedAmount, balance), Math.min(minOrderAmount, balance))}
          disabled={disabled}
          onChange={(event) => onAmountChange(round2(Number(event.target.value)))}
          className="coindle-range w-full"
          style={{ color: sideColor, accentColor: sideColor }}
        />
      </div>

      {orderType === "limit" && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="limit-price"
            className="text-[10px] font-medium uppercase tracking-wide text-text-faint"
          >
            Limit price — drag the gold line on the chart, or type it here
          </label>
          <div className="flex items-center gap-1 rounded-xl border border-border-strong bg-elevated px-2.5 py-1.5">
            <span className="text-sm text-text-faint">$</span>
            <input
              id="limit-price"
              type="number"
              step="any"
              value={limitPrice ?? frontierClose}
              disabled={disabled}
              onChange={(event) => onLimitPriceChange(Number(event.target.value))}
              className="coindle-tabular w-full bg-transparent text-sm font-medium text-text outline-none"
            />
          </div>
          <p className="text-[11px] text-text-faint">
            Current price {formatPrice(frontierClose)}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-elevated/60 px-3 py-2 text-[11px] text-text-faint">
        <span>Max loss {formatCurrency(clampedAmount)}</span>
        <span>{tradingFeeRate > 0 ? `Fees ${formatCurrency(fees)}` : "No fees"}</span>
      </div>

      {error && (
        <p className="text-xs text-score-low" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !canAfford}
        className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-black transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: sideColor }}
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        {submitting
          ? "Placing order…"
          : `${isLong ? "Long" : "Short"} ${formatCurrency(clampedAmount)} · ${leverage}× ${orderType === "market" ? "Market" : "Limit"}`}
      </button>
    </div>
  );
}
