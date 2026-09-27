import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';

export function AiProcessingConsent({
  visible,
  busy = false,
  privacyPolicyUrl,
  onAllow,
  onCancel,
}: {
  visible: boolean;
  busy?: boolean;
  privacyPolicyUrl?: string | null;
  onAllow: () => void;
  onCancel: () => void;
}) {
  const [learnMore, setLearnMore] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.accent} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>A NOTE ON YOUR PHOTOS</Text>
            <Text style={styles.title}>AI-powered wardrobe digitisation</Text>
            <Text style={styles.body}>
              To automatically identify and prepare your garment, your selected photo will be processed by Amodka and third-party AI services, including PhotoRoom and Google Gemini.
            </Text>
            <Text style={styles.body}>
              By allowing AI processing, you give Amodka permission to send the selected photo to these services for this purpose.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: learnMore }}
              onPress={() => setLearnMore(value => !value)}
              style={styles.learnMore}
            >
              <Text style={styles.learnMoreText}>{learnMore ? 'Less detail' : 'Learn more'}</Text>
              <Text style={styles.chevron}>{learnMore ? '−' : '+'}</Text>
            </Pressable>
            {learnMore && (
              <View style={styles.details}>
                <Text style={styles.detailTitle}>How your photo is used</Text>
                <Text style={styles.detailBody}>
                  PhotoRoom prepares the image, including background removal. Google Gemini identifies and classifies the garment.
                </Text>
                <Text style={styles.detailBody}>
                  The published Privacy Policy will provide fuller detail about processing purposes, retention, deletion and international transfers. Its destination will be linked here when available.
                </Text>
                {privacyPolicyUrl && (
                  <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(privacyPolicyUrl)}>
                    <Text style={styles.learnMoreText}>Read Privacy Policy</Text>
                  </Pressable>
                )}
              </View>
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onAllow}
              style={({ pressed }) => [styles.allowButton, pressed && !busy && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.allowText}>{busy ? 'Saving preference…' : 'Allow AI processing'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed && !busy && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(16, 24, 38, 0.56)',
  },
  sheet: {
    maxHeight: '88%',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accent: { height: 3, backgroundColor: Colors.secondary },
  content: { paddingHorizontal: 25, paddingTop: 26, paddingBottom: 8 },
  eyebrow: {
    color: Colors.sage,
    fontSize: 10,
    letterSpacing: 2.2,
    fontWeight: '600',
    marginBottom: 13,
  },
  title: {
    color: Colors.primary,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '600',
    marginBottom: 17,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 13,
  },
  learnMore: {
    minHeight: 46,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  learnMoreText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  chevron: { color: Colors.secondary, fontSize: 21 },
  details: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 13,
    gap: 7,
  },
  detailTitle: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  detailBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  actions: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20, gap: 10 },
  allowButton: {
    minHeight: 51,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowText: { color: Colors.secondary, fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  cancelButton: {
    minHeight: 51,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  cancelText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.74 },
  disabled: { opacity: 0.55 },
});