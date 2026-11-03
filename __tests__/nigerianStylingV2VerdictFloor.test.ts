import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind } from 'typescript';
import { evaluateNigerianStylingV2 as assess } from '../lib/nigerianStyling/v2/evaluate';
import { RULES } from '../lib/nigerianStyling/v2/rules';
import type { LookFacts } from '../lib/nigerianStyling/v2/types';

// Independent synthetic facts only. Never open the blind rating fixtures.
const look = (): LookFacts => ({
  items: [{
    id: 'base', kind: 'dress', key: true, colour: 'navy',
    textileIdentity: 'premium-ankara', quality: 'notPoorPolyester',
    finish: 'other', hem: 'belowKnee', backless: false, strapless: false,
    sleeveLength: 'long', modest: true,
  }],
  brief: { occasion: 'work', role: 'guest', community: 'other',
    asoEbiBought: false, formalityBand: [4, 7] },
  traditionalWear: false, printDominance: 'noPrint', wornCover: false,
  v1: { decision: { status: 'eligible', headCoveringSatisfied: true }, gapNotes: [] },
});
function input(groups: 0 | 1 | 2, unresolved: boolean): LookFacts {
  const facts = look();
  if (groups > 0) facts.items = [{ ...facts.items[0], quality: 'poorPolyester' }];
  if (groups > 1) facts.items = [
    ...facts.items,
    { id: 'style', kind: 'gele', key: false, quality: 'notPoorPolyester' },
    { id: 'layer', kind: 'blazer', key: false, quality: 'notPoorPolyester' },
  ];
  if (unresolved) facts.brief.asoEbiBought = undefined;
  return facts;
}
const cases = [
  [0, false, 'final', 'Works', null, true],
  [1, false, 'final', 'Almost', null, true],
  [2, false, 'final', 'Rethink', null, true],
  [0, true, 'final', 'Works', null, true],
  [1, true, 'final', 'Almost', null, true],
  [2, true, 'final', 'Rethink', null, true],
] as const;
for (const [groups, unresolved, status, verdict, floor, judged] of cases) {
  const result = assess(input(groups, unresolved), { mode: 'accuracy' });
  assert.equal(result.status, status);
  assert.equal(result.verdict, verdict);
  assert.equal(result.floor, floor);
  assert.equal(result.judged, judged);
  assert.equal(result.failureGroups.length, groups);
  assert.equal(result.unresolvedReasons.length, 0);
  assert.equal(result.worksWithUnchecked, verdict === 'Works' && unresolved);
  if (unresolved) assert.ok(result.uncheckedRules.some(rule => rule.missingFact === 'brief.asoEbiBought'));
}

// Only the specified structure gaps or an unanswered required church check abstain.
for (const structural of ['no-key', 'vocabulary', 'v1-unknown', 'v1-rejected'] as const) {
  for (const groups of [0, 1, 2] as const) {
    const facts = input(groups, false);
    if (structural === 'no-key') facts.items = facts.items.map(item => ({ ...item, key: false }));
    if (structural === 'vocabulary') {
      facts.items = [{ ...facts.items[0], kind: 'unmapped' }, ...facts.items.slice(1)];
    }
    if (structural === 'v1-unknown') {
      facts.v1 = { decision: { status: 'unknown', headCoveringSatisfied: true }, gapNotes: [] };
    }
    if (structural === 'v1-rejected') {
      facts.v1 = { decision: { status: 'rejected', headCoveringSatisfied: true }, gapNotes: [] };
    }
    const result = assess(facts);
    assert.ok(result.unresolvedReasons.length > 0);
    assert.equal(result.status, groups >= 2 ? 'final' : groups === 1 ? 'floor-only' : 'abstained');
    assert.equal(result.judged, groups >= 2);
  }
}
const repeated = input(1, false);
repeated.items = [...repeated.items, { ...repeated.items[0], id: 'second' }];
assert.equal(assess(repeated).failureGroups.length, 1, 'duplicate hits do not create independent groups');
assert.equal(assess(repeated).verdict, 'Almost');
const coveringGap = input(0, false);
coveringGap.v1 = { decision: { status: 'eligible', headCoveringSatisfied: false }, gapNotes: [] };
assert.equal(assess(coveringGap).status, 'final', 'an unsatisfied covering flag alone is not a structure abstention');
assert.ok(assess(coveringGap).gapNotes.length > 0);

const optional: Record<string, LookFacts> = {
  H04q: { ...look(), brief: { ...look().brief, occasion: 'funeral' },
    items: [{ ...look().items[0], colour: 'white' }] },
  C01: { ...look(), traditionalWear: true,
    brief: { ...look().brief, community: 'yoruba' },
    items: ['iro', 'buba'].map(kind => ({ ...look().items[0], id: kind, kind })) },
  C04: { ...look(), traditionalWear: true,
    brief: { ...look().brief, community: 'igbo' },
    items: [...look().items, { id: 'wrap', key: false, kind: 'ichafu',
      headwearShape: 'other', quality: 'notPoorPolyester' }] },
  C07: { ...look(), brief: { ...look().brief, occasion: 'naming',
    role: 'mother', formalityBand: [9, 10] },
  items: [{ ...look().items[0], textileIdentity: 'indian-george' }] },
};
for (const [id, facts] of Object.entries(optional)) {
  const result = assess(facts);
  assert.ok(result.hits.some(hit => hit.ruleId === id && hit.effect === 'question'));
  assert.ok(result.questions.length > 0, 'optional prompt is retained');
  assert.ok(!result.unresolvedReasons.includes(id));
  assert.equal(result.status, 'final', `${id}: optional question never blocks`);
  assert.equal(result.verdict, 'Works');
  assert.equal(result.worksWithUnchecked, true);
  assert.ok(result.uncheckedRules.some(rule => rule.id === id && rule.missingFact === 'answer'));
}
// Unknown optional community/shape facts are non-blocking too.
const unknownOptional = optional.C04;
unknownOptional.items = unknownOptional.items.map(i => i.id === 'wrap'
  ? { ...i, headwearShape: undefined } : i);
