import { supabaseAdmin } from "./supabase";

export interface Entitlement {
  isPremium: boolean;
  expiresAt: string | null;
}

export interface VerifiedEntitlement {
  isPremium: boolean;
  expiresAt: string | null;
}

export const _testOverrides: { client?: any } = {};

export function resolveEntitlement(
  profile: { premium?: boolean | null; premium_expires_at?: string | null } | null,
  nowMs = Date.now(),
): Entitlement {
  const expiresAt = profile?.premium_expires_at ?? null;
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return {
    isPremium: profile?.premium === true && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs,
    expiresAt,
  };
}

export async function getUserEntitlement(
  userId: string,
  client: any = supabaseAdmin,
): Promise<Entitlement> {
  const activeClient = process.env.NODE_ENV === "test" && _testOverrides.client
    ? _testOverrides.client
    : client;
  const { data, error } = await activeClient
    .from("user_profiles")
    .select("premium,premium_expires_at")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);
  return resolveEntitlement(data as { premium?: boolean | null; premium_expires_at?: string | null } | null);
}

/**
 * Server-only mutation boundary for a future verified payment webhook.
 * This function is intentionally not registered as an HTTP route.
 */
export async function applyVerifiedEntitlement(
  userId: string,
  entitlement: VerifiedEntitlement,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("user_profiles")
    .update({
      premium: entitlement.isPremium,
      premium_expires_at: entitlement.expiresAt,
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}