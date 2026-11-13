import { useLocalSearchParams } from 'expo-router';

import { InvoiceFormScreen } from '@/features/invoices';

export default function NewInvoiceRoute() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  return <InvoiceFormScreen customerId={customerId} />;
}
