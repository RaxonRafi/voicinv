import { type LanguageCode } from '@/shared';

import { type SpeechEngine, type SpeechEngineCallbacks, type SpeechTranscription } from '../types';

export class FakeSpeechEngine implements SpeechEngine {
  private available = true;
  private queuedResult: SpeechTranscription = { text: '', confidence: 1 };
  private queuedError: Error | null = null;
  private activeCallbacks: SpeechEngineCallbacks | null = null;
  public isRecording = false;

  public setAvailable(available: boolean): void {
    this.available = available;
  }

  public setMockResult(text: string, confidence = 1, alternatives: string[] = []): void {
    this.queuedResult = { text, confidence, alternatives };
    this.queuedError = null;
  }

  public setMockError(error: Error | null): void {
    this.queuedError = error;
  }

  async isAvailable(_lang: LanguageCode): Promise<boolean> {
    return this.available;
  }

  async transcribe(_lang: LanguageCode, _audioUri?: string): Promise<SpeechTranscription> {
    if (this.queuedError) throw this.queuedError;
    return this.queuedResult;
  }

  async start(_lang: LanguageCode, callbacks?: SpeechEngineCallbacks): Promise<void> {
    if (!this.available) {
      const err = new Error('Speech recognition not available');
      callbacks?.onError?.(err);
      throw err;
    }
    if (this.queuedError) {
      callbacks?.onError?.(this.queuedError);
      throw this.queuedError;
    }
    this.isRecording = true;
    this.activeCallbacks = callbacks ?? null;
    if (callbacks?.onPartial && this.queuedResult.text) {
      callbacks.onPartial(this.queuedResult.text);
    }
  }

  async stop(): Promise<SpeechTranscription | null> {
    if (!this.isRecording) return null;
    this.isRecording = false;
    const result = this.queuedResult;
    this.activeCallbacks?.onResult?.(result);
    this.activeCallbacks = null;
    return result;
  }

  async abort(): Promise<void> {
    this.isRecording = false;
    this.activeCallbacks = null;
  }
}

