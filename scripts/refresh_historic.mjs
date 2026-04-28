import { writeFile, mkdir } from 'node:fs/promises';
import { SOURCES } from './lib/sources.mjs';
import { fetchHistoric } from './lib/fetch_historic.mjs';
import { commitAndPush } from './lib/git_push.mjs';

// Collect deduplicated tickers across both source lists
const allTickers = new Set();
for (const key of Object.keys(SOURCES)) {
  const list = await SOURCES[key].fetcher(SOURCES[key].count);
  for (const r of list) allTickers.add(r.ticker);
}
console.log(`Tickers to refresh: ${allTickers.size} (deduped across both sources)`);

// Full nuke + rebuild of historic_highs.json
const tickers = await fetchHistoric([...allTickers]);

await mkdir('data', { recursive: true });
await writeFile(
  'data/historic_highs.json',
  JSON.stringify({ last_full_rebuild_iso: new Date().toISOString(), tickers }, null, 2),
);
console.log(`EOD rebuild OK — ${Object.keys(tickers).length} tickers cached.`);

await commitAndPush('chore: EOD historic rebuild');
