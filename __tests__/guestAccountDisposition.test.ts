import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideGuestDataDisposition, hasSavedOnboardingOrPersonalization } from '../shared/guest-account-disposition';
import { selectPendingGuestWardrobeItems, wardrobeHeaderCopy } from '../lib/guestWardrobePresentation';
import { isGuestMigrationEntry, type GuestMigrationRecord } from '../lib/guestWardrobeMigration';
import type { WardrobeItem } from '../constants/types';

const item: WardrobeItem = {
  id: 'item-1', createdAt: '2026-10-01T00:00:00Z', photoUri: 'file:///docs/wardrobe_item-1.jpg',
  category: 'top', subType: 't-shirt', colorFamily: 'grey',
  seasonTags: ['all-season'], occasionTags: ['casual'],
};

const record = (ownerId: string, migrationId: string, synced = false): GuestMigrationRecord => ({
  ownerId, migrationId, item: { ...item }, synced, announced: false,
});

assert.equal(decideGuestDataDisposition(null, 1), 'discard', 'an account with wardrobe rows is existing');
assert.equal(decideGuestDataDisposition({ onboarding_complete: true }, 0), 'discard',
  'an empty wardrobe does not make an onboarded account new');
assert.equal(decideGuestDataDisposition({ body_type: 'petite' }, 0), 'discard',
  'saved personalization makes an empty account existing');
assert.equal(decideGuestDataDisposition(null, 0), 'absorb', 'an empty, unpersonalised account is new');
assert.equal(hasSavedOnboardingOrPersonalization({
  lifestyle: { work: 40, casual: 40, events: 20, active: 0, brunch: 0 },
  constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: [] },
  name: '',
}), false, 'default profile values do not count as saved answers');
assert.equal(hasSavedOnboardingOrPersonalization({
  constraints: {
    noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any', colorAversions: [],
    _profile: {
      hairColor: null, heightBand: null, faceShape: null, contrastLevel: null,
      metalPreference: null, defaultMood: null, industry: 'unspecified',
      lifePhase: 'none', tempUnit: null, weatherEnabled: null,
    },
  },
}), false, 'the nested default profile extension does not make an account look personalised');

const entries: GuestMigrationRecord[] = [
  record('owner-a', 'pending-1'),
  record('owner-a', 'pending-1'),
  record('owner-a', 'synced-1', true),
  record('owner-b', 'other-owner'),
];
const visible = selectPendingGuestWardrobeItems(entries, 'owner-a', new Set());
assert.deepEqual(visible.map(entry => entry.migrationId), ['pending-1'],
  'only pending rows owned by the active account appear');
assert.equal(selectPendingGuestWardrobeItems(entries, 'owner-a', new Set(['pending-1'])).length, 0,
  'a confirmed stable ID is not displayed twice');
assert.equal(selectPendingGuestWardrobeItems(entries, null, new Set()).length, 0,
  'signed-out users cannot see an account-owned pending item');
assert.ok(entries.filter(isGuestMigrationEntry).length === 4);

assert.equal(wardrobeHeaderCopy(1, false, false), '1 total item · 30 included');
assert.equal(wardrobeHeaderCopy(2, true, false), '2 total items · 8 included');
assert.equal(wardrobeHeaderCopy(4, false, true), '4 total items');

const appContext = readFileSync('contexts/AppContext.tsx', 'utf8');
assert.match(appContext, /const \[\s*dbProfile, wardrobePage,[\s\S]*?getUserProfile\(userId\),[\s\S]*?getWardrobeItems\(userId\)/);
assert.match(appContext, /const journal = await guestWardrobeSync\.list\(\);[\s\S]*?guestWardrobeSync\.decide\(userId, decision\)/,
  'server state is read before the durable decision');
assert.match(appContext, /if \(guestDisposition === 'absorb'\)[\s\S]*?guestWardrobeSync\.claim\(userId, cachedGuestItems/);
assert.match(appContext, /await guestWardrobeSync\.discardOwner\(userId\);[\s\S]*?clearAccountDeviceData/);
assert.match(appContext, /if \(!dbProfile\)[\s\S]*?await upsertUserProfile/,
  'a missing profile row is created without overwriting an existing remote profile');
assert.match(appContext, /setGuestPendingWardrobeItems\(selectPendingGuestWardrobeItems/);

const bulk = readFileSync('app/bulk-review.tsx', 'utf8');
assert.match(bulk, /isManual \? \([\s\S]*?onPress=\{\(\) => onManual\(item\.uri\)\}/,
  'the guest manual photo tile opens Add Item');
assert.match(bulk, /accessibilityLabel="Add details for this photo"[\s\S]*?onManual\(item\.uri\)/,
  'the dedicated Add details control opens the same manual flow');
assert.match(bulk, /manualOnly: selectionStartedAsGuest/);

console.log('Guest disposition, pending-item presentation, counter copy, and guest bulk handoff tests passed.');
