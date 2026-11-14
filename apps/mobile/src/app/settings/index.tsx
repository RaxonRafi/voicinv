import { AccountSettingsSection } from '@/features/account';
import { BackupSettingsSection } from '@/features/backup';
import { PrinterSettingsSection } from '@/features/printing';
import { SecuritySettingsSection } from '@/features/security';
import { SettingsScreen } from '@/features/settings';

export default function SettingsRoute() {
  return (
    <SettingsScreen>
      <AccountSettingsSection />
      <PrinterSettingsSection />
      <SecuritySettingsSection />
      <BackupSettingsSection />
    </SettingsScreen>
  );
}
