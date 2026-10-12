import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapDbRowToWardrobeItem } from '../lib/wardrobeMapper';
import { mergeWardrobeCorrection, saveWardrobeCorrection, serializeRecommendationSemantics } from '../lib/wardrobeSemantics';
import type { WardrobeItem } from '../constants/types';
import { centroidHsl } from '../constants/colorPerceptual';

const item: WardrobeItem = {
  id: 'item', category: 'top', subType: 'buba', colorFamily: 'blue',
  photoUri: 'https://example.invalid/signed', storagePath: 'owner/item.jpg',
  createdAt: '2026-10-12', occasionTags: ['wedding'], seasonTags: ['summer'],
  fabric: 'lace', fit: 'loose', pattern: 'wax-print', patternScale: 'large',
  accentColor: 'gold', weight: 'light', neckline: 'boat', sleeveLength: 'long',
  warmthBand: 'warm', rise: 'high', formalityLevel: 8, metalTone: 'gold',
  dominantHsl: { h: 220, s: 0.4, l: 0.5 }, dominantLab: { L: 50, a: 12, b: -20 },
  confirmedFields: ['subType', 'formalityLevel'], modelConfidence: 0.4,
};
const row = (value: WardrobeItem) => ({
  id: value.id, garment_type: value.category, sub_type: value.subType,
  color_family: value.colorFamily, description: value.description,
  occasion: value.occasionTags, image_url: value.storagePath,
  created_at: value.createdAt, fabric: value.fabric, fit: value.fit,
  pattern: value.pattern, pattern_scale: value.patternScale,
  recommendation_semantics: JSON.parse(JSON.stringify(serializeRecommendationSemantics(value))),
});
const reloaded = mapDbRowToWardrobeItem(row(item));
assert.deepEqual(serializeRecommendationSemantics(reloaded), serializeRecommendationSemantics(item));
assert.equal(reloaded.subType, 'buba');
assert.equal(reloaded.formalityLevel, 8, 'stored formality wins over generic mapper defaults');
assert.equal(reloaded.storagePath, item.storagePath);
assert.equal(reloaded.fabric, 'lace');

const legacy = mapDbRowToWardrobeItem({
  id: 'legacy', garment_type: 'dress', sub_type: 'kaftan', color_family: 'blue',
  image_url: 'owner/legacy.jpg', created_at: 'old', recommendation_semantics: null,
});
for (const field of ['formalityLevel', 'fabric', 'weight', 'neckline', 'rise', 'warmthBand', 'metalTone', 'dominantHsl', 'confirmedFields'] as const) {
  assert.equal(legacy[field], undefined, `${field}: unknown stays unknown`);
}
assert.deepEqual(legacy.seasonTags, []);
assert.throws(() => mapDbRowToWardrobeItem({ ...row(item), recommendation_semantics: { madeUp: 'field' } }));
assert.throws(() => serializeRecommendationSemantics({ formalityLevel: 42 }));
assert.throws(() => serializeRecommendationSemantics({ dominantHsl: { h: 220, s: 99, l: 0.5 } }));
assert.throws(() => serializeRecommendationSemantics({ confirmedFields: ['premium'] }));

const corrected = mergeWardrobeCorrection(item, { colorFamily: 'red', neckline: undefined });
assert.deepEqual(corrected.dominantHsl, centroidHsl('red'));
assert.equal(corrected.neckline, undefined);
assert.equal(corrected.modelConfidence, undefined);
assert.ok(corrected.confirmedFields?.includes('neckline'), 'explicit unknown remains a user correction');
assert.ok(corrected.confirmedFields?.includes('colorFamily'));
assert.equal(item.colorFamily, 'blue', 'draft correction does not mutate original');

async function main() {
  let stored: WardrobeItem | undefined;
  await assert.rejects(saveWardrobeCorrection(item, { subType: 'blouse' }, async () => {
    throw new Error('database rejected');
  }), /database rejected/);
  assert.equal(item.subType, 'buba', 'failed save leaves canonical item unchanged');
  const saved = await saveWardrobeCorrection(item, { subType: 'blouse' }, async value => {
    stored = mapDbRowToWardrobeItem(row(value));
  });
  assert.equal(stored?.subType, saved.subType);
  assert.deepEqual(stored?.confirmedFields, saved.confirmedFields);
  // Foundation for the later Mirror Test: final semantics, not engine ranking.
  const manual = mergeWardrobeCorrection({ ...item, subType: 'buba' }, { subType: 'buba' });
  const wrongAiThenCorrected = mergeWardrobeCorrection({ ...item, subType: 'blouse' }, { subType: 'buba' });
  assert.deepEqual(row(manual), row(wrongAiThenCorrected));

  const context = readFileSync('contexts/AppContext.tsx', 'utf8');
  const detail = readFileSync('app/item-detail.tsx', 'utf8');
  const database = readFileSync('lib/database.ts', 'utf8');
  assert.match(context, /await saveWardrobeCorrection[\s\S]*await updateWardrobeItemSemantics/);
  assert.match(detail, /await updateWardrobeItem\(id, updates\);[\s\S]*onSaved\(\)/);
  assert.match(detail, /Your change wasn’t saved/);
  const correctionApi = database.slice(database.indexOf('export async function updateWardrobeItemSemantics'), database.indexOf('function normalizeWardrobeError'));
  assert.match(correctionApi, /\.eq\('id', item\.id\)\.eq\('user_id', userId\)/);
  assert.doesNotMatch(correctionApi, /image_url|cleaned_image_url|item_affinity|wear_count/);
  assert.match(context, /recommendation_semantics: serializeRecommendationSemantics\(newItem\)/);
  assert.equal((context.match(/recommendation_semantics: serializeRecommendationSemantics\(item\)/g) ?? []).length, 2);
  console.log('Canonical semantics round-trip, unknowns, corrections, save barrier and mirror foundation passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
