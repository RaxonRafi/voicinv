'use client';

import {
  CloudCheck,
  Download,
  Globe,
  LogOut,
  Monitor,
  Moon,
  ReceiptText,
  RefreshCw,
  Sun,
  Upload,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';

import {
  Button,
  Card,
  Dialog,
  Notice,
  Overline,
  Segmented,
  SelectField,
  showToast,
  TextAreaField,
  TextField,
  Tile,
} from '@/components';
import { formatInvoiceNumber, isShopPrefix } from '@/domain';
import { LOCALE_NAMES, LOCALES, type Locale } from '@/lib/locales';
import { switchLocalePath } from '@/lib/routes';

import { describeError, useApp, useOnline } from '../app-context';
import {
  BACKUP_FILE_EXTENSION,
  BACKUP_PASSWORD_MIN_LENGTH,
  BackupError,
  createBackupFile,
  decryptBackup,
  restoreChanges,
} from '../data/backup';
import { updateShopProfile } from '../data/shop';
import { downloadFile } from '../documents/files';
import { PAGE_FORMATS, type PageFormat } from '../documents/print';
import { Screen, ScreenMessage } from '../shell/screen';
import { type ThemeChoice, useTheme } from '../shell/theme';
import { Row, RowGroup } from './parts';
import { usePaperSize } from './settings-prefs';

function BackupDialogs({
  mode,
  onClose,
}: {
  mode: 'export' | 'restore' | null;
  onClose: () => void;
}) {
  const { t, state, store, fill } = useApp();
  const id = useId();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const min = String(BACKUP_PASSWORD_MIN_LENGTH);

  const close = () => {
    setPassword('');
    setRepeat('');
    setFile(null);
    setError(undefined);
    onClose();
  };

  async function exportBackup() {
    if (password.length < BACKUP_PASSWORD_MIN_LENGTH)
      return setError(fill(t.backup.passwordTooShort, { min }));
    if (password !== repeat) return setError(t.backup.passwordMismatch);
    if (!state.shopId || !state.device) return;
    setBusy(true);
    try {
      const now = Date.now();
      const bytes = await createBackupFile(
        state.data,
        state.shopId,
        state.device.id,
        password,
        now,
      );
      const date = new Date(now).toISOString().slice(0, 10);
      downloadFile(
        `voiceledger-${date}${BACKUP_FILE_EXTENSION}`,
        bytes.slice().buffer,
        'application/octet-stream',
      );
      showToast(t.backup.exportSuccess);
      close();
    } catch (cause) {
      setError(describeError(cause, t).message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!file) return setError(t.errors.required);
    if (!state.shopId) return;
    setBusy(true);
    try {
      const decrypted = await decryptBackup(new Uint8Array(await file.arrayBuffer()), password);
      const changes = restoreChanges(state.data, state.shopId, decrypted);
      const count = Object.values(changes).reduce(
        (sum, entry) => sum + entry.created.length + entry.updated.length,
        0,
      );
      if (count === 0) {
        showToast(t.backup.restoreNothing, 'info');
      } else {
        await store.pushRecords(changes);
        showToast(fill(t.backup.restoreSuccess, { count: String(count) }));
      }
      close();
    } catch (cause) {
      if (cause instanceof BackupError) {
        setError(
          cause.code === 'WRONG_PASSWORD'
            ? t.backup.wrongPassword
            : cause.code === 'OTHER_SHOP'
              ? t.backup.otherShop
              : t.backup.invalidFile,
        );
      } else {
        setError(describeError(cause, t).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={mode === 'export'}
        onClose={close}
        title={t.backup.exportTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t.common.cancel}
            </Button>
            <Button loading={busy} onClick={() => void exportBackup()}>
              {t.backup.exportConfirm}
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">{t.backup.exportMessage}</p>
        <TextField
          id={`${id}-password`}
          type="password"
          label={t.backup.passwordLabel}
          hint={fill(t.backup.passwordHint, { min })}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <TextField
          id={`${id}-repeat`}
          type="password"
          label={t.backup.repeatPasswordLabel}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          autoComplete="new-password"
        />
        <div role="alert">{error ? <Notice tone="danger">{error}</Notice> : null}</div>
      </Dialog>

      <Dialog
        open={mode === 'restore'}
        onClose={close}
        title={t.backup.restoreTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t.common.cancel}
            </Button>
            <Button loading={busy} onClick={() => void restoreBackup()}>
              {t.backup.restoreConfirm}
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">{t.backup.restoreMessage}</p>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-file`} className="text-label text-text-primary">
            {t.backup.fileLabel}
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept={`${BACKUP_FILE_EXTENSION},application/octet-stream`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-h-12 w-full rounded-xl border border-border-default bg-bg-surface p-2 text-body text-text-primary file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-bg-sunken file:px-4 file:text-body-strong file:text-text-primary"
          />
        </div>
        <TextField
          id={`${id}-restore-password`}
          type="password"
          label={t.backup.passwordLabel}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <div role="alert">{error ? <Notice tone="danger">{error}</Notice> : null}</div>
      </Dialog>
    </>
  );
}

export function SettingsScreen() {
  const { t, locale, state, store, shop, storage, fmt, path, fill } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [theme, setTheme] = useTheme(storage);
  const [paper, setPaper] = usePaperSize(storage);
  const [backup, setBackup] = useState<'export' | 'restore' | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const syncLine = state.syncing
    ? t.settings.syncing
    : state.lastSyncedAt !== null
      ? fill(t.settings.lastSynced, { time: fmt.time(state.lastSyncedAt) })
      : '';

  return (
    <Screen title={t.settings.title} backHref={path('home')}>
      <section aria-labelledby={`${id}-shop`} className="flex flex-col gap-3">
        <Overline level={2}>
          <span id={`${id}-shop`}>{t.settings.shop}</span>
        </Overline>
        <RowGroup>
          <li>
            <Row
              variant="plain"
              href={path('shopProfile')}
              leading={<Tile tone="solid">{shop?.name.charAt(0).toLocaleUpperCase() ?? '?'}</Tile>}
              title={shop?.name ?? ''}
              subtitle={t.settings.shopProfileHint}
              chevron
            />
          </li>
          <li className="flex flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
            <Tile>
              <Globe className="size-6" />
            </Tile>
            <span className="flex-1 text-body-strong text-text-primary">{t.settings.language}</span>
            <div className="flex gap-2">
              {LOCALES.map((code: Locale) => (
                <Button
                  key={code}
                  variant={code === locale ? 'primary' : 'secondary'}
                  onClick={() => router.push(switchLocalePath(pathname, code))}
                >
                  <span lang={code}>{LOCALE_NAMES[code]}</span>
                </Button>
              ))}
            </div>
          </li>
        </RowGroup>
      </section>

      <section aria-labelledby={`${id}-appearance`} className="flex flex-col gap-3">
        <Overline level={2}>
          <span id={`${id}-appearance`}>{t.settings.appearance}</span>
        </Overline>
        <Segmented<ThemeChoice>
          label={t.settings.appearance}
          value={theme}
          onChange={setTheme}
          options={[
            {
              value: 'light',
              label: t.settings.themes.light,
              icon: <Sun aria-hidden="true" className="size-5" />,
            },
            {
              value: 'dark',
              label: t.settings.themes.dark,
              icon: <Moon aria-hidden="true" className="size-5" />,
            },
            {
              value: 'system',
              label: t.settings.themes.system,
              icon: <Monitor aria-hidden="true" className="size-5" />,
            },
          ]}
        />
      </section>

      <section aria-labelledby={`${id}-account`} className="flex flex-col gap-3">
        <Overline level={2}>
          <span id={`${id}-account`}>{t.settings.account}</span>
        </Overline>
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Tile>
              <CloudCheck className="size-6" />
            </Tile>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-body-strong text-text-primary wrap-anywhere">
                {fill(t.settings.signedInAs, { identifier: state.identifier ?? '' })}
              </span>
              <span className="text-body text-text-secondary" aria-live="polite">
                {syncLine}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              variant="secondary"
              loading={state.syncing}
              icon={<RefreshCw aria-hidden="true" className="size-5" />}
              onClick={() => void store.sync()}
            >
              {t.settings.syncNow}
            </Button>
            <Button
              variant="danger"
              icon={<LogOut aria-hidden="true" className="size-5" />}
              onClick={() => setSignOutOpen(true)}
            >
              {t.settings.signOut}
            </Button>
          </div>
        </Card>
      </section>

      <section aria-labelledby={`${id}-receipts`} className="flex flex-col gap-3">
        <Overline level={2}>
          <span id={`${id}-receipts`}>{t.settings.receipts}</span>
        </Overline>
        <Card>
          <SelectField
            id={`${id}-paper`}
            label={t.settings.paperWidth}
            hint={t.settings.paperWidthHint}
            value={paper}
            onChange={(e) => setPaper(e.target.value as PageFormat)}
          >
            {PAGE_FORMATS.map((format) => (
              <option key={format} value={format}>
                {t.invoices.formats[format]}
              </option>
            ))}
          </SelectField>
        </Card>
      </section>

      <section aria-labelledby={`${id}-backups`} className="flex flex-col gap-3">
        <Overline level={2}>
          <span id={`${id}-backups`}>{t.settings.backups}</span>
        </Overline>
        <RowGroup>
          <li>
            <Row
              variant="plain"
              onClick={() => setBackup('export')}
              leading={
                <Tile>
                  <Download className="size-6" />
                </Tile>
              }
              title={t.settings.createBackup}
              subtitle={t.settings.createBackupHint}
              chevron
            />
          </li>
          <li>
            <Row
              variant="plain"
              onClick={() => setBackup('restore')}
              leading={
                <Tile>
                  <Upload className="size-6" />
                </Tile>
              }
              title={t.settings.restoreBackup}
              subtitle={t.settings.restoreBackupHint}
              chevron
            />
          </li>
        </RowGroup>
      </section>

      <BackupDialogs mode={backup} onClose={() => setBackup(null)} />
      <Dialog
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title={t.settings.signOutTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSignOutOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" onClick={() => void store.signOut()}>
              {t.settings.signOut}
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">{t.settings.signOutMessage}</p>
      </Dialog>
    </Screen>
  );
}

export function ShopProfileScreen() {
  const { t, state, store, shop, path, fill } = useApp();
  const router = useRouter();
  const online = useOnline();
  const id = useId();
  const [name, setName] = useState(shop?.name ?? '');
  const [phone, setPhone] = useState(shop?.phone ?? '');
  const [address, setAddress] = useState(shop?.address ?? '');
  const [prefix, setPrefix] = useState(shop?.invoicePrefix ?? '');
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    invoicePrefix?: string;
    form?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  if (!shop) return <ScreenMessage title={t.settings.shopProfile} backHref={path('settings')} />;

  const upper = prefix.trim().toUpperCase();
  const example = isShopPrefix(upper)
    ? formatInvoiceNumber({ shopPrefix: upper, deviceCode: state.device?.code ?? 'A', sequence: 1 })
    : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '') return setErrors({ name: t.errors.required });
    if (!isShopPrefix(upper)) return setErrors({ invoicePrefix: t.errors.invalidPrefix });
    setErrors({});
    setSaving(true);
    try {
      await store.commit((data, ctx) =>
        updateShopProfile(data, ctx, { name, phone, address, invoicePrefix: upper }),
      );
      showToast(t.settings.saved);
      router.push(path('settings'));
    } catch (error) {
      const { message, field } = describeError(error, t);
      setErrors(
        field === 'name' || field === 'phone' || field === 'invoicePrefix'
          ? { [field]: message }
          : { form: message },
      );
      setSaving(false);
    }
  }

  return (
    <Screen title={t.settings.shopProfile} backHref={path('settings')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <TextField
            id={`${id}-name`}
            label={t.settings.shopName}
            value={name}
            error={errors.name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <TextField
            id={`${id}-phone`}
            label={t.settings.shopPhone}
            optionalLabel={t.common.optional}
            type="tel"
            inputMode="tel"
            value={phone}
            error={errors.phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
          />
          <TextAreaField
            id={`${id}-address`}
            label={t.settings.shopAddress}
            optionalLabel={t.common.optional}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            rows={2}
          />
          <TextField
            id={`${id}-prefix`}
            label={t.settings.invoicePrefix}
            hint={example ? fill(t.settings.invoicePrefixHint, { example }) : undefined}
            value={prefix}
            error={errors.invoicePrefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </Card>
        <div role="alert">{errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}</div>
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!online}
          icon={<ReceiptText aria-hidden="true" className="size-5" />}
        >
          {t.common.save}
        </Button>
      </form>
    </Screen>
  );
}
