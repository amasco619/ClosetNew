import {
  COMMUNITY_TEXTILE_BANDS, KEY_VOCABULARY, RULES, TEXTILE_BANDS,
} from './rules';
import type {
  Condition, FactPath, FailureGroup, ItemFacts, LookFacts, RuleHit, StylingResult,
} from './types';

type Answer = { value: boolean | undefined; missing: string[]; unassessed?: string[] };
const yes = (value: boolean): Answer => ({ value, missing: [] });
const unique = <T,>(values: readonly T[]): T[] => [...new Set(values)];

function fact(input: LookFacts, path: FactPath, item?: ItemFacts): unknown {
  if (path.startsWith('item.')) return item?.[path.slice(5) as keyof ItemFacts];
  if (path.startsWith('brief.')) return input.brief[path.slice(6) as keyof LookFacts['brief']];
  return input[path as 'traditionalWear' | 'printDominance'];
}

function flagPath(path: FactPath, item?: ItemFacts): string {
  return path.startsWith('item.') ? `items.${item?.id ?? '?'}.${path.slice(5)}` : path;
}

/** Three-valued logic: a known false conjunct cannot become a failure from unknown facts. */
function combine(answers: Answer[], every: boolean): Answer {
  const decisive = every ? false : true;
  if (answers.some(answer => answer.value === decisive)) return yes(decisive);
  const missing = unique(answers.flatMap(answer => answer.missing));
  return answers.some(answer => answer.value === undefined)
    ? { value: undefined, missing, unassessed: unique(answers.flatMap(a => a.unassessed ?? [])) }
    : yes(every);
}

function evaluate(condition: Condition, input: LookFacts, item?: ItemFacts): Answer {
  if ('all' in condition) return combine(condition.all.map(c => evaluate(c, input, item)), true);
  if ('any' in condition) return combine(condition.any.map(c => evaluate(c, input, item)), false);
  if ('not' in condition) {
    const answer = evaluate(condition.not, input, item);
    return { ...answer, value: answer.value === undefined ? undefined : !answer.value };
  }
  if ('some' in condition) {
    return combine(input.items.map(i => evaluate(condition.some, input, i)), false);
  }
  const value = fact(input, condition.path, item);
  if (condition.op === 'present') return yes(value != null);
  const other = 'ref' in condition ? fact(input, condition.ref, item) : condition.value;
  // This brief field is an optional override, not a required announced palette.
  if (condition.op === 'familyOverride') {
    return yes(value != null && Array.isArray(other) && other.includes(value));
  }
  if (condition.op === 'includes' && condition.path === 'brief.statedCoverage' && value == null) {
    return yes(false); // Optional personal rule: no answer imposes no requirement.
  }
  const missing = [
    ...(value == null ? [flagPath(condition.path, item)] : []),
    ...(other == null && 'ref' in condition ? [flagPath(condition.ref, item)] : []),
  ];
  if (missing.length) return { value: undefined, missing };
  switch (condition.op) {
    case 'eq':
    case 'eqRef': return yes(value === other);
    case 'in':
    case 'inRef': return yes(Array.isArray(other) && other.includes(value));
    case 'includes': return yes(Array.isArray(value) && value.includes(other));
    case 'gt': return yes(typeof value === 'number' && typeof other === 'number' && value > other);
    case 'excludesPoint': return yes(Array.isArray(value) && typeof other === 'number'
      && (value[0] > other || value[1] < other));
    case 'belowBand':
    case 'aboveBand': {
      let band = TEXTILE_BANDS[String(value)];
      const communityBand = COMMUNITY_TEXTILE_BANDS[String(value)];
      if (communityBand) {
        if (input.brief.community == null) return { value: undefined, missing: ['brief.community'] };
        if (input.brief.community !== communityBand.community) {
          return { value: undefined, missing: [], unassessed: [flagPath(condition.path, item)] };
        }
        band = communityBand.band;
      }
      if (!band) return { value: undefined, missing: [], unassessed: [flagPath(condition.path, item)] };
      const target = input.brief.formalityBand;
      if (!target || target[0] > target[1] || target.some(n => !Number.isFinite(n))) {
        return { value: undefined, missing: [], unassessed: ['brief.formalityBand'] };
      }
      return yes(condition.op === 'belowBand' ? band[1] < target[0] : band[0] > target[1]);
    }
  }
}

const ITEM_FIELDS: readonly (keyof ItemFacts)[] = [
  'id', 'key', 'kind', 'colour', 'textileIdentity', 'quality', 'footwearType',
  'shoulderCoverage', 'hem', 'headwearHeight', 'headwearShape', 'coralStrands',
  'backless', 'strapless', 'sleeveLength', 'modest', 'finish',
];
const BRIEF_FIELDS: readonly (keyof LookFacts['brief'])[] = [
  'occasion', 'role', 'whoseEvent', 'community', 'denomination', 'asoEbiBought',
  'asoEbiColour', 'asoEbiTextile', 'brideColours', 'familyTextiles', 'timeOfDay',
  'formalityBand', 'titledWoman', 'statedCoverage', 'familyColours',
];

