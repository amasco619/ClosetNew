export type OAuthCallbackParams = {
  code?: unknown
  type?: unknown
  errorCode?: unknown
  errorDescription?: unknown
}

type OAuthSessionResult<T> = {
  data: { session: T | null }
  error: { message: string } | null
}

export type OAuthSessionAdapter<T> = {
  exchangeCodeForSession(code: string): Promise<OAuthSessionResult<T>>
  markEmailConfirmed(): void
}

/**
 * Completes a parsed native OAuth callback. Kept independent of React Native so
 * the PKCE, token, and error paths can be regression-tested in Node.
 */
export async function completeOAuthCallback<T>(
  params: OAuthCallbackParams,
  adapter: OAuthSessionAdapter<T>,
): Promise<T | null> {
  if (params.errorCode) {
    const description = params.errorDescription ? `: ${String(params.errorDescription)}` : ''
    throw new Error(`${String(params.errorCode)}${description}`)
  }

  if (params.code) {
    const { data, error } = await adapter.exchangeCodeForSession(String(params.code))
    if (error) throw new Error(`[createSessionFromUrl] ${error.message}`)
    if (params.type === 'signup') adapter.markEmailConfirmed()
    return data.session
  }

  return null
}