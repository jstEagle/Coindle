import type { PuzzleReveal, TradeResponse } from "@/app/api/puzzle/trade/route";
import type { Drawing } from "@/lib/drawings";
import type { TradeOrder, TradeResult } from "@/lib/trading";

const STORAGE_VERSION = "v2";
const PROGRESS_PREFIX = `coindle:${STORAGE_VERSION}:progress:`;
const DRAWINGS_PREFIX = `coindle:${STORAGE_VERSION}:drawings:`;
const STATS_KEY = `coindle:${STORAGE_VERSION}:stats`;

export interface StoredRound {
  round: number;
  order: TradeOrder;
  trade: TradeResult;
  revealedCandles: TradeResponse["revealedCandles"];
  balance: number;
}

export interface StoredProgress {
  puzzleId: string;
  puzzleNumber: number;
  rounds: StoredRound[];
  complete: boolean;
  reveal: PuzzleReveal | null;
  nextRoundTimes: readonly number[];
}

export interface Stats {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  lastCompletedPuzzleNumber: number | null;
  bestReturnPercent: number;
}

const EMPTY_STATS: Stats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastCompletedPuzzleNumber: null,
  bestReturnPercent: 0,
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can fail (quota, private mode); the game still works in-memory.
  }
}

export function loadProgress(puzzleId: string): StoredProgress | null {
  return readJson<StoredProgress>(`${PROGRESS_PREFIX}${puzzleId}`);
}

export function saveProgress(progress: StoredProgress): void {
  writeJson(`${PROGRESS_PREFIX}${progress.puzzleId}`, progress);
}

/** Removes progress for puzzles other than the current one to keep storage tidy. */
export function pruneOldProgress(currentPuzzleId: string): void {
  if (!isBrowser()) {
    return;
  }
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (
        key &&
        key.startsWith(PROGRESS_PREFIX) &&
        key !== `${PROGRESS_PREFIX}${currentPuzzleId}`
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage access failures.
  }
}

export function loadDrawings(puzzleId: string): Drawing[] {
  return readJson<Drawing[]>(`${DRAWINGS_PREFIX}${puzzleId}`) ?? [];
}

export function saveDrawings(puzzleId: string, drawings: readonly Drawing[]): void {
  writeJson(`${DRAWINGS_PREFIX}${puzzleId}`, drawings);
}

/** Removes drawings for puzzles other than the current one to keep storage tidy. */
export function pruneOldDrawings(currentPuzzleId: string): void {
  if (!isBrowser()) {
    return;
  }
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (
        key &&
        key.startsWith(DRAWINGS_PREFIX) &&
        key !== `${DRAWINGS_PREFIX}${currentPuzzleId}`
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage access failures.
  }
}

export function loadStats(): Stats {
  return readJson<Stats>(STATS_KEY) ?? EMPTY_STATS;
}

export function recordCompletion(
  puzzleNumber: number,
  won: boolean,
  returnPercent: number,
): Stats {
  const stats = loadStats();

  if (stats.lastCompletedPuzzleNumber === puzzleNumber) {
    return stats;
  }

  const isConsecutive = stats.lastCompletedPuzzleNumber === puzzleNumber - 1;
  const currentStreak = won ? (isConsecutive ? stats.currentStreak : 0) + 1 : 0;

  const nextStats: Stats = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    lastCompletedPuzzleNumber: puzzleNumber,
    bestReturnPercent: Math.max(stats.bestReturnPercent, returnPercent),
  };

  writeJson(STATS_KEY, nextStats);
  return nextStats;
}

const INSTRUCTIONS_SEEN_KEY = `coindle:${STORAGE_VERSION}:instructions-seen`;

export function hasSeenInstructions(): boolean {
  return readJson<boolean>(INSTRUCTIONS_SEEN_KEY) ?? false;
}

export function markInstructionsSeen(): void {
  writeJson(INSTRUCTIONS_SEEN_KEY, true);
}
