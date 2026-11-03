/**
 * Blind coverage only. Never serialise evaluator verdicts, hits or failure groups.
 * Run with node_modules/.bin/tsx scripts/nigerian-v2-coverage.ts
 * Adapter must be committed and its SHA-256 published BEFORE running this script.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BlindObservation } from '../lib/nigerianStyling/v2/blindAdapter';
import { adaptBlindLookFacts } from '../lib/nigerianStyling/v2/blindAdapter';
import { evaluateNigerianStylingV2 } from '../lib/nigerianStyling/v2/evaluate';

const directory = '__tests__/fixtures/nigerian-v2-rating-set';
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const manifest = readFileSync(join(directory, 'SHA256SUMS'));
if (sha(manifest) !== readFileSync(join(directory, 'FIXTURE_SET_SHA256'), 'utf8').trim()) {
  throw new Error('Frozen fixture manifest does not match its recorded digest.');
}
const records = manifest.toString().trimEnd().split('\n').map(line => {
  const match = /^([a-f0-9]{64})  (S\d{2}-[ABCD]\.json)$/.exec(line);
  if (!match) throw new Error('Invalid frozen fixture checksum record.');
  return { checksum: match[1], file: match[2] };
});
const expected = Array.from({ length: 25 }, (_, n) =>
  [...'ABCD'].map(letter => `S${String(n + 1).padStart(2, '0')}-${letter}.json`)).flat();
if (JSON.stringify(records.map(record => record.file)) !== JSON.stringify(expected)
  || JSON.stringify(readdirSync(directory).filter(file => /^S\d{2}-[ABCD]\.json$/.test(file)).sort())
    !== JSON.stringify(expected)) {
  throw new Error('Expected exactly the frozen 25-by-4 fixture set.');
}

type Category = 'Nigerian event' | 'work' | 'travel' | 'weather' | 'date' | 'other';
const categories: Record<Category, { final: number; 'floor-only': number; abstained: number }> = {
  'Nigerian event': { final: 0, 'floor-only': 0, abstained: 0 },
  work: { final: 0, 'floor-only': 0, abstained: 0 },
  travel: { final: 0, 'floor-only': 0, abstained: 0 },
  weather: { final: 0, 'floor-only': 0, abstained: 0 },
  date: { final: 0, 'floor-only': 0, abstained: 0 },
  other: { final: 0, 'floor-only': 0, abstained: 0 },
};

function category(title: string, observation: BlindObservation): Category {
  if (/\btravel\b/i.test(title)) return 'travel';
  if (/\b(?:weather|heat)\b/i.test(title)) return 'weather';
  if (/\bdate\b/i.test(title)) return 'date';
  if (observation.brief.occasion === 'work'
    || /\b(?:office|interview|campus presentation)\b/i.test(title)) return 'work';
  if (['owambe', 'traditionalWedding', 'whiteWedding', 'funeral', 'naming',
    'traditionalEvent', 'church'].includes(observation.brief.occasion ?? '')) return 'Nigerian event';
  return 'other';
}

// Validate EVERY file before the first evaluation, not just as each is read.
const fixtures = records.map(record => {
  const bytes = readFileSync(join(directory, record.file));
  if (sha(bytes) !== record.checksum) throw new Error(`Frozen bytes changed: ${record.file}`);
  const fixture = JSON.parse(bytes.toString()) as {
    id: string; source: { passages: Record<string, string> }; lookFacts: BlindObservation;
    evidence: Record<string, { source: string; quote: string }[]>;
  };
  if (`${fixture.id}.json` !== record.file) throw new Error('Fixture ID mismatch.');
  return fixture;
});
for (const fixture of fixtures) {
  const passages = fixture.source.passages;
  const input = adaptBlindLookFacts(fixture.lookFacts, {
    context: Object.entries(passages).filter(([key]) => key.endsWith('.context'))
      .map(([, text]) => text).join('\n'),
    look: passages[fixture.id],
    itemPhrases: fixture.lookFacts.items.map((_, index) =>
      (fixture.evidence[`/items/${index}/kind`] ?? []).map(e => e.quote).join('; ')),
  });
  const result = evaluateNigerianStylingV2(input, { mode: 'accuracy' });
  const group = category(fixture.source.passages[`${fixture.id.slice(0, 3)}.title`], fixture.lookFacts);
  categories[group][result.status]++;
}
// Count-only allowlist: no fixture-level result, floor value, questions or hits.
const output = JSON.stringify({ categories }, null, 2);
// Fail closed if any future evaluator message would expose a verdict label.
if (/\b(?:Works|Almost|Rethink)\b/i.test(output)) {
  throw new Error('Coverage output refused: contains a prohibited verdict label.');
}
console.log(output);
