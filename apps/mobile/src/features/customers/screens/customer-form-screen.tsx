import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useLiveQuery } from '@/core/db';
import { applyFieldError, FormAmountField, FormTextField } from '@/core/forms';
import { useTranslation } from '@/core/i18n';
import { type ShopContext, useShopContext } from '@/core/services';
import {
  Button,
  Card,
  EmptyState,
  Screen,
  ScreenHeader,
  showToast,
  Spinner,
  SwitchField,
} from '@/core/ui';
import { parseAliasList } from '@/core/utils';

import { type CustomerDetails, customerInputSchema } from '../types';
import { createCustomer, editCustomer, getCustomerDetails, setCustomerArchived } from '../usecases';

const formSchema = customerInputSchema.omit({ aliases: true }).extend({
  /** Comma-separated; split into the `aliases` list on save. */
  aliasesText: z.string().max(600, 'tooLong'),
});
type FormValues = z.infer<typeof formSchema>;

interface CustomerFormProps {
  app: ShopContext;
  existing: CustomerDetails | null;
}

function CustomerForm({ app, existing }: CustomerFormProps) {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: existing?.customer.name ?? '',
      phone: existing?.customer.phone ?? '',
      notes: existing?.customer.notes ?? '',
      creditLimit: existing?.customer.creditLimit ?? null,
      aliasesText: existing?.aliases.join(', ') ?? '',
    },
  });

  const submit = handleSubmit(async ({ aliasesText, ...values }) => {
    const input = { ...values, aliases: parseAliasList(aliasesText) };
    try {
      if (existing) await editCustomer(app.ctx, existing.customer.id, input);
      else await createCustomer(app.ctx, input);
      showToast(t('customers.saved'));
      router.back();
    } catch (error) {
      if (!applyFieldError(error, setError, ['name', 'phone', 'creditLimit'])) {
        showToast(t('common.somethingWrong'), 'danger');
      }
    }
  });

  return (
    <Screen
      testID="customer-form-screen"
      footer={
        <Button
          label={t('common.save')}
          onPress={() => void submit()}
          loading={isSubmitting}
          testID="customer-save"
        />
      }
    >
      <ScreenHeader title={existing ? t('customers.edit') : t('customers.new')} />
      <FormTextField
        control={control}
        name="name"
        label={t('customers.name')}
        autoCapitalize="words"
        autoComplete="name"
        testID="customer-name"
      />
      <FormTextField
        control={control}
        name="phone"
        label={t('customers.phone')}
        optional
        keyboardType="phone-pad"
        autoComplete="tel"
        testID="customer-phone"
      />
      <FormAmountField
        control={control}
        name="creditLimit"
        label={t('customers.creditLimit')}
        hint={t('customers.creditLimitHint')}
        currency={app.shop.currencyCode}
        optional
        testID="customer-credit-limit"
      />
      <FormTextField
        control={control}
        name="aliasesText"
        label={t('customers.aliases')}
        hint={t('customers.aliasesHint')}
        optional
        autoCapitalize="none"
        testID="customer-aliases"
      />
      <FormTextField
        control={control}
        name="notes"
        label={t('customers.notes')}
        optional
        multiline
        testID="customer-notes"
      />
      {existing ? (
        <Card>
          <SwitchField
            label={t('customers.hide')}
            description={t('customers.hideDescription')}
            value={existing.customer.isArchived}
            onChange={(hidden) =>
              void setCustomerArchived(app.ctx, existing.customer.id, hidden).catch(() =>
                showToast(t('common.somethingWrong'), 'danger'),
              )
            }
            testID="customer-hide"
          />
        </Card>
      ) : null}
    </Screen>
  );
}

/** Creates a customer, or edits the one with `customerId`. */
export function CustomerFormScreen({ customerId }: { customerId?: string }) {
  const { t } = useTranslation();
  const app = useShopContext();
  const details = useLiveQuery(
    `customer-form:${customerId ?? 'new'}`,
    ['customers', 'customerAliases'],
    (orm) => (customerId ? getCustomerDetails(orm, customerId) : Promise.resolve(null)),
  );

  if (!app || details.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={customerId ? t('customers.edit') : t('customers.new')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  if (customerId && (details.status === 'error' || !details.data)) {
    return (
      <Screen>
        <ScreenHeader title={t('customers.edit')} />
        <EmptyState icon="error" title={t('errors.notFound')} />
      </Screen>
    );
  }
  const existing = details.status === 'ready' ? details.data : null;
  return <CustomerForm key={existing?.customer.id ?? 'new'} app={app} existing={existing} />;
}
