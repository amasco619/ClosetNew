/**
 * PHASE 3.2 — AuraCloset Recommendation Quality Benchmark
 * READ-ONLY analysis: no production code is modified.
 * Runs the real engine on 54 scenarios and evaluates outputs with an external rubric.
 */

import { generateOutfitPool, INITIAL_ROTATION_STATE, SCENARIOS, applyDailyRotation } from '../constants/outfitRotation';
import { EMPTY_AFFINITY } from '../constants/affinity';
import type {
  WardrobeItem, UserProfile, OccasionTag, SeasonTag,
  OutfitSet, OutfitComponent, WearEntry, OutfitReaction,
  WeatherSnapshot,
} from '../constants/types';
import type { AffinityState } from '../constants/affinity';
import type { OutfitScoreBreakdown } from '../constants/outfitScoring';

// ─── Fixture helpers ────────────────────────────────────────────────────────

let _itemSeq = 0;
function mkId(prefix = 'item') { return `${prefix}-${++_itemSeq}`; }

function item(overrides: Partial<WardrobeItem> & { id?: string }): WardrobeItem {
  return {
    id: mkId(),
    photoUri: '',
    category: 'top',
    subType: 't-shirt',
    colorFamily: 'black',
    occasionTags: ['casual', 'work'],
    seasonTags: ['all-season'],
    formalityLevel: 3,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Test',
    bodyType: null,
    eyeColor: null,
    skinTone: null,
    undertone: null,
    styleGoalPrimary: null,
    styleGoalSecondary: null,
    lifestyleWork: 40,
    lifestyleCasual: 40,
    lifestyleEvents: 20,
    lifestyleActive: 0,
    lifestyleBrunch: 0,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
    onboardingComplete: true,
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    fetchedAt: Date.now(),
    lat: 51.5, lon: -0.1,
    currentTempC: 18, highC: 22, lowC: 14,
    precipProbability: 0.1,
    source: 'ip',
    ...overrides,
  };
}

// ─── External rubric helpers ─────────────────────────────────────────────────

interface RubricScore {
  colour: number; proportion: number; occasion: number; formality: number;
  coherence: number; texture: number; visualInterest: number; practicality: number;
  personalisation: number; quietLuxury: number; total: number;
}

interface RubricReason {
  colour: string; proportion: string; occasion: string; formality: string;
  coherence: string; texture: string; visualInterest: string; practicality: string;
  personalisation: string; quietLuxury: string;
}

const LUXURY_FABRICS = new Set(['cashmere', 'silk', 'wool', 'suede', 'leather', 'velvet', 'satin', 'tweed', 'linen']);
const STATEMENT_FABRICS = new Set(['leather', 'silk', 'velvet', 'satin', 'suede', 'cashmere']);
const CASUAL_FABRICS = new Set(['cotton', 'denim', 'jersey', 'synthetic', 'knit']);
const HEAVY_FABRICS = new Set(['wool', 'tweed', 'cashmere', 'corduroy']);
const RAIN_FRIENDLY_SUBTYPES = new Set(['trench', 'raincoat', 'jacket', 'bomber-jacket', 'parka']);

function colourHarmonyScore(items: WardrobeItem[]): { score: number; reason: string } {
  const families = items.map(i => i.colorFamily).filter(Boolean);
  const unique = new Set(families);
  const neutrals = new Set(['black', 'white', 'grey', 'cream', 'beige', 'navy', 'camel', 'ivory', 'tan', 'stone']);
  const allNeutral = families.every(f => neutrals.has(f));
  const dominated = families.filter(f => !neutrals.has(f));
  const uniqueAccents = new Set(dominated);

  if (allNeutral) {
    if (unique.size >= 3) return { score: 8, reason: `All-neutral palette with ${unique.size} tonal variations (${[...unique].join(', ')}) — sophisticated restraint` };
    if (unique.size === 2) return { score: 7, reason: `Two-tone neutral (${[...unique].join(' + ')}) — clean but low variation` };
    return { score: 5, reason: `Monochromatic neutral (${families[0]}) — risks reading flat without texture contrast` };
  }
  if (uniqueAccents.size === 1) return { score: 9, reason: `Single accent (${[...uniqueAccents][0]}) against neutral base — intentional, high-impact` };
  if (uniqueAccents.size === 2) {
    return { score: 6, reason: `Two accent colours (${[...uniqueAccents].join(' + ')}) — may compete without deliberate intent` };
  }
  if (unique.size <= 3) return { score: 7, reason: `${unique.size}-colour palette (${[...unique].join(', ')}) — manageable complexity` };
  return { score: 4, reason: `${unique.size} distinct colours — high risk of visual noise` };
}

function proportionScore(items: WardrobeItem[], prof: UserProfile): { score: number; reason: string } {
  const tops = items.filter(i => i.category === 'top');
  const bottoms = items.filter(i => i.category === 'bottom');
  const dresses = items.filter(i => i.category === 'dress');

  if (dresses.length > 0) return { score: 8, reason: 'Dress silhouette — proportion is self-contained and coherent' };

  const top = tops[0]; const bot = bottoms[0];
  if (!top || !bot) return { score: 6, reason: 'Missing core piece — proportion assessment incomplete' };

  const topFit = top.fit ?? 'regular';
  const botFit = bot.fit ?? 'regular';
  const rise = bot.rise;

  let score = 7; const reasons: string[] = [];

  // Volume balance
  if ((topFit === 'oversized' || topFit === 'loose') && (botFit === 'oversized' || botFit === 'loose')) {
    score -= 2; reasons.push('double-volume top+bottom reads shapeless');
  } else if ((topFit === 'slim' || topFit === 'tailored') && (botFit === 'slim' || botFit === 'tailored')) {
    score += 1; reasons.push('clean slim silhouette');
  } else {
    score += 1; reasons.push('balanced volume contrast');
  }

  // Rise bonus/penalty already in engine — record for rubric
  if (rise === 'high' && (topFit === 'slim' || topFit === 'tailored')) {
    score += 1; reasons.push('high-rise + fitted top defines waist cleanly');
  } else if (rise === 'high' && (topFit === 'oversized' || topFit === 'loose')) {
    score -= 1; reasons.push('high-rise + oversized top creates boxy double-volume');
  }

  // Body-type considerations
  if (prof.heightBand === 'petite') {
    if (bot.subType === 'wide-leg' && (topFit === 'oversized' || topFit === 'loose')) {
      score -= 1; reasons.push('wide-leg + oversized shortens petite frame');
    }
  }
  if (prof.bodyType === 'pear') {
    if (topFit === 'slim' || topFit === 'tailored') { score += 1; reasons.push('slim top balances pear proportions'); }
    if (bot.subType === 'pencil-skirt') { score -= 1; reasons.push('pencil skirt emphasises pear hips'); }
  }

  return { score: Math.min(10, Math.max(1, score)), reason: reasons.join('; ') || 'standard proportions' };
}

function occasionScore(items: WardrobeItem[], targetOccasion: OccasionTag): { score: number; reason: string } {
  const coreItems = items.filter(i => ['top', 'bottom', 'dress'].includes(i.category));
  if (coreItems.length === 0) return { score: 5, reason: 'No core items to evaluate' };
  const matching = coreItems.filter(i => i.occasionTags.includes(targetOccasion));
  const pct = matching.length / coreItems.length;
  if (pct === 1) return { score: 9, reason: `All core items tagged for ${targetOccasion}` };
  if (pct >= 0.5) return { score: 7, reason: `${Math.round(pct*100)}% core items suit ${targetOccasion}` };
  return { score: 4, reason: `Only ${Math.round(pct*100)}% core items tagged for ${targetOccasion} — marginal match` };
}

function formalityScore(items: WardrobeItem[], targetOccasion: OccasionTag): { score: number; reason: string } {
  const OCCASION_TARGET: Record<OccasionTag, { min: number; max: number; label: string }> = {
    work:        { min: 3, max: 6, label: 'business casual (3–6)' },
    interview:   { min: 5, max: 8, label: 'business formal (5–8)' },
    casual:      { min: 1, max: 4, label: 'relaxed (1–4)' },
    brunch:      { min: 2, max: 5, label: 'smart casual (2–5)' },
    'date-casual': { min: 3, max: 6, label: 'smart casual (3–6)' },
    'date-dressy': { min: 5, max: 8, label: 'dressy (5–8)' },
    event:       { min: 6, max: 9, label: 'formal (6–9)' },
    wedding:             { min: 6, max: 9, label: 'formal (6–9)' },
    'traditional-event': { min: 6, max: 9, label: 'formal-festive (6–9)' },
    'night-out':         { min: 5, max: 8, label: 'dressy (5–8)' },
    travel:      { min: 2, max: 5, label: 'smart casual (2–5)' },
    resort:      { min: 2, max: 6, label: 'relaxed-resort (2–6)' },
    active:      { min: 1, max: 3, label: 'athletic (1–3)' },
  };
  const core = items.filter(i => ['top', 'bottom', 'dress'].includes(i.category));
  if (!core.length) return { score: 5, reason: 'No core items' };
  const avg = core.reduce((s, i) => s + i.formalityLevel, 0) / core.length;
  const range = OCCASION_TARGET[targetOccasion] ?? { min: 3, max: 6, label: 'mid (3–6)' };
  const spread = core.map(i => i.formalityLevel);
  const spreadRange = Math.max(...spread) - Math.min(...spread);

  let score = 7;
  if (avg < range.min) { const gap = range.min - avg; score = Math.max(2, 7 - Math.round(gap * 2)); }
  else if (avg > range.max) { const gap = avg - range.max; score = Math.max(2, 7 - Math.round(gap * 2)); }
  if (spreadRange >= 3) { score -= 1; }

  return {
    score: Math.min(10, Math.max(1, score)),
    reason: `avg formality ${avg.toFixed(1)}, target ${range.label}; spread ${spreadRange} across core items`,
  };
}

function coherenceScore(items: WardrobeItem[]): { score: number; reason: string } {
  const patterns = items.map(i => i.pattern ?? 'solid').filter(p => p !== 'solid');
  const styleGoals = items.flatMap(i => i.mood ?? []);
  const formalityLevels = items.filter(i => ['top','bottom','dress'].includes(i.category)).map(i => i.formalityLevel);
  const spread = formalityLevels.length ? Math.max(...formalityLevels) - Math.min(...formalityLevels) : 0;

  let score = 7;
  const reasons: string[] = [];

  if (patterns.length >= 2) { score -= 2; reasons.push(`${patterns.length} non-solid patterns compete`); }
  else if (patterns.length === 1) { score += 1; reasons.push('single statement pattern with solid companions'); }
  else { score += 1; reasons.push('all-solid palette reads unified'); }

  if (spread >= 3) { score -= 1; reasons.push(`formality spread of ${spread} disrupts cohesion`); }

  return { score: Math.min(10, Math.max(1, score)), reason: reasons.join('; ') || 'coherent outfit' };
}

function textureScore(items: WardrobeItem[]): { score: number; reason: string } {
  const fabrics = items.map(i => i.fabric).filter(Boolean) as string[];
  if (fabrics.length === 0) return { score: 5, reason: 'No fabric data — cannot evaluate texture' };

  const statements = fabrics.filter(f => STATEMENT_FABRICS.has(f));
  const unique = new Set(fabrics);
  const allCasual = fabrics.every(f => CASUAL_FABRICS.has(f));

  if (statements.length >= 2) {
    return { score: 6, reason: `Multiple statement fabrics (${statements.join(', ')}) — may compete visually` };
  }
  if (statements.length === 1) {
    const supporting = fabrics.filter(f => !STATEMENT_FABRICS.has(f));
    return { score: 9, reason: `${statements[0]} hero fabric with grounded ${supporting.join('/')} — intentional contrast` };
  }
  if (allCasual && unique.size === 1) {
    return { score: 5, reason: `Single casual fabric (${fabrics[0]}) throughout — no texture interest` };
  }
  if (unique.size >= 2) {
    return { score: 7, reason: `${[...unique].join(' + ')} combination — mild texture variation` };
  }
  return { score: 6, reason: `Uniform ${fabrics[0]} fabric` };
}

