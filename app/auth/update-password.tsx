import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { updatePassword, validatePassword } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

export default function UpdatePasswordScreen() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null)
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [newFocused, setNewFocused] = useState(false)
  const [confirmFocused, setConfirmFocused] = useState(false)

  useEffect(() => {
    supabase.auth.getClaims().then(({ data }) => {
      if (!data?.claims) {
        router.replace('/sign-in')
      }
    })
  }, [])

  const validateNewPassword = () => {
    const err = validatePassword(newPassword)
    setNewPasswordError(err)
    return !err
  }

  const validateConfirmPassword = () => {
    if (confirmPassword !== newPassword) {
      setConfirmPasswordError('Passwords do not match.')
      return false
    }
    setConfirmPasswordError(null)
    return true
  }

  const handleSubmit = async () => {
    const validNew = validateNewPassword()
    const validConfirm = validateConfirmPassword()
    if (!validNew || !validConfirm) return
    setAuthError(null)
    setLoading(true)
    try {
      await updatePassword(newPassword)
      setSuccess(true)
    } catch (err: any) {
      setAuthError(err.message?.replace('[updatePassword] ', '') ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <View style={styles.successContainer}>
        <StatusBar style="dark" />
        <Text style={styles.heading}>Password updated</Text>
        <Text style={styles.successText}>
          Your password has been updated. You can now use your new password to sign in.
        </Text>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.82}
          accessibilityRole="button"
        >
          <Text style={styles.ctaBtnText}>Go to my wardrobe</Text>
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
        <Text style={styles.heading}>Set a new password</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>
            New password <Text style={styles.asterisk}>*</Text>
          </Text>
          <View style={[
            styles.inputRow,
            newFocused && styles.inputRowFocused,
            newPasswordError && styles.inputRowError,
          ]}>
            <TextInput
              style={styles.inputInner}
              value={newPassword}
              onChangeText={setNewPassword}
              onBlur={() => { setNewFocused(false); validateNewPassword() }}
              onFocus={() => setNewFocused(true)}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              returnKeyType="next"
              placeholderTextColor="#8AA39B"
            />
            <TouchableOpacity
              onPress={() => setShowNew(v => !v)}
              style={styles.eyeBtn}
              hitSlop={8}
              accessibilityLabel={showNew ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={showNew ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#8AA39B"
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            At least 6 characters.
          </Text>
          {newPasswordError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{newPasswordError}</Text>
            </View>
          )}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>
            Confirm password <Text style={styles.asterisk}>*</Text>
          </Text>
          <View style={[
            styles.inputRow,
            confirmFocused && styles.inputRowFocused,
            confirmPasswordError && styles.inputRowError,
          ]}>
            <TextInput
              style={styles.inputInner}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onBlur={() => { setConfirmFocused(false); validateConfirmPassword() }}
              onFocus={() => setConfirmFocused(true)}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              placeholderTextColor="#8AA39B"
            />
            <TouchableOpacity
              onPress={() => setShowConfirm(v => !v)}
              style={styles.eyeBtn}
              hitSlop={8}
              accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#8AA39B"
              />
            </TouchableOpacity>
          </View>
          {confirmPasswordError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{confirmPasswordError}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.82}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator color="#D0B892" size="small" />
            : <Text style={styles.submitBtnText}>Update password</Text>
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
    paddingTop: 80,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  heading: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    fontWeight: '600',
    color: '#101826',
    marginBottom: 32,
  },
  successText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#8AA39B',
    lineHeight: 24,
    marginBottom: 32,
  },
  ctaBtn: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#101826',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#D0B892',
  },
  fieldBlock: { marginBottom: 24 },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#101826',
    marginBottom: 8,
  },
  asterisk: { color: '#101826' },
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
  hint: {
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
    marginBottom: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#D0B892',
  },
})
