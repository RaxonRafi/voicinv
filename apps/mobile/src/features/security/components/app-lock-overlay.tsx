import { type ReactNode } from 'react';

import { useTranslation } from '@/core/i18n';
import { Box, Button, Card, Covered, Icon, Screen, Text } from '@/core/ui';

import { useBiometricLock } from '../hooks/use-biometric-lock';

/**
 * Covers the app while it is locked. The app underneath stays mounted, so returning from
 * another app never loses the screen the user was on or an invoice they were writing.
 */
export function AppLockOverlay({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
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
          <Screen>
            <Box flex align="center" justify="center" gap="lg" padding="xl">
              <Card elevation="raised" padding="xl" gap="md">
                <Box align="center" gap="md">
                  <Icon name="lock" size="xl" tone="primary" />
                  <Text variant="title" align="center">
                    {t('common.appName')}
                  </Text>
                  <Text tone="secondary" align="center">
                    {t('security.authRequired')}
                  </Text>
                  <Button
                    label={t('security.unlockButton')}
                    icon="lock"
                    onPress={() => void unlock()}
                    testID="app-lock-unlock-button"
                  />
                </Box>
              </Card>
            </Box>
          </Screen>
        ) : null
      }
    >
      {children}
    </Covered>
  );
}
