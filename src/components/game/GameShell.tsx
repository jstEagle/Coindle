"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePersistedState } from "@/hooks/usePersistedState";

import { ChartToolbar } from "@/components/game/ChartToolbar";
import { ChartTopBar } from "@/components/game/ChartTopBar";
import { Header } from "@/components/game/Header";
import { InstructionsModal } from "@/components/game/InstructionsModal";
import { OrderTicket } from "@/components/game/OrderTicket";
import { ResultModal } from "@/components/game/ResultModal";
import { ResultPill } from "@/components/game/ResultPill";
import { RoundDots } from "@/components/game/RoundDots";
import { RoundHistory } from "@/components/game/RoundHistory";
import { StatsModal } from "@/components/game/StatsModal";
import { TradeChart, type ChartCandle, type RoundMarker } from "@/components/game/TradeChart";
import type { TradeResponse } from "@/app/api/puzzle/trade/route";
import {
  DEFAULT_CHART_SETTINGS,
  loadChartSettings,
  saveChartSettings,
  type ChartSettings,
} from "@/lib/chartSettings";
import { DEFAULT_DRAWING_COLOR, type ChartTool, type Drawing } from "@/lib/drawings";
import { formatCurrency, formatPrice } from "@/lib/format";
import {
  hasSeenInstructions,
  loadDrawings,
  loadProgress,
  loadStats,
  markInstructionsSeen,
  pruneOldDrawings,
  pruneOldProgress,
  recordCompletion,
  saveDrawings,
  saveProgress,
  type Stats,
  type StoredProgress,
  type StoredRound,
} from "@/lib/gameStorage";
import type { PublicPuzzlePayload } from "@/lib/puzzles";
import { validateTradeOrder, type TradeOrder, type TradeOrderType, type TradeSide } from "@/lib/trading";

const EMPTY_STATS: Stats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastCompletedPuzzleNumber: null,
  bestReturnPercent: 0,
};
const EMPTY_DRAWINGS: Drawing[] = [];
const HISTORY_LIMIT = 64;

