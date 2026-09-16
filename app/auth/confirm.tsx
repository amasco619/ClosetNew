import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { createEmailConfirmationSessionFromUrl } from '../../lib/auth'
import { NATIVE_EMAIL_CONFIRMATION_URL } from '../../lib/oauth-callback'

export default function EmailConfirmationScreen() {
  const callback = useLocalSearchParams<{
    code?: string
    type?: string
  }>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const query = new URLSearchParams()
    if (callback.code) query.set('code', callback.code)
    if (callback.type) query.set('type', callback.type)

    createEmailConfirmationSessionFromUrl(
      `${NATIVE_EMAIL_CONFIRMATION_URL}?${query.toString()}`,
    )
      .then(() => router.replace('/'))
      .catch(() => setError('This confirmation link is invalid or has expired.'))
  }, [callback.code, callback.type])

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {error ? (
        <Text style={styles.label}>{error}</Text>
      ) : (
        <>
          <ActivityIndicator color="#D0B892" size="large" />
          <Text style={styles.label}>Confirming your email...</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 24,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '400',
    color: '#101826',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
})