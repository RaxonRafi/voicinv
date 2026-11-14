import { type Database, getValue, setValue } from '@/core/db';
import { DEFAULT_DEVICE_CODE, isDeviceCode } from '@/shared';

/** Keys of device-local settings kept in the encrypted database. */
export const SETTINGS = {
  deviceId: 'device.id',
  deviceCode: 'device.code',
  invoiceSequence: 'invoice.sequence',
  language: 'app.language',
  appearance: 'app.appearance',
  lockEnabled: 'security.lock-enabled',
  lastLocalBackupAt: 'backup.last-local-at',
  syncCursor: 'sync.cursor',
  entitlement: 'billing.entitlement',
  printer: 'printing.printer',
} as const;

export interface DeviceIdentity {
  /** This installation's ID, generated on first launch. */
  deviceId: string;
  /** Short code used in invoice numbers. `A` until the device is registered with an account. */
  deviceCode: string;
}

/**
 * Returns this installation's identity, creating it on first launch. An unregistered device
 * uses code `A` (AGENTS.md §8.4); registering with an account may assign another code.
 */
export async function loadOrCreateDevice(
  db: Database,
  newId: () => string,
): Promise<DeviceIdentity> {
  return db.write(async (tx) => {
    let deviceId = await getValue(tx.orm, SETTINGS.deviceId);
    if (!deviceId) {
      deviceId = newId();
      await setValue(tx, SETTINGS.deviceId, deviceId);
    }
    let deviceCode = await getValue(tx.orm, SETTINGS.deviceCode);
    if (!deviceCode || !isDeviceCode(deviceCode)) {
      deviceCode = DEFAULT_DEVICE_CODE;
      await setValue(tx, SETTINGS.deviceCode, deviceCode);
    }
    return { deviceId, deviceCode };
  });
}

/** Stores the code assigned by the server when the device is registered with an account. */
export async function saveDeviceCode(db: Database, deviceCode: string): Promise<void> {
  if (!isDeviceCode(deviceCode)) throw new RangeError(`Invalid device code "${deviceCode}"`);
  await db.write((tx) => setValue(tx, SETTINGS.deviceCode, deviceCode));
}
