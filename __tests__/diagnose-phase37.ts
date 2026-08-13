/**
 * Phase 3.7 Diagnostic Script
 * Traces the internal pipeline for B03, B24, C09 (candidate-gen failures)
 * and B15 (rain-ranking failure) to determine root causes.
 *
 * Run: npx tsx __tests__/diagnose-phase37.ts
 * Does NOT modify any production code.
 */

import {
  pickHeroCandidates, effectiveFormality, getScenarioFormality,
  scoreItemForProfile, distinctivenessScore, recedeScore,
} from '../constants/outfitScoring';
import { generateOutfitPool } from '../constants/outfitRotation';
import { colorsHarmonize, passesConstraints, itemFitsSeason } from '../constants/outfitScoring';
import { isRainFriendly, isRainy, outerwearRule } from '../constants/weatherPure';
import type { WardrobeItem, UserProfile, OccasionTag, WeatherSnapshot } from '../constants/types';

// ─── Helpers (same as benchmark) ─────────────────────────────────────────────

const PH = 'test://ph';
const CREATED = '2025-01-01T00:00:00Z';

function mk(
  id: string,
  category: WardrobeItem['category'],
  subType: string,
  colorFamily: string,
  occasionTags: OccasionTag[],
  extra: Partial<WardrobeItem> = {},
): WardrobeItem {
  return {
    id, photoUri: PH, category, subType, colorFamily,
    occasionTags, seasonTags: ['all-season'],
    formalityLevel: 5, createdAt: CREATED, ...extra,
  };
}

function mkp(o: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Test User',
    bodyType: null, eyeColor: null, skinTone: null, undertone: null,
    styleGoalPrimary: null, styleGoalSecondary: null,
    lifestyleWork: 3, lifestyleCasual: 3, lifestyleEvents: 2,
    lifestyleActive: 2, lifestyleBrunch: 2,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
    onboardingComplete: true,
    ...o,
  };
}

const MILD: WeatherSnapshot = {
  fetchedAt: 0, lat: 0, lon: 0,
  currentTempC: 16, highC: 20, lowC: 10,
  precipProbability: 0.15, source: 'gps',
};
const RAINY: WeatherSnapshot = {
  fetchedAt: 0, lat: 0, lon: 0,
  currentTempC: 15, highC: 18, lowC: 10,
  precipProbability: 0.85, source: 'gps',
};

const DIV = '─'.repeat(60);

