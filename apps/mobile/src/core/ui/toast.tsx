import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useTranslation } from '@/core/i18n';
import { boxShadow } from '@/core/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useUi } from './use-ui';

export type ToastTone = 'success' | 'danger' | 'info';

interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastState {
  current: ToastMessage | null;
  show: (text: string, tone: ToastTone) => void;
  dismiss: (id: number) => void;
}

// Transient UI state lives in Zustand; data never does (the database is the source of truth).
const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (text, tone) =>
    set((state) => ({ current: { id: (state.current?.id ?? 0) + 1, text, tone } })),
  dismiss: (id) => set((state) => (state.current?.id === id ? { current: null } : state)),
}));

/** Shows a short confirmation or error over the current screen. Callable from anywhere. */
export function showToast(text: string, tone: ToastTone = 'success'): void {
  useToastStore.getState().show(text, tone);
}

const TOAST_ICON: Record<ToastTone, IconName> = {
  success: 'checkCircle',
  danger: 'error',
  info: 'info',
};

/** How long a toast stays, in milliseconds. Long enough to read at a slow pace. */
const TOAST_DURATION = 5000;

/**
 * Renders the current toast. Mounted once at the root. The message is announced to screen
 * readers, disappears by itself and can be dismissed by tapping it.
 */
export function ToastHost() {
  const { theme } = useUi();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const current = useToastStore((state) => state.current);
  const dismiss = useToastStore((state) => state.dismiss);
  const id = current?.id;

  useEffect(() => {
    if (id === undefined) return undefined;
    const timer = setTimeout(() => dismiss(id), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [id, dismiss]);

  if (!current) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: insets.bottom + theme.spacing.xl,
        zIndex: theme.zIndex.toast,
      }}
    >
      <Pressable
        onPress={() => dismiss(current.id)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={current.text}
        accessibilityHint={t('ui.dismiss')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          minHeight: theme.size.touchTarget,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.xl,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.bg.raised,
          borderWidth: 1,
          borderColor: theme.colors.border.default,
          boxShadow: boxShadow(theme, 'lg'),
        }}
      >
        <Icon name={TOAST_ICON[current.tone]} tone={current.tone} />
        <Text flex>{current.text}</Text>
      </Pressable>
    </View>
  );
}
