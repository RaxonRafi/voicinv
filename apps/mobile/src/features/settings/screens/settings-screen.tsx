import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';

import { changeLanguage, useLanguage, useTranslation } from '@/core/i18n';
import { useServices, useShopContext } from '@/core/services';
import { useSyncStore } from '@/core/sync';
import { useAppearance, applyAppearance } from '@/core/theme';
import { useUi } from '@/core/ui/use-ui';
import {
  Badge,
  Card,
  Divider,
  Icon,
  IconTile,
  ListItem,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Select,
  showToast,
  Spinner,
  SwitchField,
  Text,
} from '@/core/ui';
import { authenticate, changeLockSetting } from '@/features/security/lock-store';
import { getSecurityLockEnabled, isBiometricSupported, setSecurityLockEnabled } from '@/features/security/service';
import { usePrinterStore } from '@/features/printing/hooks/use-printer';
import { type LanguageCode, SUPPORTED_LANGUAGES } from '@/shared';

import { saveLanguage } from '../usecases';

interface SettingsScreenProps {
  children?: ReactNode;
}

export function SettingsScreen({ children }: SettingsScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUi();
  const services = useServices();
  const app = useShopContext();
  const language = useLanguage();
  const appearance = useAppearance();

  // App Lock state
  const [lockSupported, setLockSupported] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  // Sync state
  const signedIn = useSyncStore((state) => state.signedIn);
  const identifier = useSyncStore((state) => state.identifier);

  // Printer state
  const { connectedDevice, paperSize, setPaperSize, scan, scanning } = usePrinterStore();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([isBiometricSupported(), getSecurityLockEnabled(services.db)]).then(
      ([isSup, isEn]) => {
        if (cancelled) return;
        setLockSupported(isSup);
        setLockEnabled(isEn);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [services.db]);

  const selectLanguage = (next: LanguageCode) => {
    void changeLanguage(next);
    saveLanguage(services.db, next).catch(() => showToast(t('common.somethingWrong'), 'danger'));
  };

  const handleToggleLock = async () => {
    setLockBusy(true);
    try {
      const authenticated = await authenticate({
        prompt: t('security.unlockPrompt'),
        fallbackLabel: t('security.usePin'),
      });
      if (!authenticated) {
        showToast(t('security.authFailed'), 'danger');
        return;
      }
      const next = !lockEnabled;
      await setSecurityLockEnabled(services.db, next);
      changeLockSetting(next);
      setLockEnabled(next);
      showToast(next ? t('security.lockEnabled') : t('security.lockDisabled'), 'success');
    } catch {
      showToast(t('common.somethingWrong'), 'danger');
    } finally {
      setLockBusy(false);
    }
  };

  if (!app) {
    return (
      <Screen>
        <ScreenHeader title={t('settings.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen testID="settings-screen">
      <ScreenHeader title={t('settings.title')} />

      {/* SHOP */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          SHOP
        </Text>
        <Card padding="none" gap="none">
          <ListItem
            title={app.shop.name}
            subtitle="Name, phone, address, invoice numbers"
            leading={<IconTile letter={app.shop.name} tone="accent" />}
            onPress={() => router.push('/settings/shop')}
            showChevron
            testID="settings-shop-profile"
          />
          <Divider />
          <ListItem
            title="Language"
            trailing={
              <Text variant="body" tone="secondary">
                {language === 'bn' ? 'বাংলা' : 'English'}
              </Text>
            }
            leading={<IconTile icon="globe" />}
            onPress={() => selectLanguage(language === 'bn' ? 'en' : 'bn')}
            showChevron
            testID="settings-language"
          />
        </Card>
      </View>

      {/* APPEARANCE */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          APPEARANCE
        </Text>
        <SegmentedControl
          accessibilityLabel="Appearance"
          value={appearance}
          options={[
            { value: 'light', label: 'Light', icon: 'sun' },
            { value: 'dark', label: 'Dark', icon: 'moon' },
            { value: 'system', label: 'System', icon: 'device' },
          ]}
          onChange={applyAppearance}
        />
      </View>

      {/* ACCOUNT & SYNC */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          ACCOUNT & SYNC
        </Text>
        <Card padding="none" gap="none">
          <ListItem
            title="Backup online"
            subtitle="Use several phones or the web"
            leading={<IconTile icon="cloud" />}
            trailing={<Badge tone="neutral" label={signedIn ? 'On' : 'Off'} showIcon={false} />}
            onPress={() => router.push('/settings/account')}
            showChevron
            testID="settings-account"
          />
        </Card>
      </View>

      {/* RECEIPT PRINTER */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          RECEIPT PRINTER
        </Text>
        <Card padding="none" gap="none">
          <ListItem
            title="Printer"
            subtitle={connectedDevice ? connectedDevice.name : 'Not connected'}
            leading={<IconTile icon="printer" />}
          />
          <Divider />
          <ListItem
            title="Paper width"
            trailing={
              <Text variant="body" tone="secondary">
                {paperSize}
              </Text>
            }
            leading={<IconTile icon="paper" />}
            onPress={() => setPaperSize(paperSize === '58mm' ? '80mm' : '58mm')}
            showChevron
          />
          <Divider />
          <ListItem
            title="Find Bluetooth printers"
            leading={<Icon name="bluetooth" tone="link" size="md" />}
            onPress={() => void scan()}
          />
        </Card>
      </View>

      {/* SECURITY */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          SECURITY
        </Text>
        <Card padding="none" gap="none">
          <ListItem
            title="App lock"
            subtitle="Fingerprint or phone PIN on open"
            leading={<IconTile icon="lock" />}
            trailing={
              <SwitchField
                label="App lock"
                value={lockEnabled}
                onChange={() => void handleToggleLock()}
                disabled={lockBusy || !lockSupported}
                inline
              />
            }
          />
        </Card>
      </View>

      {/* BACKUPS */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          BACKUPS
        </Text>
        {children}
      </View>
    </Screen>
  );
}
