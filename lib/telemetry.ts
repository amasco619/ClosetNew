/**
 * Amodka — Structured Recommendation Telemetry
 *
 * Emits structured JSON events to stdout so they can be captured by any log
 * aggregator (Datadog, Logtail, Papertrail, etc.) without coupling to a
 * specific vendor during early production.
 *
 * PRIVACY RULES:
 *   - Never log secrets, access tokens, or session cookies.
 *   - Never log raw garment images or base64 payloads.
 *   - Never log full user profiles — only stable, non-PII dimensions
 *     (body_type, style_goal, wardrobe_size, occasion, weather_context).
 *   - User IDs are logged as opaque identifiers — never linked to names/emails
 *     in this log stream.
 *
 * All event types are defined below. Add new events here; never emit ad-hoc
 * JSON from call sites.
 */

import { RECOMMENDATION_ENGINE_VERSION } from '../constants/recommendationVersion';

// ─── Event catalogue ──────────────────────────────────────────────────────────

export interface TelemetryBase {
  event: string;
  timestamp: string;
  engine_version: string;
  user_id?: string;           // opaque identifier — no PII
}

export interface RecommendationRequestedEvent extends TelemetryBase {
  event: 'recommendation_requested';
  occasion: string;
  wardrobe_size: number;
  weather_context: string | null;
  body_type: string | null;
  style_goal: string | null;
  has_mood: boolean;
}

export interface RecommendationGeneratedEvent extends TelemetryBase {
  event: 'recommendation_generated';
  occasion: string;
  recommendation_id: string;
  candidate_pool_size: number;
  generation_path: 'strict' | 'relaxed' | 'empty';
  hard_gate_rejection_count?: number;
  generation_ms: number;
  ranking_ms: number;
  total_ms: number;
}

export interface RecommendationEmptyEvent extends TelemetryBase {
  event: 'recommendation_empty';
  occasion: string;
  wardrobe_size: number;
  weather_context: string | null;
  reason?: string;            // 'weather_gate' | 'wardrobe_gap' | 'no_candidates' | 'unknown'
}

export interface UserReactionEvent extends TelemetryBase {
  event: 'user_reaction';
  recommendation_id: string;
  occasion: string;
  reaction: string;           // 'love' | 'not_today' | 'worn' — no raw text
}

export type TelemetryEvent =
  | RecommendationRequestedEvent
  | RecommendationGeneratedEvent
  | RecommendationEmptyEvent
  | UserReactionEvent;

// ─── Emitter ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

/**
 * Emit a structured telemetry event to stdout.
 * Each line is a self-contained JSON object for log aggregators.
 *
 * In test environments (NODE_ENV=test) this is a no-op to avoid polluting
 * test output. Pass `force: true` in tests that explicitly assert on events.
 */
export function track(event: TelemetryEvent, opts?: { force?: boolean }): void {
  if (process.env.NODE_ENV === 'test' && !opts?.force) return;
  try {
    const payload = {
      ...event,
      engine_version: RECOMMENDATION_ENGINE_VERSION,
      timestamp: event.timestamp ?? now(),
    };
    // Use process.stdout directly so log collectors can filter by prefix.
    process.stdout.write('[TELEMETRY] ' + JSON.stringify(payload) + '\n');
  } catch {
    // Telemetry must never crash the application.
  }
}

// ─── Convenience builders ─────────────────────────────────────────────────────

export function trackRecommendationRequested(
  params: Omit<RecommendationRequestedEvent, 'event' | 'timestamp' | 'engine_version'>,
): void {
  track({ event: 'recommendation_requested', timestamp: now(), engine_version: RECOMMENDATION_ENGINE_VERSION, ...params });
}

export function trackRecommendationGenerated(
  params: Omit<RecommendationGeneratedEvent, 'event' | 'timestamp' | 'engine_version'>,
): void {
  track({ event: 'recommendation_generated', timestamp: now(), engine_version: RECOMMENDATION_ENGINE_VERSION, ...params });
}

export function trackRecommendationEmpty(
  params: Omit<RecommendationEmptyEvent, 'event' | 'timestamp' | 'engine_version'>,
): void {
  track({ event: 'recommendation_empty', timestamp: now(), engine_version: RECOMMENDATION_ENGINE_VERSION, ...params });
}

export function trackUserReaction(
  params: Omit<UserReactionEvent, 'event' | 'timestamp' | 'engine_version'>,
): void {
  track({ event: 'user_reaction', timestamp: now(), engine_version: RECOMMENDATION_ENGINE_VERSION, ...params });
}
