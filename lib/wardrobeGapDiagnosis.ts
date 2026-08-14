/**
 * Wardrobe gap diagnosis — Phase 5A.1
 *
 * Pure functions that interpret the recommendation engine's output to determine
 * whether an empty recommendation result is likely caused by a weather-capability
 * gap in the wardrobe.
 *
 * ARCHITECTURE NOTE
 * -----------------
 * The logical flow is:
 *
 *   Existing recommendation engine
 *         ↓
 *   Can a valid outfit be constructed?
 *      /             \
 *    YES              NO
 *     ↓                ↓
 *   Normal outfit    diagnoseWeatherGap()
 *                         ↓
 *                   WardrobeGapCard (if evidence is sufficient)
 *                         or
 *                   generic AmodkaErrorState (if cause is unclear)
 *
 * These functions do NOT call, modify, or re-implement the recommendation engine.
 * The engine (v3.7) remains frozen and unchanged.
 */

import type { Fabric, WardrobeItem, WarmthBand, WeatherSnapshot } from '@/constants/types';

// ── Capability constants ──────────────────────────────────────────────────────

/** Fabrics that provide meaningful thermal protection regardless of category label. */
const WARM_FABRICS: Fabric[] = ['wool', 'cashmere', 'leather', 'tweed', 'corduroy'];

/** WarmthBand values that indicate adequate protection for cold weather (< 10°C). */
const WARM_BANDS: WarmthBand[] = ['warm', 'hot'];

/**
 * SubTypes that intrinsically provide rain protection regardless of how the item
 * is categorised. A windbreaker tagged as 'top' is still rain-resistant.
 */
const RAIN_SUBTYPES = [
  'trench', 'raincoat', 'waterproof-jacket', 'windbreaker', 'mac',
  'anorak', 'cagoule',
];

// ── Capability checks ─────────────────────────────────────────────────────────

/**
 * Returns true when the wardrobe contains at least one item that provides
 * meaningful thermal protection for cold weather, regardless of its category label.
 *
 * Checks item metadata (warmthBand, weight, fabric) rather than category so that
 * a heavy cashmere cardigan categorised as 'top' still counts.
 */
export function hasWarmLayer(items: WardrobeItem[]): boolean {
  return items.some(
    i =>
      (i.warmthBand !== undefined && WARM_BANDS.includes(i.warmthBand)) ||
      i.weight === 'heavy' ||
      (i.fabric !== undefined && WARM_FABRICS.includes(i.fabric)),
  );
}

/**
 * Returns true when the wardrobe contains at least one item that provides
 * meaningful rain protection, regardless of its category label.
 *
 * Checks subType and fabric rather than category so that a windbreaker
 * categorised as 'top' still counts.
 */
export function hasRainLayer(items: WardrobeItem[]): boolean {
  return items.some(
    i =>
      RAIN_SUBTYPES.includes(i.subType) ||
      (i.fabric === 'leather' && i.weight === 'heavy'),
  );
}

// ── Diagnosis ─────────────────────────────────────────────────────────────────

/**
 * Diagnoses whether an empty recommendation result is likely caused by a
 * weather-capability gap in the wardrobe.
 *
 * @param engineFound    true if the engine returned ≥1 valid outfit
 * @param weather        current weather snapshot (null/undefined if unavailable)
 * @param items          active wardrobe items
 * @param weatherEnabled false if the user has opted out of weather-aware outfits
 *
 * @returns the most defensible gap condition, or null when there is insufficient
 *          evidence to make a confident diagnosis.
 *
 * IMPORTANT: call this AFTER the engine has run and returned zero results.
 * Do NOT call when engineFound is true — the result is always null in that case.
 */
export function diagnoseWeatherGap(
  engineFound: boolean,
  weather: WeatherSnapshot | null | undefined,
  items: WardrobeItem[],
  weatherEnabled: boolean,
): 'cold-rain' | 'cold' | 'rain' | null {
  // Gate 1: Only diagnose when the engine found no outfit.
  if (engineFound) return null;

  // Gate 2: Only when weather is enabled and available.
  if (!weatherEnabled || !weather) return null;

  // Gate 3: An empty wardrobe is an onboarding state, not a gap.
  if (items.length === 0) return null;

  const isCold = weather.currentTempC < 10;
  const isRaining = weather.precipProbability >= 0.6;

  // Not a weather-related failure — do not fabricate a diagnosis.
  if (!isCold && !isRaining) return null;

  const warm = hasWarmLayer(items);
  const rain = hasRainLayer(items);

  // Only surface a gap when there is clear evidence the capability is missing.
  if (isCold && isRaining && !warm) return 'cold-rain';
  if (isCold && !isRaining && !warm) return 'cold';
  if (!isCold && isRaining && !rain) return 'rain';

  // Insufficient evidence — fall back to generic error state in the UI.
  return null;
}
