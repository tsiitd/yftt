import { yahooFinance } from './yahoo.mjs';

export const SOURCES = {
  trending: {
    id: 'trending',
    label: 'Trending',
    url: 'https://finance.yahoo.com/markets/stocks/trending/',
    count: 25,
    async fetcher(count) {
      const result = await yahooFinance.trendingSymbols('US', { count });
      return result.quotes.slice(0, count).map((q, i) => ({ rank: i + 1, ticker: q.symbol }));
    },
  },
  most_actives: {
    id: 'most_actives',
    label: 'Most Active',
    url: 'https://finance.yahoo.com/research-hub/screener/most_actives/?start=0&count=50',
    count: 50,
    async fetcher(count) {
      // v3: validateResult is a moduleOpts (3rd arg), not queryOpts (2nd arg).
      // The response schema is stale vs what Yahoo now returns, but quotes are correct.
      const result = await yahooFinance.screener({ scrIds: 'most_actives', count }, {}, { validateResult: false });
      return result.quotes.slice(0, count).map((q, i) => ({ rank: i + 1, ticker: q.symbol }));
    },
  },
};
