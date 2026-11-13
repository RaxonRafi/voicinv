import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';

import {
  authenticateWithBiometrics,
  getSecurityLockEnabled,
  isBiometricSupported,
  setSecurityLockEnabled,
} from '../service';

describe('security feature', () => {
  let app: TestShopApp;

  beforeEach(async () => {
    app = await createTestShopApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('checks biometric hardware support using platform module', async () => {
    const supported = await isBiometricSupported();
    expect(supported).toBe(true);
  });

  it('authenticates with biometrics', async () => {
    const success = await authenticateWithBiometrics('Unlock test');
    expect(success).toBe(true);
  });

  it('reads and writes security lock setting in kv table', async () => {
    expect(await getSecurityLockEnabled(app.ctx.db)).toBe(false);

    await setSecurityLockEnabled(app.ctx.db, true);
    expect(await getSecurityLockEnabled(app.ctx.db)).toBe(true);

    await setSecurityLockEnabled(app.ctx.db, false);
    expect(await getSecurityLockEnabled(app.ctx.db)).toBe(false);
  });
});
