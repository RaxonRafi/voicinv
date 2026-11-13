import { useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { type Formatters, useTranslation } from '@/core/i18n';
import {
  Avatar,
  BottomSheet,
  Box,
  Divider,
  EmptyState,
  Icon,
  ListItem,
  Spinner,
  TextField,
} from '@/core/ui';

import { listCustomers } from '../repository';
import { useBalanceText } from '../screens/customer-list-screen';

/** Rows shown at once; the search field narrows a longer list. */
const MAX_RESULTS = 40;

export interface PickedCustomer {
  id: string;
  name: string;
}

export interface CustomerPickerProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen customer, or null for a walk-in sale. */
  onSelect: (customer: PickedCustomer | null) => void;
  format: Formatters;
  /** Offer "Walk-in customer" as the first choice. */
  allowWalkIn?: boolean;
}

/** Bottom sheet for choosing a customer by name, phone number or alias. */
export function CustomerPicker({
  visible,
  onClose,
  onSelect,
  format,
  allowWalkIn = false,
}: CustomerPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const balanceText = useBalanceText(format);
  const query = useLiveQuery(
    `customer-picker:${search}`,
    ['customers', 'customerAliases', 'ledgerEntries'],
    (orm) => listCustomers(orm, { search }),
  );
  const rows = query.status === 'ready' ? query.data.slice(0, MAX_RESULTS) : [];

  const choose = (customer: PickedCustomer | null) => {
    onSelect(customer);
    setSearch('');
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('invoices.chooseCustomer')}
      testID="customer-picker"
    >
      <TextField
        label={t('invoices.picker.searchCustomers')}
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
        testID="customer-picker-search"
      />
      <Box>
        {allowWalkIn ? (
          <>
            <ListItem
              title={t('common.walkIn')}
              leading={<Icon name="customer" tone="secondary" />}
              onPress={() => choose(null)}
              testID="customer-picker-walk-in"
            />
            <Divider />
          </>
        ) : null}
        {query.status === 'loading' ? <Spinner label={t('common.loading')} /> : null}
        {query.status === 'ready' && rows.length === 0 ? (
          <EmptyState icon="customers" title={t('invoices.picker.noCustomers')} />
        ) : null}
        {rows.map(({ customer, balance }) => (
          <ListItem
            key={customer.id}
            title={customer.name}
            subtitle={balanceText(balance)}
            leading={<Avatar name={customer.name} />}
            onPress={() => choose({ id: customer.id, name: customer.name })}
            testID={`customer-picker-${customer.id}`}
          />
        ))}
      </Box>
    </BottomSheet>
  );
}
