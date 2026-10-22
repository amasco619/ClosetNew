import type { UserProfile } from '../constants/types';

export const defaultProfile: UserProfile = {
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
  hairColor: null,
  heightBand: null,
  contrastLevel: null,
  metalPreference: null,
  lifePhase: 'none',
  defaultMood: null,
  industry: 'unspecified',
  dismissedProfileNudge: undefined,
};

export const onboardingStyleGoal = (goal: UserProfile['styleGoalPrimary']) => goal ?? 'classic';

export function mergeProfile(stored: Partial<UserProfile>): UserProfile {
  return {
    ...defaultProfile,
    ...stored,
    constraints: {
      ...defaultProfile.constraints,
      ...(stored.constraints ?? {}),
      colorAversions: stored.constraints?.colorAversions ?? [],
    },
  };
}

export function hasRequiredOnboardingFields(p: UserProfile): boolean {
  return !!(p.name?.trim() && p.bodyType && p.eyeColor && p.skinTone &&
    p.undertone && p.styleGoalPrimary);
}

export function hasMigratableGuestProfile(profile: UserProfile | null): boolean {
  return !!(profile?.isGuest && profile.bodyType && profile.eyeColor &&
    (profile.styleGoalPrimary || profile.onboardingComplete));
}

type ProfileExtension = { [K in keyof UserProfile]?: UserProfile[K] | null };

export function profileConstraints(profile: UserProfile) {
  const constraints = profile.constraints as UserProfile['constraints'] & {
    _profile?: ProfileExtension;
  };
  return {
    ...constraints,
    _profile: {
      ...constraints._profile,
      hairColor: profile.hairColor ?? null,
      heightBand: profile.heightBand ?? null,
      faceShape: profile.faceShape ?? null,
      contrastLevel: profile.contrastLevel ?? null,
      metalPreference: profile.metalPreference ?? null,
      defaultMood: profile.defaultMood ?? null,
      industry: profile.industry ?? null,
      lifePhase: profile.lifePhase ?? null,
      tempUnit: profile.tempUnit ?? null,
      weatherEnabled: profile.weatherEnabled ?? null,
    },
  };
}

interface RemoteProfile {
  name?: string | null;
  body_type?: UserProfile['bodyType'];
  eye_color?: UserProfile['eyeColor'];
  skin_tone?: UserProfile['skinTone'];
  undertone?: UserProfile['undertone'];
  style_goals?: string[] | null;
  secondary_goal?: UserProfile['styleGoalSecondary'];
  lifestyle?: Partial<Record<'work' | 'casual' | 'events' | 'active' | 'brunch', number>> | null;
  constraints?: Partial<UserProfile['constraints']> & {
    _profile?: ProfileExtension | null;
  } | null;
  onboarding_complete?: boolean | null;
}

/** Remote null/unset means no account value, never "reuse the previous user". */
export function hydrateAccountProfile(remote: RemoteProfile | null, authName: string): UserProfile {
  const db = remote ?? {};
  const ext = db.constraints?._profile ?? {};
  return mergeProfile({
    ...defaultProfile,
    isGuest: false,
    name: db.name ?? authName,
    bodyType: db.body_type ?? null,
    eyeColor: db.eye_color ?? null,
    skinTone: db.skin_tone ?? null,
    undertone: db.undertone ?? null,
    styleGoalPrimary: (db.style_goals?.[0] as UserProfile['styleGoalPrimary']) ?? null,
    styleGoalSecondary: db.secondary_goal ?? null,
    lifestyleWork: db.lifestyle?.work ?? defaultProfile.lifestyleWork,
    lifestyleCasual: db.lifestyle?.casual ?? defaultProfile.lifestyleCasual,
    lifestyleEvents: db.lifestyle?.events ?? defaultProfile.lifestyleEvents,
    lifestyleActive: db.lifestyle?.active ?? 0,
    lifestyleBrunch: db.lifestyle?.brunch ?? 0,
    constraints: {
      ...defaultProfile.constraints,
      ...db.constraints,
      noSleeveless: db.constraints?.noSleeveless ?? false,
      noShortSkirts: db.constraints?.noShortSkirts ?? false,
      maxHeelHeight: db.constraints?.maxHeelHeight ?? 'any',
      colorAversions: db.constraints?.colorAversions ?? [],
    },
    hairColor: ext.hairColor ?? null,
    heightBand: ext.heightBand ?? null,
    faceShape: ext.faceShape ?? null,
    contrastLevel: ext.contrastLevel ?? null,
    metalPreference: ext.metalPreference ?? null,
    defaultMood: ext.defaultMood ?? null,
    industry: ext.industry ?? defaultProfile.industry,
    lifePhase: ext.lifePhase ?? defaultProfile.lifePhase,
    tempUnit: ext.tempUnit ?? defaultProfile.tempUnit,
    weatherEnabled: ext.weatherEnabled ?? defaultProfile.weatherEnabled,
    onboardingComplete: db.onboarding_complete ?? false,
  });
}
