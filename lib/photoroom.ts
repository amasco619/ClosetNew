import {
  BG_REMOVAL_AUTH_REQUIRED,
  BG_REMOVAL_LIMIT_REACHED,
  PHOTOROOM_TIMEOUT_ERROR,
} from "../shared/photoroom-error-codes";

export { resolveClassifyBase64 } from "./classifyPath";

export type BgRemovalStatus =
  | "success"
  | "not-authenticated"
  | "limit-reached"
  | "unavailable"
  | "failed";

export interface BgRemovalResult {
  status: BgRemovalStatus;
  base64?: string;
  remaining?: number;
}

/**
 * Mutable overrides for the test suite. Setting sessionToken bypasses the
 * supabase.auth.getSession() call (and the dynamic supabase import) so the
 * module can be exercised in Node.js without pulling in React Native.
 *
 * Note: lib/supabase.ts is imported dynamically (await import) inside the
 * else branch below — only resolved at runtime in production paths.
 * lib/query-client.ts is not imported here; getApiUrl logic is inlined.
 * Both strategies keep react-native out of the static dependency graph so
 * this module loads cleanly under tsx in Node.js test environments.
 */
export const _testOverrides: { sessionToken?: string } = {};

/** Inlined from lib/query-client.ts to avoid importing expo/fetch. */
function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (!host) throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  return new URL(`https://${host}`).href;
}

async function attemptRemoveBackground(
  imageBase64: string,
  token: string,
): Promise<{ imageBase64?: string; error?: string; remaining?: number } | null> {
  try {
    const url = new URL("/api/remove-background", getApiUrl());

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ imageBase64 }),
    });

    const data = (await res.json()) as {
      imageBase64?: string;
      error?: string;
      remaining?: number;
      limit?: number;
      count?: number;
    };
    return data;
  } catch {
    return null;
  }
}

/**
 * Calls the server-side /api/remove-background endpoint (Photoroom proxy).
 * Returns a typed BgRemovalResult:
 *   - success: base64 PNG with transparent background
 *   - not-authenticated: caller is a guest — no API call was made
 *   - limit-reached: free-tier quota exhausted
 *   - unavailable: Photoroom API key not configured
 *   - failed: network/server error
 *
 * Automatically retries once on a Photoroom timeout.
 * Never throws — all failures are communicated via the status field.
 */
export async function removeBackground(imageBase64: string): Promise<BgRemovalResult> {
  let token: string;

  if (_testOverrides.sessionToken) {
    // Test path: bypass the dynamic supabase import entirely.
    token = _testOverrides.sessionToken;
  } else {
    // Production path: dynamically import supabase so its react-native
    // dependency is not pulled into the module graph at load time.
    const { supabase } = await import("./supabase");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { status: "not-authenticated" };
    }
    token = session.access_token;
  }

  const data = await attemptRemoveBackground(imageBase64, token);
  if (!data) return { status: "failed" };

  if (data.error === PHOTOROOM_TIMEOUT_ERROR) {
    const retry = await attemptRemoveBackground(imageBase64, token);
    if (!retry?.imageBase64) return { status: "failed" };
    return { status: "success", base64: retry.imageBase64, remaining: retry.remaining };
  }

  if (data.error === BG_REMOVAL_AUTH_REQUIRED) {
    return { status: "not-authenticated" };
  }

  if (data.error === BG_REMOVAL_LIMIT_REACHED) {
    return { status: "limit-reached", remaining: 0 };
  }

  if (!data.imageBase64) return { status: "unavailable" };

  return { status: "success", base64: data.imageBase64, remaining: data.remaining };
}
