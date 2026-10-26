import assert from 'node:assert/strict';
import type { GarmentGroup, OccasionTag, WardrobeItem } from '../constants/types';
import { evaluateCheckLook, isValidCheckLookSelection } from '../lib/checkLook';
import {
  consumeCheckLookAllowance, readCheckLookAllowance,
  type CheckLookAllowanceStore,
} from '../lib/checkLookAllowance';
import { resolveCheckLookFreeVerdictsPerDay } from '../constants/checkLookConfig';
import {
  CHECK_LOOK_GROUP_READ_TIMEOUT_MS, loadCheckLookMembershipsOnOpen, withCheckLookGroupTimeout,
} from '../lib/checkLookMembership';

function item(
  id: string,
  category: WardrobeItem['category'],
  subType: string,
  overrides: Partial<WardrobeItem> = {},
): WardrobeItem {
  return {
    id, photoUri: `test://${id}`, category, subType, colorFamily: 'navy',
    occasionTags: [], seasonTags: [], createdAt: '',
    ...overrides,
  };
}

function group(ids: string[], ownerId = 'owner'): GarmentGroup {
  return {
    id: 'set-1', userId: ownerId, relationshipType: 'coordinated_set',
    confirmationStatus: 'user_confirmed', sharedAttributes: {}, createdAt: '', updatedAt: '',
    members: ids.map(garmentId => ({ garmentId, groupId: 'set-1', userId: ownerId, createdAt: '' })),
  };
}

function selection(itemIds: string[], occasion: OccasionTag = 'work') {
  return { itemIds, occasion };
}

const good = [
  item('top', 'top', 'blouse', { formalityLevel: 5, occasionTags: ['work'] }),
  item('bottom', 'bottom', 'trousers', { formalityLevel: 5, occasionTags: ['work'] }),
  item('shoes', 'shoes', 'loafers', { formalityLevel: 5 }),
];

