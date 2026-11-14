'use client';

import {
  Banknote,
  BookUser,
  MessageSquareText,
  PencilLine,
  Plus,
  Printer,
  ReceiptText,
  UsersRound,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';

import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  IconLink,
  Notice,
  Overline,
  SearchField,
  showToast,
  StatTile,
  Switch,
  TextAreaField,
  TextField,
} from '@/components';

import { describeError, useApp, useOnline } from '../app-context';
import { createCustomer, editCustomer } from '../data/catalog';
import { recordPayment } from '../data/ledger';
import {
  creditStatus,
  findCustomer,
  getStatement,
  listCustomerAliases,
  listCustomers,
  listInvoices,
  receivables,
} from '../data/selectors';
import { parseAliasList } from '../data/text';
import { StatementDocument } from '../documents/documents';
import { printDocument } from '../documents/print';
import { shareText } from '../documents/share';
import { Screen, ScreenMessage } from '../shell/screen';
import { Avatar, InvoiceRow, Row } from './parts';

function BalanceText({ balance }: { balance: number }) {
  const { t, fmt } = useApp();
  if (balance > 0) {
    return (
      <>
        <span className="text-amount tabular-nums text-money-due">{fmt.money(balance)}</span>
        <span className="text-label text-text-secondary">{t.customers.due}</span>
      </>
    );
  }
  if (balance < 0) {
    return (
      <>
        <span className="text-amount tabular-nums text-money-paid">{fmt.money(-balance)}</span>
        <span className="text-label text-text-secondary">{t.customers.advance}</span>
      </>
    );
  }
  return <span className="text-label text-text-secondary">{t.customers.settled}</span>;
}

export function CustomerListScreen() {
  const { t, state, fmt, path, fill } = useApp();
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const rows = listCustomers(state.data, { search, includeArchived: showHidden });
  const { toCollect, advanceHeld } = receivables(state.data);
  const total = listCustomers(state.data, { includeArchived: showHidden }).length;

  return (
    <Screen
      title={t.customers.title}
      actions={
        <span className="hidden sm:inline-flex">
          <ButtonLink
            href={path('customerEdit')}
            icon={<Plus aria-hidden="true" className="size-5" />}
          >
            {t.customers.add}
          </ButtonLink>
        </span>
      }
    >
      <SearchField label={t.customers.searchLabel} value={search} onChange={setSearch} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={t.customers.toCollect}
          value={fmt.money(toCollect)}
          valueTone={toCollect > 0 ? 'due' : 'primary'}
        />
        <StatTile label={t.customers.advanceHeld} value={fmt.money(advanceHeld)} valueTone="paid" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Overline level={2}>
          {fill(total === 1 ? t.customers.countOne : t.customers.countOther, {
            count: fmt.integer(total),
          })}
        </Overline>
        <Switch label={t.customers.showHidden} checked={showHidden} onChange={setShowHidden} />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={<UsersRound className="size-6" />}
          title={t.customers.emptyTitle}
          body={t.customers.emptyBody}
          action={<ButtonLink href={path('customerEdit')}>{t.customers.add}</ButtonLink>}
        />
      ) : rows.length === 0 ? (
        <p className="text-body text-text-secondary">
          {fill(t.customers.noResults, { query: search.trim() })}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ customer, balance }) => (
            <li key={customer.id}>
              <Row
                href={path('customerView', { id: customer.id })}
                leading={<Avatar name={customer.name} />}
                title={
                  customer.isArchived ? `${customer.name} · ${t.customers.hidden}` : customer.name
                }
                subtitle={customer.phone ?? t.customers.noPhone}
                trailing={<BalanceText balance={balance} />}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="fixed right-4 bottom-24 z-(--vl-z-raised) sm:hidden">
        <ButtonLink
          href={path('customerEdit')}
          size="lg"
          icon={<Plus aria-hidden="true" className="size-6" />}
        >
          {t.customers.add}
        </ButtonLink>
      </div>
    </Screen>
  );
}

