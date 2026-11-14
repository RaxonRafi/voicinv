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
  /**
   * Asks the system to download the offline speech pack for `lang` (Android 13+). Returns
   * false when the phone cannot do that, so the user is pointed to typing instead.
   */
  installLanguage?(lang: LanguageCode): Promise<boolean>;
}

export type SpeechErrorCode =
  /** The user just allowed the microphone; listening starts on the next press. */
  | 'PERMISSION_REQUESTED'
  | 'PERMISSION_DENIED'
  /** The offline speech pack for the language is not on the phone. */
  | 'LANGUAGE_NOT_INSTALLED'
  | 'NO_SPEECH'
  /** Another app is using the microphone. */
  | 'MIC_BUSY'
  /** The phone has no speech recognizer the app may use. */
  | 'NOT_AVAILABLE'
  /** Listening was cancelled; nothing to report. */
  | 'ABORTED'
  | 'UNKNOWN';

/** A speech problem with a code the interface can explain to the user. */
export class SpeechError extends Error {
  constructor(
    readonly code: SpeechErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'SpeechError';
  }
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
