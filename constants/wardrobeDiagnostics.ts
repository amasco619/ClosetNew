import { WardrobeItem, UserProfile, OccasionTag, ItemCategory } from '@/constants/types';
import { WardrobeSlot } from '@/constants/wardrobeBlueprint';

const NEUTRAL_COLORS = new Set([
  'black', 'white', 'grey', 'beige', 'cream', 'navy', 'camel', 'brown', 'olive',
]);

const SCENARIO_AFFINITY: Record<OccasionTag, string[]> = {
  casual:    ['t-shirt', 'long-sleeve', 'henley', 'sweater', 'jeans', 'chinos', 'shorts', 'leggings', 'sneakers', 'flats', 'crossbody', 'backpack', 'hoodie', 'cardigan', 'denim-jacket'],
  work:      ['blouse', 'shirt', 'polo-shirt', 'sweater', 'trousers', 'chinos', 'midi-skirt', 'blazer', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch'],
  date:      ['blouse', 'camisole', 'midi-dress', 'wrap-dress', 'mini-dress', 'midi-skirt', 'heels', 'mules', 'flats', 'clutch', 'mini-bag', 'crossbody', 'earrings', 'necklace'],
  event:     ['cocktail-dress', 'midi-dress', 'maxi-dress', 'blouse', 'wide-leg', 'blazer', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  interview: ['blouse', 'shirt', 'blazer', 'trousers', 'midi-skirt', 'midi-dress', 'coat', 'heels', 'flats', 'loafers', 'tote', 'shoulder-bag', 'earrings', 'watch'],
  wedding:   ['midi-dress', 'maxi-dress', 'cocktail-dress', 'wrap-dress', 'midi-skirt', 'blouse', 'heels', 'clutch', 'mini-bag', 'earrings', 'necklace', 'bracelet'],
  travel:    ['t-shirt', 'long-sleeve', 'sweater', 'shirt', 'jeans', 'chinos', 'trousers', 'sneakers', 'flats', 'boots', 'crossbody', 'backpack', 'tote', 'blazer', 'cardigan', 'denim-jacket'],
};

function scoreForScenario(item: WardrobeItem, scenario: OccasionTag): number {
  let score = 0;
  if (item.occasionTags.includes(scenario)) score += 4;
  if (SCENARIO_AFFINITY[scenario].includes(item.subType)) score += 2;
  return score;
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  top: 'Tops', bottom: 'Bottoms', dress: 'Dresses',
  outerwear: 'Outerwear', shoes: 'Shoes', bag: 'Bags', jewelry: 'Jewelry',
};

const IDEAL_CATEGORY_RANGE: Record<ItemCategory, [number, number]> = {
  top:      [0.20, 0.35],
  bottom:   [0.12, 0.28],
  dress:    [0.08, 0.22],
  outerwear:[0.08, 0.22],
  shoes:    [0.08, 0.22],
  bag:      [0.04, 0.16],
  jewelry:  [0.04, 0.16],
};

export interface CategoryStat {
  category: ItemCategory;
  label: string;
  count: number;
  percentage: number;
  status: 'good' | 'low' | 'missing';
}

export interface ColorStat {
  color: string;
  count: number;
  isNeutral: boolean;
  hex: string;
}

export interface ScenarioCoverage {
  scenario: OccasionTag;
  label: string;
  icon: string;
  scoringItems: number;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface VersatileItem {
  label: string;
  scenarioCount: number;
  category: ItemCategory;
}

export interface GapItem {
  priority: 'high' | 'medium';
  category: ItemCategory;
  categoryLabel: string;
  suggestion: string;
  reason: string;
}

export interface WardrobeDiagnostics {
  totalItems: number;
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  interpretation: string;

  categoryStats: CategoryStat[];
  balanceScore: number;

  colorStats: ColorStat[];
  neutralCount: number;
  accentCount: number;
  neutralRatio: number;
  paletteScore: number;
  paletteNote: string;
  topColors: ColorStat[];

  scenarioCoverage: ScenarioCoverage[];
  coverageScore: number;
  strongScenarios: number;

  versatileItems: VersatileItem[];
  versatilityScore: number;
  multiOccasionCount: number;

  gaps: GapItem[];
  blueprintCompletion: number;
  blueprintOwned: number;
  blueprintTotal: number;
}

const COLOR_HEX: Record<string, string> = {
  black: '#1a1a1a', white: '#f5f5f5', navy: '#1B2A4A', beige: '#D4C5A9',
  grey: '#8B8B8B', brown: '#6B4226', red: '#C0392B', pink: '#E8A0BF',
  blue: '#3498DB', green: '#27AE60', burgundy: '#7D2027', cream: '#FFFDD0',
  olive: '#556B2F', camel: '#C19A6B', lavender: '#B57EDC', coral: '#FF7F50',
  gold: '#D4AF37', silver: '#C0C0C0',
};

const SCENARIO_META: Record<OccasionTag, { label: string; icon: string }> = {
  casual:    { label: 'Casual',    icon: 'cafe-outline' },
  work:      { label: 'Work',      icon: 'briefcase-outline' },
  date:      { label: 'Date',      icon: 'heart-outline' },
  event:     { label: 'Event',     icon: 'sparkles-outline' },
  interview: { label: 'Interview', icon: 'mic-outline' },
  wedding:   { label: 'Wedding',   icon: 'rose-outline' },
  travel:    { label: 'Travel',    icon: 'airplane-outline' },
};

function gradeScore(score: number): WardrobeDiagnostics['grade'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function interpretScore(score: number, totalItems: number): string {
  if (totalItems === 0) return 'Add items to your wardrobe to get your analysis.';
  if (score >= 85) return 'Your wardrobe is well-rounded and working hard for you.';
  if (score >= 70) return 'Strong foundation with a few areas to refine.';
  if (score >= 55) return 'Decent start — some strategic additions will unlock more looks.';
  if (score >= 40) return 'Your wardrobe has gaps that limit daily styling options.';
  return 'A few targeted pieces could transform your dressing experience.';
}

export function computeDiagnostics(
  items: WardrobeItem[],
  profile: UserProfile,
  slots: WardrobeSlot[],
): WardrobeDiagnostics {
  const totalItems = items.length;

  // ── 1. Category Balance ─────────────────────────────────────────────────
  const categoryCounts: Partial<Record<ItemCategory, number>> = {};
  for (const item of items) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  }

  const ALL_CATEGORIES: ItemCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry'];
  const categoryStats: CategoryStat[] = ALL_CATEGORIES.map(cat => {
    const count = categoryCounts[cat] || 0;
    const percentage = totalItems > 0 ? count / totalItems : 0;
    const [lo, hi] = IDEAL_CATEGORY_RANGE[cat];
    let status: CategoryStat['status'] = 'good';
    if (count === 0) status = 'missing';
    else if (percentage < lo * 0.6) status = 'low';
    return { category: cat, label: CATEGORY_LABELS[cat], count, percentage, status };
  });

  const missingCount = categoryStats.filter(c => c.status === 'missing').length;
  const lowCount = categoryStats.filter(c => c.status === 'low').length;
  const balanceScore = totalItems === 0 ? 0
    : Math.max(0, 30 - missingCount * 6 - lowCount * 3);

  // ── 2. Colour Palette ───────────────────────────────────────────────────
  const colorCounts: Record<string, number> = {};
  for (const item of items) {
    colorCounts[item.colorFamily] = (colorCounts[item.colorFamily] || 0) + 1;
  }

  const colorStats: ColorStat[] = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([color, count]) => ({
      color,
      count,
      isNeutral: NEUTRAL_COLORS.has(color),
      hex: COLOR_HEX[color] || '#9CA3AF',
    }));

  const neutralCount = colorStats.filter(c => c.isNeutral).reduce((s, c) => s + c.count, 0);
  const accentCount = totalItems - neutralCount;
  const neutralRatio = totalItems > 0 ? neutralCount / totalItems : 0;
  const topColors = colorStats.slice(0, 6);

  let paletteScore = 20;
  let paletteNote = '';
  if (totalItems === 0) {
    paletteScore = 0;
    paletteNote = 'No items to analyse yet.';
  } else if (neutralRatio > 0.85) {
    paletteScore = 12;
    paletteNote = 'Very neutral — add a pop of colour to create interest.';
  } else if (neutralRatio < 0.35) {
    paletteScore = 10;
    paletteNote = 'Heavy on accents — more neutrals will make coordination easier.';
  } else if (neutralRatio >= 0.55 && neutralRatio <= 0.80) {
    paletteScore = 20;
    paletteNote = 'Balanced — good neutral base with colour accents that mix well.';
  } else {
    paletteScore = 16;
    paletteNote = 'Nearly balanced — a couple of neutral pieces would strengthen cohesion.';
  }

  // ── 3. Scenario Coverage ────────────────────────────────────────────────
  const ALL_SCENARIOS: OccasionTag[] = ['casual', 'work', 'date', 'event', 'interview', 'wedding', 'travel'];

  const scenarioCoverage: ScenarioCoverage[] = ALL_SCENARIOS.map(scenario => {
    const scoringItems = items.filter(i => scoreForScenario(i, scenario) > 0).length;
    const strength: ScenarioCoverage['strength'] =
      scoringItems >= 5 ? 'strong' : scoringItems >= 2 ? 'moderate' : 'weak';
    return {
      scenario,
      label: SCENARIO_META[scenario].label,
      icon: SCENARIO_META[scenario].icon,
      scoringItems,
      strength,
    };
  });

  const strongScenarios = scenarioCoverage.filter(s => s.strength === 'strong').length;
  const moderateScenarios = scenarioCoverage.filter(s => s.strength === 'moderate').length;
  const coverageScore = Math.min(25,
    strongScenarios * 4 + moderateScenarios * 2
  );

  // ── 4. Versatility ──────────────────────────────────────────────────────
  const itemVersatility = items.map(item => {
    const scenarioCount = ALL_SCENARIOS.filter(s => scoreForScenario(item, s) > 0).length;
    return {
      item,
      scenarioCount,
      label: `${item.colorFamily} ${item.subType.replace(/-/g, ' ')}`,
    };
  });

  const multiOccasionCount = itemVersatility.filter(v => v.scenarioCount >= 3).length;
  const versatilityRatio = totalItems > 0 ? multiOccasionCount / totalItems : 0;

  const versatileItems: VersatileItem[] = itemVersatility
    .sort((a, b) => b.scenarioCount - a.scenarioCount)
    .slice(0, 3)
    .map(v => ({ label: v.label, scenarioCount: v.scenarioCount, category: v.item.category }));

  const versatilityScore = Math.min(15, Math.round(versatilityRatio * 20));

  // ── 5. Blueprint Completion ─────────────────────────────────────────────
  const blueprintTotal = slots.length;
  const blueprintOwned = slots.filter(s => s.status === 'owned').length;
  const blueprintCompletion = blueprintTotal > 0 ? blueprintOwned / blueprintTotal : 0;

  // ── 6. Gap Analysis ─────────────────────────────────────────────────────
  const gaps: GapItem[] = [];

  for (const stat of categoryStats) {
    if (stat.status === 'missing') {
      gaps.push({
        priority: 'high',
        category: stat.category,
        categoryLabel: stat.label,
        suggestion: `Add at least one ${stat.label.slice(0, -1).toLowerCase()} to your wardrobe`,
        reason: `You have no ${stat.label.toLowerCase()} — this blocks many outfit combinations`,
      });
    }
  }

  const workItems = items.filter(i => scoreForScenario(i, 'work') > 0).length;
  const hasBlazer = items.some(i => i.subType === 'blazer' || i.subType === 'coat');
  if (profile.lifestyleWork > 40 && !hasBlazer && workItems < 3) {
    gaps.push({
      priority: 'high',
      category: 'outerwear',
      categoryLabel: 'Outerwear',
      suggestion: 'A navy or black blazer',
      reason: `Your lifestyle is work-heavy (${profile.lifestyleWork}%) but your wardrobe lacks a polishing layer`,
    });
  }

  const hasNeutralShoe = items.some(i => i.category === 'shoes' && NEUTRAL_COLORS.has(i.colorFamily));
  if (items.some(i => i.category === 'shoes') && !hasNeutralShoe) {
    gaps.push({
      priority: 'medium',
      category: 'shoes',
      categoryLabel: 'Shoes',
      suggestion: 'A neutral-toned shoe (black, beige, or white)',
      reason: 'Neutral shoes coordinate with everything — currently your shoes are all accent colours',
    });
  }

  const hasBag = items.some(i => i.category === 'bag');
  const hasStructuredBag = items.some(i => i.category === 'bag' && ['tote', 'shoulder-bag'].includes(i.subType));
  if (hasBag && !hasStructuredBag) {
    gaps.push({
      priority: 'medium',
      category: 'bag',
      categoryLabel: 'Bags',
      suggestion: 'A structured tote or shoulder bag',
      reason: 'Small bags limit your daily carrying capacity — a tote adds practicality and polish',
    });
  }

  const eveningCoverage = scenarioCoverage.find(s => s.scenario === 'event');
  if (eveningCoverage && eveningCoverage.strength === 'weak') {
    gaps.push({
      priority: 'medium',
      category: 'dress',
      categoryLabel: 'Dresses',
      suggestion: 'A versatile dark-toned dress (black or navy)',
      reason: 'Your wardrobe has weak event coverage — one statement dress unlocks many occasions',
    });
  }

  const jewelryCount = items.filter(i => i.category === 'jewelry').length;
  if (jewelryCount === 0 && totalItems >= 4) {
    gaps.push({
      priority: 'medium',
      category: 'jewelry',
      categoryLabel: 'Jewelry',
      suggestion: 'A pair of gold hoop earrings',
      reason: 'The fastest way to elevate any outfit — one piece of jewelry transforms a look',
    });
  }

  const topGaps = gaps.slice(0, 5);

  // ── 7. Overall Score ────────────────────────────────────────────────────
  const blueprintBonus = Math.min(10, Math.round(blueprintCompletion * 10));
  const rawScore = balanceScore + paletteScore + coverageScore + versatilityScore + blueprintBonus;
  const overallScore = Math.min(100, Math.max(0, rawScore));
  const grade = gradeScore(overallScore);
  const interpretation = interpretScore(overallScore, totalItems);

  return {
    totalItems,
    overallScore,
    grade,
    interpretation,
    categoryStats,
    balanceScore,
    colorStats,
    neutralCount,
    accentCount,
    neutralRatio,
    paletteScore,
    paletteNote,
    topColors,
    scenarioCoverage,
    coverageScore,
    strongScenarios,
    versatileItems,
    versatilityScore,
    multiOccasionCount,
    gaps: topGaps,
    blueprintCompletion,
    blueprintOwned,
    blueprintTotal,
  };
}
