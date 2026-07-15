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
 */
export const _testOverrides: {
  skipAuth: boolean;
  testUserId: string;
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

  if (_testOverrides.skipAuth) {
    // Test-only path: skip all Supabase I/O
    userId = _testOverrides.testUserId || "test-user";
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
    // Fallback: query user_profiles when the claim is absent (e.g. tokens
    // issued before the premium flag was synced to app_metadata).
    const claimPremium = (user.app_metadata as Record<string, unknown> | undefined)?.premium;
    if (claimPremium === true || claimPremium === false) {
      isPremium = claimPremium === true;
    } else {
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
    }
  }

  // ── 5. Check image hash cache (avoids paying Photoroom for duplicate images) ──
  // checkCacheByHash handles its own DB errors internally and returns null on
  // failure, so no outer try/catch is needed here.
  const hash = computeImageHash(imageBase64);
  const cached = await checkCacheByHash(hash);
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
    if (!isPremium && !_testOverrides.skipAuth) {
      void incrementUserBgRemovalCount(userId);
    }

    return res.json({ imageBase64: resultBase64, mimeType: "image/png" });

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
