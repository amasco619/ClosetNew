import { createHash } from "node:crypto";

// Fixed across releases: increasing the percentage only adds accounts.
const SALT = "amodka-check-look-closed-test-v1";
export function judgeBucket(userId: string): number {
  return createHash("sha256").update(userId + SALT).digest().readUInt32BE(0) % 100;
}
export function judgeRolloutEnabled(userId: string, global: boolean, percent: string | undefined): boolean {
  if (global) return true;
  if (!percent || !/^(?:100|[0-9]{1,2})$/.test(percent)) return false;
  return judgeBucket(userId) < Number(percent);
}
