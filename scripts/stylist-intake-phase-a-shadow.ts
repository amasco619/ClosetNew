#!/usr/bin/env npx tsx
/**
 * Phase A diagnostic only. This harness does not affect app recommendations.
 *
 * Run the built-in synthetic demonstration:
 *   npx tsx scripts/stylist-intake-phase-a-shadow.ts
 *
 * Run one supplied wardrobe/profile:
 *   npx tsx scripts/stylist-intake-phase-a-shadow.ts --input wardrobe.json --scenario work
 *
 * Input JSON shape:
 *   { "wardrobe": WardrobeItem[], "relationships": GarmentGroup[],
 *     "profile": UserProfile, "preferences": ShadowPreferences }
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  GarmentGroup, ItemCategory, OccasionTag, OutfitSet, UserProfile, WardrobeItem,
} from '../constants/types';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { generateOutfitPool } from '../constants/outfitRotation';
import { buildStylingContextCandidates, asTraditionalOutfits } from '../lib/traditionalStyling';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';

type PreferenceValue = 'love' | 'fine' | 'avoid';
type PrintPreference = 'bold' | 'small' | 'solids';
type ShadowItem = WardrobeItem & {
  /** Synthetic/manual evidence for the experiment; not a current classifier field. */
  shadowSignals?: {
    presenceWords?: string[];
    textileIdentity?: string[];
    silhouetteTerms?: string[];
  };
};

export interface ShadowPreferences {
  neverWearItemIds?: string[];
  neverWearCategories?: ItemCategory[];
  neverWearSubtypes?: string[];
  requiredItemIds?: string[];
  requiredColorFamilies?: string[];
  favouriteItemIds?: string[];
  presenceWords?: string[];
  fabricPreferences?: Record<string, PreferenceValue>;
  silhouettePreferences?: Record<string, PreferenceValue>;
  printPreference?: PrintPreference;
}

export interface ShadowInput {
  wardrobe: ShadowItem[];
  relationships: GarmentGroup[];
  profile: UserProfile;
  preferences: ShadowPreferences;
}

export const SHADOW_WEIGHTS = {
  favouriteLook: 12,
  presenceWordPerItem: 6,
  presenceWordItemCap: 2,
  lovedFabricPerItem: 6,
  avoidedFabricPerItem: -8,
  lovedSilhouettePerItem: 6,
  avoidedSilhouettePerItem: -8,
  printMatchPerCoreItem: 5,
  printMismatchPerCoreItem: -5,
} as const;

export const SHADOW_BAND_POINTS = 15;
const FIXED_TODAY = '2026-10-27';
const SCENARIOS = ['work', 'event', 'traditional'] as const;
type ShadowScenario = typeof SCENARIOS[number];

const neutralProfile = (styleGoalPrimary: UserProfile['styleGoalPrimary'] = null): UserProfile => ({
  name: 'Synthetic shadow profile',
  bodyType: null, eyeColor: null, skinTone: null, undertone: null,
  styleGoalPrimary, styleGoalSecondary: null,
  lifestyleWork: 3, lifestyleCasual: 3, lifestyleEvents: 3,
  lifestyleActive: 0, lifestyleBrunch: 0,
  constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
  onboardingComplete: true, weatherEnabled: false, tempUnit: 'C',
});

function item(
  id: string,
  category: WardrobeItem['category'],
  subType: string,
  colorFamily: string,
  formalityLevel: number,
  extra: Partial<ShadowItem> = {},
): ShadowItem {
  return {
    id, category, subType, colorFamily, formalityLevel,
    photoUri: `synthetic://${id}`, description: `Synthetic ${id}`,
    createdAt: '2026-10-27T12:00:00.000Z',
    seasonTags: ['all-season'],
    occasionTags: ['work', 'event', 'traditional-event'],
    confirmedFields: ['category', 'subType', 'formalityLevel'],
    ...extra,
  };
}

