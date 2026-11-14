import { router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import { useUi } from '@/core/ui/use-ui';
import {
  Badge,
  Box,
  ChipGroup,
  EmptyState,
  Fab,
  IconTile,
  List,
  ListItem,
  Screen,
  ScreenHeader,
  SearchField,
  Spinner,
  Text,
} from '@/core/ui';

import { listInvoices } from '../repository';
import { type InvoiceBadgeStatus } from '../types';
import { getSettledAmounts, invoiceBadgeStatus } from '../usecases';

type FilterTab = 'all' | 'paid' | 'due' | 'partial';

interface InvoiceRowItemProps {
  id: string;
  number: string;
  who: string;
  totalText: string;
  status: InvoiceBadgeStatus;
  onPress: (id: string) => void;
}

const InvoiceRowItem = memo(function InvoiceRowItem({
  id,
  number,
  who,
  totalText,
  status,
  onPress,
}: InvoiceRowItemProps) {
  const { t } = useTranslation();
  return (
    <ListItem
      title={who}
      subtitle={number}
      accessibilityLabel={`${who}, ${number}, ${totalText}`}
      leading={<IconTile icon="invoice" />}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text variant="bodyStrong" tone={status === 'CANCELLED' ? 'cancelled' : 'primary'}>
            {totalText}
          </Text>
          <Badge
            tone={status === 'PAID' ? 'paid' : status === 'DUE' ? 'due' : 'partlyPaid'}
            label={status === 'PAID' ? t('status.paid') : status === 'DUE' ? t('status.due') : t('status.partlyPaid')}
          />
        </View>
      }
      group="only"
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
  const { theme } = useUi();
  const app = useShopContext();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');

  const query = useLiveQuery(
    `invoices:${search}`,
    ['invoices', 'customers', 'payments'],
    async (orm) => ({
      rows: await listInvoices(orm, { search, limit: 300 }),
      settled: await getSettledAmounts(orm),
    }),
  );

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'paid', label: 'Paid' },
    { value: 'due', label: 'Due' },
    { value: 'partial', label: 'Partial' },
  ] as const;

  const rawRows = query.status === 'ready' ? query.data.rows : [];
  const settled = query.status === 'ready' ? query.data.settled : new Map<string, number>();

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rawRows;
    return rawRows.filter(({ invoice }) => {
      const status = invoiceBadgeStatus(invoice, settled.get(invoice.id) ?? 0);
      if (filter === 'paid') return status === 'PAID';
      if (filter === 'due') return status === 'DUE';
      if (filter === 'partial') return status === 'PARTLY_PAID';
      return true;
    });
  }, [rawRows, settled, filter]);

  if (!app || query.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('invoices.title')} large />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }

  const searching = search.trim() !== '';

  return (
    <Screen
      scroll={false}
      padded={false}
      testID="invoice-list-screen"
      fab={
        <Fab
          label={t('invoices.new')}
          icon="add"
          onPress={() => router.push('/invoices/new')}
          testID="invoice-new"
        />
      }
    >
      <ScreenHeader title={t('invoices.title')} large />
      <List
        data={filteredRows}
        keyExtractor={(row) => row.invoice.id}
        padded
        separator="gap"
        header={
          <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
            <SearchField
              label={t('invoices.searchLabel')}
              placeholder="Number or customer"
              value={search}
              onChangeText={setSearch}
              testID="invoice-search"
            />
            <ChipGroup
              accessibilityLabel="Invoice filter"
              value={filter}
              options={filterOptions}
              onChange={setFilter}
              testID="invoice-filter-chips"
            />
          </View>
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
            totalText={app.format.money(invoice.total)}
            status={invoiceBadgeStatus(invoice, settled.get(invoice.id) ?? 0)}
            onPress={openInvoice}
          />
        )}
      />
    </Screen>
  );
}
