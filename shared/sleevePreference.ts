import type { Constraints } from '../constants/types';

export const MINIMUM_SLEEVE_LENGTHS = ['none', 'short', 'three-quarter', 'long'] as const;
export type MinimumSleeveLength = typeof MINIMUM_SLEEVE_LENGTHS[number];
export type SleeveConstraints = Partial<Constraints> & { minimumSleeveLength?: MinimumSleeveLength };

/** Read-time compatibility only: never add the fallback key to a saved profile. */
export function minimumSleeveLength(constraints: SleeveConstraints = {}): MinimumSleeveLength {
  return MINIMUM_SLEEVE_LENGTHS.includes(constraints.minimumSleeveLength as MinimumSleeveLength)
    ? constraints.minimumSleeveLength!
    : constraints.noSleeveless ? 'short' : 'none';
}

/** Called only by the explicit setting edit, not profile hydration or unrelated saves. */
export function withMinimumSleeveLength<T extends Partial<Constraints>>(
  constraints: T, value: MinimumSleeveLength,
): T & { minimumSleeveLength: MinimumSleeveLength; noSleeveless: boolean } {
  return { ...constraints, minimumSleeveLength: value, noSleeveless: value !== 'none' };
}