export function CustomerDetailScreen() {
  const { t, state, shop, fmt, path, fill } = useApp();
  const customerId = useSearchParams().get('id') ?? '';
  const found = findCustomer(state.data, customerId);
  if (!found || !shop) {
    return (
      <ScreenMessage
        title={t.customers.title}
        backHref={path('customers')}
        message={t.customers.notFound}
      />
    );
  }
  const { customer, balance } = found;
  const statement = getStatement(state.data, customer.id);
  const invoices = listInvoices(state.data, { customerId: customer.id, limit: 20 });
  const over = creditStatus(balance, customer.creditLimit) === 'over';

  async function remind() {
    if (!shop) return;
    const outcome = await shareText(
      fill(t.ledger.reminder, {
        customer: customer.name,
        shop: shop.name,
        amount: fmt.money(balance),
      }),
    );
    if (outcome === 'copied') showToast(t.common.copied, 'info');
    if (outcome === 'failed') showToast(t.common.somethingWrong, 'danger');
  }

  function printStatement() {
    if (!shop) return;
    printDocument(
      <StatementDocument
        shop={shop}
        customerName={customer.name}
        lines={statement}
        t={t}
        fmt={fmt}
        now={Date.now()}
      />,
      'a4',
    );
  }

  return (
    <Screen
      title={customer.name}
      backHref={path('customers')}
      actions={
        <IconLink
          href={path('customerEdit', { id: customer.id })}
          label={t.customers.edit}
          tone="raised"
        >
          <PencilLine aria-hidden="true" className="size-6" />
        </IconLink>
      }
    >
      <Card tone="hero" className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} />
          <div className="flex min-w-0 flex-col">
            <p className="text-body text-text-secondary">{customer.phone ?? t.customers.noPhone}</p>
            {customer.notes ? (
              <p className="text-body text-text-secondary wrap-anywhere">{customer.notes}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col">
          <p className="text-body-strong text-text-primary">{t.ledger.balance}</p>
          <p
            className={`text-hero tabular-nums wrap-anywhere ${balance > 0 ? 'text-money-due' : balance < 0 ? 'text-money-paid' : 'text-text-primary'}`}
          >
            {fmt.money(balance < 0 ? -balance : balance)}
          </p>
          <p className="text-body-strong text-text-secondary">
            {balance > 0
              ? t.customers.due
              : balance < 0
                ? t.customers.advance
                : t.customers.settled}
          </p>
        </div>
        {over && customer.creditLimit !== null ? (
          <Notice tone="warning">
            {fill(t.ledger.overLimit, { limit: fmt.money(customer.creditLimit) })}
          </Notice>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ButtonLink
          href={path('paymentNew', { customerId: customer.id })}
          icon={<Banknote aria-hidden="true" className="size-5" />}
        >
          {t.ledger.takePayment}
        </ButtonLink>
        <ButtonLink
          variant="secondary"
          href={path('invoiceNew', { customerId: customer.id })}
          icon={<ReceiptText aria-hidden="true" className="size-5" />}
        >
          {t.ledger.newInvoice}
        </ButtonLink>
        {balance > 0 ? (
          <Button
            variant="secondary"
            icon={<MessageSquareText aria-hidden="true" className="size-5" />}
            onClick={() => void remind()}
          >
            {t.ledger.sendReminder}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          icon={<Printer aria-hidden="true" className="size-5" />}
          onClick={printStatement}
        >
          {t.ledger.printStatement}
        </Button>
      </div>

      <section aria-labelledby="ledger-history" className="flex flex-col gap-3">
        <Overline level={2}>
          <span id="ledger-history">{t.ledger.history}</span>
        </Overline>
        {statement.length === 0 ? (
          <EmptyState icon={<BookUser className="size-6" />} title={t.ledger.noHistory} />
        ) : (
          <ul className="divide-y divide-border-default overflow-hidden rounded-2xl bg-bg-surface shadow-sm">
            {[...statement].reverse().map(({ entry, invoiceNumber, balance: after }) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 px-4 py-3 sm:px-6"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-body-strong text-text-primary">
                    {t.ledger.entries[entry.type]}
                    {invoiceNumber ? (
                      <span className="text-text-secondary"> · {invoiceNumber}</span>
                    ) : null}
                  </span>
                  <span className="text-label text-text-secondary">
                    {fmt.dateTime(entry.createdAt)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span
                    className={`text-body-strong tabular-nums ${entry.amount < 0 ? 'text-money-paid' : 'text-money-due'}`}
                  >
                    {entry.amount < 0
                      ? `−${fmt.money(-entry.amount)}`
                      : `+${fmt.money(entry.amount)}`}
                  </span>
                  <span className="text-label tabular-nums text-text-secondary">
                    {fill(t.ledger.balanceAfter, { balance: fmt.money(after) })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invoices.length > 0 ? (
        <section aria-labelledby="customer-invoices" className="flex flex-col gap-3">
          <Overline level={2}>
            <span id="customer-invoices">{t.invoices.title}</span>
          </Overline>
          <ul className="flex flex-col gap-3">
            {invoices.map((row) => (
              <li key={row.invoice.id}>
                <InvoiceRow row={row} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}

interface CustomerErrors {
  name?: string;
  phone?: string;
  notes?: string;
  creditLimit?: string;
  form?: string;
}

export function CustomerFormScreen() {
  const { t, state, store, fmt, path } = useApp();
  const router = useRouter();
  const online = useOnline();
  const id = useId();
  const customerId = useSearchParams().get('id');
  const existing = customerId === null ? null : findCustomer(state.data, customerId);
  const [name, setName] = useState(existing?.customer.name ?? '');
  const [phone, setPhone] = useState(existing?.customer.phone ?? '');
  const [notes, setNotes] = useState(existing?.customer.notes ?? '');
  const [limit, setLimit] = useState(fmt.moneyInput(existing?.customer.creditLimit ?? null));
  const [aliases, setAliases] = useState(() =>
    customerId === null
      ? ''
      : listCustomerAliases(state.data, customerId)
          .map((row) => row.alias)
          .join(', '),
  );
  const [hidden, setHidden] = useState(existing?.customer.isArchived ?? false);
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [saving, setSaving] = useState(false);

  if (customerId !== null && !existing) {
    return (
      <ScreenMessage
        title={t.customers.edit}
        backHref={path('customers')}
        message={t.customers.notFound}
      />
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const creditLimit = limit.trim() === '' ? null : fmt.parseMoney(limit);
    if (name.trim() === '') return setErrors({ name: t.errors.required });
    if (limit.trim() !== '' && creditLimit === null) {
      return setErrors({ creditLimit: t.errors.invalidAmount });
    }
    setErrors({});
    setSaving(true);
    const input = { name, phone, notes, creditLimit, aliases: parseAliasList(aliases) };
    try {
      const saved = await store.commit((data, ctx) =>
        customerId === null
          ? createCustomer(data, ctx, input)
          : editCustomer(data, ctx, customerId, { ...input, isArchived: hidden }),
      );
      showToast(t.customers.saved);
      router.push(path('customerView', { id: saved.id }));
    } catch (error) {
      const { message, field } = describeError(error, t);
      setErrors(
        field === 'name' || field === 'phone' || field === 'notes' || field === 'creditLimit'
          ? { [field]: message }
          : { form: message },
      );
      setSaving(false);
    }
  }

  return (
    <Screen
      title={customerId === null ? t.customers.new : t.customers.edit}
      backHref={customerId === null ? path('customers') : path('customerView', { id: customerId })}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <TextField
            id={`${id}-name`}
            label={t.customers.name}
            value={name}
            error={errors.name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoComplete="off"
            required
          />
          <TextField
            id={`${id}-phone`}
            label={t.customers.phone}
            optionalLabel={t.common.optional}
            type="tel"
            inputMode="tel"
            value={phone}
            error={errors.phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
          />
          <TextField
            id={`${id}-limit`}
            label={t.customers.creditLimit}
            optionalLabel={t.common.optional}
            hint={t.customers.creditLimitHint}
            inputMode="decimal"
            prefix={fmt.symbol}
            value={limit}
            error={errors.creditLimit}
            onChange={(e) => setLimit(e.target.value)}
          />
          <TextField
            id={`${id}-aliases`}
            label={t.customers.aliases}
            optionalLabel={t.common.optional}
            hint={t.customers.aliasesHint}
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
          <TextAreaField
            id={`${id}-notes`}
            label={t.customers.notes}
            optionalLabel={t.common.optional}
            value={notes}
            error={errors.notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
          />
        </Card>
        {customerId !== null ? (
          <Card className="flex flex-col gap-2">
            <Switch label={t.customers.hide} checked={hidden} onChange={setHidden} />
            <p className="text-body text-text-secondary">{t.customers.hideDescription}</p>
          </Card>
        ) : null}
        <div role="alert">{errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}</div>
        <Button type="submit" size="lg" fullWidth loading={saving} disabled={!online}>
          {t.common.save}
        </Button>
      </form>
    </Screen>
  );
}

export function PaymentFormScreen() {
  const { t, state, store, fmt, path, fill } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnline();
  const id = useId();
  const presetAmount = Number(params.get('amount'));
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '');
  const [amount, setAmount] = useState(() =>
    Number.isSafeInteger(presetAmount) && presetAmount > 0 ? fmt.moneyInput(presetAmount) : '',
  );
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ customer?: string; amount?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const customers = listCustomers(state.data, { includeArchived: false });
  const selected = findCustomer(state.data, customerId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minor = fmt.parseMoney(amount);
    const found: typeof errors = {};
    if (!selected) found.customer = t.errors.required;
    if (minor === null || minor <= 0) found.amount = t.errors.invalidAmount;
    setErrors(found);
    if (Object.keys(found).length > 0 || minor === null || !selected) return;
    setSaving(true);
    try {
      const { balance } = await store.commit((data, ctx) =>
        recordPayment(data, ctx, {
          customerId: selected.customer.id,
          amount: minor,
          note,
          invoiceId: null,
        }),
      );
      const words =
        balance > 0
          ? `${t.customers.due} ${fmt.money(balance)}`
          : balance < 0
            ? `${t.customers.advance} ${fmt.money(-balance)}`
            : t.customers.settled;
      showToast(fill(t.ledger.payment.saved, { balance: words }));
      router.push(path('customerView', { id: selected.customer.id }));
    } catch (error) {
      setErrors({ form: describeError(error, t).message });
      setSaving(false);
    }
  }

  return (
    <Screen
      title={t.ledger.payment.title}
      backHref={selected ? path('customerView', { id: selected.customer.id }) : path('home')}
    >
      {customers.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="size-6" />}
          title={t.ledger.payment.noCustomers}
          action={<ButtonLink href={path('customerEdit')}>{t.customers.add}</ButtonLink>}
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-customer`} className="text-label text-text-primary">
                {t.ledger.payment.customer}
              </label>
              <select
                id={`${id}-customer`}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                aria-invalid={errors.customer ? true : undefined}
                className="min-h-12 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-body text-text-primary"
              >
                <option value="">{t.ledger.payment.chooseCustomer}</option>
                {customers.map(({ customer, balance }) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {balance > 0 ? ` · ${t.customers.due} ${fmt.money(balance)}` : ''}
                  </option>
                ))}
              </select>
              {errors.customer ? (
                <p className="text-label text-status-danger">{errors.customer}</p>
              ) : null}
            </div>
            {selected ? (
              <p className="text-body text-text-secondary">
                {t.ledger.balance}:{' '}
                <span className="text-body-strong tabular-nums text-text-primary">
                  {fmt.money(selected.balance)}
                </span>
              </p>
            ) : null}
            <TextField
              id={`${id}-amount`}
              label={t.ledger.payment.amount}
              inputMode="decimal"
              prefix={fmt.symbol}
              value={amount}
              error={errors.amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <TextField
              id={`${id}-note`}
              label={t.ledger.payment.note}
              optionalLabel={t.common.optional}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </Card>
          <div role="alert">
            {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}
          </div>
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!online}
            icon={<Banknote aria-hidden="true" className="size-6" />}
          >
            {t.ledger.payment.save}
          </Button>
        </form>
      )}
    </Screen>
  );
}
