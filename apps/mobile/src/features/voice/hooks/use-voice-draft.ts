import { create } from 'zustand';

import { type InvoiceDraftShape } from '@/parser';

import { type VoiceDraftState } from '../types';

export const useVoiceDraftStore = create<VoiceDraftState>((set) => ({
  pendingDraft: null,
  setPendingDraft: (draft: InvoiceDraftShape | null) => set({ pendingDraft: draft }),
  clearPendingDraft: () => set({ pendingDraft: null }),
}));
