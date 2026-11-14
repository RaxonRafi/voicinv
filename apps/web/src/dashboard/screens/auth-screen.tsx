'use client';

import { Copy, Globe, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type FormEvent, useId, useState, useSyncExternalStore } from 'react';

import { Button, Dialog, Notice, Segmented, SelectField, showToast, TextField } from '@/components';
import { CURRENCIES, DEFAULT_CURRENCY, PASSWORD_MIN_LENGTH } from '@/domain';
import { fill } from '@/lib/format';
import { LOCALE_NAMES, otherLocale } from '@/lib/locales';
import { switchLocalePath } from '@/lib/routes';

import { describeError, useApp } from '../app-context';
import { SHOP_TYPES, type ShopType } from '../data/shop';
import { normalizeIdentifier } from '../data/text';

type Mode = 'signIn' | 'create' | 'recover';

// The recovery code is shown once, right after the account is made. The shop opens at the same
// moment, so the code lives here, outside the sign-in screen, until the user confirms it.
let pendingRecoveryCode: string | null = null;
const recoveryListeners = new Set<() => void>();
function setRecoveryCode(code: string | null): void {
  pendingRecoveryCode = code;
  for (const listener of recoveryListeners) listener();
}

/** Shows a new recovery code until the user says it is written down. Rendered by the shell. */
export function RecoveryCodeDialog() {
  const { t } = useApp();
  const code = useSyncExternalStore(
    (listener) => {
      recoveryListeners.add(listener);
      return () => recoveryListeners.delete(listener);
    },
    () => pendingRecoveryCode,
    () => null,
  );
  return (
    <Dialog
      open={code !== null}
      onClose={() => setRecoveryCode(null)}
      title={t.auth.recoveryTitle}
      closeLabel={t.common.close}
      footer={<Button onClick={() => setRecoveryCode(null)}>{t.auth.recoveryDone}</Button>}
    >
      <p className="text-body text-text-secondary">{t.auth.recoveryMessage}</p>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-bg-sunken p-4">
        <code className="text-title tracking-wide text-text-primary wrap-anywhere">{code}</code>
        <Button
          variant="ghost"
          icon={<Copy aria-hidden="true" className="size-5" />}
          onClick={() => {
            if (code)
              void navigator.clipboard
                ?.writeText(code)
                .then(() => showToast(t.common.copied, 'info'));
          }}
        >
          {t.common.copy}
        </Button>
      </div>
    </Dialog>
  );
}

interface Errors {
  identifier?: string;
  password?: string;
  recoveryCode?: string;
  shopName?: string;
  form?: string;
}

