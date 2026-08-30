export const GAME_CONFIG = {
  epochUtc: "2026-07-16T00:00:00.000Z",
  contextCandles: 24,
  roundCandles: 6,
  roundCount: 3,
  initialBalance: 100,
  minOrderAmount: 1,
  maxLeverage: 10,
  candleIntervalSeconds: 900,
  maxPuzzleIdLength: 128,
  maxTradeRequestBytes: 32 * 1024,
  minLimitPriceMultiplier: 0.02,
  maxLimitPriceMultiplier: 50,
  tradingFeeRate: 0,
  replayIntervalMs: 70,
} as const;

export type GameConfig = typeof GAME_CONFIG;

export type PublicGameConfig = Pick<
  GameConfig,
  | "epochUtc"
  | "contextCandles"
  | "roundCandles"
  | "roundCount"
  | "initialBalance"
  | "minOrderAmount"
  | "maxLeverage"
  | "candleIntervalSeconds"
  | "tradingFeeRate"
  | "replayIntervalMs"
>;

export const PUBLIC_GAME_CONFIG: PublicGameConfig = {
  epochUtc: GAME_CONFIG.epochUtc,
  contextCandles: GAME_CONFIG.contextCandles,
  roundCandles: GAME_CONFIG.roundCandles,
  roundCount: GAME_CONFIG.roundCount,
  initialBalance: GAME_CONFIG.initialBalance,
  minOrderAmount: GAME_CONFIG.minOrderAmount,
  maxLeverage: GAME_CONFIG.maxLeverage,
  candleIntervalSeconds: GAME_CONFIG.candleIntervalSeconds,
  tradingFeeRate: GAME_CONFIG.tradingFeeRate,
  replayIntervalMs: GAME_CONFIG.replayIntervalMs,
};
