import { router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useLiveQuery } from '@/core/db';
import { type Formatters, useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import { useUi } from '@/core/ui/use-ui';
import {
  Avatar,
  Badge,
  EmptyState,
  Fab,
  IconButton,
  List,
  ListItem,
  Screen,
  ScreenHeader,
  SearchField,
  Spinner,
  SwitchField,
  Text,
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
  phone: string | null;
  balance: number;
  formatMoney: (amount: number) => string;
  hiddenLabel: string | undefined;
  onPress: (id: string) => void;
}

const CustomerRowItem = memo(function CustomerRowItem({
  id,
  name,
  phone,
  balance,
  formatMoney,
  hiddenLabel,
  onPress,
}: CustomerRowItemProps) {
  const kind = balanceKind(balance);
  const displayAmount = formatMoney(Math.abs(balance));
  const tone = kind === 'owes' ? 'due' : kind === 'advance' ? 'paid' : 'primary';

  return (
    <ListItem
      title={name}
      subtitle={phone ?? ''}
      accessibilityLabel={`${name}, ${displayAmount}`}
      leading={<Avatar name={name} />}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="bodyStrong" tone={tone}>
            {displayAmount}
          </Text>
          <Text variant="caption" tone="secondary">
            {kind === 'owes' ? 'Due' : kind === 'advance' ? 'Advance' : 'Settled'}
          </Text>
          {hiddenLabel ? <Badge tone="neutral" label={hiddenLabel} /> : null}
        </View>
      }
      group="only"
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
  const { theme } = useUi();
  const app = useShopContext();
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const isDark = theme.scheme === 'dark';

  const query = useLiveQuery(
    `customers:${search}:${showHidden}`,
    ['customers', 'customerAliases', 'ledgerEntries'],
    (orm) => listCustomers(orm, { search, includeArchived: showHidden }),
  );

  if (!app || query.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('customers.title')} large />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }

  const rows = query.status === 'ready' ? query.data : [];
  const searching = search.trim() !== '';

  const { totalOwes, totalAdvance } = useMemo(() => {
    let owes = 0;
    let adv = 0;
    for (const r of rows) {
      if (r.balance > 0) owes += r.balance;
      else if (r.balance < 0) adv += Math.abs(r.balance);
    }
    return { totalOwes: owes, totalAdvance: adv };
  }, [rows]);

  return (
    <Screen
      scroll={false}
      padded={false}
      testID="customer-list-screen"
      fab={
        <Fab
          label={t('customers.add')}
          icon="add"
          onPress={() => router.push('/customers/new')}
          testID="customer-add"
        />
      }
    >
      <ScreenHeader
        title={t('customers.title')}
        large
        right={
          <IconButton
            icon="contacts"
            variant="surface"
            accessibilityLabel={t('customers.import.action')}
            onPress={() => router.push('/customers/import')}
          />
        }
      />
      <List
        data={rows}
        keyExtractor={(row) => row.customer.id}
        padded
        separator="gap"
        header={
          <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
            <SearchField
              label={t('customers.searchLabel')}
              placeholder="Name or phone"
              value={search}
              onChangeText={setSearch}
              testID="customer-search"
            />

            {/* Stat Summary Cards: You'll collect & Advance held */}
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg.surface,
                  borderRadius: theme.radius.xl,
                  padding: theme.spacing.md,
                  gap: 4,
                  boxShadow: isDark ? undefined : '0 2px 8px rgba(0,0,0,0.05)',
                }}
              >
                <Text variant="caption" tone="secondary">
                  You'll collect
                </Text>
                <Text variant="title" tone="primary">
                  {app.format.money(totalOwes)}
                </Text>
              </View>

              <View
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg.surface,
                  borderRadius: theme.radius.xl,
                  padding: theme.spacing.md,
                  gap: 4,
                  boxShadow: isDark ? undefined : '0 2px 8px rgba(0,0,0,0.05)',
                }}
              >
                <Text variant="caption" tone="secondary">
                  Advance held
                </Text>
                <Text variant="title" tone="paid">
                  {app.format.money(totalAdvance)}
                </Text>
              </View>
            </View>

            {/* Count & Show hidden toggle */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: theme.spacing.xs,
              }}
            >
              <Text variant="overline" tone="secondary">
                {`${rows.length} ${rows.length === 1 ? 'CUSTOMER' : 'CUSTOMERS'}`}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text variant="label" tone="secondary">
                  {t('customers.showHidden')}
                </Text>
                <SwitchField
                  label={t('customers.showHidden')}
                  value={showHidden}
                  onChange={setShowHidden}
                  inline
                />
              </View>
            </View>
          </View>
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
            phone={customer.phone}
            balance={balance}
            formatMoney={app.format.money}
            hiddenLabel={customer.isArchived ? t('customers.hidden') : undefined}
            onPress={openCustomer}
          />
        )}
      />
    </Screen>
  );
}
