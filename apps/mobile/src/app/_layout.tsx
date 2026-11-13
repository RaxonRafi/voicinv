import { Stack } from 'expo-router';

import { AppRoot, useStackScreenOptions } from '@/core/app';

function RootStack() {
  return <Stack screenOptions={useStackScreenOptions()} />;
}

export default function RootLayout() {
  return (
    <AppRoot>
      <RootStack />
    </AppRoot>
  );
}
