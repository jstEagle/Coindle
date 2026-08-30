import { GAME_CONFIG } from "@/config/game";
import type { MarketPuzzleCandle } from "@/lib/puzzles";

export type TradeSide = "long" | "short";
export type TradeOrderType = "market" | "limit";

export interface TradeOrder {
  round: number;
  side: TradeSide;
  orderType: TradeOrderType;
  amount: number;
  leverage: number;
  limitPrice: number | null;
}

export interface TradeResult {
  round: number;
  order: TradeOrder;
  status: "filled" | "unfilled";
  balanceBefore: number;
  balanceAfter: number;
  submittedPrice: number;
  fillPrice: number | null;
  filledAt: number | null;
  exitPrice: number;
  exitTime: number;
  liquidated: boolean;
  returnPercent: number;
  pnl: number;
  fees: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function findLiquidation(
  order: TradeOrder,
  fill: { price: number; time: number },
  candles: readonly MarketPuzzleCandle[],
): { price: number; time: number } | null {
  if (order.leverage <= 1) return null;

  const liquidationPrice =
    order.side === "long"
      ? fill.price * (1 - 1 / order.leverage)
      : fill.price * (1 + 1 / order.leverage);

  for (const candle of candles) {
    if (candle.time < fill.time) continue;

    if (order.side === "long" && candle.low <= liquidationPrice) {
      return {
        price: candle.open <= liquidationPrice ? candle.open : liquidationPrice,
        time: candle.time,
      };
    }
    if (order.side === "short" && candle.high >= liquidationPrice) {
      return {
        price: candle.open >= liquidationPrice ? candle.open : liquidationPrice,
        time: candle.time,
      };
    }
  }

  return null;
}

function findLimitFill(
  order: TradeOrder,
  submittedPrice: number,
  submittedTime: number,
  candles: readonly MarketPuzzleCandle[],
): { price: number; time: number } | null {
  const limitPrice = order.limitPrice;
  if (limitPrice === null) return null;

  if (
    (order.side === "long" && limitPrice >= submittedPrice) ||
    (order.side === "short" && limitPrice <= submittedPrice)
  ) {
    return { price: submittedPrice, time: submittedTime };
  }

  for (const candle of candles) {
    if (order.side === "long" && candle.low <= limitPrice) {
      return {
        price: candle.open <= limitPrice ? candle.open : limitPrice,
        time: candle.time,
      };
    }
    if (order.side === "short" && candle.high >= limitPrice) {
      return {
        price: candle.open >= limitPrice ? candle.open : limitPrice,
        time: candle.time,
      };
    }
  }
  return null;
}

export function validateTradeOrder(
  order: TradeOrder,
  expectedRound: number,
  balance: number,
  submittedPrice: number,
): string | null {
  if (order.round !== expectedRound) {
    return `orders[${expectedRound - 1}].round must be ${expectedRound}.`;
  }
  if (order.side !== "long" && order.side !== "short") {
    return `orders[${expectedRound - 1}].side must be long or short.`;
  }
  if (order.orderType !== "market" && order.orderType !== "limit") {
    return `orders[${expectedRound - 1}].orderType must be market or limit.`;
  }
  if (!Number.isFinite(order.amount) || order.amount < GAME_CONFIG.minOrderAmount) {
    return `orders[${expectedRound - 1}].amount must be at least $${GAME_CONFIG.minOrderAmount}.`;
  }
  if (money(order.amount) > money(balance)) {
    return `orders[${expectedRound - 1}].amount cannot exceed the current balance of $${money(balance).toFixed(2)}.`;
  }
  if (
    !Number.isInteger(order.leverage) ||
    order.leverage < 1 ||
    order.leverage > GAME_CONFIG.maxLeverage
  ) {
    return `orders[${expectedRound - 1}].leverage must be an integer from 1 to ${GAME_CONFIG.maxLeverage}.`;
  }
  if (order.orderType === "market" && order.limitPrice !== null) {
    return `orders[${expectedRound - 1}].limitPrice must be null for a market order.`;
  }
  if (order.orderType === "limit") {
    if (
      order.limitPrice === null ||
      !Number.isFinite(order.limitPrice) ||
      order.limitPrice <= 0
    ) {
      return `orders[${expectedRound - 1}].limitPrice must be a positive number for a limit order.`;
    }
    const multiplier = order.limitPrice / submittedPrice;
    if (
      multiplier < GAME_CONFIG.minLimitPriceMultiplier ||
      multiplier > GAME_CONFIG.maxLimitPriceMultiplier
    ) {
      return `orders[${expectedRound - 1}].limitPrice is outside the playable chart range.`;
    }
  }
  return null;
}

export function simulateTrade(
  order: TradeOrder,
  balance: number,
  frontier: MarketPuzzleCandle,
  roundCandles: readonly MarketPuzzleCandle[],
): TradeResult {
  const exitCandle = roundCandles[roundCandles.length - 1];
  if (!exitCandle) throw new Error("A trade round requires at least one candle.");

  const fill =
    order.orderType === "market"
      ? { price: frontier.close, time: frontier.time }
      : findLimitFill(order, frontier.close, frontier.time, roundCandles);

  if (!fill) {
    return {
      round: order.round,
      order,
      status: "unfilled",
      balanceBefore: money(balance),
      balanceAfter: money(balance),
      submittedPrice: frontier.close,
      fillPrice: null,
      filledAt: null,
      exitPrice: exitCandle.close,
      exitTime: exitCandle.time,
      liquidated: false,
      returnPercent: 0,
      pnl: 0,
      fees: 0,
    };
  }

  const liquidation = findLiquidation(order, fill, roundCandles);
  const positionExit = liquidation ?? { price: exitCandle.close, time: exitCandle.time };
  const directionalReturn =
    order.side === "long"
      ? positionExit.price / fill.price - 1
      : 1 - positionExit.price / fill.price;
  const leveragedReturn = directionalReturn * order.leverage;
  const fees = order.amount * order.leverage * GAME_CONFIG.tradingFeeRate * 2;
  const netReturn = Math.max(-1, leveragedReturn - fees / order.amount);
  const pnl = money(order.amount * netReturn);
  const balanceAfter = money(Math.max(0, balance + pnl));

  return {
    round: order.round,
    order: { ...order, amount: money(order.amount) },
    status: "filled",
    balanceBefore: money(balance),
    balanceAfter,
    submittedPrice: frontier.close,
    fillPrice: fill.price,
    filledAt: fill.time,
    exitPrice: positionExit.price,
    exitTime: positionExit.time,
    liquidated: liquidation !== null,
    returnPercent: netReturn * 100,
    pnl,
    fees: money(fees),
  };
}
