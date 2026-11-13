import { router } from 'expo-router';
import { memo, useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { type Formatters, useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import {
  Avatar,
  Badge,
  Box,
  Button,
  EmptyState,
  List,
  ListItem,
  Screen,
  ScreenHeader,
  Spinner,
  SwitchField,
  Text,
  TextField,
} from '@/core/ui';

import { listCustomers } from '../repository';

export type BalanceKind = 'owes' | 'advance' | 'settled';

export function balanceKind(balance: number): BalanceKind {
  if (balance > 0) return 'owes';
  return balance < 0 ? 'advance' : 'settled';
}

/** "Owes ৳1,800", "Advance ৳200" or "Nothing due": the balance in words, never a bare sign. */
export function useBalanceText(format: Formatters): (balance: number) => string {
  const { t } = useTranslation();
  return (balance) => {
    const kind = balanceKind(balance);
    if (kind === 'settled') return t('customers.settled');
    return t(`customers.${kind}`, { amount: format.money(Math.abs(balance)) });
  };
}

interface CustomerRowItemProps {
  id: string;
  name: string;
  subtitle: string;
  balanceText: string;
  kind: BalanceKind;
  hiddenLabel: string | undefined;
  onPress: (id: string) => void;
}

const CustomerRowItem = memo(function CustomerRowItem({
  id,
  name,
  subtitle,
  balanceText,
  kind,
  hiddenLabel,
  onPress,
}: CustomerRowItemProps) {
  return (
    <ListItem
      title={name}
      subtitle={subtitle}
      accessibilityLabel={`${name}, ${balanceText}`}
      leading={<Avatar name={name} />}
      trailing={
        <Box align="end" gap="xs">
          <Text
            variant="label"
            tone={kind === 'owes' ? 'due' : kind === 'advance' ? 'paid' : 'secondary'}
          >
            {balanceText}
          </Text>
          {hiddenLabel ? <Badge tone="neutral" label={hiddenLabel} /> : null}
        </Box>
      }
      onPress={() => onPress(id)}
      testID={`customer-${id}`}
    />
  );
});

function openCustomer(id: string) {
  router.push({ pathname: '/customers/[id]', params: { id } });
}

export function CustomerListScreen() {
  const { t } = useTranslation();
  const app = useShopContext();
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const query = useLiveQuery(
    `customers:${search}:${showHidden}`,
    ['customers', 'customerAliases', 'ledgerEntries'],
    (orm) => listCustomers(orm, { search, includeArchived: showHidden }),
  );
  const balanceText = useBalanceText(app?.format ?? FALLBACK_FORMAT);

  if (!app || query.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('customers.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  const rows = query.status === 'ready' ? query.data : [];
  const searching = search.trim() !== '';

  return (
    <Screen
      scroll={false}
      padded={false}
      testID="customer-list-screen"
      footer={
        <>
          <Button
            label={t('customers.add')}
            icon="add"
            onPress={() => router.push('/customers/new')}
            testID="customer-add"
          />
          <Button
            label={t('customers.import.action')}
            icon="customers"
            variant="secondary"
            onPress={() => router.push('/customers/import')}
          />
        </>
      }
    >
      <ScreenHeader title={t('customers.title')} />
      <List
        data={rows}
        keyExtractor={(row) => row.customer.id}
        header={
          <Box padding="lg" gap="md">
            <TextField
              label={t('customers.searchLabel')}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              testID="customer-search"
            />
            <SwitchField
              label={t('customers.showHidden')}
              value={showHidden}
              onChange={setShowHidden}
            />
          </Box>
        }
        empty={
          searching ? (
            <EmptyState icon="search" title={t('customers.noResults', { query: search.trim() })} />
          ) : (
            <EmptyState
              icon="customers"
              title={t('customers.emptyTitle')}
              body={t('customers.emptyBody')}
            />
          )
        }
        renderItem={({ customer, balance }) => (
          <CustomerRowItem
            id={customer.id}
            name={customer.name}
            subtitle={customer.phone ?? t('customers.noPhone')}
            balanceText={balanceText(balance)}
            kind={balanceKind(balance)}
            hiddenLabel={customer.isArchived ? t('customers.hidden') : undefined}
            onPress={openCustomer}
          />
        )}
      />
    </Screen>
  );
}

// Used only for the instant before the shop is loaded; nothing is rendered with it.
const FALLBACK_FORMAT: Formatters = {
  money: String,
  amount: String,
  integer: String,
  quantity: String,
  date: String,
  dateTime: String,
};