async function main() {
assert.ok(isValidCheckLookSelection(good, ['top', 'bottom']));
assert.ok(isValidCheckLookSelection([item('dress', 'dress', 'dress')], ['dress']));
assert.equal(isValidCheckLookSelection(good, ['top']), false);
assert.equal(isValidCheckLookSelection(
  [...good, item('dress', 'dress', 'dress')], ['top', 'bottom', 'dress'],
), false);

const goodFree = evaluateCheckLook(good, selection(['top', 'bottom', 'shoes']), { premium: false });
assert.deepEqual(Object.keys(goodFree).sort(), ['tier', 'verdict']);
assert.equal(goodFree.verdict, 'Works');

const wrongOccasion = [
  item('top', 'top', 't-shirt', { formalityLevel: 2, occasionTags: ['casual'] }),
  item('bottom', 'bottom', 'jeans', { formalityLevel: 3 }),
  item('shoes', 'shoes', 'trainers', { formalityLevel: 2 }),
];
assert.equal(evaluateCheckLook(wrongOccasion, selection(['top', 'bottom', 'shoes'], 'wedding'), {
  premium: false,
}).verdict, 'Rethink');

const clashingPrint = [
  item('top', 'top', 'blouse', { pattern: 'floral', patternScale: 'large', formalityLevel: 5 }),
  item('bottom', 'bottom', 'trousers', { pattern: 'check', patternScale: 'medium', formalityLevel: 5 }),
];
assert.equal(evaluateCheckLook(clashingPrint, selection(['top', 'bottom']), { premium: false }).verdict, 'Almost');

const casualShoes = [
  item('dress', 'dress', 'gown', { formalityLevel: 8, occasionTags: ['wedding'] }),
  item('shoes', 'shoes', 'flip-flops', { formalityLevel: 1 }),
];
assert.equal(evaluateCheckLook(casualShoes, selection(['dress', 'shoes'], 'wedding'), {
  premium: false,
}).verdict, 'Rethink');

const swapItems = [
  item('top', 'top', 'top', { formalityLevel: 2, occasionTags: ['work'] }),
  item('bottom', 'bottom', 'bottom', { formalityLevel: 7, occasionTags: ['work'] }),
  item('better-top', 'top', 'top', { formalityLevel: 7, occasionTags: ['work'] }),
  item('wrong-category', 'dress', 'dress', { formalityLevel: 7, occasionTags: ['work'] }),
];
const premiumSwap = evaluateCheckLook(swapItems, selection(['top', 'bottom']), {
  premium: true, groups: [], ownerId: 'owner',
});
assert.equal(premiumSwap.tier, 'premium');
if (premiumSwap.tier === 'premium') {
  assert.ok(premiumSwap.swaps.length <= 2);
  assert.ok(premiumSwap.swaps.every(swap =>
    swap.replacement.category === swapItems.find(item => item.id === swap.replacesId)?.category,
  ));
  assert.ok(premiumSwap.swaps.some(swap => swap.replacement.id === 'better-top'));
}

const setItems = [
  item('set-top', 'top', 'top', { formalityLevel: 5 }),
  item('set-bottom', 'bottom', 'bottom', { formalityLevel: 5 }),
  item('solo-top', 'top', 'top', { formalityLevel: 8 }),
];
const setRecord = group(['set-top', 'set-bottom']);
const fullSetResult = evaluateCheckLook(setItems, selection(['set-top', 'set-bottom']), {
  premium: true, groups: [setRecord], ownerId: 'owner',
});
assert.equal(fullSetResult.tier, 'premium');
if (fullSetResult.tier === 'premium') {
  assert.ok(fullSetResult.swaps.every(swap => swap.replacesId !== 'set-top' && swap.replacesId !== 'set-bottom'));
  assert.ok(fullSetResult.swaps.every(swap => swap.replacement.id !== 'set-top' && swap.replacement.id !== 'set-bottom'));
}
const partialSetRecord = group(['set-top', 'solo-top']);
const partialSetResult = evaluateCheckLook(setItems, selection(['set-top', 'set-bottom']), {
  premium: true, groups: [partialSetRecord], ownerId: 'owner',
});
assert.equal(partialSetResult.tier, 'premium');
if (partialSetResult.tier === 'premium') {
  assert.ok(partialSetResult.notes.some(note => note ===
    'Partial confirmed coordinated set: 1 of 2 pieces; the other pieces are not included.'));
}

const groupsUnavailable = evaluateCheckLook(good, selection(['top', 'bottom']), {
  premium: true, membershipUnavailable: true,
});
assert.equal(groupsUnavailable.tier, 'premium');
if (groupsUnavailable.tier === 'premium') {
  assert.ok(groupsUnavailable.working.length > 0);
  assert.equal(groupsUnavailable.swaps.length, 0);
  assert.ok(groupsUnavailable.notes.some(note => note.includes('membership could not be checked')));
}

assert.equal(resolveCheckLookFreeVerdictsPerDay(undefined), 5);
assert.equal(resolveCheckLookFreeVerdictsPerDay(''), 5);
assert.equal(resolveCheckLookFreeVerdictsPerDay('0'), 0);
assert.equal(resolveCheckLookFreeVerdictsPerDay('3'), 3);
assert.equal(resolveCheckLookFreeVerdictsPerDay('-1'), 5);

class MemoryStore implements CheckLookAllowanceStore {
  values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
}
const store = new MemoryStore();
const allowanceTime = new Date(2026, 9, 27, 12).getTime();
assert.equal(await readCheckLookAllowance(store, 5, allowanceTime), 5);
const consumes = await Promise.all(Array.from({ length: 7 }, () =>
  consumeCheckLookAllowance(store, 5, allowanceTime),
));
assert.equal(consumes.filter(result => result.allowed).length, 5);
assert.equal(await readCheckLookAllowance(store, 5, allowanceTime), 0);
assert.equal(await readCheckLookAllowance(store, 5, allowanceTime + 86_400_000), 5);
assert.deepEqual(await consumeCheckLookAllowance(store, 0, allowanceTime), {
  allowed: false, remaining: 0,
});

assert.equal(CHECK_LOOK_GROUP_READ_TIMEOUT_MS, 8_000);
await assert.rejects(withCheckLookGroupTimeout(new Promise(() => {}), 5), /timed out/);
assert.deepEqual(await withCheckLookGroupTimeout(Promise.resolve(['group']), 100), ['group']);
let groupFetches = 0;
assert.equal(await loadCheckLookMembershipsOnOpen(false, 'owner', async () => {
  groupFetches++;
  return ['group'];
}), undefined);
assert.equal(groupFetches, 0, 'free users never trigger the group read');
assert.deepEqual(await loadCheckLookMembershipsOnOpen(true, 'owner', async id => {
  assert.equal(id, 'owner');
  groupFetches++;
  return ['group'];
}), ['group']);
assert.equal(groupFetches, 1, 'Premium opening triggers one relationship read');

console.log('Check My Look rules, swaps, membership timeout and local free allowance passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
