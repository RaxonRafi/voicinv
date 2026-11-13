import { Stack } from 'expo-router';

import { AppRoot, useStackScreenOptions } from '@/core/app';
import { AppLockOverlay } from '@/features/security';

function RootStack() {
  return <Stack screenOptions={useStackScreenOptions()} />;
}

export default function RootLayout() {
  return (
    <AppRoot>
      <AppLockOverlay>
        <RootStack />
      </AppLockOverlay>
    </AppRoot>
  );
}
