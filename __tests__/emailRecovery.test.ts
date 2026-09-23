/**
 * Contract tests for the email recovery session and password update helpers.
 *
 * Run: npx tsx __tests__/emailRecovery.test.ts
 */

import { prepareRecoverySession, updatePasswordWith } from '../lib/emailRecovery'

let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) console.log(`  ✓ ${message}`)
  else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}

function section(message: string): void {
  console.log(`\n${message}:`)
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function rejectionMessage(action: () => Promise<unknown>): Promise<string> {
  try {
    await action()
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function tick(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

;(async () => {
  section('valid callback exchange and claims gating')
  {
    const exchangeResult = deferred<{ session: true }>()
    const claimsResult = deferred<{ data: { claims?: unknown } | null; error: unknown }>()
    let exchangeCalls = 0
    let claimsCalls = 0
    let complete = false

    const work = prepareRecoverySession(
      { code: 'code with spaces', type: 'recovery' },
      async url => {
        exchangeCalls++
        assert(
          url === 'amodka://auth/update-password?code=code+with+spaces&type=recovery',
          'exchanges the native recovery URL',
        )
        return exchangeResult.promise
      },
      async () => {
        claimsCalls++
        return claimsResult.promise
      },
    ).then(() => {
      complete = true
    })

    await tick()
    assert(exchangeCalls === 1, 'starts the callback exchange')
    assert(claimsCalls === 0, 'does not request claims while exchange is pending')
    assert(!complete, 'does not complete while both deferred operations are pending')

    exchangeResult.resolve({ session: true })
    await tick()
    assert(claimsCalls === 1, 'requests claims after a session is established')
    assert(!complete, 'does not complete while claims are pending')

    claimsResult.resolve({ data: { claims: { sub: 'user-1' } }, error: null })
    await work
    assert(complete, 'completes after both exchange and claims succeed')
  }

  section('invalid callbacks do not exchange')
  {
    const invalidCallbacks = [
      { callback: { error: 'access_denied', code: 'code' }, label: 'error callback' },
      { callback: { type: 'recovery' }, label: 'missing code' },
      { callback: { code: 'code', type: 'signin' }, label: 'wrong callback type' },
    ]

    for (const { callback, label } of invalidCallbacks) {
      let exchangeCalls = 0
      const message = await rejectionMessage(() =>
        prepareRecoverySession(
          callback,
          async () => {
            exchangeCalls++
            return { session: true }
          },
          async () => ({ data: { claims: {} }, error: null }),
        ),
      )
      assert(message === 'Invalid recovery link', `${label} is rejected`)
      assert(exchangeCalls === 0, `${label} does not call exchange`)
    }
  }

  section('exchange and claims failures are normalized')
  {
    const returnedExchangeError = await rejectionMessage(() =>
      prepareRecoverySession(
        { code: 'code' },
        async () => Promise.reject(new Error('provider exchange details')),
        async () => ({ data: { claims: {} }, error: null }),
      ),
    )
    assert(returnedExchangeError === 'provider exchange details', 'propagates a rejected exchange')

    const thrownExchangeError = await rejectionMessage(() =>
      prepareRecoverySession(
        { code: 'code' },
        () => {
          throw new Error('synchronous exchange details')
        },
        async () => ({ data: { claims: {} }, error: null }),
      ),
    )
    assert(thrownExchangeError === 'synchronous exchange details', 'propagates a thrown exchange')

    const nullSessionError = await rejectionMessage(() =>
      prepareRecoverySession(
        { code: 'code' },
        async () => null,
        async () => ({ data: { claims: {} }, error: null }),
      ),
    )
    assert(nullSessionError === 'Recovery session not established', 'rejects a null session')

    const returnedClaimsError = await rejectionMessage(() =>
      prepareRecoverySession(
        { code: 'code' },
        async () => ({ session: true }),
        async () => ({ data: { claims: { sub: 'user-1' } }, error: new Error('claims details') }),
      ),
    )
    assert(returnedClaimsError === 'Recovery claims unavailable', 'rejects returned claims errors')

    const thrownClaimsError = await rejectionMessage(() =>
      prepareRecoverySession(
        { code: 'code' },
        async () => ({ session: true }),
        async () => {
          throw new Error('thrown claims details')
        },
      ),
    )
    assert(thrownClaimsError === 'thrown claims details', 'propagates thrown claims errors')

    const absentClaimsError = await rejectionMessage(() =>
      prepareRecoverySession(
        { code: 'code' },
        async () => ({ session: true }),
        async () => ({ data: {}, error: null }),
      ),
    )
    assert(absentClaimsError === 'Recovery claims unavailable', 'rejects absent claims')
  }

  section('password update outcomes')
  {
    const returnedProviderError = 'provider says: password policy details'
    const returnedErrorMessage = await rejectionMessage(() =>
      updatePasswordWith('new-password', async password => {
        assert(password === 'new-password', 'passes the password to the provider')
        return { error: new Error(returnedProviderError) }
      }),
    )
    assert(
      returnedErrorMessage === '[updatePassword] Password could not be updated. Please try again.',
      'sanitizes a returned provider error',
    )
    assert(!returnedErrorMessage.includes(returnedProviderError), 'does not expose returned provider text')

    const thrownProviderError = 'provider threw: internal database detail'
    const thrownErrorMessage = await rejectionMessage(() =>
      updatePasswordWith('new-password', async () => {
        throw new Error(thrownProviderError)
      }),
    )
    assert(
      thrownErrorMessage === '[updatePassword] Password could not be updated. Please try again.',
      'sanitizes a thrown provider error',
    )
    assert(!thrownErrorMessage.includes(thrownProviderError), 'does not expose thrown provider text')

    let updatedPassword = ''
    await updatePasswordWith('working-password', async password => {
      updatedPassword = password
      return { error: null }
    })
    assert(updatedPassword === 'working-password', 'resolves on a successful provider update')
  }

  console.log(`\n=== emailRecovery: ${failed === 0 ? 'all tests passed' : `${failed} FAILED`} ===`)
  if (failed > 0) process.exit(1)
})()