function printSection(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ─── Track 3.7A: Candidate Generation Investigation ───────────────────────────

function diagnoseCG(
  id: string,
  label: string,
  items: WardrobeItem[],
  profile: UserProfile,
  target: OccasionTag,
  weather: WeatherSnapshot | null,
) {
  printSection(`DIAGNOSE ${id}: ${label}`);
  console.log(`  Target: ${target}`);

  // Step 1: passesConstraints + season filter
  const season = 'summer' as const; // 2026-08-12 is summer
  const eligible = items
    .filter(i => passesConstraints(i, profile))
    .filter(i => itemFitsSeason(i, season));
  console.log(`\n  Step 1 — Eligible after constraints+season: ${eligible.length}/${items.length}`);
  const removed = items.filter(i => !eligible.includes(i));
  if (removed.length > 0) {
    console.log(`  Removed by constraints/season:`);
    removed.forEach(i => console.log(`    - ${i.id} (${i.subType}/${i.colorFamily})`));
  }

  // Step 2: Hero candidates
  const [minF, maxF] = getScenarioFormality(target, profile);
  console.log(`\n  Step 2 — Scenario formality range: [${minF}, ${maxF}]`);
  const heroes = pickHeroCandidates(eligible, target, profile, 6);
  console.log(`  Heroes selected (score ≥ 4): ${heroes.length}`);
  heroes.forEach(h => {
    const f = effectiveFormality(h);
    const ds = distinctivenessScore(h, profile);
    const sp = 0.1 * scoreItemForProfile(h, target, profile);
    console.log(`    - ${h.id} (${h.subType}/${h.colorFamily}) F=${f} ds=${ds.toFixed(1)} sp=${sp.toFixed(1)} total=${(ds+sp).toFixed(1)}`);
  });

  // Step 3: Check non-hero items (what score did they get?)
  console.log(`\n  Step 3 — Non-hero eligible items (scored <4 or non-hero category):`);
  const heroCats = new Set(['top', 'bottom', 'dress', 'outerwear', 'shoes']);
  eligible.forEach(item => {
    if (heroes.includes(item)) return;
    const f = effectiveFormality(item);
    const inFormality = f >= minF - 1 && f <= maxF + 1;
    if (heroCats.has(item.category)) {
      const ds = distinctivenessScore(item, profile);
      const sp = 0.1 * scoreItemForProfile(item, target, profile);
      const total = ds + sp;
      console.log(`    BELOW THRESHOLD: ${item.id} (${item.subType}/${item.colorFamily}) F=${f} inFormalityBand=${inFormality} ds=${ds.toFixed(1)} sp=${sp.toFixed(1)} total=${total.toFixed(1)} [threshold=4]`);
    }
  });

  // Step 4: Try to build cores manually — check coreFitsScenario
  console.log(`\n  Step 4 — Core assembly attempts (fallback path: all dresses + tops×bottoms):`);
  const dresses   = eligible.filter(i => i.category === 'dress');
  const tops      = eligible.filter(i => i.category === 'top');
  const bottoms   = eligible.filter(i => i.category === 'bottom');
  const shoesAll  = eligible.filter(i => i.category === 'shoes');

  let validCores = 0;
  dresses.forEach(d => {
    const f = effectiveFormality(d);
    const avg = f;
    const passes = avg >= minF && avg <= maxF;
    console.log(`    Dress ${d.id} (${d.subType}) F=${f} avg=${avg} corePasses=${passes}`);
    if (passes) validCores++;
  });

  tops.slice(0, 6).forEach(top => {
    const harmoniousBottoms = bottoms.filter(b => colorsHarmonize(top.colorFamily, b.colorFamily));
    const bottomList = harmoniousBottoms.length > 0 ? harmoniousBottoms.slice(0, 2) : bottoms.slice(0, 1);
    bottomList.forEach(bot => {
      const fs = [effectiveFormality(top), effectiveFormality(bot)];
      const avg = (fs[0] + fs[1]) / 2;
      const passes = avg >= minF && avg <= maxF;
      const harmonizes = colorsHarmonize(top.colorFamily, bot.colorFamily);
      console.log(`    Top+Bot: ${top.id}(${top.subType},F${fs[0]}) + ${bot.id}(${bot.subType},F${fs[1]}) avg=${avg} harmonize=${harmonizes} corePasses=${passes}`);
      if (passes) validCores++;
    });
  });

  // Step 5: Check shoe availability for sample valid cores
  console.log(`\n  Step 5 — Shoe availability for core base 'first dress or top':`);
  const sampleBase = dresses[0] ?? tops[0];
  if (sampleBase) {
    const baseColor = sampleBase.colorFamily;
    const harmShoes = shoesAll.filter(s => colorsHarmonize(baseColor, s.colorFamily));
    const otherShoes = shoesAll.filter(s => !harmShoes.includes(s));
    console.log(`    Base color: ${baseColor}`);
    console.log(`    Harmonious shoes: ${harmShoes.map(s => `${s.id}(${s.colorFamily})`).join(', ') || 'NONE'}`);
    console.log(`    Fallback shoes: ${otherShoes.map(s => `${s.id}(${s.colorFamily})`).join(', ') || 'NONE'}`);
    console.log(`    Total shoe options: ${Math.max(harmShoes.length, otherShoes.length)} (pool would be ${harmShoes.length > 0 ? 'harmShoes' : 'otherShoes'})`);
  }

  // Step 6: Formaliy spread check for a sample assembled outfit
  console.log(`\n  Step 6 — Formality spread check on sample assembled outfit:`);
  const sampleCore = dresses[0] ?? (tops[0] && bottoms[0] ? null : null);
  if (dresses[0]) {
    const allSample = [dresses[0], shoesAll[0]].filter(Boolean);
    const fs2 = allSample.map(effectiveFormality);
    const spread = Math.max(...fs2) - Math.min(...fs2);
    console.log(`    Dress+shoe: ${allSample.map(i => `${i.id}(F${effectiveFormality(i)})`).join(' + ')}`);
    console.log(`    Spread = ${spread} (threshold: >3 = rejected)`);
  }

  // Step 7: Independent validity check — is there a valid brunch outfit?
  console.log(`\n  Step 7 — INDEPENDENT VALIDITY CHECK:`);
  console.log(`  Can a valid ${target} outfit be constructed from this wardrobe?`);
  let validOutfitExists = false;
  for (const top of tops) {
    for (const bot of bottoms) {
      const fs3 = [effectiveFormality(top), effectiveFormality(bot)];
      const avg = (fs3[0] + fs3[1]) / 2;
      if (avg < minF || avg > maxF) continue;
      for (const shoe of shoesAll) {
        const allFs = [effectiveFormality(top), effectiveFormality(bot), effectiveFormality(shoe)];
        const spread = Math.max(...allFs) - Math.min(...allFs);
        if (spread > 3) continue;
        // Valid outfit found!
        validOutfitExists = true;
        console.log(`  → VALID outfit exists: ${top.subType}(F${fs3[0]}) + ${bot.subType}(F${fs3[1]}) + ${shoe.subType}(F${effectiveFormality(shoe)}) avg=${avg} spread=${spread}`);
        break;
      }
      if (validOutfitExists) break;
    }
    if (validOutfitExists) break;
  }
  for (const dress of dresses) {
    if (validOutfitExists) break;
    const fD = effectiveFormality(dress);
    if (fD < minF || fD > maxF) continue;
    for (const shoe of shoesAll) {
      const allFs = [fD, effectiveFormality(shoe)];
      const spread = Math.max(...allFs) - Math.min(...allFs);
      if (spread > 3) continue;
      validOutfitExists = true;
      console.log(`  → VALID outfit exists: ${dress.subType}(F${fD}) + ${shoe.subType}(F${effectiveFormality(shoe)}) spread=${spread}`);
      break;
    }
  }
  if (!validOutfitExists) {
    console.log(`  → NO valid outfit exists with these items under ${target}[${minF},${maxF}] constraints.`);
    console.log(`  → CLASSIFICATION: LEGITIMATE EMPTY (not a false-empty)`);
  } else {
    console.log(`  → CLASSIFICATION: FALSE EMPTY / CANDIDATE GENERATION DEFECT`);
    console.log(`  → A valid outfit EXISTS but the pipeline failed to discover it.`);
  }

  // Step 8: Run actual pipeline and confirm
  const pool = generateOutfitPool(items, profile, undefined, [], '2026-08-12', [], undefined, weather);
  const result = pool[target] ?? [];
  console.log(`\n  Step 8 — Actual pipeline result: pool.${target}.length = ${result.length}`);
  console.log();
}

// ─── Track 3.7B: B15 Rain Ranking Investigation ───────────────────────────────

function diagnoseB15() {
  printSection('DIAGNOSE B15: Rain-ranking failure');

  const profile = mkp({ bodyType: 'pear', undertone: 'cool', skinTone: 'light' });
  const items: WardrobeItem[] = [
    mk('b15-t1','top','long-sleeve','black',['casual'],{ warmthBand:'cool' }),
    mk('b15-t2','top','blouse',    'cream', ['casual','brunch'],              ),
    mk('b15-t3','top','knit-top',  'grey',  ['casual'],{ warmthBand:'cool'  }),
    mk('b15-b1','bottom','jeans',  'black', ['casual'],),
    mk('b15-b2','bottom','trousers','black',['casual','work'],{ warmthBand:'cool' }),
    mk('b15-d1','dress','midi-dress','grey', ['casual','brunch'],             ),
    mk('b15-o1','outerwear','trench','black',['casual','work'],{ warmthBand:'mild', fabric:'cotton' }),
    mk('b15-o2','outerwear','coat', 'camel',['casual'],{ warmthBand:'cold', fabric:'wool' }),
    mk('b15-s1','shoes','boots',   'black', ['casual'],{ warmthBand:'cool'  }),
    mk('b15-s2','shoes','ankle-boots','black',['casual'],),
    mk('b15-s3','shoes','sandals', 'tan',   ['casual'],{ warmthBand:'hot'   }), // rain-averse?
    mk('b15-g1','bag','tote',      'black', ['casual'],{ fabric:'leather'   }),
    mk('b15-g2','bag','crossbody', 'navy',  ['casual'],),
    mk('b15-g3','bag','wicker-bag','natural',['casual','resort'],),
    mk('b15-j1','jewelry','earrings','gold', ['casual'],{ metalTone:'gold' }),
  ];

  console.log('\n  Weather: RAINY (precip=85%)');
  console.log(`  isRainy: ${isRainy(RAINY)}`);
  console.log(`  outerwearRule: ${outerwearRule(RAINY)}`);

  // Check each item's rain-friendliness
  console.log('\n  Item rain-friendliness:');
  items.forEach(item => {
    const rf = isRainFriendly(item);
    const f = effectiveFormality(item);
    console.log(`    ${item.id} (${item.subType}/${item.colorFamily}): rainFriendly=${rf} F=${f}`);
  });

  // Check which shoes survive rain gate
  const shoes = items.filter(i => i.category === 'shoes');
  console.log('\n  Shoes after rain hero gate:');
  shoes.forEach(s => {
    const heroGatePasses = isRainFriendly(s);
    console.log(`    ${s.id} (${s.subType}) rainFriendly=${heroGatePasses}`);
  });

  // Note: rain gate for HEROES only applies to outerwear heroes
  // (line 327: if (wxRainy && !isRainFriendly(h)) return false — only for outerwear category)
  // Shoe heroes are NOT rain-gated at the hero stage
  console.log('\n  NOTE: isRainFriendly check only applies to outerwear HEROES in generateOutfitPool');
  console.log('  Shoe rain-appropriateness is NOT checked at hero or shoe-selection stages');
  console.log('  → Rain-inappropriate shoes can enter the pool and be ranked by score alone');

  // Run pipeline and examine all pool candidates
  const pool = generateOutfitPool(items, profile, undefined, [], '2026-08-12', [], undefined, RAINY);
  const casualPool = pool['casual'] ?? [];
  console.log(`\n  Pool size for casual: ${casualPool.length}`);

  // Reconstruct items by id for lookup
  const itemMap = new Map(items.map(i => [i.id, i]));

  casualPool.forEach((outfit, idx) => {
    const outfitItems = outfit.components
      .map(c => c.matchedItemId ? itemMap.get(c.matchedItemId) : undefined)
      .filter((i): i is WardrobeItem => !!i);

    const shoes = outfitItems.filter(i => i.category === 'shoes');
    const hasRainIssue = shoes.some(s => !isRainFriendly(s));
    const shoeDesc = shoes.map(s => `${s.subType}(${isRainFriendly(s) ? 'rain-ok' : 'RAIN-AVERSE'})`).join(', ');

    console.log(`\n  #${idx + 1} [score=${outfit.confidenceScore}] ${hasRainIssue ? '⚠ RAIN-INAPPROPRIATE' : '✓ rain-ok'}`);
    console.log(`    Shoes: ${shoeDesc}`);
    console.log(`    Items: ${outfitItems.map(i => `${i.subType}(${i.colorFamily})`).join(' + ')}`);
  });

  // Check: are rain-appropriate shoes being deprioritised by recedeScore?
  console.log('\n  Receede score analysis for shoes vs. black long-sleeve hero:');
  const heroItem = items.find(i => i.subType === 'long-sleeve')!;
  shoes.forEach(s => {
    const rs = recedeScore(s, heroItem);
    const harmonize = colorsHarmonize('black', s.colorFamily);
    const rf = isRainFriendly(s);
    console.log(`    ${s.id} (${s.subType}/${s.colorFamily}): recedeScore=${rs} harmonize=${harmonize} rainFriendly=${rf}`);
  });

  console.log('\n  ROOT CAUSE ANALYSIS:');
  console.log('  The weather gate in generateOutfitPool only filters OUTERWEAR heroes (line 327)');
  console.log('  Shoe rain-appropriateness is never checked during:');
  console.log('    - hero selection (shoes CAN be heroes)');
  console.log('    - shoe-option selection (line 452-461: harmShoes + otherShoes, no rain check)');
  console.log('    - hard gate passes (line 543-575: only checks formality spread, pattern, volume, crop)');
  console.log('  RESULT: rain-averse shoes (sandals/tan) enter pool if they score well enough');
  console.log('  FIX PATH: add isRainFriendly filter to shoe selection step (lines 452-461)');
}

// ─── Fallback stress test ─────────────────────────────────────────────────────

function fallbackStressTest() {
  printSection('FALLBACK STRESS TEST (4–8 item wardrobes)');

  const profile = mkp({ bodyType: null });

  const wardrobes: { n: number; items: WardrobeItem[]; expectedCase: string }[] = [
    {
      n: 4, expectedCase: 'C — no valid outfit',
      items: [
        mk('f4-t1','top','t-shirt','black',['casual']),
        mk('f4-b1','bottom','jeans','blue',['casual']),
        mk('f4-s1','shoes','sneakers','white',['casual']),
        mk('f4-g1','bag','backpack','black',['casual']),
      ],
    },
    {
      n: 5, expectedCase: 'A — strict succeeds',
      items: [
        mk('f5-t1','top','blouse','cream',['casual','brunch']),
        mk('f5-b1','bottom','midi-skirt','navy',['casual','brunch']),
        mk('f5-s1','shoes','mules','tan',['casual','brunch']),
        mk('f5-g1','bag','crossbody','tan',['casual','brunch']),
        mk('f5-j1','jewelry','earrings','gold',['casual','brunch'],{ metalTone:'gold' }),
      ],
    },
    {
      n: 6, expectedCase: 'B — relaxed needed (hero < 4, fallback saves it)',
      items: [
        mk('f6-t1','top','t-shirt','black',['casual']),
        mk('f6-t2','top','long-sleeve','white',['casual']),
        mk('f6-b1','bottom','jeans','blue',['casual']),
        mk('f6-b2','bottom','chinos','beige',['casual']),
        mk('f6-s1','shoes','sneakers','white',['casual']),
        mk('f6-g1','bag','backpack','black',['casual']),
      ],
    },
    {
      n: 7, expectedCase: 'A — strict succeeds (Phase 3.6 B16 confirmed pool=2)',
      items: [
        mk('f7-t1','top','blouse','cream',['casual','brunch']),
        mk('f7-t2','top','knit-top','black',['casual']),
        mk('f7-b1','bottom','midi-skirt','navy',['casual','brunch']),
        mk('f7-b2','bottom','jeans','black',['casual']),
        mk('f7-s1','shoes','mules','tan',['casual']),
        mk('f7-g1','bag','crossbody','tan',['casual']),
        mk('f7-j1','jewelry','necklace','gold',['casual'],{ metalTone:'gold' }),
      ],
    },
    {
      n: 8, expectedCase: 'A — strict succeeds',
      items: [
        mk('f8-t1','top','blouse','cream',['casual','brunch']),
        mk('f8-t2','top','knit-top','black',['casual']),
        mk('f8-b1','bottom','midi-skirt','navy',['casual','brunch']),
        mk('f8-b2','bottom','jeans','black',['casual']),
        mk('f8-d1','dress','midi-dress','navy',['casual','brunch']),
        mk('f8-s1','shoes','mules','tan',['casual']),
        mk('f8-s2','shoes','sandals','nude',['casual']),
        mk('f8-g1','bag','crossbody','tan',['casual']),
      ],
    },
  ];

  wardrobes.forEach(({ n, items, expectedCase }) => {
    const pool = generateOutfitPool(items, profile, undefined, [], '2026-08-12', []);
    const casualPool = pool['casual'] ?? [];
    const brunchPool = pool['brunch'] ?? [];
    const sizes = Object.entries(pool)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}:${v.length}`)
      .join(', ');
    const anyRelaxed = Object.values(pool).flat().some(o => o.generationPath === 'relaxed');
    const anyPool = Object.values(pool).flat().length > 0;
    console.log(`\n  ${n}-item wardrobe [expected: ${expectedCase}]`);
    console.log(`    Non-empty scenarios: ${sizes || 'NONE'}`);
    console.log(`    Any relaxed path: ${anyRelaxed}`);
    console.log(`    Any recommendation: ${anyPool}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 3.7 — DIAGNOSTIC INVESTIGATION                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ── B03 ──────────────────────────────────────────────────────────────────────
  diagnoseCG(
    'B03', 'Smart casual — hourglass, brunch',
    [
      mk('b03-t1','top','blouse',    'blush', ['brunch','date-casual'],{ fabric:'silk', fit:'loose'   }),
      mk('b03-t2','top','knit-top',  'cream', ['brunch','casual'],     { fabric:'cashmere' }),
      mk('b03-t3','top','camisole',  'white', ['brunch','date-casual'],{ fabric:'silk', fit:'slim' }),
      mk('b03-b1','bottom','midi-skirt','blush',['brunch','date-casual'],{ fit:'slim' }),
      mk('b03-b2','bottom','chinos', 'beige', ['brunch','casual'],     ),
      mk('b03-b3','bottom','jeans',  'white', ['brunch','casual'],{ fit:'slim' }),
      mk('b03-d1','dress','midi-dress','blush',['brunch','date-casual'], ),
      mk('b03-d2','dress','knit-dress','cream',['brunch','casual'],     ),
      mk('b03-s1','shoes','mules',   'tan',   ['brunch','casual'],{ fabric:'suede' }),
      mk('b03-s2','shoes','sandals', 'nude',  ['brunch','casual'],     ),
      mk('b03-s3','shoes','heels',   'nude',  ['brunch','date-casual'],{ fabric:'suede' }),
      mk('b03-g1','bag','shoulder-bag','tan', ['brunch','work'],{ fabric:'leather' }),
      mk('b03-g2','bag','crossbody', 'blush', ['brunch','casual'],     ),
      mk('b03-j1','jewelry','necklace','gold',['brunch','casual'],{ metalTone:'gold' }),
    ],
    mkp({ bodyType: 'hourglass', styleGoalPrimary: 'romantic',
          undertone: 'warm', skinTone: 'medium-light' }),
    'brunch',
    MILD,
  );

  // ── B24 ──────────────────────────────────────────────────────────────────────
  diagnoseCG(
    'B24', 'Inverted triangle — A-line bottoms, brunch',
    [
      mk('b24-t1','top','knit-top',  'cream',  ['brunch','casual'],{ fit:'slim', fabric:'cashmere' }),
      mk('b24-t2','top','blouse',    'white',  ['brunch','work'],  { fit:'regular', fabric:'silk' }),
      mk('b24-t3','top','camisole',  'navy',   ['brunch','casual'],{ fit:'slim' }),
      mk('b24-b1','bottom','midi-skirt','navy', ['brunch','work'], { fit:'regular' }),
      mk('b24-b2','bottom','wide-leg','cream',  ['brunch','casual'],{ fit:'regular' }),
      mk('b24-b3','bottom','maxi-skirt','navy', ['brunch','casual'],              ),
      mk('b24-b4','bottom','jeans',  'navy',   ['brunch','casual'],{ fit:'slim'   }),
      mk('b24-d1','dress','midi-dress','cream', ['brunch','date-casual'],          ),
      mk('b24-d2','dress','maxi-dress','navy',  ['brunch','date-casual'],           ),
      mk('b24-s1','shoes','loafers', 'tan',    ['brunch','casual'],{ fabric:'suede' }),
      mk('b24-s2','shoes','sandals', 'nude',   ['brunch','casual'],                ),
      mk('b24-s3','shoes','mules',   'cream',  ['brunch','casual'],                ),
      mk('b24-g1','bag','tote',      'tan',    ['brunch','work'],  { fabric:'leather' }),
      mk('b24-g2','bag','shoulder-bag','navy', ['brunch','casual'],                ),
      mk('b24-j1','jewelry','earrings','gold', ['brunch'],{ metalTone:'gold' }),
    ],
    mkp({ bodyType: 'inverted-triangle', styleGoalPrimary: 'classic',
          undertone: 'cool' }),
    'brunch',
    MILD,
  );

  // ── C09 ──────────────────────────────────────────────────────────────────────
  diagnoseCG(
    'C09', 'Tiny premium wardrobe — 6 items, event',
    [
      mk('c09-d1','dress','cocktail-dress','black',['event','date-dressy'],{ fabric:'satin' }),
      mk('c09-d2','dress','midi-dress','burgundy', ['event','date-dressy'],{ fabric:'silk'  }),
      mk('c09-s1','shoes','heels',   'black',  ['event','date-dressy'],   { fabric:'suede' }),
      mk('c09-g1','bag','clutch',    'gold',   ['event','night-out'],     { metalTone:'gold', fabric:'leather' }),
      mk('c09-j1','jewelry','statement-earrings','gold',['event'],{ metalTone:'gold' }),
      mk('c09-j2','jewelry','necklace','gold',  ['event'],                { metalTone:'gold' }),
    ],
    mkp({ bodyType: 'hourglass', styleGoalPrimary: 'classic',
          metalPreference: 'gold', undertone: 'warm' }),
    'event',
    null,
  );

  // ── B15 ──────────────────────────────────────────────────────────────────────
  diagnoseB15();

  // ── Fallback stress test ──────────────────────────────────────────────────────
  fallbackStressTest();

  console.log('\n' + '═'.repeat(60));
  console.log('  DIAGNOSTIC COMPLETE');
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
