type RecoveryCallback = { code?: string; type?: string; error?: string }

export async function prepareRecoverySession(
  callback: RecoveryCallback,
  exchange: (url: string) => Promise<unknown>,
  getClaims: () => Promise<{ data: { claims?: unknown } | null; error: unknown }>,
): Promise<void> {
  if (callback.error || (callback.type && callback.type !== 'recovery') || !callback.code) {
    throw new Error('Invalid recovery link')
  }
  const query = new URLSearchParams({ code: callback.code })
  if (callback.type) query.set('type', callback.type)
  const session = await exchange(`amodka://auth/update-password?${query.toString()}`)
  if (!session) throw new Error('Recovery session not established')
  const { data, error } = await getClaims()
  if (error || !data?.claims) throw new Error('Recovery claims unavailable')
}

export async function updatePasswordWith(
  password: string,
  update: (password: string) => Promise<{ error: unknown }>,
): Promise<void> {
  try {
    const { error } = await update(password)
    if (error) throw new Error('Provider rejected update')
  } catch {
    throw new Error('[updatePassword] Password could not be updated. Please try again.')
  }
}