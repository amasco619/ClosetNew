import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabase";

export type AiProcessingState = "not_asked" | "allowed" | "declined";
export const AI_PROCESSING_KEY = "amodka_ai_image_processing";

export function parseAiProcessingState(value: unknown): AiProcessingState {
  return value === "allowed" || value === "declined" ? value : "not_asked";
}

// Test-only I/O overrides keep route checks isolated from live Supabase.
export const _testOverrides: {
  load?: (userId: string) => Promise<Record<string, unknown>>;
  save?: (userId: string, metadata: Record<string, unknown>) => Promise<void>;
} = {};

async function loadMetadata(userId: string): Promise<Record<string, unknown>> {
  if (process.env.NODE_ENV === "test" && _testOverrides.load) {
    return _testOverrides.load(userId);
  }
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error("AI preference unavailable");
  return data.user.app_metadata ?? {};
}

export async function getAiProcessingState(userId: string): Promise<AiProcessingState> {
  const metadata = await loadMetadata(userId);
  return parseAiProcessingState(metadata[AI_PROCESSING_KEY]);
}

export async function setAiProcessingState(
  userId: string,
  state: "allowed" | "declined",
): Promise<void> {
  const metadata = { ...await loadMetadata(userId), [AI_PROCESSING_KEY]: state };
  if (process.env.NODE_ENV === "test" && _testOverrides.save) {
    await _testOverrides.save(userId, metadata);
    return;
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: metadata,
  });
  if (error) throw new Error("AI preference could not be saved");
}

export async function requireAiProcessingConsent(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const isClassificationRoute = req.path === "/api/classify-garment" || req.path === "/api/classify-garments";
  const authCode = isClassificationRoute ? { code: "AUTH_REQUIRED" } : {};
  const consentCode = isClassificationRoute ? { code: "CONSENT_REQUIRED" } : {};
  const userId = (req as Request & { authenticatedUser?: { id: string } })
    .authenticatedUser?.id;
  if (!userId) {
    res.status(401).json({ error: "authentication_required", ...authCode });
    return;
  }
  try {
    if (await getAiProcessingState(userId) !== "allowed") {
      res.status(403).json({ error: "ai_processing_consent_required", ...consentCode });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "ai_processing_preference_unavailable" });
  }
}