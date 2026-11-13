import { useLocalSearchParams } from 'expo-router';

import { ProductFormScreen } from '@/features/products';

export default function EditProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductFormScreen productId={id} />;
}
