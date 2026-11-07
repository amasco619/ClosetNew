import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';

export function LegalLinks({ tone = 'default' }: { tone?: 'default' | 'light' }) {
  const color = tone === 'light' ? '#FFFFFF' : Colors.primary;
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="link" onPress={() => router.push('/privacy-policy')}>
        <Text style={[styles.link, { color }]}>Privacy Policy</Text>
      </Pressable>
      <Text style={[styles.separator, { color }]}>·</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push('/terms-of-service')}>
        <Text style={[styles.link, { color }]}>Terms of Service</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 14 },
  link: { fontFamily: 'Inter_500Medium', fontSize: 13, textDecorationLine: 'underline' },
  separator: { fontSize: 14 },
});
