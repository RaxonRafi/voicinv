import { router } from 'expo-router';
import { memo, useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import {
  Badge,
  Box,
  Button,
  EmptyState,
  Icon,
  List,
  ListItem,
  Screen,
  ScreenHeader,
  Spinner,
  SwitchField,
  TextField,
} from '@/core/ui';

import { listProducts } from '../repository';

interface ProductRowItemProps {
  id: string;
  name: string;
  subtitle: string;
  hiddenLabel: string | undefined;
  onPress: (id: string) => void;
}

// Primitive props + one shared callback, so unchanged rows are skipped while scrolling.
const ProductRowItem = memo(function ProductRowItem({
  id,
  name,
  subtitle,
  hiddenLabel,
  onPress,
}: ProductRowItemProps) {
  return (
    <ListItem
      title={name}
      subtitle={subtitle}
      leading={<Icon name="product" tone="secondary" />}
      trailing={hiddenLabel ? <Badge tone="neutral" label={hiddenLabel} /> : undefined}
      onPress={() => onPress(id)}
      showChevron
      testID={`product-${id}`}
    />
  );
});

function openProduct(id: string) {
  router.push({ pathname: '/products/[id]', params: { id } });
}

export function ProductListScreen() {
  const { t } = useTranslation();
  const app = useShopContext();
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const query = useLiveQuery(
    `products:${search}:${showHidden}`,
    ['products', 'productAliases'],
    (orm) => listProducts(orm, { search, includeArchived: showHidden }),
  );

  if (!app || query.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('products.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  const products = query.status === 'ready' ? query.data : [];
  const searching = search.trim() !== '';

  return (
    <Screen
      scroll={false}
      padded={false}
      testID="product-list-screen"
      footer={
        <Button
          label={t('products.add')}
          icon="add"
          onPress={() => router.push('/products/new')}
          testID="product-add"
        />
      }
    >
      <ScreenHeader title={t('products.title')} />
      <List
        data={products}
        keyExtractor={(product) => product.id}
        header={
          <Box padding="lg" gap="md">
            <TextField
              label={t('products.searchLabel')}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              testID="product-search"
            />
            <SwitchField
              label={t('products.showHidden')}
              value={showHidden}
              onChange={setShowHidden}
            />
          </Box>
        }
        empty={
          searching ? (
            <EmptyState icon="search" title={t('products.noResults', { query: search.trim() })} />
          ) : (
            <EmptyState
              icon="product"
              title={t('products.emptyTitle')}
              body={t('products.emptyBody')}
            />
          )
        }
        renderItem={(product) => (
          <ProductRowItem
            id={product.id}
            name={product.name}
            subtitle={
              product.defaultPrice === null
                ? `${product.unit} · ${t('products.noPrice')}`
                : t('products.perUnit', {
                    price: app.format.money(product.defaultPrice),
                    unit: product.unit,
                  })
            }
            hiddenLabel={product.isArchived ? t('products.hidden') : undefined}
            onPress={openProduct}
          />
        )}
      />
    </Screen>
  );
}
