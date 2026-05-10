/**
 * Weather-aware outerwear — Open-Meteo client + pure helpers.
 *
 * Open-Meteo is free, requires no API key, and returns enough data for v1
 * (current temp, daily high/low, precipitation probability). When the user
 * has not granted location permission we fall back to free IP geolocation
 * (ipapi.co), so the feature degrades gracefully rather than silently
 * disappearing.
 *
 * The pure helpers below (`outerwearRule`, `isRainy`, `warmthMatchScore`,
 * `isRainFriendly`, `effectiveWarmth`) carry zero IO and are the integration
 * point for the outfit engine — they take a WeatherSnapshot and a wardrobe
 * item and return numbers / bools the rotation logic can act on.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import type { WardrobeItem, WarmthBand, WeatherSnapshot } from '@/constants/types';

const CACHE_KEY = '@auracloset_weather_v1';
const PERM_ASKED_KEY = '@auracloset_weather_perm_asked_v1';
const TTL_MS = 6 * 60 * 60 * 1000;

interface OpenMeteoResponse {
  current?: { temperature_2m?: number; precipitation?: number };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

// ── IO ──────────────────────────────────────────────────────────────────────

async function hasAskedPermissionBefore(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(PERM_ASKED_KEY)) === '1'; } catch { return false; }
}

async function markPermissionAsked(): Promise<void> {
  try { await AsyncStorage.setItem(PERM_ASKED_KEY, '1'); } catch { /* noop */ }
}

async function getCoordsViaGps(): Promise<{ lat: number; lon: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    let granted = perm.granted;
    if (!granted) {
      // Ask exactly once. After the first denial we silently fall back to IP
      // geolocation forever — never re-prompt, even if the OS would let us.
      const askedBefore = await hasAskedPermissionBefore();
      if (askedBefore || !perm.canAskAgain) return null;
      await markPermissionAsked();
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.granted;
      if (!granted) return null;
    }
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    const loc = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }));
    return { lat: loc.coords.latitude, lon: loc.coords.longitude };
  } catch {
    return null;
  }
}

async function getCoordsViaIp(): Promise<{ lat: number; lon: number; label?: string } | null> {
  try {
    const r = await fetch('https://ipapi.co/json/');
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j?.latitude !== 'number' || typeof j?.longitude !== 'number') return null;
    return { lat: j.latitude, lon: j.longitude, label: typeof j.city === 'string' ? j.city : undefined };
  } catch {
    return null;
  }
}

async function fetchOpenMeteo(lat: number, lon: number): Promise<OpenMeteoResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&forecast_days=1&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  return (await r.json()) as OpenMeteoResponse;
}

export async function getCachedWeather(): Promise<WeatherSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: WeatherSnapshot = JSON.parse(raw);
    if (Date.now() - cached.fetchedAt > TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function clearCachedWeather(): Promise<void> {
  try { await AsyncStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
}

/**
 * Load the current forecast. Returns the cached snapshot when fresh (≤6h).
 * Tries device location first, then IP fallback. Returns null if both fail
 * or Open-Meteo is unreachable — the caller treats null as "no weather data,
 * keep the existing colour/style-based outerwear logic".
 */
export async function loadWeather(force = false): Promise<WeatherSnapshot | null> {
  if (!force) {
    const cached = await getCachedWeather();
    if (cached) return cached;
  }
  let coords: { lat: number; lon: number; label?: string } | null = await getCoordsViaGps();
  let source: 'gps' | 'ip' = 'gps';
  if (!coords) {
    coords = await getCoordsViaIp();
    source = 'ip';
  }
  if (!coords) return null;
  try {
    const data = await fetchOpenMeteo(coords.lat, coords.lon);
    const high = data?.daily?.temperature_2m_max?.[0];
    const low = data?.daily?.temperature_2m_min?.[0];
    const cur = data?.current?.temperature_2m;
    if (typeof high !== 'number' || typeof low !== 'number') return null;
    const snap: WeatherSnapshot = {
      fetchedAt: Date.now(),
      lat: coords.lat,
      lon: coords.lon,
      currentTempC: typeof cur === 'number' ? cur : (high + low) / 2,
      highC: high,
      lowC: low,
      precipProbability: Math.max(0, Math.min(1, (data?.daily?.precipitation_probability_max?.[0] ?? 0) / 100)),
      source,
      locationLabel: coords.label,
    };
    try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch { /* noop */ }
    return snap;
  } catch {
    return null;
  }
}

// ── Pure helpers (consumed by the outfit engine) ───────────────────────────

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

const RAIN_FRIENDLY_SUBTYPES = new Set(['trench', 'raincoat', 'jacket', 'bomber-jacket', 'parka', 'mac']);
const RAIN_AVERSE_FABRICS = new Set(['wool', 'cashmere', 'suede']);

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

const SUBTYPE_WARMTH: Record<string, WarmthBand> = {
  puffer: 'cold', peacoat: 'cold', coat: 'cold',
  'leather-jacket': 'cool', trench: 'cool',
  blazer: 'mild', jacket: 'mild', 'denim-jacket': 'mild',
  'bomber-jacket': 'mild', raincoat: 'mild', cardigan: 'mild',
};

const WARMTH_ORDER: Record<WarmthBand, number> = {
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

/** Stable signature for cache invalidation (changes when forecast meaningfully shifts). */
export function weatherSignature(weather: WeatherSnapshot | null | undefined): string {
  if (!weather) return 'none';
  return `${outerwearRule(weather)}|${isRainy(weather) ? 'wet' : 'dry'}|${neededWarmth(weather.lowC)}`;
}