const TOOL_SHORTCUTS: Record<string, ChartTool> = {
  t: "trendline",
  r: "ray",
  e: "extended",
  h: "horizontal",
  v: "vertical",
  s: "rect",
  f: "fib",
  b: "brush",
  n: "text",
  m: "measure",
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function GameShell({ puzzle }: { puzzle: PublicPuzzlePayload }) {
  const defaultProgress: StoredProgress = useMemo(
    () => ({
      puzzleId: puzzle.puzzleId,
      puzzleNumber: puzzle.puzzleNumber,
      rounds: [],
      complete: false,
      reveal: null,
      nextRoundTimes: puzzle.nextRoundTimes,
    }),
    [puzzle],
  );

  // Seeded from localStorage without a hydration mismatch or a
  // setState-in-effect: the real value replaces the SSR-safe default in the
  // same render pass it becomes available (see usePersistedState). `set*`
  // then behaves like ordinary useState for interactive updates.
  const [progress, setProgress] = usePersistedState<StoredProgress>(() => {
    const stored = loadProgress(puzzle.puzzleId);
    return stored && stored.puzzleNumber === puzzle.puzzleNumber ? stored : defaultProgress;
  }, defaultProgress);
  const [stats, setStats] = usePersistedState<Stats>(() => loadStats(), EMPTY_STATS);
  const [showInstructions, setShowInstructions] = usePersistedState<boolean>(
    () => !hasSeenInstructions(),
    false,
  );
  const [chartSettings, setChartSettings] = usePersistedState<ChartSettings>(
    () => loadChartSettings(),
    DEFAULT_CHART_SETTINGS,
  );

  const [side, setSide] = useState<TradeSide>("long");
  const [orderType, setOrderType] = useState<TradeOrderType>("market");
  const [leverage, setLeverage] = useState(1);
  const [amount, setAmount] = useState<number>(
    round2(puzzle.gameConfig.initialBalance * 0.25),
  );
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [pendingResult, setPendingResult] = useState(false);

  const [drawings, setDrawings] = usePersistedState<Drawing[]>(
    () => loadDrawings(puzzle.puzzleId),
    EMPTY_DRAWINGS,
  );
  const [activeTool, setActiveTool] = useState<ChartTool>("cursor");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayFromIndex, setReplayFromIndex] = useState<number | null>(null);

  const [magnet, setMagnet] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingColor, setDrawingColor] = useState<string>(DEFAULT_DRAWING_COLOR);
  const [fullscreen, setFullscreen] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  const undoStackRef = useRef<Drawing[][]>([]);
  const redoStackRef = useRef<Drawing[][]>([]);
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });

  useEffect(() => {
    pruneOldProgress(puzzle.puzzleId);
    pruneOldDrawings(puzzle.puzzleId);
  }, [puzzle.puzzleId]);

  useEffect(() => {
    saveDrawings(puzzle.puzzleId, drawings);
  }, [drawings, puzzle.puzzleId]);

  useEffect(() => {
    saveChartSettings(chartSettings);
  }, [chartSettings]);

  const applyDrawings = useCallback(
    (next: Drawing[]) => {
      undoStackRef.current.push(drawings);
      if (undoStackRef.current.length > HISTORY_LIMIT) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setDrawings(next);
      setHistoryDepth({ undo: undoStackRef.current.length, redo: 0 });
    },
    [drawings, setDrawings],
  );

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(drawings);
    setDrawings(previous);
    setSelectedDrawingId(null);
    setHistoryDepth({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    });
  }, [drawings, setDrawings]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(drawings);
    setDrawings(next);
    setSelectedDrawingId(null);
    setHistoryDepth({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    });
  }, [drawings, setDrawings]);

  const handleReplayingChange = useCallback(
    (nextReplaying: boolean) => {
      setReplaying(nextReplaying);
      if (!nextReplaying && pendingResult) {
        setShowResult(true);
        setPendingResult(false);
      }
      if (!nextReplaying) {
        setReplayFromIndex(null);
      }
    },
    [pendingResult],
  );

  const handleDeleteSelectedDrawing = useCallback(() => {
    if (!selectedDrawingId) return;
    applyDrawings(drawings.filter((drawing) => drawing.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId, drawings, applyDrawings]);

  const handleClearAllDrawings = useCallback(() => {
    if (drawings.length === 0) return;
    applyDrawings([]);
    setSelectedDrawingId(null);
  }, [drawings, applyDrawings]);

  // Global keyboard shortcuts.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (meta) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedDrawingId) {
          event.preventDefault();
          handleDeleteSelectedDrawing();
        }
        return;
      }

      if (event.key === "Escape") {
        if (activeTool !== "cursor") {
          setActiveTool("cursor");
        } else if (selectedDrawingId) {
          setSelectedDrawingId(null);
        } else if (fullscreen) {
          setFullscreen(false);
        }
        return;
      }

      if (key === "w") {
        setMagnet((value) => !value);
        return;
      }

      const tool = TOOL_SHORTCUTS[key];
      if (tool) {
        event.preventDefault();
        setActiveTool((current) => (current === tool ? "cursor" : tool));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, selectedDrawingId, fullscreen, undo, redo, handleDeleteSelectedDrawing]);

  const { rounds, complete, reveal, nextRoundTimes } = progress;
  const roundCount = puzzle.gameConfig.roundCount;
  const currentRoundNumber = rounds.length + 1;
  const balance =
    rounds.length > 0 ? rounds[rounds.length - 1].trade.balanceAfter : puzzle.gameConfig.initialBalance;
  const runReturnPercent = (balance / puzzle.gameConfig.initialBalance - 1) * 100;

  const candles: ChartCandle[] = useMemo(
    () => [...puzzle.candles, ...rounds.flatMap((round) => round.revealedCandles)],
    [puzzle.candles, rounds],
  );
  const frontierClose = candles[candles.length - 1]?.close ?? puzzle.candles[0]?.close ?? 0;

  const roundMarkers: RoundMarker[] = useMemo(
    () =>
      rounds.map((round) => ({
        round: round.round,
        side: round.order.side,
        status: round.trade.status,
        filledAt: round.trade.filledAt,
        fillPrice: round.trade.fillPrice,
        exitTime: round.trade.exitTime,
        exitPrice: round.trade.exitPrice,
        pnl: round.trade.pnl,
      })),
    [rounds],
  );

  const handleOrderTypeChange = useCallback(
    (next: TradeOrderType) => {
      setOrderType(next);
      setLimitPrice(next === "limit" ? (limitPrice ?? frontierClose) : null);
    },
    [limitPrice, frontierClose],
  );

  const handleSubmit = useCallback(async () => {
    if (submitting || complete) {
      return;
    }

    const order: TradeOrder = {
      round: currentRoundNumber,
      side,
      orderType,
      amount: round2(amount),
      leverage,
      limitPrice: orderType === "limit" ? limitPrice : null,
    };

    const validationError = validateTradeOrder(order, currentRoundNumber, balance, frontierClose);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const nextOrders = [...rounds.map((round) => round.order), order];
      const response = await fetch("/api/puzzle/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleId: puzzle.puzzleId, orders: nextOrders }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `That order didn't go through (${response.status}).`,
        );
      }

      const data = (await response.json()) as TradeResponse;
      const newRound: StoredRound = {
        round: data.round,
        order: data.trade.order,
        trade: data.trade,
        revealedCandles: data.revealedCandles,
        balance: data.balance,
      };
      const nextRounds = [...rounds, newRound];
      const nextProgress: StoredProgress = {
        puzzleId: puzzle.puzzleId,
        puzzleNumber: puzzle.puzzleNumber,
        rounds: nextRounds,
        complete: data.complete,
        reveal: data.reveal,
        nextRoundTimes: data.nextRoundTimes,
      };
      setReplayFromIndex(candles.length);
      setReplaying(true);
      setProgress(nextProgress);
      saveProgress(nextProgress);
      setOrderType("market");
      setLimitPrice(null);
      setAmount(
        Math.max(
          puzzle.gameConfig.minOrderAmount,
          round2(data.balance * 0.25),
        ),
      );

      if (data.complete) {
        const won = data.balance > puzzle.gameConfig.initialBalance;
        const returnPercent = (data.balance / puzzle.gameConfig.initialBalance - 1) * 100;
        const updatedStats = recordCompletion(puzzle.puzzleNumber, won, returnPercent);
        setStats(updatedStats);
        setPendingResult(true);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Something went wrong placing that order.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    amount,
    balance,
    complete,
    candles.length,
    currentRoundNumber,
    frontierClose,
    limitPrice,
    leverage,
    orderType,
    puzzle.gameConfig.initialBalance,
    puzzle.gameConfig.minOrderAmount,
    puzzle.puzzleId,
    puzzle.puzzleNumber,
    rounds,
    setPendingResult,
    setProgress,
    setStats,
    side,
    submitting,
  ]);

  const closeInstructions = () => {
    markInstructionsSeen();
    setShowInstructions(false);
  };

  const chartArea = (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col gap-2 bg-bg p-2 sm:p-3"
          : "flex flex-col gap-2.5"
      }
    >
      <div
        className={`flex flex-1 flex-col overflow-hidden rounded-2xl border border-border-strong bg-panel lg:flex-row lg:items-stretch ${
          fullscreen ? "" : "lg:h-[clamp(480px,62dvh,680px)]"
        }`}
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex shrink-0 border-b border-border p-1.5 lg:w-12 lg:flex-col lg:items-center lg:border-b-0 lg:border-r lg:p-1.5">
          <ChartToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            magnet={magnet}
            onMagnetToggle={() => setMagnet((value) => !value)}
            drawingsHidden={drawingsHidden}
            onDrawingsHiddenToggle={() => setDrawingsHidden((value) => !value)}
            drawingsLocked={drawingsLocked}
            onDrawingsLockedToggle={() => setDrawingsLocked((value) => !value)}
            canUndo={historyDepth.undo > 0}
            canRedo={historyDepth.redo > 0}
            onUndo={undo}
            onRedo={redo}
            hasSelection={selectedDrawingId !== null}
            hasDrawings={drawings.length > 0}
            onDeleteSelected={handleDeleteSelectedDrawing}
            onClearAll={handleClearAllDrawings}
            color={drawingColor}
            onColorChange={setDrawingColor}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1.5 sm:px-3">
            <ChartTopBar
              settings={chartSettings}
              onSettingsChange={setChartSettings}
              onFit={() => setFitSignal((signal) => signal + 1)}
              fullscreen={fullscreen}
              onFullscreenToggle={() => setFullscreen((value) => !value)}
            />
            <div className="flex items-center gap-2.5 pr-0.5">
              <div className="hidden items-center gap-2 text-xs text-text-muted min-[420px]:flex">
                <span>
                  {complete ? "Run complete" : `Round ${currentRoundNumber} of ${roundCount}`}
                </span>
                <RoundDots rounds={rounds} roundCount={roundCount} />
              </div>
              <span className="coindle-tabular text-sm font-semibold text-text">
                {formatPrice(frontierClose)}
              </span>
            </div>
          </div>

          <div
            className={`relative min-h-0 ${
              fullscreen
                ? "flex-1"
                : "h-[clamp(320px,58dvh,460px)] sm:h-[clamp(380px,54dvh,520px)] lg:h-auto lg:flex-1"
            }`}
          >
            <TradeChart
              candles={candles}
              futureTimes={complete ? [] : nextRoundTimes}
              orderType={orderType}
              limitPrice={limitPrice}
              onLimitPriceChange={setLimitPrice}
              disabled={submitting || complete}
              candleIntervalSeconds={puzzle.gameConfig.candleIntervalSeconds}
              replayIntervalMs={puzzle.gameConfig.replayIntervalMs}
              roundMarkers={roundMarkers}
              activeTool={activeTool}
              onToolChange={setActiveTool}
              drawings={drawings}
              onDrawingsChange={applyDrawings}
              selectedDrawingId={selectedDrawingId}
              onSelectedDrawingIdChange={setSelectedDrawingId}
              replayFromIndex={replayFromIndex}
              onReplayingChange={handleReplayingChange}
              settings={chartSettings}
              magnet={magnet}
              drawingsHidden={drawingsHidden}
              drawingsLocked={drawingsLocked}
              drawingColor={drawingColor}
              fitSignal={fitSignal}
            />
          </div>
        </div>
      </div>

      <p className="px-1 text-xs text-text-faint">
        {complete
          ? "Come back tomorrow for the next coin."
          : `Scroll to zoom, drag to pan, double-click to re-fit. Place a ${side} order to reveal the next ${puzzle.gameConfig.roundCandles} candles.`}
      </p>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <Header
        puzzleNumber={puzzle.puzzleNumber}
        streak={stats.currentStreak}
        balance={balance}
        returnPercent={runReturnPercent}
        onHelp={() => setShowInstructions(true)}
        onStats={() => setShowStats(true)}
      />

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-3 sm:p-6 lg:flex-row lg:items-start lg:gap-6 lg:p-8">
        <section className="flex min-w-0 flex-1 flex-col gap-3">{chartArea}</section>

        <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-[76px] lg:w-[22rem] lg:shrink-0">
          {!complete && (
            <OrderTicket
              roundNumber={currentRoundNumber}
              roundCount={roundCount}
              balance={balance}
              initialBalance={puzzle.gameConfig.initialBalance}
              minOrderAmount={puzzle.gameConfig.minOrderAmount}
              side={side}
              onSideChange={setSide}
              orderType={orderType}
              onOrderTypeChange={handleOrderTypeChange}
              leverage={leverage}
              maxLeverage={puzzle.gameConfig.maxLeverage}
              onLeverageChange={setLeverage}
              amount={amount}
              onAmountChange={setAmount}
              limitPrice={limitPrice}
              onLimitPriceChange={setLimitPrice}
              frontierClose={frontierClose}
              disabled={submitting || replaying}
              submitting={submitting}
              error={submitError}
              onSubmit={handleSubmit}
              tradingFeeRate={puzzle.gameConfig.tradingFeeRate}
            />
          )}

          {complete && (
            <div
              className="coindle-fade-in flex flex-col gap-3 rounded-2xl border border-border-strong bg-panel p-4"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
                  Run complete
                </p>
                <ResultPill returnPercent={runReturnPercent} size="sm" />
              </div>
              <p className="coindle-tabular text-2xl font-semibold text-text sm:text-3xl">
                {formatCurrency(balance)}
              </p>
              <button
                type="button"
                onClick={() => setShowResult(true)}
                className="rounded-xl bg-gold py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:opacity-80"
              >
                View result
              </button>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
              Rounds
            </p>
            <RoundHistory rounds={rounds} roundCount={roundCount} />
          </div>
        </aside>
      </main>

      {showInstructions && (
        <InstructionsModal
          onClose={closeInstructions}
          initialBalance={puzzle.gameConfig.initialBalance}
          roundCount={roundCount}
          roundCandles={puzzle.gameConfig.roundCandles}
          maxLeverage={puzzle.gameConfig.maxLeverage}
          tradingFeeRate={puzzle.gameConfig.tradingFeeRate}
        />
      )}

      {showStats && <StatsModal stats={stats} onClose={() => setShowStats(false)} />}

      {showResult && complete && (
        <ResultModal
          puzzleNumber={puzzle.puzzleNumber}
          rounds={rounds}
          initialBalance={puzzle.gameConfig.initialBalance}
          finalBalance={balance}
          reveal={reveal}
          roundCount={roundCount}
          stats={stats}
          onClose={() => setShowResult(false)}
        />
      )}
    </div>
  );
}
