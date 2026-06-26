import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
  AccessibilityInfo,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { requestPasswordReset, isValidEmail } from '../lib/auth'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [focused, setFocused] = useState(false)

  const validateEmail = () => {
    if (!email.trim()) {
      setEmailError('Email address is required.')
      return false
    }
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.')
      return false
    }
    setEmailError(null)
    return true
  }

  const handleSubmit = async () => {
    if (!validateEmail()) return
    setAuthError(null)
    setLoading(true)
    try {
      await requestPasswordReset(email)
      setSuccess(true)
    } catch (err: any) {
      setAuthError(err.message?.replace('[requestPasswordReset] ', '') ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <View style={styles.successContainer}>
        <StatusBar style="dark" />
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.82}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color="#101826" />
        </TouchableOpacity>
        <Text style={styles.heading}>Reset your password</Text>
        <Text style={styles.successText}>
          We have sent a password reset link to {email.trim().toLowerCase()}.
          {'\n\n'}
          Check your inbox and follow the link to set a new password.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/sign-in')}
          activeOpacity={0.82}
          style={styles.backLink}
          accessibilityRole="button"
        >
          <Text style={styles.backLinkText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.82}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color="#101826" />
        </TouchableOpacity>

        <Text style={styles.heading}>Reset your password</Text>
        <Text style={styles.subheading}>
          Enter your email and we will send you a link to reset your password.
        </Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>
            Email address <Text style={styles.asterisk}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              focused && styles.inputFocused,
              emailError && styles.inputError,
            ]}
            value={email}
            onChangeText={setEmail}
            onBlur={() => { setFocused(false); validateEmail() }}
            onFocus={() => setFocused(true)}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            placeholderTextColor="#8AA39B"
          />
          {emailError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{emailError}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.82}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Send reset link"
        >
          {loading
            ? <ActivityIndicator color="#D0B892" size="small" />
            : <Text style={styles.submitBtnText}>Send reset link</Text>
          }
        </TouchableOpacity>

        {authError && (
          <View style={[styles.errorBox, styles.authErrorBox]}>
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F5F3F0' },
  successContainer: {
    flex: 1,
    backgroundColor: '#F5F3F0',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 48,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginLeft: -8,
  },
  heading: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    fontWeight: '600',
    color: '#101826',
    marginBottom: 12,
  },
  subheading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    fontWeight: '400',
    color: '#8AA39B',
    lineHeight: 24,
    marginBottom: 32,
  },
  successText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#8AA39B',
    lineHeight: 24,
    marginBottom: 32,
  },
  backLink: {
    paddingVertical: 12,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  backLinkText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#8AA39B',
  },
  fieldBlock: { marginBottom: 24 },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#101826',
    marginBottom: 8,
  },
  asterisk: { color: '#101826' },
  input: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0B892',
    paddingHorizontal: 16,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#101826',
    backgroundColor: '#FFFFFF',
  },
  inputFocused: { borderColor: '#101826', borderWidth: 1.5 },
  inputError: { borderColor: '#EACFD3', borderWidth: 1.5 },
  errorBox: {
    backgroundColor: '#EACFD3',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  authErrorBox: { marginTop: 12 },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#101826',
  },
  submitBtn: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#101826',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    fontWeight: '500',
    color: '#D0B892',
  },
})
