import { type LanguageCode } from '@/shared';

import { type TTSEngine } from '../types';

export class FakeTTSEngine implements TTSEngine {
  public lastSpokenText: string | null = null;
  public lastLanguage: LanguageCode | null = null;
  public spokenHistory: { text: string; lang: LanguageCode }[] = [];
  public speaking = false;

  async isSpeaking(): Promise<boolean> {
    return this.speaking;
  }

  async speak(text: string, lang: LanguageCode): Promise<void> {
    this.speaking = true;
    this.lastSpokenText = text;
    this.lastLanguage = lang;
    this.spokenHistory.push({ text, lang });
    this.speaking = false;
  }

  async stop(): Promise<void> {
    this.speaking = false;
  }

  reset(): void {
    this.lastSpokenText = null;
    this.lastLanguage = null;
    this.spokenHistory = [];
    this.speaking = false;
  }
}
