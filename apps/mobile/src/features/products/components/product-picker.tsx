import { useState } from 'react';

import { type ProductRow, useLiveQuery } from '@/core/db';
import { type Formatters, useTranslation } from '@/core/i18n';
import { BottomSheet, Box, EmptyState, Icon, ListItem, Spinner, TextField } from '@/core/ui';

import { listProducts } from '../repository';

/** Rows shown at once; the search field narrows a longer list. */
const MAX_RESULTS = 40;

export interface ProductPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (product: ProductRow) => void;
  format: Formatters;
}

/** Bottom sheet for choosing a product by name or alias, in either language. */
export function ProductPicker({ visible, onClose, onSelect, format }: ProductPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useLiveQuery(`product-picker:${search}`, ['products', 'productAliases'], (orm) =>
    listProducts(orm, { search }),
  );
  const rows = query.status === 'ready' ? query.data.slice(0, MAX_RESULTS) : [];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('invoices.chooseProduct')}
      testID="product-picker"
    >
      <TextField
        label={t('invoices.picker.searchProducts')}
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
        testID="product-picker-search"
      />
      <Box>
        {query.status === 'loading' ? <Spinner label={t('common.loading')} /> : null}
        {query.status === 'ready' && rows.length === 0 ? (
          <EmptyState icon="product" title={t('invoices.picker.noProducts')} />
        ) : null}
        {rows.map((product) => (
          <ListItem
            key={product.id}
            title={product.name}
            subtitle={
              product.defaultPrice === null
                ? `${product.unit} · ${t('products.noPrice')}`
                : t('products.perUnit', {
                    price: format.money(product.defaultPrice),
                    unit: product.unit,
                  })
            }
            leading={<Icon name="product" tone="secondary" />}
            onPress={() => {
              onSelect(product);
              setSearch('');
              onClose();
            }}
            testID={`product-picker-${product.id}`}
          />
        ))}
      </Box>
    </BottomSheet>
  );
}
