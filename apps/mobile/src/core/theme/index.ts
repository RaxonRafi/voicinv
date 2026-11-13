import { Platform, type TextStyle, useColorScheme } from 'react-native';

import {
  darkTheme,
  type ElevationToken,
  lightTheme,
  type RadiusToken,
  type SpacingToken,
  type Theme,
  type TypographyVariant,
} from '@tokens/theme';

export type { ElevationToken, RadiusToken, SpacingToken, Theme, TypographyVariant };
export type ColorScheme = Theme['scheme'];

/** Which writing system the interface language uses; picks the matching Noto font. */
export type Script = 'latin' | 'bengali';

type Weight = '400' | '500' | '600' | '700';

// The fonts are embedded at build time by the expo-font config plugin (app.json). Android
// addresses an embedded font by its file name, iOS by its PostScript name.
const FONT_FILES: Record<Script, Record<Weight, { android: string; ios: string }>> = {
  latin: {
    '400': { android: 'NotoSans_400Regular', ios: 'NotoSans-Regular' },
    '500': { android: 'NotoSans_500Medium', ios: 'NotoSans-Medium' },
    '600': { android: 'NotoSans_600SemiBold', ios: 'NotoSans-SemiBold' },
    '700': { android: 'NotoSans_700Bold', ios: 'NotoSans-Bold' },
  },
  bengali: {
    '400': { android: 'NotoSansBengali_400Regular', ios: 'NotoSansBengali-Regular' },
    '500': { android: 'NotoSansBengali_500Medium', ios: 'NotoSansBengali-Medium' },
    '600': { android: 'NotoSansBengali_600SemiBold', ios: 'NotoSansBengali-SemiBold' },
    '700': { android: 'NotoSansBengali_700Bold', ios: 'NotoSansBengali-Bold' },
  },
};

function isWeight(value: string): value is Weight {
  return value === '400' || value === '500' || value === '600' || value === '700';
}

export function fontFamily(weight: string, script: Script): string {
  const files = FONT_FILES[script][isWeight(weight) ? weight : '400'];
  return Platform.OS === 'ios' ? files.ios : files.android;
}

/** The theme for the device's light/dark setting. Both come from the same semantic tokens. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/** Text style of a typography token. The weight is carried by the font file, not `fontWeight`. */
export function textStyle(theme: Theme, variant: TypographyVariant, script: Script): TextStyle {
  const token = theme.typography[variant];
  return {
    fontFamily: fontFamily(token.fontWeight, script),
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    ...(token.tabularNums ? { fontVariant: ['tabular-nums'] } : {}),
  };
}

/** CSS-style box shadow of an elevation token (supported by React Native's new architecture). */
export function boxShadow(theme: Theme, level: ElevationToken): string | undefined {
  const token = theme.elevation[level];
  if (token.shadowOpacity === 0) return undefined;
  const blur = token.shadowRadius * 2;
  return `0 ${token.shadowOffset.height}px ${blur}px rgba(0, 0, 0, ${token.shadowOpacity})`;
}
