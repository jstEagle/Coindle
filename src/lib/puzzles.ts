import "server-only";

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  GAME_CONFIG,
  PUBLIC_GAME_CONFIG,
  type PublicGameConfig,
} from "@/config/game";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;
const PUZZLE_DATA_PATH = join(process.cwd(), "src", "data", "puzzles.json");

export interface RawPuzzleSource {
  provider: string;
  poolAddress: string;
  sourceUrl: string;
  snapshotAt: string;
}

export interface RawPuzzleCoin {
  name: string;
  symbol: string;
  mint: string;
  tradeUrl: string;
  poolOpenedAt: string;
  outcome: string;
  liquidityTier: string;
  lifecycle: string;
}

export interface RawPuzzleCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RawPuzzle {
  id: string;
  source: RawPuzzleSource;
  coin: RawPuzzleCoin;
  candles: readonly RawPuzzleCandle[];
}

export interface PublicPuzzleCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type MarketPuzzleCandle = PublicPuzzleCandle;

export interface PublicPuzzlePayload {
  puzzleId: string;
  puzzleNumber: number;
  candles: readonly PublicPuzzleCandle[];
  nextRoundTimes: readonly number[];
  gameConfig: PublicGameConfig;
}

export interface DailyPuzzleState {
  puzzleId: string;
  puzzleNumber: number;
  rawPuzzle: RawPuzzle;
  marketCandles: readonly MarketPuzzleCandle[];
  publicPayload: PublicPuzzlePayload;
}