export function AuthScreen() {
  const { t, locale, store } = useApp();
  const pathname = usePathname();
  const id = useId();
  // Links such as "Get started" on the public pages open the form on "Create account".
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'create' ? 'create' : 'signIn',
  );
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCodeInput] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopType, setShopType] = useState<ShopType>('grocery');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function validate(): { identifier: string } | null {
    const found: Errors = {};
    const normalized = normalizeIdentifier(identifier);
    if (identifier.trim() === '') found.identifier = t.errors.required;
    else if (normalized === null) found.identifier = t.errors.invalidIdentifier;
    if (password === '') found.password = t.errors.required;
    else if (mode !== 'signIn' && password.length < PASSWORD_MIN_LENGTH) {
      found.password = t.errors.passwordTooShort;
    }
    if (mode === 'recover' && recoveryCode.trim() === '') found.recoveryCode = t.errors.required;
    if (mode === 'create' && shopName.trim() === '') found.shopName = t.errors.required;
    setErrors(found);
    return Object.keys(found).length === 0 && normalized !== null
      ? { identifier: normalized }
      : null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const valid = validate();
    if (!valid) return;
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'signIn') {
        await store.signIn({ identifier: valid.identifier, password });
      } else if (mode === 'create') {
        const { recoveryCode: code } = await store.createAccount({
          identifier: valid.identifier,
          password,
          name: shopName,
          currencyCode: currency,
          language: locale,
          shopType,
        });
        setRecoveryCode(code);
      } else {
        const { recoveryCode: next } = await store.recoverPassword({
          identifier: valid.identifier,
          recoveryCode: recoveryCode.trim(),
          newPassword: password,
        });
        setRecoveryCode(next);
        setMode('signIn');
        setPassword('');
        setRecoveryCodeInput('');
        setNotice(t.auth.passwordChanged);
      }
    } catch (error) {
      setErrors({ form: describeError(error, t).message });
    } finally {
      setBusy(false);
    }
  }

  const target = otherLocale(locale);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-action-primary to-action-primary-end text-text-on-action shadow-lg">
          <LockKeyhole aria-hidden="true" className="size-8" />
        </span>
        <Link
          href={switchLocalePath(pathname, target)}
          hrefLang={target}
          lang={target}
          className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-body-strong text-text-primary hover:bg-bg-sunken"
        >
          <Globe aria-hidden="true" className="size-5" />
          {LOCALE_NAMES[target]}
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-hero text-text-primary">VoiceLedger</h1>
        <p className="text-body text-text-secondary">
          {mode === 'recover' ? t.auth.recoverTitle : t.auth.subtitle}
        </p>
      </div>

      {mode === 'recover' ? null : (
        <Segmented<Mode>
          label={t.auth.modeLabel}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setErrors({});
          }}
          options={[
            { value: 'signIn', label: t.auth.modeSignIn },
            { value: 'create', label: t.auth.modeCreate },
          ]}
        />
      )}

      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          id={`${id}-identifier`}
          label={t.auth.identifier}
          hint={mode === 'create' ? t.auth.identifierHint : undefined}
          error={errors.identifier}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        {mode === 'recover' ? (
          <TextField
            id={`${id}-code`}
            label={t.auth.recoveryCode}
            hint={t.auth.recoveryCodeHint}
            error={errors.recoveryCode}
            value={recoveryCode}
            onChange={(event) => setRecoveryCodeInput(event.target.value)}
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            required
          />
        ) : null}
        <TextField
          id={`${id}-password`}
          type="password"
          label={mode === 'recover' ? t.auth.newPassword : t.auth.password}
          hint={
            mode === 'signIn'
              ? undefined
              : fill(t.auth.passwordHint, { min: String(PASSWORD_MIN_LENGTH) })
          }
          error={errors.password}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          required
        />
        {mode === 'create' ? (
          <>
            <TextField
              id={`${id}-shop`}
              label={t.auth.shopName}
              hint={t.auth.shopNameHint}
              error={errors.shopName}
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
              autoComplete="organization"
              maxLength={120}
              required
            />
            <SelectField
              id={`${id}-type`}
              label={t.auth.shopType}
              hint={t.auth.shopTypeHint}
              value={shopType}
              onChange={(event) => setShopType(event.target.value as ShopType)}
            >
              {SHOP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t.auth.shopTypes[type]}
                </option>
              ))}
            </SelectField>
            <SelectField
              id={`${id}-currency`}
              label={t.auth.currency}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {Object.entries(CURRENCIES).map(([code, info]) => (
                <option key={code} value={code}>
                  {info.symbol} {code}
                </option>
              ))}
            </SelectField>
          </>
        ) : null}

        <div role="alert">{errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}</div>

        <Button type="submit" size="lg" fullWidth loading={busy}>
          {mode === 'signIn'
            ? t.auth.signInButton
            : mode === 'create'
              ? t.auth.createButton
              : t.auth.recoverButton}
        </Button>
        {mode === 'create' ? null : (
          <Button
            variant="ghost"
            fullWidth
            onClick={() => {
              setMode(mode === 'recover' ? 'signIn' : 'recover');
              setErrors({});
              setNotice(null);
            }}
          >
            {mode === 'recover' ? t.auth.backToSignIn : t.auth.forgot}
          </Button>
        )}
        <p className="text-caption text-text-secondary">{t.auth.privacyNote}</p>
      </form>
    </main>
  );
}
