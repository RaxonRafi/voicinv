import * as LocalAuthentication from 'expo-local-authentication';

import { type Database, getValue, setValue } from '@/core/db';

const KV_SECURITY_LOCK_KEY = 'security_lock_enabled';

export async function isBiometricSupported(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return isEnrolled;
  } catch {
    return false;
  }
}

/** Shows the system biometric / device PIN prompt. Both labels must already be translated. */
export async function authenticateWithBiometrics(
  prompt: string,
  fallbackLabel?: string,
): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      ...(fallbackLabel ? { fallbackLabel } : {}),
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function getSecurityLockEnabled(db: Database): Promise<boolean> {
  const value = await getValue(db.orm, KV_SECURITY_LOCK_KEY);
  return value === 'true';
}

export async function setSecurityLockEnabled(db: Database, enabled: boolean): Promise<void> {
  await db.write(async (tx) => {
    await setValue(tx, KV_SECURITY_LOCK_KEY, enabled ? 'true' : 'false');
  });
}