function visualInterestScore(items: WardrobeItem[], prof: UserProfile): { score: number; reason: string } {
  const families = items.map(i => i.colorFamily);
  const neutrals = new Set(['black', 'white', 'grey', 'cream', 'beige', 'navy', 'camel', 'ivory', 'tan', 'stone']);
  const allNeutral = families.every(f => neutrals.has(f));
  const fabrics = items.map(i => i.fabric).filter(Boolean) as string[];
  const statements = fabrics.filter(f => STATEMENT_FABRICS.has(f));
  const patterns = items.filter(i => i.pattern && i.pattern !== 'solid');
  const hasStructure = items.some(i => i.fit === 'tailored' || i.subType === 'blazer' || i.subType === 'trench');
  const neutralFamilies = new Set(families.filter(f => neutrals.has(f)));

  if (allNeutral) {
    // Neutral sophistication spectrum
    if (statements.length >= 1 && neutralFamilies.size >= 3) {
      return { score: 9, reason: `Sophisticated neutral: ${statements[0]} statement + ${neutralFamilies.size} tonal variations — quiet luxury` };
    }
    if (statements.length >= 1) {
      return { score: 8, reason: `Neutral with ${statements[0]} texture anchor — intentional restraint` };
    }
    if (hasStructure && neutralFamilies.size >= 2) {
      return { score: 7, reason: `Structural silhouette in ${[...neutralFamilies].join('/')} neutrals — minimalist intentionality` };
    }
    if (neutralFamilies.size >= 3) {
      return { score: 7, reason: `Tonal neutral palette (${[...neutralFamilies].join('/')}) — needs texture anchor to read sophisticated` };
    }
    return { score: 4, reason: `All-neutral flat palette — ${neutralFamilies.size === 1 ? 'mono-colour without texture contrast reads boring' : 'limited interest'}` };
  }

  if (patterns.length >= 1 && statements.length >= 1) {
    return { score: 8, reason: `Pattern + statement texture — rich visual layering` };
  }
  if (prof.styleGoalPrimary === 'bold' && families.some(f => !neutrals.has(f))) {
    return { score: 9, reason: 'Bold colour forward — matches user aesthetic intent' };
  }
  return { score: 7, reason: 'Colour-forward outfit — readable interest without restraint' };
}

function practicalityScore(items: WardrobeItem[], wx: WeatherSnapshot | null, targetOccasion: OccasionTag): { score: number; reason: string } {
  if (!wx) return { score: 7, reason: 'No weather data — cannot evaluate weather appropriateness' };

  const outerwear = items.find(i => i.category === 'outerwear');
  const shoes = items.find(i => i.category === 'shoes');
  const isRainy = wx.precipProbability >= 0.6;
  const isCold = wx.lowC < 12;
  const isHot = wx.lowC > 18 && wx.highC > 24;
  const reasons: string[] = [];
  let score = 8;

  if (isCold && !outerwear) {
    score -= 3; reasons.push(`cold (low ${wx.lowC}°C) but no outerwear`);
  } else if (isCold && outerwear) {
    const warmFabric = outerwear.fabric && HEAVY_FABRICS.has(outerwear.fabric);
    if (warmFabric) { score += 1; reasons.push('appropriate warm outerwear'); }
    else reasons.push('outerwear present but lightweight for conditions');
  }
  if (isRainy) {
    if (outerwear && RAIN_FRIENDLY_SUBTYPES.has(outerwear.subType)) {
      reasons.push('rain-appropriate outerwear');
    } else {
      score -= 2; reasons.push(`rain (${Math.round(wx.precipProbability * 100)}%) but no waterproof layer`);
    }
    if (shoes && ['suede', 'velvet'].includes(shoes.fabric ?? '')) {
      score -= 1; reasons.push('suede/velvet shoes in rain');
    }
  }
  if (isHot) {
    const heavyCore = items.filter(i => ['top','bottom'].includes(i.category)).some(
      i => i.fabric && HEAVY_FABRICS.has(i.fabric)
    );
    if (heavyCore) { score -= 2; reasons.push(`heavy fabric in hot weather (${wx.highC}°C)`); }
    if (outerwear) { score -= 1; reasons.push('coat in hot conditions'); }
  }
  if (targetOccasion === 'active') {
    const hasAthleticShoes = shoes && ['sneakers', 'training-shoes'].includes(shoes.subType);
    if (!hasAthleticShoes) { score -= 2; reasons.push('active occasion without athletic footwear'); }
  }

  return { score: Math.min(10, Math.max(1, score)), reason: reasons.join('; ') || 'appropriate for conditions' };
}

function personalisationScore(items: WardrobeItem[], prof: UserProfile, reactions: OutfitReaction[], wearHistory: WearEntry[], components: OutfitComponent[]): { score: number; reason: string } {
  const reasons: string[] = [];
  let score = 6; // base: generic recommendation

  // Style goal alignment
  const GOAL_SIGNALS: Record<string, string[]> = {
    minimal: ['black','white','grey','cream','beige','navy'],
    elevated: ['silk','cashmere','wool','suede'],
    bold: [], // will check for non-neutrals
    classic: ['blazer','trench','coat','trousers','shirt'],
    romantic: ['floral','chiffon','wrap-dress','midi-dress'],
    youthful: ['crop-top','mini-skirt','sneakers','denim'],
  };
  const goal = prof.styleGoalPrimary;
  if (goal) {
    const signals = GOAL_SIGNALS[goal] ?? [];
    const hits = items.filter(i =>
      signals.some(s => i.colorFamily === s || i.fabric === s || i.subType === s) ||
      (goal === 'bold' && !['black','white','grey','cream','beige','navy','camel'].includes(i.colorFamily))
    );
    if (hits.length >= 2) { score += 2; reasons.push(`${hits.length} items align with ${goal} style goal`); }
    else if (hits.length === 1) { score += 1; reasons.push(`1 item aligned with ${goal}`); }
    else { score -= 1; reasons.push(`no items clearly reflect ${goal} style goal`); }
  }

  // Body type alignment
  if (prof.bodyType === 'pear') {
    const hasSlimTop = items.some(i => i.category === 'top' && (i.fit === 'slim' || i.fit === 'tailored'));
    if (hasSlimTop) { score += 1; reasons.push('slim top suits pear silhouette'); }
  }

  // Reaction history
  const loved = new Set(reactions.filter(r => r.type === 'love').map(r => r.outfitFingerprint));
  const notToday = new Set(reactions.filter(r => r.type === 'not-today').map(r => r.outfitFingerprint));
  const fp = components.map(c => c.matchedItemId).filter(Boolean).sort().join('|');
  if (loved.has(fp)) { score += 2; reasons.push('previously loved outfit'); }
  if (notToday.has(fp)) { score -= 2; reasons.push('previously rejected outfit'); }

  // Wear history
  const recentWear = wearHistory.slice(-5).flatMap(w => w.itemIds);
  const recentItems = new Set(recentWear);
  const repeatedItems = items.filter(i => recentItems.has(i.id));
  if (repeatedItems.length >= 2) { score -= 1; reasons.push('several recently worn items reappear'); }

  if (prof.bodyType === null && prof.styleGoalPrimary === null) {
    score = Math.min(score, 5); reasons.push('no profile data — recommendation is generic');
  }

  return { score: Math.min(10, Math.max(1, score)), reason: reasons.join('; ') || 'moderate personalisation' };
}

function quietLuxuryScore(items: WardrobeItem[], prof: UserProfile): { score: number; reason: string } {
  const fabrics = items.map(i => i.fabric).filter(Boolean) as string[];
  const luxCount = fabrics.filter(f => LUXURY_FABRICS.has(f)).length;
  const families = items.map(i => i.colorFamily);
  const neutrals = new Set(['black', 'white', 'grey', 'cream', 'beige', 'navy', 'camel', 'ivory', 'tan', 'stone']);
  const allNeutral = families.every(f => neutrals.has(f));
  const patterns = items.filter(i => i.pattern && !['solid', 'stripe'].includes(i.pattern ?? 'solid'));
  const hasTailoring = items.some(i => i.fit === 'tailored' || ['blazer','trench','coat','trousers'].includes(i.subType));
  const hasStatements = items.some(i => STATEMENT_FABRICS.has(i.fabric ?? ''));

  let score = 5;
  const reasons: string[] = [];

  if (luxCount >= 2) { score += 3; reasons.push(`${luxCount} luxury fabrics (${fabrics.filter(f => LUXURY_FABRICS.has(f)).join(', ')})`); }
  else if (luxCount === 1) { score += 2; reasons.push(`${fabrics.find(f => LUXURY_FABRICS.has(f))} fabric`); }

  if (allNeutral) { score += 1; reasons.push('restrained neutral palette'); }
  if (hasTailoring) { score += 1; reasons.push('tailored structure'); }
  if (patterns.length > 0) { score -= 1; reasons.push('bold pattern reduces quiet quality'); }
  if (hasStatements && allNeutral && hasTailoring) { score += 1; reasons.push('texture-led luxury'); }

  return { score: Math.min(10, Math.max(1, score)), reason: reasons.join('; ') || 'standard luxury signal' };
}

function evaluateOutfit(
  outfit: OutfitSet & { scoreBreakdown?: OutfitScoreBreakdown },
  resolvedItems: WardrobeItem[],
  prof: UserProfile,
  targetOccasion: OccasionTag,
  wx: WeatherSnapshot | null,
  reactions: OutfitReaction[],
  wearHistory: WearEntry[],
): { rubric: RubricScore; reasons: RubricReason } {
  const c = colourHarmonyScore(resolvedItems);
  const p = proportionScore(resolvedItems, prof);
  const oc = occasionScore(resolvedItems, targetOccasion);
  const fo = formalityScore(resolvedItems, targetOccasion);
  const co = coherenceScore(resolvedItems);
  const tx = textureScore(resolvedItems);
  const vi = visualInterestScore(resolvedItems, prof);
  const pr = practicalityScore(resolvedItems, wx, targetOccasion);
  const pe = personalisationScore(resolvedItems, prof, reactions, wearHistory, outfit.components);
  const ql = quietLuxuryScore(resolvedItems, prof);

  const total = c.score + p.score + oc.score + fo.score + co.score + tx.score + vi.score + pr.score + pe.score + ql.score;

  return {
    rubric: {
      colour: c.score, proportion: p.score, occasion: oc.score, formality: fo.score,
      coherence: co.score, texture: tx.score, visualInterest: vi.score, practicality: pr.score,
      personalisation: pe.score, quietLuxury: ql.score, total,
    },
    reasons: {
      colour: c.reason, proportion: p.reason, occasion: oc.reason, formality: fo.reason,
      coherence: co.reason, texture: tx.reason, visualInterest: vi.reason, practicality: pr.reason,
      personalisation: pe.reason, quietLuxury: ql.reason,
    },
  };
}

// ─── Benchmark scenario runner ────────────────────────────────────────────────

interface ScenarioResult {
  id: string; category: string; name: string; description: string; challenge: string;
  targetOccasion: OccasionTag; profile: UserProfile; weatherSnapshot: WeatherSnapshot | null;
  topOutfits: Array<{
    rank: number; outfit: OutfitSet; internalScore: number;
    breakdown: OutfitScoreBreakdown | null; resolvedItems: WardrobeItem[];
    rubric: RubricScore; reasons: RubricReason;
  }>;
  candidateCount: number; error?: string;
}

function runScenario(
  id: string, category: string, name: string, description: string, challenge: string,
  items: WardrobeItem[], prof: UserProfile, targetOccasion: OccasionTag,
  wx: WeatherSnapshot | null = null,
  reactions: OutfitReaction[] = [],
  wearHistory: WearEntry[] = [],
  affinity: AffinityState = EMPTY_AFFINITY,
  isPremium = false,
): ScenarioResult {
  const today = '2026-08-11';
  let pool: Record<OccasionTag, OutfitSet[]>;
  try {
    pool = generateOutfitPool(items, prof, null, reactions, today, wearHistory, affinity, wx, isPremium);
  } catch (e: any) {
    return { id, category, name, description, challenge, targetOccasion, profile: prof, weatherSnapshot: wx, topOutfits: [], candidateCount: 0, error: String(e) };
  }
  const candidates = pool[targetOccasion] ?? [];
  const top5 = candidates.slice(0, 5);
  const topOutfits = top5.map((outfit, i) => {
    const resolvedItems = outfit.components
      .map(c => items.find(it => it.id === c.matchedItemId))
      .filter((it): it is WardrobeItem => it !== undefined);
    const br = (outfit as any).scoreBreakdown as OutfitScoreBreakdown | null ?? null;
    const internalScore = outfit.confidenceScore ?? 0;
    const { rubric, reasons } = evaluateOutfit(outfit as any, resolvedItems, prof, targetOccasion, wx, reactions, wearHistory);
    return { rank: i + 1, outfit, internalScore, breakdown: br, resolvedItems, rubric, reasons };
  });
  return { id, category, name, description, challenge, targetOccasion, profile: prof, weatherSnapshot: wx, topOutfits, candidateCount: candidates.length };
}

