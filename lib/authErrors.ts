export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_exists'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limited'
  | 'network'
  | 'oauth_cancelled'
  | 'unknown'

export type AuthErrorAction = 'reset-password' | 'switch-to-sign-in' | 'retry'

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly retryAfter?: number,
  ) {
    super(code)
    this.name = 'AuthError'
  }
}

type ErrorRecord = Record<string, unknown>

function asRecord(value: unknown): ErrorRecord {
  return value !== null && typeof value === 'object' ? value as ErrorRecord : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase() : undefined
}

function asRetryAfter(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : undefined
}

function codeFromProvider(code: string | undefined): AuthErrorCode | undefined {
  switch (code) {
    case 'invalid_credentials':
    case 'email_not_confirmed':
    case 'invalid_email':
      return code
    case 'account_exists':
    case 'email_exists':
    case 'user_already_exists':
      return 'account_exists'
    case 'weak_password':
    case 'invalid_password':
    case 'password_too_short':
    case 'password_too_long':
      return 'weak_password'
    case 'rate_limit':
    case 'rate_limited':
    case 'over_request_rate_limit':
    case 'too_many_requests':
      return 'rate_limited'
    case 'access_denied':
    case 'user_cancelled':
    case 'user_canceled':
    case 'oauth_cancelled':
      return 'oauth_cancelled'
    default:
      return undefined
  }
}

export function authErrorFromServer(
  status: number,
  body: unknown,
  flow: 'sign-in' | 'sign-up',
): AuthError {
  const record = asRecord(body)
  const code = asString(record.reason) ?? asString(record.error) ?? asString(record.code)
  const mapped = codeFromProvider(code)

  if (mapped) {
    return new AuthError(mapped, mapped === 'rate_limited' ? asRetryAfter(record.retryAfter) : undefined)
  }
  if (status === 429) return new AuthError('rate_limited', asRetryAfter(record.retryAfter))
  if (status === 401 && flow === 'sign-in') return new AuthError('invalid_credentials')
  if (status >= 500) return new AuthError('network')
  return new AuthError('unknown')
}

export function authErrorFromSupabase(error: unknown): AuthError {
  if (error instanceof AuthError) return error
  const record = asRecord(error)
  const providerCode = codeFromProvider(asString(record.code))
  if (providerCode) {
    return new AuthError(providerCode, providerCode === 'rate_limited' ? asRetryAfter(record.retryAfter) : undefined)
  }

  const name = asString(record.name)
  const status = typeof record.status === 'number' ? record.status : undefined
  if (
    error instanceof TypeError ||
    name === 'authretryablefetcherror' ||
    status === 0 ||
    (status !== undefined && status >= 500)
  ) return new AuthError('network')

  if (status === 429) return new AuthError('rate_limited', asRetryAfter(record.retryAfter))
  return new AuthError('unknown')
}

export function authErrorCopy(error: AuthError): {
  title: string
  message: string
  action?: AuthErrorAction
  informational: boolean
} {
  switch (error.code) {
    case 'invalid_credentials':
      return {
        title: 'Those details don’t match',
        message: 'Check your email and password, or reset your password.',
        action: 'reset-password',
        informational: false,
      }
    case 'account_exists':
      return {
        title: 'You already have an account',
        message: 'This email is already part of Amodka.',
        action: 'switch-to-sign-in',
        informational: true,
      }
    case 'email_not_confirmed':
      return {
        title: 'Please confirm your email',
        message: 'We’ve sent a link to your inbox.',
        informational: true,
      }
    case 'weak_password':
      return {
        title: 'Let’s strengthen that password',
        message: 'Use at least 8 characters, one uppercase letter, and one number.',
        informational: false,
      }
    case 'invalid_email':
      return {
        title: 'That email doesn’t look right',
        message: 'Please check for typos.',
        informational: false,
      }
    case 'rate_limited':
      return {
        title: 'Let’s take a short pause',
        message: 'Too many attempts. Please try again in a few minutes.',
        informational: true,
      }
    case 'network':
      return {
        title: 'We couldn’t reach Amodka',
        message: 'Check your connection and try again.',
        action: 'retry',
        informational: true,
      }
    case 'oauth_cancelled':
      return {
        title: '',
        message: '',
        informational: false,
      }
    case 'unknown':
      return {
        title: 'Something went wrong',
        message: 'Please try again in a moment.',
        informational: false,
      }
  }
}

export function normalizeAuthError(error: unknown): AuthError {
  return authErrorFromSupabase(error)
}
