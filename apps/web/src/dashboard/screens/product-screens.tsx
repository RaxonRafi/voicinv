'use client';

import { Package, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';

import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Notice,
  Overline,
  SearchField,
  showToast,
  Switch,
  TextField,
  Tile,
} from '@/components';

import { describeError, useApp, useOnline } from '../app-context';
import { createProduct, editProduct } from '../data/catalog';
import { findProduct, listProductAliases, listProducts } from '../data/selectors';
import { initialOf, parseAliasList } from '../data/text';
import { Screen, ScreenMessage } from '../shell/screen';
import { Row, RowGroup } from './parts';

export function ProductListScreen() {
  const { t, state, fmt, path, fill } = useApp();
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const products = listProducts(state.data, { search, includeArchived: showHidden });
  const total = listProducts(state.data, { includeArchived: showHidden }).length;

  return (
    <Screen
      title={t.products.title}
      actions={
        <span className="hidden sm:inline-flex">
          <ButtonLink
            href={path('productEdit')}
            icon={<Plus aria-hidden="true" className="size-5" />}
          >
            {t.products.add}
          </ButtonLink>
        </span>
      }
    >
      <SearchField label={t.products.searchLabel} value={search} onChange={setSearch} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Overline level={2}>
          {fill(total === 1 ? t.products.countOne : t.products.countOther, {
            count: fmt.integer(total),
          })}
        </Overline>
        <Switch label={t.products.showHidden} checked={showHidden} onChange={setShowHidden} />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={<Package className="size-6" />}
          title={t.products.emptyTitle}
          body={t.products.emptyBody}
          action={<ButtonLink href={path('productEdit')}>{t.products.add}</ButtonLink>}
        />
      ) : products.length === 0 ? (
        <p className="text-body text-text-secondary">
          {fill(t.products.noResults, { query: search.trim() })}
        </p>
      ) : (
        <RowGroup>
          {products.map((product) => (
            <li key={product.id}>
              <Row
                variant="plain"
                href={path('productEdit', { id: product.id })}
                leading={<Tile>{initialOf(product.name)}</Tile>}
                title={product.isArchived ? `${product.name} · ${t.products.hidden}` : product.name}
                subtitle={`${fill(t.products.perUnit, { unit: product.unit })} · ${
                  product.defaultPrice === null
                    ? t.products.priceAtSale
                    : fmt.money(product.defaultPrice)
                }`}
                chevron
              />
            </li>
          ))}
        </RowGroup>
      )}
      <div className="fixed right-4 bottom-24 z-(--vl-z-raised) sm:hidden">
        <ButtonLink
          href={path('productEdit')}
          size="lg"
          icon={<Plus aria-hidden="true" className="size-6" />}
        >
          {t.products.add}
        </ButtonLink>
      </div>
    </Screen>
  );
}

export function ProductFormScreen() {
  const { t, state, store, fmt, path } = useApp();
  const router = useRouter();
  const online = useOnline();
  const id = useId();
  const productId = useSearchParams().get('id');
  const existing = productId === null ? null : findProduct(state.data, productId);
  const [name, setName] = useState(existing?.name ?? '');
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [price, setPrice] = useState(fmt.moneyInput(existing?.defaultPrice ?? null));
  const [aliases, setAliases] = useState(() =>
    productId === null
      ? ''
      : listProductAliases(state.data, productId)
          .map((row) => row.alias)
          .join(', '),
  );
  const [hidden, setHidden] = useState(existing?.isArchived ?? false);
  const [errors, setErrors] = useState<{
    name?: string;
    unit?: string;
    price?: string;
    form?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  if (productId !== null && !existing) {
    return (
      <ScreenMessage
        title={t.products.edit}
        backHref={path('products')}
        message={t.errors.notFound}
      />
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const defaultPrice = price.trim() === '' ? null : fmt.parseMoney(price);
    const found: typeof errors = {};
    if (name.trim() === '') found.name = t.errors.required;
    if (unit.trim() === '') found.unit = t.errors.required;
    if (price.trim() !== '' && defaultPrice === null) found.price = t.errors.invalidAmount;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const input = { name, unit, defaultPrice, aliases: parseAliasList(aliases) };
    try {
      await store.commit((data, ctx) =>
        productId === null
          ? createProduct(data, ctx, input)
          : editProduct(data, ctx, productId, { ...input, isArchived: hidden }),
      );
      showToast(t.products.saved);
      router.push(path('products'));
    } catch (error) {
      const { message, field } = describeError(error, t);
      setErrors(field === 'name' || field === 'unit' ? { [field]: message } : { form: message });
      setSaving(false);
    }
  }

  return (
    <Screen
      title={productId === null ? t.products.new : t.products.edit}
      backHref={path('products')}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <TextField
            id={`${id}-name`}
            label={t.products.name}
            value={name}
            error={errors.name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoComplete="off"
            required
          />
          <TextField
            id={`${id}-unit`}
            label={t.products.unit}
            hint={t.products.unitHint}
            value={unit}
            error={errors.unit}
            onChange={(e) => setUnit(e.target.value)}
            maxLength={20}
            required
          />
          <TextField
            id={`${id}-price`}
            label={t.products.price}
            optionalLabel={t.common.optional}
            hint={t.products.priceHint}
            inputMode="decimal"
            prefix={fmt.symbol}
            value={price}
            error={errors.price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <TextField
            id={`${id}-aliases`}
            label={t.products.aliases}
            optionalLabel={t.common.optional}
            hint={t.products.aliasesHint}
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
        </Card>
        {productId !== null ? (
          <Card className="flex flex-col gap-2">
            <Switch label={t.products.hide} checked={hidden} onChange={setHidden} />
            <p className="text-body text-text-secondary">{t.products.hideDescription}</p>
          </Card>
        ) : null}
        <div role="alert">{errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}</div>
        <Button type="submit" size="lg" fullWidth loading={saving} disabled={!online}>
          {t.common.save}
        </Button>
      </form>
    </Screen>
  );
}
