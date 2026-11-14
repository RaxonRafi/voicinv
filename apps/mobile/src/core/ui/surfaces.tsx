import { type ReactNode, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  useAnimatedValue,
  View,
  type ViewStyle,
} from 'react-native';

import {
  actionGlow,
  actionGradient,
  boxShadow,
  heroGradient,
  type SpacingToken,
  type Theme,
  withAlpha,
} from '@/core/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';
import { useUi } from './use-ui';

export interface CardProps {
  children: ReactNode;
  padding?: SpacingToken;
  gap?: SpacingToken;
  /** `raised` adds a deeper shadow, for content that sits above the page. */
  elevation?: 'flat' | 'raised';
  /** `hero` is the soft brand gradient of a summary card (today's sales, report totals). */
  tone?: 'surface' | 'hero';
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
  tone = 'surface',
  onPress,
  accessibilityLabel,
  testID,
}: CardProps) {
  const { theme } = useUi();
  const hero = tone === 'hero';
  const base: ViewStyle = {
    padding: theme.spacing[padding],
    gap: theme.spacing[gap],
    borderRadius: theme.radius['2xl'],
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: hero ? theme.colors.bg.hero : theme.colors.bg.surface,
    backgroundImage: hero ? heroGradient(theme) : undefined,
    boxShadow: hero ? undefined : boxShadow(theme, elevation === 'raised' ? 'md' : 'sm'),
  };
  if (!onPress) {
    return (
      <View style={base} testID={testID}>
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
        pressed && !hero ? { backgroundColor: theme.colors.bg.sunken } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Where a row sits in a group of rows that together look like one card. */
export type ListItemGroup = 'only' | 'first' | 'middle' | 'last';

function groupStyle(theme: Theme, group: ListItemGroup): ViewStyle {
  const radius = theme.radius['2xl'];
  const top = group === 'only' || group === 'first' ? radius : 0;
  const bottom = group === 'only' || group === 'last' ? radius : 0;
  return {
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: bottom,
    borderBottomRightRadius: bottom,
    borderCurve: 'continuous',
    boxShadow: boxShadow(theme, 'sm'),
  };
}

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Shown before the text, e.g. an Avatar or IconTile. */
  leading?: ReactNode;
  /** Shown after the text, e.g. an amount or Badge. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Full description for screen readers when title + subtitle are not enough. */
  accessibilityLabel?: string;
  showChevron?: boolean;
  /**
   * Gives the row its own card surface, for rows of a virtualized list that are not inside a
   * `Card`: `only` is a card of its own; `first`/`middle`/`last` join into one card.
   */
  group?: ListItemGroup;
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
  group,
  testID,
}: ListItemProps) {
  const { theme } = useUi();
  const content = (
    <>
      {leading}
      <View style={{ flex: 1 }}>
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
  const resting = group ? theme.colors.bg.surface : 'transparent';
  const layout: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.size.touchTarget,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    ...(group ? groupStyle(theme, group) : null),
  };
  if (!onPress) {
    return (
      <View style={[layout, { backgroundColor: resting }]} testID={testID}>
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
        { backgroundColor: pressed ? theme.colors.bg.sunken : resting },
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

export interface IconTileProps {
  /** Shown in the tile. Give either an icon or a `letter`. */
  icon?: IconName;
  /** A name whose first letter is shown instead of an icon (products, the shop). */
  letter?: string;
  /**
   * `neutral` (default) is a quiet tinted tile; `accent` marks something positive; `action`
   * is the brand gradient, for the one thing a screen is about.
   */
  tone?: 'neutral' | 'accent' | 'action';
  shape?: 'square' | 'round';
  size?: 'md' | 'lg';
}

/**
 * Small tile with an icon or a letter, shown at the start of a row. Decorative: the row's text
 * always says what it is.
 */
export function IconTile({
  icon,
  letter,
  tone = 'neutral',
  shape = 'square',
  size = 'md',
}: IconTileProps) {
  const { theme } = useUi();
  const { colors } = theme;
  const side = size === 'lg' ? theme.spacing['4xl'] : theme.size.tile;
  const action = tone === 'action';
  const textTone: TextTone = action ? 'onAction' : tone === 'accent' ? 'success' : 'link';
  const bg =
    action
      ? colors.action.primary
      : tone === 'accent'
        ? colors.bg.accent
        : (theme.scheme === 'light' ? '#E6F4EA' : colors.bg.sunken);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: side,
        height: side,
        borderRadius:
          shape === 'round'
            ? theme.radius.full
            : size === 'lg'
              ? theme.radius.xl
              : theme.radius.lg,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        backgroundImage: action ? actionGradient(theme) : undefined,
        boxShadow: action && size === 'lg' ? actionGlow(theme) : undefined,
      }}
    >
      {icon ? (
        <Icon name={icon} size={size === 'lg' ? 'xl' : 'lg'} tone={textTone} />
      ) : (
        <Text variant="bodyStrong" tone={textTone}>
          {initialsOf(letter ?? '').slice(0, 1)}
        </Text>
      )}
    </View>
  );
}

/** Circle with a person's or shop's initials. Decorative: the name is always shown beside it. */
export function Avatar({ name }: { name: string }) {
  const { theme } = useUi();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 48,
        height: 48,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.action.primary,
      }}
    >
      <Text variant="heading" tone="onAction">
        {initialsOf(name).slice(0, 1)}
      </Text>
    </View>
  );
}

