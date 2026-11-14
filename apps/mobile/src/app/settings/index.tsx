import { BackupSettingsSection } from '@/features/backup';
import { SettingsScreen } from '@/features/settings';

export default function SettingsRoute() {
  return (
    <SettingsScreen>
      <BackupSettingsSection />
    </SettingsScreen>
  );
}
