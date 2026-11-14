import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { type ShopContext } from '@/core/services';
import {
  Banner,
  Box,
  Card,
  ConfidenceHighlight,
  Divider,
  Icon,
  ListItem,
  Row,
  Text,
} from '@/core/ui';
import { findCustomer } from '@/features/customers';
import { creditStatus } from '@/features/ledger';
import { type InvoiceTotals, Money } from '@/shared';

import { type InvoiceDraft } from '../draft';

export interface VoiceDraftSummaryProps {
  app: ShopContext;
  draft: InvoiceDraft;
  /** Totals of the draft, computed the same way as saving. */
  totals: InvoiceTotals;
}

/**
 * A spoken invoice, ready to save: who it is for, each line and what is paid and due. Values
 * the parser was unsure about are highlighted (AGENTS.md §9), so a quick look is enough
 * before the one tap that saves it.
 */
export function VoiceDraftSummary({ app, draft, totals }: VoiceDraftSummaryProps) {
  const { t } = useTranslation();
  const { format } = app;
  // Same check as the full editor: a sale on credit must not hide a credit-limit warning.
  const customer = useLiveQuery(
    `voice-summary-customer:${draft.customerId ?? ''}`,
    ['customers', 'ledgerEntries'],
    (orm) => (draft.customerId ? findCustomer(orm, draft.customerId) : Promise.resolve(null)),
  );
  const info = customer.status === 'ready' ? customer.data : null;
  const limit = info?.customer.creditLimit ?? null;
  const overLimit =
    info !== null &&
    limit !== null &&
    creditStatus(Money.add(info.balance, totals.dueAmount), limit) === 'over';

  return (
    <Box gap="md" testID="voice-draft-summary">
      {draft.sourceText ? (
        <Text tone="secondary" testID="voice-summary-heard">
          {t('invoices.heard', { text: draft.sourceText })}
        </Text>
      ) : null}

      <ConfidenceHighlight confidence={draft.customerConfidence ?? 1}>
        <Card padding="none">
          <ListItem
            title={draft.customerName ?? t('common.walkIn')}
            leading={<Icon name="customer" tone="secondary" />}
            testID="voice-summary-customer"
          />
        </Card>
      </ConfidenceHighlight>
      {overLimit && info && limit !== null ? (
        <Banner
          tone="warning"
          title={t('invoices.overLimit', { name: info.customer.name, limit: format.money(limit) })}
        />
      ) : null}

      <Card padding="none" gap="none">
        {draft.items.map((item, index) => (
          <Box key={item.key}>
            {index > 0 ? <Divider /> : null}
            <ConfidenceHighlight confidence={item.confidence ?? 1}>
              <ListItem
                title={item.name}
                subtitle={t('invoices.lineSummary', {
                  qty: format.quantity(item.qtyMilli ?? 0),
                  unit: item.unit,
                  price: format.money(item.unitPrice ?? 0),
                })}
                trailing={
                  <Text variant="amount">{format.money(totals.lineTotals[index] ?? 0)}</Text>
                }
                testID={`voice-summary-line-${index}`}
              />
            </ConfidenceHighlight>
          </Box>
        ))}
      </Card>

      <ConfidenceHighlight confidence={draft.paymentConfidence ?? 1}>
        <Card gap="sm">
          {totals.discount > 0 ? (
            <Row justify="between">
              <Text tone="secondary">{t('invoices.discount')}</Text>
              <Text variant="amount">{format.money(totals.discount)}</Text>
            </Row>
          ) : null}
          <Row justify="between">
            <Text variant="bodyStrong">{t('invoices.total')}</Text>
            <Text variant="title" testID="voice-summary-total">
              {format.money(totals.total)}
            </Text>
          </Row>
          <Row justify="between">
            <Text tone="paid">{t('invoices.paid')}</Text>
            <Text variant="amount" tone="paid">
              {format.money(totals.paidAmount)}
            </Text>
          </Row>
          {totals.dueAmount > 0 ? (
            <Row justify="between">
              <Text tone="due">{t('invoices.due')}</Text>
              <Text variant="amount" tone="due" testID="voice-summary-due">
                {format.money(totals.dueAmount)}
              </Text>
            </Row>
          ) : null}
        </Card>
      </ConfidenceHighlight>
    </Box>
  );
}
