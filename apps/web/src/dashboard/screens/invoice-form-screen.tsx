'use client';

import { Check, ChevronRight, Mic, PencilLine, Plus, Trash2, UserRound } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useReducer, useRef, useState } from 'react';

import {
  Button,
  Card,
  IconButton,
  Notice,
  Overline,
  Segmented,
  showToast,
  SummaryRow,
  TextAreaField,
  TextField,
  Tile,
} from '@/components';
import { LOW_CONFIDENCE_THRESHOLD, Money } from '@/domain';

import { describeError, useApp, useOnline } from '../app-context';
import {
  type DraftItem,
  draftFromInvoice,
  type DraftProblem,
  draftProblems,
  draftReducer,
  draftToInput,
  draftTotals,
  emptyDraft,
  type InvoiceDraft,
  itemForProduct,
} from '../data/draft';
import { createInvoice, editInvoice } from '../data/invoices';
import { creditStatus, findCustomer, getInvoiceDetails } from '../data/selectors';
import { learnCorrection, takePendingDraft } from '../voice/interpret';
import { VoiceBox } from '../voice/voice-box';
import { Screen, ScreenMessage } from '../shell/screen';
import { Avatar, CustomerPicker, ProductPicker } from './parts';

type PaymentMode = 'full' | 'partial' | 'credit';

const unsure = (confidence: number | undefined) =>
  confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD;

function paymentMode(draft: InvoiceDraft): PaymentMode {
  switch (draft.payment.type) {
    case 'FULL':
      return 'full';
    case 'NONE':
      return 'credit';
    default:
      return 'partial';
  }
}

interface ItemEditorProps {
  item: DraftItem;
  problems: readonly DraftProblem[];
  showProblems: boolean;
  onChange: (changes: Partial<Omit<DraftItem, 'key'>>) => void;
  onRemove: () => void;
}

/** One line of the invoice. Typed text is kept as typed; the draft holds the parsed numbers. */
function ItemEditor({ item, problems, showProblems, onChange, onRemove }: ItemEditorProps) {
  const { t, fmt, fill } = useApp();
  const id = useId();
  const [qtyText, setQtyText] = useState(() => fmt.quantityInput(item.qtyMilli));
  const [priceText, setPriceText] = useState(() => fmt.moneyInput(item.unitPrice));
  const has = (code: DraftProblem['code']) =>
    showProblems &&
    problems.some(
      (problem) => problem.code === code && 'key' in problem && problem.key === item.key,
    );
  const check = unsure(item.confidence);
  const lineTotal =
    item.qtyMilli !== null && item.unitPrice !== null
      ? Money.multiplyByQuantity(item.unitPrice, item.qtyMilli)
      : null;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            id={`${id}-name`}
            label={t.invoices.itemName}
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
            error={has('itemName') ? t.invoices.problems.itemName : undefined}
            attention={check}
            hint={check ? t.voice.checkThis : undefined}
            maxLength={120}
          />
        </div>
        <div className="pt-7">
          <IconButton
            label={fill(t.invoices.removeItem, { name: item.name || t.invoices.itemName })}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </IconButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TextField
          id={`${id}-qty`}
          label={t.invoices.quantity}
          inputMode="decimal"
          value={qtyText}
          onChange={(event) => {
            setQtyText(event.target.value);
            const qtyMilli = fmt.parseQuantity(event.target.value);
            onChange({ qtyMilli: qtyMilli !== null && qtyMilli > 0 ? qtyMilli : null });
          }}
          error={has('itemQuantity') ? t.errors.invalidQuantity : undefined}
          attention={check}
        />
        <TextField
          id={`${id}-unit`}
          label={t.invoices.unit}
          value={item.unit}
          onChange={(event) => onChange({ unit: event.target.value })}
          maxLength={20}
        />
        <div className="col-span-2 sm:col-span-1">
          <TextField
            id={`${id}-price`}
            label={t.invoices.price}
            inputMode="decimal"
            prefix={fmt.symbol}
            value={priceText}
            onChange={(event) => {
              setPriceText(event.target.value);
              onChange({ unitPrice: fmt.parseMoney(event.target.value) });
            }}
            error={has('itemPrice') ? t.errors.invalidAmount : undefined}
            attention={check}
          />
        </div>
      </div>
      {lineTotal !== null ? (
        <p className="self-end text-body-strong tabular-nums text-text-primary">
          {fmt.money(lineTotal)}
        </p>
      ) : null}
    </li>
  );
}

