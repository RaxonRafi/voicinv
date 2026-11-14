'use client';

import { Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';

import { ButtonLink, Chip, EmptyState, SearchField } from '@/components';
import { Money } from '@/domain';

import { useApp, useNow } from '../app-context';
import { type InvoiceListRow, listInvoices } from '../data/selectors';
import { relativeDay, startOfDay } from '../format';
import { Screen } from '../shell/screen';
import { InvoiceRow } from './parts';

type Filter = 'all' | 'paid' | 'due' | 'partial';

function matches(row: InvoiceListRow, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'paid':
      return row.status === 'PAID';
    case 'due':
      return row.status === 'DUE';
    case 'partial':
      return row.status === 'PARTLY_PAID';
  }
}

interface DayGroup {
  day: number;
  rows: InvoiceListRow[];
  /** Sales of the day, cancelled invoices left out. */
  total: number;
}

function groupByDay(rows: readonly InvoiceListRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const day = startOfDay(row.invoice.date);
    let group = groups.at(-1);
    if (!group || group.day !== day) {
      group = { day, rows: [], total: 0 };
      groups.push(group);
    }
    group.rows.push(row);
    if (row.status !== 'CANCELLED') group.total = Money.add(group.total, row.invoice.total);
  }
  return groups;
}

export function InvoiceListScreen() {
  const { t, state, fmt, path, fill } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const rows = listInvoices(state.data, { search }).filter((row) => matches(row, filter));
  const groups = groupByDay(rows);
  const now = useNow();
  const filters: Filter[] = ['all', 'paid', 'due', 'partial'];
  const empty = state.data.invoices.size === 0;

  return (
    <Screen
      title={t.invoices.title}
      actions={
        <span className="hidden sm:inline-flex">
          <ButtonLink
            href={path('invoiceNew')}
            icon={<Plus aria-hidden="true" className="size-5" />}
          >
            {t.invoices.new}
          </ButtonLink>
        </span>
      }
    >
      <SearchField label={t.invoices.searchLabel} value={search} onChange={setSearch} />
      <div role="group" aria-label={t.invoices.filterLabel} className="flex flex-wrap gap-2">
        {filters.map((value) => (
          <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>
            {t.invoices.filters[value]}
          </Chip>
        ))}
      </div>

      {empty ? (
        <EmptyState
          icon={<ReceiptText className="size-6" />}
          title={t.invoices.emptyTitle}
          body={t.invoices.emptyBody}
        />
      ) : rows.length === 0 ? (
        <p className="text-body text-text-secondary">
          {search.trim() === ''
            ? t.invoices.emptyTitle
            : fill(t.invoices.noResults, { query: search.trim() })}
        </p>
      ) : (
        groups.map((group) => {
          const relative = relativeDay(group.day, now);
          const label =
            relative === 'today'
              ? t.common.today
              : relative === 'yesterday'
                ? t.common.yesterday
                : null;
          const heading = label ? `${label} · ${fmt.dayMonth(group.day)}` : fmt.date(group.day);
          return (
            <section key={group.day} aria-label={heading} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-4 text-overline text-text-secondary uppercase">
                <h2>{heading}</h2>
                <span className="tabular-nums">{fmt.money(group.total)}</span>
              </div>
              <ul className="flex flex-col gap-3">
                {group.rows.map((row) => (
                  <li key={row.invoice.id}>
                    <InvoiceRow row={row} showDay={false} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <div className="fixed right-4 bottom-24 z-(--vl-z-raised) sm:hidden">
        <ButtonLink
          href={path('invoiceNew')}
          size="lg"
          icon={<Plus aria-hidden="true" className="size-6" />}
        >
          {t.invoices.new}
        </ButtonLink>
      </div>
    </Screen>
  );
}
