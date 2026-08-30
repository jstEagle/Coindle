# Coindle

Coindle is a daily historical crypto trading challenge. Each player gets the
same hidden market, a $100 bankroll, six hours of price context, and three
90-minute trading rounds. The coin is revealed only after the run ends.

## Game loop

- Study a real fifteen-minute candlestick chart without seeing the coin name.
- Draw trend lines, horizontal levels, and Fibonacci retracements.
- Place a long or short market or limit order using the available bankroll.
- Choose 1x, 2x, 5x, or 10x isolated leverage; posted margin is the maximum loss.
- Watch the next six candles replay and see the order's fill, return, and P&L.
- Repeat for three rounds, then compare the final bankroll and reveal the coin.

Orders are settled on the server from historical OHLC candles. Market orders
fill at the current frontier close. A long limit fills when a revealed candle's
low reaches the limit; a short limit fills when its high reaches the limit.
Marketable limits fill immediately, gaps fill at the candle open, and every
filled position closes at the final close of its round. Intrabar paths are not
reconstructed. Leveraged positions liquidate when a revealed candle crosses the
OHLC-derived liquidation price.

## Development

```bash
npm install
npm run data:sync
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The non-secret game and
market-source settings live in `src/config/game.ts` and
`config/puzzle-sources.json`.

Useful checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

`npm run data:sync` downloads unmodified, contiguous fifteen-minute
GeckoTerminal OHLCV history and writes the playable snapshot deck to
`src/data/puzzles.json`. The chart uses
Lightweight Charts with custom drawing tools; TradingView Advanced Charts is a
separate proprietary product and is not bundled here.
