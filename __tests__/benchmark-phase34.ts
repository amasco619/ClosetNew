/**
 * Phase 3.4 — Gold-Standard Benchmark V2
 * Ranking Calibration: Competitive Sets + Pairwise Adversarial Comparisons
 *
 * CRITICAL: External scores were assigned using the 10-dimension rubric
 * BEFORE running internal scoring (§11 — prevents evaluator bias).
 *
 * External quality rubric (each 0–10, total 0–100):
 *   1. Colour Harmony          6. Texture & Material
 *   2. Silhouette & Proportion 7. Visual Interest
 *   3. Occasion Fit            8. Practicality
 *   4. Formality               9. Personalisation
 *   5. Visual Coherence       10. Quiet-Luxury / Premium Styling
 *
 * Categories (§9):
 *   A = Colour        F = Formality
 *   B = Pattern       G = Practicality
 *   C = Material      H = Tonal
 *   D = Minimalism    I = Visual Hierarchy
 *   E = Silhouette    J = Quiet Luxury
 *
 * Usage: npx tsx __tests__/benchmark-phase34.ts
 * Future comparison: run against modified engine, compare output metrics.
 */

import { WardrobeItem, UserProfile, OutfitComponent, Fabric, OccasionTag } from '../constants/types';
import { scoreOutfitCombo, type Season } from '../constants/outfitScoring';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  desc: string;
  items: WardrobeItem[];
  ext: number;        // external quality score (0–100), assigned before running
  int?: number;       // internal score (computed)
  extRank?: number;
  intRank?: number;
}

interface CompSet {
  id: string;
  cat: string;        // category label
  desc: string;
  tradeoff: string;
  prof: UserProfile;
  season: Season;
  candidates: Candidate[];
  // Computed:
  top1?: boolean;     // AuraCloset #1 === external #1?
  top3?: boolean;     // external #1 in AuraCloset top-3?
  regret?: number;    // ext(best) − ext(AuraCloset #1) in points
  tau?: number;       // Kendall's τ rank correlation
}

interface Pair {
  id: string;
  cat: string;
  desc: string;
  prof: UserProfile;
  season: Season;
  a: { desc: string; items: WardrobeItem[]; ext: number; int?: number; };
  b: { desc: string; items: WardrobeItem[]; ext: number; int?: number; };
  correct?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mk(
  id: string,
  cat: WardrobeItem['category'],
  sub: string,
  color: string,
  fabric: Fabric,
  formality: number,
  occasions: OccasionTag[],
  extra: Partial<WardrobeItem> = {},
): WardrobeItem {
  return {
    id, name: `${sub}/${id}`, category: cat, subType: sub,
    colorFamily: color, fabric, formalityLevel: formality,
    occasionTags: occasions, pattern: 'solid',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    owned: true, photoUri: undefined, ...extra,
  } as WardrobeItem;
}

function mkp(o: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u0', name: 'Test', colorPalette: 'neutral',
    styleGoalPrimary: 'classic', styleGoalSecondary: undefined,
    bodyType: null, heightBand: null, metalPreference: undefined,
    isPremium: true, isGuest: false,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: [] },
    ...o,
  } as UserProfile;
}

function internalScore(outfit: WardrobeItem[], profile: UserProfile, season: Season = 'spring'): number {
  const comps: OutfitComponent[] = outfit.map(i => ({
    category: i.category, subType: i.subType, colorFamily: i.colorFamily, matchedItemId: i.id, owned: true,
  }));
  return scoreOutfitCombo(comps, outfit, profile, season).total;
}

/** Kendall's τ-b rank correlation. Positive = agreement, negative = reversal. */
function kendallTau(intRanks: number[], extRanks: number[]): number {
  const n = intRanks.length;
  if (n < 3) return NaN;
  let C = 0, D = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = Math.sign(intRanks[i] - intRanks[j]);
      const se = Math.sign(extRanks[i] - extRanks[j]);
      if (si === se && si !== 0) C++;
      else if (si !== 0 && se !== 0 && si !== se) D++;
    }
  }
  return (C + D) === 0 ? 0 : (C - D) / (C + D);
}

// ─── Item pools shared across scenarios ──────────────────────────────────────

// Category A — Colour vs Sophistication
const a_silk_cream  = mk('a-silk-cr', 'top',    'blouse',    'cream',   'silk',      5, ['work','brunch'], {fit:'slim'});
const a_cash_camel  = mk('a-cash-ca', 'bottom', 'wide-leg',  'camel',   'cashmere',  5, ['work'],          {fit:'loose'});
const a_cot_red     = mk('a-cot-red', 'top',    'blouse',    'red',     'cotton',    5, ['work']);
const a_cot_blue    = mk('a-cot-bl',  'top',    'blouse',    'blue',    'cotton',    5, ['work']);
const a_wool_nav    = mk('a-wool-nv', 'bottom', 'trousers',  'navy',    'wool',      5, ['work'],          {fit:'slim'});
const a_wool_blk    = mk('a-wool-bk', 'bottom', 'trousers',  'black',   'wool',      5, ['work'],          {fit:'slim'});
const a_wool_gray   = mk('a-wool-gr', 'outerwear','blazer',  'charcoal','wool',      5, ['work']);
const a_cot_cr2     = mk('a-cot-cr2', 'top',    'blouse',    'cream',   'cotton',    4, ['work']);
const a_lth_blk     = mk('a-lth-bk',  'shoes',  'pumps',     'black',   'leather',   5, ['work']);
const a_lth_tan     = mk('a-lth-tn',  'shoes',  'loafers',   'tan',     'leather',   5, ['work']);
const a_lth_nud     = mk('a-lth-nd',  'shoes',  'mules',     'nude',    'leather',   5, ['work','brunch']);
// Brunch colour
const a2_coral      = mk('a2-coral',  'top',    'blouse',    'coral',   'cotton',    4, ['brunch']);
const a2_sage_s     = mk('a2-sage-s', 'top',    'blouse',    'sage',    'silk',      4, ['brunch'],        {fit:'slim'});
const a2_lav_dr     = mk('a2-lav-dr', 'dress',  'midi-dress','lavender','cotton',    4, ['brunch']);
const a2_blush_c    = mk('a2-blsh-c', 'top',    'sweater',   'blush',   'cashmere',  4, ['brunch']);
const a2_wht_jean   = mk('a2-wj',     'bottom', 'jeans',     'white',   'denim',     2, ['casual','brunch'],{fit:'slim'});
const a2_iv_wide    = mk('a2-iv-w',   'bottom', 'wide-leg',  'ivory',   'linen',     4, ['brunch'],        {fit:'loose'});
const a2_cr_trs     = mk('a2-cr-tr',  'bottom', 'trousers',  'cream',   'cotton',    3, ['brunch','casual'],{fit:'slim'});
const a2_gold_sand  = mk('a2-gd-s',   'shoes',  'sandals',   'gold',    'leather',   3, ['brunch','casual']);
const a2_nude_mule  = mk('a2-nd-m',   'shoes',  'mules',     'nude',    'leather',   4, ['brunch','work']);
const a2_wht_sand   = mk('a2-wt-s',   'shoes',  'sandals',   'white',   'synthetic', 2, ['casual','brunch']);
const a2_tan_mule   = mk('a2-tn-m',   'shoes',  'mules',     'tan',     'leather',   4, ['brunch']);
// Date night colour
const a3_red_bdy    = mk('a3-red-bd', 'dress',  'bodycon-dress','red',  'synthetic', 5, ['date-dressy','night-out']);
const a3_blk_slip   = mk('a3-bk-sl',  'dress',  'slip-dress','black',   'silk',      5, ['date-dressy','night-out']);
const a3_burg_wrap  = mk('a3-bg-wr',  'dress',  'wrap-dress','burgundy','satin',     5, ['date-dressy','date-casual']);
const a3_grn_silk   = mk('a3-gn-sl',  'dress',  'midi-dress','green',   'silk',      5, ['date-dressy','brunch']);
const a3_gold_heel  = mk('a3-gd-h',   'shoes',  'heels',     'gold',    'leather',   5, ['date-dressy']);
const a3_nude_heel  = mk('a3-nd-h',   'shoes',  'heels',     'nude',    'leather',   5, ['date-dressy','work']);
const a3_tan_heel   = mk('a3-tn-h',   'shoes',  'heels',     'tan',     'leather',   4, ['date-casual','brunch']);
const a3_gold_clutch= mk('a3-gd-c',   'bag',    'clutch',    'gold',    'leather',   5, ['date-dressy','night-out']);

// Category B — Pattern
const b_navy_stripe = mk('b-nv-str', 'top',    'shirt',    'navy',  'cotton',  4, ['casual','brunch'], {pattern:'stripe'});
const b_grey_check  = mk('b-gy-chk', 'bottom', 'trousers', 'grey',  'wool',    4, ['work','casual'],   {pattern:'check'});
const b_navy_blz    = mk('b-nv-blz', 'outerwear','blazer', 'navy',  'wool',    5, ['work','brunch']);
const b_cream_shirt = mk('b-cr-sht', 'top',    'shirt',    'cream', 'cotton',  4, ['work','casual']);
const b_navy_slim_t = mk('b-nv-slim','bottom', 'trousers', 'navy',  'wool',    5, ['work'],            {fit:'slim'});
const b_navy_pin    = mk('b-nv-pin', 'top',    'shirt',    'navy',  'cotton',  4, ['work'],            {pattern:'stripe'});
const b_white_shirt = mk('b-wt-sht', 'top',    'shirt',    'white', 'cotton',  4, ['work','casual']);
const b_wht_sn      = mk('b-wt-sn',  'shoes',  'sneakers', 'white', 'synthetic',1, ['casual']);
const b_blk_ox      = mk('b-bk-ox',  'shoes',  'oxford-shoes','black','leather',5, ['work']);
const b_fl_top      = mk('b-fl-tp',  'top',    'blouse',   'multicolour','cotton',3,['casual','brunch'],{pattern:'floral'});
const b_str_midi    = mk('b-str-md', 'bottom', 'midi-skirt','blue', 'cotton',  3, ['casual','brunch'],  {pattern:'stripe'});
const b_blk_midi    = mk('b-bk-md',  'bottom', 'midi-skirt','black','cotton',  3, ['casual','brunch']);
const b_nv_top      = mk('b-nv-tp',  'top',    'blouse',   'navy',  'cotton',  3, ['casual','brunch']);
const b_sm_str_top  = mk('b-sm-str', 'top',    'blouse',   'navy',  'cotton',  3, ['casual'],           {pattern:'stripe',patternScale:'small'} as any);
const b_nude_sand   = mk('b-nd-san', 'shoes',  'sandals',  'nude',  'leather', 3, ['casual','brunch']);
const b_anim_top    = mk('b-an-tp',  'top',    'blouse',   'brown', 'synthetic',3, ['casual','brunch'],  {pattern:'animal'});
const b_fl_midi     = mk('b-fl-md',  'bottom', 'midi-skirt','multicolour','cotton',3,['casual'],         {pattern:'floral'});
const b_cr_midi     = mk('b-cr-md',  'bottom', 'midi-skirt','cream', 'cotton',  3, ['casual','brunch']);
const b_rust_top    = mk('b-rs-tp',  'top',    'blouse',   'rust',  'cotton',  3, ['casual','brunch']);
const b_silk_cr_dr  = mk('b-sk-dr',  'dress',  'midi-dress','cream','silk',    4, ['brunch','date-casual']);
const b_tan_sand    = mk('b-tn-san', 'shoes',  'sandals',  'tan',   'leather', 3, ['casual','brunch']);
const b_anim_clutch = mk('b-an-cl',  'bag',    'clutch',   'brown', 'leather', 3, ['casual','brunch'],   {pattern:'animal'} as any);