// ─── SCENARIOS ────────────────────────────────────────────────────────────────

const results: ScenarioResult[] = [];
const TODAY = '2026-08-11';

function fp(...ids: string[]) { return ids.sort().join('|'); }

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 1 — COLOUR (6 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // C1: Complementary — warm burnt-orange + navy
  const t1 = item({ id: 'c1-top1', category: 'top', subType: 'blouse', colorFamily: 'orange', fabric: 'silk', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch','date-casual'], pattern: 'solid' });
  const b1 = item({ id: 'c1-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'navy', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'mid', pattern: 'solid' });
  const s1 = item({ id: 'c1-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'nude', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','event'] });
  const bg1 = item({ id: 'c1-bag1', category: 'bag', subType: 'tote', colorFamily: 'tan', formalityLevel: 4, occasionTags: ['work','casual'] });
  results.push(runScenario('C1','Colour','Complementary: Orange+Navy','Burnt-orange silk blouse + navy wool trousers + nude pumps',
    'Can the engine surface the complementary pairing as high quality?',
    [t1,b1,s1,bg1], profile({ styleGoalPrimary:'elevated', bodyType:'hourglass' }), 'work'));
}
{
  // C2: Analogous — sage + olive + moss
  const t2 = item({ id: 'c2-top1', category: 'top', subType: 'blouse', colorFamily: 'green', fabric: 'linen', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch'], pattern: 'solid' });
  const b2 = item({ id: 'c2-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'green', fabric: 'linen', fit: 'loose', formalityLevel: 3, occasionTags: ['casual','brunch'], rise: 'mid' });
  const s2 = item({ id: 'c2-shoe2', category: 'shoes', subType: 'sandals', colorFamily: 'tan', fabric: 'leather', formalityLevel: 2, occasionTags: ['casual','brunch'] });
  const j2 = item({ id: 'c2-jew1', category: 'jewelry', subType: 'earrings', colorFamily: 'gold', metalTone: 'gold', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  results.push(runScenario('C2','Colour','Analogous: Sage+Olive tonal dressing','Earth-tone linen set with leather sandals — analogous harmony',
    'Tonal dressing in the same colour family risks reading monochromatic; can the engine distinguish this from boring neutral?',
    [t2,b2,s2,j2], profile({ styleGoalPrimary:'minimal' }), 'brunch'));
}
{
  // C3: Tonal dressing — cream/ivory/oat
  const t3 = item({ id: 'c3-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch','date-casual'], pattern: 'solid' });
  const b3 = item({ id: 'c3-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'beige', fabric: 'linen', fit: 'loose', formalityLevel: 4, occasionTags: ['work','brunch','casual'], rise: 'high' });
  const s3 = item({ id: 'c3-shoe1', category: 'shoes', subType: 'mules', colorFamily: 'cream', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','brunch'] });
  const bg3 = item({ id: 'c3-bag1', category: 'bag', subType: 'shoulder-bag', colorFamily: 'tan', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','brunch'] });
  results.push(runScenario('C3','Colour','Tonal: Cream/Ivory/Beige head-to-toe','All neutrals: cream silk + beige linen wide-leg + cream mule',
    'Classic quiet-luxury tonal dress — engine must rank this above noisier alternatives',
    [t3,b3,s3,bg3], profile({ styleGoalPrimary:'minimal', bodyType:'rectangle' }), 'brunch'));
}
{
  // C4: Neutral palette — black/white only
  const t4 = item({ id: 'c4-top1', category: 'top', subType: 'shirt', colorFamily: 'white', fabric: 'cotton', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event','interview'], pattern: 'solid' });
  const b4 = item({ id: 'c4-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event','interview'], rise: 'high' });
  const s4 = item({ id: 'c4-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event'] });
  const j4 = item({ id: 'c4-jew1', category: 'jewelry', subType: 'necklace', colorFamily: 'gold', metalTone: 'gold', formalityLevel: 5, occasionTags: ['work','event'] });
  results.push(runScenario('C4','Colour','Neutral: Black+White classic contrast','White tailored shirt + black wool trousers + gold necklace',
    'High-contrast neutral — strong monochrome tension; engine should rank above softer alternatives',
    [t4,b4,s4,j4], profile({ styleGoalPrimary:'classic', bodyType:'inverted-triangle', undertone:'cool' }), 'work'));
}
{
  // C5: Accent colour — navy base + single red accent
  const t5 = item({ id: 'c5-top1', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event','date-dressy'], pattern: 'solid' });
  const b5 = item({ id: 'c5-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'navy', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s5 = item({ id: 'c5-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'red', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event','date-dressy'] });
  const bg5 = item({ id: 'c5-bag1', category: 'bag', subType: 'clutch', colorFamily: 'navy', fabric: 'leather', formalityLevel: 6, occasionTags: ['event','date-dressy'] });
  results.push(runScenario('C5','Colour','Accent: Navy with red shoe pop','Navy monochrome + single red shoe accent — deliberate accent vs noise',
    'Single accent colour against monochrome base: does the engine treat this correctly or penalise for "colour mismatch"?',
    [t5,b5,s5,bg5], profile({ styleGoalPrimary:'elevated', undertone:'cool' }), 'work'));
}
{
  // C6: Warm/cool tension — burgundy + slate blue
  const t6 = item({ id: 'c6-top1', category: 'top', subType: 'knit-top', colorFamily: 'burgundy', fabric: 'wool', fit: 'regular', formalityLevel: 4, occasionTags: ['work','brunch','date-casual'], pattern: 'solid' });
  const b6 = item({ id: 'c6-bot1', category: 'bottom', subType: 'midi-skirt', colorFamily: 'blue', fabric: 'denim', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch','date-casual'], rise: 'mid' });
  const s6 = item({ id: 'c6-shoe1', category: 'shoes', subType: 'ankle-boots', colorFamily: 'tan', fabric: 'leather', formalityLevel: 4, occasionTags: ['casual','work','date-casual'] });
  results.push(runScenario('C6','Colour','Warm/cool: Burgundy+Slate-blue tension','Warm burgundy wool knit + cool denim midi — warm/cool tension pair',
    'Warm/cool tension: deliberate contrast or unresolved clash? Engine must handle chromatic complexity.',
    [t6,b6,s6], profile({ styleGoalPrimary:'romantic', bodyType:'pear' }), 'date-casual'));
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 2 — PROPORTION (8 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // P1: Petite — fitted silhouette advantage
  const t = item({ id: 'p1-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch'] });
  const b = item({ id: 'p1-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'navy', fabric: 'wool', fit: 'slim', formalityLevel: 5, occasionTags: ['work'], rise: 'high' });
  const wb = item({ id: 'p1-bot2', category: 'bottom', subType: 'wide-leg', colorFamily: 'black', fabric: 'cotton', fit: 'loose', formalityLevel: 3, occasionTags: ['casual','work'], rise: 'mid' });
  const s = item({ id: 'p1-shoe1', category: 'shoes', subType: 'heels', colorFamily: 'nude', fabric: 'leather', formalityLevel: 5, occasionTags: ['work'] });
  results.push(runScenario('P1','Proportion','Petite: Slim vs wide-leg choice','Petite user — slim trousers vs wide-leg should differ in rank',
    'Does heightBand:petite correctly disadvantage wide-leg + oversized combos?',
    [t,b,wb,s], profile({ bodyType:'rectangle', heightBand:'petite', styleGoalPrimary:'minimal' }), 'work'));
}
{
  // P2: Tall — wide-leg / oversized intentional
  const t = item({ id: 'p2-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'cotton', fit: 'oversized', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  const b = item({ id: 'p2-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'black', fabric: 'linen', fit: 'loose', formalityLevel: 4, occasionTags: ['casual','work','brunch'], rise: 'high' });
  const s = item({ id: 'p2-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'black', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','casual','brunch'] });
  results.push(runScenario('P2','Proportion','Tall: Oversized+wide-leg intentional','Tall frame — double-volume would overwhelm petite; here it reads intentional',
    'Tall user wearing double-volume: proportion penalty should be reduced or absent vs petite.',
    [t,b,s], profile({ bodyType:'rectangle', heightBand:'tall', styleGoalPrimary:'minimal' }), 'brunch'));
}
{
  // P3: Pear — wide hip balance
  const t = item({ id: 'p3-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'silk', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch','date-casual'] });
  const b = item({ id: 'p3-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'black', fabric: 'wool', fit: 'loose', formalityLevel: 4, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'p3-shoe1', category: 'shoes', subType: 'heels', colorFamily: 'black', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','event'] });
  const bg = item({ id: 'p3-bag1', category: 'bag', subType: 'tote', colorFamily: 'black', fabric: 'leather', formalityLevel: 4, occasionTags: ['work'] });
  results.push(runScenario('P3','Proportion','Pear: Wide-leg + slim top balance','Pear body, slim top + wide-leg: classic proportion trick',
    'High-rise wide-leg + slim top should score well for pear bodyType; engine must combine body-type and rise signals.',
    [t,b,s,bg], profile({ bodyType:'pear', heightBand:'average', styleGoalPrimary:'classic' }), 'work'));
}
{
  // P4: Apple — empire/flowing dress
  const d = item({ id: 'p4-dress1', category: 'dress', subType: 'wrap-dress', colorFamily: 'navy', fabric: 'chiffon', fit: 'regular', formalityLevel: 5, occasionTags: ['event','date-dressy','brunch'] });
  const s = item({ id: 'p4-shoe1', category: 'shoes', subType: 'heels', colorFamily: 'nude', fabric: 'leather', formalityLevel: 5, occasionTags: ['event','date-dressy'] });
  const j = item({ id: 'p4-jew1', category: 'jewelry', subType: 'earrings', colorFamily: 'gold', metalTone: 'gold', formalityLevel: 4, occasionTags: ['event','brunch'] });
  results.push(runScenario('P4','Proportion','Apple: Wrap dress proportion','Apple body — wrap dress defines waist; engine should favour dress over two-piece',
    'Engine preference for dress vs separates for apple body type — is the dress weighted correctly?',
    [d,s,j], profile({ bodyType:'apple', heightBand:'average', styleGoalPrimary:'romantic' }), 'event'));
}
{
  // P5: Hourglass — fitted structure
  const t = item({ id: 'p5-top1', category: 'top', subType: 'blouse', colorFamily: 'burgundy', fabric: 'silk', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','date-dressy','event'] });
  const b = item({ id: 'p5-bot1', category: 'bottom', subType: 'pencil-skirt', colorFamily: 'black', fabric: 'wool', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'p5-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event'] });
  results.push(runScenario('P5','Proportion','Hourglass: Fitted structure','Hourglass — tailored silk blouse + pencil skirt maximises silhouette',
    'Fitted top + pencil skirt should score highest for hourglass; does the engine agree?',
    [t,b,s], profile({ bodyType:'hourglass', heightBand:'average', styleGoalPrimary:'elevated' }), 'work'));
}
{
  // P6: Rectangle — create waist illusion
  const t = item({ id: 'p6-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  const b = item({ id: 'p6-bot1', category: 'bottom', subType: 'midi-skirt', colorFamily: 'floral', fabric: 'chiffon', fit: 'regular', formalityLevel: 4, occasionTags: ['brunch','date-casual'], rise: 'high', pattern: 'floral' });
  const ow = item({ id: 'p6-ow1', category: 'outerwear', subType: 'blazer', colorFamily: 'beige', fabric: 'linen', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','brunch'] });
  const s = item({ id: 'p6-shoe1', category: 'shoes', subType: 'heels', colorFamily: 'nude', fabric: 'leather', formalityLevel: 4, occasionTags: ['brunch','event'] });
  results.push(runScenario('P6','Proportion','Rectangle: Waist-defining blazer','Rectangle — blazer over floral midi creates waist definition',
    'Belted/structured outerwear over floaty bottom for rectangle: does engine favour this proportioning?',
    [t,b,ow,s], profile({ bodyType:'rectangle', heightBand:'average', styleGoalPrimary:'romantic' }), 'brunch'));
}
{
  // P7: Inverted triangle — wide-leg grounds shoulders
  const t = item({ id: 'p7-top1', category: 'top', subType: 't-shirt', colorFamily: 'white', fabric: 'cotton', fit: 'slim', formalityLevel: 2, occasionTags: ['casual','brunch'] });
  const b = item({ id: 'p7-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'camel', fabric: 'linen', fit: 'loose', formalityLevel: 3, occasionTags: ['casual','brunch'], rise: 'high' });
  const s = item({ id: 'p7-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'leather', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  results.push(runScenario('P7','Proportion','Inverted triangle: Wide-leg grounds','Wide-leg trousers ground strong shoulder line of inverted triangle',
    'Slim top + wide-leg should score well for inverted-triangle; does the engine capture this?',
    [t,b,s], profile({ bodyType:'inverted-triangle', heightBand:'tall', styleGoalPrimary:'minimal' }), 'casual'));
}
{
  // P8: High-rise adversarial — high-rise + oversized (negative riseHarmony test)
  const t = item({ id: 'p8-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'cotton', fit: 'oversized', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  const b = item({ id: 'p8-bot1', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'high' });
  const tgood = item({ id: 'p8-top2', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'silk', fit: 'slim', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  const s = item({ id: 'p8-shoe1', category: 'shoes', subType: 'sneakers', colorFamily: 'white', fabric: 'synthetic', formalityLevel: 1, occasionTags: ['casual','active'] });
  results.push(runScenario('P8','Proportion','Rise: High-rise oversized top (negative)','High-rise jeans + oversized top: engine should prefer slim top via riseHarmony −1',
    'Phase 3.1 rise penalty: does high-rise + oversized rank below high-rise + slim?',
    [t,b,tgood,s], profile({ bodyType:'hourglass' }), 'casual'));
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 3 — QUIET LUXURY (6 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // QL1: Neutral sophisticated — silk + cashmere + leather
  const t = item({ id: 'ql1-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event','date-dressy'], pattern: 'solid' });
  const b = item({ id: 'ql1-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'camel', fabric: 'cashmere', fit: 'loose', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'ql1-shoe1', category: 'shoes', subType: 'mules', colorFamily: 'cream', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','event'] });
  const bg = item({ id: 'ql1-bag1', category: 'bag', subType: 'shoulder-bag', colorFamily: 'tan', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','event'] });
  results.push(runScenario('QL1','Quiet Luxury','QL Sophisticated: Silk+Cashmere+Leather','Cream silk blouse + camel cashmere wide-leg + leather mule — peak quiet luxury',
    'Should score near maximum on quiet luxury dimension — can the engine surface this as top-ranked?',
    [t,b,s,bg], profile({ styleGoalPrimary:'elevated', bodyType:'rectangle', heightBand:'tall' }), 'work', null, [], [], EMPTY_AFFINITY, true));
}
{
  // QL2: Neutral boring — cotton t-shirt + chinos + sneakers
  const t = item({ id: 'ql2-top1', category: 'top', subType: 't-shirt', colorFamily: 'grey', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const b = item({ id: 'ql2-bot1', category: 'bottom', subType: 'chinos', colorFamily: 'beige', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','work'], rise: 'mid' });
  const s = item({ id: 'ql2-shoe1', category: 'shoes', subType: 'sneakers', colorFamily: 'white', fabric: 'synthetic', formalityLevel: 1, occasionTags: ['casual','active'] });
  const bg = item({ id: 'ql2-bag1', category: 'bag', subType: 'backpack', colorFamily: 'black', fabric: 'synthetic', formalityLevel: 2, occasionTags: ['casual','travel'] });
  results.push(runScenario('QL2','Quiet Luxury','QL Boring: Grey tee+beige chinos+sneakers','The "airport neutral" — neutral but flat, no luxury signal',
    'Rubric should score visual interest and quiet luxury low; does engine score this as high as truly sophisticated neutrals?',
    [t,b,s,bg], profile({ styleGoalPrimary:'minimal' }), 'casual'));
}
{
  // QL3: Monochromatic rich — navy head-to-toe with varied texture
  const t = item({ id: 'ql3-top1', category: 'top', subType: 'knit-top', colorFamily: 'navy', fabric: 'cashmere', fit: 'slim', formalityLevel: 4, occasionTags: ['work','date-casual','brunch'], pattern: 'solid' });
  const b = item({ id: 'ql3-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'navy', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'ql3-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'navy', fabric: 'suede', formalityLevel: 5, occasionTags: ['work','event'] });
  const bg = item({ id: 'ql3-bag1', category: 'bag', subType: 'tote', colorFamily: 'navy', fabric: 'leather', formalityLevel: 5, occasionTags: ['work'] });
  results.push(runScenario('QL3','Quiet Luxury','QL Mono-rich: Navy head-to-toe, varied texture','Navy cashmere + navy wool + navy suede — mono depth through texture',
    'Head-to-toe navy reads flat on paper but rich via fabric. Does the colour scorer penalise the mono or does texture compensate?',
    [t,b,s,bg], profile({ styleGoalPrimary:'classic', undertone:'cool' }), 'work'));
}
{
  // QL4: Restrained luxury — all-black, premium fabrics
  const t = item({ id: 'ql4-top1', category: 'top', subType: 'blouse', colorFamily: 'black', fabric: 'silk', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event','night-out'], pattern: 'solid' });
  const b = item({ id: 'ql4-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'ql4-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event','night-out'] });
  const j = item({ id: 'ql4-jew1', category: 'jewelry', subType: 'earrings', colorFamily: 'gold', metalTone: 'gold', formalityLevel: 5, occasionTags: ['event','night-out'] });
  results.push(runScenario('QL4','Quiet Luxury','QL Restrained: All-black premium fabrics','Silk blouse + wool trousers + leather pumps + gold earring — luxury through material, not colour',
    'All-black palette: colour scorer may give neutral score; quiet luxury should be high via fabric stack.',
    [t,b,s,j], profile({ styleGoalPrimary:'elevated', undertone:'cool' }), 'event', null, [], [], EMPTY_AFFINITY, true));
}
{
  // QL5: Texture-led luxury — silk + tweed
  const t = item({ id: 'ql5-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','brunch','event'] });
  const b = item({ id: 'ql5-bot1', category: 'bottom', subType: 'midi-skirt', colorFamily: 'grey', fabric: 'tweed', fit: 'regular', formalityLevel: 5, occasionTags: ['work','event'], rise: 'mid' });
  const s = item({ id: 'ql5-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'nude', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','event'] });
  results.push(runScenario('QL5','Quiet Luxury','QL Texture-led: Silk+Tweed contrast','Cream silk blouse + grey tweed midi — intentional statement texture vs flat',
    'Silk + tweed is a deliberate luxury contrast. Does the texture scorer reward the statement vs same-material penalty?',
    [t,b,s], profile({ styleGoalPrimary:'classic', bodyType:'hourglass' }), 'work'));
}
{
  // QL6: Quiet luxury vs colourful competitor — who does the engine prefer?
  const qlt = item({ id: 'ql6-top1', category: 'top', subType: 'blouse', colorFamily: 'ivory', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','brunch'] });
  const qlb = item({ id: 'ql6-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'stone', fabric: 'linen', fit: 'tailored', formalityLevel: 4, occasionTags: ['work','casual'], rise: 'high' });
  const colourt = item({ id: 'ql6-top2', category: 'top', subType: 't-shirt', colorFamily: 'orange', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const colourb = item({ id: 'ql6-bot2', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const s = item({ id: 'ql6-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','casual'] });
  results.push(runScenario('QL6','Quiet Luxury','QL vs colour: does neutral win for work?','Ivory silk+stone linen vs orange tee+jeans for work scenario',
    'Phase 3 concern: neutral sophisticated vs casual colourful — engine should strongly prefer the silk+linen for work.',
    [qlt,qlb,colourt,colourb,s], profile({ styleGoalPrimary:'elevated', bodyType:'rectangle' }), 'work'));
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 4 — FORMALITY & OCCASION (6 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // F1: Business formal interview
  const t = item({ id: 'f1-top1', category: 'top', subType: 'shirt', colorFamily: 'white', fabric: 'cotton', fit: 'tailored', formalityLevel: 6, occasionTags: ['work','interview','event'] });
  const b = item({ id: 'f1-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'charcoal', fabric: 'wool', fit: 'tailored', formalityLevel: 7, occasionTags: ['work','interview','event'], rise: 'high' });
  const ow = item({ id: 'f1-ow1', category: 'outerwear', subType: 'blazer', colorFamily: 'charcoal', fabric: 'wool', fit: 'tailored', formalityLevel: 7, occasionTags: ['work','interview','event'] });
  const s = item({ id: 'f1-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 7, occasionTags: ['work','event'] });
  results.push(runScenario('F1','Formality','Business Formal: Interview suit','Charcoal wool suit + white shirt + black leather pumps — interview-grade formality',
    'Should achieve very high formality and occasion scores; any mismatch exposes calibration gaps.',
    [t,b,ow,s], profile({ styleGoalPrimary:'classic', industry:'corporate', bodyType:'hourglass' }), 'interview'));
}
{
  // F2: Business casual
  const t = item({ id: 'f2-top1', category: 'top', subType: 'blouse', colorFamily: 'blush', fabric: 'silk', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch','date-casual'] });
  const b = item({ id: 'f2-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'navy', fabric: 'cotton', fit: 'tailored', formalityLevel: 4, occasionTags: ['work'], rise: 'mid' });
  const ow = item({ id: 'f2-ow1', category: 'outerwear', subType: 'blazer', colorFamily: 'navy', fabric: 'linen', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','brunch'] });
  const s = item({ id: 'f2-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','casual'] });
  results.push(runScenario('F2','Formality','Business Casual: Blush+Navy smart casual','Silk blouse + navy blazer + linen trousers + tan loafer',
    'Business casual border: not overly formal, not underdressed; does formality score land in the right range?',
    [t,b,ow,s], profile({ styleGoalPrimary:'elevated', industry:'tech' }), 'work'));
}
{
  // F3: Date night — dressy but not gown
  const d = item({ id: 'f3-dress1', category: 'dress', subType: 'slip-dress', colorFamily: 'burgundy', fabric: 'satin', fit: 'slim', formalityLevel: 6, occasionTags: ['date-dressy','night-out','event'] });
  const ow = item({ id: 'f3-ow1', category: 'outerwear', subType: 'blazer', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 6, occasionTags: ['event','date-dressy'] });
  const s = item({ id: 'f3-shoe1', category: 'shoes', subType: 'strappy-heels', colorFamily: 'gold', fabric: 'leather', formalityLevel: 7, occasionTags: ['event','date-dressy','night-out'] });
  const j = item({ id: 'f3-jew1', category: 'jewelry', subType: 'earrings', colorFamily: 'gold', metalTone: 'gold', formalityLevel: 6, occasionTags: ['event','date-dressy'] });
  results.push(runScenario('F3','Formality','Date Night: Satin slip + blazer','Burgundy satin slip + black wool blazer + gold strappy heels',
    'Date-dressy: intentionally dressed-up without gown. Does occasion/formality scoring separate this from work outfits?',
    [d,ow,s,j], profile({ styleGoalPrimary:'romantic', bodyType:'hourglass', undertone:'warm' }), 'date-dressy', null, [], [], EMPTY_AFFINITY, true));
}
{
  // F4: Wedding guest — garden ceremony
  const d = item({ id: 'f4-dress1', category: 'dress', subType: 'midi-dress', colorFamily: 'blush', fabric: 'chiffon', fit: 'regular', formalityLevel: 7, occasionTags: ['event','wedding','date-dressy'] });
  const s = item({ id: 'f4-shoe1', category: 'shoes', subType: 'block-heels', colorFamily: 'nude', fabric: 'leather', formalityLevel: 6, occasionTags: ['event','wedding'] });
  const j = item({ id: 'f4-jew1', category: 'jewelry', subType: 'necklace', colorFamily: 'gold', metalTone: 'gold', formalityLevel: 6, occasionTags: ['event','wedding'] });
  const bg = item({ id: 'f4-bag1', category: 'bag', subType: 'clutch', colorFamily: 'nude', fabric: 'leather', formalityLevel: 6, occasionTags: ['event','wedding'] });
  results.push(runScenario('F4','Formality','Wedding Guest: Blush chiffon midi','Blush chiffon midi + block heels + gold necklace — garden wedding',
    'Wedding appropriateness: avoids white, avoids over-formal. Does the engine score this correctly for the wedding tag?',
    [d,s,j,bg], profile({ styleGoalPrimary:'romantic', bodyType:'pear', undertone:'warm' }), 'wedding', null, [], [], EMPTY_AFFINITY, true));
}
{
  // F5: Smart casual brunch
  const t = item({ id: 'f5-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'linen', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch','date-casual'] });
  const b = item({ id: 'f5-bot1', category: 'bottom', subType: 'midi-skirt', colorFamily: 'floral', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch','date-casual'], rise: 'mid', pattern: 'floral' });
  const s = item({ id: 'f5-shoe1', category: 'shoes', subType: 'espadrilles', colorFamily: 'tan', fabric: 'cotton', formalityLevel: 2, occasionTags: ['casual','brunch'] });
  const bg = item({ id: 'f5-bag1', category: 'bag', subType: 'wicker-bag', colorFamily: 'tan', formalityLevel: 2, occasionTags: ['casual','brunch','resort'] });
  results.push(runScenario('F5','Formality','Smart Casual Brunch: Linen+floral midi','White linen blouse + floral cotton midi + espadrilles',
    'Brunch formality (2–5): does the engine land in this range, or drift too formal/casual?',
    [t,b,s,bg], profile({ styleGoalPrimary:'romantic', bodyType:'rectangle' }), 'brunch'));
}
{
  // F6: Active — athletic gear test
  const t = item({ id: 'f6-top1', category: 'top', subType: 'sports-hoodie', colorFamily: 'black', fabric: 'synthetic', fit: 'regular', formalityLevel: 1, occasionTags: ['active','casual'] });
  const b = item({ id: 'f6-bot1', category: 'bottom', subType: 'leggings', colorFamily: 'black', fabric: 'synthetic', fit: 'slim', formalityLevel: 1, occasionTags: ['active'], rise: 'high' });
  const s = item({ id: 'f6-shoe1', category: 'shoes', subType: 'training-shoes', colorFamily: 'white', fabric: 'synthetic', formalityLevel: 1, occasionTags: ['active'] });
  results.push(runScenario('F6','Formality','Active: Athletic core set','Black sports hoodie + leggings + training shoes — pure active',
    'Active scenario: all pieces must be athletic-appropriate. Small wardrobe edge case.',
    [t,b,s], profile({ styleGoalPrimary:'youthful' }), 'active'));
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 5 — WEATHER & PRACTICALITY (6 scenarios)
// ═══════════════════════════════════════════════════════════════════

const coldWeather = weather({ currentTempC: 3, highC: 7, lowC: 0, precipProbability: 0.2 });
const hotWeather  = weather({ currentTempC: 32, highC: 36, lowC: 27, precipProbability: 0.1 });
const rainWeather = weather({ currentTempC: 14, highC: 16, lowC: 11, precipProbability: 0.8 });
const mildWeather = weather({ currentTempC: 18, highC: 22, lowC: 14, precipProbability: 0.1 });

{
  // W1: Cold — needs heavy coat
  const t = item({ id: 'w1-top1', category: 'top', subType: 'knit-top', colorFamily: 'cream', fabric: 'wool', fit: 'slim', formalityLevel: 3, occasionTags: ['casual','work'], warmthBand: 'cold' });
  const b = item({ id: 'w1-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 4, occasionTags: ['work','casual'], rise: 'high', warmthBand: 'cold' });
  const ow = item({ id: 'w1-ow1', category: 'outerwear', subType: 'coat', colorFamily: 'camel', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','casual','event'], warmthBand: 'cold' });
  const s = item({ id: 'w1-shoe1', category: 'shoes', subType: 'boots', colorFamily: 'black', fabric: 'leather', formalityLevel: 4, occasionTags: ['casual','work','travel'], warmthBand: 'cold' });
  results.push(runScenario('W1','Weather','Cold (3°C): Layered wool outfit','Wool knit + wool trousers + camel wool coat + leather boots — cold day',
    'Cold weather gating: engine should require outerwear; does it include the coat?',
    [t,b,ow,s], profile({ styleGoalPrimary:'classic' }), 'work', coldWeather));
}
{
  // W2: Hot — linen/cotton only
  const d = item({ id: 'w2-dress1', category: 'dress', subType: 'sundress', colorFamily: 'white', fabric: 'linen', fit: 'loose', formalityLevel: 2, occasionTags: ['casual','resort','brunch'], warmthBand: 'hot' });
  const s = item({ id: 'w2-shoe1', category: 'shoes', subType: 'sandals', colorFamily: 'tan', fabric: 'leather', formalityLevel: 2, occasionTags: ['casual','resort','brunch'], warmthBand: 'hot' });
  const bg = item({ id: 'w2-bag1', category: 'bag', subType: 'wicker-bag', colorFamily: 'tan', formalityLevel: 2, occasionTags: ['casual','brunch','resort'] });
  const heavyt = item({ id: 'w2-top1', category: 'top', subType: 'knit-top', colorFamily: 'black', fabric: 'wool', fit: 'slim', formalityLevel: 4, occasionTags: ['work','casual'], warmthBand: 'cold' });
  results.push(runScenario('W2','Weather','Hot (36°C): Linen sundress vs wool knit','Linen sundress vs wool knit — hot day practicality',
    'Hot-weather gating: wool knit should be suppressed; linen/cotton sundress preferred.',
    [d,s,bg,heavyt], profile({ styleGoalPrimary:'minimal' }), 'casual', hotWeather));
}
{
  // W3: Rain — needs waterproof layer
  const t = item({ id: 'w3-top1', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','work'] });
  const b = item({ id: 'w3-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'cotton', fit: 'tailored', formalityLevel: 4, occasionTags: ['work'], rise: 'mid' });
  const ow = item({ id: 'w3-ow1', category: 'outerwear', subType: 'trench', colorFamily: 'camel', fabric: 'cotton', fit: 'regular', formalityLevel: 5, occasionTags: ['work','casual','travel'] });
  const s = item({ id: 'w3-shoe1', category: 'shoes', subType: 'ankle-boots', colorFamily: 'black', fabric: 'leather', formalityLevel: 4, occasionTags: ['casual','work'] });
  const suedeShoe = item({ id: 'w3-shoe2', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'suede', formalityLevel: 4, occasionTags: ['work','casual'] });
  results.push(runScenario('W3','Weather','Rain (80% precip): Trench + leather boots','Navy cotton blouse + trench coat + leather ankle boots (vs suede loafer)',
    'Rainy-day: engine should prefer trench + leather boots over suede loafers.',
    [t,b,ow,s,suedeShoe], profile({ styleGoalPrimary:'classic' }), 'work', rainWeather));
}
{
  // W4: Transitional spring — layers needed
  const t = item({ id: 'w4-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'cotton', fit: 'slim', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  const b = item({ id: 'w4-bot1', category: 'bottom', subType: 'midi-skirt', colorFamily: 'beige', fabric: 'linen', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch'], rise: 'mid' });
  const ow = item({ id: 'w4-ow1', category: 'outerwear', subType: 'jacket', colorFamily: 'navy', fabric: 'denim', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  const s = item({ id: 'w4-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'leather', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  results.push(runScenario('W4','Weather','Transitional (18°C): Layer-ready casual','Cotton blouse + linen midi + denim jacket — mild transitional day',
    'Mild weather: outerwear optional/suppressed. Does the engine correctly gate the jacket?',
    [t,b,ow,s], profile({ styleGoalPrimary:'youthful' }), 'brunch', mildWeather));
}
{
  // W5: Mild evening event — no heavy coat needed
  const d = item({ id: 'w5-dress1', category: 'dress', subType: 'cocktail-dress', colorFamily: 'emerald', fabric: 'velvet', fit: 'slim', formalityLevel: 7, occasionTags: ['event','night-out','date-dressy'] });
  const ow = item({ id: 'w5-ow1', category: 'outerwear', subType: 'blazer', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 7, occasionTags: ['event','date-dressy'] });
  const s = item({ id: 'w5-shoe1', category: 'shoes', subType: 'stilettos', colorFamily: 'black', fabric: 'leather', formalityLevel: 8, occasionTags: ['event','night-out'] });
  results.push(runScenario('W5','Weather','Mild evening event: Velvet cocktail dress','Emerald velvet cocktail + black wool blazer + stilettos — mild 18°C evening event',
    'Mild evening: heavy puffer suppressed, blazer appropriate. Velvet in season-appropriate context.',
    [d,ow,s], profile({ styleGoalPrimary:'bold', bodyType:'hourglass' }), 'event', mildWeather, [], [], EMPTY_AFFINITY, true));
}
{
  // W6: Cold + rainy — practical failure test
  const coldRain = weather({ currentTempC: 6, highC: 9, lowC: 3, precipProbability: 0.9 });
  const t = item({ id: 'w6-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event'] });
  const b = item({ id: 'w6-bot1', category: 'bottom', subType: 'midi-skirt', colorFamily: 'beige', fabric: 'chiffon', fit: 'regular', formalityLevel: 5, occasionTags: ['brunch','event'], rise: 'mid' });
  const ow = item({ id: 'w6-ow1', category: 'outerwear', subType: 'trench', colorFamily: 'camel', fabric: 'cotton', fit: 'regular', formalityLevel: 5, occasionTags: ['work','casual'] });
  const s = item({ id: 'w6-shoe1', category: 'shoes', subType: 'ankle-boots', colorFamily: 'tan', fabric: 'suede', formalityLevel: 4, occasionTags: ['casual','work'] });
  results.push(runScenario('W6','Weather','Cold+Rainy (6°C, 90%): Suede vs leather boots','Silk blouse + chiffon skirt + cotton trench + suede boots — cold rainy day adversarial',
    'Cold + heavy rain: silk + chiffon is impractical; suede boots are a problem. What does the engine produce?',
    [t,b,ow,s], profile({ styleGoalPrimary:'classic' }), 'work', coldRain));
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 6 — PATTERN & TEXTURE (5 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // PT1: Floral hero piece — sole pattern, solid companions
  const t = item({ id: 'pt1-top1', category: 'top', subType: 'blouse', colorFamily: 'floral', fabric: 'chiffon', fit: 'regular', formalityLevel: 4, occasionTags: ['brunch','date-casual','casual'], pattern: 'floral', patternScale: 'medium' });
  const b = item({ id: 'pt1-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'cotton', fit: 'tailored', formalityLevel: 4, occasionTags: ['work','casual'], rise: 'mid', pattern: 'solid' });
  const s = item({ id: 'pt1-shoe1', category: 'shoes', subType: 'mules', colorFamily: 'nude', fabric: 'leather', formalityLevel: 4, occasionTags: ['casual','brunch'] });
  results.push(runScenario('PT1','Pattern/Texture','Floral hero + solid companions','Floral chiffon blouse + solid black tailored trousers + nude mule',
    'Single-pattern rule: does the engine favour the clean combination over multi-pattern alternatives?',
    [t,b,s], profile({ styleGoalPrimary:'romantic' }), 'brunch'));
}
{
  // PT2: Leather + silk intentional contrast
  const t = item({ id: 'pt2-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['date-dressy','night-out','event'] });
  const b = item({ id: 'pt2-bot1', category: 'bottom', subType: 'mini-skirt', colorFamily: 'black', fabric: 'leather', fit: 'slim', formalityLevel: 5, occasionTags: ['night-out','date-dressy'], rise: 'low' });
  const s = item({ id: 'pt2-shoe1', category: 'shoes', subType: 'ankle-boots', colorFamily: 'black', fabric: 'leather', formalityLevel: 5, occasionTags: ['night-out','casual'] });
  results.push(runScenario('PT2','Pattern/Texture','Leather+Silk: Intentional contrast','Cream silk blouse + black leather mini + ankle boots — intentional soft/hard mix',
    'Leather + silk is valid high-fashion; does texture scorer reward the contrast or penalise double-statement?',
    [t,b,s], profile({ styleGoalPrimary:'bold', bodyType:'hourglass', heightBand:'tall' }), 'date-dressy', null, [], [], EMPTY_AFFINITY, true));
}
{
  // PT3: Pattern mixing adversarial — stripe + check
  const t = item({ id: 'pt3-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'cotton', fit: 'slim', formalityLevel: 3, occasionTags: ['casual','work'], pattern: 'stripe' });
  const b = item({ id: 'pt3-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'beige', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','work'], rise: 'mid', pattern: 'check' });
  const s = item({ id: 'pt3-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'leather', formalityLevel: 3, occasionTags: ['casual','work'] });
  const solt = item({ id: 'pt3-top2', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'cotton', fit: 'slim', formalityLevel: 4, occasionTags: ['work','casual'], pattern: 'solid' });
  results.push(runScenario('PT3','Pattern/Texture','Pattern mix (adversarial): Stripe+Check','Stripe top vs solid navy top, both paired with check trousers',
    'Stripe + check pattern clash: engine patternSafety should heavily penalise; solid top should win.',
    [t,b,s,solt], profile({ styleGoalPrimary:'minimal' }), 'work'));
}
{
  // PT4: Multiple textures — velvet + denim
  const t = item({ id: 'pt4-top1', category: 'top', subType: 'blouse', colorFamily: 'burgundy', fabric: 'velvet', fit: 'slim', formalityLevel: 5, occasionTags: ['date-dressy','night-out','event'] });
  const b = item({ id: 'pt4-bot1', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const s = item({ id: 'pt4-shoe1', category: 'shoes', subType: 'ankle-boots', colorFamily: 'black', fabric: 'leather', formalityLevel: 4, occasionTags: ['casual','date-casual'] });
  results.push(runScenario('PT4','Pattern/Texture','Texture clash: Velvet+Denim','Burgundy velvet top + blue denim jeans — high-low texture combination',
    'High-low texture mix: intentional fashion-forward or incoherent? Formality mismatch (velvet=5, denim=2) is the real problem.',
    [t,b,s], profile({ styleGoalPrimary:'bold', bodyType:'rectangle' }), 'date-casual'));
}
{
  // PT5: Multiple statement fabrics competing
  const t = item({ id: 'pt5-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['event','date-dressy'] });
  const b = item({ id: 'pt5-bot1', category: 'bottom', subType: 'midi-skirt', colorFamily: 'black', fabric: 'velvet', fit: 'regular', formalityLevel: 6, occasionTags: ['event','date-dressy'], rise: 'mid' });
  const ow = item({ id: 'pt5-ow1', category: 'outerwear', subType: 'blazer', colorFamily: 'gold', fabric: 'satin', fit: 'tailored', formalityLevel: 6, occasionTags: ['event','date-dressy'] });
  const s = item({ id: 'pt5-shoe1', category: 'shoes', subType: 'stilettos', colorFamily: 'gold', fabric: 'leather', formalityLevel: 7, occasionTags: ['event','night-out'] });
  results.push(runScenario('PT5','Pattern/Texture','Three statement fabrics: Silk+Velvet+Satin','Cream silk + black velvet midi + gold satin blazer — three competing statements',
    'Too many statement fabrics at once — does the external rubric correctly identify the visual noise?',
    [t,b,ow,s], profile({ styleGoalPrimary:'bold', bodyType:'hourglass' }), 'event', null, [], [], EMPTY_AFFINITY, true));
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 7 — PERSONALISATION (5 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // PR1: Strong colour preference — loved navy items (affinity simulation via reactions)
  const t1 = item({ id: 'pr1-top1', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event'] });
  const t2 = item({ id: 'pr1-top2', category: 'top', subType: 'blouse', colorFamily: 'red', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual'] });
  const b = item({ id: 'pr1-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'pr1-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event'] });
  const navyFp = [t1.id, b.id, s.id].sort().join('|');
  const reactions: OutfitReaction[] = [{ id: 'r1', outfitFingerprint: navyFp, type: 'love', date: '2026-07-01', scenario: 'work' }];
  results.push(runScenario('PR1','Personalisation','Colour Affinity: Loved navy outfit','Navy silk blouse + black wool trousers vs red cotton top — loved reaction on navy outfit',
    'Reaction-based affinity: does the loved navy outfit rank higher than the unloved red alternative?',
    [t1,t2,b,s], profile({ styleGoalPrimary:'classic', bodyType:'hourglass' }), 'work', null, reactions));
}
{
  // PR2: Strong disliked combination — "not today" reaction
  const t1 = item({ id: 'pr2-top1', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event'] });
  const t2 = item({ id: 'pr2-top2', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'cotton', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch'] });
  const b = item({ id: 'pr2-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'pr2-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event'] });
  const navyFp = [t1.id, b.id, s.id].sort().join('|');
  const reactions: OutfitReaction[] = [{ id: 'r2', outfitFingerprint: navyFp, type: 'not-today', date: '2026-08-01', scenario: 'work' }];
  results.push(runScenario('PR2','Personalisation','Dislike Reaction: Navy outfit rejected','Navy outfit has "not today" reaction — white blouse outfit should rank higher',
    'Negative reaction penalty: does the rejected outfit move down in the ranking?',
    [t1,t2,b,s], profile({ styleGoalPrimary:'classic' }), 'work', null, reactions));
}
{
  // PR3: Recently worn favourite — freshness penalty test
  const t = item({ id: 'pr3-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch'] });
  const b = item({ id: 'pr3-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'camel', fabric: 'linen', fit: 'tailored', formalityLevel: 4, occasionTags: ['work'], rise: 'high' });
  const t2 = item({ id: 'pr3-top2', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'cotton', fit: 'slim', formalityLevel: 4, occasionTags: ['work'] });
  const s = item({ id: 'pr3-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','casual'] });
  const wornFp = [t.id, b.id, s.id].sort().join('|');
  const wearHistory: WearEntry[] = [{ id: 'w1', outfitFingerprint: wornFp, date: '2026-08-10', occasion: 'work', itemIds: wornFp.split('|'), loggedAt: '2026-08-10T12:00:00Z' }]; // worn yesterday
  const reactions: OutfitReaction[] = [{ id: 'r1', outfitFingerprint: wornFp, type: 'love', date: '2026-08-05', scenario: 'work' }];
  results.push(runScenario('PR3','Personalisation','Freshness: Loved outfit worn yesterday','Loved cream silk outfit worn yesterday vs fresh navy alternative — freshness penalty test',
    'Phase 3.1: recently worn loved outfit should rank below fresh equivalent due to freshness penalty (net boost ~+2 vs +0).',
    [t,b,t2,s], profile({ styleGoalPrimary:'elevated' }), 'work', null, reactions, wearHistory));
}
{
  // PR4: Style goal conflict — user is "minimal" but only has bold pieces available
  const t1 = item({ id: 'pr4-top1', category: 'top', subType: 'blouse', colorFamily: 'red', fabric: 'satin', fit: 'slim', formalityLevel: 5, occasionTags: ['event','night-out'], pattern: 'solid' });
  const t2 = item({ id: 'pr4-top2', category: 'top', subType: 't-shirt', colorFamily: 'orange', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const b = item({ id: 'pr4-bot1', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const s = item({ id: 'pr4-shoe1', category: 'shoes', subType: 'sneakers', colorFamily: 'white', fabric: 'synthetic', formalityLevel: 1, occasionTags: ['casual','active'] });
  results.push(runScenario('PR4','Personalisation','Style conflict: Minimal user, bold wardrobe','Minimal preference user only has bold/colourful pieces — engine forced to serve against preference',
    'When wardrobe contradicts style goal, does the engine produce contextually best available or does it fail silently?',
    [t1,t2,b,s], profile({ styleGoalPrimary:'minimal' }), 'casual'));
}
{
  // PR5: Personalisation test — A vs B users, same wardrobe, different profile
  const tNav = item({ id: 'pr5-top1', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'] });
  const tRed = item({ id: 'pr5-top2', category: 'top', subType: 'blouse', colorFamily: 'red', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual'] });
  const b = item({ id: 'pr5-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'pr5-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'black', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','casual'] });
  const profA = profile({ styleGoalPrimary:'minimal', undertone:'cool', bodyType:'hourglass' }); // minimalist classic
  const profB = profile({ styleGoalPrimary:'bold', undertone:'warm', bodyType:'pear' }); // bold colourful
  const rA = runScenario('PR5a','Personalisation','Personalisation A: Minimal+Classic vs Bold+Colourful (User A)',
    'Same wardrobe — minimal/classic user', 'Minimal user should rank navy+black outfit higher',
    [tNav,tRed,b,s], profA, 'work');
  const rB = runScenario('PR5b','Personalisation','Personalisation B: Minimal+Classic vs Bold+Colourful (User B)',
    'Same wardrobe — bold/colourful user', 'Bold user should get equally valid outcome',
    [tNav,tRed,b,s], profB, 'work');
  results.push(rA, rB);
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 8 — SCARCITY & EDGE CASES (5 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // SC1: Very small wardrobe (6 items)
  const t = item({ id: 'sc1-top1', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'cotton', fit: 'slim', formalityLevel: 3, occasionTags: ['casual','work'] });
  const b = item({ id: 'sc1-bot1', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const b2 = item({ id: 'sc1-bot2', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'cotton', fit: 'tailored', formalityLevel: 4, occasionTags: ['work'], rise: 'high' });
  const s = item({ id: 'sc1-shoe1', category: 'shoes', subType: 'sneakers', colorFamily: 'white', fabric: 'synthetic', formalityLevel: 1, occasionTags: ['casual','active'] });
  const s2 = item({ id: 'sc1-shoe2', category: 'shoes', subType: 'loafers', colorFamily: 'black', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','casual'] });
  const bg = item({ id: 'sc1-bag1', category: 'bag', subType: 'tote', colorFamily: 'black', fabric: 'leather', formalityLevel: 3, occasionTags: ['work','casual'] });
  results.push(runScenario('SC1','Scarcity','Very small wardrobe: 6 items','Only 6 garments total — limited combinatorial space',
    'Tiny wardrobe: engine must produce something, but quality may suffer. Does it handle gracefully?',
    [t,b,b2,s,s2,bg], profile({ styleGoalPrimary:'minimal' }), 'work'));
}
{
  // SC2: Missing footwear entirely
  const t = item({ id: 'sc2-top1', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event'] });
  const b = item({ id: 'sc2-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const ow = item({ id: 'sc2-ow1', category: 'outerwear', subType: 'blazer', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 6, occasionTags: ['work','event'] });
  const j = item({ id: 'sc2-jew1', category: 'jewelry', subType: 'earrings', colorFamily: 'gold', metalTone: 'gold', formalityLevel: 5, occasionTags: ['work','event'] });
  results.push(runScenario('SC2','Scarcity','No footwear in wardrobe','Complete clothing set but zero shoes — does the engine generate outfits without shoes?',
    'Missing shoe category: does the engine fail, omit shoes, or still generate valid outfits?',
    [t,b,ow,j], profile({ styleGoalPrimary:'classic' }), 'work'));
}
{
  // SC3: No ideal garment — work occasion with only casual items
  const t1 = item({ id: 'sc3-top1', category: 'top', subType: 't-shirt', colorFamily: 'grey', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const t2 = item({ id: 'sc3-top2', category: 'top', subType: 'hoodie', colorFamily: 'black', fabric: 'cotton', fit: 'oversized', formalityLevel: 1, occasionTags: ['casual','active'] });
  const b = item({ id: 'sc3-bot1', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const s = item({ id: 'sc3-shoe1', category: 'shoes', subType: 'sneakers', colorFamily: 'white', fabric: 'synthetic', formalityLevel: 1, occasionTags: ['casual','active'] });
  results.push(runScenario('SC3','Scarcity','No work items: casual-only wardrobe','All casual items for work occasion — what does the engine serve?',
    'Edge case: wardrobe has nothing tagged for work; engine may return empty or force closest match.',
    [t1,t2,b,s], profile({ styleGoalPrimary:'youthful' }), 'work'));
}
{
  // SC4: Missing outerwear in cold weather
  const t = item({ id: 'sc4-top1', category: 'top', subType: 'knit-top', colorFamily: 'cream', fabric: 'wool', fit: 'slim', formalityLevel: 3, occasionTags: ['casual','work'], warmthBand: 'cold' });
  const b = item({ id: 'sc4-bot1', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const s = item({ id: 'sc4-shoe1', category: 'shoes', subType: 'boots', colorFamily: 'black', fabric: 'leather', formalityLevel: 3, occasionTags: ['casual','work'] });
  results.push(runScenario('SC4','Scarcity','No outerwear in cold (3°C): engine forced to omit coat','Cold day, zero outerwear available — engine cannot include a coat',
    'Outerwear gating with no coat available: does the engine still produce an outfit, or does it return empty?',
    [t,b,s], profile({ styleGoalPrimary:'minimal' }), 'casual', coldWeather));
}
{
  // SC5: Duplicate-colour wardrobe
  const t1 = item({ id: 'sc5-top1', category: 'top', subType: 'blouse', colorFamily: 'black', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','event'] });
  const t2 = item({ id: 'sc5-top2', category: 'top', subType: 't-shirt', colorFamily: 'black', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const b1 = item({ id: 'sc5-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const b2 = item({ id: 'sc5-bot2', category: 'bottom', subType: 'jeans', colorFamily: 'black', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const s = item({ id: 'sc5-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event'] });
  results.push(runScenario('SC5','Scarcity','All-black wardrobe: duplicate colours','Everything is black — does the engine produce variety or only one valid outfit?',
    'Duplicate colour family wardrobe: diversity expected via fabric/formality differences; hero diversification should help.',
    [t1,t2,b1,b2,s], profile({ styleGoalPrimary:'elevated', undertone:'cool' }), 'work'));
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 9 — ADVERSARIAL (7 scenarios)
// ═══════════════════════════════════════════════════════════════════

{
  // AD1: Everything matches too closely — same shade, same fabric, same weight
  const t = item({ id: 'ad1-top1', category: 'top', subType: 't-shirt', colorFamily: 'grey', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const b = item({ id: 'ad1-bot1', category: 'bottom', subType: 'chinos', colorFamily: 'grey', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','work'], rise: 'mid' });
  const s = item({ id: 'ad1-shoe1', category: 'shoes', subType: 'sneakers', colorFamily: 'grey', fabric: 'synthetic', formalityLevel: 1, occasionTags: ['casual','active'] });
  const interesting = item({ id: 'ad1-top2', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 4, occasionTags: ['work','brunch'] });
  results.push(runScenario('AD1','Adversarial','Adversarial: Matchy-grey vs navy silk blouse','All-grey same-fabric outfit vs navy silk alternative — boring match vs genuine quality',
    'Mathematically safe (all grey passes constraints) but visually flat. Engine should prefer navy silk.',
    [t,b,s,interesting], profile({ styleGoalPrimary:'minimal' }), 'casual'));
}
{
  // AD2: Technically harmonious but visually boring — all beige, all cotton, all regular
  const t = item({ id: 'ad2-top1', category: 'top', subType: 'blouse', colorFamily: 'beige', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  const b = item({ id: 'ad2-bot1', category: 'bottom', subType: 'chinos', colorFamily: 'beige', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','work'], rise: 'mid' });
  const s = item({ id: 'ad2-shoe1', category: 'shoes', subType: 'espadrilles', colorFamily: 'tan', fabric: 'cotton', formalityLevel: 2, occasionTags: ['casual','brunch'] });
  const alt = item({ id: 'ad2-top2', category: 'top', subType: 'blouse', colorFamily: 'white', fabric: 'linen', fit: 'slim', formalityLevel: 3, occasionTags: ['casual','brunch'] });
  results.push(runScenario('AD2','Adversarial','Adversarial: Harmonic beige-cotton vs linen blouse','All-beige cotton outfit vs white linen alternative — harmonic but dull',
    'Colour scorer gives full marks for neutral+neutral, but visual interest should suffer — are these measured independently?',
    [t,b,s,alt], profile({ styleGoalPrimary:'minimal' }), 'brunch'));
}
{
  // AD3: Technically formal, socially wrong — gown to brunch
  const d = item({ id: 'ad3-dress1', category: 'dress', subType: 'gown', colorFamily: 'black', fabric: 'velvet', fit: 'slim', formalityLevel: 9, occasionTags: ['event','wedding'] });
  const s = item({ id: 'ad3-shoe1', category: 'shoes', subType: 'stilettos', colorFamily: 'black', fabric: 'leather', formalityLevel: 8, occasionTags: ['event','night-out'] });
  const casual = item({ id: 'ad3-dress2', category: 'dress', subType: 'sundress', colorFamily: 'floral', fabric: 'cotton', fit: 'regular', formalityLevel: 3, occasionTags: ['casual','brunch','resort'], pattern: 'floral' });
  const cs = item({ id: 'ad3-shoe2', category: 'shoes', subType: 'sandals', colorFamily: 'tan', fabric: 'leather', formalityLevel: 2, occasionTags: ['casual','brunch'] });
  results.push(runScenario('AD3','Adversarial','Adversarial: Gown vs sundress for brunch','Black velvet gown vs floral sundress for brunch occasion — formal but wrong',
    'Occasion filter: gown tagged for event/wedding, not brunch — should be eliminated from brunch pool.',
    [d,s,casual,cs], profile({ styleGoalPrimary:'romantic' }), 'brunch'));
}
{
  // AD4: Excellent colours, poor proportions
  const t = item({ id: 'ad4-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'oversized', formalityLevel: 4, occasionTags: ['work','brunch'] });
  const b = item({ id: 'ad4-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'camel', fabric: 'linen', fit: 'oversized', formalityLevel: 4, occasionTags: ['work','casual'], rise: 'low' });
  const s = item({ id: 'ad4-shoe1', category: 'shoes', subType: 'loafers', colorFamily: 'tan', fabric: 'leather', formalityLevel: 4, occasionTags: ['work','casual'] });
  results.push(runScenario('AD4','Adversarial','Adversarial: Beautiful colour, terrible proportion','Cream silk oversized + camel linen oversized + low rise — palette scores high, proportion fails',
    'Double-volume oversized + low-rise creates shapeless silhouette despite harmonious palette. Rubric divergence expected.',
    [t,b,s], profile({ bodyType: null, heightBand:'petite', styleGoalPrimary:'minimal' }), 'brunch'));
}
{
  // AD5: Excellent individual garments, incoherent overall (formality mismatch)
  const t = item({ id: 'ad5-top1', category: 'top', subType: 'blouse', colorFamily: 'ivory', fabric: 'silk', fit: 'slim', formalityLevel: 7, occasionTags: ['event','date-dressy'] });
  const b = item({ id: 'ad5-bot1', category: 'bottom', subType: 'jeans', colorFamily: 'blue', fabric: 'denim', fit: 'slim', formalityLevel: 2, occasionTags: ['casual'], rise: 'mid' });
  const s = item({ id: 'ad5-shoe1', category: 'shoes', subType: 'stilettos', colorFamily: 'black', fabric: 'leather', formalityLevel: 8, occasionTags: ['event','date-dressy'] });
  results.push(runScenario('AD5','Adversarial','Adversarial: Great pieces, formality mismatch','Ivory silk blouse (L7) + blue denim jeans (L2) + stilettos (L8) — incoherent formality',
    'Formality spread of 6 across core pieces. Engine hard-gate should penalise or reject; rubric coherence will score low.',
    [t,b,s], profile({ styleGoalPrimary:'elevated' }), 'work'));
}
{
  // AD6: Neutral wardrobe — most expensive-looking combo not most colourful
  const tSilk = item({ id: 'ad6-top1', category: 'top', subType: 'blouse', colorFamily: 'cream', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','brunch','event'] });
  const tCasual = item({ id: 'ad6-top2', category: 'top', subType: 't-shirt', colorFamily: 'yellow', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const b = item({ id: 'ad6-bot1', category: 'bottom', subType: 'wide-leg', colorFamily: 'stone', fabric: 'cashmere', fit: 'loose', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'ad6-shoe1', category: 'shoes', subType: 'mules', colorFamily: 'tan', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','brunch'] });
  results.push(runScenario('AD6','Adversarial','Adversarial: Quiet luxury vs colourful noise','Cream silk + cashmere wide-leg vs yellow cotton tee — luxury not colourful',
    'Does the engine rank the quiet luxury outfit (higher fabric quality, better formality alignment) above the colourful casual?',
    [tSilk,tCasual,b,s], profile({ styleGoalPrimary:'elevated', heightBand:'tall' }), 'work'));
}
{
  // AD7: Recently worn favourite vs weak fresh
  const tWorn = item({ id: 'ad7-top1', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work'] });
  const tFresh = item({ id: 'ad7-top2', category: 'top', subType: 't-shirt', colorFamily: 'grey', fabric: 'cotton', fit: 'regular', formalityLevel: 2, occasionTags: ['casual'] });
  const b = item({ id: 'ad7-bot1', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event'], rise: 'high' });
  const s = item({ id: 'ad7-shoe1', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work','event'] });
  const wornFp = [tWorn.id, b.id, s.id].sort().join('|');
  const wearHistory: WearEntry[] = [
    { id: 'wh1', outfitFingerprint: wornFp, date: '2026-08-10', occasion: 'work', itemIds: wornFp.split('|'), loggedAt: '2026-08-10T12:00:00Z' },
  ];
  const reactions: OutfitReaction[] = [
    { id: 'r1', outfitFingerprint: wornFp, type: 'love', date: '2026-07-15', scenario: 'work' },
    { id: 'r2', outfitFingerprint: wornFp, type: 'love', date: '2026-08-05', scenario: 'work' },
  ];
  results.push(runScenario('AD7','Adversarial','Adversarial: Loved worn-yesterday vs weak fresh','Loved navy silk outfit worn yesterday vs grey cotton tee — worn better overall but should yield to fresh on rotation',
    'Phase 3.1 key test: worn yesterday (−8 penalty) + 2 loves (+2 each) = net ~+6. Fresh weak outfit should NOT win — excellent loved outfit wins even recently worn.',
    [tWorn,tFresh,b,s], profile({ styleGoalPrimary:'classic' }), 'work', null, reactions, wearHistory));
}

// ─── Aggregate statistics ────────────────────────────────────────────────────

function grade(score: number) {
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 60) return 'Acceptable';
  if (score >= 50) return 'Weak';
  return 'Poor';
}

const allRubrics: RubricScore[] = results.flatMap(r => r.topOutfits.map(o => o.rubric));
const allScores = allRubrics.map(r => r.total);

const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
const sorted = [...allScores].sort((a, b) => a - b);
const median = sorted.length % 2 === 0
  ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  : sorted[Math.floor(sorted.length / 2)];

const dimMeans = {
  colour: mean(allRubrics.map(r => r.colour)),
  proportion: mean(allRubrics.map(r => r.proportion)),
  occasion: mean(allRubrics.map(r => r.occasion)),
  formality: mean(allRubrics.map(r => r.formality)),
  coherence: mean(allRubrics.map(r => r.coherence)),
  texture: mean(allRubrics.map(r => r.texture)),
  visualInterest: mean(allRubrics.map(r => r.visualInterest)),
  practicality: mean(allRubrics.map(r => r.practicality)),
  personalisation: mean(allRubrics.map(r => r.personalisation)),
  quietLuxury: mean(allRubrics.map(r => r.quietLuxury)),
};

const gradeDistribution = {
  Exceptional: allScores.filter(s => s >= 90).length,
  Excellent: allScores.filter(s => s >= 80 && s < 90).length,
  Strong: allScores.filter(s => s >= 70 && s < 80).length,
  Acceptable: allScores.filter(s => s >= 60 && s < 70).length,
  Weak: allScores.filter(s => s >= 50 && s < 60).length,
  Poor: allScores.filter(s => s < 50).length,
};

// Detect false positives: high internal score, low external score
const falsePositives = results.flatMap(r =>
  r.topOutfits
    .filter(o => o.rank === 1 && o.rubric.total < 60 && o.internalScore > 5)
    .map(o => ({ scenario: r.name, id: r.id, category: r.category, outfit: o, scenarioResult: r }))
).sort((a, b) => (b.outfit.internalScore - b.outfit.rubric.total) - (a.outfit.internalScore - a.outfit.rubric.total));

// Detect false negatives: best external score not rank #1
const falseNegatives = results.flatMap(r => {
  if (r.topOutfits.length < 2) return [];
  const best = r.topOutfits.reduce((a, b) => a.rubric.total > b.rubric.total ? a : b);
  const rank1 = r.topOutfits[0];
  if (best.rank > 1 && best.rubric.total > rank1.rubric.total + 5) {
    return [{ scenario: r.name, id: r.id, category: r.category, best, rank1, scenarioResult: r }];
  }
  return [];
});

console.log('=== BENCHMARK COMPLETE ===');
console.log(`Scenarios run: ${results.length}`);
console.log(`Outfits evaluated: ${allRubrics.length}`);
console.log(`Mean external quality: ${mean(allScores).toFixed(1)}/100`);
console.log(`Median: ${median}/100`);
console.log(`Min: ${Math.min(...allScores)}, Max: ${Math.max(...allScores)}`);
console.log('\nGrade distribution:');
Object.entries(gradeDistribution).forEach(([g, n]) => console.log(`  ${g}: ${n}`));
console.log('\nDimension means:');
Object.entries(dimMeans).forEach(([d, v]) => console.log(`  ${d}: ${v.toFixed(2)}/10`));
console.log(`\nFalse positives found: ${falsePositives.length}`);
console.log(`False negatives found: ${falseNegatives.length}`);

// Detailed output
console.log('\n\n=== SCENARIO DETAIL ===');
for (const r of results) {
  console.log(`\n[${r.id}] ${r.name}`);
  console.log(`  Category: ${r.category} | Occasion: ${r.targetOccasion} | Candidates: ${r.candidateCount}`);
  if (r.error) { console.log(`  ERROR: ${r.error}`); continue; }
  for (const o of r.topOutfits) {
    const items = o.resolvedItems.map(i => `${i.category}:${i.subType}(${i.colorFamily}/${i.fabric ?? '?'})`).join(', ');
    const bd = o.breakdown;
    console.log(`  [Rank ${o.rank}] internal=${o.internalScore.toFixed(1)} | external=${o.rubric.total}/100 (${grade(o.rubric.total)})`);
    console.log(`    Items: ${items}`);
    console.log(`    Rubric: col=${o.rubric.colour} prop=${o.rubric.proportion} occ=${o.rubric.occasion} form=${o.rubric.formality} coh=${o.rubric.coherence} tex=${o.rubric.texture} vi=${o.rubric.visualInterest} prac=${o.rubric.practicality} pers=${o.rubric.personalisation} ql=${o.rubric.quietLuxury}`);
    if (bd) {
      console.log(`    Engine breakdown: pal=${bd.palette} form=${bd.formalityCohesion} pat=${bd.patternSafety} prop=${bd.proportionBalance} body=${bd.bodyTypeProportion} rise=${bd.riseHarmony} tex=${bd.textureHarmony}`);
    }
    console.log(`    Reasons: colour="${o.reasons.colour}" | proportion="${o.reasons.proportion}"`);
    console.log(`             texture="${o.reasons.texture}" | vi="${o.reasons.visualInterest}" | ql="${o.reasons.quietLuxury}"`);
  }
}

console.log('\n\n=== FALSE POSITIVES (top 10) ===');
falsePositives.slice(0, 10).forEach((fp, i) => {
  console.log(`\n[FP${i + 1}] ${fp.scenario} (${fp.id})`);
  console.log(`  Internal score: ${fp.outfit.internalScore.toFixed(1)} | External: ${fp.outfit.rubric.total}/100 | Gap: ${(fp.outfit.internalScore * 10 - fp.outfit.rubric.total).toFixed(0)} pts`);
  const items = fp.outfit.resolvedItems.map(i => `${i.category}:${i.subType}(${i.colorFamily})`).join(', ');
  console.log(`  Items: ${items}`);
  console.log(`  Worst dim: ${Object.entries(fp.outfit.rubric).filter(([k]) => k !== 'total').sort((a, b) => (a[1] as number) - (b[1] as number)).slice(0,2).map(([k,v]) => `${k}=${v}`).join(', ')}`);
});

console.log('\n\n=== FALSE NEGATIVES (top 10) ===');
falseNegatives.slice(0, 10).forEach((fn, i) => {
  console.log(`\n[FN${i + 1}] ${fn.scenario} (${fn.id})`);
  console.log(`  Engine rank #1: internal=${fn.rank1.internalScore.toFixed(1)}, external=${fn.rank1.rubric.total}/100`);
  console.log(`  Better outfit at rank ${fn.best.rank}: internal=${fn.best.internalScore.toFixed(1)}, external=${fn.best.rubric.total}/100`);
  const bestItems = fn.best.resolvedItems.map(i => `${i.category}:${i.subType}(${i.colorFamily}/${i.fabric ?? '?'})`).join(', ');
  const rank1Items = fn.rank1.resolvedItems.map(i => `${i.category}:${i.subType}(${i.colorFamily}/${i.fabric ?? '?'})`).join(', ');
  console.log(`  Rank1 items: ${rank1Items}`);
  console.log(`  Better items: ${bestItems}`);
});

// Category aggregates
const byCategory: Record<string, number[]> = {};
for (const r of results) {
  if (!byCategory[r.category]) byCategory[r.category] = [];
  const top1 = r.topOutfits[0];
  if (top1) byCategory[r.category].push(top1.rubric.total);
}
console.log('\n\n=== BY CATEGORY (top-1 mean) ===');
Object.entries(byCategory).forEach(([cat, scores]) => {
  console.log(`  ${cat}: mean=${mean(scores).toFixed(1)} (${scores.length} scenarios)`);
});

// Phase 3.1 specific: freshness and rise evidence
console.log('\n\n=== PHASE 3.1 EVIDENCE ===');
const freshnessScenarios = results.filter(r => ['PR3', 'AD7'].includes(r.id));
freshnessScenarios.forEach(r => {
  console.log(`\nFreshness [${r.id}]: ${r.name}`);
  r.topOutfits.slice(0, 3).forEach(o => {
    const items = o.resolvedItems.map(i => `${i.subType}(${i.colorFamily})`).join('+');
    console.log(`  Rank ${o.rank}: ${items} | internal=${o.internalScore.toFixed(1)} | external=${o.rubric.total}`);
  });
});

const riseScenarios = results.filter(r => ['P3', 'P8', 'AD4'].includes(r.id));
riseScenarios.forEach(r => {
  console.log(`\nRise [${r.id}]: ${r.name}`);
  r.topOutfits.slice(0, 3).forEach(o => {
    const items = o.resolvedItems.map(i => `${i.subType}(${i.colorFamily},rise=${i.rise ?? 'n/a'},fit=${i.fit ?? 'n/a'})`).join('+');
    const rise = o.breakdown?.riseHarmony ?? 'n/a';
    console.log(`  Rank ${o.rank}: ${items} | riseHarmony=${rise} | internal=${o.internalScore.toFixed(1)} | external=${o.rubric.total}`);
  });
});

// Task #389 and #391 investigation
console.log('\n\n=== TASK #389 INVESTIGATION ===');
// Check if generateOutfitPool returns consistent scores across repeated calls
const t389 = item({ id: 't389-t', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work'] });
const b389 = item({ id: 't389-b', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work'], rise: 'high' });
const s389 = item({ id: 't389-s', category: 'shoes', subType: 'pumps', colorFamily: 'black', fabric: 'leather', formalityLevel: 6, occasionTags: ['work'] });
const items389 = [t389, b389, s389];
const prof389 = profile({ styleGoalPrimary: 'classic' });
const wh389: WearEntry[] = [{ id: 'w1', outfitFingerprint: [t389.id, b389.id, s389.id].sort().join('|'), date: '2026-08-10', occasion: 'work', itemIds: [t389.id, b389.id, s389.id].sort(), loggedAt: '2026-08-10T12:00:00Z' }];

// Run 1: no recent worn fingerprints passed to applyDailyRotation
const pool389_1 = generateOutfitPool(items389, prof389, null, [], '2026-08-11', wh389, EMPTY_AFFINITY, null, false);
const rot389_1a = applyDailyRotation(pool389_1, INITIAL_ROTATION_STATE, '2026-08-11', undefined, false, false);
const rot389_1b = applyDailyRotation(pool389_1, INITIAL_ROTATION_STATE, '2026-08-11', new Set(wh389.map(w => w.outfitFingerprint)), false, false);

console.log(`Run without recentWornFingerprints: ${rot389_1a.outfits.length} outfits`);
console.log(`Run with recentWornFingerprints: ${rot389_1b.outfits.length} outfits`);

// Check if wornHistoryBoost already applies the penalty at pool level
const poolWork389 = pool389_1['work'] ?? [];
const targetFp = wh389[0].outfitFingerprint;
const wornInPool = poolWork389.filter(o => o.components.map(c => c.matchedItemId).filter(Boolean).sort().join('|') === targetFp);
console.log(`Outfit with worn fingerprint found in pool: ${wornInPool.length}`);
if (wornInPool.length > 0) {
  console.log(`  confidenceScore: ${wornInPool[0].confidenceScore}`);
}
const unwornInPool = poolWork389.filter(o => o.components.map(c => c.matchedItemId).filter(Boolean).sort().join('|') !== targetFp);
console.log(`Other outfits in pool: ${unwornInPool.length}`);
// #389 conclusion: wornHistoryBoost applies at pool-generation time with the wearHistory array.
// applyDailyRotation's recentWornFingerprints is used only by applyFreshnessOrder (positional tiebreaker).
// So the concern is: if wearHistory passed to generateOutfitPool differs from the fingerprints passed to applyDailyRotation,
// the score penalty and positional tiebreaker use different data sources.
console.log('#389 CONCLUSION: wornHistoryBoost uses wearHistory at pool-generation time; applyFreshnessOrder uses recentWornFingerprints at rotation time.');
console.log('These are independent parameters. If they diverge (stale pool, fresh history), the score penalty would apply but the positional tiebreaker might not (or vice versa).');
console.log('In production, both come from the same AsyncStorage read in the same render cycle => THEORETICAL in current implementation.');

// Task #391: score consistency across scenarios
console.log('\n\n=== TASK #391 INVESTIGATION ===');
const t391 = item({ id: 't391-t', category: 'top', subType: 'blouse', colorFamily: 'navy', fabric: 'silk', fit: 'slim', formalityLevel: 5, occasionTags: ['work','date-casual','casual','brunch'] });
const b391 = item({ id: 't391-b', category: 'bottom', subType: 'trousers', colorFamily: 'black', fabric: 'wool', fit: 'tailored', formalityLevel: 5, occasionTags: ['work','event','date-casual'], rise: 'high' });
const s391 = item({ id: 't391-s', category: 'shoes', subType: 'loafers', colorFamily: 'black', fabric: 'leather', formalityLevel: 5, occasionTags: ['work','casual','date-casual','brunch'] });
const items391 = [t391, b391, s391];
const prof391 = profile({ styleGoalPrimary: 'classic' });
const targetFp391 = [t391.id, b391.id, s391.id].sort().join('|');
const pool391 = generateOutfitPool(items391, prof391, null, [], '2026-08-11', [], EMPTY_AFFINITY, null, true);

const occasions391: OccasionTag[] = ['work', 'casual', 'date-casual', 'brunch'];
occasions391.forEach(occ => {
  const occPool = pool391[occ] ?? [];
  const match = occPool.find(o => o.components.map(c => c.matchedItemId).filter(Boolean).sort().join('|') === targetFp391);
  console.log(`Occasion ${occ}: outfit score=${match ? (match.confidenceScore ?? 0).toFixed(2) : 'not in pool'}`);
});
console.log('#391 CONCLUSION: If the same outfit appears in multiple occasion pools, its confidenceScore LEGITIMATELY differs because scoreOutfitCombo receives the season context but the formality/occasion gating varies by scenario. The first-occurrence-wins dedup then arbitrarily picks one score. This is a real (not theoretical) inconsistency, but whether it harms users depends on which occasion pool first encounters the outfit.');
