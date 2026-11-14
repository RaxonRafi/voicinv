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
  | 'paid'
  | 'partlyPaid'
  | 'due'
  | 'cancelled'
  | 'info'
  | 'warning'
  | 'neutral';

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
  showIcon?: boolean;
}

export function Badge({ tone, label, showIcon = true }: BadgeProps) {
  const { theme } = useUi();
  const look = badgeLook(theme, tone);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
        borderRadius: theme.radius.full,
        backgroundColor: look.background,
      }}
    >
      {showIcon ? <Icon name={look.icon} size="sm" tone={look.tone} /> : null}
      <Text variant="captionStrong" tone={look.tone}>
        {label}
      </Text>
    </View>
  );
}

export type BannerTone = 'info' | 'warning' | 'danger';

export interface BannerProps {
  tone?: BannerTone;
  icon?: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}

export function Banner({ tone = 'info', icon, title, message, action }: BannerProps) {
  const { theme } = useUi();
  const { status } = theme.colors;
  const bg = tone === 'danger' ? status.dangerBg : tone === 'warning' ? status.warningBg : status.infoBg;
  const iconTone: TextTone = tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info';
  const defaultIcon = tone === 'danger' ? 'error' : tone === 'warning' ? 'alert' : 'info';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: bg,
      }}
    >
      <Icon name={icon ?? defaultIcon} tone={iconTone} size="md" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {message ? (
          <Text variant="caption" tone="secondary">
            {message}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="ghost" size="md" fullWidth={false} />
      ) : null}
    </View>
  );
}

export interface ConfidenceHighlightProps {
  confidence: number;
  children: ReactNode;
}

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Icon name="alert" size="sm" tone="warning" />
        <Text variant="label" tone="warning">
          {t('ui.checkThis')}
        </Text>
      </View>
      {children}
    </View>
  );
}