// Category C — Material
const c_silk_bl     = mk('c-silk-bl','top',    'blouse',   'cream', 'silk',    5, ['work','brunch'],    {fit:'slim'});
const c_cash_wide   = mk('c-cash-w', 'bottom', 'wide-leg', 'camel', 'cashmere',5, ['work'],             {fit:'loose'});
const c_satin_midi  = mk('c-stn-md', 'bottom', 'midi-skirt','ivory','satin',  5, ['date-dressy'],       {fit:'regular'});
const c_cot_tee     = mk('c-cot-te', 'top',    't-shirt',  'grey',  'cotton',  2, ['casual'],            {fit:'regular'});
const c_cot_chi     = mk('c-cot-ch', 'bottom', 'chinos',   'beige', 'cotton',  3, ['casual'],            {fit:'regular'});
const c_wool_tr     = mk('c-wool-tr','bottom', 'trousers', 'navy',  'wool',    5, ['work'],              {fit:'slim'});
const c_lth_mule    = mk('c-lth-ml', 'shoes',  'mules',    'tan',   'leather', 5, ['work','brunch']);
const c_wht_sn      = mk('c-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const c_velv_blz    = mk('c-vlv-bz', 'outerwear','blazer', 'navy',  'velvet',  5, ['work','date-dressy']);
const c_wool_slim   = mk('c-wool-sl','bottom', 'trousers', 'black', 'wool',    5, ['work'],              {fit:'slim'});
const c_lth_tr      = mk('c-lth-tr', 'bottom', 'trousers', 'black', 'leather', 5, ['date-dressy','night-out']);
const c_denim_jn    = mk('c-dnm-jn', 'bottom', 'jeans',    'blue',  'denim',   2, ['casual'],            {fit:'slim'});
const c_lth_jkt     = mk('c-lth-jk', 'outerwear','leather-jacket','black','leather',4,['casual','date-casual']);
const c_cash_sw     = mk('c-cash-sw','top',    'sweater',  'cream', 'cashmere',4, ['casual','brunch'],   {fit:'regular'});
const c_blk_pump    = mk('c-blk-pm', 'shoes',  'pumps',    'black', 'leather', 5, ['work','date-dressy']);
const c_cash_sw2    = mk('c-cash-s2','top',    'sweater',  'cream', 'cashmere',4, ['casual','brunch','work']);
const c_wool_midi   = mk('c-wool-md','bottom', 'midi-skirt','camel','wool',    4, ['work','brunch']);
const c_lth_boots   = mk('c-lth-bt', 'shoes',  'ankle-boots','tan', 'leather', 4, ['casual','work','brunch']);
const c_sn          = mk('c-sn',     'shoes',  'sneakers', 'white', 'synthetic',1, ['casual']);
const c_jersey_top  = mk('c-jer-tp', 'top',    't-shirt',  'white', 'jersey',  2, ['casual']);
const c_synth_leg   = mk('c-syn-lg', 'bottom', 'leggings', 'black', 'synthetic',1,['active','casual']);
const c_silk_bl2    = mk('c-silk-b2','top',    'blouse',   'cream', 'silk',    5, ['work','brunch'],     {fit:'slim'});
const c_velv_midi   = mk('c-vlv-md', 'bottom', 'midi-skirt','black','velvet',  5, ['date-dressy']);
const c_lth_heel    = mk('c-lth-hl', 'shoes',  'heels',    'black', 'leather', 5, ['date-dressy','work']);

// Category D — Minimalism
const d_silk_bl     = mk('d-silk-bl','top',    'blouse',   'cream', 'silk',    5, ['work','brunch'],    {fit:'slim'});
const d_cash_wide   = mk('d-cash-w', 'bottom', 'wide-leg', 'camel', 'cashmere',5, ['work'],             {fit:'loose'});
const d_lth_mule    = mk('d-lth-ml', 'shoes',  'mules',    'tan',   'leather', 5, ['work','brunch']);
const d_lth_bag     = mk('d-lth-bg', 'bag',    'shoulder-bag','tan','leather', 5, ['work']);
const d_gold_ear    = mk('d-gld-er', 'jewelry','earrings', 'gold',  'leather', 4, ['work','brunch']);
const d_lth_clutch  = mk('d-lth-cl', 'bag',    'clutch',   'tan',   'leather', 5, ['work']);
const d_cot_tee     = mk('d-cot-te', 'top',    't-shirt',  'grey',  'cotton',  2, ['casual']);
const d_denim_jn    = mk('d-dnm-jn', 'bottom', 'jeans',    'blue',  'denim',   2, ['casual'],            {fit:'slim'});
const d_wht_sn      = mk('d-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const d_blk_bp      = mk('d-blk-bp', 'bag',    'backpack', 'black', 'synthetic',1,['casual']);
const d_blk_clutch  = mk('d-blk-cl', 'bag',    'clutch',   'black', 'synthetic',1,['casual']);
const d_lin_dr      = mk('d-lin-dr', 'dress',  'midi-dress','white','linen',   3, ['resort','brunch']);
const d_tan_sand    = mk('d-tan-sd', 'shoes',  'sandals',  'tan',   'leather', 2, ['resort','casual']);
const d_sun_dr      = mk('d-sun-dr', 'dress',  'sundress', 'white', 'linen',   2, ['resort','casual']);
const d_flat_sand   = mk('d-fl-sd',  'shoes',  'sandals',  'tan',   'leather', 2, ['resort','casual']);
const d_hat_aprx    = mk('d-hat',    'bag',    'clutch',   'tan',   'cotton',  2, ['resort']);
const d_tote        = mk('d-tote',   'bag',    'shoulder-bag','tan','cotton',  2, ['resort','casual']);
const d_maxi_dr     = mk('d-maxi',   'dress',  'maxi-dress','blue', 'cotton',  2, ['resort','casual']);
const d_shorts      = mk('d-shrt',   'bottom', 'shorts',   'white', 'cotton',  1, ['casual','resort']);
const d_tee         = mk('d-tee',    'top',    't-shirt',  'white', 'cotton',  2, ['casual']);
const d_sn          = mk('d-sn',     'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const d_silk_bl2    = mk('d-silk-b2','top',    'blouse',   'ivory', 'silk',    5, ['work','brunch'],     {fit:'slim'});
const d_wool_tr     = mk('d-wool-tr','bottom', 'trousers', 'navy',  'wool',    5, ['work'],              {fit:'slim'});
const d_lth_lf      = mk('d-lth-lf', 'shoes',  'loafers',  'tan',   'leather', 4, ['work','casual']);
const d_cot_wh      = mk('d-cot-wh', 'top',    't-shirt',  'white', 'cotton',  2, ['casual']);
const d_cot_chi     = mk('d-cot-ch', 'bottom', 'chinos',   'beige', 'cotton',  3, ['casual'],            {fit:'regular'});
const d_canvas_sn   = mk('d-cvs-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const d_kdr         = mk('d-kdr',    'dress',  'midi-dress','navy', 'wool',    4, ['work','brunch']);
const d_blk_boot    = mk('d-blk-bt', 'shoes',  'ankle-boots','black','leather',4, ['casual','work']);
const d_lin_bl      = mk('d-lin-bl', 'top',    'blouse',   'white', 'linen',   3, ['casual','brunch']);
const d_lin_tr      = mk('d-lin-tr', 'bottom', 'trousers', 'white', 'linen',   3, ['casual','brunch'],   {fit:'regular'});
const d_lth_sand    = mk('d-lth-sd', 'shoes',  'sandals',  'tan',   'leather', 3, ['casual','brunch']);

// Category E — Silhouette
const e_silk_slim   = mk('e-silk-sl','top',    'blouse',   'cream', 'silk',    5, ['work','brunch'],    {fit:'slim'});
const e_slim_tr     = mk('e-slim-tr','bottom', 'trousers', 'navy',  'wool',    5, ['work'],             {fit:'slim'});
const e_wide_jn     = mk('e-wide-jn','bottom', 'wide-leg', 'black', 'cotton',  3, ['casual','work'],    {fit:'loose'});
const e_str_tr      = mk('e-str-tr', 'bottom', 'trousers', 'grey',  'wool',    5, ['work'],             {fit:'regular'});
const e_crop_tr     = mk('e-crop-tr','bottom', 'trousers', 'navy',  'wool',    4, ['work','casual'],    {fit:'slim'});
const e_nude_heel   = mk('e-nd-hl',  'shoes',  'heels',    'nude',  'leather', 5, ['work','date-dressy']);
const e_wht_sn      = mk('e-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const e_blk_heel    = mk('e-blk-hl', 'shoes',  'heels',    'black', 'leather', 5, ['work']);
const e_aline_midi  = mk('e-aln-md', 'bottom', 'midi-skirt','navy', 'wool',    4, ['brunch','work']);
const e_wide_dn     = mk('e-wide-dn','bottom', 'wide-leg', 'blue',  'denim',   2, ['casual'],           {fit:'loose'});
const e_slim_jn     = mk('e-slim-jn','bottom', 'jeans',    'blue',  'denim',   2, ['casual'],           {fit:'slim'});
const e_ov_shirt    = mk('e-ov-sht', 'top',    'shirt',    'white', 'cotton',  2, ['casual'],           {fit:'oversized'});
const e_blk_heel2   = mk('e-blk-h2', 'shoes',  'heels',    'nude',  'leather', 4, ['brunch','work']);
const e_blk_sn      = mk('e-blk-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const e_blz_nv      = mk('e-blz-nv', 'outerwear','blazer', 'navy',  'wool',    5, ['work','brunch'],    {fit:'regular'});
const e_blk_slim    = mk('e-blk-sl', 'bottom', 'trousers', 'black', 'wool',    5, ['work'],             {fit:'slim'});
const e_ov_jn       = mk('e-ov-jn',  'bottom', 'jeans',    'blue',  'denim',   2, ['casual'],           {fit:'loose'});
const e_cash_tnk    = mk('e-cash-tn','top',    'turtleneck','black','cashmere', 4, ['casual','work'],    {fit:'slim'});
const e_wide_ln     = mk('e-wide-ln','bottom', 'wide-leg', 'black', 'linen',   3, ['casual','brunch'],  {fit:'loose'});
const e_nude_heel2  = mk('e-nd-h2',  'shoes',  'heels',    'nude',  'leather', 5, ['work','date-dressy']);
const e_silk_wh     = mk('e-silk-wh','top',    'blouse',   'white', 'silk',    4, ['brunch','work'],    {fit:'slim'});

// Category F — Formality
const f_grey_blz    = mk('f-gy-blz', 'outerwear','blazer', 'grey',  'wool',    6, ['work']);
const f_grey_tr     = mk('f-gy-tr',  'bottom', 'trousers', 'grey',  'wool',    6, ['work'],             {fit:'regular'});
const f_blk_ox      = mk('f-blk-ox', 'shoes',  'oxford-shoes','black','leather',6,['work']);
const f_silk_cr     = mk('f-silk-cr','top',    'blouse',   'cream', 'silk',    5, ['work'],             {fit:'slim'});
const f_blk_slim_t  = mk('f-blk-sl', 'bottom', 'trousers', 'black', 'wool',    5, ['work'],             {fit:'slim'});
const f_nude_pump   = mk('f-nd-pm',  'shoes',  'pumps',    'nude',  'leather', 5, ['work']);
const f_navy_blz    = mk('f-nv-blz', 'outerwear','blazer', 'navy',  'wool',    5, ['work','brunch']);
const f_wht_tee     = mk('f-wt-te',  'top',    't-shirt',  'white', 'cotton',  2, ['casual']);
const f_kh_chi      = mk('f-kh-ch',  'bottom', 'chinos',   'khaki', 'cotton',  3, ['casual','work'],    {fit:'regular'});
const f_wht_sn      = mk('f-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const f_cash_camel  = mk('f-cash-ca','top',    'sweater',  'camel', 'cashmere', 4, ['work','brunch'],   {fit:'regular'});
const f_tan_pump    = mk('f-tan-pm', 'shoes',  'pumps',    'tan',   'leather', 5, ['work']);
const f_cock_blk    = mk('f-ck-bk',  'dress',  'cocktail-dress','black','satin',6,['date-dressy','work']);
const f_blk_heel    = mk('f-blk-hl', 'shoes',  'heels',    'black', 'leather', 6, ['date-dressy']);
const f_sage_silk   = mk('f-sg-sk',  'dress',  'midi-dress','sage', 'silk',    4, ['brunch','date-casual']);
const f_blk_blk_h   = mk('f-bk-bh',  'shoes',  'block-heels','tan', 'leather', 4, ['brunch','casual']);
const f_denim_jn    = mk('f-dnm-jn', 'bottom', 'jeans',    'blue',  'denim',   2, ['casual'],           {fit:'slim'});
const f_wht_tee2    = mk('f-wt-t2',  'top',    't-shirt',  'white', 'cotton',  2, ['casual']);
const f_wht_sn2     = mk('f-wht-s2', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const f_blsh_silk   = mk('f-bl-sk',  'top',    'blouse',   'blush', 'silk',    4, ['brunch','date-casual']);
const f_iv_midi     = mk('f-iv-md',  'bottom', 'midi-skirt','ivory','linen',   3, ['brunch','casual']);
const f_tan_mule    = mk('f-tn-ml',  'shoes',  'mules',    'tan',   'leather', 4, ['brunch']);
const f_gold_ear    = mk('f-gd-er',  'jewelry','earrings', 'gold',  'leather', 3, ['brunch']);
const f_gown        = mk('f-gown',   'dress',  'gown',     'ivory', 'satin',   7, ['date-dressy']);
const f_velv_midi   = mk('f-vlv-md', 'dress',  'cocktail-dress','black','velvet',6,['date-dressy','night-out']);
const f_nude_h      = mk('f-nd-h',   'shoes',  'heels',    'nude',  'leather', 6, ['date-dressy']);
const f_gold_ear2   = mk('f-gd-er2', 'jewelry','earrings', 'gold',  'leather', 5, ['date-dressy']);
const f_sat_blz     = mk('f-sat-bz', 'outerwear','blazer', 'silver','satin',   5, ['date-dressy','night-out']);
const f_silk_tr     = mk('f-silk-tr','bottom', 'trousers', 'black', 'silk',    5, ['date-dressy']);
const f_blk_h       = mk('f-blk-h',  'shoes',  'heels',    'black', 'leather', 5, ['date-dressy','work']);
const f_synth_cock  = mk('f-syn-ck', 'dress',  'cocktail-dress','black','synthetic',5,['date-dressy','night-out']);
const f_pearl_ear   = mk('f-prl-er', 'jewelry','earrings', 'silver','leather', 5, ['date-dressy']);

// Category G — Practicality
const g_wool_coat   = mk('g-wool-ct','outerwear','coat',   'camel', 'wool',    5, ['work','casual']);
const g_cash_sw     = mk('g-cash-sw','top',    'sweater',  'cream', 'cashmere',4, ['work','casual'],    {fit:'regular'});
const g_wool_tr     = mk('g-wool-tr','bottom', 'trousers', 'camel', 'wool',    5, ['work'],             {fit:'slim'});
const g_lth_boot    = mk('g-lth-bt', 'shoes',  'ankle-boots','tan', 'leather', 4, ['casual','work']);
const g_silk_dress  = mk('g-silk-dr','dress',  'midi-dress','cream','silk',    5, ['date-dressy','brunch']);
const g_nude_heel   = mk('g-nd-hl',  'shoes',  'heels',    'nude',  'leather', 5, ['date-dressy']);
const g_synth_coat  = mk('g-syn-ct', 'outerwear','coat',   'navy',  'synthetic',3,['casual']);
const g_denim_jn    = mk('g-dnm-jn', 'bottom', 'jeans',    'blue',  'denim',   2, ['casual'],           {fit:'slim'});
const g_wht_sn      = mk('g-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const g_cash_coat   = mk('g-cash-ct','outerwear','coat',   'black', 'cashmere', 6, ['work','date-dressy']);
const g_wool_kdr    = mk('g-wool-kd','dress',  'midi-dress','navy', 'wool',    4, ['work','brunch']);
const g_blk_boot    = mk('g-blk-bt', 'shoes',  'ankle-boots','black','leather',4, ['casual','work']);
const g_trench      = mk('g-trch',   'outerwear','trench', 'camel', 'cotton',  5, ['work','casual']);
const g_wool_tnk    = mk('g-wool-tn','top',    'turtleneck','cream','wool',    4, ['work','casual'],     {fit:'slim'});
const g_blk_wool_t  = mk('g-blk-wt','bottom', 'trousers', 'black', 'wool',    5, ['work'],             {fit:'slim'});
const g_lth_boot2   = mk('g-lth-b2', 'shoes',  'ankle-boots','black','leather',4, ['casual','work']);
const g_suede_lf    = mk('g-sde-lf', 'shoes',  'loafers',  'tan',   'leather', 4, ['casual','work']); // suede-like, impractical in rain
const g_silk_dress2 = mk('g-silk-d2','dress',  'midi-dress','blush','silk',    5, ['brunch','date-casual']);
const g_wax_jkt     = mk('g-wax-jk', 'outerwear','trench', 'olive', 'cotton',  3, ['casual']);
const g_rubber_boot = mk('g-rbr-bt', 'shoes',  'ankle-boots','black','synthetic',2,['casual','resort']); // rain-appropriate
const g_grey_sw     = mk('g-gry-sw', 'top',    'sweater',  'grey',  'wool',    3, ['casual'],           {fit:'regular'});
const g_lth_jkt     = mk('g-lth-jk', 'outerwear','leather-jacket','black','leather',4,['casual','date-casual']);
const g_slim_jn     = mk('g-slim-jn','bottom', 'jeans',    'blue',  'denim',   2, ['casual'],           {fit:'slim'});
const g_lin_bl      = mk('g-lin-bl', 'top',    'blouse',   'white', 'linen',   4, ['work','brunch'],    {fit:'slim'});
const g_lin_tr      = mk('g-lin-tr', 'bottom', 'trousers', 'white', 'linen',   4, ['work','brunch'],    {fit:'regular'});
const g_lth_sand    = mk('g-lth-sd', 'shoes',  'sandals',  'tan',   'leather', 4, ['brunch','casual']);
const g_wool_blz    = mk('g-wool-bz','outerwear','blazer',  'grey',  'wool',    5, ['work']);
const g_wool_tr2    = mk('g-wool-t2','bottom', 'trousers', 'grey',  'wool',    5, ['work'],             {fit:'slim'});
const g_lth_boot3   = mk('g-lth-b3', 'shoes',  'ankle-boots','black','leather',4, ['work','casual']);
const g_cot_navy    = mk('g-cot-nv', 'dress',  'midi-dress','navy', 'cotton',  3, ['casual','brunch']);
const g_gold_sand   = mk('g-gld-sd', 'shoes',  'sandals',  'gold',  'leather', 3, ['casual','brunch']);
const g_silk_cr     = mk('g-silk-cr','top',    'blouse',   'cream', 'silk',    4, ['work','brunch'],    {fit:'slim'});
const g_cot_sk      = mk('g-cot-sk', 'bottom', 'midi-skirt','ivory','cotton',  3, ['brunch','casual']);
const g_tan_mule    = mk('g-tan-ml', 'shoes',  'mules',    'tan',   'leather', 4, ['brunch','work']);

// Category H — Tonal
const h_silk_cr     = mk('h-silk-cr','top',    'blouse',   'cream', 'silk',    5, ['work','brunch'],    {fit:'slim'});
const h_cash_camel  = mk('h-cash-ca','bottom', 'wide-leg', 'camel', 'cashmere',5, ['work'],             {fit:'loose'});
const h_tan_mule    = mk('h-tan-ml', 'shoes',  'mules',    'tan',   'leather', 5, ['work','brunch']);
const h_tan_bag     = mk('h-tan-bg', 'bag',    'shoulder-bag','tan','leather', 5, ['work']);
const h_grey_cot    = mk('h-gry-ct', 'top',    't-shirt',  'grey',  'cotton',  2, ['casual']);
const h_blk_dn      = mk('h-blk-dn', 'bottom', 'jeans',    'black', 'denim',   2, ['casual'],           {fit:'slim'});
const h_blk_sn      = mk('h-blk-sn', 'shoes',  'sneakers', 'black', 'synthetic',1,['casual']);
const h_nv_cash     = mk('h-nv-ca',  'top',    'sweater',  'navy',  'cashmere',4, ['work','casual'],    {fit:'regular'});
const h_nv_wool_m   = mk('h-nv-wm',  'bottom', 'midi-skirt','navy', 'wool',    4, ['work','brunch']);
const h_nv_boot     = mk('h-nv-bt',  'shoes',  'ankle-boots','navy','leather', 4, ['work','casual']);
const h_red_bl      = mk('h-red-bl', 'top',    'blouse',   'red',   'cotton',  3, ['casual']);
const h_yel_sk      = mk('h-yel-sk', 'bottom', 'midi-skirt','yellow','cotton', 2, ['casual','resort']);
const h_wht_sn      = mk('h-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const h_cam_coat    = mk('h-cam-ct', 'outerwear','coat',   'camel', 'wool',    5, ['work','casual']);
const h_cr_cash     = mk('h-cr-ca',  'top',    'sweater',  'cream', 'cashmere',4, ['work','casual']);
const h_tan_tr      = mk('h-tan-tr', 'bottom', 'trousers', 'tan',   'wool',    4, ['work','casual'],    {fit:'slim'});
const h_tan_boot    = mk('h-tan-bt', 'shoes',  'ankle-boots','tan', 'leather', 4, ['work','casual']);
const h_wht_shirt   = mk('h-wht-sh', 'top',    'shirt',    'white', 'cotton',  3, ['casual','work']);
const h_blue_jn     = mk('h-blue-jn','bottom', 'jeans',    'blue',  'denim',   2, ['casual'],           {fit:'slim'});
const h_beige_blz   = mk('h-bei-bz', 'outerwear','blazer', 'beige', 'wool',    5, ['work']);
const h_grey_tr     = mk('h-gry-tr', 'bottom', 'trousers', 'grey',  'wool',    5, ['work'],             {fit:'slim'});
const h_wht_shirt2  = mk('h-wht-s2', 'top',    'shirt',    'white', 'cotton',  3, ['work','casual']);
const h_orange_coat = mk('h-org-ct', 'outerwear','coat',   'orange','wool',    4, ['casual']);
const h_red_bag     = mk('h-red-bg', 'bag',    'clutch',   'red',   'wool',    3, ['casual']);
const h_nv_silk     = mk('h-nv-sk',  'top',    'blouse',   'navy',  'silk',    5, ['work','brunch'],    {fit:'slim'});
const h_nv_wool_t   = mk('h-nv-wt',  'bottom', 'trousers', 'navy',  'wool',    5, ['work'],             {fit:'slim'});
const h_nv_heel     = mk('h-nv-hl',  'shoes',  'heels',    'navy',  'leather', 5, ['work','date-dressy']);
const h_nv_cot      = mk('h-nv-ct',  'top',    't-shirt',  'navy',  'cotton',  2, ['casual']);
const h_nv_chi      = mk('h-nv-ch',  'bottom', 'chinos',   'navy',  'cotton',  3, ['casual'],           {fit:'regular'});
const h_nv_sn       = mk('h-nv-sn',  'shoes',  'sneakers', 'navy',  'synthetic',1,['casual']);
const h_nv_blz      = mk('h-nv-bz',  'outerwear','blazer', 'navy',  'wool',    5, ['work']);
const h_cr_tr       = mk('h-cr-tr',  'bottom', 'trousers', 'cream', 'cotton',  3, ['casual','brunch'],  {fit:'regular'});
const h_nv_ox       = mk('h-nv-ox',  'shoes',  'oxford-shoes','navy','leather',4, ['work','casual']);
const h_nv_silk_dr  = mk('h-nv-sd',  'dress',  'midi-dress','navy', 'silk',    5, ['brunch','date-casual']);
const h_tan_clutch  = mk('h-tan-cl', 'bag',    'clutch',   'tan',   'leather', 4, ['brunch']);
const h_tan_heel    = mk('h-tan-hl', 'shoes',  'heels',    'tan',   'leather', 4, ['brunch']);

// Category I — Visual Hierarchy
const i_lth_jkt     = mk('i-lth-jk', 'outerwear','leather-jacket','black','leather',4,['casual','date-casual']);
const i_wht_tee     = mk('i-wht-te', 'top',    't-shirt',  'white', 'cotton',  2, ['casual'],           {fit:'slim'});
const i_slim_jn     = mk('i-slim-jn','bottom', 'jeans',    'blue',  'denim',   2, ['casual'],           {fit:'slim'});
const i_wht_sn      = mk('i-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const i_grey_tee    = mk('i-gry-te', 'top',    't-shirt',  'grey',  'cotton',  2, ['casual']);
const i_grey_jn     = mk('i-gry-jn', 'bottom', 'jeans',    'grey',  'denim',   2, ['casual'],           {fit:'regular'});
const i_grey_coat   = mk('i-gry-ct', 'outerwear','coat',   'grey',  'synthetic',2,['casual']);
const i_silk_cr     = mk('i-silk-cr','top',    'blouse',   'cream', 'silk',    4, ['casual','brunch'],   {fit:'slim'});
const i_wide_blk    = mk('i-wide-bk','bottom', 'wide-leg', 'black', 'denim',   2, ['casual'],           {fit:'loose'});
const i_fl_top      = mk('i-fl-tp',  'top',    'blouse',   'multicolour','cotton',3,['casual','brunch'], {pattern:'floral'});
const i_wht_jn      = mk('i-wht-jn', 'bottom', 'jeans',    'white', 'denim',   2, ['casual'],           {fit:'slim'});
const i_nude_heel   = mk('i-nd-hl',  'shoes',  'heels',    'nude',  'leather', 4, ['casual','brunch']);
const i_gold_satin  = mk('i-gld-st', 'bottom', 'midi-skirt','gold', 'satin',   5, ['date-dressy','night-out']);
const i_silk_dress  = mk('i-silk-dr','dress',  'midi-dress','cream','silk',    4, ['brunch','date-casual']);
const i_blk_jn      = mk('i-blk-jn', 'bottom', 'jeans',    'black', 'denim',   2, ['casual'],           {fit:'slim'});
const i_blk_tee     = mk('i-blk-te', 'top',    't-shirt',  'white', 'cotton',  2, ['casual'],           {fit:'slim'});
const i_nude_heel2  = mk('i-nd-h2',  'shoes',  'heels',    'nude',  'leather', 5, ['date-dressy']);
const i_blk_heel    = mk('i-blk-hl', 'shoes',  'heels',    'black', 'leather', 4, ['casual','work']);
const i_base_silk   = mk('i-base-sk','top',    'blouse',   'cream', 'silk',    5, ['work','brunch'],     {fit:'slim'});
const i_base_wool   = mk('i-base-wl','bottom', 'trousers', 'black', 'wool',    5, ['work'],             {fit:'slim'});
const i_base_heel   = mk('i-base-hl','shoes',  'heels',    'black', 'leather', 5, ['work']);
const i_red_bag     = mk('i-red-bg', 'bag',    'shoulder-bag','red','leather', 4, ['work','casual']);
const i_gld_ear     = mk('i-gld-er', 'jewelry','earrings', 'gold',  'leather', 4, ['work','brunch']);
const i_red_heel    = mk('i-red-hl', 'shoes',  'heels',    'red',   'leather', 5, ['work','date-dressy']);
const i_tan_bag     = mk('i-tan-bg', 'bag',    'shoulder-bag','tan','leather', 5, ['work']);
const i_del_ear     = mk('i-del-er', 'jewelry','earrings', 'gold',  'leather', 4, ['work']);

// Category J — Quiet Luxury
const j_silk_cr     = mk('j-silk-cr','top',    'blouse',   'cream', 'silk',    5, ['work','brunch'],    {fit:'slim'});
const j_cash_wide   = mk('j-cash-w', 'bottom', 'wide-leg', 'camel', 'cashmere',5, ['work'],             {fit:'loose'});
const j_tan_mule    = mk('j-tan-ml', 'shoes',  'mules',    'tan',   'leather', 5, ['work','brunch']);
const j_tan_bag     = mk('j-tan-bg', 'bag',    'shoulder-bag','tan','leather', 5, ['work']);
const j_fl_maxi     = mk('j-fl-mx',  'dress',  'maxi-dress','multicolour','cotton',2,['resort','casual'],{pattern:'floral'});
const j_espadrille  = mk('j-esp',    'shoes',  'sandals',  'tan',   'synthetic',2,['resort','casual']);
const j_blk_tee     = mk('j-blk-te', 'top',    't-shirt',  'black', 'cotton',  3, ['casual','night-out']);
const j_lth_jn      = mk('j-lth-jn', 'bottom', 'jeans',    'black', 'leather', 4, ['date-casual','night-out']);
const j_blk_boot    = mk('j-blk-bt', 'shoes',  'ankle-boots','black','leather',4, ['casual','night-out']);
const j_nv_blz      = mk('j-nv-blz', 'outerwear','blazer', 'navy',  'wool',    6, ['work']);
const j_wht_shirt   = mk('j-wht-sh', 'top',    'shirt',    'white', 'cotton',  5, ['work']);
const j_nv_tr       = mk('j-nv-tr',  'bottom', 'trousers', 'navy',  'wool',    6, ['work'],             {fit:'slim'});
const j_blk_ox      = mk('j-blk-ox', 'shoes',  'oxford-shoes','black','leather',6,['work']);
const j_iv_lin_t    = mk('j-iv-lt',  'top',    'blouse',   'ivory', 'linen',   4, ['brunch','casual'],  {fit:'regular'});
const j_iv_lin_b    = mk('j-iv-lb',  'bottom', 'trousers', 'ivory', 'linen',   4, ['brunch','casual'],  {fit:'regular'});
const j_wht_sand    = mk('j-wht-sd', 'shoes',  'sandals',  'white', 'leather', 3, ['casual','brunch']);
const j_cam_cash    = mk('j-cam-ca', 'top',    'sweater',  'camel', 'cashmere',4, ['casual','brunch'],   {fit:'regular'});
const j_blk_wool_t  = mk('j-blk-wt','bottom', 'trousers', 'black', 'wool',    4, ['casual','work'],     {fit:'slim'});
const j_tan_lf      = mk('j-tan-lf', 'shoes',  'loafers',  'tan',   'leather', 4, ['casual','work']);
const j_ov_cot      = mk('j-ov-ct',  'top',    'shirt',    'grey',  'cotton',  2, ['casual'],           {fit:'oversized'});
const j_loose_jn    = mk('j-loose-j','bottom', 'jeans',    'blue',  'denim',   1, ['casual'],           {fit:'loose'});
const j_wht_sn      = mk('j-wht-sn', 'shoes',  'sneakers', 'white', 'synthetic',1,['casual']);
const j_silk_cam    = mk('j-silk-ca','top',    'camisole', 'cream', 'silk',    4, ['casual','brunch','date-casual']);
const j_wide_dn     = mk('j-wide-dn','bottom', 'wide-leg', 'black', 'denim',   2, ['casual'],           {fit:'loose'});
const j_nude_heel   = mk('j-nd-hl',  'shoes',  'heels',    'nude',  'leather', 4, ['casual','brunch']);
const j_nv_wool_tnk = mk('j-nv-tn',  'top',    'turtleneck','navy', 'wool',    4, ['casual','work'],     {fit:'slim'});
const j_grey_wool_t = mk('j-gry-wt', 'bottom', 'trousers', 'grey',  'wool',    4, ['casual','work'],     {fit:'regular'});
const j_blk_lf      = mk('j-blk-lf', 'shoes',  'loafers',  'black', 'leather', 4, ['casual','work']);
const j_dn_jkt      = mk('j-dn-jk',  'outerwear','leather-jacket','blue','denim',3,['casual']);
const j_lth_mini    = mk('j-lth-mn', 'bottom', 'mini-skirt','black','leather', 4, ['casual','night-out']);
const j_blk_boot2   = mk('j-blk-b2', 'shoes',  'ankle-boots','black','leather',4, ['casual','night-out']);
const j_velv_dr     = mk('j-vlv-dr', 'dress',  'cocktail-dress','black','velvet',6,['date-dressy','night-out']);
const j_nude_heel2  = mk('j-nd-h2',  'shoes',  'heels',    'nude',  'leather', 6, ['date-dressy']);
const j_gold_ear    = mk('j-gld-er', 'jewelry','earrings', 'gold',  'leather', 5, ['date-dressy']);
const j_seq_mini    = mk('j-seq-mn', 'dress',  'mini-dress','gold', 'satin',   6, ['night-out','date-dressy']);
const j_gold_heel   = mk('j-gld-hl', 'shoes',  'heels',    'gold',  'leather', 6, ['date-dressy','night-out']);
const j_synth_cock  = mk('j-syn-ck', 'dress',  'cocktail-dress','black','synthetic',5,['date-dressy','night-out']);
const j_pearl_ear   = mk('j-prl-er', 'jewelry','earrings', 'silver','leather', 5, ['date-dressy']);
const j_blk_heel    = mk('j-blk-hl', 'shoes',  'heels',    'black', 'leather', 5, ['date-dressy','work']);
const j_sat_blz     = mk('j-sat-bz', 'outerwear','blazer', 'silver','satin',   5, ['date-dressy','night-out']);
const j_silk_tr     = mk('j-silk-tr','bottom', 'trousers', 'black', 'silk',    5, ['date-dressy']);
const j_jers_wrap   = mk('j-jrs-wr', 'dress',  'wrap-dress','black','jersey',  4, ['date-casual','night-out']);
const j_nude_heel3  = mk('j-nd-h3',  'shoes',  'heels',    'nude',  'leather', 5, ['date-casual','brunch']);

// ─── COMPETITIVE SETS (30) ────────────────────────────────────────────────────
// External scores assigned using the 10-dimension rubric BEFORE running internal scoring.

const SETS: CompSet[] = [

  // ── Category A: Colour vs Sophistication ────────────────────────────────────
  {
    id: 'CS01', cat: 'colour',
    desc: 'Bold colour vs quiet tonal neutral — work occasion',
    tradeoff: 'Does boldness read as quality for a classic work user?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Red blouse + navy trousers + black pumps',              items: [a_cot_red,   a_wool_nav, a_lth_blk], ext: 67 },
      { id: 'B', desc: 'Cream silk blouse + camel cashmere wide-leg + tan loafers', items: [a_silk_cream, a_cash_camel, a_lth_tan], ext: 85 },
      { id: 'C', desc: 'Royal-blue blouse + black trousers + black pumps',      items: [a_cot_blue,  a_wool_blk, a_lth_blk], ext: 72 },
      { id: 'D', desc: 'Charcoal blazer + cream blouse + black trousers + pumps', items: [a_wool_gray, a_cot_cr2, a_wool_blk, a_lth_blk], ext: 77 },
    ],
  },
  {
    id: 'CS02', cat: 'colour',
    desc: 'Brunch: bold coral vs sage silk vs lavender vs blush cashmere',
    tradeoff: 'Does colourfulness over-score refined tonal elegance at brunch?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Coral cotton blouse + white jeans + gold sandals',       items: [a2_coral,    a2_wht_jean, a2_gold_sand], ext: 69 },
      { id: 'B', desc: 'Sage silk blouse + ivory wide-leg + nude mules',         items: [a2_sage_s,   a2_iv_wide,  a2_nude_mule], ext: 84 },
      { id: 'C', desc: 'Lavender cotton dress + white sandals',                  items: [a2_lav_dr,   a2_wht_sand], ext: 71 },
      { id: 'D', desc: 'Blush cashmere sweater + cream trousers + tan mules',    items: [a2_blush_c,  a2_cr_trs,   a2_tan_mule], ext: 83 },
    ],
  },
  {
    id: 'CS03', cat: 'colour',
    desc: 'Date night: red bodycon vs black silk slip vs jewel-tone silk',
    tradeoff: 'Does colour intensity read as quality over silk elegance?',
    prof: mkp({ styleGoalPrimary: 'romantic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Red bodycon dress + gold heels',                         items: [a3_red_bdy,  a3_gold_heel], ext: 66 },
      { id: 'B', desc: 'Black silk slip dress + nude heels + gold clutch',       items: [a3_blk_slip, a3_nude_heel, a3_gold_clutch], ext: 86 },
      { id: 'C', desc: 'Burgundy satin wrap dress + tan heels',                  items: [a3_burg_wrap, a3_tan_heel], ext: 75 },
      { id: 'D', desc: 'Emerald silk midi dress + nude heels',                   items: [a3_grn_silk, a3_nude_heel], ext: 81 },
    ],
  },

  // ── Category B: Pattern Variety vs Elegance ─────────────────────────────────
  {
    id: 'CS04', cat: 'pattern',
    desc: 'PT3 investigation: stripe+check vs solid navy vs subtle stripe vs clean white+navy',
    tradeoff: 'Does the engine over-reward pattern variety vs clean solids?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Navy stripe shirt + grey check trousers + white sneakers', items: [b_navy_stripe, b_grey_check, b_wht_sn], ext: 63 },
      { id: 'B', desc: 'Navy blazer + cream shirt + navy slim trousers + black oxford', items: [b_navy_blz, b_cream_shirt, b_navy_slim_t, b_blk_ox], ext: 84 },
      { id: 'C', desc: 'Navy stripe shirt + navy trousers + black oxford',         items: [b_navy_pin,  b_navy_slim_t, b_blk_ox], ext: 76 },
      { id: 'D', desc: 'White shirt + navy slim trousers + black oxford',          items: [b_white_shirt,b_navy_slim_t, b_blk_ox], ext: 79 },
    ],
  },
  {
    id: 'CS05', cat: 'pattern',
    desc: 'Floral hero vs pattern competition vs solid vs subtle stripe',
    tradeoff: 'Does the engine penalise two-pattern competition vs a single pattern hero?',
    prof: mkp({ styleGoalPrimary: 'romantic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Floral top + stripe midi skirt (two competing patterns)', items: [b_fl_top, b_str_midi, b_nude_sand], ext: 54 },
      { id: 'B', desc: 'Floral top + solid black midi (hero with solid ground)', items: [b_fl_top, b_blk_midi, b_nude_sand], ext: 78 },
      { id: 'C', desc: 'Solid navy top + solid black midi (clean but flat)',     items: [b_nv_top,  b_blk_midi, b_nude_sand], ext: 66 },
      { id: 'D', desc: 'Subtle small-stripe top + solid black midi',             items: [b_sm_str_top,b_blk_midi,b_nude_sand], ext: 73 },
    ],
  },
  {
    id: 'CS06', cat: 'pattern',
    desc: 'Animal print: chaos vs hero vs absent vs accent-only',
    tradeoff: 'Does the engine understand print as accent vs competing focal point?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Animal print top + large floral midi (pattern chaos)',   items: [b_anim_top, b_fl_midi,  b_tan_sand], ext: 49 },
      { id: 'B', desc: 'Animal print top + solid cream midi (controlled hero)',  items: [b_anim_top, b_cr_midi,  b_tan_sand], ext: 73 },
      { id: 'C', desc: 'Solid rust top + solid cream midi',                      items: [b_rust_top, b_cr_midi,  b_tan_sand], ext: 70 },
      { id: 'D', desc: 'Cream silk dress + animal print clutch (accent only)',   items: [b_silk_cr_dr, b_tan_sand, b_anim_clutch], ext: 82 },
    ],
  },

  // ── Category C: Material Richness vs Competition ─────────────────────────────
  {
    id: 'CS07', cat: 'material',
    desc: 'Silk pairings: cashmere vs satin vs all-cotton vs wool — Phase 3.3B core test',
    tradeoff: 'Does the engine correctly distinguish intentional contrast from competing gloss?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Silk blouse + cashmere wide-leg + leather mules (intentional contrast)', items: [c_silk_bl, c_cash_wide, c_lth_mule], ext: 85 },
      { id: 'B', desc: 'Silk blouse + satin midi + leather mules (competing gloss)',             items: [c_silk_bl, c_satin_midi, c_lth_mule], ext: 61 },
      { id: 'C', desc: 'Cotton tee + cotton chinos + sneakers (all flat)',                       items: [c_cot_tee, c_cot_chi,   c_wht_sn], ext: 53 },
      { id: 'D', desc: 'Silk blouse + wool trousers + leather mules (single statement hero)',    items: [c_silk_bl, c_wool_tr,   c_lth_mule], ext: 79 },
    ],
  },
  {
    id: 'CS08', cat: 'material',
    desc: 'Velvet blazer: wool vs leather vs denim — material companions for statement piece',
    tradeoff: 'Can the engine rank material-appropriate companions for velvet?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Velvet blazer + slim wool trousers + black pumps (rich contrast)', items: [c_velv_blz, c_wool_slim, c_blk_pump], ext: 84 },
      { id: 'B', desc: 'Velvet blazer + leather trousers + pumps (two bold textures)',     items: [c_velv_blz, c_lth_tr,   c_blk_pump], ext: 72 },
      { id: 'C', desc: 'Velvet blazer + denim jeans + sneakers (casual clash)',            items: [c_velv_blz, c_denim_jn, c_wht_sn], ext: 61 },
      { id: 'D', desc: 'Leather jacket + cashmere sweater + denim + sneakers (hard/soft)', items: [c_lth_jkt,  c_cash_sw,  c_denim_jn, c_wht_sn], ext: 77 },
    ],
  },
  {
    id: 'CS09', cat: 'material',
    desc: 'Cashmere sweater: wool midi vs denim vs jersey/leggings vs silk+velvet',
    tradeoff: 'Does material richness stack correctly?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Cashmere sweater + wool midi + leather ankle boots',     items: [c_cash_sw2, c_wool_midi, c_lth_boots], ext: 84 },
      { id: 'B', desc: 'Cashmere sweater + slim denim + sneakers',               items: [c_cash_sw2, c_denim_jn,  c_sn], ext: 69 },
      { id: 'C', desc: 'Jersey tee + synthetic leggings + sneakers (all flat)',  items: [c_jersey_top,c_synth_leg, c_sn], ext: 50 },
      { id: 'D', desc: 'Silk blouse + velvet skirt + leather heels',             items: [c_silk_bl2, c_velv_midi, c_lth_heel], ext: 83 },
    ],
  },

  // ── Category D: Minimalism vs Completeness ───────────────────────────────────
  {
    id: 'CS10', cat: 'minimalism',
    desc: 'Elegant 3-piece vs accessorised 6-piece vs casual 5-piece vs minimal 2-piece',
    tradeoff: 'Does "more pieces" mean higher score regardless of quality?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Silk blouse + cashmere wide-leg + leather mules (3-piece elegant)',         items: [d_silk_bl, d_cash_wide, d_lth_mule], ext: 84 },
      { id: 'B', desc: 'Silk+cashmere+mules+leather bag+gold earrings+clutch (6-piece coordinated)', items: [d_silk_bl, d_cash_wide, d_lth_mule, d_lth_bag, d_gold_ear, d_lth_clutch], ext: 87 },
      { id: 'C', desc: 'Cotton tee + jeans + sneakers + backpack + clutch (5-piece casual)',        items: [d_cot_tee, d_denim_jn, d_wht_sn, d_blk_bp, d_blk_clutch], ext: 59 },
      { id: 'D', desc: 'Linen dress + leather sandals (2-piece resort)',                            items: [d_lin_dr,  d_tan_sand], ext: 75 },
    ],
  },
  {
    id: 'CS11', cat: 'minimalism',
    desc: 'Hot weather: minimal sundress vs resort-complete vs maxi vs shorts+tee (W2 investigation)',
    tradeoff: 'Does completeness-as-item-count penalise appropriate minimal summer outfits?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'summer',
    candidates: [
      { id: 'A', desc: 'Linen sundress + leather sandals (2-piece, appropriate minimal)',       items: [d_sun_dr,  d_flat_sand], ext: 80 },
      { id: 'B', desc: 'Linen sundress + hat + leather sandals + tote bag (resort-complete)',  items: [d_sun_dr,  d_flat_sand, d_hat_aprx, d_tote], ext: 86 },
      { id: 'C', desc: 'Cotton maxi dress + sandals + tote bag',                               items: [d_maxi_dr, d_flat_sand, d_tote], ext: 76 },
      { id: 'D', desc: 'Cotton shorts + cotton tee + white sneakers',                          items: [d_shorts,  d_tee, d_sn], ext: 58 },
    ],
  },
  {
    id: 'CS12', cat: 'minimalism',
    desc: 'Small wardrobe 3-piece quality: premium vs casual vs 2-piece mono vs linen set (SC1 type)',
    tradeoff: 'Does a premium 3-piece score appropriately vs a casual 3-piece?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Silk blouse + wool trousers + leather loafers (premium 3-piece)',    items: [d_silk_bl2, d_wool_tr,  d_lth_lf], ext: 84 },
      { id: 'B', desc: 'Cotton tee + cotton chinos + canvas sneakers (casual 3-piece)',      items: [d_cot_wh,   d_cot_chi,  d_canvas_sn], ext: 55 },
      { id: 'C', desc: 'Navy wool dress + black leather ankle boots (2-piece mono)',         items: [d_kdr,      d_blk_boot], ext: 75 },
      { id: 'D', desc: 'White linen blouse + linen trousers + leather sandals (tonal linen)',items: [d_lin_bl,   d_lin_tr,   d_lth_sand], ext: 78 },
    ],
  },

  // ── Category E: Silhouette Balance ──────────────────────────────────────────
  {
    id: 'CS13', cat: 'silhouette',
    desc: 'Petite: slim trousers vs wide-leg vs straight-leg vs cropped — P1 investigation',
    tradeoff: 'Does heightProportion consistently penalise volume silhouettes for petite?',
    prof: mkp({ bodyType: 'rectangle', heightBand: 'petite', styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Slim silk blouse + slim wool trousers + nude heels (elongating)',     items: [e_silk_slim, e_slim_tr,  e_nude_heel], ext: 86 },
      { id: 'B', desc: 'Silk blouse + wide-leg trousers + white sneakers (volume bottom)',    items: [e_silk_slim, e_wide_jn,  e_wht_sn], ext: 65 },
      { id: 'C', desc: 'Silk blouse + straight-leg grey trousers + black heels',             items: [e_silk_slim, e_str_tr,   e_blk_heel], ext: 79 },
      { id: 'D', desc: 'Silk blouse + cropped navy trousers + nude heels (cropped elongates)',items: [e_silk_slim, e_crop_tr,  e_nude_heel], ext: 84 },
    ],
  },
  {
    id: 'CS14', cat: 'silhouette',
    desc: 'Pear figure: A-line midi vs wide-leg denim vs slim jeans vs oversized top+slim jeans',
    tradeoff: 'Does bodyTypeProportion correctly favour A-line vs wide-leg for pear figure?',
    prof: mkp({ bodyType: 'pear', styleGoalPrimary: 'romantic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Fitted silk blouse + A-line navy midi + block heels',         items: [e_silk_slim,  e_aline_midi, e_blk_heel2], ext: 85 },
      { id: 'B', desc: 'Fitted silk blouse + wide-leg denim + white sneakers',        items: [e_silk_slim,  e_wide_dn,    e_blk_sn], ext: 66 },
      { id: 'C', desc: 'Fitted silk blouse + slim jeans + nude heels',                items: [e_silk_slim,  e_slim_jn,    e_nude_heel], ext: 74 },
      { id: 'D', desc: 'Oversized white shirt + slim jeans + white sneakers',         items: [e_ov_shirt,   e_slim_jn,    e_blk_sn], ext: 67 },
    ],
  },
  {
    id: 'CS15', cat: 'silhouette',
    desc: 'Rectangle figure: slim silk vs oversized blazer+slim vs all-volume vs slim-top+wide-leg',
    tradeoff: 'Does the engine understand overall silhouette balance for rectangle figures?',
    prof: mkp({ bodyType: 'rectangle', styleGoalPrimary: 'classic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Slim white silk blouse + slim black trousers + heels',                items: [e_silk_wh,   e_blk_slim, e_nude_heel2], ext: 83 },
      { id: 'B', desc: 'Oversized navy blazer + slim black trousers + heels (wide over slim)', items: [e_blz_nv,    e_blk_slim, e_nude_heel2], ext: 78 },
      { id: 'C', desc: 'Oversized white shirt + loose jeans + white sneakers (all volume)',    items: [e_ov_shirt,  e_ov_jn,    e_blk_sn], ext: 56 },
      { id: 'D', desc: 'Slim cashmere turtleneck + wide-leg linen + heels (slim over volume)', items: [e_cash_tnk,  e_wide_ln,  e_nude_heel2], ext: 80 },
    ],
  },

  // ── Category F: Formality vs Sophistication ──────────────────────────────────
  {
    id: 'CS16', cat: 'formality',
    desc: 'Work: matching grey suit vs refined smart casual vs blazer+tee vs elegant business casual',
    tradeoff: 'Can the engine distinguish appropriate from excellent within work formality?',
    prof: mkp({ styleGoalPrimary: 'classic', bodyType: 'rectangle' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Grey matching suit + black oxford (technically correct, stiff)',            items: [f_grey_blz,  f_grey_tr,  f_blk_ox], ext: 74 },
      { id: 'B', desc: 'Silk blouse + slim trousers + nude pumps + navy blazer (refined smart)',   items: [f_silk_cr,   f_blk_slim_t, f_nude_pump, f_navy_blz], ext: 87 },
      { id: 'C', desc: 'Navy blazer + white tee + khaki chinos + sneakers (too casual for work)', items: [f_navy_blz,  f_wht_tee,  f_kh_chi,   f_wht_sn], ext: 59 },
      { id: 'D', desc: 'Camel cashmere sweater + slim trousers + tan pumps (elegant biz casual)', items: [f_cash_camel, f_blk_slim_t, f_tan_pump], ext: 80 },
    ],
  },
  {
    id: 'CS17', cat: 'formality',
    desc: 'Brunch: over-formal cocktail vs silk midi vs underdressed jeans vs silk+linen',
    tradeoff: 'Does the engine correctly pitch brunch formality?',
    prof: mkp({ styleGoalPrimary: 'romantic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Black satin cocktail dress + black heels (over-formal for brunch)',    items: [f_cock_blk,  f_blk_heel], ext: 61 },
      { id: 'B', desc: 'Sage silk midi dress + tan block heels (perfectly pitched)',           items: [f_sage_silk, f_blk_blk_h], ext: 85 },
      { id: 'C', desc: 'Blue denim jeans + white tee + white sneakers (underdressed)',         items: [f_denim_jn,  f_wht_tee2, f_wht_sn2], ext: 54 },
      { id: 'D', desc: 'Blush silk blouse + ivory linen midi + tan mules + gold earrings',    items: [f_blsh_silk, f_iv_midi,  f_tan_mule, f_gold_ear], ext: 84 },
    ],
  },
  {
    id: 'CS18', cat: 'formality',
    desc: 'Evening: ivory satin gown vs black velvet midi vs satin blazer+silk vs synthetic cocktail',
    tradeoff: 'Does the engine distinguish appropriate evening elegance from over-the-top?',
    prof: mkp({ styleGoalPrimary: 'romantic' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Ivory satin gown + nude heels (over-the-top for dinner)',              items: [f_gown,     f_nude_h], ext: 70 },
      { id: 'B', desc: 'Black velvet midi + nude heels + gold earrings (refined evening)',     items: [f_velv_midi, f_nude_h,  f_gold_ear2], ext: 88 },
      { id: 'C', desc: 'Silver satin blazer + black silk trousers + black heels',              items: [f_sat_blz,   f_silk_tr,  f_blk_h], ext: 79 },
      { id: 'D', desc: 'Black synthetic cocktail dress + pearl earrings + black heels',        items: [f_synth_cock, f_pearl_ear, f_blk_h], ext: 74 },
    ],
  },

  // ── Category G: Contextual Practicality ─────────────────────────────────────
  // NOTE: scoreOutfitCombo does not apply temperature gates (those live in generateOutfitPool).
  // Internal scores for G scenarios will NOT penalise weather-inappropriate choices.
  // This is a finding: practicality gaps are a generator-level concern, not a scorer-level one.
  {
    id: 'CS19', cat: 'practicality',
    desc: 'Cold day (3°C): warm+elegant vs exposed silk dress vs casual warm vs cashmere coat',
    tradeoff: 'Does the scoring engine capture weather-appropriate outerwear quality?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'winter',
    candidates: [
      { id: 'A', desc: 'Wool coat + cashmere sweater + camel wool trousers + leather boots', items: [g_wool_coat, g_cash_sw, g_wool_tr, g_lth_boot], ext: 88 },
      { id: 'B', desc: 'Cream silk dress + nude heels only (exposed on cold day)',           items: [g_silk_dress, g_nude_heel], ext: 51 },
      { id: 'C', desc: 'Synthetic quilted coat + slim denim + white sneakers (casual warm)', items: [g_synth_coat, g_denim_jn, g_wht_sn], ext: 61 },
      { id: 'D', desc: 'Cashmere coat + navy wool dress + black leather boots',              items: [g_cash_coat,  g_wool_kdr, g_blk_boot], ext: 86 },
    ],
  },
  {
    id: 'CS20', cat: 'practicality',
    desc: 'Rainy day: trench+boots vs exposed silk+suede vs wax jacket vs leather jacket',
    tradeoff: 'Does the engine rank rain-appropriate footwear and outerwear correctly?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Camel trench + wool turtleneck + black wool trousers + leather boots (rain-ready)', items: [g_trench, g_wool_tnk, g_blk_wool_t, g_lth_boot2], ext: 86 },
      { id: 'B', desc: 'Blush silk dress + suede loafers, no outerwear (rain disaster)',                    items: [g_silk_dress2, g_suede_lf], ext: 48 },
      { id: 'C', desc: 'Wax jacket + synthetic rubber-sole boots + grey wool sweater',                     items: [g_wax_jkt, g_rubber_boot, g_grey_sw], ext: 61 },
      { id: 'D', desc: 'Leather jacket + slim denim + leather ankle boots',                                items: [g_lth_jkt, g_slim_jn, g_lth_boot2], ext: 77 },
    ],
  },
  {
    id: 'CS21', cat: 'practicality',
    desc: 'Hot day (36°C) work: linen vs wool vs cotton dress vs silk+cotton',
    tradeoff: 'Does scoring penalise heavy fabrics on hot days?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'summer',
    candidates: [
      { id: 'A', desc: 'White linen blouse + linen trousers + leather sandals (cool, appropriate)', items: [g_lin_bl, g_lin_tr, g_lth_sand], ext: 83 },
      { id: 'B', desc: 'Grey wool blazer + heavy wool trousers + leather boots (inappropriate heat)', items: [g_wool_blz, g_wool_tr2, g_lth_boot3], ext: 47 },
      { id: 'C', desc: 'Navy cotton dress + gold sandals',                                           items: [g_cot_navy, g_gold_sand], ext: 73 },
      { id: 'D', desc: 'Cream silk blouse + ivory cotton skirt + tan mules',                         items: [g_silk_cr, g_cot_sk, g_tan_mule], ext: 79 },
    ],
  },

  // ── Category H: Tonal Sophistication ────────────────────────────────────────
  {
    id: 'CS22', cat: 'tonal',
    desc: 'Rich tonal vs flat neutral vs mono-rich vs multicolour chaos',
    tradeoff: 'Does the engine distinguish intentional tonal sophistication from flat neutrals?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Cream silk + camel cashmere + tan mule + tan bag (rich warm tonal)',  items: [h_silk_cr, h_cash_camel, h_tan_mule, h_tan_bag], ext: 89 },
      { id: 'B', desc: 'Grey cotton tee + black denim + black sneakers (flat neutral)',       items: [h_grey_cot, h_blk_dn,    h_blk_sn], ext: 58 },
      { id: 'C', desc: 'Navy cashmere + navy wool midi + navy leather boots (mono rich)',     items: [h_nv_cash,  h_nv_wool_m, h_nv_boot], ext: 83 },
      { id: 'D', desc: 'Red blouse + yellow midi skirt + white sneakers (multicolour)',       items: [h_red_bl,   h_yel_sk,    h_wht_sn], ext: 56 },
    ],
  },
  {
    id: 'CS23', cat: 'tonal',
    desc: 'Warm tonal stack vs warm+cool break vs cool mix vs warm clash',
    tradeoff: 'Does temperature harmony correctly reward warm-tonal cohesion?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Camel coat + cream cashmere + tan trousers + tan boots (warm tonal)', items: [h_cam_coat, h_cr_cash, h_tan_tr, h_tan_boot], ext: 89 },
      { id: 'B', desc: 'Camel coat + white shirt + blue jeans + tan boots (warm coat, cool break)', items: [h_cam_coat, h_wht_shirt, h_blue_jn, h_tan_boot], ext: 71 },
      { id: 'C', desc: 'Beige blazer + grey trousers + white shirt (cool neutrals, less cohesive)', items: [h_beige_blz, h_grey_tr, h_wht_shirt2], ext: 74 },
      { id: 'D', desc: 'Orange coat + red bag + tan trousers (warm overload, clashing)',      items: [h_orange_coat, h_red_bag, h_tan_tr, h_tan_boot], ext: 56 },
    ],
  },
  {
    id: 'CS24', cat: 'tonal',
    desc: 'Navy monochrome quality: silk+wool vs cotton+cotton vs near-mono vs navy+tan accent',
    tradeoff: 'Can the engine distinguish premium monochrome from flat monochrome?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Navy silk blouse + navy wool trousers + navy leather heels (premium mono)', items: [h_nv_silk,  h_nv_wool_t, h_nv_heel], ext: 85 },
      { id: 'B', desc: 'Navy cotton tee + navy cotton chinos + navy canvas sneakers (flat mono)',   items: [h_nv_cot,   h_nv_chi,    h_nv_sn], ext: 61 },
      { id: 'C', desc: 'Navy blazer + cream cotton trousers + navy oxford (near-mono with break)',  items: [h_nv_blz,   h_cr_tr,     h_nv_ox], ext: 77 },
      { id: 'D', desc: 'Navy silk dress + tan clutch + tan heels (mono with warm accent)',          items: [h_nv_silk_dr, h_tan_clutch, h_tan_heel], ext: 82 },
    ],
  },

  // ── Category I: Visual Hierarchy / Focal-Point ───────────────────────────────
  {
    id: 'CS25', cat: 'visual-hierarchy',
    desc: 'Single-hero clarity: leather hero vs no hero vs silk hero vs floral hero',
    tradeoff: 'Does the engine correctly reward outfits with a clear visual focal point?',
    prof: mkp({ styleGoalPrimary: 'classic' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Leather jacket + white tee + slim blue jeans + white sneakers (leather hero)', items: [i_lth_jkt, i_wht_tee, i_slim_jn, i_wht_sn], ext: 83 },
      { id: 'B', desc: 'Grey tee + grey jeans + grey synthetic coat (no hero, no interest)',           items: [i_grey_tee, i_grey_jn, i_grey_coat, i_wht_sn], ext: 56 },
      { id: 'C', desc: 'Cream silk blouse + black wide-leg denim + white sneakers (silk hero)',        items: [i_silk_cr, i_wide_blk, i_wht_sn], ext: 74 },
      { id: 'D', desc: 'Bold floral top + white slim jeans + nude heels (floral hero)',                items: [i_fl_top,  i_wht_jn,   i_nude_heel], ext: 76 },
    ],
  },
  {
    id: 'CS26', cat: 'visual-hierarchy',
    desc: 'Hero competition: two loud heroes vs leather sole hero vs two statement vs satin sole hero',
    tradeoff: 'Does the engine understand that two statement pieces compete rather than combine?',
    prof: mkp({ styleGoalPrimary: 'romantic' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Leather jacket + gold satin skirt + nude heels (two competing heroes)',        items: [i_lth_jkt, i_gold_satin, i_nude_heel2], ext: 63 },
      { id: 'B', desc: 'Leather jacket + black slim jeans + white tee + black heels (leather hero)',  items: [i_lth_jkt, i_blk_jn, i_blk_tee, i_blk_heel], ext: 84 },
      { id: 'C', desc: 'Cream silk blouse + gold satin skirt + nude heels (two statement pieces)',    items: [i_silk_cr,  i_gold_satin, i_nude_heel2], ext: 68 },
      { id: 'D', desc: 'Gold satin skirt + simple white tee + nude heels (satin is sole hero)',       items: [i_gold_satin, i_blk_tee, i_nude_heel2], ext: 80 },
    ],
  },
  {
    id: 'CS27', cat: 'visual-hierarchy',
    desc: 'Accessory load: three statement accessories vs one statement bag vs delicate only vs no accessories',
    tradeoff: 'Does the engine capture that accessory overload competes for focal attention?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Simple silk outfit + red statement bag + gold earrings + red heels (3 focal points)', items: [i_base_silk, i_base_wool, i_red_bag, i_gld_ear, i_red_heel], ext: 61 },
      { id: 'B', desc: 'Simple silk outfit + red statement bag + plain heels (one focal point)',              items: [i_base_silk, i_base_wool, i_red_bag, i_base_heel], ext: 80 },
      { id: 'C', desc: 'Simple silk outfit + delicate gold earrings + plain heels',                          items: [i_base_silk, i_base_wool, i_del_ear,  i_base_heel], ext: 77 },
      { id: 'D', desc: 'Simple 3-piece silk outfit, no accessories',                                         items: [i_base_silk, i_base_wool, i_base_heel], ext: 75 },
    ],
  },

  // ── Category J: Quiet Luxury ─────────────────────────────────────────────────
  {
    id: 'CS28', cat: 'quiet-luxury',
    desc: 'Quiet luxury flagship: silk+cashmere vs colourful floral vs edgy leather vs navy suit vs linen set',
    tradeoff: 'Can the engine identify quiet luxury above all louder alternatives?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'spring',
    candidates: [
      { id: 'A', desc: 'Cream silk + camel cashmere wide-leg + tan mule + tan leather bag (quiet luxury)', items: [j_silk_cr, j_cash_wide, j_tan_mule, j_tan_bag], ext: 90 },
      { id: 'B', desc: 'Colourful floral maxi + espadrilles (fun, loud)',                                  items: [j_fl_maxi,  j_espadrille], ext: 66 },
      { id: 'C', desc: 'Black cotton tee + black leather jeans + black ankle boots (edgy mono)',           items: [j_blk_tee,  j_lth_jn,    j_blk_boot], ext: 64 },
      { id: 'D', desc: 'Navy wool suit + white cotton shirt + black oxford shoes (structured formal)',     items: [j_nv_blz,   j_wht_shirt, j_nv_tr, j_blk_ox], ext: 77 },
      { id: 'E', desc: 'Ivory linen top + ivory linen trousers + white leather sandals (clean minimal)',   items: [j_iv_lin_t, j_iv_lin_b,  j_wht_sand], ext: 79 },
    ],
  },
  {
    id: 'CS29', cat: 'quiet-luxury',
    desc: 'Elevated casual: cashmere+wool+loafers vs logo-casual vs silk cami vs merino turtleneck vs denim+leather',
    tradeoff: 'Does the engine recognise elevated casual quality over branded/trend-led casual?',
    prof: mkp({ styleGoalPrimary: 'minimal' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Camel cashmere sweater + black wool trousers + tan leather loafers',     items: [j_cam_cash, j_blk_wool_t, j_tan_lf], ext: 85 },
      { id: 'B', desc: 'Oversized cotton hoodie + loose denim + white sneakers (branded casual)', items: [j_ov_cot,   j_loose_jn,   j_wht_sn], ext: 56 },
      { id: 'C', desc: 'Cream silk cami + black wide-leg denim + nude heels',                    items: [j_silk_cam, j_wide_dn,    j_nude_heel], ext: 79 },
      { id: 'D', desc: 'Navy wool turtleneck + grey wool trousers + black leather loafers',      items: [j_nv_wool_tnk, j_grey_wool_t, j_blk_lf], ext: 82 },
      { id: 'E', desc: 'Blue denim jacket + black leather mini + black ankle boots',             items: [j_dn_jkt,   j_lth_mini,   j_blk_boot2], ext: 63 },
    ],
  },
  {
    id: 'CS30', cat: 'quiet-luxury',
    desc: 'Evening quiet luxury: velvet midi vs gold sequin mini vs synthetic cocktail vs satin blazer vs jersey wrap',
    tradeoff: 'Does the engine distinguish refined velvet from overtly glittery alternatives?',
    prof: mkp({ styleGoalPrimary: 'romantic' }), season: 'fall',
    candidates: [
      { id: 'A', desc: 'Black velvet midi + nude heels + gold earrings (refined evening)',       items: [j_velv_dr, j_nude_heel2, j_gold_ear], ext: 88 },
      { id: 'B', desc: 'Gold sequin mini dress + gold strappy heels (overtly glittery)',         items: [j_seq_mini, j_gold_heel], ext: 66 },
      { id: 'C', desc: 'Black synthetic cocktail dress + pearl earrings + black heels',          items: [j_synth_cock, j_pearl_ear, j_blk_heel], ext: 73 },
      { id: 'D', desc: 'Silver satin blazer + black silk trousers + black heels',                items: [j_sat_blz,   j_silk_tr,   j_blk_heel], ext: 80 },
      { id: 'E', desc: 'Black jersey wrap dress + nude heels (simple, low texture)',             items: [j_jers_wrap, j_nude_heel3], ext: 69 },
    ],
  },
];

