/**
 * run-tests.mjs
 *
 * Runs all __tests__/*.test.ts files concurrently using a bounded child-
 * process pool (capped at CPU count) to avoid resource contention while
 * still parallelising the work.  Each file is run in its own `tsx` child
 * process so TypeScript is compiled independently and test isolation is
 * guaranteed.
 *
 * Lint is intentionally excluded from this script so `npm test` and the
 * pre-commit hook stay fast.  Run `npm run lint` separately when needed.
 */

import { readdirSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { cpus } from 'os';

// ── Test file discovery ────────────────────────────────────────────────────

const testDir = '__tests__';
const files = readdirSync(testDir)
  .filter(f => f.endsWith('.test.ts'))
  .sort();

if (files.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

// ── Per-file runner (buffered output, error-safe) ──────────────────────────

const TSX = join('node_modules', '.bin', 'tsx');

function runFile(file) {
  const filePath = join(testDir, file);
  return new Promise(resolve => {
    const chunks = [];
    const proc = spawn(TSX, [filePath], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => chunks.push(d));
    proc.on('error', err => {
      resolve({ file: filePath, ok: false, output: `spawn error: ${err.message}` });
    });
    proc.on('close', code => {
      resolve({ file: filePath, ok: code === 0, output: Buffer.concat(chunks).toString() });
    });
  });
}

// ── Bounded concurrent pool ────────────────────────────────────────────────
// Run at most CONCURRENCY files in parallel so we don't saturate the
// container; extra files are queued and start as a slot frees up.

const CONCURRENCY = Math.max(1, cpus().length); // 4 on this container

const results = [];
const queue = [...files];
let active = 0;

await new Promise(resolve => {
  function next() {
    while (active < CONCURRENCY && queue.length > 0) {
      const file = queue.shift();
      active++;
      runFile(file).then(result => {
        results.push(result);
        active--;
        next();
        if (active === 0 && queue.length === 0) resolve();
      });
    }
  }
  next();
});

// Results arrive in completion order; sort back to alphabetical for a
// stable, readable summary.
results.sort((a, b) => a.file.localeCompare(b.file));

// ── Print results + tally ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const { file, ok, output } of results) {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`\n--- ${status}: ${file} ---`);
  if (output.trim()) console.log(output.trimEnd());
  if (ok) passed++; else failed++;
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n=== Summary: ${passed} test suite(s) passed, ${failed} failed ===`);

if (failed > 0) process.exit(1);
