import type { Request, Response } from "express";
import {
  BACKGROUND_REMOVAL_FAILED,
  BACKGROUND_REMOVAL_UNAVAILABLE,
  BG_REMOVAL_AUTH_REQUIRED,
  BG_REMOVAL_LIMIT_REACHED,
  PHOTOROOM_EMPTY_RESPONSE,
  PHOTOROOM_ERROR,
  PHOTOROOM_INVALID_RESPONSE,
  PHOTOROOM_TIMEOUT_ERROR,
} from "../shared/photoroom-error-codes";
import {
  checkCacheByHash,
  computeImageHash,
  getUserBgRemovalStatus,
  incrementUserBgRemovalCount,
  storeCacheResult,
} from "./bgRemovalStore";
import { supabaseAdmin } from "./supabase";

const FREE_TIER_LIMIT = 20;
const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";
const PHOTOROOM_TIMEOUT_MS = 15_000;

/**
 * Maximum age of a JWT premium claim before the handler re-validates against
 * the database.  When a user cancels their subscription the JWT keeps reflecting
 * premium=true until the token is refreshed — bounding how long a downgraded
 * user can obtain unlimited removals during the stale-token window.
 *
 * Default: 24 hours.  Lowering this value forces more DB round-trips but
 * tightens the window; raising it reduces DB load at the cost of a longer gap.
 */
export const PREMIUM_CLAIM_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Decodes the JWT payload (without re-verifying the signature — the caller
 * has already validated the token via supabaseAdmin.auth.getUser) and returns
 * true when the token's `iat` (issued-at) claim is within maxAgeMs of now.
 *
 * A fresh token can be trusted for the isPremium=true fast-path.
 * A stale token triggers a DB check to catch subscription downgrades that
 * occurred after the token was minted.
 *
 * Returns false on any parse failure — the caller falls back to DB.
 */
export function isJwtClaimFresh(token: string, maxAgeMs: number): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payloadJson = Buffer.from(parts[1], "base64").toString("utf8");
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const iat = payload.iat;
    if (typeof iat !== "number") return false;
    const ageMs = Date.now() - iat * 1000;
    return ageMs >= 0 && ageMs <= maxAgeMs;
  } catch {
    return false;
  }
}

if (process.env.PHOTOROOM_API_KEY) {
  console.log("[remove-background] PHOTOROOM_API_KEY is set — background removal enabled");
} else {
  console.warn("[remove-background] PHOTOROOM_API_KEY not set — /api/remove-background will return 503");
}

/**
 * Mutable overrides used exclusively by the test suite.
 * Mutating properties on this exported object bypasses the ES-module
 * getter restriction — only property reassignment (supa.supabaseAdmin = …)
 * is blocked, not property mutation (_testOverrides.skipAuth = true).
 *
 * bypassCache      — when false, the cache check runs even in skipAuth mode
 *                    (default: true, matching historical behaviour)
 * mockCheckCache   — injected cache lookup; used when bypassCache is false
 * mockQuota        — injected quota status applied in skipAuth mode so tests
 *                    can exercise the `remaining` field without real DB calls
 * mockPremium      — when true, isPremium is set to true in skipAuth mode so
 *                    tests can verify the premium branch bypasses the quota guard
 * mockClaimFresh   — when false AND mockPremium is true, simulates a stale JWT
 *                    premium claim so tests can verify the quota guard re-applies
 *                    to a downgraded user whose token has not yet expired
 * mockIncrementCount — when set in skipAuth mode, called instead of the real
 *                    incrementUserBgRemovalCount so tests can assert that the
 *                    count is always recorded regardless of premium status
 */
export const _testOverrides: {
  skipAuth: boolean;
  testUserId: string;
  bypassCache?: boolean;
  mockCheckCache?: (hash: string) => Promise<string | null>;
  mockQuota?: { allowed: boolean; count: number; remaining: number };
  mockPremium?: boolean;
  mockClaimFresh?: boolean;
  mockIncrementCount?: () => Promise<void>;
} = { skipAuth: false, testUserId: "" };

