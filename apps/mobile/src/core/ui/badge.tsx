import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useTranslation } from '@/core/i18n';
import { type Theme } from '@/core/theme';
import { LOW_CONFIDENCE_THRESHOLD } from '@/shared';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';
import { useUi } from './use-ui';

export type BadgeTone =
  'paid' | 'partlyPaid' | 'due' | 'cancelled' | 'info' | 'warning' | 'neutral';

interface BadgeLook {
  icon: IconName;
  tone: TextTone;
  background: string;
}

function badgeLook(theme: Theme, tone: BadgeTone): BadgeLook {
  const { status, bg } = theme.colors;
  switch (tone) {
    case 'paid':
      return { icon: 'check', tone: 'success', background: status.successBg };
    case 'partlyPaid':
      return { icon: 'clock', tone: 'warning', background: status.warningBg };
    case 'due':
      return { icon: 'error', tone: 'danger', background: status.dangerBg };
    case 'cancelled':
      return { icon: 'ban', tone: 'cancelled', background: bg.sunken };
    case 'info':
      return { icon: 'info', tone: 'info', background: status.infoBg };
    case 'warning':
      return { icon: 'alert', tone: 'warning', background: status.warningBg };
    case 'neutral':
      return { icon: 'info', tone: 'secondary', background: bg.sunken };
  }
}

export interface BadgeProps {
  tone: BadgeTone;
  label: string;
  /** Hide the icon when the badge is a plain value ("Off") rather than a status. */
  showIcon?: boolean;
}

/**
 * Short status label (Paid / Partly paid / Due / Cancelled, …). Each tone has its own icon and
 * always shows text, so status is never conveyed by color alone (AGENTS.md §7.2 rule 3).
 */
export function Badge({ tone, label, showIcon = true }: BadgeProps) {
  const { theme } = useUi();
  const look = badgeLook(theme, tone);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: look.background,
      }}
    >
      {showIcon ? <Icon name={look.icon} size="sm" tone={look.tone} /> : null}
      <Text variant="label" tone={look.tone}>
        {label}
      </Text>
    </View>
  );
}

export interface ConfidenceHighlightProps {
  /** Parser confidence for the wrapped field, from 0 to 1. */
  confidence: number;
  children: ReactNode;
}

/**
 * Marks a voice-draft field the parser was unsure about (confidence below 0.75) with a tinted
 * frame, a warning icon and a "please check" message. Confident fields render unchanged.
 */
export function ConfidenceHighlight({ confidence, children }: ConfidenceHighlightProps) {
  const { theme } = useUi();
  const { t } = useTranslation();
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return <>{children}</>;
  return (
    <View
      accessibilityHint={t('ui.lowConfidence')}
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.xl,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.confidence.low,
        backgroundColor: theme.colors.confidence.lowBg,
      }}
    >
      {children}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Icon name="alert" size="sm" tone="warning" />
        <Text variant="label" tone="warning">
          {t('ui.checkThis')}
        </Text>
      </View>
    </View>
  );
}

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const BANNER_ICON: Record<BannerTone, IconName> = {
  info: 'info',
  warning: 'alert',
  danger: 'error',
  success: 'checkCircle',
};

export interface BannerProps {
  tone: BannerTone;
  title: string;
  message?: string;
  /** Overrides the tone's default icon, e.g. `offline`. */
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}

/** Persistent message at the top of a screen: offline notice, backup reminder, plan limit. */
export function Banner({ tone, title, message, icon, action }: BannerProps) {
  const { theme } = useUi();
  const background = theme.colors.status[`${tone}Bg`];
  return (
    <View
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : 'summary'}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.xl,
        borderCurve: 'continuous',
        backgroundColor: background,
      }}
    >
      <Icon name={icon ?? BANNER_ICON[tone]} tone={tone} />
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text variant="bodyStrong">{title}</Text>
        {message ? <Text>{message}</Text> : null}
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            variant="ghost"
            size="md"
            fullWidth={false}
          />
        ) : null}
      </View>
    </View>
  );
}
