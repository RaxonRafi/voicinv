import { useLocalSearchParams } from 'expo-router';

import { CustomerFormScreen } from '@/features/customers';

export default function EditCustomerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomerFormScreen customerId={id} />;
}
