import { FakeSpeechEngine } from '../speech-engine/fake-engine';
import { PlatformSpeechEngine } from '../speech-engine/platform-engine';

describe('speech engine', () => {
  describe('FakeSpeechEngine', () => {
    it('reports availability based on configuration', async () => {
      const engine = new FakeSpeechEngine();
      expect(await engine.isAvailable('en')).toBe(true);
      engine.setAvailable(false);
      expect(await engine.isAvailable('en')).toBe(false);
    });

    it('transcribes directly when setMockResult is used', async () => {
      const engine = new FakeSpeechEngine();
      engine.setMockResult('two bags of rice', 0.95, ['2 bags rice']);

      const res = await engine.transcribe('en');
      expect(res.text).toBe('two bags of rice');
      expect(res.confidence).toBe(0.95);
      expect(res.alternatives).toEqual(['2 bags rice']);
    });

    it('supports interactive start, onPartial and stop', async () => {
      const engine = new FakeSpeechEngine();
      engine.setMockResult('চাল দুই কেজি', 0.9);

      let partialReceived = '';
      let resultReceived = '';

      await engine.start('bn', {
        onPartial: (text) => {
          partialReceived = text;
        },
        onResult: (res) => {
          resultReceived = res.text;
        },
      });

      expect(engine.isRecording).toBe(true);
      expect(partialReceived).toBe('চাল দুই কেজি');

      const stopped = await engine.stop();
      expect(engine.isRecording).toBe(false);
      expect(stopped?.text).toBe('চাল দুই কেজি');
      expect(resultReceived).toBe('চাল দুই কেজি');
    });

    it('handles abort by resetting state', async () => {
      const engine = new FakeSpeechEngine();
      engine.setMockResult('testing');
      await engine.start('en');
      expect(engine.isRecording).toBe(true);

      await engine.abort();
      expect(engine.isRecording).toBe(false);

      const stopped = await engine.stop();
      expect(stopped).toBeNull();
    });

    it('throws or invokes onError when mock error is set', async () => {
      const engine = new FakeSpeechEngine();
      const mockErr = new Error('Microphone busy');
      engine.setMockError(mockErr);

      let errorCaught: Error | null = null;
      await expect(
        engine.start('en', {
          onError: (err) => {
            errorCaught = err;
          },
        }),
      ).rejects.toThrow('Microphone busy');

      expect(errorCaught).toBe(mockErr);
    });
  });

  describe('PlatformSpeechEngine', () => {
    it('safely checks availability without crashing', async () => {
      const engine = new PlatformSpeechEngine();
      const available = await engine.isAvailable('en');
      expect(typeof available).toBe('boolean');
    });

    it('stops and aborts safely without active session', async () => {
      const engine = new PlatformSpeechEngine();
      const result = await engine.stop();
      expect(result).toBeNull();
      await expect(engine.abort()).resolves.toBeUndefined();
    });
  });
});

