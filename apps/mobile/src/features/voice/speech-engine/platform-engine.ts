import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { type LanguageCode } from '@/shared';

import { type SpeechEngine, type SpeechEngineCallbacks, type SpeechTranscription } from '../types';

function toBcp47(lang: LanguageCode): string {
  switch (lang) {
    case 'bn':
      return 'bn-BD';
    case 'en':
    default:
      return 'en-US';
  }
}

export class PlatformSpeechEngine implements SpeechEngine {
  private resultSubscription: { remove: () => void } | null = null;
  private errorSubscription: { remove: () => void } | null = null;
  private endSubscription: { remove: () => void } | null = null;
  private lastTranscription: SpeechTranscription | null = null;

  async isAvailable(_lang: LanguageCode): Promise<boolean> {
    try {
      if (!ExpoSpeechRecognitionModule?.supportsOnDeviceRecognition) {
        return false;
      }
      return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch {
      return false;
    }
  }

  async start(lang: LanguageCode, callbacks?: SpeechEngineCallbacks): Promise<void> {
    const permissions = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permissions.granted) {
      const err = new Error('Microphone permission not granted');
      callbacks?.onError?.(err);
      throw err;
    }

    this.cleanupListeners();
    this.lastTranscription = null;

    this.resultSubscription = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const best = event.results[0];
      if (!best) return;
      const transcription: SpeechTranscription = {
        text: best.transcript,
        confidence: best.confidence >= 0 ? best.confidence : 0.85,
        alternatives: event.results.slice(1).map((r) => r.transcript),
      };
      this.lastTranscription = transcription;
      if (event.isFinal) {
        callbacks?.onResult?.(transcription);
      } else {
        callbacks?.onPartial?.(best.transcript);
      }
    });

    this.errorSubscription = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      const err = new Error(event.message || event.error);
      callbacks?.onError?.(err);
    });

    this.endSubscription = ExpoSpeechRecognitionModule.addListener('end', () => {
      if (this.lastTranscription && callbacks?.onResult) {
        callbacks.onResult(this.lastTranscription);
      }
    });

    ExpoSpeechRecognitionModule.start({
      lang: toBcp47(lang),
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
    });
  }

  async stop(): Promise<SpeechTranscription | null> {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Recognizer may already be stopped.
    }
    const result = this.lastTranscription;
    this.cleanupListeners();
    return result;
  }

  async abort(): Promise<void> {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Ignore abort errors
    }
    this.cleanupListeners();
  }

  async transcribe(lang: LanguageCode): Promise<SpeechTranscription> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      void this.start(lang, {
        onResult: (res) => {
          if (!resolved) {
            resolved = true;
            this.cleanupListeners();
            resolve(res);
          }
        },
        onError: (err) => {
          if (!resolved) {
            resolved = true;
            this.cleanupListeners();
            reject(err);
          }
        },
      });
    });
  }

  private cleanupListeners(): void {
    this.resultSubscription?.remove();
    this.resultSubscription = null;
    this.errorSubscription?.remove();
    this.errorSubscription = null;
    this.endSubscription?.remove();
    this.endSubscription = null;
  }
}
