import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { InvoiceFormScreen } from '@/features/invoices';
import { useVoiceDraftStore } from '@/features/voice';

export default function NewInvoiceRoute() {
  const { customerId, fromVoice } = useLocalSearchParams<{
    customerId?: string;
    fromVoice?: string;
  }>();
  const pendingDraft = useVoiceDraftStore((s) => s.pendingDraft);
  const clearPendingDraft = useVoiceDraftStore((s) => s.clearPendingDraft);

  const initialDraft = fromVoice && pendingDraft ? pendingDraft : undefined;

  useEffect(() => {
    return () => {
      if (fromVoice) clearPendingDraft();
    };
  }, [fromVoice, clearPendingDraft]);

  return <InvoiceFormScreen customerId={customerId} initialDraft={initialDraft} />;
}
