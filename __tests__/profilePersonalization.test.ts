import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  defaultProfile, mergeProfile, hydrateAccountProfile, hasMigratableGuestProfile,
  profileConstraints, onboardingStyleGoal, hasRequiredOnboardingFields,
} from '../shared/profile-personalization';
import { scoreItemForProfile } from '../constants/outfitScoring';
import {
  computePoolHash, applyDailyRotation, INITIAL_ROTATION_STATE, SCENARIOS, type RotationState,
} from '../constants/outfitRotation';
import type { UserProfile, WardrobeItem, OutfitSet, OccasionTag } from '../constants/types';

let passed = 0;
function test(name: string, run: () => void) {
  run();
  passed++;
  console.log(`PASS ${name}`);
}

const contextSource = readFileSync('contexts/AppContext.tsx', 'utf8');
const onboardingSource = readFileSync('app/onboarding.tsx', 'utf8');
const readyGuest = mergeProfile({
  name: 'Guest', isGuest: true, bodyType: 'pear', eyeColor: 'blue',
  skinTone: 'light', undertone: 'cool', faceShape: 'round',
  styleGoalPrimary: 'romantic', onboardingComplete: true,
  hairColor: 'blonde', lifestyleWork: 0, lifestyleCasual: 100, lifestyleEvents: 0,
  constraints: {
    noSleeveless: true, noShortSkirts: true, maxHeelHeight: 'low',
    colorAversions: ['orange'],
  },
});

test('account A → B with different fields → A never reuses local fallback', () => {
  const a = {
    name: 'Account A', body_type: 'pear' as const, eye_color: 'blue' as const,
    skin_tone: 'light' as const, undertone: 'cool' as const, style_goals: ['romantic'],
    onboarding_complete: true, constraints: profileConstraints(readyGuest),
  };
  const b = {
    name: 'Account B', body_type: 'apple' as const, eye_color: 'green' as const,
    skin_tone: 'dark' as const, undertone: 'warm' as const, style_goals: ['bold'],
    onboarding_complete: true, constraints: { _profile: { faceShape: 'square' as const } },
  };
  const firstA = hydrateAccountProfile(a, '');
  const nextB = hydrateAccountProfile(b, '');
  assert.equal(nextB.bodyType, 'apple');
  assert.equal(nextB.faceShape, 'square');
  assert.equal(nextB.eyeColor, 'green');
  assert.equal(nextB.skinTone, 'dark');
  assert.equal(nextB.styleGoalPrimary, 'bold');
  assert.equal(nextB.constraints.noSleeveless, false);
  assert.deepEqual(hydrateAccountProfile(a, ''), firstA);
});

test('null/missing remote fields and missing profile reset to neutral defaults', () => {
  const empty = hydrateAccountProfile({
    name: null, body_type: null, eye_color: null, skin_tone: null, undertone: null,
    style_goals: [], secondary_goal: null, lifestyle: null, constraints: null,
    onboarding_complete: false,
  }, 'Current auth name');
  assert.deepEqual(empty, { ...defaultProfile, name: 'Current auth name', isGuest: false,
    faceShape: null, tempUnit: undefined, weatherEnabled: undefined });
  assert.deepEqual(hydrateAccountProfile(null, ''), hydrateAccountProfile({}, ''));
  assert.equal(hasRequiredOnboardingFields(empty), false);
  assert.equal(empty.isGuest, false);
});

test('current-account false, zero, empty string and explicit null are respected', () => {
  const profile = hydrateAccountProfile({
    name: '', lifestyle: { work: 0, casual: 0, events: 0, active: 100, brunch: 0 },
    constraints: { noSleeveless: false, _profile: { weatherEnabled: false, faceShape: null } },
  }, 'Auth name');
  assert.equal(profile.name, '');
  assert.equal(profile.lifestyleWork, 0);
  assert.equal(profile.lifestyleActive, 100);
  assert.equal(profile.weatherEnabled, false);
  assert.equal(profile.faceShape, null);
  assert.equal(profile.constraints.noSleeveless, false);
});

