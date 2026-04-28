import { execFileSync } from 'node:child_process';

// Commits data/ and pushes to origin main.
// Skipped when not running in GitHub Actions so local test runs don't touch git.
export function commitAndPush(message) {
  if (!process.env.GITHUB_ACTIONS) {
    console.log('(Local run — skipping git commit/push)');
    return;
  }

  execFileSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
  execFileSync('git', ['add', 'data/']);

  try {
    execFileSync('git', ['diff', '--cached', '--quiet']);
    console.log('No data changes — nothing to commit.');
    return;
  } catch {
    // non-zero exit = staged changes exist — proceed
  }

  execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' });
  execFileSync('git', ['pull', '--rebase', 'origin', 'main'], { stdio: 'inherit' });
  execFileSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
  console.log('Committed and pushed data files.');
}
