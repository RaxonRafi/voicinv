import { useLocalSearchParams } from 'expo-router';

import { useShopContext } from '@/core/services';
import { InvoiceDetailScreen } from '@/features/invoices';
import { PrintInvoiceAction } from '@/features/printing';

export default function InvoiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useShopContext();

  return (
    <InvoiceDetailScreen
      invoiceId={id}
      actions={(details) => (app ? <PrintInvoiceAction app={app} details={details} /> : null)}
    />
  );
}
