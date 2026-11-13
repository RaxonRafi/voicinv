import { Stack } from 'expo-router';
import { type ReactNode } from 'react';

export interface ScreenHeaderProps {
  title: string;
  /** Actions shown at the trailing edge of the header, e.g. an IconButton. */
  right?: ReactNode;
  /** Hide the header entirely (onboarding, lock screen). */
  hidden?: boolean;
}

/**
 * Sets the native header of the current screen. Rendered inside a screen component, so the
 * translated title and header actions live with the screen instead of the route file.
 */
export function ScreenHeader({ title, right, hidden = false }: ScreenHeaderProps) {
  return (
    <Stack.Screen
      options={{ title, headerShown: !hidden, headerRight: right ? () => right : undefined }}
    />
  );
}
