#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const base = join(root, 'docs/recommendation/africa/track-c/baseline-v3.7');
const raw = join(base, 'raw-engine-output');
const required = [
  'README.md', 'execution-manifest.json', 'RAW-SHA256SUMS', 'metrics.json',
  'case-results.csv', 'garment-results.csv', 'outfit-results.csv',
  'occasion-results.csv', 'weather-results.csv', 'ankara-analysis.md',
  'cultural-context-analysis.md', 'western-default-bias-analysis.md',
  'weather-culture-tradeoff-analysis.md', 'failure-analysis.md',
  'regression-comparison.md', 'reproducibility.md', 'TEST-RESULTS.md',
  'PRODUCTION-SAFETY-CONFIRMATION.md', 'PHASE-5C.3-TRACK-C-FINAL-REPORT.md',
];
const missing = required.filter((file) => !existsSync(join(base, file)));
if (missing.length) throw new Error(`Missing Track C files: ${missing.join(', ')}`);
const manifest = JSON.parse(readFileSync(join(base, 'execution-manifest.json'), 'utf8'));
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
for (const [file, expected] of Object.entries(manifest.raw_output_sha256)) {
  if (hash(join(raw, file)) !== expected) throw new Error(`Raw seal mismatch: ${file}`);
}
const caseFiles = readdirSync(raw).filter((file) => /^(GU|OR|OC|WX)-\d{2}-result\.json$/.test(file));
if (caseFiles.length !== 100) throw new Error(`Expected 100 raw case files, found ${caseFiles.length}`);
const metrics = JSON.parse(readFileSync(join(base, 'metrics.json'), 'utf8'));
if (metrics.cases_attempted !== 100 || metrics.cases_skipped !== 0) throw new Error('Metrics case counts invalid');
const csvCounts = {
  'case-results.csv': 100, 'garment-results.csv': 40, 'outfit-results.csv': 30,
  'occasion-results.csv': 20, 'weather-results.csv': 10,
};
for (const [file, expected] of Object.entries(csvCounts)) {
  const actual = readFileSync(join(base, file), 'utf8').trim().split('\n').length - 1;
  if (actual !== expected) throw new Error(`${file}: expected ${expected} rows, found ${actual}`);
}
const report = readFileSync(join(base, 'PHASE-5C.3-TRACK-C-FINAL-REPORT.md'), 'utf8');
for (let i = 1; i <= 26; i++) if (!report.includes(`## ${i}.`)) throw new Error(`Final report section ${i} missing`);
console.log('Track C validation passed: 100 sealed raw cases, complete metrics/CSVs, 26 report sections, and all required analysis files.');