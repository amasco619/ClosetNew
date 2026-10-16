import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { isLightGarmentFamily, isTransparentGarmentImage } from '@/lib/garmentImage';

export type GarmentTileVariant = 'list' | 'grid' | 'preview' | 'card';

type GarmentTileProps = {
  uri: string;
  storagePath?: string | null;
  colorFamily?: string | null;
  variant: GarmentTileVariant;
  accessibilityLabel: string;
  isCutout?: boolean;
  recyclingKey?: string;
  onError?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const GarmentTile = memo(function GarmentTile({
  uri,
  storagePath,
  colorFamily,
  variant,
  accessibilityLabel,
  isCutout,
  recyclingKey,
  onError,
  style,
}: GarmentTileProps) {
  const reduceMotion = useReducedMotion();
  const cutout = isCutout ?? isTransparentGarmentImage(uri, storagePath);
  const lightGarment = isLightGarmentFamily(colorFamily);
  const studioColors = lightGarment
    ? [Colors.garmentStudioLightTop, Colors.garmentStudioLightBottom] as const
    : [Colors.garmentStudioTop, Colors.garmentStudioBottom] as const;
  const radius = variant === 'preview' ? 16 : variant === 'list' ? 12 : 10;

  return (
    <View style={[styles.frame, { borderRadius: radius }, style]}>
      <LinearGradient
        colors={studioColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {cutout && <View style={styles.floorShadow} pointerEvents="none" />}
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, cutout ? styles.cutoutImage : styles.originalImage]}
        contentFit={cutout ? 'contain' : 'cover'}
        transition={reduceMotion ? 0 : 300}
        recyclingKey={recyclingKey ?? uri}
        accessible
        accessibilityLabel={accessibilityLabel}
        onError={onError}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: Colors.garmentStudioBottom,
    borderWidth: 1,
    borderColor: Colors.garmentStudioBorder,
  },
  cutoutImage: {
    left: '11%',
    top: '8%',
    width: '78%',
    height: '78%',
  },
  originalImage: {
    width: '100%',
    height: '100%',
  },
  floorShadow: {
    position: 'absolute',
    left: '25%',
    bottom: '9%',
    width: '50%',
    height: 9,
    borderRadius: 99,
    backgroundColor: Colors.garmentStudioShadow,
  },
});
