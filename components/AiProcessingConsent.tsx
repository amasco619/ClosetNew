import { useEffect, useState } from 'react';
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
  useEffect(() => {
    if (!visible) setLearnMore(false);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => { if (learnMore) setLearnMore(false); else onCancel(); }}
      statusBarTranslucent
    >
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.accent} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>A NOTE ON YOUR PHOTOS</Text>
            <Text style={styles.title}>AI-powered wardrobe digitisation</Text>
            <Text style={styles.body}>
              To automatically identify and prepare your garment, your selected photo will be processed by Amodka and third-party AI services, including <Text style={styles.bold}>PhotoRoom and Google Gemini</Text>.
            </Text>
            <Text style={styles.body}>
              By selecting <Text style={styles.bold}>Allow AI processing</Text>, you give Amodka permission to send your selected photo to these services for this purpose.
            </Text>
            <Text style={styles.body}>
              You can decline and continue without AI processing. You can withdraw this permission later in Settings.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: learnMore }}
              onPress={() => setLearnMore(value => !value)}
              style={styles.learnMore}
            >
              <Text style={styles.learnMoreText}>Learn more · Privacy Policy</Text>
              <Text style={styles.chevron}>{learnMore ? '−' : '+'}</Text>
            </Pressable>
            {learnMore && (
              <View style={styles.details}>
                <Text style={styles.detailTitle}>Why does Amodka need AI processing?</Text>
                <Text style={styles.detailBody}>
                  Amodka uses AI-powered services to help turn your clothing photos into digital wardrobe items.
                </Text>
                <Text style={styles.detailBody}>
                  When you allow AI processing, your selected garment photo is sent from Amodka to third-party service providers that process the photo on Amodka&apos;s behalf.
                </Text>
                <Text style={styles.detailTitle}>Which services process my photo?</Text>
                <Text style={styles.detailBody}>
                  <Text style={styles.bold}>PhotoRoom</Text>{'\n'}
                  PhotoRoom is used to prepare your garment image, including removing or replacing the background so that the garment can be digitised for your Amodka wardrobe.
                </Text>
                <Text style={styles.detailBody}>
                  <Text style={styles.bold}>Google Gemini</Text>{'\n'}
                  Google Gemini is used to analyse the garment and help identify characteristics such as its clothing type and other relevant attributes used by Amodka&apos;s wardrobe and styling features.
                </Text>
                <Text style={styles.detailTitle}>What information is sent?</Text>
                <Text style={styles.detailBody}>The selected photograph of your garment is sent for the AI processing described above.</Text>
                <Text style={styles.detailBody}>Amodka does not send your photo to these services for unrelated purposes.</Text>
                <Text style={styles.detailTitle}>Do I have to allow AI processing?</Text>
                <Text style={styles.detailBody}>No. You can decline AI processing.</Text>
                <Text style={styles.detailBody}>If you decline, Amodka will not send the selected photo to PhotoRoom or Google Gemini for this AI wardrobe-digitisation process.</Text>
                <Text style={styles.detailTitle}>Can I withdraw my permission?</Text>
                <Text style={styles.detailBody}>Yes. You can withdraw your AI-processing permission through the privacy settings in the Amodka app.</Text>
                <Text style={styles.detailBody}>Withdrawing permission does not affect processing that was lawfully carried out before you withdrew it.</Text>
                <Text style={styles.detailTitle}>How is my information handled?</Text>
                <Text style={styles.detailBody}>Amodka&apos;s Privacy Policy explains in more detail:</Text>
                <Text style={styles.detailBody}>
                  {'• what information Amodka collects;\n• how your wardrobe photographs are processed and stored;\n• which third parties receive personal information;\n• where information may be processed;\n• how long information is retained;\n• how information is deleted;\n• your privacy rights; and\n• how you can contact Amodka about your information.'}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityState={{ disabled: !privacyPolicyUrl }}
                  disabled={!privacyPolicyUrl}
                  onPress={() => { if (privacyPolicyUrl) void Linking.openURL(privacyPolicyUrl); }}
                  style={[styles.policyButton, !privacyPolicyUrl && styles.disabled]}
                >
                  <Text style={styles.learnMoreText}>View Privacy Policy</Text>
                </Pressable>
                {!privacyPolicyUrl && <Text style={styles.detailBody}>Privacy Policy link not yet available.</Text>}
                <Pressable accessibilityRole="button" onPress={() => setLearnMore(false)} style={styles.policyButton}>
                  <Text style={styles.learnMoreText}>Close</Text>
                </Pressable>
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
  bold: { fontWeight: '700' },
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
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 13,
    gap: 7,
  },
  detailTitle: { color: Colors.primary, fontSize: 14, fontWeight: '600', marginTop: 12 },
  detailBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  policyButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderColor: Colors.border, borderWidth: 1, borderRadius: 9, marginTop: 8 },
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