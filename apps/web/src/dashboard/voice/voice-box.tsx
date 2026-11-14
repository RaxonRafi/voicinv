'use client';

import { Download, LoaderCircle, Mic, SendHorizontal, Volume2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { Button, Card, cx, IconButton, showToast } from '@/components';
import { type ParseResult } from '@/parser';

import { useApp } from '../app-context';
import { type InvoiceDraft } from '../data/draft';
import { answerQuery, draftFromSale, interpret, setPendingDraft } from './interpret';
import {
  installSpeech,
  type Listening,
  type MicAvailability,
  micAvailability,
  speak,
  SpeechError,
  startListening,
} from './speech';

interface VoiceBoxProps {
  /**
   * Called with the draft of a spoken sale. Without it, the box opens the invoice screen with
   * the draft (home screen); the invoice screen passes it to fill its own draft instead.
   */
  onSale?: (draft: InvoiceDraft) => void;
  /** `card` on the home screen; `inline` inside a form. */
  variant?: 'card' | 'inline';
}

type Status = 'idle' | 'listening' | 'processing';

/**
 * Say or type a sale, a payment or a question. Hold the microphone (or Space / Enter on it) to
 * talk; let go to process. The text box understands exactly the same sentences.
 */
export function VoiceBox({ onSale, variant = 'card' }: VoiceBoxProps) {
  const { t, locale, state, fmt, path } = useApp();
  const router = useRouter();
  const inputId = useId();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [mic, setMic] = useState<MicAvailability>('unavailable');
  const [answer, setAnswer] = useState<string | null>(null);
  const listening = useRef<Listening | null>(null);

  useEffect(() => {
    let active = true;
    void micAvailability(locale).then((result) => {
      if (active) setMic(result);
    });
    return () => {
      active = false;
      listening.current?.abort();
    };
  }, [locale]);

  function handle(result: ParseResult) {
    switch (result.intent) {
      case 'SALE': {
        const draft = draftFromSale(result);
        setText('');
        if (onSale) {
          onSale(draft);
          return;
        }
        setPendingDraft(draft);
        router.push(path('invoiceNew', { voice: '1' }));
        return;
      }
      case 'PAYMENT':
        setText('');
        router.push(
          path('paymentNew', {
            customerId: result.customer?.id ?? null,
            amount: result.amount === null ? null : String(result.amount),
          }),
        );
        return;
      case 'QUERY': {
        const reply = answerQuery(state.data, result, t, fmt, Date.now());
        setAnswer(reply);
        speak(reply, locale);
        return;
      }
    }
  }

  function process(sentence: string) {
    const trimmed = sentence.trim();
    if (trimmed === '') {
      showToast(t.voice.unrecognized, 'info');
      return;
    }
    setAnswer(null);
    handle(interpret(state.data, trimmed, locale));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    process(text);
  }

  function begin() {
    if (status !== 'idle' || mic !== 'available') return;
    setAnswer(null);
    setText('');
    try {
      listening.current = startListening(
        locale,
        (heard) => setText(heard),
        (error) => {
          listening.current = null;
          setStatus('idle');
          showToast(t.voice.errors[error.code], 'danger');
        },
      );
      setStatus('listening');
    } catch (error) {
      const code = error instanceof SpeechError ? error.code : 'UNKNOWN';
      showToast(t.voice.errors[code], 'danger');
    }
  }

  async function end() {
    const current = listening.current;
    listening.current = null;
    if (!current) return;
    setStatus('processing');
    const heard = await current.stop();
    setStatus('idle');
    setText(heard);
    process(heard);
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>, down: boolean) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (down && !event.repeat) begin();
    if (!down) void end();
  }

  async function download() {
    setMic('downloading');
    const installed = await installSpeech(locale);
    setMic(installed ? 'available' : await micAvailability(locale));
  }

  const micLabel =
    status === 'listening'
      ? t.voice.micListening
      : status === 'processing'
        ? t.voice.micProcessing
        : t.voice.micHold;
  const micReady = mic === 'available';

  const micButton = (
    <button
      type="button"
      aria-label={micLabel}
      title={micReady ? micLabel : t.voice.micUnavailable}
      disabled={!micReady || status === 'processing'}
      aria-pressed={status === 'listening'}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        begin();
      }}
      onPointerUp={() => void end()}
      onPointerCancel={() => void end()}
      onKeyDown={(event) => onKey(event, true)}
      onKeyUp={(event) => onKey(event, false)}
      onContextMenu={(event) => event.preventDefault()}
      className={cx(
        'inline-flex shrink-0 touch-none items-center justify-center rounded-full select-none',
        'bg-linear-to-br from-action-primary to-action-primary-end text-text-on-action shadow-md',
        'transition-transform duration-(--vl-duration-fast) ease-standard',
        'disabled:cursor-not-allowed disabled:bg-none disabled:bg-action-disabled disabled:text-text-disabled disabled:shadow-none',
        variant === 'card' ? 'size-18' : 'size-14',
        status === 'listening' && 'scale-110 motion-reduce:scale-100',
      )}
    >
      {status === 'processing' ? (
        <LoaderCircle aria-hidden="true" className="size-8 motion-safe:animate-spin" />
      ) : (
        <Mic aria-hidden="true" className={variant === 'card' ? 'size-9' : 'size-7'} />
      )}
    </button>
  );

  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-heading text-text-primary">
            {status === 'idle' ? t.voice.title : micLabel}
          </h2>
          <p className="text-body text-text-secondary">{t.voice.hint}</p>
        </div>
        {micButton}
      </div>

      {mic === 'downloadable' || mic === 'downloading' ? (
        <Button
          variant="secondary"
          icon={<Download aria-hidden="true" className="size-5" />}
          loading={mic === 'downloading'}
          onClick={() => void download()}
        >
          {mic === 'downloading' ? t.voice.micDownloading : t.voice.micDownload}
        </Button>
      ) : mic === 'unavailable' ? (
        <p className="text-label text-text-secondary">{t.voice.micUnavailable}</p>
      ) : null}

      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t.voice.inputLabel}
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.voice.inputLabel}
          autoComplete="off"
          className="min-h-12 min-w-0 flex-1 rounded-full bg-bg-sunken px-5 text-body text-text-primary placeholder:text-text-secondary"
        />
        <IconButton label={t.voice.submit} tone="accent" type="submit" disabled={status !== 'idle'}>
          <SendHorizontal aria-hidden="true" className="size-6" />
        </IconButton>
      </form>

      {answer ? (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-bg-accent p-4">
          <p className="min-w-0 flex-1 text-body-strong text-text-primary">{answer}</p>
          <IconButton label={t.voice.repeatAnswer} onClick={() => speak(answer, locale)}>
            <Volume2 aria-hidden="true" className="size-6" />
          </IconButton>
          <IconButton label={t.voice.dismiss} onClick={() => setAnswer(null)}>
            <X aria-hidden="true" className="size-6" />
          </IconButton>
        </div>
      ) : null}
    </div>
  );

  return variant === 'card' ? (
    <Card>{body}</Card>
  ) : (
    <div className="rounded-2xl bg-bg-surface p-4 shadow-sm">{body}</div>
  );
}