export function buildDemoInput(): ShadowInput {
  const wardrobe: ShadowItem[] = [
    item('iro', 'bottom', 'iro', 'navy', 7, {
      shadowSignals: { presenceWords: ['regal', 'elegant'], silhouetteTerms: ['iro'] },
    }),
    item('buba', 'top', 'buba', 'cream', 7, {
      fabric: 'lace', pattern: 'solid',
      shadowSignals: { presenceWords: ['regal', 'elegant', 'romantic'], silhouetteTerms: ['buba'] },
    }),
    item('wrapper', 'bottom', 'wrapper', 'burgundy', 7, {
      shadowSignals: { presenceWords: ['regal', 'commanding'], silhouetteTerms: ['wrapper'] },
    }),
    item('gele', 'jewelry', 'gele', 'burgundy', 8, {
      shadowSignals: { presenceWords: ['regal'], textileIdentity: ['aso-oke'] },
    }),
    item('aso-oke-buba', 'top', 'buba', 'green', 8, {
      shadowSignals: {
        presenceWords: ['regal', 'commanding'], textileIdentity: ['aso-oke'],
        silhouetteTerms: ['buba'],
      },
    }),
    item('aso-oke-wrapper', 'bottom', 'wrapper', 'green', 8, {
      shadowSignals: {
        presenceWords: ['regal', 'commanding'], textileIdentity: ['aso-oke'],
        silhouetteTerms: ['wrapper'],
      },
    }),
    item('ankara-top', 'top', 'buba', 'red', 6, {
      pattern: 'wax-print', patternScale: 'medium', fabric: 'cotton',
      shadowSignals: { presenceWords: ['bold', 'modern'], silhouetteTerms: ['buba'] },
    }),
    item('ankara-skirt', 'bottom', 'midi-skirt', 'red', 5, {
      pattern: 'wax-print', patternScale: 'small', fabric: 'cotton',
      shadowSignals: { presenceWords: ['bold', 'modern'], silhouetteTerms: ['midi-skirt'] },
    }),
    item('jeans', 'bottom', 'jeans', 'blue', 3, {
      fabric: 'denim',
      shadowSignals: { presenceWords: ['modern', 'understated'], silhouetteTerms: ['jeans'] },
    }),
    item('blazer', 'outerwear', 'blazer', 'navy', 6, {
      fabric: 'linen', fit: 'tailored',
      shadowSignals: { presenceWords: ['commanding', 'elegant', 'understated'], silhouetteTerms: ['tailored'] },
    }),
    item('heels', 'shoes', 'heels', 'black', 7, { fabric: 'leather' }),
    item('loafers', 'shoes', 'loafers', 'brown', 5, { fabric: 'leather' }),
    item('clutch', 'bag', 'clutch', 'black', 7, { fabric: 'leather' }),
  ];
  const relationships: GarmentGroup[] = [{
    id: 'synthetic-aso-oke-set',
    userId: 'synthetic-owner',
    relationshipType: 'coordinated_set',
    confirmationStatus: 'user_confirmed',
    sharedAttributes: {},
    members: ['aso-oke-buba', 'aso-oke-wrapper'].map(garmentId => ({
      userId: 'synthetic-owner',
      groupId: 'synthetic-aso-oke-set',
      garmentId,
      createdAt: '2026-10-27T12:00:00.000Z',
    })),
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
  }];
  return { wardrobe, relationships, profile: neutralProfile(), preferences: {} };
}

const DEMO_PERSONAS: Array<{
  name: string;
  styleGoal: UserProfile['styleGoalPrimary'];
  preferences: ShadowPreferences;
}> = [
  {
    name: 'Understated',
    styleGoal: 'minimal',
    preferences: {
      presenceWords: ['understated'],
      fabricPreferences: { linen: 'love', denim: 'fine' },
      silhouettePreferences: { tailored: 'love', jeans: 'fine' },
      printPreference: 'solids',
    },
  },
  {
    name: 'Bold print',
    styleGoal: 'bold',
    preferences: {
      presenceWords: ['bold', 'modern'],
      fabricPreferences: { cotton: 'love' },
      favouriteItemIds: ['ankara-top', 'ankara-skirt'],
      printPreference: 'bold',
    },
  },
  {
    name: 'Elegant',
    styleGoal: 'elevated',
    preferences: {
      presenceWords: ['elegant'],
      fabricPreferences: { lace: 'love', linen: 'fine' },
      silhouettePreferences: { tailored: 'love', 'midi-skirt': 'love' },
    },
  },
  {
    name: 'Romantic',
    styleGoal: 'romantic',
    preferences: {
      presenceWords: ['romantic', 'elegant'],
      fabricPreferences: { lace: 'love' },
      silhouettePreferences: { buba: 'love', 'midi-skirt': 'love' },
      printPreference: 'small',
    },
  },
  {
    name: 'Regal traditional',
    styleGoal: 'classic',
    preferences: {
      presenceWords: ['regal', 'commanding'],
      fabricPreferences: { 'aso-oke': 'love' },
      silhouettePreferences: { buba: 'love', wrapper: 'love' },
      favouriteItemIds: ['aso-oke-buba', 'aso-oke-wrapper'],
    },
  },
];

