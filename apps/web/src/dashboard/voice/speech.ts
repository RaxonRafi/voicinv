import { type LanguageCode } from '@/domain';

// Speech in the browser, on the device only (AGENTS.md §1 rule 4: audio never leaves the
// device; rule 2: no cloud speech recognition).
//
// The Web Speech API sends audio to a cloud service by default. The microphone is therefore
// offered only when the browser supports *on-device* recognition — `processLocally` together
// with `SpeechRecognition.available()` — and reports the language as installed. Every other
// browser gets the typing box, which runs the same offline parser.
//
// Spoken answers use only voices the browser marks as local (`localService`).

/** BCP 47 tags passed to the recognizer per app language. */
const SPEECH_TAGS: Readonly<Record<LanguageCode, string>> = { en: 'en-US', bn: 'bn-BD' };

export type MicAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export type SpeechErrorCode = 'PERMISSION_DENIED' | 'NO_SPEECH' | 'NOT_AVAILABLE' | 'UNKNOWN';

export class SpeechError extends Error {
  constructor(readonly code: SpeechErrorCode) {
    super(code);
    this.name = 'SpeechError';
  }
}

interface AvailabilityOptions {
  langs: string[];
  processLocally: true;
}

interface RecognitionResultList {
  readonly length: number;
  [index: number]: { readonly isFinal: boolean; [index: number]: { readonly transcript: string } };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecognitionConstructor {
  new (): Recognition;
  available?: (options: AvailabilityOptions) => Promise<MicAvailability>;
  install?: (options: AvailabilityOptions) => Promise<boolean>;
}

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function options(language: LanguageCode): AvailabilityOptions {
  return { langs: [SPEECH_TAGS[language]], processLocally: true };
}

/**
 * Whether the microphone can be used for this language without any audio leaving the device.
 * Browsers that cannot promise that answer `unavailable`.
 */
export async function micAvailability(language: LanguageCode): Promise<MicAvailability> {
  const Ctor = recognitionConstructor();
  if (!Ctor || typeof Ctor.available !== 'function') return 'unavailable';
  try {
    return await Ctor.available(options(language));
  } catch {
    return 'unavailable';
  }
}

/** Asks the browser to download its on-device language pack. True when it is installed. */
export async function installSpeech(language: LanguageCode): Promise<boolean> {
  const Ctor = recognitionConstructor();
  if (!Ctor || typeof Ctor.install !== 'function') return false;
  try {
    return await Ctor.install(options(language));
  } catch {
    return false;
  }
}

export interface Listening {
  /** Stops listening and resolves with everything heard. */
  stop(): Promise<string>;
  /** Stops without a result. */
  abort(): void;
}

function errorCode(error: string): SpeechErrorCode | null {
  switch (error) {
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'PERMISSION_DENIED';
    case 'no-speech':
      return 'NO_SPEECH';
    case 'language-not-supported':
    case 'network':
      return 'NOT_AVAILABLE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Starts on-device recognition. `onPartial` receives the text heard so far; `onError` a
 * problem the user can act on. Call only after `micAvailability` answered `available`.
 */
export function startListening(
  language: LanguageCode,
  onPartial: (text: string) => void,
  onError: (error: SpeechError) => void,
): Listening {
  const Ctor = recognitionConstructor();
  if (!Ctor || typeof Ctor.available !== 'function') throw new SpeechError('NOT_AVAILABLE');
  const recognition = new Ctor();
  // Never fall back to a server: recognition happens on this device or not at all.
  recognition.processLocally = true;
  recognition.lang = SPEECH_TAGS[language];
  recognition.continuous = true;
  recognition.interimResults = true;

  let text = '';
  let ended = false;
  let resolveEnd: (() => void) | null = null;
  recognition.onresult = ({ results }) => {
    let heard = '';
    for (const result of Array.from(results as ArrayLike<RecognitionResultList[number]>)) {
      heard += result[0]?.transcript ?? '';
    }
    text = heard.trim();
    onPartial(text);
  };
  recognition.onerror = ({ error }) => {
    const code = errorCode(error);
    if (code) onError(new SpeechError(code));
  };
  recognition.onend = () => {
    ended = true;
    resolveEnd?.();
  };
  recognition.start();

  return {
    stop: () =>
      new Promise<string>((resolve) => {
        if (ended) {
          resolve(text);
          return;
        }
        resolveEnd = () => resolve(text);
        recognition.stop();
      }),
    abort: () => recognition.abort(),
  };
}

/** Says `text` aloud with a voice that runs on the device. Silent when there is none. */
export function speak(text: string, language: LanguageCode): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const prefix = SPEECH_TAGS[language].split('-')[0] ?? language;
  const voice = window.speechSynthesis
    .getVoices()
    .find((candidate) => candidate.localService && candidate.lang.toLowerCase().startsWith(prefix));
  if (!voice) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  window.speechSynthesis.speak(utterance);
}
