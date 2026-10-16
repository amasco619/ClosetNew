import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated'
import Colors from '@/constants/colors'
import { authErrorCopy, type AuthError, type AuthErrorAction } from '@/lib/authErrors'

export function AuthNotice({
  error,
  onAction,
  onLayout,
}: {
  error: AuthError
  onAction: (action: AuthErrorAction) => void
  onLayout?: (event: LayoutChangeEvent) => void
}) {
  const reduceMotion = useReducedMotion()
  const copy = authErrorCopy(error)
  useEffect(() => {
    if (!copy.informational) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    }
  }, [copy.informational, error.code])

  if (!copy.title) return null

  const isInfo = copy.informational

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(220)}
      onLayout={onLayout}
      style={[styles.panel, isInfo ? styles.infoPanel : styles.errorPanel]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${copy.title}. ${copy.message}`}
      testID="auth-notice"
    >
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[styles.iconBadge, isInfo ? styles.infoBadge : styles.errorBadge]}>
        <Ionicons
          name={isInfo ? 'information-circle-outline' : 'alert-circle-outline'}
          size={20}
          color={isInfo ? Colors.secondary : Colors.blush}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.message}>{copy.message}</Text>
        {copy.action && (
          <Pressable
            onPress={() => onAction(copy.action!)}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={copy.action === 'reset-password'
              ? 'Reset password'
              : copy.action === 'switch-to-sign-in'
                ? 'Sign in instead'
                : 'Try again'}
            testID={`auth-notice-${copy.action}`}
          >
            <Text style={styles.actionText}>
              {copy.action === 'reset-password'
                ? 'Reset password'
                : copy.action === 'switch-to-sign-in'
                  ? 'Sign in instead'
                  : 'Try again'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.secondary} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  infoPanel: {
    backgroundColor: Colors.glassSurfaceGold,
    borderColor: Colors.glassBorder,
  },
  errorPanel: {
    backgroundColor: Colors.glassSurface,
    borderColor: 'rgba(212,96,90,0.22)',
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoBadge: {
    backgroundColor: Colors.glassSurfaceGold,
    borderColor: Colors.glassBorder,
  },
  errorBadge: {
    backgroundColor: 'rgba(212,96,90,0.08)',
    borderColor: 'rgba(212,96,90,0.22)',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.textOnDark,
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(245,243,240,0.78)',
  },
  action: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
    paddingTop: 4,
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.secondary,
    textDecorationLine: 'underline',
    textDecorationColor: Colors.glassBorder,
  },
})
