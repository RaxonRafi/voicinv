import { useLocalSearchParams } from 'expo-router';

import { CustomerLedgerScreen } from '@/features/ledger';

export default function CustomerLedgerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomerLedgerScreen customerId={id} />;
}
