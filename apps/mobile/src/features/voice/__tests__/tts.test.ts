import { FakeTTSEngine } from '../tts/fake-tts';
import { PlatformTTSEngine } from '../tts/platform-tts';

describe('tts engine', () => {
  describe('FakeTTSEngine', () => {
    it('records spoken text and language', async () => {
      const tts = new FakeTTSEngine();
      expect(await tts.isSpeaking()).toBe(false);

      await tts.speak('Hello world', 'en');
      expect(tts.lastSpokenText).toBe('Hello world');
      expect(tts.lastLanguage).toBe('en');
      expect(tts.spokenHistory).toEqual([{ text: 'Hello world', lang: 'en' }]);

      await tts.speak('করিমের বাকি ৫০০ টাকা।', 'bn');
      expect(tts.lastSpokenText).toBe('করিমের বাকি ৫০০ টাকা।');
      expect(tts.lastLanguage).toBe('bn');
      expect(tts.spokenHistory.length).toBe(2);
    });

    it('resets history cleanly', async () => {
      const tts = new FakeTTSEngine();
      await tts.speak('test', 'en');
      expect(tts.spokenHistory.length).toBe(1);

      tts.reset();
      expect(tts.lastSpokenText).toBeNull();
      expect(tts.lastLanguage).toBeNull();
      expect(tts.spokenHistory).toEqual([]);
    });

    it('handles stop cleanly', async () => {
      const tts = new FakeTTSEngine();
      tts.speaking = true;
      await tts.stop();
      expect(tts.speaking).toBe(false);
    });
  });

  describe('PlatformTTSEngine', () => {
    it('handles isSpeaking and stop without crashing in tests', async () => {
      const tts = new PlatformTTSEngine();
      const speaking = await tts.isSpeaking();
      expect(typeof speaking).toBe('boolean');
      await expect(tts.stop()).resolves.toBeUndefined();
    });
  });
});
