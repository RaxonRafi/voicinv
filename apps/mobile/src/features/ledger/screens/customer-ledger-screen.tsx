import { router } from 'expo-router';
import { memo, useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { useLanguage, useTranslation } from '@/core/i18n';
import { htmlToPdf, shareFile, shareText } from '@/core/platform';
import { useShopContext } from '@/core/services';
import {
  Avatar,
  Banner,
  Box,
  Button,
  Card,
  EmptyState,
  List,
  ListItem,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  showToast,
  Spinner,
  Text,
} from '@/core/ui';
import { balanceKind, getCustomerDetails, useBalanceText } from '@/features/customers';
import { type LedgerEntryType } from '@/shared';

import { buildStatementHtml, signedMoney } from '../document';
import { creditStatus, getStatement } from '../usecases';

interface EntryRowProps {
  title: string;
  subtitle: string;
  amountText: string;
  charge: boolean;
  invoiceId: string | null;
  onOpenInvoice: (id: string) => void;
}

const EntryRow = memo(function EntryRow({
  title,
  subtitle,
  amountText,
  charge,
  invoiceId,
  onOpenInvoice,
}: EntryRowProps) {
  return (
    <ListItem
      title={title}
      subtitle={subtitle}
      accessibilityLabel={`${title}, ${amountText}, ${subtitle}`}
      trailing={
        <Text variant="amount" tone={charge ? 'due' : 'paid'}>
          {amountText}
        </Text>
      }
      onPress={invoiceId ? () => onOpenInvoice(invoiceId) : undefined}
      showChevron={invoiceId !== null}
    />
  );
});

function openInvoice(id: string) {
  router.push({ pathname: '/invoices/[id]', params: { id } });
}

/** One customer's account: what they owe, the actions on it, and the full history. */
export function CustomerLedgerScreen({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const app = useShopContext();
  const [sharing, setSharing] = useState(false);
  const query = useLiveQuery(
    `customer-ledger:${customerId}`,
    ['customers', 'customerAliases', 'ledgerEntries', 'invoices'],
    async (orm) => ({
      details: await getCustomerDetails(orm, customerId),
      statement: await getStatement(orm, customerId),
    }),
  );
  const balanceText = useBalanceText(app?.format ?? PLACEHOLDER_FORMAT);

  if (!app || query.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('customers.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  if (query.status === 'error' || !query.data.details) {
    return (
      <Screen>
        <ScreenHeader title={t('customers.title')} />
        <EmptyState icon="error" title={t('errors.notFound')} />
      </Screen>
    );
  }

  const { format, shop } = app;
  const { details, statement } = query.data;
  const { customer, balance } = details;
  const kind = balanceKind(balance);
  const entryLabels: Record<LedgerEntryType, string> = {
    INVOICE_DUE: t('ledger.entries.INVOICE_DUE'),
    PAYMENT: t('ledger.entries.PAYMENT'),
    REVERSAL: t('ledger.entries.REVERSAL'),
    ADJUSTMENT: t('ledger.entries.ADJUSTMENT'),
  };

  const sendReminder = async () => {
    if (balance <= 0) {
      showToast(t('ledger.nothingDue', { name: customer.name }), 'info');
      return;
    }
    try {
      await shareText(
        t('ledger.reminder', {
          customer: customer.name,
          shop: shop.name,
          amount: format.money(balance),
        }),
      );
    } catch {
      showToast(t('ledger.shareFailed'), 'danger');
    }
  };

  const shareStatement = async () => {
    setSharing(true);
    try {
      const html = buildStatementHtml({
        language,
        shop,
        customer,
        lines: statement,
        closingText: balanceText(balance),
        labels: {
          title: t('ledger.statement.title'),
          date: t('ledger.statement.date'),
          description: t('ledger.statement.description'),
          amount: t('ledger.statement.amount'),
          balance: t('ledger.statement.balance'),
          closing: t('ledger.statement.closing'),
          phone: t('invoices.document.phone'),
          entries: entryLabels,
        },
        formatters: format,
      });
      const title = t('ledger.statement.for', { name: customer.name });
      await shareFile(
        await htmlToPdf(html, `statement-${customer.name}`, 'a4'),
        'application/pdf',
        title,
      );
    } catch {
      showToast(t('ledger.shareFailed'), 'danger');
    } finally {
      setSharing(false);
    }
  };

  // Newest first on screen; the statement itself is kept oldest first.
  const newestFirst = [...statement].reverse();

  return (
    <Screen scroll={false} padded={false} testID="customer-ledger-screen">
      <ScreenHeader title={customer.name} />
      <List
        data={newestFirst}
        keyExtractor={(line) => line.entry.id}
        header={
          <Box padding="lg" gap="lg">
            <Card elevation="raised">
              <Row gap="md" wrap={false}>
                <Avatar name={customer.name} />
                <Box flex gap="xs">
                  <Text variant="heading">{customer.name}</Text>
                  <Text tone="secondary">{customer.phone ?? t('customers.noPhone')}</Text>
                </Box>
              </Row>
              <Text
                variant="title"
                tone={kind === 'owes' ? 'due' : kind === 'advance' ? 'paid' : 'primary'}
                testID="customer-balance"
              >
                {balanceText(balance)}
              </Text>
            </Card>
            {creditStatus(balance, customer.creditLimit) === 'over' &&
            customer.creditLimit !== null ? (
              <Banner
                tone="warning"
                title={t('ledger.overLimit', { limit: format.money(customer.creditLimit) })}
              />
            ) : null}
            <Button
              label={t('ledger.takePayment')}
              icon="cash"
              onPress={() => router.push({ pathname: '/payments/new', params: { customerId } })}
              testID="ledger-take-payment"
            />
            <Button
              label={t('ledger.newInvoice')}
              icon="invoice"
              variant="secondary"
              onPress={() => router.push({ pathname: '/invoices/new', params: { customerId } })}
              testID="ledger-new-invoice"
            />
            <Row gap="sm">
              <Button
                label={t('ledger.sendReminder')}
                icon="share"
                variant="ghost"
                fullWidth={false}
                onPress={() => void sendReminder()}
                testID="ledger-reminder"
              />
              <Button
                label={t('ledger.shareStatement')}
                icon="report"
                variant="ghost"
                fullWidth={false}
                loading={sharing}
                onPress={() => void shareStatement()}
                testID="ledger-statement"
              />
              <Button
                label={t('ledger.editCustomer')}
                icon="edit"
                variant="ghost"
                fullWidth={false}
                onPress={() =>
                  router.push({ pathname: '/customers/[id]/edit', params: { id: customerId } })
                }
                testID="ledger-edit-customer"
              />
            </Row>
            <SectionHeader title={t('ledger.history')} />
          </Box>
        }
        empty={<EmptyState icon="ledger" title={t('ledger.noHistory')} />}
        renderItem={({ entry, invoiceNumber, balance: after }) => (
          <EntryRow
            title={
              invoiceNumber
                ? `${entryLabels[entry.type]} · ${invoiceNumber}`
                : entryLabels[entry.type]
            }
            subtitle={`${format.date(entry.createdAt)} · ${t('ledger.balanceAfter', {
              balance: balanceText(after),
            })}`}
            amountText={signedMoney(entry.amount, format)}
            charge={entry.amount > 0}
            invoiceId={invoiceNumber ? entry.refId : null}
            onOpenInvoice={openInvoice}
          />
        )}
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
