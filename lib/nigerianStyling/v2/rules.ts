import type { Band, Condition, FactPath, Rule } from './types';

const eq = (path: FactPath, value: string | boolean | number): Condition => ({ path, op: 'eq', value });
const inside = (path: FactPath, value: readonly string[]): Condition => ({ path, op: 'in', value });
const all = (...conditions: Condition[]): Condition => ({ all: conditions });
const any = (...conditions: Condition[]): Condition => ({ any: conditions });
const some = (condition: Condition): Condition => ({ some: condition });
const kind = (...values: string[]): Condition => some(inside('item.kind', values));
const occasion = (...values: string[]): Condition => inside('brief.occasion', values);
const key = eq('item.key', true);
const traditional = eq('traditionalWear', true);

export const STYLE_HEADWEAR = ['gele', 'ichafu'] as const;
export const COVERING_ITEMS = [
  'hijab', 'scarf', 'turban', 'gyale', 'kallabi', 'mayafi', 'headwrap', 'head-scarf',
] as const;
/** Unknown/men's/held vocabulary is not silently mapped to a supported garment. */
export const KEY_VOCABULARY = [
  'iro', 'buba', 'wrapper', 'ankara-top', 'ankara-skirt', 'top', 'skirt', 'trousers',
  'dress', 'blazer', 'jeans', 'layer', 'abaya', 'kaftan', 'zani', 'bubu',
  ...STYLE_HEADWEAR, ...COVERING_ITEMS,
] as const;

/** These are supplied reviewer bands, not scores or inferred quality grades. */
export const TEXTILE_BANDS: Readonly<Record<string, Band>> = {
  'indian-george': [9, 10], 'lace-beaded': [8, 10], 'lace-french': [8, 10],
  velvet: [8, 9], 'lace-cord': [7, 9], akwete: [7, 9], hollandais: [6, 8],
  brocade: [6, 8], 'lace-swiss-voile': [6, 7], 'premium-ankara': [4, 7], adire: [3, 6],
};
export const COMMUNITY_TEXTILE_BANDS: Readonly<Record<string, {
  community: Rule['communityTag']; band: Band;
}>> = { 'aso-oke': { community: 'yoruba', band: [9, 10] } };

function rule(
  id: string, description: string, strength: Rule['strength'], type: Rule['type'],
  appliesWhen: Condition, effect: Rule['effect'], reasonText: string,
  violation?: Condition, failureGroup?: Rule['failureGroup'], communityTag?: Rule['communityTag'],
): Rule {
  return {
    id, version: 2, description, strength, type, appliesWhen, effect, reasonText,
    violation, failureGroup, communityTag, sourceReviewers: ['R1', 'R2', 'R3'],
  };
}

