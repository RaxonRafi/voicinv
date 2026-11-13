import { router } from 'expo-router';
import { memo, useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import {
  Box,
  Button,
  EmptyState,
  List,
  ListItem,
  Screen,
  ScreenHeader,
  Spinner,
  Text,
  TextField,
} from '@/core/ui';

import { InvoiceStatusBadge } from '../components/invoice-status-badge';
import { listInvoices } from '../repository';
import { type InvoiceBadgeStatus } from '../types';
import { getSettledAmounts, invoiceBadgeStatus } from '../usecases';

interface InvoiceRowItemProps {
  id: string;
  number: string;
  who: string;
  when: string;
  totalText: string;
  status: InvoiceBadgeStatus;
  onPress: (id: string) => void;
}

const InvoiceRowItem = memo(function InvoiceRowItem({
  id,
  number,
  who,
  when,
  totalText,
  status,
  onPress,
}: InvoiceRowItemProps) {
  return (
    <ListItem
      title={who}
      subtitle={`${number} · ${when}`}
      accessibilityLabel={`${who}, ${number}, ${totalText}`}
      trailing={
        <Box align="end" gap="xs">
          <Text variant="amount" tone={status === 'CANCELLED' ? 'cancelled' : 'primary'}>
            {totalText}
          </Text>
          <InvoiceStatusBadge status={status} />
        </Box>
      }
      onPress={() => onPress(id)}
      testID={`invoice-${id}`}
    />
  );
});

function openInvoice(id: string) {
  router.push({ pathname: '/invoices/[id]', params: { id } });
}

export function InvoiceListScreen() {
  const { t } = useTranslation();
  const app = useShopContext();
  const [search, setSearch] = useState('');
  const query = useLiveQuery(
    `invoices:${search}`,
    ['invoices', 'customers', 'payments'],
    async (orm) => ({
      rows: await listInvoices(orm, { search, limit: 300 }),
      settled: await getSettledAmounts(orm),
    }),
  );

  if (!app || query.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('invoices.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  const rows = query.status === 'ready' ? query.data.rows : [];
  const settled = query.status === 'ready' ? query.data.settled : new Map<string, number>();
  const searching = search.trim() !== '';

  return (
    <Screen
      scroll={false}
      padded={false}
      testID="invoice-list-screen"
      footer={
        <Button
          label={t('invoices.new')}
          icon="add"
          onPress={() => router.push('/invoices/new')}
          testID="invoice-new"
        />
      }
    >
      <ScreenHeader title={t('invoices.title')} />
      <List
        data={rows}
        keyExtractor={(row) => row.invoice.id}
        header={
          <Box padding="lg">
            <TextField
              label={t('invoices.searchLabel')}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              testID="invoice-search"
            />
          </Box>
        }
        empty={
          searching ? (
            <EmptyState icon="search" title={t('invoices.noResults', { query: search.trim() })} />
          ) : (
            <EmptyState
              icon="invoice"
              title={t('invoices.emptyTitle')}
              body={t('invoices.emptyBody')}
            />
          )
        }
        renderItem={({ invoice, customerName }) => (
          <InvoiceRowItem
            id={invoice.id}
            number={invoice.invoiceNumber}
            who={customerName ?? t('common.walkIn')}
            when={app.format.date(invoice.date)}
            totalText={app.format.money(invoice.total)}
            status={invoiceBadgeStatus(invoice, settled.get(invoice.id) ?? 0)}
            onPress={openInvoice}
          />
        )}
      />
    </Screen>
  );
}
