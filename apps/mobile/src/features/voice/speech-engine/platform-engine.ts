import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { type LanguageCode } from '@/shared';

import {
  type SpeechEngine,
  type SpeechEngineCallbacks,
  SpeechError,
  type SpeechErrorCode,
  type SpeechTranscription,
} from '../types';

// The phone's own speech recognizer, always in on-device mode: audio never leaves the phone
// (AGENTS.md §1 rule 4).
//
// Hold-to-talk: `start` on press, `stop` on release. Android delivers the final text a moment
// AFTER it is told to stop, so `stop` waits for that final result (or the end of the session)
// before returning; returning right away would lose what the user said.

function toBcp47(lang: LanguageCode): string {
  switch (lang) {
    case 'bn':
      return 'bn-BD';
    case 'en':
    default:
      return 'en-US';
  }
}

/** How long to wait for the final text after the user lets go. */
export const STOP_TIMEOUT_MS = 4000;

/** The recognizer's error codes, as problems the interface can explain. */
export function speechErrorCode(error: string): SpeechErrorCode {
  switch (error) {
    case 'not-allowed':
      return 'PERMISSION_DENIED';
    // In on-device mode the recognizer reports "network" when it would need the internet,
    // which means the offline pack for the language is missing.
    case 'language-not-supported':
    case 'network':
      return 'LANGUAGE_NOT_INSTALLED';
    case 'no-speech':
    case 'speech-timeout':
      return 'NO_SPEECH';
    case 'audio-capture':
    case 'busy':
      return 'MIC_BUSY';
    case 'service-not-allowed':
      return 'NOT_AVAILABLE';
    case 'aborted':
    case 'interrupted':
      return 'ABORTED';
    default:
      return 'UNKNOWN';
  }
}

function toTranscription(results: readonly { transcript: string; confidence: number }[]) {
  const [best, ...others] = results;
  if (!best || best.transcript.trim() === '') return null;
  return {
    text: best.transcript,
    // Android often reports -1 (unknown); the parser then relies on its own confidence.
    confidence: best.confidence >= 0 ? best.confidence : 0.85,
    alternatives: others.map((result) => result.transcript),
  } satisfies SpeechTranscription;
}

export class PlatformSpeechEngine implements SpeechEngine {
  private subscriptions: { remove: () => void }[] = [];
  private lastTranscription: SpeechTranscription | null = null;
  private listening = false;
  /** Set while `stop` waits for the final result. */
  private finishStop: ((result: SpeechTranscription | null) => void) | null = null;

  async isAvailable(_lang: LanguageCode): Promise<boolean> {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  }

  async start(lang: LanguageCode, callbacks?: SpeechEngineCallbacks): Promise<void> {
    // The permission prompt interrupts a held button, so it is asked for on its own; the
    // user presses again once it is granted.
    const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (!current.granted) {
      if (current.canAskAgain === false) throw new SpeechError('PERMISSION_DENIED');
      const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      throw new SpeechError(asked.granted ? 'PERMISSION_REQUESTED' : 'PERMISSION_DENIED');
    }
    if (!(await this.isAvailable(lang))) throw new SpeechError('NOT_AVAILABLE');

    this.cleanup();
    this.lastTranscription = null;
    this.listening = true;

    this.subscriptions = [
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const transcription = toTranscription(event.results);
        if (!transcription) return;
        this.lastTranscription = transcription;
        if (event.isFinal) {
          if (this.finishStop) this.finishStop(transcription);
          else callbacks?.onResult?.(transcription);
        } else {
          callbacks?.onPartial?.(transcription.text);
        }
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        const code = speechErrorCode(event.error);
        if (this.finishStop) {
          // Ending without a final result (e.g. nothing was said): keep what was heard.
          this.finishStop(this.lastTranscription);
          return;
        }
        this.listening = false;
        if (code !== 'ABORTED') callbacks?.onError?.(new SpeechError(code, event.message));
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        this.listening = false;
        this.finishStop?.(this.lastTranscription);
      }),
    ];

    ExpoSpeechRecognitionModule.start({
      lang: toBcp47(lang),
      requiresOnDeviceRecognition: true,
      // Partial text while the button is held: live feedback, and something to keep if the
      // final result never comes.
      interimResults: true,
      addsPunctuation: true,
      maxAlternatives: 3,
    });
  }

  stop(): Promise<SpeechTranscription | null> {
    if (!this.listening) {
      this.cleanup();
      return Promise.resolve(this.lastTranscription);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finishStop?.(this.lastTranscription), STOP_TIMEOUT_MS);
      this.finishStop = (result) => {
        clearTimeout(timer);
        this.finishStop = null;
        this.listening = false;
        this.cleanup();
        resolve(result);
      };
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        this.finishStop(this.lastTranscription);
      }
    });
  }

  async abort(): Promise<void> {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Already stopped.
    }
    this.listening = false;
    this.finishStop?.(null);
    this.cleanup();
  }

  async installLanguage(lang: LanguageCode): Promise<boolean> {
    try {
      await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
        locale: toBcp47(lang),
      });
      return true;
    } catch {
      // Android 12 and older, or no Google speech service: the pack cannot be requested.
      return false;
    }
  }

  async transcribe(lang: LanguageCode): Promise<SpeechTranscription> {
    return new Promise((resolve, reject) => {
      this.start(lang, {
        onResult: (result) => {
          this.cleanup();
          resolve(result);
        },
        onError: (error) => {
          this.cleanup();
          reject(error);
        },
      }).catch(reject);
    });
  }

  private cleanup(): void {
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
  }
}
