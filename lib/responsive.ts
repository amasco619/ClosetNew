import { Dimensions, PixelRatio } from 'react-native';

const BASE_WIDTH = 390;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCALE = SCREEN_WIDTH / BASE_WIDTH;

/**
 * Moderately scale a font size relative to the device screen width.
 *
 * factor = 0 → no scaling (identical to a hardcoded value)
 * factor = 1 → full proportional scaling
 * factor = 0.35 → gentle scaling (~10% swing across SE → Pro Max)
 *
 * Examples at factor 0.35:
 *   iPhone SE  (375pt): rs(12) → 11
 *   Base       (390pt): rs(12) → 12
 *   Pro Max    (430pt): rs(12) → 12
 *   Android XL (480pt): rs(12) → 13
 */
export function rs(size: number, factor = 0.35): number {
  const scaled = size + (SCALE - 1) * size * factor;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}
