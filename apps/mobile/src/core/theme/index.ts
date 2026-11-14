import { Platform, type TextStyle, useColorScheme } from 'react-native';
import { create } from 'zustand';

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

/** The user's choice in Settings → Appearance. `system` follows the phone's light/dark setting. */
export type Appearance = 'light' | 'dark' | 'system';

export const APPEARANCES: readonly Appearance[] = ['light', 'dark', 'system'];

export function isAppearance(value: string | null | undefined): value is Appearance {
  return APPEARANCES.some((appearance) => appearance === value);
}

// Transient UI state lives in Zustand. The choice itself is saved with the device settings
// and applied here at startup and whenever the user changes it.
const useAppearanceStore = create<{ appearance: Appearance }>(() => ({ appearance: 'system' }));

export function useAppearance(): Appearance {
  return useAppearanceStore((state) => state.appearance);
}

/** Switches the whole app to the chosen appearance at once. */
export function applyAppearance(appearance: Appearance): void {
  useAppearanceStore.setState({ appearance });
}

/**
 * The theme for the chosen appearance, or for the device's light/dark setting when the choice
 * is `system`. Both themes come from the same semantic tokens.
 */
export function useTheme(): Theme {
  const appearance = useAppearance();
  const system = useColorScheme();
  const scheme = appearance === 'system' ? system : appearance;
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** Text style of a typography token. The weight is carried by the font file, not `fontWeight`. */
export function textStyle(theme: Theme, variant: TypographyVariant, script: Script): TextStyle {
  const token = theme.typography[variant];
  return {
    fontFamily: fontFamily(token.fontWeight, script),
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    ...(token.tabularNums ? { fontVariant: ['tabular-nums'] } : {}),
    // Tracking is for Latin capitals only; it pulls Bengali conjuncts apart.
    ...(token.letterSpacing > 0 && script === 'latin'
      ? { letterSpacing: token.letterSpacing }
      : {}),
    ...(token.uppercase ? { textTransform: 'uppercase' } : {}),
  };
}

/** CSS-style box shadow of an elevation token (supported by React Native's new architecture). */
export function boxShadow(theme: Theme, level: ElevationToken): string | undefined {
  const token = theme.elevation[level];
  if (token.shadowOpacity === 0) return undefined;
  const blur = token.shadowRadius * 2;
  return `0 ${token.shadowOffset.height}px ${blur}px rgba(0, 0, 0, ${token.shadowOpacity})`;
}

/** The brand gradient of primary actions (buttons, the mic, selected segments, avatars). */
export function actionGradient(theme: Theme): string {
  const { primary, primaryEnd } = theme.colors.action;
  return `linear-gradient(120deg, ${primary} 0%, ${primaryEnd} 100%)`;
}

/** The soft gradient of summary cards (today's sales, report totals). */
export function heroGradient(theme: Theme): string {
  const { hero, heroEnd } = theme.colors.bg;
  return `linear-gradient(120deg, ${hero} 0%, ${heroEnd} 100%)`;
}

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** An opaque `#RRGGBB` token color at the given opacity. */
export function withAlpha(hex: string, alpha: number): string {
  const match = HEX_COLOR.exec(hex);
  if (!match) return hex;
  const [red, green, blue] = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Colored glow under a primary action, so it reads as the main thing to press. */
export function actionGlow(theme: Theme): string {
  const strength = theme.scheme === 'dark' ? 0.25 : 0.35;
  return `0 8px 20px ${withAlpha(theme.colors.action.primary, strength)}`;
}