test('only an explicit guest can migrate; signed-in caches cannot seed a blank account', () => {
  assert.equal(hasMigratableGuestProfile(readyGuest), true);
  assert.equal(hasMigratableGuestProfile({ ...readyGuest, isGuest: false }), false);
  assert.equal(hasMigratableGuestProfile({ ...readyGuest, isGuest: undefined }), false);
  assert.equal(hasMigratableGuestProfile(null), false);
  assert.equal(hasMigratableGuestProfile(mergeProfile({ isGuest: true })), false);
  const restored = mergeProfile(JSON.parse(JSON.stringify(readyGuest)));
  assert.deepEqual(restored, readyGuest, 'guest-only local restart is unchanged');
});

test('face shape and other profile/constraint values survive guest DB round trip', () => {
  const guest = {
    ...readyGuest,
    constraints: {
      ...readyGuest.constraints, customConstraint: 'keep',
      _profile: { customProfileValue: 'keep', faceShape: 'square' },
    },
  };
  const constraints = profileConstraints(guest);
  assert.equal(constraints._profile.faceShape, 'round', 'top-level face shape is authoritative');
  assert.equal((constraints as Record<string, unknown>).customConstraint, 'keep');
  assert.equal((constraints._profile as Record<string, unknown>).customProfileValue, 'keep');
  assert.deepEqual(constraints.colorAversions, ['orange']);
  assert.equal(constraints.noSleeveless, true);
  assert.equal(constraints.noShortSkirts, true);
  assert.equal(constraints.maxHeelHeight, 'low');
  const remote = hydrateAccountProfile({
    body_type: guest.bodyType, eye_color: guest.eyeColor, skin_tone: guest.skinTone,
    constraints,
  }, '');
  assert.equal(remote.faceShape, 'round');
  assert.equal(remote.hairColor, 'blonde');
  assert.equal(guest.constraints._profile.faceShape, 'square', 'serialization does not mutate guest');
});

test('actual hydration and update paths use the tested account/migration helpers', () => {
  assert.ok(contextSource.includes('const guestHasData = hasMigratableGuestProfile(guestProfileSnapshot)'));
  assert.ok(contextSource.includes('constraints: profileConstraints(guestProfileSnapshot)'));
  assert.ok(contextSource.includes('constraints: profileConstraints(updated)'));
  assert.ok(contextSource.includes('hydratedProfile = hydrateAccountProfile(dbProfile, authName)'));
  assert.ok(contextSource.includes('setProfile({ ...defaultProfile, isGuest: false })'));
  assert.ok(!contextSource.includes('dbProfile.body_type ?? prev.bodyType'));
  assert.ok(contextSource.includes('const mayMigrateGuest = currentUserIdRef.current === null'));
  assert.ok(contextSource.includes('mayMigrateGuest && localRaw'));
});

