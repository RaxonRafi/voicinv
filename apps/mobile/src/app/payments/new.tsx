import { useLocalSearchParams } from 'expo-router';

import { PaymentFormScreen } from '@/features/ledger';

export default function NewPaymentRoute() {
  const { customerId, initialAmount } = useLocalSearchParams<{
    customerId?: string;
    initialAmount?: string;
  }>();
  const parsedAmount = initialAmount ? parseInt(initialAmount, 10) : undefined;
  return (
    <PaymentFormScreen
      customerId={customerId}
      initialAmount={Number.isFinite(parsedAmount) ? parsedAmount : undefined}
    />
  );
}
