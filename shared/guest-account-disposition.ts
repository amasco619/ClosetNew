import type { GuestDataDisposition } from '../lib/guestWardrobeMigration';

type AccountProfileSnapshot = {
  name?: unknown;
  body_type?: unknown;
  eye_color?: unknown;
  skin_tone?: unknown;
  undertone?: unknown;
  style_goals?: unknown;
  secondary_goal?: unknown;
  lifestyle?: unknown;
  constraints?: unknown;
  onboarding_complete?: unknown;
} | null;

function differsFromDefaults(value: unknown, defaults: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).some(([key, current]) => {
    if (current === null || current === undefined) return false;
    if (!Object.hasOwn(defaults, key)) return true;
    const baseline = defaults[key];
    if (Array.isArray(current) && Array.isArray(baseline)) return current.length !== baseline.length ||
      current.some((entry, index) => entry !== baseline[index]);
    if (current && baseline && typeof current === 'object' && typeof baseline === 'object' &&
      !Array.isArray(current) && !Array.isArray(baseline)) {
      return differsFromDefaults(current, baseline as Record<string, unknown>);
    }
    return current !== baseline;
  });
}

const defaultLifestyle = { work: 40, casual: 40, events: 20, active: 0, brunch: 0 };
const defaultConstraints = {
  noSleeveless: false,
  noShortSkirts: false,
  maxHeelHeight: 'any',
  colorAversions: [],
  _profile: {
    hairColor: null, heightBand: null, faceShape: null, contrastLevel: null,
    metalPreference: null, defaultMood: null, industry: 'unspecified',
    lifePhase: 'none', tempUnit: null, weatherEnabled: null,
  },
};

export function hasSavedOnboardingOrPersonalization(profile: AccountProfileSnapshot): boolean {
  if (!profile) return false;
  return Boolean(
    (typeof profile.name === 'string' && profile.name.trim()) ||
    profile.body_type || profile.eye_color || profile.skin_tone || profile.undertone ||
    profile.secondary_goal || profile.onboarding_complete === true ||
    (Array.isArray(profile.style_goals) && profile.style_goals.length > 0) ||
    differsFromDefaults(profile.lifestyle, defaultLifestyle) ||
    differsFromDefaults(profile.constraints, defaultConstraints),
  );
}

/** Account-side truth, not the signup provider or the guest profile, decides. */
export function decideGuestDataDisposition(
  profile: AccountProfileSnapshot,
  wardrobeItemCount: number,
): GuestDataDisposition {
  return wardrobeItemCount > 0 || hasSavedOnboardingOrPersonalization(profile)
    ? 'discard'
    : 'absorb';
}
