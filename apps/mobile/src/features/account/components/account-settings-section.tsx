import { router } from 'expo-router';

import { useTranslation } from '@/core/i18n';
import { useSyncStore } from '@/core/sync';
import { Box, Card, Icon, ListItem, SectionHeader } from '@/core/ui';

/** Settings row that opens the optional account and sync screen. */
export function AccountSettingsSection() {
  const { t } = useTranslation();
  const signedIn = useSyncStore((state) => state.signedIn);
  const identifier = useSyncStore((state) => state.identifier);

  return (
    <Box gap="sm">
      <SectionHeader title={t('account.title')} />
      <Card padding="none">
        <ListItem
          title={t('account.title')}
          subtitle={
            signedIn && identifier
              ? t('account.rowSignedIn', { identifier })
              : t('account.rowSignedOut')
          }
          leading={<Icon name={signedIn ? 'cloud' : 'cloudOff'} tone="secondary" />}
          onPress={() => router.push('/settings/account')}
          showChevron
          testID="settings-account"
        />
      </Card>
    </Box>
  );
}
