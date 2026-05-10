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
import * as Localization from 'expo-localization';
import type { WeatherSnapshot } from '@/constants/types';
export type {
  OuterwearRule,
  TempUnit,
} from '@/constants/weatherPure';
export {
  outerwearRule,
  isRainy,
  isRainFriendly,
  effectiveWarmth,
  neededWarmth,
  warmthMatchScore,
  outerwearWeatherScore,
  toFahrenheit,
  formatTemp,
  formatTempValue,
  weatherSignature,
} from '@/constants/weatherPure';

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

// ── Temperature unit helpers ──────────────────────────────────────────────────

/**
 * Detect whether the device locale defaults to Fahrenheit.
 * Fahrenheit countries: US, UK (GB), Belize, Cayman Islands, Palau,
 * Bahamas, Micronesia, Marshall Islands, Liberia.
 * Uses expo-localization for reliable region detection, with an Intl fallback.
 * Falls back to Celsius for any locale that can't be resolved.
 */
export function defaultTempUnit(): import('@/constants/weatherPure').TempUnit {
  const fahrenheitRegions = new Set(['US', 'GB', 'BZ', 'KY', 'PW', 'BS', 'FM', 'MH', 'LR']);
  try {
    // expo-localization returns e.g. [{languageTag: 'en-US', regionCode: 'US', ...}]
    const locales = Localization.getLocales();
    for (const loc of locales) {
      const region = loc.regionCode?.toUpperCase();
      if (region && fahrenheitRegions.has(region)) return 'F';
    }
  } catch { /* noop — fall through to Intl */ }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split('-')[1]?.toUpperCase();
    if (region && fahrenheitRegions.has(region)) return 'F';
  } catch { /* noop */ }
  return 'C';
}
