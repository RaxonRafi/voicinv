import { router } from 'expo-router';
import { useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { useLanguage, useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import {
  AmountField,
  Button,
  Card,
  Icon,
  ListItem,
  Screen,
  ScreenHeader,
  showToast,
  Spinner,
  TextField,
} from '@/core/ui';
import {
  CustomerPicker,
  findCustomer,
  type PickedCustomer,
  useBalanceText,
} from '@/features/customers';

import { recordPayment } from '../usecases';

export interface PaymentFormScreenProps {
  /** Take the payment from this customer. Without it, the user chooses one. */
  customerId?: string;
  /** Pre-filled amount in minor units (from a voice command). */
  initialAmount?: number;
}

/** Records money received from a customer. */
export function PaymentFormScreen({ customerId, initialAmount }: PaymentFormScreenProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const app = useShopContext();
  const [picked, setPicked] = useState<PickedCustomer | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(initialAmount ?? null);
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  // The picked customer wins; otherwise the one the screen was opened for.
  const activeId = picked?.id ?? customerId;
  const current = useLiveQuery(
    `payment-customer:${activeId ?? ''}`,
    ['customers', 'ledgerEntries'],
    (orm) => (activeId ? findCustomer(orm, activeId) : Promise.resolve(null)),
  );
  const balanceText = useBalanceText(app?.format ?? PLACEHOLDER_FORMAT);

  if (!app || current.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('ledger.payment.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  const customer = current.status === 'ready' ? current.data : null;
  const amountInvalid = amount === null || amount <= 0;

  const save = async () => {
    setAttempted(true);
    if (!customer || amountInvalid) return;
    setSaving(true);
    try {
      const result = await recordPayment(app.ctx, {
        customerId: customer.customer.id,
        amount,
        note,
        invoiceId: null,
      });
      showToast(t('ledger.payment.saved', { balance: balanceText(result.balance) }));
      router.back();
    } catch {
      showToast(t('common.somethingWrong'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      testID="payment-form-screen"
      footer={
        <Button
          label={t('ledger.payment.save')}
          onPress={() => void save()}
          loading={saving}
          testID="payment-save"
        />
      }
    >
      <ScreenHeader title={t('ledger.payment.title')} />
      <Card padding="none">
        <ListItem
          title={customer?.customer.name ?? t('ledger.payment.chooseCustomer')}
          subtitle={customer ? balanceText(customer.balance) : undefined}
          leading={<Icon name="customer" tone="secondary" />}
          onPress={() => setPickerOpen(true)}
          showChevron
          testID="payment-customer"
        />
      </Card>
      <AmountField
        label={t('ledger.payment.amount')}
        value={amount}
        onChange={setAmount}
        locale={language}
        currency={app.shop.currencyCode}
        error={
          attempted && !customer
            ? t('errors.required')
            : attempted && amountInvalid
              ? t('errors.invalidAmount')
              : undefined
        }
        testID="payment-amount"
      />
      <TextField
        label={t('ledger.payment.note')}
        value={note}
        onChangeText={setNote}
        optional
        testID="payment-note"
      />
      <CustomerPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(next) => {
          if (next) setPicked(next);
        }}
        format={app.format}
      />
    </Screen>
  );
}

// Used only for the instant before the shop is loaded; nothing is rendered with it.
const PLACEHOLDER_FORMAT = {
  money: String,
  amount: String,
  integer: String,
  quantity: String,
  date: String,
  dateTime: String,
};
