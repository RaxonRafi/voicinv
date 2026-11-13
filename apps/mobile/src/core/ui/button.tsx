import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { type Theme } from '@/core/theme';

import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';
import { useUi } from './use-ui';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Look {
  background: string;
  pressed: string;
  border: string | undefined;
  tone: TextTone;
}

function lookOf(theme: Theme, variant: ButtonVariant, disabled: boolean): Look {
  const { colors } = theme;
  if (disabled) {
    const filled = variant === 'primary' || variant === 'danger';
    return {
      background: filled ? colors.action.disabled : 'transparent',
      pressed: filled ? colors.action.disabled : 'transparent',
      border: variant === 'secondary' ? colors.border.default : undefined,
      tone: 'disabled',
    };
  }
  switch (variant) {
    case 'primary':
      return {
        background: colors.action.primary,
        pressed: colors.action.primaryPressed,
        border: undefined,
        tone: 'onAction',
      };
    case 'danger':
      return {
        background: colors.status.danger,
        pressed: colors.status.danger,
        border: undefined,
        tone: 'inverse',
      };
    case 'secondary':
      return {
        background: colors.bg.surface,
        pressed: colors.bg.sunken,
        border: colors.border.strong,
        tone: 'primary',
      };
    case 'ghost':
      return {
        background: 'transparent',
        pressed: colors.bg.sunken,
        border: undefined,
        tone: 'link',
      };
  }
}

export interface ButtonProps {
  /** The button's text. It is also its accessible name. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  /** Shows a spinner and ignores presses while an action is running. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Text button.
 *
 * States: default, pressed (darker fill), disabled (muted, not pressable), loading (spinner,
 * not pressable, announced as busy). Height is at least the 48dp touch target and grows with
 * large text. Takes a `label` string rather than children so text is always inside `Text`.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { theme } = useUi();
  const inactive = disabled || loading;
  const look = lookOf(theme, variant, disabled);

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: theme.size.touchTarget,
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? look.pressed : look.background,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        look.border ? { borderWidth: 1, borderColor: look.border } : null,
        pressed && variant === 'danger' ? styles.dimmed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.text[look.tone === 'onAction' ? 'onAction' : 'primary']}
        />
      ) : icon ? (
        <Icon name={icon} size="md" tone={look.tone} />
      ) : null}
      <Text variant="bodyStrong" tone={look.tone} align="center">
        {label}
      </Text>
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: IconName;
  /** Required: an icon alone has no name for screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  tone?: TextTone;
  disabled?: boolean;
  /** Draw a border, for stand-alone actions such as quantity steppers. */
  outlined?: boolean;
  testID?: string;
}

/**
 * Icon-only button with a 48dp touch target.
 * States: default, pressed (sunken background), disabled (muted icon).
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  tone = 'primary',
  disabled = false,
  outlined = false,
  testID,
}: IconButtonProps) {
  const { theme } = useUi();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          width: theme.size.touchTarget,
          height: theme.size.touchTarget,
          borderRadius: theme.radius.full,
          backgroundColor: pressed ? theme.colors.bg.sunken : 'transparent',
        },
        outlined ? { borderWidth: 1, borderColor: theme.colors.border.strong } : null,
      ]}
    >
      <View>
        <Icon name={icon} tone={disabled ? 'disabled' : tone} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  dimmed: { opacity: 0.85 },
});
