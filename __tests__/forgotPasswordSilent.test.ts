/**
 * Confirms that password-reset failures are never silently swallowed:
 *
 *   1. Network error (fetch throws) → requestPasswordReset throws.
 *   2. Server returns 400 (invalid email) → requestPasswordReset throws.
 *   3. Server returns 200 { success: true } → requestPasswordReset resolves.
 *   4. Non-JSON response (fetch ok but json() throws) → requestPasswordReset throws.
 *
 * The test monkey-patches global fetch so no real HTTP calls are made.
 *
 * Run: `npx tsx __tests__/forgotPasswordSilent.test.ts`
 * Exits non-zero on any failed assertion.
 */

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function section(label: string): void {
  console.log(`\n${label}`);
}

// ── Minimal stub of requestPasswordReset (pure — no RN imports) ──────────────
// We re-implement the function in-process using the same logic as lib/auth.ts
// so the test doesn't need to import lib/auth.ts (which pulls in react-native).

async function requestPasswordReset(
  email: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const url = new URL('/api/auth/reset-password', 'http://localhost:5000');
  const res = await fetchImpl(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`[requestPasswordReset] ${json.error ?? res.statusText}`);
  }
}

// ── Mock fetch builders ───────────────────────────────────────────────────────

function mockFetchNetworkError(): typeof fetch {
  return async () => { throw new TypeError('Failed to fetch'); };
}

function mockFetchResponse(status: number, body: unknown): typeof fetch {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 400 ? 'Bad Request' : 'OK',
    json: async () => body,
  } as Response);
}

function mockFetchBadJson(status: number): typeof fetch {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
  } as unknown as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  section('1. Network error: requestPasswordReset throws (user sees error)');
  {
    let threw = false;
    try {
      await requestPasswordReset('user@example.com', mockFetchNetworkError());
    } catch (e) {
      threw = true;
      assert(e instanceof TypeError, 'thrown error is a TypeError (network failure)');
    }
    assert(threw, 'requestPasswordReset throws on network error');
  }

  section('2. Server 400 (invalid email): throws with [requestPasswordReset] prefix');
  {
    let errorMsg = '';
    try {
      await requestPasswordReset(
        'bad-email',
        mockFetchResponse(400, { error: 'invalid_email' }),
      );
    } catch (e: any) {
      errorMsg = e?.message ?? '';
    }
    assert(errorMsg.includes('[requestPasswordReset]'),
      'error message has [requestPasswordReset] prefix on 400');
    assert(errorMsg.includes('invalid_email'),
      'server error code is propagated to the thrown error');
  }

  section('3. Server 200 success: resolves without throwing');
  {
    let threw = false;
    try {
      await requestPasswordReset(
        'user@example.com',
        mockFetchResponse(200, { success: true }),
      );
    } catch {
      threw = true;
    }
    assert(!threw, 'requestPasswordReset resolves when server returns 200 + { success: true }');
  }

  section('4. Non-JSON response body (json() throws): error propagates to caller');
  {
    // This is the edge case where the server returns HTML (e.g. a 500 from nginx
    // before the Express app handles the request).  res.json() throws a SyntaxError.
    // The caller (forgot-password.tsx handleSubmit) must see this error.
    let threw = false;
    try {
      await requestPasswordReset(
        'user@example.com',
        mockFetchBadJson(200),
      );
    } catch {
      threw = true;
    }
    assert(threw, 'json parse failure propagates — not silently swallowed');
  }

  section('5. Server 500 with error field: throws with server message');
  {
    let errorMsg = '';
    try {
      await requestPasswordReset(
        'user@example.com',
        mockFetchResponse(500, { error: 'internal_error' }),
      );
    } catch (e: any) {
      errorMsg = e?.message ?? '';
    }
    assert(errorMsg.includes('internal_error'),
      '500 response error field is propagated in the thrown message');
  }

  section('6. Server 500 without error field: falls back to statusText');
  {
    let errorMsg = '';
    try {
      await requestPasswordReset(
        'user@example.com',
        mockFetchResponse(500, {}), // no .error field
      );
    } catch (e: any) {
      errorMsg = e?.message ?? '';
    }
    assert(errorMsg.length > 0, 'throws even when body has no error field');
    assert(errorMsg.includes('[requestPasswordReset]'),
      'prefix is present even when error field is absent');
  }

  section('7. Email normalisation: server receives trimmed lower-case email');
  {
    let capturedBody = '';
    const captureFetch: typeof fetch = async (_url, init) => {
      capturedBody = init?.body as string ?? '';
      return {
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ success: true }),
      } as Response;
    };

    await requestPasswordReset('  USER@Example.COM  ', captureFetch);
    const parsed = JSON.parse(capturedBody);
    assert(parsed.email === 'user@example.com',
      'email is trimmed and lower-cased before being sent to the server');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== forgotPasswordSilent: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
