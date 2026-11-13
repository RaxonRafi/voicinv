import { ArrowDown, Clock, Mic } from 'lucide-react';

import { getContent } from '@/content';
import { formatMoney } from '@/lib/format';
import { type Locale } from '@/lib/locales';

import { Badge, Card, Text } from './ui';

// The example sale, in integer minor units (paisa): 2 bags of rice at 2,500 each, half paid.
const UNIT_PRICE = 250_000;
const QUANTITY = 2;
const TOTAL = UNIT_PRICE * QUANTITY;
const PAID = UNIT_PRICE; // "paid half" of two bags is the price of one
const DUE = TOTAL - PAID;

/** Illustration of the core loop: a spoken sentence becomes an invoice with paid and due amounts. */
export function VoiceDemo({ locale }: { locale: Locale }) {
  const { demo } = getContent(locale).home;
  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption className="sr-only">{demo.caption}</figcaption>

      <div className="flex w-full items-start gap-3 rounded-lg bg-bg-sunken p-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-action-primary text-text-on-action">
          <Mic aria-hidden="true" className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <Text size="label">{demo.youSay}</Text>
          <Text tone="primary" className="text-body-strong">
            {demo.spoken}
          </Text>
        </div>
      </div>

      <ArrowDown aria-hidden="true" className="size-6 text-text-secondary" />

      <Card elevation="raised" className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text tone="primary" className="text-body-strong">
            {demo.draftTitle}
          </Text>
          <Badge tone="warning" icon={<Clock aria-hidden="true" className="size-4" />}>
            {demo.status}
          </Badge>
        </div>

        <dl className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-label text-text-secondary">{demo.customerLabel}</dt>
            <dd className="text-body-strong text-text-primary">{demo.customerName}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-border-default pt-3">
            <dt className="text-body text-text-primary">
              {demo.itemName} <span className="text-text-secondary">· {demo.itemQuantity}</span>
            </dt>
            <dd className="text-body-strong tabular-nums text-text-primary">
              {formatMoney(locale, TOTAL)}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-border-default pt-3">
            <dt className="text-body-strong text-text-primary">{demo.totalLabel}</dt>
            <dd className="text-amount tabular-nums text-text-primary">
              {formatMoney(locale, TOTAL)}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-body text-text-secondary">{demo.paidLabel}</dt>
            <dd className="text-amount tabular-nums text-money-paid">
              {formatMoney(locale, PAID)}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-body text-text-secondary">{demo.dueLabel}</dt>
            <dd className="text-amount tabular-nums text-money-due">{formatMoney(locale, DUE)}</dd>
          </div>
        </dl>
      </Card>
    </figure>
  );
}
