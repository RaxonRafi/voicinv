import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';

import { applyFieldError, FormSelect, FormTextField } from '@/core/forms';
import { changeLanguage, useLanguage, useTranslation } from '@/core/i18n';
import { useServices } from '@/core/services';
import { Banner, Box, Button, Screen, ScreenHeader, showToast, Text } from '@/core/ui';
import { CURRENCIES, DEFAULT_CURRENCY, SUPPORTED_LANGUAGES } from '@/shared';

import { SHOP_TYPES } from '../templates';
import { completeOnboarding, type OnboardingInput, onboardingInputSchema } from '../usecases';

const CURRENCY_OPTIONS = Object.entries(CURRENCIES).map(([code, info]) => ({
  value: code,
  label: `${code} (${info.symbol})`,
}));

/** First launch: creates the shop on this device. No account, no network. */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const services = useServices();
  const language = useLanguage();
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingInputSchema),
    defaultValues: {
      shopName: '',
      phone: '',
      address: '',
      language,
      currencyCode: DEFAULT_CURRENCY,
      shopType: 'grocery',
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await completeOnboarding(
        {
          db: services.db,
          now: services.now,
          newId: services.newId,
          deviceId: services.device.deviceId,
        },
        values,
      );
      router.replace('/');
    } catch (error) {
      if (!applyFieldError(error, setError, ['shopName', 'phone'])) {
        showToast(t('common.somethingWrong'), 'danger');
      }
    }
  });

  return (
    <Screen
      testID="onboarding-screen"
      footer={
        <Button
          label={t('onboarding.start')}
          onPress={() => void submit()}
          loading={isSubmitting}
          testID="onboarding-submit"
        />
      }
    >
      <ScreenHeader title={t('common.appName')} hidden />
      <Box gap="sm" paddingY="lg">
        <Text variant="display" accessibilityRole="header">
          {t('onboarding.title')}
        </Text>
        <Text tone="secondary">{t('onboarding.subtitle')}</Text>
      </Box>
      <Banner tone="info" icon="shield" title={t('onboarding.privacy')} />

      <FormSelect
        control={control}
        name="language"
        label={t('onboarding.language')}
        options={SUPPORTED_LANGUAGES.map((code) => ({
          value: code,
          label: t(`settings.languages.${code}`),
        }))}
        onValueChange={(value) => void changeLanguage(value)}
        testID="onboarding-language"
      />
      <FormTextField
        control={control}
        name="shopName"
        label={t('onboarding.shopName')}
        hint={t('onboarding.shopNameHint')}
        autoCapitalize="words"
        testID="onboarding-shop-name"
      />
      <FormTextField
        control={control}
        name="phone"
        label={t('onboarding.phone')}
        optional
        keyboardType="phone-pad"
        autoComplete="tel"
        testID="onboarding-phone"
      />
      <FormTextField
        control={control}
        name="address"
        label={t('onboarding.address')}
        optional
        multiline
      />
      <FormSelect
        control={control}
        name="shopType"
        label={t('onboarding.shopType')}
        options={SHOP_TYPES.map((type) => ({ value: type, label: t(`onboarding.types.${type}`) }))}
      />
      <Text variant="caption" tone="secondary">
        {t('onboarding.shopTypeHint')}
      </Text>
      <FormSelect
        control={control}
        name="currencyCode"
        label={t('onboarding.currency')}
        options={CURRENCY_OPTIONS}
      />
    </Screen>
  );
}
