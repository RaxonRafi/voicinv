import { useEffect, useState } from 'react';

import { useTranslation } from '@/core/i18n';
import { useServices } from '@/core/services';
import { Box, Button, Card, Icon, ListItem, SectionHeader, showToast } from '@/core/ui';

import {
  authenticateWithBiometrics,
  getSecurityLockEnabled,
  isBiometricSupported,
  setSecurityLockEnabled,
} from '../service';

export function SecuritySettingsSection() {
  const { t } = useTranslation();
  const services = useServices();

  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([isBiometricSupported(), getSecurityLockEnabled(services.db)]).then(
      ([isSup, isEn]) => {
        if (cancelled) return;
        setSupported(isSup);
        setEnabled(isEn);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [services.db]);

  const handleToggle = async () => {
    setBusy(true);
    try {
      const authenticated = await authenticateWithBiometrics(t('security.unlockPrompt'));
      if (!authenticated) {
        showToast(t('security.authFailed'), 'danger');
        return;
      }

      const next = !enabled;
      await setSecurityLockEnabled(services.db, next);
      setEnabled(next);
      showToast(next ? t('security.lockEnabled') : t('security.lockDisabled'), 'success');
    } catch {
      showToast(t('common.somethingWrong'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box gap="sm">
      <SectionHeader title={t('security.title')} />
      <Card padding="none" gap="none">
        <ListItem
          title={t('security.lockTitle')}
          subtitle={
            supported
              ? enabled
                ? t('security.lockEnabled')
                : t('security.lockDisabled')
              : t('security.notAvailable')
          }
          leading={<Icon name="lock" tone="secondary" />}
          trailing={
            supported ? (
              <Button
                variant={enabled ? 'secondary' : 'primary'}
                label={enabled ? t('security.disable') : t('security.enable')}
                onPress={() => void handleToggle()}
                loading={busy}
                testID="security-lock-toggle"
              />
            ) : undefined
          }
          testID="security-lock-row"
        />
      </Card>
    </Box>
  );
}
