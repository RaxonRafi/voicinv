'use client';

import { Check, ChevronRight, CircleAlert, Clock, ReceiptText, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';

import { Badge, type BadgeTone, cx, Dialog, SearchField, Tile } from '@/components';
import { type Customer, type Product } from '@/domain';

import { useApp, useNow } from '../app-context';
import {
  type InvoiceBadgeStatus,
  type InvoiceListRow,
  listCustomers,
  listProducts,
} from '../data/selectors';
import { initialOf } from '../data/text';
import { statusLabel } from '../documents/documents';
import { relativeDay } from '../format';

const STATUS_STYLE: Readonly<Record<InvoiceBadgeStatus, { tone: BadgeTone; Glyph: typeof Check }>> =
  {
    PAID: { tone: 'success', Glyph: Check },
    PARTLY_PAID: { tone: 'warning', Glyph: Clock },
    DUE: { tone: 'danger', Glyph: CircleAlert },
    CANCELLED: { tone: 'neutral', Glyph: X },
  };

/** Paid / Partly paid / Due / Cancelled, as an icon and a word (never color alone). */
export function StatusBadge({ status }: { status: InvoiceBadgeStatus }) {
  const { t } = useApp();
  const { tone, Glyph } = STATUS_STYLE[status];
  return (
    <Badge tone={tone} icon={<Glyph aria-hidden="true" className="size-4" />}>
      {statusLabel(status, t)}
    </Badge>
  );
}

interface RowProps {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Show a chevron at the end (rows that open a detail screen). */
  chevron?: boolean;
  /** `card` stands alone; `plain` sits in a grouped list. */
  variant?: 'card' | 'plain';
}

/** One tappable row of a list. The whole row is the target; it is at least 48 px tall. */
export function Row({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  variant = 'card',
}: RowProps) {
  const className = cx(
    'flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left sm:px-6',
    'transition-colors duration-(--vl-duration-fast) ease-standard hover:bg-bg-sunken',
    variant === 'card' ? 'rounded-2xl bg-bg-surface shadow-sm' : '',
  );
  const content = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-strong text-text-primary wrap-anywhere">{title}</span>
        {subtitle ? (
          <span className="text-body text-text-secondary wrap-anywhere">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 flex-col items-end gap-1 text-right">{trailing}</span>
      ) : null}
      {chevron ? (
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-text-secondary" />
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/** Rows grouped on one card with dividers between them. */
export function RowGroup({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-border-default overflow-hidden rounded-2xl bg-bg-surface shadow-sm">
      {children}
    </ul>
  );
}

/** An invoice in a list: customer, number and day, total and status. */
export function InvoiceRow({ row, showDay = true }: { row: InvoiceListRow; showDay?: boolean }) {
  const { t, fmt, path } = useApp();
  const { invoice, customerName, status } = row;
  const day = relativeDay(invoice.date, useNow());
  const when =
    day === 'today'
      ? t.common.today
      : day === 'yesterday'
        ? t.common.yesterday
        : fmt.dayMonth(invoice.date);
  return (
    <Row
      href={path('invoiceView', { id: invoice.id })}
      leading={
        <Tile>
          <ReceiptText className="size-6" />
        </Tile>
      }
      title={customerName ?? t.common.walkIn}
      subtitle={
        showDay
          ? `${invoice.invoiceNumber} · ${when}`
          : `${invoice.invoiceNumber} · ${fmt.time(invoice.date)}`
      }
      trailing={
        <>
          <span
            className={cx(
              'text-amount tabular-nums',
              status === 'CANCELLED' ? 'text-money-cancelled line-through' : 'text-text-primary',
            )}
          >
            {fmt.money(invoice.total)}
          </span>
          <StatusBadge status={status} />
        </>
      }
    />
  );
}

/** Round initial of a person, on the action gradient. */
export function Avatar({ name }: { name: string }) {
  return (
    <Tile shape="round" tone="solid">
      {initialOf(name)}
    </Tile>
  );
}

interface CustomerPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (customer: Customer | null) => void;
  /** Offer "Walk-in customer" at the top (invoices); payments always need a customer. */
  allowWalkIn?: boolean;
}

/** Search and pick a customer. Hidden customers are not offered. */
export function CustomerPicker({
  open,
  onClose,
  onPick,
  allowWalkIn = false,
}: CustomerPickerProps) {
  const { t, state, fmt, path } = useApp();
  const [search, setSearch] = useState('');
  const rows = open ? listCustomers(state.data, { search }) : [];
  const pick = (customer: Customer | null) => {
    setSearch('');
    onPick(customer);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.invoices.chooseCustomer}
      closeLabel={t.common.close}
    >
      <SearchField
        label={t.invoices.picker.searchCustomers}
        value={search}
        onChange={setSearch}
        autoFocus
      />
      <RowGroup>
        {allowWalkIn && search === '' ? (
          <li>
            <Row variant="plain" onClick={() => pick(null)} title={t.common.walkIn} />
          </li>
        ) : null}
        {rows.map(({ customer, balance }) => (
          <li key={customer.id}>
            <Row
              variant="plain"
              onClick={() => pick(customer)}
              leading={<Avatar name={customer.name} />}
              title={customer.name}
              subtitle={customer.phone ?? undefined}
              trailing={
                balance > 0 ? (
                  <span className="text-body-strong tabular-nums text-money-due">
                    {fmt.money(balance)}
                  </span>
                ) : undefined
              }
            />
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-6 py-4 text-body text-text-secondary">
            {t.invoices.picker.noCustomers}
          </li>
        ) : null}
        <li>
          <Row
            variant="plain"
            href={path('customerEdit')}
            leading={
              <Tile>
                <UserPlus className="size-6" />
              </Tile>
            }
            title={t.invoices.picker.newCustomer}
          />
        </li>
      </RowGroup>
    </Dialog>
  );
}

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (product: Product) => void;
}

export function ProductPicker({ open, onClose, onPick }: ProductPickerProps) {
  const { t, state, fmt, fill } = useApp();
  const [search, setSearch] = useState('');
  const products = open ? listProducts(state.data, { search }) : [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.invoices.chooseProduct}
      closeLabel={t.common.close}
    >
      <SearchField
        label={t.invoices.picker.searchProducts}
        value={search}
        onChange={setSearch}
        autoFocus
      />
      <RowGroup>
        {products.map((product) => (
          <li key={product.id}>
            <Row
              variant="plain"
              onClick={() => {
                setSearch('');
                onPick(product);
              }}
              leading={<Tile>{initialOf(product.name)}</Tile>}
              title={product.name}
              subtitle={`${fill(t.products.perUnit, { unit: product.unit })} · ${
                product.defaultPrice === null
                  ? t.products.priceAtSale
                  : fmt.money(product.defaultPrice)
              }`}
            />
          </li>
        ))}
        {products.length === 0 ? (
          <li className="px-6 py-4 text-body text-text-secondary">
            {t.invoices.picker.noProducts}
          </li>
        ) : null}
      </RowGroup>
    </Dialog>
  );
}
