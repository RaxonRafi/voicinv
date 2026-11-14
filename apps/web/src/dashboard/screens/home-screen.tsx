'use client';

import { Banknote, Plus, ReceiptText, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';

import { ButtonLink, Card, EmptyState, IconLink, StatTile } from '@/components';

import { useApp, useNow } from '../app-context';
import { calculateDateRange, getSalesSummary, listInvoices } from '../data/selectors';
import { Screen } from '../shell/screen';
import { VoiceBox } from '../voice/voice-box';
import { InvoiceRow } from './parts';

export function HomeScreen() {
  const { t, state, shop, fmt, path } = useApp();
  const now = useNow();
  const { start, end } = calculateDateRange('today', now);
  const today = getSalesSummary(state.data, start, end);
  const recent = listInvoices(state.data, { limit: 5 });

  return (
    <Screen
      title={shop?.name ?? ''}
      eyebrow={fmt.weekdayDate(now)}
      actions={
        <IconLink href={path('settings')} label={t.nav.settings} tone="raised">
          <SlidersHorizontal aria-hidden="true" className="size-6" />
        </IconLink>
      }
    >
      <Card tone="hero" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-body-strong text-text-primary">{t.home.salesToday}</p>
          <p className="text-hero tabular-nums text-text-primary wrap-anywhere">
            {fmt.money(today.totalSales)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile tone="glass" label={t.home.collected} value={fmt.money(today.totalPaid)} />
          <StatTile tone="glass" label={t.home.due} value={fmt.money(today.totalDue)} />
          <StatTile tone="glass" label={t.home.invoices} value={fmt.integer(today.invoiceCount)} />
        </div>
      </Card>

      <VoiceBox />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ButtonLink
          href={path('invoiceNew')}
          size="lg"
          icon={<Plus aria-hidden="true" className="size-6" />}
        >
          {t.home.newInvoice}
        </ButtonLink>
        <ButtonLink
          href={path('paymentNew')}
          size="lg"
          variant="secondary"
          icon={<Banknote aria-hidden="true" className="size-6" />}
        >
          {t.home.takePayment}
        </ButtonLink>
      </div>

      <section aria-labelledby="recent-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 id="recent-title" className="text-heading text-text-primary">
            {t.home.recent}
          </h2>
          {recent.length > 0 ? (
            <Link
              href={path('invoices')}
              className="inline-flex min-h-12 items-center rounded-lg px-2 text-body-strong text-text-link hover:underline"
            >
              {t.home.seeAll}
            </Link>
          ) : null}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="size-6" />}
            title={t.home.emptyTitle}
            body={t.home.emptyBody}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {recent.map((row) => (
              <li key={row.invoice.id}>
                <InvoiceRow row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  );
}
