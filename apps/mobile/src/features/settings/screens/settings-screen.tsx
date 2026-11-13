import { router } from 'expo-router';
import { type ReactNode } from 'react';

import { changeLanguage, useLanguage, useTranslation } from '@/core/i18n';
import { useServices, useShopContext } from '@/core/services';
import {
  Card,
  Icon,
  ListItem,
  Screen,
  ScreenHeader,
  SectionHeader,
  Select,
  showToast,
  Spinner,
} from '@/core/ui';
import { type LanguageCode, SUPPORTED_LANGUAGES } from '@/shared';

import { saveLanguage } from '../usecases';

interface SettingsScreenProps {
  /** Extra sections supplied by other features (backup, printer, account, plan). */
  children?: ReactNode;
}

export function SettingsScreen({ children }: SettingsScreenProps) {
  const { t } = useTranslation();
  const services = useServices();
  const app = useShopContext();
  const language = useLanguage();

  const selectLanguage = (next: LanguageCode) => {
    void changeLanguage(next);
    saveLanguage(services.db, next).catch(() => showToast(t('common.somethingWrong'), 'danger'));
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
      <SectionHeader title={t('settings.general')} />
      <Select
        label={t('settings.language')}
        value={language}
        options={SUPPORTED_LANGUAGES.map((code) => ({
          value: code,
          label: t(`settings.languages.${code}`),
        }))}
        onChange={selectLanguage}
        testID="settings-language"
      />
      <Card padding="none">
        <ListItem
          title={t('settings.shopProfile')}
          subtitle={`${app.shop.name} · ${t('settings.shopProfileHint')}`}
          leading={<Icon name="shop" tone="secondary" />}
          onPress={() => router.push('/settings/shop')}
          showChevron
          testID="settings-shop-profile"
        />
      </Card>
      {children}
    </Screen>
  );
}
