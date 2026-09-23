import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { EMAIL_CONFIRMED_KEY } from '../../lib/auth'

export default function AuthCallback() {
  const [error, setError] = useState(false)
  useEffect(() => {
    supabase.auth.getClaims().then(({ data, error: claimsError }) => {
      if (claimsError || !data?.claims) {
        setError(true)
        return
      }
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('type') === 'signup') {
        AsyncStorage.setItem(EMAIL_CONFIRMED_KEY, '1').catch(() => {})
      }
      // Route through index.tsx so it can run the onboarding-complete check
      // before deciding whether to land on /(tabs) or /onboarding.
      router.replace('/')
    }).catch(() => setError(true))
  }, [])

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {error ? (
        <>
          <Text style={styles.label}>This sign-in or confirmation link could not be completed.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-in')}>
            <Text style={styles.label}>Back to sign in or request a new link</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color="#D0B892" size="large" />
          <Text style={styles.label}>Signing you in...</Text>
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
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '400',
    color: '#101826',
    letterSpacing: 0.3,
  },
})
