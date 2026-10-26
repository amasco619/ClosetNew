export const CHECK_LOOK_GROUP_READ_TIMEOUT_MS = 8_000;

export function withCheckLookGroupTimeout<T>(
  request: Promise<T>,
  timeoutMs = CHECK_LOOK_GROUP_READ_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    request,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Confirmed set membership timed out')), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function loadCheckLookMembershipsOnOpen<T>(
  premium: boolean,
  ownerId: string | null,
  fetchGroups: (ownerId: string) => Promise<T>,
): Promise<T | undefined> {
  if (!premium || !ownerId) return Promise.resolve(undefined);
  return withCheckLookGroupTimeout(fetchGroups(ownerId));
}
