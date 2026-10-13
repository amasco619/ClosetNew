import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { formatTemp, formatTempValue } from '../constants/weatherPure';
import type { TempUnit } from '../constants/weatherPure';

async function main() {
  const store = new Map<string, string>();
  let region: string | null = 'GB', gps = true, offline = false;
  const requests: string[] = [];
  const mocks = {
    '@react-native-async-storage/async-storage': {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => { store.set(key, value); },
      removeItem: async (key: string) => { store.delete(key); },
    },
    'expo-location': {
      getForegroundPermissionsAsync: async () => ({ granted: gps, canAskAgain: false }),
      getLastKnownPositionAsync: async () => ({ coords: { latitude: 51.5, longitude: -0.1 } }),
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
  const fetchFixture = async (url: string) => {
    requests.push(url);
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
  new Function('module', 'exports', '__mocks', 'fetch', 'Intl', bundle.outputFiles[0].text)(
    module, module.exports, mocks, fetchFixture,
    { DateTimeFormat: () => ({ resolvedOptions: () => ({ locale: 'en-US' }) }) },
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
  assert.match(context, /tempUnit: ext\.tempUnit \?\? prev\.tempUnit \?\? null/);
  assert.match(context, /tempUnit: updated\.tempUnit \?\? null/);

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
  assert.equal(formatTemp(-40, 'C'), '-40°C');
  assert.equal(formatTemp(-40, 'F'), '-40°F');
  console.log('Global Celsius default, explicit choices, UK/US/unknown locale, GPS/IP forecasts and cached one-time display conversion passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
