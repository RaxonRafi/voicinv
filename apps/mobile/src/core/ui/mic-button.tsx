import { useEffect } from 'react';
import { AccessibilityInfo, Animated, Pressable, useAnimatedValue, View } from 'react-native';

import { useTranslation } from '@/core/i18n';

import { Icon } from './icon';
import { Text } from './text';
import { useUi } from './use-ui';

export interface MicButtonProps {
  /** True while the speech engine is recording. */
  listening: boolean;
  /** Called when the person presses down. */
  onStart: () => void;
  /** Called when the person lets go. */
  onStop: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * Hold-to-talk button, the entry point of voice billing.
 *
 * States: idle ("Hold to talk"), listening (darker fill, pulsing ring, "Listening…" text) and
 * disabled (muted, e.g. while speech recognition is unavailable). The state is always written
 * out below the button, not only shown by color or motion. The ring does not pulse when the
 * system asks for reduced motion. Screen-reader users, who cannot press and hold, toggle
 * listening with a double tap.
 */
export function MicButton({
  listening,
  onStart,
  onStop,
  disabled = false,
  testID,
}: MicButtonProps) {
  const { theme } = useUi();
  const { t } = useTranslation();
  const pulse = useAnimatedValue(0);
  const size = theme.size.touchTarget * 2;

  useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return undefined;
    }
    let animation: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      animation = Animated.loop(
        Animated.timing(pulse, {
          toValue: 1,
          duration: theme.motion.duration.slow * 4,
          useNativeDriver: true,
        }),
      );
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [listening, pulse, theme.motion.duration.slow]);

  const fill = disabled
    ? theme.colors.action.disabled
    : listening
      ? theme.colors.action.primaryPressed
      : theme.colors.action.primary;

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {listening ? (
          <Animated.View
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: theme.radius.full,
              borderWidth: 2,
              borderColor: theme.colors.action.primary,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) },
              ],
            }}
          />
        ) : null}
        <Pressable
          onPressIn={onStart}
          onPressOut={onStop}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={listening ? t('ui.micListening') : t('ui.micHold')}
          accessibilityHint={t('ui.micHint')}
          accessibilityState={{ disabled, busy: listening }}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName !== 'activate') return;
            if (listening) onStop();
            else onStart();
          }}
          testID={testID}
          style={{
            width: size,
            height: size,
            borderRadius: theme.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: fill,
          }}
        >
          <Icon name="mic" size="xl" tone={disabled ? 'disabled' : 'onAction'} />
        </Pressable>
      </View>
      <Text variant="bodyStrong" tone={disabled ? 'disabled' : 'primary'} align="center">
        {listening ? t('ui.micListening') : t('ui.micHold')}
      </Text>
    </View>
  );
}
