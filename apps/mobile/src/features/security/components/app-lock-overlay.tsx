import { type ReactNode, useEffect } from 'react';

import { useTranslation } from '@/core/i18n';
import { Box, Button, Card, Icon, Screen, Text } from '@/core/ui';

import { useBiometricLock } from '../hooks/use-biometric-lock';

export function AppLockOverlay({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isLocked, unlock } = useBiometricLock(t('security.unlockPrompt'));

  useEffect(() => {
    if (isLocked) {
      void unlock();
    }
  }, [isLocked, unlock]);

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <Screen testID="app-lock-screen">
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
  );
}
