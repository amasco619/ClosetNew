import { readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const testDir = '__tests__';
const files = readdirSync(testDir)
  .filter(f => f.endsWith('.test.ts'))
  .sort();

if (files.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

let passed = 0;
let failed = 0;

for (const file of files) {
  const filePath = join(testDir, file);
  console.log(`\nRunning ${filePath} ...`);
  try {
    execSync(`node_modules/.bin/tsx ${filePath}`, { stdio: 'inherit' });
    passed++;
  } catch {
    failed++;
  }
}

console.log(`\n--- Test results: ${passed} passed, ${failed} failed ---`);

// ── Lint check ────────────────────────────────────────────────────────────────
// Runs ESLint (via Expo's lint wrapper) so lint errors are caught on every
// npm test invocation and every pre-commit hook run.
// Failures here count against the final exit code alongside test failures.

let lintFailed = false;
console.log('\nRunning lint check (npx expo lint)...');
try {
  execSync('npx expo lint', { stdio: 'inherit' });
  console.log('Lint passed.');
} catch {
  console.error('Lint check failed — fix the errors above before committing.');
  lintFailed = true;
}

// ── Summary ───────────────────────────────────────────────────────────────────

const anyFailed = failed > 0 || lintFailed;
const lintStatus = lintFailed ? 'lint FAILED' : 'lint passed';
console.log(`\n=== Summary: ${passed} test suite(s) passed, ${failed} failed | ${lintStatus} ===`);

if (anyFailed) process.exit(1);
