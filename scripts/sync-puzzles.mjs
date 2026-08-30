import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourcePath = path.join(root, "config", "puzzle-sources.json");
const outputPath = path.join(root, "src", "data", "puzzles.json");
const config = JSON.parse(await readFile(sourcePath, "utf8"));

const CONTEXT_BARS = 24;
const ROUND_BARS = 6;
const ROUND_COUNT = 3;
const PLAYABLE_BARS = CONTEXT_BARS + ROUND_BARS * ROUND_COUNT;
const SEGMENT_LENGTH = 48;
const MAX_BARS = 1000;
const WINDOWS_PER_SOURCE = 2;
const CANDLE_SECONDS = config.provider.candleMinutes * 60;
const MIN_ACTIVE_CANDLES = SEGMENT_LENGTH;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchCandles(source) {
  const { provider } = config;
  const url = new URL(
    `${provider.baseUrl}/networks/${provider.network}/pools/${source.poolAddress}/ohlcv/minute`,
  );
  url.searchParams.set("aggregate", String(config.provider.candleMinutes));
  url.searchParams.set("limit", String(MAX_BARS));
  url.searchParams.set("currency", "usd");
  url.searchParams.set("token", source.coin.mint);
  if (source.beforeTimestamp) {
    url.searchParams.set("before_timestamp", String(source.beforeTimestamp));
  }

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: `application/json;version=${provider.apiVersion}`,
        "User-Agent": "Coindle data refresh (github.com)",
      },
    });

    if (response.ok) {
      const payload = await response.json();
      const rows = payload?.data?.attributes?.ohlcv_list;
      if (!Array.isArray(rows)) {
        throw new Error(`Unexpected OHLCV response for ${source.id}`);
      }

      const currentBucket =
        Math.floor(Date.now() / (CANDLE_SECONDS * 1_000)) * CANDLE_SECONDS;

      return rows
        .map(([time, open, high, low, close, volume]) => ({
          time: Number(time),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume),
        }))
        .filter((candle) =>
          [
            candle.time,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume,
          ].every(Number.isFinite),
        )
        .filter(
          (candle) =>
            candle.time < currentBucket &&
            candle.open > 0 &&
            candle.high > 0 &&
            candle.low > 0 &&
            candle.close > 0,
        )
        .sort((left, right) => left.time - right.time);
    }

    if (response.status !== 429 || attempt === 4) {
      throw new Error(
        `GeckoTerminal returned ${response.status} for ${source.id}`,
      );
    }

    await wait(provider.requestDelayMs * attempt);
  }

  return [];
}

function interestScore(candles, start) {
  const cutoff = start + CONTEXT_BARS - 1;
  const end = start + PLAYABLE_BARS - 1;
  const anchor = candles[cutoff].close;
  const terminalMove = Math.abs(Math.log(candles[end].close / anchor));
  let movement = 0;
  let volume = 0;

  for (let index = cutoff + 1; index <= end; index += 1) {
    movement += Math.abs(
      Math.log(candles[index].close / candles[index - 1].close),
    );
    volume += Math.log1p(Math.max(0, candles[index].volume));
  }

  return terminalMove * 2 + movement + volume / 500;
}

function selectWindows(candles) {
  if (candles.length < SEGMENT_LENGTH) return [];

  const candidates = [];
  for (let start = 0; start <= candles.length - SEGMENT_LENGTH; start += 1) {
    const segment = candles.slice(start, start + SEGMENT_LENGTH);
    const activeCandles = segment.filter((candle) => candle.volume > 0).length;
    const isContiguous = segment.every(
      (candle, index) =>
        index === 0 || candle.time - segment[index - 1].time === CANDLE_SECONDS,
    );
    if (!isContiguous || activeCandles < MIN_ACTIVE_CANDLES) continue;
    candidates.push({ start, score: interestScore(candles, start) });
  }

  candidates.sort((left, right) => right.score - left.score);
  const selected = [];

  for (const candidate of candidates) {
    const overlaps = selected.some(
      (other) => Math.abs(other.start - candidate.start) < SEGMENT_LENGTH,
    );
    if (!overlaps) selected.push(candidate);
    if (selected.length === WINDOWS_PER_SOURCE) break;
  }

  return selected.sort((left, right) => left.start - right.start);
}

const puzzles = [];

for (const [sourceIndex, source] of config.sources.entries()) {
  process.stdout.write(`Fetching ${source.id}... `);
  const candles = await fetchCandles(source);
  const windows = selectWindows(candles);

  if (windows.length === 0) {
    console.log(`skipped (${candles.length} usable candles)`);
  } else {
    for (const window of windows) {
      const segment = candles.slice(
        window.start,
        window.start + SEGMENT_LENGTH,
      );
      const snapshotAt = new Date(
        segment[CONTEXT_BARS - 1].time * 1000,
      ).toISOString();
      const puzzleId = `${source.id}-${segment[CONTEXT_BARS - 1].time}`;
      const sourceUrl = `https://www.geckoterminal.com/solana/pools/${source.poolAddress}`;

      puzzles.push({
        id: puzzleId,
        source: {
          provider: config.provider.name,
          poolAddress: source.poolAddress,
          sourceUrl,
          snapshotAt,
        },
        coin: {
          ...source.coin,
          tradeUrl: source.coin.tradeUrl ?? sourceUrl,
        },
        candles: segment,
      });
    }

    console.log(`${windows.length} snapshots from ${candles.length} candles`);
  }

  if (sourceIndex < config.sources.length - 1) {
    await wait(config.provider.requestDelayMs);
  }
}

if (puzzles.length === 0) {
  throw new Error("No playable puzzle snapshots were produced");
}

puzzles.sort((left, right) => left.id.localeCompare(right.id));
await writeFile(outputPath, `${JSON.stringify(puzzles, null, 2)}\n`, "utf8");
console.log(`Wrote ${puzzles.length} real-market puzzles to ${outputPath}`);
