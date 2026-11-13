import { type InvoiceDraftShape, type ParsedCustomer, type ParseResult } from '@/parser';
import { type LanguageCode, type MinorUnits } from '@/shared';

export interface SpeechTranscription {
  text: string;
  alternatives?: string[];
  confidence?: number;
}

export interface SpeechEngineCallbacks {
  onPartial?: (text: string) => void;
  onResult?: (result: SpeechTranscription) => void;
  onError?: (error: Error) => void;
}

export interface SpeechEngine {
  isAvailable(lang: LanguageCode): Promise<boolean>;
  transcribe(lang: LanguageCode, audioUri?: string): Promise<SpeechTranscription>;
  start?(lang: LanguageCode, callbacks?: SpeechEngineCallbacks): Promise<void>;
  stop?(): Promise<SpeechTranscription | null>;
  abort?(): Promise<void>;
}

export interface TTSEngine {
  isSpeaking(): Promise<boolean>;
  speak(text: string, lang: LanguageCode): Promise<void>;
  stop(): Promise<void>;
}

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'answered' | 'error';

export interface VoiceBillingState {
  status: VoiceStatus;
  transcript: string;
  lastResult?: ParseResult;
  lastSpokenAnswer?: string;
  error?: string;
}

export interface QueryAnswer {
  text: string;
  spoken: boolean;
  customer?: ParsedCustomer | null;
  amount?: MinorUnits | null;
}

export interface VoiceDraftState {
  pendingDraft: InvoiceDraftShape | null;
  setPendingDraft: (draft: InvoiceDraftShape | null) => void;
  clearPendingDraft: () => void;
}
