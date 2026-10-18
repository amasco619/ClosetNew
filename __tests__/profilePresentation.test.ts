import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '@/constants/types';
import {
  getAiProcessingDisplay,
  getPersonalIntelligenceSubtitle,
  getPlanPillLabel,
  getRefinementCounts,
  getRefinementSummary,
  shouldShowBeginWardrobe,
} from '@/lib/profilePresentation';
import type { AiProcessingPreference } from '@/lib/aiProcessingPreferenceState';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: '',
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
    constraints: {
      noSleeveless: false,
      noShortSkirts: false,
      maxHeelHeight: 'any',
      colorAversions: [],
    },
    onboardingComplete: false,
    ...overrides,
  } as UserProfile;
}

test('refinement counters preserve the current physical, style, and lifestyle definitions', () => {
  const none = getRefinementCounts(makeProfile());
  assert.deepEqual(none, { physical: 0, style: 0, lifestyle: 0, total: 0 });
  assert.equal(
    getRefinementCounts({
      ...makeProfile(),
      lifestyleWork: undefined,
    } as unknown as UserProfile).lifestyle,
    0,
  );

  const some = getRefinementCounts(makeProfile({
    hairColor: 'black',
    heightBand: 'average',
    contrastLevel: 'high',
    constraints: {
      noSleeveless: true,
      noShortSkirts: false,
      maxHeelHeight: 'any',
      colorAversions: ['purple'],
    },
    lifestyleWork: 60,
    lifestyleCasual: 20,
    defaultMood: 'confident',
    industry: 'tech',
  }));
  assert.deepEqual(some, { physical: 2, style: 3, lifestyle: 3, total: 8 });
  assert.equal(getRefinementSummary(some), '8 of 13 set · optional');

  const complete = getRefinementCounts(makeProfile({
    hairColor: 'black',
    heightBand: 'average',
    faceShape: 'oval',
    contrastLevel: 'high',
    metalPreference: 'silver',
    constraints: {
      noSleeveless: true,
      noShortSkirts: true,
      maxHeelHeight: 'flat',
      colorAversions: ['purple'],
    },
    defaultMood: 'soft',
    industry: 'creative',
    lifePhase: 'pregnancy',
    lifestyleWork: 60,
  }));
  assert.deepEqual(complete, { physical: 3, style: 6, lifestyle: 4, total: 13 });
  assert.equal(getRefinementSummary(complete), '13 of 13 set · optional');
});

test('profile presentation helpers cover plan, empty wardrobe, and Personal Intelligence states', () => {
  assert.equal(getPlanPillLabel(false), 'Free');
  assert.equal(getPlanPillLabel(true), 'Premium');
  assert.equal(shouldShowBeginWardrobe(0), true);
  assert.equal(shouldShowBeginWardrobe(1), false);
  assert.equal(getPersonalIntelligenceSubtitle(false, 0), 'Learning · 0 of 5 signals');
  assert.equal(getPersonalIntelligenceSubtitle(true, 5), 'Active · 5 signals');
});

test('AI-processing row distinguishes no choice, allowed, declined, and unavailable states', () => {
  const ready = { loading: false, unavailable: false, guest: false };
  const cases: [AiProcessingPreference, boolean, string | null][] = [
    ['not_asked', false, "We'll ask before your first photo is processed."],
    ['allowed', true, null],
    ['declined', false, null],
  ];
  for (const [preference, value, caption] of cases) {
    assert.deepEqual(getAiProcessingDisplay(preference, ready), { value, caption });
  }
  assert.deepEqual(getAiProcessingDisplay('allowed', { ...ready, unavailable: true }), {
    value: false,
    caption: null,
  });
});
