import { useState } from 'react';

import { ApiError } from '@/core/api';
import { useTranslation } from '@/core/i18n';
import { useServices, useShopContext } from '@/core/services';
import { runSync, useSyncStore } from '@/core/sync';
import {
  Banner,
  Box,
  Button,
  Card,
  Dialog,
  EmptyState,
  Icon,
  ListItem,
  Row,
  Screen,
  ScreenHeader,
  Spinner,
  Text,
  TextField,
} from '@/core/ui';
import { PASSWORD_MIN_LENGTH } from '@/shared';

import { AccountError } from '../types';
import { createAccount, recoverPassword, signIn, signOut } from '../usecases';

type Mode = 'signIn' | 'create' | 'recover';

const ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'IDENTIFIER_TAKEN',
  'CONFLICT',
  'INVALID_RECOVERY_CODE',
  'DIFFERENT_SHOP',
  'NETWORK',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'SIGNED_OUT',
] as const;
type KnownError = (typeof ERROR_CODES)[number] | 'generic';

/** Which message to show for a failed account action. */
export function accountErrorCode(error: unknown): KnownError {
  const code = error instanceof ApiError || error instanceof AccountError ? error.code : null;
  return (ERROR_CODES as readonly string[]).includes(code ?? '') ? (code as KnownError) : 'generic';
}

/** The optional account: sign in, create one, reset the password, and see sync status. */
export function AccountScreen() {
  const { t } = useTranslation();
  const services = useServices();
  const signedIn = useSyncStore((state) => state.signedIn);
  const app = useShopContext();
  /**
   * A recovery code to show once. Kept here, above both views: creating an account signs the
   * user in, which swaps the view, and the code must still be shown.
   */
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  if (!services.api.configured) {
    return (
      <Screen>
        <ScreenHeader title={t('account.title')} />
        <EmptyState icon="cloudOff" title={t('account.notAvailable')} />
      </Screen>
    );
  }
  if (!app || signedIn === null) {
    return (
      <Screen>
        <ScreenHeader title={t('account.title')} />
        <Spinner label={t('common.loading')} />
      </Screen>
    );
  }
  return (
    <>
      {signedIn ? <SignedIn /> : <SignedOut onRecoveryCode={setRecoveryCode} />}
      <Dialog
        visible={recoveryCode !== null}
        title={t('account.recoveryTitle')}
        message={t('account.recoveryMessage')}
        confirmLabel={t('account.recoveryDone')}
        onConfirm={() => setRecoveryCode(null)}
        onCancel={() => setRecoveryCode(null)}
        testID="account-recovery-dialog"
      >
        <Text variant="title" align="center" testID="account-recovery-value">
          {recoveryCode ?? ''}
        </Text>
      </Dialog>
    </>
  );
}

