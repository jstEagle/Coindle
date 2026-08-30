import { NextResponse } from "next/server";

import { GAME_CONFIG } from "@/config/game";
import {
  getDailyPuzzleState,
  type MarketPuzzleCandle,
  type RawPuzzleCoin,
  type RawPuzzleSource,
} from "@/lib/puzzles";
import {
  simulateTrade,
  validateTradeOrder,
  type TradeOrder,
  type TradeResult,
} from "@/lib/trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TradeRequestBody {
  puzzleId: string;
  orders: readonly TradeOrder[];
}

export interface PuzzleReveal {
  sourcePuzzleId: string;
  source: RawPuzzleSource;
  coin: RawPuzzleCoin;
}

export interface TradeResponse {
  puzzleId: string;
  puzzleNumber: number;
  round: number;
  complete: boolean;
  trade: TradeResult;
  balance: number;
  revealedCandles: readonly MarketPuzzleCandle[];
  nextRoundTimes: readonly number[];
  reveal: PuzzleReveal | null;
}

export type TradeErrorCode =
  | "request-too-large"
  | "invalid-json"
  | "invalid-request"
  | "puzzle-not-found"
  | "puzzle-data-unavailable";

export interface TradeErrorResponse {
  error: { code: TradeErrorCode; message: string };
}

function errorResponse(
  status: number,
  code: TradeErrorCode,
  message: string,
): NextResponse<TradeErrorResponse> {
  return NextResponse.json({ error: { code, message } }, { status });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseTradeRequest(
  value: unknown,
): { body: TradeRequestBody } | { error: string } {
  const record = asRecord(value);
  if (!record) return { error: "The request body must be an object." };

  if (
    typeof record.puzzleId !== "string" ||
    record.puzzleId.length === 0 ||
    record.puzzleId.length > GAME_CONFIG.maxPuzzleIdLength
  ) {
    return {
      error: `puzzleId must be a non-empty string no longer than ${GAME_CONFIG.maxPuzzleIdLength} characters.`,
    };
  }

  if (
    !Array.isArray(record.orders) ||
    record.orders.length < 1 ||
    record.orders.length > GAME_CONFIG.roundCount
  ) {
    return {
      error: `orders must contain between 1 and ${GAME_CONFIG.roundCount} sequential orders.`,
    };
  }

  const orders: TradeOrder[] = [];
  for (let index = 0; index < record.orders.length; index += 1) {
    const orderRecord = asRecord(record.orders[index]);
    if (!orderRecord) return { error: `orders[${index}] must be an object.` };

    const limitPrice = orderRecord.limitPrice;
    const leverage = orderRecord.leverage ?? 1;
    if (
      limitPrice !== null &&
      (typeof limitPrice !== "number" || !Number.isFinite(limitPrice))
    ) {
      return { error: `orders[${index}].limitPrice must be a number or null.` };
    }

    orders.push({
      round: orderRecord.round as number,
      side: orderRecord.side as TradeOrder["side"],
      orderType: orderRecord.orderType as TradeOrder["orderType"],
      amount: orderRecord.amount as number,
      leverage: leverage as number,
      limitPrice,
    });
  }

  return { body: { puzzleId: record.puzzleId, orders } };
}

export async function POST(
  request: Request,
): Promise<NextResponse<TradeResponse | TradeErrorResponse>> {
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > GAME_CONFIG.maxTradeRequestBytes
  ) {
    return errorResponse(
      413,
      "request-too-large",
      `The request body must be at most ${GAME_CONFIG.maxTradeRequestBytes} bytes.`,
    );
  }

  let unparsedBody: unknown;
  try {
    unparsedBody = (await request.json()) as unknown;
  } catch {
    return errorResponse(400, "invalid-json", "The request body is not valid JSON.");
  }

  const parsedRequest = parseTradeRequest(unparsedBody);
  if ("error" in parsedRequest) {
    return errorResponse(400, "invalid-request", parsedRequest.error);
  }

  let puzzle;
  try {
    puzzle = getDailyPuzzleState();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Puzzle data is unavailable.";
    return errorResponse(503, "puzzle-data-unavailable", message);
  }

  if (parsedRequest.body.puzzleId !== puzzle.puzzleId) {
    return errorResponse(
      404,
      "puzzle-not-found",
      "That puzzle is not the current UTC daily puzzle.",
    );
  }

  let balance: number = GAME_CONFIG.initialBalance;
  let latestTrade: TradeResult | null = null;

  for (const [index, order] of parsedRequest.body.orders.entries()) {
    const round = index + 1;
    const startIndex =
      GAME_CONFIG.contextCandles + index * GAME_CONFIG.roundCandles;
    const frontier = puzzle.marketCandles[startIndex - 1];
    const roundCandles = puzzle.marketCandles.slice(
      startIndex,
      startIndex + GAME_CONFIG.roundCandles,
    );

    if (!frontier || roundCandles.length !== GAME_CONFIG.roundCandles) {
      return errorResponse(
        503,
        "puzzle-data-unavailable",
        `The current puzzle does not contain all candles for round ${round}.`,
      );
    }

    const validationError = validateTradeOrder(
      order,
      round,
      balance,
      frontier.close,
    );
    if (validationError) {
      return errorResponse(400, "invalid-request", validationError);
    }

    latestTrade = simulateTrade(order, balance, frontier, roundCandles);
    balance = latestTrade.balanceAfter;
  }

  if (!latestTrade) {
    return errorResponse(400, "invalid-request", "At least one order is required.");
  }

  const round = parsedRequest.body.orders.length;
  const revealStart =
    GAME_CONFIG.contextCandles + (round - 1) * GAME_CONFIG.roundCandles;
  const revealEnd = revealStart + GAME_CONFIG.roundCandles;
  const nextEnd = revealEnd + GAME_CONFIG.roundCandles;
  const complete = round === GAME_CONFIG.roundCount || balance < GAME_CONFIG.minOrderAmount;

  return NextResponse.json({
    puzzleId: puzzle.puzzleId,
    puzzleNumber: puzzle.puzzleNumber,
    round,
    complete,
    trade: latestTrade,
    balance,
    revealedCandles: puzzle.marketCandles.slice(revealStart, revealEnd),
    nextRoundTimes: complete
      ? []
      : puzzle.marketCandles.slice(revealEnd, nextEnd).map((candle) => candle.time),
    reveal: complete
      ? {
          sourcePuzzleId: puzzle.rawPuzzle.id,
          source: puzzle.rawPuzzle.source,
          coin: puzzle.rawPuzzle.coin,
        }
      : null,
  });
}
