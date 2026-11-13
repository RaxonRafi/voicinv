import { router } from 'expo-router';
import { useReducer, useState } from 'react';

import { useLiveQuery } from '@/core/db';
import { isLanguage, useTranslation } from '@/core/i18n';
import { type ShopContext, useShopContext } from '@/core/services';
import { Button, EmptyState, Screen, ScreenHeader, showToast, Spinner, TextField } from '@/core/ui';
import { isDomainError } from '@/core/utils';
import { findCustomer } from '@/features/customers';
import { detectAndSaveCorrections } from '@/features/voice';

import { InvoiceEditor } from '../components/invoice-editor';
import {
  draftFromInvoice,
  type DraftProblem,
  draftProblems,
  draftReducer,
  draftToInput,
  emptyDraft,
  type InvoiceDraft,
} from '../draft';
import { type InvoiceGuard } from '../usecases';
import { createInvoice, editInvoice, getInvoiceDetails } from '../usecases';

interface InvoiceFormProps {
  app: ShopContext;
  initialDraft: InvoiceDraft;
  /** Set when editing a saved invoice. */
  invoiceId?: string;
  guard?: InvoiceGuard;
}

function InvoiceForm({ app, initialDraft, invoiceId, guard }: InvoiceFormProps) {
  const { t } = useTranslation();
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const problems: DraftProblem[] = attempted ? draftProblems(draft) : [];
  const reasonMissing = attempted && invoiceId !== undefined && reason.trim() === '';

  const save = async () => {
    setAttempted(true);
    if (draftProblems(draft).length > 0) return;
    if (invoiceId !== undefined && reason.trim() === '') return;
    setSaving(true);
    try {
      const input = draftToInput(draft);
      if (invoiceId !== undefined) {
        await editInvoice(app.ctx, invoiceId, input, reason);
        showToast(t('invoices.updated'));
        router.back();
      } else {
        const invoice = await createInvoice(app.ctx, input, guard);
        if (initialDraft.sourceText) {
          try {
            await app.ctx.db.write(async (tx) => {
              await detectAndSaveCorrections(
                tx,
                initialDraft,
                draft,
                isLanguage(app.shop.defaultLanguage) ? app.shop.defaultLanguage : 'en',
                app.ctx.newId,
                app.ctx.now,
              );
            });
          } catch {
            // Non-fatal correction recording failure
          }
        }
        showToast(t('invoices.saved', { number: invoice.invoiceNumber }));
        router.replace({ pathname: '/invoices/[id]', params: { id: invoice.id } });
      }
    } catch (error) {
      showToast(
        isDomainError(error) && error.code === 'freeLimitReached'
          ? t('errors.freeLimitReached')
          : t('common.somethingWrong'),
        'danger',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      testID="invoice-form-screen"
      footer={
        <Button
          label={t('invoices.save')}
          onPress={() => void save()}
          loading={saving}
          testID="invoice-save"
        />
      }
    >
      <ScreenHeader title={invoiceId ? t('invoices.edit') : t('invoices.new')} />
      <InvoiceEditor app={app} draft={draft} dispatch={dispatch} problems={problems} />
      {invoiceId !== undefined ? (
        <TextField
          label={t('invoices.reason')}
          hint={t('invoices.reasonHint')}
          value={reason}
          onChangeText={setReason}
          error={reasonMissing ? t('errors.required') : undefined}
          testID="invoice-reason"
        />
      ) : null}
    </Screen>
  );
}

export interface InvoiceFormScreenProps {
  /** Edit this invoice instead of creating a new one. */
  invoiceId?: string;
  /** Start a new invoice for this customer. */
  customerId?: string;
  /** Start from a prepared draft (voice). Takes precedence over `customerId`. */
  initialDraft?: InvoiceDraft;
  /** Checked inside the saving transaction, e.g. the free plan's monthly limit. */
  guard?: InvoiceGuard;
}

/** Manual invoice entry, editing a saved invoice, or confirming a prepared draft. */
export function InvoiceFormScreen({
  invoiceId,
  customerId,
  initialDraft,
  guard,
}: InvoiceFormScreenProps) {
  const { t } = useTranslation();
  const app = useShopContext();
  const loaded = useLiveQuery(
    `invoice-form:${invoiceId ?? ''}:${customerId ?? ''}`,
    // Loaded once: later changes must not reset what the user is typing.
    [],
    async (orm): Promise<InvoiceDraft | null> => {
      if (invoiceId) {
        const details = await getInvoiceDetails(orm, invoiceId);
        return details && details.invoice.status === 'ACTIVE' ? draftFromInvoice(details) : null;
      }
      if (initialDraft) return initialDraft;
      const draft = emptyDraft();
      const found = customerId ? await findCustomer(orm, customerId) : null;
      return found
        ? { ...draft, customerId: found.customer.id, customerName: found.customer.name }
        : draft;
    },
  );
  const title = invoiceId ? t('invoices.edit') : t('invoices.new');

  if (!app || loaded.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={title} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  if (loaded.status === 'error' || loaded.data === null) {
    return (
      <Screen>
        <ScreenHeader title={title} />
        <EmptyState icon="error" title={t('errors.notFound')} />
      </Screen>
    );
  }
  return <InvoiceForm app={app} initialDraft={loaded.data} invoiceId={invoiceId} guard={guard} />;
}
