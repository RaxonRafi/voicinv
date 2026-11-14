import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { actionGlow, actionGradient, boxShadow, type Theme } from '@/core/theme';

import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';
import { useUi } from './use-ui';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Look {
  background: string;
  pressed: string;
  /** Painted over `background` while the button is not pressed. */
  gradient: string | undefined;
  tone: TextTone;
}

function lookOf(theme: Theme, variant: ButtonVariant, disabled: boolean): Look {
  const { colors } = theme;
  if (disabled) {
    const filled = variant !== 'ghost';
    return {
      background: filled ? colors.action.disabled : 'transparent',
      pressed: filled ? colors.action.disabled : 'transparent',
      gradient: undefined,
      tone: 'disabled',
    };
  }
  switch (variant) {
    case 'primary':
      return {
        background: colors.action.primary,
        pressed: colors.action.primaryPressed,
        gradient: actionGradient(theme),
        tone: 'onAction',
      };
    case 'danger':
      return {
        background: colors.status.danger,
        pressed: colors.status.danger,
        gradient: undefined,
        tone: 'inverse',
      };
    case 'secondary':
      return {
        background: colors.bg.sunken,
        pressed: colors.border.default,
        gradient: undefined,
        tone: 'primary',
      };
    case 'ghost':
      return {
        background: 'transparent',
        pressed: colors.bg.sunken,
        gradient: undefined,
        tone: 'link',
      };
  }
}

export interface ButtonProps {
  /** The button's text. It is also its accessible name. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `lg` (default) for screen actions; `md` for buttons inside rows and cards. */
  size?: 'md' | 'lg';
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
 * Variants: primary (brand gradient, one per screen area), secondary (tinted fill), danger and
 * ghost (text only). States: default, pressed (solid darker fill), disabled (muted, not
 * pressable), loading (spinner, not pressable, announced as busy). Height is at least the 48dp
 * touch target and grows with large text. Takes a `label` string rather than children so text
 * is always inside `Text`.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
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
  const large = size === 'lg';

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
          minHeight: large ? theme.size.control : theme.size.touchTarget,
          paddingHorizontal: large ? theme.spacing.xl : theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
          borderRadius: large ? theme.radius.xl : theme.radius.lg,
          backgroundColor: pressed ? look.pressed : look.background,
          backgroundImage: pressed ? undefined : look.gradient,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
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

export interface FabProps {
  /** The button's text. It is also its accessible name. */
  label: string;
  icon: IconName;
  onPress: () => void;
  testID?: string;
}

/**
 * Floating action button with a label: the one main action of a list screen ("New invoice",
 * "Add customer"). Place it with the `fab` slot of `Screen`, which keeps it above the content
 * and clear of the system navigation area.
 * States: default (brand gradient with a glow), pressed (solid darker fill).
 */
export function Fab({ label, icon, onPress, testID }: FabProps) {
  const { theme } = useUi();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: theme.size.control,
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
          borderRadius: theme.radius.xl,
          backgroundColor: pressed ? theme.colors.action.primaryPressed : theme.colors.action.primary,
          backgroundImage: pressed ? undefined : actionGradient(theme),
          boxShadow: actionGlow(theme),
        },
      ]}
    >
      <Icon name={icon} tone="onAction" />
      <Text variant="bodyStrong" tone="onAction">
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
  /**
   * `plain` (default) has no background; `surface` is a raised circle for actions in a screen
   * header; `accent` is a tinted circle that points at a highlighted action (voice).
   */
  variant?: 'plain' | 'surface' | 'accent';
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
  tone,
  variant = 'plain',
  disabled = false,
  outlined = false,
  testID,
}: IconButtonProps) {
  const { theme } = useUi();
  const { colors } = theme;
  const background =
    variant === 'surface' ? colors.bg.surface : variant === 'accent' ? colors.bg.accent : undefined;
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
          backgroundColor: pressed ? colors.bg.sunken : (background ?? 'transparent'),
          boxShadow: variant === 'surface' ? boxShadow(theme, 'sm') : undefined,
        },
        outlined ? { borderWidth: 1, borderColor: colors.border.strong } : null,
      ]}
    >
      <View>
        <Icon
          name={icon}
          tone={disabled ? 'disabled' : (tone ?? (variant === 'accent' ? 'link' : 'primary'))}
        />
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