function initialDraft(
  editId: string | null,
  voice: boolean,
  details: ReturnType<typeof getInvoiceDetails>,
): InvoiceDraft {
  if (editId !== null && details) return draftFromInvoice(details);
  if (voice) return takePendingDraft() ?? emptyDraft();
  return emptyDraft();
}

export function InvoiceFormScreen() {
  const { t, state, store, fmt, path, fill } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnline();
  const id = useId();
  const editId = params.get('edit');
  const fromVoice = params.get('voice') === '1';
  const presetCustomer = params.get('customerId');
  const editing = editId !== null ? getInvoiceDetails(state.data, editId) : null;

  const [draft, dispatch] = useReducer(draftReducer, null, () => {
    const start = initialDraft(editId, fromVoice, editing);
    if (editId === null && presetCustomer !== null && start.customerId === null) {
      const found = findCustomer(state.data, presetCustomer);
      if (found)
        return { ...start, customerId: found.customer.id, customerName: found.customer.name };
    }
    return start;
  });
  /** What the voice draft said before the user changed it, to learn from corrections. */
  const heard = useRef<InvoiceDraft | null>(fromVoice ? draft : null);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [pickProduct, setPickProduct] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [discountText, setDiscountText] = useState(() =>
    draft.discount > 0 ? fmt.moneyInput(draft.discount) : '',
  );
  const [paidText, setPaidText] = useState(() =>
    draft.payment.type === 'AMOUNT' ? fmt.moneyInput(draft.payment.amount) : '',
  );
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  // Remounts item editors when the whole draft is replaced (a new voice sentence).
  const [generation, setGeneration] = useState(0);

  if (editId !== null && !editing) {
    return (
      <ScreenMessage
        title={t.invoices.edit}
        backHref={path('invoices')}
        message={t.invoices.notFound}
      />
    );
  }

  const totals = draftTotals(draft);
  const problems = draftProblems(draft);
  const mode = paymentMode(draft);
  const customer = draft.customerId === null ? null : findCustomer(state.data, draft.customerId);
  const projectedBalance =
    customer && totals
      ? Money.add(
          customer.balance,
          Money.subtract(
            totals.dueAmount,
            editing && editing.invoice.customerId === customer.customer.id
              ? editing.invoice.dueAmount
              : 0,
          ),
        )
      : null;
  const overLimit =
    customer &&
    projectedBalance !== null &&
    creditStatus(projectedBalance, customer.customer.creditLimit) === 'over';

  function setMode(next: PaymentMode) {
    if (next === 'full') dispatch({ type: 'setPayment', payment: { type: 'FULL' } });
    else if (next === 'credit') dispatch({ type: 'setPayment', payment: { type: 'NONE' } });
    else {
      const amount = fmt.parseMoney(paidText) ?? totals?.paidAmount ?? 0;
      setPaidText(fmt.moneyInput(amount));
      dispatch({ type: 'setPayment', payment: { type: 'AMOUNT', amount } });
    }
  }

  function replaceDraft(next: InvoiceDraft) {
    heard.current = next;
    dispatch({ type: 'replace', draft: next });
    setDiscountText(next.discount > 0 ? fmt.moneyInput(next.discount) : '');
    setPaidText(next.payment.type === 'AMOUNT' ? fmt.moneyInput(next.payment.amount) : '');
    setGeneration((value) => value + 1);
    setShowVoice(false);
  }

  function learnFromChanges() {
    const before = heard.current;
    if (!before) return;
    if (before.customerName && draft.customerName)
      learnCorrection(before.customerName, draft.customerName, 'customer');
    before.items.forEach((item, index) => {
      const after = draft.items[index];
      if (after) learnCorrection(item.name, after.name, 'product');
    });
  }

  async function save() {
    setAttempted(true);
    setFormError(undefined);
    if (problems.length > 0) return;
    if (editId !== null && reason.trim() === '') {
      setReasonError(t.errors.required);
      return;
    }
    setSaving(true);
    try {
      const input = draftToInput(draft);
      if (editId !== null) {
        await store.commit((data, ctx) => editInvoice(data, ctx, editId, input, reason));
        showToast(t.invoices.updated);
        router.push(path('invoiceView', { id: editId }));
      } else {
        const invoice = await store.commit((data, ctx) =>
          createInvoice(data, ctx, input, ctx.nextInvoiceNumber(data)),
        );
        learnFromChanges();
        showToast(fill(t.invoices.saved, { number: invoice.invoiceNumber }));
        router.push(path('invoiceView', { id: invoice.id }));
      }
    } catch (error) {
      setFormError(describeError(error, t).message);
      setSaving(false);
    }
  }

  const visibleProblems = attempted ? problems : [];
  const generalProblems = visibleProblems.filter((problem) => !('key' in problem));

  return (
    <Screen
      title={editId !== null ? t.invoices.edit : t.invoices.new}
      backHref={editId !== null ? path('invoiceView', { id: editId }) : path('invoices')}
      actions={
        editId === null ? (
          <IconButton
            label={t.voice.title}
            tone="accent"
            aria-expanded={showVoice}
            onClick={() => setShowVoice((open) => !open)}
          >
            <Mic aria-hidden="true" className="size-6" />
          </IconButton>
        ) : undefined
      }
      footer={
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <Overline>{t.invoices.total}</Overline>
            <span className="text-title tabular-nums text-text-primary wrap-anywhere">
              {fmt.money(totals?.total ?? 0)}
            </span>
          </div>
          <Button
            size="lg"
            loading={saving}
            disabled={!online}
            icon={<Check aria-hidden="true" className="size-6" />}
            onClick={() => void save()}
          >
            {t.invoices.save}
          </Button>
        </>
      }
    >
      {showVoice ? <VoiceBox variant="inline" onSale={replaceDraft} /> : null}
      {draft.sourceText && fromVoice ? (
        <p className="rounded-xl bg-bg-accent p-4 text-body text-text-primary">
          {fill(t.voice.heard, { text: draft.sourceText })}
        </p>
      ) : null}

      <section aria-labelledby={`${id}-customer`} className="flex flex-col gap-3">
        <Overline level={2} className="">
          <span id={`${id}-customer`}>{t.invoices.customer}</span>
        </Overline>
        <button
          type="button"
          onClick={() => setPickCustomer(true)}
          className="flex min-h-16 items-center gap-4 rounded-2xl bg-bg-surface px-4 py-3 text-left shadow-sm hover:bg-bg-sunken sm:px-6"
        >
          {draft.customerName ? (
            <Avatar name={draft.customerName} />
          ) : (
            <Tile shape="round">
              <UserRound className="size-6" />
            </Tile>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-strong text-text-primary">
              {draft.customerName ?? t.common.walkIn}
            </span>
            <span
              className={
                unsure(draft.customerConfidence)
                  ? 'text-label text-confidence-low'
                  : 'text-body text-text-secondary'
              }
            >
              {unsure(draft.customerConfidence) ? t.voice.checkThis : t.invoices.tapToChange}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 text-text-secondary" />
        </button>
        {overLimit && customer?.customer.creditLimit != null ? (
          <Notice tone="warning">
            {fill(t.invoices.overLimit, {
              name: customer.customer.name,
              limit: fmt.money(customer.customer.creditLimit),
            })}
          </Notice>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-items`} className="flex flex-col gap-3">
        <Overline level={2}>
          <span id={`${id}-items`}>{t.invoices.items}</span>
        </Overline>
        <Card className="flex flex-col gap-4">
          {draft.items.length === 0 ? (
            <p className="text-center text-body text-text-secondary">{t.invoices.noItems}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-default">
              {draft.items.map((item) => (
                <ItemEditor
                  key={`${generation}-${item.key}`}
                  item={item}
                  problems={problems}
                  showProblems={attempted}
                  onChange={(changes) => dispatch({ type: 'updateItem', key: item.key, changes })}
                  onRemove={() => dispatch({ type: 'removeItem', key: item.key })}
                />
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button
              icon={<Plus aria-hidden="true" className="size-5" />}
              onClick={() => setPickProduct(true)}
            >
              {t.invoices.addProduct}
            </Button>
            <Button
              variant="secondary"
              icon={<PencilLine aria-hidden="true" className="size-5" />}
              onClick={() =>
                dispatch({
                  type: 'addItem',
                  item: { productId: null, name: '', unit: '', qtyMilli: 1000, unitPrice: null },
                })
              }
            >
              {t.invoices.typeItem}
            </Button>
          </div>
        </Card>
      </section>

      <section aria-labelledby={`${id}-payment`} className="flex flex-col gap-3">
        <Overline level={2}>
          <span id={`${id}-payment`}>{t.invoices.payment}</span>
        </Overline>
        <Segmented<PaymentMode>
          label={t.invoices.payment}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'full', label: t.invoices.pay.full },
            { value: 'partial', label: t.invoices.pay.partial },
            { value: 'credit', label: t.invoices.pay.credit },
          ]}
        />
        {unsure(draft.paymentConfidence) ? (
          <p className="text-label text-confidence-low">{t.voice.checkThis}</p>
        ) : null}
        {mode === 'partial' ? (
          <TextField
            id={`${id}-paid`}
            label={t.invoices.amountPaid}
            inputMode="decimal"
            prefix={fmt.symbol}
            value={
              draft.payment.type === 'FRACTION' ? fmt.moneyInput(totals?.paidAmount ?? 0) : paidText
            }
            onChange={(event) => {
              setPaidText(event.target.value);
              dispatch({
                type: 'setPayment',
                payment: { type: 'AMOUNT', amount: fmt.parseMoney(event.target.value) ?? 0 },
              });
            }}
            error={
              paidText !== '' && fmt.parseMoney(paidText) === null
                ? t.errors.invalidAmount
                : undefined
            }
          />
        ) : null}
      </section>

      <TextField
        id={`${id}-discount`}
        label={t.invoices.discount}
        optionalLabel={t.common.optional}
        inputMode="decimal"
        prefix={fmt.symbol}
        placeholder="0"
        value={discountText}
        onChange={(event) => {
          setDiscountText(event.target.value);
          dispatch({ type: 'setDiscount', discount: fmt.parseMoney(event.target.value) ?? 0 });
        }}
        error={
          discountText !== '' && fmt.parseMoney(discountText) === null
            ? t.errors.invalidAmount
            : undefined
        }
      />

      <dl className="flex flex-col gap-2 px-2">
        <SummaryRow label={t.invoices.subtotal} value={fmt.money(totals?.subtotal ?? 0)} />
        <SummaryRow
          label={t.invoices.discount}
          value={`-${fmt.money(totals?.discount ?? draft.discount)}`}
        />
        <SummaryRow
          label={t.invoices.paid}
          value={fmt.money(totals?.paidAmount ?? 0)}
          tone="paid"
        />
        <SummaryRow
          label={t.invoices.due}
          value={fmt.money(totals?.dueAmount ?? 0)}
          tone={(totals?.dueAmount ?? 0) > 0 ? 'due' : 'primary'}
        />
        {totals && totals.change > 0 ? (
          <SummaryRow label={t.invoices.change} value={fmt.money(totals.change)} />
        ) : null}
      </dl>

      {editId !== null ? (
        <TextAreaField
          id={`${id}-reason`}
          label={t.invoices.reason}
          hint={t.invoices.reasonHint}
          error={reasonError}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(undefined);
          }}
          maxLength={300}
          rows={2}
        />
      ) : null}

      <div role="alert" className="flex flex-col gap-2">
        {generalProblems.map((problem) => (
          <Notice key={problem.code} tone="danger">
            {t.invoices.problems[problem.code]}
          </Notice>
        ))}
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
      </div>

      <CustomerPicker
        open={pickCustomer}
        allowWalkIn
        onClose={() => setPickCustomer(false)}
        onPick={(picked) => {
          setPickCustomer(false);
          dispatch({
            type: 'setCustomer',
            customer: picked ? { id: picked.id, name: picked.name } : null,
          });
        }}
      />
      <ProductPicker
        open={pickProduct}
        onClose={() => setPickProduct(false)}
        onPick={(product) => {
          setPickProduct(false);
          dispatch({ type: 'addItem', item: itemForProduct(product) });
        }}
      />
    </Screen>
  );
}
