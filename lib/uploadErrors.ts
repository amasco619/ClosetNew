export const UPLOAD_DIAGNOSTICS_ENABLED =
  typeof __DEV__ !== 'undefined' && __DEV__ &&
  process.env.EXPO_PUBLIC_UPLOAD_DIAGNOSTICS === '1';

const stages = ['resize', 'background-removal', 'cutout-write', 'classify', 'upload', 'save'] as const;
const codes = ['FAILED', 'CACHE_UNAVAILABLE', 'TRANSIENT', 'REFUSED'] as const;

/** Never accepts an exception, URI, message or user identifier. */
export function reportUploadError(input: { stage: typeof stages[number]; code: typeof codes[number] }) {
  if (typeof __DEV__ === 'undefined' || !__DEV__ || !UPLOAD_DIAGNOSTICS_ENABLED) return;
  console.log('[upload]', {
    stage: stages.includes(input.stage) ? input.stage : 'unknown',
    code: codes.includes(input.code) ? input.code : 'UNKNOWN',
  });
}
