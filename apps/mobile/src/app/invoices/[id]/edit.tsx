import { useLocalSearchParams } from 'expo-router';

import { InvoiceFormScreen } from '@/features/invoices';

export default function EditInvoiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InvoiceFormScreen invoiceId={id} />;
}
