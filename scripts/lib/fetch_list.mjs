import { yahooFinance } from './yahoo.mjs';
import { SOURCES } from './sources.mjs';

// Normalise pre/postMarketTime — may be a Unix-second number or a Date object.
function toUnixSec(t) {
  if (!t) return 0;
  if (t instanceof Date) return t.getTime() / 1000;
  return Number(t);
}

export async function fetchList(sourceKey) {
  const source = SOURCES[sourceKey];
  const tickerList = await source.fetcher(source.count);
  const tickers = tickerList.map(t => t.ticker);

  // quote() accepts an array and returns an array of quote objects
  const quotes = await yahooFinance.quote(tickers);
  const quoteMap = new Map(quotes.map(q => [q.symbol, q]));

  const rows = tickerList.map(({ rank, ticker }) => {
    const q = quoteMap.get(ticker) ?? {};

    const postTime = toUnixSec(q.postMarketTime);
    const preTime = toUnixSec(q.preMarketTime);

    let outside_rth_price = null;
    let outside_rth_side = null;
    let outside_rth_time_iso = null;

    if (postTime > 0 || preTime > 0) {
      if (postTime >= preTime && postTime > 0) {
        outside_rth_price = q.postMarketPrice ?? null;
        outside_rth_side = 'Post';
        outside_rth_time_iso = new Date(postTime * 1000).toISOString();
      } else if (preTime > postTime && preTime > 0) {
        outside_rth_price = q.preMarketPrice ?? null;
        outside_rth_side = 'Pre';
        outside_rth_time_iso = new Date(preTime * 1000).toISOString();
      }
    }

    return {
      rank,
      ticker,
      name: q.shortName ?? ticker,
      current_price: q.regularMarketPrice ?? null,
      market_cap_bn: q.marketCap != null ? Math.round(q.marketCap / 1e9 * 100) / 100 : null,
      outside_rth_price,
      outside_rth_side,
      outside_rth_time_iso,
      yahoo_url: `https://finance.yahoo.com/quote/${ticker}`,
    };
  });

  return {
    source_id: source.id,
    source_label: source.label,
    source_url: source.url,
    last_updated_iso: new Date().toISOString(),
    fetched_count: rows.length,
    rows,
  };
}
