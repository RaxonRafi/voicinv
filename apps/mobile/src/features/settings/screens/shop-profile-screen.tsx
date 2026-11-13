import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';

import { applyFieldError, FormTextField } from '@/core/forms';
import { useTranslation } from '@/core/i18n';
import { type ShopContext, useServices, useShopContext } from '@/core/services';
import { Button, Screen, ScreenHeader, showToast, Spinner, Text } from '@/core/ui';
import { formatInvoiceNumber, isShopPrefix } from '@/shared';

import { type ShopProfileInput, shopProfileInputSchema, updateShopProfile } from '../usecases';

function ShopProfileForm({ app }: { app: ShopContext }) {
  const { t } = useTranslation();
  const { device } = useServices();
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<ShopProfileInput>({
    resolver: zodResolver(shopProfileInputSchema),
    defaultValues: {
      name: app.shop.name,
      phone: app.shop.phone ?? '',
      address: app.shop.address ?? '',
      invoicePrefix: app.shop.invoicePrefix,
    },
  });
  const prefix = useWatch({ control, name: 'invoicePrefix' }).trim().toUpperCase();

  const submit = handleSubmit(async (values) => {
    try {
      await updateShopProfile(app.ctx, values);
      showToast(t('settings.saved'));
      router.back();
    } catch (error) {
      if (!applyFieldError(error, setError, ['name', 'phone', 'invoicePrefix'])) {
        showToast(t('common.somethingWrong'), 'danger');
      }
    }
  });

  return (
    <Screen
      testID="shop-profile-screen"
      footer={
        <Button
          label={t('common.save')}
          onPress={() => void submit()}
          loading={isSubmitting}
          testID="shop-profile-save"
        />
      }
    >
      <ScreenHeader title={t('settings.shopProfile')} />
      <FormTextField
        control={control}
        name="name"
        label={t('onboarding.shopName')}
        hint={t('onboarding.shopNameHint')}
        autoCapitalize="words"
        testID="shop-profile-name"
      />
      <FormTextField
        control={control}
        name="phone"
        label={t('onboarding.phone')}
        optional
        keyboardType="phone-pad"
      />
      <FormTextField
        control={control}
        name="address"
        label={t('onboarding.address')}
        optional
        multiline
      />
      <FormTextField
        control={control}
        name="invoicePrefix"
        label={t('settings.invoicePrefix')}
        autoCapitalize="characters"
        maxLength={6}
        testID="shop-profile-prefix"
      />
      {isShopPrefix(prefix) ? (
        <Text variant="caption" tone="secondary">
          {t('settings.invoicePrefixHint', {
            example: formatInvoiceNumber({
              shopPrefix: prefix,
              deviceCode: device.deviceCode,
              sequence: 1,
            }),
          })}
        </Text>
      ) : null}
    </Screen>
  );
}

export function ShopProfileScreen() {
  const { t } = useTranslation();
  const app = useShopContext();
  if (!app) {
    return (
      <Screen>
        <ScreenHeader title={t('settings.shopProfile')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  return <ShopProfileForm key={app.shop.id} app={app} />;
}