export function evaluateNigerianStylingV2(
  input: LookFacts, options: { mode?: 'styling' | 'accuracy' } = {},
): StylingResult {
  const missingFacts: Record<string, boolean> = {};
  for (const field of BRIEF_FIELDS) missingFacts[`brief.${field}`] = input.brief[field] == null;
  for (const field of [
    'traditionalWear', 'printDominance', 'wornCover',
    'armsCovered', 'shouldersCovered', 'kneesCovered', 'headCovered',
  ] as const) {
    missingFacts[field] = input[field] == null;
  }
  for (const item of input.items) {
    for (const field of ITEM_FIELDS) missingFacts[`items.${item.id}.${field}`] = item[field] == null;
  }

  const hits: RuleHit[] = [];
  const questions: string[] = [];
  missingFacts['v1.decision.status'] = input.v1 == null || input.v1.decision.status === 'unknown';
  missingFacts['v1.decision.headCoveringSatisfied'] = input.v1 == null;
  const gapNotes = [...(input.v1?.gapNotes ?? [
    'V1 structure is unknown: confirmed set membership, relationships and aso-ebi marking were not supplied.',
  ])];
  const advisoryNotes: string[] = [];
  const failureGroups: FailureGroup[] = [];
  const unassessedFacts: string[] = [];
  const unresolvedReasons: string[] = [];
  const uncheckedRules: StylingResult['uncheckedRules'] = [];
  const excludedRuleIds: string[] = [];
  const addUnchecked = (id: string, facts: readonly string[]) => {
    for (const missingFact of unique(facts.length ? facts : ['rule premises'])) {
      if (!uncheckedRules.some(entry => entry.id === id && entry.missingFact === missingFact)) {
        uncheckedRules.push({ id, missingFact });
      }
    }
  };
  for (const rule of RULES) {
    if (options.mode === 'accuracy' && rule.provenance === 'fitted') {
      excludedRuleIds.push(rule.id);
      continue;
    }
    const scope = evaluate(rule.appliesWhen, input);
    if (scope.value === false) continue;
    if (rule.communityTag && input.brief.community != null
      && input.brief.community !== rule.communityTag) continue;
    const missingCommunity = rule.communityTag != null && input.brief.community == null;
    const violation = rule.violation ? evaluate(rule.violation, input) : yes(true);
    if (scope.value === undefined || violation.value === undefined || missingCommunity) {
      const paths = unique([
        ...scope.missing, ...violation.missing, ...(missingCommunity ? ['brief.community'] : []),
      ]);
      for (const path of paths) missingFacts[path] = true;
      const unassessed = unique([...(scope.unassessed ?? []), ...(violation.unassessed ?? [])]);
      unassessedFacts.push(...unassessed);
      questions.push(`Please confirm ${[...paths, ...unassessed].join(', ')}. ${rule.reasonText}`);
      addUnchecked(rule.id, [...paths, ...unassessed]);
      if (rule.answerRequired && (scope.value === true
        || (rule.id === 'H05denom' && input.brief.occasion === 'church'))) {
        unresolvedReasons.push(rule.id);
      }
      continue;
    }
    if (violation.value === false) continue;
    hits.push({
      ruleId: rule.id, effect: rule.effect, failureGroup: rule.failureGroup, reason: rule.reasonText,
    });
    if (rule.effect === 'failure' && rule.failureGroup) failureGroups.push(rule.failureGroup);
    if (rule.effect === 'question') {
      questions.push(rule.reasonText);
      addUnchecked(rule.id, ['answer']);
      if (rule.answerRequired) unresolvedReasons.push(rule.id);
    }
    if (rule.effect === 'advisory') advisoryNotes.push(rule.reasonText);
  }

  const keyItems = input.items.filter(item => item.key);
  const unknownVocabulary = input.items.some(item => item.key == null)
    || keyItems.length === 0 || keyItems.some(item =>
    !(KEY_VOCABULARY as readonly string[]).includes(item.kind ?? ''),
  );
  if (unknownVocabulary) gapNotes.push('A key piece is outside this version’s vocabulary.');
  if (input.v1?.decision.status === 'rejected') {
    gapNotes.push(input.v1.decision.reason ?? 'V1 could not confirm the look’s structure.');
  }
  if (input.v1?.decision.headCoveringSatisfied === false) {
    gapNotes.push('The V1 head-covering constraint is not satisfied.');
  }
  if (unknownVocabulary) unresolvedReasons.push('vocabulary');
  if (input.v1 == null || input.v1.decision.status === 'unknown'
    || input.v1.decision.status === 'rejected') unresolvedReasons.push('v1');
  const groups = unique(failureGroups);
  const unresolved = unique(unresolvedReasons).length > 0;
  const status = groups.length >= 2 || !unresolved
    ? 'final' : groups.length === 1 ? 'floor-only' : 'abstained';
  const verdict = groups.length >= 2 ? 'Rethink'
    : groups.length === 1 && !unresolved ? 'Almost'
      : groups.length === 1 || unresolved ? 'Not judged' : 'Works';
  const judged = status === 'final';
  return {
    version: 2, verdict, judged, status,
    floor: status === 'floor-only' ? 'Almost' : null,
    unresolvedReasons: unique(unresolvedReasons), uncheckedRules,
    worksWithUnchecked: verdict === 'Works' && uncheckedRules.length > 0,
    failureGroups: groups, hits,
    questions: unique(questions), gapNotes: unique(gapNotes), advisoryNotes: unique(advisoryNotes),
    missingFacts, unassessedFacts: unique(unassessedFacts), excludedRuleIds,
  };
}
