import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useLiveQuery } from '@/core/db';
import { applyFieldError, FormAmountField, FormTextField } from '@/core/forms';
import { useTranslation } from '@/core/i18n';
import { type ShopContext, useShopContext } from '@/core/services';
import {
  Button,
  Card,
  EmptyState,
  Screen,
  ScreenHeader,
  showToast,
  Spinner,
  SwitchField,
} from '@/core/ui';
import { parseAliasList } from '@/core/utils';

import { type ProductDetails, productInputSchema } from '../types';
import { createProduct, editProduct, getProductDetails, setProductArchived } from '../usecases';

const formSchema = productInputSchema.omit({ aliases: true }).extend({
  /** Comma-separated; split into the `aliases` list on save. */
  aliasesText: z.string().max(600, 'tooLong'),
});
type FormValues = z.infer<typeof formSchema>;

interface ProductFormProps {
  app: ShopContext;
  existing: ProductDetails | null;
}

function ProductForm({ app, existing }: ProductFormProps) {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: existing?.product.name ?? '',
      unit: existing?.product.unit ?? '',
      defaultPrice: existing?.product.defaultPrice ?? null,
      aliasesText: existing?.aliases.join(', ') ?? '',
    },
  });

  const submit = handleSubmit(async ({ aliasesText, ...values }) => {
    const input = { ...values, aliases: parseAliasList(aliasesText) };
    try {
      if (existing) await editProduct(app.ctx, existing.product.id, input);
      else await createProduct(app.ctx, input);
      showToast(t('products.saved'));
      router.back();
    } catch (error) {
      if (!applyFieldError(error, setError, ['name', 'unit', 'defaultPrice'])) {
        showToast(t('common.somethingWrong'), 'danger');
      }
    }
  });

  return (
    <Screen
      testID="product-form-screen"
      footer={
        <Button
          label={t('common.save')}
          onPress={() => void submit()}
          loading={isSubmitting}
          testID="product-save"
        />
      }
    >
      <ScreenHeader title={existing ? t('products.edit') : t('products.new')} />
      <FormTextField
        control={control}
        name="name"
        label={t('products.name')}
        autoCapitalize="words"
        testID="product-name"
      />
      <FormTextField
        control={control}
        name="unit"
        label={t('products.unit')}
        hint={t('products.unitHint')}
        autoCapitalize="none"
        testID="product-unit"
      />
      <FormAmountField
        control={control}
        name="defaultPrice"
        label={t('products.price')}
        hint={t('products.priceHint')}
        currency={app.shop.currencyCode}
        optional
        testID="product-price"
      />
      <FormTextField
        control={control}
        name="aliasesText"
        label={t('products.aliases')}
        hint={t('products.aliasesHint')}
        optional
        autoCapitalize="none"
        testID="product-aliases"
      />
      {existing ? (
        <Card>
          <SwitchField
            label={t('products.hide')}
            description={t('products.hideDescription')}
            value={existing.product.isArchived}
            onChange={(hidden) =>
              void setProductArchived(app.ctx, existing.product.id, hidden).catch(() =>
                showToast(t('common.somethingWrong'), 'danger'),
              )
            }
            testID="product-hide"
          />
        </Card>
      ) : null}
    </Screen>
  );
}

/** Creates a product, or edits the one with `productId`. */
export function ProductFormScreen({ productId }: { productId?: string }) {
  const { t } = useTranslation();
  const app = useShopContext();
  const details = useLiveQuery(
    `product:${productId ?? 'new'}`,
    ['products', 'productAliases'],
    (orm) => (productId ? getProductDetails(orm, productId) : Promise.resolve(null)),
  );

  if (!app || details.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={productId ? t('products.edit') : t('products.new')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  if (productId && (details.status === 'error' || !details.data)) {
    return (
      <Screen>
        <ScreenHeader title={t('products.edit')} />
        <EmptyState icon="error" title={t('errors.notFound')} />
      </Screen>
    );
  }
  const existing = details.status === 'ready' ? details.data : null;
  // Remount the form when the loaded record changes identity, so defaults are applied once.
  return <ProductForm key={existing?.product.id ?? 'new'} app={app} existing={existing} />;
}
