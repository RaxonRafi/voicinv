import { router, Stack } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '@/core/i18n';

import { IconButton } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useUi } from './use-ui';

export interface ScreenHeaderProps {
  title: string;
  /** Small line above the title, e.g. today's date above the shop name. */
  eyebrow?: string;
  /** Actions shown at the trailing edge of the header, e.g. an IconButton. */
  right?: ReactNode;
  /**
   * Top-level screen (a bottom tab): a large title and no back button. Other screens show a
   * back button before the title.
   */
  large?: boolean;
  /** Hide the header entirely (onboarding, lock screen). */
  hidden?: boolean;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** The header as it is drawn; `ScreenHeader` hands it to the navigator. */
function HeaderBar({ title, eyebrow, right, large = false }: Omit<ScreenHeaderProps, 'hidden'>) {
  const { theme } = useUi();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
        paddingLeft: large ? theme.spacing.lg : theme.spacing.xs,
        paddingRight: theme.spacing.lg,
        backgroundColor: theme.colors.bg.canvas,
      }}
    >
      {large ? null : (
        <IconButton
          icon="back"
          accessibilityLabel={t('common.back')}
          onPress={goBack}
          testID="header-back"
        />
      )}
      <View style={{ flex: 1, minHeight: theme.size.touchTarget, justifyContent: 'center' }}>
        {eyebrow ? (
          <Text variant="label" tone="secondary">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant={large && !eyebrow ? 'display' : 'title'} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/**
 * Sets the header of the current screen. Rendered inside a screen component, so the translated
 * title and header actions live with the screen instead of the route file. The navigator draws
 * it above the screen, so it stays in place while the content scrolls.
 */
export function ScreenHeader({ title, eyebrow, right, large, hidden = false }: ScreenHeaderProps) {
  return (
    <Stack.Screen
      options={{
        title,
        headerShown: !hidden,
        header: () => <HeaderBar title={title} eyebrow={eyebrow} right={right} large={large} />,
      }}
    />
  );
}

export interface TabBarItem {
  key: string;
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * Bottom navigation between the top-level areas of the app. Every tab shows an icon and a
 * label; the active one also has a tinted pill and is announced as selected, so the state is
 * never shown by color alone.
 */
export function TabBar({ items }: { items: readonly TabBarItem[] }) {
  const { theme } = useUi();
  const insets = useSafeAreaInsets();
  const { colors } = theme;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.sm + insets.bottom,
        paddingHorizontal: theme.spacing.xs,
        backgroundColor: colors.bg.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border.default,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: item.active }}
          testID={item.testID}
          style={{
            flex: 1,
            alignItems: 'center',
            gap: theme.spacing.xs,
            minHeight: theme.size.touchTarget,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: theme.spacing['4xl'],
              height: theme.spacing['2xl'],
              borderRadius: theme.radius.full,
              backgroundColor: item.active ? colors.bg.accent : 'transparent',
            }}
          >
            <Icon name={item.icon} tone={item.active ? 'link' : 'secondary'} />
          </View>
          <Text
            variant={item.active ? 'captionStrong' : 'caption'}
            tone={item.active ? 'primary' : 'secondary'}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
