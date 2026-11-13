import { useLocalSearchParams } from 'expo-router';

import { PaymentFormScreen } from '@/features/ledger';

export default function NewPaymentRoute() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  return <PaymentFormScreen customerId={customerId} />;
}
