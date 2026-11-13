import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useLanguage, useTranslation } from '@/core/i18n';
import { useServices, useShopContext } from '@/core/services';
import { showToast } from '@/core/ui';
import { parsedSaleToDraft } from '@/parser';

import { PlatformSpeechEngine } from '../speech-engine/platform-engine';
import { PlatformTTSEngine } from '../tts/platform-tts';
import { type SpeechEngine, type TTSEngine, type VoiceBillingState } from '../types';
import { answerVoiceQuery, parseVoiceTranscript } from '../usecases';
import { useVoiceDraftStore } from './use-voice-draft';

export interface UseVoiceBillingOptions {
  speechEngine?: SpeechEngine;
  ttsEngine?: TTSEngine;
}

export function useVoiceBilling(options: UseVoiceBillingOptions = {}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const services = useServices();
  const shopContext = useShopContext();
  const setPendingDraft = useVoiceDraftStore((s) => s.setPendingDraft);

  const defaultSpeechEngine = useMemo(() => new PlatformSpeechEngine(), []);
  const defaultTtsEngine = useMemo(() => new PlatformTTSEngine(), []);

  const speechEngine = options.speechEngine ?? defaultSpeechEngine;
  const ttsEngine = options.ttsEngine ?? defaultTtsEngine;

  const [state, setState] = useState<VoiceBillingState>({
    status: 'idle',
    transcript: '',
  });

  const transcriptRef = useRef('');

  const onStart = useCallback(async () => {
    transcriptRef.current = '';
    setState({ status: 'listening', transcript: '', error: undefined });

    try {
      if (speechEngine.start) {
        await speechEngine.start(language, {
          onPartial: (text) => {
            transcriptRef.current = text;
            setState((prev) => ({ ...prev, transcript: text }));
          },
          onError: (err) => {
            setState({ status: 'error', transcript: '', error: err.message });
            showToast(t('voice.permissionDenied'), 'danger');
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ status: 'error', transcript: '', error: message });
      showToast(t('voice.permissionDenied'), 'danger');
    }
  }, [language, speechEngine, t]);

  const onStop = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'processing' }));

    try {
      let transcription = null;
      if (speechEngine.stop) {
        transcription = await speechEngine.stop();
      }

      const text = transcription?.text?.trim() || transcriptRef.current.trim();
      if (!text) {
        setState({ status: 'idle', transcript: '' });
        showToast(t('voice.unrecognized'), 'warning');
        return;
      }

      setState((prev) => ({ ...prev, transcript: text }));

      const parseResult = await parseVoiceTranscript(services.db.orm, text, language);

      switch (parseResult.intent) {
        case 'SALE': {
          const draft = parsedSaleToDraft(parseResult);
          setPendingDraft(draft);
          setState({ status: 'idle', transcript: text, lastResult: parseResult });
          router.push('/invoices/new?fromVoice=1' as unknown as Parameters<typeof router.push>[0]);
          break;
        }
        case 'PAYMENT': {
          setState({ status: 'idle', transcript: text, lastResult: parseResult });
          const params: Record<string, string> = { fromVoice: '1' };
          if (parseResult.customer?.id) params.customerId = parseResult.customer.id;
          if (parseResult.amount !== null && parseResult.amount !== undefined) {
            params.initialAmount = String(parseResult.amount);
          }
          router.push({
            pathname: '/payments/new' as unknown as Parameters<typeof router.push>[0],
            params,
          });
          break;
        }
        case 'QUERY': {
          const answer = await answerVoiceQuery({
            orm: services.db.orm,
            query: parseResult,
            language,
            tts: ttsEngine,
            formatMoney: shopContext ? shopContext.format.money : (amount) => String(amount),
            translate: t,
            now: services.now,
          });

          setState({
            status: 'answered',
            transcript: text,
            lastResult: parseResult,
            lastSpokenAnswer: answer.text,
          });
          break;
        }
      }
    } catch {
      setState({ status: 'idle', transcript: '' });
      showToast(t('common.somethingWrong'), 'danger');
    }
  }, [language, services.db.orm, services.now, setPendingDraft, shopContext, speechEngine, t, ttsEngine]);

  const dismissAnswer = useCallback(() => {
    setState({ status: 'idle', transcript: '' });
  }, []);

  const repeatAnswer = useCallback(async () => {
    if (state.lastSpokenAnswer) {
      await ttsEngine.speak(state.lastSpokenAnswer, language);
    }
  }, [language, state.lastSpokenAnswer, ttsEngine]);

  return {
    state,
    onStart,
    onStop,
    dismissAnswer,
    repeatAnswer,
  };
}

