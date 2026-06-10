import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
  AccessibilityInfo, Animated,
} from 'react-native'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import { Ionicons } from '@expo/vector-icons'
import {
  signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple,
  requestPasswordReset, createSessionFromUrl,
  isValidEmail, validatePassword,
} from '../lib/auth'

type Mode = 'sign-in' | 'sign-up'
type LoadingAction = null | 'google' | 'apple' | 'email'

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState<LoadingAction>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [confirmFocused, setConfirmFocused] = useState(false)

  const wordmarkAnim = useRef(new Animated.Value(0)).current
  const formAnim = useRef(new Animated.Value(0)).current

  const url = Linking.useLinkingURL()
  useEffect(() => {
    if (url) {
      createSessionFromUrl(url).catch(console.error)
    }
  }, [url])

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      Animated.parallel([
        Animated.timing(wordmarkAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(formAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.sequence([
        Animated.timing(wordmarkAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(formAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start()
    }
  }, [reducedMotion])

  const wordmarkStyle = {
    opacity: wordmarkAnim,
    transform: reducedMotion ? [] : [{
      translateY: wordmarkAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
    }],
  }

  const formStyle = {
    opacity: formAnim,
    transform: reducedMotion ? [] : [{
      translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
    }],
  }

  const clearErrors = () => {
    setEmailError(null)
    setPasswordError(null)
    setConfirmError(null)
    setAuthError(null)
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    clearErrors()
    setConfirmed(false)
  }

  const validateEmailField = () => {
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

  const validatePasswordField = () => {
    if (mode === 'sign-in') {
      if (!password) {
        setPasswordError('Password is required.')
        return false
      }
      setPasswordError(null)
      return true
    }
    const err = validatePassword(password)
    setPasswordError(err)
    return !err
  }

  const validateConfirmField = () => {
    if (mode !== 'sign-up') return true
    if (confirmPassword !== password) {
      setConfirmError('Passwords do not match.')
      return false
    }
    setConfirmError(null)
    return true
  }

  const handleEmailSubmit = async () => {
    const validEmail = validateEmailField()
    const validPassword = validatePasswordField()
    const validConfirm = mode === 'sign-up' ? validateConfirmField() : true
    if (!validEmail || !validPassword || !validConfirm) return

    setAuthError(null)
    setLoading('email')
    try {
      if (mode === 'sign-in') {
        await signInWithEmail(email, password)
        router.replace('/(tabs)')
      } else {
        const { needsConfirmation } = await signUpWithEmail(email, password)
        if (needsConfirmation) {
          setConfirmed(true)
        } else {
          router.replace('/(tabs)')
        }
      }
    } catch (err: any) {
      const msg = (err.message ?? '')
        .replace('[signInWithEmail] ', '')
        .replace('[signUpWithEmail] ', '')
      setAuthError(msg || 'Something went wrong.')
    } finally {
      setLoading(null)
    }
  }

  const handleGoogle = async () => {
    setAuthError(null)
    setLoading('google')
    try {
      await signInWithGoogle()
    } catch (err: any) {
      setAuthError(err.message?.replace('[signInWithGoogle] ', '') ?? 'Google sign-in failed.')
    } finally {
      setLoading(null)
    }
  }

  const handleApple = async () => {
    setAuthError(null)
    setLoading('apple')
    try {
      await signInWithApple()
    } catch (err: any) {
      setAuthError(err.message?.replace('[signInWithApple] ', '') ?? 'Apple sign-in failed.')
    } finally {
      setLoading(null)
    }
  }

  if (confirmed) {
    return (
      <View style={styles.confirmedContainer}>
        <Text style={styles.confirmedTitle}>Check your email</Text>
        <Text style={styles.confirmedBody}>
          Check your email to confirm your account.{'\n'}
          Once confirmed, you can sign in above.
        </Text>
        <TouchableOpacity
          onPress={() => switchMode('sign-in')}
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.wordmarkBlock, wordmarkStyle]}>
          <Text style={styles.wordmark}>AuraCloset</Text>
          <Text style={styles.tagline}>Your quiet-luxury stylist in your pocket.</Text>
        </Animated.View>

        <Animated.View style={formStyle}>
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogle}
            activeOpacity={0.82}
            disabled={loading !== null && loading !== 'google'}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
          >
            {loading === 'google'
              ? <ActivityIndicator color="#D0B892" size="small" />
              : <Text style={styles.googleBtnText}>Continue with Google</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.appleBtn}
            onPress={handleApple}
            activeOpacity={0.82}
            disabled={loading !== null && loading !== 'apple'}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Apple"
          >
            {loading === 'apple'
              ? <ActivityIndicator color="#101826" size="small" />
              : <Text style={styles.appleBtnText}>Continue with Apple</Text>
            }
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.modeToggle}>
            <TouchableOpacity
              onPress={() => switchMode('sign-in')}
              activeOpacity={0.82}
              style={[styles.modeBtn, mode === 'sign-in' && styles.modeBtnActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.modeBtnText, mode === 'sign-in' && styles.modeBtnTextActive]}>
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => switchMode('sign-up')}
              activeOpacity={0.82}
              style={[styles.modeBtn, mode === 'sign-up' && styles.modeBtnActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.modeBtnText, mode === 'sign-up' && styles.modeBtnTextActive]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>
              Email address <Text style={styles.asterisk}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                emailFocused && styles.inputFocused,
                emailError && styles.inputError,
              ]}
              value={email}
              onChangeText={setEmail}
              onBlur={() => { setEmailFocused(false); validateEmailField() }}
              onFocus={() => setEmailFocused(true)}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
              placeholderTextColor="#8AA39B"
            />
            {emailError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{emailError}</Text>
              </View>
            )}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>
              Password <Text style={styles.asterisk}>*</Text>
            </Text>
            <View style={[
              styles.inputRow,
              passwordFocused && styles.inputRowFocused,
              passwordError && styles.inputRowError,
            ]}>
              <TextInput
                style={styles.inputInner}
                value={password}
                onChangeText={setPassword}
                onBlur={() => { setPasswordFocused(false); validatePasswordField() }}
                onFocus={() => setPasswordFocused(true)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType={mode === 'sign-up' ? 'next' : 'done'}
                onSubmitEditing={mode === 'sign-in' ? handleEmailSubmit : undefined}
                placeholderTextColor="#8AA39B"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(v => !v)}
                style={styles.eyeBtn}
                hitSlop={8}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#8AA39B"
                />
              </TouchableOpacity>
            </View>
            {mode === 'sign-up' && (
              <Text style={styles.passwordHint}>
                At least 6 characters.
              </Text>
            )}
            {passwordError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            )}
          </View>

          {mode === 'sign-up' && (
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>
                Confirm password <Text style={styles.asterisk}>*</Text>
              </Text>
              <View style={[
                styles.inputRow,
                confirmFocused && styles.inputRowFocused,
                confirmError && styles.inputRowError,
              ]}>
                <TextInput
                  style={styles.inputInner}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onBlur={() => { setConfirmFocused(false); validateConfirmField() }}
                  onFocus={() => setConfirmFocused(true)}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleEmailSubmit}
                  placeholderTextColor="#8AA39B"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirm(v => !v)}
                  style={styles.eyeBtn}
                  hitSlop={8}
                  accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Ionicons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#8AA39B"
                  />
                </TouchableOpacity>
              </View>
              {confirmError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{confirmError}</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading === 'email' && styles.submitBtnDisabled]}
            onPress={handleEmailSubmit}
            activeOpacity={0.82}
            disabled={loading === 'email'}
            accessibilityRole="button"
          >
            {loading === 'email'
              ? <ActivityIndicator color="#D0B892" size="small" />
              : <Text style={styles.submitBtnText}>
                  {mode === 'sign-in' ? 'Sign in' : 'Create account'}
                </Text>
            }
          </TouchableOpacity>

          {mode === 'sign-in' && (
            <TouchableOpacity
              onPress={() => router.push('/forgot-password')}
              activeOpacity={0.82}
              style={styles.forgotBtn}
              accessibilityRole="button"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {authError && (
            <View style={[styles.errorBox, styles.authErrorBox]}>
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F5F3F0' },
  confirmedContainer: {
    flex: 1,
    backgroundColor: '#F5F3F0',
    paddingHorizontal: 24,
    paddingTop: 120,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  wordmarkBlock: { alignItems: 'center', marginBottom: 48 },
  wordmark: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    color: '#101826',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#8AA39B',
    letterSpacing: 0.2,
  },
  confirmedTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    color: '#101826',
    marginBottom: 16,
  },
  confirmedBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#8AA39B',
    lineHeight: 24,
    marginBottom: 24,
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
  googleBtn: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#101826',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  googleBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    fontWeight: '500',
    color: '#D0B892',
  },
  appleBtn: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#D0B892',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  appleBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    fontWeight: '500',
    color: '#101826',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D0B892',
    opacity: 0.35,
  },
  dividerLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#8AA39B',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  modeBtn: {
    paddingBottom: 4,
  },
  modeBtnActive: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#101826',
  },
  modeBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    fontWeight: '400',
    color: '#8AA39B',
  },
  modeBtnTextActive: {
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    color: '#101826',
  },
  fieldBlock: { marginBottom: 20 },
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
  inputRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0B892',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  inputRowFocused: { borderColor: '#101826', borderWidth: 1.5 },
  inputRowError: { borderColor: '#EACFD3', borderWidth: 1.5 },
  inputInner: {
    flex: 1,
    height: 52,
    paddingHorizontal: 16,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#101826',
  },
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#8AA39B',
    marginTop: 6,
  },
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
    marginBottom: 12,
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    fontWeight: '500',
    color: '#D0B892',
  },
  forgotBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    fontWeight: '400',
    color: '#8AA39B',
  },
})
