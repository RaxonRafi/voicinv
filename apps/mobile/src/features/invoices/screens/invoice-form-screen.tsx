import { router } from 'expo-router';
import { useReducer, useState } from 'react';
import { View } from 'react-native';

import { useLiveQuery } from '@/core/db';
import { isLanguage, useTranslation } from '@/core/i18n';
import { type ShopContext, useShopContext } from '@/core/services';
import { useUi } from '@/core/ui/use-ui';
import {
  Box,
  Button,
  EmptyState,
  IconButton,
  Screen,
  ScreenHeader,
  showToast,
  Spinner,
  Text,
  TextField,
} from '@/core/ui';
import { isDomainError } from '@/core/utils';
import { findCustomer } from '@/features/customers';
import { detectAndSaveCorrections } from '@/features/voice';

import { InvoiceEditor } from '../components/invoice-editor';
import { VoiceDraftSummary } from '../components/voice-draft-summary';
import {
  draftFromInvoice,
  type DraftProblem,
  draftProblems,
  draftReducer,
  draftToInput,
  draftTotals,
  emptyDraft,
  type InvoiceDraft,
} from '../draft';
import { type InvoiceGuard } from '../usecases';
import { createInvoice, editInvoice, getInvoiceDetails } from '../usecases';

interface InvoiceFormProps {
  app: ShopContext;
  initialDraft: InvoiceDraft;
  invoiceId?: string;
  guard?: InvoiceGuard;
}

function InvoiceForm({ app, initialDraft, invoiceId, guard }: InvoiceFormProps) {
  const { t } = useTranslation();
  const { theme } = useUi();
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [reason, setReason] = useState('');
  const fromVoice = invoiceId === undefined && initialDraft.sourceText !== null;
  const [view, setView] = useState<'summary' | 'edit'>(() =>
    fromVoice && draftProblems(initialDraft).length === 0 ? 'summary' : 'edit',
  );
  const [attempted, setAttempted] = useState(fromVoice);
  const [saving, setSaving] = useState(false);
  const isDark = theme.scheme === 'dark';

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
            // Non-fatal
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

  const totals = draftTotals(draft);

  if (view === 'summary' && totals) {
    return (
      <Screen
        testID="invoice-confirm-screen"
        footer={
          <Box gap="sm">
            <Button
              label={t('invoices.save')}
              icon="check"
              onPress={() => void save()}
              loading={saving}
              fullWidth
              testID="invoice-save"
            />
            <Button
              label={t('invoices.editDetails')}
              icon="edit"
              variant="ghost"
              onPress={() => setView('edit')}
              disabled={saving}
              fullWidth
              testID="invoice-edit-details"
            />
          </Box>
        }
      >
        <ScreenHeader title={t('invoices.confirmTitle')} />
        <VoiceDraftSummary app={app} draft={draft} totals={totals} />
      </Screen>
    );
  }

  return (
    <Screen
      testID="invoice-form-screen"
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.lg }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="secondary">
              TOTAL
            </Text>
            <Text variant="title">
              {totals ? app.format.money(totals.total) : '৳0'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Save invoice"
              icon="check"
              onPress={() => void save()}
              loading={saving}
              testID="invoice-save"
            />
          </View>
        </View>
      }
    >
      <ScreenHeader
        title={invoiceId ? t('invoices.edit') : 'New invoice'}
        right={
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.full,
              backgroundColor: isDark ? 'rgba(74, 222, 128, 0.15)' : '#DCFCE7',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconButton
              icon="mic"
              accessibilityLabel="Voice input"
              onPress={() => {}}
              tone={isDark ? 'primary' : 'primary'}
            />
          </View>
        }
      />
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
  invoiceId?: string;
  customerId?: string;
  initialDraft?: InvoiceDraft;
  guard?: InvoiceGuard;
}

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
  const title = invoiceId ? t('invoices.edit') : 'New invoice';

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
