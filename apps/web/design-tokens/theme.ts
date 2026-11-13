import {
  colors,
  elevation,
  fontFamily,
  motion,
  primitives,
  radius,
  size,
  spacing,
  typography,
  zIndex,
} from './generated/tokens';

export { contrastRatio, relativeLuminance } from './contrast';

/** Replaces literal token values with their primitive type so light and dark share one shape. */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : { readonly [K in keyof T]: Widen<T[K]> };

export type ColorScheme = 'light' | 'dark';

/** Semantic colors. Feature code must use these, never primitives (AGENTS.md §7.1). */
export type SemanticColors = Widen<typeof colors.light>;
export type ColorGroup = keyof SemanticColors;

export type TypographyVariant = keyof typeof typography;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type ElevationToken = keyof typeof elevation;

export interface Theme {
  readonly scheme: ColorScheme;
  readonly colors: SemanticColors;
  readonly fontFamily: typeof fontFamily;
  readonly typography: typeof typography;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly elevation: typeof elevation;
  readonly motion: typeof motion;
  readonly zIndex: typeof zIndex;
  readonly size: typeof size;
}

const shared = { fontFamily, typography, spacing, radius, elevation, motion, zIndex, size };

export const lightTheme: Theme = { scheme: 'light', colors: colors.light, ...shared };
export const darkTheme: Theme = { scheme: 'dark', colors: colors.dark, ...shared };

export function getTheme(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** Primitive palette. Only for design-system internals; feature code uses `Theme.colors`. */
export { primitives };
