'use client';

import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { type SiteContent } from '@/content';
import { type Locale } from '@/lib/locales';
import { API_BASE_URL } from '@/lib/site-config';
import {
  buildWaitlistPayload,
  SHOP_TYPES,
  submitWaitlist,
  type WaitlistFormValues,
} from '@/lib/waitlist';

import { Button, Notice, SelectField, Text, TextField } from './ui';

const EMPTY: WaitlistFormValues = { contact: '', name: '', shopType: '', website: '' };

interface WaitlistFormProps {
  locale: Locale;
  copy: SiteContent['waitlist'];
  privacy: { href: string; label: string };
}

/**
 * Waitlist signup form — the site's only API call.
 *
 * States: idle, field error (message under the contact field), submitting (button disabled with
 * a spinner), failed (alert above the button, form stays filled in) and joined (form replaced
 * by a confirmation that receives focus).
 */
export function WaitlistForm({ locale, copy, privacy }: WaitlistFormProps) {
  const id = useId();
  const [values, setValues] = useState(EMPTY);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'joined'>('idle');
  const [contactError, setContactError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const contactRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus to the confirmation so keyboard and screen-reader users are not left on a
    // form that no longer exists.
    if (status === 'joined') confirmationRef.current?.focus();
  }, [status]);

  const update = (field: keyof WaitlistFormValues) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'submitting') return;

    const result = buildWaitlistPayload(values, locale);
    if (!result.ok) {
      setContactError(
        result.error === 'CONTACT_REQUIRED'
          ? copy.errors.contactRequired
          : copy.errors.contactInvalid,
      );
      contactRef.current?.focus();
      return;
    }

    setContactError(undefined);
    setFormError(undefined);
    setStatus('submitting');
    const outcome = await submitWaitlist(result.payload, { apiBaseUrl: API_BASE_URL });

    if (outcome === 'JOINED') {
      setStatus('joined');
      return;
    }
    setStatus('idle');
    if (outcome === 'INVALID') {
      setContactError(copy.errors.contactInvalid);
      contactRef.current?.focus();
    } else {
      setFormError(outcome === 'RATE_LIMITED' ? copy.errors.rateLimited : copy.errors.unavailable);
    }
  }

  if (status === 'joined') {
    return (
      <div ref={confirmationRef} tabIndex={-1} role="status" className="rounded-md">
        <Notice tone="success" title={copy.successTitle}>
          {copy.successBody}
        </Notice>
      </div>
    );
  }

  const submitting = status === 'submitting';
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <TextField
        ref={contactRef}
        id={`${id}-contact`}
        name="contact"
        label={copy.contactLabel}
        hint={copy.contactHint}
        error={contactError}
        value={values.contact}
        onChange={update('contact')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <TextField
        id={`${id}-name`}
        name="name"
        label={copy.nameLabel}
        optionalLabel={copy.optional}
        value={values.name}
        onChange={update('name')}
        autoComplete="name"
        maxLength={120}
      />
      <SelectField
        id={`${id}-shop-type`}
        name="shopType"
        label={copy.shopTypeLabel}
        optionalLabel={copy.optional}
        value={values.shopType}
        onChange={update('shopType')}
      >
        <option value="">{copy.shopTypePlaceholder}</option>
        {SHOP_TYPES.map((type) => (
          <option key={type} value={type}>
            {copy.shopTypes[type]}
          </option>
        ))}
      </SelectField>

      {/* Honeypot: hidden from people and assistive technology, so it is not translated. */}
      <div hidden aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={update('website')}
        />
      </div>

      <div role="alert">{formError ? <Notice tone="danger">{formError}</Notice> : null}</div>

      <Button type="submit" disabled={submitting} fullWidth>
        {submitting ? (
          <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />
        ) : null}
        {submitting ? copy.submitting : copy.submit}
      </Button>

      <Text size="caption">
        {copy.privacyNote}{' '}
        <Link href={privacy.href} className="text-text-link underline underline-offset-4">
          {privacy.label}
        </Link>
      </Text>
    </form>
  );
}
