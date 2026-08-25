#!/usr/bin/env node
/**
 * Benchmark fixture validator — Phase 5C.3 Track B
 *
 * Deterministically verifies the African fashion benchmark package:
 *  1. Every fixture ID is unique within each catalog.
 *  2. The reviewer catalog (fixtures.md) and the internal runner catalog
 *     (internal/runner-fixtures.md) are row-for-row identical on the shared
 *     descriptive columns (ID, Category, Sub-type, Pattern, Scale, Fabric, Colour).
 *  3. The reviewer catalog contains NO evaluative columns (occasion tags,
 *     formality, warmth) — the anti-contamination boundary.
 *  4. Every fixture ID referenced in the case files exists in the catalog.
 *  5. Every fingerprint is sorted, and matches the component IDs listed for
 *     that candidate in the same case section.
 *  6. The v1 garment-classification package contains exactly GU-01…GU-40 and
 *     does not reintroduce the quarantined men's-fashion descriptions.
 *
 * Usage: node scripts/validate-benchmark-fixtures.mjs
 * Exit code 0 = valid, 1 = violations found.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs/recommendation/africa/benchmark-v1');
const ID_RE = /\b(F\d+B?|OC-F\d+|WF\d+)\b/g;

const errors = [];
const read = (p) => readFileSync(join(DIR, p), 'utf8');

/** Parse fixture table rows: returns Map(id -> array of trimmed cells). */
function parseCatalog(text, file) {
  const rows = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 7) continue;
    const id = cells[0];
    if (!/^(F\d+B?|OC-F\d+|WF\d+)$/.test(id)) continue;
    if (rows.has(id)) errors.push(`${file}: duplicate fixture ID ${id}`);
    rows.set(id, cells);
  }
  return rows;
}

// --- 1+2+3: catalog consistency ---
const reviewerText = read('fixtures.md');
const runnerText = read('internal/runner-fixtures.md');
const reviewer = parseCatalog(reviewerText, 'fixtures.md');
const runner = parseCatalog(runnerText, 'internal/runner-fixtures.md');

// Anti-contamination boundary: no evaluative columns in any reviewer table header.
for (const line of reviewerText.split('\n')) {
  if (line.startsWith('|') && /\|\s*(Occasion tags?|Formality|Warmth)\s*\|/i.test(line)) {
    errors.push(`fixtures.md: reviewer catalog contains evaluative column(s): ${line.trim()}`);
  }
}
for (const [id, rCells] of runner) {
  const v = reviewer.get(id);
  if (!v) { errors.push(`fixtures.md: missing ID ${id} present in runner catalog`); continue; }
  const shared = 7; // ID, Category, Sub-type, Pattern, Scale, Fabric, Colour
  for (let i = 0; i < shared; i++) {
    if (v[i] !== rCells[i]) {
      errors.push(`ID ${id}: column ${i} differs — reviewer "${v[i]}" vs runner "${rCells[i]}"`);
    }
  }
}
for (const id of reviewer.keys()) {
  if (!runner.has(id)) errors.push(`internal/runner-fixtures.md: missing ID ${id} present in reviewer catalog`);
}

// --- 4+5: case files ---
const caseFiles = ['outfit-ranking-cases.md', 'occasion-cases.md', 'weather-cases.md'];
for (const file of caseFiles) {
  const text = read(file);
  for (const m of text.matchAll(ID_RE)) {
    if (!reviewer.has(m[1])) errors.push(`${file}: references undefined fixture ${m[1]}`);
  }
  // Per case section, compare candidate component rows against fingerprints.
  const sections = text.split(/\n(?=#{2,3} )/);
  for (const sec of sections) {
    const header = sec.split('\n', 1)[0].replace(/#+\s*/, '').slice(0, 60);
    const comps = new Map();
    for (const rm of sec.matchAll(/^\| ([A-E]) \| [^|]+ \| ([^|]+) \|/gm)) {
      const ids = [...new Set([...rm[2].matchAll(ID_RE)].map((x) => x[1]))].sort();
      comps.set(rm[1], ids);
    }
    const fpm = sec.match(/\*\*Fingerprints:\*\* (.+)/);
    if (!fpm) continue;
    for (const part of fpm[1].split('·').map((s) => s.trim())) {
      const mm = part.match(/^([A-E]): (.+)$/);
      if (!mm) continue;
      const ids = mm[2].split(',').map((s) => s.trim());
      const sorted = [...ids].sort();
      if (JSON.stringify(ids) !== JSON.stringify(sorted)) {
        errors.push(`${file} [${header}] candidate ${mm[1]}: fingerprint not sorted`);
      }
      for (const id of ids) {
        if (!reviewer.has(id)) errors.push(`${file} [${header}] candidate ${mm[1]}: fingerprint references undefined ${id}`);
      }
      const expected = comps.get(mm[1]);
      if (expected && JSON.stringify(expected) !== JSON.stringify(sorted)) {
        errors.push(`${file} [${header}] candidate ${mm[1]}: components [${expected}] != fingerprint [${sorted}]`);
      }
    }
  }
}

// --- 6: v1 women's-scope classification set ---
const classificationText = read('classification-cases.md');
const guIds = new Set([...classificationText.matchAll(/\*\*GU-(\d{2})\*\*/g)].map((m) => Number(m[1])));
const expectedGuIds = Array.from({ length: 40 }, (_, index) => index + 1);
for (const id of expectedGuIds) {
  if (!guIds.has(id)) errors.push(`classification-cases.md: missing GU-${String(id).padStart(2, '0')}`);
}
for (const id of guIds) {
  if (!expectedGuIds.includes(id)) errors.push(`classification-cases.md: unexpected GU-${String(id).padStart(2, '0')}`);
}
if (guIds.size !== 40) {
  errors.push(`classification-cases.md: expected 40 distinct GU cases, found ${guIds.size}`);
}
const v1ScopeText = classificationText
  .replace(/^#.*$/m, '')
  .replace(/\bmen's\b/gi, '');
if (/\b(agbada|senator|babariga|fila)\b/i.test(v1ScopeText)) {
  errors.push('classification-cases.md: v1 women-focused set contains quarantined men’s-fashion terminology');
}

if (errors.length) {
  console.error(`FIXTURE VALIDATION FAILED — ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Fixture validation passed: ${reviewer.size} catalog items, catalogs consistent, all case references and fingerprints valid, and 40 women-focused GU cases in scope.`);
