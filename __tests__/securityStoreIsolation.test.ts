import assert from "node:assert/strict";
import {
  SupabaseRateLimitStore,
  __resetForTesting,
  __storeOverrides,
  recordFailedAttempt,
  clearLockout,
  initLockoutStore,
  initRateLimitStore,
} from "../server/middleware/rateLimiter";
import {
  createSupabaseLockoutPersistence,
  pruneRateLimitRows,
  pruneLockoutRows,
} from "../server/middleware/supabaseSecurityStore";
import { makeSecurityStoreFixture } from "./helpers/securityStoreFixture";

async function main() {
  assert.equal(process.env.NODE_ENV, "test");
  __resetForTesting();
  const blocked = /Live security-store access blocked/;
  const store = new SupabaseRateLimitStore("missed-fixture");
  // These errors must escape the production fallback/logging catches.
  for (const call of [
    () => store.increment("client"),
    () => store.decrement("client"),
    () => store.resetKey("client"),
    () => store.resetAll(),
    () => store.loadFromSupabase(),
    pruneRateLimitRows,
    pruneLockoutRows,
    initRateLimitStore,
    initLockoutStore,
    () => createSupabaseLockoutPersistence().set("test@example.com",
      { attempts: 1, windowStart: Date.now(), lockedUntil: null }, 60_000),
    () => createSupabaseLockoutPersistence().delete("test@example.com"),
    () => createSupabaseLockoutPersistence().loadAll(),
  ]) await assert.rejects(call, blocked);
  assert.throws(() => recordFailedAttempt("test@example.com"), blocked);
  assert.throws(() => clearLockout("test@example.com"), blocked);

  // Explicit in-memory and fake clients work even when application credentials exist.
  const memory = new SupabaseRateLimitStore("memory", null);
  assert.equal((await memory.increment("client")).totalHits, 1);
  assert.equal((await memory.increment("client")).totalHits, 2);
  for (let run = 0; run < 3; run++) {
    __storeOverrides.client = makeSecurityStoreFixture().client;
    assert.equal((await store.increment("fixed-user")).totalHits, 1,
      "a fresh fixture resets fixed identities without depending on live windows");
    recordFailedAttempt("fixture@example.com");
    clearLockout("fixture@example.com");
  }
  __resetForTesting();
  console.log("All limiter/lockout live-store paths fail closed in test mode; isolated fixed identities reset cleanly");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