export const RULES: readonly Rule[] = [
  rule('H01', 'White-wedding guest colours', 'strong', 'hardFilter',
    all(occasion('whiteWedding'), eq('brief.role', 'guest')), 'failure',
    'Keep white, ivory and cream for the bride.',
    some(all(key, inside('item.colour', ['white', 'ivory', 'cream']))), 'weddingIdentity'),
  rule('H02a', 'Traditional-wedding bride colours', 'strong', 'hardFilter',
    all(occasion('traditionalWedding'), eq('brief.role', 'guest')), 'failure',
    'Choose a colour outside the bride’s supplied colours.',
    some(all(key, { path: 'item.colour', op: 'inRef', ref: 'brief.brideColours' })), 'weddingIdentity'),
  rule('H02b', 'Traditional-wedding family fabrics', 'strong', 'hardFilter',
    all(occasion('traditionalWedding'), eq('brief.role', 'guest')), 'failure',
    'Choose a textile outside the families’ supplied fabrics.',
    some(all(key, { path: 'item.textileIdentity', op: 'inRef', ref: 'brief.familyTextiles' })), 'weddingIdentity'),
  rule('H03a', 'Bought aso-ebi colour', 'strong', 'hardFilter',
    eq('brief.asoEbiBought', true), 'failure', 'Use the exact supplied aso-ebi colour.',
    some(all(key, { not: { path: 'item.colour', op: 'eqRef', ref: 'brief.asoEbiColour' } })), 'asoEbi'),
  rule('H03b', 'Bought aso-ebi textile', 'strong', 'hardFilter',
    eq('brief.asoEbiBought', true), 'failure', 'Use the exact supplied aso-ebi textile.',
    some(all(key, { not: { path: 'item.textileIdentity', op: 'eqRef', ref: 'brief.asoEbiTextile' } })), 'asoEbi'),
  rule('H04', 'Red at funerals', 'strong', 'hardFilter',
    occasion('funeral'), 'failure', 'Choose a colour other than red for this funeral.',
    some(eq('item.colour', 'red')), 'funeralColour'),
  rule('H04q', 'Undefined festive-bright colours', 'likely', 'askFirst',
    occasion('funeral'), 'question', 'Which colours does this funeral ask guests to avoid?'),
  rule('H05', 'Church coverage thresholds await review', 'strong', 'askFirst',
    occasion('church'), 'question', 'What shoulder coverage and hem does this church require?'),
  rule('H06', 'Traditional footwear', 'strong', 'hardFilter',
    traditional, 'failure', 'Choose footwear other than trainers, flip-flops or sports sandals.',
    some(all(eq('item.kind', 'shoes'), inside('item.footwearType', ['trainer', 'flipFlop', 'sportsSandal']))), 'footwear'),
  rule('H07', 'Style headwear exclusions, merged with C08', 'strong', 'hardFilter',
    kind(...STYLE_HEADWEAR), 'failure', 'Keep gele and ichafu apart from blazers, jeans and Casual looks.',
    any(kind('blazer', 'jeans'), occasion('casual')), 'styleHeadwear'),
  rule('S01', 'Traditional bag suggestion', 'likely', 'explainOnly',
    all(traditional, { not: kind('clutch', 'box-bag') }), 'advisory',
    'A clutch or box bag is an option for this traditional look.'),
  rule('S02', 'Explicit poor-quality polyester', 'strong', 'hardFilter',
    some(eq('item.quality', 'poorPolyester')), 'failure',
    'Consider an alternative to the explicitly poor-quality polyester piece.',
    undefined, 'quality'),
  rule('S03', 'Print dominance', 'likely', 'explainOnly',
    eq('printDominance', 'competing'), 'advisory', 'Let one print lead the look.'),
  rule('S04', 'Textile outside supplied event band', 'strong', 'hardFilter',
    some(key), 'failure', 'Choose a textile whose band overlaps the supplied event band.',
    some(all(key, { path: 'item.textileIdentity', op: 'outsideBand', ref: 'brief.formalityBand' })), 'register'),
  rule('S05', 'Set re-pairing away from the original event', 'likely', 'explainOnly',
    occasion('work', 'casual'), 'advisory',
    'Set pieces may be worn separately when V1 confirms this context allows it.'),
  rule('S06', 'Ankara at an evening owambe', 'likely', 'hardFilter',
    all(occasion('owambe'), eq('brief.timeOfDay', 'evening')), 'failure',
    'The supplied guidance places Ankara below an evening owambe.',
    some(all(key, inside('item.textileIdentity', ['ankara', 'premium-ankara']))), 'register'),
  rule('C01', 'Yoruba iro and buba gele', 'community', 'askFirst',
    all(traditional, kind('iro'), kind('buba')), 'question',
    'Would you like a tall gele with the iro and buba?',
    { not: some(all(eq('item.kind', 'gele'), eq('item.headwearHeight', 'tall'))) }, undefined, 'yoruba'),
  rule('C02', 'Hausa covering guidance', 'community', 'explainOnly',
    all(traditional, kind('abaya', 'kaftan', 'zani')), 'advisory',
    'Gyale, hijab or kallabi are options, subject to your V1 covering preference.',
    undefined, undefined, 'hausa'),
  rule('C03', 'Igbo George textile', 'community', 'explainOnly',
    all(traditional, some(inside('item.textileIdentity', ['george', 'indian-george']))), 'advisory',
    'George is included in the supplied Igbo guidance.', undefined, undefined, 'igbo'),
  rule('C04', 'Igbo ichafu shape', 'community', 'askFirst',
    all(traditional, kind('ichafu')), 'question', 'Would you like the ichafu lower and wider?',
    some(all(eq('item.kind', 'ichafu'), { not: eq('item.headwearShape', 'lowerWider') })), undefined, 'igbo'),
  rule('C05', 'Igbo guest coral', 'community', 'hardFilter',
    all(traditional, eq('brief.role', 'guest')), 'failure', 'Keep guest coral to one strand.',
    some(all(eq('item.kind', 'coral'), { path: 'item.coralStrands', op: 'gt', value: 1 })),
    'roleAdornment', 'igbo'),
  rule('C06', 'Igbo ivory odu title', 'community', 'hardFilter',
    all(traditional, kind('ivory-odu')), 'failure', 'Ivory odu requires a confirmed title.',
    eq('brief.titledWoman', false), 'roleAdornment', 'igbo'),
  rule('C07', 'Naming-ceremony mother band', 'community', 'askFirst',
    all(occasion('naming'), eq('brief.role', 'mother')), 'question',
    'The supplied naming-ceremony mother band is 8; can you confirm the event band?',
    { path: 'brief.formalityBand', op: 'excludesPoint', value: 8 }),
  rule('C09', 'Smaller style wrap with a dress', 'community', 'explainOnly',
    all(occasion('traditionalEvent', 'traditionalWedding', 'owambe'), kind('dress'),
      kind(...STYLE_HEADWEAR), { not: kind('blazer', 'jeans') }), 'advisory',
    'A smaller style wrap is an option with a dress at a traditional-leaning event.'),
];