export interface SectionHeaderProps {
  title: string;
  /** `overline` (default) is a small capital label above a group; `heading` is a larger title. */
  variant?: 'overline' | 'heading';
  /** Short value at the trailing edge, e.g. the total of a day's invoices. */
  trailing?: string;
  action?: { label: string; onPress: () => void; testID?: string };
}

/** Heading of a group of content, with an optional value or action on the right. */
export function SectionHeader({
  title,
  variant = 'overline',
  trailing,
  action,
}: SectionHeaderProps) {
  const { theme } = useUi();
  const overline = variant === 'overline';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        paddingHorizontal: overline ? theme.spacing.xs : 0,
        minHeight: action ? theme.size.touchTarget : undefined,
      }}
    >
      <Text
        variant={overline ? 'overline' : 'heading'}
        tone={overline ? 'secondary' : 'primary'}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {trailing ? (
        <Text variant="overline" tone="secondary">
          {trailing}
        </Text>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="ghost"
          size="md"
          fullWidth={false}
          testID={action.testID}
        />
      ) : null}
    </View>
  );
}

export interface StatTileProps {
  label: string;
  value: string;
  tone?: TextTone;
  /** `card` (default) stands on the page; `onHero` sits inside a `hero` Card. */
  surface?: 'card' | 'onHero';
  testID?: string;
}

/** One figure with its label: "Collected ৳100". Stretches to share a row with other tiles. */
export function StatTile({
  label,
  value,
  tone = 'primary',
  surface = 'card',
  testID,
}: StatTileProps) {
  const { theme } = useUi();
  const { colors } = theme;
  const onHero = surface === 'onHero';
  // On the hero gradient the tile is a veil of the page color, so it works in both themes.
  const veil =
    theme.scheme === 'dark' ? withAlpha(colors.bg.canvas, 0.3) : withAlpha(colors.bg.surface, 0.6);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
      style={{
        flex: 1,
        // Tiles share a row; at large text sizes they wrap instead of squeezing the figures.
        minWidth: theme.spacing['4xl'] + theme.spacing.xl,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: onHero ? theme.spacing.md : theme.spacing.lg,
        borderRadius: onHero ? theme.radius.lg : theme.radius.xl,
        borderCurve: 'continuous',
        backgroundColor: onHero ? veil : colors.bg.surface,
        boxShadow: onHero ? undefined : boxShadow(theme, 'sm'),
      }}
    >
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text variant="amount" tone={tone}>
        {value}
      </Text>
    </View>
  );
}

export interface ProgressBarProps {
  /** Filled share, from 0 to 1. */
  value: number;
  /** `action` (default) is the brand gradient; `onHero` is plain, for use inside a hero Card. */
  tone?: 'action' | 'onHero';
  /** What the bar measures, for screen readers. */
  accessibilityLabel: string;
}

/** Horizontal bar showing a share of a whole. The numbers it stands for are shown as text too. */
export function ProgressBar({ value, tone = 'action', accessibilityLabel }: ProgressBarProps) {
  const { theme } = useUi();
  const { colors } = theme;
  const share = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const onHero = tone === 'onHero';
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      style={{
        height: theme.spacing.sm,
        borderRadius: theme.radius.full,
        overflow: 'hidden',
        backgroundColor: onHero ? withAlpha(colors.text.primary, 0.15) : colors.bg.sunken,
      }}
    >
      <View
        style={{
          width: `${share * 100}%`,
          height: theme.spacing.sm,
          borderRadius: theme.radius.full,
          backgroundColor: onHero ? colors.text.primary : colors.action.primary,
          backgroundImage: onHero ? undefined : actionGradient(theme),
        }}
      />
    </View>
  );
}

export interface LegendItemProps {
  label: string;
  /** `strong` matches the filled part of an `onHero` ProgressBar, `soft` the rest. */
  tone: 'strong' | 'soft';
}

/** Key for a ProgressBar inside a hero Card: a swatch and what it stands for. */
export function LegendItem({ label, tone }: LegendItemProps) {
  const { theme } = useUi();
  const { colors } = theme;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View
        style={{
          width: theme.spacing.md,
          height: theme.spacing.md,
          borderRadius: theme.spacing.xs,
          backgroundColor:
            tone === 'strong' ? colors.text.primary : withAlpha(colors.text.primary, 0.15),
        }}
      />
      <Text variant="label">{label}</Text>
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
      <IconTile icon={icon} shape="round" size="lg" />
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
      <ActivityIndicator size="large" color={theme.colors.text.link} />
      <Text tone="secondary">{label}</Text>
    </View>
  );
}
