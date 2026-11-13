import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';

import { useTranslation } from '@/core/i18n';
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
  showToast,
} from '@/core/ui';

import { exportAndShareBackup, restoreFromBackupString } from '../usecases';

export function BackupSettingsSection() {
  const { t } = useTranslation();
  const services = useServices();
  const app = useShopContext();

  const [busy, setBusy] = useState(false);
  const [confirmPending, setConfirmPending] = useState<string | null>(null);

  const handleExport = async () => {
    if (!app) return;
    setBusy(true);
    try {
      await exportAndShareBackup(
        services.db.orm,
        app.shop.id,
        services.device.deviceId,
        t('backup.title'),
        services.now(),
      );
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

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const file = result.assets[0];
      if (!file) return;

      const content = await new File(file.uri).text();
      setConfirmPending(content);
    } catch {
      showToast(t('backup.invalidFile'), 'danger');
    }
  };

  const handleConfirmRestore = async () => {
    if (!confirmPending) return;
    setBusy(true);
    try {
      await restoreFromBackupString(services.db, confirmPending);
      showToast(t('backup.restoreSuccess'), 'success');
    } catch {
      showToast(t('backup.invalidFile'), 'danger');
    } finally {
      setBusy(false);
      setConfirmPending(null);
    }
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
              onPress={() => void handleExport()}
              loading={busy}
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
        visible={confirmPending !== null}
        title={t('backup.confirmRestoreTitle')}
        message={t('backup.confirmRestoreMessage')}
        confirmLabel={t('backup.confirmRestore')}
        cancelLabel={t('backup.cancel')}
        onConfirm={() => void handleConfirmRestore()}
        onCancel={() => setConfirmPending(null)}
        destructive
        busy={busy}
        testID="backup-confirm-dialog"
      />
    </Box>
  );
}
