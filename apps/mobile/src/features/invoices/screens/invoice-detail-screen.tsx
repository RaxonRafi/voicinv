import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';

import { type PageFormat } from '@/core/documents';
import { useLiveQuery } from '@/core/db';
import { useTranslation } from '@/core/i18n';
import { type ShopContext, useShopContext } from '@/core/services';
import {
  Box,
  Button,
  Card,
  Dialog,
  Divider,
  EmptyState,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  Select,
  showToast,
  Spinner,
  Text,
  TextField,
} from '@/core/ui';

import { InvoiceStatusBadge } from '../components/invoice-status-badge';
import { useInvoiceDocument } from '../share';
import { type InvoiceDetails } from '../types';
import { cancelInvoice, getInvoiceDetails, invoiceBadgeStatus } from '../usecases';

const FORMATS: readonly PageFormat[] = ['a4', 'thermal80', 'thermal58'];

interface InvoiceViewProps {
  app: ShopContext;
  details: InvoiceDetails;
  /** Extra actions from other features, e.g. Bluetooth printing. */
  actions?: (details: InvoiceDetails, format: PageFormat) => ReactNode;
}

function InvoiceView({ app, details, actions }: InvoiceViewProps) {
  const { t } = useTranslation();
  const { format } = app;
  const { invoice, items, revisions, customerName, settledLater } = details;
  const document = useInvoiceDocument(app);
  const [paper, setPaper] = useState<PageFormat>('a4');
  const [sharing, setSharing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const status = invoiceBadgeStatus(invoice, settledLater);
  const active = invoice.status === 'ACTIVE';

  const share = async () => {
    setSharing(true);
    try {
      await document.sharePdf(details, paper);
    } catch {
      showToast(t('invoices.shareFailed'), 'danger');
    } finally {
      setSharing(false);
    }
  };

  const confirmCancel = async () => {
    if (reason.trim() === '') return;
    setCancelling(true);
    try {
      await cancelInvoice(app.ctx, invoice.id, reason);
      setCancelOpen(false);
      setReason('');
      showToast(t('invoices.cancelled'));
    } catch {
      showToast(t('common.somethingWrong'), 'danger');
    } finally {
      setCancelling(false);
    }
  };

  const line = (label: string, value: string, tone?: 'paid' | 'due') => (
    <Row justify="between">
      <Text tone={tone ? 'primary' : 'secondary'}>{label}</Text>
      <Text variant="amount" tone={tone ?? 'primary'}>
        {value}
      </Text>
    </Row>
  );

  return (
    <Screen testID="invoice-detail-screen">
      <ScreenHeader title={invoice.invoiceNumber} />
      <Card>
        <Row justify="between" gap="sm">
          <Text variant="heading" strikethrough={!active} flex>
            {invoice.invoiceNumber}
          </Text>
          <InvoiceStatusBadge status={status} />
        </Row>
        <Text tone="secondary">{format.dateTime(invoice.date)}</Text>
        <Text variant="bodyStrong">{customerName ?? t('common.walkIn')}</Text>
      </Card>

      <SectionHeader title={t('invoices.items')} />
      <Card>
        {items.map((item, index) => (
          <Box key={item.id} gap="xs">
            {index > 0 ? <Divider /> : null}
            <Row justify="between" gap="md">
              <Text flex>{item.nameSnapshot}</Text>
              <Text variant="amount">{format.money(item.lineTotal)}</Text>
            </Row>
            <Text variant="label" tone="secondary">
              {`${format.quantity(item.qtyMilli)} ${item.unit} × ${format.money(item.unitPrice)}`}
            </Text>
          </Box>
        ))}
      </Card>

      <Card elevation="raised" testID="invoice-detail-totals">
        {line(t('invoices.subtotal'), format.money(invoice.subtotal))}
        {invoice.discount > 0
          ? line(t('invoices.discount'), `−${format.money(invoice.discount)}`)
          : null}
        <Divider />
        <Row justify="between">
          <Text variant="bodyStrong">{t('invoices.total')}</Text>
          <Text variant="title">{format.money(invoice.total)}</Text>
        </Row>
        {line(t('invoices.paid'), format.money(invoice.paidAmount), 'paid')}
        {settledLater > 0
          ? line(t('invoices.paidLater'), format.money(settledLater), 'paid')
          : null}
        {line(
          t('invoices.due'),
          format.money(invoice.dueAmount - settledLater),
          invoice.dueAmount - settledLater > 0 ? 'due' : undefined,
        )}
      </Card>

      <Select<PageFormat>
        label={t('invoices.paperSize')}
        value={paper}
        options={FORMATS.map((value) => ({ value, label: t(`invoices.formats.${value}`) }))}
        onChange={setPaper}
        testID="invoice-paper"
      />
      <Button
        label={t('invoices.sharePdf')}
        icon="share"
        onPress={() => void share()}
        loading={sharing}
        testID="invoice-share"
      />
      {actions?.(details, paper)}
      {active ? (
        <>
          <Button
            label={t('invoices.edit')}
            icon="edit"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/invoices/[id]/edit', params: { id: invoice.id } })
            }
            testID="invoice-edit"
          />
          <Button
            label={t('invoices.cancel')}
            icon="ban"
            variant="ghost"
            onPress={() => setCancelOpen(true)}
            testID="invoice-cancel"
          />
        </>
      ) : null}

      {revisions.length > 0 ? (
        <>
          <SectionHeader title={t('invoices.history')} />
          <Card>
            {revisions.map((revision, index) => (
              <Box key={revision.id} gap="xs">
                {index > 0 ? <Divider /> : null}
                <Text>{revision.reason}</Text>
                <Text variant="label" tone="secondary">
                  {format.dateTime(revision.createdAt)}
                </Text>
              </Box>
            ))}
          </Card>
        </>
      ) : null}

      <Dialog
        visible={cancelOpen}
        title={t('invoices.cancelTitle')}
        message={t('invoices.cancelMessage')}
        confirmLabel={t('invoices.cancel')}
        cancelLabel={t('invoices.keep')}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelOpen(false)}
        destructive
        busy={cancelling}
        testID="invoice-cancel-dialog"
      >
        <TextField
          label={t('invoices.cancelReason')}
          value={reason}
          onChangeText={setReason}
          testID="invoice-cancel-reason"
        />
      </Dialog>
    </Screen>
  );
}

export interface InvoiceDetailScreenProps {
  invoiceId: string;
  actions?: InvoiceViewProps['actions'];
}

/** One invoice: lines, totals, sharing, editing and cancelling, with its change history. */
export function InvoiceDetailScreen({ invoiceId, actions }: InvoiceDetailScreenProps) {
  const { t } = useTranslation();
  const app = useShopContext();
  const query = useLiveQuery(
    `invoice:${invoiceId}`,
    ['invoices', 'invoiceItems', 'invoiceRevisions', 'payments', 'customers'],
    (orm) => getInvoiceDetails(orm, invoiceId),
  );

  if (!app || query.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('invoices.invoice')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  if (query.status === 'error' || !query.data) {
    return (
      <Screen>
        <ScreenHeader title={t('invoices.invoice')} />
        <EmptyState icon="error" title={t('errors.notFound')} />
      </Screen>
    );
  }
  return <InvoiceView app={app} details={query.data} actions={actions} />;
}