assert.equal(assess(unknownOptional).status, 'final');
assert.ok(assess(unknownOptional).questions.some(q => q.includes('headwearShape')));
assert.ok(assess(unknownOptional).uncheckedRules.some(rule =>
  rule.id === 'C04' && rule.missingFact.includes('headwearShape')));

for (const id of ['H05modest', 'H05denom', 'H05hemQ']) {
  assert.equal(RULES.find(rule => rule.id === id)?.answerRequired, true);
}
const church = look();
church.brief = { ...church.brief, occasion: 'church', denomination: 'pentecostal' };
church.items = [{ ...church.items[0], sleeveLength: 'none', modest: undefined }];
assert.equal(assess(church).status, 'abstained');
assert.ok(assess(church).unresolvedReasons.includes('H05modest'));
assert.ok(assess(church).uncheckedRules.some(rule => rule.id === 'H05modest'));
church.items = [{ ...church.items[0], quality: 'poorPolyester' }];
assert.equal(assess(church).status, 'floor-only', 'required church question preserves a floor');

const advisory = look();
advisory.printDominance = undefined;
assert.equal(assess(advisory).status, 'final');
assert.ok(assess(advisory).questions.length > 0);
assert.equal(assess(advisory).unresolvedReasons.length, 0);
const fitted = look();
fitted.brief = { ...fitted.brief, occasion: 'owambe', timeOfDay: undefined };
assert.ok(assess(fitted).uncheckedRules.some(rule => rule.id === 'S06'));
const accuracy = assess(fitted, { mode: 'accuracy' });
assert.equal(accuracy.status, 'final');
assert.ok(accuracy.excludedRuleIds.includes('S06'));
assert.ok(!accuracy.uncheckedRules.some(rule => rule.id === 'S06'));

// Keep the output boundary count-only: a floor value or a final band must not leak.
const runner = readFileSync('scripts/nigerian-v2-coverage.ts', 'utf8');
assert.ok(runner.includes('categories[group][result.status]++'));
assert.ok(runner.includes('JSON.stringify({ categories }, null, 2)'));
assert.ok(!runner.includes('result.verdict'));
assert.ok(!runner.includes('result.floor'));
assert.ok(!runner.includes('result.failureGroups'));
assert.ok(!runner.includes('result.hits'));
// Execute the real runner with 100 synthetic in-memory files and hostile extra
// result fields. Neither the filesystem fixture set nor real evaluations are used.
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const syntheticFiles = Array.from({ length: 25 }, (_, n) =>
  [...'ABCD'].map(letter => `S${String(n + 1).padStart(2, '0')}-${letter}.json`)).flat();
const bytes = syntheticFiles.map((file, index) => Buffer.from(JSON.stringify({
  id: file.slice(0, -5), source: { passages: {
    [`${file.slice(0, 3)}.title`]: 'Synthetic office',
    [`${file.slice(0, 3)}.context`]: 'Synthetic context',
    [file.slice(0, -5)]: 'Synthetic description',
  } },
  lookFacts: { items: [], brief: { occasion: 'work' }, index }, evidence: {},
})));
const manifest = Buffer.from(syntheticFiles.map((file, index) =>
  `${sha(bytes[index])}  ${file}\n`).join(''));
let printed = '';
let evaluations = 0;
runInNewContext(transpileModule(runner, { compilerOptions: {
  module: ModuleKind.CommonJS,
} }).outputText, {
  Buffer,
  exports: {},
  console: { log: (text: string) => { printed += text; } },
  require: (name: string) => {
    if (name === 'node:fs') return {
      readdirSync: () => syntheticFiles,
      readFileSync: (file: string) => {
        if (file.endsWith('/SHA256SUMS')) return manifest;
        if (file.endsWith('/FIXTURE_SET_SHA256')) return sha(manifest);
        const index = syntheticFiles.findIndex(f => file.endsWith(`/${f}`));
        assert.ok(index >= 0, 'unexpected file read');
        return bytes[index];
      },
    };
    if (name.endsWith('/blindAdapter')) return { adaptBlindLookFacts: (value: unknown) => value };
    if (name.endsWith('/evaluate')) return {
      evaluateNigerianStylingV2: (value: { index: number }) => {
        evaluations++;
        return {
          status: ['final', 'floor-only', 'abstained'][value.index % 3],
          judged: value.index % 3 === 0,
          worksWithUnchecked: value.index % 3 === 0,
          verdict: 'Rethink', floor: 'Almost', failureGroups: ['secret-group'],
          hits: ['secret-hit'], questions: ['Works must not leak'],
        };
      },
    };
    if (name === 'node:crypto') return { createHash };
    if (name === 'node:path') return { join: (...parts: string[]) => parts.join('/') };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
assert.equal(evaluations, 100);
const counts = JSON.parse(printed);
assert.deepEqual(Object.keys(counts), ['categories']);
assert.deepEqual(counts.categories.work,
  { final: 0, worksWithUnchecked: 34, 'floor-only': 33, abstained: 33 });
assert.equal(Object.values(counts.categories).reduce((total: number, group) =>
  total + Object.values(group as Record<string, number>).reduce((a, b) => a + b, 0), 0), 100);
assert.ok(!/Works|Almost|Rethink|secret|verdict|failureGroups|questions/.test(printed));
console.log('V2 final/floor-only/abstained, optional prompts and count-only boundary passed.');
