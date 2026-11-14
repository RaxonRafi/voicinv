'use client';

import { Check, Download, FileText } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Card,
  EmptyState,
  Overline,
  ProgressBar,
  Segmented,
  showToast,
  Tile,
} from '@/components';
import { Money } from '@/domain';

import { useApp, useNow } from '../app-context';
import { loadReportData, type ReportPeriod } from '../data/selectors';
import { initialOf } from '../data/text';
import { ReportDocument } from '../documents/documents';
import { buildReportCsv, downloadFile } from '../documents/files';
import { printDocument } from '../documents/print';
import { Screen } from '../shell/screen';
import { Avatar } from './parts';

/** Whole percent of `part` in `whole`, without floating point on money. */
function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Money.fraction(100, part, whole);
}

export function ReportsScreen() {
  const { t, state, shop, fmt, fill } = useApp();
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const now = useNow();
  const report = loadReportData(state.data, period, now);
  const { summary, topProducts, topDebtors } = report;
  const periodLabel = {
    today: t.reports.today,
    week: t.reports.thisWeek,
    month: t.reports.thisMonth,
  }[period];
  const topRevenue = topProducts[0]?.revenue ?? 0;

  function exportCsv() {
    const date = new Date(now).toISOString().slice(0, 10);
    downloadFile(
      `voiceledger-report-${period}-${date}.csv`,
      buildReportCsv(report, periodLabel, t, fmt),
      'text/csv;charset=utf-8',
    );
    showToast(t.reports.exported);
  }

  function exportPdf() {
    if (!shop) return;
    printDocument(
      <ReportDocument
        shop={shop}
        report={report}
        periodLabel={periodLabel}
        t={t}
        fmt={fmt}
        now={now}
      />,
      'a4',
    );
  }

  return (
    <Screen title={t.reports.title}>
      <Segmented<ReportPeriod>
        label={t.reports.periodLabel}
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: t.reports.today },
          { value: 'week', label: t.reports.thisWeek },
          { value: 'month', label: t.reports.thisMonth },
        ]}
      />

      <Card tone="hero" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col">
            <p className="text-body-strong text-text-primary">{t.reports.totalSales}</p>
            <p className="text-hero tabular-nums text-text-primary wrap-anywhere">
              {fmt.money(summary.totalSales)}
            </p>
          </div>
          <p className="text-body-strong text-text-primary">
            {fill(
              summary.invoiceCount === 1 ? t.reports.invoiceCountOne : t.reports.invoiceCountOther,
              {
                count: fmt.integer(summary.invoiceCount),
              },
            )}
          </p>
        </div>
        <ProgressBar
          tone="strong"
          percent={percent(summary.totalPaid, summary.totalSales)}
          label={`${fill(t.reports.collected, { amount: fmt.money(summary.totalPaid) })}, ${fill(t.reports.due, { amount: fmt.money(summary.totalDue) })}`}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-strong text-text-primary">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-sm bg-text-primary" />
            {fill(t.reports.collected, { amount: fmt.money(summary.totalPaid) })}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-sm bg-bg-surface/60" />
            {fill(t.reports.due, { amount: fmt.money(summary.totalDue) })}
          </span>
        </div>
      </Card>

      <section aria-labelledby="top-products" className="flex flex-col gap-3">
        <Overline level={2}>
          <span id="top-products">{t.reports.topProducts}</span>
        </Overline>
        {topProducts.length === 0 ? (
          <p className="rounded-2xl bg-bg-surface p-6 text-body text-text-secondary shadow-sm">
            {t.reports.noSales}
          </p>
        ) : (
          <Card className="flex flex-col gap-5">
            {topProducts.map((product) => (
              <div key={`${product.name}|${product.unit}`} className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <Tile>{initialOf(product.name)}</Tile>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-strong text-text-primary wrap-anywhere">
                      {product.name}
                    </span>
                    <span className="text-body text-text-secondary">
                      {fill(t.reports.sold, {
                        quantity: fmt.quantity(product.qtyMilli),
                        unit: product.unit,
                      })}
                    </span>
                  </div>
                  <span className="text-amount tabular-nums text-text-primary">
                    {fmt.money(product.revenue)}
                  </span>
                </div>
                <ProgressBar
                  percent={percent(product.revenue, topRevenue)}
                  label={fmt.money(product.revenue)}
                />
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-labelledby="top-debtors" className="flex flex-col gap-3">
        <Overline level={2}>
          <span id="top-debtors">{t.reports.topDebtors}</span>
        </Overline>
        {topDebtors.length === 0 ? (
          <EmptyState
            icon={<Check className="size-6" />}
            title={t.reports.noDuesTitle}
            body={t.reports.noDuesBody}
          />
        ) : (
          <ul className="divide-y divide-border-default overflow-hidden rounded-2xl bg-bg-surface shadow-sm">
            {topDebtors.map((debtor) => (
              <li key={debtor.customerId} className="flex items-center gap-4 px-4 py-3 sm:px-6">
                <Avatar name={debtor.name} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-strong text-text-primary">{debtor.name}</span>
                  {debtor.phone ? (
                    <span className="text-body text-text-secondary">{debtor.phone}</span>
                  ) : null}
                </span>
                <span className="text-amount tabular-nums text-money-due">
                  {fmt.money(debtor.balance)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="lg"
          icon={<Download aria-hidden="true" className="size-5" />}
          onClick={exportCsv}
        >
          {t.reports.exportCsv}
        </Button>
        <Button
          size="lg"
          icon={<FileText aria-hidden="true" className="size-5" />}
          onClick={exportPdf}
        >
          {t.reports.exportPdf}
        </Button>
      </div>
    </Screen>
  );
}
