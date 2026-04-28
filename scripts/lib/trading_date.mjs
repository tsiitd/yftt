// Returns "YYYY-MM-DD" for the last entry in a yahooFinance.historical() response.
// Derives T-1D without calendar arithmetic, so weekends/holidays are handled naturally.
export function getTradingDate(historicalRows) {
  const last = historicalRows[historicalRows.length - 1];
  const d = last.date instanceof Date ? last.date : new Date(last.date);
  return d.toISOString().slice(0, 10);
}
