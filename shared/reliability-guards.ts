export type SignOutDisposition = 'remote_and_local' | 'local_only' | 'not_terminated';

export function isCurrentStartupGeneration(attempt: number, current: number): boolean {
  return attempt === current;
}

/**
 * Returns whether a user needs hydration for this startup generation.
 * A changed generation intentionally claims again even for the same user;
 * this is what prevents a timed-out attempt from suppressing its retry.
 */
export function shouldClaimStartupHydration(
  currentUserId: string | null,
  currentGeneration: number | null,
  userId: string,
  generation: number,
): boolean {
  return currentUserId !== userId || currentGeneration !== generation;
}

/** A deferred auth callback may commit only if both claims are still current. */
export function canCommitStartupHydration(
  claimedUserId: string,
  claimedGeneration: number,
  currentUserId: string | null,
  currentGeneration: number | null,
  activeGeneration: number,
): boolean {
  return claimedUserId === currentUserId &&
    claimedGeneration === currentGeneration &&
    isCurrentStartupGeneration(claimedGeneration, activeGeneration);
}

export function signOutDisposition(
  remoteError: unknown,
  localError: unknown,
): SignOutDisposition {
  if (!remoteError) return 'remote_and_local';
  if (!localError) return 'local_only';
  return 'not_terminated';
}