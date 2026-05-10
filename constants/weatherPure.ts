/**
 * Pure helpers for weather-aware outfit logic.
 *
 * No IO, no native dependencies — safe to import in any environment including
 * Node.js unit tests. Consumed by constants/weather.ts (which adds the
 * network / storage layer) and by __tests__/weather.test.ts.
 */

import type { WardrobeItem, WarmthBand, WeatherSnapshot } from '@/constants/types';

export type OuterwearRule = 'required' | 'optional' | 'suppressed';

/**
 * Whether the day's forecast demands, suppresses, or leaves outerwear optional.
 * Required when the daily low is genuinely cold; suppressed only when both the
 * low and the high are warm enough that any coat would feel out of place.
 */
export function outerwearRule(weather: WeatherSnapshot | null | undefined): OuterwearRule {
  if (!weather) return 'optional';
  if (weather.lowC < 12) return 'required';
  if (weather.lowC > 18 && weather.highC > 24) return 'suppressed';
  return 'optional';
}

export function isRainy(weather: WeatherSnapshot | null | undefined): boolean {
  return !!weather && weather.precipProbability >= 0.6;
}

export const RAIN_FRIENDLY_SUBTYPES = new Set(['trench', 'raincoat', 'jacket', 'bomber-jacket', 'parka', 'mac']);
export const RAIN_AVERSE_FABRICS = new Set(['wool', 'cashmere', 'suede']);

/**
 * Whether an outerwear item is reasonable for a wet day. Rain-tough subtypes
 * (trench / raincoat / parka / mac) read as "yes, of course"; pieces in
 * rain-averse fabrics (wool / cashmere / suede) read as "no, not today".
 * Everything else is neutral.
 */
export function isRainFriendly(item: Pick<WardrobeItem, 'subType' | 'fabric'>): boolean {
  if (RAIN_FRIENDLY_SUBTYPES.has(item.subType)) return true;
  if (item.fabric && RAIN_AVERSE_FABRICS.has(item.fabric)) return false;
  return true;
}

export const SUBTYPE_WARMTH: Record<string, WarmthBand> = {
  puffer: 'cold', peacoat: 'cold', coat: 'cold',
  'leather-jacket': 'cool', trench: 'cool',
  blazer: 'mild', jacket: 'mild', 'denim-jacket': 'mild',
  'bomber-jacket': 'mild', raincoat: 'mild', cardigan: 'mild',
};

export const WARMTH_ORDER: Record<WarmthBand, number> = {
  cold: 0, cool: 1, mild: 2, warm: 3, hot: 4,
};

/** Resolve a warmth band for an outerwear-like item. */
export function effectiveWarmth(item: Pick<WardrobeItem, 'subType' | 'warmthBand'>): WarmthBand {
  return item.warmthBand ?? SUBTYPE_WARMTH[item.subType] ?? 'mild';
}

/** Required warmth band for a given daily low temperature. */
export function neededWarmth(lowC: number): WarmthBand {
  if (lowC < 5)  return 'cold';
  if (lowC < 12) return 'cool';
  if (lowC < 18) return 'mild';
  return 'warm';
}

/**
 * Score how well an outerwear item matches the day's coldness:
 *  +3 perfect band, +1 one band off, -2 two off, -4 anything further.
 */
export function warmthMatchScore(
  item: Pick<WardrobeItem, 'subType' | 'warmthBand'>,
  lowC: number,
): number {
  const need = neededWarmth(lowC);
  const got = effectiveWarmth(item);
  const diff = Math.abs(WARMTH_ORDER[got] - WARMTH_ORDER[need]);
  if (diff === 0) return 3;
  if (diff === 1) return 1;
  if (diff === 2) return -2;
  return -4;
}

/**
 * Combined weather-fit score for an outerwear candidate. Used by the outfit
 * engine to pick the best coat to layer when outerwear is required.
 */
export function outerwearWeatherScore(
  item: Pick<WardrobeItem, 'subType' | 'warmthBand' | 'fabric'>,
  weather: WeatherSnapshot,
): number {
  let s = warmthMatchScore(item, weather.lowC);
  if (isRainy(weather)) {
    if (RAIN_FRIENDLY_SUBTYPES.has(item.subType)) s += 3;
    else if (item.fabric && RAIN_AVERSE_FABRICS.has(item.fabric)) s -= 4;
  }
  return s;
}

export type TempUnit = 'C' | 'F';

/** Convert Celsius to Fahrenheit. */
export function toFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

/**
 * Format a temperature (given in °C) for display.
 * Returns e.g. "23°C" or "73°F".
 */
export function formatTemp(tempC: number, unit: TempUnit): string {
  if (unit === 'F') return `${Math.round(toFahrenheit(tempC))}°F`;
  return `${Math.round(tempC)}°C`;
}

/**
 * Format a temperature value only (no unit suffix), for compact displays
 * like "L18/H27" where the unit is shown once elsewhere.
 */
export function formatTempValue(tempC: number, unit: TempUnit): string {
  if (unit === 'F') return `${Math.round(toFahrenheit(tempC))}`;
  return `${Math.round(tempC)}`;
}

/** Stable signature for cache invalidation (changes when forecast meaningfully shifts). */
export function weatherSignature(weather: WeatherSnapshot | null | undefined): string {
  if (!weather) return 'none';
  return `${outerwearRule(weather)}|${isRainy(weather) ? 'wet' : 'dry'}|${neededWarmth(weather.lowC)}`;
}
