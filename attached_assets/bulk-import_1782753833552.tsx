import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';

export default function BulkImportStudio() {
  const router = useRouter();

  const handleSelectBatch = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Hard Cap of 10 enforced strictly for aiLimiter (10/min) compliance (§9)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      // 0ms Instantaneous Screen Mount (Optimistic Latency Masking)
      router.push({
        pathname: '/bulk-review',
        params: { uris: JSON.stringify(result.assets.map(a => a.uri)) }
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.micro}>ATELIER INGESTION</Text>
      <Text style={styles.title}>Digitize Wardrobe</Text>
      <Text style={styles.sub}>Select up to 10 garments for instant zero-delay AI classification</Text>
      <Pressable onPress={handleSelectBatch} style={styles.btn}>
        <Text style={styles.btnText}>Choose Batch (Max 10) ──►</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24, justifyContent: 'center' },
  micro: { fontFamily: 'Inter_500Medium', fontSize: 10, color: Colors.secondary, letterSpacing: 4, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, color: Colors.primary, marginBottom: 8 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#666', marginBottom: 32, lineHeight: 20 },
  btn: { height: 56, backgroundColor: Colors.primary, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'Inter_700Bold', color: Colors.secondary, fontSize: 16 }
});
