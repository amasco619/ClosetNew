export function resolveCheckLookFreeVerdictsPerDay(value: string | undefined): number {
  if (!value?.trim()) return 5;
  const configuredAllowance = Number(value);
  return Number.isInteger(configuredAllowance) && configuredAllowance >= 0
    ? configuredAllowance
    : 5;
}

export const CHECK_LOOK_FREE_VERDICTS_PER_DAY =
  resolveCheckLookFreeVerdictsPerDay(process.env.EXPO_PUBLIC_CHECK_LOOK_FREE_VERDICTS_PER_DAY);
