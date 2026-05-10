/**
 * Personal Calibration — Affinity engine.
 *
 * Aggregates per-item ("affinity") and per-pair ("pairAffinity") preference
 * signals from the user's outfit reactions and wear history, and exposes
 * clamped multipliers the scoring engine can apply to nudge future rankings
 * toward liked pieces and away from disliked ones — without ever fully
 * banning anything.
 *
 * Signal weights (per event, before recency decay):
 *   • Wore it       +1.4   (strongest — actually committed in real life)
 *   • Loved         +1.0   (explicit positive tap)
 *   • Not today     -1.0   (explicit negative tap)
 *
 * Recency decay: signals fade with a 60-day half-life so taste shifts over
 * time. Cold-start safety: when the total signal count is below
 * `MIN_SIGNALS_TO_APPLY`, every multiplier is exactly 1.0 — i.e. the engine
 * behaves identically to before any reactions existed. Once enough signals
 * accumulate, multipliers slide into [0.7, 1.3] so a single piece can never
 * dominate or be banished outright.
 */

import { OutfitReaction, WearEntry } from './types';

export const MIN_SIGNALS_TO_APPLY = 5;
const ITEM_MULT_RANGE: [number, number] = [0.7, 1.3];
const PAIR_MULT_RANGE: [number, number] = [0.8, 1.2];
const ITEM_SIGNAL_GAIN = 0.08;
const PAIR_SIGNAL_GAIN = 0.06;
const HALF_LIFE_DAYS = 60;

export interface AffinityState {
  /** raw signed signal sum per wardrobe item id */
  itemSignals: Record<string, number>;
  /** raw signed signal sum per item-pair key (sorted ids joined by '|') */
  pairSignals: Record<string, number>;
  /** total weighted-by-recency events used (for cold-start gating) */
  signalCount: number;
}

export const EMPTY_AFFINITY: AffinityState = {
  itemSignals: {},
  pairSignals: {},
  signalCount: 0,
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function ageDays(today: string, date: string): number {
  const t = new Date(today + 'T12:00:00').getTime();
  const d = new Date(date + 'T12:00:00').getTime();
  return Math.max(0, Math.round((t - d) / (1000 * 60 * 60 * 24)));
}

/** Exponential half-life decay (1.0 today, 0.5 at HALF_LIFE_DAYS). */
function recency(days: number): number {
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

function applySignal(
  state: AffinityState,
  itemIds: string[],
  weight: number,
): void {
  for (const id of itemIds) {
    state.itemSignals[id] = (state.itemSignals[id] ?? 0) + weight;
  }
  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      const k = pairKey(itemIds[i], itemIds[j]);
      state.pairSignals[k] = (state.pairSignals[k] ?? 0) + weight;
    }
  }
}

/**
 * Build the affinity state from raw reactions and wear history.
 * Pure function — no side effects, safe to memoise.
 */
export function computeAffinity(
  reactions: OutfitReaction[],
  wearHistory: WearEntry[],
  today: string,
): AffinityState {
  const state: AffinityState = {
    itemSignals: {},
    pairSignals: {},
    signalCount: 0,
  };

  for (const r of reactions) {
    const ids = r.outfitFingerprint ? r.outfitFingerprint.split('|').filter(Boolean) : [];
    if (ids.length === 0) continue;
    const decay = recency(ageDays(today, r.date));
    const base = r.type === 'love' ? 1.0 : -1.0;
    applySignal(state, ids, base * decay);
    state.signalCount += decay;
  }

  for (const w of wearHistory) {
    if (!w.itemIds || w.itemIds.length === 0) continue;
    const decay = recency(ageDays(today, w.date));
    applySignal(state, w.itemIds, 1.4 * decay);
    state.signalCount += decay;
  }

  return state;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Per-item multiplier. Cold-start safe: returns 1.0 when fewer than
 * `MIN_SIGNALS_TO_APPLY` signals have been recorded.
 */
export function itemAffinityMultiplier(
  state: AffinityState,
  itemId: string,
): number {
  if (state.signalCount < MIN_SIGNALS_TO_APPLY) return 1.0;
  const raw = state.itemSignals[itemId] ?? 0;
  return clamp(1 + ITEM_SIGNAL_GAIN * raw, ITEM_MULT_RANGE[0], ITEM_MULT_RANGE[1]);
}

/**
 * Per-pair multiplier for the unordered pair (a, b). Cold-start safe.
 */
export function pairAffinityMultiplier(
  state: AffinityState,
  a: string,
  b: string,
): number {
  if (state.signalCount < MIN_SIGNALS_TO_APPLY) return 1.0;
  const raw = state.pairSignals[pairKey(a, b)] ?? 0;
  return clamp(1 + PAIR_SIGNAL_GAIN * raw, PAIR_MULT_RANGE[0], PAIR_MULT_RANGE[1]);
}

/**
 * Average pair multiplier across every unordered pair within a list of items.
 * Useful for nudging a combo's overall score by the chemistry the user has
 * shown for these items together.
 */
export function comboPairAffinityMultiplier(
  state: AffinityState,
  itemIds: string[],
): number {
  if (state.signalCount < MIN_SIGNALS_TO_APPLY) return 1.0;
  if (itemIds.length < 2) return 1.0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      sum += pairAffinityMultiplier(state, itemIds[i], itemIds[j]);
      n += 1;
    }
  }
  return n === 0 ? 1.0 : sum / n;
}

/**
 * Top liked / disliked items (by raw signal sum, after recency decay).
 * Drops items with negligible signal so the debug view only surfaces the
 * pieces the engine is actually weighting.
 */
export function topAffinityItems(
  state: AffinityState,
  limit = 5,
): { liked: { id: string; score: number }[]; disliked: { id: string; score: number }[] } {
  const entries = Object.entries(state.itemSignals)
    .map(([id, score]) => ({ id, score }))
    .filter(e => Math.abs(e.score) >= 0.5);
  const liked = entries.filter(e => e.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  const disliked = entries.filter(e => e.score < 0).sort((a, b) => a.score - b.score).slice(0, limit);
  return { liked, disliked };
}

/**
 * Top liked / disliked pairs.
 */
export function topAffinityPairs(
  state: AffinityState,
  limit = 5,
): { liked: { ids: [string, string]; score: number }[]; disliked: { ids: [string, string]; score: number }[] } {
  const entries = Object.entries(state.pairSignals)
    .map(([k, score]) => {
      const [a, b] = k.split('|');
      return { ids: [a, b] as [string, string], score };
    })
    .filter(e => Math.abs(e.score) >= 0.5);
  const liked = entries.filter(e => e.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  const disliked = entries.filter(e => e.score < 0).sort((a, b) => a.score - b.score).slice(0, limit);
  return { liked, disliked };
}