function fingerprint(outfit: OutfitSet): string {
  return outfit.components.map(component => component.matchedItemId)
    .filter((id): id is string => Boolean(id)).sort().join('|');
}

function outfitIds(outfit: OutfitSet): string[] {
  return outfit.components.map(component => component.matchedItemId)
    .filter((id): id is string => Boolean(id)).sort();
}

function getBasePool(input: ShadowInput, scenario: ShadowScenario): {
  sourceScenario: string;
  pool: OutfitSet[];
  notice?: string;
} {
  if (scenario !== 'traditional') {
    const pool = generateOutfitPool(
      input.wardrobe, input.profile, null, [], FIXED_TODAY, [], EMPTY_AFFINITY, null, false,
    );
    return { sourceScenario: scenario, pool: pool[scenario], };
  }
  const result = buildStylingContextCandidates(
    projectWardrobeForStyling(input.wardrobe, input.relationships),
    'traditional',
    input.profile, null, [], FIXED_TODAY, [], EMPTY_AFFINITY, null, false,
  );
  const source = result.sourceScenario ?? 'wedding';
  return {
    sourceScenario: source,
    pool: asTraditionalOutfits(result.pool[source]),
    notice: result.notice,
  };
}

function gateOutfit(
  outfit: OutfitSet,
  wardrobeById: Map<string, ShadowItem>,
  preferences: ShadowPreferences,
): string | null {
  const ids = outfitIds(outfit);
  const selected = ids.map(id => wardrobeById.get(id)).filter((value): value is ShadowItem => Boolean(value));
  const neverIds = new Set(preferences.neverWearItemIds ?? []);
  const neverCategories = new Set(preferences.neverWearCategories ?? []);
  const neverSubtypes = new Set(preferences.neverWearSubtypes ?? []);
  if (ids.some(id => neverIds.has(id))) return 'explicit never-wear item';
  if (selected.some(item => neverCategories.has(item.category))) return 'explicit never-wear category';
  if (selected.some(item => neverSubtypes.has(item.subType))) return 'explicit never-wear subtype';
  if ((preferences.requiredItemIds ?? []).some(id => !ids.includes(id))) return 'missing explicitly required item';
  if (
    preferences.requiredColorFamilies?.length &&
    !selected.some(item => preferences.requiredColorFamilies?.includes(item.colorFamily))
  ) return 'explicit event colour is absent';
  return null;
}

function itemTasteScore(item: ShadowItem, preferences: ShadowPreferences): number {
  let score = 0;
  const words = new Set([
    ...(item.shadowSignals?.presenceWords ?? []),
    ...(item.mood ?? []),
  ]);
  if (preferences.presenceWords?.some(word => words.has(word))) {
    score += SHADOW_WEIGHTS.presenceWordPerItem;
  }

  const fabrics = [item.fabric, ...(item.shadowSignals?.textileIdentity ?? [])].filter(
    (value): value is string => Boolean(value),
  );
  for (const fabric of fabrics) {
    const preference = preferences.fabricPreferences?.[fabric];
    if (preference === 'love') score += SHADOW_WEIGHTS.lovedFabricPerItem;
    else if (preference === 'avoid') score += SHADOW_WEIGHTS.avoidedFabricPerItem;
  }

  const silhouettes = new Set([
    item.subType, item.fit ?? '', ...(item.shadowSignals?.silhouetteTerms ?? []),
  ]);
  for (const [silhouette, preference] of Object.entries(preferences.silhouettePreferences ?? {})) {
    if (!silhouettes.has(silhouette)) continue;
    if (preference === 'love') score += SHADOW_WEIGHTS.lovedSilhouettePerItem;
    else if (preference === 'avoid') score += SHADOW_WEIGHTS.avoidedSilhouettePerItem;
  }
  return score;
}

