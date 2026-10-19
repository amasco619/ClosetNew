import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONCIERGE_OCCASIONS, conciergeReadiness, parseConciergeIntent } from '../lib/concierge';
import { SCENARIOS, generateOutfitPool } from '../constants/outfitRotation';
import { traditionalWardrobe, traditionalGroups, traditionalProfile } from './fixtures/traditionalWardrobe';
import { projectWardrobeForStyling } from '../lib/stylingWardrobe';
import { projectRelationshipsForStyling } from '../lib/stylingRelationships';
import { buildStylingContextCandidates } from '../lib/traditionalStyling';
import { EMPTY_AFFINITY } from '../constants/affinity';
import { readCurrentEntitlement } from '../lib/entitlements';
import { transform } from 'esbuild';

assert.deepEqual(CONCIERGE_OCCASIONS.map(option => option.id), ['work', 'date-dressy', 'event', 'wedding', 'traditional-event']);
for (const option of CONCIERGE_OCCASIONS) assert.deepEqual(parseConciergeIntent({ occasion: option.id }), { occasion: option.id });
for (const input of [undefined, null, [], 'work', {}, { occasion: ['work'] }, { occasion: 'travel' }, { occasion: 'resort' }, { occasion: 'date-night' }, { occasion: 'unknown' }]) {
  assert.equal(parseConciergeIntent(input), null);
}
const before = JSON.stringify({ traditionalWardrobe, traditionalGroups, traditionalProfile });
const wardrobe = [
  ...traditionalWardrobe,
  { ...traditionalWardrobe[2], id: 'work-top', subType: 'custom-work-top', formalityLevel: 6 },
  { ...traditionalWardrobe[3], id: 'work-bottom', subType: 'custom-work-bottom', formalityLevel: 6, fit: 'regular' as const },
];
const pool = generateOutfitPool(projectWardrobeForStyling(wardrobe).v37Items, traditionalProfile, null, [], '2026-10-13', [], EMPTY_AFFINITY, null, true);
for (const option of CONCIERGE_OCCASIONS.filter(option => option.id !== 'traditional-event')) {
  assert.ok(SCENARIOS.includes(option.id), `${option.id} is in the actual frozen generator/selector loop`);
  assert.ok(pool[option.id].length > 0, `${option.id} actually constructs candidates from a supporting owned wardrobe`);
  assert.ok(pool[option.id].every(outfit => outfit.scenario === option.id));
}
assert.ok(!SCENARIOS.includes('traditional-event'), 'Traditional must not silently use the generic selector');
const traditional = buildStylingContextCandidates(
  projectRelationshipsForStyling(projectWardrobeForStyling(wardrobe, traditionalGroups), 'fixture-owner'),
  'traditional', traditionalProfile, null, [], '2026-10-13', [], EMPTY_AFFINITY, null, true,
);
assert.ok(traditional.sourceScenario);
assert.ok(traditional.pool[traditional.sourceScenario].length > 0);
assert.ok(traditional.pool[traditional.sourceScenario].every(outfit => ['buba', 'iro'].every(id => outfit.components.some(component => component.matchedItemId === id))));
assert.equal(JSON.stringify({ traditionalWardrobe, traditionalGroups, traditionalProfile }), before);

const known = { failed: false, wardrobeComplete: true, loading: false, stylingComplete: true, itemCount: 9, resultCount: 2 };
assert.equal(conciergeReadiness(known), 'ready');
assert.equal(conciergeReadiness({ ...known, wardrobeComplete: false, itemCount: 0, resultCount: 0 }), 'loading');
assert.equal(conciergeReadiness({ ...known, loading: true }), 'loading');
assert.equal(conciergeReadiness({ ...known, stylingComplete: false, resultCount: 0 }), 'loading');
assert.equal(conciergeReadiness({ ...known, failed: true }), 'failure');
assert.equal(conciergeReadiness({ ...known, itemCount: 0, resultCount: 0 }), 'insufficient');
assert.equal(conciergeReadiness({ ...known, resultCount: 0 }), 'empty');
const ui = readFileSync('app/(tabs)/outfits.tsx', 'utf8');
assert.doesNotMatch(ui, /generateOutfitPool|buildStylingContextCandidates|fetchAuthoritativeEntitlement/);
assert.match(ui, /getStylingRecommendations\('traditional'\)/);
assert.match(ui, /outfitSets\.filter\(o => o\.scenario === selectedScenario\)/);
assert.match(ui, /const approved = await refreshPremiumEntitlement\(true\)/);
assert.match(ui, /profile\?\.tempUnit \?\? defaultTempUnit\(\)/);
console.log('Five verified paths, strict transient intents, true candidate construction, readiness precedence, unchanged canonical facts and existing source-of-truth handoff passed');