// ─── PAIRWISE ADVERSARIAL TESTS (20) ─────────────────────────────────────────
// A = inferior (externally), B = superior. Engine must rank B > A internally.

const PAIRS: Pair[] = [
  {
    id: 'AP01', cat: 'pattern', prof: mkp(), season: 'spring',
    desc: 'Stripe shirt + check trousers vs solid navy blazer set',
    a: { desc: 'Stripe shirt + check trousers + white sneakers (pattern clash)',  ext: 61,
         items: [mk('ap01at','top','shirt','navy','cotton',4,['casual'],{pattern:'stripe'}), mk('ap01ab','bottom','trousers','grey','wool',4,['work'],{pattern:'check'}), mk('ap01as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Navy blazer + cream shirt + navy slim trousers + black oxford',  ext: 84,
         items: [mk('ap01bo','outerwear','blazer','navy','wool',5,['work']), mk('ap01bt','top','shirt','cream','cotton',4,['work']), mk('ap01bb','bottom','trousers','navy','wool',5,['work'],{fit:'slim'}), mk('ap01bs','shoes','oxford-shoes','black','leather',5,['work'])] },
  },
  {
    id: 'AP02', cat: 'minimalism', prof: mkp(), season: 'spring',
    desc: 'Over-accessorised vs restrained — does restraint score better?',
    a: { desc: 'Silk blouse + trousers + 2 statement earrings + red bag + heels (cluttered)', ext: 62,
         items: [mk('ap02at','top','blouse','white','silk',4,['brunch'],{fit:'slim'}), mk('ap02ab','bottom','trousers','black','wool',4,['work'],{fit:'slim'}), mk('ap02aj1','jewelry','earrings','gold','leather',3,['brunch']), mk('ap02aj2','jewelry','earrings','silver','leather',3,['brunch']), mk('ap02abg','bag','shoulder-bag','red','leather',4,['brunch']), mk('ap02as','shoes','heels','nude','leather',4,['brunch'])] },
    b: { desc: 'Silk blouse + slim trousers + tan tote + delicate gold earrings + nude heels', ext: 84,
         items: [mk('ap02bt','top','blouse','white','silk',4,['brunch'],{fit:'slim'}), mk('ap02bb','bottom','trousers','black','wool',4,['work'],{fit:'slim'}), mk('ap02bj','jewelry','earrings','gold','leather',3,['brunch']), mk('ap02bbg','bag','shoulder-bag','tan','leather',4,['work']), mk('ap02bs','shoes','heels','nude','leather',4,['brunch'])] },
  },
  {
    id: 'AP03', cat: 'tonal', prof: mkp(), season: 'spring',
    desc: 'Flat high-contrast (white+black) vs refined warm tonal (cream+ivory+tan)',
    a: { desc: 'White cotton tee + black denim + white sneakers (flat contrast)',            ext: 60,
         items: [mk('ap03at','top','t-shirt','white','cotton',2,['casual'],{fit:'regular'}), mk('ap03ab','bottom','jeans','black','denim',2,['casual'],{fit:'slim'}), mk('ap03as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Cream silk blouse + ivory wide-leg linen + tan leather loafers (refined tonal)', ext: 85,
         items: [mk('ap03bt','top','blouse','cream','silk',5,['work'],{fit:'slim'}), mk('ap03bb','bottom','wide-leg','ivory','linen',4,['brunch'],{fit:'loose'}), mk('ap03bs','shoes','loafers','tan','leather',4,['work'])] },
  },
  {
    id: 'AP04', cat: 'silhouette', prof: mkp({ bodyType: 'rectangle', heightBand: 'petite' }), season: 'spring',
    desc: 'Petite: all-volume (oversized+wide-leg) vs elongating (slim blouse+cropped+heels)',
    a: { desc: 'Oversized white shirt + wide-leg denim + chunky sneakers (petite: all volume)', ext: 54,
         items: [mk('ap04at','top','shirt','white','cotton',2,['casual'],{fit:'oversized'}), mk('ap04ab','bottom','wide-leg','blue','denim',2,['casual'],{fit:'loose'}), mk('ap04as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Slim cream silk blouse + cropped slim navy trousers + nude heels (elongating)', ext: 85,
         items: [mk('ap04bt','top','blouse','cream','silk',5,['work'],{fit:'slim'}), mk('ap04bb','bottom','trousers','navy','wool',4,['work'],{fit:'slim'}), mk('ap04bs','shoes','heels','nude','leather',5,['work'])] },
  },
  {
    id: 'AP05', cat: 'material', prof: mkp(), season: 'spring',
    desc: 'Silk+satin (competing gloss) vs silk+cashmere (intentional material contrast)',
    a: { desc: 'Cream silk blouse + ivory satin midi + tan mules (competing gloss)',          ext: 60,
         items: [mk('ap05at','top','blouse','cream','silk',5,['brunch'],{fit:'slim'}), mk('ap05ab','bottom','midi-skirt','ivory','satin',5,['date-dressy']), mk('ap05as','shoes','mules','tan','leather',4,['brunch'])] },
    b: { desc: 'Cream silk blouse + camel cashmere wide-leg + tan mules (smooth/soft contrast)', ext: 86,
         items: [mk('ap05bt','top','blouse','cream','silk',5,['work'],{fit:'slim'}), mk('ap05bb','bottom','wide-leg','camel','cashmere',5,['work'],{fit:'loose'}), mk('ap05bs','shoes','mules','tan','leather',5,['work'])] },
  },
  {
    id: 'AP06', cat: 'colour', prof: mkp(), season: 'spring',
    desc: 'Loud neon+pattern vs sophisticated tonal neutral',
    a: { desc: 'Orange floral blouse + multicolour floral skirt + yellow sandals (neon noise)', ext: 56,
         items: [mk('ap06at','top','blouse','orange','cotton',3,['casual'],{pattern:'floral'}), mk('ap06ab','bottom','midi-skirt','multicolour','cotton',2,['casual'],{pattern:'floral'}), mk('ap06as','shoes','sandals','yellow','synthetic',2,['casual'])] },
    b: { desc: 'Ivory silk blouse + camel cashmere trousers + tan leather loafers (quiet luxury)', ext: 87,
         items: [mk('ap06bt','top','blouse','ivory','silk',5,['work'],{fit:'slim'}), mk('ap06bb','bottom','trousers','camel','cashmere',5,['work'],{fit:'slim'}), mk('ap06bs','shoes','loafers','tan','leather',5,['work'])] },
  },
  {
    id: 'AP07', cat: 'minimalism', prof: mkp(), season: 'spring',
    desc: '7-piece cluttered vs 3-piece clean silk dress',
    a: { desc: 'Silk dress + blazer + 2 earrings + statement bag + heels (7-piece, cluttered)', ext: 65,
         items: [mk('ap07adr','dress','midi-dress','cream','silk',5,['brunch']), mk('ap07aow','outerwear','blazer','navy','wool',5,['work']), mk('ap07aj1','jewelry','earrings','gold','leather',4,['brunch']), mk('ap07aj2','jewelry','earrings','silver','leather',3,['brunch']), mk('ap07abg','bag','shoulder-bag','red','leather',4,['brunch']), mk('ap07as','shoes','heels','nude','leather',5,['brunch'])] },
    b: { desc: 'Cream silk slip dress + delicate gold earrings + nude heels (3-piece elegant)',  ext: 86,
         items: [mk('ap07bdr','dress','slip-dress','cream','silk',5,['date-dressy','brunch']), mk('ap07bj','jewelry','earrings','gold','leather',4,['brunch']), mk('ap07bs','shoes','heels','nude','leather',5,['brunch'])] },
  },
  {
    id: 'AP08', cat: 'formality', prof: mkp(), season: 'fall',
    desc: 'Puffer+cargo (trend-led) vs camel wool coat+slim trousers (timeless)',
    a: { desc: 'Oversized synthetic puffer + olive cargo trousers + chunky sneakers', ext: 58,
         items: [mk('ap08aow','outerwear','coat','black','synthetic',2,['casual']), mk('ap08ab','bottom','trousers','olive','cotton',2,['casual'],{fit:'loose'}), mk('ap08as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Camel wool coat + slim navy trousers + tan leather loafers + silk clutch', ext: 87,
         items: [mk('ap08bow','outerwear','coat','camel','wool',5,['work','casual']), mk('ap08bb','bottom','trousers','navy','wool',5,['work'],{fit:'slim'}), mk('ap08bs','shoes','loafers','tan','leather',4,['work']), mk('ap08bbg','bag','clutch','cream','silk',4,['work'])] },
  },
  {
    id: 'AP09', cat: 'pattern', prof: mkp(), season: 'spring',
    desc: 'Three patterns (plaid+floral+stripe) vs one pattern (plaid blazer) + two solids',
    a: { desc: 'Plaid blazer + floral blouse + stripe trousers (three patterns — costume)', ext: 49,
         items: [mk('ap09aow','outerwear','blazer','blue','wool',5,['work'],{pattern:'check'}), mk('ap09at','top','blouse','multicolour','cotton',3,['casual'],{pattern:'floral'}), mk('ap09ab','bottom','trousers','navy','cotton',4,['work'],{pattern:'stripe'}), mk('ap09as','shoes','oxford-shoes','black','leather',5,['work'])] },
    b: { desc: 'Plaid blazer + solid white blouse + solid navy trousers (one hero, two grounds)', ext: 83,
         items: [mk('ap09bow','outerwear','blazer','blue','wool',5,['work'],{pattern:'check'}), mk('ap09bt','top','blouse','white','cotton',4,['work']), mk('ap09bb','bottom','trousers','navy','wool',5,['work'],{fit:'slim'}), mk('ap09bs','shoes','oxford-shoes','black','leather',5,['work'])] },
  },
  {
    id: 'AP10', cat: 'material', prof: mkp(), season: 'spring',
    desc: 'All-cotton (flat) vs silk+wool+leather (material progression)',
    a: { desc: 'Cotton tee + cotton chinos + synthetic sneakers (all flat fabrics)', ext: 55,
         items: [mk('ap10at','top','t-shirt','white','cotton',2,['casual'],{fit:'regular'}), mk('ap10ab','bottom','chinos','beige','cotton',3,['casual'],{fit:'regular'}), mk('ap10as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Silk blouse + wool slim trousers + leather loafers (material progression)', ext: 84,
         items: [mk('ap10bt','top','blouse','cream','silk',5,['work'],{fit:'slim'}), mk('ap10bb','bottom','trousers','navy','wool',5,['work'],{fit:'slim'}), mk('ap10bs','shoes','loafers','tan','leather',4,['work'])] },
  },
  {
    id: 'AP11', cat: 'practicality', prof: mkp(), season: 'summer',
    desc: 'Heavy wool outerwear on hot day (35°C) vs linen sundress — weather practicality',
    a: { desc: 'Heavy wool coat + wool turtleneck + leather boots (35°C — impractical)', ext: 44,
         items: [mk('ap11aow','outerwear','coat','grey','wool',4,['work']), mk('ap11at','top','turtleneck','navy','wool',4,['work'],{fit:'slim'}), mk('ap11as','shoes','ankle-boots','black','leather',4,['work'])] },
    b: { desc: 'White linen sundress + tan leather sandals (heat-appropriate, elegant)', ext: 83,
         items: [mk('ap11bdr','dress','sundress','white','linen',2,['resort','casual']), mk('ap11bs','shoes','sandals','tan','leather',3,['resort','casual'])] },
  },
  {
    id: 'AP12', cat: 'formality', prof: mkp(), season: 'spring',
    desc: 'Cocktail dress + flip-flops (formality mismatch) vs cocktail dress + heels + earrings',
    a: { desc: 'Black silk cocktail dress + synthetic flat sandals (formality wildly mismatched)', ext: 52,
         items: [mk('ap12adr','dress','cocktail-dress','black','silk',6,['date-dressy']), mk('ap12as','shoes','sandals','brown','synthetic',1,['casual'])] },
    b: { desc: 'Black silk cocktail dress + nude heels + delicate gold earrings (cohesive)', ext: 85,
         items: [mk('ap12bdr','dress','cocktail-dress','black','silk',6,['date-dressy']), mk('ap12bs','shoes','heels','nude','leather',6,['date-dressy']), mk('ap12bj','jewelry','earrings','gold','leather',5,['date-dressy'])] },
  },
  {
    id: 'AP13', cat: 'pattern', prof: mkp(), season: 'spring',
    desc: 'Two large-scale florals vs one floral hero + solid black skirt',
    a: { desc: 'Large floral blouse + large floral midi (same pattern twice — costume)', ext: 50,
         items: [mk('ap13at','top','blouse','multicolour','cotton',3,['casual'],{pattern:'floral',patternScale:'large'} as any), mk('ap13ab','bottom','midi-skirt','multicolour','cotton',3,['casual'],{pattern:'floral',patternScale:'large'} as any), mk('ap13as','shoes','sandals','tan','leather',3,['casual'])] },
    b: { desc: 'Bold floral top + solid black midi skirt (floral hero + solid ground)', ext: 79,
         items: [mk('ap13bt','top','blouse','multicolour','cotton',3,['casual'],{pattern:'floral',patternScale:'large'} as any), mk('ap13bb','bottom','midi-skirt','black','cotton',3,['casual']), mk('ap13bs','shoes','sandals','tan','leather',3,['casual'])] },
  },
  {
    id: 'AP14', cat: 'visual-hierarchy', prof: mkp(), season: 'fall',
    desc: 'Leather jacket + gold satin skirt (two heroes) vs leather jacket + black jeans (one hero)',
    a: { desc: 'Leather jacket + gold satin skirt + black heels (two competing statement heroes)', ext: 62,
         items: [mk('ap14aow','outerwear','leather-jacket','black','leather',4,['casual']), mk('ap14ab','bottom','midi-skirt','gold','satin',5,['date-dressy']), mk('ap14as','shoes','heels','black','leather',4,['date-dressy'])] },
    b: { desc: 'Leather jacket + slim black jeans + white tee + black heels (leather sole hero)', ext: 84,
         items: [mk('ap14bow','outerwear','leather-jacket','black','leather',4,['casual']), mk('ap14bb','bottom','jeans','black','denim',2,['casual'],{fit:'slim'}), mk('ap14bt','top','t-shirt','white','cotton',2,['casual'],{fit:'slim'}), mk('ap14bs','shoes','heels','black','leather',4,['date-casual'])] },
  },
  {
    id: 'AP15', cat: 'silhouette', prof: mkp(), season: 'spring',
    desc: 'Ankle boots under midi skirt vs block heels — hemline/shoe harmony',
    a: { desc: 'Cream silk blouse + camel cashmere midi + tan ankle boots (boot cuts leg)', ext: 62,
         items: [mk('ap15at','top','blouse','cream','silk',4,['brunch'],{fit:'slim'}), mk('ap15ab','bottom','midi-skirt','camel','cashmere',4,['brunch']), mk('ap15as','shoes','ankle-boots','tan','leather',4,['casual'])] },
    b: { desc: 'Cream silk blouse + camel cashmere midi + tan block heels (hemline-harmonious)', ext: 83,
         items: [mk('ap15bt','top','blouse','cream','silk',4,['brunch'],{fit:'slim'}), mk('ap15bb','bottom','midi-skirt','camel','cashmere',4,['brunch']), mk('ap15bs','shoes','block-heels','tan','leather',4,['brunch'])] },
  },
  {
    id: 'AP16', cat: 'silhouette', prof: mkp({ bodyType: 'pear' }), season: 'spring',
    desc: 'Pear: oversized+wide-leg (adds hip volume) vs fitted+A-line midi (balanced)',
    a: { desc: 'Oversized cotton shirt + wide-leg denim + white sneakers (pear: adds volume)', ext: 57,
         items: [mk('ap16at','top','shirt','white','cotton',2,['casual'],{fit:'oversized'}), mk('ap16ab','bottom','wide-leg','blue','denim',2,['casual'],{fit:'loose'}), mk('ap16as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Fitted silk blouse + A-line navy midi + block heels (pear: balanced proportion)', ext: 84,
         items: [mk('ap16bt','top','blouse','cream','silk',4,['brunch'],{fit:'slim'}), mk('ap16bb','bottom','midi-skirt','navy','wool',4,['brunch']), mk('ap16bs','shoes','block-heels','tan','leather',4,['brunch'])] },
  },
  {
    id: 'AP17', cat: 'tonal', prof: mkp(), season: 'spring',
    desc: 'Jarring warm/cool/warm clash vs harmonious all-warm palette',
    a: { desc: 'Orange blouse + icy blue denim + yellow sandals (warm/cool/warm clash)', ext: 55,
         items: [mk('ap17at','top','blouse','orange','cotton',3,['casual']), mk('ap17ab','bottom','jeans','blue','denim',2,['casual'],{fit:'slim'}), mk('ap17as','shoes','sandals','yellow','synthetic',2,['casual'])] },
    b: { desc: 'Rust silk blouse + camel wool trousers + tan leather loafers (warm harmony)', ext: 84,
         items: [mk('ap17bt','top','blouse','rust','silk',4,['brunch'],{fit:'slim'}), mk('ap17bb','bottom','trousers','camel','wool',4,['work'],{fit:'slim'}), mk('ap17bs','shoes','loafers','tan','leather',4,['work'])] },
  },
  {
    id: 'AP18', cat: 'formality', prof: mkp(), season: 'spring',
    desc: 'Casual jeans+tee at work meeting vs tailored trousers+silk blouse+loafers',
    a: { desc: 'Blue slim jeans + white tee + white sneakers (work context: completely wrong)', ext: 47,
         items: [mk('ap18ab','bottom','jeans','blue','denim',2,['casual'],{fit:'slim'}), mk('ap18at','top','t-shirt','white','cotton',2,['casual']), mk('ap18as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Navy slim wool trousers + cream silk blouse + tan leather loafers (work-refined)', ext: 85,
         items: [mk('ap18bb','bottom','trousers','navy','wool',5,['work'],{fit:'slim'}), mk('ap18bt','top','blouse','cream','silk',5,['work'],{fit:'slim'}), mk('ap18bs','shoes','loafers','tan','leather',4,['work'])] },
  },
  {
    id: 'AP19', cat: 'personalisation', prof: mkp(), season: 'spring',
    desc: 'Mediocre fresh outfit vs excellent worn-yesterday outfit',
    a: { desc: 'Plain grey tee + blue slim jeans + white sneakers (fresh but mediocre)', ext: 55,
         items: [mk('ap19at','top','t-shirt','grey','cotton',2,['casual']), mk('ap19ab','bottom','jeans','blue','denim',2,['casual'],{fit:'slim'}), mk('ap19as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Ivory silk blouse + navy wool trousers + tan leather loafers (premium, worn yesterday)', ext: 85,
         items: [mk('ap19bt','top','blouse','ivory','silk',5,['work'],{fit:'slim'}), mk('ap19bb','bottom','trousers','navy','wool',5,['work'],{fit:'slim'}), mk('ap19bs','shoes','loafers','tan','leather',4,['work'])] },
  },
  {
    id: 'AP20', cat: 'quiet-luxury', prof: mkp(), season: 'spring',
    desc: 'Mediocre 3-piece (cotton+cotton+synthetic) vs premium 3-piece (silk+wool+leather)',
    a: { desc: 'Cotton tee + beige cotton chinos + canvas sneakers (mediocre 3-piece)',   ext: 53,
         items: [mk('ap20at','top','t-shirt','white','cotton',2,['casual']), mk('ap20ab','bottom','chinos','beige','cotton',3,['casual'],{fit:'regular'}), mk('ap20as','shoes','sneakers','white','synthetic',1,['casual'])] },
    b: { desc: 'Cream silk blouse + navy wool slim trousers + tan leather loafers (premium 3-piece)', ext: 87,
         items: [mk('ap20bt','top','blouse','cream','silk',5,['work'],{fit:'slim'}), mk('ap20bb','bottom','trousers','navy','wool',5,['work'],{fit:'slim'}), mk('ap20bs','shoes','loafers','tan','leather',4,['work'])] },
  },
];

// ─── Score all competitive candidates ─────────────────────────────────────────

for (const set of SETS) {
  for (const c of set.candidates) {
    c.int = internalScore(c.items, set.prof, set.season);
  }
  const byExt = [...set.candidates].sort((a, b) => b.ext - a.ext);
  const byInt = [...set.candidates].sort((a, b) => b.int! - a.int!);
  for (const c of set.candidates) {
    c.extRank = byExt.findIndex(x => x.id === c.id) + 1;
    c.intRank = byInt.findIndex(x => x.id === c.id) + 1;
  }
  const extBest = byExt[0];
  const intBest = byInt[0];
  set.top1    = extBest.id === intBest.id;
  set.top3    = byInt.slice(0, 3).some(c => c.id === extBest.id);
  set.regret  = extBest.ext - intBest.ext;
  set.tau     = kendallTau(set.candidates.map(c => c.intRank!), set.candidates.map(c => c.extRank!));
}

// ─── Score all pairwise tests ─────────────────────────────────────────────────

for (const p of PAIRS) {
  p.a.int = internalScore(p.a.items, p.prof, p.season);
  p.b.int = internalScore(p.b.items, p.prof, p.season);
  p.correct = p.b.int > p.a.int;
}

// ─── Compute aggregate metrics ────────────────────────────────────────────────

const top1Count   = SETS.filter(s => s.top1).length;
const top3Count   = SETS.filter(s => s.top3).length;
const pairCorrect = PAIRS.filter(p => p.correct).length;

const regrets = SETS.map(s => s.regret!);
const meanRegret   = regrets.reduce((a, b) => a + b, 0) / regrets.length;
const sortedR      = [...regrets].sort((a, b) => a - b);
const medianRegret = sortedR[Math.floor(sortedR.length / 2)];
const maxRegret    = Math.max(...regrets);

const taus    = SETS.filter(s => !isNaN(s.tau!)).map(s => s.tau!);
const meanTau = taus.reduce((a, b) => a + b, 0) / taus.length;

const allExt  = SETS.flatMap(s => s.candidates.map(c => c.ext));
const meanExt = allExt.reduce((a, b) => a + b, 0) / allExt.length;
const sortedE = [...allExt].sort((a, b) => a - b);
const medExt  = sortedE[Math.floor(sortedE.length / 2)];

const CATS = ['colour','pattern','material','minimalism','silhouette','formality','practicality','tonal','visual-hierarchy','quiet-luxury'];
const catRes: Record<string, {top1:number;total:number;pw:number;pwt:number;reg:number}> = {};
for (const cat of CATS) {
  const ss = SETS.filter(s => s.cat === cat);
  const ps = PAIRS.filter(p => p.cat === cat);
  catRes[cat] = {
    top1:  ss.filter(s => s.top1).length,
    total: ss.length,
    pw:    ps.filter(p => p.correct).length,
    pwt:   ps.length,
    reg:   ss.length > 0 ? ss.reduce((a, s) => a + s.regret!, 0) / ss.length : 0,
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 3.4 — GOLD-STANDARD BENCHMARK V2: RANKING CALIBRATION        ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

console.log('── COMPETITIVE SETS ─────────────────────────────────────────────────\n');
for (const set of SETS) {
  const byInt  = [...set.candidates].sort((a, b) => b.int! - a.int!);
  const intBest = byInt[0];
  const extBest = set.candidates.find(c => c.extRank === 1)!;
  const ok = set.top1 ? '✓' : '✗';
  console.log(`[${set.id}] ${set.cat.toUpperCase()} — ${set.desc}`);
  for (const c of set.candidates) {
    const isExtBest = c.id === extBest.id ? '← EXT #1' : '';
    const isIntBest = c.id === intBest.id ? '← AUR #1' : '';
    const tag = [isExtBest, isIntBest].filter(Boolean).join(' ');
    const desc55 = c.desc.substring(0, 58).padEnd(58);
    console.log(`  [${c.id}] int=${String(c.int!.toFixed(1)).padStart(5)} ext=${c.ext} | ${desc55} ${tag}`);
  }
  const reg = set.regret! > 0 ? ` regret=${set.regret}` : ' regret=0';
  console.log(`  Top-1: ${ok} | Top-3: ${set.top3 ? '✓' : '✗'} | τ=${set.tau!.toFixed(2)}${reg}\n`);
}

console.log('── PAIRWISE ADVERSARIAL TESTS ────────────────────────────────────────\n');
for (const p of PAIRS) {
  const ok = p.correct ? '✓' : '✗';
  console.log(`[${p.id}] ${p.cat.toUpperCase()} ${ok} — ${p.desc}`);
  console.log(`  A (inferior): ext=${p.a.ext}, int=${p.a.int!.toFixed(1)} | ${p.a.desc.substring(0,60)}`);
  console.log(`  B (superior): ext=${p.b.ext}, int=${p.b.int!.toFixed(1)} | ${p.b.desc.substring(0,60)}`);
  if (!p.correct) {
    const gap = (p.b.int! - p.a.int!).toFixed(1);
    console.log(`  ⚠ REVERSAL: internal gap B−A=${gap} (expected positive) | ext gap B−A=${p.b.ext - p.a.ext}`);
  }
  console.log('');
}

console.log('══ SUMMARY TABLE ════════════════════════════════════════════════════\n');
const N = SETS.length;
console.log(`Competitive scenarios          : ${N}`);
console.log(`Pairwise comparisons           : ${PAIRS.length}`);
console.log(`Candidate outfits evaluated    : ${SETS.reduce((a, s) => a + s.candidates.length, 0) + PAIRS.length * 2}`);
console.log(`Top-1 accuracy                 : ${top1Count}/${N} (${(top1Count/N*100).toFixed(0)}%)`);
console.log(`Top-3 capture rate             : ${top3Count}/${N} (${(top3Count/N*100).toFixed(0)}%)`);
console.log(`Pairwise accuracy              : ${pairCorrect}/${PAIRS.length} (${(pairCorrect/PAIRS.length*100).toFixed(0)}%)`);
console.log(`Mean regret                    : ${meanRegret.toFixed(1)} pts`);
console.log(`Median regret                  : ${medianRegret} pts`);
console.log(`Maximum regret                 : ${maxRegret} pts`);
console.log(`Mean rank correlation (τ)      : ${meanTau.toFixed(3)}`);
console.log(`Mean external quality          : ${meanExt.toFixed(1)}/100`);
console.log(`Median external quality        : ${medExt}/100`);

console.log('\n── CATEGORY BREAKDOWN ───────────────────────────────────────────────\n');
console.log('Category            Top-1       Pairwise    Mean Regret');
console.log('─────────────────── ─────────── ─────────── ───────────');
for (const cat of CATS) {
  const r = catRes[cat];
  const t1 = r.total > 0 ? `${r.top1}/${r.total} (${(r.top1/r.total*100).toFixed(0)}%)`.padEnd(11) : 'n/a        ';
  const pw = r.pwt  > 0 ? `${r.pw}/${r.pwt} (${(r.pw/r.pwt*100).toFixed(0)}%)`.padEnd(11) : 'n/a        ';
  console.log(`${cat.padEnd(19)} ${t1} ${pw} ${r.reg.toFixed(1)} pts`);
}

console.log('\n── RANKING REVERSALS (COMPETITIVE SETS — sorted by regret) ──────────\n');
const reversals = SETS.filter(s => !s.top1).sort((a, b) => b.regret! - a.regret!);
if (reversals.length === 0) {
  console.log('  None — engine ranked external #1 first in all scenarios.\n');
} else {
  for (const set of reversals) {
    const extBest = set.candidates.find(c => c.extRank === 1)!;
    const intBest = set.candidates.find(c => c.intRank === 1)!;
    console.log(`[${set.id}] ${set.desc}`);
    console.log(`  AuraCloset #1: [${intBest.id}] int=${intBest.int!.toFixed(1)}, ext=${intBest.ext} — ${intBest.desc.substring(0,60)}`);
    console.log(`  External  #1: [${extBest.id}] int=${extBest.int!.toFixed(1)}, ext=${extBest.ext} — ${extBest.desc.substring(0,60)}`);
    console.log(`  Regret: ${set.regret} pts\n`);
  }
}

console.log('── PAIRWISE REVERSALS ────────────────────────────────────────────────\n');
const pairRev = PAIRS.filter(p => !p.correct);
if (pairRev.length === 0) {
  console.log('  None — all pairwise tests ranked correctly.\n');
} else {
  for (const p of pairRev) {
    console.log(`[${p.id}] ${p.cat.toUpperCase()} — ${p.desc}`);
    console.log(`  A: ext=${p.a.ext}, int=${p.a.int!.toFixed(1)}`);
    console.log(`  B: ext=${p.b.ext}, int=${p.b.int!.toFixed(1)}`);
    console.log(`  Expected int(B)>int(A) by ext gap ${p.b.ext - p.a.ext}pts; got B−A=${(p.b.int!-p.a.int!).toFixed(1)}\n`);
  }
}

console.log('════════════════════════════════════════════════════════════════════\n');
console.log('NOTE: CS19/CS20/CS21 (Practicality) — scoreOutfitCombo has no temperature');
console.log('parameter. Weather-inappropriate outfits are only gated in generateOutfitPool,');
console.log('not in the core scoring signal. Any practicality failures here are generator-');
console.log('level failures, not scorer failures.\n');