let cachedCatalog: readonly RawPuzzle[] | undefined;
let cachedCatalogMtimeMs: number | undefined;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function requiredNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a finite number.`);
  }
  return value;
}

function parseCandle(value: unknown, puzzleIndex: number, candleIndex: number) {
  const label = `Puzzle ${puzzleIndex + 1} candle ${candleIndex + 1}`;
  const record = asRecord(value, label);
  const candle: RawPuzzleCandle = {
    time: requiredNumber(record, "time", label),
    open: requiredNumber(record, "open", label),
    high: requiredNumber(record, "high", label),
    low: requiredNumber(record, "low", label),
    close: requiredNumber(record, "close", label),
    volume: requiredNumber(record, "volume", label),
  };

  if (
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0
  ) {
    throw new Error(`${label} prices must all be greater than zero.`);
  }
  if (candle.high < candle.low) {
    throw new Error(`${label}.high must be greater than or equal to low.`);
  }
  if (candle.volume < 0) {
    throw new Error(`${label}.volume must be greater than or equal to zero.`);
  }
  return candle;
}

function parsePuzzle(value: unknown, puzzleIndex: number): RawPuzzle {
  const label = `Puzzle ${puzzleIndex + 1}`;
  const record = asRecord(value, label);
  const sourceRecord = asRecord(record.source, `${label}.source`);
  const coinRecord = asRecord(record.coin, `${label}.coin`);
  const candleValues = record.candles;

  if (!Array.isArray(candleValues)) {
    throw new Error(`${label}.candles must be an array.`);
  }

  const candles = candleValues.map((candle, candleIndex) =>
    parseCandle(candle, puzzleIndex, candleIndex),
  );
  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index].time <= candles[index - 1].time) {
      throw new Error(`${label}.candles must be strictly ascending by time.`);
    }
    if (candles[index].time - candles[index - 1].time !== GAME_CONFIG.candleIntervalSeconds) {
      throw new Error(
        `${label}.candles must be contiguous ${GAME_CONFIG.candleIntervalSeconds / 60}-minute intervals.`,
      );
    }
  }

  const poolOpenedAt = requiredString(coinRecord, "poolOpenedAt", `${label}.coin`);
  if (!Number.isFinite(Date.parse(poolOpenedAt))) {
    throw new Error(`${label}.coin.poolOpenedAt must be a valid date.`);
  }

  const legacyPumpUrl = coinRecord.pumpUrl;
  const tradeUrl =
    typeof coinRecord.tradeUrl === "string" && coinRecord.tradeUrl.length > 0
      ? coinRecord.tradeUrl
      : typeof legacyPumpUrl === "string" && legacyPumpUrl.length > 0
        ? legacyPumpUrl
        : requiredString(sourceRecord, "sourceUrl", `${label}.source`);

  return {
    id: requiredString(record, "id", label),
    source: {
      provider: requiredString(sourceRecord, "provider", `${label}.source`),
      poolAddress: requiredString(sourceRecord, "poolAddress", `${label}.source`),
      sourceUrl: requiredString(sourceRecord, "sourceUrl", `${label}.source`),
      snapshotAt: requiredString(sourceRecord, "snapshotAt", `${label}.source`),
    },
    coin: {
      name: requiredString(coinRecord, "name", `${label}.coin`),
      symbol: requiredString(coinRecord, "symbol", `${label}.coin`),
      mint: requiredString(coinRecord, "mint", `${label}.coin`),
      tradeUrl,
      poolOpenedAt,
      outcome: requiredString(coinRecord, "outcome", `${label}.coin`),
      liquidityTier: requiredString(coinRecord, "liquidityTier", `${label}.coin`),
      lifecycle: requiredString(coinRecord, "lifecycle", `${label}.coin`),
    },
    candles,
  };
}

function loadPuzzleCatalog(): readonly RawPuzzle[] {
  let contents: string;
  try {
    const mtimeMs = statSync(PUZZLE_DATA_PATH).mtimeMs;
    if (cachedCatalog && cachedCatalogMtimeMs === mtimeMs) return cachedCatalog;
    contents = readFileSync(PUZZLE_DATA_PATH, "utf8");
    cachedCatalogMtimeMs = mtimeMs;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Puzzle data is unavailable at ${PUZZLE_DATA_PATH}.${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Puzzle data is not valid JSON.${detail}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Puzzle data must be a non-empty array.");
  }

  const catalog = parsed.map(parsePuzzle);
  const minimumCandleCount =
    GAME_CONFIG.contextCandles +
    GAME_CONFIG.roundCount * GAME_CONFIG.roundCandles;

  for (const puzzle of catalog) {
    if (puzzle.candles.length < minimumCandleCount) {
      throw new Error(
        `Puzzle "${puzzle.id}" has ${puzzle.candles.length} candles; at least ${minimumCandleCount} are required.`,
      );
    }
  }

  cachedCatalog = catalog;
  return cachedCatalog;
}

function utcDayStart(date: Date): number {
  if (!Number.isFinite(date.getTime())) {
    throw new Error("The daily puzzle date must be valid.");
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getPuzzleDay(date: Date): { dayOffset: number; puzzleNumber: number } {
  const epoch = Date.parse(GAME_CONFIG.epochUtc);
  const dayOffset = Math.floor((utcDayStart(date) - epoch) / DAY_IN_MILLISECONDS);
  if (dayOffset < 0) {
    throw new Error(`Daily puzzles begin at ${GAME_CONFIG.epochUtc.slice(0, 10)} UTC.`);
  }
  return { dayOffset, puzzleNumber: dayOffset + 1 };
}

function publicPuzzleId(rawPuzzleId: string, puzzleNumber: number): string {
  const digest = createHash("sha256")
    .update(`${puzzleNumber}:${rawPuzzleId}`)
    .digest("hex")
    .slice(0, 12);
  return `coindle-${puzzleNumber}-${digest}`;
}

function toPublicCandle(candle: RawPuzzleCandle): PublicPuzzleCandle {
  return { ...candle };
}

export function getDailyPuzzleState(date = new Date()): DailyPuzzleState {
  const catalog = loadPuzzleCatalog();
  const { dayOffset, puzzleNumber } = getPuzzleDay(date);
  const rawPuzzle = catalog[dayOffset % catalog.length];
  const marketCandles = rawPuzzle.candles.map(toPublicCandle);
  const puzzleId = publicPuzzleId(rawPuzzle.id, puzzleNumber);
  const futureStart = GAME_CONFIG.contextCandles;
  const futureEnd = futureStart + GAME_CONFIG.roundCandles;

  const publicPayload: PublicPuzzlePayload = {
    puzzleId,
    puzzleNumber,
    candles: marketCandles.slice(0, futureStart),
    nextRoundTimes: marketCandles
      .slice(futureStart, futureEnd)
      .map((candle) => candle.time),
    gameConfig: PUBLIC_GAME_CONFIG,
  };

  return { puzzleId, puzzleNumber, rawPuzzle, marketCandles, publicPayload };
}

export function getDailyPuzzle(date = new Date()): PublicPuzzlePayload {
  return getDailyPuzzleState(date).publicPayload;
}
