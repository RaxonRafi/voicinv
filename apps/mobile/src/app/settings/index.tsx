import { BackupSettingsSection } from '@/features/backup';
import { PrinterSettingsSection } from '@/features/printing';
import { SecuritySettingsSection } from '@/features/security';
import { SettingsScreen } from '@/features/settings';

export default function SettingsRoute() {
  return (
    <SettingsScreen>
      <PrinterSettingsSection />
      <SecuritySettingsSection />
      <BackupSettingsSection />
    </SettingsScreen>
  );
}
