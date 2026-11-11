import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { WardrobeItem } from '../constants/types';
import { defaultProfile, hydrateAccountProfile, mergeProfile, profileConstraints } from '../shared/profile-personalization';
import { MINIMUM_SLEEVE_LENGTHS, minimumSleeveLength, withMinimumSleeveLength } from '../shared/sleevePreference';
import { guardCheckLook } from '../lib/checkLookGuard';
import { exportJudgeText, profileJudgeConstraints } from '../server/checkLookJudgeInput';
import { buildJudgeBody } from '../server/checkLookJudge';

test('stored, guest and cached profiles derive legacy sleeves without writing a new key', () => {
  for (const legacy of [true, false, undefined]) {
    const constraints = { ...defaultProfile.constraints };
    if (legacy === undefined) delete (constraints as Partial<typeof constraints>).noSleeveless;
    else constraints.noSleeveless = legacy;
    const original = JSON.stringify(constraints);
    const guest = mergeProfile({ isGuest: true, constraints });
    for (const profile of [
      guest, hydrateAccountProfile({ constraints }, ''),
      mergeProfile(JSON.parse(JSON.stringify(guest))),
    ]) {
      assert.equal(minimumSleeveLength(profile.constraints), legacy ? 'short' : 'none');
      assert.equal(Object.hasOwn(profile.constraints, 'minimumSleeveLength'), false);
      assert.equal(Object.hasOwn(profileConstraints(profile), 'minimumSleeveLength'), false);
    }
    assert.equal(JSON.stringify(constraints), original);
  }
});

test('explicit edits round-trip, keep compatibility and preserve unrelated constraints', () => {
  for (const value of MINIMUM_SLEEVE_LENGTHS) {
    const constraints = withMinimumSleeveLength(defaultProfile.constraints, value);
    assert.equal(constraints.noSleeveless, value !== 'none');
    const saved = profileConstraints(mergeProfile({ constraints }));
    for (const profile of [
      hydrateAccountProfile({ constraints: saved }, ''),
      mergeProfile(JSON.parse(JSON.stringify({ ...defaultProfile, constraints }))),
    ]) assert.equal(minimumSleeveLength(profile.constraints), value);
    assert.equal(saved.maxHeelHeight, defaultProfile.constraints.maxHeelHeight);
    assert.equal(minimumSleeveLength({ minimumSleeveLength: value, noSleeveless: value === 'none' }), value);
  }
});

test('guard checks all sleeve boundaries including sleeveless, unknowns and outerwear', () => {
  for (const minimum of MINIMUM_SLEEVE_LENGTHS) {
    for (const category of ['top', 'dress', 'outerwear', 'bottom', 'shoes', 'bag', 'accessory'] as const) {
      for (const sleeve of [undefined, 'sleeveless', 'short', 'three-quarter', 'long'] as const) {
        const item = {
          id: 'test-item', category, subType: 'test', sleeveLength: sleeve,
          colorFamily: 'navy', occasionTags: [], seasonTags: [], createdAt: '', photoUri: '',
        } as WardrobeItem;
        const result = guardCheckLook({
          selection: { itemIds: [item.id], occasion: 'work' }, brief: { context: 'work' },
          items: [item], groups: [], constraints: withMinimumSleeveLength({}, minimum),
        });
        const relevant = ['top', 'dress', 'outerwear'].includes(category) && minimum !== 'none';
        const order = ['sleeveless', 'short', 'three-quarter', 'long'];
        assert.equal(result.missing.length > 0, relevant && sleeve === undefined);
        assert.equal(result.failures.includes('Sleeve shorter than your preference'),
          relevant && sleeve !== undefined && order.indexOf(sleeve) < order.indexOf(minimum));
      }
    }
  }
});

test('judge parses and exports bounded sleeve setting with legacy fallback', () => {
  const request = { selection: { itemIds: [], occasion: 'work' as const }, brief: { context: 'work' as const } };
  for (const minimum of MINIMUM_SLEEVE_LENGTHS) {
    const constraints = profileJudgeConstraints({ minimumSleeveLength: minimum, noSleeveless: minimum === 'none', unrelatedKey: true });
    assert.equal(constraints.minimumSleeveLength, minimum);
    assert.equal(constraints.noSleeveless, minimum !== 'none');
    assert.equal(Object.hasOwn(constraints, 'unrelatedKey'), false);
    const text = exportJudgeText(request, [], [], constraints);
    assert.ok(JSON.stringify(buildJudgeBody(text)).includes(`minimumSleeveLength`));
    assert.ok(JSON.stringify(text).includes(minimum));
  }
  assert.equal(profileJudgeConstraints({ noSleeveless: true }).minimumSleeveLength, 'short');
  assert.equal(profileJudgeConstraints({}).minimumSleeveLength, 'none');
  assert.throws(() => profileJudgeConstraints({ minimumSleeveLength: 'arbitrary text' }));
});

test('deletion readiness asserts profile JSON is covered by owner-scoped deletion', () => {
  const source = readFileSync('scripts/check-deletion-readiness.mjs', 'utf8');
  assert.ok(source.includes('entry.table === "user_profiles" && entry.ownerColumn === "id"'));
  const inventory = readFileSync('server/accountDeletionInventory.ts', 'utf8');
  assert.match(inventory, /table:\s*"user_profiles",\s*ownerColumn:\s*"id"/);
});