function printTasteScore(
  outfit: OutfitSet,
  wardrobeById: Map<string, ShadowItem>,
  preference: PrintPreference | undefined,
): number {
  if (!preference) return 0;
  const core = outfitIds(outfit).map(id => wardrobeById.get(id))
    .filter((value): value is ShadowItem =>
      Boolean(value && ['top', 'bottom', 'dress', 'outerwear'].includes(value.category)),
    );
  if (!core.length) return 0;
  const points = core.map(item => {
    const patterned = Boolean(item.pattern && item.pattern !== 'solid');
    const match = preference === 'solids'
      ? !patterned
      : preference === 'small'
        ? patterned && item.patternScale === 'small'
        : patterned && (item.patternScale === 'large' || item.pattern === 'wax-print');
    return match ? SHADOW_WEIGHTS.printMatchPerCoreItem : SHADOW_WEIGHTS.printMismatchPerCoreItem;
  });
  return points.reduce((sum, value) => sum + value, 0) / points.length;
}

function tasteScore(
  outfit: OutfitSet,
  wardrobeById: Map<string, ShadowItem>,
  preferences: ShadowPreferences,
): number {
  const ids = outfitIds(outfit);
  let score = (preferences.favouriteItemIds ?? []).some(id => ids.includes(id))
    ? SHADOW_WEIGHTS.favouriteLook : 0;
  let presenceCount = 0;
  for (const id of ids) {
    const item = wardrobeById.get(id);
    if (!item) continue;
    const itemScore = itemTasteScore(item, preferences);
    score += itemScore;
    if (
      preferences.presenceWords?.some(word =>
        (item.shadowSignals?.presenceWords ?? []).includes(word) || (item.mood ?? []).includes(word as never),
      )
    ) presenceCount++;
  }
  if (presenceCount > SHADOW_WEIGHTS.presenceWordItemCap) {
    score -= (presenceCount - SHADOW_WEIGHTS.presenceWordItemCap) * SHADOW_WEIGHTS.presenceWordPerItem;
  }
  return score + printTasteScore(outfit, wardrobeById, preferences.printPreference);
}

export function rerankWithinV37Band(
  candidates: readonly OutfitSet[],
  wardrobe: readonly ShadowItem[],
  preferences: ShadowPreferences,
) {
  const wardrobeById = new Map(wardrobe.map(item => [item.id, item]));
  const base = [...candidates].sort((a, b) =>
    (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0) || fingerprint(a).localeCompare(fingerprint(b)),
  );
  const rejected = base.flatMap(outfit => {
    const reason = gateOutfit(outfit, wardrobeById, preferences);
    return reason ? [{ fingerprint: fingerprint(outfit), reason }] : [];
  });
  const appropriate = base.filter(outfit => !gateOutfit(outfit, wardrobeById, preferences));
  const bestScore = appropriate[0]?.confidenceScore ?? null;
  const bandFloor = bestScore === null ? null : bestScore - SHADOW_BAND_POINTS;
  const band = bandFloor === null
    ? []
    : appropriate.filter(outfit => (outfit.confidenceScore ?? 0) >= bandFloor);
  const eligible = band
    .map(outfit => ({ outfit, taste: tasteScore(outfit, wardrobeById, preferences) }))
    .sort((a, b) =>
      b.taste - a.taste ||
      (b.outfit.confidenceScore ?? 0) - (a.outfit.confidenceScore ?? 0) ||
      fingerprint(a.outfit).localeCompare(fingerprint(b.outfit)),
    )
    .map(row => row.outfit);
  const baselineTopFive = base.slice(0, 5);
  const shadowTopFive = eligible.slice(0, 5);
  const newRanks = new Map(shadowTopFive.map((outfit, index) => [fingerprint(outfit), index + 1]));
  const movement = baselineTopFive.map((outfit, index) => {
    const oldRank = index + 1;
    const newRank = newRanks.get(fingerprint(outfit));
    return {
      fingerprint: fingerprint(outfit),
      from: oldRank,
      to: newRank ?? null,
      displacement: newRank === undefined ? null : newRank - oldRank,
    };
  });
  return {
    bestV37Score: bestScore,
    bandFloor,
    candidatesInV37Band: band.length,
    candidatesAfterExplicitGate: appropriate.length,
    gatedOut: rejected,
    baselineTopFive: baselineTopFive.map((outfit, index) => ({
      rank: index + 1, fingerprint: fingerprint(outfit),
      items: outfitIds(outfit), v37Score: outfit.confidenceScore ?? 0,
    })),
    shadowTopFive: shadowTopFive.map((outfit, index) => ({
      rank: index + 1, fingerprint: fingerprint(outfit),
      items: outfitIds(outfit), v37Score: outfit.confidenceScore ?? 0,
      tasteScore: tasteScore(outfit, wardrobeById, preferences),
    })),
    movement,
  };
}