// Execute actual screen/effect bodies with offline boundaries, not copied logic.
function callback(source: string, start: string, end: string, name: string, deps: Record<string, unknown>) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing callback ${start}`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `missing callback boundary ${end}`);
  const compiled = transformSync(`${source.slice(from, to)}\nreturn ${name};`, { loader: 'ts' }).code;
  return new Function(...Object.keys(deps), compiled)(...Object.values(deps)) as () => void;
}

test('actual skip → completion → local restart and remote restart satisfy startup routing', () => {
  let step = 5;
  const haptics = { impactAsync: () => {}, ImpactFeedbackStyle: { Light: 'light' } };
  callback(onboardingSource, 'const skipStep =', 'const handleNext =', 'skipStep', {
    step, TOTAL_STEPS: 10, setStep: (value: number) => { step = value; }, Haptics: haptics,
  })();
  assert.equal(step, 6);
  let completed: UserProfile | null = null;
  const routes: string[] = [];
  callback(onboardingSource, 'const handleNext =', 'const handleBack =', 'handleNext', {
    step: 9, TOTAL_STEPS: 10, Haptics: haptics, setStep: () => {},
    name: readyGuest.name, bodyType: readyGuest.bodyType, faceShape: readyGuest.faceShape,
    eyeColor: readyGuest.eyeColor, skinTone: readyGuest.skinTone, undertone: readyGuest.undertone,
    styleGoalPrimary: null, styleGoalSecondary: null, onboardingStyleGoal,
    lifestyleAlloc: { work: 40, casual: 40, events: 20, active: 0, brunch: 0 },
    hairColor: null, heightBand: null, effectiveContrast: null, defaultMood: null,
    lifePhase: 'none', metalPreference: null, industry: 'unspecified', colorAversions: [],
    profile: readyGuest, params: { guest: 'true' },
    updateProfile: (updates: Partial<UserProfile>) => { completed = mergeProfile({ ...readyGuest, ...updates }); },
    router: { replace: (path: string) => routes.push(path) },
  })();
  assert.ok(completed);
  const saved = completed as UserProfile;
  assert.equal(saved.styleGoalPrimary, 'classic');
  assert.equal(saved.onboardingComplete, true);
  assert.deepEqual(routes, ['/(tabs)']);
  assert.equal(hasRequiredOnboardingFields(mergeProfile(JSON.parse(JSON.stringify(saved)))), true);
  assert.equal(hasRequiredOnboardingFields(hydrateAccountProfile({
    name: saved.name, body_type: saved.bodyType, eye_color: saved.eyeColor,
    skin_tone: saved.skinTone, undertone: saved.undertone, style_goals: ['classic'],
    onboarding_complete: true,
  }, '')), true);
  assert.ok(readFileSync('app/index.tsx', 'utf8').includes(
    'profile.onboardingComplete && hasRequiredOnboardingFields(profile)',
  ));
});

test('legacy skipped goal repairs only completed quizzes; explicit later goal wins', () => {
  const legacy = mergeProfile({ ...readyGuest, styleGoalPrimary: null });
  assert.equal(legacy.styleGoalPrimary, 'classic');
  assert.equal(hasRequiredOnboardingFields(legacy), true);
  assert.equal(mergeProfile({ styleGoalPrimary: null }).styleGoalPrimary, null);
  assert.equal(onboardingStyleGoal('bold'), 'bold');
  assert.equal(mergeProfile({ ...legacy, styleGoalPrimary: 'bold' }).styleGoalPrimary, 'bold');
});

const item: WardrobeItem = {
  id: 'controlled-top', category: 'top', subType: 't-shirt', colorFamily: 'coral',
  photoUri: '', occasionTags: [], seasonTags: [], formalityLevel: 3, createdAt: '2026-01-01',
};
const neutral = mergeProfile({});
const score = (changes: Partial<UserProfile>, color = item.colorFamily) =>
  scoreItemForProfile({ ...item, colorFamily: color }, 'casual', { ...neutral, ...changes });

test('eye colour supported match adds exactly +1, changing only eye colour', () => {
  assert.equal(score({ eyeColor: 'blue' }) - score({ eyeColor: null }), 1);
  assert.equal(score({ eyeColor: 'grey' }), score({ eyeColor: null }));
  assert.equal(score({ eyeColor: 'blue' }) - score({ eyeColor: 'grey' }), 1);
});

test('eye colour non-match has no effect', () => {
  assert.equal(score({ eyeColor: 'blue' }, 'black'), score({ eyeColor: null }, 'black'));
  assert.equal(score({ eyeColor: 'grey' }, 'black'), score({ eyeColor: null }, 'black'));
});

test('supported skin tone and contrast colour add exactly +1', () => {
  for (const skinTone of ['very-light', 'dark', 'very-dark'] as const) {
    assert.equal(score({ skinTone }) - score({ skinTone: 'medium' }), 1);
  }
});

test('non-matching skin tone or colour has no skin-depth effect', () => {
  assert.equal(score({ skinTone: 'medium' }), score({ skinTone: null }));
  assert.equal(score({ skinTone: 'dark' }, 'beige'), score({ skinTone: 'medium' }, 'beige'));
});

test('face-shape-only hash change invalidates actual rotation effect; unchanged input is stable', () => {
  const pool = {} as Record<OccasionTag, OutfitSet[]>;
  for (const scenario of SCENARIOS) pool[scenario] = [];
  const before = { ...neutral, faceShape: 'round' as const };
  const after = { ...before, faceShape: 'square' as const };
  const hash = computePoolHash([item], before);
  assert.equal(computePoolHash([item], { ...before }), hash);
  assert.notEqual(computePoolHash([item], after), hash);
  assert.equal(computePoolHash([item], neutral), computePoolHash([item], { ...neutral, faceShape: null }));
  const date = '2026-10-18';
  const state = { ...INITIAL_ROTATION_STATE, poolHash: hash, lastDate: date,
    shuffleSeed: 1234, todayCursors: { casual: 9 }, nextCursors: { casual: 11 } };
  const saved: RotationState[] = [];
  const writes: string[] = [];
  let resetBase: RotationState | null = null;
  const effect = (profile: UserProfile) => callback(
    contextSource,
    'const today = todayString();\n    const newHash = computePoolHash',
    '  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [activeWardrobeItems',
    'undefined',
    {
      todayString: () => date, computePoolHash, activeWardrobeItems: [item],
      profile, todayMood: null, weather: null, rotationState: state,
      INITIAL_ROTATION_STATE, outfitPool: pool, recentWornFingerprints: new Set(),
      isPremium: false, setRotationState: (s: RotationState) => saved.push(s),
      AsyncStorage: { setItem: (_key: string, value: string) => writes.push(value) },
      STORAGE_KEYS: { rotation: 'rotation' },
      applyDailyRotation: (...args: Parameters<typeof applyDailyRotation>) => {
        resetBase = args[1];
        return applyDailyRotation(...args);
      },
    },
  );
  // This effect body runs immediately during evaluation; its early return is intentional.
  effect(before);
  assert.equal(saved.length, 0, 'unchanged inputs do not reset or write rotation');
  effect(after);
  assert.equal(saved.length, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual((resetBase as unknown as RotationState).todayCursors, INITIAL_ROTATION_STATE.todayCursors);
  assert.deepEqual((resetBase as unknown as RotationState).nextCursors, INITIAL_ROTATION_STATE.nextCursors);
  assert.equal(saved[0].poolHash, computePoolHash([item], after));
  assert.deepEqual(applyDailyRotation(pool, state, date), applyDailyRotation(pool, state, date),
    'fixed seed/state selection stays deterministic');
});

async function hydrationCases() {
  async function asyncTest(name: string, run: () => Promise<void>) {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  }

  // Execute the real profile branch after the durable disposition has been
  // decided from mocked owner-scoped reads.
  // No live Supabase, native runtime or provider is imported.
  const start = contextSource.indexOf('const guestHasData = hasMigratableGuestProfile(guestProfileSnapshot)');
  const end = contextSource.indexOf('\n\n      {\n        const mapped:', start);
  assert.ok(start > 0 && end > start);
  const compiled = transformSync(`return async () => {
    ${contextSource.slice(start, end)}
  };`, { loader: 'ts' }).code;
  type Remote = Parameters<typeof hydrateAccountProfile>[0];
  let current = 'account-a';
  let shown = defaultProfile;
  let stored = JSON.stringify(readyGuest);
  const writes: Array<Record<string, unknown>> = [];
  let save: (payload: Record<string, unknown>) => Promise<void> = async payload => { writes.push(payload); };
  const hydrate = (
    userId: string,
    dbProfile: Remote,
    guestProfileSnapshot: UserProfile | null,
    guestDisposition: 'absorb' | 'discard' | null = null,
    authName = userId,
  ) =>
    new Function('deps', `const {
      userId, dbProfile, guestProfileSnapshot, guestDisposition, authName, hasMigratableGuestProfile,
      upsertUserProfile, profileConstraints, assertCurrent, mergeProfile,
      hydrateAccountProfile, AsyncStorage, STORAGE_KEYS, setProfile
    } = deps; ${compiled}`)({
      userId, dbProfile, guestProfileSnapshot, guestDisposition, authName, hasMigratableGuestProfile,
      upsertUserProfile: (payload: Record<string, unknown>) => save(payload),
      profileConstraints, mergeProfile, hydrateAccountProfile,
      assertCurrent: () => assert.equal(userId, current, 'stale account hydration'),
      setProfile: (value: UserProfile) => { shown = value; },
      STORAGE_KEYS: { profile: 'profile' },
      AsyncStorage: { setItem: async (_key: string, value: string) => { stored = value; } },
    })() as Promise<void>;

  await asyncTest('real guest migration writes face shape and consumes the guest cache before another account', async () => {
    await hydrate('account-a', null, readyGuest, 'absorb');
    assert.equal(shown.faceShape, 'round');
    assert.equal(shown.isGuest, false);
    const payload = writes[0];
    assert.equal(payload.id, 'account-a');
    assert.equal((payload.constraints as ReturnType<typeof profileConstraints>)._profile.faceShape, 'round');
    assert.deepEqual(payload.style_goals, ['romantic']);
    assert.equal(JSON.parse(stored).isGuest, false);
    current = 'account-b';
    await hydrate('account-b', null, mergeProfile(JSON.parse(stored)), null);
    assert.equal(writes.length, 2, 'second account does not migrate a signed-in cache (only its provider name is saved)');
    assert.equal(writes[1].body_type, undefined);
    assert.equal(shown.faceShape, null);
    assert.equal(shown.bodyType, null);
    assert.equal(shown.styleGoalPrimary, null);
  });

  await asyncTest('existing account keeps its profile and discards guest personalization', async () => {
    current = 'existing-account';
    const writesBefore = writes.length;
    await hydrate(current, {
      name: 'Authoritative remote name', body_type: 'pear', eye_color: 'blue',
      skin_tone: 'light', undertone: 'cool', onboarding_complete: true,
    }, readyGuest, 'discard');
    assert.equal(shown.name, 'Authoritative remote name');
    assert.equal(shown.bodyType, 'pear');
    assert.equal(shown.faceShape, null);
    assert.equal(writes.length, writesBefore, 'existing profile is never overwritten by guest data');
    assert.equal(JSON.parse(stored).name, 'Authoritative remote name');
  });

  await asyncTest('real remote hydration clears all prior-account answers when next account has null fields', async () => {
    current = 'account-a';
    await hydrate(current, {
      name: 'A', body_type: 'pear', eye_color: 'blue', skin_tone: 'light', undertone: 'cool',
      style_goals: ['romantic'], constraints: profileConstraints(readyGuest),
    }, null, null);
    assert.equal(shown.bodyType, 'pear');
    current = 'account-b';
    await hydrate(current, {
      name: 'B', body_type: null, eye_color: null, skin_tone: null, undertone: null,
      style_goals: null, secondary_goal: null, constraints: { _profile: { faceShape: null } },
    }, shown, null);
    assert.equal(shown.name, 'B');
    assert.equal(shown.bodyType, null);
    assert.equal(shown.eyeColor, null);
    assert.equal(shown.skinTone, null);
    assert.equal(shown.undertone, null);
    assert.equal(shown.faceShape, null);
    assert.equal(shown.styleGoalPrimary, null);
    assert.equal(shown.styleGoalSecondary, null);
    assert.equal(shown.constraints.noSleeveless, false);
  });

  await asyncTest('new email account creates a minimal profile without provider name metadata', async () => {
    current = 'email-account';
    save = async payload => { writes.push(payload); };
    await hydrate(current, null, null, null, '');
    assert.equal(writes.at(-1)?.id, current);
    assert.equal(writes.at(-1)?.name, undefined);
    assert.equal(shown.isGuest, false);
  });

  await asyncTest('failed migration retains guest cache for retry instead of claiming success', async () => {
    current = 'account-a';
    stored = JSON.stringify(readyGuest);
    shown = defaultProfile;
    save = async () => { throw new Error('profile write unavailable'); };
    await assert.rejects(hydrate(current, null, readyGuest, 'absorb'), /profile write unavailable/);
    assert.equal(JSON.parse(stored).isGuest, true);
    assert.equal(shown, defaultProfile);
  });

  await asyncTest('superseded account migration cannot publish late profile/cache data', async () => {
    current = 'account-a';
    stored = JSON.stringify(readyGuest);
    save = async () => { current = 'account-b'; };
    await assert.rejects(hydrate('account-a', null, readyGuest, 'absorb'), /stale account hydration/);
    assert.equal(shown, defaultProfile);
    assert.equal(JSON.parse(stored).isGuest, true, 'late completion cannot consume guest cache');
  });

  console.log(`Personalization consistency: ${passed} test groups passed (offline, no live accounts).`);
}

hydrationCases().catch(error => { console.error(error); process.exitCode = 1; });
