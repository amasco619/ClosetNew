/**
 * check-blueprint-images.mjs
 *
 * Verifies that every image file referenced via require() inside
 * constants/wardrobeBlueprint.ts actually exists on disk.
 *
 * Usage:
 *   node scripts/check-blueprint-images.mjs
 *
 * Exits 0 on success, 1 if any image file is missing.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const blueprintSrc = readFileSync(
  resolve(root, 'constants', 'wardrobeBlueprint.ts'),
  'utf8',
);

// Extract all require() paths pointing into assets/
// Matches both:
//   require('../assets/recommendations/foo.png')
//   require("../assets/recommendations/foo.png")
const REQUIRE_RE = /require\(['"](\.\.(\/assets\/[^'"]+))['"]\)/g;
const matches = [...blueprintSrc.matchAll(REQUIRE_RE)];

if (matches.length === 0) {
  console.log('[check:images] No image require() calls found in constants/wardrobeBlueprint.ts');
  console.log('[check:images] Nothing to check — pass.');
  process.exit(0);
}

// Deduplicate so each path is only checked once
const seen = new Set();
const refs = [];
for (const m of matches) {
  const relFromConstants = m[1]; // e.g. '../assets/recommendations/foo.png'
  const assetPath = m[2];        // e.g. /assets/recommendations/foo.png
  const absPath = resolve(root, 'constants', relFromConstants);
  if (!seen.has(absPath)) {
    seen.add(absPath);
    refs.push({ absPath, assetPath });
  }
}

let passed = 0;
let failed = 0;

console.log(`[check:images] Checking ${refs.length} unique image reference(s)...\n`);

for (const { absPath, assetPath } of refs) {
  if (existsSync(absPath)) {
    console.log(`  ✓ ${assetPath}`);
    passed++;
  } else {
    console.error(`  ✗ MISSING: ${assetPath}`);
    console.error(`    Expected at: ${absPath}`);
    failed++;
  }
}

console.log(`\n=== check:images: ${passed} present, ${failed} missing ===`);

if (failed > 0) {
  console.error('\nFix: add the missing asset files or update the require() paths in wardrobeBlueprint.ts.');
  process.exit(1);
}
