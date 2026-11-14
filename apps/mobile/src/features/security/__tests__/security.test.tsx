import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { type AppLifecycleState, getCurrentAppState, onAppStateChange } from '@/core/platform';
import { createTestShopApp, renderWithApp, type TestShopApp } from '@/core/testing/harness';
import { Text } from '@/core/ui';

import { AppLockOverlay } from '../components/app-lock-overlay';
import {
  applyLockSetting,
  authenticate,
  changeLockSetting,
  handleAppStateChange,
  INITIAL_LOCK_STATE,
  unlock,
  useLockStore,
} from '../lock-store';
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

describe('app lock state', () => {
  const prompt = { prompt: 'Unlock', fallbackLabel: 'Use PIN' };

  beforeEach(() => {
    useLockStore.setState(INITIAL_LOCK_STATE);
  });

  it('starts locked until the setting is known, then follows it', () => {
    expect(useLockStore.getState()).toMatchObject({ enabled: null, locked: true });
    applyLockSetting(false);
    expect(useLockStore.getState()).toMatchObject({ enabled: false, locked: false });
    applyLockSetting(true);
    expect(useLockStore.getState()).toMatchObject({ enabled: true, locked: true });
  });

  it('locks when the app goes to the background, not when it becomes inactive', () => {
    changeLockSetting(true);
    handleAppStateChange('inactive');
    handleAppStateChange('active');
    expect(useLockStore.getState().locked).toBe(false);

    handleAppStateChange('background');
    expect(useLockStore.getState().locked).toBe(true);
  });

  it('never locks when the lock is off', () => {
    changeLockSetting(false);
    handleAppStateChange('background');
    expect(useLockStore.getState().locked).toBe(false);
  });

  it('stays unlocked after leaving the app for the device PIN screen', async () => {
    applyLockSetting(true);
    const run = jest.fn(async () => {
      // The PIN screen is another activity: the app goes to the background and back.
      handleAppStateChange('background');
      handleAppStateChange('active');
      return true;
    });

    await expect(unlock(prompt, run)).resolves.toBe(true);
    expect(useLockStore.getState()).toMatchObject({ locked: false, authenticating: false });
  });

  it('stays locked when authentication fails', async () => {
    applyLockSetting(true);
    await expect(unlock(prompt, async () => false)).resolves.toBe(false);
    expect(useLockStore.getState().locked).toBe(true);
  });

  it('shows one prompt at a time', async () => {
    let finish: (value: boolean) => void = () => undefined;
    const run = jest.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));

    const first = authenticate(prompt, run);
    await expect(authenticate(prompt, run)).resolves.toBe(false);
    finish(true);

    await expect(first).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('AppLockOverlay', () => {
  let app: TestShopApp;
  let appStateListener: (state: AppLifecycleState) => void = () => undefined;

  beforeEach(async () => {
    useLockStore.setState(INITIAL_LOCK_STATE);
    jest.mocked(onAppStateChange).mockImplementation((listener) => {
      appStateListener = listener;
      return () => undefined;
    });
    app = await createTestShopApp();
  });

  afterEach(async () => {
    jest.mocked(getCurrentAppState).mockReturnValue('active');
    await app.close();
  });

  const content = (
    <AppLockOverlay>
      <Text testID="records">Karim owes 2,500</Text>
    </AppLockOverlay>
  );

  it('opens straight away when the lock is off', async () => {
    await renderWithApp(content, app.services);
    await waitFor(() => expect(screen.queryByTestId('app-lock-screen')).toBeNull());
    expect(screen.getByTestId('records')).toBeOnTheScreen();
  });

  it('unlocks with the automatic prompt and keeps the app mounted while locked', async () => {
    await setSecurityLockEnabled(app.ctx.db, true);
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValueOnce({
      success: false,
      error: 'user_cancel',
    });

    await renderWithApp(content, app.services);
    await waitFor(() => expect(screen.getByTestId('app-lock-unlock-button')).toBeOnTheScreen());
    // Covered, but still there underneath: nothing the user was doing is lost.
    expect(screen.getByTestId('records', { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.press(screen.getByTestId('app-lock-unlock-button'));
    await waitFor(() => expect(screen.queryByTestId('app-lock-screen')).toBeNull());

    // Leaving the app locks it; nothing is prompted while it is in the background.
    jest.mocked(getCurrentAppState).mockReturnValue('background');
    await act(async () => appStateListener('background'));
    expect(screen.getByTestId('app-lock-screen')).toBeOnTheScreen();

    // Coming back shows the prompt by itself; authenticating opens the app again.
    jest.mocked(getCurrentAppState).mockReturnValue('active');
    await act(async () => appStateListener('active'));
    await waitFor(() => expect(screen.queryByTestId('app-lock-screen')).toBeNull());
  });
});
