import { type Dispatch, memo, useState } from 'react';
import { View } from 'react-native';

import { useLiveQuery } from '@/core/db';
import { useLanguage, useTranslation } from '@/core/i18n';
import { type ShopContext } from '@/core/services';
import { useUi } from '@/core/ui/use-ui';
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
  IconTile,
  ListItem,
  QuantityField,
  Row,
  SectionHeader,
  SegmentedControl,
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

type PaymentMode = 'full' | 'half' | 'amount' | 'credit';

function paymentMode(payment: PaymentInstruction): PaymentMode {
  switch (payment.type) {
    case 'FULL':
      return 'full';
    case 'NONE':
      return 'credit';
    case 'FRACTION':
      return payment.numerator === 1 && payment.denominator === 2 ? 'half' : 'amount';
    case 'AMOUNT':
      return 'amount';
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

const ItemCard = memo(function ItemCard({
  item,
  currency,
  language,
  lineTotalText,
  problemCodes,
  dispatch,
}: ItemCardProps) {
  const { t } = useTranslation();
  const { theme } = useUi();
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
            <View style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 2 }}>
                <TextField
                  label={t('invoices.itemName')}
                  value={item.name}
                  onChangeText={(name) => update({ name })}
                  error={
                    has('itemName') && item.name.trim() === '' ? t('errors.required') : undefined
                  }
                  testID={`invoice-item-name-${item.key}`}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('invoices.unit')}
                  value={item.unit}
                  onChangeText={(unit) => update({ unit })}
                  testID={`invoice-item-unit-${item.key}`}
                />
              </View>
            </View>
          )}
          <IconButton
            icon="close"
            accessibilityLabel={`${t('invoices.removeItem')}: ${item.name}`}
            onPress={() => dispatch({ type: 'removeItem', key: item.key })}
            tone="secondary"
          />
        </Row>
        <Row gap="md">
          <Box flex>
            <QuantityField
              label={t('invoices.quantity')}
              value={item.qtyMilli}
              onChange={(qtyMilli) => update({ qtyMilli })}
              unit={item.unit}
              locale={language}
              error={has('itemQuantity') ? t('errors.required') : undefined}
              testID={`invoice-item-qty-${item.key}`}
            />
          </Box>
          <Box flex>
            <AmountField
              label={t('invoices.price')}
              value={item.unitPrice}
              onChange={(unitPrice) => update({ unitPrice })}
              locale={language}
              currency={currency}
              error={has('itemPrice') ? t('errors.invalidAmount') : undefined}
              testID={`invoice-item-price-${item.key}`}
            />
          </Box>
        </Row>
        {lineTotalText ? (
          <Row justify="end">
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
  problems: readonly DraftProblem[];
}

export function InvoiceEditor({ app, draft, dispatch, problems }: InvoiceEditorProps) {
  const { t } = useTranslation();
  const { theme } = useUi();
  const language = useLanguage();
  const { shop, format } = app;
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const isDark = theme.scheme === 'dark';

  const customerQuery = useLiveQuery(
    `invoice-customer-info:${draft.customerId ?? ''}`,
    ['customers', 'ledgerEntries'],
    (orm) => (draft.customerId ? findCustomer(orm, draft.customerId) : Promise.resolve(null)),
  );
  const customerInfo = customerQuery.status === 'ready' ? customerQuery.data : null;

  const mode = paymentMode(draft.payment);
  const totals = draftTotals(draft);
  const overLimit =
    customerInfo &&
    customerInfo.customer.creditLimit !== null &&
    totals &&
    creditStatus(
      customerInfo.balance + totals.dueAmount,
      customerInfo.customer.creditLimit,
    ) === 'over';

  const setMode = (next: PaymentMode) => {
    const payments: Record<PaymentMode, PaymentInstruction> = {
      full: { type: 'FULL' },
      half: { type: 'FRACTION', numerator: 1, denominator: 2 },
      amount: { type: 'AMOUNT', amount: totals?.paidAmount ?? 0 },
      credit: { type: 'NONE' },
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
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text tone="secondary">{label}</Text>
      <Text variant="amount" tone={tone ?? 'primary'}>
        {format.money(amount)}
      </Text>
    </View>
  );

  return (
    <Box gap="lg">
      {generalProblems.map((problem) => (
        <Banner key={problem.code} tone="danger" title={t(`invoices.problems.${problem.code}`)} />
      ))}

      {/* Customer Header */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          CUSTOMER
        </Text>
        <ConfidenceHighlight confidence={draft.customerConfidence ?? 1}>
          <ListItem
            title={draft.customerName ?? t('common.walkIn')}
            subtitle={draft.customerId ? undefined : 'Tap to change'}
            leading={
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.full,
                  backgroundColor: isDark ? 'rgba(74, 222, 128, 0.15)' : '#DCFCE7',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="customer" tone="success" size="md" />
              </View>
            }
            onPress={() => setCustomerPickerOpen(true)}
            showChevron
            group="only"
            testID="invoice-customer"
          />
        </ConfidenceHighlight>
      </View>

      {overLimit && customerInfo && customerInfo.customer.creditLimit !== null ? (
        <Banner
          tone="warning"
          title={t('invoices.overLimit', {
            name: customerInfo.customer.name,
            limit: format.money(customerInfo.customer.creditLimit),
          })}
        />
      ) : null}

      {/* Items Section */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          ITEMS
        </Text>
        {draft.items.length === 0 ? (
          <Card padding="xl" gap="lg">
            <Text variant="body" tone="secondary" align="center">
              No items yet
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Product"
                  icon="add"
                  onPress={() => setProductPickerOpen(true)}
                  testID="invoice-add-product"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Type item"
                  icon="edit"
                  variant="secondary"
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
              </View>
            </View>
          </Card>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
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
            <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Product"
                  icon="add"
                  onPress={() => setProductPickerOpen(true)}
                  testID="invoice-add-product"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Type item"
                  icon="edit"
                  variant="secondary"
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
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Payment Now */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="overline" tone="secondary">
          PAYMENT NOW
        </Text>
        <SegmentedControl<PaymentMode>
          accessibilityLabel="Payment now"
          value={mode}
          options={[
            { value: 'full', label: t('invoices.pay.full') },
            { value: 'half', label: t('invoices.pay.half') },
            { value: 'amount', label: t('invoices.pay.amount') },
            { value: 'credit', label: t('invoices.pay.none') },
          ]}
          onChange={setMode}
          testID="invoice-payment-mode"
        />
        {mode === 'amount' ? (
          <View style={{ marginTop: theme.spacing.sm }}>
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
          </View>
        ) : null}
      </View>

      {/* Discount */}
      <View style={{ gap: theme.spacing.xs }}>
        <AmountField
          label="DISCOUNT (OPTIONAL)"
          value={draft.discount === 0 ? null : draft.discount}
          onChange={(discount) => dispatch({ type: 'setDiscount', discount: discount ?? 0 })}
          locale={language}
          currency={shop.currencyCode}
          optional={false}
          testID="invoice-discount"
        />
      </View>

      {/* Totals Summary */}
      {totals ? (
        <View testID="invoice-totals" style={{ gap: 2, paddingVertical: theme.spacing.xs }}>
          {totalLine(t('invoices.subtotal'), totals.subtotal)}
          {totalLine(t('invoices.discount'), Money.negate(totals.discount))}
          {totalLine(t('invoices.paid'), totals.paidAmount, 'paid')}
          {totalLine(t('invoices.due'), totals.dueAmount)}
        </View>
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
