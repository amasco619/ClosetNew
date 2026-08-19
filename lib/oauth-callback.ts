export const AMODKA_URL_SCHEME = 'amodka'
export const NATIVE_OAUTH_CALLBACK_URL = `${AMODKA_URL_SCHEME}://auth/callback`

function callbackBase(url: string): string {
  const queryIndex = url.search(/[?#]/)
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

function callbackParams(url: string): URLSearchParams {
  const queryStart = url.indexOf('?')
  const fragmentStart = url.indexOf('#')
  const query =
    queryStart === -1
      ? ''
      : url.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart)
  const fragment = fragmentStart === -1 ? '' : url.slice(fragmentStart + 1)
  const queryParams = new URLSearchParams(query)
  const fragmentParams = new URLSearchParams(fragment)

  for (const [key, value] of fragmentParams) {
    if (!queryParams.has(key)) queryParams.set(key, value)
  }
  return queryParams
}

export type ParsedOAuthCallback = {
  code?: string
  type?: string
  errorCode?: string
  errorDescription?: string
}

/**
 * Reads a callback only when it returns to the exact callback base originally
 * supplied to the OAuth flow. Native sessions use PKCE code exchange only.
 */
export function parseOAuthCallback(
  url: string,
  expectedCallbackUrl: string,
): ParsedOAuthCallback | null {
  if (callbackBase(url) !== callbackBase(expectedCallbackUrl)) return null
  const params = callbackParams(url)

  return {
    code: params.get('code') ?? undefined,
    type: params.get('type') ?? undefined,
    errorCode: params.get('error_code') ?? params.get('error') ?? undefined,
    errorDescription: params.get('error_description') ?? undefined,
  }
}

/**
 * Confirms that a URL is an OAuth callback for the expected native scheme.
 * A PKCE code or provider error is required so ordinary app deep links are not
 * accidentally sent to the Supabase session exchange.
 */
export function isOAuthCallbackUrl(url: string, expectedCallbackUrl: string): boolean {
  const callback = parseOAuthCallback(url, expectedCallbackUrl)
  return callback !== null && Boolean(callback.code || callback.errorCode)
}

/**
 * Validates an OAuth relay destination before Supabase has appended its code.
 * This intentionally does not require an OAuth payload: the relay creates it.
 */
export function isOAuthRelayDestination(url: string, expectedExpHost?: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) return false
    if (parsed.protocol === `${AMODKA_URL_SCHEME}:`) {
      return callbackBase(url) === NATIVE_OAUTH_CALLBACK_URL
    }
    if (parsed.protocol !== 'exp:') return false

    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      (expectedExpHost !== undefined && parsed.host === expectedExpHost)
    )
  } catch {
    return false
  }
}

/** Builds the completed custom-scheme URL that returns from the Expo Go relay. */
export function buildOAuthRelayUrl(
  destination: string,
  code: string,
  type?: string | null,
  expectedExpHost?: string,
): string | null {
  if (!code || !isOAuthRelayDestination(destination, expectedExpHost)) return null

  const relay = new URLSearchParams({ code })
  if (type) relay.set('type', type)
  const base = destination.split(/[?#]/)[0]
  return `${base}?${relay.toString()}`
}