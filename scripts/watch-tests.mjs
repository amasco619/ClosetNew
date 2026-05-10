import { watch, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const CANDIDATE_DIRS = [
  '__tests__',
  'constants',
  'contexts',
  'app',
  'components',
  'lib',
  'server',
  'shared',
];

const WATCH_DIRS = CANDIDATE_DIRS.filter(existsSync);
const DEBOUNCE_MS = 400;

let debounceTimer = null;
let running = false;

function runTests() {
  if (running) return;
  running = true;
  console.log('\n[watch] Change detected — running tests...\n');
  try {
    execSync('node scripts/run-tests.mjs', { stdio: 'inherit' });
  } catch {
    // non-zero exit already printed by child process
  }
  running = false;
}

function scheduleRun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runTests, DEBOUNCE_MS);
}

console.log('[watch] Watching for changes in:', WATCH_DIRS.join(', '));
console.log('[watch] Press Ctrl+C to stop.\n');

runTests();

for (const dir of WATCH_DIRS) {
  watch(dir, { recursive: true }, (event, filename) => {
    if (filename && (filename.endsWith('.ts') || filename.endsWith('.tsx') || filename.endsWith('.mjs'))) {
      console.log(`[watch] ${event}: ${join(dir, filename)}`);
      scheduleRun();
    }
  });
}
