import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

async function main() {
  // Bundle only the API client; never import React Native or the live auth client.
  const built = await build({
    entryPoints: ['lib/query-client.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['expo/fetch', '@tanstack/react-query', './supabase'],
  });
  const require = createRequire(`${process.cwd()}/package.json`);
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    (name: string) => name === 'expo/fetch' ? { fetch: () => assert.fail('unexpected real fetch') } : require(name),
    module, module.exports,
  );
  const { authenticatedApiRequest, ApiRequestError, _testOverrides } = module.exports;
  const savedDomain = process.env.EXPO_PUBLIC_DOMAIN;
  process.env.EXPO_PUBLIC_DOMAIN = 'classification-fixture.invalid';
  const authBody = '{"error":"invalid_token","code":"AUTH_REQUIRED"}';
  let refreshes = 0;
  const sent: string[] = [];
  _testOverrides.auth = {
    getSession: async () => ({ data: { session: { access_token: 'fixture-old' } } }),
    refreshSession: async () => {
      refreshes++;
      return { data: { session: { access_token: 'fixture-new' } } };
    },
  };
  try {
    for (const route of ['/api/classify-garment', '/api/classify-garments']) {
      for (const finalStatus of [200, 401]) {
        sent.length = 0; refreshes = 0;
        _testOverrides.fetch = async (_url: string, init: RequestInit) => {
          sent.push((init.headers as Record<string, string>).Authorization);
          return new Response(sent.length === 1 || finalStatus === 401 ? authBody : '{"ok":true}', {
            status: sent.length === 1 ? 401 : finalStatus,
          });
        };
        if (finalStatus === 200) {
          assert.equal((await authenticatedApiRequest('POST', route, {})).status, 200);
        } else {
          await assert.rejects(authenticatedApiRequest('POST', route, {}), (error: any) => {
            assert(error instanceof ApiRequestError);
            assert.equal(error.status, 401);
            assert.equal(error.code, 'AUTH_REQUIRED');
            assert.equal(error.message, `401: ${authBody}`, 'message remains byte-for-byte compatible');
            return true;
          });
        }
        assert.equal(refreshes, 1);
        assert.deepEqual(sent, ['Bearer fixture-old', 'Bearer fixture-new'], 'only one refresh and one retry');
      }
    }
    refreshes = 0;
    _testOverrides.fetch = async () => new Response(authBody, { status: 401 });
    await assert.rejects(authenticatedApiRequest('POST', '/api/user/profile', {}));
    assert.equal(refreshes, 0, 'unrelated endpoints do not acquire refresh/retry behaviour');

    for (const [body, headers, expectedCode, expectedWait] of [
      ['{"error":"rate_limit","code":"APP_RATE_LIMIT","retryAfter":12}', {}, 'APP_RATE_LIMIT', 12],
      ['{"error":"rate_limit","code":"APP_RATE_LIMIT"}', { 'Retry-After': '9' }, 'APP_RATE_LIMIT', 9],
      ['not JSON', {}, undefined, undefined],
      ['null', {}, undefined, undefined],
    ] as const) {
      _testOverrides.fetch = async () => new Response(body, { status: 429, headers });
      await assert.rejects(authenticatedApiRequest('POST', '/api/classify-garment', {}), (error: any) => {
        assert.equal(error.message, `429: ${body}`);
        assert.equal(error.code, expectedCode);
        assert.equal(error.retryAfter, expectedWait);
        return true;
      });
    }
    _testOverrides.auth.refreshSession = async () => { throw new Error('fixture refresh offline'); };
    _testOverrides.fetch = async () => new Response(authBody, { status: 401 });
    await assert.rejects(authenticatedApiRequest('POST', '/api/classify-garment', {}), (error: any) => {
      assert.equal(error.code, 'AUTH_REQUIRED');
      return true;
    });
    _testOverrides.auth.refreshSession = async () => ({ data: { session: { access_token: 'fixture-new' } } });
    let calls = 0;
    _testOverrides.fetch = async () => {
      if (++calls === 1) return new Response(authBody, { status: 401 });
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(authenticatedApiRequest('POST', '/api/classify-garment', {}), (error: any) => {
      assert.equal(error.kind, 'network', 'network error on the retry is not hidden behind the original 401');
      return true;
    });
  } finally {
    if (savedDomain === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
    else process.env.EXPO_PUBLIC_DOMAIN = savedDomain;
  }
  console.log('Classification API: stable error fields, original message, one 401 refresh/retry on both routes, and failure paths passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
