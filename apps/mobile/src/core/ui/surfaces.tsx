import { type ReactNode, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  useAnimatedValue,
  View,
} from 'react-native';

import { boxShadow, type SpacingToken } from '@/core/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useUi } from './use-ui';

export interface CardProps {
  children: ReactNode;
  padding?: SpacingToken;
  gap?: SpacingToken;
  /** `raised` adds a shadow, for content that sits above the page. */
  elevation?: 'flat' | 'raised';
  /** Makes the whole card a button. Needs `accessibilityLabel`. */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Surface that groups related content.
 * States: default; when pressable: pressed (sunken background).
 */
export function Card({
  children,
  padding = 'lg',
  gap = 'md',
  elevation = 'flat',
  onPress,
  accessibilityLabel,
  testID,
}: CardProps) {
  const { theme } = useUi();
  const base = {
    padding: theme.spacing[padding],
    gap: theme.spacing[gap],
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.default,
    boxShadow: elevation === 'raised' ? boxShadow(theme, 'md') : undefined,
  };
  if (!onPress) {
    return (
      <View style={[base, { backgroundColor: theme.colors.bg.surface }]} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [
        base,
        { backgroundColor: pressed ? theme.colors.bg.sunken : theme.colors.bg.surface },
      ]}
    >
      {children}
    </Pressable>
  );
}

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Shown before the text, e.g. an Avatar or Icon. */
  leading?: ReactNode;
  /** Shown after the text, e.g. an amount or Badge. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Full description for screen readers when title + subtitle are not enough. */
  accessibilityLabel?: string;
  showChevron?: boolean;
  testID?: string;
}

/**
 * Row in a list.
 * States: default, pressed (sunken background) when pressable. At least 48dp tall; the text
 * wraps instead of truncating at large font sizes.
 */
export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  showChevron = false,
  testID,
}: ListItemProps) {
  const { theme } = useUi();
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="label" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? <Icon name="chevronRight" size="md" tone="secondary" /> : null}
    </>
  );
  const layout = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.md,
    minHeight: theme.size.touchTarget,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  };
  if (!onPress) {
    return (
      <View style={layout} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      testID={testID}
      style={({ pressed }) => [
        layout,
        { backgroundColor: pressed ? theme.colors.bg.sunken : 'transparent' },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** First letters of up to two words, for avatars. Works for any script. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Circle with a person's or shop's initials. Decorative: the name is always shown beside it. */
export function Avatar({ name }: { name: string }) {
  const { theme } = useUi();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: theme.size.touchTarget,
        height: theme.size.touchTarget,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.successBg,
      }}
    >
      <Text variant="bodyStrong" tone="success">
        {initialsOf(name)}
      </Text>
    </View>
  );
}

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

/** Heading of a group of content, with an optional action on the right. */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  const { theme } = useUi();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        minHeight: theme.size.touchTarget,
      }}
    >
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="ghost" fullWidth={false} />
      ) : null}
    </View>
  );
}

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
}

/** Shown instead of an empty list: says what belongs here and offers the first action. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  const { theme } = useUi();
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.xl }}>
      <Icon name={icon} size="xl" tone="secondary" />
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="secondary" align="center">
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          fullWidth={false}
        />
      ) : null}
    </View>
  );
}

/** Placeholder block shown while content loads. Pulses unless the system reduces motion. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  const { theme } = useUi();
  const opacity = useAnimatedValue(1);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: theme.motion.duration.slow * 3,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: theme.motion.duration.slow * 3,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, theme.motion.duration.slow]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={{ gap: theme.spacing.md, opacity }}
    >
      {Array.from({ length: lines }, (_unused, index) => (
        <View
          key={index}
          style={{
            height: theme.spacing.xl,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.bg.sunken,
          }}
        />
      ))}
    </Animated.View>
  );
}

/** Centered activity indicator with an accessible label. */
export function Spinner({ label }: { label: string }) {
  const { theme } = useUi();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.xl }}
    >
      <ActivityIndicator size="large" color={theme.colors.action.primary} />
      <Text tone="secondary">{label}</Text>
    </View>
  );
}
