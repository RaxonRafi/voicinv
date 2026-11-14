'use client';

import { Ban, PencilLine, Printer, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';

import {
  Button,
  ButtonLink,
  Card,
  Dialog,
  Notice,
  Overline,
  SelectField,
  showToast,
  SummaryRow,
  TextAreaField,
} from '@/components';
import { Money } from '@/domain';

import { describeError, useApp, useOnline } from '../app-context';
import { cancelInvoice } from '../data/invoices';
import { getInvoiceDetails } from '../data/selectors';
import { InvoiceDocument } from '../documents/documents';
import { PAGE_FORMATS, type PageFormat, printDocument } from '../documents/print';
import { shareText } from '../documents/share';
import { Screen, ScreenMessage } from '../shell/screen';
import { usePaperSize } from './settings-prefs';
import { StatusBadge } from './parts';

export function InvoiceDetailScreen() {
  const { t, state, store, shop, fmt, path, fill, storage } = useApp();
  const online = useOnline();
  const id = useId();
  const invoiceId = useSearchParams().get('id') ?? '';
  const details = getInvoiceDetails(state.data, invoiceId);
  const [paper, setPaper] = usePaperSize(storage);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);

  if (!details || !shop) {
    return (
      <ScreenMessage
        title={t.invoices.invoice}
        backHref={path('invoices')}
        message={t.invoices.notFound}
      />
    );
  }
  const { invoice, items, customerName, status, settledLater, revisions } = details;
  const active = invoice.status === 'ACTIVE';
  const dueNow = Money.max(0, Money.subtract(invoice.dueAmount, settledLater));

  async function share() {
    if (!details || !shop) return;
    const outcome = await shareText(
      fill(t.invoices.shareText, {
        number: invoice.invoiceNumber,
        shop: shop.name,
        total: fmt.money(invoice.total),
        due: fmt.money(dueNow),
      }),
      `${t.invoices.invoice} ${invoice.invoiceNumber}`,
    );
    if (outcome === 'copied') showToast(t.common.copied, 'info');
    if (outcome === 'failed') showToast(t.common.somethingWrong, 'danger');
  }

  function print(format: PageFormat) {
    if (!details || !shop) return;
    printDocument(
      <InvoiceDocument details={details} shop={shop} format={format} t={t} fmt={fmt} watermark />,
      format,
    );
  }

  async function confirmCancel() {
    if (reason.trim() === '') {
      setCancelError(t.errors.required);
      return;
    }
    setCancelling(true);
    try {
      await store.commit((data, ctx) => cancelInvoice(data, ctx, invoiceId, reason));
      setCancelOpen(false);
      setReason('');
      showToast(t.invoices.cancelled);
    } catch (error) {
      setCancelError(describeError(error, t).message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Screen
      title={invoice.invoiceNumber}
      backHref={path('invoices')}
      actions={<StatusBadge status={status} />}
    >
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col">
            <Overline>{t.invoices.customer}</Overline>
            {invoice.customerId ? (
              <Link
                href={path('customerView', { id: invoice.customerId })}
                className="text-heading text-text-link hover:underline"
              >
                {customerName ?? t.common.walkIn}
              </Link>
            ) : (
              <p className="text-heading text-text-primary">{t.common.walkIn}</p>
            )}
          </div>
          <div className="flex flex-col sm:items-end">
            <Overline>{t.invoices.date}</Overline>
            <p className="text-body text-text-primary">{fmt.dateTime(invoice.date)}</p>
          </div>
        </div>

        <ul className="flex flex-col divide-y divide-border-default">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-body-strong text-text-primary wrap-anywhere">
                  {item.nameSnapshot}
                </span>
                <span className="text-body text-text-secondary">
                  {fill(t.invoices.lineSummary, {
                    qty: fmt.quantity(item.qtyMilli),
                    unit: item.unit,
                    price: fmt.money(item.unitPrice),
                  })}
                </span>
              </div>
              <span
                className={`text-body-strong tabular-nums ${active ? 'text-text-primary' : 'text-money-cancelled line-through'}`}
              >
                {fmt.money(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-2 border-t border-border-default pt-4">
          <SummaryRow label={t.invoices.subtotal} value={fmt.money(invoice.subtotal)} />
          {invoice.discount > 0 ? (
            <SummaryRow label={t.invoices.discount} value={`-${fmt.money(invoice.discount)}`} />
          ) : null}
          <SummaryRow label={t.invoices.total} value={fmt.money(invoice.total)} strong />
          <SummaryRow label={t.invoices.paid} value={fmt.money(invoice.paidAmount)} tone="paid" />
          {settledLater > 0 ? (
            <SummaryRow label={t.invoices.paidLater} value={fmt.money(settledLater)} tone="paid" />
          ) : null}
          <SummaryRow
            label={t.invoices.due}
            value={fmt.money(active ? dueNow : 0)}
            tone={active && dueNow > 0 ? 'due' : 'primary'}
          />
        </dl>
        {invoice.sourceText ? (
          <p className="text-body text-text-secondary">
            {fill(t.voice.heard, { text: invoice.sourceText })}
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <SelectField
          id={`${id}-paper`}
          label={t.invoices.paperSize}
          value={paper}
          onChange={(event) => setPaper(event.target.value as PageFormat)}
        >
          {PAGE_FORMATS.map((format) => (
            <option key={format} value={format}>
              {t.invoices.formats[format]}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            icon={<Printer aria-hidden="true" className="size-5" />}
            onClick={() => print(paper)}
          >
            {t.invoices.print}
          </Button>
          <Button
            variant="secondary"
            icon={<Share2 aria-hidden="true" className="size-5" />}
            onClick={() => void share()}
          >
            {t.invoices.share}
          </Button>
        </div>
      </Card>

      {active ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ButtonLink
            variant="secondary"
            href={path('invoiceNew', { edit: invoice.id })}
            icon={<PencilLine aria-hidden="true" className="size-5" />}
          >
            {t.invoices.edit}
          </ButtonLink>
          <Button
            variant="danger"
            disabled={!online}
            icon={<Ban aria-hidden="true" className="size-5" />}
            onClick={() => setCancelOpen(true)}
          >
            {t.invoices.cancel}
          </Button>
        </div>
      ) : null}

      {revisions.length > 0 ? (
        <section aria-labelledby={`${id}-history`} className="flex flex-col gap-3">
          <Overline level={2}>
            <span id={`${id}-history`}>{t.invoices.history}</span>
          </Overline>
          <ul className="flex flex-col gap-2">
            {revisions.map((revision) => (
              <li key={revision.id} className="rounded-xl bg-bg-surface p-4 shadow-sm">
                <p className="text-body-strong text-text-primary">{revision.reason}</p>
                <p className="text-label text-text-secondary">{fmt.dateTime(revision.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t.invoices.cancelTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              {t.invoices.keep}
            </Button>
            <Button variant="danger" loading={cancelling} onClick={() => void confirmCancel()}>
              {t.invoices.cancel}
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">{t.invoices.cancelMessage}</p>
        <TextAreaField
          id={`${id}-reason`}
          label={t.invoices.cancelReason}
          error={cancelError}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setCancelError(undefined);
          }}
          maxLength={300}
          rows={2}
        />
        {!online ? <Notice tone="warning">{t.shell.offline}</Notice> : null}
      </Dialog>
    </Screen>
  );
}
