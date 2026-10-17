import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export type DialogTone = 'default' | 'destructive' | 'info';
export type DialogButtonTone = 'primary' | 'quiet' | 'destructive';

export interface LuxuryDialogButton {
  label: string;
  tone: DialogButtonTone;
  onPress?: () => void;
}

export interface LuxuryDialogRequest {
  id: number;
  kind: 'confirm' | 'notify' | 'alert';
  title: string;
  message?: string;
  icon?: string;
  buttons: LuxuryDialogButton[];
  outsideCancels: boolean;
}

interface Props {
  request: LuxuryDialogRequest | null;
  reduceMotion: boolean;
  onResolve: (index: number) => void;
}

export default function LuxuryDialog({ request, reduceMotion, onResolve }: Props) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.96));
  const closing = useRef(false);

  useEffect(() => {
    if (!request) return;
    closing.current = false;
    opacity.setValue(reduceMotion ? 1 : 0);
    scale.setValue(reduceMotion ? 1 : 0.96);
    if (!reduceMotion) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.spring(scale, { toValue: 1, damping: 19, stiffness: 230, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    }
    AccessibilityInfo.announceForAccessibility(request.title);
  }, [request, reduceMotion, opacity, scale]);

  const resolve = (index: number) => {
    if (!request || closing.current) return;
    closing.current = true;
    const button = request.buttons[index];
    if (index >= 0 && button?.tone !== 'quiet' && request.kind !== 'notify') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (reduceMotion) {
      onResolve(index);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(scale, { toValue: 0.96, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => onResolve(index));
  };

  const cancelIndex = request?.buttons.findIndex(button => button.tone === 'quiet') ?? -1;
  return (
    <Modal
      visible={request !== null}
      transparent
      statusBarTranslucent
      presentationStyle="overFullScreen"
      animationType="none"
      onRequestClose={() => resolve(cancelIndex)}
    >
      <View style={styles.stage}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={styles.scrim}
          onPress={request?.outsideCancels ? () => resolve(cancelIndex) : undefined}
        />
        {request && (
          <Animated.View
            accessibilityViewIsModal
            accessibilityRole="alert"
            accessibilityLabel={`${request.title}${request.message ? `. ${request.message}` : ''}`}
            style={[styles.card, { opacity, transform: [{ scale }] }]}
          >
            {request.icon && (
              <View style={styles.iconBadge}>
                <Ionicons name={request.icon as keyof typeof Ionicons.glyphMap} size={21} color={Colors.secondary} />
              </View>
            )}
            <Text style={styles.title}>{request.title}</Text>
            {request.message ? (
              <ScrollView style={styles.messageScroll} bounces={false}>
                <Text style={styles.message}>{request.message}</Text>
              </ScrollView>
            ) : null}
            <View style={styles.buttons}>
              {request.buttons.map((button, index) => (
                <Pressable
                  key={`${request.id}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={button.label}
                  testID={`luxury-dialog-button-${index}`}
                  onPress={() => resolve(index)}
                  style={({ pressed }) => [
                    styles.button,
                    button.tone === 'primary' && styles.primaryButton,
                    button.tone === 'destructive' && styles.destructiveButton,
                    button.tone === 'quiet' && styles.quietButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[
                    styles.buttonText,
                    button.tone === 'primary' && styles.primaryText,
                    button.tone === 'destructive' && styles.destructiveText,
                    button.tone === 'quiet' && styles.quietText,
                  ]}>{button.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: Colors.navyScrimMid },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    maxHeight: '86%',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.background,
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  iconBadge: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: Colors.glassBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontFamily: 'Inter_600SemiBold', color: Colors.textPrimary, fontSize: 21, lineHeight: 27 },
  messageScroll: { flexGrow: 0, maxHeight: 300, marginTop: 10 },
  message: { fontFamily: 'Inter_400Regular', color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  buttons: { gap: 10, marginTop: 22 },
  button: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButton: { backgroundColor: Colors.primary },
  destructiveButton: { borderWidth: 1, borderColor: Colors.error, backgroundColor: 'transparent' },
  quietButton: { backgroundColor: 'transparent' },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.textPrimary },
  primaryText: { color: Colors.white },
  destructiveText: { color: Colors.error },
  quietText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
