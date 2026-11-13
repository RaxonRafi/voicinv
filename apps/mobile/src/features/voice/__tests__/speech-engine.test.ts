import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { FakeSpeechEngine } from '../speech-engine/fake-engine';
import { PlatformSpeechEngine, speechErrorCode } from '../speech-engine/platform-engine';

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

    type Listener = (event: never) => void;
    /** Captures the engine's listeners so a test can play the recognizer's events. */
    function recognizer() {
      const listeners = new Map<string, Listener>();
      jest.mocked(ExpoSpeechRecognitionModule.addListener).mockImplementation(((
        name: string,
        listener: Listener,
      ) => {
        listeners.set(name, listener);
        return { remove: jest.fn() };
      }) as never);
      const emit = (name: string, event: unknown) => listeners.get(name)?.(event as never);
      const result = (transcript: string, isFinal: boolean) =>
        emit('result', { isFinal, results: [{ transcript, confidence: 0.9 }] });
      return { emit, result };
    }

    it('keeps what was said when the final text arrives after the button is released', async () => {
      const { result, emit } = recognizer();
      jest.mocked(ExpoSpeechRecognitionModule.stop).mockImplementation(() => {
        // Android delivers the final result and the end of the session after stop().
        setTimeout(() => {
          result('two bags of rice to karim', true);
          emit('end', {});
        }, 10);
      });
      const engine = new PlatformSpeechEngine();
      const partials: string[] = [];

      await engine.start('en', { onPartial: (text) => partials.push(text) });
      result('two bags', false);
      const transcription = await engine.stop();

      expect(partials).toEqual(['two bags']);
      expect(transcription?.text).toBe('two bags of rice to karim');
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
        expect.objectContaining({ requiresOnDeviceRecognition: true, interimResults: true }),
      );
    });

    it('falls back to the last partial text if no final result comes', async () => {
      const { result, emit } = recognizer();
      jest.mocked(ExpoSpeechRecognitionModule.stop).mockImplementation(() => {
        setTimeout(() => emit('error', { error: 'no-speech', message: '' }), 10);
      });
      const engine = new PlatformSpeechEngine();

      await engine.start('bn');
      result('করিমকে দুই বস্তা চাল', false);

      await expect(engine.stop()).resolves.toMatchObject({ text: 'করিমকে দুই বস্তা চাল' });
    });

    it('asks for the microphone on its own, so the first press is not lost', async () => {
      jest
        .mocked(ExpoSpeechRecognitionModule.getPermissionsAsync)
        .mockResolvedValueOnce({ granted: false, canAskAgain: true } as never);
      jest
        .mocked(ExpoSpeechRecognitionModule.requestPermissionsAsync)
        .mockResolvedValueOnce({ granted: true } as never);
      const engine = new PlatformSpeechEngine();

      await expect(engine.start('en')).rejects.toMatchObject({ code: 'PERMISSION_REQUESTED' });
      expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    });

    it('reports a missing offline language pack as such, not as a permission problem', async () => {
      const { emit } = recognizer();
      const engine = new PlatformSpeechEngine();
      const errors: unknown[] = [];

      await engine.start('bn', { onError: (error) => errors.push(error) });
      emit('error', { error: 'language-not-supported', message: 'bn-BD' });

      expect(errors).toEqual([expect.objectContaining({ code: 'LANGUAGE_NOT_INSTALLED' })]);
      await expect(engine.installLanguage('bn')).resolves.toBe(true);
      expect(ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload).toHaveBeenCalledWith({
        locale: 'bn-BD',
      });
    });

    it.each([
      ['not-allowed', 'PERMISSION_DENIED'],
      ['network', 'LANGUAGE_NOT_INSTALLED'],
      ['no-speech', 'NO_SPEECH'],
      ['audio-capture', 'MIC_BUSY'],
      ['service-not-allowed', 'NOT_AVAILABLE'],
      ['aborted', 'ABORTED'],
      ['client', 'UNKNOWN'],
    ])('maps the recognizer error %s to %s', (error, code) => {
      expect(speechErrorCode(error)).toBe(code);
    });
  });
});
