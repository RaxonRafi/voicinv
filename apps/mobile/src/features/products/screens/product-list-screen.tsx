import { router } from 'expo-router';
import { memo, useState } from 'react';
import { View } from 'react-native';

import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import { useUi } from '@/core/ui/use-ui';
import {
  Badge,
  EmptyState,
  Fab,
  IconTile,
  List,
  ListItem,
  type ListItemGroup,
  Screen,
  ScreenHeader,
  SearchField,
  Spinner,
  SwitchField,
  Text,
} from '@/core/ui';

import { listProducts } from '../repository';

interface ProductRowItemProps {
  id: string;
  name: string;
  subtitle: string;
  hiddenLabel: string | undefined;
  group: ListItemGroup;
  onPress: (id: string) => void;
}

// Primitive props + one shared callback, so unchanged rows are skipped while scrolling.
const ProductRowItem = memo(function ProductRowItem({
  id,
  name,
  subtitle,
  hiddenLabel,
  group,
  onPress,
}: ProductRowItemProps) {
  return (
    <ListItem
      title={name}
      subtitle={subtitle}
      leading={<IconTile letter={name} />}
      trailing={hiddenLabel ? <Badge tone="neutral" label={hiddenLabel} /> : undefined}
      onPress={() => onPress(id)}
      showChevron
      group={group}
      testID={`product-${id}`}
    />
  );
});

function openProduct(id: string) {
  router.push({ pathname: '/products/[id]', params: { id } });
}

export function ProductListScreen() {
  const { t } = useTranslation();
  const { theme } = useUi();
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
        <ScreenHeader title={t('products.title')} large />
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
      fab={
        <Fab
          label={t('products.add')}
          icon="add"
          onPress={() => router.push('/products/new')}
          testID="product-add"
        />
      }
    >
      <ScreenHeader title={t('products.title')} large />
      <List
        data={products}
        keyExtractor={(product) => product.id}
        padded
        separator="divider"
        header={
          <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
            <SearchField
              label={t('products.searchLabel')}
              placeholder="Search products"
              value={search}
              onChangeText={setSearch}
              testID="product-search"
            />
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
                {`${products.length} ${products.length === 1 ? 'PRODUCT' : 'PRODUCTS'}`}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text variant="label" tone="secondary">
                  {t('products.showHidden')}
                </Text>
                <SwitchField
                  label={t('products.showHidden')}
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
            <EmptyState icon="search" title={t('products.noResults', { query: search.trim() })} />
          ) : (
            <EmptyState
              icon="product"
              title={t('products.emptyTitle')}
              body={t('products.emptyBody')}
            />
          )
        }
        renderItem={(product, index) => {
          const group: ListItemGroup =
            products.length === 1
              ? 'only'
              : index === 0
                ? 'first'
                : index === products.length - 1
                  ? 'last'
                  : 'middle';

          return (
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
              group={group}
              onPress={openProduct}
            />
          );
        }}
      />
    </Screen>
  );
}
