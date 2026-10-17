import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export interface LuxuryToastRequest {
  id: number;
  message: string;
  thumbnailUri?: string;
  actionLabel?: string;
  onAction?: () => Promise<boolean | void>;
}

interface Props {
  toast: LuxuryToastRequest | null;
  bottom: number;
  reduceMotion: boolean;
  busy: boolean;
  onAction: () => void;
}

export default function LuxuryToast({ toast, bottom, reduceMotion, busy, onAction }: Props) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(22));
  const hasAction = Boolean(toast?.actionLabel && toast.onAction);
  useEffect(() => {
    if (!toast) return;
    opacity.setValue(reduceMotion ? 1 : 0);
    translateY.setValue(reduceMotion ? 0 : 22);
    AccessibilityInfo.announceForAccessibility(toast.message);
    if (!reduceMotion) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 190, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    }
  }, [toast, reduceMotion, opacity, translateY]);

  if (!toast) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      testID="luxury-toast"
      style={[styles.position, { bottom, opacity, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <BlurView intensity={70} tint="light" style={[styles.pill, hasAction && styles.undoPill]}>
        {toast.thumbnailUri ? (
          <Image source={{ uri: toast.thumbnailUri }} style={styles.thumbnail} accessibilityLabel="Saved garment" />
        ) : (
          <Ionicons name="checkmark-circle-outline" size={21} color={Colors.sage} />
        )}
        <Text accessibilityRole="text" style={styles.message} numberOfLines={2}>{toast.message}</Text>
        {toast.actionLabel && toast.onAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy
              ? (toast.actionLabel === 'Retry cleanup' ? 'Retrying photo cleanup' : 'Undoing')
              : toast.actionLabel}
            accessibilityHint="Available for five seconds"
            disabled={busy}
            hitSlop={6}
            onPress={onAction}
            style={[styles.action, hasAction && styles.undoAction]}
          >
            <Text style={[styles.actionText, hasAction && styles.undoActionText]}>
              {busy
                ? (toast.actionLabel === 'Retry cleanup' ? 'Retrying cleanup' : 'Undoing')
                : toast.actionLabel}
            </Text>
          </Pressable>
        )}
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 16, right: 16, zIndex: 999, alignItems: 'center' },
  pill: {
    width: '100%', maxWidth: 440, minHeight: 60, borderRadius: 20, borderWidth: 1,
    borderColor: Colors.glassBorder, backgroundColor: Colors.glassSurface,
    paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
    overflow: 'hidden',
  },
  undoPill: {
    backgroundColor: Colors.cardBackground,
    borderColor: Colors.border,
    shadowColor: Colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  thumbnail: { width: 40, height: 40, borderRadius: 11, backgroundColor: Colors.background },
  message: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19, color: Colors.textPrimary },
  action: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { fontFamily: 'Inter_600SemiBold', color: Colors.secondary, fontSize: 14 },
  undoAction: { borderRadius: 12, backgroundColor: Colors.primary, paddingHorizontal: 14 },
  undoActionText: { color: Colors.white },
});
