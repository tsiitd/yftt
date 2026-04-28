import YahooFinance from 'yahoo-finance2';

// Suppress one-time survey and historical() deprecation notices (not actionable in CI logs).
export const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});
