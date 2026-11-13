import { useLocalSearchParams } from 'expo-router';

import { InvoiceDetailScreen } from '@/features/invoices';

export default function InvoiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InvoiceDetailScreen invoiceId={id} />;
}
