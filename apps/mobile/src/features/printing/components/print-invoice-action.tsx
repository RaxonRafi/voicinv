import { useState } from 'react';

import { useTranslation } from '@/core/i18n';
import { type ShopContext } from '@/core/services';
import { Button } from '@/core/ui';
import { type InvoiceDetails } from '@/features/invoices';

import { PrintInvoiceDialog } from './print-invoice-dialog';

export interface PrintInvoiceActionProps {
  app: ShopContext;
  details: InvoiceDetails;
}

export function PrintInvoiceAction({ app, details }: PrintInvoiceActionProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        label={t('printing.printReceipt')}
        icon="printer"
        onPress={() => setDialogOpen(true)}
        testID="invoice-print-button"
      />
      <PrintInvoiceDialog
        app={app}
        details={details}
        visible={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
