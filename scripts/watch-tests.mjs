/**
 * watch-tests.mjs
 *
 * Smart watch mode for the test suite.
 *
 * - A change to a __tests__/*.test.ts file re-runs ONLY that file.
 * - A change to a source file (constants/, contexts/, …) re-runs only the
 *   test files that import the changed module (resolved by scanning import
 *   statements in each test file).
 * - Falls back to the full suite when the import scan produces no matches
 *   (e.g. a new file, an indirect dependency, or a shared utility that is
 *   hard to trace statically).
 * - A full-suite summary line is always printed at the end of each cycle.
 *
 * Dependency mapping is rebuilt fresh each run so it stays correct as files
 * are added or imports change — no stale cache issues.
 */

import { watch, existsSync, readdirSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join, basename } from 'path';
import { cpus } from 'os';

// ── Directories to watch ───────────────────────────────────────────────────

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
const TEST_DIR = '__tests__';
const TSX = join('node_modules', '.bin', 'tsx');
const CONCURRENCY = Math.max(1, cpus().length);

// ── Dependency scanner ─────────────────────────────────────────────────────
// Returns a Map<testFile, Set<importedModuleKey>> where moduleKey is the
// resolved relative path without extension, e.g. "constants/blueprintCore".

function buildImportMap() {
  const map = new Map();
  let testFiles;
  try {
    testFiles = readdirSync(TEST_DIR).filter(f => f.endsWith('.test.ts'));
  } catch {
    return map;
  }
  for (const tf of testFiles) {
    const src = readFileSync(join(TEST_DIR, tf), 'utf8');
    const imports = new Set();
    // Match: from '../foo/bar'  or  from "../foo/bar"  (static imports + type imports)
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const raw = m[1]; // e.g. '../constants/blueprintCore'
      // Normalise to project-root-relative key (strip leading ../ or ./)
      const key = raw
        .replace(/^\.\.\//, '')   // ../constants/foo → constants/foo
        .replace(/^\.\//, '')     // ./foo → foo
        .replace(/\.(ts|tsx|js|mjs)$/, '');
      imports.add(key);
    }
    map.set(tf, imports);
  }
  return map;
}

// Given a changed source path (relative to project root, e.g.
// "constants/blueprintCore.ts"), return the set of test file basenames that
// import it — or null if the full suite should run instead.
function affectedTests(changedPath) {
  const allTests = (() => {
    try { return readdirSync(TEST_DIR).filter(f => f.endsWith('.test.ts')); }
    catch { return []; }
  })();

  // Changed file is itself a test → run only that test.
  const rel = changedPath.replace(/\\/g, '/');
  if (rel.startsWith('__tests__/') && rel.endsWith('.test.ts')) {
    const name = basename(rel);
    if (allTests.includes(name)) return [name];
  }

  // Source file changed → scan imports.
  const keyNoExt = rel.replace(/\.(ts|tsx|js|mjs)$/, '');
  const map = buildImportMap();
  const matched = [];
  for (const [tf, imports] of map) {
    if (imports.has(keyNoExt)) matched.push(tf);
  }

  if (matched.length > 0) return matched;

  // No static match found → full suite fallback.
  return null;
}

// ── Per-file runner (buffered, promise-based) ──────────────────────────────

function runFile(file) {
  const filePath = join(TEST_DIR, file);
  return new Promise(resolve => {
    const chunks = [];
    const proc = spawn(TSX, [filePath], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => chunks.push(d));
    proc.on('error', err =>
      resolve({ file: filePath, ok: false, output: `spawn error: ${err.message}` })
    );
    proc.on('close', code =>
      resolve({ file: filePath, ok: code === 0, output: Buffer.concat(chunks).toString() })
    );
  });
}

// ── Bounded parallel pool ──────────────────────────────────────────────────

async function runPool(files) {
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
  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}

// ── Main run function ──────────────────────────────────────────────────────

async function runTests(changedPaths) {
  let allTests;
  try {
    allTests = readdirSync(TEST_DIR).filter(f => f.endsWith('.test.ts')).sort();
  } catch {
    allTests = [];
  }

  if (allTests.length === 0) {
    console.log('[watch] No test files found.\n');
    return;
  }

  // Empty changedPaths means "startup" or "re-run requested" → full suite.
  let subset = new Set();
  let fullSuite = changedPaths.length === 0;

  for (const p of changedPaths) {
    const hit = affectedTests(p);
    if (hit === null) { fullSuite = true; break; }
    for (const t of hit) subset.add(t);
  }

  const toRun = fullSuite ? allTests : [...subset].filter(t => allTests.includes(t));

  if (toRun.length === 0) {
    console.log('[watch] No matching tests for changed files — skipping.\n');
    return;
  }

  if (fullSuite) {
    console.log('\n[watch] Running full suite...\n');
  } else {
    console.log(`\n[watch] Affected: ${toRun.join(', ')}`);
    console.log(`[watch] Running ${toRun.length} file${toRun.length === 1 ? '' : 's'}...\n`);
  }

  const results = await runPool(toRun);

  let passed = 0;
  let failed = 0;
  for (const { file, ok, output } of results) {
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`\n--- ${status}: ${file} ---`);
    if (output.trim()) console.log(output.trimEnd());
    if (ok) passed++; else failed++;
  }

  const skipped = allTests.length - toRun.length;
  const skipNote = skipped > 0 ? `, ${skipped} skipped (not affected)` : '';
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed${skipNote} ===\n`);
}

// ── Debounce + change accumulator ─────────────────────────────────────────

let debounceTimer = null;
let running = false;
const pendingChanges = new Set();

function flushPending() {
  if (running) {
    // A run is already in progress; try again after it finishes.
    debounceTimer = setTimeout(flushPending, DEBOUNCE_MS);
    return;
  }
  running = true;
  const snapshot = [...pendingChanges];
  pendingChanges.clear();
  runTests(snapshot).then(() => { running = false; });
}

function scheduleRun(filePath) {
  pendingChanges.add(filePath);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushPending, DEBOUNCE_MS);
}

// ── Start ──────────────────────────────────────────────────────────────────

console.log('[watch] Watching for changes in:', WATCH_DIRS.join(', '));
console.log('[watch] Press Ctrl+C to stop.\n');

// Initial full-suite run on startup.
runTests([]).then(() => { running = false; });
running = true;

for (const dir of WATCH_DIRS) {
  watch(dir, { recursive: true }, (event, filename) => {
    if (
      filename &&
      (filename.endsWith('.ts') || filename.endsWith('.tsx') || filename.endsWith('.mjs'))
    ) {
      const rel = join(dir, filename).replace(/\\/g, '/');
      console.log(`[watch] ${event}: ${rel}`);
      scheduleRun(rel);
    }
  });
}
