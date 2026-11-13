import * as Speech from 'expo-speech';

import { type LanguageCode } from '@/shared';

import { type TTSEngine } from '../types';

function toBcp47(lang: LanguageCode): string {
  switch (lang) {
    case 'bn':
      return 'bn-BD';
    case 'en':
    default:
      return 'en-US';
  }
}

export class PlatformTTSEngine implements TTSEngine {
  async isSpeaking(): Promise<boolean> {
    try {
      return await Speech.isSpeakingAsync();
    } catch {
      return false;
    }
  }

  async speak(text: string, lang: LanguageCode): Promise<void> {
    try {
      if (await Speech.isSpeakingAsync()) {
        await Speech.stop();
      }
      Speech.speak(text, {
        language: toBcp47(lang),
        rate: 0.9,
      });
    } catch {
      // Best effort on-device speech synthesis
    }
  }

  async stop(): Promise<void> {
    try {
      await Speech.stop();
    } catch {
      // Ignore errors when stopping TTS
    }
  }
}