export function runScenario(input: ShadowInput, scenario: ShadowScenario) {
  const { sourceScenario, pool, notice } = getBasePool(input, scenario);
  return {
    requestedScenario: scenario,
    sourceScenario,
    candidateCount: pool.length,
    notice,
    ...rerankWithinV37Band(pool, input.wardrobe, input.preferences),
  };
}

export function runDemo() {
  const base = buildDemoInput();
  const baselinePools = Object.fromEntries(SCENARIOS.map(scenario => {
    const result = getBasePool(base, scenario);
    return [scenario, {
      sourceScenario: result.sourceScenario,
      candidateCount: result.pool.length,
      notice: result.notice,
      candidates: result.pool.map((outfit, index) => ({
        rank: index + 1,
        fingerprint: fingerprint(outfit),
        items: outfitIds(outfit),
        v37Score: outfit.confidenceScore ?? 0,
      })),
    }];
  }));
  const personaRuns = DEMO_PERSONAS.map(persona => {
    const input = {
      ...base,
      profile: neutralProfile(persona.styleGoal),
      preferences: persona.preferences,
    };
    return {
      persona: persona.name,
      styleGoal: persona.styleGoal,
      scenarios: Object.fromEntries(SCENARIOS.map(scenario => [
        scenario, runScenario(input, scenario),
      ])),
    };
  });
  return {
    mode: 'synthetic-shadow-only',
    fixedToday: FIXED_TODAY,
    weights: SHADOW_WEIGHTS,
    bandPoints: SHADOW_BAND_POINTS,
    wardrobeCount: base.wardrobe.length,
    relationshipCount: base.relationships.length,
    baselinePools,
    personaRuns,
  };
}

function parseScenario(value: string): ShadowScenario {
  if (SCENARIOS.includes(value as ShadowScenario)) return value as ShadowScenario;
  throw new Error(`Scenario must be one of: ${SCENARIOS.join(', ')}`);
}

function main() {
  const args = process.argv.slice(2);
  const inputAt = args.indexOf('--input');
  if (inputAt === -1) {
    console.log(JSON.stringify(runDemo(), null, 2));
    return;
  }
  const inputPath = args[inputAt + 1];
  if (!inputPath) throw new Error('--input requires a JSON file path');
  const scenarioAt = args.indexOf('--scenario');
  if (scenarioAt === -1 || !args[scenarioAt + 1]) {
    throw new Error('--input mode requires --scenario work|event|traditional');
  }
  const input = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as ShadowInput;
  if (!Array.isArray(input.wardrobe) || !Array.isArray(input.relationships) || !input.profile || !input.preferences) {
    throw new Error('Input must include wardrobe, relationships, profile and preferences');
  }
  console.log(JSON.stringify(runScenario(input, parseScenario(args[scenarioAt + 1])), null, 2));
}

if (/(?:^|[/\\])scripts[/\\]stylist-intake-phase-a-shadow\.ts$/.test(process.argv[1] ?? '')) main();
