import { useTranslation } from '@/core/i18n';
import { Badge, type BadgeTone } from '@/core/ui';

import { type InvoiceBadgeStatus } from '../types';

const TONE: Record<InvoiceBadgeStatus, BadgeTone> = {
  PAID: 'paid',
  PARTLY_PAID: 'partlyPaid',
  DUE: 'due',
  CANCELLED: 'cancelled',
};

/** Paid / Partly paid / Due / Cancelled, as an icon plus translated text. */
export function InvoiceStatusBadge({ status }: { status: InvoiceBadgeStatus }) {
  const { t } = useTranslation();
  const label: Record<InvoiceBadgeStatus, string> = {
    PAID: t('status.paid'),
    PARTLY_PAID: t('status.partlyPaid'),
    DUE: t('status.due'),
    CANCELLED: t('status.cancelled'),
  };
  return <Badge tone={TONE[status]} label={label[status]} />;
}
