/**
 * AuraCloset Theme Color Tokens
 * Quiet Luxury Palette — authoritative technical specification (§2 & §12)
 */

export const Colors = {
  primary: '#101826',      // Deep Navy — primary dark canvas & text
  secondary: '#D0B892',    // Champagne Gold — brand accents, specular borders, primary highlights
  sage: '#8AA39B',         // Sage — secondary accents, guest links, subtle indicators
  blush: '#EACFD3',        // Blush — warm tertiary highlights
  background: '#F5F3F0',   // Warm off-white background
  
  // Scrims & Glass
  navyScrimTop: 'rgba(16, 24, 38, 0.35)',
  navyScrimMid: 'rgba(16, 24, 38, 0.70)',
  navyScrimBottom: 'rgba(16, 24, 38, 0.96)',
  
  // Borders & Surface
  glassBorder: 'rgba(208, 184, 146, 0.35)', // Champagne gold hairline
  glassSurface: 'rgba(255, 255, 255, 0.10)',
  border: 'rgba(16, 24, 38, 0.08)',
  textLight: '#FFFFFF',
  textMuted: 'rgba(255, 255, 255, 0.70)',
} as const;
