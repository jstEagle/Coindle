import { Coins, LineChart, PencilRuler, Repeat, Wallet } from "lucide-react";

import { Modal } from "@/components/game/Modal";
import { formatCurrency } from "@/lib/format";

function Step({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Coins;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-gold">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-text-muted">
          {children}
        </p>
      </div>
    </div>
  );
}

export function InstructionsModal({
  onClose,
  initialBalance,
  roundCount,
  roundCandles,
  maxLeverage,
  tradingFeeRate,
}: {
  onClose: () => void;
  initialBalance: number;
  roundCount: number;
  roundCandles: number;
  maxLeverage: number;
  tradingFeeRate: number;
}) {
  return (
    <Modal title="How to play" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Step icon={LineChart} title="A real Solana market, mid-session">
          Every day is a real fifteen-minute candle chart from an anonymized
          Solana market, from established coins to volatile new launches. You
          see the first six hours &mdash; the rest plays out as you trade it.
        </Step>
        <Step icon={Wallet} title={`Start with ${formatCurrency(initialBalance)}`}>
          Go long or short with a market order (fills instantly at the last
          price) or a limit order (fills only if price reaches your line,
          drag it right on the chart). Choose up to {maxLeverage}× isolated
          leverage; leveraged P&amp;L scales with exposure and your posted amount
          is the maximum loss.
        </Step>
        <Step icon={Repeat} title={`${roundCount} rounds, ${roundCandles} candles each`}>
          After you place an order, the next {roundCandles} candles reveal
          and your position is closed at the close of the last one. Profit or
          loss carries into your balance for the next round.
          {tradingFeeRate > 0
            ? ` A ${(tradingFeeRate * 100).toFixed(2)}% fee applies to each side of a trade.`
            : " Trading is fee-free."}
        </Step>
        <Step icon={Coins} title="One coin a day">
          Run out of balance and the run ends early. Either way, after the
          final round the coin&apos;s real identity is revealed. A new chart
          drops every day at 00:00 UTC.
        </Step>
        <Step icon={PencilRuler} title="A full charting toolkit">
          Trend lines, fibs, rectangles, notes, a measure tool and indicators
          live in the toolbars around the chart. Scroll to zoom, drag to pan,
          double-click to re-fit — your drawings are saved for the day.
        </Step>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-xl bg-gold py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
      >
        Let&apos;s go
      </button>
    </Modal>
  );
}