export async function removeBackground(req: Request, res: Response) {
  // ── 1. Require Photoroom API key (fail-fast before any I/O) ──────────────
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: BACKGROUND_REMOVAL_UNAVAILABLE });
  }

  // ── 2. Validate payload (fail-fast before any I/O) ────────────────────────
  const { imageBase64 } = req.body as { imageBase64?: string };
  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 is required" });
  }

  // ── 3. Resolve authenticated user ────────────────────────────────────────
  let userId: string;
  let isPremium = false;
  let remainingAfterUse: number | undefined = undefined;

  if (_testOverrides.skipAuth && process.env.NODE_ENV === 'test') {
    // NM-1: auth bypass is only honoured when NODE_ENV === 'test' so that a
    // leaked or mutated _testOverrides object in production has no effect.
    userId = _testOverrides.testUserId || "test-user";
    // Allow tests to inject a premium flag so the quota-bypass branch can be
    // exercised without real auth/DB calls.
    // When mockClaimFresh === false, the premium claim is treated as stale:
    // isPremium stays false and the quota gate applies as if the user is
    // free-tier — this models a downgraded user whose old token still carries
    // premium=true but the subscription has already lapsed.
    if (_testOverrides.mockPremium === true && _testOverrides.mockClaimFresh !== false) {
      isPremium = true;
    }
    // Allow tests to inject a quota status so the `remaining` field can be
    // verified without a real DB connection.
    if (!isPremium && _testOverrides.mockQuota) {
      const { allowed, count, remaining } = _testOverrides.mockQuota;
      if (!allowed) {
        return res.status(403).json({
          error: BG_REMOVAL_LIMIT_REACHED,
          limit: FREE_TIER_LIMIT,
          count,
          remaining: 0,
        });
      }
      remainingAfterUse = Math.max(0, remaining - 1);
    }
  } else {
    const authHeader = req.headers?.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: BG_REMOVAL_AUTH_REQUIRED });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: BG_REMOVAL_AUTH_REQUIRED });
    }
    userId = user.id;

    // ── 4. Determine premium tier ────────────────────────────────────────────
    // Primary: read from JWT app_metadata claims (no extra round-trip).
    // For isPremium=false claims: safe to trust regardless of age — a false
    // claim can only restrict access, never grant it.
    // For isPremium=true claims: only trust when the JWT is fresh (< 24 h old).
    // If the token is stale the user may have cancelled their subscription since
    // it was minted — fall back to a DB check to verify the current status.
    // Fallback: query user_profiles when the claim is absent (e.g. tokens
    // issued before the premium flag was synced to app_metadata) or stale.
    const claimPremium = (user.app_metadata as Record<string, unknown> | undefined)?.premium;

    if (claimPremium === false) {
      // A false claim can only restrict access — safe to trust without age check.
      isPremium = false;
    } else if (claimPremium === true) {
      // A true claim grants quota bypass — only trust when the JWT is fresh.
      const claimFresh = isJwtClaimFresh(token, PREMIUM_CLAIM_MAX_AGE_MS);
      if (claimFresh) {
        isPremium = true;
      } else {
        // Stale premium claim: the user may have downgraded since this token
        // was issued.  Verify the current subscription status in the DB.
        // Treat as free-tier on any DB error (conservative but safe).
        try {
          const { data: profile } = await supabaseAdmin
            .from("user_profiles")
            .select("premium")
            .eq("id", userId)
            .single();
          isPremium = profile?.premium === true;
        } catch {
          // Conservative: treat as free on DB error
        }
      }
    } else {
      // Claim absent (e.g. token issued before premium flag was synced):
      // fall back to DB to determine premium status.
      try {
        const { data: profile } = await supabaseAdmin
          .from("user_profiles")
          .select("premium")
          .eq("id", userId)
          .single();
        isPremium = profile?.premium === true;
      } catch {
        // Treat as free on DB error — conservative but keeps the endpoint functional
      }
    }

    if (!isPremium) {
      const { allowed, count, remaining } = await getUserBgRemovalStatus(userId, FREE_TIER_LIMIT);
      if (!allowed) {
        return res.status(403).json({
          error: BG_REMOVAL_LIMIT_REACHED,
          limit: FREE_TIER_LIMIT,
          count,
          remaining: 0,
        });
      }
      remainingAfterUse = Math.max(0, remaining - 1);
    }
  }

  // ── 5. Check image hash cache (avoids paying Photoroom for duplicate images) ──
  // checkCacheByHash handles its own DB errors internally and returns null on
  // failure, so no outer try/catch is needed here.
  // Cache is bypassed by default in test mode (skipAuth && NODE_ENV=test) so that mock fetch
  // calls are not short-circuited by stale DB entries from previous test runs.
  // Set _testOverrides.bypassCache = false (with an optional mockCheckCache) to test the
  // cache hit path explicitly.
  const isTestMode = _testOverrides.skipAuth && process.env.NODE_ENV === 'test';
  const bypassCache = isTestMode && (_testOverrides.bypassCache !== false);
  const hash = bypassCache ? null : computeImageHash(imageBase64);
  const cacheCheck = (isTestMode && _testOverrides.mockCheckCache) ? _testOverrides.mockCheckCache : checkCacheByHash;
  const cached = hash ? await cacheCheck(hash) : null;
  if (cached) {
    // Cache hits do NOT count against the user's quota
    return res.json({ imageBase64: cached, mimeType: "image/png", fromCache: true });
  }

  // ── 6. Call Photoroom ─────────────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PHOTOROOM_TIMEOUT_MS);

  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const form = new FormData();
    const blob = new Blob([buffer], { type: "image/jpeg" });
    form.append("image_file", blob, "garment.jpg");

    const fetchResponse = await fetch(PHOTOROOM_SEGMENT_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
      signal: controller.signal,
    });

    if (!fetchResponse.ok) {
      clearTimeout(timeoutId);
      const errText = await fetchResponse.text().catch(() => fetchResponse.statusText);
      console.error("[remove-background] Photoroom error:", fetchResponse.status, errText);
      return res.status(502).json({ error: PHOTOROOM_ERROR, status: fetchResponse.status });
    }

    const arrayBuffer = await fetchResponse.arrayBuffer();
    clearTimeout(timeoutId);

    if (arrayBuffer.byteLength === 0) {
      console.error("[remove-background] Photoroom returned empty body");
      return res.status(502).json({ error: PHOTOROOM_EMPTY_RESPONSE });
    }

    const resultBuf = Buffer.from(arrayBuffer);
    const isPng =
      resultBuf.length >= 4 &&
      resultBuf[0] === 0x89 &&
      resultBuf[1] === 0x50 &&
      resultBuf[2] === 0x4e &&
      resultBuf[3] === 0x47;

    if (!isPng || arrayBuffer.byteLength < 1024) {
      console.error("[remove-background] Photoroom response not valid PNG (byteLength=%d)", arrayBuffer.byteLength);
      return res.status(502).json({ error: PHOTOROOM_INVALID_RESPONSE });
    }

    const resultBase64 = resultBuf.toString("base64");

    // ── 7. Cache result + increment usage (fire-and-forget, non-blocking) ──
    if (hash) void storeCacheResult(hash, resultBase64);
    // Always record usage regardless of premium status.
    // The FREE_TIER_LIMIT quota gate (step 4) is applied only at check-time,
    // so premium users are never blocked. But tracking the count unconditionally
    // means a lapsed-premium user's count is already accurate the moment their
    // token refreshes to free-tier — preventing a silent quota reset that would
    // grant them another full 20 free removals.
    //
    // Re-subscribe policy: when a user re-subscribes to premium after lapsing,
    // call resetUserBgRemovalCount(userId) (bgRemovalStore.ts) to reset their
    // count to 0. This grants a fresh FREE_TIER_LIMIT slate if they lapse again.
    // See the JSDoc on resetUserBgRemovalCount for the full rationale.
    if (!(_testOverrides.skipAuth && process.env.NODE_ENV === 'test')) {
      void incrementUserBgRemovalCount(userId);
    } else if (_testOverrides.mockIncrementCount) {
      void _testOverrides.mockIncrementCount();
    }

    const responseBody: Record<string, unknown> = { imageBase64: resultBase64, mimeType: "image/png" };
    if (remainingAfterUse !== undefined) responseBody.remaining = remainingAfterUse;
    return res.json(responseBody);

  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      console.error("[remove-background] Photoroom timed out after %dms", PHOTOROOM_TIMEOUT_MS);
      return res.status(502).json({ error: PHOTOROOM_TIMEOUT_ERROR });
    }
    console.error("[remove-background] Unexpected error:", err?.message);
    return res.status(502).json({ error: BACKGROUND_REMOVAL_FAILED });
  }
}
