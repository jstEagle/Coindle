"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Modal } from "@/components/game/Modal";
import { PositionBadge } from "@/components/game/PositionBadge";
import { ResultPill } from "@/components/game/ResultPill";
import {
  formatCountdown,
  formatCurrency,
  formatPuzzleNumber,
  formatSignedPercent,
  getCountdownToNextUtcDay,
} from "@/lib/format";
import type { PuzzleReveal } from "@/app/api/puzzle/trade/route";
import type { Stats, StoredRound } from "@/lib/gameStorage";
import { resultTier } from "@/lib/resultTier";

const TIER_EMOJI = { profit: "🟩", flat: "⬜", loss: "🟥" } as const;
const SIDE_EMOJI = { long: "⬆️", short: "⬇️" } as const;

function buildShareText(
  puzzleNumber: number,
  rounds: readonly StoredRound[],
  totalReturnPercent: number,
): string {
  const grid = rounds
    .map((entry) => {
      const tier = entry.trade.status === "unfilled" ? "flat" : resultTier(entry.trade.returnPercent);
      return `${TIER_EMOJI[tier]}${SIDE_EMOJI[entry.order.side]}`;
    })
    .join(" ");

  return `Coindle ${formatPuzzleNumber(puzzleNumber)} 🪙\n${grid}\n${formatSignedPercent(totalReturnPercent)}`;
}

export function ResultModal({
  puzzleNumber,
  rounds,
  initialBalance,
  finalBalance,
  reveal,
  roundCount,
  stats,
  onClose,
}: {
  puzzleNumber: number;
  rounds: readonly StoredRound[];
  initialBalance: number;
  finalBalance: number;
  reveal: PuzzleReveal | null;
  roundCount: number;
  stats: Stats;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(getCountdownToNextUtcDay()),
  );

  const totalReturnPercent = ((finalBalance / initialBalance) - 1) * 100;
  const won = finalBalance > initialBalance;

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(getCountdownToNextUtcDay()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleShare = async () => {
    const text = buildShareText(puzzleNumber, rounds, totalReturnPercent);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable; nothing to fall back to.
    }
  };

  return (
    <Modal title={won ? "Run complete" : "Run over"} onClose={onClose} maxWidthClassName="max-w-lg">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-text">
              {won ? "You grew the bag 📈" : "Better luck tomorrow"}
            </p>
            <p className="text-sm text-text-muted">
              {formatCurrency(initialBalance)} → {formatCurrency(finalBalance)}
            </p>
          </div>
          <ResultPill returnPercent={totalReturnPercent} size="lg" />
        </div>

        {reveal && (
          <div className="rounded-xl border border-border-strong bg-elevated p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text">
                  {reveal.coin.name}{" "}
                  <span className="text-text-faint">${reveal.coin.symbol}</span>
                </p>
                <p className="text-xs text-text-muted">{reveal.coin.outcome}</p>
              </div>
              <a
                href={reveal.coin.tradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold-soft"
              >
                Trade <ExternalLink size={12} />
              </a>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
              <span>Liquidity: {reveal.coin.liquidityTier}</span>
              <span>Lifecycle: {reveal.coin.lifecycle}</span>
            </div>
            <p className="mt-3 text-[11px] text-text-faint">
              Source: {reveal.source.provider} &middot;{" "}
              <a
                href={reveal.source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-text-muted"
              >
                view pool
              </a>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {rounds.map((entry) => (
            <div
              key={entry.round}
              className="flex items-center justify-between rounded-lg bg-elevated px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 text-text-muted">
                Round {entry.round}
                <PositionBadge side={entry.order.side} compact />
                <span className="text-[10px] font-medium text-text-faint">
                  {entry.order.leverage ?? 1}×
                </span>
              </span>
              {entry.trade.status === "unfilled" ? (
                <span className="text-xs font-medium text-text-faint">Unfilled</span>
              ) : (
                <ResultPill returnPercent={entry.trade.returnPercent} size="sm" />
              )}
            </div>
          ))}
          {rounds.length < roundCount && (
            <p className="px-1 text-xs text-text-faint">
              Balance ran out before all {roundCount} rounds were played.
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-elevated/50 p-3 text-center">
          <StatBlock label="Played" value={stats.played} />
          <StatBlock
            label="Win %"
            value={stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0}
          />
          <StatBlock label="Streak" value={stats.currentStreak} />
          <StatBlock label="Best" value={stats.maxStreak} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied!" : "Share result"}
          </button>
        </div>

        <p className="coindle-tabular text-center text-xs text-text-faint">
          Next coin in {countdown}
        </p>
      </div>
    </Modal>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="coindle-tabular text-lg font-semibold text-text">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}
