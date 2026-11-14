import { type ReactNode } from 'react';
import { type StyleProp, Text as NativeText, type TextStyle } from 'react-native';

import { textStyle, type Theme, type TypographyVariant } from '@/core/theme';

import { useUi } from './use-ui';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'disabled'
  | 'inverse'
  | 'onAction'
  | 'link'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'paid'
  | 'due'
  | 'cancelled';

export function toneColor(theme: Theme, tone: TextTone): string {
  const { colors } = theme;
  switch (tone) {
    case 'primary':
      return colors.text.primary;
    case 'secondary':
      return colors.text.secondary;
    case 'disabled':
      return colors.text.disabled;
    case 'inverse':
      return colors.text.inverse;
    case 'onAction':
      return colors.text.onAction;
    case 'link':
      return colors.text.link;
    case 'success':
      return colors.status.success;
    case 'warning':
      return colors.status.warning;
    case 'danger':
      return colors.status.danger;
    case 'info':
      return colors.status.info;
    case 'paid':
      return colors.money.paid;
    case 'due':
      return colors.money.due;
    case 'cancelled':
      return colors.money.cancelled;
  }
}

export interface TextProps {
  children: ReactNode;
  /** Typography token. Body text is 16, the accessibility minimum for running text. */
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  /** Stretch to fill the remaining row width (and wrap instead of overflowing). */
  flex?: boolean;
  strikethrough?: boolean;
  accessibilityRole?: 'header' | 'text' | 'alert';
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * The only way text is rendered. Uses the token type scale and the Noto font that matches the
 * interface language, and scales with the system font size up to 200% (AGENTS.md §7.2 rule 4).
 */
export function Text({
  children,
  variant = 'body',
  tone = 'primary',
  align,
  numberOfLines,
  flex = false,
  strikethrough = false,
  accessibilityRole,
  accessibilityLabel,
  testID,
  style,
}: TextProps) {
  const { theme, script } = useUi();
  return (
    <NativeText
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={2}
      testID={testID}
      style={[
        textStyle(theme, variant, script),
        { color: toneColor(theme, tone) },
        align ? { textAlign: align } : null,
        flex ? { flex: 1 } : null,
        strikethrough ? { textDecorationLine: 'line-through' } : null,
        style,
      ]}
    >
      {children}
    </NativeText>
  );
}
