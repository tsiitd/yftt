import { yahooFinance } from './yahoo.mjs';
import { getTradingDate } from './trading_date.mjs';

const PERIOD1_OFFSET_MS = 400 * 24 * 60 * 60 * 1000;

export async function fetchHistoric(tickers) {
  const result = {};
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const ticker of tickers) {
    const period1 = new Date(Date.now() - PERIOD1_OFFSET_MS);
    const period2 = new Date();

    const rows = await yahooFinance.historical(ticker, { period1, period2, interval: '1d' });

    // Drop today's (incomplete) row if present
    const cleaned = rows.filter(r => {
      const d = r.date instanceof Date ? r.date : new Date(r.date);
      return d.toISOString().slice(0, 10) !== todayStr;
    });

    if (cleaned.length < 200) {
      console.warn(`WARNING: ${ticker} only has ${cleaned.length} trading days — may be insufficient.`);
    }

    // Filter out any rows with null/undefined close (e.g. suspended days)
    const closes = cleaned.map(r => r.close).filter(c => c != null);

    const t1_close = closes[closes.length - 1];
    const t2_close = closes[closes.length - 2];
    const high_52wk_t1 = Math.max(...closes.slice(-252));
    const high_52wk_t2 = Math.max(...closes.slice(-253, -1));
    const high_52wk_t3 = Math.max(...closes.slice(-254, -2));
    
    const yesterday_was_52w_high = t1_close >= high_52wk_t2;
    const t2_was_52w_high = t2_close >= high_52wk_t3;
    const cached_for_trading_date = getTradingDate(cleaned);

    result[ticker] = {
      high_52wk_t1,
      high_52wk_t2,
      high_52wk_t3,
      t1_close,
      t2_close,
      yesterday_was_52w_high,
      t2_was_52w_high,
      cached_for_trading_date,
    };
  }

  return result;
}
