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
import { getUserEntitlement, resolveEntitlement } from "./entitlements";

const FREE_TIER_LIMIT = 20;
const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";
const PHOTOROOM_TIMEOUT_MS = 15_000;

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
 * mockPremium      — when true, a future expiry is injected in skipAuth mode so
 *                    tests can verify the premium branch bypasses the quota guard
 * mockPremiumExpiresAt — overrides the test entitlement expiry to exercise
 *                    active and expired premium states without database I/O
 * mockIncrementCount — when set in skipAuth mode, called instead of the real
 *                    incrementUserBgRemovalCount so tests can assert that the
 *                    count is always recorded regardless of premium status
 * mockSupabaseAdmin — when set and NODE_ENV==='test', this object replaces
 *                    supabaseAdmin for the DB fallback premium check so tests
 *                    can exercise the "absent/stale JWT claim → DB SELECT"
 *                    path without a real Supabase connection.  Must satisfy:
 *                      { auth: { getUser(token): Promise<{data:{user},error}> }
 *                        from(table): { select(cols): { eq(col,val): { single(): Promise<{data}> } } } }
 */
export const _testOverrides: {
  skipAuth: boolean;
  testUserId: string;
  bypassCache?: boolean;
  mockCheckCache?: (hash: string) => Promise<string | null>;
  mockQuota?: { allowed: boolean; count: number; remaining: number };
  mockPremium?: boolean;
  mockPremiumExpiresAt?: string | null;
  mockIncrementCount?: () => Promise<void>;
  /** Injected supabaseAdmin for DB-fallback premium-check tests (NODE_ENV=test only). */
  mockSupabaseAdmin?: any;
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
    isPremium = resolveEntitlement({
      premium: _testOverrides.mockPremium === true,
      premium_expires_at: _testOverrides.mockPremiumExpiresAt
        ?? new Date(Date.now() + 60_000).toISOString(),
    }).isPremium;
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

    // NM-1 (test mode): allow tests to inject a mock supabaseAdmin so the
    // DB fallback premium-check path can be exercised without a real connection.
    const supa = (process.env.NODE_ENV === 'test' && _testOverrides.mockSupabaseAdmin)
      ? _testOverrides.mockSupabaseAdmin
      : supabaseAdmin;

    const { data: { user }, error: authError } = await supa.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: BG_REMOVAL_AUTH_REQUIRED });
    }
    userId = user.id;

    // ── 4. Determine premium tier ────────────────────────────────────────────
    // Premium quota bypass is always resolved from the server-side profile so
    // expired or client-manipulated state can never grant access.
    try {
      isPremium = (await getUserEntitlement(userId, supa)).isPremium;
    } catch {
      // Conservative: a lookup failure never grants premium access.
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
  // mockCheckCache is honoured whenever NODE_ENV==='test' and it is set, regardless
  // of skipAuth — this lets tests that exercise the real auth path (mockSupabaseAdmin)
  // still bypass the DB cache without having to set skipAuth=true.
  const cacheCheck = (process.env.NODE_ENV === 'test' && _testOverrides.mockCheckCache)
    ? _testOverrides.mockCheckCache
    : checkCacheByHash;
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
    if (process.env.NODE_ENV === 'test' && _testOverrides.mockIncrementCount) {
      // Test mode with an injected counter — use it regardless of skipAuth so
      // tests exercising the real auth path (mockSupabaseAdmin) can also avoid
      // real DB calls for the fire-and-forget increment.
      void _testOverrides.mockIncrementCount();
    } else if (!(_testOverrides.skipAuth && process.env.NODE_ENV === 'test')) {
      void incrementUserBgRemovalCount(userId);
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
