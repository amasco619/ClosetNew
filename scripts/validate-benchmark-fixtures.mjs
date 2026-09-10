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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs/recommendation/africa/benchmark-v1');
const SNAP = join(DIR, 'frozen-v1');
const ID_RE = /\b(F\d+B?|OC-F\d+|WF\d+)\b/g;

const errors = [];
const read = (p) => readFileSync(join(DIR, p), 'utf8');
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...values] = rows;
  return values.filter((r) => r.some(Boolean)).map((r) =>
    Object.fromEntries(headers.map((header, index) => [header, r[index] ?? ''])));
}

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

// --- 7: frozen signed gold labels ---
const goldPath = join(SNAP, 'gold-standard/gold-labels.json');
const summaryPath = join(SNAP, 'gold-standard/gold-label-summary.csv');
const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
const garmentCases = gold.garment_classification_cases ?? [];
const outfitCases = gold.outfit_cases ?? [];
const allCases = [...garmentCases, ...outfitCases];
const expectedCaseIds = [
  ...Array.from({ length: 40 }, (_, i) => `GU-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 30 }, (_, i) => `OR-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 20 }, (_, i) => `OC-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `WX-${String(i + 1).padStart(2, '0')}`),
];
const actualCaseIds = allCases.map((c) => c.case_id);
if (JSON.stringify(actualCaseIds) !== JSON.stringify(expectedCaseIds)) {
  errors.push('gold-labels.json: active case IDs are not exactly GU-01…40, OR-01…30, OC-01…20, WX-01…10');
}
if (new Set(actualCaseIds).size !== 100) errors.push('gold-labels.json: duplicate or missing active case IDs');

const requiredGu = [
  'garment_type', 'fabric', 'pattern', 'pattern_scale', 'colour', 'formality',
  'occasions', 'cultural_context', 'visual_weight', 'gender',
  'reviewer_confidence', 'reviewer_rationale',
];
for (const c of garmentCases) {
  for (const key of requiredGu) {
    if (!(key in (c.gold_label ?? {}))) errors.push(`${c.case_id}: missing gold-label field ${key}`);
  }
  if (c.gold_label?.gender !== 'women') errors.push(`${c.case_id}: v1 gold label gender must be women`);
  if (c.image_ref?.image_id !== `IMG-${c.case_id}`) errors.push(`${c.case_id}: image reference mismatch`);
}

for (const c of outfitCases) {
  const candidateIds = c.candidates.map((candidate) => candidate.candidate_id);
  const candidateSet = new Set(candidateIds);
  if (candidateSet.size !== candidateIds.length) errors.push(`${c.case_id}: duplicate candidate IDs`);
  for (const candidate of c.candidates) {
    if (candidate.components.some((id) => !reviewer.has(id))) {
      errors.push(`${c.case_id}/${candidate.candidate_id}: unknown fixture component`);
    }
    if (candidate.outfit_fingerprint !== [...candidate.components].sort().join(',')) {
      errors.push(`${c.case_id}/${candidate.candidate_id}: frozen fingerprint mismatch`);
    }
  }
  const label = c.gold_label ?? {};
  const ranking = label.ranking ?? [];
  if (ranking.length !== candidateIds.length || new Set(ranking).size !== ranking.length ||
      ranking.some((id) => !candidateSet.has(id))) {
    errors.push(`${c.case_id}: ranking must contain each candidate exactly once`);
  }
  const acceptable = label.acceptable_candidates ?? [];
  const unacceptable = label.not_acceptable_candidates ?? [];
  if (!acceptable.length) errors.push(`${c.case_id}: no acceptable candidate`);
  if ([...acceptable, ...unacceptable].some((id) => !candidateSet.has(id)) ||
      acceptable.some((id) => unacceptable.includes(id)) ||
      new Set([...acceptable, ...unacceptable]).size !== candidateSet.size) {
    errors.push(`${c.case_id}: acceptability lists must partition the candidate set`);
  }
  if (!candidateSet.has(label.preferred_candidate_id) ||
      !acceptable.includes(label.preferred_candidate_id)) {
    errors.push(`${c.case_id}: preferred candidate must exist and be acceptable`);
  }
  const rankPosition = Object.fromEntries(ranking.map((id, index) => [id, index]));
  const pairs = new Set();
  for (const pair of label.pairwise ?? []) {
    const key = `${pair.better}>${pair.worse}`;
    if (!candidateSet.has(pair.better) || !candidateSet.has(pair.worse) ||
        pair.better === pair.worse || pairs.has(key) ||
        rankPosition[pair.better] >= rankPosition[pair.worse]) {
      errors.push(`${c.case_id}: invalid pairwise comparison ${key}`);
    }
    pairs.add(key);
  }
  if (new Set(Object.keys(label.reviewer_scores ?? {})).size !== candidateSet.size ||
      new Set(Object.keys(label.utility ?? {})).size !== candidateSet.size) {
    errors.push(`${c.case_id}: reviewer score/utility candidate mismatch`);
  }
  for (const id of candidateIds) {
    const scores = Object.values(label.reviewer_scores?.[id] ?? {});
    if (scores.length !== 7 || scores.some((score) => !Number.isInteger(score) || score < 0 || score > 5)) {
      errors.push(`${c.case_id}/${id}: invalid reviewer scores`);
    } else if (scores.reduce((sum, score) => sum + score, 0) !== label.utility?.[id]) {
      errors.push(`${c.case_id}/${id}: utility does not equal reviewer-score sum`);
    }
  }
}

// CSV summary must agree with all 100 JSON records.
const summary = parseCsv(readFileSync(summaryPath, 'utf8').replace(/^\uFEFF/, ''));
if (summary.length !== 100 || summary.map((r) => r.case_id).join(',') !== expectedCaseIds.join(',')) {
  errors.push('gold-label-summary.csv: case count/order mismatch');
}
const byId = new Map(allCases.map((c) => [c.case_id, c]));
for (const row of summary) {
  const c = byId.get(row.case_id);
  if (!c || row.case_type !== c.case_type) { errors.push(`${row.case_id}: CSV type mismatch`); continue; }
  const label = c.gold_label;
  if (row.case_id.startsWith('GU-')) {
    if (row.gold !== label.garment_type || row.confidence !== label.reviewer_confidence ||
        row.rationale !== label.reviewer_rationale) errors.push(`${row.case_id}: CSV/JSON GU mismatch`);
  } else if (row.gold !== label.preferred_candidate_id ||
      row.ranking !== label.ranking.join('>') ||
      row.acceptable !== label.acceptable_candidates.join(',') ||
      row.not_acceptable !== label.not_acceptable_candidates.join(',') ||
      row.rationale !== label.rationale) {
    errors.push(`${row.case_id}: CSV/JSON outfit-label mismatch`);
  }
}

// Reviewer-owned JSON may not contain internal/engine-owned fields.
const forbiddenKeys = new Set([
  'amodka_prediction', 'current_amodka_mapping', 'engine_ranking', 'engine_score',
  'engine_scores', 'developer_prediction', 'expected_winner',
  'case_design_intent', 'internal_scoring_weights',
]);
function scanKeys(value, path = 'gold-labels') {
  if (Array.isArray(value)) return value.forEach((item, index) => scanKeys(item, `${path}/${index}`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) errors.push(`${path}: forbidden reviewer-owned key ${key}`);
    scanKeys(child, `${path}/${key}`);
  }
}
scanKeys(gold);

// --- 8: synthetic image package and provenance ---
const imageDir = join(SNAP, 'images');
const expectedImageIds = Array.from({ length: 40 }, (_, i) => `IMG-GU-${String(i + 1).padStart(2, '0')}`);
const actualImageIds = readdirSync(imageDir)
  .filter((name) => /^IMG-GU-\d{2}\.png$/.test(name))
  .map((name) => name.slice(0, -4))
  .sort();
if (actualImageIds.join(',') !== expectedImageIds.join(',')) {
  errors.push('frozen image package: expected exactly IMG-GU-01.png through IMG-GU-40.png');
}
for (const id of expectedImageIds) {
  const png = readFileSync(join(imageDir, `${id}.png`));
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') errors.push(`${id}.png: invalid PNG signature`);
}
const provenance = parseCsv(readFileSync(join(imageDir, 'synthetic-image-provenance-register.csv'), 'utf8').replace(/^\uFEFF/, ''));
if (provenance.length !== 40 || provenance.map((r) => r.image_id).join(',') !== expectedImageIds.join(',')) {
  errors.push('synthetic provenance register: expected 40 ordered image IDs');
}
for (const row of provenance) {
  if (row.case_ids !== row.image_id.replace('IMG-', '')) errors.push(`${row.image_id}: provenance case mapping mismatch`);
  if (row.source_type !== 'synthetic' || row.personally_identifiable !== 'no') {
    errors.push(`${row.image_id}: provenance synthetic/PII status mismatch`);
  }
}

// --- 9: manifest, immutable checksums, and quarantine ---
const manifest = JSON.parse(readFileSync(join(SNAP, 'benchmark-manifest.json'), 'utf8'));
if (manifest.case_count !== 100 || manifest.product_scope !== 'women' ||
    manifest.market_scope !== 'Nigeria/Africa' || manifest.engine_version_under_test !== '3.7' ||
    manifest.irr_status !== 'not_performed' || manifest.track_c_executed !== false) {
  errors.push('benchmark-manifest.json: required benchmark identity/scope fields are invalid');
}
const sumsPath = join(SNAP, manifest.integrity.sha256sums_file);
if (sha256(sumsPath) !== manifest.integrity.sha256sums_sha256) errors.push('SHA256SUMS manifest hash mismatch');
const sums = readFileSync(sumsPath, 'utf8').trim().split('\n');
if (sums.length !== manifest.integrity.hashed_snapshot_files) errors.push('SHA256SUMS file-count mismatch');
for (const line of sums) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match || !existsSync(join(SNAP, match?.[2] ?? '')) ||
      (match && sha256(join(SNAP, match[2])) !== match[1])) {
    errors.push(`snapshot checksum mismatch: ${line}`);
  }
}
if (!existsSync(join(DIR, 'internal/non-gold-drafts/README.md')) ||
    !existsSync(join(DIR, 'internal/future-v2-mens-fashion/README.md'))) {
  errors.push('quarantined historical material is missing its boundary documentation');
}

if (errors.length) {
  console.error(`FIXTURE VALIDATION FAILED — ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Benchmark validation passed: 100 cases (40/30/20/10), ${reviewer.size} fixtures, ` +
  '100 signed labels, 40 synthetic images/provenance rows, valid fingerprints/pairwise data, ' +
  'reviewer/runner separation, quarantine boundaries, manifest, and 53 frozen-file checksums.'
);
