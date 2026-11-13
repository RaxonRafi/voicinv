import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type RadiusToken, type SpacingToken } from '@/core/theme';

import { useUi } from './use-ui';

const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
} as const;

const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
} as const;

export type Surface = 'canvas' | 'surface' | 'raised' | 'sunken';

export interface BoxProps {
  children?: ReactNode;
  direction?: 'row' | 'column';
  /** Space between children. Use this instead of margins. */
  gap?: SpacingToken;
  padding?: SpacingToken;
  paddingX?: SpacingToken;
  paddingY?: SpacingToken;
  align?: keyof typeof ALIGN;
  justify?: keyof typeof JUSTIFY;
  wrap?: boolean;
  /** Fill the remaining space of the parent. */
  flex?: boolean;
  background?: Surface;
  radius?: RadiusToken;
  border?: boolean;
  /** Group the children into one element for screen readers. */
  accessibilityLabel?: string;
  accessibilityRole?: 'summary' | 'header' | 'alert' | 'list' | 'none';
  testID?: string;
}

/**
 * Layout primitive. Spacing, radius and color come from design tokens only, so feature code
 * never writes numeric style values (AGENTS.md §7.2 rule 1).
 */
export function Box({
  children,
  direction = 'column',
  gap,
  padding,
  paddingX,
  paddingY,
  align,
  justify,
  wrap = false,
  flex = false,
  background,
  radius,
  border = false,
  accessibilityLabel,
  accessibilityRole,
  testID,
}: BoxProps) {
  const { theme } = useUi();
  const { spacing } = theme;
  const style: ViewStyle = {
    flexDirection: direction,
    ...(gap ? { gap: spacing[gap] } : null),
    ...(padding ? { padding: spacing[padding] } : null),
    ...(paddingX ? { paddingHorizontal: spacing[paddingX] } : null),
    ...(paddingY ? { paddingVertical: spacing[paddingY] } : null),
    ...(align ? { alignItems: ALIGN[align] } : null),
    ...(justify ? { justifyContent: JUSTIFY[justify] } : null),
    ...(wrap ? { flexWrap: 'wrap' } : null),
    ...(flex ? { flex: 1 } : null),
    ...(background ? { backgroundColor: theme.colors.bg[background] } : null),
    ...(radius ? { borderRadius: theme.radius[radius], borderCurve: 'continuous' } : null),
    ...(border
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border.default }
      : null),
  };
  return (
    <View
      style={style}
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** Horizontal Box that centers its children vertically and wraps at large text sizes. */
export function Row({ align = 'center', wrap = true, ...rest }: Omit<BoxProps, 'direction'>) {
  return <Box direction="row" align={align} wrap={wrap} {...rest} />;
}

export function Divider() {
  const { theme } = useUi();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border.default }}
    />
  );
}

export interface ScreenProps {
  children: ReactNode;
  /** Scroll the content (default). Set false when the screen is a single virtualized list. */
  scroll?: boolean;
  /** Pinned to the bottom, above the keyboard and the system navigation bar. */
  footer?: ReactNode;
  padded?: boolean;
  testID?: string;
}

/**
 * Root of every screen: canvas background, safe areas, keyboard avoidance and an optional
 * pinned footer for the primary action.
 */
export function Screen({ children, scroll = true, footer, padded = true, testID }: ScreenProps) {
  const { theme } = useUi();
  const insets = useSafeAreaInsets();
  const padding = padded ? theme.spacing.lg : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID={testID}
    >
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding,
            gap: theme.spacing.lg,
            paddingBottom: padding + (footer ? 0 : insets.bottom),
          }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding, gap: theme.spacing.lg }}>{children}</View>
      )}
      {footer ? (
        <View
          style={{
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.lg + insets.bottom,
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.bg.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.border.default,
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
