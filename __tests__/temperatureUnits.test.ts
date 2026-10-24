import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { formatTemp, formatTempValue } from '../constants/weatherPure';
import type { TempUnit } from '../constants/weatherPure';
import { hydrateAccountProfile, mergeProfile, profileConstraints } from '../shared/profile-personalization';

async function main() {
  const store = new Map<string, string>();
  let region: string | null = 'GB', gps = true, offline = false;
  let hangLastGps = false, noLastGps = false, hangCurrentGps = false;
  let hangIp = false, hangIpJson = false;
  let hangForecast = false, hangForecastJson = false;
  let timeoutsToFire = 0;
  let abortedRequests = 0;
  const requests: string[] = [];
  const mocks = {
    '@react-native-async-storage/async-storage': {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => { store.set(key, value); },
      removeItem: async (key: string) => { store.delete(key); },
    },
    'expo-location': {
      Accuracy: { Lowest: 1 },
      getForegroundPermissionsAsync: async () => ({ granted: gps, canAskAgain: false }),
      getLastKnownPositionAsync: async () => hangLastGps
        ? new Promise(() => {})
        : noLastGps
        ? null
        : ({ coords: { latitude: 51.5, longitude: -0.1 } }),
      getCurrentPositionAsync: async () => hangCurrentGps
        ? new Promise(() => {})
        : ({ coords: { latitude: 51.5, longitude: -0.1 } }),
    },
    'expo-localization': { getLocales: () => [{ regionCode: region }] },
  };
  const bundle = await build({
    entryPoints: ['constants/weather.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{
      name: 'weather-native-fixtures',
      setup(builder) {
        builder.onResolve({ filter: /^(?:@react-native-async-storage\/async-storage|expo-location|expo-localization)$/ },
          args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' },
          args => ({ contents: `module.exports = __mocks[${JSON.stringify(args.path)}];`, loader: 'js' }));
      },
    }],
  });
  const module = { exports: {} };
  const fetchFixture = async (url: string, init?: { signal?: AbortSignal }) => {
    requests.push(url);
    const hangsOnBody = (url.includes('ipapi.co') && hangIpJson) ||
      (url.includes('open-meteo') && hangForecastJson);
    if ((url.includes('ipapi.co') && hangIp) || (url.includes('open-meteo') && hangForecast)) {
      init?.signal?.addEventListener('abort', () => { abortedRequests++; });
      return new Promise(() => {});
    }
    if (hangsOnBody) {
      init?.signal?.addEventListener('abort', () => { abortedRequests++; });
      return {
        ok: true,
        json: async () => new Promise(() => {}),
      };
    }
    if (url.includes('ipapi.co')) return {
      ok: true, json: async () => ({ latitude: 51.5, longitude: -0.1, city: 'London', country_code: 'GB' }),
    };
    assert.equal(new URL(url).searchParams.get('temperature_unit') ?? 'celsius', 'celsius');
    if (offline) throw new Error('controlled forecast outage');
    return { ok: true, json: async () => ({
      current: { temperature_2m: 20 },
      daily: { temperature_2m_max: [24], temperature_2m_min: [12], precipitation_probability_max: [10] },
    }) };
  };
  const setTimeoutFixture = (callback: (...args: any[]) => void, delay?: number) => {
    const hangingRequest = (hangLastGps || hangCurrentGps || hangIp || hangIpJson || hangForecast || hangForecastJson);
    if (delay === 8_000 && hangingRequest && timeoutsToFire > 0) {
      timeoutsToFire--;
      queueMicrotask(() => callback());
    }
    return 1 as any;
  };
  new Function('module', 'exports', '__mocks', 'fetch', 'Intl', 'setTimeout', 'clearTimeout', bundle.outputFiles[0].text)(
    module, module.exports, mocks, fetchFixture,
    { DateTimeFormat: () => ({ resolvedOptions: () => ({ locale: 'en-US' }) }) },
    setTimeoutFixture, () => {},
  );
  const weather = module.exports as typeof import('../constants/weather');
  const effectiveUnit = (profile: { tempUnit?: TempUnit | null }) => profile.tempUnit ?? weather.defaultTempUnit();
  assert.equal(effectiveUnit({}), 'C', 'UK locale without a preference defaults to Celsius');
  for (region of ['US', 'GB', 'NG', 'BZ', 'KY', 'PW', 'BS', 'FM', 'MH', 'LR', null]) {
    assert.equal(effectiveUnit({}), 'C', `global default for ${region ?? 'unknown / Intl fallback'}`);
    assert.equal(effectiveUnit({ tempUnit: null }), 'C');
    assert.equal(effectiveUnit({ tempUnit: 'C' }), 'C');
    const saved = JSON.parse('{"tempUnit":"F"}');
    assert.equal(effectiveUnit(saved), 'F', 'saved explicit Fahrenheit overrides the default');
    assert.deepEqual(saved, { tempUnit: 'F' }, 'resolving the default never rewrites saved choices');
  }
  for (const screen of ['index', 'profile']) {
    const source = readFileSync(`app/(tabs)/${screen}.tsx`, 'utf8');
    assert.match(source, /profile\.tempUnit \?\? defaultTempUnit\(\)/);
    assert.match(source, /formatTemp\(weather\.currentTempC, effectiveTempUnit\)/);
    assert.match(source, /formatTempValue\(weather\.lowC, effectiveTempUnit\)/);
    assert.match(source, /formatTempValue\(weather\.highC, effectiveTempUnit\)/);
  }
  const context = readFileSync('contexts/AppContext.tsx', 'utf8');
  assert.match(context, /hydratedProfile = hydrateAccountProfile\(dbProfile, authName\)/);
  assert.match(context, /constraints: profileConstraints\(updated\)/);
  assert.equal(effectiveUnit(hydrateAccountProfile({}, '')), 'C');
  const fahrenheit = profileConstraints(mergeProfile({ tempUnit: 'F' }));
  assert.equal(effectiveUnit(hydrateAccountProfile({ constraints: fahrenheit }, '')), 'F');
  assert.equal(effectiveUnit(hydrateAccountProfile({}, '')), 'C', 'another account never inherits F');

  for (const useGps of [true, false]) {
    gps = useGps;
    await weather.clearCachedWeather();
    const live = await weather.loadWeather();
    assert.ok(live);
    assert.equal(live.source, gps ? 'gps' : 'ip');
    if (!gps) assert.equal(live.locationLabel, 'London');
    assert.deepEqual([live.currentTempC, live.lowC, live.highC], [20, 12, 24]);
    const serialized = JSON.stringify(live), fetched = requests.length;
    for (const snapshot of [live, await weather.loadWeather(), await weather.getCachedWeather()]) {
      assert.ok(snapshot);
      assert.equal(formatTemp(snapshot.currentTempC, effectiveUnit({})), '20°C');
      assert.equal(formatTemp(snapshot.currentTempC, effectiveUnit({ tempUnit: 'F' })), '68°F');
      assert.equal(formatTempValue(snapshot.lowC, 'F'), '54');
      assert.equal(formatTempValue(snapshot.highC, 'F'), '75');
      assert.equal(formatTemp(snapshot.currentTempC, 'C'), '20°C', 'switching back does not convert a converted value');
      assert.equal(JSON.stringify(snapshot), serialized, 'display never mutates raw/cache Celsius values');
    }
    assert.equal(requests.length, fetched, 'fresh cache avoids a new provider request');
    assert.equal([...store.values()].includes(serialized), true, 'persisted snapshot remains Celsius');
  }
  offline = true;
  assert.equal(await weather.loadWeather(true), null, 'unavailable forecast stays absent, never fabricates or converts fallback data');
  offline = false;

  gps = true;
  hangLastGps = true;
  timeoutsToFire = 1;
  const gpsTimeoutResult = await weather.loadWeather(true);
  assert.equal(gpsTimeoutResult?.source, 'ip', 'a stalled GPS lookup times out and falls back to IP location');
  assert.equal(timeoutsToFire, 0);
  hangLastGps = false;

  noLastGps = true;
  hangCurrentGps = true;
  timeoutsToFire = 1;
  const currentGpsTimeoutResult = await weather.loadWeather(true);
  assert.equal(currentGpsTimeoutResult?.source, 'ip', 'a stalled current-position request also falls back to IP');
  assert.equal(timeoutsToFire, 0);
  noLastGps = false;
  hangCurrentGps = false;

  gps = false;
  hangIp = true;
  timeoutsToFire = 1;
  const ipTimeoutResult = await weather.loadWeather(true);
  assert.equal(ipTimeoutResult, null, 'a stalled IP geolocation request resolves as unavailable');
  assert.equal(abortedRequests, 1, 'timed-out IP fetch is aborted');
  hangIp = false;

  hangIpJson = true;
  timeoutsToFire = 1;
  assert.equal(await weather.loadWeather(true), null, 'a stalled IP response body also times out');
  assert.equal(abortedRequests, 2, 'timed-out IP response body is aborted');
  hangIpJson = false;

  gps = true;
  hangForecast = true;
  timeoutsToFire = 1;
  const forecastTimeoutResult = await weather.loadWeather(true);
  assert.equal(forecastTimeoutResult, null, 'a stalled forecast resolves as unavailable');
  assert.equal(abortedRequests, 3, 'timed-out forecast fetch is aborted');
  hangForecast = false;

  hangForecastJson = true;
  timeoutsToFire = 1;
  assert.equal(await weather.loadWeather(true), null, 'a stalled forecast response body also times out');
  assert.equal(abortedRequests, 4, 'timed-out forecast response body is aborted');
  hangForecastJson = false;
  const weatherSource = readFileSync('constants/weather.ts', 'utf8');
  assert.match(weatherSource, /const REQUEST_TIMEOUT_MS = 8_000/);
  assert.equal(formatTemp(-40, 'C'), '-40°C');
  assert.equal(formatTemp(-40, 'F'), '-40°F');
  console.log('Global Celsius default, explicit choices, UK/US/unknown locale, GPS/IP forecasts, cache and GPS/IP/forecast timeouts passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