// Execute the actual AppContext refresh body, isolating only its hook and I/O.
// This verifies the opt-in contract rather than a parallel stand-in implementation.
async function checkRefreshContract() {
  const source = readFileSync('contexts/AppContext.tsx', 'utf8');
  const body = source.match(/const refreshPremiumEntitlement = useCallback\([\s\S]*?\}, \[\]\);/)?.[0];
  assert.ok(body);
  let serverPremium = true, fail = false, serverReads = 0, pending: Promise<void> | undefined;
  const owner = { current: 'fixture-owner' as string | null };
  const account = { current: 1 }, startup = { current: 1 }, premium = { current: false };
  let unavailable = false;
  const deps = {
    useCallback: (callback: unknown) => callback,
    currentUserIdRef: owner, accountGenerationRef: account, startupGenerationRef: startup, isPremiumRef: premium,
    wardrobeItemsRef: { current: [] },
    isCurrentStartupGeneration: (a: number, b: number) => a === b,
    isCurrentAccountRequest: (user: string, generation: number, boot: number) => owner.current === user && account.current === generation && startup.current === boot,
    readCurrentEntitlement,
    fetchAuthoritativeEntitlement: async () => {
      serverReads++;
      if (pending) await pending;
      if (fail) throw new Error('read unavailable');
      return { isPremium: serverPremium };
    },
    getFreeWardrobeSelection: async () => [], getSelectedWardrobeItems: async () => [],
    mapDbRowToWardrobeItem: (value: unknown) => value, hydrateWardrobePhotos: async () => {},
    setWardrobeItems: () => {}, setFreeSelectedItemIds: () => {},
    setEntitlementUnavailable: (value: boolean) => { unavailable = value; },
    setIsPremium: (value: boolean) => { premium.current = value; },
    reportError: () => {},
  };
  const transformed = await transform(`${body}\nreturn refreshPremiumEntitlement;`, { loader: 'ts' });
  const refresh = new Function(...Object.keys(deps), transformed.code)(...Object.values(deps)) as (strict?: boolean) => Promise<boolean>;
  assert.equal(await refresh(true), true);
  serverPremium = false;
  assert.equal(await refresh(true), false, 'confirmed non-Premium is a successful false');
  assert.equal(unavailable, false);
  fail = true;
  assert.equal(await refresh(), false, 'default callers keep fail-closed boolean semantics');
  assert.equal(unavailable, true);
  await assert.rejects(refresh(true), /read unavailable/);
  assert.equal(premium.current, false, 'failed authoritative reads leave Premium off');
  assert.equal(unavailable, true, 'failed authoritative reads leave entitlement unavailable');
  const readsBeforeRecovery = serverReads;
  serverPremium = true;
  fail = false;
  assert.equal(await refresh(true), true, 'a fresh server-confirmed Premium response restores access');
  assert.equal(premium.current, true, 'server-confirmed Premium is restored after an outage');
  assert.equal(unavailable, false, 'a successful authoritative read clears entitlement unavailable');
  assert.equal(serverReads, readsBeforeRecovery + 1, 'recovery requires a new authoritative server read');
  let release = () => {};
  pending = new Promise<void>(resolve => { release = resolve; });
  const stale = refresh(true);
  startup.current += 1;
  release();
  await assert.rejects(stale, /superseded/);
  pending = undefined;
  owner.current = null;
  assert.equal(await refresh(), false);
  await assert.rejects(refresh(true), /unavailable/);
  console.log('Actual AppContext refresh: strict grant/confirmed denial/unavailable/superseded/no-session and backward-compatible default contract passed');
}
checkRefreshContract().catch(error => { console.error(error); process.exitCode = 1; });
