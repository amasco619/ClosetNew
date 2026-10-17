import { createSerialQueue } from './bulkClassifyCore';

/** Local pacing complements, never replaces, the server's authoritative 10/min limiter. */
export function classificationWaitMs(starts: number[], now: number) {
  const recent = starts.filter(time => time > now - 60_000);
  return recent.length >= 10 ? Math.max(0, recent[recent.length - 10] + 60_001 - now) : 0;
}

/** One explicitly requested attempt per card. No automatic retry loop. */
export async function runSerialUploadRetries(uris: string[], deps: {
  active(uri: string): boolean;
  run(uri: string): Promise<void>;
}) {
  const enqueue = createSerialQueue();
  await Promise.all(uris.map(uri => enqueue(async () => {
    if (deps.active(uri)) await deps.run(uri);
  })));
}
