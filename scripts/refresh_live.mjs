import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SOURCES } from './lib/sources.mjs';
import { fetchList } from './lib/fetch_list.mjs';
import { fetchHistoric } from './lib/fetch_historic.mjs';
import { commitAndPush } from './lib/git_push.mjs';

// Step A — write live JSONs for both sources
await mkdir('data/live', { recursive: true });
for (const key of Object.keys(SOURCES)) {
  const liveJson = await fetchList(key);
  await writeFile(`data/live/${key}.json`, JSON.stringify(liveJson, null, 2));
  console.log(`${key}: ${liveJson.fetched_count} tickers written`);
}

// Step B — top-up historic_highs.json for any tickers new to this run
let historic;
try {
  historic = JSON.parse(await readFile('data/historic_highs.json', 'utf-8'));
} catch {
  // File may not exist on very first intraday run before EOD has fired
  historic = { last_full_rebuild_iso: null, tickers: {} };
}

const allLiveTickers = new Set();
for (const key of Object.keys(SOURCES)) {
  const live = JSON.parse(await readFile(`data/live/${key}.json`, 'utf-8'));
  for (const r of live.rows) allLiveTickers.add(r.ticker);
}

const missing = [...allLiveTickers].filter(t => !(t in historic.tickers));
if (missing.length > 0) {
  const newEntries = await fetchHistoric(missing);
  Object.assign(historic.tickers, newEntries);
  await writeFile('data/historic_highs.json', JSON.stringify(historic, null, 2));
  console.log(`Historic top-up: ${missing.length} new ticker(s) added`);
} else {
  console.log('Historic: no new tickers to top-up');
}

// Step C — commit + push (no-op when running locally)
await commitAndPush('chore: intraday live refresh');
console.log('Live refresh complete.');
