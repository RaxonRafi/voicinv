import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';

import { useTranslation } from '@/core/i18n';
import { readFileBytes } from '@/core/platform';
import { useServices, useShopContext } from '@/core/services';
import {
  Box,
  Button,
  Card,
  Dialog,
  Divider,
  Icon,
  ListItem,
  SectionHeader,
  TextField,
  showToast,
} from '@/core/ui';

import { BACKUP_PASSWORD_MIN_LENGTH } from '../crypto';
import { BackupError } from '../types';
import { exportAndShareBackup, restoreFromBackupFile } from '../usecases';

type Step =
  | { kind: 'idle' }
  | { kind: 'export' }
  /** A file was picked and read; it is restored once the password is entered. */
  | { kind: 'restore'; file: Uint8Array };

export function BackupSettingsSection() {
  const { t } = useTranslation();
  const services = useServices();
  const app = useShopContext();

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | undefined>();

  const close = () => {
    setStep({ kind: 'idle' });
    setPassword('');
    setRepeat('');
    setError(undefined);
  };

  const handleExport = async () => {
    if (!app) return;
    if (password.length < BACKUP_PASSWORD_MIN_LENGTH) {
      setError(t('backup.passwordTooShort', { min: BACKUP_PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== repeat) {
      setError(t('backup.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await exportAndShareBackup(
        services.db.orm,
        app.shop.id,
        services.device.deviceId,
        password,
        t('backup.title'),
        services.now(),
      );
      close();
      showToast(t('backup.exportSuccess'), 'success');
    } catch {
      showToast(t('common.somethingWrong'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      const picked = result.canceled ? undefined : result.assets[0];
      if (!picked) return;
      setStep({ kind: 'restore', file: await readFileBytes(picked.uri) });
    } catch {
      showToast(t('backup.invalidFile'), 'danger');
    }
  };

  const handleRestore = async () => {
    if (step.kind !== 'restore') return;
    setBusy(true);
    try {
      await restoreFromBackupFile(services.db, step.file, password);
      close();
      showToast(t('backup.restoreSuccess'), 'success');
    } catch (cause) {
      if (cause instanceof BackupError && cause.code === 'WRONG_PASSWORD') {
        // Let the user try the password again without picking the file again.
        setError(t('backup.wrongPassword'));
      } else {
        close();
        showToast(t('backup.invalidFile'), 'danger');
      }
    } finally {
      setBusy(false);
    }
  };

  const changePassword = (value: string) => {
    setPassword(value);
    setError(undefined);
  };

  return (
    <Box gap="sm">
      <SectionHeader title={t('backup.title')} />
      <Card padding="none" gap="none">
        <ListItem
          title={t('backup.exportTitle')}
          subtitle={t('backup.exportHint')}
          leading={<Icon name="download" tone="secondary" />}
          trailing={
            <Button
              variant="secondary"
              label={t('backup.exportButton')}
              onPress={() => setStep({ kind: 'export' })}
              disabled={busy}
              testID="backup-export-button"
            />
          }
        />
        <Divider />
        <ListItem
          title={t('backup.restoreTitle')}
          subtitle={t('backup.restoreHint')}
          leading={<Icon name="upload" tone="secondary" />}
          trailing={
            <Button
              variant="ghost"
              label={t('backup.restoreButton')}
              onPress={() => void handlePickFile()}
              disabled={busy}
              testID="backup-restore-button"
            />
          }
        />
      </Card>

      <Dialog
        visible={step.kind === 'export'}
        title={t('backup.exportDialogTitle')}
        message={t('backup.exportDialogMessage')}
        confirmLabel={t('backup.exportConfirm')}
        cancelLabel={t('backup.cancel')}
        onConfirm={() => void handleExport()}
        onCancel={close}
        busy={busy}
        testID="backup-export-dialog"
      >
        <TextField
          label={t('backup.passwordLabel')}
          hint={t('backup.passwordHint', { min: BACKUP_PASSWORD_MIN_LENGTH })}
          value={password}
          onChangeText={changePassword}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          testID="backup-export-password"
        />
        <TextField
          label={t('backup.repeatPasswordLabel')}
          value={repeat}
          onChangeText={(value) => {
            setRepeat(value);
            setError(undefined);
          }}
          error={error}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          testID="backup-export-password-repeat"
        />
      </Dialog>

      <Dialog
        visible={step.kind === 'restore'}
        title={t('backup.confirmRestoreTitle')}
        message={t('backup.confirmRestoreMessage')}
        confirmLabel={t('backup.confirmRestore')}
        cancelLabel={t('backup.cancel')}
        onConfirm={() => void handleRestore()}
        onCancel={close}
        destructive
        busy={busy}
        testID="backup-confirm-dialog"
      >
        <TextField
          label={t('backup.passwordLabel')}
          value={password}
          onChangeText={changePassword}
          error={error}
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          testID="backup-restore-password"
        />
      </Dialog>
    </Box>
  );
}