function SignedOut({ onRecoveryCode }: { onRecoveryCode: (code: string) => void }) {
  const { t } = useTranslation();
  const services = useServices();
  const app = useShopContext();
  const [mode, setMode] = useState<Mode>('signIn');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<KnownError | null>(null);

  if (!app) return null;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const deviceName = t('account.deviceName');
    try {
      if (mode === 'signIn') {
        await signIn(services, app.shop, { identifier, password, deviceName });
      } else if (mode === 'create') {
        const result = await createAccount(services, app.shop, {
          identifier,
          password,
          deviceName,
        });
        onRecoveryCode(result.recoveryCode);
      } else {
        const result = await recoverPassword(services, {
          identifier,
          recoveryCode: recoveryInput,
          newPassword: password,
        });
        onRecoveryCode(result.recoveryCode);
        setRecoveryInput('');
        switchMode('signIn');
      }
    } catch (cause) {
      setError(accountErrorCode(cause));
    } finally {
      setBusy(false);
    }
  };

  const modes: { mode: Mode; label: string }[] = [
    { mode: 'signIn', label: t('account.modeSignIn') },
    { mode: 'create', label: t('account.modeCreate') },
    { mode: 'recover', label: t('account.modeRecover') },
  ];
  const submitLabel = {
    signIn: t('account.signInButton'),
    create: t('account.createButton'),
    recover: t('account.recoverButton'),
  }[mode];

  return (
    <Screen
      testID="account-screen"
      footer={
        <Button
          label={submitLabel}
          onPress={() => void submit()}
          loading={busy}
          disabled={identifier.trim() === '' || password === ''}
          fullWidth
          testID="account-submit"
        />
      }
    >
      <ScreenHeader title={t('account.title')} />
      <Text tone="secondary">{t('account.intro')}</Text>
      <Row gap="sm">
        {modes.map((option) => (
          <Button
            key={option.mode}
            label={option.label}
            variant={option.mode === mode ? 'primary' : 'ghost'}
            onPress={() => switchMode(option.mode)}
            testID={`account-mode-${option.mode}`}
          />
        ))}
      </Row>
      {mode === 'create' ? (
        <Text variant="caption" tone="secondary">
          {t('account.createHint', { shop: app.shop.name })}
        </Text>
      ) : null}
      <TextField
        label={t('account.identifier')}
        value={identifier}
        onChangeText={setIdentifier}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="username"
        testID="account-identifier"
      />
      {mode === 'recover' ? (
        <TextField
          label={t('account.recoveryCode')}
          hint={t('account.recoveryCodeHint')}
          value={recoveryInput}
          onChangeText={setRecoveryInput}
          autoCapitalize="characters"
          testID="account-recovery-code"
        />
      ) : null}
      <TextField
        label={mode === 'recover' ? t('account.newPassword') : t('account.password')}
        hint={
          mode === 'signIn' ? undefined : t('account.passwordHint', { min: PASSWORD_MIN_LENGTH })
        }
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
        testID="account-password"
      />
      {error ? <Banner tone="danger" title={t(`account.errors.${error}`)} /> : null}
    </Screen>
  );
}

function SignedIn() {
  const { t } = useTranslation();
  const services = useServices();
  const app = useShopContext();
  const { identifier, status, lastSyncedAt, errorCode, invalid } = useSyncStore();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!app) return null;

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut(services);
    } finally {
      setBusy(false);
      setConfirmSignOut(false);
    }
  };

  return (
    <Screen testID="account-screen">
      <ScreenHeader title={t('account.title')} />
      <Card padding="none" gap="none">
        <ListItem
          title={t('account.signedInAs', { identifier: identifier ?? '' })}
          subtitle={
            status === 'syncing'
              ? t('account.syncing')
              : lastSyncedAt
                ? t('account.lastSynced', { time: app.format.dateTime(lastSyncedAt) })
                : t('account.neverSynced')
          }
          leading={<Icon name="cloud" tone="secondary" />}
          testID="account-status"
        />
      </Card>
      {status === 'error' && errorCode ? (
        <Banner
          tone="warning"
          title={t('account.syncFailed')}
          message={t(`account.errors.${accountErrorCode(new ApiError(errorCode, 0, ''))}`)}
        />
      ) : null}
      {invalid > 0 ? (
        <Banner tone="warning" title={t('account.invalidRecords', { count: invalid })} />
      ) : null}
      <Box gap="sm">
        <Button
          label={t('account.syncNow')}
          icon="refresh"
          onPress={() => void runSync(services)}
          loading={status === 'syncing'}
          fullWidth
          testID="account-sync-now"
        />
        <Button
          label={t('account.signOut')}
          icon="logout"
          variant="ghost"
          onPress={() => setConfirmSignOut(true)}
          fullWidth
          testID="account-sign-out"
        />
      </Box>
      <Dialog
        visible={confirmSignOut}
        title={t('account.signOutTitle')}
        message={t('account.signOutMessage')}
        confirmLabel={t('account.signOut')}
        cancelLabel={t('backup.cancel')}
        onConfirm={() => void handleSignOut()}
        onCancel={() => setConfirmSignOut(false)}
        busy={busy}
        destructive
        testID="account-sign-out-dialog"
      />
    </Screen>
  );
}
