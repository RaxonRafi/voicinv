import { type Dispatch, memo, useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { useLanguage, useTranslation } from '@/core/i18n';
import { type ShopContext } from '@/core/services';
import {
  AmountField,
  Banner,
  Box,
  Button,
  Card,
  ConfidenceHighlight,
  Divider,
  Icon,
  IconButton,
  ListItem,
  QuantityField,
  Row,
  SectionHeader,
  Select,
  Text,
  TextField,
} from '@/core/ui';
import { CustomerPicker, findCustomer } from '@/features/customers';
import { creditStatus } from '@/features/ledger';
import { ProductPicker } from '@/features/products';
import { type MinorUnits, Money, type PaymentInstruction, QUANTITY_SCALE } from '@/shared';

import {
  type DraftAction,
  type DraftItem,
  type DraftProblem,
  draftTotals,
  type InvoiceDraft,
  itemForProduct,
} from '../draft';

type PaymentMode = 'full' | 'none' | 'half' | 'amount';

function paymentMode(payment: PaymentInstruction): PaymentMode {
  switch (payment.type) {
    case 'FULL':
      return 'full';
    case 'NONE':
      return 'none';
    case 'AMOUNT':
      return 'amount';
    case 'FRACTION':
      // "Paid half" has its own choice; any other fraction is shown as the amount it comes to.
      return payment.numerator === 1 && payment.denominator === 2 ? 'half' : 'amount';
  }
}

interface ItemCardProps {
  item: DraftItem;
  currency: string;
  language: string;
  lineTotalText: string | null;
  problemCodes: string;
  dispatch: Dispatch<DraftAction>;
}

// One card per line. Receives the item object (replaced only when that line changes) and the
// stable dispatch, so editing one line does not re-render the others.
const ItemCard = memo(function ItemCard({
  item,
  currency,
  language,
  lineTotalText,
  problemCodes,
  dispatch,
}: ItemCardProps) {
  const { t } = useTranslation();
  const update = (changes: Partial<Omit<DraftItem, 'key'>>) =>
    dispatch({ type: 'updateItem', key: item.key, changes });
  const has = (code: DraftProblem['code']) => problemCodes.split(',').includes(code);
  const fromCatalog = item.productId !== null;

  return (
    <ConfidenceHighlight confidence={item.confidence ?? 1}>
      <Card testID={`invoice-item-${item.key}`}>
        <Row justify="between" gap="sm">
          {fromCatalog ? (
            <Text variant="bodyStrong" flex>
              {item.name}
            </Text>
          ) : (
            <Box flex>
              <TextField
                label={t('invoices.itemName')}
                value={item.name}
                onChangeText={(name) => update({ name })}
                error={
                  has('itemName') && item.name.trim() === '' ? t('errors.required') : undefined
                }
                testID={`invoice-item-name-${item.key}`}
              />
            </Box>
          )}
          <IconButton
            icon="trash"
            tone="danger"
            accessibilityLabel={t('invoices.removeItem', { name: item.name })}
            onPress={() => dispatch({ type: 'removeItem', key: item.key })}
            testID={`invoice-item-remove-${item.key}`}
          />
        </Row>
        {fromCatalog ? null : (
          <TextField
            label={t('invoices.unit')}
            value={item.unit}
            onChangeText={(unit) => update({ unit })}
            autoCapitalize="none"
            error={has('itemName') && item.unit.trim() === '' ? t('errors.required') : undefined}
            testID={`invoice-item-unit-${item.key}`}
          />
        )}
        <QuantityField
          label={t('invoices.quantity')}
          unit={item.unit}
          value={item.qtyMilli}
          onChange={(qtyMilli) => update({ qtyMilli })}
          locale={language}
          error={has('itemQuantity') ? t('errors.invalidQuantity') : undefined}
          testID={`invoice-item-quantity-${item.key}`}
        />
        <AmountField
          label={t('invoices.price')}
          value={item.unitPrice}
          onChange={(unitPrice) => update({ unitPrice })}
          locale={language}
          currency={currency}
          error={has('itemPrice') ? t('errors.invalidAmount') : undefined}
          testID={`invoice-item-price-${item.key}`}
        />
        {lineTotalText ? (
          <Row justify="between">
            <Text tone="secondary">{t('invoices.lineTotal')}</Text>
            <Text variant="amount">{lineTotalText}</Text>
          </Row>
        ) : null}
      </Card>
    </ConfidenceHighlight>
  );
});

export interface InvoiceEditorProps {
  app: ShopContext;
  draft: InvoiceDraft;
  dispatch: Dispatch<DraftAction>;
  /** Problems to point out on the form; pass them once the user has tried to save. */
  problems: readonly DraftProblem[];
}

/**
 * Edits an invoice draft: customer, lines, discount and payment, with live totals. Used for
 * manual entry, for editing a saved invoice and for confirming a voice draft, where fields the
 * parser was unsure about are highlighted until the user touches them.
 */
export function InvoiceEditor({ app, draft, dispatch, problems }: InvoiceEditorProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { format, shop } = app;
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const totals = draftTotals(draft);
  const mode = paymentMode(draft.payment);
  const customer = useLiveQuery(
    `invoice-editor-customer:${draft.customerId ?? ''}`,
    ['customers', 'ledgerEntries'],
    (orm) => (draft.customerId ? findCustomer(orm, draft.customerId) : Promise.resolve(null)),
  );
  const customerInfo = customer.status === 'ready' ? customer.data : null;
  const overLimit =
    customerInfo !== null &&
    totals !== null &&
    creditStatus(
      Money.add(customerInfo.balance, totals.dueAmount),
      customerInfo.customer.creditLimit,
    ) === 'over';

  const setMode = (next: PaymentMode) => {
    const payments: Record<PaymentMode, PaymentInstruction> = {
      full: { type: 'FULL' },
      none: { type: 'NONE' },
      half: { type: 'FRACTION', numerator: 1, denominator: 2 },
      amount: { type: 'AMOUNT', amount: totals?.paidAmount ?? 0 },
    };
    dispatch({ type: 'setPayment', payment: payments[next] });
  };

  const problemCodesFor = (key: string) =>
    problems
      .filter((problem) => 'key' in problem && problem.key === key)
      .map((problem) => problem.code)
      .join(',');
  const generalProblems = problems.filter((problem) => !('key' in problem));

  const totalLine = (label: string, amount: MinorUnits, tone?: 'paid' | 'due') => (
    <Row justify="between">
      <Text tone={tone ? 'primary' : 'secondary'}>{label}</Text>
      <Text variant="amount" tone={tone ?? 'primary'}>
        {format.money(amount)}
      </Text>
    </Row>
  );

  return (
    <Box gap="lg">
      {generalProblems.map((problem) => (
        <Banner key={problem.code} tone="danger" title={t(`invoices.problems.${problem.code}`)} />
      ))}

      <SectionHeader title={t('invoices.customer')} />
      <ConfidenceHighlight confidence={draft.customerConfidence ?? 1}>
        <Card padding="none">
          <ListItem
            title={draft.customerName ?? t('common.walkIn')}
            subtitle={draft.customerId ? undefined : t('invoices.chooseCustomer')}
            leading={<Icon name="customer" tone="secondary" />}
            onPress={() => setCustomerPickerOpen(true)}
            showChevron
            testID="invoice-customer"
          />
        </Card>
      </ConfidenceHighlight>
      {overLimit && customerInfo && customerInfo.customer.creditLimit !== null ? (
        <Banner
          tone="warning"
          title={t('invoices.overLimit', {
            name: customerInfo.customer.name,
            limit: format.money(customerInfo.customer.creditLimit),
          })}
        />
      ) : null}

      <SectionHeader title={t('invoices.items')} />
      {draft.items.map((item) => (
        <ItemCard
          key={item.key}
          item={item}
          currency={shop.currencyCode}
          language={language}
          lineTotalText={
            item.qtyMilli !== null && item.qtyMilli > 0 && item.unitPrice !== null
              ? format.money(Money.multiplyByQuantity(item.unitPrice, item.qtyMilli))
              : null
          }
          problemCodes={problemCodesFor(item.key)}
          dispatch={dispatch}
        />
      ))}
      <Button
        label={t('invoices.chooseProduct')}
        icon="add"
        variant="secondary"
        onPress={() => setProductPickerOpen(true)}
        testID="invoice-add-product"
      />
      <Button
        label={t('invoices.typeItem')}
        icon="edit"
        variant="ghost"
        onPress={() =>
          dispatch({
            type: 'addItem',
            item: {
              productId: null,
              name: '',
              unit: '',
              qtyMilli: QUANTITY_SCALE,
              unitPrice: null,
            },
          })
        }
        testID="invoice-add-custom"
      />

      <Divider />
      <AmountField
        label={t('invoices.discount')}
        value={draft.discount === 0 ? null : draft.discount}
        onChange={(discount) => dispatch({ type: 'setDiscount', discount: discount ?? 0 })}
        locale={language}
        currency={shop.currencyCode}
        optional
        testID="invoice-discount"
      />
      <ConfidenceHighlight confidence={draft.paymentConfidence ?? 1}>
        <Box gap="md">
          <Select<PaymentMode>
            label={t('invoices.payment')}
            value={mode}
            options={[
              { value: 'full', label: t('invoices.pay.full') },
              { value: 'half', label: t('invoices.pay.half') },
              { value: 'amount', label: t('invoices.pay.amount') },
              { value: 'none', label: t('invoices.pay.none') },
            ]}
            onChange={setMode}
            testID="invoice-payment-mode"
          />
          {mode === 'amount' ? (
            <AmountField
              label={t('invoices.amountPaid')}
              value={
                draft.payment.type === 'AMOUNT' ? draft.payment.amount : (totals?.paidAmount ?? 0)
              }
              onChange={(amount) =>
                dispatch({ type: 'setPayment', payment: { type: 'AMOUNT', amount: amount ?? 0 } })
              }
              locale={language}
              currency={shop.currencyCode}
              testID="invoice-amount-paid"
            />
          ) : null}
        </Box>
      </ConfidenceHighlight>

      {totals ? (
        <Card elevation="raised" testID="invoice-totals">
          {totalLine(t('invoices.subtotal'), totals.subtotal)}
          {totals.discount > 0
            ? totalLine(t('invoices.discount'), Money.negate(totals.discount))
            : null}
          <Divider />
          <Row justify="between">
            <Text variant="bodyStrong">{t('invoices.total')}</Text>
            <Text variant="title">{format.money(totals.total)}</Text>
          </Row>
          {totalLine(t('invoices.paid'), totals.paidAmount, 'paid')}
          {totalLine(t('invoices.due'), totals.dueAmount, totals.dueAmount > 0 ? 'due' : undefined)}
          {totals.change > 0 ? totalLine(t('invoices.change'), totals.change) : null}
        </Card>
      ) : null}

      <CustomerPicker
        visible={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        onSelect={(picked) => dispatch({ type: 'setCustomer', customer: picked })}
        format={format}
        allowWalkIn
      />
      <ProductPicker
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSelect={(product) => dispatch({ type: 'addItem', item: itemForProduct(product) })}
        format={format}
      />
    </Box>
  );
}
