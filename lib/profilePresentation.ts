import type { UserProfile } from '@/constants/types';
import {
  isAiProcessingSwitchOn,
  type AiProcessingPreference,
} from '@/lib/aiProcessingPreferenceState';
import {
  bodyTypeLabels,
  eyeColorLabels,
  skinToneLabels,
  styleGoalLabels,
  undertoneLabels,
} from '@/lib/profileStyleLabels';

export interface RefinementCounts {
  physical: number;
  style: number;
  lifestyle: number;
  total: number;
}

export interface ProfileStyleDnaItem {
  label: string;
  value: string;
}

export function getProfileStyleDna(profile: UserProfile): ProfileStyleDnaItem[] {
  const items: { label: string; value: string | null | undefined }[] = [
    { label: 'Body Shape', value: profile.bodyType ? bodyTypeLabels[profile.bodyType] : null },
    { label: 'Eye Colour', value: profile.eyeColor ? eyeColorLabels[profile.eyeColor] : null },
    { label: 'Skin Tone', value: profile.skinTone ? skinToneLabels[profile.skinTone] : null },
    { label: 'Undertone', value: profile.undertone ? undertoneLabels[profile.undertone] : null },
    { label: 'Primary Style', value: profile.styleGoalPrimary ? styleGoalLabels[profile.styleGoalPrimary] : null },
    { label: 'Secondary Style', value: profile.styleGoalSecondary ? styleGoalLabels[profile.styleGoalSecondary] : null },
  ];
  return items.filter((item): item is ProfileStyleDnaItem => Boolean(item.value));
}

const lifestyleDefaults = {
  work: 40,
  casual: 40,
  events: 20,
  active: 0,
  brunch: 0,
} as const;

const lifestyleKeys = Object.keys(lifestyleDefaults) as (keyof typeof lifestyleDefaults)[];

export function getRefinementCounts(profile: UserProfile): RefinementCounts {
  const physical = [
    profile.hairColor,
    profile.heightBand,
    profile.faceShape,
  ].filter(Boolean).length;
  const style = [
    profile.contrastLevel,
    profile.metalPreference,
    profile.constraints.colorAversions?.length ? 'yes' : null,
    profile.constraints.noSleeveless ? 'yes' : null,
    profile.constraints.noShortSkirts ? 'yes' : null,
    profile.constraints.maxHeelHeight !== 'any' ? 'yes' : null,
  ].filter(Boolean).length;
  const allocationChanged = lifestyleKeys.some(key => {
    const profileKey = `lifestyle${key[0].toUpperCase()}${key.slice(1)}` as keyof UserProfile;
    return ((profile[profileKey] as number | undefined) ?? lifestyleDefaults[key]) !== lifestyleDefaults[key];
  });
  const lifestyle = [
    profile.defaultMood,
    profile.industry && profile.industry !== 'unspecified' ? profile.industry : null,
    profile.lifePhase && profile.lifePhase !== 'none' ? profile.lifePhase : null,
    allocationChanged ? 'yes' : null,
  ].filter(Boolean).length;

  return { physical, style, lifestyle, total: physical + style + lifestyle };
}

export function getRefinementSummary(counts: RefinementCounts): string {
  return `${counts.total} of 13 set · optional`;
}

export function getPlanPillLabel(isPremium: boolean): 'Free' | 'Premium' {
  return isPremium ? 'Premium' : 'Free';
}

export function shouldShowBeginWardrobe(itemCount: number): boolean {
  return itemCount === 0;
}

export function getPersonalIntelligenceSubtitle(
  isActive: boolean,
  signalCount: number,
): string {
  const count = Math.max(0, Math.round(signalCount));
  return isActive
    ? `Active · ${count} signals`
    : `Learning · ${count} of 5 signals`;
}

export function getAiProcessingDisplay(
  preference: AiProcessingPreference,
  state: { loading: boolean; unavailable: boolean; guest: boolean },
): { value: boolean; caption: string | null } {
  return {
    value: isAiProcessingSwitchOn(preference, state),
    caption: !state.loading && !state.unavailable && !state.guest && preference === 'not_asked'
      ? "We'll ask before your first photo is processed."
      : null,
  };
}
