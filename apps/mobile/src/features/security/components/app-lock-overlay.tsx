import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useTranslation } from '@/core/i18n';
import { useUi } from '@/core/ui/use-ui';
import { Button, Covered, Icon, Screen, Text } from '@/core/ui';

import { useBiometricLock } from '../hooks/use-biometric-lock';

/**
 * Covers the app while it is locked. The app underneath stays mounted, so returning from
 * another app never loses the screen the user was on or an invoice they were writing.
 */
export function AppLockOverlay({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { theme } = useUi();
  const { ready, isLocked, unlock } = useBiometricLock(
    t('security.unlockPrompt'),
    t('security.usePin'),
  );

  return (
    <Covered
      covered={isLocked}
      testID="app-lock-screen"
      cover={
        // Before the setting is read the cover stays blank: nothing to unlock yet.
        ready ? (
          <Screen safeTop padded={false}>
            <View
              style={{
                flex: 1,
                paddingHorizontal: theme.spacing['2xl'],
                paddingTop: theme.spacing['4xl'],
                paddingBottom: theme.spacing['2xl'],
                justifyContent: 'space-between',
              }}
            >
              <View style={{ gap: theme.spacing.xl }}>
                {/* Brand lock icon tile with glowing pill */}
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: theme.radius['2xl'],
                    backgroundColor: theme.colors.action.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(74, 222, 128, 0.45)',
                  }}
                >
                  <Icon name="lock" size="lg" tone="onAction" />
                </View>

                <View style={{ gap: theme.spacing.md }}>
                  <Text variant="hero">{t('common.appName')}</Text>
                  <Text variant="body" tone="secondary">
                    {t('security.authRequired')}
                  </Text>
                </View>
              </View>

              <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
                <Button
                  label={t('security.unlockButton')}
                  icon="fingerprint"
                  onPress={() => void unlock()}
                  testID="app-lock-unlock-button"
                />
                <Button
                  variant="ghost"
                  label={t('security.usePin')}
                  onPress={() => void unlock()}
                  testID="app-lock-pin-button"
                />
              </View>
            </View>
          </Screen>
        ) : null
      }
    >
      {children}
    </Covered>
  );
}
