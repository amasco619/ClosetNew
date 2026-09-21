export type SignOutDisposition = 'remote_and_local' | 'local_only' | 'not_terminated';

export function isCurrentStartupGeneration(attempt: number, current: number): boolean {
  return attempt === current;
}

export function signOutDisposition(
  remoteError: unknown,
  localError: unknown,
): SignOutDisposition {
  if (!remoteError) return 'remote_and_local';
  if (!localError) return 'local_only';
  return 'not_terminated';
}